/**
 * state.ts - Global element refs, shared state, rendering & mode management
 */
import { el, setStatus } from "./util";

// ---------------- Element refs ----------------
export const content = document.getElementById("content") as HTMLDivElement;
export const pasteBtn = document.getElementById("pasteBtn") as HTMLButtonElement;
export const formatBtn = document.getElementById("formatBtn") as HTMLButtonElement;
export const translateBtn = document.getElementById("translateBtn") as HTMLButtonElement;
export const deleteBtn = document.getElementById("deleteBtn") as HTMLButtonElement;
export const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
export const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
export const modeHint = document.getElementById("modeHint") as HTMLSpanElement;

// ---------------- State ----------------
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

// ---------------- Text parsing: split into paragraphs by blank lines ----------------
export function parseParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p.length > 0);
}

// Split a paragraph into "plain text" and "『』 translation" pieces
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

// ---------------- Rendering ----------------
export function render(text: string) {
  wordsById.clear();
  // Exit delete mode when rebuilding (avoid dangling pending reference)
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
        // 『…』 translation → rebuild as .note (CSS adds the 『 』 border & font style)
        const note = el("span", "note", piece.text);
        note.dataset.deletable = "1";
        p.appendChild(note);
        continue;
      }
      // Plain text: split into words and whitespace
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
        span.title = "Click to select";
        wordsById.set(id, { id, text: tok, el: span });
        p.appendChild(span);
        pos += tok.length;
      }
    }

    content.appendChild(p);
  }

  setStatus("Rendered into paragraphs", "ok");
  setTimeout(() => setStatus(""), 2500);
}

// ---------------- Current full text (with 『』 translation markers) --------------
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
            // Wrap translations in 『』 so re-render can rebuild them as .note
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

// ---------------- Clear all selected highlights ----------------
export function clearPicked() {
  pickedIds.forEach((id) => {
    const info = wordsById.get(id);
    info?.el.classList.remove("picked");
  });
  pickedIds.clear();
}

// ---------------- Toggle a single word's selection ----------------
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

// ---------------- Merge adjacent word ids into a phrase ----------------
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

// ---------------- Mode management (mutually exclusive) ----------------
export function setTranslateMode(on: boolean) {
  translateMode = on;
  translateBtn.textContent = on ? "➜ Translate Selected" : "✎ Translate";
  modeHint.textContent = on
    ? "Mode: click words to select (click again to deselect), then hit 'Translate Selected'"
    : "";
  // Exit delete mode when entering translate
  if (on && deleteMode) setDeleteMode(false);
  // Clear selected highlights when exiting select mode
  if (!on && pickedIds.size) clearPicked();
}

export function setDeleteMode(on: boolean) {
  deleteMode = on;
  deletePending = null;
  deleteBtn.classList.toggle("active-delete", on);
  // Clear any existing selected state
  content
    .querySelectorAll(".note.delete-selected")
    .forEach((n) => n.classList.remove("delete-selected"));
  // Mark all translations as clickable for deletion
  content.querySelectorAll<HTMLElement>(".note").forEach((n) => {
    n.dataset.deletable = on ? "1" : "0";
  });
  if (on && translateMode) setTranslateMode(false);
  modeHint.textContent = on
    ? "Delete mode: click a 『』 note to select it, click it again to remove the translation"
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
