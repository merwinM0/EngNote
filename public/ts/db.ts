/**
 * db.ts - 保存到数据库 / 右侧边栏
 */
import { setStatus, sanitizeTitle } from "./util";
import { content, getCurrentText, render } from "./state";

// 弹窗与边栏元素
const saveModal = document.getElementById("saveModal") as HTMLDivElement;
const saveTitleInput = document.getElementById("saveTitle") as HTMLInputElement;
const confirmSaveBtn = document.getElementById("confirmSaveBtn") as HTMLButtonElement;
const cancelSaveBtn = document.getElementById("cancelSaveBtn") as HTMLButtonElement;
const entryList = document.getElementById("entryList") as HTMLUListElement;
const refreshListBtn = document.getElementById("refreshListBtn") as HTMLButtonElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;

function hasTranslation(): boolean {
  return content.querySelectorAll(".note[data-deletable='1']").length > 0;
}

function openSaveModal() {
  const text = getCurrentText();
  if (!text) {
    setStatus("没有可保存的内容，请先粘贴文本", "error");
    return;
  }
  saveTitleInput.value = "";
  saveModal.hidden = false;
  saveTitleInput.focus();
}

function closeSaveModal() {
  saveModal.hidden = true;
  saveTitleInput.value = "";
}

async function confirmSave() {
  const title = saveTitleInput.value;
  const { clean, hadBad } = sanitizeTitle(title);
  if (hadBad) setStatus("标题不允许中文，已去除中文字符", "error");
  if (!clean) {
    setStatus("请输入非中文标题", "error");
    return;
  }
  // 若已翻译，保存带 『』 译文的当前内容
  const contentToSave = getCurrentText();
  closeSaveModal();
  try {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: clean, content: contentToSave }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(`保存失败：${data.error ?? ""}`, "error");
      return;
    }
    setStatus("✅ 已保存到数据库" + (hasTranslation() ? "（含译文）" : ""), "ok");
    setTimeout(() => setStatus(""), 2500);
    refreshList();
  } catch {
    setStatus("❌ 保存失败，请检查连接", "error");
  }
}

// ---------------- 右侧边栏 ----------------
export async function refreshList() {
  try {
    const res = await fetch("/api/entries");
    const data = await res.json();
    entryList.innerHTML = "";
    const entries = data.entries ?? [];
    if (entries.length === 0) {
      entryList.innerHTML = "<li class='entry-empty'>暂无保存的文章</li>";
      return;
    }
    for (const e of entries) {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.className = "entry-title";
      t.textContent = e.title;
      const del = document.createElement("button");
      del.className = "entry-del";
      del.textContent = "✕";
      del.title = "删除该文章";
      li.appendChild(t);
      li.appendChild(del);

      li.addEventListener("click", async (ev) => {
        if ((ev.target as HTMLElement).classList.contains("entry-del")) return;
        const one = await fetch(`/api/entries/${e.id}`);
        const od = await one.json();
        if (od.ok) {
          render(od.entry.content);
          setStatus(`已加载：${e.title}`, "ok");
          setTimeout(() => setStatus(""), 2500);
        }
      });

      del.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!confirm(`确定删除「${e.title}」吗？`)) return;
        await fetch(`/api/entries/${e.id}`, { method: "DELETE" });
        refreshList();
      });

      entryList.appendChild(li);
    }
  } catch {
    entryList.innerHTML = "<li class='entry-empty'>加载失败</li>";
  }
}

// ---------------- 事件绑定 ----------------
export function initDb() {
  saveBtn.addEventListener("click", openSaveModal);
  confirmSaveBtn.addEventListener("click", confirmSave);
  cancelSaveBtn.addEventListener("click", () => {
    closeSaveModal();
    setStatus("");
  });
  saveModal.addEventListener("click", (ev) => {
    if (ev.target === saveModal) closeSaveModal();
  });
  saveTitleInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") confirmSave();
  });
  refreshListBtn.addEventListener("click", refreshList);
}
