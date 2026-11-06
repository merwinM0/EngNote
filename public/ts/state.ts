import { el } from "./util";
import { splitParagraph, WORD_PATTERN } from "./text";
import { ReadingDocument, characterCount, PAGE_LIMIT } from "./pagination";
import { DefinitionViews } from "./definitionViews";
import type { DefinitionView } from "./definitionViews";
import type { DefinitionLanguage } from "./definitionPreference";

export const documentModel = new ReadingDocument();
export const definitionViews = new DefinitionViews();
export const content = document.getElementById("content") as HTMLDivElement;
export const formatBtn = document.getElementById("formatBtn") as HTMLButtonElement;
export const translateBtn = document.getElementById("translateBtn") as HTMLButtonElement;
export const deleteBtn = document.getElementById("deleteBtn") as HTMLButtonElement;
export const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
export const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
export const modeHint = document.getElementById("modeHint")!;
const defineSelectedBtn = document.getElementById("defineSelectedBtn") as HTMLButtonElement;
const refreshSelectedBtn = document.getElementById("refreshSelectedBtn") as HTMLButtonElement;
export type WordInfo = { id: number; text: string; el: HTMLElement; start: number; end: number };
export const wordsById = new Map<number, WordInfo>();
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
export const getCurrentText = () => documentModel.text;
export const getPageText = () => documentModel.page.text;

function updateNavigation() {
  (document.getElementById("previousPageBtn") as HTMLButtonElement).disabled = busy || documentModel.index === 0;
  (document.getElementById("nextPageBtn") as HTMLButtonElement).disabled = busy || documentModel.index === documentModel.pages.length - 1;
  const select = document.getElementById("pageSelect") as HTMLSelectElement;
  select.disabled = busy;
  select.replaceChildren(...documentModel.pages.map((_, index) => {
    const option = el("option", "", `${index + 1} / ${documentModel.pages.length}`);
    option.value = String(index);
    return option;
  }));
  select.value = String(documentModel.index);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-page-step]")) {
    button.disabled = busy || (Number(button.dataset.pageStep) < 0 ? documentModel.index === 0 : documentModel.index === documentModel.pages.length - 1);
  }
  document.querySelector("[data-page-position]")!.textContent = `${documentModel.index + 1} / ${documentModel.pages.length}`;
  document.getElementById("pageSummary")!.textContent = `${documentModel.page.count.toLocaleString()} / ${PAGE_LIMIT.toLocaleString()} characters`;
  document.getElementById("documentSummary")!.textContent = `${characterCount(documentModel.text).toLocaleString()} characters · ${documentModel.pages.length} page(s) in this article`;
}
export function setBusy(on: boolean) {
  busy = on;
  for (const id of ["editorBtn", "wordBtn", "formatBtn", "deleteBtn", "saveBtn", "clearBtn", "editorText", "wordFile", "editorApplyBtn"]) {
    const control = document.getElementById(id);
    if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) control.disabled = on;
  }
  content.setAttribute("aria-busy", String(on));
  updateNavigation();
  updateDefinitionControls();
  refreshDefinitionNotes();
}

export function refreshDefinitionNotes() {
  for (const note of content.querySelectorAll<HTMLElement>(".note")) {
    const definition = definitionViews.get(Number(note.dataset.definitionId));
    if (!definition) continue;
    const chinese = definition.language === "zh" && !!definition.chinese;
    const text = chinese ? definition.chinese! : definition.english;
    note.textContent = text; note.lang = chinese ? "zh-Hans" : "en";
    const action = deleteMode ? "Select twice to remove this definition." : !definition.chinese
      ? "English-only note. Use Add definitions to generate both languages."
      : "Click to show the " + (chinese ? "English" : "Chinese") + " definition.";
    note.title = translateMode ? "Choose Read to switch this definition's language." : action;
    if (!translateMode) {
      note.tabIndex = 0; note.setAttribute("role", "button");
      note.setAttribute("aria-label", `${text}. ${action}`);
    } else { note.removeAttribute("tabindex"); note.removeAttribute("role"); note.removeAttribute("aria-label"); }
    note.setAttribute("aria-disabled", String(busy));
  }
}
export function definitionViewChanged() {
  refreshDefinitionNotes();
  window.dispatchEvent(new Event("definition-view-changed"));
}

function paint(changed = false) {
  definitionViews.sync(documentModel.text);
  revision++;
  clearPicked();
  setTranslateMode(false);
  setDeleteMode(false);
  wordsById.clear();
  const fragment = document.createDocumentFragment();
  const page = documentModel.page;
  let cursor = 0;
  for (const match of page.text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)) {
    const p = el("p");
    let offset = page.start + match.index;
    for (const piece of splitParagraph(match[0])) {
      if (piece.type === "note") {
        const note = el("span", "note", piece.text);
        note.dataset.start = String(offset);
        note.dataset.end = String(offset + piece.text.length + 2);
        note.dataset.definitionId = String(definitionViews.at(offset)?.id ?? "");
        p.append(note);
        offset += piece.text.length + 2;
        continue;
      }
      let position = 0;
      for (const wordMatch of piece.text.matchAll(WORD_PATTERN)) {
        p.append(document.createTextNode(piece.text.slice(position, wordMatch.index)));
        const word = el("span", "term", wordMatch[0]);
        const id = cursor++;
        word.dataset.wordId = String(id);
        const start = offset + wordMatch.index;
        wordsById.set(id, { id, text: wordMatch[0], el: word, start, end: start + wordMatch[0].length });
        p.append(word);
        position = wordMatch.index + wordMatch[0].length;
      }
      p.append(document.createTextNode(piece.text.slice(position)));
      offset += piece.text.length;
    }
    fragment.append(p);
  }
  content.replaceChildren(fragment);
  updateModes();
  document.getElementById("wordCount")!.textContent = `${cursor.toLocaleString()} words on this page`;
  updateNavigation();
  window.dispatchEvent(new Event("document-view-changed"));
  if (changed) window.dispatchEvent(new Event("document-changed"));
}

export function render(text: string, page: number | "last" = 0, definitions: DefinitionView[] = []) {
  documentModel.setText(text, page); definitionViews.reset(text, definitions); paint(true);
}
export function goToPage(index: number) {
  if (busy) return;
  documentModel.select(index);
  paint();
}
export function editCurrentPage(value: string, cursor: number) {
  const result = documentModel.editPage(value, cursor);
  paint(true);
  return result;
}
export function addDefinitions(definitions: Array<{ offset: number; meaning: string; chinese: string; term?: string }>, language: DefinitionLanguage = "en") {
  if (!definitions.length) return;
  const edits = definitions.map(item => {
    const previous = definitionViews.at(item.offset);
    return { offset: item.offset, value: `『${item.meaning}』`, chinese: item.chinese, term: item.term, deleteCount: previous ? previous.english.length + 2 : 0 };
  }).sort((a, b) => b.offset - a.offset);
  let text = documentModel.text;
  for (const edit of edits) text = text.slice(0, edit.offset) + edit.value + text.slice(edit.offset + edit.deleteCount);
  documentModel.setText(text);
  definitionViews.sync(text, edits);
  let shift = 0, focus = 0;
  for (const edit of [...edits].reverse()) {
    const start = edit.offset + shift, note = definitionViews.at(start)!;
    Object.assign(note, { chinese: edit.chinese, language });
    // A replacement without query identity must not inherit the old note's term.
    if (edit.term) note.term = edit.term; else delete note.term;
    focus = start + edit.value.length;
    shift += edit.value.length - edit.deleteCount;
  }
  documentModel.select(documentModel.locate(focus));
  paint(true);
}
export function removeDefinition(note: HTMLElement) {
  const start = Number(note.dataset.start), end = Number(note.dataset.end);
  const definition = definitionViews.get(Number(note.dataset.definitionId));
  if (!definition || !Number.isInteger(start) || !Number.isInteger(end) || documentModel.text.slice(start, end) !== `『${definition.english}』`) return;
  documentModel.replaceRange(start, end, "", start);
  paint(true);
}

export function clearPicked() {
  for (const id of pickedIds) { const word = wordsById.get(id)?.el; word?.classList.remove("picked"); word?.setAttribute("aria-pressed", "false"); }
  pickedIds.clear();
  updateDefinitionControls();
}
export function togglePick(id: number) {
  if (busy || !translateMode) return;
  const word = wordsById.get(id)?.el;
  if (!word) return;
  if (pickedIds.has(id)) pickedIds.delete(id); else pickedIds.add(id);
  word.classList.toggle("picked", pickedIds.has(id));
  word.setAttribute("aria-pressed", String(pickedIds.has(id)));
  updateDefinitionControls();
}
export const collectPickedIds = () => Array.from(pickedIds).sort((a, b) => a - b);
export function groupIds(ids: number[]): number[][] {
  const groups: number[][] = [];
  for (const id of ids) {
    const last = groups.at(-1), previousId = last?.at(-1);
    const prev = previousId === undefined ? undefined : wordsById.get(previousId);
    const current = wordsById.get(id);
    const adjacent = prev && current && previousId === id - 1 && prev.el.parentNode === current.el.parentNode
      && !/\S/.test(documentModel.text.slice(prev.end, current.start));
    if (adjacent && last) last.push(id); else groups.push([id]);
  }
  return groups;
}
export const groupText = (group: number[]) => group.map(id => wordsById.get(id)?.text ?? "").join(" ");

function updateDefinitionControls() {
  defineSelectedBtn.hidden = refreshSelectedBtn.hidden = !translateMode;
  refreshSelectedBtn.disabled = busy || pickedIds.size === 0;
  translateBtn.disabled = busy;
  translateBtn.textContent = "✎ Add definitions";
  translateBtn.setAttribute("aria-label", "Add definitions");
  translateBtn.title = "Select words to define. Choose Read to return to reading.";
  defineSelectedBtn.textContent = `Define selected (${pickedIds.size})`;
  defineSelectedBtn.disabled = busy || pickedIds.size === 0;
}
function updateModes() {
  updateDefinitionControls();
  document.getElementById("readBtn")!.setAttribute("aria-pressed", String(!translateMode && !deleteMode && !document.getElementById("readPanel")!.hidden));
  translateBtn.setAttribute("aria-pressed", String(translateMode));
  deleteBtn.classList.toggle("active-delete", deleteMode);
  deleteBtn.setAttribute("aria-pressed", String(deleteMode));
  content.classList.toggle("select-mode", translateMode);
  content.classList.toggle("delete-mode", deleteMode);
  modeHint.textContent = translateMode ? "Select words, then Define selected (reuse notes and cache first) or Refresh selected (new AI request). Read or Esc returns."
    : deleteMode ? "Select a note, then select it again to remove it. Read or Esc exits." : "";
  for (const word of wordsById.values()) {
    if (translateMode) { word.el.tabIndex = 0; word.el.setAttribute("role", "button"); word.el.setAttribute("aria-pressed", String(pickedIds.has(word.id))); }
    else { word.el.removeAttribute("tabindex"); word.el.removeAttribute("role"); word.el.removeAttribute("aria-pressed"); }
  }
  refreshDefinitionNotes();
}
export function setTranslateMode(on: boolean) {
  translateMode = on;
  if (on) { deleteMode = false; clearDeleteSelection(); } else clearPicked();
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
