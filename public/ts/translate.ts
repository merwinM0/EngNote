import { setStatus, errorMessage } from "./util";
import { content, wordsById, collectPickedIds, clearPicked, groupIds, groupText, setTranslateMode, isTranslateMode, togglePick, isBusy, setBusy, getRevision, addDefinitions } from "./state";
import { callDeepSeek, getStoredApiKey } from "./deepseek";
import { openAISettings } from "./aiSettings";
import { DICTIONARY_PROMPT, parseDictionaryResponse } from "./dictionary";
import { definitionLanguagePreference } from "./definitionPreference";
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
  if (announce && wasActive) setStatus("Definitions canceled. Existing notes have been kept.");
  return wasActive;
}
export function onTranslateClick() {
  if (isBusy() || isTranslateMode()) return;
  if (!wordsById.size) return setStatus("Paste an English article first.", "error");
  setTranslateMode(true);
  setStatus("");
}
export async function translateSelected() {
  if (isBusy()) return;
  const ids = collectPickedIds();
  if (!ids.length) return setStatus("Select a word or phrase first.", "error");
  if (!getStoredApiKey()) { openAISettings(); return setStatus("Use AI setup to add your DeepSeek API key first.", "error"); }
  const restoreFocus = document.activeElement?.id === "defineSelectedBtn";
  const request = new AbortController();
  activeRequest = request;
  const revision = getRevision();
  const groups = groupIds(ids);
  const targets = groups.map(group => ({ term: groupText(group), word: wordsById.get(group.at(-1)!)! }));
  clearPicked();
  for (const target of targets) target.word.el.classList.add("defining");
  setBusy(true);
  setStatus(`Finding English and Chinese definitions for ${targets.length} term(s)…`);
  try {
    const raw = await callDeepSeek(DICTIONARY_PROMPT, JSON.stringify(targets.map(target => target.term)), request.signal);
    const meanings = parseDictionaryResponse(raw);
    if (activeRequest !== request || request.signal.aborted || getRevision() !== revision) return;
    const definitions: Array<{ offset: number; meaning: string; chinese: string }> = [];
    for (const target of targets) {
      const meaning = meanings.get(target.term.toLowerCase());
      if (meaning) definitions.push({ offset: target.word.end, meaning: meaning.english, chinese: meaning.chinese });
    }
    const language = definitionLanguagePreference.language;
    addDefinitions(definitions, language);
    setStatus(`${definitions.length}/${targets.length} bilingual definitions added; ${language === "zh" ? "Chinese" : "English"} is shown first. Pages have been reflowed to stay within 3,000 characters.${definitions.length < targets.length ? " Select missing terms to retry." : ""}`, definitions.length ? "ok" : "error");
  } catch (error) {
    if (activeRequest === request && !request.signal.aborted && getRevision() === revision) setStatus(errorMessage(error), "error");
  } finally {
    // A canceled request must not unlock or reset a newer task.
    if (activeRequest === request) {
      activeRequest = null;
      for (const target of targets) target.word.el.classList.remove("defining");
      setBusy(false);
      setTranslateMode(false);
      if (restoreFocus && document.activeElement === document.body) content.focus({ preventScroll: true });
    }
  }
}
