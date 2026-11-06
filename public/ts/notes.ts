/** Native modal notes leave the current article/editor mounted and unchanged. */
type Cursor = { start: number; end: number; direction: "forward" | "backward" | "none"; top: number; left: number };
type NoteFrame = { note: HTMLDialogElement; target: HTMLElement | null; cursor: Cursor | null };
// A confirmation can sit above the collection without dismissing the whiteboard.
const stack: NoteFrame[] = [];
function rememberCursor(element: HTMLElement | null): Cursor | null {
  if (!(element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) || element.selectionStart === null || element.selectionEnd === null) return null;
  return { start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection ?? "none", top: element.scrollTop, left: element.scrollLeft };
}
export const hasOpenNote = () => stack.length > 0;

function finish(note: HTMLDialogElement, restoreFocus = true) {
  const index = stack.findIndex(frame => frame.note === note);
  if (index < 0) return;
  const wasTop = index === stack.length - 1;
  const { target, cursor } = stack.splice(index, 1)[0]!;
  document.getElementById(note.dataset.noteEntry ?? "")?.setAttribute("aria-expanded", "false");
  note.dispatchEvent(new Event("panel-close"));
  if (!restoreFocus || !wasTop) return;
  const enabled = target && !(target instanceof HTMLButtonElement && target.disabled);
  const fallback = stack.at(-1)?.note.querySelector<HTMLElement>("[data-panel-focus]")
    ?? document.getElementById(note.dataset.noteEntry ?? "") ?? document.getElementById("readBtn");
  const destination = enabled && target.isConnected && target.getClientRects().length ? target : fallback;
  destination?.focus({ preventScroll: true });
  // Native close() may collapse the editor's selection while restoring focus.
  if (destination === target && cursor && (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) {
    target.setSelectionRange(cursor.start, cursor.end, cursor.direction);
    target.scrollTop = cursor.top; target.scrollLeft = cursor.left;
  }
}

export function closeNote(id: string, restoreFocus = true) {
  const index = stack.findIndex(frame => frame.note.id === id);
  if (index < 0) return;
  while (stack.length > index) {
    const note = stack.at(-1)!.note;
    note.close();
    finish(note, restoreFocus && note.id === id);
  }
}

export function openNote(note: HTMLDialogElement) {
  if (note.open) return;
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const cursor = rememberCursor(target);
  note.showModal();
  stack.push({ note, target, cursor });
  document.getElementById(note.dataset.noteEntry ?? "")?.setAttribute("aria-expanded", "true");
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
      const fields = Array.from(note.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], summary, [tabindex]"))
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
