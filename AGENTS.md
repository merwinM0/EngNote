# EngNote 工作约定

## 界面进度条约定

- 后续新增或修改的进度条统一采用 AI 为文章起标题时的「透明胶带逐渐贴上、前缘轻微翘起」样式，复用 `public/css/progress.css`，不另建普通细线条或其他视觉样式。
- 共用结构为 `.tape-progress` → `.tape-progress-track` → `.tape-progress-reveal` → `.tape.tape-progress-strip`。未知进度使用默认循环；已知进度使用 `data-progress="determinate"` 与 `--progress` 百分比，并提供实际进度的无障碍语义。
- 保留减少动态效果与强制颜色模式支持；未知耗时任务不得伪造完成百分比。

## Git 提交

- 每轮修改完成并通过相关验证后，主动创建一次 Git 提交，无需用户再次提醒。
- 提交说明使用中文，准确概括本轮改动；按完整需求提交，不为单个文件或中间步骤创建零碎提交。
- 仅提交任务相关改动，不覆盖、撤销或擅自提交无关的用户修改；用户明确要求提交当前全部改动时按其指定范围执行。
- 不提交密钥、`.env`、SQLite 数据库、`node_modules`、构建产物或临时验证文件。
- 代码改动后运行 `bun run typecheck`、`bun test`、`bun run build` 及相关专项检查；提交前执行 `git diff --check`。
- 如验证或提交失败，说明原因，不把失败的操作报告为已完成。
