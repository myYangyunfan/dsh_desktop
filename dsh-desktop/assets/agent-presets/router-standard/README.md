# router-standard — 任务感知路由（官方 API · flash）

- **上游**：[yjh051108/dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)，取自其 `preset/router-standard/` 子目录。
- **许可证**：MIT（目录内 `LICENSE` / `NOTICE` 与上游 `preset/` 一致）。注意：上游仓库根 `package.json` 的 `license` 字段笔误写为 `BSD-3-Clause`，以仓库 `LICENSE` 文件（MIT，Copyright (c) 2026 yjh051108）为准。

## 本地版本状态（2026-08-31 快照核对）

本目录是上游**早期 spec/react 双模式路由版本**的快照：spec（计划优先）用于修复类任务、react（执行者）用于构建类任务，首轮 Minimal 形态、首个工具调用后展开全量 Standard 工具面（`preset.yml` 描述同此）。

上游此后已大幅演进至 v34（native 直调工具面 + router-bootstrap-v34/router-core-v34 + gitbash-executor 等），**本地未跟进**：桌面端内置版本以本地实测行为为准，同步上游新版需重新验证（见 `docs/agent-presets.md` 的「同步与更新」）。

## 相对上游的适配偏差

- `preset.yml`：显示名加 `(experimental)` 后缀、描述改写为本地 spec/react 语义（上游新版描述已变为 native 直调面语义）。
- `agent.cordis.yml` / `router-bootstrap.mjs` / `router-core.mjs`：快照时点的上游内容，未做逻辑改动；上游新版新增的 `router-*-v34.mjs`、`router-bootstrap-v34.selftest.mjs`、`gitbash-executor.mjs` 未引入。

## 运行时注入器

`router-standard` 依赖的运行时注入器以 **dsh-super-injector** 插件形态随安装包内置：`dsh-desktop/assets/plugins/dsh-super-injector/`（上游 `injector/` 子目录 `src/*.ts` 的 `lib/*.js` 编译产物，版本 0.3.1；上游现 0.3.3，`cordis.patch.yml` 与上游一致）。该插件许可证为 BSD-3-Clause（其 `package.json` 声明）。
