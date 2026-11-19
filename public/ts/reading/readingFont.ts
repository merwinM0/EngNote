import { t } from "../ui/i18n";
import { el } from "../ui/util";
export const READING_FONT_LEVELS = [
  { label: "S", size: 17 }, { label: "M", size: 20 }, { label: "L", size: 23 }, { label: "XL", size: 26 }, { label: "XXL", size: 29 },
] as const;
export function initReadingFont() {
  const picker = document.getElementById("fontSizePicker")!;
  const button = document.getElementById("fontSizeBtn") as HTMLButtonElement;
  const ruler = document.getElementById("fontSizeRuler")!;
  const group = document.getElementById("fontSizeOptions")!;
  let index = 1, open = false;
  const choices = READING_FONT_LEVELS.map((level, i) => {
    const option = el("button", "font-size-option");
    option.type = "button";
    const sample = el("span", "font-size-sample", "Aa");
    sample.setAttribute("aria-hidden", "true"); sample.style.setProperty("--font-preview-size", `${level.size}px`);
    option.append(el("span", "", level.label), sample);
    option.addEventListener("click", () => {
      index = i;
      document.documentElement.style.setProperty("--reading-font-size", `${level.size}px`);
      document.documentElement.style.setProperty("--reading-font-scale", String(level.size / 20));
      label(); setOpen(false, true);
    });
    return option;
  });
  group.append(...choices);
  const label = () => {
    const level = READING_FONT_LEVELS[index]!;
    button.textContent = `Aa · ${level.label}`;
    button.setAttribute("aria-label", t("reader.fontSizeLabel", { size: level.label }));
    choices.forEach((option, i) => option.setAttribute("aria-pressed", String(i === index)));
  };
  function setOpen(next: boolean, focusTrigger = false) {
    if (next === open) return;
    open = next;
    if (focusTrigger) button.focus({ preventScroll: true });
    button.setAttribute("aria-expanded", String(next));
    ruler.inert = !next;
    ruler.setAttribute("aria-hidden", String(!next));
  }
  button.addEventListener("click", () => setOpen(!open));
  picker.addEventListener("keydown", event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); event.preventDefault(); setOpen(false, true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const from = choices.findIndex(option => option === event.target);
    if (from < 0 && !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault(); setOpen(true);
    const focus = from < 0 ? index : event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1
      : (from + (event.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
    choices[focus]!.focus({ preventScroll: true });
  });
  picker.addEventListener("focusout", event => {
    if (!(event.relatedTarget instanceof Node) || !picker.contains(event.relatedTarget)) setOpen(false);
  });
  document.addEventListener("pointerdown", event => {
    if (event.target instanceof Node && !picker.contains(event.target)) setOpen(false);
  });
  document.getElementById("readPanel")!.addEventListener("panel-close", () => setOpen(false));
  window.addEventListener("document-replaced", () => setOpen(false));
  window.addEventListener("ui-language-changed", label);
  label();
}
