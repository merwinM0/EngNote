/**
 * state.ts - 全局元素引用、共享状态、渲染与模式管理
 */
import { el, setStatus } from "./util";

// ---------------- 元素引用 ----------------
export const content = document.getElementById("content") as HTMLDivElement;
export const pasteBtn = document.getElementById("pasteBtn") as HTMLButtonElement;
export const formatBtn = document.getElementById("formatBtn") as HTMLButtonElement;
export const translateBtn = document.getElementById("translateBtn") as HTMLButtonElement;
export const deleteBtn = document.getElementById("deleteBtn") as HTMLButtonElement;
export const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
export const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
export const modeHint = document.getElementById("modeHint") as HTMLSpanElement;

// ---------------- 状态 ----------------
export type WordInfo = { id: number; text: string; el: HTMLElement };
export const wordsById = new Map<number, WordInfo>();
export const loadingNotes = new Map<number, HTMLElement>();
const pickedIds = new Set<number>();
let translateMode = false;
let deleteMode = false;
let deletePending: HTMLElement | null = null;

export function isTranslateMode() {
  return translateMode;
}
export function isDeleteMode() {
  return deleteMode;
}

// ---------------- 文本解析：按空行分段 ----------------
export function parseParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p.length > 0);
}

// 把一段文本拆解为「普通文本」与「『』译文」片段
function splitParagraph(para: string): Array<{ type: "plain" | "note"; text: string }> {
  const pieces: Array<{ type: "plain" | "note"; text: string }> = [];
  const re = /『([^』]*)』/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(para))) {
    if (m.index > last) pieces.push({ type: "plain", text: para.slice(last, m.index) });
    pieces.push({ type: "note", text: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < para.length) pieces.push({ type: "plain", text: para.slice(last) });
  return pieces.filter((p) => p.text.length > 0);
}

// ---------------- 渲染 ----------------
export function render(text: string) {
  wordsById.clear();
  // 重建内容时退出删除模式（避免悬挂的待删除引用）
  if (deleteMode) {
    deleteMode = false;
    deleteBtn.classList.remove("active-delete");
  }
  deletePending = null;
  content.textContent = "";

  const paragraphs = parseParagraphs(text);
  let cursor = 0;

  for (const para of paragraphs) {
    const p = el("p");

    for (const piece of splitParagraph(para)) {
      if (piece.type === "note") {
        // 『…』译文 → 重建为 .note（CSS 负责加 『 』 边框与字体样式）
        const note = el("span", "note", piece.text);
        note.dataset.deletable = "1";
        p.appendChild(note);
        continue;
      }
      // 普通文本：拆成 词 与 空白
      const tokens = piece.text.match(/[A-Za-z'’\-–—]+|[^\s]/g) ?? [];
      let pos = 0;
      for (const tok of tokens) {
        if (pos < piece.text.length) {
          const ws = piece.text.slice(pos, piece.text.length).match(/^\s+/)?.[0] ?? "";
          if (ws) {
            p.appendChild(document.createTextNode(ws));
            pos += ws.length;
          }
        }
        const span = el("span", "term", tok);
        const id = cursor++;
        span.dataset.wordId = String(id);
        span.title = "单击选中";
        wordsById.set(id, { id, text: tok, el: span });
        p.appendChild(span);
        pos += tok.length;
      }
    }

    content.appendChild(p);
  }

  setStatus("已重新分段渲染", "ok");
  setTimeout(() => setStatus(""), 2500);
}

// ---------------- 当前全文（含『』译文标记） --------------
export function getCurrentText(): string {
  const paras = Array.from(content.querySelectorAll("p"));
  return paras
    .map((p) => {
      let out = "";
      for (const node of p.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          out += node.textContent ?? "";
        } else {
          const h = node as HTMLElement;
          if (h.classList?.contains("note")) {
            // 译文：包上 『』 标记以便再次渲染时重建为 .note
            out += "『" + (h.textContent ?? "") + "』";
          } else {
            out += h.textContent ?? "";
          }
        }
      }
      return out.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

// ---------------- 清除所有选中高亮 ----------------
export function clearPicked() {
  pickedIds.forEach((id) => {
    const info = wordsById.get(id);
    info?.el.classList.remove("picked");
  });
  pickedIds.clear();
}

// ---------------- 单击切换单词选中 ----------------
export function togglePick(id: number) {
  const info = wordsById.get(id);
  if (!info) return;
  if (pickedIds.has(id)) {
    pickedIds.delete(id);
    info.el.classList.remove("picked");
  } else {
    pickedIds.add(id);
    info.el.classList.add("picked");
  }
}

export function selectPick(id: number) {
  const info = wordsById.get(id);
  if (!info) return;
  pickedIds.add(id);
  info.el.classList.add("picked");
}

export function collectPickedIds(): number[] {
  return Array.from(pickedIds).sort((a, b) => a - b);
}

// ---------------- 把相邻单词 id 合并为词组 ----------------
export function groupIds(ids: number[]): number[][] {
  const groups: number[][] = [];
  for (const id of ids) {
    const last = groups[groups.length - 1];
    if (last && id === last[last.length - 1]! + 1) {
      last.push(id);
    } else {
      groups.push([id]);
    }
  }
  return groups;
}

export function groupText(group: number[]): string {
  return group
    .map((id) => wordsById.get(id)?.text ?? "")
    .filter(Boolean)
    .join(" ");
}

// ---------------- 模式管理（互斥） ----------------
export function setTranslateMode(on: boolean) {
  translateMode = on;
  translateBtn.textContent = on ? "➜ 翻译所选" : "✎ AI 翻译";
  modeHint.textContent = on
    ? "模式：单击单词即可选中（再次单击取消），选中变背景色，然后点「翻译所选」"
    : "";
  // 进入翻译时退出删除模式
  if (on && deleteMode) setDeleteMode(false);
  // 退出选词模式时清除选中高亮
  if (!on && pickedIds.size) clearPicked();
}

export function setDeleteMode(on: boolean) {
  deleteMode = on;
  deletePending = null;
  deleteBtn.classList.toggle("active-delete", on);
  // 清理已有选中态
  content
    .querySelectorAll(".note.delete-selected")
    .forEach((n) => n.classList.remove("delete-selected"));
  // 所有译文标为可点选删除
  content.querySelectorAll<HTMLElement>(".note").forEach((n) => {
    n.dataset.deletable = on ? "1" : "0";
  });
  if (on && translateMode) setTranslateMode(false);
  modeHint.textContent = on
    ? "删除翻译模式：单击一个『』选中，再单击该『』即可删除这条译文"
    : "";
  if (!on) setStatus("");
}

export function clearDeleteSelection() {
  if (deletePending) deletePending.classList.remove("delete-selected");
  deletePending = null;
}

export function setDeletePending(note: HTMLElement) {
  deletePending = note;
}
