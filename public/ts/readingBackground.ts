import { isReadingBackground, READING_BACKGROUNDS, ReadingBackgroundPreference } from "./readingBackgroundPreference";

export function initReadingBackground() {
  const reader = document.getElementById("readPanel")!;
  const trigger = document.getElementById("backgroundBtn")!;
  const options = document.getElementById("backgroundOptions")!;
  const panel = document.getElementById("backgroundPanel")!;
  const message = document.getElementById("backgroundMessage")!;
  const preference = new ReadingBackgroundPreference(() => localStorage);
  const inputs: HTMLInputElement[] = [];

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
    name.lang = "zh-CN";
    name.textContent = background.name;
    const description = document.createElement("span");
    description.className = "paper-option-description";
    description.textContent = background.description;
    label.append(input, preview, name, description);
    options.append(label);
    inputs.push(input);
  }

  function apply(persisted: boolean) {
    const selected = READING_BACKGROUNDS.find(background => background.id === preference.background)!;
    reader.dataset.paper = selected.id;
    trigger.setAttribute("aria-label", `Background: ${selected.name}`);
    trigger.title = `Reading background: ${selected.name}`;
    for (const input of inputs) {
      input.checked = input.value === selected.id;
      if (input.checked) input.dataset.panelFocus = "";
      else delete input.dataset.panelFocus;
    }
    message.textContent = `Current paper: ${selected.name}. ${persisted ? "Remembered on this browser." : "Browser storage is unavailable; this choice lasts until you leave or reload."}`;
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
  apply(preference.restore());
}
