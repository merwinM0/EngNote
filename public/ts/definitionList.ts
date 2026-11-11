import { getEmail, openLogin } from "./auth";
import { definitionViewChanged, definitionViews, getCurrentText, isBusy } from "./state";
import { openPanel, closePanel } from "./panels";
import { t, type UIMessage } from "./i18n";
import { api, el, errorMessage } from "./util";
import { withIPA } from "./pronunciation";
import { articleVocabulary, readVocabularyItem, vocabularyKey, VOCABULARY_PAGE_SIZE, type ArticleVocabularyItem, type VocabularyItem } from "./vocabulary";
import { saveVocabularyItems } from "./vocabularyClient";

/** Both lists share paper, filtering and keyboard-native meaning buttons; only the all-article list fetches. */
export function initDefinitionList() {
  const panel = document.getElementById("definitionListPanel") as HTMLDialogElement;
  const articleButton = document.getElementById("articleDefinitionsBtn") as HTMLButtonElement;
  const allButton = document.getElementById("allDefinitionsBtn") as HTMLButtonElement;
  const input = document.getElementById("definitionListSearch") as HTMLInputElement;
  const list = document.getElementById("definitionListItems")!;
  const status = document.getElementById("definitionListStatus")!;
  const progress = document.getElementById("definitionListProgress")!;
  const previous = document.getElementById("definitionListPrevious") as HTMLButtonElement;
  const next = document.getElementById("definitionListNext") as HTMLButtonElement;
  const collect = document.getElementById("definitionListCollect") as HTMLButtonElement;
  const retry = document.getElementById("definitionListRetry") as HTMLButtonElement;
  const login = document.getElementById("definitionListLogin") as HTMLButtonElement;
  let scope: "article" | "all" = "article", offset = 0, total = 0, loading = false, collecting = false;
  let items: Array<VocabularyItem | ArticleVocabularyItem> = [], request = 0, collectRequest = 0;
  let controller: AbortController | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  let notice: UIMessage = "", failure: unknown = null, collectionFailure = false;
  const languages = new Map<string, "en" | "zh">();
  const currentItems = () => articleVocabulary(getCurrentText(), definitionViews.snapshot());
  function draw() {
    document.getElementById("definitionListHeading")!.textContent = t(scope === "article" ? "vocabulary.articleHeading" : "vocabulary.allHeading");
    document.getElementById("definitionListDescription")!.textContent = t(scope === "article" ? "vocabulary.articleDescription" : "vocabulary.allDescription");
    login.hidden = scope !== "all" || !!getEmail();
    collect.hidden = !getEmail();
    collect.disabled = collecting || isBusy() || !currentItems().length;
    collect.textContent = t(collecting ? "vocabulary.collecting" : "vocabulary.collect");
    retry.hidden = !failure || collectionFailure;
    progress.hidden = !loading && !collecting;
    progress.querySelector("p")!.textContent = t(collecting ? "vocabulary.collecting" : "vocabulary.loading");
    list.setAttribute("aria-busy", String(loading));
    previous.disabled = loading || offset === 0;
    next.disabled = loading || offset + items.length >= total;
    previous.parentElement!.hidden = total <= VOCABULARY_PAGE_SIZE;
    document.getElementById("definitionListPage")!.textContent = t("vocabulary.page", { page: Math.floor(offset / VOCABULARY_PAGE_SIZE) + 1, pages: Math.max(1, Math.ceil(total / VOCABULARY_PAGE_SIZE)) });
    status.classList.toggle("error", !!failure);
    status.textContent = failure ? collectionFailure ? t("vocabulary.saveFailed", { error: errorMessage(failure) }) : errorMessage(failure)
      : notice ? typeof notice === "function" ? notice() : notice
      : scope === "all" && !getEmail() ? t("vocabulary.loginRequired") : loading ? "" : total ? t("vocabulary.count", { count: total })
      : input.value.trim() ? t("vocabulary.noMatches") : t(scope === "article" ? "vocabulary.emptyArticle" : "vocabulary.emptyAll");
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.vocabularyKey : undefined;
    const scroll = list.scrollTop, fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = el("li"), term = el("span", "vocabulary-term", item.term);
      term.lang = "en";
      const key = vocabularyKey(item.term), language = scope === "all" ? languages.get(key) ?? item.language : item.language;
      const chinese = language === "zh" && !!item.chinese;
      const meaning = el(item.chinese ? "button" : "span", "tape-button tape-clear vocabulary-meaning", withIPA(chinese ? item.chinese! : item.english, item.britishIPA));
      meaning.lang = chinese ? "zh-Hans" : "en";
      if (meaning instanceof HTMLButtonElement) {
        meaning.type = "button"; meaning.dataset.vocabularyKey = key;
        meaning.disabled = isBusy();
        meaning.setAttribute("aria-label", `${item.term}. ${meaning.textContent}. ${t(chinese ? "reader.noteShowEnglish" : "reader.noteShowChinese")}`);
        meaning.addEventListener("click", () => {
          if (isBusy()) return;
          if (scope === "all") { languages.set(key, chinese ? "en" : "zh"); draw(); }
          else if ("start" in item) {
            const note = definitionViews.at(item.start);
            if (note?.chinese) { note.language = note.language === "en" ? "zh" : "en"; definitionViewChanged(); }
          }
        });
      } else meaning.title = t("reader.noteEnglishOnly");
      row.append(term, meaning); fragment.append(row);
    }
    list.replaceChildren(fragment);
    if (active !== undefined) Array.from(list.querySelectorAll<HTMLButtonElement>("[data-vocabulary-key]")).find(button => button.dataset.vocabularyKey === active)?.focus({ preventScroll: true });
    list.scrollTop = scroll;
  }
  async function load() {
    const version = ++request, account = getEmail(), query = input.value.trim();
    controller?.abort(); controller = null;
    failure = null; collectionFailure = false; notice = "";
    if (scope === "article") {
      const matches = currentItems().filter(item => [item.term, item.english, item.chinese ?? ""].some(value => value.toLowerCase().includes(query.toLowerCase())));
      total = matches.length; offset = Math.min(offset, Math.max(0, Math.ceil(total / VOCABULARY_PAGE_SIZE) - 1) * VOCABULARY_PAGE_SIZE);
      items = matches.slice(offset, offset + VOCABULARY_PAGE_SIZE); loading = false; draw(); return;
    }
    items = []; total = 0;
    if (!account) { loading = false; draw(); return; }
    loading = true; draw();
    const pending = new AbortController(); controller = pending;
    try {
      const params = new URLSearchParams({ q: query, offset: String(offset), limit: String(VOCABULARY_PAGE_SIZE) });
      const data = await api<{ items: unknown; total: unknown }>(`/api/vocabulary?${params}`, { signal: AbortSignal.any([pending.signal, AbortSignal.timeout(20000)]) });
      if (version !== request || getEmail() !== account || !panel.open) return;
      if (!Array.isArray(data.items) || data.items.length > VOCABULARY_PAGE_SIZE || typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error("Invalid vocabulary response.");
      const parsed = data.items.map(readVocabularyItem);
      if (parsed.some(item => !item)) throw new Error("Invalid vocabulary response.");
      items = parsed.filter(item => item !== null); total = data.total;
      if (offset >= total && offset > 0) { offset = 0; void load(); return; }
    } catch (error) { if (version === request && getEmail() === account && !pending.signal.aborted) failure = error; }
    finally { if (version === request) { loading = false; controller = null; draw(); } }
  }
  function show(nextScope: typeof scope, trigger: HTMLButtonElement) {
    scope = nextScope; offset = 0; input.value = ""; items = []; total = 0;
    panel.dataset.noteEntry = trigger.id;
    openPanel(panel.id); void load();
  }
  articleButton.addEventListener("click", () => show("article", articleButton));
  allButton.addEventListener("click", () => show("all", allButton));
  input.addEventListener("input", () => {
    offset = 0; request++; controller?.abort(); clearTimeout(timer);
    if (scope === "article") void load();
    else timer = setTimeout(() => { void load(); }, 150);
  });
  previous.addEventListener("click", () => { offset = Math.max(0, offset - VOCABULARY_PAGE_SIZE); list.scrollTop = 0; void load(); });
  next.addEventListener("click", () => { offset += VOCABULARY_PAGE_SIZE; list.scrollTop = 0; void load(); });
  retry.addEventListener("click", () => { void load(); });
  login.addEventListener("click", openLogin);
  collect.addEventListener("click", async () => {
    if (collecting || isBusy()) return;
    const version = ++collectRequest;
    collecting = true; notice = ""; failure = null; collectionFailure = false; draw();
    const result = await saveVocabularyItems(currentItems());
    if (version !== collectRequest) return;
    collecting = false;
    if (!panel.open || !result) return;
    if (result.saved) notice = () => t("vocabulary.collected");
    else { failure = result.error; collectionFailure = true; }
    draw();
  });
  panel.addEventListener("panel-close", () => {
    request++; collectRequest++; controller?.abort(); controller = null; clearTimeout(timer);
    items = []; input.value = ""; loading = false; collecting = false; failure = null; notice = ""; list.replaceChildren();
  });
  for (const event of ["document-view-changed", "definition-view-changed"]) window.addEventListener(event, () => { if (panel.open && scope === "article") void load(); });
  window.addEventListener("reading-busy-changed", () => { if (panel.open) draw(); });
  window.addEventListener("vocabulary-updated", () => { if (panel.open && scope === "all") void load(); });
  window.addEventListener("ui-language-changed", () => { if (panel.open) draw(); });
  window.addEventListener("session-changed", () => { closePanel(panel.id); languages.clear(); items = []; list.replaceChildren(); });
}
