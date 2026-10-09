![DSH Desktop](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/banner.svg)

**把 DeepSeek Harness 装进桌面（Windows / macOS）的开箱即用客户端**

内置完整 dsh 运行时与全部官方插件，免装 Node.js，双击即用

> [!IMPORTANT]
> **🎉 v0.5.0 —— 全架构迁移与重构**：桌面壳从 Electron 全面迁移至 **Tauri 2（Rust）**，更稳定、更好用——
> 安装包更小、内存更低、启动更快；「守护瀑布」让坏插件 / 坏配置也**永不白屏打不开**。
> 用户数据与旧版完全兼容，覆盖安装即完成无痛升级（详见 [迁移指南](dsh-tauri/docs/upgrade-guide.md) 与 [架构](#-架构)）。
> v0.5.0 之前的 Electron 版本仍可在 [Releases](https://github.com/myYangyunfan/dsh_desktop/releases) 下载，此后仅维护 Tauri 架构。

[![Release](https://img.shields.io/github/v/release/myYangyunfan/dsh_desktop?color=4D6BFE&label=Release)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Stars](https://img.shields.io/github/stars/myYangyunfan/dsh_desktop?style=social)](https://github.com/myYangyunfan/dsh_desktop) [![Forks](https://img.shields.io/github/forks/myYangyunfan/dsh_desktop?style=social)](https://github.com/myYangyunfan/dsh_desktop/fork) [![Downloads](https://img.shields.io/github/downloads/myYangyunfan/dsh_desktop/total?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Issues](https://img.shields.io/github/issues/myYangyunfan/dsh_desktop?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/issues) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20%C2%B7%20macOS%2012%2B-4D6BFE) ![License](https://img.shields.io/badge/license-MIT-4D6BFE) [![Release CI](https://img.shields.io/github/actions/workflow/status/myYangyunfan/dsh_desktop/release.yml?color=4D6BFE&label=Release%20CI)](https://github.com/myYangyunfan/dsh_desktop/actions) [![Gitee Stars](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgitee.com%2Fapi%2Fv5%2Frepos%2Fmy-yang-yunfan%2Fdsh_desktop&query=%24.stargazers_count&label=Gitee%20Stars&color=4D6BFE)](https://gitee.com/my-yang-yunfan/dsh_desktop)

[Gitee 镜像](https://gitee.com/my-yang-yunfan/dsh_desktop) · [![English](https://img.shields.io/badge/English-4D6BFE?style=for-the-badge&logo=translate)](README.en.md)

> [!TIP]
> 🧩 **推介：[dsh-hotplug-hub](https://github.com/ARFCON/dsh-hotplug-hub)** —— 我们推介的 dsh 启动管理器。

---

## ✨ 特性

### 开箱即用

- **零依赖** — 内置独立 Node 运行时与 npm CLI，目标机器无需安装任何环境
- **完整 dsh** — 打包 `@deepseek-ai/dsh` 及全部官方插件，离线可用
- **一键启动** — 双击即启 `dsh web`，优先复用上次端口，就绪后载入原生窗口
- **双形态** — 便携版（免安装、可放 U 盘）+ 安装版（桌面/开始菜单快捷方式）

### 体验增强

- **深色玻璃无边框窗口** — 自绘标题栏、Win11 圆角，关闭默认隐藏到系统托盘
- **侧边会话浮窗** — 随时唤起独立会话窗口，与主会话互不干扰
- **会话管理** — 归档 / 恢复 / 删除对话，历史不再堆积
- **余额小部件** — 对话底部实时显示「本轮费用 · 余额」，支持 OpenCode Go 订阅额度，点击直达充值
- **完成通知** — 任务跑完弹系统通知，一分钟内回到主窗口自动跳到对应会话（Windows 通知无点击回调，聚焦即跳转）

### 工程韧性

- **守护瀑布** — 内核 boot 链逐级自愈：坏插件自动修复、坏配置自动重建、内核崩溃环原地重启，任何不兼容形态都不退出（v0.5.0 Tauri 架构核心特性）
- **崩溃自愈** — 渲染层假死心跳检测自动重载；内核由 supervisor 探活 + 指数退避拉起
- **历史兼容** — 自动修补会话事件词汇表，第三方插件写入的事件不破坏会话历史
- **自动更新** — 右上角 ⋯ 菜单一键检查并安装客户端更新（双源 GitHub/Gitee Releases 自动切换，sha256 校验 fail-closed，离线静默）；升级安装自动装回旧位置，零配置丢失；内核随客户端整体分发（无独立更新链）
- **快捷方式自愈** — 桌面与开始菜单快捷方式缺失即自动补建

## 📸 界面一览

![DSH Desktop 界面](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/showcase.png)

**开箱即用**（原生 dsh web）vs **DSH Desktop**：

| 能力 | 原生 `dsh web` | DSH Desktop |
| --- | --- | --- |
| 启动 | 手动安装 Node.js、敲命令 | 双击即用，内置独立运行时 |
| 界面 | 浏览器标签页 | 桌面原生窗口 · 深色玻璃无边框 |
| 会话管理 | 仅归档 | 归档 / 恢复 / 删除 |
| 余额 | 无 | 实时「本轮费用 · 余额」+ OpenCode Go |
| 桌面能力 | 无 | 托盘常驻 / 完成通知 / 侧边浮窗 |
| 更新 | 手动 | 客户端双源更新链（GitHub/Gitee + sha256 校验 fail-closed） |

## 🚀 快速开始

**系统要求**：Windows 10 / 11（x64），无需预装 Node.js。

### 下载（Tauri 架构）

**最新版到 [GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases) 页下载（v0.5.x 预览线）**——v0.5.2（2026-08-22）修复 v0.5.1 用户实测的「频繁重启 + 白屏」等问题。下表保留 v0.5.0（首个对外测试版，2026-08-21 发布）直链：

| 平台 | 下载 |
| --- | --- |
| 💻 Windows x64 | [`DSH.Desktop_0.5.0_x64-setup.exe`](https://github.com/myYangyunfan/dsh_desktop/releases/download/v0.5.0/DSH.Desktop_0.5.0_x64-setup.exe)（NSIS 安装包，约 87 MB，`currentUser` 模式免管理员，内嵌 WebView2 引导器） |

- v0.5.0 由 [Tauri 发布流水线](https://github.com/myYangyunfan/dsh_desktop/actions/workflows/tauri-release.yml) 云端构建发布（本轮上线 Windows x64）；**v0.5.1 起三平台产物（Linux AppImage/deb、macOS dmg）与 Windows 便携版均由流水线产出**（六资产校验，见[发布](#-发布)）。
- 从任意旧版（Electron 0.1.x–0.4.x）覆盖安装：自动定位旧目录、静默卸载保数据、**装回原位置**，用户数据零迁移（详见[迁移指南](dsh-tauri/docs/upgrade-guide.md)）。

### 国内用户（Gitee）

> [!NOTE]
> Gitee 镜像当前最新为 **Electron 版 v0.4.1**——v0.5.0（Tauri）安装包暂未同步，请先从 [GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases) 下载。

Gitee 单文件限制 100 MB，Electron 安装包拆为分片（`.part1/.part2/...`），全部下载后双击该版本附件中的 `merge.bat` 自动合并，`SHA256SUMS` 校验。请到 [Gitee Releases](https://gitee.com/my-yang-yunfan/dsh_desktop/releases) 页选择版本下载。

### 旧版下载（Electron 0.4.x 及更早）

[GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases) 保留全部历史版本。旧版命名规则：**`win-` = Windows，`macos-` = macOS**（`.exe` 一定是 Windows，`.dmg` / `.zip` 一定是 macOS）；**`x64` = Intel/AMD，`arm64` = ARM 芯片**（Windows ARM 设备如 Surface Pro X、Apple Silicon Mac 选 arm64）。形态含 `portable`（免安装便携版）与 `setup`（安装版）。

macOS 版暂未签名，Apple Silicon 首次打开会提示「无法验证开发者」——请**右键点击 App → 打开**，或终端执行：

```bash
xattr -dr com.apple.quarantine "/Applications/DSH Desktop.app"
```

**数据位置**：Windows 便携版在 exe 旁 `data\`；安装版在 `%APPDATA%\DSH Desktop\`。macOS 在 `~/Library/Application Support/DSH Desktop/`。设置环境变量 `DSH_HOME` 可强制指定 dsh 配置目录。

## 💬 社区交流

遇到问题、想反馈建议或与其他用户交流？欢迎加入 QQ 交流群（群号 **926561802**）：

![QQ 交流群](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/qq-group-qr.png)

## 🛠 从源码构建

v0.5.0（Tauri 架构）——前置：[Rust 工具链](https://rustup.rs/) + `dsh-desktop/` 已 `npm install`（内核 payload 源）：

```bash
# 测试（Rust 全量 + sidecar + 共享脚本）
cd dsh-tauri
cargo test --manifest-path src-tauri/Cargo.toml   # Rust 177 例（CI 跳集成例）
node --test sidecar/cli.test.js                    # sidecar 16 例
cd ../dsh-desktop && node --test scripts/test/unit-*.test.js  # 共享脚本回归

# 开发运行
cd src-tauri/src/app && cargo run

# 打包 win-x64 NSIS 安装包 + 安装态冒烟
bash dsh-tauri/scripts/stage-payload.sh
npx --yes @tauri-apps/cli build --config src-tauri/src/app/tauri.conf.json \
  --target x86_64-pc-windows-msvc
bash dsh-tauri/scripts/smoke-installed.sh
```

完整流程（含调试开关 `DSH_TAURI_DIAG` / `DSH_TAURI_DEVTOOLS` 等）见[开发手册 §6](dsh-tauri/docs/development.md)。

## 🤖 发布

v0.5.0 起发布走 **Tauri GitHub Actions 云端流水线**（[`tauri-release.yml`](.github/workflows/tauri-release.yml)）：推 `v*` tag → 三平台构建（统一 vendor node v24.15.0 + 完整 `stage-payload.sh` + compat 构建 fail-fast）→ 自动汇总产物发布 Release。**v0.5.0 已由此流水线发布**（2026-08-21，本轮上线 Windows x64 NSIS 安装包）；**v0.5.1 起三平台六资产（Windows 安装包/便携版、Linux AppImage/deb、macOS dmg）校验通过，0.5.x 以预览线（prerelease）标记发布**；v0.5.2（2026-08-22）为 v0.5.1 用户实测问题的修复版。Electron 时代的 `release.yml` 流水线随架构退役。CI 之外的手动本地打包路径见上方[从源码构建](#-从源码构建)（stage-payload → tauri build → 安装态冒烟三步）。

### 📦 Tauri 架构可导出的安装包形式

由 `tauri.conf.json` 的 `bundle.targets` 决定，按需增删即可扩展产物形式：

| 平台 | 安装包形式 | 状态 |
| --- | --- | --- |
| Windows x64 | **NSIS 安装包**（`DSH.Desktop_<版本>_x64-setup.exe`）——LZMA 压缩实测 ~87 MB；`currentUser` 模式免管理员安装；WebView2 引导器内嵌，离线机器也能装；升级链自动装回旧目录保数据 | ✅ **v0.5.0 已发布**（CI 产出，过安装态冒烟）；另有便携版 zip（v0.5.1 起） |
| Windows arm64 | NSIS 安装包（`--target aarch64-pc-windows-msvc` 交叉构建） | 🔜 Tauri 原生支持，待实测（v0.5.1 起流水线实验线） |
| Windows | MSI（WiX 工具链，`targets` 加 `"msi"`） | 🔜 Tauri 原生支持，待开启 |
| Linux x64 | `.AppImage` / `.deb` | ✅ CI 已产出（v0.5.1 起六资产校验，预览线） |
| macOS（Apple Silicon） | `.app` / `.dmg` 磁盘映像 | ✅ CI 已产出（v0.5.1 起，ad-hoc 签名校验，预览线） |

> 便携版（免安装、可放 U 盘）不是 Tauri 内置 target——Tauri 版以 NSIS `currentUser` 安装为默认形态，独立便携包规划中以后续版本提供。

## 🧩 内置插件生态

内置伴随插件在册共 **28 个**（v1.0.0 内置线，2026-10-08 裁定：插件源**整树进安装包**，装机后首次开机由 boot 的同步链镜像进 profile，开箱可用；交付面门禁见 THIRD_PARTY_NOTICES 第 4 节，完整第三方组件清单同文件）。下表按 `scripts/lib/companion-plugins.js` 的在册顺序逐名列出，包名与版本取自各插件 `package.json` 实值；「上游 / 许可」一列只到「包内自己怎么说」这一层，逐条原仓库可达性与许可原文实测见 [内置插件清单](dsh-desktop/docs/builtin-plugins-inventory.md) §三，逐条对 rc.2 宿主的兼容判定见 §五：

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
| `@deepseek-ai/dsh-balance` | 0.1.3 | 账户余额 + 本轮会话费用估算（挂在对话统计栏 dock） | 自研 · MIT |
| `@deepseek-ai/dsh-file-changes` | 0.1.0 | 会话文件更改投影（折叠 tool/result 的 meta.diffs） | 自研 · MIT |
| `dsh-better-sidebar` | 0.24.1 | VSCode 式右栏：editor / git / subagent / sidechat / diff 五个内置标签，并向其他插件开放标签注册服务 | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) · MIT |
| `dsh-session-manager` | 0.1.0 | 会话行删除按钮 + 设置内「归档对话管理」面板（恢复 / 删除） | 自研 · MIT（包名撞社区已发布包） |
| `@deepseek-ai/dsh-conversation-tweaks` | 0.1.1 | 隐藏长篇对话输出 + 会话右侧导航滑轨 | 自研 · MIT |
| `@deepseek-ai/dsh-quest-ui` | 0.6.1 | Quest 模式界面一键开关（分组会话栏 + 卡片输入区 + 药丸元数据条，默认关闭） | 自研 · MIT |
| `@dsh-external/dsh-super-injector` | 0.3.1 | 运行时注入任意本地插件包（不重启）+ 热重载 + 设置页插件管理 UI | @dsh-external 社区 · BSD-3-Clause（仅 manifest 自标，无许可原文可引） |
| `@deepseek-ai/dsh-prompt-custom` | 0.3.5 | 在设置页自定义官方注入的系统提示词（整体替换 / 追加） | 自研 · MIT |
| `@deepseek-ai/dsh-workspace-anchor` | 0.1.0 | 往稳定系统提示注入 {{cwd}} 偏好块，防 agent 工作目录漂移 | 自研 · MIT |
| `@deepseek-ai/dsh-wsl-settings` | 0.1.0 | 设置页「WSL 后端」栏：local↔wsl 切换、发行版与安装目录、状态探活 | 自研 · MIT |
| `@dsh-external/dsh-side-session` | 0.3.1 | 临时会话悬浮窗：自动导入主对话上下文（长度三档 120 / 600 / 5000 条），追问不污染主会话 | [hzhz314159/dsh-side-session](https://github.com/hzhz314159/dsh-side-session) · MIT（上游无 LICENSE 文件，MIT 系我方自标） |
| `billion-context-dsh` | 0.2.26 | Active Context Pruning：模型驱动上下文管理，另注册 4 个模型工具与 /acp-prune 命令 | [Tyan66666/billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh) · MIT |
| `dsh-pocket` | 2.10.7 | 手机扫码实时同屏操控桌面 web（WebSocket 透传 + 公网隧道 + 二维码配对） | [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) · GPL-2.0 |
| `@deepseek-ai/dsh-openclaw-bridge` | 0.8.1 | 微信 / 飞书官方频道桥接入 DSH agent 会话（分片回写、去重限流） | [hzhz314159/openclaw-dsh-bridge](https://github.com/hzhz314159/openclaw-dsh-bridge) · MIT |
| `dsh-input-history` | 0.1.1 | 输入框 ↑/↓ 终端式已发送消息回溯（按会话隔离） | 自研 · MIT |
| `dsh-easyrewrite` | 2.6.0 | 消息撤回 / 重编辑 + 版本翻页器 + 自带设置中心 | [Renzic-Stone/DSH-EasyRewrite](https://github.com/Renzic-Stone/DSH-EasyRewrite) · MIT |
| `dsh-change-review` | 0.1.1 | AI 变更审核：让模型复查自己刚做的改动（正确性 / 安全性 / 目标一致性） | 自研 · MIT |
| `dsh-auto-compact` | 0.1.1 | contextPressure 达阈值（默认 80%，可调）自动发送 /compact | 自研 · MIT |
| `dsh-offpeak` | 1.0.1 | 峰谷价格卫士：高峰时段拦截发送提醒，可定时到低价时段自动执行 | [christophersmith2737-commits/OffPeak](https://github.com/christophersmith2737-commits/OffPeak) · MIT |
| `dsh-settings-nav-custom` | 0.1.1 | 设置页左侧导航项显示 / 隐藏与排序（localStorage 持久化） | EAC 移植 [DSH-EAC/EAC-Desktop](https://github.com/DSH-EAC/EAC-Desktop) · MIT |
| `dsh-settings-groups` | 0.1.1 | 把设置「常规」页低频选项收进底部可折叠「高级选项」组 | 自研 · MIT |
| `dsh-synapse` | 0.3.0 | 非线性对话画布：同工作区的会话 / 追问 / 分支可视化拖拽 | [liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse) · MIT（本地分叉线，不取上游 0.4.2） |
| `@dsh-external/dsh-subagent-lens` | 0.1.1 | Task/subagent 展开式活动视图 + 会话头部命令/文件聚合条（零额外后端请求） | 自研 · MIT（借 @dsh-external 作用域，名下无仓库） |
| `dsh-reasoning-effort` | 0.8.1 | Codex 式「模型 + 推理强度」选择器，含自定义 provider 的 copy-ready 指引 | [HanaAyane/dsh-reasoning-effort](https://github.com/HanaAyane/dsh-reasoning-effort) · MIT |
| `dsh-basics-panel` | 0.4.1 | 设置页可视化并管理 MCP 服务器 / 技能 / 规则 / 归档会话 | [yxsj245/dsh-Basics-Panel](https://github.com/yxsj245/dsh-Basics-Panel) · MIT |
| `dsh-input-fold` | 0.1.1 | 超长用户提示词默认折叠为前几行 + 「展开」遮罩 | 自研 · MIT |
| `dsh-prompt-optimizer` | 2.0.4 | 输入框一键润色草稿（默认当前会话模型，零配置流式） | [winditer/dsh-prompt-optimizer](https://github.com/winditer/dsh-prompt-optimizer) · MIT |
| `dsh-zcode-migrate` | 0.1.2 | zcode CLI 历史会话 → dsh 原生会话日志（inspect / migrate / verify + /zcode） | 自研 · MIT |

> 历史上还随包过 `dsh-navbar`（导航栏替换，v0.6.3-beta.3 已移出清单并删源 `ff421ac2`）、
> `zat-dsh-engine`（旧内置市场，更早退役）——两者均不在上面的 28 个在册清单里。

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
