import { setStatus, errorMessage } from "./util";
import { getCurrentText, render, formatBtn, isBusy, setBusy, getRevision } from "./state";
import { callDeepSeek } from "./deepseek";

export async function onFormat() {
  if (isBusy()) return;
  const text = getCurrentText();
  if (!text) return setStatus("Paste an English article first.", "error");
  // Formatting annotated text risks moving definitions away from their words.
  if (text.includes("『")) return setStatus("Tidy paragraphs before adding definitions. Existing notes have been kept intact.", "error");
  const revision = getRevision();
  setBusy(true);
  formatBtn.textContent = "Tidying…";
  setStatus("DeepSeek is tidying the paragraphs…");
  try {
    const result = await callDeepSeek("You format English text. Join broken lines, separate paragraphs with one blank line, and fix spacing around punctuation. Preserve every fact, number and word. Output only the formatted text; no markdown or explanations.", text);
    if (getRevision() === revision) { render(result); setStatus("Your paragraphs are ready.", "ok"); }
  } catch (error) { setStatus(errorMessage(error), "error"); }
  finally { setBusy(false); formatBtn.textContent = "✦ Tidy paragraphs"; }
}
