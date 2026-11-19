import { setStatus } from "./ui/util";
import { initUILanguage, msg } from "./ui/i18n";
import { content, clearBtn, translateBtn, setDeleteMode, isTranslateMode, isDeleteMode, isBusy, render, restoreHistory, isSelectingImmersiveRange, pressImmersiveButton, exitImmersion, chooseImmersiveWord, toggleImmersiveDefinition, isDefinitionImmersed } from "./reading/state";
import { initAISettings } from "./ai/aiSettings";
import { initDefinitionModeControl } from "./definitions/definitionModeControl";
import { onFormat } from "./editor/format";
import { cancelDefinitions, onTranslateClick, onTermClick, translateSelected } from "./definitions/translate";
import { handleDeleteNote, toggleDeleteMode } from "./definitions/deleteNote";
import { refreshList, initDb, deselectEntry, confirmReplace } from "./articles/db";
import { initAuth } from "./account/auth";
import { initEditor } from "./editor/editor";
import { activePanel, closePanel, initPanels, openPanel } from "./ui/panels";
import { hasOpenNote } from "./ui/notes";
import { initCollectionCanvas } from "./articles/collectionCanvas";
import { toggleDefinitionLanguage } from "./definitions/definitionLanguage";
import { initReadingBackground } from "./reading/readingBackground";
import { initWordExport } from "./word/exportWord";
import { initReadingToolbar } from "./reading/readingToolbar";
import { initReadingSearch } from "./search/readingSearch";
import { initDefinitionList } from "./vocabulary/definitionList";
import { initReadingFont } from "./reading/readingFont";

document.getElementById("undoBtn")!.addEventListener("click", () => restoreHistory());
document.getElementById("redoBtn")!.addEventListener("click", () => restoreHistory(true));
// Leave paste/title/key fields to native undo. The live page editor uses document history.
document.addEventListener("keydown", event => {
  if (hasOpenNote() || !(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement && (target.id !== "editorText" || !document.getElementById("editorApplyBtn")!.hidden)) return;
  if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") {
    event.preventDefault(); restoreHistory(event.shiftKey || event.key.toLowerCase() === "y");
  }
});

clearBtn.addEventListener("click", async () => {
  if (isBusy() || !(await confirmReplace(msg("confirm.clearArticle"), msg("confirm.clearMessage"))) || isBusy()) return;
  render(""); deselectEntry(); openPanel("readPanel", false);
  setStatus(msg("status.freshArticle"), "ok");
});
function activateTerm(target: EventTarget | null) {
  if (isBusy() || !(target instanceof Element)) return;
  if (isSelectingImmersiveRange()) {
    const word = target.closest<HTMLElement>(".term");
    const result = word ? chooseImmersiveWord(Number(word.dataset.wordId)) : null;
    if (result === "entered" || result === "exited") setStatus(msg(result === "entered" ? "reader.immersiveEntered" : "reader.immersiveExited"));
    return;
  }
  const trigger = target.closest<HTMLElement>('.immersive-trigger[aria-expanded]');
  if (trigger) { toggleImmersiveDefinition(trigger); return; }
  const term = target.closest<HTMLElement>(".term, .note");
  if (!term) return;
  if (term.classList.contains("note") && isDefinitionImmersed(Number(term.dataset.definitionId))) return;
  if (isDeleteMode() && term.classList.contains("note")) { handleDeleteNote(term); return; }
  if (isTranslateMode() && term.classList.contains("term")) onTermClick(Number(term.dataset.wordId));
  else if (!isTranslateMode() && !isDeleteMode() && term.classList.contains("note")) void toggleDefinitionLanguage(term);
}
content.addEventListener("click", event => activateTerm(event.target));
content.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target instanceof Element && event.target.matches(':is(.term, .note, .immersive-trigger)[role="button"]')) {
    event.preventDefault(); if (!event.repeat) activateTerm(event.target);
  }
});
function resetReadingTools() {
  const wasInteractive = isTranslateMode() || isDeleteMode();
  cancelDefinitions(false);
  setDeleteMode(false);
  if (wasInteractive) setStatus("");
  if (document.activeElement instanceof Element && document.activeElement.matches(".term, .note, .immersive-trigger")) content.focus({ preventScroll: true });
}
const readPanel = document.getElementById("readPanel")!;
function resetReadingMode() { resetReadingTools(); exitImmersion(); }
readPanel.addEventListener("panel-activate", resetReadingMode);
readPanel.addEventListener("panel-close", resetReadingMode);
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || hasOpenNote()) return;
  if (activePanel() !== "readPanel") closePanel(activePanel());
  else if (isSelectingImmersiveRange()) {
    exitImmersion(true);
    document.getElementById("immersiveBtn")!.focus({ preventScroll: true });
  } else resetReadingMode();
});
function showReadForTool() { if (activePanel() !== "readPanel") openPanel("readPanel", false); }
document.getElementById("immersiveBtn")!.addEventListener("click", () => {
  if (isBusy()) return;
  showReadForTool(); resetReadingTools();
  const result = pressImmersiveButton();
  if (result === "full" || result === "exited") setStatus(msg(result === "full" ? "reader.immersiveFull" : "reader.immersiveAllExited"));
});
document.getElementById("formatBtn")!.addEventListener("click", () => { if (!isBusy()) { showReadForTool(); resetReadingMode(); void onFormat(); } });
translateBtn.addEventListener("click", () => {
  if (!isBusy()) { showReadForTool(); exitImmersion(); onTranslateClick(); }
});
document.getElementById("defineSelectedBtn")!.addEventListener("click", () => { void translateSelected(); });
document.getElementById("refreshSelectedBtn")!.addEventListener("click", () => { void translateSelected(true); });
document.getElementById("deleteBtn")!.addEventListener("click", () => { if (!isBusy()) { showReadForTool(); exitImmersion(); toggleDeleteMode(); } });
initUILanguage(); initPanels(); initReadingFont(); initDefinitionList(); initReadingToolbar(); initReadingSearch(); initDefinitionModeControl(); initReadingBackground(); initCollectionCanvas(); initAISettings(); initDb(); initAuth(); render(""); initEditor(); initWordExport(); void refreshList();
