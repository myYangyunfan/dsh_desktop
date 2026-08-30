# whoami-standard — 「你是谁」自介锚定变体（官方 API · pro，实验性）

- **上游**：[xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)，取自其 `whoami-standard/` 子目录。
- **许可证**：MIT（目录内 `LICENSE` / `NOTICE` 复制自上游仓库根，与 `anchored-standard` 同源同版）。

## 机制

在空工具面上播种一个固定的「你是谁」自介锚定轮，下一轮用户真实消息以展开后的 Standard 目录继续。

## 本地版本状态（2026-08-31 快照核对）

- **共享模块抽离**：与 `zero-anchored-standard` 相同，`custom-bash.mjs` / `dev-tool-search.mjs` / `instruction-hint.mjs` / `skill-search.mjs` 等抽到 `../_preset/` 共用，上游为每目录自带。
- **锚定轮实现为本地特有**：本目录的 `whoami-turn.mjs`（自介文本轮）为桌面端本地实现，上游目录中不存在；上游新版给 `whoami-standard` 加了 `anchor-turn.mjs`（PREPEND 队列方案），本地未引入。
- 上游目录新增的 `context-gate.mjs` 等未引入。

本地 `agent.cordis.yml` 与本地 `.mjs`（`whoami-turn.mjs` / `zero-tool-bootstrap.mjs` / `../_preset/*`）匹配自洽；同步上游时注意保留本地的 whoami 轮语义。
