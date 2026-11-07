import { msg, setUIText } from "./i18n";
import { activeNote } from "./notes";
import type { UIMessage } from "./i18n";

type StatusType = "info" | "ok" | "error";
type Schedule = (action: () => void, delay: number) => () => void;
const scheduleTimeout: Schedule = (action, delay) => {
  const timer = setTimeout(action, delay);
  return () => clearTimeout(timer);
};

/** Each new message gets its own six seconds; canceled callbacks cannot hide its replacement. */
export function createStatusTimer(onExpire: () => void, schedule: Schedule = scheduleTimeout) {
  let cancel: (() => void) | undefined;
  let revision = 0;
  const clear = () => { revision++; cancel?.(); cancel = undefined; };
  return {
    clear,
    restart() {
      clear();
      const current = revision;
      cancel = schedule(() => {
        if (current !== revision) return;
        cancel = undefined;
        onExpire();
      }, 6000);
    },
  };
}

let initialized = false;
let returnFocus: HTMLElement | null = null;
const timer = createStatusTimer(dismissStatus);

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
    document.getElementById("dismissStatusBtn")!.addEventListener("click", dismissStatus);
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
}
