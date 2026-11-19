import { describe, expect, test } from "bun:test";
import { boardCreationOrder, clampBoardScale, fitBoard, fitScatteredBoard, MAX_BOARD_SCALE, MIN_BOARD_SCALE, revealBoardRect, scatterBoard, zoomBoardAt } from "../public/ts/articles/boardGeometry";

describe("collection canvas geometry", () => {
  test("clamps to visible minimum/maximum limits and recovers from invalid input", () => {
    expect(clampBoardScale(-1)).toBe(MIN_BOARD_SCALE);
    expect(clampBoardScale(100)).toBe(MAX_BOARD_SCALE);
    expect(clampBoardScale(NaN)).toBe(1);
    expect(clampBoardScale(0.75)).toBe(0.75);
  });
  test("zoom keeps the world point beneath the pointer fixed, including at limits", () => {
    const view = { x: -75, y: 32, scale: 0.7 }, anchor = { x: 250, y: 120 };
    for (const scale of [0.01, 0.5, 1, 1.5, 10]) {
      const next = zoomBoardAt(view, scale, anchor);
      expect((anchor.x - next.x) / next.scale).toBeCloseTo((anchor.x - view.x) / view.scale, 8);
      expect((anchor.y - next.y) / next.scale).toBeCloseTo((anchor.y - view.y) / view.scale, 8);
      expect(next.scale).toBeGreaterThanOrEqual(MIN_BOARD_SCALE);
      expect(next.scale).toBeLessThanOrEqual(MAX_BOARD_SCALE);
    }
  });
  test("fit centers a large collection and never enlarges a small collection", () => {
    const viewport = { width: 900, height: 400 }, content = { width: 1800, height: 800 };
    const view = fitBoard(content, viewport);
    expect(view.scale).toBeCloseTo(0.46);
    expect(view.x + content.width * view.scale / 2).toBeCloseTo(450);
    expect(view.y + content.height * view.scale / 2).toBeCloseTo(200);
    expect(fitBoard({ width: 100, height: 80 }, viewport).scale).toBe(1);
    expect(fitBoard({ width: 100000, height: 100000 }, viewport).scale).toBe(MIN_BOARD_SCALE);
    expect(Number.isFinite(fitBoard({ width: 0, height: 0 }, { width: 0, height: 0 }).scale)).toBe(true);
  });
  test("keyboard focus reveals offscreen controls without resetting the user's zoom", () => {
    const view = { x: 20, y: -200, scale: 0.6 }, viewport = { width: 400, height: 200 };
    expect(revealBoardRect(view, { x: 30, y: 30, width: 100, height: 80 }, viewport)).toEqual(view);
    expect(revealBoardRect(view, { x: -100, y: 250, width: 100, height: 60 }, viewport)).toEqual({ x: 136, y: -326, scale: 0.6 });
    const oversized = revealBoardRect(view, { x: 0, y: 0, width: 800, height: 400 }, viewport);
    expect(oversized).toEqual({ x: -180, y: -300, scale: 0.6 });
  });
  test("sorts by UTC creation date without changing the API order used for auto-open", () => {
    const entries = [
      { id: 1, created_at: "2025-05-01 12:00:00", updated_at: 100 },
      { id: 3, created_at: "2025-05-02T12:00:00Z", updated_at: 80 },
      { id: 2, created_at: "2025-05-02 12:00:00", updated_at: 60 },
      { id: 4, created_at: "unknown", updated_at: 40 },
    ];
    expect(boardCreationOrder(entries).map(entry => entry.id)).toEqual([3, 2, 1, 4]);
    expect(entries.map(entry => entry.id)).toEqual([1, 3, 2, 4]);
  });
  test("spirals out to all four quadrants without collisions, even for tall cards with delete controls", () => {
    const cards = Array.from({ length: 500 }, (_, id) => ({ id, width: 200, height: 64 + id % 5 * 17,
      control: { x: 164, y: -12, width: 44, height: 44 } }));
    const { placements, bounds } = scatterBoard(cards);
    expect(placements[0]).toMatchObject({ x: -100, y: -32, radius: 0 });
    expect(new Set(placements.slice(1, 12).map((p, i) => `${Math.sign(p.x + 100)},${Math.sign(p.y + cards[i + 1]!.height / 2)}`)).size).toBe(4);
    expect(placements.every((p, i) => !i || p.radius > placements[i - 1]!.radius)).toBe(true);
    expect(placements.some(p => Math.abs(p.angle) >= 2)).toBe(true);
    let collisions = 0;
    for (const [i, { bounds: a }] of placements.entries()) for (let j = 0; j < i; j++) {
      const b = placements[j]!.bounds;
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) collisions++;
    }
    expect(collisions).toBe(0);
    expect(scatterBoard(cards.slice(0, 20)).placements).toEqual(placements.slice(0, 20));
    expect(bounds.width).toBeGreaterThan(1000);
    expect(bounds.height).toBeGreaterThan(1000);
  });
  test("fits the actual card envelope and centers the newest card when possible", () => {
    const viewport = { width: 900, height: 400 };
    expect(fitScatteredBoard(scatterBoard([{ id: 1, width: 200, height: 64 }]).bounds, viewport)).toEqual({ x: 450, y: 200, scale: 1 });
    const { bounds } = scatterBoard(Array.from({length: 9 }, (_, id) => ({ id, width: 200, height: 96 })));
    const fitted = fitScatteredBoard(bounds, viewport);
    expect(fitted.x + fitted.scale * bounds.x).toBeGreaterThanOrEqual(15.9999);
    expect(fitted.y + fitted.scale * (bounds.y + bounds.height)).toBeLessThanOrEqual(viewport.height - 15.9999);
  });
});
