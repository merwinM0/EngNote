import { definitionViews, definitionViewChanged, isBusy, isDeleteMode, isTranslateMode } from "./state";
import { setStatus } from "./util";
import { msg } from "./i18n";

/** Switching is local and synchronous: both meanings were returned by the dictionary request. */
export function toggleDefinitionLanguage(element: HTMLElement) {
  if (isBusy() || isTranslateMode() || isDeleteMode()) return;
  const definition = definitionViews.get(Number(element.dataset.definitionId));
  if (!definition) return;
  if (!definition.chinese) {
    setStatus(msg("status.oldNoteEnglishOnly"));
    return;
  }
  definition.language = definition.language === "zh" ? "en" : "zh";
  definitionViewChanged();
}
