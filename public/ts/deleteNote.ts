/**
 * deleteNote.ts - Delete note (translation) mode
 */
import { setStatus } from "./util";
import { msg } from "./i18n";
import {
  isDeleteMode,
  isDeletePending,
  isBusy,
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
  if (!isDeleteMode() || isBusy() || !content.contains(note)) return;
  // Second click on the same 『』 → delete
  if (isDeletePending(note)) {
    clearDeleteSelection();
    removeDefinition(note);
    content.focus();
    setStatus(msg("status.definitionRemoved"), "ok");
    return;
  }
  // First click: select the current 『』, clear other selections
  setDeletePending(note);
  setStatus("");
}

export function toggleDeleteMode() {
  setDeleteMode(!isDeleteMode());
  setStatus("");
}
