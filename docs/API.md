# API 说明

[项目介绍](../README.md) · [架构设计](ARCHITECTURE.md) · [功能说明](FEATURES.md) · [运行与部署](DEPLOYMENT.md) · [更新记录](CHANGELOG.md)

EngNote 有两类请求：浏览器向同源 Bun 后端请求文章、永久词汇和认证接口；AI 请求由浏览器直接发往 DeepSeek，不经本应用后端代理。

## 1. 本地 API 通用约定

实现见 [`backend/server.ts`](../backend/server.ts) 与 [`backend/auth.ts`](../backend/auth.ts)。

- 路径以 `/api/` 开头，正常业务响应为 JSON，包含 `ok`；错误通常为 `{ "ok": false, "error": "说明" }`。
- 有请求体的接口要求 `Content-Type: application/json`，顶层必须为对象。注销不需要请求体。
- 请求体上限 **1 MiB**。字段在服务端校验类型与长度，不依赖浏览器校验。
- API JSON 响应使用 `Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff`。
- 所有文章接口均需登录；列表仅返回本人文章，单篇读取、更新与删除必须属于当前账号。不支持共享或通过文章 ID 读取他人记录。
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
| GET | `/api/entries` | 已登录，仅本人 | 200，`{ ok, entries }` |
| POST | `/api/entries` | 已登录 | 201，`{ ok, id, title }` |
| GET | `/api/entries/:id` | 作者 | 200，`{ ok, entry }` |
| PUT | `/api/entries/:id` | 作者 | 200，`{ ok, id }` |
| DELETE | `/api/entries/:id` | 作者 | 200，`{ ok, id }` |

### 列表与读取

列表按当前会话的作者邮箱在 SQL 查询中隔离，再按 `updated_at DESC, id DESC` 排序；每项为 `{ id, title, created_at, updated_at, can_edit }`，不返回完整正文或双语数据。

前端登录或恢复会话后，待草稿恢复完成，若阅读区与编辑区为空且无其他交互，可用上述列表首项再调用 `GET /api/entries/:id` 自动打开最近修改文章；不新增接口、不跳过账号权限、不写入或推进修改时间。每次登录工作区只尝试一次，用户操作或切号后的迟到读取不得覆盖现状。

`updated_at` 是服务端生成的 Unix 毫秒整数；创建与每次成功更新均推进，同账号同毫秒内连续写入也严格递增。旧文章从原 UTC 创建时间回填（无法解析时为 0），不推测历史修改时间。`created_at` 保持原始创建时间，读取和失败写入不改变时间或顺序，客户端提交的时间字段不生效。

单篇 `entry` 包含 `id`、`title`、`content`、`created_at`、`updated_at`、`definitions`、`formatting`、`can_edit`。查询已限定当前作者，因此有效响应的 `can_edit` 为 `true`；接口不公开 `owner_email`。

- 文章 ID 必须为正安全整数。未登录返回 401；不存在、属于其他账号或无作者的历史记录均返回相同 JSON 404，不泄露记录是否存在。
- 读取文章时保留每条双语批注已保存的 `language`，包括中英混合或全部中文；失效的历史元数据不会阻止正文读取。
- 收藏是账号私有数据。匿名阅读、编辑和当前标签页草稿只使用浏览器状态，不调用文章读取接口；草稿中的 ID、邮箱或权限标志均不能作为服务端授权。

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
| `formatting` | 可省略或为 `null`（无 Word 格式），否则为下述完整的受限格式对象 |

后端不替空标题调用 AI；界面的留空标题总结由浏览器完成，再将有效标题提交到此接口。

### 更新与删除

PUT 请求使用 `{ "content": "完整正文", "definitions": [] }`，正文规则与创建一致，**保留原标题**。

- 显式提供 `definitions` 时完整校验；传 `[]` 会清空双语元数据，但不会主动删除正文里的英文批注。
- 省略 `definitions` 时保留仍匹配新正文的旧元数据，兼容旧客户端；已删除或改写批注的旧中文会被丢弃。
- 省略 `formatting` 时按正文差异映射旧格式；显式传 `null` 清空格式，传格式对象则完整校验。正文、批注与格式在同一次 SQL 写入中保存，非法格式返回 400 且不更新任何字段。
- 已保存文章在新增 / 刷新释义任务实际应用修改后，浏览器调用同一个 PUT 更新原记录一次，不弹保存确认；提交完整正文、逐条语言、双语 / 音标和 Word 格式。首次保存仍需用户确认 POST；自动保存不创建文章、不调用标题 AI，也不因阅读切换语言而写入。
- DELETE 无需请求体，删除整篇记录而不是某个网页分页。
- 未登录返回 401；读取、更新或删除他人文章、无作者历史文章统一返回 404。客户端不能通过提交 `owner_email` 认领文章；创建始终绑定当前会话作者。

### 双语批注格式

```ts
type DefinitionView = {
  start: number;
  english: string;
  chinese: string;
  language: "en" | "zh";
  term?: string;
  britishIPA?: string;
  mode?: "general" | "context" | "article";
  contextKey?: string;
};
```

- `start` 是正文中 `『` 的全局 **UTF-16 偏移**，不是网页页码或 Unicode 码点序号；必须唯一且精确匹配对应 `『english』`。
- 中文不能为空，最多 600 个 UTF-16 单元，必须含汉字且不含换行或 `『』` 标记。
- 服务端保留每条有效的 `language: "en" | "zh"` 并原样返回，不统一改成英文。兼容旧客户端省略 `language`，仅此时默认 `en`；显式传非法值则返回 400。显式保存会更新文章的初始显示选择；读者平时点击切换仅记录在本标签页，不自动发送写请求，也不自动修改服务端文章。
- 可选 `term` 保存生成时的英文查询词组，用于缓存复用和主动刷新；不合法的查询身份会被忽略，不猜测旧批注来源。
- 可选 `britishIPA` 独立校验：斜线包围、最多 160 UTF-16 单元、受限 IPA 字符；无效值忽略，不丢弃有效双语释义，不自动请求补齐。显示 / 导出时拼接一次，不写入正文、偏移或分页计数；每种释义的原 600 单元技术上限不变。
- 可选 `mode` 只接受三种已知值；`contextKey` 接受 `context:` / `article:` 加 64 位小写十六进制 SHA-256。只作为查询复用身份，不存语境原文，不作为服务端权限依据。未知 / 非法附加字段丢弃，旧记录无需迁移。
- 一组显式提供的双语元数据只要有一项无效，就返回 400，不部分保存正文与数据。

### Word 正文格式

`formatting` 为 `{ version: 1, runs, paragraphs }`：

- `runs` 是按偏移排序、互不重叠的 `{start,end,style}`；`style` 仅接受字体名、字号、粗斜体、下划线、删除线、六位十六进制颜色 / 高亮（`none` 清除高亮）、上下标和字距，不能含任意 CSS、HTML 或 URL。
- `paragraphs` 包含完整正文以 `\n\n` 划分的每个段落，逐项 `{start,end,style,marker?,cell?}` 必须精确匹配正文范围。支持受限对齐、段间距、行距、缩进、标题、分页前标记、列表文字和表格单元格元数据。
- 偏移均为 UTF-16，字体范围不能拆开代理对。表格必须连续、顺序正确、无重叠单元格，同一单元格元数据一致，并受行数 / 合并跨度预算限制。
- 序列化 JSON 最多 256000 个 UTF-16 单元、6000 个字体范围、3000 个段落；总请求仍受 1 MiB 限制。服务端校验数值、颜色与字体，未知字段不进入规范化结果。
- 旧记录自动追加可空 `formatting` 列；缺少 / 损坏格式读取为 `null`，不阻止原有正文读取。

文章表结构和无损迁移见[架构设计](ARCHITECTURE.md)。

### 永久词汇清单接口

| 方法 | 路径 | 权限 | 成功响应 |
| --- | --- | --- | --- |
| GET | `/api/vocabulary?q=&offset=0&limit=100` | 当前账号，仅本人 | 200，`{ ok, total, items }` |
| POST | `/api/vocabulary` | 当前账号，仅本人 | 200，`{ ok: true }` |

GET 的 `q` 最多 64 个 UTF-16 单元，按词条 / 英文释义不区分大小写的子串或中文释义子串筛选；`offset` 为非负安全整数，`limit` 为 1–100，默认分别为 0 / 100。`total` 是匹配总数，`items` 按 `updated_at DESC, term_key` 排序；每项只返回下面的规范字段及 `updated_at`，不公开用户 ID、邮箱或来源文章正文。读取不会收录或更新时间。

POST 请求：

```json
{
  "items": [
    { "term": "fox", "english": "a wild animal", "chinese": "一种野生动物", "britishIPA": "/fɒks/", "language": "en" }
  ]
}
```

- `items` 为最多 500 项的数组；每项 `term` 是 1–3000 单元英文单词 / 短语，允许词内连字符和撇号，规范化空白及弯引号。`english` 为有效英文释义、最多 600 单元；`chinese` 可省略以兼容旧英文批注，提供时必须是含汉字的有效释义、最多 600 单元。释义不接纳控制字符或 `『』`。`language` 必须是 `en` / `zh`，无中文时规范为 `en`；可选 `britishIPA` 必须通过音标校验。
- 以**服务端当前用户 ID + 规范词条**唯一去重，客户端提交的用户身份及未知字段无效。普通大小写合并，大写缩写独立；例如 `Fox` / `fox` 相同，`US` / `us` 不同。不按词形或语义合并。
- 新内容覆盖同词旧释义，更新时间至少比原记录大 1ms；完全相同的释义 / 音标不写入、不推进时间，也不因显示语言选择而重排。清单内点击切换语言仅发生在浏览器内存，不调用 POST。
- 每个 POST 在事务内原子校验全部条目并写入；任意无效项返回 400，不部分写入。匿名返回 401，写入时再次核对原用户 ID，防止账号删除或同邮箱重注册期间的在途请求写入新账号。沿用同源来源校验、1 MiB 请求上限及 405 方法限制。
- 登录后生成 / 刷新成功释义的前端会单独调用此接口（含缓存生成、部分成功）；匿名不请求、不在登录后自动补传。自动收录失败保留文章批注，不自动重试；用户可明确点击「收录本篇释义」，每批最多 500 条，已成功批次不会因后续失败而回滚。
- 文章 POST / PUT 在同一事务中收录其有效释义，词汇写入失败时文章写入也回滚。首次创建词汇表时一次性汇入已有、能匹配账号的本人文章；不汇入匿名浏览器草稿、无作者历史文章或 AI 查询缓存。
- 词汇记录独立于文章和缓存，不随删除文章 / 批注或清除临时缓存而删除；本机删除用户时，经预览、备份和事务复核后与账号一并删除。不提供跨账号查看或公开清单。

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
- 会话绑定 `{userId,email}` 并核对当前数据库用户，删除后立即失去授权；同邮箱新注册账号不能复用旧会话。旧版仅邮箱会话升级后需要重新登录。文章 SQL 和永久词汇写事务再次核对原用户 ID，拒绝删除期间的在途写入。
- 验证码和会话存 Redis。仅非生产模式允许 Redis 不可用时回退进程内存；生产存储不可用会使认证相关请求失败，不提供静默降级。
- 仅**非生产且未配置 `SMTP_HOST`**时，不实际发信，在日志和响应中提供开发验证码。已配置 SMTP 但发送失败时返回失败，生产不会暴露 `devCode`。
- 发信冷却、验证码或注册校验失败通常为 400；登录失败为 401。具体错误文字保留在 `error` 中，由前端按界面语言转换已知提示。

邮件样式与内容见[功能说明](FEATURES.md)；SMTP 配置见[运行与部署](DEPLOYMENT.md)。

## 4. 错误状态

| 状态 | 典型情况 |
| --- | --- |
| 400 | JSON 格式、字段类型 / 长度、标题、正文、批注、验证码或注册校验无效 |
| 401 | 未登录、会话过期、登录失败或登录尝试受限 |
| 403 | 跨站写请求、Origin 不匹配 |
| 404 | API 路由不存在，或文章不存在 / 不属于当前账号 / 缺少作者 |
| 405 | 方法不支持，附带 `Allow` |
| 413 | 请求体超过 Bun 的 1 MiB 限制；底层拒绝响应不保证使用业务 JSON 格式 |
| 415 | 需要请求体的接口未使用 `application/json` |
| 500 | 其他服务端错误，例如生产认证存储不可用；客户端获得通用错误，不暴露内部异常 |

## 5. DeepSeek 请求约定

实现见 [`deepseekClient.ts`](../public/ts/ai/deepseekClient.ts)、[`dictionary.ts`](../public/ts/ai/dictionary.ts)、[`format.ts`](../public/ts/editor/format.ts) 和 [`articleTitle.ts`](../public/ts/articles/articleTitle.ts)。

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
      "content": "Only tidy paragraph breaks. Preserve all words, punctuation, capitalization, tabs and horizontal spacing. Output only the text; no rewriting, markdown or explanations."
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
| 当前页段落整理 | 仅当前页正文，不含 Word 格式数据 | 纯文本，仅接受通过原词 / 标点 / 空白完整性校验的段落变更；`min(8192, max(512, ceil(当前页长度 × 1.2)))` |
| 双语释义 | 默认局部上下文；单纯模式只含词条，参考模式携带原词、正文 UTF-16 位置及语境身份，附局部语境或完整正文 | JSON object；每批最多 12 个不同词组，预算为 `min(4096, 160 + 128 × 词条数 + ceil(词组总字符数 / 2))` |
| 文章标题 | 整篇正文，排除已有英文批注 | JSON object；单次 128 输出 token，必要时最多一次短标题修正 |

- JSON 任务追加 `response_format: { "type": "json_object" }`，释义返回 `{"definitions":[{"term":"fox","britishIPA":"/fɒks/","english":"a wild animal","chinese":"野生动物"}]}`，兼容旧版 JSON 数组及无音标结果。三种模式均要求所选词形、对应语境的英式 IPA；中英文共用一份音标。
- 单纯模式输入仍为词条数组。参考模式输入 `{mode, terms:[{term:不透明身份, text:原词, position:正文UTF16位置, length:所选原文长度, contextStart?:局部语境起始偏移, context?:局部语境}], article?:完整正文}`；响应 `term` 必须原样回传不透明身份，防止同词不同位置混用。正文均移除已有批注。
- 局部语境前后各最多 600 Unicode 码点；全文含全部分页，最多 24,000 UTF-16 单元，每批正文只附一次。参考模式序列化输入每批最多 32,000 单元，最多 12 个身份；单词组最多 3000 单元。发请求前检查，不静默截断或切换模式；全文多批重复可能明显增加费用。
- 缓存按模式、词条、位置和语境 SHA-256 指纹隔离，最多 256 条 / 7 天，不保存参考原文；已有批注也必须匹配模式与指纹才复用。切换设置只影响后续请求，不请求 AI 或修改已有批注。
- 释义提示词要求同一响应包含英文与简体中文，英文最多 20 个单词、中文最多 20 个字符；解析时保留有效的较长旧结果，每种语言技术上限 600 字符，不静默截断。
- 单次请求超时 90 秒，可与任务的中止信号组合。读取 `choices[0].message.content`、`finish_reason` 和 `usage`，校验非空与完整性。
- `finish_reason=length` 会报告截断；释义层仅恢复完整且验证通过的条目，不猜测内容、不自动付费重试。其他失败也不自动重试或切换模型。
- `usage` 只记录接口报告值，没有报告的请求标为未知，不当作零成本、不推算账单。
- Word 导入 / 导出、界面语言切换、批注中英文切换和缓存命中均不调用此接口，也没有对应的后端上传 / 导出路由。

参数依据：[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode)、[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion)。
