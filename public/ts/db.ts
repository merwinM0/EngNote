import { api, jsonBody, setStatus, sanitizeTitle, el, errorMessage } from "./util";
import { getCurrentText, render, isBusy, setBusy } from "./state";
import { isLoggedIn } from "./auth";
import { openPanel, closePanel, confirmInPanel } from "./panels";
import { callDeepSeek, getStoredApiKey } from "./deepseek";
import { summarizeArticleTitle } from "./articleTitle";

type Entry = { id: number; title: string; created_at: string; can_edit: boolean; content?: string };
const savePanel = document.getElementById("savePanel") as HTMLDialogElement;
const collectionPanel = document.getElementById("collectionPanel") as HTMLDialogElement;
const confirmSaveBtn = document.getElementById("confirmSaveBtn") as HTMLButtonElement;
let saveTask: { request: AbortController; phase: "summarizing" | "saving" } | null = null;
let manualTitleRequired = false;
const saveTitle = document.getElementById("saveTitle") as HTMLInputElement;
const entryList = document.getElementById("entryList")!;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
let selected: Entry | null = null;
let pendingDelete: Entry | null = null;
let savedText = "";
let listRequest = 0;
let openRequest = 0;
const canEdit = (entry: Entry) => isLoggedIn() && entry.can_edit;
const isDirty = () => getCurrentText() !== savedText;
export async function confirmReplace(action = "Replace article", message = "This article has unsaved changes across its pages. Replace it without saving these changes to your collection?"): Promise<boolean> {
  return !isDirty() || await confirmInPanel(message, action);
}
function updateSelection() {
  for (const li of entryList.querySelectorAll<HTMLElement>("li[data-id]")) {
    const active = Number(li.dataset.id) === selected?.id;
    li.classList.toggle("active", active);
    const button = li.querySelector(".entry-open");
    if (active) button?.setAttribute("aria-current", "true"); else button?.removeAttribute("aria-current");
  }
  document.getElementById("readerTitle")!.textContent = selected?.title ?? "A fresh article";
  saveBtn.textContent = selected && canEdit(selected) ? "Save changes" : "Save article";
}
export function deselectEntry() { openRequest++; selected = null; savedText = ""; updateSelection(); }
function showError(id: string, message: string) { const element = document.getElementById(id)!; element.textContent = message; element.hidden = !message; }

async function openEntry(entry: Entry) {
  if (isBusy()) return;
  const request = ++openRequest;
  if (!(await confirmReplace()) || request !== openRequest || isBusy() || !collectionPanel.open) return;
  const startingText = getCurrentText();
  showError("collectionMsg", `Opening “${entry.title}”…`);
  try {
    const data = await api<{ entry: Entry & { content: string } }>(`/api/entries/${entry.id}`);
    if (request !== openRequest || isBusy() || getCurrentText() !== startingText) return;
    render(data.entry.content);
    closePanel("collectionPanel");
    openPanel("readPanel", false);
    selected = data.entry;
    savedText = getCurrentText();
    updateSelection();
    setStatus(`Opened “${entry.title}”.${canEdit(entry) ? " Save changes to update this page." : " Save article to keep your own copy."}`, "ok");
  } catch (error) { if (request === openRequest) showError("collectionMsg", errorMessage(error)); }
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
      const open = el("button", "entry-open tape-button tape-clear"); open.type = "button";
      open.append(el("span", "entry-title", entry.title));
      const date = new Date(entry.created_at.replace(" ", "T") + "Z");
      open.append(el("span", "entry-date", Number.isNaN(date.getTime()) ? "Saved page" : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })));
      open.addEventListener("click", () => { void openEntry(entry); });
      li.append(open);
      if (canEdit(entry)) {
        const remove = el("button", "entry-del btn btn-danger tape-icon", "×"); remove.type = "button"; remove.setAttribute("aria-label", `Delete ${entry.title}`);
        remove.addEventListener("click", () => {
          if (isBusy()) return;
          openRequest++; // Do not let an earlier article read complete behind this confirmation.
          pendingDelete = entry;
          showError("deleteMsg", "");
          document.getElementById("deleteDescription")!.textContent = `Delete “${entry.title}” and all its saved pages? The text in your notebook will be kept.`;
          openPanel("deletePanel");
        });
        li.append(remove);
      }
      fragment.append(li);
    }
    const focused = document.activeElement;
    const focusedEntry = focused instanceof Element ? focused.closest<HTMLElement>("#entryList li[data-id]") : null;
    entryList.replaceChildren(fragment);
    if (focusedEntry) {
      const replacement = entryList.querySelector<HTMLElement>(`li[data-id="${focusedEntry.dataset.id}"] ${focused?.classList.contains("entry-del") ? ".entry-del" : ".entry-open"}`);
      (replacement ?? document.getElementById("refreshListBtn"))?.focus({ preventScroll: true });
    }
    if (selected) {
      const fresh = data.entries.find(entry => entry.id === selected?.id);
      if (fresh) selected = { ...selected, can_edit: fresh.can_edit };
    }
    updateSelection();
  } catch (error) {
    if (request === listRequest) { entryList.replaceChildren(el("li", "entry-empty", "Could not load pages. Use ↻ to try again.")); setStatus(errorMessage(error), "error"); }
  } finally { if (request === listRequest) entryList.setAttribute("aria-busy", "false"); }
}
function updateSaveProgress() {
  const summarizing = saveTask?.phase === "summarizing";
  document.getElementById("titleProgress")!.hidden = !summarizing;
  confirmSaveBtn.setAttribute("aria-busy", String(!!saveTask));
  saveTitle.disabled = confirmSaveBtn.disabled = !!saveTask;
  confirmSaveBtn.textContent = summarizing ? "Finding a title…" : saveTask ? "Saving…" : saveTitle.readOnly ? "Save changes" : "Save article";
}
function titleError(message: string) {
  showError("saveMsg", message);
  saveTitle.setAttribute("aria-invalid", "true");
  saveTitle.focus({ preventScroll: true });
}
async function save(title?: string) {
  if (isBusy() || !savePanel.open) return;
  if (!isLoggedIn()) return showError("saveMsg", "Please log in again before saving. Your article has been kept.");
  const text = getCurrentText();
  const entry = selected;
  const overwrite = entry && canEdit(entry) && saveTitle.readOnly;
  if (!overwrite && !title && !getStoredApiKey()) {
    manualTitleRequired = true;
    return titleError("AI could not create a title: no key is set in AI setup. Please enter an English title yourself.");
  }
  const task = { request: new AbortController(), phase: !overwrite && !title ? "summarizing" as const : "saving" as const };
  saveTask = task;
  showError("saveMsg", "");
  saveTitle.removeAttribute("aria-invalid");
  setBusy(true);
  updateSaveProgress();
  try {
    if (task.phase === "summarizing") {
      title = await summarizeArticleTitle(text, callDeepSeek, task.request.signal);
      if (saveTask !== task || task.request.signal.aborted || getCurrentText() !== text) return;
      saveTitle.value = title;
      task.phase = "saving";
      updateSaveProgress();
    }
    const data = await api<{ id: number }>(overwrite ? `/api/entries/${entry.id}` : "/api/entries", {
      method: overwrite ? "PUT" : "POST", ...jsonBody(overwrite ? { content: text } : { title, content: text }),
    });
    selected = overwrite ? entry : { id: data.id, title: title!, can_edit: true, created_at: "" };
    savedText = text;
    saveTask = null;
    setBusy(false);
    updateSaveProgress();
    closePanel("savePanel");
    updateSelection();
    setStatus("All pages saved together, including your definitions.", "ok");
    void refreshList();
  } catch (error) {
    if (saveTask !== task || task.request.signal.aborted) return;
    if (task.phase === "summarizing") {
      manualTitleRequired = true;
      showError("saveMsg", `AI could not create a title. Please enter an English title yourself (1–20 characters). ${errorMessage(error)}`);
      saveTitle.setAttribute("aria-invalid", "true");
    } else if (savePanel.open) showError("saveMsg", errorMessage(error));
    else setStatus(errorMessage(error), "error");
  } finally {
    // Closing during AI work releases the lock immediately; late responses cannot save.
    if (saveTask === task) {
      saveTask = null;
      setBusy(false);
      updateSaveProgress();
      if (manualTitleRequired && savePanel.open) saveTitle.focus({ preventScroll: true });
    }
  }
}
export function initDb() {
  saveBtn.addEventListener("click", () => {
    if (isBusy()) return;
    if (!isLoggedIn()) return setStatus("Please log in to save a page.", "error");
    if (!getCurrentText()) return setStatus("Paste an article first.", "error");
    const overwrite = !!selected && canEdit(selected);
    saveTitle.value = overwrite ? selected!.title : "";
    saveTitle.readOnly = overwrite;
    saveTitle.removeAttribute("aria-invalid");
    manualTitleRequired = false;
    document.getElementById("saveHeading")!.textContent = overwrite ? "Keep your latest changes." : "Save the whole article.";
    document.getElementById("saveDescription")!.textContent = overwrite
      ? "Keep the original title and update every page and definition together."
      : "Leave the title blank and AI will sum up your article in a short English title.";
    showError("saveMsg", "");
    updateSaveProgress();
    openPanel("savePanel");
  });
  document.getElementById("saveForm")!.addEventListener("submit", event => {
    event.preventDefault();
    if (isBusy()) return;
    const { clean, hadBad } = sanitizeTitle(saveTitle.value);
    if (hadBad || Array.from(clean).length > 20 || (!clean && manualTitleRequired)) return titleError("Please enter an English title of 1–20 characters.");
    void save(clean || undefined);
  });
  saveTitle.addEventListener("input", () => { saveTitle.removeAttribute("aria-invalid"); showError("saveMsg", ""); });
  savePanel.addEventListener("panel-close", () => {
    if (saveTask?.phase !== "summarizing") return; // A sent database write may already have committed.
    const task = saveTask;
    saveTask = null;
    task.request.abort();
    setBusy(false);
    updateSaveProgress();
  });
  collectionPanel.addEventListener("panel-open", () => showError("collectionMsg", ""));
  collectionPanel.addEventListener("panel-close", () => { openRequest++; });
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
      closePanel("deletePanel");
      setStatus("Saved page deleted. Text in your notebook has been kept.", "ok");
      void refreshList();
    } catch (error) {
      if ((document.getElementById("deletePanel") as HTMLDialogElement).open) showError("deleteMsg", errorMessage(error));
      else if (collectionPanel.open) showError("collectionMsg", errorMessage(error));
      else setStatus(errorMessage(error), "error");
    }
    finally { setBusy(false); button.disabled = false; }
  });
  window.addEventListener("session-changed", () => {
    // Never carry the previous account's edit flag into a different session.
    if (selected) selected.can_edit = false;
    updateSelection();
    void refreshList();
  });
  // Never trigger a native confirmation popup; drafts cover refresh and tab navigation.
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href='/']")) link.addEventListener("click", async event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (await confirmReplace("Go to home", "This article has unsaved changes. Leave the notebook? A working copy remains in this tab, but it is not saved to your collection.")) window.location.assign(link.href);
  });
}
