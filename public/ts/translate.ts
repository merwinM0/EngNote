import { el, setStatus, errorMessage } from "./util";
import { content, translateBtn, wordsById, loadingNotes, collectPickedIds, clearPicked, groupIds, groupText, setTranslateMode, isTranslateMode, togglePick, isBusy, setBusy, getRevision } from "./state";
import { callDeepSeek, getStoredApiKey } from "./deepseek";
export const onTermClick = (id: number) => togglePick(id);
export function onTranslateClick() {
  if (isBusy()) return;
  if (!wordsById.size) return setStatus("Paste an English article first.", "error");
  if (!isTranslateMode()) { setTranslateMode(true); return; }
  void translateSelected();
}

export async function translateSelected() {
  if (isBusy()) return;
  const ids = collectPickedIds();
  if (!ids.length) return setStatus("Select a word or phrase first.", "error");
  if (!getStoredApiKey()) return setStatus("Open AI tools and enter your DeepSeek API key first.", "error");
  const revision = getRevision();
  const groups = groupIds(ids);
  const terms = groups.map(groupText);
  clearPicked();
  for (const note of content.querySelectorAll(".note.error")) note.remove();
  groups.forEach((group, index) => {
    const word = wordsById.get(group.at(-1)!);
    if (!word) return;
    const note = el("span", "note loading", "Defining…");
    word.el.after(note);
    loadingNotes.set(index, note);
  });
  setBusy(true);
  translateBtn.textContent = "Defining…";
  setStatus(`Finding English definitions for ${groups.length} term(s)…`);
  try {
    const raw = await callDeepSeek(
      'You are an English dictionary assistant. The user provides a JSON array of terms. Return ONLY a JSON array of objects {"term": string, "meaning": string}, one for each term with its exact spelling. Give a short English-only definition. Do not include Chinese, markup, or the characters 『 and 』.',
      JSON.stringify(terms));
    const result: unknown = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? raw);
    if (!Array.isArray(result)) throw new Error("The dictionary response was invalid. Please try again.");
    const meanings = new Map<string, string>();
    for (const item of result) {
      if (typeof item === "object" && item !== null && typeof item.term === "string" && typeof item.meaning === "string"
        && /[A-Za-z]/.test(item.meaning) && !/[^\x20-\x7e\s\u00a0\u2010-\u201f\u2026]/.test(item.meaning)) {
        meanings.set(item.term.trim().toLowerCase(), item.meaning.trim().slice(0, 600));
      }
    }
    if (getRevision() !== revision) return;
    let count = 0;
    groups.forEach((_, index) => {
      const note = loadingNotes.get(index);
      const meaning = meanings.get(terms[index]!.toLowerCase());
      if (!note) return;
      note.classList.remove("loading");
      if (meaning) { note.textContent = meaning; count++; }
      else { note.classList.add("error"); note.textContent = "No definition — select the word to retry"; }
    });
    setStatus(`${count}/${groups.length} definitions added.${count < groups.length ? " Select missing terms to retry." : ""}`, count ? "ok" : "error");
  } catch (error) {
    if (getRevision() === revision) {
      loadingNotes.forEach(note => note.remove());
      setStatus(errorMessage(error), "error");
    }
  } finally {
    loadingNotes.clear();
    setBusy(false);
    setTranslateMode(false);
  }
}
