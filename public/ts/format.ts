import { setStatus, errorMessage, setToolLabel } from "./util";
import { msg, t } from "./i18n";
import { getPageText, editCurrentPage, formatBtn, isBusy, setBusy, getRevision } from "./state";
import { callDeepSeek } from "./deepseek";
import { PARAGRAPH_PROMPT, paragraphTidying } from "./paragraphTidying";

let formatting = false;
let activeRequest: AbortController | null = null;
window.addEventListener("reading-history-request", () => {
  if (!activeRequest) return;
  activeRequest.abort(); activeRequest = null; formatting = false; setBusy(false);
  setToolLabel(formatBtn, t("reader.tidy"));
});
export async function onFormat() {
  if (isBusy()) return;
  const text = getPageText();
  if (!text) return setStatus(msg("status.formatPasteFirst"), "error");
  // Formatting annotated text risks moving definitions away from their words.
  if (text.includes("『")) return setStatus(msg("status.formatHasNotes"), "error");
  const revision = getRevision();
  const request = new AbortController(); activeRequest = request;
  setBusy(true);
  formatting = true;
  setToolLabel(formatBtn, t("reader.tidying"));
  setStatus(msg("status.formatWorking"));
  try {
    const result = await callDeepSeek(PARAGRAPH_PROMPT, text, request.signal, { maxTokens: Math.min(8192, Math.max(512, Math.ceil(text.length * 1.2))) });
    if (activeRequest === request && !request.signal.aborted && getRevision() === revision) {
      const formatted = paragraphTidying(text, result);
      // Tidying is not typing at the end of the page: keep the current reading anchor.
      editCurrentPage(formatted.text, 0, false, formatted.edits);
      setStatus(msg("status.formatDone"), "ok");
    }
  } catch (error) { if (activeRequest === request && !request.signal.aborted) setStatus(() => errorMessage(error), "error"); }
  finally { if (activeRequest === request) { activeRequest = null; formatting = false; setBusy(false); setToolLabel(formatBtn, t("reader.tidy")); } }
}

window.addEventListener("ui-language-changed", () => {
  setToolLabel(formatBtn, t(formatting ? "reader.tidying" : "reader.tidy"));
});
