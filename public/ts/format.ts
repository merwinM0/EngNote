import { setStatus, errorMessage } from "./util";
import { getPageText, editCurrentPage, formatBtn, isBusy, setBusy, getRevision } from "./state";
import { callDeepSeek } from "./deepseek";

export async function onFormat() {
  if (isBusy()) return;
  const text = getPageText();
  if (!text) return setStatus("Paste an English article first.", "error");
  // Formatting annotated text risks moving definitions away from their words.
  if (text.includes("『")) return setStatus("Tidy paragraphs before adding definitions. Existing notes have been kept intact.", "error");
  const revision = getRevision();
  setBusy(true);
  formatBtn.textContent = "Tidying…";
  setStatus("DeepSeek is tidying the paragraphs…");
  try {
    const result = await callDeepSeek("You format English text. Join broken lines, separate paragraphs with one blank line, and fix spacing around punctuation. Preserve every fact, number and word. Output only the formatted text; no markdown or explanations.", text, undefined, { maxTokens: Math.min(4096, Math.max(512, Math.ceil(text.length * 1.2))) });
    if (getRevision() === revision) {
      // Page boundaries are not paragraph boundaries. Keep separators around this slice.
      const leading = text.match(/^\s*/)?.[0] ?? "";
      const trailing = text.match(/\s*$/)?.[0] ?? "";
      const formatted = leading + result.trim() + trailing;
      editCurrentPage(formatted, formatted.length);
      setStatus("This page has been tidied and repaginated. Other pages have been kept.", "ok");
    }
  } catch (error) { setStatus(errorMessage(error), "error"); }
  finally { setBusy(false); formatBtn.textContent = "✦ Tidy this page"; }
}
