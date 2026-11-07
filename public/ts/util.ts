import { localizeError, t } from "./i18n";

export { sanitizeEnglish, sanitizeTitle } from "./text";
export { setStatus } from "./statusToast";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** Keep icons and selection counts; the toolbar tooltip follows this accessible name. */
export function setToolLabel(button: HTMLButtonElement, label: string) {
  button.querySelector<HTMLElement>("[data-tool-label]")!.textContent = label;
  button.setAttribute("aria-label", label);
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
