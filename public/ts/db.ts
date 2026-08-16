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
const deleteConfirmModal = document.getElementById("deleteConfirmModal") as HTMLDivElement;
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn") as HTMLButtonElement;
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn") as HTMLButtonElement;
const entryList = document.getElementById("entryList") as HTMLUListElement;
const refreshListBtn = document.getElementById("refreshListBtn") as HTMLButtonElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;

// 当前选中的已保存文章 id（用于高亮与直接覆盖保存）
let selectedId: number | null = null;
let selectedTitle = "";
let pendingDeleteId: number | null = null; // 待删除确认的文章 id

/**
 * 取消选中：粘贴新内容时应调用，使内容作为“新文章”而非覆盖选中项。
 */
export function deselectEntry() {
  selectedId = null;
  selectedTitle = "";
  entryList.querySelectorAll("li.active").forEach((li) => li.classList.remove("active"));
}

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
    // 新建后即选中，便于后续直接覆盖保存
    selectedId = data.id ?? null;
    selectedTitle = clean;
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
      if (selectedId === e.id) li.classList.add("active"); // 选中高亮
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
          // 选中并高亮
          selectedId = e.id;
          selectedTitle = e.title;
          markActive(li);
          render(od.entry.content);
          setStatus(`已加载：${e.title}（再次点击保存可直接覆盖）`, "ok");
          setTimeout(() => setStatus(""), 3500);
        }
      });

      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // 打开主题风格删除确认弹窗（替代浏览器默认 confirm）
        pendingDeleteId = e.id;
        deleteConfirmModal.hidden = false;
      });

      entryList.appendChild(li);
    }
  } catch {
    entryList.innerHTML = "<li class='entry-empty'>加载失败</li>";
  }
}

// 仅保留一个条目为选中态（高亮）
function markActive(activeLi: HTMLElement) {
  entryList.querySelectorAll("li.active").forEach((li) => li.classList.remove("active"));
  activeLi.classList.add("active");
}

// ---------------- 保存按钮：选择过则直接覆盖，否则弹窗新建 ----------------
async function handleSaveClick() {
  const text = getCurrentText();
  if (!text) {
    setStatus("没有可保存的内容，请先粘贴文本", "error");
    return;
  }
  // 已有选中的文章 → 直接更新覆盖（不弹窗，保留原标题）
  if (selectedId !== null) {
    await updateEntryContent(selectedId, text);
    return;
  }
  // 无选中 → 弹出标题窗口新建
  openSaveModal();
}

// 直接覆盖选中的文章内容（保留原标题）
async function updateEntryContent(id: number, contentToSave: string) {
  try {
    const res = await fetch(`/api/entries/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: contentToSave }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setStatus(`覆盖保存失败：${data.error ?? ""}`, "error");
      return;
    }
    setStatus("✅ 已覆盖保存到「" + selectedTitle + "」" + (hasTranslation() ? "（含译文）" : ""));
    setTimeout(() => setStatus(""), 2500);
    refreshList();
  } catch {
    setStatus("❌ 覆盖保存失败，请检查连接", "error");
  }
}

// ---------------- 事件绑定 ----------------
export function initDb() {
  saveBtn.addEventListener("click", handleSaveClick);
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

  // 删除确认弹窗
  confirmDeleteBtn.addEventListener("click", async () => {
    const id = pendingDeleteId;
    deleteConfirmModal.hidden = true;
    pendingDeleteId = null;
    if (id === null) return;
    await fetch(`/api/entries/${id}`, { method: "DELETE" });
    if (selectedId === id) {
      selectedId = null;
      selectedTitle = "";
    }
    refreshList();
  });
  cancelDeleteBtn.addEventListener("click", () => {
    deleteConfirmModal.hidden = true;
    pendingDeleteId = null;
  });
  deleteConfirmModal.addEventListener("click", (ev) => {
    if (ev.target === deleteConfirmModal) {
      deleteConfirmModal.hidden = true;
      pendingDeleteId = null;
    }
  });
}
