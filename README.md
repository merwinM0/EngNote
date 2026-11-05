# English Reading 英文阅读助手

一个基于 **HTML + TypeScript + CSS** 的英文阅读网页应用。用户点击「粘贴」按钮从剪贴板读取英文文本，页面按正确段落展示；支持调用 DeepSeek API 进行「AI 整理」排版与「AI 翻译」单词注释；可将内容**保存到 SQLite 数据库**并在右侧边栏读取；支持**邮箱注册/登录**（带验证码）。

## 快速启动（源码脚本模式）

```bash
bun install --frozen-lockfile
cp .env.example .env   # 已有 .env 请保留，不要覆盖
bun dev
```

打开 `http://localhost:3000`。已验证 Bun **1.3.14**。无需编译可执行文件，也不再依赖 `public/dist/app.js`：Bun 原生 HTML 入口负责前端 TS / CSS 打包与开发热更新，服务端修改由 `--watch` 重启。

- `bun start`：生产模式直接运行源码（关闭 HMR），仍需保留源码、依赖与静态资源；生产认证需要 Redis、SMTP。
- `bun run typecheck`：分别检查前后端类型；`bun test`：运行文本规则、接口与数据库迁移测试。
- `bun run build`：可选，仅导出前端到 `dist/` 用于检查，不是可单独部署的完整应用；SQLite / 登录仍需 Bun 后端。
- 默认绑定 `127.0.0.1`。局域网访问设 `HOST=0.0.0.0`；手机非 HTTPS 环境的剪贴板不可用时可使用粘贴窗口。
- 原 `Engreading` / `index.js.map` 不再使用，也不会自动删除；现有 `.env` 与 `data.db` 保留。

### 代码逻辑与本次调整

`index.ts` 管理启动和退出 → `backend/server.ts` 初始化 SQLite、挂载两页 HTML、校验 API → `backend/auth.ts` / `redis.ts` / `mail.ts` 处理登录、验证码和会话。前端 `main.ts` 装配事件，`state.ts` 管理段落与选词，`db.ts` 管理保存/列表，`format.ts` 与 `translate.ts` 调用 DeepSeek。

- 修复全局正则反复校验不稳定、粘贴丢失数字、标点也被选中、跨段落合并短语等问题。
- AI 期间锁定冲突操作，使用页面版本及请求序号防止过期结果覆盖新内容；加载/失败标记不写入文章。先排版后注释，避免 AI 排版移动已有释义。
- 保存/删除有等待与错误反馈，失败保留标题和正文；切换/离开时提醒未保存内容；弹窗使用原生 `dialog`，支持键盘与焦点管理。
- 会话改为 HttpOnly / SameSite Cookie，不再在 localStorage 保存 Token；API Key 从 Cookie 迁移为当前标签页的 sessionStorage，并可随时清除。
- 文章仍是**公开阅读书架**，不是私密笔记；只有作者可更新/删除。旧表自动追加 `owner_email`，历史文章不猜测作者，保留公开只读，可另存为自己的副本。API 不公开作者邮箱。
- 静态资源通过 HTML 入口与明确白名单提供，不再拼接任意文件路径；接口校验 JSON 类型、长度、方法与请求来源。
- 首页三张胶带便签，阅读页为笔记纸；`public/css/tokens.css` 统一水灰中性色和克制青色强调，`public/icons/reading-sketch.svg` 为本地线稿。无外部字体或 UI 框架。

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | HTML5 + TypeScript + CSS |
| 构建/运行 | Bun（`bun dev` 启动源码与开发热更新） |
| AI 能力 | DeepSeek API（OpenAI 兼容接口） |
| 存储 | SQLite（Bun 内置 `bun:sqlite`，本地 `data.db`） |
| 密码哈希 | **慢哈希**：`argon2id`（内存/时间硬度高），经 Bun `Bun.password` 加密 |
| 验证码存储 | Redis（`redis` npm 包；不可用时降级为内存）|
| 邮件发送 | Nodemailer + SMTP，通过 `.env` 配置发信账号 |
| 依赖 | `redis`、`nodemailer`（+ `@types/nodemailer`） |

---

## 功能需求

### 1. 文本粘贴与段落展示
- 点击「**粘贴**」按钮，**单击一次**直接读取剪贴板英文文本（无需确认弹窗，浏览器剪贴板权限）。
- 粘贴默认为**新内容**：粘贴后自动取消右侧边栏的选中项，后续保存会**新建一篇**而非覆盖以前选中的文章。
- 读取后自动**过滤非英文字符**（仅接受英文，提示并剔除中文等非法字符）。
- 页面将文本按**正确段落**展示：
  - 以空行作为段落分隔符；
  - 段内连续换行合并为单行；
  - 每段渲染为独立的 `<p>`（带段间距）。
- 展示区为**只读**展示（不绑定可编辑文本区域），便于单击选词。

### 2. 只读展示（无独立文本编辑区）
- 页面不设独立的文本编辑区/富文本，**移除「修改」功能**（与单击选词冲突），避免双编辑源导致一致性问题。
- 获取新文本统一通过「粘贴」按钮完成；剪贴板不可用时打开临时粘贴窗口，提交后仍回到只读阅读区。

### 3. 保存到数据库（SQLite）
- 点击「**保存**」按钮：
  - **若已选中本人保存的文章** → **直接覆盖更新**，**不再弹窗**（保留原标题，只更新内容）；他人的文章及无作者的历史文章保存为自己的新副本。
  - **若未选中**（例如刚粘贴/清空的新内容）→ 弹出保存窗口，输入**标题**新建一篇；新建成功后自动成为选中项。
- 说明：**粘贴或清空会重置为“新内容”状态**，从而保存时新建，不会误覆盖先前选中的文章。
- 标题**不允许输入中文**，且**长度限制 20 个字符**；前后端均校验，无效时提示修正，不静默保存错误标题。
- 保存内容：**若已翻译，则保存带 `『』` 译文的内容**（即当前展示区的完整文本，含释义标记）；未翻译则保存原文。
- 数据写入 **SQLite**（`data.db`），浏览器刷新后仍保留。

### 3. AI 整理（排版）
- 点击「AI 整理」按钮，将当前文本发送给 DeepSeek。
- AI 按以下规则输出**正确排版格式**的文本：
  1. 修正错误断行、多余空行；
  2. 统一段落分隔（段落之间一个空行）；
  3. 修正英文标点（`, . ? ! ' "` 等）前后的空格错误；
  4. 保留原文中的事实、数字与单词，不主动改写内容；
  5. 返回纯文本，不包含任何解释性内容。
- 返回结果替换当前文本并重新按段落渲染。

### 4. AI 翻译（单词注释）
- 点击「AI 翻译」后进入**选词模式**，用户在文本中**单击单词**即可选中，选中的单词会**高亮背景色**（再单击取消，可多选）。
- 选词解析规则：
  - **单个单词**：在该单词后方追加 `『』`，`『』` 内为**纯英文释义**。
    - 例：`apple『a round fruit with red or green skin』`
  - **连续单词（相邻短语）**：视为一个整体，在短语整体后方追加一个 `『』`，解释该短语含义。
    - 例：`take off『to leave the ground and begin to fly』`
  - **不连续的多个单词/词组**：每个被选中的片段**分别**在其后方追加各自的 `『』`，逐个用纯英文解释。
    - 例：`The quick『fast』brown fox jumps over the lazy『slow-moving』dog`
- `『』` 中的解释**仅使用英文**，不用中文，便于沉浸式阅读。
- 翻译前的选中高亮在翻译完成后清除，由 `『释义』` 标记取代。

**翻译交互流程**（两步：先选词，再点翻译）：
1. 点击「AI 翻译」按钮 → 进入**选词模式**，直接在页面单击选词。
2. 用户在文本中**单击单词**选中并高亮背景色（再单击取消，可多选相邻或不相邻的单词/短语）。
3. 选词完成后，**再次点击「AI 翻译」按钮**（此时按钮语义变为「开始翻译」）触发翻译，选中高亮随即清除并插入翻译标记。
4. 释义请求期间在选中片段后追加 `『Defining…』`；锁定冲突操作，避免异步结果覆盖其他文章。
5. API 返回后替换为对应的 `『纯英文释义』`。
6. 个别词未返回释义时显示可重试提示；整个请求失败时移除加载标记。加载与错误标记不会写入数据库。

### 5. 删除翻译（删除按钮）
- 点击「**删除翻译**」按钮进入删除模式（按钮变红）。
- **单击一个 `『』` 译文** → 选中（红色高亮）。
- **再次单击同一个 `『』`** → 删除该条翻译，恢复纯原文。
- 再次点击「删除翻译」按钮退出删除模式。

### 6. 右侧边栏（已保存文章）
- 页面右侧有「已保存」边栏，展示数据库中所有文章（标题）。
- 边栏标题若空间不足会以 **`…`（省略号）简洁显示**（`text-overflow: ellipsis`）。
- 点击某个标题 → 加载并展示该文章内容（含 `『』` 释义），并在边栏中**高亮为选中项**。
- 选中一篇后，再次点「保存」会**直接覆盖更新**该文章，不再弹窗。
- 每条右侧有「✕」按钮 → 弹出**主题风格删除确认弹窗**（替代浏览器默认 `confirm`，与整体风格一致）确认后删除；若删除的是当前选中项会自动取消选中。
- 「↻ 刷新」按钮重新拉取列表。

### 7. DeepSeek API 接入
- API 地址：`https://api.deepseek.com/chat/completions`（OpenAI 兼容）。
- 模型：`deepseek-chat`。
- 请求头：`Authorization: Bearer <API_KEY>`。
- API Key 在「AI tools」中输入，可选择**保留到当前标签页**（`sessionStorage`），刷新后可恢复，关闭标签页后清除。不使用 Cookie，不随本地 API 请求传输；可点击「Forget key」立即清除。
- API Key 仅存在浏览器端，**不上传**到我们的服务器/数据库。
- 请求失败（超时、鉴权失败）时页面给出明确错误提示。

### 8. 邮箱注册 / 登录
- 阅读页顶栏提供「Login」按钮，弹出登录/注册弹窗（Login / Register 两个标签切换）。
- **注册**需邮箱 + 验证码 + 密码（≥6 位）：
  - 点击「Send Code」→ 后端生成 6 位验证码，存 **Redis**（TTL 5 分钟），并通过 **SMTP**（`.env` 配置）发送到邮箱。
  - 验证码正确且邮箱未注册才算注册成功。
- **登录**：邮箱 + 密码 → 校验通过后签发会话（Redis，7 天有效），通过 HttpOnly / SameSite Cookie 传递，前端启动时向 `/api/auth/me` 校验。
- 登录界面**无需验证码**（验证码只在注册时要求）。
- 登录后顶栏按钮变为「Logout」，点击退出登录。
- **未登录用户**可使用粘贴、AI 整理、翻译等功能，但**不能保存/覆盖/删除文章**（前端阻止并提示「Please log in to save」，后端接口也会校验登录态返回 401）。
- 密码使用**慢哈希算法（Argon2id）**加密后存 SQLite，绝不存明文。
- 会话 Cookie 由浏览器自动携带，前端不可读取 Token；写请求校验同源，文章写操作校验作者。

---

## 页面结构（示意）

```
┌──────────────────────────────────────────┬──────────────┐
│  标题栏：English Reading                  │              │
│  [AI tools: API Key / 当前标签页保存]   │              │
├──────────────────────────────────────────┤              │
│ [粘贴] [AI 整理] [AI 翻译]               │  右侧边栏      │
│ [删除翻译] [保存] [清空]                 │  已保存列表     │
│                                          │  ├ 文章A      │
│  段落展示区（只读·单击选词）               │  ├ 文章B      │
│  p1: 第一段文本…                          │  └ …          │
│  p2: 第二段文本…                          │              │
│  …                                       │              │
├──────────────────────────────────────────┴──────────────┤
│  状态栏：AI 请求状态 / 错误信息                          │
├──────────────────────────────────────────────────────────┤
│  保存弹窗：输入标题（不允许中文） [保存] [取消]              │
└──────────────────────────────────────────────────────────┘
```

---

## 文本格式输出逻辑（核心设计）

```
原始文本
   │  按 \n\n（空行）分段
   ▼
段落数组 paragraphs: string[]
   │  每段内部：合并多余换行、整理空格与标点
   ▼
清洗后的段落数组
   │  渲染为 <p> 列表（每段独立块，段间距分隔）
   ▼
页面展示
   │  AI 整理：整篇文本 → DeepSeek → 规范文本 → 重新分段
   │  AI 翻译：选中片段 → 解析分组 → 每个分组后先插 『Translating…』（动态） → 返回后替换为 『纯英文释义』
   ▼
更新后的段落数组 → 重新渲染
```

### 数据结构

```ts
// 原始输入
rawText: string;

// 按空行切分后的段落
paragraphs: string[];

// 渲染节点：一段文本 + 可选的注释标记
interface Segment {
  text: string;        // 单词/短语原文
  note?: string;       // 『』内的英文释义（未选中时为 undefined）
}
interface Paragraph {
  segments: Segment[]; // 按出现顺序排列，未选中部分 text 即为整句
}

// 选中翻译分组结果
type SelectionGroup = {
  start: number;       // 在段落中的起始偏移
  end: number;         // 结束偏移
  isContiguous: boolean; // 是否连续
};
```

### 选词分组算法
1. 用户**单击**单词 → 加入选中集（高亮背景，再次单击取消）。
2. 按单词 id（文档顺序）排序 → 得到有序选中列表 `pickedIds`。
3. id 相邻、在同一段落且中间只有空白时，合并为一个词组；不跨标点、注释或段落合并。
4. 不相邻的单词各自成组 → 各自一个 `『』`。
5. 确定分组后，先在每个分组后标为 `『Defining…』`。
6. 将分组发送 DeepSeek，一次请求返回每组的纯英文释义数组（`[{word, meaning}]`）。
7. 按分组位置以 `『meaning』` **替换**原 `『Translating...』`，更新段落渲染。

---

## API 约定

### POST /v1/chat/completions（DeepSeek）

```json
{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "You are a text formatting assistant. 只输出整理后的纯英文文本，不添加任何说明。"
    },
    {
      "role": "user",
      "content": "<待整理的英文原文>"
    }
  ],
  "temperature": 0.3
}
```

- **AI 整理**：system 提示词约束输出为规范排版的纯文本。
- **AI 翻译**：system 提示词要求对给定词表逐项输出 `word: meaning` 形式的纯英文释义（JSON 数组亦可），**禁用中文**。

---

## 本地 REST API（Bun + SQLite）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/entries` | 列出已保存文章（id, title, created_at） |
| POST | `/api/entries` | 保存文章，JSON `{ title, content }` |
| PUT | `/api/entries/:id` | 覆盖更新文章内容（保留原标题） |
| GET | `/api/entries/:id` | 获取单篇文章（含 content） |
| DELETE | `/api/entries/:id` | 删除一篇文章 |

保存请求示例：

```json
{
  "title": "My Reading",
  "content": "The quick brown fox『fast』jumps over..."
}
```

- `content` 保存当前展示区文本；**若已翻译，则保存带 `『』` 释义的内容**。
- 文章表：`entries(id, title, content, created_at, owner_email)`，存储于 `data.db`；旧表无损迁移，历史记录作者为空且只读。

### 认证 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/send-code` | 生成验证码存 Redis 并发送到邮箱，`{ email }` |
| POST | `/api/auth/register` | 邮箱注册，`{ email, password, code }` |
| POST | `/api/auth/login` | 登录，`{ email, password }` → HttpOnly 会话 Cookie |
| POST | `/api/auth/logout` | 注销当前 Cookie 会话 |
| GET | `/api/auth/me` | 校验当前 Cookie 会话 |

- 密码存入 SQLite 时经 **Argon2id 慢哈希**（`Bun.password`）。
- 验证码与会话 Token 存 **Redis**（`auth:code:<email>` / `auth:token:<token>`）；Redis 不可用时降级为内存（仅开发）。
- 文章**写操作**需有效会话；未登录 `401`，修改非本人文章 `403`；`GET` 列表/读取公开，仅返回 `can_edit` 权限标记，不泄露作者邮箱。

### 环境变量（`.env`，已 gitignore，可复制 `.env.example`）

> `.env` 与 `.env.example` 内含**逐项修改备注**（邮箱服务商取值、授权码、Redis 地址、端口等），直接按文件内编号注释改即可。

```env
# 邮件发送（SMTP），SMTP_HOST 为空时不发信，验证码打印到日志
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Redis（验证码与会话存储）
REDIS_URL=redis://127.0.0.1:6379

# 端口
PORT=3000
```

---

## 目录结构（主要文件）

```
english_reading/
├── index.ts              # 源码服务入口（启动 / 退出）
├── seed.ts               # 创建三个测试账号（test1/2/3，密码 123456）
├── backend/              # server.ts 路由与迁移 + auth / redis / mail
│   ├── auth.ts           # 注册/登录/会话（Argon2id 慢哈希 + Redis 验证码）
│   ├── redis.ts          # Redis 客户端封装（验证码/会话；不可用时内存降级）
│   └── mail.ts           # Nodemailer 发信（读 .env SMTP 配置）
├── .env.example          # 环境变量模板（复制为 .env）
├── .env                  # 实际配置（已 gitignore，不提交）
├── data.db               # SQLite 数据库（自动创建）
├── public/               # 前端静态资源
│   ├── index.html        # 页面结构
│   ├── home.html         # 手账便签首页（由 Bun 原生 HTML 入口处理资源）
│   ├── ts/               # 前端逻辑（多个 TS 模块，由 main.ts 装配）
│   │   ├── util.ts       # DOM / 状态提示 / dialog / API 请求
│   │   ├── state.ts      # 元素引用、渲染、状态与模式管理
│   │   ├── auth.ts       # 前端登录/注册弹窗 UI + 会话
│   │   ├── deepseek.ts   # DeepSeek API 封装
│   │   ├── format.ts     # AI 整理
│   │   ├── translate.ts  # AI 翻译
│   │   ├── deleteNote.ts # 删除翻译
│   │   ├── db.ts         # 保存 / 右侧边栏
│   │   └── main.ts       # 入口：装配事件 + 初始化
│   └── css/              # 样式（多个 CSS 文件）
│       ├── base.css      # 变量、全局、通用控件
│       ├── layout.css    # 页面布局与工具栏
│       ├── content.css   # 展示卡片、词注释
│       ├── sidebar.css   # 已保存边栏
│       ├── modal.css     # 保存弹窗 + 认证弹窗
│       └── responsive.css# 手机自适应
├── package.json
├── tsconfig.json
└── README.md
```

---

## 开发计划

- [x] 搭建 Bun 静态服务 + SQLite，提供 `index.html` / 多 CSS / 多 TS 模块
- [x] 「粘贴」按钮读取剪贴板 + 段落解析渲染
- [x] 英文字符校验（文本与标题禁止中文）
- [x] DeepSeek API 封装（整理 / 翻译两个 prompt）
- [x] AI 整理按钮联调
- [x] 选词模式 + 分组算法 + AI 翻译联调
- [x] 「保存」到 SQLite（弹窗标题）+ 右侧边栏读取/删除
- [x] 「删除翻译」模式：单击选择整条 `『』`，再单击删除
- [x] 邮箱注册/登录（Argon2id 慢哈希 + Redis 验证码 + SMTP 发信）
- [x] 首页 + 阅读页导航统一与手机自适应
- [x] 错误提示、超时、加载态、旧数据迁移及作者权限
- [x] 水灰手账风、SVG 线稿、便签首页与响应式布局

---

## 运行方式

```bash
bun install
cp .env.example .env   # 按需填写 SMTP / REDIS_URL
# 可选，仅本地开发：bun run seed.ts（创建测试账号；不要在生产执行）
bun dev
# 浏览器打开 http://localhost:3000（端口以 index.ts / .env 中 PORT 为准）
```

首页（`/`）为手账欢迎页，点击「Start a new page」进入阅读页（`/index.html`）。

两页均支持手机自适应；阅读页通过 `public/css/reader.css` 按固定顺序导入样式，避免开发热更新时级联顺序不一致。

### 部署到服务器（域名）
- `PORT` 默认 3000，`HOST` 默认 `127.0.0.1`；可用 Nginx 反向代理到本服务，保留请求 Host，并将 `APP_ORIGIN=https://你的域名` 设为公开源地址。使用 HTTPS 并设置 `COOKIE_SECURE=true`。
- `bun start` 直接运行源码；配置正确的 SMTP 与 Redis。生产模式不返回开发验证码，Redis 不可用时认证失败而不静默降级。生产启动前请备份 `data.db`，不要执行测试账号 seed。

### 测试账号
运行 `bun run seed.ts` 会创建三个测试账号（密码均为 `123456`）：
```
 test1@test.com     Argon2id 慢哈希入库
 test2@test.com
 test3@test.com
```
这些账号只在页面用「邮箱+密码」登录，无需验证码。

> **邮件验证码测试**：若 `.env` 未配置 `SMTP_HOST`，应用不会真正发信，而是把 6 位验证码打印到服务器日志（开发模式）。需要真实发信则填入 SMTP 账号；需要 Redis 持久化验证码则启动本地 Redis 并设置 `REDIS_URL`（未启动时自动降级为内存存储）。
