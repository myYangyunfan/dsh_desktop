# WSL 托管模式 + 设置 UI 验证手册

> 适用版本：本仓库 HEAD（含 wsl-backend.js、dsh-wsl-settings 设置页插件、sync-companion-plugins.js）。
> 前提：Windows 10/11 + WSL2（发行版内可用 `sh -lc 'node --version && npm --version'`）。

## 0. 本次交付清单

| 文件 | 内容 |
| --- | --- |
| `dsh-desktop/wsl-backend.js` | WSL 托管后端：发行版探测、bootstrap npm 安装、启动/停止（pid 文件）、更新/回退、状态快照 |
| `dsh-desktop/assets/plugins/dsh-wsl-settings/` | 设置页「WSL 后端」栏（模式切换、发行版/目录配置、状态与错误展示） |
| `dsh-desktop/scripts/sync-companion-plugins.js` | 独立插件同步脚本（给任意 dsh 的 web profile 装壳的配套插件） |
| `dsh-desktop/main.js` | backend local/wsl 双模式接线 + `dsh:wsl-config*` IPC + 插件清单 |
| `dsh-desktop/preload.js` | `window.dshDesktop.wsl` 桥（getConfig/saveConfig/recheck） |

## 1. 准备（Windows 侧）

1. 在 **Windows** 上拿到本仓库（直接 clone 或从 WSL 侧拷出；构建必须用 Windows 的 Node/npm）：
   ```powershell
   cd dsh-desktop
   npm install
   npm run fetch-runtime     # 内置 node.exe + npm CLI
   ```
2. 开发模式启动（验证用，带调试日志）：
   ```powershell
   $env:DSH_DESKTOP_DEBUG = '1'
   npm start
   ```
   或打包便携版后双击验证：`npm run dist` → `dist/DSH-Desktop-*-portable-x64.exe`。
3. 日志位置：便携版 `data\logs\`，安装版 `%APPDATA%\DSH Desktop\logs\`；菜单「打开日志目录」可直达。关键文件：`desktop.log`（`[wsl]` 前缀行 = WSL 后端动作）、`dsh-web.log`、`update.log`。

## 2. 分步验证

### 2.1 local 模式回归（默认路径不能坏）

- [ ] 不配置任何东西直接启动：窗口加载内置 dsh 的 Web UI（旧行为）；
- [ ] 「关于 DSH Desktop」显示 agent 版本 + 来源「内置」；
- [ ] ⋯菜单「检查 dsh 更新」「检查客户端更新」「会话完成通知」「关闭时最小化到托盘」全部可用；
- [ ] 退出应用后任务管理器无残留 node/dsh 进程（`taskkill /T` 路径）。

### 2.2 设置页「WSL 后端」栏

- [ ] 打开设置页，左侧/栏目中出现「**WSL 后端**」（在「自定义提示词」附近）；
- [ ] 状态卡显示「当前生效：local —— 本机内置 dsh」，并且有发行版、安装目录、node/npm 版本（local 模式下也会按保存值探测一次；WSL 没装会显示红色检测错误——这也是预期）；
- [ ] 「重新检测」按钮刷新状态卡。

### 2.3 切换到 wsl 模式（核心流程）

1. [ ] 设置页选「wsl —— 在 WSL 内安装并更新 dsh」→「保存」→ 页面显示「已保存，重启应用后生效」；
2. [ ] **负例**：安装目录填 `C:\foo`（非 `/`、`~` 开头）或 `~/.dsh desktop`（含空格）→ 保存被拒绝并显示中文错误；
3. [ ] **负例**：`wsl --shutdown` 后点保存 → 预检失败，错误显示在页面（再 `wsl` 启动恢复）；
4. [ ] 重启应用：加载页停留期间后台在装 agent（首次）——`desktop.log` 出现 `[wsl] agent 缺失，开始在 WSL 内安装…`，约 2–3 分钟后 `[wsl] …已安装到 WSL`；
5. [ ] 窗口自动加载 WSL 里的 dsh web（地址栏不可见；`desktop.log` 有 `dsh web:` 就绪 URL，端口随机）；
6. [ ] 「关于」显示「WSL 托管（~/.dsh-desktop）」+ 真实 agent 版本；设置页状态卡 agent 显示已安装版本、无红色错误。

### 2.4 数据面与插件（wsl 模式）

- [ ] WSL 内 `cat ~/.dsh-desktop/profiles/web/cordis.patch.yml` → 11 条 `- insert:`（余额/文件/终端/浮窗/插件市场/提示词/思考/识图/WSL 设置等）；
- [ ] UI 中：对话底部余额小部件、详情面板「文件」标签页（diff 查看）、「终端」标签页（WSL 内走 `sh -i`，执行 `pwd` 应显示 WSL 路径）、会话浮窗、插件市场、设置页「自定义提示词」可用；
- [ ] WSL 内目录布局正确：`agent/` `agent-prev/`（更新后）`agent-staging/`（仅安装期间）`profiles/` `sessions/` `dsh.pid`；
- [ ] 会话完成 → Windows Toast 通知弹出（经 UNC 读 WSL 会话日志）；
- [ ] 「文件」视图的**还原/打开**应被安全栅栏拒绝（WSL 会话不适用，预期行为；diff 查看不受影响）。

### 2.5 退出与重启服务

- [ ] 退出应用 → WSL 内 `pgrep -f 'bin.js web'` 无残留、`dsh.pid` 已删除（**不要**用 `wsl --terminate` 测试，那会杀整个发行版）；
- [ ] 插件市场安装/卸载插件后点「重启服务」→ 服务在 WSL 内重启、窗口重载到新端口（`desktop.log` 有 `WSL 托管模式：在 … 内启动 dsh web` 新行）。

### 2.6 自动更新与回退

- [ ] 「检查 dsh 更新」：有新版时弹窗（详情含「WSL 托管模式：安装在 ~/.dsh-desktop/agent」）→ 同意 → WSL 内 npm 安装 → 重启生效；更新后 WSL 内出现 `agent-prev/`；
- [ ] 回退演练（可选）：WSL 内 `mv ~/.dsh-desktop/agent ~/.dsh-desktop/agent-broken && mkdir ~/.dsh-desktop/agent` → 重启应用 → 启动失败弹窗出现「回退到上一版本并重试」→ 点回退恢复正常（演练后自行恢复目录）。

### 2.7 切回 local

- [ ] 设置页选 local → 保存 → 重启 → 回 2.1 行为；退出应用后 WSL 内无残留进程。

### 2.8 WSL 侧独立脚本（可选，与后端模式无关）

```bash
cd /home/ezio/workspace/dsh_desktop   # 在 WSL 里
node dsh-desktop/scripts/sync-companion-plugins.js ~/.dsh --dry-run   # 先预览
node dsh-desktop/scripts/sync-companion-plugins.js ~/.dsh --with-patches
# 重启你自己的 dsh web（checkout: pnpm dsh web；npm 版: dsh web）
```

- [ ] 重启后你的 dsh 设置页出现「WSL 后端」等全部配套栏目；补丁日志提示「已应用/无需变更」幂等。

## 3. 已在 WSL 内自动化验证过的项（无需重复）

- [x] `wsl.exe` 参数模式（`-e sh -lc` 单词传参）与 UTF-16 发行版列表解析；
- [x] bootstrap：WSL 内 `npm install @deepseek-ai/dsh` 530 包 ~2 分钟、无原生编译错误；
- [x] 启动：URL 就绪行解析、全新 home 首次启动持续 200、重启启动稳定；
- [x] 插件：首次启动即加载（提示词/思考初始化日志 + 文件/终端路由 400 已挂载）、`/plugins/@deepseek-ai/dsh-wsl-settings/client.js` bundle 构建发布 200；
- [x] 清理：pid 文件 SIGTERM → 退出码 0、pid 文件删除；
- [x] 补丁：首次启动后 `--with-patches` 幂等应用；
- [x] 全部 JS 语法检查（main/preload/wsl-backend/sync/插件 client+host）。

## 4. 常见问题

| 现象 | 处理 |
| --- | --- |
| 窗口加载后白屏/加载页停留超 60s 弹失败框 | 看 `dsh-web.log`；多为 localhost 转发不通 → `.wslconfig` 加 `[wsl2] networkingMode=mirrored` 后 `wsl --shutdown` 重启（注意会中断 WSL 内会话） |
| 保存 wsl 配置时报「未检测到 WSL 发行版」 | 确认 `wsl -l -q` 有输出；或显式填 `wslDistro` |
| 保存报「未找到可用的 node/npm」 | WSL 内装 Node：`sudo apt install nodejs npm` 或 fnm/nvm；注意必须是**登录 shell** 可见（`wsl sh -lc 'node --version'`） |
| 首次切换后安装很久 | 正常（完整依赖闭包 + Linux 原生模块预编译包）；`desktop.log` 有 `[wsl] npm:` 进度；失败会在日志尾部留 npm 输出 |
| 更新失败 | 自动保留旧版；`update.log` 与 WSL 内 `~/.dsh-desktop/agent-staging` 残留会被清理 |
| 「文件」视图还原按钮无效 | 预期：WSL 会话的还原/打开被安全栅栏拒绝，仅 diff 查看可用 |
| 旧配置里残留 `remoteUrl`/`backend: "remote"` | remote 模式已移除：`backend=remote` 回落 local 并记日志，`remoteUrl` 被忽略 |
| 设置页该栏显示「仅在 DSH Desktop 客户端中可用」 | 正常：纯浏览器打开 Web UI 时无壳桥；用 DSH Desktop 窗口打开即可 |
| `wslInstallDir` 想共享你自己的 dsh 会话 | 显式设为 `~/.dsh`（风险自负：两个 dsh 版本会互相改写 profile） |

## 5. 快速回归清单（发版前过一遍）

- [ ] local 模式：启动/更新菜单/托盘/退出清理
- [ ] 设置页「WSL 后端」：状态卡、正负例校验、保存提示重启
- [ ] wsl 模式：首次 bootstrap → 加载 UI → 插件齐全 → 退出无残留 → 重启秒开
- [ ] 更新链路：检查/安装/重启生效（含 agent-prev）
- [ ] 设置页切回 local 后行为恢复
- [ ] 语法检查：`node --check` × 5 个文件
