import { setStatus } from "./util";
import { openPanel, closePanel } from "./panels";
import { definitionLanguagePreference } from "./definitionPreference";
import { aiUsage } from "./aiUsage";
import { dictionaryCache } from "./dictionaryCache";
import { describeAIUsageLocalized, msg, t } from "./i18n";
import type { MessageKey } from "./i18n";

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
let lastFlash: { key: MessageKey; params?: Record<string, string | number>; ok: boolean } | null = null;
let lastCacheRemoved: boolean | null = null;

/** The open note contains a draft, not the key used by in-flight AI requests. */
export const getApiKey = () => activeKey;

function updateTrigger() {
  trigger.textContent = activeKey ? `${t("reader.aiSetup")} ✓` : t("reader.aiSetup");
  trigger.title = t(activeKey ? "ai.triggerSetTitle" : "ai.triggerTitle");
}

function updateDefinitionLanguage() {
  const language = definitionLanguagePreference.language, chinese = language === "zh";
  languageButton.setAttribute("aria-pressed", String(chinese));
  languageButton.title = t("ai.definitionToggle", {
    current: t(chinese ? "ui.chinese" : "ui.english"), next: t(chinese ? "ui.english" : "ui.chinese"),
  });
  languageButton.setAttribute("aria-label", languageButton.title);
  for (const choice of languageButton.querySelectorAll<HTMLElement>("[data-definition-language]")) {
    choice.classList.toggle("is-active", choice.dataset.definitionLanguage === language);
  }
  languageHint.textContent = t(chinese ? "ai.definitionHintZh" : "ai.definitionHintEn")
    + (languageStored ? "" : t("ai.definitionStorage"));
}

function flash(key: MessageKey | null, params?: Record<string, string | number>, ok = false) {
  lastFlash = key ? { key, params, ok } : null;
  message.textContent = key ? t(key, params) : "";
  message.hidden = !key;
  message.className = `auth-msg ${ok ? "ok" : "error"}`;
}

function showCacheMessage(removed: boolean | null) {
  lastCacheRemoved = removed;
  const element = document.getElementById("dictionaryCacheMessage")!;
  element.textContent = removed === null ? "" : t(removed ? "ai.cacheCleared" : "ai.cacheClearFailed");
  element.hidden = removed === null;
}

function maskKey() {
  input.type = "password";
  showButton.textContent = t("ai.showKey");
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
  maskKey();
  dictionaryCache.restore();
  const usageSummary = document.getElementById("aiUsageSummary")!;
  const updateUsage = () => { usageSummary.textContent = describeAIUsageLocalized(aiUsage.snapshot()); };
  aiUsage.restore(); updateUsage(); aiUsage.subscribe(updateUsage);
  document.getElementById("clearDictionaryCacheBtn")!.addEventListener("click", () => {
    showCacheMessage(dictionaryCache.clear());
  });
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
    flash(null);
    updateDefinitionLanguage();
  });
  input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); flash(null); });
  showButton.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    showButton.textContent = t(show ? "ai.hideKey" : "ai.showKey");
    showButton.setAttribute("aria-pressed", String(show));
  });
  document.getElementById("aiForm")!.addEventListener("submit", event => {
    event.preventDefault();
    const key = input.value.trim();
    if (!key) {
      input.setAttribute("aria-invalid", "true");
      flash("ai.keyMissing");
      input.focus();
      return;
    }
    activeKey = key;
    updateTrigger();
    try {
      sessionStorage.setItem(KEY_STORAGE, key);
      closePanel("aiPanel");
      setStatus(msg("ai.keySaved"), "ok");
    } catch {
      flash("ai.keySavedStorageBlocked");
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
      flash("ai.keyForgotten", undefined, true);
    } catch {
      flash("ai.keyForgottenBlocked");
    }
    input.focus();
  });
  panel.addEventListener("panel-close", () => {
    input.value = "";
    input.removeAttribute("aria-invalid");
    maskKey();
  });
  window.addEventListener("ui-language-changed", () => {
    updateTrigger();
    updateDefinitionLanguage();
    updateUsage();
    showButton.textContent = t(input.type === "text" ? "ai.hideKey" : "ai.showKey");
    if (lastFlash) flash(lastFlash.key, lastFlash.params, lastFlash.ok);
    showCacheMessage(lastCacheRemoved);
  });
}
