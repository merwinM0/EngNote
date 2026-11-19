import { ReadingHistory, type ReadingSnapshot } from "./readingHistory";
import { validateFormatting, rebaseFormatting, editFormatting, formattedPageParagraphs, type DocumentFormatting, type TextEdit } from "../word/documentFormatting";
import { appendStyledText, paragraphAppender } from "../word/formattedReading";
import { withIPA } from "../definitions/pronunciation";
import type { DefinitionMetadata } from "../definitions/definitionViews";
import { el, setToolLabel } from "../ui/util";
import { randomNoteTape } from "../definitions/noteTape";
import type { TextRange } from "../definitions/selectionRecovery";
import { t } from "../ui/i18n";
import { splitParagraph, WORD_PATTERN } from "./text";
import { ReadingDocument, characterCount, PAGE_LIMIT } from "./pagination";
import { DefinitionViews, type Definition, type DefinitionView } from "../definitions/definitionViews";
import { definitionSourceWords } from "../definitions/definitionSource";
import type { DefinitionLanguage } from "../definitions/definitionPreference";

import { ImmersiveReading } from "./immersiveReading";

const immersiveReading = new ImmersiveReading();
export const isImmersiveReading = () => immersiveReading.active;
export function setImmersiveReading(on: boolean) {
  if (!on && document.activeElement instanceof HTMLElement && document.activeElement.matches('.immersive-trigger[role="button"]')) content.focus({ preventScroll: true });
  immersiveReading.active = on;
  updateModes();
}
export function toggleImmersiveDefinition(element: HTMLElement) {
  if (!immersiveReading.active || busy) return;
  const id = Number(element.dataset.definitionId), mark = definitionMarks.get(id), definition = definitionViews.get(id);
  if (mark?.trigger !== element || !definition) return;
  immersiveReading.toggle(definition); updateImmersiveMark(mark, definition);
}

export const documentModel = new ReadingDocument();
export const definitionViews = new DefinitionViews();
let documentFormatting: DocumentFormatting | null = null;
export const getDocumentFormatting = () => documentFormatting;
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
type DefinitionMark = { note: HTMLElement; preceding: readonly WordInfo[]; trigger?: HTMLElement; term?: string; fallback?: boolean };
const definitionMarks = new Map<number, DefinitionMark>();
const pickedIds = new Set<number>();
let retainedRanges: TextRange[] = [];
let translateMode = false;
let deleteMode = false;
let busy = false;
let revision = 0;
let deletePending: HTMLElement | null = null;
export const isTranslateMode = () => translateMode;
export const isDeleteMode = () => deleteMode;
export const isDeletePending = (note: HTMLElement) => deletePending === note;
export const isBusy = () => busy;
export const getRevision = () => revision;
export const getCurrentText = () => documentModel.text;
export const getPageText = () => documentModel.page.text;

export const readingHistory = new ReadingHistory();
const snapshot = (): ReadingSnapshot => ({ text: documentModel.text, definitions: definitionViews.snapshot(), offset: documentModel.page.start, formatting: documentFormatting });
function historyControls() {
  (document.getElementById("undoBtn") as HTMLButtonElement).disabled = !readingHistory.canUndo;
  (document.getElementById("redoBtn") as HTMLButtonElement).disabled = !readingHistory.canRedo;
}
export function restoreHistory(redo = false) {
  window.dispatchEvent(new Event("reading-history-request"));
  if (busy) return;
  const next = redo ? readingHistory.redo(snapshot()) : readingHistory.undo(snapshot());
  if (!next) return;
  documentFormatting = validateFormatting(next.formatting, next.text);
  documentModel.setText(next.text); definitionViews.reset(next.text, next.definitions);
  documentModel.select(documentModel.locate(next.offset)); paint(true);
}
function updateNavigation() {
  historyControls();
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
  for (const id of ["editorBtn", "wordBtn", "formatBtn", "deleteBtn", "saveBtn", "clearBtn", "immersiveBtn", "editorText", "wordFile", "editorApplyBtn", "wordSearchInput", "wordSearchScope"]) {
    const control = document.getElementById(id);
    if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) control.disabled = on;
  }
  content.setAttribute("aria-busy", String(on));
  updateNavigation();
  updateDefinitionControls();
  refreshDefinitionNotes();
  window.dispatchEvent(new Event("reading-busy-changed"));
}

function updateImmersiveMark(mark: DefinitionMark, definition: Definition) {
  const { note } = mark;
  // Reconnect after a draft's missing term metadata is restored from its saved article.
  if (!mark.trigger || mark.term !== definition.term) {
    if (mark.fallback) mark.trigger?.remove();
    else if (mark.trigger) mark.trigger.replaceWith(...mark.trigger.childNodes);
    const words = definitionSourceWords(mark.preceding, documentModel.text, definition.start, definition.term);
    const trigger = el("span", "immersive-trigger");
    trigger.dataset.definitionId = String(definition.id);
    if (!words.length) {
      trigger.textContent = "…"; note.before(trigger);
    } else {
      const first = words[0]!.el, last = words.at(-1)!.el;
      first.before(trigger);
      // Move intact Word runs and spaces, covering the phrase with one wrapping outline.
      for (let node: ChildNode | null = first; node;) {
        const next: ChildNode | null = node.nextSibling;
        trigger.append(node); if (node === last) break;
        node = next;
      }
    }
    mark.trigger = trigger; mark.term = definition.term; mark.fallback = !words.length;
  }
  const { trigger } = mark;
  const active = immersiveReading.active, concealed = immersiveReading.concealed(definition);
  note.hidden = concealed;
  trigger.hidden = !!mark.fallback && !active;
  if (active) {
    const action = t(concealed ? "reader.noteReveal" : "reader.noteHide");
    trigger.tabIndex = 0; trigger.role = "button"; trigger.title = action;
    trigger.setAttribute("aria-label", mark.fallback ? action : `${trigger.textContent}: ${action}`);
    trigger.setAttribute("aria-expanded", String(!concealed)); trigger.setAttribute("aria-controls", note.id);
    trigger.setAttribute("aria-disabled", String(busy));
  } else {
    for (const attr of ["tabindex", "role", "title", "aria-label", "aria-expanded", "aria-controls", "aria-disabled"]) trigger.removeAttribute(attr);
  }
}

export function refreshDefinitionNotes() {
  for (const [id, mark] of definitionMarks) {
    const definition = definitionViews.get(id);
    if (!definition) continue;
    const { note } = mark;
    const chinese = definition.language === "zh" && !!definition.chinese;
    const text = withIPA(chinese ? definition.chinese! : definition.english, definition.britishIPA);
    if (note.textContent !== text) note.textContent = text;
    note.lang = chinese ? "zh-Hans" : "en";
    const action = deleteMode ? t("reader.noteDeleteHint") : !definition.chinese
      ? t("reader.noteEnglishOnly") : t(chinese ? "reader.noteShowEnglish" : "reader.noteShowChinese");
    note.title = immersiveReading.active ? "" : translateMode ? t("reader.noteReadToSwitch") : action;
    if (!translateMode && !immersiveReading.active) {
      note.tabIndex = 0; note.setAttribute("role", "button");
      note.setAttribute("aria-label", `${text}. ${action}`);
      note.setAttribute("aria-disabled", String(busy));
    } else {
      for (const attr of ["tabindex", "role", "aria-label", "aria-disabled"]) note.removeAttribute(attr);
    }
    if (deleteMode) note.setAttribute("aria-pressed", String(deletePending === note));
    else note.removeAttribute("aria-pressed");
    updateImmersiveMark(mark, definition);
  }
}
export function definitionViewChanged() {
  refreshDefinitionNotes();
  window.dispatchEvent(new Event("definition-view-changed"));
}

function paint(changed = false, keepDeleteMode = false) {
  const retained = changed ? [] : retainedRanges;
  definitionViews.sync(documentModel.text);
  revision++;
  clearPicked();
  setTranslateMode(false);
  setDeleteMode(keepDeleteMode && deleteMode);
  wordsById.clear(); definitionMarks.clear();
  const fragment = document.createDocumentFragment();
  const page = documentModel.page;
  let cursor = 0;
  content.classList.toggle("word-document", !!documentFormatting);
  const appendParagraph = paragraphAppender(fragment);
  const blocks = documentFormatting
    ? formattedPageParagraphs(documentFormatting, documentModel.text, page.start, page.end)
    : Array.from(page.text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g), match => ({ start: page.start + match.index, text: match[0], format: undefined }));
  for (const block of blocks) {
    const p = el("p");
    let offset = block.start;
    let preceding: WordInfo[] = [];
    for (const piece of splitParagraph(block.text)) {
      if (piece.type === "note") {
        const note = el("span", "note", piece.text);
        // Imported Word runs may differ in size: notes match the immediately preceding source word.
        const previous = p.lastElementChild;
        const sourceRun = previous?.classList.contains("term") ? previous.lastElementChild : previous;
        if (sourceRun instanceof HTMLElement && sourceRun.style.fontSize) note.style.fontSize = sourceRun.style.fontSize;
        note.dataset.start = String(offset);
        note.dataset.end = String(offset + piece.text.length + 2);
        const definition = definitionViews.at(offset);
        note.dataset.definitionId = String(definition?.id ?? "");
        if (definition) {
          note.id = `reading-note-${definition.id}`;
          note.dataset.tape = definition.tape ??= randomNoteTape();
          definitionMarks.set(definition.id, { note, preceding });
        }
        preceding = [];
        p.append(note);
        offset += piece.text.length + 2;
        continue;
      }
      let position = 0;
      for (const wordMatch of piece.text.matchAll(WORD_PATTERN)) {
        appendStyledText(p, piece.text.slice(position, wordMatch.index), offset + position, documentFormatting);
        const word = el("span", "term");
        appendStyledText(word, wordMatch[0], offset + wordMatch.index, documentFormatting);
        const id = cursor++;
        word.dataset.wordId = String(id);
        const start = offset + wordMatch.index;
        const info = { id, text: wordMatch[0], el: word, start, end: start + wordMatch[0].length };
        wordsById.set(id, info); preceding.push(info);
        p.append(word);
        position = wordMatch.index + wordMatch[0].length;
      }
      appendStyledText(p, piece.text.slice(position), offset + position, documentFormatting);
      offset += piece.text.length;
    }
    appendParagraph(p, block.format);
  }
  content.replaceChildren(fragment);
  if (retained.length) { retainedRanges = retained; setTranslateMode(true); applyRetainedPicks(); }
  updateModes();
  updateNavigation();
  window.dispatchEvent(new Event("document-view-changed"));
  if (changed) window.dispatchEvent(new Event("document-changed"));
}

export function render(text: string, page: number | "last" = 0, definitions: DefinitionView[] = [], formatting: DocumentFormatting | null = null) {
  const checked = validateFormatting(formatting, text);
  documentModel.setText(text, page); documentFormatting = checked;
  definitionViews.reset(text, definitions); readingHistory.reset(); immersiveReading.reset();
  window.dispatchEvent(new Event("document-replaced"));
  paint(true);
}
export function goToPage(index: number) {
  if (busy) return;
  readingHistory.breakGroup();
  documentModel.select(index);
  paint();
}
export function editCurrentPage(value: string, cursor: number, typing = true, edits?: TextEdit[]) {
  const before = snapshot(), page = documentModel.page;
  const nextText = before.text.slice(0, page.start) + value + before.text.slice(page.end);
  let formatting = documentFormatting;
  if (edits) {
    let text = before.text;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
      const global = { ...edit, start: page.start + edit.start, end: page.start + edit.end };
      formatting = editFormatting(formatting, text, global);
      text = text.slice(0, global.start) + global.value + text.slice(global.end);
    }
    if (text !== nextText) throw new Error("Paragraph edits do not match the formatted text.");
  } else formatting = rebaseFormatting(formatting, before.text, nextText);
  const result = documentModel.editPage(value, cursor);
  documentFormatting = formatting;
  definitionViews.sync(documentModel.text);
  readingHistory.record(before, snapshot(), typing);
  paint(true);
  return result;
}
export function addDefinitions(definitions: Array<DefinitionMetadata & { offset: number; meaning: string; chinese: string; term?: string }>, language: DefinitionLanguage = "en") {
  if (!definitions.length) return [];
  const before = snapshot();
  const edits = definitions.map(item => {
    const previous = definitionViews.at(item.offset);
    return { ...item, offset: item.offset, value: `『${item.meaning}』`, chinese: item.chinese, term: item.term, deleteCount: previous ? previous.english.length + 2 : 0 };
  }).sort((a, b) => b.offset - a.offset);
  let text = documentModel.text, formatting = documentFormatting;
  for (const edit of edits) {
    formatting = editFormatting(formatting, text, { start: edit.offset, end: edit.offset + edit.deleteCount, value: edit.value });
    text = text.slice(0, edit.offset) + edit.value + text.slice(edit.offset + edit.deleteCount);
  }
  documentModel.setText(text); documentFormatting = formatting;
  definitionViews.sync(text, edits);
  let shift = 0, focus = 0;
  for (const edit of [...edits].reverse()) {
    const start = edit.offset + shift, note = definitionViews.at(start)!;
    Object.assign(note, { chinese: edit.chinese, language });
    delete note.britishIPA; delete note.mode; delete note.contextKey;
    if (edit.britishIPA) note.britishIPA = edit.britishIPA;
    if (edit.mode) note.mode = edit.mode;
    if (edit.contextKey) note.contextKey = edit.contextKey;
    // A replacement without query identity must not inherit the old note's term.
    if (edit.term) note.term = edit.term; else delete note.term;
    focus = start + edit.value.length;
    shift += edit.value.length - edit.deleteCount;
  }
  documentModel.select(documentModel.locate(focus));
  readingHistory.record(before, snapshot());
  paint(true);
  return edits;
}
export function removeDefinition(note: HTMLElement) {
  const start = Number(note.dataset.start), end = Number(note.dataset.end);
  const definition = definitionViews.get(Number(note.dataset.definitionId));
  if (!definition || !Number.isInteger(start) || !Number.isInteger(end) || documentModel.text.slice(start, end) !== `『${definition.english}』`) return;
  const before = snapshot();
  const formatting = editFormatting(documentFormatting, documentModel.text, { start, end, value: "" });
  documentModel.replaceRange(start, end, "", start);
  documentFormatting = formatting;
  definitionViews.sync(documentModel.text);
  readingHistory.record(before, snapshot());
  // Repaint clears the target, but a successful removal is not an exit from deletion.
  paint(true, true);
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
    const adjacent = prev && current && previousId === id - 1 && prev.el.closest("p") === current.el.closest("p")
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
  setToolLabel(translateBtn, t("reader.addDefinitions"));
  setToolLabel(defineSelectedBtn, t("reader.defineSelected", { count: pickedIds.size }));
  defineSelectedBtn.querySelector<HTMLElement>("[data-tool-count]")!.textContent = String(pickedIds.size);
  defineSelectedBtn.disabled = busy || pickedIds.size === 0;
  setToolLabel(refreshSelectedBtn, t("reader.refreshSelected"));
}
function updateModes() {
  updateDefinitionControls();
  document.getElementById("readBtn")!.setAttribute("aria-pressed", String(!translateMode && !deleteMode && !immersiveReading.active && !document.getElementById("readPanel")!.hidden));
  document.getElementById("immersiveBtn")!.setAttribute("aria-pressed", String(immersiveReading.active));
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
  if (on) { immersiveReading.active = false; deleteMode = false; clearDeleteSelection(); } else clearPicked();
  updateModes();
}
export function setDeleteMode(on: boolean) {
  deleteMode = on;
  clearDeleteSelection();
  if (on) { immersiveReading.active = false; translateMode = false; clearPicked(); }
  updateModes();
}
export function clearDeleteSelection() {
  if (deletePending) {
    deletePending.classList.remove("delete-selected");
    if (deleteMode) deletePending.setAttribute("aria-pressed", "false");
    else deletePending.removeAttribute("aria-pressed");
  }
  deletePending = null;
}
export function setDeletePending(note: HTMLElement) {
  clearDeleteSelection();
  deletePending = note;
  note.classList.add("delete-selected");
  note.setAttribute("aria-pressed", "true");
}

// Static page labels are handled by i18n.applyTranslations; these are rendered by JS.
window.addEventListener("ui-language-changed", () => {
  refreshReadingCounts();
  updateModes();
});
