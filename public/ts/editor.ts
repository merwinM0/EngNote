import { api, setStatus, errorMessage, setToolLabel } from "./util";
import { msg, setUIText, t } from "./i18n";
import type { UIMessage } from "./i18n";
import { reflowText } from "./text";
import { characterCount, DOCUMENT_LIMIT, paginate } from "./pagination";
import { definitionViews, documentModel, editCurrentPage, getCurrentText, getRevision, goToPage, isBusy, render, setBusy } from "./state";
import { confirmReplace, deselectEntry, getDraftEntry, restoreEntrySelection } from "./db";
import type { ArticleDraft } from "./articleDraft";
import { ArticleWorkspaces } from "./articleWorkspace";
import { getEmail, isSessionReady } from "./auth";
import { activePanel, openPanel, confirmInPanel } from "./panels";

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
const workspaces = new ArticleWorkspaces(() => sessionStorage);
let workspaceAccount: string | null | undefined;
let switchingWorkspace = false;
let workspaceRequest = 0;

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
function currentDraft(): ArticleDraft | null {
  return getCurrentText() ? { version: 2, text: getCurrentText(), index: documentModel.index, entry: getDraftEntry(), definitions: definitionViews.snapshot(), offset: documentModel.page.start } : null;
}
function persistDraft() {
  clearTimeout(draftTimer);
  if (switchingWorkspace || workspaceAccount === undefined && !getCurrentText()) return;
  if (!workspaces.write(workspaceAccount ?? null, currentDraft())) {
    document.getElementById("draftHint")!.textContent = t("editor.storageWarning");
    if (!warnedStorage) { warnedStorage = true; setStatus(msg("editor.storageWarning"), "error"); }
  }
}
async function restoreWorkspace() {
  const account = getEmail();
  if (workspaceAccount === account) return;
  const request = ++workspaceRequest, initial = workspaceAccount === undefined;
  const previousAccount = workspaceAccount ?? null, previousDraft = currentDraft();
  persistDraft();
  switchingWorkspace = true;
  workspaceAccount = account;
  importDraft = ""; editor.value = "";
  render(""); deselectEntry();
  let draft = workspaces.read(account);
  try {
    if (!draft) {
      const legacy = workspaces.legacy();
      // Old saved drafts had no account scope: authorize the ID before displaying any text.
      if (legacy?.entry && account) {
        try {
          await api(`/api/entries/${legacy.entry.id}`);
          if (request !== workspaceRequest || getEmail() !== account) return;
          draft = legacy;
        } catch { /* Leave unverified legacy data quarantined, not assigned to another user. */ }
      } else if (legacy && !legacy.entry) {
        workspaces.write(null, legacy);
        draft = legacy;
      }
      if (draft && workspaces.write(account, draft)) workspaces.removeLegacy();
    }
    const guestDraft = previousAccount === null && account ? previousDraft ?? (initial && draft ? null : workspaces.read(null)) : null;
    if (guestDraft?.text) {
      const same = draft?.text === guestDraft.text && JSON.stringify(draft.definitions) === JSON.stringify(guestDraft.definitions);
      const useGuest = !draft || same || await confirmInPanel(msg("confirm.replaceWorkspace"), msg("confirm.keepLocalDraft"), msg("confirm.useAccountDraft"));
      if (request !== workspaceRequest || getEmail() !== account) return;
      if (useGuest) draft = { ...guestDraft, entry: null };
      else window.dispatchEvent(new Event("save-login-cancelled"));
    }
    if (request !== workspaceRequest || getEmail() !== account) return;
    if (draft) {
      const offset = draft.offset ?? paginate(draft.text, 3000)[Math.max(0, Math.min(draft.index, paginate(draft.text, 3000).length - 1))]!.start;
      render(draft.text, 0, draft.definitions);
      goToPage(documentModel.locate(offset)); restoreEntrySelection(draft.entry);
      setStatus(msg(draft.entry ? "editor.draftRestoredSaved" : "editor.draftRestoredUnsaved"), "ok");
    }
  } finally {
    if (request === workspaceRequest && getEmail() === account) {
      switchingWorkspace = false;
      configureEditor();
      persistDraft();
      window.dispatchEvent(new Event("workspace-ready"));
    }
  }
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
    syncEditor(); clearTimeout(draftTimer); if (!switchingWorkspace) draftTimer = setTimeout(persistDraft, 200);
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
    finally { if (revision === getRevision()) setBusy(false); wordFile.value = ""; }
    await applyImport(text);
  });
  window.addEventListener("ui-language-changed", () => {
    refreshEditorCopy();
    updateEntry();
    updatePreview();
  });
  window.addEventListener("session-changed", () => { queueMicrotask(() => { void restoreWorkspace(); }); });
  if (isSessionReady()) void restoreWorkspace();
  syncEditor(); refreshEditorCopy(); updateEntry(); updatePreview();
}
