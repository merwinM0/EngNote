/**
 * util.ts - 通用工具函数
 */

// 允许的英文文本字符：字母、空格、常见英文标点（含 - ' “ ” ’ — –）
export const ALLOWED = /[^A-Za-z\s.,;:!?()'"\u201c\u201d\u2019\u2014\u2013\u2192-]/g;

/** 创建带类名/文本的元素 */
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

/** 更新状态栏 */
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

/** 按文档顺序读取并合并段落文本 */
export function paragraphsToText(ps: HTMLElement[]): string {
  return ps
    .map((p) => p.textContent!.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** 过滤非英文字符（非法字符替换为空） */
export function sanitizeEnglish(text: string): {
  clean: string;
  hadBad: boolean;
} {
  const hadBad = ALLOWED.test(text);
  return { clean: text.replace(ALLOWED, ""), hadBad };
}

/** 标题：去除所有中文字符 */
export function sanitizeTitle(title: string): {
  clean: string;
  hadBad: boolean;
} {
  const hadBad = /[\u4e00-\u9fff]/.test(title);
  return { clean: title.replace(/[\u4e00-\u9fff]/g, "").trim(), hadBad };
}

/** 读取 cookie */
export function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2] ?? "") : "";
}

/** 写入 cookie */
export function writeCookie(name: string, value: string) {
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
}
