/**
 * deleteNote.ts - Delete note (translation) mode
 */
import { setStatus } from "./util";
import {
  isDeleteMode,
  setDeleteMode,
  clearDeleteSelection,
  setDeletePending,
  removeDefinition,
  content,
} from "./state";

/**
 * Click a 『』 note: first click selects it (red highlight), click again to delete.
 */
export function handleDeleteNote(note: HTMLElement) {
  // Second click on the same 『』 → delete
  if (isPending(note)) {
    clearDeleteSelection();
    removeDefinition(note);
    content.focus();
    setStatus("Definition removed.", "ok");
    return;
  }
  // First click: select the current 『』, clear other selections
  clearDeleteSelection();
  setDeletePending(note);
  note.classList.add("delete-selected");
  setStatus("Selected this 『』 note — click it once more to remove it");
}

function isPending(note: HTMLElement): boolean {
  return note.classList.contains("delete-selected");
}

export function toggleDeleteMode() {
  setDeleteMode(!isDeleteMode());
  setStatus("");
}
