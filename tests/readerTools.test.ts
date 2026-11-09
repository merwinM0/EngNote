import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tooltipPosition } from "../public/ts/tooltips";
import { setToolLabel } from "../public/ts/util";
import { definitionModePresentation } from "../public/ts/definitionModeControl";
import { DEFINITION_MODES } from "../public/ts/definitionMode";
import { t, uiLanguagePreference } from "../public/ts/i18n";

afterEach(() => { uiLanguagePreference.set("en"); });

describe("compact reading tools", () => {
  test("dynamic captions and accessible names keep the icon/count for shared tooltip labels", () => {
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
  test("mode captions, accessible names and tooltip descriptions follow the current mode and language", () => {
    const names = ["ai.modeGeneral", "ai.modeContext", "ai.modeArticle"] as const;
    const hints = ["ai.modeGeneralHint", "ai.modeContextHint", "ai.modeArticleHint"] as const;
    for (const language of ["en", "zh"] as const) {
      uiLanguagePreference.set(language);
      for (const [index, mode] of DEFINITION_MODES.entries()) {
        const view = definitionModePresentation(mode);
        expect(view.caption).toBe(t(names[index]!));
        expect(view.label).toBe(t("ai.modeLabel", { current: view.caption }));
        expect(view.description).toBe(t(hints[index]!));
        expect(view.description).not.toMatch(/Click the tape|browser remembers|点击胶带|浏览器会记住/);
        expect(definitionModePresentation(mode, false).description).toBe(view.description + t("ai.definitionStorage"));
      }
    }
  });
  test("tooltips stay below the button and inside narrow or scrolled viewport edges", () => {
    expect(tooltipPosition(100, 144, 60, 200, 1440)).toEqual({ left: 22, top: 68 });
    expect(tooltipPosition(0, 44, 60, 280, 320)).toEqual({ left: 8, top: 68 });
    expect(tooltipPosition(290, 334, 60, 200, 320)).toEqual({ left: 112, top: 68 });
    const source = readFileSync("public/ts/tooltips.ts", "utf8");
    expect(source).toContain('document.body.append(tooltip)');
    expect(source).toContain('tooltip.role = "tooltip"');
    for (const action of ["pointerover", "focusin", "pointerenter", "ui-language-changed"]) expect(source).toContain(`"${action}"`);
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('aria-describedby');
    expect(source).toContain('active.dataset.toolDescription');
    expect(source).toContain('"data-tool-description"');
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
