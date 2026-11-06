import { setStatus, errorMessage } from "./util";
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
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let wordRequest = 0;
let warnedStorage = false;
const hasContent = () => !!getCurrentText().trim();

function message(text: string, error = false) {
  const element = document.getElementById("editorMsg")!;
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle("error", error);
}
function updateEntry() {
  entry.textContent = hasContent() ? "Edit page" : "Paste text";
}
function updatePreview() {
  const preview = document.getElementById("editorPreview")!;
  if (mode === "edit") {
    preview.textContent = `Page ${documentModel.index + 1} / ${documentModel.pages.length} · ${documentModel.page.count.toLocaleString()} / 3,000 characters. Changes apply as you type.`;
    return;
  }
  if (editor.value.length > DOCUMENT_LIMIT) {
    preview.textContent = "This article exceeds the 100,000-character limit. Shorten it before importing; nothing will be truncated.";
    return;
  }
  const text = reflowText(editor.value);
  preview.textContent = `${characterCount(text).toLocaleString()} characters after reflow · ${paginate(text).length} page(s). Punctuation, spaces and line breaks all count.`;
}
function configureEditor(importingWord = false) {
  mode = hasContent() && !importingWord ? "edit" : "paste";
  editor.value = mode === "edit" ? documentModel.page.text : importDraft;
  document.getElementById("editorTitle")!.textContent = mode === "edit" ? "Edit the current page." : importingWord ? "Bring a Word article." : "Text in. A few new pages.";
  document.getElementById("editorDescription")!.textContent = mode === "edit"
    ? "Edit or paste directly into this page. Overflow moves to following pages and the editor follows your cursor. Definitions are written as 『meaning』."
    : "Paste with Ctrl / Cmd + V below, or choose a Word document. We never request clipboard access. Importing reflows the article into pages of at most 3,000 characters.";
  document.getElementById("editorLabel")!.textContent = mode === "edit" ? "Page text" : "English article";
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
  if (raw.length > DOCUMENT_LIMIT) return message("Use an article shorter than 100,000 characters. The current article has not changed.", true);
  const text = reflowText(raw);
  if (!text) return message("Paste some text, or choose a readable Word document first.", true);
  if (!(await confirmReplace()) || isBusy()) return;
  render(text); deselectEntry(); openPanel("readPanel", false); message("");
  setStatus(`Article reflowed into ${documentModel.pages.length} page(s). Showing the first page; Save article keeps every page.`, "ok");
}
function onInput() {
  if (isBusy()) return;
  if (mode === "paste") { importDraft = editor.value; updatePreview(); message(""); return; }
  try {
    const result = editCurrentPage(editor.value, editor.selectionEnd);
    editor.value = documentModel.page.text;
    editor.setSelectionRange(result.cursor, result.cursor);
    if (result.changedPage) { editor.scrollTop = 0; message(`Overflow moved forward. Now editing page ${documentModel.index + 1} of ${documentModel.pages.length}.`); }
    else message("");
  } catch (error) { editor.value = documentModel.page.text; message(errorMessage(error), true); }
}
function persistDraft() {
  clearTimeout(draftTimer);
  try {
    if (!getCurrentText()) sessionStorage.removeItem(ARTICLE_DRAFT_KEY);
    else {
      const draft: ArticleDraft = { version: 2, text: getCurrentText(), index: documentModel.index, entry: getDraftEntry(), definitions: definitionViews.snapshot() };
      sessionStorage.setItem(ARTICLE_DRAFT_KEY, JSON.stringify(draft));
    }
  } catch {
    const warning = "Browser storage is unavailable. Use Save article before refreshing or leaving this tab.";
    document.getElementById("draftHint")!.textContent = warning;
    if (!warnedStorage) { warnedStorage = true; setStatus(warning, "error"); }
  }
}
function restoreDraft() {
  try {
    const raw = sessionStorage.getItem(ARTICLE_DRAFT_KEY);
    if (!raw) return;
    const draft = parseArticleDraft(raw);
    if (!draft) { sessionStorage.removeItem(ARTICLE_DRAFT_KEY); return; }
    render(draft.text, draft.index, draft.definitions); restoreEntrySelection(draft.entry);
    setStatus(draft.entry ? "Your article and reading position are restored. Reconnecting to the saved article…"
      : "Your tab's working draft has been restored as an unsaved article. Every page is here; save it to keep it permanently.", "ok");
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
    setBusy(true); message("Reading the Word document on your device…");
    let text: string;
    try {
      const { importWord } = await import("./word");
      text = await importWord(file);
      if (request !== wordRequest || revision !== getRevision() || activePanel() !== "editorPanel") return;
      importDraft = editor.value = reflowText(text);
      updatePreview(); message("Word text is ready. Confirm the replacement, or keep it here for later.");
    } catch (error) { message(errorMessage(error), true); return; }
    finally { setBusy(false); wordFile.value = ""; }
    await applyImport(text);
  });
  restoreDraft(); syncEditor(); updateEntry();
}
