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

/** Parse the server's SQLite UTC timestamps without applying the browser's local timezone. */
export function boardCreationOrder<T extends { id: number; created_at: string }>(entries: readonly T[]): T[] {
  const times = entries.map(entry => {
    const value = entry.created_at;
    const utc = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value) ? value.replace(" ", "T") + "Z" : value;
    const time = Date.parse(utc);
    return { entry, time: Number.isFinite(time) ? time : -Infinity };
  });
  return times.sort((a, b) => b.time - a.time || b.entry.id - a.entry.id).map(({ entry }) => entry);
}

export type BoardCard = Size & { id: number; control?: Rect };
export type BoardPlacement = Point & { angle: number; radius: number; bounds: Rect };
const tilt = [-3, 2, -1.4, 3.2, -2.2, 1.6];
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const bucketSize = 224;

function cardFootprint(card: BoardCard, angle: number): Rect {
  const { width, height, control } = card;
  // Reserve room for the delete target, focus outlines and the buttons' hover movement.
  const left = Math.min(0, control?.x ?? 0) - 10, top = Math.min(0, control?.y ?? 0) - 10;
  const right = Math.max(width, control ? control.x + control.width : 0) + 10;
  const bottom = Math.max(height, control ? control.y + control.height : 0) + 10;
  const cos = Math.cos(angle * Math.PI / 180), sin = Math.sin(angle * Math.PI / 180);
  const corners = [left, right].flatMap(x => [top, bottom].map(y => {
    const u = x - width / 2, v = y - height / 2;
    return { x: u * cos - v * sin, y: u * sin + v * cos };
  }));
  const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y));
  return { x, y, width: Math.max(...corners.map(point => point.x)) - x, height: Math.max(...corners.map(point => point.y)) - y };
}
function* buckets(rect: Rect) {
  for (let y = Math.floor(rect.y / bucketSize); y <= Math.floor((rect.y + rect.height) / bucketSize); y++) {
    for (let x = Math.floor(rect.x / bucketSize); x <= Math.floor((rect.x + rect.width) / bucketSize); x++) yield `${x},${y}`;
  }
}
function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Place newest-to-oldest around (0, 0). Advancing the sample always increases the radius. */
export function scatterBoard(cards: readonly BoardCard[]): { placements: BoardPlacement[]; bounds: Rect } {
  const cells = new Map<string, Rect[]>();
  let sample = 0, left = 0, top = 0, right = 0, bottom = 0;
  const placements = cards.map(card => {
    const angle = tilt[card.id % tilt.length] ?? 0, footprint = cardFootprint(card, angle);
    while (true) {
      const radius = 52 * Math.sqrt(sample), direction = (sample++ - 1) * goldenAngle - Math.PI / 2;
      const x = radius * Math.cos(direction), y = radius * Math.sin(direction);
      const bounds = { ...footprint, x: x + footprint.x, y: y + footprint.y };
      const keys = [...buckets(bounds)];
      if (keys.some(key => cells.get(key)?.some(rect => overlaps(rect, bounds)))) continue;
      for (const key of keys) {
        const group = cells.get(key);
        if (group) group.push(bounds); else cells.set(key, [bounds]);
      }
      left = Math.min(left, bounds.x); top = Math.min(top, bounds.y);
      right = Math.max(right, bounds.x + bounds.width); bottom = Math.max(bottom, bounds.y + bounds.height);
      return { x: x - card.width / 2, y: y - card.height / 2, angle, radius, bounds };
    }
  });
  return { placements, bounds: { x: left, y: top, width: right - left, height: bottom - top } };
}

/** Fit the outer cards, keeping the newest card centered whenever the margins allow it. */
export function fitScatteredBoard(bounds: Rect, viewport: Size): BoardView {
  const view = fitBoard(bounds, viewport);
  const axis = (start: number, length: number, size: number, centered: number) => {
    const min = 16 - start * view.scale, max = size - 16 - (start + length) * view.scale;
    return min <= max ? Math.max(min, Math.min(max, size / 2)) : centered - start * view.scale;
  };
  return { x: axis(bounds.x, bounds.width, viewport.width, view.x), y: axis(bounds.y, bounds.height, viewport.height, view.y), scale: view.scale };
}
