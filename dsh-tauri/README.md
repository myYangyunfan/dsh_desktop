# DSH Desktop — Tauri 版（主线架构，v0.5.0 起）

DeepSeek Harness 桌面客户端的 Tauri 2 重构。**v0.5.0 起为仓库主线架构**——Electron 壳已退役
（壳文件与打包链于 2026-08 清理，内核侧 `dsh-desktop/scripts` 作为 payload 源保留复用）；
契约先行，Phase 0-4 全量实装，**v0.5.0 已发布**（2026-08-21，CI 流水线产出 win-x64 NSIS）。
**v0.5.1（2026-08-21）后经 CI 发布（0.5.x 预览线；初定本地打包，发布链三跑修三坑）**：
内核家族平移 0.1.0-rc.8 → 0.1.1-rc.1
（deepseek-harness 1.1rc）+ 赞助窗三零依赖根治 + WSL #132/假开关双修 + 假死探活
阈值放宽（详见 [CHANGELOG.md](CHANGELOG.md)，release notes 草稿见
[docs/release-notes/v0.5.1-draft.md](docs/release-notes/v0.5.1-draft.md)）。
**v0.5.2（2026-08-22，最新）**：v0.5.1 用户实测「频繁重启 + 白屏」四根因根治
+ opencode-go Vision 模型目录补齐 + 余额生态全量收口 + 内存泄漏两修 +
壳层预设全集迁移（详见 [CHANGELOG.md](CHANGELOG.md)）。

> **开发手册（统一入口）**：[`docs/development.md`](docs/development.md) ——
> 架构地图 / 接口索引与防漂移机制 / 加命令五步 / 加插件 / 打包冒烟 / 调试开关。

> **macOS 用户**：当前 macOS DMG 为 ad-hoc 签名、未做 Apple 公证，从浏览器/网盘
> 下载后首次打开可能提示「已损坏，无法打开」或「无法验证开发者」。这是 Gatekeeper
> 对未公证应用的拦截，**不是安装包真的损坏**。任选其一即可打开：
> 1. 访达中**右键 app → 打开 → 再点「打开」**；
> 2. 终端执行 `sudo xattr -cr "/Applications/DSH Desktop.app"`（移除隔离属性）；
> 3. **系统设置 → 隐私与安全性 → 页面底部「仍要打开」**。
> 每次重新下载覆盖安装后需重做一次；长期方案为 Apple Developer ID 签名 + 公证。

## 布局

```
dsh-tauri/
├── contracts/          # ★ 契约单一来源（先于代码存在；注册命令⊆契约由测试强制）
│   ├── bridge-api.md   #   window.dshDesktop 49 方法硬契约（溯源到 Electron preload.js）
│   ├── ipc-commands.md #   Electron IPC → Tauri command 43 通道映射（43-2 注册）
│   ├── data-flow.md    #   配置叠加树 + 单一数据流 + boot 守护瀑布 + 持久化/env 覆盖通道
│   ├── plugin-contract.md # 三层插件辨析（内核 cordis / 伴随 / 用户）与消费规范
│   └── error-codes.md  #   统一错误码（E_* 只追加不复用）
├── docs/
│   ├── development.md  #   ★ 开发手册（统一入口）
│   ├── migration-roadmap.md  # 分期计划 + 状态矩阵（Phase 0-4 完成）
│   ├── upgrade-guide.md      # Electron→Tauri 无痛升级与数据兼容
│   └── release-keys.md       # 发版密钥 / 更新链 / 打包流程
├── sidecar/            # Node sidecar（复用 dsh-desktop/scripts，零重写）
├── scripts/            # stage-payload.sh（打包暂存）/ smoke-installed.sh（安装布局冒烟）
├── ui/                 # frontendDist（静态页；主窗运行时导航到 127.0.0.1）
└── src-tauri/
    ├── crates/         # 6 个单向依赖 crate（不依赖 tauri 运行时，独立单测）
    │   ├── shell-core/          # 路径/设置（损坏自愈）/run-state/单实例
    │   ├── kernel-process/      # spawn 规格/就绪行/Job Object 杀树/崩溃环/环境白名单
    │   ├── bridge/              # 错误 + 通道映射 + 垫片 JS（dist/bridge-shim.js）
    │   ├── fence/               # 文件围栏（越界拒绝）
    │   ├── preview-server/      # 127.0.0.1 只读静态服务 + /__diag/ 诊断端点
    │   └── session-watcher/     # 通知限流 + 聚焦豁免（Phase 3 通知链预留，未接线）
    └── src/app/        # 装配根（lib/supervisor/commands/windows/pages/nsis）
```

## 快速上手

```bash
# 前置：dsh-desktop/ 已 npm install
cd dsh-tauri
cargo test --manifest-path src-tauri/Cargo.toml   # Rust 全量（177 例，含瀑布破坏性实测；CI 跳集成例）
node --test sidecar/cli.test.js                    # sidecar（16 例，沙箱 home 真机流程）

# 开发运行
cd src-tauri/src/app && cargo run                  # 主线（loading→内核→Web UI）

# 打包 + 冒烟（详见 docs/development.md §6）
cd ../../..                                      # 回到 dsh-tauri/（上方已 cd 进 src-tauri/src/app）
bash scripts/stage-payload.sh                   # ① 内核 payload 暂存
npx --yes @tauri-apps/cli build \
  --config src-tauri/src/app/tauri.conf.json --target x86_64-pc-windows-msvc   # ② NSIS
bash scripts/smoke-installed.sh                 # ③ 安装布局冒烟（隔离环境）
```

## 与 Electron 版的关系

| 维度 | Electron（dsh-desktop/，已退役） | Tauri（本目录，主线） |
|------|--------------------------|-----------------|
| 状态 | 末代 0.4.x（Releases 可下，仅维护） | **v0.5.x 预览线经 CI 发布**（v0.5.0 win-x64 起；v0.5.1 起三平台六资产） |
| 用户数据 | `%APPDATA%/dsh-desktop` + `~/.dsh` | 同路径同 schema（升级零迁移，装回旧目录） |
| 内核自动更新 | 有（overlay 链） | **已删除**（随客户端发版） |
| 客户端自动更新 | 无哈希/签名校验 | 自研双源更新链（updater_client：GitHub/Gitee Releases + sha256 digest/边车校验 fail-closed） |
| 页面桥 | preload contextBridge | initialization_script 垫片（签名逐字一致） |
| 启动稳定性 | guardedBoot 瀑布 | 同语义三层瀑布 + 恢复页兜底 + panic 隔离 |
