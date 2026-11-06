import { localizeError, setUIText, t } from "./i18n";
import type { UIMessage } from "./i18n";

export { sanitizeEnglish, sanitizeTitle } from "./text";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function setStatus(message: UIMessage, type: "info" | "ok" | "error" = "info") {
  const bar = document.getElementById("statusBar")!;
  bar.hidden = !setUIText(bar, message);
  bar.classList.toggle("error", type === "error");
  bar.classList.toggle("ok", type === "ok");
}

export function errorMessage(error: unknown): string {
  return localizeError(error instanceof Error ? error.message : t("status.unknown"));
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(typeof data.error === "string" ? data.error : `Request failed (${response.status})`, response.status);
  }
  return data;
}

export const jsonBody = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
