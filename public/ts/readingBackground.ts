import { isReadingBackground, isReadingPaperColor, READING_BACKGROUNDS, READING_PAPER_COLORS, ReadingBackgroundPreference } from "./readingBackgroundPreference";
import { t, uiLanguage } from "./i18n";

export function initReadingBackground() {
  const paper = document.getElementById("content")!;
  const trigger = document.getElementById("backgroundBtn")!;
  const options = document.getElementById("backgroundOptions")!;
  const panel = document.getElementById("backgroundPanel")!;
  const message = document.getElementById("backgroundMessage")!;
  const preference = new ReadingBackgroundPreference(() => localStorage);
  const inputs: HTMLInputElement[] = [];
  const colorField = document.getElementById("paperColorField") as HTMLFieldSetElement;
  const colorOptions = document.getElementById("paperColorOptions")!;
  const colorInputs: HTMLInputElement[] = [];
  const colorLabels: Array<{ id: typeof READING_PAPER_COLORS[number]; text: HTMLElement }> = [];
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

  for (const id of READING_PAPER_COLORS) {
    const label = document.createElement("label"); label.className = "paper-color-option";
    const input = document.createElement("input"); input.type = "radio"; input.name = "readingPaperColor"; input.value = id;
    const swatch = document.createElement("span"); swatch.className = "paper-color-swatch";
    swatch.style.backgroundColor = `var(--paper-${id})`; swatch.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    label.append(input, swatch, text); colorOptions.append(label);
    colorInputs.push(input); colorLabels.push({ id, text });
  }

  function refreshLabels() {
    const language = uiLanguage();
    for (const { id, text } of colorLabels) text.textContent = t(`paperColor.${id}`);
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
    const name = t(`background.${selected.id}.name`) + (selected.id === "original" ? "" : ` · ${t(`paperColor.${preference.color}`)}`);
    paper.dataset.paper = selected.id;
    paper.dataset.paperColor = preference.color;
    for (const preview of options.querySelectorAll<HTMLElement>('.paper-preview:not([data-paper="original"])')) preview.dataset.paperColor = preference.color;
    colorField.disabled = selected.id === "original";
    for (const input of colorInputs) input.checked = input.value === preference.color;
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
  colorOptions.addEventListener("change", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.checked || !isReadingPaperColor(input.value) || preference.background === "original") return;
    apply(preference.selectColor(input.value));
  });
  window.addEventListener("ui-language-changed", () => { refreshLabels(); apply(lastPersisted); });
  refreshLabels(); apply(preference.restore());
}
