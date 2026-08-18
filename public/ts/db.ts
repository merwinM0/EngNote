/**
 * db.ts - Save to database / right sidebar
 */
import { setStatus, sanitizeTitle } from "./util";
import { content, getCurrentText, render } from "./state";
import { isLoggedIn as checkLoggedIn, getToken } from "./auth";

// JSON header + Bearer token when logged in
function authJsonHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const t = getToken();
  if (t) h.authorization = `Bearer ${t}`;
  return h;
}

// Modal & sidebar elements
const saveModal = document.getElementById("saveModal") as HTMLDivElement;
const saveTitleInput = document.getElementById("saveTitle") as HTMLInputElement;
const confirmSaveBtn = document.getElementById("confirmSaveBtn") as HTMLButtonElement;
const cancelSaveBtn = document.getElementById("cancelSaveBtn") as HTMLButtonElement;
const deleteConfirmModal = document.getElementById("deleteConfirmModal") as HTMLDivElement;
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn") as HTMLButtonElement;
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn") as HTMLButtonElement;
const MAX_TITLE_LEN = 20;
const entryList = document.getElementById("entryList") as HTMLUListElement;
const refreshListBtn = document.getElementById("refreshListBtn") as HTMLButtonElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;

// Currently selected saved article id (for highlight & direct overwrite save)
let selectedId: number | null = null;
let selectedTitle = "";
let pendingDeleteId: number | null = null; // article id pending delete confirmation

/**
 * Deselect the current article. Should be called when pasting new content,
 * so the content is treated as a "new article" rather than overwriting a selection.
 */
export function deselectEntry() {
  selectedId = null;
  selectedTitle = "";
  entryList.querySelectorAll("li.active").forEach((li) => li.classList.remove("active"));
}

function hasTranslation(): boolean {
  return content.querySelectorAll(".note[data-deletable='1']").length > 0;
}

function openSaveModal() {
  const text = getCurrentText();
  if (!text) {
    setStatus("Nothing to save — paste some text first", "error");
    return;
  }
  saveTitleInput.value = "";
  saveModal.hidden = false;
  saveTitleInput.focus();
}

function closeSaveModal() {
  saveModal.hidden = true;
  saveTitleInput.value = "";
}

async function confirmSave() {
  const title = saveTitleInput.value;
  const { clean, hadBad } = sanitizeTitle(title);
  if (hadBad) setStatus("Title cannot contain Chinese; Chinese characters removed", "error");
  if (!clean) {
    setStatus("Please enter a non-Chinese title", "error");
    return;
  }
  // Enforce a max title length of 20 characters
  const finalTitle = Array.from(clean).slice(0, MAX_TITLE_LEN).join("");
  // If already translated, save the current content with 『』 translations
  const contentToSave = getCurrentText();
  closeSaveModal();
  try {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: authJsonHeaders(),
      body: JSON.stringify({ title: finalTitle, content: contentToSave }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(`Save failed: ${data.error ?? ""}`, "error");
      return;
    }
    // After creating, select it so subsequent saves overwrite directly
    selectedId = data.id ?? null;
    selectedTitle = finalTitle;
    setStatus("✅ Saved to database" + (hasTranslation() ? " (with translations)" : ""), "ok");
    setTimeout(() => setStatus(""), 2500);
    refreshList();
  } catch {
    setStatus("❌ Save failed — check connection", "error");
  }
}

// ---------------- Right sidebar ----------------
export async function refreshList() {
  try {
    const res = await fetch("/api/entries");
    const data = await res.json();
    entryList.innerHTML = "";
    const entries = data.entries ?? [];
    if (entries.length === 0) {
      entryList.innerHTML = "<li class='entry-empty'>No saved articles</li>";
      return;
    }
    for (const e of entries) {
      const li = document.createElement("li");
      if (selectedId === e.id) li.classList.add("active"); // selected highlight
      const t = document.createElement("span");
      t.className = "entry-title";
      t.textContent = e.title;
      const del = document.createElement("button");
      del.className = "entry-del";
      del.textContent = "✕";
      del.title = "Delete this article";
      li.appendChild(t);
      li.appendChild(del);

      li.addEventListener("click", async (ev) => {
        if ((ev.target as HTMLElement).classList.contains("entry-del")) return;
        const one = await fetch(`/api/entries/${e.id}`);
        const od = await one.json();
        if (od.ok) {
          // select and highlight
          selectedId = e.id;
          selectedTitle = e.title;
          markActive(li);
          render(od.entry.content);
          setStatus(`Loaded: ${e.title} (click Save again to overwrite)`, "ok");
          setTimeout(() => setStatus(""), 3500);
        }
      });

      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // Open the theme-styled delete confirm modal (replaces browser default confirm)
        pendingDeleteId = e.id;
        deleteConfirmModal.hidden = false;
      });

      entryList.appendChild(li);
    }
  } catch {
    entryList.innerHTML = "<li class='entry-empty'>Failed to load</li>";
  }
}

// Keep only one list item as the selected (highlighted) state
function markActive(activeLi: HTMLElement) {
  entryList.querySelectorAll("li.active").forEach((li) => li.classList.remove("active"));
  activeLi.classList.add("active");
}

// ---------------- Save button: overwrite if selected, else open modal to create ----------------
async function handleSaveClick() {
  // 未登录用户可使用翻译等功能，但禁止保存
  if (!checkLoggedIn()) {
    setStatus("Please log in to save articles", "error");
    return;
  }
  const text = getCurrentText();
  if (!text) {
    setStatus("Nothing to save — paste some text first", "error");
    return;
  }
  // A selected article exists -> overwrite it directly (no modal, keep original title)
  if (selectedId !== null) {
    await updateEntryContent(selectedId, text);
    return;
  }
  // No selection -> open the title modal to create a new article
  openSaveModal();
}

// Directly overwrite the selected article's content (keeping the original title)
async function updateEntryContent(id: number, contentToSave: string) {
  try {
    const res = await fetch(`/api/entries/${id}`, {
      method: "PUT",
      headers: authJsonHeaders(),
      body: JSON.stringify({ content: contentToSave }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(`Overwrite failed: ${data.error ?? ""}`, "error");
      return;
    }
    setStatus("✅ Overwritten \"" + selectedTitle + "\"" + (hasTranslation() ? " (with translations)" : ""));
    setTimeout(() => setStatus(""), 2500);
    refreshList();
  } catch {
    setStatus("❌ Overwrite failed — check connection", "error");
  }
}

// ---------------- Event bindings ----------------
export function initDb() {
  saveBtn.addEventListener("click", handleSaveClick);
  confirmSaveBtn.addEventListener("click", confirmSave);
  cancelSaveBtn.addEventListener("click", () => {
    closeSaveModal();
    setStatus("");
  });
  saveModal.addEventListener("click", (ev) => {
    if (ev.target === saveModal) closeSaveModal();
  });
  saveTitleInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") confirmSave();
  });
  refreshListBtn.addEventListener("click", refreshList);

  // Delete confirm modal
  confirmDeleteBtn.addEventListener("click", async () => {
    const id = pendingDeleteId;
    deleteConfirmModal.hidden = true;
    pendingDeleteId = null;
    if (id === null) return;
    await fetch(`/api/entries/${id}`, { method: "DELETE", headers: authJsonHeaders() });
    if (selectedId === id) {
      selectedId = null;
      selectedTitle = "";
    }
    refreshList();
  });
  cancelDeleteBtn.addEventListener("click", () => {
    deleteConfirmModal.hidden = true;
    pendingDeleteId = null;
  });
  deleteConfirmModal.addEventListener("click", (ev) => {
    if (ev.target === deleteConfirmModal) {
      deleteConfirmModal.hidden = true;
      pendingDeleteId = null;
    }
  });
}
