/**
 * deleteNote.ts - 删除翻译模式
 */
import { setStatus } from "./util";
import {
  isDeleteMode,
  setDeleteMode,
  clearDeleteSelection,
  setDeletePending,
} from "./state";

/**
 * 点击一个『』译文：第一次单击选中（红色高亮），再次单击删除。
 */
export function handleDeleteNote(note: HTMLElement) {
  // 第二次点击同一『』 → 删除
  if (isPending(note)) {
    clearDeleteSelection();
    note.remove();
    setStatus("✅ 已删除该条翻译", "ok");
    setTimeout(() => setStatus(""), 2000);
    return;
  }
  // 第一次点击：选中当前『』，清除其他选中
  clearDeleteSelection();
  setDeletePending(note);
  note.classList.add("delete-selected");
  setStatus("已选中该条『』，再单击一次删除");
}

function isPending(note: HTMLElement): boolean {
  return note.classList.contains("delete-selected");
}

export function toggleDeleteMode() {
  setDeleteMode(!isDeleteMode());
}
