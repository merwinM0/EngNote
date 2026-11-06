import { t, type MessageKey } from "./i18n";
import { openNote, closeNote } from "./notes";

const SAMPLE = "Some stories linger long after the last page. A little reading, every day, opens a new window on the world.";
const SECOND_PAGE = "One page is a small beginning. Come back tomorrow, and let the next story take you somewhere new.";

/** A self-contained practice surface: never imports reader state, storage or AI clients. */
export function initManual(): void {
  const dialog = document.getElementById("manualDialog");
  const trigger = document.getElementById("manualBtn");
  if (!(dialog instanceof HTMLDialogElement) || !(trigger instanceof HTMLButtonElement)) return;
  const root = dialog;
  function element(id: string): HTMLElement {
    const node = root.querySelector(`#${id}`);
    if (!(node instanceof HTMLElement)) throw new Error(`Missing manual element: ${id}`);
    return node;
  }
  function button(id: string): HTMLButtonElement {
    const node = element(id);
    if (!(node instanceof HTMLButtonElement)) throw new Error(`Expected manual button: ${id}`);
    return node;
  }
  const text = element("manualText");
  if (!(text instanceof HTMLTextAreaElement)) throw new Error("Missing manual text field");
  const panels = [...root.querySelectorAll<HTMLElement>("[data-manual-step]")];
  const progress = element("manualProgress"), demo = root.querySelector<HTMLElement>(".manual-demo");
  const previous = button("manualPrevious"), next = button("manualNext");
  const term = button("manualTerm"), note = button("manualNote"), define = button("manualDefine");
  let step = 0, page = 0, selected = false, defined = false, reading = false;
  let chineseFirst = false, chineseNote = false, tidied = false;
  let pasteMessage: MessageKey | null = null;
  let practiceText = SAMPLE;

  function renderParagraphs(): void {
    const paragraphs = tidied ? practiceText.split(/(?<=[.!?])\s+/u) : [practiceText];
    element("manualTidyText").replaceChildren(...paragraphs.map(value => {
      const paragraph = document.createElement("p");
      paragraph.textContent = value;
      return paragraph;
    }));
  }
  function render(): void {
    panels.forEach((panel, index) => { panel.hidden = index !== step; });
    progress.textContent = t("manual.progress", { step: step + 1, total: panels.length });
    element("manualProgressIndicator").style.setProperty("--progress", `${(step + 1) / panels.length * 100}%`);
    element("manualProgressBar").setAttribute("aria-valuemax", String(panels.length));
    element("manualProgressBar").setAttribute("aria-valuenow", String(step + 1));
    previous.disabled = step === 0;
    next.textContent = t(step === panels.length - 1 ? "manual.done" : "manual.next");
    const language = button("manualDefinitionLanguage");
    language.textContent = t(chineseFirst ? "ui.chinese" : "ui.english");
    language.setAttribute("aria-pressed", String(chineseFirst));
    language.setAttribute("aria-label", t("ai.definitionToggle", {
      current: t(chineseFirst ? "ui.chinese" : "ui.english"),
      next: t(chineseFirst ? "ui.english" : "ui.chinese"),
    }));
    element("manualPasteResult").hidden = pasteMessage === null;
    if (pasteMessage) element("manualPasteResult").textContent = t(pasteMessage);
    define.textContent = t("reader.defineSelected", { count: selected ? 1 : 0 });
    define.disabled = reading || !selected || defined;
    term.setAttribute("aria-pressed", String(selected));
    term.disabled = reading || defined;
    button("manualRead").setAttribute("aria-pressed", String(reading));
    button("manualSelect").setAttribute("aria-pressed", String(!reading));
    note.hidden = !defined;
    note.disabled = !reading;
    note.textContent = chineseNote ? "『久久留存』" : "『stay for a long time』";
    note.lang = chineseNote ? "zh-Hans" : "en";
    note.title = t(chineseNote ? "reader.noteShowEnglish" : "reader.noteShowChinese");
    element("manualDefinitionHint").textContent = t(reading
      ? (defined ? "manual.readHint" : "manual.readEmptyHint")
      : (defined ? "manual.definedHint" : selected ? "manual.selectedHint" : "manual.selectHint"));
    button("manualPreviousPage").disabled = page === 0;
    button("manualNextPage").disabled = page === 1;
    element("manualPagePosition").textContent = `${page + 1} / 2`;
    element("manualReadingText").textContent = page === 0 ? practiceText : SECOND_PAGE;
  }
  function moveStep(direction: number): void {
    step = Math.max(0, Math.min(panels.length - 1, step + direction));
    render();
    if (demo) demo.scrollTop = 0;
    progress.focus({ preventScroll: true });
  }
  trigger.addEventListener("click", () => {
    step = 0; page = 0; selected = false; defined = false; reading = false;
    chineseFirst = false; chineseNote = false; tidied = false; pasteMessage = null;
    practiceText = SAMPLE;
    text.value = SAMPLE;
    for (const id of ["manualKeyResult", "manualTidyResult", "manualSaveResult"]) element(id).hidden = true;
    element("manualReadingPaper").classList.remove("is-tinted", "is-large");
    renderParagraphs(); render();
    openNote(root);
    document.documentElement.classList.add("manual-open");
  });
  root.addEventListener("panel-close", () => document.documentElement.classList.remove("manual-open"));
  previous.addEventListener("click", () => moveStep(-1));
  next.addEventListener("click", () => step === panels.length - 1 ? closeNote(root.id) : moveStep(1));
  button("manualPaste").addEventListener("click", () => {
    const value = text.value.trim().replace(/\s+/gu, " ");
    pasteMessage = value ? "manual.pasted" : "manual.empty";
    if (value) {
      practiceText = value;
      tidied = false;
      element("manualTidyResult").hidden = true;
      renderParagraphs();
    }
    render();
  });
  button("manualDefinitionLanguage").addEventListener("click", () => { chineseFirst = !chineseFirst; render(); });
  button("manualSaveKey").addEventListener("click", () => { element("manualKeyResult").hidden = false; });
  button("manualTidy").addEventListener("click", () => {
    tidied = true;
    renderParagraphs();
    element("manualTidyResult").hidden = false;
  });
  button("manualSelect").addEventListener("click", () => { reading = false; render(); });
  button("manualRead").addEventListener("click", () => { reading = true; selected = false; render(); });
  term.addEventListener("click", () => { if (!reading && !defined) { selected = !selected; render(); } });
  define.addEventListener("click", () => {
    defined = true; chineseNote = chineseFirst; render();
    button("manualRead").focus();
  });
  note.addEventListener("click", () => { if (reading) { chineseNote = !chineseNote; render(); } });
  button("manualSave").addEventListener("click", () => { element("manualSaveResult").hidden = false; });
  button("manualPreviousPage").addEventListener("click", () => { page = 0; render(); button("manualNextPage").focus(); });
  button("manualNextPage").addEventListener("click", () => { page = 1; render(); button("manualPreviousPage").focus(); });
  button("manualBackground").addEventListener("click", () => element("manualReadingPaper").classList.toggle("is-tinted"));
  button("manualFont").addEventListener("click", () => element("manualReadingPaper").classList.toggle("is-large"));
  window.addEventListener("ui-language-changed", render);
  renderParagraphs(); render();
}
