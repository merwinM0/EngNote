# 运行与部署

[项目介绍](../README.md) · [架构设计](ARCHITECTURE.md) · [功能说明](FEATURES.md) · [API 说明](API.md) · [更新记录](CHANGELOG.md)

## 1. 运行方式与前置条件

- 已验证 Bun **1.3.14**，使用仓库内 `bun.lock` 安装依赖。
- 应用直接运行源码，由 Bun 原生 HTML 入口打包页面，不依赖 `public/dist/app.js` 或旧的独立可执行文件。
- 生产部署需要保留入口、`backend/`、`public/`、依赖及运行配置；SQLite 数据需放在可持久化且当前进程可写的位置。
- 本地开发可不配置 SMTP / Redis；生产认证需要真实可用的 SMTP 和 Redis，不能沿用开发验证码或内存降级。

## 2. 本地开发

在项目根目录运行：

```bash
bun install --frozen-lockfile
test -f .env || cp .env.example .env
bun dev
```

- 首页：<http://localhost:3000>；阅读页：<http://localhost:3000/index.html>。
- 现有 `.env` 与数据库应保留，不要用配置模板覆盖。
- 前端 TS / CSS 由 HTML 入口打包并热更新，后端代码修改由 `--watch` 重启。
- 启动使用无图标边框面板，仅展示 localhost 链接、实际 PID、Bun 版本及开发 / 生产和 HMR 状态，不枚举局域网地址；`bun dev --json` / `bun start --json` 将启动结果或错误作为 JSON 写入标准输出，失败退出码为 1。
- 默认仍为 `HOST=0.0.0.0`，隐藏局域网地址不等于限制监听。同网段手机可通过 `http://本机局域网IP:3000` 访问，需放行防火墙；只供本机使用则设 `HOST=127.0.0.1`。显式绑定特定网卡时，应使用该网卡地址访问，面板中的 localhost 链接不保证可用。
- 未设置 `PORT` 时，`bun dev` 默认 3000，`bun start` 默认 80；显式设置 `PORT` 会覆盖默认值。

## 3. 环境变量

完整模板与邮件服务商示例见 [`.env.example`](../.env.example)。所有真实配置留在 `.env`，不得提交凭证或将服务端环境变量注入浏览器产物。

| 变量 | 默认值 / 要求 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `bun start` 自动设为 `production` | 生产关闭 HMR，并禁止认证存储内存降级及开发验证码 |
| `HOST` | `0.0.0.0` | 监听地址，反向代理后端可用 `127.0.0.1` |
| `PORT` | 开发 3000 / 生产 80 | 必须是 1–65535 的整数，错误配置不会静默回退 |
| `DB_PATH` | 项目根目录 `data.db` | 数据库文件路径，建议在服务器使用绝对路径并提前准备可写父目录 |
| `APP_ORIGIN` | 未设置时使用请求自身源 | 反向代理时设公开 HTTP(S) 源地址，例如 `https://reading.example.com`，不带路径 |
| `COOKIE_SECURE` | 仅值 `true` 开启；HTTPS 请求也会开启 | HTTPS 反向代理后应显式设 `true`；纯 HTTP 下不要开启 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | 验证码、冷却与会话存储；空值仅开发可用来明确禁用 Redis |
| `SMTP_HOST` | 空 | 邮件主机，例如 `smtp.qq.com`、`smtp.163.com`、`smtp.gmail.com` |
| `SMTP_PORT` | `465` | 465 使用 SSL；常见替代为 587 / STARTTLS |
| `SMTP_USER` | 空 | 发信邮箱；兼容旧名 `SMTP_USERNAME` |
| `SMTP_PASS` | 空 | 邮箱服务商授权码 / SMTP 密码；兼容旧名 `SMTP_PASSWORD` |
| `SMTP_FROM` | 未设置时使用 `SMTP_USER` | 发件地址，使用默认值时应省略该项，不填写空字符串 |
| `SMTP_FROM_NAME` | 空 | 可选发件人名称，例如 `EngNote` |

DeepSeek API key **不是服务端环境变量**：由用户在 AI setup 中确认，只存在浏览器当前标签页，直接用于请求 DeepSeek。

### 开发降级与生产区别

- 仅非生产且 `SMTP_HOST` 未设置时，不真正发送邮件；六位开发验证码写入服务器日志并返回前端，便于本地注册。
- 已配置 SMTP 主机但缺少凭证或发信失败时，不返回开发验证码；生产模式始终要求实际发信成功。
- Redis 为空或不可达时，仅非生产允许进程内带 TTL 的存储；重启后验证码和登录状态丢失。
- 生产 Redis 不可用会使需要该存储的认证请求失败，不会静默回退为单进程会话。SMTP / Redis 应通过实际认证流程验证，不以页面能打开作为配置正确的证据。

## 4. 开发验证与前端构建

```bash
bun run typecheck
bun test
bun run build
git diff --check
```

- 类型检查分别覆盖服务端 / 测试和浏览器环境。
- 测试覆盖正文规则、无损分页、编辑边界、Word 解压与导出、双语释义、英式音标、语境隔离缓存、阅读撤回 / 恢复、旧草稿重新分页、AI 请求预算与用量、语言偏好、白板几何、邮件模板、API 及数据库迁移。
- 接口与终端管理测试使用隔离数据库，覆盖 Word 格式、段落改写拒绝、只读查看、确认取消、级联删除、一致性备份 / 回滚、同邮箱重注册及在途保存的会话隔离；不应操作真实 SMTP、Redis 或用户数据；不要以真实发信、付费 AI 请求替代自动化测试。
- `bun run build` 将两页前端导出到 `dist/`，用于检查 HTML / JS / CSS / 资源打包，**不是完整部署包**。只部署 `dist/` 不会获得 SQLite、认证和保存能力。
- 两页均需检查手机宽度、键盘与弹窗行为；阅读页通过 `public/css/reader.css` 固定样式导入顺序。邮件还需在目标邮箱客户端实测，浏览器预览不能代表全部邮件兼容性。

## 5. 生产部署

### 推荐：HTTPS 反向代理

1. 准备 Bun、可用 SMTP、Redis 及数据库备份，安装锁定依赖。
2. 为生产环境单独配置 `.env`；不要覆盖现有数据，也不要执行测试账号脚本。
3. 让应用使用普通端口和回环地址，由 Nginx 等代理负责 80 / 443 与 TLS。

示例配置片段，SMTP / Redis 凭证按模板另行填写：

```env
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://reading.example.com
COOKIE_SECURE=true
REDIS_URL=redis://127.0.0.1:6379
# DB_PATH=/absolute/path/to/data.db
```

```bash
bun install --frozen-lockfile
bun start
```

反向代理需保留公开请求的 Host，并与 `APP_ORIGIN` 一致。例如以下 Nginx `location` 放入已配置证书的 HTTPS `server` 中：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

使用服务管理器时，应以非特权账号运行、指定项目工作目录，确保它能读取受限配置并写入数据库目录；SQLite WAL 伴随文件也需要目录写权限。

### 直接监听 HTTP 80

- 删除 `PORT` 覆盖或设为 80，再执行 `bun start`，可用 `http://服务器地址/` 直接访问。
- 80 为特权端口，需额外权限；优先采用普通端口加反向代理，或由系统服务授予最小绑定权限，不建议让应用长期以 root 运行。
- 如确需给 Bun 可执行文件授予绑定权限，可由管理员评估使用 `sudo setcap 'cap_net_bind_service=+ep' "$(command -v bun)"`；这不是应用启动的必需步骤。
- 直接 HTTP 时不要开启 `COOKIE_SECURE`，否则浏览器不回传会话 Cookie；配置 HTTPS 后应开启。公网账号使用建议配置 HTTPS，避免明文传输密码和会话。
- 注意 `HOST` 与防火墙：默认 `0.0.0.0` 允许外部连接；`127.0.0.1` 只适合本机或本机代理。

## 6. 数据、备份与升级

- 默认数据库是项目根目录 `data.db`，包含文章与用户密码哈希；保留 `.env`、数据库及原有作者信息，不用 seed 重建生产账号。
- SQLite 使用 WAL。备份应停服并在连接正常关闭后复制，或使用 SQLite 在线备份机制；不要只复制仍在写入的 `data.db`、遗漏有效 WAL 或手动删除伴随文件。
- Redis 保存有期限的验证码、尝试计数和会话。会话现绑定用户 ID 与邮箱；升级后旧版仅邮箱会话需重新登录，文章和草稿不删除。服务重启后的会话行为取决于 Redis 是否保留数据；开发内存降级一定丢失登录状态。
- 启动自动为旧文章表追加作者、双语列、可空的 Word 格式列及毫秒更新时间；旧文章按原创建时间回填更新时间，后续保存自动推进，不猜测历史修改时间或作者。升级前先备份，无作者历史文章保留在数据库中但不向任何账号展示，不自动认领或删除；需恢复时先核实归属、备份后再受控迁移。
- `dist/`、`node_modules` 是可重新生成的内容，不作为业务数据备份；旧 `Engreading` / `index.js.map` 不再使用，不会被程序自动清理。
- 关闭进程应发送 SIGINT / SIGTERM，让应用正常停止服务、关闭 Redis 和 SQLite。

## 7. 仅本地开发的测试账号

在项目根目录运行：

```bash
bun run seed
```

脚本创建以下三个账号，密码均为 `123456`，已有账号会跳过：

```text
test1@test.com
test2@test.com
test3@test.com
```

在页面用邮箱和密码登录，无需验证码。**不要在生产执行此脚本**；它固定写入当前工作目录的 `./data.db`，不读取 `DB_PATH`，与主服务可配置数据库路径的行为不同。

## 8. 上线检查

- 首页和阅读页正常，前端资源可访问，`.env`、数据库和源码 URL 返回 404。
- 使用真实邮箱完成发送验证码、注册、登录、退出；生产响应不含 `devCode`。
- 登录 Cookie 的 HttpOnly、SameSite、Secure 与 24 小时有效期符合部署方式。
- 保存、读取、更新与删除本人文章成功；匿名文章请求返回 401，其他账号看不到列表项，猜测 ID 读取 / 修改 / 删除均返回 404。
- 代理后的写请求 Origin 校验正常，`APP_ORIGIN` 与公开源一致。
- 验证未登录点击保存自动打开登录，登录后由用户确认保存；退出、切号与过期不会展示其他账号草稿，匿名本地工作仍可恢复。
- 验证本人已保存文章新增 / 刷新释义后无确认自动更新一次，收藏按最近保存 / 修改优先排列；新草稿不自动上传，失败保留修改，退出或切号不应用旧响应。
- 验证导入 / 导出、草稿恢复及需要 AI 的交互；付费 AI 验证按需手动进行，不纳入默认自动测试。
- 确认数据库备份可用，未提交真实凭证、数据库、依赖、构建产物或临时验证文件。

## 9. 终端用户与文章管理

该工具仅供有数据库文件权限的本机运维人员使用，不通过 HTTP 暴露管理权限，也不读取或显示密码哈希、会话密钥、SMTP / DeepSeek 凭证。文章正文属于私有数据，避免在共享终端、录屏或公开日志中运行查看命令。

在项目根目录运行：

```bash
bun run users
bun run users list
bun run users list example.com
bun run users list "" 2
bun run users show user@example.com
bun run users show 12
bun run users article 123
bun run users delete 12
```

- 无命令进入交互模式，只显示数据库位置和简短命令概览，完整用法通过 `help` / `--help` 查看；`bun users` 与 `bun run users` 等价。支持 `list`、`show`、`article`、`delete`、`help`、`quit`，用户列表每页 50 人。
- 标题、用户 / 文章元信息和正文分层展示，列表、详情、正文、删除警告及错误使用边框；按终端显示宽度换行，不截断长正文或拆开字素。错误同时说明问题与修复方法；删除成功仅显示简短结果和备份路径，不用大面板。
- 界面不添加图标。普通面板不着色，只有 TTY 下的错误、删除警告和成功标签分别使用红、黄、绿；重定向、`NO_COLOR` 或 `TERM=dumb` 禁用颜色。人类可读输出转义 ANSI / OSC、双向及其他控制字符，正文的制表符按四个空格显示；`article` 使用批注已保存的显示语言。
- 数据库优先使用 `--db`，否则使用 `DB_PATH` 或项目根目录 `data.db`；查看只读打开**已存在**的数据库。路径错误不创建空库，结构不兼容时提示先由应用迁移。`--help` 不打开数据库。

```bash
bun run users --db /srv/engnote/data.db list
bun run users --db /srv/engnote/data.db --backup-dir /srv/engnote/private-backups delete 12
```

### 机器可读输出

```bash
bun users list --json
bun users show user@example.com --json
bun users article 123 --json
```

- `--json` 只支持查询及帮助，需要显式命令，不进入交互，也不能用来删除或跳过确认。成功和错误均向标准输出写入一个 JSON 文档，不夹带数据库横幅、边框、颜色或输入提示；成功退出 0，失败退出 1。普通模式的致命错误写入标准错误。Bun 命令运行器自身的日志可能写入标准错误，与应用 JSON 分开。
- 查询返回 `ok`、`command` 及对应的 `users`、`user` / `articles` 或 `article`；列表另含 `page` / `pageSize`。文章 `content` 是完整的当前显示语言文本，不是终端换行或转义后的副本；不输出密码哈希。
- 错误结构为 `{ "ok": false, "error": { "code": "…", "message": "…", "hint": "…" } }`。JSON 保留原数据语义，控制字符与不可见格式字符用合法 JSON 转义，不触发终端控制。
- 启动 JSON 记录包含 `ok`、`event: "ready"`、`url`、`mode`、`pid`、`bunVersion` 和 `hmr`；这只描述服务监听及开发状态，不证明 SMTP / Redis 已通过认证验收，后续运行日志不是管理命令的单文档结果。

### 删除确认与备份

- `delete` 先预览用户与全部关联文章，再要求输入 `DELETE` 加该用户的**实际邮箱**，例如 `DELETE user@example.com`。其他输入、Ctrl+C 或 EOF 取消；没有跳过确认的 `--yes`。确认后删除该用户及其全部文章，其他用户与无作者历史文章不受影响。
- 默认备份目录为数据库同目录的 `.engnote-backups/`，也可指定 `--backup-dir`。新目录使用 700 权限；已存在的目录也必须为私有、非符号链接目录。备份文件独占创建，权限 600，包含整个数据库及密码哈希，应与数据库同等保密，不提交 Git。
- 执行使用 SQLite `BEGIN IMMEDIATE` 事务：重新核对预览中用户身份、文章列表与内容指纹；未变化才在锁定的一致快照上序列化整个数据库，写入并同步备份后再级联删除。备份失败不删除；预览后出现新文章 / 修改 / 账号变化则要求重做确认；任意 SQL 失败回滚全部删除。WAL 中的已提交数据也包含在快照中。
- 删除后的旧会话不能读取或保存文章，相同邮箱重新注册也不能继承旧会话；删除期间已开始的写请求也不能生成孤儿文章。已下载文件、浏览器本地草稿和历史备份不属于服务器文章记录，工具不会远程抹除这些副本。

### 从备份恢复

1. 停止所有访问此 SQLite 文件的应用和管理进程，保留当前数据库及其 WAL / SHM 作为独立恢复前备份，不覆盖唯一副本。
2. 将工具生成的 `.sqlite` 一致快照复制到目标数据库路径，保持 600 权限；旧 WAL / SHM 必须在停服后与旧数据库一起归档，不能让它们和恢复后的主文件混用。
3. 使用 SQLite 的 `PRAGMA quick_check` 验证快照，再用 `bun run users --db 目标路径 list` 只读核对。快照是完整数据库，恢复会回退所有账号和文章，不是仅撤回某一个用户的删除。
4. 恢复前清理 / 轮换 Redis 登录会话，开发内存会话通过停止服务失效，避免已恢复的旧用户 ID 重新匹配历史 Token；然后重启服务并重新登录。恢复与清理须由运维人员显式执行，工具不会自动恢复真实数据。
