/** Native modal notes leave the current article/editor mounted and unchanged. */
let current: HTMLDialogElement | null = null;
let returnFocus: HTMLElement | null = null;
type Cursor = { start: number; end: number; direction: "forward" | "backward" | "none"; top: number; left: number };
let returnCursor: Cursor | null = null;
function rememberCursor(element: HTMLElement | null): Cursor | null {
  if (!(element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) || element.selectionStart === null || element.selectionEnd === null) return null;
  return { start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection ?? "none", top: element.scrollTop, left: element.scrollLeft };
}
export const hasOpenNote = () => current?.open === true;

function finish(note: HTMLDialogElement, restoreFocus = true) {
  if (current !== note) return;
  const target = returnFocus, cursor = returnCursor;
  current = null;
  returnFocus = null;
  returnCursor = null;
  document.getElementById(note.dataset.noteEntry!)?.setAttribute("aria-expanded", "false");
  note.dispatchEvent(new Event("panel-close"));
  if (!restoreFocus) return;
  const enabled = target && !(target instanceof HTMLButtonElement && target.disabled);
  const fallback = document.getElementById(note.dataset.noteEntry!) ?? document.getElementById("readBtn");
  const destination = enabled && target.getClientRects().length ? target : fallback;
  destination?.focus({ preventScroll: true });
  // Native close() may collapse the editor's selection while restoring focus.
  if (destination === target && cursor && (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) {
    target.setSelectionRange(cursor.start, cursor.end, cursor.direction);
    target.scrollTop = cursor.top; target.scrollLeft = cursor.left;
  }
}

export function closeNote(id: string, restoreFocus = true) {
  if (!current || current.id !== id) return;
  const note = current;
  note.close();
  finish(note, restoreFocus);
}

export function openNote(note: HTMLDialogElement) {
  if (current === note && note.open) return;
  const opener = current ? returnFocus : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const cursor = current ? returnCursor : rememberCursor(opener);
  if (current) closeNote(current.id, false);
  current = note;
  returnFocus = opener;
  returnCursor = cursor;
  note.showModal();
  document.getElementById(note.dataset.noteEntry!)?.setAttribute("aria-expanded", "true");
  note.dispatchEvent(new Event("panel-open"));
  const field = Array.from(note.querySelectorAll<HTMLElement>("[data-panel-focus]")).find(element => !element.closest("[hidden]"));
  field?.focus({ preventScroll: true });
  note.scrollTop = 0;
}

export function initNotes() {
  for (const note of document.querySelectorAll<HTMLDialogElement>("dialog.note-window")) {
    let backdropPressed = false;
    const outsidePaper = (event: MouseEvent) => {
      const bounds = note.firstElementChild!.getBoundingClientRect();
      return event.target === note && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    };
    // Keep Tab inside the paper instead of letting boundary navigation reach browser chrome.
    note.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const fields = Array.from(note.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]"))
        .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      const first = fields[0], last = fields.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    });
    note.addEventListener("cancel", event => { event.preventDefault(); closeNote(note.id); });
    note.addEventListener("close", () => { if (!note.open) finish(note); });
    note.addEventListener("pointerdown", event => { backdropPressed = outsidePaper(event); });
    note.addEventListener("click", event => {
      if (backdropPressed && outsidePaper(event)) closeNote(note.id);
      backdropPressed = false;
    });
    note.addEventListener("click", event => {
      if (event.target instanceof Element && event.target.closest("[data-close-note]")) closeNote(note.id);
    });
  }
}
