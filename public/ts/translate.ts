import { setStatus, errorMessage } from "./util";
import { content, wordsById, collectPickedIds, clearPicked, groupIds, groupText, setTranslateMode, isTranslateMode, togglePick, isBusy, setBusy, getRevision, addDefinitions } from "./state";
import { callDeepSeek, getStoredApiKey } from "./deepseek";
import { openAISettings } from "./aiSettings";
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
  setStatus(`Finding English definitions for ${targets.length} term(s)…`);
  try {
    const raw = await callDeepSeek(
      'You are an English dictionary assistant. The user provides a JSON array of terms. Return ONLY a JSON array of objects {"term": string, "meaning": string}, one for each term with its exact spelling. Give a short English-only definition. Do not include Chinese, markup, or the characters 『 and 』.',
      JSON.stringify(targets.map(target => target.term)), request.signal);
    const result: unknown = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? raw);
    if (!Array.isArray(result)) throw new Error("The dictionary response was invalid. Please try again.");
    const meanings = new Map<string, string>();
    for (const item of result) {
      if (typeof item === "object" && item !== null && typeof item.term === "string" && typeof item.meaning === "string"
        && /[A-Za-z]/.test(item.meaning) && !/[^\x20-\x7e\s\u00a0\u2010-\u201f\u2026]/.test(item.meaning)) {
        meanings.set(item.term.trim().toLowerCase(), item.meaning.trim().slice(0, 600));
      }
    }
    if (activeRequest !== request || request.signal.aborted || getRevision() !== revision) return;
    const definitions: Array<{ offset: number; meaning: string }> = [];
    for (const target of targets) {
      const meaning = meanings.get(target.term.toLowerCase());
      if (meaning) definitions.push({ offset: target.word.end, meaning });
    }
    addDefinitions(definitions);
    setStatus(`${definitions.length}/${targets.length} definitions added. Pages have been reflowed to stay within 3,000 characters.${definitions.length < targets.length ? " Select missing terms to retry." : ""}`, definitions.length ? "ok" : "error");
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
