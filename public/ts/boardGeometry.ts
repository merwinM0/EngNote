/** Pure geometry for the saved-article canvas; positions are in viewport pixels. */
export const MIN_BOARD_SCALE = 0.25;
export const MAX_BOARD_SCALE = 2;
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type BoardView = Point & { scale: number };
export type Rect = Point & Size;

export function clampBoardScale(scale: number): number {
  return Math.max(MIN_BOARD_SCALE, Math.min(MAX_BOARD_SCALE, Number.isFinite(scale) ? scale : 1));
}

export function zoomBoardAt(view: BoardView, scale: number, anchor: Point): BoardView {
  const next = clampBoardScale(scale), ratio = next / view.scale;
  return { x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, scale: next };
}

export function fitBoard(content: Size, viewport: Size): BoardView {
  const scale = clampBoardScale(Math.min(1, Math.max(1, viewport.width - 32) / Math.max(1, content.width), Math.max(1, viewport.height - 32) / Math.max(1, content.height)));
  return { x: (viewport.width - content.width * scale) / 2, y: (viewport.height - content.height * scale) / 2, scale };
}

export function revealBoardRect(view: BoardView, rect: Rect, viewport: Size): BoardView {
  const adjust = (position: number, size: number, limit: number) => size > limit - 32 ? (limit - size) / 2 - position
    : position < 16 ? 16 - position : position + size > limit - 16 ? limit - 16 - position - size : 0;
  return { ...view, x: view.x + adjust(rect.x, rect.width, viewport.width), y: view.y + adjust(rect.y, rect.height, viewport.height) };
}

export function boardColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(0, count))));
}
