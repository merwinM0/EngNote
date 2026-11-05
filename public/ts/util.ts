export { sanitizeEnglish, sanitizeTitle } from "./text";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function setStatus(msg: string, type: "info" | "ok" | "error" = "info") {
  const bar = document.getElementById("statusBar")!;
  bar.hidden = !msg;
  bar.textContent = msg;
  bar.classList.toggle("error", type === "error");
  bar.classList.toggle("ok", type === "ok");
}

export function initDialogs() {
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", event => {
      if (event.target instanceof Element && event.target.closest("[data-close]")) dialog.close();
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw new Error(typeof data.error === "string" ? data.error : `Request failed (${response.status})`);
  }
  return data;
}

export const jsonBody = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
