import { definitionModePreference } from "./definitionMode";
import { contextQuery, contextPayload, CONTEXT_PROMPT } from "./definitionContext";
import { setStatus, errorMessage } from "./util";
import { localizeError, msg, t } from "./i18n";
import { saveDefinitionChanges } from "./db";
import { content, wordsById, collectPickedIds, restorePickedRanges, retainedPicksOutsidePage, groupIds, groupText, setTranslateMode, isTranslateMode, togglePick, isBusy, setBusy, getRevision, addDefinitions, definitionViews, getCurrentText } from "./state";
import { callDeepSeek } from "./deepseek";
import { DICTIONARY_PROMPT, dictionaryKey, dictionaryTokenBudget } from "./dictionary";
import { dictionaryCache } from "./dictionaryCache";
import { lookupDefinitions } from "./dictionaryLookup";
import { definitionLanguagePreference } from "./definitionPreference";
import { aiUsage } from "./aiUsage";
import { remapSelection } from "./selectionRecovery";
import { captureVocabularyAccount, saveVocabularyItems } from "./vocabularyClient";
import type { VocabularyItem } from "./vocabulary";
let activeRequest: AbortController | null = null;
window.addEventListener("reading-history-request", () => cancelDefinitions(false));
export const onTermClick = (id: number) => togglePick(id);
export function cancelDefinitions(announce = true) {
  const wasActive = isTranslateMode() || activeRequest !== null;
  const request = activeRequest;
  activeRequest = null;
  request?.abort();
  content.querySelectorAll(".defining").forEach(word => word.classList.remove("defining"));
  setTranslateMode(false);
  if (request) setBusy(false);
  if (announce && wasActive) setStatus(msg("status.definitionsCanceled"));
  return wasActive;
}
export function onTranslateClick() {
  if (isBusy() || isTranslateMode()) return;
  if (!wordsById.size) return setStatus(msg("status.pasteFirst"), "error");
  setTranslateMode(true);
  setStatus("");
}
export async function translateSelected(refresh = false) {
  if (isBusy()) return;
  const ids = collectPickedIds();
  if (!ids.length) return setStatus(msg("status.selectFirst"), "error");
  const restoreFocus = ["defineSelectedBtn", "refreshSelectedBtn"].includes(document.activeElement?.id ?? "");
  const request = new AbortController();
  activeRequest = request;
  const revision = getRevision(), vocabularyAccount = captureVocabularyAccount();
  let vocabulary: VocabularyItem[] = [];
  const mode = definitionModePreference.mode, article = getCurrentText();
  const targets = groupIds(ids).map(group => {
    const term = groupText(group), word = wordsById.get(group.at(-1)!)!, note = definitionViews.at(word.end);
    // Legacy notes have no term identity: keep them locally, but never seed a shared query cache from a guess.
    const existing = note?.chinese && (!note.term || dictionaryKey(note.term) === dictionaryKey(term))
      ? { english: note.english, chinese: note.chinese, ...(note.britishIPA ? { britishIPA: note.britishIPA } : {}) } : undefined;
    return { term, note, offset: word.end, word, start: wordsById.get(group[0]!)!.start, existing, cacheExisting: !!note?.term && !!existing };
  });
  const selectedTerms = new Set(targets.map(target => dictionaryKey(target.term)));
  if (!refresh && mode === "general") for (const note of definitionViews.snapshot()) {
    if ((!note.mode || note.mode === "general") && note.term && selectedTerms.has(dictionaryKey(note.term)) && !dictionaryCache.get(note.term)) dictionaryCache.set(note.term, note);
  }
  const requestsBefore = aiUsage.snapshot().requests;
  const otherPages = retainedPicksOutsidePage();
  let completion: { message: () => string; changed: boolean; missing: boolean } | null = null;
  let retryRanges = [...targets.map(target => ({ start: target.start, end: target.offset })), ...otherPages];
  for (const target of targets) target.word.el.classList.add("defining");
  setBusy(true);
  try {
    const queries = await Promise.all(targets.map(target => contextQuery(article, target.start, target.term, mode, target.offset)));
    request.signal.throwIfAborted();
    const byKey = new Map(queries.map(query => [query.key, query]));
    const resolvedTargets = targets.map((target, index) => {
      const query = queries[index]!;
      const compatible = mode === "general" ? !target.note?.mode || target.note.mode === "general"
        : target.note?.mode === mode && target.note.contextKey === query.key;
      return { ...target, term: query.key, existing: compatible ? target.existing : undefined, cacheExisting: compatible && target.cacheExisting };
    });
    // Validate every batch before the first paid request.
    if (mode !== "general") for (let i = 0; i < queries.length; i += 12) contextPayload(queries.slice(i, i + 12), mode);
    const result = await lookupDefinitions(resolvedTargets, dictionaryCache, (terms, signal) => {
      const user = mode === "general" ? JSON.stringify(terms) : contextPayload(terms.map(term => byKey.get(term)!), mode);
      return callDeepSeek(mode === "general" ? DICTIONARY_PROMPT : CONTEXT_PROMPT, user, signal,
        { jsonObject: true, maxTokens: dictionaryTokenBudget(terms) });
    },
    { refresh, signal: request.signal, onBatch: (index, total) => setStatus(msg("status.batch", { index, total })) });
    if (activeRequest !== request || request.signal.aborted || getRevision() !== revision) { retryRanges = []; return; }
    const completed = new Set(result.definitions.map(item => item.offset));
    retryRanges = [...targets.filter(target => !completed.has(target.offset) && (refresh || !resolvedTargets.find(item => item.offset === target.offset)?.existing))
      .map(target => ({ start: target.start, end: target.offset })), ...otherPages];
    const edits = addDefinitions(result.definitions.map(item => ({ offset: item.offset, meaning: item.english, chinese: item.chinese, term: byKey.get(item.term)!.term,
      ...(item.britishIPA ? { britishIPA: item.britishIPA } : {}), mode, ...(mode !== "general" ? { contextKey: item.term } : {}) })), definitionLanguagePreference.language);
    vocabulary = result.definitions.map(item => ({ term: byKey.get(item.term)!.term, english: item.english, chinese: item.chinese,
      ...(item.britishIPA ? { britishIPA: item.britishIPA } : {}), language: definitionLanguagePreference.language }));
    retryRanges = remapSelection(retryRanges, edits);
    const missing = targets.length - result.kept - result.definitions.length;
    const requests = aiUsage.snapshot().requests - requestsBefore;
    completion = { changed: edits.length > 0, missing: missing > 0, message: () => t("status.summary", {
      ready: targets.length - missing, total: targets.length, kept: result.kept, cached: result.cached, requests,
    }) + (missing ? t("status.missing") : "") + (result.error ? " " + localizeError(result.error) : "") };
    setStatus(completion.message, missing ? "error" : "ok");
  } catch (error) {
    if (activeRequest === request && !request.signal.aborted && getRevision() === revision) setStatus(() => errorMessage(error), "error");
  } finally {
    // A canceled request must not unlock or reset a newer task.
    if (activeRequest === request) {
      activeRequest = null;
      for (const target of targets) target.word.el.classList.remove("defining");
      setBusy(false);
      restorePickedRanges(retryRanges);
      if (restoreFocus && document.activeElement === document.body) content.focus({ preventScroll: true });
    }
  }
  // Finish the cancellable AI phase first. Esc/Read must not release the database-write lock.
  if (completion?.changed) {
    const result = await saveDefinitionChanges();
    if (result) {
      const summary = completion.message;
      setStatus(() => summary() + (result.saved ? t("save.autoSaved") : t("save.autoFailed", { error: errorMessage(result.error) })),
        !result.saved || completion.missing ? "error" : "ok");
    }
  }
  if (completion) {
    const recordedRevision = getRevision();
    const recorded = await saveVocabularyItems(vocabulary, vocabularyAccount);
    if (recorded && !recorded.saved && getRevision() === recordedRevision) setStatus(() => t("vocabulary.saveFailed", { error: errorMessage(recorded.error) }), "error");
  }
}
