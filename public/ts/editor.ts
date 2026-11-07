import { setStatus, errorMessage, setToolLabel } from "./util";
import { msg, setUIText, t } from "./i18n";
import type { UIMessage } from "./i18n";
import { reflowText } from "./text";
import { characterCount, DOCUMENT_LIMIT, paginate } from "./pagination";
import { definitionViews, documentModel, editCurrentPage, getCurrentText, getRevision, goToPage, isBusy, render, setBusy } from "./state";
import { confirmReplace, deselectEntry, getDraftEntry, restoreEntrySelection } from "./db";
import { ARTICLE_DRAFT_KEY, parseArticleDraft } from "./articleDraft";
import type { ArticleDraft } from "./articleDraft";
import { activePanel, openPanel } from "./panels";

const editor = document.getElementById("editorText") as HTMLTextAreaElement;
const entry = document.getElementById("editorBtn") as HTMLButtonElement;
const wordFile = document.getElementById("wordFile") as HTMLInputElement;
const applyButton = document.getElementById("editorApplyBtn") as HTMLButtonElement;
let mode: "paste" | "edit" = "paste";
let importDraft = "";
let openingWord = false;
let importingWord = false;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let wordRequest = 0;
let warnedStorage = false;
const hasContent = () => !!getCurrentText().trim();

function message(text: UIMessage, error = false) {
  const element = document.getElementById("editorMsg")!;
  element.hidden = !setUIText(element, text);
  element.classList.toggle("error", error);
}
function updateEntry() {
  setToolLabel(entry, t(hasContent() ? "reader.editPage" : "reader.pasteText"));
}
function updatePreview() {
  const preview = document.getElementById("editorPreview")!;
  if (mode === "edit") {
    preview.textContent = t("editor.previewEdit", { page: documentModel.index + 1, total: documentModel.pages.length, count: documentModel.page.count.toLocaleString() });
    return;
  }
  if (editor.value.length > DOCUMENT_LIMIT) {
    preview.textContent = t("editor.previewTooLong");
    return;
  }
  const text = reflowText(editor.value);
  preview.textContent = t("editor.previewPaste", { count: characterCount(text).toLocaleString(), pages: paginate(text).length });
}
function refreshEditorCopy() {
  document.getElementById("editorTitle")!.textContent = t(mode === "edit" ? "editor.titleEdit" : importingWord ? "editor.titleWord" : "editor.titlePaste");
  document.getElementById("editorDescription")!.textContent = t(mode === "edit" ? "editor.descriptionEdit" : "editor.descriptionPaste");
  document.getElementById("editorLabel")!.textContent = t(mode === "edit" ? "editor.labelEdit" : "editor.labelPaste");
  document.getElementById("draftHint")!.textContent = t(warnedStorage ? "editor.storageWarning" : "editor.draftHint");
}
function configureEditor(word = false) {
  importingWord = word;
  mode = hasContent() && !word ? "edit" : "paste";
  editor.value = mode === "edit" ? documentModel.page.text : importDraft;
  refreshEditorCopy();
  applyButton.hidden = mode === "edit";
  message(""); updateEntry(); updatePreview();
}
function syncEditor() {
  updateEntry();
  if (mode !== "edit") return;
  if (!hasContent()) { importDraft = ""; configureEditor(); return; }
  if (editor.value !== documentModel.page.text) editor.value = documentModel.page.text;
  updatePreview();
}
async function applyImport(raw: string) {
  if (isBusy()) return;
  if (raw.length > DOCUMENT_LIMIT) return message(msg("editor.tooLong"), true);
  const text = reflowText(raw);
  if (!text) return message(msg("editor.empty"), true);
  if (!(await confirmReplace()) || isBusy()) return;
  render(text); deselectEntry(); openPanel("readPanel", false); message("");
  setStatus(msg("editor.reflowDone", { count: documentModel.pages.length }), "ok");
}
function onInput() {
  if (isBusy()) return;
  if (mode === "paste") { importDraft = editor.value; updatePreview(); message(""); return; }
  try {
    const result = editCurrentPage(editor.value, editor.selectionEnd);
    editor.value = documentModel.page.text;
    editor.setSelectionRange(result.cursor, result.cursor);
    if (result.changedPage) { editor.scrollTop = 0; message(msg("editor.overflow", { page: documentModel.index + 1, total: documentModel.pages.length })); }
    else message("");
  } catch (error) { editor.value = documentModel.page.text; message(() => errorMessage(error), true); }
}
function persistDraft() {
  clearTimeout(draftTimer);
  try {
    if (!getCurrentText()) sessionStorage.removeItem(ARTICLE_DRAFT_KEY);
    else {
      const draft: ArticleDraft = { version: 2, text: getCurrentText(), index: documentModel.index, entry: getDraftEntry(), definitions: definitionViews.snapshot(), offset: documentModel.page.start };
      sessionStorage.setItem(ARTICLE_DRAFT_KEY, JSON.stringify(draft));
    }
  } catch {
    document.getElementById("draftHint")!.textContent = t("editor.storageWarning");
    if (!warnedStorage) { warnedStorage = true; setStatus(msg("editor.storageWarning"), "error"); }
  }
}
function restoreDraft() {
  try {
    const raw = sessionStorage.getItem(ARTICLE_DRAFT_KEY);
    if (!raw) return;
    const draft = parseArticleDraft(raw);
    if (!draft) { sessionStorage.removeItem(ARTICLE_DRAFT_KEY); return; }
    const offset = draft.offset ?? paginate(draft.text, 3000)[Math.max(0, Math.min(draft.index, paginate(draft.text, 3000).length - 1))]!.start;
    render(draft.text, 0, draft.definitions);
    goToPage(documentModel.locate(offset)); restoreEntrySelection(draft.entry);
    setStatus(msg(draft.entry ? "editor.draftRestoredSaved" : "editor.draftRestoredUnsaved"), "ok");
  } catch { /* Optional storage must never prevent reading. */ }
}

export function initEditor() {
  entry.addEventListener("click", () => {
    if (isBusy()) return;
    if (activePanel() === "editorPanel") configureEditor();
    openPanel("editorPanel");
  });
  document.getElementById("editorPanel")!.addEventListener("panel-open", () => configureEditor(openingWord));
  document.getElementById("editorPanel")!.addEventListener("panel-close", () => { if (mode === "paste") importDraft = editor.value; });
  document.getElementById("wordBtn")!.addEventListener("click", () => {
    if (isBusy()) return;
    openingWord = true;
    if (activePanel() === "editorPanel") configureEditor(true);
    openPanel("editorPanel", false);
    openingWord = false;
    wordFile.focus(); wordFile.click();
  });
  window.addEventListener("document-view-changed", () => {
    syncEditor(); clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 200);
  });
  window.addEventListener("document-changed", () => {
    if (!hasContent()) { importDraft = ""; if (mode === "paste") { editor.value = ""; updatePreview(); } }
  });
  window.addEventListener("entry-selection-changed", persistDraft);
  window.addEventListener("definition-view-changed", persistDraft);
  window.addEventListener("pagehide", persistDraft);
  editor.addEventListener("beforeinput", event => {
    if (mode === "edit" && (event.inputType === "historyUndo" || event.inputType === "historyRedo")) {
      event.preventDefault();
      document.getElementById(event.inputType === "historyUndo" ? "undoBtn" : "redoBtn")!.click();
    }
  });
  editor.addEventListener("input", event => { if (!(event instanceof InputEvent) || !event.isComposing) onInput(); });
  editor.addEventListener("compositionend", onInput);
  document.getElementById("editorForm")!.addEventListener("submit", event => { event.preventDefault(); if (mode === "paste") void applyImport(editor.value); });
  document.getElementById("previousPageBtn")!.addEventListener("click", () => goToPage(documentModel.index - 1));
  document.getElementById("nextPageBtn")!.addEventListener("click", () => goToPage(documentModel.index + 1));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-page-step]")) button.addEventListener("click", () => {
    if (isBusy()) return;
    goToPage(documentModel.index + Number(button.dataset.pageStep));
    const content = document.getElementById("content")!;
    content.focus({ preventScroll: true }); content.scrollIntoView({ block: "start", behavior: "instant" });
  });
  document.getElementById("pageSelect")!.addEventListener("change", event => goToPage(Number((event.target as HTMLSelectElement).value)));
  wordFile.addEventListener("change", async () => {
    const file = wordFile.files?.[0];
    if (!file || isBusy()) return;
    configureEditor(true);
    const request = ++wordRequest, revision = getRevision();
    setBusy(true); message(msg("editor.wordReading"));
    let text: string;
    try {
      const { importWord } = await import("./word");
      text = await importWord(file);
      if (request !== wordRequest || revision !== getRevision() || activePanel() !== "editorPanel") return;
      importDraft = editor.value = reflowText(text);
      updatePreview(); message(msg("editor.wordReady"));
    } catch (error) { message(() => errorMessage(error), true); return; }
    finally { setBusy(false); wordFile.value = ""; }
    await applyImport(text);
  });
  window.addEventListener("ui-language-changed", () => {
    refreshEditorCopy();
    updateEntry();
    updatePreview();
  });
  restoreDraft(); syncEditor(); refreshEditorCopy(); updateEntry(); updatePreview();
}
