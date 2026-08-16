/**
 * format.ts - AI formatting (layout)
 */
import { setStatus } from "./util";
import { getCurrentText, render, formatBtn } from "./state";
import { callDeepSeek } from "./deepseek";

export async function onFormat() {
  const text = getCurrentText();
  if (!text) {
    setStatus("Please paste some text first", "error");
    return;
  }
  formatBtn.disabled = true;
  formatBtn.textContent = "Formatting…";
  setStatus("Calling DeepSeek to format…");

  try {
    const system =
      "You are a text formatting assistant. " +
      "Reformat the user's English text into properly laid-out plain text. " +
      "Rules: join broken lines within a paragraph into a single line; separate paragraphs by exactly one blank line; " +
      "fix spacing around punctuation (, . ? ! ' \" ) ; capitalize the first word of each sentence; keep proper nouns. " +
      "Output ONLY the reformatted English text, with no explanations or extra text.";
    const formatted = await callDeepSeek(system, text);
    render(formatted);
    setStatus("✅ Formatting complete", "ok");
    setTimeout(() => setStatus(""), 2500);
  } catch {
    /* errors already surfaced above */
  } finally {
    formatBtn.disabled = false;
    formatBtn.textContent = "✦ Format";
  }
}
