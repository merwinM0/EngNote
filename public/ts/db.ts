import { api, jsonBody, setStatus, sanitizeTitle, el, errorMessage } from "./util";
import { getCurrentText, render, isBusy, setBusy } from "./state";
import { isLoggedIn } from "./auth";

type Entry = { id: number; title: string; created_at: string; can_edit: boolean; content?: string };
const saveModal = document.getElementById("saveModal") as HTMLDialogElement;
const saveTitle = document.getElementById("saveTitle") as HTMLInputElement;
const deleteModal = document.getElementById("deleteConfirmModal") as HTMLDialogElement;
const entryList = document.getElementById("entryList")!;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
let selected: Entry | null = null;
let pendingDelete: Entry | null = null;
let savedText = "";
let listRequest = 0;
let openRequest = 0;
const canEdit = (entry: Entry) => isLoggedIn() && entry.can_edit;
const isDirty = () => getCurrentText() !== savedText;
export function confirmReplace(): boolean {
  return !isDirty() || window.confirm("This page has unsaved changes. Replace it with another article?");
}
function updateSelection() {
  for (const li of entryList.querySelectorAll<HTMLElement>("li[data-id]")) {
    const active = Number(li.dataset.id) === selected?.id;
    li.classList.toggle("active", active);
    const button = li.querySelector(".entry-open");
    if (active) button?.setAttribute("aria-current", "true"); else button?.removeAttribute("aria-current");
  }
  document.getElementById("readerTitle")!.textContent = selected?.title ?? "A fresh page";
  saveBtn.textContent = selected && canEdit(selected) ? "Save changes" : "Save page";
}
export function deselectEntry() { openRequest++; selected = null; savedText = ""; updateSelection(); }
function showError(id: string, message: string) { const element = document.getElementById(id)!; element.textContent = message; element.hidden = !message; }

async function openEntry(entry: Entry) {
  if (isBusy() || !confirmReplace()) return;
  const request = ++openRequest;
  const startingText = getCurrentText();
  setStatus(`Opening “${entry.title}”…`);
  try {
    const data = await api<{ entry: Entry & { content: string } }>(`/api/entries/${entry.id}`);
    if (request !== openRequest || isBusy() || getCurrentText() !== startingText) return;
    render(data.entry.content);
    selected = data.entry;
    savedText = getCurrentText();
    updateSelection();
    setStatus(`Opened “${entry.title}”.${canEdit(entry) ? " Save changes to update this page." : " Save page to keep your own copy."}`, "ok");
  } catch (error) { if (request === openRequest) setStatus(errorMessage(error), "error"); }
}
export async function refreshList() {
  const request = ++listRequest;
  entryList.setAttribute("aria-busy", "true");
  try {
    const data = await api<{ entries: Entry[] }>("/api/entries");
    if (request !== listRequest) return;
    const fragment = document.createDocumentFragment();
    if (!data.entries.length) fragment.append(el("li", "entry-empty", "No pages yet. Save a story to begin the collection."));
    for (const entry of data.entries) {
      const li = el("li"); li.dataset.id = String(entry.id);
      const open = el("button", "entry-open"); open.type = "button";
      open.append(el("span", "entry-title", entry.title));
      const date = new Date(entry.created_at.replace(" ", "T") + "Z");
      open.append(el("span", "entry-date", Number.isNaN(date.getTime()) ? "Saved page" : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })));
      open.addEventListener("click", () => { void openEntry(entry); });
      li.append(open);
      if (canEdit(entry)) {
        const remove = el("button", "entry-del", "×"); remove.type = "button"; remove.setAttribute("aria-label", `Delete ${entry.title}`);
        remove.addEventListener("click", () => {
          if (isBusy()) return;
          pendingDelete = entry;
          showError("deleteMsg", "");
          deleteModal.showModal();
        });
        li.append(remove);
      }
      fragment.append(li);
    }
    entryList.replaceChildren(fragment);
    if (selected) {
      const fresh = data.entries.find(entry => entry.id === selected?.id);
      if (fresh) selected = { ...selected, can_edit: fresh.can_edit };
    }
    updateSelection();
  } catch (error) {
    if (request === listRequest) { entryList.replaceChildren(el("li", "entry-empty", "Could not load pages. Use ↻ to try again.")); setStatus(errorMessage(error), "error"); }
  } finally { if (request === listRequest) entryList.setAttribute("aria-busy", "false"); }
}
async function save(title?: string) {
  if (isBusy()) return;
  const text = getCurrentText();
  const entry = selected;
  const overwrite = entry && canEdit(entry) && !title;
  setBusy(true);
  const confirmButton = document.getElementById("confirmSaveBtn") as HTMLButtonElement;
  confirmButton.disabled = true;
  try {
    const data = await api<{ id: number }>(overwrite ? `/api/entries/${entry.id}` : "/api/entries", {
      method: overwrite ? "PUT" : "POST", ...jsonBody(overwrite ? { content: text } : { title, content: text }),
    });
    selected = overwrite ? entry : { id: data.id, title: title!, can_edit: true, created_at: "" };
    savedText = text;
    saveModal.close();
    updateSelection();
    setStatus("Page saved, including your definitions.", "ok");
    void refreshList();
  } catch (error) {
    if (saveModal.open) showError("saveMsg", errorMessage(error)); else setStatus(errorMessage(error), "error");
  } finally { setBusy(false); confirmButton.disabled = false; }
}
export function initDb() {
  saveBtn.addEventListener("click", () => {
    if (isBusy()) return;
    if (!isLoggedIn()) return setStatus("Please log in to save a page.", "error");
    if (!getCurrentText()) return setStatus("Paste an article first.", "error");
    if (selected && canEdit(selected)) { void save(); return; }
    saveTitle.value = "";
    showError("saveMsg", "");
    saveModal.showModal();
  });
  document.getElementById("saveForm")!.addEventListener("submit", event => {
    event.preventDefault();
    const { clean, hadBad } = sanitizeTitle(saveTitle.value);
    if (!clean || hadBad || Array.from(clean).length > 20) return showError("saveMsg", "Use an English title of 1–20 characters.");
    void save(clean);
  });
  document.getElementById("refreshListBtn")!.addEventListener("click", () => { void refreshList(); });
  document.getElementById("confirmDeleteBtn")!.addEventListener("click", async () => {
    if (isBusy() || !pendingDelete) return;
    const entry = pendingDelete;
    const button = document.getElementById("confirmDeleteBtn") as HTMLButtonElement;
    button.disabled = true;
    setBusy(true);
    try {
      await api(`/api/entries/${entry.id}`, { method: "DELETE" });
      if (selected?.id === entry.id) deselectEntry();
      deleteModal.close();
      setStatus("Saved page deleted. Text in your notebook has been kept.", "ok");
      void refreshList();
    } catch (error) { showError("deleteMsg", errorMessage(error)); }
    finally { setBusy(false); button.disabled = false; }
  });
  window.addEventListener("session-changed", () => {
    // Never carry the previous account's edit flag into a different session.
    if (selected) selected.can_edit = false;
    updateSelection();
    void refreshList();
  });
  window.addEventListener("beforeunload", event => { if (isDirty()) { event.preventDefault(); event.returnValue = ""; } });
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href='/']")) link.addEventListener("click", event => { if (!confirmReplace()) event.preventDefault(); });
}
