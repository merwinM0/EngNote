import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tooltipPosition } from "../public/ts/tooltips";
import { setToolLabel } from "../public/ts/util";
import { definitionModePresentation } from "../public/ts/definitionModeControl";
import { DEFINITION_MODES } from "../public/ts/definitionMode";
import { t, uiLanguagePreference } from "../public/ts/i18n";
import { READING_FONT_LEVELS } from "../public/ts/readingFont";

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
  test("search location feedback outlines words without overriding source text or background colors", () => {
    const css = readFileSync("public/css/readingSearch.css", "utf8");
    const rules = [...css.matchAll(/\.content \.term\.search-hit[^{}]*\{([^}]+)\}/g)].map(match => match[1]!);
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.some(rule => rule.includes("outline: 2px dashed var(--accent)"))).toBe(true);
    expect(rules.some(rule => rule.includes("outline-color: Highlight"))).toBe(true);
    for (const rule of rules) expect(rule).not.toMatch(/(?:^|;)\s*(?:background(?:-[\w-]+)?|color)\s*:/);
  });
  test("offers five reading sizes while matching note size to prose without changing Word metadata", () => {
    expect(READING_FONT_LEVELS.map(level => level.label)).toEqual(["S", "M", "L", "XL", "XXL"]);
    expect(READING_FONT_LEVELS.map(level => level.size)).toEqual([17, 20, 23, 26, 29]);
    const css = readFileSync("public/css/content.css", "utf8");
    expect(css).toContain("font: 1em/1.7 var(--sans)");
    expect(css).not.toContain("font: .8em");
    expect(css).toContain("var(--reading-font-scale, 1)");
    const source = readFileSync("public/ts/readingFont.ts", "utf8");
    expect(source).not.toMatch(/document-changed|setText|formatting|sessionStorage|localStorage/);
  });
  test("definition lists sit in the requested positions without changing AI cache settings", () => {
    const html = readFileSync("public/index.html", "utf8");
    const navigation = html.match(/<nav class="page-navigation"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(navigation).toMatch(/id="articleDefinitionsBtn"[\s\S]*?id="pageSummary"/);
    expect(html.match(/<div class="topbar-actions"[\s\S]*?<\/div>/)?.[0]).toContain('id="allDefinitionsBtn"');
    const panel = html.match(/<dialog id="definitionListPanel"[\s\S]*?<\/dialog>/)?.[0] ?? "";
    for (const control of ["definitionListSearch", "definitionListCollect", "definitionListPrevious", "definitionListNext", "definitionListRetry"]) expect(panel).toContain(`id="${control}"`);
    expect(panel).toContain('class="tape tape-progress-strip"');
    expect(panel).not.toContain("clearDictionaryCacheBtn");
    expect(html.match(/<dialog id="aiPanel"[\s\S]*?<\/dialog>/)?.[0]).toContain('id="clearDictionaryCacheBtn"');
  });
  test("definition lists reuse transparent tape without clipping text or focus and the shared sticky-note modal", () => {
    const source = readFileSync("public/ts/definitionList.ts", "utf8");
    expect(source).toContain('`tape-button vocabulary-meaning tape-${tape}`');
    expect(source).toContain('note.tape ??= randomNoteTape()');
    expect(source).toContain('termNoteTape(key)');
    const css = readFileSync("public/css/vocabulary.css", "utf8");
    expect(css).not.toContain("background: var(--selected)");
    expect(css).not.toMatch(/\.vocabulary-window\s*\{/);
    expect(css).not.toMatch(/(?:clip-path|opacity)\s*:/);
    expect(css).toContain("color: var(--note-text)");
    expect(css).toContain("justify-self: start");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("padding: 4px 8px 8px 4px");
    expect(css).toContain(".vocabulary-meaning:not(button) { cursor: default; }");
    expect(css).toContain("background: Canvas; color: CanvasText; border: 1px solid ButtonText");
    const html = readFileSync("public/index.html", "utf8");
    const modal = html.match(/<dialog id="definitionListPanel"[\s\S]*?<\/dialog>/)?.[0] ?? "";
    expect(modal).toContain('class="note-window vocabulary-window"');
    expect(modal).toContain('class="panel-sheet note-panel"');
    expect(modal).toContain('class="tape" aria-hidden="true"');
    expect(modal).toContain('aria-describedby="definitionListDescription"');
    expect(modal).toContain('data-close-note');
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
