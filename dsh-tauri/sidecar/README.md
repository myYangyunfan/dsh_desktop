# sidecar/ —— Node sidecar（复用策略）

Tauri 版的补丁体系（22 个文本手术）、插件同步、heal、guard **全部保留在 Node 侧**，
不在 Rust 里复刻——rc.7→rc.8 迁移已实证锚点对内核代码形状极敏感，复刻是负资产。

## 现状（Phase 2 已实装，v0.1.0 起）

本目录以 `cli.js` 为**单一入口**（boot / 插件管理六通道 / 诊断备份族 / WSL /
guard-* 守护瀑布子命令族），全部复用 `../../dsh-desktop/scripts/` 现有 Node
模块，零逻辑重写；配套 `cli.test.js`（node --test，23 例沙箱 home 真机流程，
含 WSL 半边 4 例模拟）与 `farm-repair.js`（farm 预设挂载失败去材料化）。boot 步骤落点：

| boot 步骤（data-flow.md §3） | 落点 |
|------------------------------|----------|
| Repair | `scripts/repair-session-log.js` + repair-manifest（sidecar 编排） |
| Sync | `scripts/sync-companion-plugins.js`（经共享脚本层） |
| Patches | `scripts/lib/patch-engine` + `patch-*.js` 家族（含 `--with-patches` 同链） |
| Compat-pin | `scripts/compat/validate-pin.js`（kernel-pin 与 vendored tarball 一致性） |
| Preflight | Rust：`kernel-process::choose_stable_port` |

> v0.5.1：内核家族平移至 0.1.1-rc.1（19 个 @deepseek-ai/dsh-* 依赖随
> `dsh-desktop/package.json` 平移；supervisor 版本断言放宽
> `starts_with("0.1.")`，rc 通道小版本迭代不再拒启）。
>
> v1.0.0 纯净线：原 `presets` 步连同随包 Agent 预设子系统（源目录、写入器
> `install-minimal-win-preset.js`、落点自愈 `lib/preset-heal.js`）整体拆除，
> 六步变五步。客户端不再写任何预设；内核自行发现出厂集 + `config.roots` +
> 用户根 `<DSH_HOME>/.agent-presets`（后者只由用户放文件）。

契约不变量：sidecar 是 Patch 层**唯一写入方**（data-flow.md §2）；
所有写入原子化（临时文件 + rename）；跨进程互斥经 WriteGate。

## WSL 托管模式（boot 链 WSL 半边）

`wsl-paths.js`（三形态纯函数）+ `wsl-mode.js`（检测 / UNC home 解析 /
wsl.exe 探测原语，spawn 可注入桩替身）为 `cli.js boot` 提供模式分支：

- **检测**：settings.json 扁平键 `backend='wsl'`（`wslDistro`/`wslInstallDir`
  同文件，与 Rust `commands/wsl.rs` 三方同键）；Rust 设置页解锁前用
  `DSH_WSL_MODE=1` 模拟；Electron 时代的 `DSH_DESKTOP_BACKEND*` 调试缝保留；
  非 Windows 恒 local；解析失败回落 local（Electron issue #54 语义，
  `wslFallbackReason` 进 boot JSON）。
- **生效后**：DSH_HOME 等价于 WSL 安装目录的 UNC 形态
  （`\\wsl.localhost\<distro><installDir>`，wsl-backend.uncHome 同一构造式），
  boot 五步全部经 UNC 写穿——sync 落 UNC profile、patches/preflight 按
  `ctx.wslMode` 切 `wslLayout`（`patch-target-resolver` 的 nm-roots 追加 agent
  根）；agent 未就绪（Rust 侧 ensureInstalled 未完成）时装配锚点取不到，各步
  fail-open 继续。boot JSON 追加
  `backend` + `wsl:{distro,installDir,uncHome,simulated,agentReady}`（additive）。
- **跳过项**（Electron main.js WSL 分支同语义）：farm-repair 整链跳过
  （junction 语义不适用于 Linux 内核自管的 symlink farm，Windows 侧 realpath
  经 9P 不可靠）；koffi 预检跳过（win32 预编译 koffi 与 Linux 内核无关——
  原生模块 koffi/sharp/node-pty 由 WSL 内 npm 安装的 linux 变体提供，
  即 Electron wsl-backend `installAgent` 语义，安装归 Rust 编排）。
- **测试**：本机 WSL VM 损坏，全部模拟——`wsl-mode.test.js` 注入 spawn 桩
  （BOM/无 BOM UTF-16LE、用法文本、docker-desktop 过滤）；`cli.test.js` WSL
  组用 `DSH_TAURI_WSL_UNC_HOME` 把 UNC home 指到临时目录（普通目录模拟
  `\\wsl$` 布局形态）。真机项见 WSL VM 恢复后的验证清单（commit 说明）。
