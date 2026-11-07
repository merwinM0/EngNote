import { setStatus, errorMessage } from "./util";
import { localizeError, msg, t } from "./i18n";
import { content, wordsById, collectPickedIds, restorePickedRanges, retainedPicksOutsidePage, groupIds, groupText, setTranslateMode, isTranslateMode, togglePick, isBusy, setBusy, getRevision, addDefinitions, definitionViews } from "./state";
import { callDeepSeek } from "./deepseek";
import { DICTIONARY_PROMPT, dictionaryKey, dictionaryTokenBudget } from "./dictionary";
import { dictionaryCache } from "./dictionaryCache";
import { lookupDefinitions } from "./dictionaryLookup";
import { definitionLanguagePreference } from "./definitionPreference";
import { aiUsage } from "./aiUsage";
import { remapSelection } from "./selectionRecovery";
let activeRequest: AbortController | null = null;
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
  const revision = getRevision();
  const targets = groupIds(ids).map(group => {
    const term = groupText(group), word = wordsById.get(group.at(-1)!)!, note = definitionViews.at(word.end);
    // Legacy notes have no term identity: keep them locally, but never seed a shared query cache from a guess.
    const existing = note?.chinese && (!note.term || dictionaryKey(note.term) === dictionaryKey(term))
      ? { english: note.english, chinese: note.chinese } : undefined;
    return { term, offset: word.end, word, start: wordsById.get(group[0]!)!.start, existing, cacheExisting: !!note?.term && !!existing };
  });
  const selectedTerms = new Set(targets.map(target => dictionaryKey(target.term)));
  if (!refresh) for (const note of definitionViews.snapshot()) {
    if (note.term && selectedTerms.has(dictionaryKey(note.term)) && !dictionaryCache.get(note.term)) dictionaryCache.set(note.term, note);
  }
  const requestsBefore = aiUsage.snapshot().requests;
  const otherPages = retainedPicksOutsidePage();
  let retryRanges = [...targets.map(target => ({ start: target.start, end: target.offset })), ...otherPages];
  for (const target of targets) target.word.el.classList.add("defining");
  setBusy(true);
  try {
    const result = await lookupDefinitions(targets, dictionaryCache, (terms, signal) =>
      callDeepSeek(DICTIONARY_PROMPT, JSON.stringify(terms), signal, { jsonObject: true, maxTokens: dictionaryTokenBudget(terms) }),
    { refresh, signal: request.signal, onBatch: (index, total) => setStatus(msg("status.batch", { index, total })) });
    if (activeRequest !== request || request.signal.aborted || getRevision() !== revision) { retryRanges = []; return; }
    const completed = new Set(result.definitions.map(item => item.offset));
    retryRanges = [...targets.filter(target => !completed.has(target.offset) && (refresh || !target.existing))
      .map(target => ({ start: target.start, end: target.offset })), ...otherPages];
    const edits = addDefinitions(result.definitions.map(item => ({ offset: item.offset, meaning: item.english, chinese: item.chinese, term: item.term })), definitionLanguagePreference.language);
    retryRanges = remapSelection(retryRanges, edits);
    const missing = targets.length - result.kept - result.definitions.length;
    const requests = aiUsage.snapshot().requests - requestsBefore;
    setStatus(() => t("status.summary", {
      ready: targets.length - missing, total: targets.length, kept: result.kept, cached: result.cached, requests,
    }) + (missing ? t("status.missing") : "") + (result.error ? " " + localizeError(result.error) : ""), missing ? "error" : "ok");
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
}
