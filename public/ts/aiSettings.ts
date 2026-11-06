import { setStatus } from "./util";
import { openPanel, closePanel } from "./panels";
import { definitionLanguagePreference } from "./definitionPreference";

export const KEY_STORAGE = "er_deepseek_tab_key";
const panel = document.getElementById("aiPanel")!;
const trigger = document.getElementById("aiSettingsBtn") as HTMLButtonElement;
const input = document.getElementById("apiKey") as HTMLInputElement;
const showButton = document.getElementById("showKeyBtn") as HTMLButtonElement;
const message = document.getElementById("aiMessage")!;
const languageButton = document.getElementById("definitionLanguageBtn") as HTMLButtonElement;
const languageHint = document.getElementById("definitionLanguageHint")!;
let activeKey = "";
let languageStored = true;

/** The open note contains a draft, not the key used by in-flight AI requests. */
export const getApiKey = () => activeKey;

function updateTrigger() {
  trigger.textContent = activeKey ? "AI setup ✓" : "AI setup";
  trigger.title = activeKey ? "DeepSeek key is set for this tab" : "Set up your DeepSeek key";
}

function updateDefinitionLanguage() {
  const language = definitionLanguagePreference.language, chinese = language === "zh";
  languageButton.setAttribute("aria-pressed", String(chinese));
  languageButton.title = `New AI definitions start in ${chinese ? "Chinese" : "English"}. Click to use ${chinese ? "English" : "Chinese"}.`;
  for (const choice of languageButton.querySelectorAll<HTMLElement>("[data-definition-language]")) {
    choice.classList.toggle("is-active", choice.dataset.definitionLanguage === language);
  }
  languageHint.textContent = `New AI definitions start in ${chinese ? "Chinese" : "English"}. Existing notes keep their language.`
    + (languageStored ? "" : " Browser storage is blocked; this choice only lasts until you leave or refresh.");
}

function flash(text: string, ok = false) {
  message.textContent = text;
  message.hidden = !text;
  message.className = `auth-msg ${ok ? "ok" : "error"}`;
}

function maskKey() {
  input.type = "password";
  showButton.textContent = "Show key";
  showButton.setAttribute("aria-pressed", "false");
}

export function openAISettings() { openPanel("aiPanel"); }

function restoreKey() {
  try { activeKey = sessionStorage.getItem(KEY_STORAGE) ?? ""; }
  catch { /* Optional tab storage. The input still works without it. */ }

  // Retire the old cookie even when tab storage is blocked.
  try {
    const legacy = document.cookie.split("; ").find(cookie => cookie.startsWith("deepseek_api_key="));
    if (legacy) {
      try {
        if (!activeKey) activeKey = decodeURIComponent(legacy.slice("deepseek_api_key=".length));
        sessionStorage.setItem(KEY_STORAGE, activeKey);
      } finally {
        document.cookie = "deepseek_api_key=; path=/; max-age=0; SameSite=Lax";
      }
    }
  } catch { /* Legacy storage is not required. Never log the key. */ }
  updateTrigger();
}

export function initAISettings() {
  restoreKey();
  languageStored = definitionLanguagePreference.restore();
  updateDefinitionLanguage();
  languageButton.addEventListener("click", () => {
    languageStored = definitionLanguagePreference.toggle();
    updateDefinitionLanguage();
  });
  panel.addEventListener("panel-open", () => {
    input.value = activeKey;
    input.removeAttribute("aria-invalid");
    maskKey();
    flash("");
    updateDefinitionLanguage();
  });
  input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); flash(""); });
  showButton.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    showButton.textContent = show ? "Hide key" : "Show key";
    showButton.setAttribute("aria-pressed", String(show));
  });
  document.getElementById("aiForm")!.addEventListener("submit", event => {
    event.preventDefault();
    const key = input.value.trim();
    if (!key) {
      input.setAttribute("aria-invalid", "true");
      flash("Write your DeepSeek key on the line first.");
      input.focus();
      return;
    }
    activeKey = key;
    updateTrigger();
    try {
      sessionStorage.setItem(KEY_STORAGE, key);
      closePanel("aiPanel");
      setStatus("AI key kept for this tab. It will be sent only to DeepSeek.", "ok");
    } catch {
      flash("Your key is ready for this page, but tab storage is blocked. You will need to enter it again after refreshing.");
    }
  });
  document.getElementById("forgetKeyBtn")!.addEventListener("click", () => {
    activeKey = "";
    input.value = "";
    input.removeAttribute("aria-invalid");
    maskKey();
    updateTrigger();
    try {
      sessionStorage.removeItem(KEY_STORAGE);
      flash("Key forgotten. You can write a new one whenever you need it.", true);
    } catch {
      flash("Key cleared for this page. Browser storage could not be cleared; please check this site's storage settings.");
    }
    input.focus();
  });
  panel.addEventListener("panel-close", () => {
    input.value = "";
    input.removeAttribute("aria-invalid");
    maskKey();
  });
}
