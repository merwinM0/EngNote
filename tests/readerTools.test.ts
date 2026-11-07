import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { setToolLabel } from "../public/ts/util";

describe("compact reading tools", () => {
  test("dynamic captions and accessible names keep the icon/count without adding hover hints", () => {
    const caption = { textContent: "Old label" };
    const attributes = new Map<string, string>();
    const button = {
      textContent: "Existing SVG and count",
      title: "",
      querySelector: (selector: string) => selector === "[data-tool-label]" ? caption : null,
      setAttribute: (key: string, value: string) => attributes.set(key, value),
    } as unknown as HTMLButtonElement;
    setToolLabel(button, "Define selected (2)");
    expect(caption.textContent).toBe("Define selected (2)");
    expect(button.textContent).toBe("Existing SVG and count");
    expect(attributes.get("aria-label")).toBe("Define selected (2)");
    expect(button.title).toBe("");
    setToolLabel(button, "保存修改");
    expect(caption.textContent).toBe("保存修改");
    expect(attributes.get("aria-label")).toBe("保存修改");
    expect(button.title).toBe("");
  });
  test("mode guidance remains available to assistive technology without popup reminders", () => {
    const state = readFileSync("public/ts/state.ts", "utf8");
    expect(state).toContain('modeHint.textContent = translateMode ? t("reader.modeSelect")');
    for (const file of ["main", "translate", "deleteNote"]) {
      const source = readFileSync(`public/ts/${file}.ts`, "utf8");
      expect(source).not.toMatch(/msg\("(?:reader\.modeSelect|reader\.modeDelete|status\.readingMode|status\.definitionSelected)"\)/);
    }
  });
  test("collapsed tools retain the reading frame's left alignment instead of moving to the viewport edge", () => {
    const css = readFileSync("public/css/layout.css", "utf8");
    const collapsed = css.match(/\.is-collapsed \.toolbar-shell\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(collapsed).toContain("width: 52px");
    expect(collapsed).not.toMatch(/(?:^|;)\s*(?:left|right|inset|transform):/);
    expect(css).toContain("left: var(--toolbar-left)");
  });
  test("keeps tools in one accessible scrollable row instead of wrapping or shrinking targets", () => {
    const css = readFileSync("public/css/layout.css", "utf8");
    expect(css).toContain("flex-wrap: nowrap");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("flex: 0 0 auto");
    expect(css).toContain("min-width: 44px");
    expect(css).not.toContain(".toolbar-row");
  });
});
