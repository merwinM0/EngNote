/**
 * translate.ts - AI 翻译（选词 + 释义）
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

// 单击切换单词选中（供 main 的点击分发调用）
export function onTermClick(id: number) {
  togglePick(id);
}

export function onTranslateClick() {
  if (!isTranslateMode()) {
    setTranslateMode(true);
    setStatus("已进入选词模式：单击单词选中，再点「翻译所选」");
    return;
  }
  translateSelected();
}

// 在指定单词后插入「Translating...」loading 标记
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
    note.dataset.deletable = "1"; // 标记为可删除译文
  } else {
    note.classList.remove("loading");
    note.classList.add("error");
    note.textContent = "翻译失败";
  }
  loadingNotes.delete(animId);
}

export async function translateSelected() {
  const ids = collectPickedIds();
  clearPicked();

  if (ids.length === 0) {
    setStatus("未选中任何单词，请先单击选中，再点「翻译所选」", "error");
    return;
  }
  const groups = groupIds(ids);
  groups.forEach((g, gi) => insertLoadingNote(g, gi));

  translateBtn.disabled = true;
  translateBtn.textContent = "翻译中…";
  setStatus(`正在翻译 ${groups.length} 个词条…`);

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
      `✅ 翻译完成：成功 ${okCount}/${groups.length} 个词条`,
      okCount === groups.length ? "ok" : "info"
    );
    if (okCount < groups.length)
      setTimeout(() => setStatus("部分词条翻译失败，可重试", "error"), 2500);
  } catch {
    groups.forEach((_g, gi) => replaceOrErrNote(gi));
    setStatus("❌ 翻译失败，请检查 API Key 或网络", "error");
  } finally {
    translateBtn.disabled = false;
    setTranslateMode(false);
  }
}
