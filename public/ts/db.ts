import type { DocumentFormatting } from "./documentFormatting";
import { api, ApiError, jsonBody, setStatus, sanitizeTitle, el, errorMessage, setToolLabel } from "./util";
import { msg, setUIText, t, uiLanguage } from "./i18n";
import type { MessageKey, UIMessage } from "./i18n";
import { definitionViews, definitionViewChanged, getCurrentText, getDocumentFormatting, render, isBusy, setBusy } from "./state";
import { getEmail, isLoggedIn, openLogin } from "./auth";
import { openPanel, closePanel, confirmInPanel } from "./panels";
import { callDeepSeek, getStoredApiKey } from "./deepseek";
import { summarizeArticleTitle } from "./articleTitle";
import type { DraftEntry } from "./articleDraft";
import { definitionContent } from "./definitionViews";
import { ArticleDefinitionLanguages } from "./articleDefinitionLanguages";
import type { DefinitionView } from "./definitionViews";

type Entry = { id: number; title: string; created_at: string; can_edit: boolean; content?: string; definitions?: DefinitionView[]; formatting?: DocumentFormatting | null };
const savePanel = document.getElementById("savePanel") as HTMLDialogElement;
const collectionPanel = document.getElementById("collectionPanel") as HTMLDialogElement;
const confirmSaveBtn = document.getElementById("confirmSaveBtn") as HTMLButtonElement;
let saveTask: { request: AbortController; phase: "summarizing" | "saving" } | null = null;
let manualTitleRequired = false;
const saveTitle = document.getElementById("saveTitle") as HTMLInputElement;
const entryList = document.getElementById("entryList")!;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
let selected: Entry | null = null;
let pendingDelete: Entry | null = null;
let savedText = "";
let savedDefinitions = "[]";
let savedFormatting = "null";
let selectionStatus: "ready" | "checking" | "retry" = "ready";
let selectionRequest = 0;
let listRequest = 0;
let openRequest = 0;
let deleteRequest = 0;
let loginSaveRequested = false;
let workspaceReady = false;
const articleLanguages = new ArticleDefinitionLanguages(() => sessionStorage);
let warnedLanguageStorage = false;
const canEdit = (entry: Entry) => isLoggedIn() && entry.can_edit;
const isDirty = () => getCurrentText() !== savedText || JSON.stringify(definitionContent(definitionViews.snapshot())) !== savedDefinitions || JSON.stringify(getDocumentFormatting()) !== savedFormatting;
function rememberDefinitionLanguages() {
  // Discarding content edits must not overwrite choices for the saved article version.
  if (!selected || isDirty()) return;
  if (!articleLanguages.remember(selected.id, getCurrentText(), definitionViews.snapshot()) && !warnedLanguageStorage) {
    warnedLanguageStorage = true;
    setStatus(msg("editor.storageWarning"), "error");
  }
}
export async function confirmReplace(action: UIMessage = msg("confirm.replaceArticle"), message: UIMessage = msg("confirm.replaceMessage")): Promise<boolean> {
  return !isDirty() || await confirmInPanel(message, action);
}
function updateSelection() {
  for (const li of entryList.querySelectorAll<HTMLElement>("li[data-id]")) {
    const active = Number(li.dataset.id) === selected?.id;
    li.classList.toggle("active", active);
    const button = li.querySelector(".entry-open");
    if (active) button?.setAttribute("aria-current", "true"); else button?.removeAttribute("aria-current");
  }
  document.getElementById("readerTitle")!.textContent = selected?.title ?? t("reader.defaultArticle");
  setToolLabel(saveBtn, selectionStatus === "checking" ? t("reader.restoring") : selectionStatus === "retry" ? t("reader.retrySaved")
    : selected && canEdit(selected) ? t("reader.saveChanges") : t("reader.saveArticle"));
  saveBtn.disabled = isBusy() || selectionStatus === "checking";
}
function selectEntry(entry: Entry | null, baseline = "", status: typeof selectionStatus = "ready") {
  selectionRequest++;
  selected = entry; savedText = baseline; selectionStatus = status;
  savedDefinitions = JSON.stringify(definitionContent(entry?.definitions ?? []));
  savedFormatting = JSON.stringify(entry?.formatting ?? null);
  updateSelection();
  window.dispatchEvent(new Event("entry-selection-changed"));
}
export function deselectEntry() { openRequest++; selectEntry(null); }
export function getDraftEntry(): DraftEntry | null {
  return selected ? { id: selected.id, title: selected.title, savedText, savedFormatting: JSON.parse(savedFormatting) as DocumentFormatting | null } : null;
}
export function restoreEntrySelection(entry: DraftEntry | null) {
  // Restore only after choosing the account workspace, then verify the saved association.
  selectEntry(entry ? { id: entry.id, title: entry.title, can_edit: false, created_at: "", formatting: entry.savedFormatting } : null,
    entry?.savedText ?? "", entry ? "checking" : "ready");
  if (entry && isLoggedIn()) void reconnectSelection();
}
async function reconnectSelection() {
  const account = getEmail();
  if (!selected || !account) return;
  const id = selected.id, baseline = savedText, request = ++selectionRequest;
  selected.can_edit = false; selectionStatus = "checking"; updateSelection();
  try {
    const data = await api<{ entry: Entry & { content: string } }>(`/api/entries/${id}`);
    if (request !== selectionRequest || getEmail() !== account) return;
    // Keep working text, existing language choices and page position; only fill missing bilingual data.
    definitionViews.merge(data.entry.definitions);
    selectEntry(data.entry, data.entry.content);
    definitionViewChanged();
    const detail = data.entry.content !== baseline ? "status.resumedChanged" : isDirty() ? "status.resumedUnsaved" : "status.resumedPosition";
    const action = "status.resumedOwner";
    setStatus(() => t("status.resumed", { title: data.entry.title, detail: t(detail) + t(action) }), "ok");
  } catch (error) {
    if (request !== selectionRequest || getEmail() !== account) return;
    if (error instanceof ApiError && error.status === 404) {
      selectEntry(null);
      setStatus(msg("status.gone"), "info");
    } else {
      selectionStatus = "retry"; updateSelection();
      setStatus(() => t("status.reconnectFailed", { error: errorMessage(error) }), "error");
    }
  }
}
function showError(id: string, message: UIMessage) {
  const element = document.getElementById(id)!;
  element.hidden = !setUIText(element, message);
}
function collectionDate(createdAt: string): string {
  const date = new Date(createdAt.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? t("collection.savedPage")
    : date.toLocaleDateString(uiLanguage() === "zh" ? "zh-CN" : "en", { month: "short", day: "numeric", year: "numeric" });
}
function emptyCollection(key: MessageKey): HTMLElement {
  const item = el("li", "entry-empty");
  setUIText(item, msg(key));
  return item;
}
function refreshCollectionCopy() {
  // Translate the mounted list in place: switching language must not fetch, move focus or reset the canvas.
  for (const date of entryList.querySelectorAll<HTMLElement>("[data-created-at]")) date.textContent = collectionDate(date.dataset.createdAt!);
  for (const item of entryList.querySelectorAll<HTMLElement>("li[data-id]")) {
    item.querySelector(".entry-del")?.setAttribute("aria-label", t("collection.deleteAria", { title: item.querySelector(".entry-title")!.textContent ?? "" }));
  }
}

async function openEntry(entry: Entry) {
  if (isBusy()) return;
  const account = getEmail();
  if (!account) return openLogin();
  const request = ++openRequest;
  if (!(await confirmReplace()) || request !== openRequest || isBusy() || !collectionPanel.open) return;
  const startingText = getCurrentText();
  showError("collectionMsg", msg("status.opening", { title: entry.title }));
  try {
    const data = await api<{ entry: Entry & { content: string } }>(`/api/entries/${entry.id}`);
    if (request !== openRequest || getEmail() !== account || isBusy() || getCurrentText() !== startingText) return;
    rememberDefinitionLanguages();
    const definitions = articleLanguages.apply(entry.id, data.entry.content, data.entry.definitions);
    render(data.entry.content, 0, definitions, data.entry.formatting);
    closePanel("collectionPanel");
    openPanel("readPanel", false);
    selectEntry(data.entry, getCurrentText());
    const detail = "status.openedOwner";
    setStatus(() => t("status.opened", { title: entry.title, detail: t(detail) }), "ok");
  } catch (error) { if (request === openRequest) showError("collectionMsg", () => errorMessage(error)); }
}
export async function refreshList() {
  const request = ++listRequest, account = getEmail();
  (document.getElementById("collectionLoginBtn") as HTMLButtonElement).hidden = !!account;
  if (!account) {
    entryList.replaceChildren(emptyCollection("collection.loginRequired"));
    entryList.setAttribute("aria-busy", "false");
    return;
  }
  entryList.setAttribute("aria-busy", "true");
  try {
    const data = await api<{ entries: Entry[] }>("/api/entries");
    if (request !== listRequest || getEmail() !== account) return;
    const fragment = document.createDocumentFragment();
    if (!data.entries.length) fragment.append(emptyCollection("collection.empty"));
    for (const entry of data.entries) {
      const li = el("li"); li.dataset.id = String(entry.id);
      const open = el("button", "entry-open tape-button tape-clear"); open.type = "button";
      open.append(el("span", "entry-title", entry.title));
      const date = el("span", "entry-date", collectionDate(entry.created_at));
      date.dataset.createdAt = entry.created_at;
      open.append(date);
      open.addEventListener("click", () => { void openEntry(entry); });
      li.append(open);
      if (canEdit(entry)) {
        const remove = el("button", "entry-del btn btn-danger tape-icon", "×"); remove.type = "button"; remove.setAttribute("aria-label", t("collection.deleteAria", { title: entry.title }));
        remove.addEventListener("click", () => {
          if (isBusy()) return;
          openRequest++; // Do not let an earlier article read complete behind this confirmation.
          pendingDelete = entry;
          showError("deleteMsg", "");
          setUIText(document.getElementById("deleteDescription")!, msg("collection.deleteDescription", { title: entry.title }));
          openPanel("deletePanel");
        });
        li.append(remove);
      }
      fragment.append(li);
    }
    const focused = document.activeElement;
    const focusedEntry = focused instanceof Element ? focused.closest<HTMLElement>("#entryList li[data-id]") : null;
    entryList.replaceChildren(fragment);
    if (focusedEntry) {
      const replacement = entryList.querySelector<HTMLElement>(`li[data-id="${focusedEntry.dataset.id}"] ${focused?.classList.contains("entry-del") ? ".entry-del" : ".entry-open"}`);
      (replacement ?? document.getElementById("refreshListBtn"))?.focus({ preventScroll: true });
    }
    if (selected && selectionStatus === "ready") {
      const fresh = data.entries.find(entry => entry.id === selected?.id);
      if (fresh) selected = { ...selected, can_edit: fresh.can_edit };
    }
    updateSelection();
  } catch (error) {
    if (request === listRequest) { entryList.replaceChildren(emptyCollection("collection.loadFailed")); setStatus(() => errorMessage(error), "error"); }
  } finally { if (request === listRequest) entryList.setAttribute("aria-busy", "false"); }
}
function updateSaveProgress() {
  const summarizing = saveTask?.phase === "summarizing";
  document.getElementById("titleProgress")!.hidden = !summarizing;
  confirmSaveBtn.setAttribute("aria-busy", String(!!saveTask));
  saveTitle.disabled = confirmSaveBtn.disabled = !!saveTask;
  confirmSaveBtn.textContent = t(summarizing ? "save.findingTitle" : saveTask ? "save.saving" : saveTitle.readOnly ? "reader.saveChanges" : "reader.saveArticle");
}
function titleError(message: UIMessage) {
  showError("saveMsg", message);
  saveTitle.setAttribute("aria-invalid", "true");
  saveTitle.focus({ preventScroll: true });
}
function requestSaveLogin() { loginSaveRequested = true; openLogin(); }
async function save(title?: string) {
  if (isBusy() || selectionStatus !== "ready" || !savePanel.open) return;
  if (!isLoggedIn()) { closePanel("savePanel"); requestSaveLogin(); return; }
  const account = getEmail();
  const text = getCurrentText(), definitions = definitionViews.snapshot(), formatting = getDocumentFormatting();
  const entry = selected;
  const overwrite = entry && canEdit(entry) && saveTitle.readOnly;
  if (!overwrite && !title && !getStoredApiKey()) {
    manualTitleRequired = true;
    return titleError(msg("save.noKey"));
  }
  const task = { request: new AbortController(), phase: !overwrite && !title ? "summarizing" as const : "saving" as const };
  saveTask = task;
  showError("saveMsg", "");
  saveTitle.removeAttribute("aria-invalid");
  setBusy(true);
  updateSaveProgress();
  try {
    if (task.phase === "summarizing") {
      title = await summarizeArticleTitle(text, (system, source, signal) => callDeepSeek(system, source, signal, { maxTokens: 128, jsonObject: true }), task.request.signal);
      if (saveTask !== task || task.request.signal.aborted || getEmail() !== account || getCurrentText() !== text) return;
      saveTitle.value = title;
      task.phase = "saving";
      updateSaveProgress();
    }
    const data = await api<{ id: number }>(overwrite ? `/api/entries/${entry.id}` : "/api/entries", {
      method: overwrite ? "PUT" : "POST", ...jsonBody(overwrite ? { content: text, definitions, formatting } : { title, content: text, definitions, formatting }),
    });
    if (saveTask !== task || getEmail() !== account) return;
    selectEntry(overwrite ? { ...entry, definitions, formatting } : { id: data.id, title: title!, can_edit: true, created_at: "", definitions, formatting }, text);
    rememberDefinitionLanguages();
    saveTask = null;
    setBusy(false);
    updateSaveProgress();
    closePanel("savePanel");
    updateSelection();
    setStatus(msg("save.saved"), "ok");
    void refreshList();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !error.staleSession) { requestSaveLogin(); return; }
    if (saveTask !== task || task.request.signal.aborted || getEmail() !== account) return;
    if (task.phase === "summarizing") {
      manualTitleRequired = true;
      showError("saveMsg", () => t("save.titleError", { error: errorMessage(error) }));
      saveTitle.setAttribute("aria-invalid", "true");
    } else if (savePanel.open) showError("saveMsg", () => errorMessage(error));
    else setStatus(() => errorMessage(error), "error");
  } finally {
    // Closing during AI work releases the lock immediately; late responses cannot save.
    if (saveTask === task) {
      saveTask = null;
      setBusy(false);
      updateSaveProgress();
      if (manualTitleRequired && savePanel.open) saveTitle.focus({ preventScroll: true });
    }
  }
}
export function initDb() {
  articleLanguages.restore();
  window.addEventListener("definition-view-changed", rememberDefinitionLanguages);
  const continueSave = () => {
    if (!loginSaveRequested || !workspaceReady || !isLoggedIn() || selectionStatus !== "ready" || isBusy()) return;
    loginSaveRequested = false;
    saveBtn.click();
  };
  window.addEventListener("workspace-ready", () => { workspaceReady = true; continueSave(); });
  window.addEventListener("entry-selection-changed", () => { queueMicrotask(continueSave); });
  window.addEventListener("save-login-cancelled", () => { loginSaveRequested = false; });
  document.getElementById("authPanel")!.addEventListener("panel-close", () => { if (!isLoggedIn()) loginSaveRequested = false; });
  document.getElementById("collectionLoginBtn")!.addEventListener("click", openLogin);
  saveBtn.addEventListener("click", () => {
    if (isBusy()) return;
    if (!isLoggedIn()) return requestSaveLogin();
    if (selectionStatus === "checking") return;
    if (selectionStatus === "retry") { void reconnectSelection(); return; }
    if (!getCurrentText()) return setStatus(msg("status.pasteFirst"), "error");
    const overwrite = !!selected && canEdit(selected);
    saveTitle.value = overwrite ? selected!.title : "";
    saveTitle.readOnly = overwrite;
    saveTitle.removeAttribute("aria-invalid");
    manualTitleRequired = false;
    document.getElementById("saveHeading")!.textContent = t(overwrite ? "save.headingEdit" : "save.headingNew");
    document.getElementById("saveDescription")!.textContent = t(overwrite ? "save.descriptionEdit" : "save.descriptionNew");
    showError("saveMsg", "");
    updateSaveProgress();
    openPanel("savePanel");
  });
  document.getElementById("saveForm")!.addEventListener("submit", event => {
    event.preventDefault();
    if (isBusy()) return;
    const { clean, hadBad } = sanitizeTitle(saveTitle.value);
    if (hadBad || Array.from(clean).length > 20 || (!clean && manualTitleRequired)) return titleError(msg("save.invalidTitle"));
    void save(clean || undefined);
  });
  saveTitle.addEventListener("input", () => { saveTitle.removeAttribute("aria-invalid"); showError("saveMsg", ""); });
  savePanel.addEventListener("panel-close", () => {
    if (saveTask?.phase !== "summarizing") return; // A sent database write may already have committed.
    const task = saveTask;
    saveTask = null;
    task.request.abort();
    setBusy(false);
    updateSaveProgress();
  });
  collectionPanel.addEventListener("panel-open", () => showError("collectionMsg", ""));
  collectionPanel.addEventListener("panel-close", () => { openRequest++; });
  document.getElementById("refreshListBtn")!.addEventListener("click", () => { void refreshList(); });
  document.getElementById("confirmDeleteBtn")!.addEventListener("click", async () => {
    if (isBusy() || !pendingDelete) return;
    const entry = pendingDelete, account = getEmail(), request = ++deleteRequest;
    const button = document.getElementById("confirmDeleteBtn") as HTMLButtonElement;
    button.disabled = true;
    setBusy(true);
    try {
      await api(`/api/entries/${entry.id}`, { method: "DELETE" });
      if (request !== deleteRequest || getEmail() !== account) return;
      articleLanguages.forget(entry.id);
      if (selected?.id === entry.id) deselectEntry();
      closePanel("deletePanel");
      setStatus(msg("collection.deleted"), "ok");
      void refreshList();
    } catch (error) {
      if (request !== deleteRequest || getEmail() !== account) return;
      if ((document.getElementById("deletePanel") as HTMLDialogElement).open) showError("deleteMsg", () => errorMessage(error));
      else if (collectionPanel.open) showError("collectionMsg", () => errorMessage(error));
      else setStatus(() => errorMessage(error), "error");
    }
    finally { if (request === deleteRequest) { setBusy(false); button.disabled = false; } }
  });
  window.addEventListener("session-changed", () => {
    // Invalidate every old-account response before the editor switches local workspaces.
    openRequest++; selectionRequest++; listRequest++; deleteRequest++; pendingDelete = null; workspaceReady = false;
    window.dispatchEvent(new Event("reading-history-request"));
    if (saveTask) { saveTask.request.abort(); saveTask = null; updateSaveProgress(); }
    setBusy(false);
    for (const id of ["savePanel", "deletePanel", "confirmPanel"]) closePanel(id);
    saveTitle.value = "";
    for (const id of ["collectionMsg", "saveMsg", "deleteMsg"]) showError(id, "");
    document.getElementById("deleteDescription")!.textContent = "";
    (document.getElementById("confirmDeleteBtn") as HTMLButtonElement).disabled = false;
    setStatus("");
    void refreshList();
  });
  // Never trigger a native confirmation popup; drafts cover refresh and tab navigation.
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href='/']")) link.addEventListener("click", async event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (await confirmReplace(msg("confirm.goHome"), msg("confirm.goHomeMessage"))) window.location.assign(link.href);
  });
}

window.addEventListener("ui-language-changed", () => {
  updateSelection();
  updateSaveProgress();
  if (savePanel.open) {
    const overwrite = !!selected && canEdit(selected) && saveTitle.readOnly;
    document.getElementById("saveHeading")!.textContent = t(overwrite ? "save.headingEdit" : "save.headingNew");
    document.getElementById("saveDescription")!.textContent = t(overwrite ? "save.descriptionEdit" : "save.descriptionNew");
  }
  refreshCollectionCopy();
});
