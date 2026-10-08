# 贡献指南（DSH Desktop）

感谢你愿意为 dsh_desktop 贡献代码。本文档约定**提交 PR 前必须完成的步骤**，目的是让维护者 review 更轻松、合并更快。不满足硬性要求的 PR 会被打回补测。

## 仓库结构速览

| 路径 | 说明 |
| --- | --- |
| `dsh-desktop/` | 客户端主体：内置 dsh CLI 与 Node 运行时、构建期补丁与自愈脚本（原 Electron 外壳已下线） |
| `dsh-tauri/` | 桌面壳（Rust + Tauri/WebView2）：`src-tauri/` Rust 工作区、`sidecar/` Node 侧车、`scripts/stage-payload.sh` 打包暂存 |
| `dsh-desktop/scripts/` | 构建期补丁、自愈模块；测试统一放 `scripts/test/` |
| `dsh-desktop/assets/plugins/` | 内置 Cordis 插件包（v1.0.0 内置线：随安装包分发） |
| `.github/workflows/tauri-release.yml` | Tauri 三平台发布流水线（tag 触发） |

## 开发环境

- Windows 为主平台（桌面壳是 Tauri + WebView2，集成测试依赖桌面环境；macOS/Linux 可做纯函数开发）
- Node.js ≥ 22（本地 v24 亦可）
- 初始化与启动：

  ```powershell
  cd dsh-desktop
  npm ci

  # 开发运行（入口在桌面壳侧；仓库根没有 npm start 脚本）
  cd ..\dsh-tauri\src-tauri\src\app
  cargo run
  ```

## 代码组织约定

- **插件**：独立 npm 包放 `dsh-desktop/assets/plugins/<name>/`，通过 `cordis.patch.yml` 声明对宿主的扩展点
- **Agent 预设**：v1.0.0 纯净线不携带预设——`assets/agent-presets` 源树、预设写入器
  （`scripts/install-minimal-win-preset.js`）、落点自愈（`scripts/lib/preset-heal.js`）与 boot 的
  `presets` 步已整体拆除，客户端不再写任何预设文件。用户侧落点仍是内核自行发现的用户根
  `<DSH_HOME>/.agent-presets/<id>/`（`agent.cordis.yml` + `preset.yml`），由用户放文件，
  升级路径不得清除。保留的兼容网是内核 agent-preset 回落补丁
  （`scripts/lib/patch-adapters.js`，`minimal-win` → `minimal`），护老用户 resume，不要拆。
  要内置预设等于重新引入整套子系统，请先开 issue 议形态（交付面口径、
  `stage-payload.sh` 与 `tauri-release.yml` 的 assets 剔除清单（现在只剩 `plugins`）、
  boot 链的五步形状与 `data-flow.md §3` 步骤契约都要同迁）
- **主进程**：拆分独立脚本（watchdog、session-watcher、updater、balance、wsl-backend 等），通过 IPC/事件与桌面壳（`dsh-tauri/` Rust 侧 + `sidecar/` Node 侧车）协作，不要堆叠进单文件
- **构建期补丁**：集中在 `scripts/patch-*.js`，按功能域命名，便于单独启用/禁用
- **可单测纯函数**：收敛到 `scripts/lib/`（如 `patch-engine.js`、`versions.js`、`github-release-assets.js`），网络与文件编排留在调用方，方便 `node --test` 覆盖
- **测试**：统一放 `scripts/test/`，按粒度命名（见下）

## 测试要求（硬性）

> 任何**功能新增或 bug 修复，必须配套自动化测试**。纯逻辑改动不给测试、bug 修复不带回归用例的 PR，直接打回。

| 场景 | 要求 | 运行命令 |
| --- | --- | --- |
| 新增纯函数 / 模块 | `scripts/test/unit-*.test.js`，覆盖主分支 + 边界 + 错误分支 | `npm test` |
| bug 修复 | 必须带回归用例，测试头部注明 issue 号（参照 `unit-slot-compat` 的 #87） | `npm test` |
| 桌面功能逻辑 | `scripts/test/desktop-*.test.js` | `npm test` |
| 崩溃 / 自恢复场景（真机启动链） | 在 `scripts/test/ta3-boot-chain.test.js`（启动链一条龙）或 `ta13-soak-*.test.js`（持久 / 盘故障 soak）追加场景 | `npm test` |
| 桌面壳（Rust / sidecar） | `dsh-tauri/src-tauri` 下 `cargo test`；sidecar 用 `node --test dsh-tauri/sidecar/cli.test.js` | 见左 |

测试守则：

- 全部测试必须落在**隔离临时目录**（DSH_HOME / userData），绝不触碰真实 `~/.dsh` 与 `%APPDATA%\DSH Desktop`
- 提交前必须本地全量跑通：

  ```powershell
  node scripts/check-syntax.js   # 语法预检（prepack / predist 构建时也会自动执行）
  npm test                       # node --test 自动发现 scripts/test/*.test.js
  ```

- 已知：`unit-updater` 两个 fallback 用例（`0.0.0` 兜底）仅在 `@deepseek-ai/dsh` **未安装**时真正运行；本地/CI 装好依赖会显示 `skip`，属预期而非失败。

## PR 流程

### 1. 切分支

从 `main` 拉取，命名规范：

```
feature/<简述>    新功能
fix/<简述>        bug 修复
refactor/<简述>   重构
docs/<简述>       文档
```

### 2. 提交信息

- **单一职责**：一次提交只做一件事，避免夹带无关改动
- 格式：`<类型>: <简述>（#issue号）`，类型取 `feat / fix / refactor / perf / docs / test / chore / build`

### 3. 开 PR

- 使用仓库内置模板（`.github/pull_request_template.md`），逐项填写
- 关联 issue 用 `Closes #N`
- **必须勾选"测试与验证"清单**，并附上 `npm test` 实测结果（如 `357 pass / 0 fail / 2 skip`）

### 4. CI 检查（GitHub）

push 后等待 `ci` workflow 通过（语法预检 + 全量单测）。**CI 红灯时先修复，再请求 review。**

### 5. Review 迭代

- 维护者会在 PR 内逐条评论；按反馈 push 到同一分支即可
- 保持 diff 聚焦：review 过程中不要再夹带无关重构或格式化

### 6. 合并

- 由维护者 squash merge（一个 PR 合入为一个提交到 `main`）
- 合并后删除源分支

### 7. 发布（仅维护者）

打 tag（如 `v0.3.11`）推送到 GitHub → `release.yml` 自动构建三平台五产物（win/mac/linux × x64/arm64）→ 在 GitHub Releases 创建 Release 并配置资产。`main` 分支保持与 Gitee 镜像同步。

## 双端仓库

项目同时镜像到 [GitHub](https://github.com/myYangyunfan/dsh_desktop) 与 [Gitee](https://gitee.com/my-yang-yunfan/dsh_desktop)。PR 在任一端提交均可，流程一致，合并后两边 `main` 保持同步。

## 提交前自检清单

- [ ] 新增/修改的功能有对应测试（bug 有回归用例）
- [ ] `node scripts/check-syntax.js` 通过
- [ ] `npm test` 全绿
- [ ] 涉及 UI 的改动附了截图
- [ ] 涉及打包/构建的改动注明了验证方式（如 `npm test`、`bash dsh-tauri/scripts/stage-payload.sh`、`cargo test --manifest-path dsh-tauri/src-tauri/Cargo.toml`）
- [ ] 没有把 `.tmp-*`、`_*.js/.diff` 等临时文件带进提交