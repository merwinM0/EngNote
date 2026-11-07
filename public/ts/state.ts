import { el, setToolLabel } from "./util";
import { randomNoteTape } from "./noteTape";
import type { TextRange } from "./selectionRecovery";
import { t } from "./i18n";
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
let retainedRanges: TextRange[] = [];
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
  (document.getElementById("exportWordBtn") as HTMLButtonElement).disabled = busy || !documentModel.text.trim();
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
  refreshReadingCounts();
}
function refreshReadingCounts() {
  document.getElementById("wordCount")!.textContent = t("reader.wordCount", { count: wordsById.size.toLocaleString() });
  document.getElementById("pageSummary")!.textContent = t("reader.pageSummary", { count: documentModel.page.count.toLocaleString(), limit: PAGE_LIMIT.toLocaleString() });
  document.getElementById("documentSummary")!.textContent = t("reader.documentSummaryLong", { count: characterCount(documentModel.text).toLocaleString(), pages: documentModel.pages.length });
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
    const action = deleteMode ? t("reader.noteDeleteHint") : !definition.chinese
      ? t("reader.noteEnglishOnly")
      : t(chinese ? "reader.noteShowEnglish" : "reader.noteShowChinese");
    note.title = translateMode ? t("reader.noteReadToSwitch") : action;
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
  const retained = changed ? [] : retainedRanges;
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
        const definition = definitionViews.at(offset);
        note.dataset.definitionId = String(definition?.id ?? "");
        if (definition) note.dataset.tape = definition.tape ??= randomNoteTape();
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
  if (retained.length) { retainedRanges = retained; setTranslateMode(true); applyRetainedPicks(); }
  updateModes();
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
  if (!definitions.length) return [];
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
  return edits;
}
export function removeDefinition(note: HTMLElement) {
  const start = Number(note.dataset.start), end = Number(note.dataset.end);
  const definition = definitionViews.get(Number(note.dataset.definitionId));
  if (!definition || !Number.isInteger(start) || !Number.isInteger(end) || documentModel.text.slice(start, end) !== `『${definition.english}』`) return;
  documentModel.replaceRange(start, end, "", start);
  paint(true);
}

export function clearPicked() {
  retainedRanges = [];
  for (const id of pickedIds) { const word = wordsById.get(id)?.el; word?.classList.remove("picked"); word?.setAttribute("aria-pressed", "false"); }
  pickedIds.clear();
  updateDefinitionControls();
}
export function togglePick(id: number) {
  if (busy || !translateMode) return;
  const info = wordsById.get(id), word = info?.el;
  if (!word || !info) return;
  if (pickedIds.has(id)) pickedIds.delete(id); else pickedIds.add(id);
  word.classList.toggle("picked", pickedIds.has(id));
  word.setAttribute("aria-pressed", String(pickedIds.has(id)));
  if (retainedRanges.length) {
    retainedRanges = retainedRanges.flatMap(range => range.end <= info.start || range.start >= info.end ? [range]
      : [{ start: range.start, end: info.start }, { start: info.end, end: range.end }].filter(part => part.start < part.end));
    if (pickedIds.has(id)) retainedRanges.push({ start: info.start, end: info.end });
  }
  updateDefinitionControls();
}
function applyRetainedPicks() {
  for (const word of wordsById.values()) {
    if (!retainedRanges.some(range => range.start <= word.start && word.end <= range.end)) continue;
    pickedIds.add(word.id); word.el.classList.add("picked"); word.el.setAttribute("aria-pressed", "true");
  }
  updateDefinitionControls();
}
export function retainedPicksOutsidePage(): TextRange[] {
  const { start, end } = documentModel.page;
  return retainedRanges.flatMap(range => [
    { start: range.start, end: Math.min(range.end, start) },
    { start: Math.max(range.start, end), end: range.end },
  ].filter(part => part.start < part.end));
}
export function restorePickedRanges(ranges: TextRange[]) {
  if (!ranges.length) { setTranslateMode(false); return; }
  setTranslateMode(true); clearPicked(); retainedRanges = ranges;
  const page = documentModel.locate(ranges[0]!.start);
  if (page !== documentModel.index) goToPage(page);
  else applyRetainedPicks();
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
  setToolLabel(translateBtn, t("reader.addDefinitions"), t("reader.addDefinitionsTitle"));
  setToolLabel(defineSelectedBtn, t("reader.defineSelected", { count: pickedIds.size }), t("reader.defineTitle"));
  defineSelectedBtn.querySelector<HTMLElement>("[data-tool-count]")!.textContent = String(pickedIds.size);
  defineSelectedBtn.disabled = busy || pickedIds.size === 0;
  setToolLabel(refreshSelectedBtn, t("reader.refreshSelected"), t("reader.refreshTitle"));
}
function updateModes() {
  updateDefinitionControls();
  document.getElementById("readBtn")!.setAttribute("aria-pressed", String(!translateMode && !deleteMode && !document.getElementById("readPanel")!.hidden));
  translateBtn.setAttribute("aria-pressed", String(translateMode));
  deleteBtn.classList.toggle("active-delete", deleteMode);
  deleteBtn.setAttribute("aria-pressed", String(deleteMode));
  content.classList.toggle("select-mode", translateMode);
  content.classList.toggle("delete-mode", deleteMode);
  modeHint.textContent = translateMode ? t("reader.modeSelect")
    : deleteMode ? t("reader.modeDelete") : "";
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

// Static page labels are handled by i18n.applyTranslations; these are rendered by JS.
window.addEventListener("ui-language-changed", () => {
  refreshReadingCounts();
  updateModes();
});
