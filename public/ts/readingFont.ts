import { t } from "./i18n";
export const READING_FONT_LEVELS = [
  { label: "S", size: 17 }, { label: "M", size: 20 }, { label: "L", size: 23 }, { label: "XL", size: 26 }, { label: "XXL", size: 29 },
] as const;
export function initReadingFont() {
  const button = document.getElementById("fontSizeBtn") as HTMLButtonElement;
  let index = 1;
  const label = () => {
    const level = READING_FONT_LEVELS[index]!;
    button.textContent = `Aa · ${level.label}`;
    button.setAttribute("aria-label", t("reader.fontSizeLabel", { size: level.label }));
  };
  button.addEventListener("click", () => {
    index = (index + 1) % READING_FONT_LEVELS.length;
    const level = READING_FONT_LEVELS[index]!;
    document.documentElement.style.setProperty("--reading-font-size", `${level.size}px`);
    document.documentElement.style.setProperty("--reading-font-scale", String(level.size / 20));
    label();
  });
  window.addEventListener("ui-language-changed", label);
  label();
}
