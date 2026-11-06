import { isReadingBackground, READING_BACKGROUNDS, ReadingBackgroundPreference } from "./readingBackgroundPreference";
import { t, uiLanguage } from "./i18n";

export function initReadingBackground() {
  const reader = document.getElementById("readPanel")!;
  const trigger = document.getElementById("backgroundBtn")!;
  const options = document.getElementById("backgroundOptions")!;
  const panel = document.getElementById("backgroundPanel")!;
  const message = document.getElementById("backgroundMessage")!;
  const preference = new ReadingBackgroundPreference(() => localStorage);
  const inputs: HTMLInputElement[] = [];
  const labels: Array<{ background: typeof READING_BACKGROUNDS[number]; name: HTMLElement; description: HTMLElement }> = [];
  let lastPersisted = false;

  for (const background of READING_BACKGROUNDS) {
    const label = document.createElement("label");
    label.className = "paper-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "readingBackground";
    input.value = background.id;
    const preview = document.createElement("span");
    preview.className = "paper-preview paper-surface";
    preview.dataset.paper = background.id;
    preview.setAttribute("aria-hidden", "true");
    preview.textContent = "Aa";
    const name = document.createElement("span");
    name.className = "paper-option-name";
    const description = document.createElement("span");
    description.className = "paper-option-description";
    label.append(input, preview, name, description);
    options.append(label);
    inputs.push(input);
    labels.push({ background, name, description });
  }

  function refreshLabels() {
    const language = uiLanguage();
    for (const { background, name, description } of labels) {
      name.lang = language === "zh" ? "zh-Hans" : "en";
      name.textContent = t(`background.${background.id}.name`);
      description.lang = language === "zh" ? "zh-Hans" : "en";
      description.textContent = t(`background.${background.id}.description`);
    }
  }

  function apply(persisted: boolean) {
    lastPersisted = persisted;
    const selected = READING_BACKGROUNDS.find(background => background.id === preference.background)!;
    const name = t(`background.${selected.id}.name`);
    reader.dataset.paper = selected.id;
    trigger.setAttribute("aria-label", t("reader.backgroundLabel", { name }));
    trigger.title = t("reader.backgroundTitle", { name });
    for (const input of inputs) {
      input.checked = input.value === selected.id;
      if (input.checked) input.dataset.panelFocus = "";
      else delete input.dataset.panelFocus;
    }
    message.textContent = t("status.backgroundCurrent", {
      name, remembered: t(persisted ? "status.backgroundRemembered" : "status.backgroundUnavailable"),
    });
  }

  panel.addEventListener("panel-open", () => {
    // Long mobile dialogs must keep the initially focused choice in view.
    requestAnimationFrame(() => {
      if (panel.hasAttribute("open")) inputs.find(input => input.checked)?.scrollIntoView({ block: "nearest" });
    });
  });
  options.addEventListener("change", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.checked || !isReadingBackground(input.value)) return;
    apply(preference.select(input.value));
  });
  window.addEventListener("ui-language-changed", () => { refreshLabels(); apply(lastPersisted); });
  refreshLabels(); apply(preference.restore());
}
