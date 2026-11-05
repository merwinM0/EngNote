import { el } from "./util";
import { parseParagraphs, splitParagraph, WORD_PATTERN } from "./text";

export const content = document.getElementById("content") as HTMLDivElement;
export const pasteBtn = document.getElementById("pasteBtn") as HTMLButtonElement;
export const formatBtn = document.getElementById("formatBtn") as HTMLButtonElement;
export const translateBtn = document.getElementById("translateBtn") as HTMLButtonElement;
export const deleteBtn = document.getElementById("deleteBtn") as HTMLButtonElement;
export const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
export const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
export const modeHint = document.getElementById("modeHint")!;
export type WordInfo = { id: number; text: string; el: HTMLElement };
export const wordsById = new Map<number, WordInfo>();
export const loadingNotes = new Map<number, HTMLElement>();
const pickedIds = new Set<number>();
let translateMode = false;
let deleteMode = false;
let busy = false;
let revision = 0;
let deletePending: HTMLElement | null = null;
export const isTranslateMode = () => translateMode;
export const isDeleteMode = () => deleteMode;
export const isBusy = () => busy;
export const getRevision = () => revision;

export function setBusy(on: boolean) {
  busy = on;
  for (const button of [pasteBtn, formatBtn, translateBtn, deleteBtn, saveBtn, clearBtn]) button.disabled = on;
  content.setAttribute("aria-busy", String(on));
}

export function render(text: string) {
  revision++;
  clearPicked();
  loadingNotes.clear();
  setTranslateMode(false);
  setDeleteMode(false);
  const fragment = document.createDocumentFragment();
  wordsById.clear();
  let cursor = 0;
  for (const para of parseParagraphs(text)) {
    const p = el("p");
    for (const piece of splitParagraph(para)) {
      if (piece.type === "note") { p.append(el("span", "note", piece.text)); continue; }
      let position = 0;
      for (const match of piece.text.matchAll(WORD_PATTERN)) {
        p.append(document.createTextNode(piece.text.slice(position, match.index)));
        const word = el("span", "term", match[0]);
        const id = cursor++;
        word.dataset.wordId = String(id);
        wordsById.set(id, { id, text: match[0], el: word });
        p.append(word);
        position = match.index + match[0].length;
      }
      p.append(document.createTextNode(piece.text.slice(position)));
    }
    fragment.append(p);
  }
  content.replaceChildren(fragment);
  document.getElementById("wordCount")!.textContent = `${cursor.toLocaleString()} ${cursor === 1 ? "word" : "words"}`;
}

export function getCurrentText(): string {
  return Array.from(content.querySelectorAll("p"), p => Array.from(p.childNodes, node => {
    if (node instanceof HTMLElement && node.classList.contains("note")) {
      return node.matches(".loading, .error") ? "" : `『${node.textContent ?? ""}』`;
    }
    return node.textContent ?? "";
  }).join("").trim()).filter(Boolean).join("\n\n");
}

export function clearPicked() {
  for (const id of pickedIds) {
    const word = wordsById.get(id)?.el;
    word?.classList.remove("picked");
    word?.setAttribute("aria-pressed", "false");
  }
  pickedIds.clear();
}
export function togglePick(id: number) {
  if (busy || !translateMode) return;
  const word = wordsById.get(id)?.el;
  if (!word) return;
  if (pickedIds.has(id)) pickedIds.delete(id); else pickedIds.add(id);
  word.classList.toggle("picked", pickedIds.has(id));
  word.setAttribute("aria-pressed", String(pickedIds.has(id)));
}
export const collectPickedIds = () => Array.from(pickedIds).sort((a, b) => a - b);

/** Consecutive IDs alone are not enough: never cross paragraphs, punctuation or notes. */
export function groupIds(ids: number[]): number[][] {
  const groups: number[][] = [];
  for (const id of ids) {
    const last = groups.at(-1);
    const prevId = last?.at(-1);
    const prev = prevId === undefined ? undefined : wordsById.get(prevId)?.el;
    const current = wordsById.get(id)?.el;
    let adjacent = !!prev && !!current && prevId === id - 1 && prev.parentNode === current.parentNode;
    if (adjacent && prev && current) {
      for (let node = prev.nextSibling; node && node !== current; node = node.nextSibling) {
        if (node.nodeType !== Node.TEXT_NODE || /\S/.test(node.textContent ?? "")) adjacent = false;
      }
    }
    if (adjacent && last) last.push(id); else groups.push([id]);
  }
  return groups;
}
export const groupText = (group: number[]) => group.map(id => wordsById.get(id)?.text ?? "").join(" ");

function updateModes() {
  translateBtn.textContent = translateMode ? "Define selected words →" : "✎ Add definitions";
  translateBtn.setAttribute("aria-pressed", String(translateMode));
  deleteBtn.classList.toggle("active-delete", deleteMode);
  deleteBtn.setAttribute("aria-pressed", String(deleteMode));
  content.classList.toggle("select-mode", translateMode);
  content.classList.toggle("delete-mode", deleteMode);
  modeHint.textContent = translateMode ? "Select words with a click or Enter, then choose Define selected words. Esc exits."
    : deleteMode ? "Select a note, then select it again to remove it. Esc exits." : "";
  for (const word of wordsById.values()) {
    if (translateMode) { word.el.tabIndex = 0; word.el.setAttribute("role", "button"); word.el.setAttribute("aria-pressed", String(pickedIds.has(word.id))); }
    else { word.el.removeAttribute("tabindex"); word.el.removeAttribute("role"); word.el.removeAttribute("aria-pressed"); }
  }
  for (const note of content.querySelectorAll<HTMLElement>(".note")) {
    if (deleteMode) { note.tabIndex = 0; note.setAttribute("role", "button"); }
    else { note.removeAttribute("tabindex"); note.removeAttribute("role"); }
  }
}
export function setTranslateMode(on: boolean) {
  translateMode = on;
  if (on) { deleteMode = false; clearDeleteSelection(); }
  else clearPicked();
  updateModes();
}
export function setDeleteMode(on: boolean) {
  deleteMode = on;
  clearDeleteSelection();
  if (on) { translateMode = false; clearPicked(); }
  updateModes();
}
export function clearDeleteSelection() { deletePending?.classList.remove("delete-selected"); deletePending = null; }
export function setDeletePending(note: HTMLElement) { deletePending = note; }
