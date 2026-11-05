import { setStatus, sanitizeEnglish, initDialogs } from "./util";
import { content, pasteBtn, clearBtn, translateBtn, setTranslateMode, setDeleteMode, isTranslateMode, isDeleteMode, isBusy, setBusy, render } from "./state";
import { KEY_STORAGE } from "./deepseek";
import { onFormat } from "./format";
import { onTranslateClick, onTermClick } from "./translate";
import { handleDeleteNote, toggleDeleteMode } from "./deleteNote";
import { refreshList, initDb, deselectEntry, confirmReplace } from "./db";
import { initAuth } from "./auth";

const apiKey = document.getElementById("apiKey") as HTMLInputElement;
const fontSizeBtn = document.getElementById("fontSizeBtn") as HTMLButtonElement;
const pasteModal = document.getElementById("pasteModal") as HTMLDialogElement;
const pasteText = document.getElementById("pasteText") as HTMLTextAreaElement;
const fonts = [{ label: "M", size: "20px" }, { label: "L", size: "23px" }, { label: "S", size: "17px" }];
let fontIndex = 0;
fontSizeBtn.addEventListener("click", () => {
  fontIndex = (fontIndex + 1) % fonts.length;
  const font = fonts[fontIndex]!;
  content.style.fontSize = font.size;
  fontSizeBtn.textContent = `Aa · ${font.label}`;
  fontSizeBtn.setAttribute("aria-label", `Reading size ${font.label}. Click for next size.`);
});
function importText(text: string) {
  if (text.length > 100000) return setStatus("Please use an article shorter than 100,000 characters.", "error");
  const { clean, hadBad } = sanitizeEnglish(text);
  if (!/[A-Za-z]/.test(clean)) return setStatus("No English text found. Paste an English article to begin.", "error");
  render(clean);
  deselectEntry();
  pasteModal.close();
  setStatus(hadBad ? "Article added. Unsupported characters were removed; numbers and punctuation were kept." : "A fresh page is ready. Save will create a new article.", "ok");
}
pasteBtn.addEventListener("click", async () => {
  if (isBusy() || !confirmReplace()) return;
  setBusy(true);
  try {
    const text = await navigator.clipboard.readText();
    if (text.trim()) importText(text);
    else { pasteText.value = ""; pasteModal.showModal(); }
  } catch { pasteText.value = ""; pasteModal.showModal(); }
  finally { setBusy(false); }
});
document.getElementById("pasteForm")!.addEventListener("submit", event => { event.preventDefault(); if (!isBusy()) importText(pasteText.value); });
clearBtn.addEventListener("click", () => {
  if (isBusy() || !confirmReplace()) return;
  render(""); deselectEntry(); setStatus("A fresh page. Your saved collection has not been changed.", "ok");
});
function activateTerm(target: EventTarget | null) {
  if (isBusy() || !(target instanceof Element)) return;
  const term = target.closest<HTMLElement>(".term, .note");
  if (!term) return;
  if (isDeleteMode() && term.classList.contains("note")) { handleDeleteNote(term); return; }
  if (isTranslateMode() && term.classList.contains("term")) onTermClick(Number(term.dataset.wordId));
}
content.addEventListener("click", event => activateTerm(event.target));
content.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target instanceof Element && event.target.matches(".term, .note")) { event.preventDefault(); activateTerm(event.target); }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !isBusy()) { setTranslateMode(false); setDeleteMode(false); }
});

// Migrate the old cookie to tab-scoped storage, then remove it. It must not be sent to our server.
try {
  const oldKey = document.cookie.split("; ").find(cookie => cookie.startsWith("deepseek_api_key="));
  apiKey.value = sessionStorage.getItem(KEY_STORAGE) ?? (oldKey ? decodeURIComponent(oldKey.slice("deepseek_api_key=".length)) : "");
  if (oldKey) { sessionStorage.setItem(KEY_STORAGE, apiKey.value); document.cookie = "deepseek_api_key=; path=/; max-age=0; SameSite=Lax"; }
} catch { /* Optional storage; the key input still works. */ }
document.getElementById("saveKeyBtn")!.addEventListener("click", () => {
  if (!apiKey.value.trim()) return setStatus("Enter a DeepSeek key first.", "error");
  try { sessionStorage.setItem(KEY_STORAGE, apiKey.value.trim()); setStatus("Key kept for this tab. It is sent only to DeepSeek.", "ok"); }
  catch { setStatus("Tab storage is unavailable. You can still use the key until this page is refreshed.", "error"); }
});
document.getElementById("forgetKeyBtn")!.addEventListener("click", () => {
  apiKey.value = "";
  try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* optional */ }
  setStatus("Key forgotten.", "ok");
});
document.getElementById("formatBtn")!.addEventListener("click", onFormat);
translateBtn.addEventListener("click", onTranslateClick);
document.getElementById("deleteBtn")!.addEventListener("click", () => { if (!isBusy()) toggleDeleteMode(); });
initDialogs(); initDb(); initAuth(); void refreshList();
