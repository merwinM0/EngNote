import { t } from "../ui/i18n";

export const READING_FONT_LEVELS = [
  { label: "S", size: 17 }, { label: "M", size: 20 }, { label: "L", size: 23 }, { label: "XL", size: 26 }, { label: "XXL", size: 29 },
] as const;
const baseSize = READING_FONT_LEVELS[1].size;

export function initReadingFont() {
  const button = document.getElementById("fontSizeBtn") as HTMLButtonElement;
  // Match the reader's narrow layout at load time; resizing must not override manual choices.
  let index = window.matchMedia("(max-width: 700px)").matches ? 0 : 2;
  function updateLabel() {
    const { label } = READING_FONT_LEVELS[index]!;
    button.textContent = label;
    button.setAttribute("aria-label", t("reader.fontSizeLabel", { size: label }));
  }
  function applySize() {
    const { size } = READING_FONT_LEVELS[index]!;
    document.documentElement.style.setProperty("--reading-font-size", `${size}px`);
    document.documentElement.style.setProperty("--reading-font-scale", String(size / baseSize));
    updateLabel();
  }
  button.addEventListener("click", () => {
    index = (index + 1) % READING_FONT_LEVELS.length;
    applySize();
  });
  window.addEventListener("ui-language-changed", updateLabel);
  applySize();
}
