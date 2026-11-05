import { api, jsonBody, setStatus, errorMessage } from "./util";
const authModal = document.getElementById("authModal") as HTMLDialogElement;
const authBtn = document.getElementById("authBtn") as HTMLButtonElement;
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
  authBtn.textContent = value ? "Logout" : "Login";
  authBtn.title = value ?? "Sign in to save your pages";
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
  if (!authEmail.reportValidity()) return;
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
  submitting = true;
  confirmAuthBtn.disabled = true;
  tabLogin.disabled = tabRegister.disabled = true;
  authPwdError.hidden = true;
  const currentMode = mode;
  try {
    const data = await api<{ email: string }>(`/api/auth/${currentMode}`, { method: "POST", ...jsonBody({ email: authEmail.value, password: authPassword.value, code: authCode.value }) });
    if (currentMode === "login") {
      applySession(data.email);
      authModal.close();
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
  authBtn.addEventListener("click", async () => {
    if (!email) { setMode("login"); authModal.showModal(); return; }
    authBtn.disabled = true;
    try { await api("/api/auth/logout", { method: "POST" }); applySession(null); setStatus("You are logged out.", "ok"); }
    catch (error) { setStatus(errorMessage(error), "error"); }
    finally { authBtn.disabled = false; }
  });
  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));
  sendCodeBtn.addEventListener("click", requestCode);
  document.getElementById("authForm")!.addEventListener("submit", event => { void submit(event as SubmitEvent); });
  authModal.addEventListener("close", () => { authPassword.value = ""; authCode.value = ""; });
  for (const input of [authEmail, authPassword]) input.addEventListener("input", () => { authPwdError.hidden = true; });
  window.addEventListener("session-expired", () => { if (email) { applySession(null); setStatus("Your session has expired. Please log in again.", "error"); } });
  void api<{ email: string }>("/api/auth/me").then(data => applySession(data.email)).catch(() => applySession(null));
}
