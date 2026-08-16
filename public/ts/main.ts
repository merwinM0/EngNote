/**
 * main.ts - 装配入口：绑定全局事件并初始化
 */
import { setStatus, sanitizeEnglish, readCookie, writeCookie } from "./util";
import {
  content,
  pasteBtn,
  clearBtn,
  translateBtn,
  setTranslateMode,
  setDeleteMode,
  isTranslateMode,
  isDeleteMode,
  render,
} from "./state";
import { COOKIE_KEY } from "./deepseek";
import { onFormat } from "./format";
import { onTranslateClick, onTermClick } from "./translate";
import { handleDeleteNote, toggleDeleteMode } from "./deleteNote";
import { refreshList, initDb, deselectEntry } from "./db";

const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const saveKeyBtn = document.getElementById("saveKeyBtn") as HTMLButtonElement;

// ---------------- 粘贴 ----------------
// 单击一次直接粘贴，不需要确认弹窗。粘贴后视为“新内容”（清空选中项，避免覆盖已选文章）。
pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    const { clean } = sanitizeEnglish(text);
    if (!clean) {
      setStatus("剪贴板内容为空或不含英文字符", "error");
      return;
    }
    render(clean);
    deselectEntry(); // 新内容：取消选中任何已保存文章
    setStatus("✅ 已从剪贴板粘贴并分段（新内容，保存会新建）", "ok");
    setTimeout(() => setStatus(""), 2500);
  } catch {
    setStatus("无法读取剪贴板，请检查浏览器权限后重试", "error");
  }
});

// ---------------- 清空 ----------------
clearBtn.addEventListener("click", () => {
  content.textContent = "";
  setDeleteMode(false);
  setTranslateMode(false);
  deselectEntry(); // 清空后为新内容状态
  setStatus("已清空（保存会新建，不再覆盖以前文章）", "ok");
  setTimeout(() => setStatus(""), 2000);
});

// ---------------- 内容点击分发 ----------------
content.addEventListener("click", (ev) => {
  const target = (ev.target as HTMLElement)?.closest<HTMLElement>(
    ".term, .note"
  );
  if (!target) return;

  // 删除翻译模式：处理『』译文
  if (isDeleteMode() && target.classList.contains("note")) {
    ev.preventDefault();
    // 仅允许删除已完成翻译的『』（跳过 loading / 失败标记）
    if (!target.classList.contains("loading") && !target.classList.contains("error")) {
      handleDeleteNote(target as HTMLElement);
    }
    return;
  }

  // 选词模式：选中单词
  if (isTranslateMode() && target.classList.contains("term")) {
    ev.preventDefault();
    const id = Number(target.dataset.wordId);
    if (!Number.isNaN(id)) onTermClick(id);
  }
});

// ---------------- API Key cookie ----------------
apiKeyInput.addEventListener("input", () => {
  if (apiKeyInput.value !== readCookie(COOKIE_KEY)) {
    (document.getElementById("modeHint") as HTMLElement).textContent =
      "API Key 已修改，点击「保存 Key」写入 cookie";
  }
});

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus("请输入 API Key 后再保存", "error");
    return;
  }
  writeCookie(COOKIE_KEY, key);
  setStatus("✅ API Key 已保存到浏览器 cookie", "ok");
  (document.getElementById("modeHint") as HTMLElement).textContent = "";
  setTimeout(() => setStatus(""), 2500);
});

// ---------------- 功能按钮 ----------------
document.getElementById("formatBtn")!.addEventListener("click", onFormat);
translateBtn.addEventListener("click", onTranslateClick);
document.getElementById("deleteBtn")!.addEventListener("click", toggleDeleteMode);

// ---------------- 初始化 ----------------
function init() {
  const savedKey = readCookie(COOKIE_KEY) ?? "";
  if (savedKey) {
    apiKeyInput.value = savedKey;
    setStatus("已从 cookie 读取 API Key", "ok");
    setTimeout(() => setStatus(""), 2500);
  }
  initDb();
  refreshList();
}
init();
