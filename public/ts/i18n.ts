/**
 * Interface language is separate from the per-note / AI-definition language.
 * English is the source language and the default; Chinese is applied on demand.
 */
import type { AIUsageSnapshot } from "./aiUsage";

export type UILanguage = "en" | "zh";
export const UI_LANGUAGE_STORAGE = "er_ui_language_v1";

const en = {
  "ui.switchToZh": "Switch interface to Chinese",
  "ui.switchToEn": "Switch interface to English",
  "ui.chinese": "Chinese",
  "ui.english": "English",

  "home.skip": "Skip to content",
  "home.brandHome": "EngNote home",
  "home.openNotebook": "Open your notebook <span aria-hidden=\"true\">↗</span>",
  "home.eyebrow": "A small habit. A world of words.",
  "home.titleHtml": "Read English <em>your way</em>",
  "home.sub": "Stay with the story. Start with clear English definitions, click a note in Read to see its Chinese meaning, and pick up where you left off.",
  "home.start": "Start a new page <span aria-hidden=\"true\">→</span>",
  "home.hint": "Read without an account · Sign in to save your pages",
  "home.figcaption": "one page at a time",
  "home.notesTitle": "Inside your notebook",
  "home.notesSub": "three little things to help you read",
  "home.feature1Number": "01 / A fresh page",
  "home.feature1Title": "Bring a story.",
  "home.feature1Body": "Paste an English article. Let AI tidy the paragraphs, then settle into a calmer reading space.",
  "home.feature1Hand": "less clutter, more reading",
  "home.feature2Number": "02 / In the margins",
  "home.feature2Title": "English first. Chinese when you need it.",
  "home.feature2Body": "AI creates English and Chinese definitions together. Choose your default in AI setup, then click a note in Read to switch. Each note remembers your choice when you refresh.",
  "home.feature2Hand": "just the help you need",
  "home.feature3Number": "03 / Worth keeping",
  "home.feature3Title": "Keep the good pages.",
  "home.feature3Body": "Keep your articles and notes in one collection. Return to the page you were reading, and save changes to the original story.",
  "home.feature3Hand": "something to come back to",

  "manual.button": "amnual",
  "manual.eyebrow": "A quick, hands-on tour",
  "manual.title": "Your first page, in five steps.",
  "manual.close": "Close manual",
  "manual.disclaimer": "A small practice notebook. No AI requests, real keys or saved articles are involved.",
  "manual.progress": "Step {step} of {total}",
  "manual.previous": "← Previous step",
  "manual.next": "Next step →",
  "manual.done": "Finish tour ✓",
  "manual.pasteTitle": "Bring a little English.",
  "manual.pasteDescription": "Try the sample below, or paste a short passage and reflow it. In the real notebook, Paste text and Import Word turn your article into reading pages.",
  "manual.aiTitle": "Meet your reading companion.",
  "manual.aiDescription": "Open AI setup on the reading page to add your DeepSeek key. Try the demo controls here; nothing is stored.",
  "manual.tidyTitle": "Give the words some room.",
  "manual.tidyDescription": "Try Tidy this page to see a cleaner layout. The real tool uses AI to tidy the current page before you add notes.",
  "manual.defineTitle": "A little help in the margins.",
  "manual.defineDescription": "Choose Add definitions, select linger, then define it. Choose Read and click the note to switch between English and Chinese.",
  "manual.saveTitle": "Read on. Keep the good pages.",
  "manual.saveDescription": "Try turning the page, changing the paper or reading size, and saving. The real notebook saves every page and note together; Saved articles brings them back.",
  "manual.sampleHint": "A short sample is ready. You can edit it, too.",
  "manual.pasted": "Your practice page is ready. Use Next step to try AI setup.",
  "manual.empty": "Add a little text first, or reopen the tour to restore the sample.",
  "manual.demoKey": "Demo API key · no real key needed",
  "manual.keyReady": "Demo key ready. In the real notebook, your key stays in this tab and goes only to DeepSeek.",
  "manual.aiHint": "Your own DeepSeek key powers tidying, bilingual definitions and automatic titles. This setting chooses the starting language of new notes, not the interface language.",
  "manual.tidied": "Paragraphs tidied. Do this before adding definitions so your notes stay intact.",
  "manual.selectHint": "Click linger to select the word, then Define selected.",
  "manual.selectedHint": "One word selected. Click Define selected to add a bilingual note.",
  "manual.definedHint": "A bilingual note is ready. Choose Read to try switching its language.",
  "manual.readHint": "Click the note in brackets to switch its language — no new AI request needed.",
  "manual.readEmptyHint": "Choose Add definitions to try adding a note first.",
  "manual.saved": "Practice article saved — just pretend! Sign in on the reading page to save all pages and notes to your collection.",

  "reader.skip": "Skip to notebook",
  "reader.brandHome": "EngNote home",
  "reader.backHome": "Back to home",
  "reader.topActions": "Collection, settings and account",
  "reader.savedArticles": "Saved articles",
  "reader.aiSetup": "AI setup",
  "reader.login": "Login",
  "reader.account": "Account",
  "reader.readingNotebook": "Reading notebook",
  "reader.tools": "Reading tools",
  "reader.read": "Read",
  "reader.pasteText": "Paste text",
  "reader.editPage": "Edit page",
  "reader.importWord": "Import Word",
  "reader.tidy": "✦ Tidy this page",
  "reader.tidying": "Tidying…",
  "reader.defineSelected": "Define selected ({count})",
  "reader.defineTitle": "Reuse existing notes and cached definitions before requesting AI",
  "reader.refreshSelected": "Refresh selected",
  "reader.refreshTitle": "Bypass reuse and request new AI definitions for selected terms",
  "reader.addDefinitions": "✎ Add definitions",
  "reader.removeNote": "Remove a note",
  "reader.saveArticle": "Save article",
  "reader.saveChanges": "Save changes",
  "reader.retrySaved": "Retry saved article",
  "reader.restoring": "Restoring article…",
  "reader.clear": "Clear",
  "reader.previous": "← Previous",
  "reader.next": "Next →",
  "reader.previousPage": "← Previous page",
  "reader.nextPage": "Next page →",
  "reader.page": "Page",
  "reader.choosePage": "Choose page",
  "reader.background": "Background",
  "reader.backgroundLabel": "Background: {name}",
  "reader.backgroundTitle": "Reading background: {name}",
  "reader.defaultArticle": "A fresh article",
  "reader.fontSize": "Change reading font size",
  "reader.fontSizeLabel": "Reading size {size}. Click for next size.",
  "reader.pagination": "Article pagination",
  "reader.contentLabel": "Current article page",
  "reader.contentPlaceholder": "Your next story starts here. Choose Paste text, then use Ctrl / Cmd + V, or import a Word document.",
  "reader.wordCount": "{count} words on this page",
  "reader.documentSummary": "{count} characters in this article",
  "reader.continueReading": "Continue reading",
  "reader.pageSummary": "{count} / {limit} characters",
  "reader.documentSummaryLong": "{count} characters · {pages} page(s) in this article",
  "reader.backgroundEyebrow": "A different kind of page",
  "reader.backgroundHeading": "Choose your reading paper.",
  "reader.backgroundDescription": "Choose a texture below. Your reading page changes immediately; your article stays untouched.",
  "reader.readingBackgroundLegend": "Reading background",
  "reader.backToReading": "Back to reading",
  "reader.closeBackgrounds": "Close reading backgrounds",
  "reader.noteDeleteHint": "Select twice to remove this definition.",
  "reader.noteEnglishOnly": "English-only note. Use Add definitions to generate both languages.",
  "reader.noteShowEnglish": "Click to show the English definition.",
  "reader.noteShowChinese": "Click to show the Chinese definition.",
  "reader.noteReadToSwitch": "Choose Read to switch this definition's language.",
  "reader.addDefinitionsTitle": "Select words to define. Choose Read to return to reading.",
  "reader.modeSelect": "Select words, then Define selected (reuse notes and cache first) or Refresh selected (new AI request). Read or Esc returns.",
  "reader.modeDelete": "Select a note, then select it again to remove it. Read or Esc exits.",

  "editor.eyebrow": "In your own words",
  "editor.titlePaste": "Text in. A few new pages.",
  "editor.titleEdit": "Edit the current page.",
  "editor.titleWord": "Bring a Word article.",
  "editor.descriptionPaste": "Paste with Ctrl / Cmd + V below. We never request clipboard access. Text is reflowed and split into pages of at most 3,000 characters.",
  "editor.descriptionEdit": "Edit or paste directly into this page. Overflow moves to following pages and the editor follows your cursor. Definitions are written as 『meaning』.",
  "editor.labelPaste": "English article",
  "editor.labelEdit": "Page text",
  "editor.placeholder": "Click here, then press Ctrl / Cmd + V…",
  "editor.previewHint": "Punctuation, spaces and line breaks all count.",
  "editor.draftHint": "A working draft is kept in this tab. Use Save article for permanent storage.",
  "editor.back": "Back to reading",
  "editor.apply": "Reflow & start reading",
  "editor.wordLabel": "Or import a Word document (.docx, up to 5 MB)",
  "editor.wordHint": "Extracted on your device. Importing Word replaces the whole article after confirmation. Save old .doc files as .docx first.",
  "editor.previewEdit": "Page {page} / {total} · {count} / 3,000 characters. Changes apply as you type.",
  "editor.previewTooLong": "This article exceeds the 100,000-character limit. Shorten it before importing; nothing will be truncated.",
  "editor.previewPaste": "{count} characters after reflow · {pages} page(s). Punctuation, spaces and line breaks all count.",
  "editor.tooLong": "Use an article shorter than 100,000 characters. The current article has not changed.",
  "editor.empty": "Paste some text, or choose a readable Word document first.",
  "editor.reflowDone": "Article reflowed into {count} page(s). Showing the first page; Save article keeps every page.",
  "editor.overflow": "Overflow moved forward. Now editing page {page} of {total}.",
  "editor.storageWarning": "Browser storage is unavailable. Use Save article before refreshing or leaving this tab.",
  "editor.draftRestoredSaved": "Your article and reading position are restored. Reconnecting to the saved article…",
  "editor.draftRestoredUnsaved": "Your tab's working draft has been restored as an unsaved article. Every page is here; save it to keep it permanently.",
  "editor.wordReading": "Reading the Word document on your device…",
  "editor.wordReady": "Word text is ready. Confirm the replacement, or keep it here for later.",

  "save.eyebrow": "Worth keeping",
  "save.headingNew": "Save the whole article.",
  "save.headingEdit": "Keep your latest changes.",
  "save.descriptionNew": "Leave the title blank and AI will sum up your article in a short English title.",
  "save.descriptionEdit": "Keep the original title and update every page and definition together.",
  "save.titleLabel": "English title · up to 20 characters",
  "save.titlePlaceholder": "Your title, or let AI find one…",
  "save.titleProgress": "Finding a title, one piece of tape at a time…",
  "save.findingTitle": "Finding a title…",
  "save.saving": "Saving…",
  "save.cancel": "Cancel",
  "save.close": "Close save article",
  "save.loginAgain": "Please log in again before saving. Your article has been kept.",
  "save.noKey": "AI could not create a title: no key is set in AI setup. Please enter an English title yourself.",
  "save.titleError": "AI could not create a title. Please enter an English title yourself (1–20 characters). {error}",
  "save.invalidTitle": "Please enter an English title of 1–20 characters.",
  "save.saved": "All pages saved together, including your definitions.",

  "collection.close": "Close saved articles",
  "collection.refresh": "Refresh saved articles",
  "collection.shelf": "A public reading shelf. Only the author can change an article.",
  "collection.canvas": "Saved articles canvas",
  "collection.view": "Canvas view",
  "collection.loading": "Loading the reading shelf…",
  "collection.empty": "No pages yet. Save a story to begin the collection.",
  "collection.loadFailed": "Could not load pages. Use ↻ to try again.",
  "collection.fitAll": "Fit all",
  "collection.reset": "Reset 100%",
  "collection.minimum": " · minimum",
  "collection.maximum": " · maximum",
  "collection.savedPage": "Saved page",
  "collection.deleteAria": "Delete {title}",
  "collection.deleteDescription": "Delete “{title}” and all its saved pages? The text in your notebook will be kept.",
  "collection.deleted": "Saved page deleted. Text in your notebook has been kept.",

  "delete.close": "Close delete article",
  "delete.eyebrow": "The collection",
  "delete.heading": "Let this article go?",
  "delete.description": "All its saved pages will be deleted. The text in your notebook will be kept.",
  "delete.keep": "Keep it",
  "delete.delete": "Delete article",

  "confirm.eyebrow": "Before you turn the page",
  "confirm.heading": "Keep your changes?",
  "confirm.keepEditing": "Keep editing",
  "confirm.continue": "Continue",
  "confirm.replaceArticle": "Replace article",
  "confirm.replaceMessage": "This article has unsaved changes across its pages. Replace it without saving these changes to your collection?",
  "confirm.goHome": "Go to home",
  "confirm.goHomeMessage": "This article has unsaved changes. Leave the notebook? A working copy remains in this tab, but it is not saved to your collection.",
  "confirm.clearArticle": "Clear article",
  "confirm.clearMessage": "Discard this working article and all its pages? Your saved collection will not change.",

  "ai.close": "Close AI setup",
  "ai.eyebrow": "A little help in the margins",
  "ai.titleHtml": "A note for your<br /><em>reading companion.</em>",
  "ai.description": "Bring your own DeepSeek key for tidy paragraphs, paired English and Chinese definitions and article titles.",
  "ai.newDefinitions": "New AI definitions",
  "ai.definitionHintEn": "New AI definitions start in English.",
  "ai.definitionHintZh": "New AI definitions start in Chinese.",
  "ai.definitionToggle": "New definitions start in {current}. Click to use {next}.",
  "ai.definitionStorage": " Browser storage is blocked; this choice only lasts until you leave or refresh.",
  "ai.keyLabel": "Write your API key here",
  "ai.keyPlaceholder": "sk-your-deepseek-key",
  "ai.showKey": "Show key",
  "ai.hideKey": "Hide key",
  "ai.forgetKey": "Forget key",
  "ai.keepTab": "Keep for this tab",
  "ai.usageSummary": "Usage & dictionary cache",
  "ai.usageHint": "General definitions are reused on this browser for up to 7 days (256 entries). Only queried terms and definitions are stored, never API keys. Use Refresh selected to regenerate.",
  "ai.clearCache": "Clear dictionary cache",
  "ai.footnote": "a small tool, a quieter page.",
  "ai.triggerTitle": "Set up your DeepSeek key",
  "ai.triggerSetTitle": "DeepSeek key is set for this tab",
  "ai.keyMissing": "Write your DeepSeek key on the line first.",
  "ai.keySaved": "AI key kept for this tab. It will be sent only to DeepSeek.",
  "ai.keySavedStorageBlocked": "Your key is ready for this page, but tab storage is blocked. You will need to enter it again after refreshing.",
  "ai.keyForgotten": "Key forgotten. You can write a new one whenever you need it.",
  "ai.keyForgottenBlocked": "Key cleared for this page. Browser storage could not be cleared; please check this site's storage settings.",
  "ai.cacheCleared": "Query cache cleared. Saved article notes are unchanged.",
  "ai.cacheClearFailed": "Memory cache cleared. Browser storage could not be cleared; stored entries may return after reload.",
  "ai.usageNone": "No AI requests in this tab yet.",
  "ai.usageStats": "{requests} request(s) · reported input {input} / output {output} tokens. ",
  "ai.usageCache": "Provider-cached input: {cached} tokens ({cacheRequests}/{reports} usage reports). ",
  "ai.usageCacheMissing": "Provider cache usage was not reported. ",
  "ai.usageUnknown": "{unknown} request(s) have unknown token usage, including interrupted or failed requests. ",
  "ai.usageBill": "Counts are not a bill; check your provider for charges.",

  "auth.close": "Close account",
  "auth.eyebrow": "Your reading collection",
  "auth.heading": "A place for your stories.",
  "auth.signedIn": "You're signed in.",
  "auth.logout": "Logout",
  "auth.accountAction": "Account action",
  "auth.login": "Login",
  "auth.register": "Register",
  "auth.welcomeBack": "Welcome back.",
  "auth.startCollection": "Start your collection.",
  "auth.email": "Email",
  "auth.emailPlaceholder": "you@example.com",
  "auth.code": "Verification code",
  "auth.codePlaceholder": "6-digit code",
  "auth.sendCode": "Send code",
  "auth.sending": "Sending…",
  "auth.retryIn": "Retry in {seconds}s",
  "auth.password": "Password",
  "auth.passwordPlaceholder": "At least 6 characters",
  "auth.back": "Back",
  "auth.accountCreated": "Account created. You can now log in.",
  "auth.welcomeUser": "Welcome back, {email}.",
  "auth.loggedOut": "You are logged out.",
  "auth.sessionExpired": "Your session has expired. Please log in again.",
  "auth.emailFirst": "Enter a valid email address first.",
  "auth.validEmail": "Enter a valid email address.",
  "auth.passwordLength": "Use a password of 6–128 characters.",
  "auth.codeLength": "Enter the 6-digit verification code.",
  "auth.checkInbox": "Code sent. Please check your inbox.",
  "auth.devCode": "Local development code: {code}",
  "auth.signedInAs": "Signed in as {email}",
  "auth.signInTitle": "Sign in to save your articles",

  "status.pasteFirst": "Paste an English article first.",
  "status.selectFirst": "Select a word or phrase first.",
  "status.definitionsCanceled": "Definitions canceled. Existing notes have been kept.",
  "status.batch": "Finding short bilingual definitions · batch {index}/{total}…",
  "status.summary": "{ready}/{total} term(s) ready · {kept} existing note(s) kept · {cached} cached result(s) reused · {requests} AI request(s).",
  "status.missing": " Select only missing terms to retry.",
  "status.formatPasteFirst": "Paste an English article first.",
  "status.formatHasNotes": "Tidy paragraphs before adding definitions. Existing notes have been kept intact.",
  "status.formatWorking": "DeepSeek is tidying the paragraphs…",
  "status.formatDone": "This page has been tidied and repaginated. Other pages have been kept.",
  "status.definitionRemoved": "Definition removed.",
  "status.definitionSelected": "Selected this 『』 note — click it once more to remove it",
  "status.keyMissing": "Use AI setup to add your DeepSeek API key first.",
  "status.oldNoteEnglishOnly": "This older note only has English. Select its word with Add definitions to generate both languages together.",
  "status.readingMode": "Reading mode. Existing definitions have been kept.",
  "status.freshArticle": "A fresh article. Your saved collection has not been changed.",
  "status.loginToSave": "Please log in to save a page.",
  "status.resumed": "Resumed “{title}”. {detail}",
  "status.resumedChanged": "The saved text has changed elsewhere. Your working copy is kept; review it before saving.",
  "status.resumedUnsaved": "Your unsaved changes have been kept.",
  "status.resumedPosition": "Your reading position has been kept.",
  "status.resumedOwner": " Save changes updates the original article.",
  "status.resumedGuest": " Save article keeps your own copy.",
  "status.gone": "The saved article no longer exists. Your working copy and reading position are kept as an unsaved article.",
  "status.reconnectFailed": "Could not reconnect your saved article. Your working copy is safe. Choose Retry saved article to try again. {error}",
  "status.opening": "Opening “{title}”…",
  "status.opened": "Opened “{title}”. {detail}",
  "status.openedOwner": "Save changes to update this page.",
  "status.openedGuest": "Save article to keep your own copy.",
  "status.unknown": "Something went wrong. Please try again.",
  "status.requestFailed": "Request failed ({status})",
  "status.backgroundCurrent": "Current paper: {name}. {remembered}",
  "status.backgroundRemembered": "Remembered on this browser.",
  "status.backgroundUnavailable": "Browser storage is unavailable; this choice lasts until you leave or reload.",

  "background.original.name": "Original",
  "background.original.description": "Original notebook",
  "background.yunlong.name": "Cloud dragon paper",
  "background.yunlong.description": "Long, cloud-like fibres",
  "background.cotton.name": "Cotton paper",
  "background.cotton.description": "Soft cotton grain",
  "background.earth.name": "Earth paper",
  "background.earth.description": "Natural flecks",
  "background.kraft.name": "Kraft paper",
  "background.kraft.description": "Warm, unbleached kraft",
  "background.linen.name": "Linen paper",
  "background.linen.description": "Fine linen weave",
  "background.art.name": "Art texture paper",
  "background.art.description": "Soft sculpted ripples",
  "background.elegant.name": "Elegant paper",
  "background.elegant.description": "Delicate embossed lines",
  "background.leather.name": "Leather paper",
  "background.leather.description": "Supple, pebbled grain",
} as const;

const zh: Record<keyof typeof en, string> = {
  "ui.switchToZh": "切换到中文界面",
  "ui.switchToEn": "切换到英文界面",
  "ui.chinese": "中文",
  "ui.english": "英文",

  "home.skip": "跳到正文",
  "home.brandHome": "EngNote 首页",
  "home.openNotebook": "打开你的笔记本 <span aria-hidden=\"true\">↗</span>",
  "home.eyebrow": "一个小习惯，一片词的海洋。",
  "home.titleHtml": "读英文，<em>按你的节奏</em>",
  "home.sub": "留在故事里。从清晰的英文释义开始，在阅读模式点击批注即可查看中文，再从上一次停下的地方继续。",
  "home.start": "开始新的一页 <span aria-hidden=\"true\">→</span>",
  "home.hint": "无需账号即可阅读 · 登录后可保存页面",
  "home.figcaption": "一页一页慢慢读",
  "home.notesTitle": "笔记本里有什么",
  "home.notesSub": "三个帮助你阅读的小设计",
  "home.feature1Number": "01 / 崭新一页",
  "home.feature1Title": "带来一个故事。",
  "home.feature1Body": "粘贴一篇英文文章，让 AI 整理好段落，然后安静地读下去。",
  "home.feature1Hand": "少一点杂乱，多一点阅读",
  "home.feature2Number": "02 / 写在页边",
  "home.feature2Title": "先读英文，需要时再看中文。",
  "home.feature2Body": "AI 会同时生成英文和中文释义。在 AI 设置中选择默认显示语言，再在阅读模式点击批注切换。每条批注都会记住你的选择，刷新后仍然保留。",
  "home.feature2Hand": "只给刚刚好的帮助",
  "home.feature3Number": "03 / 值得留下",
  "home.feature3Title": "把喜欢的页面留下。",
  "home.feature3Body": "把文章和注释收进同一个收藏。回到上次阅读的页面，也可以把修改保存回原文。",
  "home.feature3Hand": "留给下次回来",

  "manual.button": "使用指南",
  "manual.eyebrow": "动手试试，几步就会",
  "manual.title": "五步，开始你的第一页。",
  "manual.close": "关闭使用指南",
  "manual.disclaimer": "这是一个练习笔记本。不会请求 AI、使用真实密钥或保存真实文章。",
  "manual.progress": "第 {step} / {total} 步",
  "manual.previous": "← 上一步",
  "manual.next": "下一步 →",
  "manual.done": "完成演示 ✓",
  "manual.pasteTitle": "带来一小段英文。",
  "manual.pasteDescription": "试试下方示例，也可以粘贴一小段文字并重新排版。正式阅读页的「粘贴文本」和「导入 Word」会将整篇文章分成阅读页面。",
  "manual.aiTitle": "认识你的阅读伙伴。",
  "manual.aiDescription": "在阅读页打开「AI 设置」，填入自己的 DeepSeek 密钥。这里可以试用模拟控件，不会存储任何设置。",
  "manual.tidyTitle": "让文字舒展一点。",
  "manual.tidyDescription": "点击「整理本页」看看段落变化。正式功能会用 AI 整理当前页，建议在添加释义前操作。",
  "manual.defineTitle": "在页边，添一点帮助。",
  "manual.defineDescription": "选择「添加释义」，点击 linger 选词，再生成释义。切到「阅读」后，点击批注即可切换中英文。",
  "manual.saveTitle": "继续读，也把好页面留下。",
  "manual.saveDescription": "试试翻页、更换纸张、调整字号和保存。正式阅读页会将全部页面与释义一起保存，可从「已保存文章」中重新打开。",
  "manual.sampleHint": "已经准备好一小段示例，也可以自己修改。",
  "manual.pasted": "练习页面准备好了，点击「下一步」试试 AI 设置。",
  "manual.empty": "请先输入一点文字，或重新打开指南恢复示例。",
  "manual.demoKey": "演示 API key · 无需真实密钥",
  "manual.keyReady": "演示密钥已就绪。正式阅读页的密钥仅保留在当前标签页，只发送给 DeepSeek。",
  "manual.aiHint": "自己的 DeepSeek 密钥用于整理段落、生成双语释义和自动标题。这里选择的是新批注的默认语言，不是界面语言。",
  "manual.tidied": "段落整理好了。先整理、再添加释义，可以保留完整的批注。",
  "manual.selectHint": "点击 linger 选中单词，再点击「为所选词释义」。",
  "manual.selectedHint": "已选中一个单词，点击「为所选词释义」添加双语批注。",
  "manual.definedHint": "双语批注准备好了。选择「阅读」试试切换释义语言。",
  "manual.readHint": "点击括号里的批注即可切换语言，无需再次请求 AI。",
  "manual.readEmptyHint": "先选择「添加释义」，试试添加一条批注。",
  "manual.saved": "练习文章已模拟保存！在正式阅读页登录后，即可把所有页面和批注保存到收藏。",

  "reader.skip": "跳到笔记本",
  "reader.brandHome": "EngNote 首页",
  "reader.backHome": "返回首页",
  "reader.topActions": "收藏、设置与账户",
  "reader.savedArticles": "已保存文章",
  "reader.aiSetup": "AI 设置",
  "reader.login": "登录",
  "reader.account": "账户",
  "reader.readingNotebook": "阅读笔记本",
  "reader.tools": "阅读工具",
  "reader.read": "阅读",
  "reader.pasteText": "粘贴文本",
  "reader.editPage": "编辑本页",
  "reader.importWord": "导入 Word",
  "reader.tidy": "✦ 整理本页",
  "reader.tidying": "整理中…",
  "reader.defineSelected": "为所选词释义（{count}）",
  "reader.defineTitle": "先复用已有注释和缓存释义，再请求 AI",
  "reader.refreshSelected": "重新生成所选释义",
  "reader.refreshTitle": "跳过已有注释和缓存，为所选词条重新请求 AI 释义",
  "reader.addDefinitions": "✎ 添加释义",
  "reader.removeNote": "删除注释",
  "reader.saveArticle": "保存文章",
  "reader.saveChanges": "保存修改",
  "reader.retrySaved": "重试找回文章",
  "reader.restoring": "正在找回文章…",
  "reader.clear": "清空",
  "reader.previous": "← 上一页",
  "reader.next": "下一页 →",
  "reader.previousPage": "← 上一页",
  "reader.nextPage": "下一页 →",
  "reader.page": "页码",
  "reader.choosePage": "选择页码",
  "reader.background": "背景",
  "reader.backgroundLabel": "背景：{name}",
  "reader.backgroundTitle": "阅读背景：{name}",
  "reader.defaultArticle": "一篇新文章",
  "reader.fontSize": "调整阅读字号",
  "reader.fontSizeLabel": "当前阅读字号 {size}，点击切换下一个字号。",
  "reader.pagination": "文章分页",
  "reader.contentLabel": "当前文章页",
  "reader.contentPlaceholder": "你的下一个故事从这里开始。选择「粘贴文本」，然后按 Ctrl / Cmd + V，或导入 Word 文档。",
  "reader.wordCount": "本页 {count} 个单词",
  "reader.documentSummary": "全文 {count} 个字符",
  "reader.continueReading": "继续阅读",
  "reader.pageSummary": "{count} / {limit} 个字符",
  "reader.documentSummaryLong": "{count} 个字符 · 全文 {pages} 页",
  "reader.backgroundEyebrow": "换一种纸页",
  "reader.backgroundHeading": "选择你的阅读纸。",
  "reader.backgroundDescription": "在下面选择一种纹理。阅读页会立即变化，文章本身不会改动。",
  "reader.readingBackgroundLegend": "阅读背景",
  "reader.backToReading": "返回阅读",
  "reader.closeBackgrounds": "关闭阅读背景",
  "reader.noteDeleteHint": "再点一次即可删除这条释义。",
  "reader.noteEnglishOnly": "这条注释只有英文。使用「添加释义」可同时生成中英文。",
  "reader.noteShowEnglish": "点击查看英文释义。",
  "reader.noteShowChinese": "点击查看中文释义。",
  "reader.noteReadToSwitch": "选择「阅读」后可切换这条释义的语言。",
  "reader.addDefinitionsTitle": "选择要释义的单词；按「阅读」返回阅读。",
  "reader.modeSelect": "选择单词后点「为所选词释义」（优先复用注释和缓存），或点「重新生成所选释义」发起新的 AI 请求。按「阅读」或 Esc 返回。",
  "reader.modeDelete": "选择一条批注，再点一次即可删除。按「阅读」或 Esc 退出。",

  "editor.eyebrow": "用你自己的文字",
  "editor.titlePaste": "粘贴文字，生成新页面。",
  "editor.titleEdit": "编辑当前页。",
  "editor.titleWord": "导入一篇 Word 文章。",
  "editor.descriptionPaste": "在下方按 Ctrl / Cmd + V 粘贴。我们不会请求剪贴板权限。文字会重新排版，并拆分为每页最多 3,000 个字符。",
  "editor.descriptionEdit": "直接在本页编辑或粘贴。超出部分会移到后面的页面，编辑器会跟随光标。释义写成 『meaning』 的形式。",
  "editor.labelPaste": "英文文章",
  "editor.labelEdit": "本页文本",
  "editor.placeholder": "点击这里，然后按 Ctrl / Cmd + V…",
  "editor.previewHint": "标点、空格和换行都会计入字符数。",
  "editor.draftHint": "工作草稿保存在当前标签页。永久保存请使用「保存文章」。",
  "editor.back": "返回阅读",
  "editor.apply": "重新排版并开始阅读",
  "editor.wordLabel": "或导入 Word 文档（.docx，最大 5 MB）",
  "editor.wordHint": "文件在你的设备上解析。导入 Word 会在确认后替换整篇文章。旧版 .doc 请先另存为 .docx。",
  "editor.previewEdit": "第 {page} / {total} 页 · {count} / 3,000 个字符。输入会立即生效。",
  "editor.previewTooLong": "文章超过 100,000 个字符的上限。请先缩短再导入；不会自动截断。",
  "editor.previewPaste": "重新排版后 {count} 个字符 · {pages} 页。标点、空格和换行都会计入。",
  "editor.tooLong": "请使用不超过 100,000 个字符的文章。当前文章没有改变。",
  "editor.empty": "请先粘贴一些文字，或选择一个可读取的 Word 文档。",
  "editor.reflowDone": "文章已重新排版为 {count} 页。当前显示第一页；「保存文章」会保存全部页面。",
  "editor.overflow": "内容已向后溢出。现在编辑第 {page} / {total} 页。",
  "editor.storageWarning": "浏览器存储不可用。刷新或离开标签页前请使用「保存文章」。",
  "editor.draftRestoredSaved": "已恢复文章和阅读位置。正在重新连接已保存的文章…",
  "editor.draftRestoredUnsaved": "当前标签页的工作草稿已恢复为未保存文章。所有页面都在这里，保存后可永久保留。",
  "editor.wordReading": "正在读取设备上的 Word 文档…",
  "editor.wordReady": "Word 文本已准备好。确认后替换，或先留在这里稍后使用。",

  "save.eyebrow": "值得留下",
  "save.headingNew": "保存整篇文章。",
  "save.headingEdit": "保留最新修改。",
  "save.descriptionNew": "标题可以留空，AI 会用简短的英文标题概括全文。",
  "save.descriptionEdit": "保留原标题，同时更新所有页面和释义。",
  "save.titleLabel": "英文标题 · 最多 20 个字符",
  "save.titlePlaceholder": "输入标题，或让 AI 来起名…",
  "save.titleProgress": "正在一点点贴上标题胶带…",
  "save.findingTitle": "正在起名…",
  "save.saving": "正在保存…",
  "save.cancel": "取消",
  "save.close": "关闭保存文章",
  "save.loginAgain": "保存前请重新登录。你的文章已保留。",
  "save.noKey": "AI 无法生成标题：AI 设置中没有密钥。请手动输入英文标题。",
  "save.titleError": "AI 无法生成标题。请手动输入 1–20 个字符的英文标题。{error}",
  "save.invalidTitle": "请输入 1–20 个字符的英文标题。",
  "save.saved": "所有页面和释义已一起保存。",

  "collection.close": "关闭已保存文章",
  "collection.refresh": "刷新已保存文章",
  "collection.shelf": "公开阅读书架。只有作者可以修改文章。",
  "collection.canvas": "已保存文章画布",
  "collection.view": "画布视图",
  "collection.loading": "正在加载阅读书架…",
  "collection.empty": "还没有页面。保存一个故事开始收藏吧。",
  "collection.loadFailed": "无法加载页面。点击 ↻ 重试。",
  "collection.fitAll": "适配全部",
  "collection.reset": "恢复 100%",
  "collection.minimum": " · 已缩到最小",
  "collection.maximum": " · 已放到最大",
  "collection.savedPage": "已保存页面",
  "collection.deleteAria": "删除 {title}",
  "collection.deleteDescription": "删除「{title}」及其所有已保存页面？你笔记本里的文字会保留。",
  "collection.deleted": "已删除保存的页面。你笔记本里的文字已保留。",

  "delete.close": "关闭删除文章",
  "delete.eyebrow": "收藏",
  "delete.heading": "要放开这篇文章吗？",
  "delete.description": "它所有已保存的页面都会被删除。你笔记本里的文字会保留。",
  "delete.keep": "保留",
  "delete.delete": "删除文章",

  "confirm.eyebrow": "翻页之前",
  "confirm.heading": "保留你的修改吗？",
  "confirm.keepEditing": "继续编辑",
  "confirm.continue": "继续",
  "confirm.replaceArticle": "替换文章",
  "confirm.replaceMessage": "这篇文章有未保存修改。要放弃修改并替换当前工作文章吗？已保存的收藏不会改变。",
  "confirm.goHome": "返回首页",
  "confirm.goHomeMessage": "这篇文章有未保存修改。要离开笔记本吗？当前标签页会保留工作副本，但不会保存到收藏。",
  "confirm.clearArticle": "清空文章",
  "confirm.clearMessage": "要丢弃当前工作文章及其所有页面吗？已保存的收藏不会改变。",

  "ai.close": "关闭 AI 设置",
  "ai.eyebrow": "页边的一点帮助",
  "ai.titleHtml": "给你的<br /><em>阅读伙伴一张便签。</em>",
  "ai.description": "带上你自己的 DeepSeek 密钥，用于整理段落、生成中英双语释义和文章标题。",
  "ai.newDefinitions": "新释义默认显示",
  "ai.definitionHintEn": "新 AI 释义默认显示英文。",
  "ai.definitionHintZh": "新 AI 释义默认显示中文。",
  "ai.definitionToggle": "新释义默认显示{current}，点击改为{next}。",
  "ai.definitionStorage": " 浏览器存储被禁用；此选择只在离开或刷新前有效。",
  "ai.keyLabel": "在这里写下你的 API key",
  "ai.keyPlaceholder": "sk-your-deepseek-key",
  "ai.showKey": "显示密钥",
  "ai.hideKey": "隐藏密钥",
  "ai.forgetKey": "忘记密钥",
  "ai.keepTab": "仅保留在标签页",
  "ai.usageSummary": "用量与词典缓存",
  "ai.usageHint": "通用释义会在本浏览器缓存最多 7 天（256 条）。只保存查询词组和释义，不保存 API key。需要更新时使用「重新生成所选释义」。",
  "ai.clearCache": "清除词典缓存",
  "ai.footnote": "一个小工具，一页更安静的文字。",
  "ai.triggerTitle": "设置你的 DeepSeek 密钥",
  "ai.triggerSetTitle": "当前标签页已设置 DeepSeek 密钥",
  "ai.keyMissing": "请先在这条线上写下 DeepSeek key。",
  "ai.keySaved": "AI 密钥已保留在当前标签页，只会发送给 DeepSeek。",
  "ai.keySavedStorageBlocked": "密钥已在当前页面生效，但标签页存储被禁用。刷新后需要重新输入。",
  "ai.keyForgotten": "密钥已忘记。需要时可以重新填写。",
  "ai.keyForgottenBlocked": "当前页面的密钥已清除，但浏览器存储无法清除；请检查此站点的存储设置。",
  "ai.cacheCleared": "查询缓存已清除。已保存的文章释义不受影响。",
  "ai.cacheClearFailed": "内存缓存已清除，但浏览器存储无法清除；刷新后已存条目可能重新出现。",
  "ai.usageNone": "当前标签页还没有 AI 请求。",
  "ai.usageStats": "{requests} 次请求 · 接口报告输入 {input} / 输出 {output} tokens。",
  "ai.usageCache": "服务端缓存命中输入：{cached} tokens（{cacheRequests}/{reports} 次用量报告）。",
  "ai.usageCacheMissing": "接口未报告缓存命中用量。",
  "ai.usageUnknown": "{unknown} 次请求的用量未知，包括中断或失败的请求。",
  "ai.usageBill": "统计不是账单；实际费用请查看服务商。",

  "auth.close": "关闭账户",
  "auth.eyebrow": "你的阅读收藏",
  "auth.heading": "安放你的故事。",
  "auth.signedIn": "你已登录。",
  "auth.logout": "退出登录",
  "auth.accountAction": "账户操作",
  "auth.login": "登录",
  "auth.register": "注册",
  "auth.welcomeBack": "欢迎回来。",
  "auth.startCollection": "开始你的收藏。",
  "auth.email": "邮箱",
  "auth.emailPlaceholder": "you@example.com",
  "auth.code": "验证码",
  "auth.codePlaceholder": "6 位验证码",
  "auth.sendCode": "发送验证码",
  "auth.sending": "发送中…",
  "auth.retryIn": "{seconds} 秒后重试",
  "auth.password": "密码",
  "auth.passwordPlaceholder": "至少 6 个字符",
  "auth.back": "返回",
  "auth.accountCreated": "账户已创建。现在可以登录了。",
  "auth.welcomeUser": "欢迎回来，{email}。",
  "auth.loggedOut": "你已退出登录。",
  "auth.sessionExpired": "登录已过期，请重新登录。",
  "auth.emailFirst": "请先输入有效的邮箱地址。",
  "auth.validEmail": "请输入有效的邮箱地址。",
  "auth.passwordLength": "密码长度需为 6–128 个字符。",
  "auth.codeLength": "请输入 6 位验证码。",
  "auth.checkInbox": "验证码已发送，请查看邮箱。",
  "auth.devCode": "本地开发验证码：{code}",
  "auth.signedInAs": "已登录为 {email}",
  "auth.signInTitle": "登录后可保存文章",

  "status.pasteFirst": "请先粘贴一篇英文文章。",
  "status.selectFirst": "请先选择一个单词或词组。",
  "status.definitionsCanceled": "释义已取消，已有注释已保留。",
  "status.batch": "正在查找简短的双语释义 · 第 {index}/{total} 批…",
  "status.summary": "已就绪 {ready}/{total} 个词条 · 保留 {kept} 条已有注释 · 复用 {cached} 条缓存 · {requests} 次 AI 请求。",
  "status.missing": "请只选择缺失的词条重试。",
  "status.formatPasteFirst": "请先粘贴一篇英文文章。",
  "status.formatHasNotes": "请先整理段落，再添加释义。已有注释已完整保留。",
  "status.formatWorking": "DeepSeek 正在整理段落…",
  "status.formatDone": "本页已整理并重新分页，其他页面已保留。",
  "status.definitionRemoved": "释义已删除。",
  "status.definitionSelected": "已选中这条 『』 注释 — 再点一次即可删除",
  "status.keyMissing": "请先在 AI 设置中添加 DeepSeek API key。",
  "status.oldNoteEnglishOnly": "这是一条只有英文的旧注释。用「添加释义」选择它的单词，即可同时生成中英文。",
  "status.readingMode": "阅读模式，已有释义已保留。",
  "status.freshArticle": "已清空为一篇新文章。你的收藏没有改变。",
  "status.loginToSave": "请先登录再保存页面。",
  "status.resumed": "已继续「{title}」。{detail}",
  "status.resumedChanged": "保存的文本已在别处更新。你的工作副本已保留，保存前请检查。",
  "status.resumedUnsaved": "你的未保存修改已保留。",
  "status.resumedPosition": "你的阅读位置已保留。",
  "status.resumedOwner": "「保存修改」会更新原文。",
  "status.resumedGuest": "「保存文章」会保留你自己的副本。",
  "status.gone": "保存的文章已不存在。你的工作副本和阅读位置已保留为未保存文章。",
  "status.reconnectFailed": "无法重新连接已保存的文章。你的工作副本是安全的。请点击「重试找回文章」。{error}",
  "status.opening": "正在打开「{title}」…",
  "status.opened": "已打开「{title}」。{detail}",
  "status.openedOwner": "「保存修改」可更新本页。",
  "status.openedGuest": "「保存文章」可保留你自己的副本。",
  "status.unknown": "出了点问题，请重试。",
  "status.requestFailed": "请求失败（{status}）",
  "status.backgroundCurrent": "当前纸张：{name}。{remembered}",
  "status.backgroundRemembered": "已在此浏览器中记住。",
  "status.backgroundUnavailable": "浏览器存储不可用；此选择只在离开或刷新前有效。",

  "background.original.name": "原本",
  "background.original.description": "原始笔记本纸",
  "background.yunlong.name": "云龙纸",
  "background.yunlong.description": "长而舒展的云状纤维",
  "background.cotton.name": "绵纸",
  "background.cotton.description": "柔软的棉纸纹理",
  "background.earth.name": "大地纸",
  "background.earth.description": "自然的细碎斑点",
  "background.kraft.name": "牛皮纸",
  "background.kraft.description": "温暖、未漂白的牛皮纸",
  "background.linen.name": "莱尼纸",
  "background.linen.description": "细致的亚麻织纹",
  "background.art.name": "艺术纹理纸",
  "background.art.description": "柔和的立体波纹",
  "background.elegant.name": "雅纹纸",
  "background.elegant.description": "精致的压纹线条",
  "background.leather.name": "皮纹纸",
  "background.leather.description": "柔软、颗粒感的皮纹",
};

export const MESSAGES: Record<UILanguage, Record<keyof typeof en, string>> = { en, zh };
export type MessageKey = keyof typeof en;

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, value);
}

export function interpolate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match);
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export class UILanguagePreference {
  private current: UILanguage = "en";
  constructor(private readonly storage: () => PreferenceStorage) {}
  get language(): UILanguage { return this.current; }
  restore(): boolean {
    try {
      this.current = this.storage().getItem(UI_LANGUAGE_STORAGE) === "zh" ? "zh" : "en";
      return true;
    } catch { this.current = "en"; return false; }
  }
  set(language: UILanguage): boolean {
    this.current = language;
    try { this.storage().setItem(UI_LANGUAGE_STORAGE, language); return true; }
    catch { return false; }
  }
  toggle(): boolean {
    return this.set(this.current === "en" ? "zh" : "en");
  }
}

export const uiLanguagePreference = new UILanguagePreference(() => localStorage);

export function uiLanguage(): UILanguage {
  return uiLanguagePreference.language;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return interpolate(MESSAGES[uiLanguage()][key], params);
}

/** Keep visible feedback translatable without replaying actions, requests or document edits. */
export type UIMessage = string | (() => string);
export const textOf = (message: UIMessage): string => typeof message === "function" ? message() : message;
export const msg = (key: MessageKey, params?: Record<string, string | number>): (() => string) => () => t(key, params);
const textBindings = new Map<HTMLElement, () => string>();

export function setUIText(element: HTMLElement, message: UIMessage): string {
  if (typeof message === "function") textBindings.set(element, message);
  else textBindings.delete(element);
  const text = textOf(message);
  element.textContent = text;
  return text;
}

/** Apply only explicitly marked UI nodes; article text and form values are never translated. */
export function applyTranslations(root: ParentNode = document): void {
  const language = uiLanguage();
  document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n!;
    if (isMessageKey(key)) element.textContent = t(key);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-html]")) {
    const key = element.dataset.i18nHtml!;
    if (isMessageKey(key)) element.innerHTML = t(key);
  }
  for (const attribute of ["aria-label", "title", "placeholder", "data-placeholder", "content"] as const) {
    const marker = `data-i18n-${attribute}`;
    for (const element of root.querySelectorAll<HTMLElement>(`[${marker}]`)) {
      const key = element.getAttribute(marker)!;
      if (isMessageKey(key)) element.setAttribute(attribute, t(key));
    }
  }
  for (const [element, message] of textBindings) {
    if (!element.isConnected) textBindings.delete(element);
    else element.textContent = message();
  }
  window.dispatchEvent(new CustomEvent<UILanguage>("ui-language-changed", { detail: language }));
}

function updateLanguageButton(button: HTMLElement): void {
  const chinese = uiLanguage() === "zh";
  button.textContent = chinese ? "EN" : "中文";
  button.lang = chinese ? "en" : "zh-Hans";
  button.setAttribute("aria-label", t(chinese ? "ui.switchToEn" : "ui.switchToZh"));
  button.title = t(chinese ? "ui.switchToEn" : "ui.switchToZh");
}

let initialized = false;
/** Restore the saved choice, translate the static page and wire the topbar toggle once. */
export function initUILanguage(): UILanguage {
  if (initialized) return uiLanguage();
  initialized = true;
  uiLanguagePreference.restore();
  applyTranslations();
  const buttons = document.querySelectorAll<HTMLElement>("#uiLangBtn, [data-ui-language-toggle]");
  for (const button of buttons) {
    updateLanguageButton(button);
    button.addEventListener("click", () => {
      uiLanguagePreference.toggle();
      applyTranslations();
      for (const toggle of buttons) updateLanguageButton(toggle);
    });
  }
  const restore = () => {
    uiLanguagePreference.restore();
    applyTranslations();
    for (const button of buttons) updateLanguageButton(button);
  };
  window.addEventListener("storage", event => {
    if (event.key === UI_LANGUAGE_STORAGE || event.key === null) restore();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) restore(); });
  return uiLanguage();
}

export function describeAIUsageLocalized(usage: AIUsageSnapshot): string {
  if (!usage.requests) return t("ai.usageNone");
  const unknown = usage.requests - usage.reportedRequests;
  return t("ai.usageStats", { requests: usage.requests.toLocaleString(), input: usage.inputTokens.toLocaleString(), output: usage.outputTokens.toLocaleString() })
    + (usage.cacheReportedRequests
      ? t("ai.usageCache", { cached: usage.cachedInputTokens.toLocaleString(), cacheRequests: usage.cacheReportedRequests, reports: usage.reportedRequests })
      : t("ai.usageCacheMissing"))
    + (unknown ? t("ai.usageUnknown", { unknown }) : "")
    + t("ai.usageBill");
}

/** Best-effort translation for errors produced by pure modules or the API. */
const ERROR_ZH: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Use AI setup to add your DeepSeek API key first\.$/, () => "请先在 AI 设置中添加 DeepSeek API key。"],
  [/^DeepSeek rejected this key\. Check your API key\.$/, () => "DeepSeek 拒绝了此密钥，请检查 API key。"],
  [/^DeepSeek is busy or your quota is exhausted\. Please try later\.$/, () => "DeepSeek 当前繁忙或额度已用尽，请稍后再试。"],
  [/^DeepSeek request failed \((\d+)\)\. Please try again\.$/, m => `DeepSeek 请求失败（${m[1]}），请重试。`],
  [/^AI output reached its token limit\. No automatic retry was sent\.$/, () => "AI 输出达到 token 上限；已停止，不会自动重试。"],
  [/^AI did not complete this response\. Please try again later\.$/, () => "AI 未能完成本次响应，请稍后再试。"],
  [/^DeepSeek returned an empty response\. No automatic retry was sent\.$/, () => "DeepSeek 返回了空响应；不会自动重试。"],
  [/^Unexpected DeepSeek response\.$/, () => "DeepSeek 返回了无法识别的响应。"],
  [/^Invalid AI output budget\.$/, () => "AI 输出预算无效。"],
  [/^Definitions could not be fetched\.$/, () => "无法获取释义。"],
  [/^Invalid document range\.$/, () => "文档范围无效。"],
  [/^The bilingual dictionary response was invalid\. Please try again\.$/, () => "双语释义响应格式无效，请重试。"],
  [/^The AI returned no usable bilingual definitions\. No automatic retry was sent\.$/, () => "AI 没有返回可用的双语释义；不会自动重试。"],
  [/^AI returned invalid title JSON\.$/, () => "AI 返回的标题 JSON 无效。"],
  [/^AI returned no title in its response\.$/, () => "AI 响应中没有标题。"],
  [/^AI returned a (\d+)-character title; the limit is 20 characters, including spaces\.$/, m => `AI 返回了 ${m[1]} 个字符的标题；上限为 20 个字符（含空格）。`],
  [/^AI did not return a valid short English title\.$/, () => "AI 没有返回有效的简短英文标题。"],
  [/^AI could not create a short English title\.$/, () => "AI 无法生成简短的英文标题。"],
  [/^An article can contain at most 100,000 characters\. Your existing article has been kept\.$/, () => "文章最多 100,000 个字符。现有文章已保留。"],
  [/^Choose a Word document smaller than 5 MB\.$/, () => "请选择小于 5 MB 的 Word 文档。"],
  [/^This Word document has too many embedded files\.$/, () => "这个 Word 文档包含过多嵌入文件。"],
  [/^This Word document expands to too much content\.$/, () => "这个 Word 文档解压后的内容过大。"],
  [/^No valid Word document body was found\.$/, () => "没有找到有效的 Word 文档正文。"],
  [/^Unsupported XML declarations in this document\.$/, () => "此文档包含不支持的 XML 声明。"],
  [/^This is not a readable \.docx file, or it is damaged\.$/, () => "这不是可读取的 .docx 文件，或文件已损坏。"],
  [/^The Word document contains invalid XML\.$/, () => "这个 Word 文档包含无效 XML。"],
  [/^This file is not a supported Word document\.$/, () => "此文件不是受支持的 Word 文档。"],
  [/^The Word document has no body text\.$/, () => "这个 Word 文档没有正文。"],
  [/^This document contains no readable text\. Scanned images are not supported\.$/, () => "此文档没有可读取的文字；不支持扫描图片。"],
  [/^The Word article is longer than 100,000 characters\. Import a shorter section\.$/, () => "Word 文章超过 100,000 个字符，请导入更短的片段。"],
  [/^Please save this Word file as \.docx first\. Old \.doc files are not supported\.$/, () => "请先把 Word 文件另存为 .docx；不支持旧版 .doc。"],
  [/^Cannot import Word: (.*)$/, m => `无法导入 Word：${localizeError(m[1]!)}`],
  [/^Please log in to save a page\.$/, () => "请先登录再保存页面。"],
  [/^Please log in to change this page\.$/, () => "请先登录再修改页面。"],
  [/^Only the author can change this page\. Save your own copy instead\.$/, () => "只有作者可以修改此页面，请另存为自己的副本。"],
  [/^Please log in\.$/, () => "请先登录。"],
  [/^Email already registered$/, () => "该邮箱已注册。"],
  [/^Invalid or expired verification code$/, () => "验证码无效或已过期。"],
  [/^Please wait one minute before requesting another code$/, () => "请等待一分钟后再获取验证码。"],
  [/^Email or password is incorrect$/, () => "邮箱或密码不正确。"],
  [/^Too many attempts\. Please try again in 15 minutes$/, () => "尝试次数过多，请 15 分钟后再试。"],
  [/^Invalid email address$/, () => "邮箱地址无效。"],
  [/^Password must be 6–128 characters$/, () => "密码长度需为 6–128 个字符。"],
  [/^Email could not be sent\. Please try again later$/, () => "邮件发送失败，请稍后再试。"],
  [/^Production sessions require Redis\.$/, () => "生产模式的会话需要 Redis，请先启动并配置 Redis。"],
  [/^Content cannot be empty\.$/, () => "内容不能为空。"],
  [/^Use an English title\.$/, () => "请使用英文标题。"],
  [/^Cross-site writes are not allowed\.$/, () => "不允许跨站写入。"],
  [/^Request origin does not match this server\.$/, () => "请求来源与此服务器不匹配。"],
  [/^The request could not be completed\. Please try again\.$/, () => "请求未能完成，请重试。"],
  [/^Page not found\.$/, () => "页面不存在。"],
  [/^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.)$/, () => "网络请求失败，请检查连接后重试。"],
  [/^(The operation timed out\.?|The operation was aborted due to timeout)$/, () => "请求超时，请稍后重试。"],
  [/^Request failed \((\d+)\)$/, m => `请求失败（${m[1]}）`],
  [/^(Title|Content|Email|Password|Code) must be text\.$/, m => `${fieldName(m[1]!)}必须为文本。`],
  [/^(Title|Content|Email|Password|Code) must contain 1–([\d,]+) characters\.$/, m => `${fieldName(m[1]!)}需为 1–${m[2]} 个字符。`],
  [/^Each bilingual definition must match a unique English note in the article and contain valid Chinese\.$/, () => "每条双语释义必须对应文章中唯一的英文注释，并包含有效中文。"],
  [/^Definitions must be an array of bilingual notes\.$/, () => "释义必须是双语注释数组。"],
  [/^Invalid article ID\.$/, () => "文章编号无效。"],
  [/^Method not allowed\.$/, () => "不支持此请求方法。"],
  [/^API route not found\.$/, () => "API 接口不存在。"],
  [/^Invalid JSON body\.$/, () => "请求中的 JSON 无效。"],
  [/^Expected a JSON object\.$/, () => "请求必须是 JSON 对象。"],
  [/^Use an application\/json request body\.$/, () => "请使用 application/json 格式的请求。"],
];

function fieldName(name: string): string {
  return ({ Title: "标题", Content: "正文", Email: "邮箱", Password: "密码", Code: "验证码" } as Record<string, string>)[name] ?? name;
}

export function localizeError(message: string): string {
  if (uiLanguage() === "en") return message;
  const completed = " Completed definitions were kept; retry only missing terms.";
  if (message.endsWith(completed)) return localizeError(message.slice(0, -completed.length)) + "已保留完整释义；请只重试缺失词条。";
  for (const [pattern, replace] of ERROR_ZH) {
    const match = message.match(pattern);
    if (match) return replace(match);
  }
  return message;
}
