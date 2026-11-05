import { api, jsonBody, setStatus, errorMessage } from "./util";
import { closePanel } from "./panels";
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
let cooldownUntil = 0;
let cooldownTimer: ReturnType<typeof setInterval> | undefined;
export const isLoggedIn = () => email !== null;
export const getEmail = () => email;
function applySession(value: string | null) {
  email = value;
  document.getElementById("signedInAccount")!.hidden = !value;
  document.getElementById("accountEmail")!.textContent = value ?? "";
  (document.getElementById("authForm") as HTMLFormElement).hidden = !!value;
  document.getElementById("authMethodTabs")!.hidden = !!value;
  accountButton.textContent = value ? "Account" : "Login";
  accountButton.title = value ? `Signed in as ${value}` : "Sign in to save your articles";
  window.dispatchEvent(new Event("session-changed"));
}
function flash(message: string, ok = false) {
  authMsg.textContent = message;
  authMsg.hidden = !message;
  authMsg.className = `auth-msg ${ok ? "ok" : "error"}`;
}
function setMode(value: typeof mode) {
  if (submitting) return;
  mode = value;
  tabLogin.classList.toggle("active", value === "login");
  tabRegister.classList.toggle("active", value === "register");
  tabLogin.setAttribute("aria-pressed", String(value === "login"));
  tabRegister.setAttribute("aria-pressed", String(value === "register"));
  document.getElementById("authTitle")!.textContent = value === "login" ? "Welcome back." : "Start your collection.";
  confirmAuthBtn.textContent = value === "login" ? "Login" : "Register";
  document.getElementById("authCodeField")!.hidden = value === "login";
  authCode.required = value === "register";
  authPassword.autocomplete = value === "login" ? "current-password" : "new-password";
  authPwdError.hidden = true;
  flash("");
}
function updateCooldown() {
  const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  sendCodeBtn.disabled = remaining > 0;
  sendCodeBtn.textContent = remaining ? `Retry in ${remaining}s` : "Send code";
  if (!remaining) clearInterval(cooldownTimer);
}
async function requestCode() {
  if (!authEmail.value.trim() || !authEmail.validity.valid) { flash("Enter a valid email address first."); authEmail.focus(); return; }
  sendCodeBtn.disabled = true;
  sendCodeBtn.textContent = "Sending…";
  try {
    const data = await api<{ devCode?: string }>("/api/auth/send-code", { method: "POST", ...jsonBody({ email: authEmail.value }) });
    flash(data.devCode ? `Local development code: ${data.devCode}` : "Code sent. Please check your inbox.", true);
    cooldownUntil = Date.now() + 60000;
    cooldownTimer = setInterval(updateCooldown, 1000);
  } catch (error) { flash(errorMessage(error)); }
  finally { updateCooldown(); }
}
async function submit(event: SubmitEvent) {
  event.preventDefault();
  if (submitting) return;
  if (!authEmail.value.trim() || !authEmail.validity.valid) { flash("Enter a valid email address."); authEmail.focus(); return; }
  if (authPassword.value.length < 6 || authPassword.value.length > 128) { flash("Use a password of 6–128 characters."); authPassword.focus(); return; }
  if (mode === "register" && !/^\d{6}$/.test(authCode.value.trim())) { flash("Enter the 6-digit verification code."); authCode.focus(); return; }
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
      setStatus(`Welcome back, ${data.email}.`, "ok");
    } else {
      submitting = false;
      setMode("login");
      flash("Account created. You can now log in.", true);
      authPassword.value = "";
      authPassword.focus();
    }
  } catch (error) {
    authPwdError.textContent = errorMessage(error);
    authPwdError.hidden = false;
  } finally {
    submitting = false;
    confirmAuthBtn.disabled = false;
    tabLogin.disabled = tabRegister.disabled = false;
  }
}
export function initAuth() {
  // Old bearer tokens are deliberately retired; sessions now use HttpOnly cookies.
  try { localStorage.removeItem("er_auth_token"); localStorage.removeItem("er_auth_email"); } catch { /* storage can be blocked */ }
  logoutBtn.addEventListener("click", async () => {
    if (!email) return;
    logoutBtn.disabled = true;
    try {
      await api("/api/auth/logout", { method: "POST" });
      applySession(null); setMode("login");
      if (authPanel.open) authEmail.focus();
      setStatus("You are logged out.", "ok");
    } catch (error) { setStatus(errorMessage(error), "error"); }
    finally { logoutBtn.disabled = false; }
  });
  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));
  sendCodeBtn.addEventListener("click", requestCode);
  document.getElementById("authForm")!.addEventListener("submit", event => { void submit(event as SubmitEvent); });
  authPanel.addEventListener("panel-close", () => { authPassword.value = ""; authCode.value = ""; });
  for (const input of [authEmail, authPassword]) input.addEventListener("input", () => { authPwdError.hidden = true; });
  window.addEventListener("session-expired", () => { if (email) { applySession(null); setStatus("Your session has expired. Please log in again.", "error"); } });
  void api<{ email: string }>("/api/auth/me").then(data => applySession(data.email)).catch(() => applySession(null));
}
