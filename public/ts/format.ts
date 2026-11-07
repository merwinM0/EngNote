import { setStatus, errorMessage, setToolLabel } from "./util";
import { msg, t } from "./i18n";
import { getPageText, editCurrentPage, formatBtn, isBusy, setBusy, getRevision } from "./state";
import { callDeepSeek } from "./deepseek";

let formatting = false;
export async function onFormat() {
  if (isBusy()) return;
  const text = getPageText();
  if (!text) return setStatus(msg("status.formatPasteFirst"), "error");
  // Formatting annotated text risks moving definitions away from their words.
  if (text.includes("『")) return setStatus(msg("status.formatHasNotes"), "error");
  const revision = getRevision();
  setBusy(true);
  formatting = true;
  setToolLabel(formatBtn, t("reader.tidying"));
  setStatus(msg("status.formatWorking"));
  try {
    const result = await callDeepSeek("You format English text. Join broken lines, separate paragraphs with one blank line, and fix spacing around punctuation. Preserve every fact, number and word. Output only the formatted text; no markdown or explanations.", text, undefined, { maxTokens: Math.min(4096, Math.max(512, Math.ceil(text.length * 1.2))) });
    if (getRevision() === revision) {
      // Page boundaries are not paragraph boundaries. Keep separators around this slice.
      const leading = text.match(/^\s*/)?.[0] ?? "";
      const trailing = text.match(/\s*$/)?.[0] ?? "";
      const formatted = leading + result.trim() + trailing;
      editCurrentPage(formatted, formatted.length);
      setStatus(msg("status.formatDone"), "ok");
    }
  } catch (error) { setStatus(() => errorMessage(error), "error"); }
  finally { formatting = false; setBusy(false); setToolLabel(formatBtn, t("reader.tidy")); }
}

window.addEventListener("ui-language-changed", () => {
  setToolLabel(formatBtn, t(formatting ? "reader.tidying" : "reader.tidy"));
});
