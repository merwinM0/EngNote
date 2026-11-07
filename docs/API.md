# API 说明

[项目介绍](../README.md) · [架构设计](ARCHITECTURE.md) · [功能说明](FEATURES.md) · [运行与部署](DEPLOYMENT.md) · [更新记录](../CHANGELOG.md)

EngNote 有两类请求：浏览器向同源 Bun 后端请求文章和认证接口；AI 请求由浏览器直接发往 DeepSeek，不经本应用后端代理。

## 1. 本地 API 通用约定

实现见 [`backend/server.ts`](../backend/server.ts) 与 [`backend/auth.ts`](../backend/auth.ts)。

- 路径以 `/api/` 开头，正常业务响应为 JSON，包含 `ok`；错误通常为 `{ "ok": false, "error": "说明" }`。
- 有请求体的接口要求 `Content-Type: application/json`，顶层必须为对象。注销不需要请求体。
- 请求体上限 **1 MiB**。字段在服务端校验类型与长度，不依赖浏览器校验。
- API JSON 响应使用 `Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff`。
- 文章列表和读取公开；创建文章需要登录，更新和删除还必须是作者。
- 非 GET / HEAD / OPTIONS 请求会检查来源：拒绝 `Sec-Fetch-Site: cross-site`，存在 `Origin` 时必须与 `APP_ORIGIN` 或请求自身源一致。未配置跨域开放；每条路由仍独立限制允许的方法。
- 未匹配的 API 返回 JSON 404，不返回首页 HTML；方法不支持时返回 405 及 `Allow`。

### 会话

登录成功设置 Cookie，不在 JSON 中暴露 Token：

```text
er_session=<token>; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400
```

HTTPS 请求或 `COOKIE_SECURE=true` 时追加 `Secure`。浏览器自动携带同源 Cookie；后端会话 TTL 同为 86400 秒，不因访问续期。服务端仍兼容读取 Bearer Token，但当前浏览器流程不再存储或接收旧式登录 Token，API 客户端应使用 Cookie。

## 2. 文章接口

| 方法 | 路径 | 权限 | 成功响应 |
| --- | --- | --- | --- |
| GET | `/api/entries` | 公开 | 200，`{ ok, entries }` |
| POST | `/api/entries` | 已登录 | 201，`{ ok, id, title }` |
| GET | `/api/entries/:id` | 公开 | 200，`{ ok, entry }` |
| PUT | `/api/entries/:id` | 作者 | 200，`{ ok, id }` |
| DELETE | `/api/entries/:id` | 作者 | 200，`{ ok, id }` |

### 列表与读取

列表按 ID 倒序，每项为 `{ id, title, created_at, can_edit }`，不返回完整正文或双语数据。

单篇 `entry` 包含 `id`、`title`、`content`、`created_at`、`definitions`、`can_edit`。`can_edit` 由当前会话和数据库作者计算，接口不公开 `owner_email`。

- 文章 ID 必须为正安全整数；记录不存在返回 404。
- 读取文章时双语数据规范化为英文默认显示；失效的历史元数据不会阻止正文读取。
- 收藏是公开书架；未登录用户也能读取文章，不应保存隐私内容。

### 创建文章

```json
{
  "title": "A Fox",
  "content": "A fox『a wild animal』 reads.",
  "definitions": [
    {
      "start": 5,
      "english": "a wild animal",
      "chinese": "一种野生动物",
      "language": "en",
      "term": "fox"
    }
  ]
}
```

| 字段 | 要求 |
| --- | --- |
| `title` | 字符串，去除首尾空白后 1–20 个 UTF-16 单元，不含汉字 |
| `content` | 完整正文字符串，1–100000 个 UTF-16 单元，不能全为空白；不裁去首尾空白 |
| `definitions` | 可省略，默认为 `[]`；提供时必须是全部有效的双语批注数组 |

后端不替空标题调用 AI；界面的留空标题总结由浏览器完成，再将有效标题提交到此接口。

### 更新与删除

PUT 请求使用 `{ "content": "完整正文", "definitions": [] }`，正文规则与创建一致，**保留原标题**。

- 显式提供 `definitions` 时完整校验；传 `[]` 会清空双语元数据，但不会主动删除正文里的英文批注。
- 省略 `definitions` 时保留仍匹配新正文的旧元数据，兼容旧客户端；已删除或改写批注的旧中文会被丢弃。
- DELETE 无需请求体，删除整篇记录而不是某个网页分页。
- 未登录返回 401；更新或删除他人文章、无作者历史文章返回 403。客户端不能通过提交 `owner_email` 认领文章。

### 双语批注格式

```ts
type DefinitionView = {
  start: number;
  english: string;
  chinese: string;
  language: "en" | "zh";
  term?: string;
};
```

- `start` 是正文中 `『` 的全局 **UTF-16 偏移**，不是网页页码或 Unicode 码点序号；必须唯一且精确匹配对应 `『english』`。
- 中文不能为空，最多 600 个 UTF-16 单元，必须含汉字且不含换行或 `『』` 标记。
- 服务端将 `language` 统一规范化为 `en` 后保存 / 返回；每位读者自己的显示选择属于浏览器状态，不修改共享正文。
- 可选 `term` 保存生成时的英文查询词组，用于缓存复用和主动刷新；不合法的查询身份会被忽略，不猜测旧批注来源。
- 一组显式提供的双语元数据只要有一项无效，就返回 400，不部分保存正文与数据。

文章表结构和无损迁移见[架构设计](ARCHITECTURE.md)。

## 3. 认证接口

| 方法 | 路径 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| POST | `/api/auth/send-code` | `{ email }` | 200，`{ ok: true }`；仅本地开发可能附带 `devCode` |
| POST | `/api/auth/register` | `{ email, password, code }` | 201，`{ ok: true }` |
| POST | `/api/auth/login` | `{ email, password }` | 200，`{ ok: true, email }`，设置会话 Cookie |
| POST | `/api/auth/logout` | 无需请求体 | 200，`{ ok: true }`，失效服务端会话并清空 Cookie |
| GET | `/api/auth/me` | 无 | 200，`{ ok: true, email }`；无有效会话时 401 |

### 验证与期限

- 邮箱会去除首尾空白并转为小写，长度上限 254，必须符合邮箱格式。
- 注册密码为 6–128 字符，不裁去密码中的空白；密码经 Argon2id 慢哈希入库。
- 注册验证码为六位数字，有效期 **300 秒**；同邮箱发信冷却 **60 秒**，验证码验证失败达到 5 次后需重新获取。
- 注册成功会消费验证码，但不自动登录；客户端随后执行登录。
- 登录尝试达到 10 次后暂时拒绝，失败提示等待 15 分钟；成功登录清除尝试计数。
- 验证码和会话存 Redis。仅非生产模式允许 Redis 不可用时回退进程内存；生产存储不可用会使认证相关请求失败，不提供静默降级。
- 仅**非生产且未配置 `SMTP_HOST`**时，不实际发信，在日志和响应中提供开发验证码。已配置 SMTP 但发送失败时返回失败，生产不会暴露 `devCode`。
- 发信冷却、验证码或注册校验失败通常为 400；登录失败为 401。具体错误文字保留在 `error` 中，由前端按界面语言转换已知提示。

邮件样式与内容见[功能说明](FEATURES.md)；SMTP 配置见[运行与部署](DEPLOYMENT.md)。

## 4. 错误状态

| 状态 | 典型情况 |
| --- | --- |
| 400 | JSON 格式、字段类型 / 长度、标题、正文、批注、验证码或注册校验无效 |
| 401 | 未登录、会话过期、登录失败或登录尝试受限 |
| 403 | 跨站写请求、Origin 不匹配、非作者修改 / 删除 |
| 404 | API 路由或文章不存在 |
| 405 | 方法不支持，附带 `Allow` |
| 413 | 请求体超过 Bun 的 1 MiB 限制；底层拒绝响应不保证使用业务 JSON 格式 |
| 415 | 需要请求体的接口未使用 `application/json` |
| 500 | 其他服务端错误，例如生产认证存储不可用；客户端获得通用错误，不暴露内部异常 |

## 5. DeepSeek 请求约定

实现见 [`deepseekClient.ts`](../public/ts/deepseekClient.ts)、[`dictionary.ts`](../public/ts/dictionary.ts)、[`format.ts`](../public/ts/format.ts) 和 [`articleTitle.ts`](../public/ts/articleTitle.ts)。

```text
POST https://api.deepseek.com/chat/completions
Content-Type: application/json
Authorization: Bearer <当前标签页已确认的 API_KEY>
```

整理请求示例，提示词仅用于说明结构：

```json
{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "You format English text. Preserve every fact, number and word. Output only the formatted text; no markdown or explanations."
    },
    {
      "role": "user",
      "content": "<待整理的当前页英文原文>"
    }
  ],
  "temperature": 0.3,
  "thinking": { "type": "disabled" },
  "stream": false,
  "max_tokens": 2048
}
```

### 各任务输入与预算

| 任务 | 输入 | 输出与预算 |
| --- | --- | --- |
| 当前页排版 | 仅当前页正文 | 纯文本；`min(4096, max(512, ceil(当前页长度 × 1.2)))` |
| 双语释义 | 去重后的查询词表，无整篇上下文 | JSON object；每批最多 12 个不同词组，预算为 `min(4096, 160 + 128 × 词条数 + ceil(词组总字符数 / 2))` |
| 文章标题 | 整篇正文，排除已有英文批注 | JSON object；单次 128 输出 token，必要时最多一次短标题修正 |

- JSON 任务追加 `response_format: { "type": "json_object" }`，释义返回 `{"definitions":[{"term":"fox","english":"a wild animal","chinese":"野生动物"}]}`，兼容旧版 JSON 数组。
- 释义提示词要求同一响应包含英文与简体中文，英文最多 20 个单词、中文最多 20 个字符；解析时保留有效的较长旧结果，每种语言技术上限 600 字符，不静默截断。
- 单次请求超时 90 秒，可与任务的中止信号组合。读取 `choices[0].message.content`、`finish_reason` 和 `usage`，校验非空与完整性。
- `finish_reason=length` 会报告截断；释义层仅恢复完整且验证通过的条目，不猜测内容、不自动付费重试。其他失败也不自动重试或切换模型。
- `usage` 只记录接口报告值，没有报告的请求标为未知，不当作零成本、不推算账单。
- Word 导入 / 导出、界面语言切换、批注中英文切换和缓存命中均不调用此接口，也没有对应的后端上传 / 导出路由。

参数依据：[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode)、[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion)。
