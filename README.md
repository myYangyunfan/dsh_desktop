![DSH Desktop](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/banner.svg)

**把 DSH 里最好用的一批插件，做成一个开箱即用的桌面客户端**

不是一个「只换皮」的 DSH 壳：我们替你挑插件、调兼容、做整合、压进一个安装包。
装好即用——不用装 Node.js，不用逐个找插件，也不用为版本冲突折腾。

> [!IMPORTANT]
> **v1.0.9：随包内核升到 0.2.2-rc.1。** 官方 dsh 运行时与 34 个精选伴随插件随包交付：
> **DeepSeek-Bot**（主 Bot + 长期 Bot + 群聊）、Better Sidebar 文件工作台、Free Search、
> 插件商店、Prompt Optimizer、会话地图、桌面通知、MCP 工具箱……全部开箱可用，
> 并能在「设置 → 插件 → 内置插件」里统一查看、启停和检查更新。
> 架构仍是 Tauri 2 + 内置 Node：安装包更小、启动更快，坏插件 / 坏配置也**永不白屏打不开**。

[![Release](https://img.shields.io/github/v/release/myYangyunfan/dsh_desktop?color=4D6BFE&label=Release)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Stars](https://img.shields.io/github/stars/myYangyunfan/dsh_desktop?style=social)](https://github.com/myYangyunfan/dsh_desktop) [![Forks](https://img.shields.io/github/forks/myYangyunfan/dsh_desktop?style=social)](https://github.com/myYangyunfan/dsh_desktop/fork) [![Downloads](https://img.shields.io/github/downloads/myYangyunfan/dsh_desktop/total?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Issues](https://img.shields.io/github/issues/myYangyunfan/dsh_desktop?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/issues) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20%C2%B7%20macOS%2012%2B-4D6BFE) ![License](https://img.shields.io/badge/license-MIT-4D6BFE) [![Release CI](https://img.shields.io/github/actions/workflow/status/myYangyunfan/dsh_desktop/release.yml?color=4D6BFE&label=Release%20CI)](https://github.com/myYangyunfan/dsh_desktop/actions) [![Gitee Stars](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgitee.com%2Fapi%2Fv5%2Frepos%2Fmy-yang-yunfan%2Fdsh_desktop&query=%24.stargazers_count&label=Gitee%20Stars&color=4D6BFE)](https://gitee.com/my-yang-yunfan/dsh_desktop)

[Gitee 镜像](https://gitee.com/my-yang-yunfan/dsh_desktop) · [![English](https://img.shields.io/badge/English-4D6BFE?style=for-the-badge&logo=translate)](README.en.md)

> [!TIP]
> 🧩 **推介：[dsh-hotplug-hub](https://github.com/ARFCON/dsh-hotplug-hub)** —— 我们推介的 dsh 启动管理器。

---

## ✨ 为什么是「插件整合包」

DSH 的插件生态很好，但「好」和「装好就能用」之间隔着选型、兼容、版本、配置四道墙。
DSH Desktop 把这件事做完：**精选，整合，随包交付。**

### 精选，而不是堆积

- **34 个伴随插件，逐个选过** — 不以数量取胜：每个内置件都经过宿主兼容验证、许可核对和真机启动检查，
  清单、上游与判定记录在 [内置插件清单](dsh-desktop/docs/builtin-plugins-inventory.md)。
- **一个安装包，一套完整体验** — Bot 团队与群聊（DeepSeek-Bot）、文件工作台（Better Sidebar）、
  免费多引擎搜索（Free Search）、插件商店、提示词优化、会话地图、桌面通知、MCP / 技能工具箱、
  余额与费用、会话归档、峰谷价格卫士……装完即齐。
- **统一管理，不再各自为政** — 「设置 → 插件 → 内置插件」逐条查看版本、启停、检查更新；
  更新源与排除项由一张表统一维护，避免同一插件在不同入口看到不同状态。
- **上游可追溯** — 每个随包插件都标注来源仓库、版本与许可证；第三方许可见
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，兼容性判定与实测证据见清单 §五。

### 开箱即用

- **零环境依赖** — 内置独立 Node 运行时与 npm CLI，目标机器不需要安装 Node.js / pnpm。
- **完整 dsh，离线可用** — 打包官方 `@deepseek-ai/dsh` 与官方插件全集，断网也能启动。
- **双击即用** — 自动复用上次端口，内核就绪后载入原生窗口；提供安装版与便携版两种形态。
- **客户端级更新** — 右上角 ⋯ 一键检查并安装更新，双源 GitHub / Gitee 自动切换，
  sha256 fail-closed 校验；内核随客户端整体分发，没有另一条独立更新链。

### 桌面体验

- **Tauri 2 原生壳** — 深色玻璃无边框窗口、自绘标题栏、Win11 圆角，关闭默认驻留托盘。
- **文件工作台** — Better Sidebar 把资源管理器、编辑器、Diff 与「在本地打开」接进右栏，
  折叠 / 展开与快捷键都按桌面习惯重做。
- **Bot 团队** — DeepSeek-Bot 把主 Bot、长期 Bot 和群聊装进同一个客户端：
  @ 转交、群共享记忆、能力库与用量页，适合把 DSH 当成长期协作工作台。
- **通知与余额** — dsh-notify 接管回合完成 / 审批 / 出错通知，点击回到对应会话；
  对话底部实时显示「本轮费用 · 余额」。

### 工程韧性

- **守护瀑布** — 内核 boot 链逐级自愈：坏插件自动修复、坏配置自动重建、内核崩溃环原地重启，
  任何不兼容形态都不退出。
- **崩溃自愈** — 渲染层假死心跳检测自动重载；内核由 supervisor 探活 + 指数退避拉起。
- **历史兼容** — 自动修补会话事件词汇表，第三方插件写入的事件不破坏会话历史。
- **数据不动** — 升级覆盖安装保留 profile 与会话；插件启停只改 patch，不碰用户数据。

## 📸 界面一览

![DSH Desktop 界面](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/showcase.png)

**开箱即用**（原生 dsh web）vs **DSH Desktop**：

| 能力 | 原生 `dsh web` | DSH Desktop |
| --- | --- | --- |
| 启动 | 手动安装 Node.js、敲命令 | 双击即用，内置独立运行时 |
| 界面 | 浏览器标签页 | 桌面原生窗口 · 深色玻璃无边框 |
| 插件 | 自己逐个找、装、调兼容 | **34 个精选插件随包交付**，统一查看 / 启停 / 更新 |
| 会话管理 | 仅归档 | 归档 / 恢复 / 删除 + 会话地图 |
| 余额 | 无 | 实时「本轮费用 · 余额」+ OpenCode Go |
| 桌面能力 | 无 | 托盘常驻 / 原生通知 / 文件工作台 / Bot 群聊 |
| 更新 | 手动 | 客户端双源更新链（GitHub/Gitee + sha256 校验 fail-closed） |

## 🚀 开始使用

**系统要求**：Windows 10 / 11（x64）；macOS 12+（Apple Silicon / Intel）。无需预装 Node.js。

### 下载安装

到 [GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases/latest) 下载最新版 **1.0.9**：

| 平台 | 安装包 |
| --- | --- |
| 💻 Windows x64 | `DSH-Desktop-Setup-1.0.9-win-x64.exe`（NSIS 安装包，约 187 MB，`currentUser` 模式免管理员，已内置 WebView2 引导器） |
| 🍎 macOS 12+ | `1.0.9-macos-arm64.dmg`（以 Releases 页为准） |
| 🐧 Linux x64 | `1.0.9-linux-x64.AppImage` / `dsh-desktop_1.0.9_amd64.deb`（以 Releases 页为准） |

- **覆盖安装**：自动定位旧目录、保留数据并装回原位置；profile、会话与插件配置不迁移、不丢失。
- **便携版**：Windows 另有 `DSH-Desktop-Portable-1.0.9-win-x64.zip`，解压即用，数据存在 exe 旁 `data\`。
- **首次启动**：从安装包内的 `assets/plugins` 同步 34 个精选插件到 profile；之后可在
  「设置 → 插件 → 内置插件」里查看、启停和检查更新。
- **数据位置**：Windows 安装版在 `%APPDATA%\DSH Desktop\`，便携版在 exe 旁 `data\`；
  macOS 在 `~/Library/Application Support/DSH Desktop/`。设置 `DSH_HOME` 可强制指定 dsh 配置目录。

> v1.0.0 起不再同步 Gitee 代码与 Release 资产；Gitee 上的历史版本仅作存档。

## 💬 社区交流

遇到问题、想反馈建议或与其他用户交流？欢迎加入 QQ 交流群（群号 **926561802**）：

![QQ 交流群](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/qq-group-qr.png)

## 🛠 从源码构建

前置：[Rust 工具链](https://rustup.rs/) + dsh-desktop/ 已 npm install（内核 payload 源）。

```bash
# 测试（当前基线：Rust 607 / sidecar 21 / Node 2253）
cd dsh-tauri
cargo test --workspace
node --test sidecar/cli.test.js
cd ../dsh-desktop && npm test

# 开发运行
cd dsh-tauri/src-tauri/src/app && cargo run

# 打包 win-x64 NSIS 安装包 + 安装态冒烟
bash dsh-tauri/scripts/stage-payload.sh
cd dsh-tauri && npx --yes @tauri-apps/cli build \
  --config src-tauri/src/app/tauri.conf.json --target x86_64-pc-windows-msvc
bash dsh-tauri/scripts/smoke-installed.sh
```

完整流程（含调试开关 `DSH_TAURI_DIAG` / `DSH_TAURI_DEVTOOLS` 等）见[开发手册](dsh-tauri/docs/development.md)。

## 🤖 发布

唯一发布入口是推 `v*` tag → [`tauri-release.yml`](.github/workflows/tauri-release.yml)：
三平台构建（Windows NSIS / 便携版、Linux AppImage / deb、macOS dmg）→ 版本 / 测试 / 路径门禁 →
汇总并校验 7 个资产 → 发布 Release。版本号三处同步（`dsh-desktop/package.json`、
`Cargo.toml` 的 workspace.package.version、`tauri.conf.json`），漏改直接 fail-fast。

预发布版**不进** GitHub `releases/latest`，而壳侧更新器轮询的正是 latest —— 因此预发布不会被自动推给
稳定版用户，这是刻意设计。完整流程、转正与回滚见 [发布 Runbook](.github/RELEASE_RUNBOOK.md)。

### 📦 安装包形态

| 平台 | 产物 | 状态 |
| --- | --- | --- |
| Windows x64 | **NSIS 安装包** `DSH-Desktop-Setup-<版本>-win-x64.exe`（LZMA 压缩，1.0.7 实测约 187 MB；`currentUser` 模式免管理员；WebView2 引导器内嵌，离线机器也能装） | ✅ 主平台，1.0.7 已构建并通过安装态冒烟 |
| Windows x64 便携版 | `DSH-Desktop-Portable-<版本>-win-x64.zip`（解压即用，数据在 exe 旁 `data\`） | ✅ CI 产出 |
| Windows arm64 | NSIS 安装包（实验性） | 🧪 CI 实验线 |
| Linux x64 | `.AppImage` / `.deb` | ✅ CI 产出 |
| macOS（Apple Silicon） | `.dmg` 磁盘映像 | ✅ CI 产出（未签名，首次打开需右键 → 打开） |

## 🧩 内置插件生态

内置伴随插件在册共 **34 个**（v1.0.0 内置线，2026-10-08 裁定：插件源**整树进安装包**，装机后首次开机由 boot 的同步链镜像进 profile，开箱可用；2026-10-22 移除「临时对话」`side-session`、新增 DeepSeek-Bot（`bot`），在册仍为 34；交付面门禁见 THIRD_PARTY_NOTICES 第 4 节，完整第三方组件清单同文件）。下表按 `scripts/lib/companion-plugins.js` 的在册顺序逐名列出，包名与版本取自各插件 `package.json` 实值；「上游 / 许可」一列只到「包内自己怎么说」这一层，逐条原仓库可达性与许可原文实测见 [内置插件清单](dsh-desktop/docs/builtin-plugins-inventory.md) §三，逐条对 `0.2.2-rc.1` 宿主的兼容判定见 §五：

> [!NOTE]
> **v1.0.0 精简：内置插件由 39 个减为 28 个**（用户于 2026-10-07 点名移除）。不再内置的 11 个：
> 可视化插件市场（`dsh-community-market`）与其桌面服务桥（`dsh-market-desktop-bridge`）、插件中枢（`dsh-hub`）、
> 知识图谱记忆（`graph-memory`）、知识中心（`dsh-cardian`）、桌面宠物（`harness-pet`）、内置识图 VLM 转述（`dsh-vision`）、
> 拖入文件（`dsh-file-drop`）、图片粘贴发送（`dsh-image-paste`）、会话内终端标签（`@deepseek-ai/dsh-terminal-tab`）、
> 文件变更一键还原（`@deepseek-ai/dsh-client-file-changes`）。其中 `@deepseek-ai/dsh-client-file-changes` 与
> `@deepseek-ai/dsh-terminal-tab` 与内核官方同名包重叠，镜像副本会遮蔽官方包，故一并撤回。
> 相近能力仍在包内：手机同屏 = `dsh-pocket`，文件变更追踪 = `dsh-file-changes`（仅其「一键还原」半边依赖已移除的壳侧 `file_revert`）。

| 插件（包名） | 版本 | 说明 | 来源 / 许可 |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-balance` | 0.2.0 | 账户余额 + 本轮会话费用估算（挂在对话统计栏 dock） | 自研 · MIT |
| `@deepseek-ai/dsh-file-changes` | 0.1.0 | 会话文件更改投影（折叠 tool/result 的 meta.diffs） | 自研 · MIT |
| `dsh-better-sidebar` | 0.24.2 | VSCode 式右栏：editor / git / subagent / sidechat / diff 五个内置标签，并向其他插件开放标签注册服务 | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) · MIT |
| `dsh-session-manager` | 0.1.0 | 会话行删除按钮 + 设置内「归档对话管理」面板（恢复 / 删除） | 自研 · MIT（包名撞社区已发布包） |
| `@deepseek-ai/dsh-conversation-tweaks` | 0.1.1 | 隐藏长篇对话输出 + 会话右侧导航滑轨 | 自研 · MIT |
| `@deepseek-ai/dsh-quest-ui` | 0.6.1 | Quest 模式界面一键开关（分组会话栏 + 卡片输入区 + 药丸元数据条，默认关闭） | 自研 · MIT |
| `@dsh-external/dsh-super-injector` | 0.3.1 | 运行时注入任意本地插件包（不重启）+ 热重载 + 设置页插件管理 UI | @dsh-external 社区 · BSD-3-Clause（仅 manifest 自标，无许可原文可引） |
| `@deepseek-ai/dsh-prompt-custom` | 0.5.0 | 在设置页自定义官方注入的系统提示词（整体替换 / 追加），提示词卡即切即用：点芯片切换、正文写回当前卡 | 自研 · MIT |
| `@deepseek-ai/dsh-workspace-anchor` | 0.1.1 | 把当前工作目录写进稳定系统提示的锚点块，防 agent 工作目录漂移（0.2.1 起内核不再注册 `{{cwd}}` 变量，锚点由插件自己填实路径） | 自研 · MIT |
| `@deepseek-ai/dsh-wsl-settings` | 0.1.0 | 设置页「WSL 后端」栏：local↔wsl 切换、发行版与安装目录、状态探活 | 自研 · MIT |
| `ds-bot` | 0.2.0 | Bot 团队：主 Bot + 长期 Bot + 群聊，Bot 间 @ 转交与共享记忆，开箱即用的协作工作台（loader id `bot`） | [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot) · Apache-2.0 |
| `billion-context-dsh` | 0.2.26 | Active Context Pruning：模型驱动上下文管理，另注册 4 个模型工具与 /acp-prune 命令 | [Tyan66666/billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh) · MIT |
| `dsh-pocket` | 2.10.7 | 手机扫码实时同屏操控桌面 web（WebSocket 透传 + 公网隧道 + 二维码配对） | [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) · GPL-2.0 |
| `@deepseek-ai/dsh-openclaw-bridge` | 0.8.1 | 微信 / 飞书官方频道桥接入 DSH agent 会话（分片回写、去重限流） | [hzhz314159/openclaw-dsh-bridge](https://github.com/hzhz314159/openclaw-dsh-bridge) · MIT |
| `dsh-input-history` | 0.1.1 | 输入框 ↑/↓ 终端式已发送消息回溯（按会话隔离） | 自研 · MIT |
| `dsh-easyrewrite` | 2.6.0 | 消息撤回 / 重编辑 + 版本翻页器 + 自带设置中心 | [Renzic-Stone/DSH-EasyRewrite](https://github.com/Renzic-Stone/DSH-EasyRewrite) · MIT |
| `dsh-change-review` | 0.1.2 | AI 变更审核：让模型复查自己刚做的改动（正确性 / 安全性 / 目标一致性） | 自研 · MIT |
| `dsh-auto-compact` | 0.1.2 | contextPressure 达阈值（默认 80%，可调）自动发送 /compact | 自研 · MIT |
| `dsh-offpeak` | 1.0.1 | 峰谷价格卫士：高峰时段拦截发送提醒，可定时到低价时段自动执行 | [christophersmith2737-commits/OffPeak](https://github.com/christophersmith2737-commits/OffPeak) · MIT |
| `dsh-settings-nav-custom` | 0.1.1 | 设置页左侧导航项显示 / 隐藏与排序（localStorage 持久化） | EAC 移植 [DSH-EAC/EAC-Desktop](https://github.com/DSH-EAC/EAC-Desktop) · MIT |
| `dsh-settings-groups` | 0.1.1 | 把设置「常规」页低频选项收进底部可折叠「高级选项」组 | 自研 · MIT |
| `dsh-synapse` | 0.3.1 | 非线性对话画布：同工作区的会话 / 追问 / 分支可视化拖拽 | [liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse) · MIT（本地分叉线，不取上游 0.4.2） |
| `@dsh-external/dsh-subagent-lens` | 0.1.1 | Task/subagent 展开式活动视图 + 会话头部命令/文件聚合条（零额外后端请求） | 自研 · MIT（借 @dsh-external 作用域，名下无仓库） |
| `dsh-basics-panel` | 0.4.2 | 设置页可视化并管理 MCP 服务器 / 技能 / 规则 / 归档会话 | [yxsj245/dsh-Basics-Panel](https://github.com/yxsj245/dsh-Basics-Panel) · MIT |
| `dsh-input-fold` | 0.1.1 | 超长用户提示词默认折叠为前几行 + 「展开」遮罩 | 自研 · MIT |
| `dsh-prompt-optimizer` | 3.0.0 | 输入框旁一键分析并优化草稿（SSE 流式上屏；默认实时复用当前会话模型；无上下文走结构模板、有上下文提炼目的顺势润色；保真自检、斜杠命令前缀保护；结果可替换/撤回/复制；设置页可配模型、调用参数与上下文） | [Y1X1n/dsh-prompt-optimizer](https://github.com/Y1X1n/dsh-prompt-optimizer) · MIT |
| `dsh-zcode-migrate` | 0.1.2 | zcode CLI 历史会话 → dsh 原生会话日志（inspect / migrate / verify + /zcode） | 自研 · MIT |
| `dsh-builtin-manager` | 0.2.0 | 「设置 → 插件」里的内置插件页：搜索 / 状态筛选 + 单列表逐条查看随包内置件并启停（行内反馈；启停下次启动生效） | 自研 · MIT |
| `@deepseek-ai/dsh-goal-completion` | 0.1.0 | 内核右栏「目标收尾」标签页：当前会话目标的状态机 + 官方 GoalBar 没有的 complete（标记完成，两次点击确认） | 自研 · MIT |
| `dsh-free-search` | 0.9.11 | 免费多引擎搜索：注册 `ctx.web` 搜索 provider，内置 web_search 自动选用（loader id 是 `web-search-free`，不是包名） | [DDDMUC/dsh-free-search](https://github.com/DDDMUC/dsh-free-search) · MIT |
| `dsh-plugin-shop` | 0.9.0 | 插件商店：浏览 / 安装 / 启停 / 更新 dsh 插件（loader id 是 `shop`，客户端 bundle id 才是包名） | [LivXue/dsh-plugin-shop](https://github.com/LivXue/dsh-plugin-shop) · Apache-2.0 |
| `@local/dsh-network-proxy` | 1.0.0 | 设置「通用」里的 HTTP 代理行：读系统代理并热切换 fetch dispatcher（包名保留上游 `@local/*`，改名会让更新回来的行对不上） | [baizhizzl/dsh-network-proxy](https://github.com/baizhizzl/dsh-network-proxy) · MIT |
| `dsh-toolbox-ui` | 1.8.2 | MCP / 技能工具箱：右下悬浮面板，MCP 市场与技能管理（loader id 是 `mcp-manager-ui`；宿主半边静态导入 `smol-toml`） | [Imzl-zl/dsh-toolbox-ui](https://github.com/Imzl-zl/dsh-toolbox-ui) · MIT |
| `@bittersmilezzz/dsh-notify` | 0.4.5 | 桌面通知：渲染进程 Web Notification 六类事件 + 点击回会话，v1.0.7 起取代壳层「回合完成」通知 | [bitterSmilezzz/dsh-notify](https://github.com/bitterSmilezzz/dsh-notify) · MIT |

> 历史上还随包过 `dsh-navbar`（导航栏替换，v0.6.3-beta.3 已移出清单并删源 `ff421ac2`）、
> `zat-dsh-engine`（旧内置市场，更早退役）、`dsh-reasoning-effort`（推理强度选择器，2026-10-17
> 随内核 0.2.1 换代退役——0.2.1 的官方设置页已能直接声明自定义模型的强度档）——三者均不在上面的 34 个在册清单里。

## 🧠 Agent 预设

**v1.0.0 纯净线不携带任何 Agent 预设**——与官方桌面客户端的交付形态对齐：模式列表只出
内核自带的出厂集（`standard` / `ptc` / `minimal` / `cordis`），安装包不注入自定义 persona，
客户端也不写入任何预设文件（随包预设源、预设写入器与 boot 的 `presets` 步已一并拆除）。

想用自己的预设：放进 `<DSH_HOME>/.agent-presets/<id>/` 即可被内核发现（`agent.cordis.yml`
+ `preset.yml`）；老用户目录里的历史副本不会被清除。历史上随包过的社区/自研预设来自第三方
作者，已整树删除，来源与致谢记录见 git 历史（`git log --diff-filter=D -- dsh-desktop/assets/agent-presets`）。

## 🏗 架构

**v0.5.0 起为 Tauri 2（Rust）架构**——Electron 壳已退役，其全部职责（窗口 / IPC / 更新 / 打包）由 Rust 侧逐 crate 复刻，契约先行（`dsh-tauri/contracts/` 五份硬契约为接口唯一事实源）：

```
┌──────────────────────────────────────────────────────────┐
│  Tauri 2 壳（Rust · 7 个单向依赖 crate + 装配根）          │
│  · supervisor：boot 守护瀑布 → spawn 内核 → 就绪换页       │
│    → 探活 → 崩溃环原地重启（任何不兼容形态都不白屏）        │
│  · shell-core        路径 / 设置（损坏自愈）/ 单实例        │
│  · kernel-process    spawn 规格 / 就绪行 / Job Object 杀树  │
│  · bridge            Electron IPC 38 通道 → Tauri command  │
│                     全量映射 + 垫片 JS（window.dshDesktop） │
│  · fence / preview-server / session-watcher /              │
│    sidecar-orchestrator（boot 时序 + Node sidecar 复用     │
│    dsh-desktop/scripts 内核侧逻辑，零重写）                 │
└──────────────────────┬───────────────────────────────────┘
                       │  dsh web --host 127.0.0.1 --port <复用端口>
                       ▼
            内置 node + @deepseek-ai/dsh
            路径解析：用户目录 overlay > 内置包
                       │  就绪行检测
                       ▼
            原生窗口加载 Web UI（仅本机回环访问）
```

分层铁律：crates 不依赖 tauri 运行时、可独立单测（Rust 177 例全绿；sidecar Node 16 例 + 共享脚本 unit 71 文件）；装配根只接线不实现；内核侧 Node 逻辑全部活在 `dsh-desktop/scripts/`。开发手册见 [`dsh-tauri/docs/development.md`](dsh-tauri/docs/development.md)。

## 📄 License

MIT。基于 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（MIT）。

---

⭐ 如果 DSH Desktop 帮到了你，欢迎 [点个 Star](https://github.com/myYangyunfan/dsh_desktop) 支持我们；使用中遇到任何问题，请到 [Issues](https://github.com/myYangyunfan/dsh_desktop/issues) 反馈。
