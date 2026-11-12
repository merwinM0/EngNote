import { initTooltips } from "../ui/tooltips";
import { t } from "../ui/i18n";

/** Pin without reparenting controls or shifting the article; return restores the inline bar. */
export function initReadingToolbar() {
  const anchor = document.getElementById("toolbarAnchor")!;
  const slot = document.getElementById("toolbarSlot")!;
  const shell = document.getElementById("readingToolbar")!;
  const tools = document.getElementById("toolButtons")!;
  const toggle = document.getElementById("toolbarToggle") as HTMLButtonElement;
  const reader = document.getElementById("readPanel")!;
  const events = new AbortController();
  let docked = false, collapsed = false, frame = 0;
  function label() {
    const text = t(collapsed ? "reader.expandTools" : "reader.collapseTools");
    toggle.setAttribute("aria-label", text);
    toggle.setAttribute("aria-expanded", String(!collapsed));
  }
  function update() {
    frame = 0;
    const rect = slot.getBoundingClientRect();
    slot.style.setProperty("--toolbar-left", `${rect.left}px`);
    slot.style.setProperty("--toolbar-width", `${rect.width}px`);
    if (!docked) slot.style.setProperty("--toolbar-height", `${shell.getBoundingClientRect().height}px`);
    const next = !reader.hidden && anchor.getBoundingClientRect().top < 8;
    if (next !== docked) {
      docked = next;
      if (!docked) {
        collapsed = false; tools.hidden = false;
        if (document.activeElement === toggle) document.getElementById("readBtn")!.focus({ preventScroll: true });
      }
      toggle.hidden = !docked;
      slot.classList.toggle("is-docked", docked);
      slot.classList.toggle("is-collapsed", collapsed);
      label();
    }
  }
  const refresh = () => { if (!frame) frame = requestAnimationFrame(update); };
  toggle.addEventListener("click", () => {
    if (!docked) return;
    collapsed = !collapsed;
    if (collapsed && tools.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    tools.hidden = collapsed;
    slot.classList.toggle("is-collapsed", collapsed); label();
  }, { signal: events.signal });
  window.addEventListener("scroll", refresh, { passive: true, signal: events.signal });
  window.addEventListener("resize", refresh, { signal: events.signal });
  window.addEventListener("pageshow", refresh, { signal: events.signal });
  window.addEventListener("ui-language-changed", label, { signal: events.signal });
  document.addEventListener("panel-open", refresh, { capture: true, signal: events.signal });
  document.addEventListener("panel-close", refresh, { capture: true, signal: events.signal });
  const observer = new ResizeObserver(refresh);
  observer.observe(slot); observer.observe(tools);
  update();
  const disposeTooltips = initTooltips(shell);
  return () => { disposeTooltips(); events.abort(); observer.disconnect(); cancelAnimationFrame(frame); };
}
