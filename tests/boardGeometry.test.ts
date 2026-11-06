import { describe, expect, test } from "bun:test";
import { boardColumns, clampBoardScale, fitBoard, MAX_BOARD_SCALE, MIN_BOARD_SCALE, revealBoardRect, zoomBoardAt } from "../public/ts/boardGeometry";

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
  test("article layout expands into two dimensions rather than a single scrolling column", () => {
    expect(boardColumns(0)).toBe(1);
    expect(boardColumns(1)).toBe(1);
    expect(boardColumns(7)).toBe(3);
    expect(boardColumns(100)).toBe(10);
  });
});
