import { getDraftEntry } from "./db";
import { msg, t } from "./i18n";
import { definitionViews, getCurrentText, getDocumentFormatting, isBusy } from "./state";
import { errorMessage, setStatus } from "./util";
import { createWordDocument, WORD_DOCUMENT_TYPE, wordExportFilename } from "./wordExport";

export function initWordExport(): void {
  const button = document.getElementById("exportWordBtn");
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener("click", () => {
    if (isBusy()) return;
    const text = getCurrentText();
    if (!text.trim()) return setStatus(msg("status.pasteFirst"), "error");
    let url: string | undefined;
    try {
      const title = getDraftEntry()?.title ?? "";
      const filename = wordExportFilename(title);
      const bytes = createWordDocument(text, definitionViews.snapshot(), title, getDocumentFormatting());
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: WORD_DOCUMENT_TYPE });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setStatus(msg("export.started", { filename }), "ok");
    } catch (error) {
      setStatus(() => t("export.failed", { error: errorMessage(error) }), "error");
    } finally {
      // Keep the blob alive until the browser has accepted the download.
      if (url) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    }
  });
}
