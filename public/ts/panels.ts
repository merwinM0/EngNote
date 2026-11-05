import { openNote, closeNote, initNotes } from "./notes";

/** Article tools stay inline; account and AI settings open independent modal notes. */
let active = "readPanel";
let returnFocus: HTMLElement | null = null;
let confirmResult: ((accepted: boolean) => void) | null = null;
export const activePanel = () => active;

export function openPanel(id: string, focus = true) {
  const panel = document.getElementById(id);
  if (panel instanceof HTMLDialogElement) { openNote(panel); return; }
  const tab = document.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="${id}"]`);
  const entry = panel?.dataset.panelEntry ? document.getElementById(panel.dataset.panelEntry) : null;
  if (!panel || (!tab && !entry)) throw new Error(`Unknown notebook panel: ${id}`);
  if (active !== id) {
    const previous = document.getElementById(active)!;
    returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    previous.hidden = true;
    previous.dispatchEvent(new Event("panel-close"));
    if (previous.hasAttribute("data-transient")) {
      document.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="${active}"]`)!.hidden = true;
    }
    active = id;
    if (tab) tab.hidden = false;
    panel.hidden = false;
    panel.dispatchEvent(new Event("panel-open"));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[role='tab'][aria-controls]")) {
    const selected = button === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const region of document.querySelectorAll<HTMLElement>("[data-panel-entry]")) {
    document.getElementById(region.dataset.panelEntry!)?.setAttribute(region.id === "readPanel" ? "aria-pressed" : "aria-expanded", String(region.id === id));
  }
  document.getElementById("notebookTabs")!.hidden = !document.querySelector("#notebookTabs [role='tab']:not([hidden])");
  panel.dispatchEvent(new Event("panel-activate"));
  if (focus) {
    const field = Array.from(panel.querySelectorAll<HTMLElement>("[data-panel-focus]")).find(element => !element.closest("[hidden]"));
    (field ?? tab ?? entry)!.focus({ preventScroll: true });
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
  const tabs = document.getElementById("notebookTabs")!;
  tabs.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const tab = event.target.closest<HTMLButtonElement>("[role='tab']");
    if (tab) openPanel(tab.getAttribute("aria-controls")!, false);
  });
  tabs.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>("[role='tab']:not([hidden])"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    const target = buttons[next]!;
    openPanel(target.getAttribute("aria-controls")!, false);
    target.focus();
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
