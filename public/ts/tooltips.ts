import { t, type MessageKey } from "./i18n";

const descriptions: Record<string, MessageKey> = {
  readBtn: "tool.read", editorBtn: "tool.editor", wordBtn: "tool.import", undoBtn: "tool.undo", redoBtn: "tool.redo",
  formatBtn: "tool.format", translateBtn: "reader.addDefinitionsTitle", defineSelectedBtn: "reader.defineTitle",
  refreshSelectedBtn: "reader.refreshTitle", deleteBtn: "tool.remove", saveBtn: "tool.save",
  exportWordBtn: "reader.exportWordTitle", clearBtn: "tool.clear",
};
export function tooltipPosition(left: number, right: number, bottom: number, width: number, viewport: number) {
  return { left: Math.max(8, Math.min((left + right - width) / 2, viewport - width - 8)), top: bottom + 8 };
}

/** Outside the scrolling row so descriptions remain below the tools, never clipped. */
export function initTooltips(root: HTMLElement) {
  const tooltip = document.createElement("div");
  tooltip.id = "readingToolTooltip"; tooltip.className = "tool-tooltip"; tooltip.role = "tooltip"; tooltip.hidden = true;
  const name = document.createElement("strong"), description = document.createElement("span");
  tooltip.append(name, description); document.body.append(tooltip);
  const events = new AbortController(), options = { signal: events.signal };
  let active: HTMLButtonElement | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  const stopTimer = () => { clearTimeout(timer); timer = undefined; };
  function hide() {
    stopTimer(); tooltip.hidden = true;
    if (active) {
      const ids = (active.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) active.setAttribute("aria-describedby", ids.join(" ")); else active.removeAttribute("aria-describedby");
    }
    active = null;
  }
  function refresh() {
    if (!active) return;
    if (active.hidden || !active.getClientRects().length || document.querySelector("dialog[open]")) { hide(); return; }
    name.textContent = active.getAttribute("aria-label") ?? active.textContent;
    description.textContent = descriptions[active.id] ? t(descriptions[active.id]!) : "";
    const rect = active.getBoundingClientRect();
    const position = tooltipPosition(rect.left, rect.right, rect.bottom, tooltip.getBoundingClientRect().width, window.innerWidth);
    tooltip.style.left = `${position.left}px`; tooltip.style.top = `${position.top}px`;
  }
  function show(button: HTMLButtonElement) {
    stopTimer();
    if (active !== button) {
      hide(); active = button;
      const ids = new Set((button.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
      ids.add(tooltip.id); button.setAttribute("aria-describedby", [...ids].join(" "));
    }
    tooltip.hidden = false; refresh();
  }
  const later = () => { stopTimer(); timer = setTimeout(hide, 120); };
  const buttonAt = (target: EventTarget | null) => {
    const button = target instanceof Element ? target.closest("button") : null;
    return button instanceof HTMLButtonElement && root.contains(button) ? button : null;
  };
  root.addEventListener("pointerover", event => { if (event.pointerType !== "touch") { const button = buttonAt(event.target); if (button) show(button); } }, options);
  root.addEventListener("pointerout", event => {
    const button = buttonAt(event.target), next = event.relatedTarget;
    if (button && next instanceof Node && (button.contains(next) || tooltip.contains(next))) return;
    later();
  }, options);
  root.addEventListener("focusin", event => { const button = buttonAt(event.target); if (button) show(button); }, options);
  root.addEventListener("focusout", later, options);
  root.addEventListener("click", hide, options);
  tooltip.addEventListener("pointerenter", stopTimer, options);
  tooltip.addEventListener("pointerleave", later, options);
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); }, options);
  document.addEventListener("panel-open", hide, { ...options, capture: true });
  window.addEventListener("scroll", hide, { ...options, passive: true, capture: true });
  window.addEventListener("resize", hide, options);
  window.addEventListener("ui-language-changed", refresh, options);
  const observer = new MutationObserver(refresh);
  observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["aria-label", "hidden"] });
  return () => { hide(); observer.disconnect(); events.abort(); tooltip.remove(); };
}
