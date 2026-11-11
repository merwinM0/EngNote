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

- [`index.ts`](../index.ts) 解析启动选项与端口、打开数据库、启动服务；仅展示 localhost 链接及实际 PID、Bun 版本和模式，支持 JSON 启动记录与可操作错误；退出时停止接收请求、关闭 Redis 和 SQLite。
- [`backend/server.ts`](../backend/server.ts) 挂载页面，处理 API、会话 Cookie、请求来源与作者权限；[`backend/database.ts`](../backend/database.ts) 统一数据库路径、建表与无损迁移。
- [`scripts/users.ts`](../scripts/users.ts) 与 [`backend/userAdmin.ts`](../backend/userAdmin.ts) 提供本机终端查看与经确认、备份后的级联删除，不加载网页服务器或新增管理接口。
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
├── scripts/users.ts          # 终端用户 / 文章查看与确认级联删除
├── backend/
│   ├── config.ts             # 端口默认值与地址显示
│   ├── terminal.ts           # 终端边框、字素换行、安全转义、语义状态与 JSON / 错误展示
│   ├── server.ts             # HTML 路由、REST API 与校验
│   ├── database.ts           # 数据库路径、模式与无损迁移
│   ├── vocabulary.ts         # 永久词汇表、一次性汇入、私有查询与去重写入
│   ├── userAdmin.ts          # 只读检查、预览核对、受限备份及事务删除
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
| `articleAutoOpen.ts` | 登录后空工作区的单次最近文章选择，等待草稿及私有列表就绪，不在后续清空或刷新时再次触发 |
| `editor.ts` / `articleDraft.ts` / `articleWorkspace.ts` | 粘贴、编辑、导入；分离匿名 / 各账号的标签页草稿，鉴权后恢复旧文章关联，退出与切号隔离阅读区 |
| `word.ts` / `wordFormattingImport.ts` | 受限 `.docx` 白名单解压、正文 / 默认样式 / 继承 / 主题字体 / 列表 / 表格解析 |
| `documentFormatting.ts` / `formattedReading.ts` | 可共享的格式校验与偏移映射；受限样式和原生 DOM 渲染 |
| `wordExport.ts` / `wordFormattingExport.ts` / `exportWord.ts` | 保留支持的格式与各批注当前语言的 OOXML / ZIP 生成及浏览器下载 |
| `definitionViews.ts` / `definitionLanguage.ts` | 每条批注的双语内容、独立显示状态与本地切换 |
| `vocabulary.ts` / `definitionList.ts` / `vocabularyClient.ts` | 全文释义提取与词条校验、本篇 / 跨文章清单及筛选分页、分账号防迟到收录；不复用或改动 AI 临时缓存 |
| `readingFont.ts` | 五档阅读字号、Word 原字号比例与清单字号，仅修改显示变量 |
| `wordSearch.ts` / `readingSearch.ts` | 纯正文单词索引、有限拼写容错、UTF-16 定位 / Unicode 距离排序；本地搜索组合框、虚拟结果行、逐处释义预览和只读定位 |
| `readingHistory.ts` | 有界工作副本快照、输入合并、撤回 / 恢复；不存凭证或服务端关联 |
| `definitionMode.ts` / `definitionModeControl.ts` / `definitionContext.ts` / `contextFingerprint.ts` / `pronunciation.ts` | 释义模式偏好与功能栏选择 / 介绍、纯正文 / 位置 / 语境指纹、英式音标独立校验与显示 |
| `definitionPreference.ts` | 后续新释义的默认显示语言，与界面语言独立 |
| `articleDefinitionLanguages.ts` | 按文章及内容 / 批注版本隔离的有界标签页阅读语言记录，仅存指纹与逐条选择 |
| `dictionary.ts` / `dictionaryLookup.ts` / `dictionaryCache.ts` | 双语响应校验、分批去重、已有释义复用和有界查询缓存 |
| `deepseek.ts` / `deepseekClient.ts` / `aiUsage.ts` | 已确认密钥、可测试请求传输、预算、截断和用量统计 |
| `format.ts` / `paragraphTidying.ts` / `translate.ts` / `articleTitle.ts` | 当前页段落整理及词句 / 标点完整性校验、所选词释义、整篇文章标题总结 |
| `deleteNote.ts` | 单目标两次点击确认，点击其他批注只切换目标；删除后保持模式，同步移除对应双语数据 |
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
- 释义方式独立于 AI 设置，在阅读功能栏使用单个胶带按钮按三种模式循环；`definitionModeControl.ts` 同步当前名称、隐藏无障碍描述与 `data-tool-description`，由工具栏共用悬停 / 聚焦浮层展示当前模式范围与费用介绍，不常驻显示操作 / 偏好说明。切换不请求 AI、不确认密钥草稿，进行中的任务仍固定发起时的方式。
- `readingSearch.css` 复用现有纸面、青色墨迹、控制边框与选中配色；搜索栏宽屏目标宽 440px，展开栏按搜索栏的实际宽度固定定位并限制在视口内，释义预览不放在结果滚动容器中。聚焦浮起与柔和阴影只施加到 `.word-search-field`，避免变换祖先改变展开栏的固定定位参照；输入框不再单独显示焦点框，整栏底线与强制颜色焦点轮廓保留可见状态。140ms 过渡遵循共用减少动态效果规则。每行 76px，与 `readingSearch.ts` 的虚拟滚动行高保持一致；强制颜色下保留选中边框与定位边框，不为搜索定位覆盖正文或 Word 字体范围的字色 / 底色。
- 首页使用 `home.css`；手册使用 `manual.css`；收藏白板使用 `collection.css`；弹窗由 `notes.css` 与 `panels.css` 配合实现；短时消息使用 `statusToast.css`，复用便签纸、胶带与阴影变量。
- `public/icons/reading-sketch.svg`、`pencil-line.svg` 和 `favicon.svg` 均为本地资源，不加载外部字体或 UI 框架。
- 验证码邮件不能直接加载站点 CSS，因此 `verificationEmail.ts` 将同一配色解析为内联样式，以表格布局和无外部资源的模板兼容邮件客户端。

- `vocabulary.css` 沿用纸面、墨迹和胶带变量，不增加配色；本篇清单按钮与字符计数组合，顶栏新增总清单按钮后允许按可用宽度换行。两个清单复用一个原生便签弹窗，继承 `notes.css` / `panels.css` 的共同尺寸、纸面、顶部胶带与模态行为，不另设宽面板。释义的原生按钮 / 旧单语只读文本使用 `tape.css` 的 `.tape-button.tape-${color}`，共享阅读批注的五种半透明颜色；本篇复用 `Definition.tape`（未显示页也可提前分配），总清单同词同义可沿用当前文章颜色，其余由 `termNoteTape()` 对规范词条稳定映射，不额外缓存或持久化。保持阅读区同款墨色，仅装饰层撕边，胶带按文字长度伸缩；滚动列表留足焦点轮廓空间，强制颜色下恢复系统边框。保留按 100 条分页和原生按钮切换释义语言，未知加载 / 收录耗时复用标准胶带进度。
- 阅读字号通过 `--reading-font-size` 和 `--reading-font-scale` 改变显示；Word 固定字号 / 固定行距按比例计算，批注复制紧邻原词的字号表达式，普通批注使用 `1em`，不改变 Word 元数据、正文、分页计数或导出内容。

### 终端展示与机器边界

`backend/terminal.ts` 由启动入口和本机管理脚本复用，不进入浏览器依赖图。使用 Bun 显示宽度与 `Intl.Segmenter` 按字素排版，面板自动适配终端列数，长正文只换行不截断；普通面板无装饰颜色或图标，红 / 黄 / 绿只标记 TTY 中的错误、删除警告和成功，遵循 `NO_COLOR` / `TERM=dumb`。

人类可读输出先转义终端控制和不可见格式字符，再添加受控的状态颜色；错误包含问题及修复建议，成功结果保持紧凑。`--json` 是显式机器模式，结果 / 错误写入 stdout，失败保留非零退出码，不混入面板、颜色或交互提示；不可见格式字符采用可逆 JSON 转义。用户管理 JSON 仅支持只读查询与帮助，不允许自动删除，既有权限、预览、备份和事务逻辑不变。

启动面板不枚举网卡，仅改变展示而不收紧 `HOST` 监听；JSON 启动记录只包含运行元信息，不输出凭证或完整环境变量。

## 3. 正文模型与渲染数据流

正文的唯一内容源是 `ReadingDocument.text`，不是 DOM，也不是相互独立的分页字符串。分页只是这份完整正文的切片。

```text
粘贴导入 → 本地合并错误断行，以空行分段
Word 导入 → 保留原段落，提取受限格式元数据
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
- `DefinitionViews` 为当前批注维护身份，追踪编辑引起的偏移；批注本身被改写时不继续使用旧中文。显式保存和 API 读取保留每条 `language`，不再统一为英文；`definitionContent()` 只用于排除显示差异的未保存比较，不得用于序列化保存。

### 选词分组

1. 单击单词加入选中集，再次单击取消；只把英文单词及其内部连字符 / 撇号作为可选词，不将数字和标点变成单词。
2. 按正文顺序排序 `pickedIds`。
3. 只有 ID 相邻、同一段落且中间全为空白的词才合并，不跨标点、批注或段落。
4. 不相邻片段分别成组，记录每组末尾的全局正文偏移。
5. 先复用兼容当前模式 / 语境的有效注释及缓存，再对缺失查询分批请求；单纯模式按词条精确去重，参考模式使用词条、纯正文 UTF-16 位置和语境指纹，禁止将不同位置合并。
6. 按偏移从后向前更新正文，避免前一次插入改变后续位置；中文元数据与正文一起同步。

### 只读单词搜索

`wordSearch.ts` 对完整正文索引原词和全局 UTF-16 范围，跳过 `『批注』`。`Uint32Array` 将正文偏移映射到去除批注后的 Unicode 码点位置，供距离计算；页码仍沿用原有分页。批注按紧邻的正文位置关联，带 `term` 的短语核对前面的词与空白，旧单语注释退回紧邻词，不按词面跨位置复用。

查询只做大小写折叠、子串及最多两次拼写编辑（含相邻交换），按词面缓存本次匹配结果；本页优先，页内以最近点击 / 定位的词（默认页首）为锚点，其它页以当前页边界为锚点，按正文字符距离排序，同距后方优先。完整索引与结果仅在页面内存中，输入防抖 100ms，查询上限 64 字符，不发网络请求。

`readingSearch.ts` 使用带 `aria-activedescendant` 的组合框与虚拟列表，每条提供 `aria-posinset` / `aria-setsize`；只渲染可见行及当前活动行，滚动和键盘可到达全部重复项。结果只显示页数数字与距离，隐藏文本保留本地化的页码含义；不显示优先级编号、距离排序提示或底部键盘操作说明，输入关联的无障碍帮助与键盘行为保持不变。定位复用 `goToPage()` 和 `wordsById`，仅为对应 DOM 词添加临时纯边框与焦点，不覆盖字色 / 底色，不重写格式或记录历史。边框显示 1300ms，统一清理函数同时撤销定时器、定位类与临时 `tabindex`；再次定位、正文重绘、文章 / 账号切换或卸载时取消旧计时，保留用户随后进入选词模式设置的可交互属性。预览直接读取该偏移的 `definitionViews`，保留音标与实际显示语言，不查询缓存或 AI。

`document-view-changed` 使搜索索引与高亮失效；`render()` 在整篇替换时发出 `document-replaced`，与 `session-changed` 一同清除查询、结果和预览，避免旧文章内容残留。忙碌状态同步禁用搜索输入与范围按钮，搜索 Esc 使用捕获阶段关闭展开栏，不顺带退出选词模式。

## 4. 持久化与浏览器存储

### SQLite

数据库默认位于项目根目录 `data.db`，可通过 `DB_PATH` 修改。启用 WAL 和 5 秒 busy timeout。

- `entries(id, title, content, created_at, updated_at, owner_email, definitions, formatting)`：一篇文章存一份完整正文，包含全部分页与英文批注；`definitions` 是双语 JSON 数组，`formatting` 为可空、版本化 Word 正文格式 JSON。
- 格式使用正文 UTF-16 范围：`runs[{start,end,style}]` 与 `paragraphs[{start,end,style,marker?,cell?}]`，不存任意 CSS / HTML、外链、密钥或原始 ZIP。白名单验证颜色、字体名、数值与完整段落边界；最多 256000 个序列化 UTF-16 单元、6000 个范围 / 表格跨度预算、3000 个段落，限制重叠单元格及稀疏表格行数。未知 / 损坏的旧格式读取降级为空，显式写入非法格式原子拒绝。
- 格式编辑先计算新元数据再提交正文，使用明确释义编辑或段落空白编辑逐段映射，普通手动编辑采用最小前后缀差异；新文字继承邻近字体。格式纳入历史、草稿、未保存比较与保存基线。
- `users(id, email, password_hash, created_at)`：邮箱账号，密码使用 `Bun.password` 的 Argon2id 慢哈希，不存明文。
- `vocabulary(user_id, term_key, term, english, chinese, british_ipa, language, updated_at)`：账号私有永久词汇，主键为 `(user_id, term_key)`；规范空白 / 撇号，普通词大小写合并、缩写独立，后收录的词义覆盖旧项，相同内容不推进时间。按用户与更新时间建索引，接口只接受当前会话用户，不接收身份声明、语境、全文或密钥。
- `initVocabulary()` 首次创建词汇表时，在事务内流式遍历能匹配现有账号的文章，按保存时间及 ID 顺序汇入有效释义；重启不重复汇入、不覆盖后续收录，不认领无作者历史数据。文章保存和对应收录使用同一事务。永久词汇不随来源文章 / 批注或临时词典缓存删除；本机账号删除预览指纹包含其全部词汇，备份后事务删除文章、词汇和用户。
- `updated_at` 为服务端 Unix 毫秒整数，创建与更新在同一 SQL 写入中使用当前时间及该账号现有最大值 + 1 的较大值；同毫秒写入也严格有序。收藏用 `(owner_email, updated_at DESC, id DESC)` 索引，按最近写入优先返回，日期展示最近保存时间；读取不更新时间，`created_at` 不变。
- 启动时为旧文章表无损追加 `owner_email`、`definitions`、可空 `formatting` 与 `updated_at`；新增时间列及按原 UTC 创建时间回填在同一事务完成，无有效日期时为 0，重启不覆盖已有更新时间；旧作者不推断，双语列默认 `[]`。无作者历史文章保留在数据库中但隔离于所有账号列表与读取接口，不自动认领或删除；经确认的人工归属迁移另行处理。
- 有效双语数据必须匹配正文中的英文批注；读取旧文章时忽略失效元数据，写入新元数据时原子校验。更新请求省略 `definitions` 时，保留仍匹配新正文的旧批注；省略 `formatting` 时映射现有格式，显式 `null` 才清空。

### Redis 与会话

- 保存验证码、60 秒发信冷却、验证码尝试次数、登录尝试次数以及会话 Token；验证码使用 `auth:code:<email>`，会话使用 `auth:token:<token>` 键。
- 验证码有效期 5 分钟；Cookie 与服务端会话均为 24 小时，不因页面访问而续期。
- 会话值为 `{userId,email}`，每次鉴权同时核对 SQLite 中的账户身份。删除后及相同邮箱重注册后旧会话均失效；旧版仅邮箱会话升级后需重新登录。SQL 读写还核对该 `userId` 仍存在，防止删除期间已经鉴权、随后才读完请求体的保存请求写回孤儿文章。Redis 中的旧 Token 可自然到期，不再具有授权能力。
- Redis 不可用时仅非生产模式可降级为进程内 Map，带 TTL 和容量限制；重启后需要重新登录。生产认证不静默降级。
- 邮件发送失败不把验证码当作已发送；仅非生产且未配置 SMTP 主机时返回本地开发验证码。

### 浏览器状态

| 状态 | 位置与生命周期 |
| --- | --- |
| 已确认 DeepSeek 密钥 | 当前标签页 `sessionStorage`，刷新恢复，关闭标签页后清除 |
| 工作草稿、Word 格式、正文阅读偏移、页码、文章关联、每条释义显示语言 | 当前标签页 `sessionStorage`，分别保存在 `er_article_draft_v1:guest` 与 `er_article_draft_v1:account:<编码邮箱>`；这些作用域不是授权凭据，恢复文章关联仍需服务端确认 |
| AI 用量 | `er_ai_usage_v1`，当前标签页 `sessionStorage`，不含密钥、提示词或正文 |
| 界面语言 | `er_ui_language_v1`，`localStorage` |
| 释义方式 | `er_definition_mode_v1`，`localStorage`，默认 context（上下文参考）；无有效记录时使用默认，已有有效选择不覆盖；只影响后续请求 |
| 撤回 / 恢复历史 | 当前页面内存，最多 50 个快照 / 约 8MB；800ms 连续输入合并，不随草稿保存 |
| 新释义默认语言 | `er_default_definition_language`，`localStorage`，不覆盖已保存批注 |
| 各篇文章的阅读显示语言 | `er_article_definition_languages_v1`，`sessionStorage`；最近 100 篇、最多 256 KiB，仅存版本 SHA-256 指纹与排序后的语言列表，不存正文、释义或凭证；存储受限时保留有界内存 |
| 阅读纸张 | `er_reading_background`，`localStorage` |
| 词典查询缓存 | `er_dictionary_cache_v2`，`localStorage`，最多 256 条、7 天有效，按最近最少使用淘汰 |

总清单的临时显示语言仅放在当前页面内存，并在切号时清理；本篇清单直接切换对应 `DefinitionViews` 的语言，不另存正文。`vocabularyClient.ts` 捕获账号及会话代次，只收录同一次账号会话的成功结果，无匿名重放或后台重试队列；每批上限 500 项，未保存文章也只提交新生成的词条和释义。`/api/vocabulary` 按 100 条分页读取和最多 64 字符筛选，不一次加载整个账号词汇。

文章手动保存及释义后自动保存均使用 `DefinitionViews.snapshot()` 保留逐条语言；阅读点击切换不产生未保存状态或后台写请求。离开干净的保存版本前及切换语言时记录本标签页选择，打开文章时只对正文与语言无关批注内容指纹完全一致的版本回填；不同文章、改写内容和不同批注不串用，删除记录同时清理偏好。存储上限之外的旧文章回退到服务端保存的选择。旧版曾强制改成英文的选择无法从数据库推断回去，无需数据库结构迁移，也不自动重新请求 AI。

草稿新增可选正文 `offset` 以跨分页配置恢复位置；旧记录按原 3000 上限计算旧页起点，再映射到 5000 新分页。所有批注偏移仍针对完整正文，无需迁移数据库。

参考释义的局部语境为前后各最多 600 Unicode 码点；全文最多 24,000 UTF-16 单元，每批序列化输入最多 32,000 单元、最多 12 个身份，正文在每批只附一次。`SHA-256([词条, 位置, 所选原文长度, 语境])` 与模式组成缓存身份；缓存不保存语境原文。HTTPS / localhost 优先用 Web Crypto；普通局域网 HTTP 使用结果一致的本地 SHA-256 指纹实现（仅缓存身份，不用于认证）。新版提示词版本使旧通用缓存失效，旧文章批注仍可读，不自动付费补音标。

登录 / 会话恢复时，`LatestArticleOnLogin` 等 `workspace-ready` 和当前会话的私有收藏列表都就绪后，仅取一次排序首项；已有草稿或编辑 / 弹窗活动则消耗本次尝试而不打开。`db.ts` 复用 `openEntry()` 恢复完整正文、格式、逐条语言和保存基线，应用前再次核对账号、读取序号、正文版本及空闲空白条件，避免迟到响应覆盖用户输入或切号；不锁定编辑、不自动写入，也不在后续清空 / 收藏刷新时补开文章。失败只提示从收藏手动重试。

浏览器存储被禁用时，相关功能在当前页面以分账号内存状态继续工作并按需提示，不伪称已持久化。初次恢复先确认会话，不能在鉴权前渲染上一个账号的文章。退出、会话过期或切号先保存原账号工作区并清理正文、编辑区、列表、历史和旧响应，再恢复目标账号或匿名草稿；匿名草稿登录后可继续保存，若已有不同的账号工作草稿，先确认取舍，不覆盖已保存文章。

旧的未分区 `er_article_draft_v1`：有文章 ID 时先向接口确认属于当前账号，确认前不展示其中的正文或标题；其他账号或无作者记录保持隔离，不猜测归属。无 ID 的旧浏览器草稿按匿名工作处理。工作区仅保存在本设备标签页，并非服务器加密或共享设备的保密容器；关闭标签页后临时记录失效。

## 5. 交互、异步任务与安全边界

- 仅导入和编辑使用页内面板；保存、删除、未保存确认、收藏、AI 设置与账号使用原生 `<dialog>`，不替换正文或编辑区。
- 利用浏览器 top layer 提供模态与背景不可交互；支持叠放确认便签、Esc、点击遮罩、当前弹窗内 Tab 循环和关闭后焦点 / 编辑光标恢复。不使用 `window.confirm` 或离页原生确认。
- AI 任务用操作锁避免冲突，用页面版本、请求序号与中止信号阻止迟到结果覆盖新内容。临时进度与失败标记不写入文章。先排版后注释，避免 AI 移动已有批注。
- 删除目标由 `state.ts` 中单一 `deletePending` 引用管理，同步虚线高亮与 `aria-pressed`；切换目标不修改正文或历史。仅删除操作的重绘保留删除模式并清空目标，其他正文替换和历史恢复仍重置临时模式，避免旧 DOM 目标在重排后误用。
- 编辑、AI 整理及一整次释义任务的完整结果在 `state.ts` 记录前后快照；历史恢复取消释义 / 排版并递增页面版本。导入、清空、打开文章及刷新恢复为历史边界；保存不重置历史，不回滚服务端基线或身份。
- 释义实际应用修改后，`translate.ts` 先结束可取消 AI 阶段并恢复失败选词，再调用 `db.ts` 的 `saveDefinitionChanges()`；仅当前已登录、工作区就绪、关联及权限核验通过的本人文章自动 PUT 一次完整快照，包含部分成功 / 缓存结果，不创建文章或弹保存 / 登录确认。成功才更新保存基线和刷新收藏，失败保留工作副本并提示手动重试；404 解除关联。无修改、取消、全失败及未保存草稿不触发自动写入。
- 释义、排版和标题总结支持中止；自动保存独立持有数据库写入锁，Read / Esc 不提前解锁。保存任务身份、账号和文章关联序号隔离迟到响应，退出或切号不更新新工作区；已经提交到后端的数据库写入不会因关闭弹窗而被宣称回滚。
- 认证使用 `er_session` HttpOnly / SameSite=Strict Cookie，浏览器不再在 localStorage 保留 Token；API 不把登录 Token 返回给前端 JavaScript。
- 所有文章接口都必须有会话，SQL 按当前作者限定列表和单篇查询，读取 / 更新 / 删除他人或无作者记录统一 404，接口不公开作者邮箱；不存在共享入口，也不信任客户端提交的作者身份。
- 未登录点击保存自动打开登录便签；成功后恢复保存确认，仍需用户提交，不自动写文章或请求 AI。取消 / 失败保留匿名草稿；过期的手动写请求再次进入登录流程，释义后自动保存不主动弹登录。账号切换使旧读写响应失效，旧会话的迟到 401 不得登出新账号；页面重获焦点时重新核对会话。
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
