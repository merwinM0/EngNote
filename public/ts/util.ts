/**
 * util.ts - Common helper functions
 */

// Allowed English text chars: letters, spaces, common English punctuation (incl. - ' " '' ' — –)
export const ALLOWED = /[^A-Za-z\s.,;:!?()'"\u201c\u201d\u2019\u2014\u2013\u2192-]/g;

/** Create an element with class name / text */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = ""
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text) n.textContent = text;
  return n;
}

/** Update the status bar */
export function setStatus(
  msg: string,
  type: "info" | "ok" | "error" = "info"
) {
  const bar = document.getElementById("statusBar")!;
  bar.hidden = !msg;
  bar.textContent = msg;
  bar.classList.toggle("error", type === "error");
  bar.classList.toggle("ok", type === "ok");
}

/** Filter out non-English characters (replaced with empty) */
export function sanitizeEnglish(text: string): {
  clean: string;
  hadBad: boolean;
} {
  const hadBad = ALLOWED.test(text);
  return { clean: text.replace(ALLOWED, ""), hadBad };
}

/** Title: remove all Chinese characters */
export function sanitizeTitle(title: string): {
  clean: string;
  hadBad: boolean;
} {
  const hadBad = /[\u4e00-\u9fff]/.test(title);
  return { clean: title.replace(/[\u4e00-\u9fff]/g, "").trim(), hadBad };
}

/** Read a cookie */
export function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2] ?? "") : "";
}

/** Write a cookie */
export function writeCookie(name: string, value: string) {
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
}
