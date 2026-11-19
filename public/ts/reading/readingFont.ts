import { t } from "../ui/i18n";

export const READING_FONT_LEVELS = [
  { label: "S", size: 17 }, { label: "M", size: 20 }, { label: "L", size: 23 }, { label: "XL", size: 26 }, { label: "XXL", size: 29 },
] as const;
const defaultIndex = 1;

export function initReadingFont() {
  const button = document.getElementById("fontSizeBtn") as HTMLButtonElement;
  let index = defaultIndex;
  function updateLabel() {
    const { label } = READING_FONT_LEVELS[index]!;
    button.textContent = label;
    button.setAttribute("aria-label", t("reader.fontSizeLabel", { size: label }));
  }
  button.addEventListener("click", () => {
    index = (index + 1) % READING_FONT_LEVELS.length;
    const { size } = READING_FONT_LEVELS[index]!;
    document.documentElement.style.setProperty("--reading-font-size", `${size}px`);
    document.documentElement.style.setProperty("--reading-font-scale", String(size / READING_FONT_LEVELS[defaultIndex].size));
    updateLabel();
  });
  window.addEventListener("ui-language-changed", updateLabel);
  updateLabel();
}
