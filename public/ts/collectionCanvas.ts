import { boardColumns, clampBoardScale, fitBoard, MAX_BOARD_SCALE, MIN_BOARD_SCALE, revealBoardRect, zoomBoardAt } from "./boardGeometry";
import type { BoardView, Point } from "./boardGeometry";

/** The frame stays pinned; only the article world is translated and scaled. */
export function initCollectionCanvas(): () => void {
  const panel = document.getElementById("collectionPanel") as HTMLDialogElement;
  const board = panel.querySelector<HTMLElement>(".collection-board")!;
  const viewport = document.getElementById("collectionViewport")!;
  const list = document.getElementById("entryList")!;
  const out = document.getElementById("boardZoomOutBtn") as HTMLButtonElement;
  const into = document.getElementById("boardZoomInBtn") as HTMLButtonElement;
  const range = document.getElementById("boardZoomRange") as HTMLInputElement;
  const value = document.getElementById("boardZoomValue")!;
  const events = new AbortController(), options = { signal: events.signal };
  let view: BoardView = { x: 16, y: 16, scale: 1 }, initialized = false, dragging = false, blockClick = false;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  const pointers = new Map<number, { start: Point; point: Point }>();
  let pinch: { center: Point; distance: number } | null = null;
  const size = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });
  const center = () => ({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
  range.min = String(MIN_BOARD_SCALE * 100); range.max = String(MAX_BOARD_SCALE * 100);
  document.getElementById("boardZoomLimits")!.textContent = `${range.min}%–${range.max}%`;

  function render(next = view) {
    view = { ...next, scale: clampBoardScale(next.scale) };
    list.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    const percentage = Math.round(view.scale * 100);
    range.value = String(percentage);
    const limit = view.scale <= MIN_BOARD_SCALE ? " · minimum" : view.scale >= MAX_BOARD_SCALE ? " · maximum" : "";
    const label = `${percentage}%${limit}`;
    if (value.textContent !== label) value.textContent = label;
    range.setAttribute("aria-valuetext", `${percentage} percent${limit}`);
    out.disabled = view.scale <= MIN_BOARD_SCALE; into.disabled = view.scale >= MAX_BOARD_SCALE;
  }
  function fit() { render(fitBoard({ width: list.offsetWidth, height: list.offsetHeight }, size())); }
  function reset() { render({ x: 16, y: 16, scale: 1 }); }
  function zoom(scale: number, anchor = center()) { render(zoomBoardAt(view, scale, anchor)); }
  // Undo the whiteboard's small rotation before interpreting drag/pinch coordinates.
  function localPoint(point: Point): Point {
    const bounds = viewport.getBoundingClientRect();
    const inverse = new DOMMatrixReadOnly(getComputedStyle(board).transform).inverse();
    const local = inverse.transformPoint(new DOMPoint(point.x - bounds.left - bounds.width / 2, point.y - bounds.top - bounds.height / 2));
    return { x: local.x + viewport.offsetWidth / 2 - viewport.clientLeft, y: local.y + viewport.offsetHeight / 2 - viewport.clientTop };
  }
  function reveal(target: HTMLElement) {
    viewport.scrollLeft = viewport.scrollTop = panel.scrollTop = 0;
    const rect = target.getBoundingClientRect();
    const corners = [localPoint({ x: rect.left, y: rect.top }), localPoint({ x: rect.right, y: rect.bottom })];
    const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
    render(revealBoardRect(view, { x: left, y: top, width: Math.abs(corners[1]!.x - corners[0]!.x), height: Math.abs(corners[1]!.y - corners[0]!.y) }, size()));
  }
  function measure() {
    const count = list.querySelectorAll("li[data-id]").length;
    list.style.setProperty("--board-columns", String(boardColumns(count)));
    if (!panel.open || !viewport.clientWidth) return;
    if (!count) { fit(); initialized = false; }
    else if (!initialized) { fit(); initialized = true; }
    else render();
    if (document.activeElement instanceof HTMLElement && list.contains(document.activeElement)) reveal(document.activeElement);
  }
  function gesture() {
    const points = Array.from(pointers.values()).slice(0, 2).map(pointer => pointer.point);
    if (points.length < 2) return null;
    const [a, b] = points as [Point, Point];
    return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  function startDrag() {
    if (dragging) return;
    dragging = blockClick = true;
    viewport.classList.add("is-dragging"); viewport.focus({ preventScroll: true });
    for (const id of pointers.keys()) viewport.setPointerCapture(id);
  }
  function endPointer(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    pinch = gesture();
    if (pointers.size) return;
    dragging = false; viewport.classList.remove("is-dragging");
    // The synthetic click immediately after a drag must not open/delete an article.
    clearTimeout(clickTimer); clickTimer = setTimeout(() => { blockClick = false; }, 0);
  }
  function clearGesture() {
    for (const id of pointers.keys()) if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    pointers.clear(); pinch = null; dragging = blockClick = false;
    viewport.classList.remove("is-dragging"); clearTimeout(clickTimer);
  }

  viewport.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = localPoint({ x: event.clientX, y: event.clientY });
    pointers.set(event.pointerId, { start: point, point });
    if (pointers.size === 2) { startDrag(); pinch = gesture(); }
  }, options);
  window.addEventListener("pointermove", event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const previous = pointer.point;
    pointer.point = localPoint({ x: event.clientX, y: event.clientY });
    if (!dragging && Math.hypot(pointer.point.x - pointer.start.x, pointer.point.y - pointer.start.y) > 5) startDrag();
    if (!dragging) return;
    if (event.cancelable) event.preventDefault();
    const nextPinch = gesture();
    if (pinch && nextPinch) {
      const next = zoomBoardAt(view, view.scale * nextPinch.distance / pinch.distance, pinch.center);
      render({ ...next, x: next.x + nextPinch.center.x - pinch.center.x, y: next.y + nextPinch.center.y - pinch.center.y });
    } else render({ ...view, x: view.x + pointer.point.x - previous.x, y: view.y + pointer.point.y - previous.y });
    pinch = nextPinch;
  }, { ...options, passive: false });
  window.addEventListener("pointerup", endPointer, options);
  window.addEventListener("pointercancel", endPointer, options);
  viewport.addEventListener("click", event => {
    if (!blockClick) return;
    event.preventDefault(); event.stopImmediatePropagation(); blockClick = false;
  }, { ...options, capture: true });
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const delta = Math.max(-1000, Math.min(1000, event.deltaY * unit));
    zoom(view.scale * Math.exp(-delta * .0015), localPoint({ x: event.clientX, y: event.clientY }));
  }, { ...options, passive: false });
  viewport.addEventListener("keydown", event => {
    if (event.target !== viewport || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 120 : 48;
    const movement: Record<string, Point> = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
    const offset = movement[event.key];
    if (offset) render({ ...view, x: view.x + offset.x, y: view.y + offset.y });
    else if (event.key === "+" || event.key === "=") zoom(view.scale * 1.2);
    else if (event.key === "-") zoom(view.scale / 1.2);
    else if (event.key === "0") reset();
    else if (event.key.toLowerCase() === "f") fit();
    else return;
    event.preventDefault();
  }, options);
  list.addEventListener("focusin", event => { if (event.target instanceof HTMLElement) reveal(event.target); }, options);
  out.addEventListener("click", () => zoom(view.scale / 1.2), options);
  into.addEventListener("click", () => zoom(view.scale * 1.2), options);
  range.addEventListener("input", () => zoom(Number(range.value) / 100), options);
  document.getElementById("boardFitBtn")!.addEventListener("click", fit, options);
  document.getElementById("boardResetBtn")!.addEventListener("click", reset, options);
  panel.addEventListener("panel-open", measure, options);
  panel.addEventListener("panel-close", clearGesture, options);
  const entries = new MutationObserver(measure); entries.observe(list, { childList: true });
  const resize = new ResizeObserver(measure); resize.observe(viewport); resize.observe(list);
  measure(); render();
  return () => { clearGesture(); events.abort(); entries.disconnect(); resize.disconnect(); };
}
