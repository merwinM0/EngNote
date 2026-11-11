import { setStatus } from "./util";
import { initUILanguage, msg } from "./i18n";
import { content, clearBtn, translateBtn, setDeleteMode, isTranslateMode, isDeleteMode, isBusy, render, restoreHistory } from "./state";
import { initAISettings } from "./aiSettings";
import { initDefinitionModeControl } from "./definitionModeControl";
import { onFormat } from "./format";
import { cancelDefinitions, onTranslateClick, onTermClick, translateSelected } from "./translate";
import { handleDeleteNote, toggleDeleteMode } from "./deleteNote";
import { refreshList, initDb, deselectEntry, confirmReplace } from "./db";
import { initAuth } from "./auth";
import { initEditor } from "./editor";
import { activePanel, closePanel, initPanels, openPanel } from "./panels";
import { hasOpenNote } from "./notes";
import { initCollectionCanvas } from "./collectionCanvas";
import { toggleDefinitionLanguage } from "./definitionLanguage";
import { initReadingBackground } from "./readingBackground";
import { initWordExport } from "./exportWord";
import { initReadingToolbar } from "./readingToolbar";
import { initReadingSearch } from "./readingSearch";
import { initDefinitionList } from "./definitionList";
import { initReadingFont } from "./readingFont";

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
  const term = target.closest<HTMLElement>(".term, .note");
  if (!term) return;
  if (isDeleteMode() && term.classList.contains("note")) { handleDeleteNote(term); return; }
  if (isTranslateMode() && term.classList.contains("term")) onTermClick(Number(term.dataset.wordId));
  else if (!isTranslateMode() && !isDeleteMode() && term.classList.contains("note")) void toggleDefinitionLanguage(term);
}
content.addEventListener("click", event => activateTerm(event.target));
content.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target instanceof Element && event.target.matches(".term, .note")) { event.preventDefault(); activateTerm(event.target); }
});
function resetReadingMode() {
  const wasInteractive = isTranslateMode() || isDeleteMode();
  cancelDefinitions(false);
  setDeleteMode(false);
  if (wasInteractive) setStatus("");
  if (document.activeElement instanceof Element && document.activeElement.matches(".term, .note")) content.focus({ preventScroll: true });
}
const readPanel = document.getElementById("readPanel")!;
readPanel.addEventListener("panel-activate", () => resetReadingMode());
readPanel.addEventListener("panel-close", () => resetReadingMode());
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || hasOpenNote()) return;
  if (activePanel() !== "readPanel") closePanel(activePanel());
  else resetReadingMode();
});
function showReadForTool() { if (activePanel() !== "readPanel") openPanel("readPanel", false); }
document.getElementById("formatBtn")!.addEventListener("click", () => { if (!isBusy()) { showReadForTool(); resetReadingMode(); void onFormat(); } });
translateBtn.addEventListener("click", () => {
  if (!isBusy()) { showReadForTool(); onTranslateClick(); }
});
document.getElementById("defineSelectedBtn")!.addEventListener("click", () => { void translateSelected(); });
document.getElementById("refreshSelectedBtn")!.addEventListener("click", () => { void translateSelected(true); });
document.getElementById("deleteBtn")!.addEventListener("click", () => { if (!isBusy()) { showReadForTool(); toggleDeleteMode(); } });
initUILanguage(); initPanels(); initReadingFont(); initDefinitionList(); initReadingToolbar(); initReadingSearch(); initDefinitionModeControl(); initReadingBackground(); initCollectionCanvas(); initAISettings(); initDb(); initAuth(); render(""); initEditor(); initWordExport(); void refreshList();
