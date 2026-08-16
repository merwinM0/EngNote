/**
 * main.ts - Assembly entry point: binds global events and initialises
 */
import { setStatus, sanitizeEnglish, readCookie, writeCookie } from "./util";
import {
  content,
  pasteBtn,
  clearBtn,
  translateBtn,
  setTranslateMode,
  setDeleteMode,
  isTranslateMode,
  isDeleteMode,
  render,
} from "./state";
import { COOKIE_KEY } from "./deepseek";
import { onFormat } from "./format";
import { onTranslateClick, onTermClick } from "./translate";
import { handleDeleteNote, toggleDeleteMode } from "./deleteNote";
import { refreshList, initDb, deselectEntry } from "./db";

const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const saveKeyBtn = document.getElementById("saveKeyBtn") as HTMLButtonElement;
const fontSizeBtn = document.getElementById("fontSizeBtn") as HTMLButtonElement;

// Font size cycling: starts at M (smallest), then L (largest), then S
const FONT_PRESETS = ["Large", "Medium", "Small"] as const;
let fontSizeIndex = 1; // start at Medium, which is now the smallest size
const FONT_SIZES: Record<string, string> = { Large: "20px", Medium: "14px", Small: "17px" };

function setFontSize(label: string) {
  content.style.fontSize = FONT_SIZES[label] ?? "14px";
  fontSizeBtn.textContent = "Aa · " + label.charAt(0);
}

fontSizeBtn.addEventListener("click", () => {
  fontSizeIndex = (fontSizeIndex + 1) % FONT_PRESETS.length;
  setFontSize(FONT_PRESETS[fontSizeIndex] ?? "Medium");
});

// ---------------- Paste ----------------
// Single click pastes directly (no confirmation modal). Pasting is treated as
// "new content": it deselects any selected saved article to avoid overwriting it.
pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    const { clean } = sanitizeEnglish(text);
    if (!clean) {
      setStatus("Clipboard is empty or contains no English", "error");
      return;
    }
    render(clean);
    deselectEntry(); // new content: deselect any selected saved article
    setStatus("✅ Pasted from clipboard and divided into paragraphs (new content; Save will create a new article)", "ok");
    setTimeout(() => setStatus(""), 2500);
  } catch {
    setStatus("Cannot read clipboard — check browser permission and retry", "error");
  }
});

// ---------------- Clear ----------------
clearBtn.addEventListener("click", () => {
  content.textContent = "";
  setDeleteMode(false);
  setTranslateMode(false);
  deselectEntry(); // after clearing, it's new-content state
  setStatus("Cleared (Save will create a new article instead of overwriting)", "ok");
  setTimeout(() => setStatus(""), 2000);
});

// ---------------- Content click dispatch ----------------
content.addEventListener("click", (ev) => {
  const target = (ev.target as HTMLElement)?.closest<HTMLElement>(
    ".term, .note"
  );
  if (!target) return;

  // Delete-translation mode: handle 『』 notes
  if (isDeleteMode() && target.classList.contains("note")) {
    ev.preventDefault();
    // Only allow removing finished translations (skip loading / error markers)
    if (!target.classList.contains("loading") && !target.classList.contains("error")) {
      handleDeleteNote(target as HTMLElement);
    }
    return;
  }

  // Select mode: select a word
  if (isTranslateMode() && target.classList.contains("term")) {
    ev.preventDefault();
    const id = Number(target.dataset.wordId);
    if (!Number.isNaN(id)) onTermClick(id);
  }
});

// ---------------- API Key cookie ----------------
apiKeyInput.addEventListener("input", () => {
  if (apiKeyInput.value !== readCookie(COOKIE_KEY)) {
    (document.getElementById("modeHint") as HTMLElement).textContent =
      "API Key changed — click 'Save Key' to store it in the cookie";
  }
});

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus("Please enter an API Key before saving", "error");
    return;
  }
  writeCookie(COOKIE_KEY, key);
  setStatus("✅ API Key saved to browser cookie", "ok");
  (document.getElementById("modeHint") as HTMLElement).textContent = "";
  setTimeout(() => setStatus(""), 2500);
});

// ---------------- Feature buttons ----------------
document.getElementById("formatBtn")!.addEventListener("click", onFormat);
translateBtn.addEventListener("click", onTranslateClick);
document.getElementById("deleteBtn")!.addEventListener("click", toggleDeleteMode);

// ---------------- Initialisation ----------------
function init() {
  const savedKey = readCookie(COOKIE_KEY) ?? "";
  if (savedKey) {
    apiKeyInput.value = savedKey;
    setStatus("Loaded API Key from cookie", "ok");
    setTimeout(() => setStatus(""), 2500);
  }
  initDb();
  refreshList();
  setFontSize("Medium");
}
init();
