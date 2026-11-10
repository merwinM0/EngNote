[中文](README.md) | English

# EngNote

**Make reading English a little easier.**

EngNote is an English reading app built with HTML, TypeScript, CSS and Bun. Paste an article or import Word, tidy paragraphs with AI, add bilingual definitions, and save articles to a private account collection.

![EngNote home](./home.png)

## Highlights

- Notebook-style reading, tape notes and selectable paper textures on desktop and mobile.
- Paste, live editing, local `.docx` import with supported body fonts, font effects, paragraphs, lists and tables, lossless pagination (up to 5000 Unicode characters per page), and tab-local draft recovery.
- DeepSeek paragraph-only tidying without rewriting words or punctuation, and paired English/Chinese definitions sharing British IPA, with simple, local-context or full-article modes in the toolbar (local context by default) and hover descriptions; switch a note's language without another request. Saving and reopening retain each note's choice, including mixed-language articles.
- Bounded undo/redo and shortcuts for text, AI formatting and notes; note deletion uses two-step confirmation for one target at a time and stays active after removal. Importing, clearing and switching articles isolate history.
- Bounded dictionary cache, explicit refresh and reported AI usage.
- Email accounts, automatic updates after adding or refreshing definitions in an already-saved article without another confirmation, a draggable/zoomable collection ordered by latest save or edit, and local white-paper Word export using each note's displayed language while retaining supported source fonts and layout.
- English UI by default with a Chinese switch; UI and definition languages are independent.
- Local terminal administration: inspect users, article lists and full contents; delete a user and all their articles only after explicit confirmation and a database backup. No public admin API.

> Saved articles are account-private: only their owner can view, update or delete them. Sharing is not supported. Reading, editing, importing, using your own AI key and Word export require no account; working drafts stay in this browser tab. Saving a new article still requires login and confirmation; new drafts are never uploaded automatically. When logged in with a verified saved article selected, completing definitions automatically updates that article. Your confirmed DeepSeek key stays in this tab; AI requests go directly to DeepSeek, never through this app's backend.

## Quick start

Requires Bun **1.3.14** (verified). SMTP and Redis are optional locally, but required for production email verification and sessions.

```bash
bun install --frozen-lockfile
test -f .env || cp .env.example .env
bun dev
```

Open <http://localhost:3000>, then “Start a new page” to read at `/index.html`. The server listens on `0.0.0.0` by default for LAN access; use `HOST=127.0.0.1` for local-only access. Default ports: development 3000, production 80; `PORT` overrides them.

The home page's “amnual” opens a five-step simulated guide without real AI requests, keys or article writes.

## Stack

Semantic HTML, native DOM TypeScript and CSS (no UI framework); Bun HTML bundling/HMR; DeepSeek `deepseek-chat`; SQLite, Argon2id, Redis sessions/verification; Nodemailer SMTP; `fflate` local Word import/export.

## Commands

| Command | Purpose |
| --- | --- |
| `bun dev` | Source development with frontend HMR and backend restart |
| `bun start` | Production source server, HMR disabled |
| `bun run typecheck` | Browser and backend TypeScript checks |
| `bun test` | Unit and API tests |
| `bun run build` | Frontend inspection output in `dist/`, not a full deployment |
| `bun run users` | Inspect users/articles and confirm backed-up cascade deletion; [commands and recovery](docs/DEPLOYMENT.md#9-终端用户与文章管理) |

Deploy the Bun backend too, not just `dist/`. See [deployment](docs/DEPLOYMENT.md).

See [Word support and local font fallback](docs/FEATURES.md#word-导入). Images, floating objects, headers and footers are not imported; browser pagination is not identical to Word's print pagination.

## Documentation

- [Changelog](docs/CHANGELOG.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Features](docs/FEATURES.md)
- [API](docs/API.md)
- [Deployment and local test accounts](docs/DEPLOYMENT.md)
- [Roadmap](ROADMAP.md)
- [Development conventions](AGENTS.md)
