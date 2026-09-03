# 内置 Agent 预设清单（Bundled Agent Presets）

所有预设存放在 `assets/agent-presets/<id>/`，由 `scripts/install-minimal-win-preset.js`
的 `installBuiltinPresets()` 安装（**动态扫描** `assets/agent-presets/` 下的预设目录，
`_preset` 共享模块目录除外——所以新增预设只需建目录，无需改注册代码）：

- **Tauri（v0.5.0 起）**：sidecar boot 的 `presets` 步（`dsh-tauri/sidecar/cli.js:749-763`）
  在每次启动时对账——local 与 WSL 都以 **effective DSH home**（WSL 为 UNC home）
  为入参，落 `<DSH_HOME>/.agent-presets/`；幂等（size + mtime 一致跳过写盘）。
- **WSL / Linux 另装 dsh**：`scripts/sync-companion-plugins.js` 同步（自动探测
  `DSH_HOME/agent` 与 PATH 上的 dsh 命令，或 `--dsh-package` 指定包目录）。
- 安装目标是内核 `dsh-agent-presets` 的用户预设根 `<DSH_HOME>/.agent-presets/`，
  与内核出厂内置集（shipped set：`standard` / `ptc` / `minimal` / `cordis`）合并
  后出现在「模式列表」中。

## 分发链路（源 → 打包 → 落点 → UI）

| 环 | 位置 | 说明 |
|---|---|---|
| 1 源 | `dsh-desktop/assets/agent-presets/<id>/` | 随仓库维护，含 `agent.cordis.yml` / `preset.yml` / 引用的 `.mjs` 与资源子目录 |
| 2 打包 | `dsh-tauri/scripts/stage-payload.sh:88`（`mirror_dir "$SRC/assets" "$DST/assets"`） | 整个 `assets/` 递归镜像（robocopy `/MIR`），非白名单——预设目录不会漏 |
| 3 枚举 | `dsh-desktop/scripts/lib/preset-files.js` | **全仓唯一**槽/文件枚举实现：`listPresetSlots`（槽名升序）+ `listPresetSlotFiles`（递归到底、返回正斜杠相对路径、跳过 `node_modules`、不跟随软链）+ `slotFileAt`。安装器与自愈共用同一份，避免「一处递归一处只拷顶层」的分叉 |
| 4 写入（对账到源） | boot `presets` 步 → `installBuiltinPresets(home)`（`dsh-tauri/sidecar/cli.js:749-763` → `scripts/install-minimal-win-preset.js`） | 语义是「强制与源一致」：内容不一致的文件会被覆盖，用于传播上游预设更新 |
| 5 写入（兜底补写） | boot `repair` 步 → `healBuiltinPresets()`（`scripts/integration/index.js:110-119` → `scripts/lib/preset-heal.js`） | 语义是「**只补缺、绝不动已有**」：目标缺失才原子写（`writeFileAtomic` + 备份 + mtime 对齐源），零字节残留先备份再重写；源不可用 / 目录不可写 / 单文件读失败全部容忍记数，不阻断启动 |
| 6 发现 | 内核 `@deepseek-ai/dsh-agent-presets` `lib/index.js:195`（`USER_PRESET_DIR='.agent-presets'`）、`:1300-1310`（`resolvedRoots` = 出厂集 + `config.roots` + `dshHomePath('.agent-presets')`） | **只有这三类根会被扫描**；写进别的目录（如 payload 内的 dsh 包目录）等于没写 |
| 7 UI | 内核 web 的「模式列表」经上述 `list()` 取预设 | 客户端不另设预设清单，也不读 `assets/` |

### issue #174：内置预设不出现在客户端

v0.5.6 的 `6e38c3b5` 把 `installBuiltinPresets()` 的参数语义从「dsh 包目录」改成
「DSH home」，安装器 / `sync-companion-plugins` / 相应测试都跟了，唯独 sidecar boot
`presets` 步的调用点没跟——仍传 `installedDshPackageDir()`，8 个内置预设被安静地写进
`<payload>/node_modules/@deepseek-ai/dsh/.agent-presets`（没有任何 root 扫那里）。
两层巧合让故障不报错：payload 在 currentUser 安装下可写（写入成功、日志 `boot 步骤
presets OK`），且客户端仍能回落到出厂四件套。修复 = 调用点改传 `home`（`dsh-tauri/sidecar/cli.js:749-763`）
+ boot `repair` 步的「只补不动」兜底网（`scripts/lib/preset-heal.js`，覆盖已经写歪的存量
安装，下次 boot 即在正确落点补齐）；旧落点残留由 `detectLegacyPresetCopy()` 记诊断行
（无人读取，可手动删除）。

顺带收口的一个同源隐患：安装器与自愈原先各写一份「只拷顶层文件」的枚举，预设若携带
子目录资源（内核出厂 `cordis` 预设即带 `skills/`，composition 以 `!!js new URL('skills/', baseUrl)`
引用**目录**）会静默丢文件且不报错——现统一为 `preset-files.js` 的递归枚举。

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
- 更新后运行 `node scripts/install-minimal-win-preset.js` 验证能装进用户预设根
  （`<DSH_HOME>/.agent-presets/`），并跑 `npm test`（`scripts/test/`）确认预设链路
  不回归——至少含 `unit-preset-heal.test.js`（heal 只补不动 / 递归子目录 / 与安装器
  落地集合对账）、`ta14-upgrade-dirty-home.test.js`、`dsh-tauri/sidecar/cli.test.js`
  的 boot 落点红线。
- 新增预设若带子目录资源（`prompts/`、`skills/`、`routines/` 等），只需把目录放进
  `assets/agent-presets/<id>/`：枚举与拷贝已递归到底（`scripts/lib/preset-files.js`），
  但**不要**在 `agent.cordis.yml` 的 `name:` 行引用不存在的相对路径——那会被内核
  health check 判为 broken。
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
