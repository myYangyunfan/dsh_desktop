# anchored-standard — 两段式锚定（官方 API · pro）

- **上游**：[xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)，取自其 `preset/` 子目录。
- **许可证**：MIT（目录内 `LICENSE` / `NOTICE` 与上游仓库根一致；`NOTICE` 声明基于 DeepSeek Harness Standard 预设的改编，commit 47f9438）。

## 机制

两段式：首轮以 Minimal 预设的真实工具对（持久 `bash` + `str_replace_editor`）引导、无自动注入的工作区/技能上下文，首个持久工具调用或回复后展开全量 Standard 目录。

## 本地版本状态（2026-08-31 快照核对）

本目录是上游快照，**未跟进**上游后续演进：上游新增了 `context-gate.mjs`（统一注入控制，从 `tool-bootstrap` 拆分职责）并给 `compaction-epoch.mjs` 加了 `includeSubagents` 选项。本地 `agent.cordis.yml` 与本地自带 `.mjs` 匹配自洽（无 context-gate 行）；上游 `NOTICE` 后来追加的 `shared/toolchoice-adapter.mjs` 段落与本目录分发文件集无关，故 `NOTICE` 采用不含该段的版本。

## 相对上游的适配偏差

- 无核心逻辑改动；仅上游新版新增文件（`context-gate.mjs`）与后续 `.mjs` 演进未引入。
- 变体 `zero-anchored-standard` / `whoami-standard` 的共享模块抽到 `../_preset/`（见该两目录 README）。
