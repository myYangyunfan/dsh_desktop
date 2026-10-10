# AGENTS.md — DSH Desktop 工作区指引

> 本文件给 ZCode agent 用。逐字段接口规范以 `dsh-tauri/contracts/` 六份契约为准
> （五份核心 + `wsl-backend.md`），开发流程的完整版见 `dsh-tauri/docs/development.md`
> （本文件不复制其内容）。

## 仓库是什么

DSH Desktop —— 基于 `@deepseek-ai/dsh`（DeepSeek Harness）的桌面客户端。
**v0.5.0 起主线是 Tauri 2（Rust）**；Electron 壳已退役，但 `dsh-desktop/` 的内核侧
Node 逻辑仍是活代码（Tauri sidecar 直接复用，零重写）。主平台 Windows，
**v1.0.0 起不再向 Gitee 同步**：代码不推 `gitee` 远端，release 资产也不镜像
（`tauri-release.yml` 的 `mirror-gitee` job 整条 `if: false` 停用，实现保留；恢复姿势见
`.github/RELEASE_RUNBOOK.md` §8）。此前「双向同步」的描述只适用于 v0.6.5 及以前。

| 目录 | 说明 |
| --- | --- |
| `dsh-tauri/` | 桌面壳主线：`contracts/`（六份契约）、`src-tauri/`（Rust 工作区）、`sidecar/`（Node 薄封装）、`ui/`（frontendDist 占位页）、`dlls/`（D3DCOMPILER_47.dll）、`package-payload/`（打包暂存，gitignored）、`ta13-soak/`（Rust soak 压测）、`scripts/`（stage-payload / stage-plugin-gate / smoke-installed）、`docs/` |
| `dsh-desktop/` | 内核侧 Node 逻辑：构建期补丁、自愈（根级 boot 链脚本 `watchdog.js` / `*-heal.js` 等）、插件同步、余额链、`docs/`、`assets/plugins/`（**随安装包分发**——v1.0.0 内置线，2026-10-08 裁定；内置伴随插件在册 **28** 个，v1.0.0 由 39 精简、2026-10-07 移除 11 个；随包 agent 预设子系统已整体拆除）、`vendor/`（node/npm 运行时 + `dsh-kernel/` pin 的离线内核 tgz，后者**必须入库**） |
| `dsh-desktop/scripts/test/` | 全部 Node 测试（187 个 `*.test.js/.mjs`，另有 `fixtures/`、`ta16-snapshots/`、mock server），单测唯一去处 |
| `.github/workflows/` | `ci.yml`（PR 门禁）、`tauri-release.yml`（tag 发版，唯一发布入口）、`release.yml`（退役 Electron 线，全部 `if: false`） |

## 常用命令

前置：`cd dsh-desktop && npm ci`（`postinstall` 会自动跑 `install-kernel.mjs` + `patch-deps.js`，
这一步决定 `node_modules/@deepseek-ai/*` 的补丁态，跳过会到处红）。

```bash
# --- Node 侧（工作目录 dsh-desktop/）---
npm test                                       # 全量单测：node --test scripts/test/*.test.js *.mjs
node scripts/check-syntax.js                   # 语法门禁（prepack/predist 同款，模式扫描，node --check 抓不到）
node scripts/compat/validate-pin.js            # kernel-pin 与离线 tarball 一致性（fail-closed）
node scripts/compat/patch-surface.js verify node_modules/@deepseek-ai ..   # 补丁干预面漂移

# --- Rust / 壳侧 ---
cd dsh-tauri/src-tauri && cargo test --workspace     # Rust 全量（含契约审计测试）
cd dsh-tauri && node --test sidecar/cli.test.js      # sidecar 真机流程（沙箱 home）
cd dsh-tauri/src-tauri/src/app && cargo run          # 开发运行（loading→内核→Web UI）

# --- 打包（win-x64，三步）---
bash dsh-tauri/scripts/stage-payload.sh              # ① payload 暂存到 package-payload/（~890MB，fail-fast）
cd dsh-tauri && npx --yes @tauri-apps/cli build \
  --config src-tauri/src/app/tauri.conf.json --target x86_64-pc-windows-msvc   # ② NSIS
bash dsh-tauri/scripts/smoke-installed.sh            # ③ 安装布局冒烟
```

**本机**：`cargo` 目标目录在仓库外（`CARGO_TARGET_DIR=C:\dsh-tauri-build`，TEMP 指仓库内
`.tmp-rust-tmp`，实测 ~18G）；成品安装包收集在 `C:\Users\delinger\Desktop\dsh-tauri-out`
（`.sha256` 同目录，`superseded/` 存历史包）。

**没有 lint / typecheck / 格式化工具链**（无 eslint、无 tsconfig、无 prettier）——
语法门禁只有 `check-syntax.js` 与测试，没有可用的 lint 脚本，不要凭空发明。

## 架构边界（改代码前必读）

- **crates 不依赖 tauri 运行时**：`shell-core` / `kernel-process` / `bridge` / `fence` /
  `preview-server` / `session-watcher` / `wsl-backend` 均为纯 std，可独立单测；
  `src/app/` 是装配根，**只接线不实现**。
- **Node 逻辑全部活在 `dsh-desktop/scripts/`**，`dsh-tauri/sidecar/cli.js` 只是薄封装
  （stdout 末行单个 JSON，日志走 stderr）。修内核侧行为改 `dsh-desktop/`，别在 sidecar 里重写。
- **契约先行，且机器强制**：`dsh-tauri/contracts/` 六份文件是接口唯一事实源（五份核心：
  `bridge-api.md` / `ipc-commands.md` / `data-flow.md` / `plugin-contract.md` / `error-codes.md`；
  第六份 `wsl-backend.md` = WSL 托管后端全链语义）。机器锁两条：`lib.rs` 契约审计测试要求
  「注册命令 ⊆ 契约表」（`no_extra_commands_beyond_contract_and_poc`）；Node 哨兵
  `ta7-contract-audit` 把契约文档与代码实装双向核对（桥方法面 / 通道表 / 错误码 / WSL 契约键）。
  **加桥命令不改契约 = 测试红**。
  五步流程见 `development.md` §4；加伴随插件见 §5（登记进
  `scripts/lib/companion-plugins.js` 的 `COMPANION_PLUGINS`，id 必须与插件 `cordis.patch.yml`
  的 loader id 一致）；**移除**插件是同一条清单的反向操作：摘 `COMPANION_PLUGINS` + 进
  `RETIRED_COMPANIONS`/`RETIRED_COMPANION_DIRS` 撤回账 + 删 `assets/plugins/<dir>` 源，
  并同步**四处**逐名 1:1：`THIRD_PARTY_NOTICES.md` §4.1、`dsh-desktop/docs/builtin-plugins-inventory.md` §一、
  `README.md` 与 `README.en.md` 的插件表。四处由 `unit-hub-registry` 的同一条 `ledgerDiff` 对
  `package.json` 咬名称 / 版本 / 许可，README 两张表另咬行序对 `COMPANION_PLUGINS`、中英两份互对。
- **补丁系统**：`dsh-desktop/scripts/lib/patch-registry.js` 是 PatchSpec 唯一清单，
  patch-runner 与健康预检共用同一数据源。它有计数哨兵测试
  （`ta6-registry-invariants`、`unit-patch-registry`）——增删补丁要同步更新哨兵，
  否则测试红。补丁 marker 必须与 transform 的 `already` 判定同源。

## 编码与流程约定

- **中文优先**：文档、commit message、代码注释一律中文（英文版只有 `README.en.md`）。
- **commit**: `<type>: <简述>（#issue号）`，type ∈ `feat/fix/refactor/perf/docs/test/chore/build`；
  分支 `feature/` `fix/` `refactor/` `docs/`；维护者 squash merge，一次提交只做一件事。
- **功能新增 / bug 修复必须带测试**：纯函数用 `scripts/test/unit-*.test.js`，
  bug 回归用例头部注明 issue 号。桌面崩溃/自恢复场景进 `ta3-boot-chain.test.js` 或
  `ta13-soak-*.test.js`。
- **测试必须隔离**：一律用临时目录重定向 `DSH_HOME` / `DSH_TAURI_USERDATA`，
  **绝不触碰真实 `~/.dsh` 与 `%APPDATA%\DSH Desktop`**。
- 可单测纯函数收敛到 `scripts/lib/`，网络与文件编排留在调用方。
- **内核版本 pin 在 `scripts/compat/kernel-pin.json`（exact，禁止浮动）**，
  `vendor/dsh-kernel/*.tgz` 随库提交；换版 = 显式改 pin + 重跑适配器判定 + 全量测试。
- 临时文件（`.tmp-*`、`_*.js`、`*.log`、`portable*/`）已在 `.gitignore` 中，**不要提交**；`.tmp-kernel` / `.tmp-bs-*` 一类是历史取证物，**默认别清理**。

## 已知坑

- **发版唯一入口是推 `v*` tag** → `tauri-release.yml`。`release.yml` 是退役 Electron 线，
  历史上写 `false && A || B` 造成过「假短路」，别去复活它。流程见 `.github/RELEASE_RUNBOOK.md`。
- **版本号要三处同步**：`dsh-desktop/package.json`、`dsh-tauri/src-tauri/Cargo.toml`
  （`workspace.package.version`）、`dsh-tauri/src-tauri/src/app/tauri.conf.json`。
  其中 `tauri.conf.json` 的 version 会被 CI 与 tag 做 fail-fast 比对，漏改直接发版失败。
- **`patch-surface.snapshot.json` 悬空快照会「假绿」——改过补丁产物必须重收敛 + 重取快照同提交入库**：
  补丁变换带幂等守卫，改注入文案 / 删变换后本机 dev 树不重跑 `npm ci` 仍停在旧字节，与旧快照
  互证 `verify` 绿；只有新鲜收敛态（CI 的 `npm ci`）才暴露漂移。2026-10-06~10 的 chronic 红即两轮
  只改源未重取快照（rc.2 重锚改 ws client.js 守卫字节、识图退役删 asc index 注入体+其散文垃圾标记）。
  姿势：`npm ci` 重收敛 → `node scripts/compat/patch-surface.js snapshot node_modules/@deepseek-ai ..`
  → `verify` 复绿 → 与改动同一提交推。本机复现 CI 红用同一条 verify 命令对照 CI 日志逐字核
  （CI 日志 `gh run view --log-failed` 取不到时改走 `gh api repos/<owner>/<repo>/actions/jobs/<job_id>/logs`）。
- **CI 全量单测有两类「本机假绿」环境差（2026-10-10 根治，勿重复踩）**：
  ① 本机 node 24 容忍「await 一个被 unref 的 0ms 定时器」，CI 的 node 22 会整体
  `cancelledByParent`（`Promise resolution is still pending but the event loop has already
  resolved`）——测试床冲刷辅助一律用 `setImmediate`，**别写 `setTimeout(...).unref()`**；
  本机复现 CI 环境：`npx --yes node@22 --test <file>`。
  ② 7 个文件的 51 例 pristine 哨兵（ta6-transform-contract / ta6-baseline-matrix /
  ta6-heal-rollback-audit / unit-patch-engine / unit-pi-ai-tool-name-wire /
  unit-released-v0-history-recovery / unit-session-header-scan-guard）按设计硬断言
  「pristine 闭包在位」而非 skip——ci.yml 已固定在全量单测前跑
  `node scripts/install-pristine-kernel.mjs`（离线 vendor tarball 解出，幂等）；
  本机删 `.tmp-kernel` 即复现同款红。
- **冒烟测试绝不跑真安装器**：NSIS 的 PREINSTALL 会静默卸载本机真实版本。
  冒烟用手拼安装布局 + `DSH_HOME`/`DSH_TAURI_USERDATA` 隔离。
- **NSIS 钩子（installerHooks.nsh）改动必须过 `makensis` 编译验证**——宏展开、栈平衡、
  `/SD` 参数位置都曾导致安装器卡死或编译阻断。
- **关窗 ≠ 退出**：`closeToTray` 缺省 true（`src/app/src/windows.rs` 的 `CloseRequested`），
  点 × 只是隐藏到托盘、**内核 node 继续跑**。于是覆盖安装写 `@img/sharp-win32-x64/lib/
  libvips-42.dll` 会被 Windows 拒绝（不允许覆盖已被加载的映像），用户看到
  「Error opening file for writing」。安装器已加固：`installer-template.nsi` 在
  `CheckIfAppIsRunning` 之后插 `DSH_KILL_TREE_NODES`（按 CIM 的 ExecutablePath/CommandLine
  前缀精确清本安装树的 node）+ `DSH_WAIT_FOR_INSTDIR_RELEASE`（有界等句柄释放 ≤15s）。
  两个宏都在 `installerHooks.nsh`，**别再改回 `$_.Path`**——实测安装器子 PowerShell 里它
  对所有进程都是空的（过滤永远不命中，等于没清理），回归锁在 `ta14-upgrade-dirty-home`。
  手动验证这两个宏：`makensis -INPUTCHARSET UTF8` 编译一个 `!include` 真钩子文件的独立
  脚本，用 `/D=<临时目录>` 跑 `/S`，别在真安装目录上试。
- **Windows「完整/Lite 双便携版」实为同一份 payload——CI 便携包里没有内置 node.exe**：v1.0.0 实测两个
  便携 zip 体积逐字节相同（261,149,074B）、中央目录条目数同为 39,097，包内
  `resources/dsh-desktop/vendor/node/` 只剩一条空目录条目（同层 `vendor/npm/`、`vendor/dsh-kernel/*.tgz`
  都在位），所以 `build-portable` 的 lite 分支（`Remove-Item node.exe`）根本无可删。同一形状自 v0.5.7 起
  每个版本都在（0.6.5 两包同为 179,115,706B），是 N1 门禁注释里自写的「降级为告警（非 exit 1）」长期吞掉
  的缺口，不是某次回归；本机 PS 5.1 拿真 91MB `node.exe` 复现过 `Compress-Archive`，条目在位，吞文件者
  不是压缩步骤。**核对发布产物别只看体积**：`api.github.com` 502 且 `releases/expanded_assets/<tag>` 也
  返 500 时，资产名按 `tauri-release.yml` 头部命名表逐个拼 URL，用 `curl -sIL -r 0-0` 读
  `Content-Range: bytes 0-0/<size>` 核在位与体积，条目名用 Range 取末尾 64B 解 EOCD 得 `cd_off/cd_size`
  再取中央目录解析（几 MB，无需拖整包）；`.sha256` 边车直接 GET 即可读内容。
- **稳定性三原则（评审默认立场）**：① 客户端必须能打开，装配失败终态恢复页而非退出；
  ② 兼容性不报错，意外以日志收场（`panics.log`）不以崩溃收场；③ 用户数据不动。
- 文档里的测试基线数字常滞后。**现值（2026-10-10 实测，profile 链接落点自愈 + mac 端「未能保存设置」根治后）**：
  `scripts/test/` 190 个测试文件，`npm test` = 2043 例 / **0 fail**；pass 与 skip 的分界随本机材料
  与网络浮动（本次全量实测 pass 2034 / skip 9，差额来自 `example.com` 真实网络用例），
  skip 逐条都是环境缺料而非缺陷（pristine 夹具缺 `@openai/codex` / `@earendil-works/pi-ai`、
  openclaw 双轨的兄弟目录 `../openclaw-dsh-bridge/` 不在盘、本机无 `D:\workspace\dsh-pack` 克隆、
  真实网络、`.tmp-kernel` 构建产物不可用）——一律以现跑输出为准，**pass 与 fail 才是判据**。
  Rust 侧现值 **689 passed / 0 failed / 4 ignored**（36 个 target）——本机只能走 gnu 链，
  **`cargo test` 必须带 `--target x86_64-pc-windows-gnu`**（与 `RUSTUP_TOOLCHAIN` 配对）：漏了它会去写
  `<CARGO_TARGET_DIR>/debug/`（host 目录，复用不到三元组目录里的增量），链接期炸成
  `final link failed: memory exhausted` + 「crate … required in rlib format」+ 上百条 ICE 级联，
  看着像代码坏了其实只是工具链指错了。
  **「配对」是硬要求，只给 `--target` 不够（2026-10-10 实测）**：本机 default host 是
  `stable-x86_64-pc-windows-msvc`，`--target …-gnu` 时 **build script 仍在 msvc host 上链接**，
  于是 `link.exe` 解析到 Git Bash 的 coreutils `link`，报 `link: extra operand '…rcgu.o'`
  ——看着像依赖坏了。正确姿势：
  `RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu CARGO_TARGET_DIR=C:/dsh-tauri-build cargo test -p <crate> --target x86_64-pc-windows-gnu …`。
  取退出码别接管道：`cargo test … > 日志 2>&1; echo exit=$?`（`| tail` 会把 `$?` 换成 tail 的 0，
  本次就是这么错过一次编译失败的）。
  `dsh-tauri/docs/development.md` 那组「177 Rust 例 / 71 文件 Node」是旧账——**一律以实测输出为准**。
- 部分文件含 GBK 遗留注释（如 `dsh-tauri/src-tauri/Cargo.toml`），按 UTF-8 读会显示乱码；
  编辑这类文件时保持原编码，不要顺手「修正」成全角乱码以外的内容。
- 调试开关（随产物保留）：`DSH_TAURI_DIAG=1` 页面探针、`DSH_TAURI_DEVTOOLS=1`、
  `DSH_TAURI_REPO_ROOT=<dir>` 显式内核目录、`DSH_HOME` / `DSH_TAURI_USERDATA` 数据目录重定向。
- **`assets/plugins/dsh-better-sidebar` 是重建出来的 vendored 上游包，改行为只改 `src/`**：
  v1.0.0 起它是上游 0.24.1 整包（`docs/builtin-plugins-inventory.md` §5.2 #3），本机的构建链已实测跑通
  （沙箱是工作树内 gitignore 目录 `dsh-desktop/.tmp-bs-build/`：`npm ci --legacy-peer-deps` 装依赖后
  跑沙箱包的 `build` 脚本 = `rmSync lib && tsc -p tsconfig.build.json && tsdown`，
  `tsc` 是类型门禁——它非零退出时 `&&` 链会挡住 `tsdown`，别只看产物生成与否），
  所以改姿势是：改 `src/` → 沙箱里重跑 `build` → 用 `unit-better-sidebar-*` 测试核对产物。
  产物面是 **7 个文件、两类**：`lib/index.js` + `lib/invariant.js` 是 Node 半边；
  `lib/client.js`（官方频道，注册 id = 包名）与 `lib/client-registry.js`（插件注册表频道，
  注册 id = `dsh-external/dsh-better-sidebar`）由**同一份 `src/client/index.tsx` 编两遍**，只差注册 id
  与文件名，不会漂移；`lib/client-{editor,locale,mermaid}.js` 是 lazy chunk
  （`src/client/chunks/<name>.tsx`，两频道共用，走插件自己的 `/sidebar/bundle` 路由而非模块加载器）。
  **不要只手改产物中的一处**——`tsconfig.build.json` 是 `emitDeclarationOnly`，不再有逐文件 `lib/*.js` 镜像。
  历史上「`lib/` 领先 `src/`」的那批手改进产物（`splitLines`/`diffRows`/`DiffTurnsPanel` 一套）已随换代消失——
  上游 0.24.1 自带 `src/client/DiffTab.tsx` 与 `src/client/diff/`，我们那份不再回吸，旧表述作废；
  src↔产物同源由 `unit-better-sidebar-diff-surface` 按 `//#region <源路径>` 标记咬住。
- **插件的运行时落点是 repo 的 `assets/plugins/`，不是 profile**：启动期的伴随插件同步会把
  payload 里的插件目录镜像进 `<DSH_HOME>/profiles/<name>/node_modules/`，所以手工往 profile
  里塞文件会在下次启动被覆盖——要改就改 `assets/plugins/`（开发机是仓库目录，安装机是
  `<安装根>/dsh-desktop/assets/plugins/`）。
- **profile 里的链接落点是同步盲区，`cpSync` 撞上它有三种坏法（node v24 实测）**：目录级
  `cpSync(src, dest)` 的 dest 是链接时——顶层落点 → 抛 `ERR_FS_CP_DIR_TO_NON_DIR`（可被 catch，
  旧实现吞进日志）；嵌套悬空 junction → **Node 原生崩溃**（fail-fast，JS 层根本 catch 不到）；
  嵌套非悬空 junction → 静默写穿，把新文件倒进链接目标。v1.0.0 首启「未能保存设置」toast
  （settings + 8 个插件 `failed to load`、easyrewrite pending；mac 实机报告 + 部分 Windows
  用户同症）就是旧装配期 schemastery junction 指向残缺副本、上述三种坏法各占一段而成；
  boot 通道日志不落 desktop.log 又让失败双重静默。`companion-profile.js` 的 `syncDir`
  现已在复制前按 src 树形状摘除全部链接落点（含悬空、不穿透），插件落点 / `lib/` 落点 /
  单文件复制各有摘链兜底，回归锁 `unit-companion-link-dest`（含原生崩溃用例与「不写穿」
  负向断言）。手工自救（不能等发版的用户）：删 profile 内该落点后重启即自愈——
  Windows `rmdir /S /Q`、macOS `rm -rf`，对 junction / 悬空 junction / 真实目录均实测
  安全（不伤链接目标；PowerShell 删 junction 的历史 bug 在本机 PS 5.1.26100 上实测已
  不复发，但给用户的命令仍统一用 `rmdir`，少一个变量）。
- **排查插件失败前，先确认「原始错误有没有被打出来」——rc.2 起有三段叠加的静默链**：
  ① 插件导入失败不再抛出，`cordis-plugin-loader` 的 `Entry._init` 只 `ctx.logger.error(error)`
  + `return`（条目没有 fiber，就是我们日志里的 `failed to load`）；② cordis 默认 logger 的
  exporter 是**纯内存环形缓冲**（`self.buffer.push`，无 console sink），`logger.error` 不落地；
  ③ `boot()` 的诊断 exporter 把 warn/error 收进 `startupLogs`，只在抛 `StartupError` 时才由
  `bin.js::reportStartupFailure` 写 `<DSH_HOME>/logs/startup-*.log`——而我们的
  `loader-activation-isolation` 让非核心条目**不再抛**。同型问题在 prompt 准入链：
  `dsh-api-session-controller` 兜底把任何非 RemoteError 标成 `session/agent-busy`
  + `"prompt rejected"`，真因只在 `details.reason`、UI 不渲染（「发送文件恒报 agent 忙」即此）。
  2026-10-10 已加两条 guard 组诊断补丁把原文请出 stderr：`loader-import-failure-report`
  （`[loader-diagnostic]`）与 `prompt-admission-reason-report`（`[prompt-admission]`，报文
  另带原因摘要，**code 与 details 不动**——换 code 是契约变更，须走 error-codes.md + 哨兵）。
  读旧日志时记住：诊断行只在补丁装上后的启动里才有，历史 boot 一律静默。同批补上第三重
  盲（2026-10-10）：`run_sidecar_boot` 过去只在退出码非 0 时透出 stderr 尾行，boot 五步
  （repair/sync/patches/compat-pin/preflight）成功路径上的 anchor-missing 告警整段丢弃——
  现已逐行转进 `desktop.log`（上限 400 行、超出留末尾并显式注明截断量，
  `supervisor.rs::sidecar_boot_log_lines`），一次 boot 实测 115 行 / 15KB。
- **profile 里的 pnpm `npm:` 别名链接会劫持 scoped 解析——mac 端 9 插件 failed to load 的真根因（2026-10-11 取证）**：
  `profiles/web/node_modules/@deepseek-ai/cosmokit -> ../cosmokit` 把 scoped 规格符指到未 scoped 的
  `cosmokit@1.8.1`（没有 `createVolatile`，payload 的 `@deepseek-ai/cosmokit@1.8.5` 才有），于是 importer
  在 **ESM 链接期** SyntaxError → 条目连 fiber 都没有 → 只剩一行 `failed to load`；`@deepseek-ai/dsh-settings`
  同死就是「未能保存设置」toast + `pending (waiting for settings)`。三点教训：① 判据是「链接落点的包名 ≠
  目标 `package.json` 的 name」（`link:` 开发安装同名，不动），实现见 `profile-module-heal.js::healProfileAliasLinks`，
  已接进 boot `repair` 步——原先为这场景写的 `healProfileModuleShadowing` **只在 `guard-*` 子命令里跑**，
  boot 链从不触及；② repair 步**别摘真目录副本**，companion-profile 的 sync 每 boot 按 VENDOR_DEPS 重写它们，
  删了就是拉锯；③ 排查解析问题必须按 **scoped 全名**逐个解析——`VENDOR_DEPS` 里是未 scoped 的
  `cosmokit`/`schemastery`，只按它探测会连续两轮得出「包都能解析」的假结论。
- **内核右栏是可扩展面，别去改内核包**：`dsh-client-ui-sidebar-right` 的
  `sidebarRightTabs.register` + `sidebar.right.pane.tab` 是公开两段式标签 API（内核自己的
  文件/文档预览/终端也用它）。本仓库的 better-sidebar 已经用它把工作台接成右栏里的一个标签，
  设计与踩坑见 `dsh-desktop/docs/better-sidebar-kernel-integration.md`。
- **插件自带测试的夹具必须按宿主「真形状」造，否则用例在为已下线的契约作证**：2026-10-08 实测案例是
  `assets/plugins/dsh-synapse` 的 `test/replay-watermark.test.js` 用 `makeSession()` 造 `{ id, header, events }`，
  而 pin 的 rc.2 上 `Session.prototype` 已经没有 `events`（只有 `snapshotEvents`/`ownEvents`）——10 个测试文件
  全绿的同时，`index.js` 的回填路径静默产出 0 条消息。这类「宿主运行时对象属性下线」**不在任何一条静态扫里**
  （`kernel-pin.services.removed` 那 12 条全是服务 id，模块表判据只看具名导入），也不看版本号和 peer 区间。
  排查姿势：反射 `Object.getOwnPropertyNames(KernelClass.prototype)` 对一遍插件读过的字段，再用两种形状
  （旧夹具形 / 宿主真形）各跑一次被怀疑的入口；复算命令与完整证据链见
  `dsh-desktop/docs/builtin-plugins-inventory.md` §5.5。

## 动敏感区域前先读

| 要改什么 | 先读 |
| --- | --- |
| 桥命令 / IPC / 页面 API | `dsh-tauri/contracts/` 六份契约 + `docs/development.md` §2 §4 |
| 打包 / 发版 / 更新链 | `.github/RELEASE_RUNBOOK.md`、`dsh-tauri/docs/release-keys.md`、`docs/development.md` §6 §7 |
| 补丁 / 自愈 / 插件同步 | `dsh-desktop/scripts/lib/patch-registry.js` 头部注释、`dsh-desktop/docs/plugin-center-architecture.md` |
| 余额链 | `dsh-desktop/docs/balance-architecture.md` |
| WSL 模式 | `dsh-desktop/docs/wsl-verification.md`、`dsh-tauri/sidecar/wsl-*.js` |
| 任意改动前的变更史 | `dsh-desktop/CHANGELOG.md`、`dsh-tauri/CHANGELOG.md`（逐提交实测记录） |
| PR 流程与测试硬性要求 | `CONTRIBUTING.md` |
