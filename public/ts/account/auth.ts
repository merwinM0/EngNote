import { api, jsonBody, setStatus, errorMessage } from "../ui/util";
import { closePanel, openPanel } from "../ui/panels";
import { msg, setUIText, t } from "../ui/i18n";
import type { UIMessage } from "../ui/i18n";
const authPanel = document.getElementById("authPanel") as HTMLDialogElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;
const accountButton = document.getElementById("authBtn") as HTMLButtonElement;
const tabLogin = document.getElementById("tabLogin") as HTMLButtonElement;
const tabRegister = document.getElementById("tabRegister") as HTMLButtonElement;
const authEmail = document.getElementById("authEmail") as HTMLInputElement;
const authCode = document.getElementById("authCode") as HTMLInputElement;
const authPassword = document.getElementById("authPassword") as HTMLInputElement;
const authPwdError = document.getElementById("authPwdError")!;
const authMsg = document.getElementById("authMsg")!;
const sendCodeBtn = document.getElementById("sendCodeBtn") as HTMLButtonElement;
const confirmAuthBtn = document.getElementById("confirmAuthBtn") as HTMLButtonElement;
let mode: "login" | "register" = "login";
let email: string | null = null;
let submitting = false;
let sendingCode = false;
let cooldownUntil = 0;
let cooldownTimer: ReturnType<typeof setInterval> | undefined;
let sessionReady = false;
let sessionRevision = 0;
let sessionRequest = 0;
export const isLoggedIn = () => email !== null;
export const getEmail = () => email;
export const isSessionReady = () => sessionReady;
export function openLogin() { setMode("login"); openPanel("authPanel"); }
function applySession(value: string | null) {
  const changed = !sessionReady || email !== value;
  email = value; sessionReady = true; sessionRevision++;
  document.getElementById("signedInAccount")!.hidden = !value;
  document.getElementById("accountEmail")!.textContent = value ?? "";
  (document.getElementById("authForm") as HTMLFormElement).hidden = !!value;
  document.getElementById("authMethodTabs")!.hidden = !!value;
  accountButton.textContent = t(value ? "reader.account" : "reader.login");
  accountButton.title = t(value ? "auth.signedInAs" : "auth.signInTitle", value ? { email: value } : undefined);
  if (changed) window.dispatchEvent(new Event("session-changed"));
}
async function refreshSession() {
  const revision = sessionRevision, request = ++sessionRequest;
  try {
    const data = await api<{ email: string }>("/api/auth/me");
    if (request === sessionRequest && revision === sessionRevision) applySession(data.email);
  } catch {
    if (request === sessionRequest && revision === sessionRevision && !sessionReady) applySession(null);
  }
}
function flash(message: UIMessage, ok = false) {
  authMsg.hidden = !setUIText(authMsg, message);
  authMsg.className = `auth-msg ${ok ? "ok" : "error"}`;
}
function setMode(value: typeof mode) {
  if (submitting) return;
  mode = value;
  tabLogin.classList.toggle("active", value === "login");
  tabRegister.classList.toggle("active", value === "register");
  tabLogin.setAttribute("aria-pressed", String(value === "login"));
  tabRegister.setAttribute("aria-pressed", String(value === "register"));
  document.getElementById("authTitle")!.textContent = t(value === "login" ? "auth.welcomeBack" : "auth.startCollection");
  confirmAuthBtn.textContent = t(value === "login" ? "auth.login" : "auth.register");
  document.getElementById("authCodeField")!.hidden = value === "login";
  authCode.required = value === "register";
  authPassword.autocomplete = value === "login" ? "current-password" : "new-password";
  authPwdError.hidden = true;
  flash("");
}
function updateCooldown() {
  const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  sendCodeBtn.disabled = sendingCode || remaining > 0;
  sendCodeBtn.textContent = sendingCode ? t("auth.sending") : remaining ? t("auth.retryIn", { seconds: remaining }) : t("auth.sendCode");
  if (!remaining) clearInterval(cooldownTimer);
}
async function requestCode() {
  if (sendingCode || cooldownUntil > Date.now()) return;
  if (!authEmail.value.trim() || !authEmail.validity.valid) { flash(msg("auth.emailFirst")); authEmail.focus(); return; }
  sendingCode = true;
  updateCooldown();
  try {
    const data = await api<{ devCode?: string }>("/api/auth/send-code", { method: "POST", ...jsonBody({ email: authEmail.value }) });
    flash(data.devCode ? msg("auth.devCode", { code: data.devCode }) : msg("auth.checkInbox"), true);
    cooldownUntil = Date.now() + 60000;
    cooldownTimer = setInterval(updateCooldown, 1000);
  } catch (error) { flash(() => errorMessage(error)); }
  finally { sendingCode = false; updateCooldown(); }
}
async function submit(event: SubmitEvent) {
  event.preventDefault();
  if (submitting) return;
  if (!authEmail.value.trim() || !authEmail.validity.valid) { flash(msg("auth.validEmail")); authEmail.focus(); return; }
  if (authPassword.value.length < 6 || authPassword.value.length > 128) { flash(msg("auth.passwordLength")); authPassword.focus(); return; }
  if (mode === "register" && !/^\d{6}$/.test(authCode.value.trim())) { flash(msg("auth.codeLength")); authCode.focus(); return; }
  submitting = true;
  confirmAuthBtn.disabled = true;
  tabLogin.disabled = tabRegister.disabled = true;
  authPwdError.hidden = true;
  const currentMode = mode;
  try {
    const data = await api<{ email: string }>(`/api/auth/${currentMode}`, { method: "POST", ...jsonBody({ email: authEmail.value, password: authPassword.value, code: authCode.value }) });
    if (currentMode === "login") {
      applySession(data.email);
      closePanel("authPanel");
      setStatus(msg("auth.welcomeUser", { email: data.email }), "ok");
    } else {
      submitting = false;
      setMode("login");
      flash(msg("auth.accountCreated"), true);
      authPassword.value = "";
      authPassword.focus();
    }
  } catch (error) {
    setUIText(authPwdError, () => errorMessage(error));
    authPwdError.hidden = false;
  } finally {
    submitting = false;
    confirmAuthBtn.disabled = false;
    tabLogin.disabled = tabRegister.disabled = false;
  }
}
export function initAuth() {
  accountButton.textContent = t("reader.login");
  accountButton.title = t("auth.signInTitle");
  updateCooldown();
  // Old bearer tokens are deliberately retired; sessions now use HttpOnly cookies.
  try { localStorage.removeItem("er_auth_token"); localStorage.removeItem("er_auth_email"); } catch { /* storage can be blocked */ }
  logoutBtn.addEventListener("click", async () => {
    if (!email) return;
    logoutBtn.disabled = true;
    try {
      await api("/api/auth/logout", { method: "POST" });
      applySession(null); setMode("login");
      if (authPanel.open) authEmail.focus();
      setStatus(msg("auth.loggedOut"), "ok");
    } catch (error) { setStatus(() => errorMessage(error), "error"); }
    finally { logoutBtn.disabled = false; }
  });
  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));
  sendCodeBtn.addEventListener("click", requestCode);
  document.getElementById("authForm")!.addEventListener("submit", event => { void submit(event as SubmitEvent); });
  authPanel.addEventListener("panel-close", () => { authPassword.value = ""; authCode.value = ""; });
  for (const input of [authEmail, authPassword]) input.addEventListener("input", () => { authPwdError.hidden = true; });
  window.addEventListener("session-expired", () => { if (email) { applySession(null); setStatus(msg("auth.sessionExpired"), "error"); } });
  window.addEventListener("ui-language-changed", () => {
    accountButton.textContent = t(email ? "reader.account" : "reader.login");
    if (email) accountButton.title = t("auth.signedInAs", { email });
    else accountButton.title = t("auth.signInTitle");
    document.getElementById("authTitle")!.textContent = t(mode === "login" ? "auth.welcomeBack" : "auth.startCollection");
    confirmAuthBtn.textContent = t(mode === "login" ? "auth.login" : "auth.register");
    updateCooldown();
  });
  window.addEventListener("focus", () => { void refreshSession(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshSession(); });
  void refreshSession();
}
