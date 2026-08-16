/**
 * translate.ts - AI translation (word selection + definitions)
 */
import { el, setStatus } from "./util";
import {
  content,
  translateBtn,
  wordsById,
  loadingNotes,
  collectPickedIds,
  clearPicked,
  groupIds,
  groupText,
  setTranslateMode,
  isTranslateMode,
  togglePick,
} from "./state";
import { callDeepSeek } from "./deepseek";

// Single click toggles word selection (called from main's click dispatch)
export function onTermClick(id: number) {
  togglePick(id);
}

export function onTranslateClick() {
  if (!isTranslateMode()) {
    setTranslateMode(true);
    setStatus("Select mode: click words to select, then hit 'Translate Selected'");
    return;
  }
  translateSelected();
}

// Insert a "Translating..." loading marker after the given words
function insertLoadingNote(group: number[], animId: number) {
  const lastId = group[group.length - 1]!;
  const info = wordsById.get(lastId);
  if (!info?.el) return;
  const note = el("span", "note loading", "Translating.");
  info.el.after(note);
  loadingNotes.set(animId, note);

  let dots = 1;
  const timer = setInterval(() => {
    const n = loadingNotes.get(animId);
    if (!n) {
      clearInterval(timer);
      return;
    }
    dots = (dots % 3) + 1;
    n.textContent = "Translating" + ".".repeat(dots);
  }, 350);
  note.dataset.timerId = String(animId);
  (note as any)._timer = timer;
}

function replaceOrErrNote(animId: number, meaning?: string) {
  const note = loadingNotes.get(animId);
  if (!note) return;
  clearInterval((note as any)._timer);
  if (meaning) {
    note.classList.remove("loading");
    note.textContent = meaning;
    note.dataset.deletable = "1"; // mark as a removable translation
  } else {
    note.classList.remove("loading");
    note.classList.add("error");
    note.textContent = "Translation failed";
  }
  loadingNotes.delete(animId);
}

export async function translateSelected() {
  const ids = collectPickedIds();
  clearPicked();

  if (ids.length === 0) {
    setStatus("No words selected — click words first, then 'Translate Selected'", "error");
    return;
  }
  const groups = groupIds(ids);
  groups.forEach((g, gi) => insertLoadingNote(g, gi));

  translateBtn.disabled = true;
  translateBtn.textContent = "Translating…";
  setStatus(`Translating ${groups.length} term(s)…`);

  try {
    const terms = groups.map((g) => groupText(g));
    const system =
      "You are an English dictionary assistant. " +
      "For each given English word or phrase, give a SHORT English-only definition. " +
      "Reply with a JSON array of objects: {\"term\": string, \"meaning\": string}.\n" +
      "The \"meaning\" MUST be in English, concise, suitable for reading aid. " +
      "MUST NOT use Chinese or any other language.";
    const user =
      "Explain these terms (respond as JSON array, English-only meanings):\n" +
      terms.map((t) => `- ${t}`).join("\n");
    const raw = await callDeepSeek(system, user);

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const list = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Array<{
      term?: string;
      meaning?: string;
    }>;

    const byTerm = new Map<string, string>();
    for (const it of list)
      if (it.term && it.meaning) byTerm.set(it.term.trim(), it.meaning);

    let okCount = 0;
    groups.forEach((g, gi) => {
      const t = groupText(g);
      const meaning = byTerm.get(t);
      replaceOrErrNote(gi, meaning);
      if (meaning) okCount++;
    });
    setStatus(
      `✅ Translation done: ${okCount}/${groups.length} term(s)`,
      okCount === groups.length ? "ok" : "info"
    );
    if (okCount < groups.length)
      setTimeout(() => setStatus("Some terms failed to translate; you can retry", "error"), 2500);
  } catch {
    groups.forEach((_g, gi) => replaceOrErrNote(gi));
    setStatus("❌ Translation failed — check API Key or network", "error");
  } finally {
    translateBtn.disabled = false;
    setTranslateMode(false);
  }
}
