# DSH Desktop（Tauri 版）开发手册

> 统一入口：本文回答「代码怎么改、接口在哪、怎么测、怎么打包」。
> 接口的**逐字段规范**永远以 `contracts/` 五份契约为准（单一事实源），
> 本手册是导航与流程，不复写契约内容。

## 1. 架构地图（30 秒版）

```
dsh-tauri/
├── contracts/          ★ 五份硬契约（接口唯一事实源，见 §2）
├── src-tauri/
│   ├── crates/         Rust 模块层（依赖单向：下层不依赖上层）
│   │   ├── shell-core        路径/设置/单实例/run-state（std 优先，可独立单测）
│   │   ├── kernel-process    spawn 规格/就绪行/Job Object 杀树/崩溃环
│   │   ├── bridge            dshDesktop 垫片 JS + initialization_script
│   │   ├── fence             文件围栏（zstd 首帧 cwd）+ file-open/revert
│   │   │                     （revert 的服务对象「文件视图一键还原」随 dsh-client-file-changes
│   │   │                      于 v1.0.0 / 2026-10-07 插件退役，还原半边不再是内置功能）
│   │   ├── preview-server    127.0.0.1 静态页 + /__diag/ 诊断端点
│   │   └── session-watcher   通知限流/聚焦豁免决策逻辑（Phase 3 通知链接线目标，当前未接线零消费者；sidecar-orchestrator crate 已于 2026-08 分层重审裁撤——boot 编排由 app supervisor + Node sidecar boot 子命令直接承载）
│   └── src/app/        装配根（只做接线：lib.rs / supervisor / commands / windows / pages）
├── sidecar/cli.js      Node sidecar 单一入口（复用 dsh-desktop/scripts，零逻辑重写）
└── scripts/            stage-payload.sh（打包暂存）/ smoke-installed.sh（安装布局冒烟）
```

**分层铁律**：crates 不依赖 tauri 运行时；装配根只接线不实现；Node 侧逻辑全部
活在 `dsh-desktop/scripts/`（Electron 线共用），sidecar 是薄封装。

## 2. 统一接口（五契约索引 + 强制机制）

| 契约 | 管什么 | 变更即破坏性？ |
|------|--------|----------------|
| `contracts/bridge-api.md` | `window.dshDesktop` 方法逐字段签名 + 页面事件（页面插件直接消费；方法数以该契约实测为准） | 是——升版本 + CHANGELOG 标注 |
| `contracts/ipc-commands.md` | Electron IPC → Tauri command 通道映射 + 通用约定（通道数以该契约实测为准） | 是 |
| `contracts/data-flow.md` | 配置叠加树 / 单一数据流 / **boot 守护瀑布** / 持久化与 env 覆盖通道 | 是 |
| `contracts/plugin-contract.md` | 三层插件辨析（内核 cordis / 伴随 / 用户）+ seam 三角色 | 是 |
| `contracts/error-codes.md` | 六域错误码（PluginError {code} 口径） | 是 |

**防漂移是机器强制的**（不是口头约定）：
- `lib.rs` 的契约审计测试：注册命令必须出现在契约表内，否则
  `no_extra_commands_beyond_contract_and_poc` 失败——**加命令不改契约 = 测试红**。
- sidecar `node --test`：boot 步骤顺序契约（repair→sync→patches→compat-pin→preflight，
  五步；v1.0.0 纯净线拆掉了 presets 步）。
- Electron 线 `unit-patch-engine` / `unit-compat-companion` 等对共享 Node 脚本
  的行为契约（两侧共用同一实现，一处修复双线同愈）。

## 3. 开发环境与常用命令

```bash
# 前置：dsh-desktop/ 已 npm install（vendor node + node_modules 就位）
export PATH="$PATH:$USERPROFILE/.cargo/bin"   # cargo

# 测试（改任何代码后的最低门槛）
cd dsh-tauri/src-tauri && cargo test --workspace        # Rust 全量（177 例，其中 1 例本地 ignored；以实际输出为准）
cd dsh-tauri && node --test sidecar/cli.test.js         # sidecar（16 例）
cd dsh-desktop && node --test scripts/test/unit-*.test.js  # 共享脚本回归（71 文件；Electron 线同源）

# 开发运行（debug）
cd dsh-tauri/src-tauri/src/app && cargo run

# 打包（见 §6）
bash dsh-tauri/scripts/stage-payload.sh
npx --yes @tauri-apps/cli build --config src-tauri/src/app/tauri.conf.json \
  --target x86_64-pc-windows-msvc
```

**调试开关**（保留在产物里，实装排障用）：
- `DSH_TAURI_DIAG=1`：换页后注入页面探针（dialog/composer/console 状态回传）
- `DSH_TAURI_DEVTOOLS=1`：debug build 自动开 DevTools
- `DSH_TAURI_REPO_ROOT=<dir>`：内核目录显式指定（绕过 exe-walk/manifest 回退）
- `DSH_HOME` / `DSH_TAURI_USERDATA`：数据目录重定向（冒烟/便携，Rust+Node 同口径）

## 4. 端到端加一个桥命令（五步，缺一测试红）

以「新增 `fooBar` 命令」为例：

1. **契约先行**：`contracts/ipc-commands.md` 映射表加行（Electron 通道 →
   `foo_bar` command，归属 crate）；若页面要消费，`contracts/bridge-api.md`
   同步加方法签名（标注 Tauri command 通道）。
2. **实现**：命令体放归属 crate（纯逻辑）或 `src/app/src/commands/`（按领域选子模块，接线）；
   `#[tauri::command] pub fn foo_bar(...)`。
3. **注册**：`lib.rs` `generate_handler![]` 加 `commands::foo_bar`。
4. **垫片**（仅页面消费时）：`crates/bridge/dist/bridge-shim.js` 加转发
   （对齐 bridge-api.md 签名；fire-and-forget 用 `send`）。
5. **测试**：跑 `cargo test`——契约审计测试自动校验注册⊆契约；为命令本身
   写单测（参考 `src/app/src/commands/` 各子模块 tests 的沙箱写法）。

> 历史教训：`file_open` 曾注册成 `open_path` 而契约/垫片调 `file_open`——
> 正是审计测试抓住的漂移。**先改契约再写代码**不是仪式，是流程防线。

## 5. 加一个伴随插件（桌面内置插件）

> 在册伴随插件 **28 个**（v1.0.0 由 39 精简，2026-10-07 按用户点名移除 11 个）。逐名、版本、许可与
> 来源核对见 `dsh-desktop/docs/builtin-plugins-inventory.md`；数量与登记以
> `scripts/lib/companion-plugins.js` 的 `COMPANION_PLUGINS` 实测为准。移除一个插件的姿势是同一清单的
> 反向操作：摘 `COMPANION_PLUGINS` 登记 + 进 `RETIRED_COMPANIONS` 撤回账 + 删 `assets/plugins/<dir>` 源
> > （退役三件事缺一，存量 profile 里的副本就可能收不回）。

1. **单一来源登记**：`dsh-desktop/scripts/lib/companion-plugins.js` 的
   `COMPANION_PLUGINS` 数组加条目（id 必须与该插件 cordis.patch.yml 的 loader
   id 一致——issue #104 教训；name 含 scope 则落 `node_modules/@scope/`）。
2. **资产**：`dsh-desktop/assets/plugins/<dir>/` 放插件本体（package.json
   version 用于 keep-newer 判定；运行资产目录 gui/public/dist 由
   `SYNC_SUBDIRS` 全量同步，keep-newer 分支只补**整目录缺失**）。
3. **测试**：`dsh-desktop` 的 `unit-compat-companion.test.js`（同步语义）+
   `dsh-mini.test.js` 风格的插件自身用例。
4. **交付面**：`stage-payload.sh` **把** `assets/plugins` 装进安装包（v1.0.0 内置线，
   2026-10-08 裁定）——assets 镜像不带 `plugins` 排除项，随后 `stage-plugin-gate.mjs`
   剪掉未声明 `shipsNodeModules` 的插件内层 `node_modules` 并校验安装态最长路径，
   再由「源目录数 = payload 目录数」数量门禁收口；CI 五个架构的 staging 同口径。
   运行期由 boot 的 sync 步把包里的源同步进 `<DSH_HOME>/profiles/<name>/node_modules/`。
   新增插件不需要动 stage 脚本（镜像整树，天然带上新目录）。
5. **许可对账**：`THIRD_PARTY_NOTICES.md` §4.1 的行集与本清单**必须逐名 1:1**（增删插件同步增删行）。

## 6. 打包与验证（win-x64）

```bash
bash dsh-tauri/scripts/stage-payload.sh    # ① 内核 payload 暂存（~500MB，fail-fast 校验；compat 构建失败即断）
cd dsh-tauri && npx --yes @tauri-apps/cli build \
  --config src-tauri/src/app/tauri.conf.json \
  --target x86_64-pc-windows-msvc           # ② NSIS 安装包（LZMA ~87 MB）
bash dsh-tauri/scripts/smoke-installed.sh  # ③ 安装布局冒烟（绝不跑真安装器！）
```

- 产物：`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe`
  （v0.5.0 实发产物名 `DSH.Desktop_0.5.0_x64-setup.exe`）
- 升级链（installerHooks.nsh）：旧版进程检测 → 注册表定位（捕获
  InstallLocation）→ `/S /KEEP_APP_DATA --updated` 静默卸载 → **装回旧位置**
  （可写性试探，Program Files 无权则回退默认）→ 数据全程不动。
- **NSIS 钩子改动必须过 makensis 编译验证**（宏展开/栈平衡/`/SD` 参数位置
  都是曾致安装器卡死或编译阻断的坑，见 CHANGELOG「安装器卡死三重修」）。
- **冒烟为什么手拼布局**：真安装器的 PREINSTALL 会静默卸载本机真实
  Electron 版——开发机上绝不允许。
- 冒烟判据：preview+内核双新增监听 + 隔离 profile 建立 + 杀壳 Job Object
  零残留（监听 PID 差集法，防本机正式版 node.exe 污染）。
- **发版（CI）**：推 `v*` tag 触发 `tauri-release.yml` 三平台流水线
  （Windows NSIS / Linux AppImage+deb / macOS dmg → 自动发布 Release）。
  v0.5.0 即由此链发布（本轮上线 win-x64）。CI 侧纪律：三平台 vendor node
  统一 v24.15.0、完整 stage-payload、compat fail-fast；本地出包则以上面
  三步为准。

## 7. 万无一失检测（发版闸门——5 路验证管线）

v0.5.0 起发版前的固定验证管线，**5/5 全过才允许出包**（任一红即阻断）：

| # | 检测路 | 命令 | 覆盖什么 | v0.5.0 实测 |
|---|--------|------|----------|-------------|
| 1 | Rust 全量 | `cargo test --workspace` | 契约审计（注册⊆契约）/ 瀑布破坏性实测 / 围栏与围栏逃逸 / 崩溃环状态机 | 全绿 177/0（其中 1 例本地 ignored；CI 跳集成例，以实际输出为准） |
| 2 | sidecar 真机 | `node --test sidecar/cli.test.js` | boot 顺序契约 / 插件六通道 / 诊断备份 roundtrip（沙箱 home） | 13/13 |
| 3 | 共享脚本回归 | `node --test scripts/test/unit-*.test.js`（dsh-desktop） | Electron 线同源的补丁引擎 / 伴随插件同步 / compat 行为契约 | 69 文件 899 过（3 挂为壳退役后壳文件引用残留，Electron 线测试债） |
| 4 | NSIS 钩子编译 | `makensis` 全量编译 installerHooks.nsh | 安装器卡死类缺陷的静态防线（宏展开 / 栈平衡 / MessageBox 语法） | 0 错误 0 警告 |
| 5 | 安装态冒烟 | `smoke-installed.sh` | 手拼安装布局：boot 全链真跑 + 端口监听 PID 差集 + Job Object 零残留 | PASS |

> 教训来源：v0.5.0 发布前安装器卡死（#134）与启动受阻两类缺陷全部逃过了
> 单一测试路——T3 实测复现（12 分钟真实安装器取证）+ D1/D2 代码走查/CI
> 诊断 + V3 全量编译验证组合后才根治。5 路管线把这组手段固化为发版闸门。

## 8. 稳定性三条原则（评审时的默认立场）

1. **客户端必须能打开**：任何装配失败终态恢复页，绝不退出（含静态页服务
   失败降级 data: 页）。见 data-flow.md §3.2。
2. **兼容性不报错**：锁中毒容忍 / panic hook 落盘 panics.log / boot 线程
   catch_unwind / 坏配置自愈——意外以日志收场，不以崩溃收场。
3. **用户数据不动**：升级/重装/冒烟全链路不触碰 `%APPDATA%\dsh-desktop`
   与 `~/.dsh` 内容；冒烟必须走 DSH_HOME/DSH_TAURI_USERDATA 隔离。

## 9. 测试矩阵速查

| 层 | 命令 | 规模（v0.5.0 实测） |
|----|------|------|
| Rust 全量（crates+app，含契约审计/瀑布破坏性实测） | `cargo test --workspace` | 177（其中 1 例本地 ignored；CI 跳集成例，以实际输出为准） |
| sidecar（boot 顺序/插件通道/诊断） | `node --test sidecar/cli.test.js` | 13 |
| 共享 Node 脚本（Electron 线同源回归） | `node --test scripts/test/unit-*.test.js` | 69 文件 899 过（3 挂为壳退役残留） |
| NSIS 钩子编译 | makensis 全量编译 | 0 错 0 警 |
| 安装布局冒烟 | `smoke-installed.sh` | PASS/FAIL |
| 静态检查 | `cargo build --workspace`（零警告纪律） | — |

## 10. 相关文档

- `docs/migration-roadmap.md`——重构决策与 Phase 0-4 状态矩阵
- `docs/upgrade-guide.md`——Electron→Tauri 升级与数据兼容
- `docs/release-keys.md`——发版密钥/更新链/打包流程
- `CHANGELOG.md`——逐提交变更与实测记录
