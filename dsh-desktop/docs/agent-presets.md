# 内置 Agent 预设清单（Bundled Agent Presets）

所有预设存放在 `assets/agent-presets/<id>/`，由 `scripts/install-minimal-win-preset.js`
的 `installBuiltinPresets()` 安装（**动态扫描** `assets/agent-presets/` 下的预设目录，
`_preset` 共享模块目录除外——所以新增预设只需建目录，无需改注册代码）：

- **Tauri（v0.5.0 起）**：sidecar boot 的 `presets` 步（`dsh-tauri/sidecar/cli.js`）
  在每次启动时对账——local 装进当前生效的 `@deepseek-ai/dsh` 包、WSL 装进 UNC
  agent 包，幂等（mtime/size 一致跳过写盘）。
- **WSL / Linux 另装 dsh**：`scripts/sync-companion-plugins.js` 同步（自动探测
  `DSH_HOME/agent` 与 PATH 上的 dsh 命令，或 `--dsh-package` 指定包目录）。
- 安装目标是内核 `dsh-agent-presets` 的用户预设根 `<DSH_HOME>/.agent-presets/`，
  与内核出厂内置集（shipped set：`standard` / `ptc` / `minimal` / `cordis`）合并
  后出现在「模式列表」中。

目录名即 preset id（`[a-z0-9-]+`），显示名与描述在各目录的 `preset.yml` 中。

## 预设与上游来源

| id | 显示名 | 上游仓库 | 许可证 | 说明 |
|---|---|---|---|---|
| `minimal-win` | 极简模式_win | DSH Desktop 自研 | MIT | `pwsh` + `str_replace_editor` 极简预设 |
| `router-standard` | Router Standard (experimental) | [yjh051108/dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)（preset 子模块 [yjh051108/dsh-router-standard](https://github.com/yjh051108/dsh-router-standard)） | MIT | 官方 API flash 方案：任务感知路由 |
| `anchored-standard` | Anchored Standard (experimental) | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | MIT | 官方 API pro 方案：两阶段锚定 |
| `zero-anchored-standard` | Zero-Anchored Standard (experimental) | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | MIT | 零工具锚定轮变体 |
| `whoami-standard` | Whoami Standard (experimental) | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | MIT | “你是谁”自介锚定变体 |
| `v4-flash-godmode-opencode-go` | Router Flash (opencode-go) | [SheberDavid/v4-flash-godmode-opencode-go](https://github.com/SheberDavid/v4-flash-godmode-opencode-go) | ⚠️ 仓库无 LICENSE 文件（见下方注意） | opencode-go flash：build/fix 内路由 |
| `warmupbetter` | Warmup Better | [0liveiraaa/myDshPresets](https://github.com/0liveiraaa/myDshPresets) | 上游附带 `LICENSE.deepseek-harness`（MIT，DeepSeek 版权） | opencode-go pro：长思考热身 |
| `warmupbetter-replay` | Warmup Better Replay | [0liveiraaa/myDshPresets](https://github.com/0liveiraaa/myDshPresets) | 同上 | 回放热身输出，省 token |

## 同步与更新

- 上游有更新时，把对应 `preset/` 目录（含 `agent.cordis.yml`、`preset.yml` 与
  引用的 `.mjs`/`.json`）覆盖到 `assets/agent-presets/<id>/`，并同步 LICENSE/NOTICE。
- 同步前先读各预设目录内 `README.md`（适配偏差清单）：`zero-anchored-standard` /
  `whoami-standard` 依赖 `../_preset/` 共享模块、`warmupbetter` 系列带桌面工作区锚
  persona，覆盖后需保持这些本地适配不被冲掉。
- 更新后运行 `node scripts/install-minimal-win-preset.js` 验证能安装进 dsh 包，
  并跑 `npm test`（`scripts/test/`）确认预设链路不回归。
- 禁止修改 `agent.cordis.yml` 中引用的相对文件路径，除非同步调整文件名。

## 上游同步状态（2026-08-31 快照核对）

逐仓库克隆核对（yjh051108/dsh-routing-suite、xiaobright/dsh-anchored-standard、
SheberDavid/v4-flash-godmode-opencode-go、0liveiraaa/myDshPresets）的结论：

| 预设 | 本地快照 vs 上游现状 | 核心逻辑一致性 |
|---|---|---|
| `router-standard` | 上游已演进至 v34（native 直调面 + `router-*-v34.mjs` + `gitbash-executor.mjs`）；本地为早期 spec/react 路由快照，未跟进 | `agent.cordis.yml` / `router-bootstrap.mjs` / `router-core.mjs` 与上游现行版均不同（快照即旧版，非本地改动） |
| `anchored-standard` | 上游新增 `context-gate.mjs`、`compaction-epoch` 加 `includeSubagents`；本地为演进前快照 | `.mjs` 有版本差，本地 `agent.cordis.yml` 与本地 `.mjs` 匹配自洽 |
| `zero-anchored-standard` / `whoami-standard` | 上游锚定轮改为「PREPEND 到 next-turn 队列」；本地保留「首条用户消息到达时锚定」快照，whoami 轮为本地 `whoami-turn.mjs` 实现 | 同上，自洽 |
| `v4-flash-godmode-opencode-go` | 上游已宣布停更（建议用原作者 dsh-routing-suite） | `agent.cordis.yml` / `router-*.mjs` 与上游一致；仅 `preset.yml` 描述不同（本地保留功能描述） |
| `warmupbetter` / `warmupbetter-replay` | 上游收紧首轮状态描述（PURE Minimal state），机制不变 | `warmup-bootstrap.mjs` / `warmup-replay.mjs` / `replay.json` 与上游一致；仅 `agent.cordis.yml` persona 加了桌面工作区锚（`{{cwd}}`） |

**`router-standard` 的运行时注入器**以 dsh-super-injector 插件随包内置
（`assets/plugins/dsh-super-injector/`）：即上游 `injector/` 子目录 `src/*.ts` 的
`lib/*.js` 编译产物（版本 0.3.1，上游现 0.3.3；`cordis.patch.yml` 与上游一致）。
上游 0.3.3 把 peerDependencies 的 `@deepseek-ai/schemastery` / `@deepseek-ai/cordis`
改名并新增 `scripts/prepare.mjs`，本地未跟进。

## 许可注意

- `router-standard` 与 `anchored-standard` 系列上游均为 MIT，LICENSE/NOTICE 已随
  每个预设目录分发（`zero-anchored-standard` / `whoami-standard` 的 LICENSE/NOTICE
  复制自上游仓库根，与 `anchored-standard` 同版；NOTICE 采用不含
  `toolchoice-adapter` 段的版本，因本仓库未分发该文件）。
- `router-standard` 上游仓库根 `package.json` 的 `license` 字段笔误为
  `BSD-3-Clause`，以仓库 `LICENSE` 文件（MIT，Copyright (c) 2026 yjh051108）为准；
  其派生的 dsh-super-injector 插件本体许可证为 BSD-3-Clause（插件 `package.json`
  声明），见仓库根 `THIRD_PARTY_NOTICES.md`。
- `v4-flash-godmode-opencode-go` 上游**未提供 LICENSE 文件**：目录内 `NOTICE`
  记录警示与派生关系（作者声明基于 MIT 的 dsh-routing-suite 改编）；对外分发前
  请与作者确认许可，或移除该预设。
- `warmupbetter` / `warmupbetter-replay` 上游仅附 `LICENSE.deepseek-harness`
  （DeepSeek 项目 MIT 文本，非作者本人版权声明；上游 README 声明修改部分按 MIT）；
  对外分发前同样建议与作者确认。
