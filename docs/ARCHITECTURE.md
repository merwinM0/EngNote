# 架构设计

[项目介绍](../README.md) · [功能说明](FEATURES.md) · [API 说明](API.md) · [运行与部署](DEPLOYMENT.md) · [更新记录](CHANGELOG.md)

## 1. 整体结构

EngNote 是框架无关的 Bun 全栈应用。服务端直接导入两个 HTML 入口，由 Bun 处理浏览器端 TypeScript、CSS 和本地资源；不依赖预编译的前端脚本，也不需要编译成可执行文件。

```text
浏览器
├── / 或 /home.html：欢迎页、界面语言、模拟使用指南
└── /index.html：正文、分页、释义、收藏与账号
    ├── 同源 /api/* → Bun → SQLite / Redis / SMTP
    └── AI 请求 → https://api.deepseek.com/chat/completions
                  （使用当前标签页已确认的用户密钥）
```

- [`index.ts`](../index.ts) 解析端口、打开数据库、启动服务并输出本机 / 局域网地址；退出时停止接收请求、关闭 Redis 和 SQLite。
- [`backend/server.ts`](../backend/server.ts) 挂载页面、初始化数据库及迁移，处理 API、会话 Cookie、请求来源与作者权限。
- 浏览器模块只使用原生 DOM 和 Web API。后端可复用无 DOM 副作用的正文 / 释义校验模块，不将 SMTP、Redis 或数据库代码引入前端。
- 开发时前端 HMR，服务端由 `--watch` 重启；生产 `bun start` 仍运行源码，但关闭开发功能。`dist/` 只是可选的前端构建检查产物。

## 2. 目录与模块职责

```text
EngNote/
├── README.md                 # 项目介绍与快速开始
├── README.en.md              # 英文介绍，与中文版同步
├── ROADMAP.md                # 路线图与已实施决策
├── docs/                     # 架构、功能、API、部署说明
├── index.ts                  # 服务启动与退出
├── seed.ts                   # 仅本地开发使用的测试账号脚本
├── backend/
│   ├── config.ts             # 端口默认值与地址显示
│   ├── server.ts             # HTML 路由、REST API、迁移与校验
│   ├── auth.ts               # 注册、登录、验证码与会话
│   ├── redis.ts              # Redis / 开发内存存储与 TTL
│   ├── mail.ts               # Nodemailer 与 SMTP 配置
│   └── verificationEmail.ts  # 验证码邮件 HTML / 纯文本模板
├── public/
│   ├── home.html             # 首页
│   ├── index.html            # 阅读页
│   ├── ts/                   # 浏览器逻辑及可共享的纯函数
│   ├── css/                  # 样式、设计变量与组件
│   ├── icons/                # 本地 Logo、标签页图标与线稿
│   └── textures/             # 本地 SVG 阅读纸张纹理
├── tests/                    # 单元、接口与迁移测试
├── .env.example              # 可提交的配置示例，不含真实凭证
├── package.json
├── bun.lock
├── tsconfig.json             # 服务端与测试类型检查
└── tsconfig.browser.json     # 浏览器类型检查
```

`.env`、`data.db` 及 SQLite 伴随文件、依赖目录和构建产物不纳入版本控制。旧 `Engreading` / `index.js.map` 不再参与当前启动流程，也不会自动删除；升级时保留现有配置和数据。

### 前端模块

以下模块均位于 `public/ts/`：

| 模块 | 职责 |
| --- | --- |
| `home.ts` / `main.ts` | 首页与阅读页入口，初始化并装配事件 |
| `i18n.ts` | 双语界面、浏览器语言偏好、可随切换更新的动态提示 |
| `manual.ts` | 仅内存的五步模拟指南，不调用真实 AI 或保存接口 |
| `pagination.ts` | 完整正文模型、无损分页、全局偏移与光标定位 |
| `text.ts` / `state.ts` | 文本规则、渲染、词组选择、阅读 / 释义 / 删除模式和操作锁 |
| `editor.ts` / `articleDraft.ts` | 粘贴、当前页编辑、导入、工作草稿及文章关联 |
| `word.ts` | 有大小限制的 `.docx` 解压与正文提取 |
| `wordExport.ts` / `exportWord.ts` | 纯 OOXML / ZIP 生成与浏览器下载 |
| `definitionViews.ts` / `definitionLanguage.ts` | 每条批注的双语内容、独立显示状态与本地切换 |
| `readingHistory.ts` | 有界工作副本快照、输入合并、撤回 / 恢复；不存凭证或服务端关联 |
| `definitionMode.ts` / `definitionContext.ts` / `contextFingerprint.ts` / `pronunciation.ts` | 释义模式偏好、纯正文 / 位置 / 语境指纹、英式音标独立校验与显示 |
| `definitionPreference.ts` | 后续新释义的默认显示语言，与界面语言独立 |
| `dictionary.ts` / `dictionaryLookup.ts` / `dictionaryCache.ts` | 双语响应校验、分批去重、已有释义复用和有界查询缓存 |
| `deepseek.ts` / `deepseekClient.ts` / `aiUsage.ts` | 已确认密钥、可测试请求传输、预算、截断和用量统计 |
| `format.ts` / `translate.ts` / `articleTitle.ts` | 当前页排版、所选词释义、整篇文章标题总结 |
| `deleteNote.ts` | 两次点击删除注释，并同步移除对应双语数据 |
| `db.ts` / `collectionCanvas.ts` / `boardGeometry.ts` | 保存与加载、白板手势、缩放几何和焦点可见性 |
| `panels.ts` / `notes.ts` | 编辑面板、原生弹窗叠放、未保存确认、焦点与光标恢复 |
| `auth.ts` / `aiSettings.ts` | 账号表单与 Cookie 会话、密钥草稿与确认存储 |
| `readingBackground.ts` / `readingBackgroundPreference.ts` | 阅读纸张选择及浏览器偏好 |
| `readingToolbar.ts` / `tooltips.ts` | 工具栏固定、向左收起与滚回恢复；独立浮层在按钮下方提供悬停 / 聚焦介绍，不被滚动行裁切，动态同步文案 |
| `statusToast.ts` / `statusTimer.ts` | 右上角便签、可暂停的 1.7 秒真实计时、胶带进度与弹窗宿主 |
| `selectionRecovery.ts` / `noteTape.ts` | 失败选词偏移恢复、仅用于显示的随机胶带配色 |
| `util.ts` | DOM 辅助、保留图标的工具按钮文案更新、消息入口与同源 API 请求 |

### 样式与本地资源

- `public/css/tokens.css` 定义水灰底、米白纸面、青色墨迹、半透明胶带及字体等共用变量。
- `public/css/tape.css` 提供反光与撕边胶带。装饰层和点击区域、焦点轮廓分离，不裁切文字或键盘提示。
- `public/css/reader.css` 按固定顺序导入设计变量、胶带、进度、布局、正文、收藏、面板、弹窗、阅读背景与响应式样式，保持 HMR 与生产级联顺序一致。
- 阅读纸张的本地 SVG 只输出中性浮雕明暗；`readingBackground.css` 将其以 `soft-light` 混合到独立纸色，避免用不透明色层遮盖纹理。预览、空白页和正文使用相同材质尺度；原版与强制颜色模式不受混色影响。
- AI 释义方式使用原生 `<details>` 默认折叠，展开后单个胶带按钮按三种模式循环；提示与无障碍名称随模式 / 界面语言更新，切换不请求 AI，不确认密钥草稿。
- 首页使用 `home.css`；手册使用 `manual.css`；收藏白板使用 `collection.css`；弹窗由 `notes.css` 与 `panels.css` 配合实现；短时消息使用 `statusToast.css`，复用便签纸、胶带与阴影变量。
- `public/icons/reading-sketch.svg`、`pencil-line.svg` 和 `favicon.svg` 均为本地资源，不加载外部字体或 UI 框架。
- 验证码邮件不能直接加载站点 CSS，因此 `verificationEmail.ts` 将同一配色解析为内联样式，以表格布局和无外部资源的模板兼容邮件客户端。

## 3. 正文模型与渲染数据流

正文的唯一内容源是 `ReadingDocument.text`，不是 DOM，也不是相互独立的分页字符串。分页只是这份完整正文的切片。

```text
粘贴 / Word 导入
  → 本地合并错误断行，以空行分段
  → ReadingDocument.text
  → paginate() → Page[]
  → 当前页按段落渲染为 <p>
  → 普通文本 / 可选英文单词 / 『英文释义』批注

当前页编辑或 AI 排版
  → 替换完整正文中的对应区间
  → 重新分页 → 定位光标 / 当前页 → 重新渲染

AI 释义
  → 收集目标全局偏移 → 查已有双语注释和缓存
  → 缺失词组去重 / 分批请求 → 校验双语结果
  → 从后向前插入或替换『英文释义』并同步中文元数据
  → 重新分页与渲染
```

### 实际数据结构

以下为当前模型的主要字段，完整定义见 [`pagination.ts`](../public/ts/pagination.ts)、[`state.ts`](../public/ts/state.ts) 和 [`definitionViews.ts`](../public/ts/definitionViews.ts)：

```ts
type Page = {
  text: string;
  start: number;  // 完整正文中的 UTF-16 起始偏移
  end: number;    // 完整正文中的 UTF-16 结束偏移
  count: number;  // Unicode 码点数
};

type WordInfo = {
  id: number;
  text: string;
  el: HTMLElement;
  start: number;
  end: number;
};

type DefinitionView = {
  start: number;  // 『 的全局 UTF-16 偏移
  english: string;
  chinese: string;
  language: "en" | "zh";
  term?: string;
  britishIPA?: string; // 独立音标，只在显示 / 导出时拼接
  mode?: "general" | "context" | "article";
  contextKey?: string; // 参考模式 SHA-256 身份，不含原文
};
```

- 每页最多 5000 个 Unicode 码点，包含空白、标点、数字和批注标记；优先在段落、句子和空白边界分页，正常长度的批注尽量与对应单词同页。
- 分页后拼接必须与正文完全一致，不丢弃页边界分隔符，也不拆开 Unicode 代理对。
- 整篇正文上限为 100000 个 UTF-16 单元，与后端 `content.length` 校验一致；不能将这两个限制混为同一种计数。
- 正文始终保存 `『英文释义』`。中文、独立音标、可选查询词组、模式 / 语境指纹和显示语言通过偏移关联；音标不进入正文计数；切换显示语言不改正文，不触发未保存状态，也不改变分页。
- `DefinitionViews` 为当前批注维护身份，追踪编辑引起的偏移；批注本身被改写时不继续使用旧中文。保存时将 `language` 规范化为 `en`，使新读者默认从英文开始。

### 选词分组

1. 单击单词加入选中集，再次单击取消；只把英文单词及其内部连字符 / 撇号作为可选词，不将数字和标点变成单词。
2. 按正文顺序排序 `pickedIds`。
3. 只有 ID 相邻、同一段落且中间全为空白的词才合并，不跨标点、批注或段落。
4. 不相邻片段分别成组，记录每组末尾的全局正文偏移。
5. 先复用兼容当前模式 / 语境的有效注释及缓存，再对缺失查询分批请求；单纯模式按词条精确去重，参考模式使用词条、纯正文 UTF-16 位置和语境指纹，禁止将不同位置合并。
6. 按偏移从后向前更新正文，避免前一次插入改变后续位置；中文元数据与正文一起同步。

## 4. 持久化与浏览器存储

### SQLite

数据库默认位于项目根目录 `data.db`，可通过 `DB_PATH` 修改。启用 WAL 和 5 秒 busy timeout。

- `entries(id, title, content, created_at, owner_email, definitions)`：一篇文章存一份完整正文，包含全部分页与英文批注；`definitions` 是双语 JSON 数组。
- `users(id, email, password_hash, created_at)`：邮箱账号，密码使用 `Bun.password` 的 Argon2id 慢哈希，不存明文。
- 启动时为旧文章表无损追加 `owner_email` 与 `definitions`；旧作者不推断，双语列默认 `[]`。历史文章保持公开只读，可另存为自己的副本。
- 有效双语数据必须匹配正文中的英文批注；读取旧文章时忽略失效元数据，写入新元数据时原子校验。更新请求省略 `definitions` 时，保留仍匹配新正文的旧批注。

### Redis 与会话

- 保存验证码、60 秒发信冷却、验证码尝试次数、登录尝试次数以及会话 Token；验证码使用 `auth:code:<email>`，会话使用 `auth:token:<token>` 键。
- 验证码有效期 5 分钟；Cookie 与服务端会话均为 24 小时，不因页面访问而续期。
- Redis 不可用时仅非生产模式可降级为进程内 Map，带 TTL 和容量限制；重启后需要重新登录。生产认证不静默降级。
- 邮件发送失败不把验证码当作已发送；仅非生产且未配置 SMTP 主机时返回本地开发验证码。

### 浏览器状态

| 状态 | 位置与生命周期 |
| --- | --- |
| 已确认 DeepSeek 密钥 | 当前标签页 `sessionStorage`，刷新恢复，关闭标签页后清除 |
| 工作草稿、正文阅读偏移、页码、文章关联、每条释义显示语言 | 当前标签页 `sessionStorage`，恢复时重新向服务端确认文章与权限 |
| AI 用量 | `er_ai_usage_v1`，当前标签页 `sessionStorage`，不含密钥、提示词或正文 |
| 界面语言 | `er_ui_language_v1`，`localStorage` |
| 释义方式 | `er_definition_mode_v1`，`localStorage`，默认 general；只影响后续请求 |
| 撤回 / 恢复历史 | 当前页面内存，最多 50 个快照 / 约 8MB；800ms 连续输入合并，不随草稿保存 |
| 新释义默认语言 | `er_default_definition_language`，`localStorage` |
| 阅读纸张 | `er_reading_background`，`localStorage` |
| 词典查询缓存 | `er_dictionary_cache_v2`，`localStorage`，最多 256 条、7 天有效，按最近最少使用淘汰 |

草稿新增可选正文 `offset` 以跨分页配置恢复位置；旧记录按原 3000 上限计算旧页起点，再映射到 5000 新分页。所有批注偏移仍针对完整正文，无需迁移数据库。

参考释义的局部语境为前后各最多 600 Unicode 码点；全文最多 24,000 UTF-16 单元，每批序列化输入最多 32,000 单元、最多 12 个身份，正文在每批只附一次。`SHA-256([词条, 位置, 所选原文长度, 语境])` 与模式组成缓存身份；缓存不保存语境原文。HTTPS / localhost 优先用 Web Crypto；普通局域网 HTTP 使用结果一致的本地 SHA-256 指纹实现（仅缓存身份，不用于认证）。新版提示词版本使旧通用缓存失效，旧文章批注仍可读，不自动付费补音标。

浏览器存储被禁用时，相关功能在当前页面以内存状态继续工作并按需提示，不伪称已持久化。工作记录不保存可信的作者权限；恢复时以服务端为准。旧草稿没有文章 ID 时仍按新草稿恢复，不猜测原记录身份。

## 5. 交互、异步任务与安全边界

- 仅导入和编辑使用页内面板；保存、删除、未保存确认、收藏、AI 设置与账号使用原生 `<dialog>`，不替换正文或编辑区。
- 利用浏览器 top layer 提供模态与背景不可交互；支持叠放确认便签、Esc、点击遮罩、当前弹窗内 Tab 循环和关闭后焦点 / 编辑光标恢复。不使用 `window.confirm` 或离页原生确认。
- AI 任务用操作锁避免冲突，用页面版本、请求序号与中止信号阻止迟到结果覆盖新内容。临时进度与失败标记不写入文章。先排版后注释，避免 AI 移动已有批注。
- 编辑、AI 整理及一整次释义任务的完整结果在 `state.ts` 记录前后快照；历史恢复取消释义 / 排版并递增页面版本。导入、清空、打开文章及刷新恢复为历史边界；保存不重置历史，不回滚服务端基线或身份。
- 释义、排版和标题总结支持中止；已经提交到后端的数据库写入不会因关闭弹窗而被宣称回滚。
- 认证使用 `er_session` HttpOnly / SameSite=Strict Cookie，浏览器不再在 localStorage 保留 Token；API 不把登录 Token 返回给前端 JavaScript。
- 文章列表和读取公开，写入必须有会话，更新 / 删除必须是作者；后端计算 `can_edit`，不信任客户端提交的作者身份，也不公开作者邮箱。
- 服务端限制请求体为 1 MiB，校验 JSON、字段类型、长度、路由方法及写请求来源。静态资源通过 HTML 打包与明确白名单提供，不能按任意路径读取项目文件。
- DeepSeek 密钥只用于浏览器直连 DeepSeek；SMTP 凭证和 Redis 配置留在服务端。Word 导入、导出均在浏览器本地完成。

## 6. 进度组件约定

后续进度条必须遵循 [AGENTS.md](../AGENTS.md)，复用 `public/css/progress.css`：

```text
.tape-progress
└── .tape-progress-track
    └── .tape-progress-reveal
        └── .tape.tape-progress-strip
```

- 未知耗时使用默认 3.4 秒贴胶带循环，不伪造完成百分比。
- 已知进度设置 `data-progress="determinate"` 和实际 `--progress` 百分比；轨道提供 `role="progressbar"`、可访问名称及真实 `aria-valuemin / aria-valuemax / aria-valuenow`。
- 减少动态效果时保留静态胶带与文字，强制颜色模式使用系统颜色。首页手册和阅读页起标题共用该实现。
