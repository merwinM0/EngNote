import { definitionModePreference, type DefinitionMode } from "./definitionMode";
import { t } from "../ui/i18n";
import { setToolLabel } from "../ui/util";

const names = { general: "ai.modeGeneral", context: "ai.modeContext", article: "ai.modeArticle" } as const;
const hints = { general: "ai.modeGeneralHint", context: "ai.modeContextHint", article: "ai.modeArticleHint" } as const;

export function definitionModePresentation(mode: DefinitionMode, stored = true) {
  return {
    caption: t(names[mode]),
    label: t("ai.modeLabel", { current: t(names[mode]) }),
    description: t(hints[mode]) + (stored ? "" : t("ai.definitionStorage")),
  };
}

/** A reading preference, independent of the AI key draft and any active request. */
export function initDefinitionModeControl() {
  const button = document.getElementById("definitionModeBtn") as HTMLButtonElement;
  const hint = document.getElementById("definitionModeHint")!;
  let stored = definitionModePreference.restore();
  function update() {
    const view = definitionModePresentation(definitionModePreference.mode, stored);
    setToolLabel(button, view.caption);
    button.setAttribute("aria-label", view.label);
    button.dataset.toolDescription = hint.textContent = view.description;
  }
  button.addEventListener("click", () => { stored = definitionModePreference.cycle(); update(); });
  window.addEventListener("ui-language-changed", update);
  update();
}
