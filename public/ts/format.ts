/**
 * format.ts - AI 整理（排版）
 */
import { setStatus } from "./util";
import { getCurrentText, render, formatBtn } from "./state";
import { callDeepSeek } from "./deepseek";

export async function onFormat() {
  const text = getCurrentText();
  if (!text) {
    setStatus("请先输入文本", "error");
    return;
  }
  formatBtn.disabled = true;
  formatBtn.textContent = "整理中…";
  setStatus("正在调用 DeepSeek 整理排版…");

  try {
    const system =
      "You are a text formatting assistant. " +
      "Reformat the user's English text into properly laid-out plain text. " +
      "Rules: join broken lines within a paragraph into a single line; separate paragraphs by exactly one blank line; " +
      "fix spacing around punctuation (, . ? ! ' \" ) ; capitalize the first word of each sentence; keep proper nouns. " +
      "Output ONLY the reformatted English text, with no explanations or extra text.";
    const formatted = await callDeepSeek(system, text);
    render(formatted);
    setStatus("✅ AI 整理完成", "ok");
    setTimeout(() => setStatus(""), 2500);
  } catch {
    /* 错误已在上层提示 */
  } finally {
    formatBtn.disabled = false;
    formatBtn.textContent = "✦ AI 整理";
  }
}
