import { msg, setUIText, t } from "./i18n";
import { createStatusTimer, STATUS_DURATION } from "./statusTimer";
export { createStatusTimer } from "./statusTimer";
import { activeNote } from "./notes";
import type { UIMessage } from "./i18n";

type StatusType = "info" | "ok" | "error";
let initialized = false;
let returnFocus: HTMLElement | null = null;
const pauses = new Set<string>();
function updateProgress(elapsed: number, paused: boolean) {
  const progress = document.getElementById("statusProgress");
  if (!progress) return;
  const percent = Math.min(100, elapsed / STATUS_DURATION * 100);
  progress.style.setProperty("--progress", `${percent}%`);
  progress.setAttribute("aria-valuenow", String(Math.floor(percent)));
  progress.setAttribute("aria-valuetext", t(paused ? "notice.paused" : "notice.remaining", { seconds: Math.ceil((STATUS_DURATION - elapsed) / 1000) }));
}
const timer = createStatusTimer(dismissStatus, undefined, undefined, updateProgress);
function pauseFor(reason: string, on: boolean) {
  if (on) pauses.add(reason); else pauses.delete(reason);
  if (pauses.size) timer.pause(); else timer.resume();
}

/** Popovers outside a modal are inert: keep the note and announcer in the active dialog. */
function syncStatusHost() {
  const bar = document.getElementById("statusBar")!;
  const host = activeNote() ?? document.body;
  if (bar.parentElement === host) return;
  const focused = bar.contains(document.activeElement);
  bar.hidePopover?.();
  host.append(bar, document.getElementById("statusAnnouncer")!);
  if (!bar.hidden) bar.showPopover?.();
  if (focused && !bar.hidden) document.getElementById("dismissStatusBtn")!.focus({ preventScroll: true });
}

function dismissStatus() {
  timer.clear();
  pauses.clear();
  const bar = document.getElementById("statusBar");
  if (!bar) return;
  const focused = bar.contains(document.activeElement);
  bar.hidePopover?.();
  bar.hidden = true;
  for (const id of ["statusText", "statusAnnouncer", "statusHeading"]) setUIText(document.getElementById(id)!, "");
  if (focused) {
    const note = activeNote();
    const visible = (element: HTMLElement) => !!element.getClientRects().length && !element.matches(":disabled");
    const available = returnFocus?.isConnected && visible(returnFocus) && returnFocus !== document.body && (!note || note.contains(returnFocus));
    const fallback = note ? Array.from(note.querySelectorAll<HTMLElement>("[data-panel-focus], button, input, textarea, select")).find(visible) : document.getElementById("content");
    (available ? returnFocus : fallback)?.focus({ preventScroll: true });
  }
  returnFocus = null;
}

export function setStatus(message: UIMessage, type: StatusType = "info") {
  const bar = document.getElementById("statusBar")!;
  if (!initialized) {
    initialized = true;
    bar.addEventListener("click", dismissStatus);
    bar.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") pauseFor("hover", true); });
    bar.addEventListener("pointerleave", () => pauseFor("hover", false));
    bar.addEventListener("focusin", () => pauseFor("focus", true));
    bar.addEventListener("focusout", event => { if (!(event.relatedTarget instanceof Node) || !bar.contains(event.relatedTarget)) pauseFor("focus", false); });
    document.addEventListener("visibilitychange", () => pauseFor("hidden", document.hidden));
    window.addEventListener("ui-language-changed", () => updateProgress(STATUS_DURATION - timer.remaining, pauses.size > 0));
    window.addEventListener("pagehide", dismissStatus);
    document.addEventListener("panel-open", syncStatusHost, true);
    document.addEventListener("panel-close", syncStatusHost, true);
  }
  syncStatusHost();
  const text = document.getElementById("statusText")!;
  if (!setUIText(text, message).trim()) { dismissStatus(); return; }
  const focused = bar.contains(document.activeElement);
  if (!focused) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  bar.dataset.type = type;
  setUIText(document.getElementById("statusHeading")!, msg(type === "ok" ? "notice.ok" : type === "error" ? "notice.error" : "notice.info"));
  // A persistent live region announces even when the visual popover was hidden.
  setUIText(document.getElementById("statusAnnouncer")!, message);
  bar.hidden = false;
  // Reopen in the top layer so feedback also remains clickable above a modal note.
  bar.hidePopover?.();
  bar.showPopover?.();
  if (focused) document.getElementById("dismissStatusBtn")!.focus({ preventScroll: true });
  timer.restart();
  pauseFor("hover", bar.matches(":hover"));
  pauseFor("focus", bar.contains(document.activeElement));
  pauseFor("hidden", document.hidden);
}
