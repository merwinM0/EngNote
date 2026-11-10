import { content, definitionViews, documentModel, goToPage, isBusy, wordsById } from "./state";
import { activePanel, openPanel } from "./panels";
import { el } from "./util";
import { t } from "./i18n";
import { withIPA } from "./pronunciation";
import { indexSearchWords, searchExcerpt, searchWords, type SearchScope, type WordSearchIndex, type WordSearchResult } from "./wordSearch";

const ROW_HEIGHT = 76;
/** A local, read-only combobox. Virtual rows keep repeated words cheap without truncating results. */
export function initReadingSearch(): () => void {
  const root = document.getElementById("wordSearch")!;
  const input = document.getElementById("wordSearchInput") as HTMLInputElement;
  const scopeButton = document.getElementById("wordSearchScope") as HTMLButtonElement;
  const popup = document.getElementById("wordSearchPopup")!;
  const list = document.getElementById("wordSearchResults")!;
  const rows = document.getElementById("wordSearchRows")!;
  const summary = document.getElementById("wordSearchSummary")!;
  const empty = document.getElementById("wordSearchEmpty")!;
  const preview = el("div", "tool-tooltip word-search-preview");
  preview.id = "wordSearchPreview"; preview.role = "tooltip"; preview.hidden = true; document.body.append(preview);
  const events = new AbortController(), options = { signal: events.signal };
  let scope: SearchScope = "article", index: WordSearchIndex | null = null, results: WordSearchResult[] = [];
  let active = -1, page = documentModel.index, anchor = documentModel.page.start, composing = false;
  let pointerInResults = false, keyboardScroll = false;
  let timer: ReturnType<typeof setTimeout> | undefined, previewTimer: ReturnType<typeof setTimeout> | undefined, pointerTimer: ReturnType<typeof setTimeout> | undefined;
  let highlighted: HTMLElement[] = [];
  function hidePreview() {
    clearTimeout(previewTimer); preview.hidden = true;
    rows.querySelectorAll("[aria-describedby]").forEach(row => row.removeAttribute("aria-describedby"));
  }
  function close() {
    clearTimeout(timer); hidePreview(); popup.hidden = true;
    input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
  }
  function clearHighlight() {
    for (const word of highlighted) { word.classList.remove("search-hit"); if (word.tabIndex === -1) word.removeAttribute("tabindex"); }
    highlighted = [];
  }
  function scopeCopy() {
    scopeButton.textContent = t(scope === "article" ? "search.article" : "search.page");
    scopeButton.setAttribute("aria-label", t(scope === "article" ? "search.scopeArticle" : "search.scopePage"));
    scopeButton.setAttribute("aria-pressed", String(scope === "page"));
  }
  function distanceCopy(result: WordSearchResult): string {
    return (result.current ? t("search.current") : "") + (result.direction === "here" ? t("search.here")
      : t(result.direction === "before" ? "search.before" : "search.after", { count: result.distance.toLocaleString() }));
  }
  function positionPopup() {
    if (popup.hidden) return;
    const rect = root.getBoundingClientRect(), width = Math.min(440, window.innerWidth - 32);
    const below = window.innerHeight - rect.bottom - 16, above = rect.top - 16;
    const flip = below < 180 && above > below;
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`;
    popup.style.maxHeight = `${Math.max(80, flip ? above : below)}px`;
    list.style.height = `${Math.min(304, results.length * ROW_HEIGHT)}px`;
    const height = popup.getBoundingClientRect().height;
    popup.style.top = `${Math.max(8, flip ? rect.top - height - 8 : rect.bottom + 8)}px`;
  }
  function showPreview() {
    hidePreview();
    const result = results[active], row = document.getElementById(`wordSearchOption${active}`);
    if (!result || result.noteStart === undefined || !row || popup.hidden) return;
    const note = definitionViews.at(result.noteStart);
    if (!note) return;
    const chinese = note.language === "zh" && !!note.chinese;
    preview.replaceChildren(el("strong", "", result.text));
    const primary = el("span", "", withIPA(chinese ? note.chinese! : note.english, note.britishIPA));
    primary.lang = chinese ? "zh-Hans" : "en"; preview.append(primary);
    if (note.chinese) {
      const other = el("span", "search-preview-secondary", chinese ? note.english : note.chinese);
      other.lang = chinese ? "en" : "zh-Hans"; preview.append(other);
    }
    preview.hidden = false;
    row.setAttribute("aria-describedby", preview.id);
    const rect = row.getBoundingClientRect(), box = preview.getBoundingClientRect();
    const right = popup.getBoundingClientRect().right;
    const left = right + box.width + 16 <= window.innerWidth ? right + 8 : rect.left - box.width - 8 >= 8 ? rect.left - box.width - 8 : rect.left;
    const top = left === rect.left ? rect.bottom + 8 : rect.top;
    preview.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`;
    preview.style.top = `${Math.max(8, Math.min(top, window.innerHeight - box.height - 8))}px`;
  }
  function renderRows() {
    if (!index) return;
    const first = Math.max(0, Math.floor(list.scrollTop / ROW_HEIGHT) - 2);
    const last = Math.min(results.length, first + Math.ceil((list.clientHeight || 304) / ROW_HEIGHT) + 5);
    const visible = Array.from({ length: last - first }, (_, i) => first + i);
    if (active >= 0 && !visible.includes(active)) visible.push(active);
    visible.sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();
    for (const number of visible) {
      const result = results[number]!;
      const row = el("div", "search-result");
      row.id = `wordSearchOption${number}`; row.role = "option"; row.dataset.index = String(number);
      row.dataset.start = String(result.start); row.dataset.page = String(result.page + 1);
      row.style.top = `${number * ROW_HEIGHT}px`;
      row.setAttribute("aria-selected", String(number === active));
      row.setAttribute("aria-setsize", String(results.length)); row.setAttribute("aria-posinset", String(number + 1));
      const copy = el("div", "search-result-copy"), word = el("strong", "search-result-word", result.text);
      copy.append(word, el("span", "search-result-context", searchExcerpt(index, result)));
      const meta = el("div", "search-result-meta");
      meta.append(el("span", "", t("search.rank", { page: result.page + 1, rank: result.priority })), el("span", "", distanceCopy(result)));
      row.append(copy, meta);
      if (result.noteStart !== undefined) {
        row.dataset.defined = "true";
        word.append(el("span", "search-note-mark", " · " + t("search.defined")));
      }
      if (result.match === "fuzzy") word.append(el("span", "search-note-mark", " ≈"));
      fragment.append(row);
    }
    rows.replaceChildren(fragment);
    if (active >= 0) input.setAttribute("aria-activedescendant", `wordSearchOption${active}`);
  }
  function choose(number: number, scroll = false) {
    if (!results.length) return;
    active = Math.max(0, Math.min(number, results.length - 1));
    if (scroll) {
      const top = active * ROW_HEIGHT;
      const next = top < list.scrollTop ? top : top + ROW_HEIGHT > list.scrollTop + list.clientHeight ? top + ROW_HEIGHT - list.clientHeight : list.scrollTop;
      keyboardScroll = next !== list.scrollTop; list.scrollTop = next;
      renderRows();
    }
    for (const row of rows.querySelectorAll<HTMLElement>("[role='option']")) row.setAttribute("aria-selected", String(Number(row.dataset.index) === active));
    input.setAttribute("aria-activedescendant", `wordSearchOption${active}`);
    showPreview();
  }
  function search() {
    clearTimeout(timer);
    if (composing || isBusy() || !input.value.trim()) { close(); return; }
    index ??= indexSearchWords(documentModel.text, documentModel.pages, definitionViews.snapshot());
    results = searchWords(index, input.value, documentModel.pages, documentModel.index, scope, anchor);
    active = -1; hidePreview(); input.removeAttribute("aria-activedescendant");
    summary.textContent = t(results.length ? "search.count" : "search.noMatches", { count: results.length.toLocaleString() });
    empty.hidden = results.length > 0; empty.textContent = t(documentModel.text ? "search.tryAgain" : "search.noArticle");
    list.hidden = !results.length; list.scrollTop = 0; rows.style.height = `${results.length * ROW_HEIGHT}px`;
    popup.hidden = false; input.setAttribute("aria-expanded", "true"); positionPopup(); renderRows();
  }
  function locate() {
    const result = results[active];
    if (!result || isBusy()) return;
    close(); input.blur(); clearHighlight();
    openPanel("readPanel", false); goToPage(result.page);
    anchor = result.start; page = documentModel.index;
    for (const word of wordsById.values()) if (word.start < result.end && word.end > result.start) {
      word.el.classList.add("search-hit"); word.el.tabIndex = -1; highlighted.push(word.el);
    }
    const target = highlighted[0];
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center", behavior: "instant" });
  }
  const optionAt = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(".search-result") : null;
  input.addEventListener("input", event => {
    close(); if (!composing && !(event as InputEvent).isComposing) timer = setTimeout(search, 100);
  }, options);
  input.addEventListener("compositionstart", () => { composing = true; close(); }, options);
  input.addEventListener("compositionend", () => { composing = false; search(); }, options);
  input.addEventListener("focus", search, options);
  input.addEventListener("click", () => { if (popup.hidden) search(); }, options);
  input.addEventListener("keydown", event => {
    if (event.isComposing || composing) return;
    if (event.key === "Escape" && !popup.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); if (popup.hidden) search();
      choose(active < 0 ? event.key === "ArrowDown" ? 0 : results.length - 1 : active + (event.key === "ArrowDown" ? 1 : -1), true);
    } else if (event.key === "Enter" && !popup.hidden && active >= 0) { event.preventDefault(); locate(); }
  }, options);
  scopeButton.addEventListener("click", () => {
    scope = scope === "article" ? "page" : "article"; scopeCopy(); input.focus({ preventScroll: true }); search();
  }, options);
  list.addEventListener("scroll", () => { hidePreview(); renderRows(); if (keyboardScroll) { keyboardScroll = false; showPreview(); } }, { ...options, passive: true });
  // Layout changes under a stationary pointer must not override keyboard selection.
  list.addEventListener("pointermove", event => {
    const row = optionAt(event.target);
    if (!row || event.pointerType === "touch") return;
    const number = Number(row.dataset.index);
    if (number !== active) choose(number);
    else if (preview.hidden && results[number]?.noteStart !== undefined) showPreview();
  }, options);
  list.addEventListener("pointerdown", event => {
    pointerInResults = true;
    if (event.pointerType === "mouse" && optionAt(event.target)) event.preventDefault();
  }, options);
  preview.addEventListener("pointerdown", () => { pointerInResults = true; }, options);
  window.addEventListener("pointerup", () => { clearTimeout(pointerTimer); pointerTimer = setTimeout(() => { pointerInResults = false; }, 0); }, options);
  window.addEventListener("pointercancel", () => { pointerInResults = false; }, options);
  // Touch taps synthesize mousedown after pointerup; keep the combobox focused until click.
  list.addEventListener("mousedown", event => { if (optionAt(event.target)) event.preventDefault(); }, options);
  list.addEventListener("click", event => { const row = optionAt(event.target); if (row) { active = Number(row.dataset.index); locate(); } }, options);
  list.addEventListener("pointerleave", () => { previewTimer = setTimeout(hidePreview, 150); }, options);
  preview.addEventListener("pointerenter", () => clearTimeout(previewTimer), options);
  preview.addEventListener("pointerleave", hidePreview, options);
  root.addEventListener("focusout", () => queueMicrotask(() => { if (!pointerInResults && !root.contains(document.activeElement)) close(); }), options);
  document.addEventListener("pointerdown", event => { if (event.target instanceof Node && !root.contains(event.target) && !preview.contains(event.target)) close(); }, options);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing && !composing && !popup.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
  }, { ...options, capture: true });
  content.addEventListener("click", event => {
    const word = event.target instanceof Element ? event.target.closest<HTMLElement>(".term") : null;
    const found = word ? wordsById.get(Number(word.dataset.wordId)) : null;
    if (found) anchor = found.start;
  }, options);
  window.addEventListener("document-view-changed", () => {
    index = null; clearHighlight();
    if (page !== documentModel.index) { page = documentModel.index; anchor = documentModel.page.start; }
    anchor = Math.max(documentModel.page.start, Math.min(anchor, documentModel.page.end));
    if (document.activeElement === input) search(); else close();
  }, options);
  const reset = () => {
    close(); clearHighlight(); input.value = ""; index = null; results = []; active = -1;
    composing = pointerInResults = keyboardScroll = false;
    rows.replaceChildren(); preview.replaceChildren(); summary.textContent = ""; anchor = documentModel.page.start;
  };
  window.addEventListener("document-replaced", reset, options);
  window.addEventListener("session-changed", reset, options);
  window.addEventListener("definition-view-changed", () => { if (!preview.hidden) showPreview(); }, options);
  window.addEventListener("ui-language-changed", () => { scopeCopy(); if (!popup.hidden) search(); }, options);
  document.addEventListener("panel-open", () => { if (activePanel() !== "readPanel" || document.querySelector("dialog[open]")) close(); }, { ...options, capture: true });
  window.addEventListener("resize", () => { positionPopup(); if (!popup.hidden) { renderRows(); hidePreview(); } }, options);
  window.addEventListener("scroll", event => {
    if (event.target === list || event.target === preview || popup.hidden) return;
    const rect = root.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) close(); else { hidePreview(); positionPopup(); }
  }, { ...options, capture: true, passive: true });
  const busy = new MutationObserver(() => { if (isBusy()) close(); });
  busy.observe(content, { attributes: true, attributeFilter: ["aria-busy"] });
  scopeCopy();
  return () => { close(); clearTimeout(pointerTimer); clearHighlight(); events.abort(); busy.disconnect(); preview.remove(); };
}
