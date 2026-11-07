/**
 * deleteNote.ts - Delete note (translation) mode
 */
import { setStatus } from "./util";
import { msg } from "./i18n";
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
    setStatus(msg("status.definitionRemoved"), "ok");
    return;
  }
  // First click: select the current 『』, clear other selections
  clearDeleteSelection();
  setDeletePending(note);
  note.classList.add("delete-selected");
  setStatus(msg("status.definitionSelected"));
}

function isPending(note: HTMLElement): boolean {
  return note.classList.contains("delete-selected");
}

export function toggleDeleteMode() {
  setDeleteMode(!isDeleteMode());
  setStatus(msg(isDeleteMode() ? "reader.modeDelete" : "status.readingMode"));
}
