import { clampBoardScale, fitBoard, fitScatteredBoard, MAX_BOARD_SCALE, MIN_BOARD_SCALE, revealBoardRect, scatterBoard, zoomBoardAt } from "./boardGeometry";
import { t } from "../ui/i18n";
import type { BoardView, Point, Rect } from "./boardGeometry";

/** The frame stays pinned; only the article world is translated and scaled. */
export function initCollectionCanvas(): () => void {
  const panel = document.getElementById("collectionPanel") as HTMLDialogElement;
  const board = panel.querySelector<HTMLElement>(".collection-board")!;
  const viewport = document.getElementById("collectionViewport")!;
  const list = document.getElementById("entryList")!;
  const value = document.getElementById("boardZoomValue")!;
  const events = new AbortController(), options = { signal: events.signal };
  let view: BoardView = { x: 16, y: 16, scale: 1 }, initialized = false, dragging = false, blockClick = false;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let cards: HTMLElement[] = [], bounds: Rect | null = null;
  const pointers = new Map<number, { start: Point; point: Point }>();
  let pinch: { center: Point; distance: number } | null = null;
  const size = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });
  const center = () => ({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });

  function render(next = view) {
    view = { ...next, scale: clampBoardScale(next.scale) };
    list.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    viewport.style.setProperty("--board-grid-step", `${40 * view.scale}px`);
    viewport.style.setProperty("--board-grid-x", `${view.x}px`);
    viewport.style.setProperty("--board-grid-y", `${view.y}px`);
    const percentage = Math.round(view.scale * 100);
    const limit = view.scale <= MIN_BOARD_SCALE ? t("collection.minimum") : view.scale >= MAX_BOARD_SCALE ? t("collection.maximum") : "";
    const label = `${percentage}%${limit}`;
    if (value.textContent !== label) value.textContent = label;
  }
  function fit() { render(bounds ? fitScatteredBoard(bounds, size()) : fitBoard({ width: list.offsetWidth, height: list.offsetHeight }, size())); }
  function reset() { if (bounds) render({ ...center(), scale: 1 }); else fit(); }
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
    const corners = [rect.left, rect.right].flatMap(x => [rect.top, rect.bottom].map(y => localPoint({ x, y })));
    const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
    render(revealBoardRect(view, { x: left, y: top, width: Math.max(...corners.map(p => p.x)) - left, height: Math.max(...corners.map(p => p.y)) - top }, size()));
  }
  function measure() {
    if (!panel.open || !viewport.clientWidth || !viewport.clientHeight) return;
    if (!cards.length) { fit(); return; }
    const layout = scatterBoard(cards.map(card => {
      const control = card.querySelector<HTMLElement>(".entry-del");
      return { id: Number(card.dataset.id), width: card.offsetWidth, height: card.offsetHeight,
        control: control ? { x: control.offsetLeft, y: control.offsetTop, width: control.offsetWidth, height: control.offsetHeight } : undefined };
    }));
    bounds = layout.bounds;
    for (const [i, card] of cards.entries()) {
      const placement = layout.placements[i]!;
      card.style.left = `${placement.x}px`;
      card.style.top = `${placement.y}px`;
      card.style.transform = `rotate(${placement.angle}deg)`;
    }
    if (!initialized) { fit(); initialized = true; }
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
  list.addEventListener("focusin", event => {
    // List refresh may restore focus before the mutation observer has positioned the new node.
    if (event.target instanceof HTMLElement && event.target.closest<HTMLElement>("li[data-id]")?.style.left) reveal(event.target);
  }, options);
  document.getElementById("boardFitBtn")!.addEventListener("click", fit, options);
  document.getElementById("boardResetBtn")!.addEventListener("click", reset, options);
  panel.addEventListener("panel-open", measure, options);
  panel.addEventListener("panel-close", clearGesture, options);
  window.addEventListener("ui-language-changed", () => render(), options);
  const resize = new ResizeObserver(measure);
  function observeCards() {
    cards = Array.from(list.querySelectorAll<HTMLElement>("li[data-id]"));
    if (!cards.length) { bounds = null; initialized = false; }
    resize.disconnect(); resize.observe(viewport); resize.observe(list);
    for (const card of cards) resize.observe(card, { box: "border-box" });
    measure();
  }
  const entries = new MutationObserver(observeCards); entries.observe(list, { childList: true });
  observeCards(); render();
  return () => { clearGesture(); events.abort(); entries.disconnect(); resize.disconnect(); };
}
