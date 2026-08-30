# zero-anchored-standard — 零工具锚定轮变体（官方 API · pro）

- **上游**：[xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)，取自其 `zero-anchored-standard/` 子目录。
- **许可证**：MIT（目录内 `LICENSE` / `NOTICE` 复制自上游仓库根，与 `anchored-standard` 同源同版）。

## 机制

在空工具面上注入一个固定文本的零工具锚定轮（作为首条用户消息），下一轮起展开全量 Standard 工具目录。

## 本地版本状态（2026-08-31 快照核对）

- **共享模块抽离**：`custom-bash.mjs` / `dev-tool-search.mjs` / `instruction-hint.mjs` / `skill-search.mjs` / `compaction-epoch.mjs` 不在本目录，抽到 `../_preset/` 由本预设与 `whoami-standard` 共用（`agent.cordis.yml` 以 `../_preset/*.mjs` 相对路径引用；`_preset` 以 `_` 开头，预设发现按 id 规则跳过它）。上游每个预设目录自带这些文件。
- **锚定轮实现**：本地 `anchor-turn.mjs` 为「首条用户消息到达时锚定」的快照实现；上游新版改为「把锚定轮 PREPEND 到 next-turn 队列、先于真实消息被消费」的方案，本地未跟进（本地 `agent.cordis.yml` 与本地 `.mjs` 匹配自洽）。
- 上游目录新增的 `context-gate.mjs` 等未引入。

同步上游时注意保持 `../_preset/` 引用路径与共享模块的兼容（见 `docs/agent-presets.md`「同步与更新」）。
