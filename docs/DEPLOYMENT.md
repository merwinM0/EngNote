# 运行与部署

[项目介绍](../README.md) · [架构设计](ARCHITECTURE.md) · [功能说明](FEATURES.md) · [API 说明](API.md) · [更新记录](../CHANGELOG.md)

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
- 默认 `HOST=0.0.0.0`，启动日志显示本机及局域网地址。同网段手机可通过 `http://本机局域网IP:3000` 访问，需放行防火墙；只供本机使用则设 `HOST=127.0.0.1`。
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
- 测试覆盖正文规则、无损分页、编辑边界、Word 解压与导出、双语释义与缓存、AI 请求预算与用量、语言偏好、白板几何、邮件模板、API 及数据库迁移。
- 接口测试使用隔离数据库，不应操作真实 SMTP、Redis 或用户数据；不要以真实发信、付费 AI 请求替代自动化测试。
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
- Redis 保存有期限的验证码、尝试计数和会话。服务重启后的会话行为取决于 Redis 是否保留数据；开发内存降级一定丢失登录状态。
- 启动自动为旧文章表追加作者与双语列，不猜测历史作者。升级前先备份，历史无作者文章保持公开只读，可另存副本。
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
- 保存、更新与删除本人文章成功，其他用户不能修改；确认公开书架符合使用场景。
- 代理后的写请求 Origin 校验正常，`APP_ORIGIN` 与公开源一致。
- 验证导入 / 导出、草稿恢复及需要 AI 的交互；付费 AI 验证按需手动进行，不纳入默认自动测试。
- 确认数据库备份可用，未提交真实凭证、数据库、依赖、构建产物或临时验证文件。
