import { openNote, closeNote, initNotes } from "./notes";

/** Only the reader/editor switch inline; other actions float above the notebook. */
let active = "readPanel";
let returnFocus: HTMLElement | null = null;
let confirmResult: ((accepted: boolean) => void) | null = null;
export const activePanel = () => active;

export function openPanel(id: string, focus = true) {
  const panel = document.getElementById(id);
  if (panel instanceof HTMLDialogElement) { openNote(panel); return; }
  const entry = panel?.dataset.panelEntry ? document.getElementById(panel.dataset.panelEntry) : null;
  if (!panel || !entry) throw new Error(`Unknown notebook panel: ${id}`);
  if (active !== id) {
    const previous = document.getElementById(active)!;
    returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    previous.hidden = true;
    previous.dispatchEvent(new Event("panel-close"));
    active = id;
    panel.hidden = false;
    panel.dispatchEvent(new Event("panel-open"));
  }
  for (const region of document.querySelectorAll<HTMLElement>("[data-panel-entry]")) {
    document.getElementById(region.dataset.panelEntry!)?.setAttribute(region.id === "readPanel" ? "aria-pressed" : "aria-expanded", String(region.id === id));
  }
  panel.dispatchEvent(new Event("panel-activate"));
  if (focus) {
    const field = Array.from(panel.querySelectorAll<HTMLElement>("[data-panel-focus]")).find(element => !element.closest("[hidden]"));
    (field ?? entry).focus({ preventScroll: true });
    panel.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
}

export function closePanel(id: string) {
  if (document.getElementById(id) instanceof HTMLDialogElement) { closeNote(id); return; }
  if (active !== id) return;
  const target = returnFocus;
  openPanel("readPanel", false);
  if (target && target.isConnected && !target.closest("[hidden]")) target.focus({ preventScroll: true });
  else document.getElementById("readBtn")?.focus({ preventScroll: true });
}

export function confirmInPanel(message: string, action = "Continue"): Promise<boolean> {
  confirmResult?.(false);
  confirmResult = null;
  document.getElementById("confirmMessage")!.textContent = message;
  document.getElementById("acceptChangeBtn")!.textContent = action;
  openPanel("confirmPanel");
  return new Promise(resolve => { confirmResult = resolve; });
}

export function initPanels() {
  initNotes();
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const close = event.target.closest<HTMLElement>("[data-close-panel]");
    if (close) closePanel(active);
    const trigger = event.target.closest<HTMLElement>("[data-open-panel]");
    if (trigger && !(trigger instanceof HTMLButtonElement && trigger.disabled)) openPanel(trigger.dataset.openPanel!);
  });
  document.getElementById("confirmPanel")!.addEventListener("panel-close", () => {
    confirmResult?.(false);
    confirmResult = null;
  });
  document.getElementById("acceptChangeBtn")!.addEventListener("click", () => {
    const resolve = confirmResult;
    confirmResult = null;
    closePanel("confirmPanel");
    resolve?.(true);
  });
}
