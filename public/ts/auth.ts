/**
 * auth.ts - Frontend email registration / login UI.
 *
 * Manages the auth modal (Login/Register tabs), verification code requesting,
 * and stores the session token in localStorage.
 */
import { setStatus } from "./util";

const AUTH_TOKEN_KEY = "er_auth_token";
const AUTH_EMAIL_KEY = "er_auth_email";

// Elements
const authModal = document.getElementById("authModal") as HTMLDivElement;
const authBtn = document.getElementById("authBtn") as HTMLButtonElement;
const tabLogin = document.getElementById("tabLogin") as HTMLButtonElement;
const tabRegister = document.getElementById("tabRegister") as HTMLButtonElement;
const authTitle = document.getElementById("authTitle") as HTMLElement;
const authEmail = document.getElementById("authEmail") as HTMLInputElement;
const authCode = document.getElementById("authCode") as HTMLInputElement;
const authPassword = document.getElementById("authPassword") as HTMLInputElement;
const authMsg = document.getElementById("authMsg") as HTMLElement;
const sendCodeBtn = document.getElementById("sendCodeBtn") as HTMLButtonElement;
const confirmAuthBtn = document.getElementById("confirmAuthBtn") as HTMLButtonElement;
const cancelAuthBtn = document.getElementById("cancelAuthBtn") as HTMLButtonElement;
const authCodeField = document.getElementById("authCodeField") as HTMLDivElement;

let mode: "login" | "register" = "login";
let sessionToken: string | null = localStorage.getItem(AUTH_TOKEN_KEY);

// ---------------- Session ----------------
export function getToken(): string | null {
  return sessionToken;
}
export function isLoggedIn(): boolean {
  return !!sessionToken;
}
function applySession() {
  if (sessionToken) {
    authBtn.textContent = "Logout";
  } else {
    authBtn.textContent = "Login";
  }
}

// ---------------- Modal open/close ----------------
function openModal() {
  authMsg.hidden = true;
  authMsg.textContent = "";
  authCode.value = "";
  authPassword.value = "";
  authModal.hidden = false;
  authEmail.focus();
}
export function toggleAuth() {
  if (isLoggedIn()) {
    logout();
    return;
  }
  setMode("login");
  openModal();
}
function closeModal() {
  authModal.hidden = true;
  setStatus("");
}

function setMode(m: "login" | "register") {
  mode = m;
  tabLogin.classList.toggle("active", m === "login");
  tabRegister.classList.toggle("active", m === "register");
  authTitle.textContent = m === "login" ? "Login" : "Register";
  confirmAuthBtn.textContent = m === "login" ? "Login" : "Register";
  // 验证码仅注册时需要；登录时隐藏整个验证码字段
  authCodeField.hidden = m === "login";
  if (m === "login") authCode.value = "";
}

function flash(msg: string, ok: boolean) {
  authMsg.textContent = msg;
  authMsg.classList.toggle("error", !ok);
  authMsg.classList.toggle("ok", ok);
  authMsg.hidden = false;
}

function getEmail(): string {
  return authEmail.value.trim().toLowerCase();
}

// ---------------- Send code ----------------
async function requestCode() {
  const email = getEmail();
  if (!email) return flash("Please enter an email first", false);
  sendCodeBtn.disabled = true;
  sendCodeBtn.textContent = "Sending...";
  try {
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!data.ok) {
      flash(data.error ?? "Failed to send code", false);
    } else if (data.devCode) {
      // Dev mode: no SMTP, code is in the server log
      flash(`Dev mode: code is ${data.devCode} (see server log)`, true);
    } else {
      flash(`Verification code sent to ${email}`, true);
    }
  } catch {
    flash("Network error sending code", false);
  } finally {
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = "Send Code";
  }
}

// ---------------- Submit ----------------
async function submit() {
  const email = getEmail();
  const password = authPassword.value;
  flash("", true);
  try {
    if (mode === "register") {
      const code = authCode.value.trim();
      if (!code) return flash("Please enter the verification code", false);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json();
      if (!data.ok) return flash(data.error ?? "Registration failed", false);
      flash("Registered successfully. Please login.", true);
      setMode("login");
    } else {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.ok) return flash(data.error ?? "Login failed", false);
      sessionToken = data.token;
      localStorage.setItem(AUTH_TOKEN_KEY, sessionToken!);
      localStorage.setItem(AUTH_EMAIL_KEY, data.email ?? "");
      applySession();
      closeModal();
      setStatus(`Welcome back, ${data.email ?? ""}`, "ok");
      setTimeout(() => setStatus(""), 2500);
    }
  } catch {
    flash("Network error", false);
  }
}

async function logout() {
  const token = sessionToken;
  sessionToken = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_EMAIL_KEY);
  applySession();
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      /* ignore */
    }
  }
  setStatus("Logged out", "ok");
  setTimeout(() => setStatus(""), 2500);
}

// ---------------- Wiring ----------------
export function initAuth() {
  authBtn.addEventListener("click", toggleAuth);
  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));
  sendCodeBtn.addEventListener("click", requestCode);
  confirmAuthBtn.addEventListener("click", submit);
  cancelAuthBtn.addEventListener("click", closeModal);
  authModal.addEventListener("click", (ev) => {
    if (ev.target === authModal) closeModal();
  });
  authPassword.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") submit();
  });
  applySession();
}
