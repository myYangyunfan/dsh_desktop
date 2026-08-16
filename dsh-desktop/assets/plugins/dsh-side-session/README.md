# dsh-side-session

DSH（DeepSeek Harness）侧边临时会话插件 —— 复刻 Codex 的「side session」：
基于**当前会话上下文 + agent 触及的文件**，在右侧面板（可撕出浮窗）里发起
**不污染主会话**的临时追问。

## 功能（v0.2.1）

- **独立浮窗**：页内可拖拽/缩放的自由浮层（position:fixed），默认出现在页面
  右缘（top:80px / right:80px），可随意移动、右下角缩放；浮窗状态仅内存，
  重载后回默认位置。
- **不自动弹出**：默认收起、不遮挡主界面；点击左侧主栏 footer 的 💬 图标或
  按 **Ctrl+Shift+S** 唤起浮窗。
- **主界面同款 UI**：同一套 `--dsw-alias-*` / `--dsw-specific-*` 设计令牌；
  用户消息复刻官方气泡（`--dsw-specific-bubble`、radius 22px），助手消息复刻
  官方整宽 markdown 排版（`--dsw-font-markdown-base`、代码块/行内代码令牌），
  输入框复刻官方 Composer 卡片（`--dsw-specific-input-major`、radius 22px、
  聚焦描边），按钮为官方图标按钮风格；深色/浅色主题自动跟随。
- 自动捕获当前会话的整段对话记录 + 本会话所有被写/改/删/读的文件（解析会话日志 `session.jsonl.zstd`）。
- 全局单例 Store，切载体不丢消息；浮窗状态仅内存，重载强制回右侧面板。
- 会话头部 💬 按钮（左侧主栏 footer 图标）直接唤起；全局快捷键
  **Ctrl+Shift+S** 唤起浮窗；设置页新增「侧边临时会话」节（三模式切换 +
  mode2 的密钥 / 模型 / 端点 + 面板宽度）。
- 三种回答引擎（互斥、持久化、即时切换）：
  1. **复用 dsh 全局 Key**（默认）：服务端读 `env DEEPSEEK_API_KEY` → `$DSH_HOME/.credentials.yaml`，base 用 `env DEEPSEEK_API_BASE`（默认 `https://api.deepseek.com`），模型读 `$DSH_HOME/settings.yaml`。
  2. **插件自带 Key**：在设置里填写 apiKey / model / endpoint（secret，持久化）。
  3. **走 dsh 宿主 LLM**：客户端不碰任何 key，同源调用 dsh 主机暴露的 `POST /v1/chat/completions`；未就绪提示「DSH LLM服务未启动，请切换其他模式」。
- 流式输出（markdown 渲染 + 闪烁光标），三种模式 UI 一致。

## 设置

「设置 → 侧边临时会话」：
- 回答引擎模式（1/2/3）+ mode2 的 API Key / model / endpoint；
- **停靠面板宽度**（280–640px，默认 380），重启后记住。

## 安装 / 加载

两种方式（任选其一）：

### A. 作为 companion 插件随客户端分发

把本目录整体放入 DSH Desktop 仓库的 `dsh-desktop/assets/plugins/dsh-side-session/`，
客户端启动时 `sync-companion-plugins.js` 会把它同步进 web profile 并据 `cordis.patch.yml` 挂载。

### B. 独立插件（插件市场 / 手动）

```
dsh plugin --profile <name> add <本仓库 git 地址>#<分支>
# 或把本目录复制到 ~/.dsh/profiles/<name>/node_modules/dsh-side-session/ 并手动在
# cordis.patch.yml 加一条 - insert: { id: side-session, name: 'dsh-side-session', config: {} }
```

加载后重启 `dsh web` 即可。

## 文件结构

```
package.json        # 含 dsh.client.inject / platform 声明
dsh.plugin.json      # 插件描述
cordis.patch.yml     # 服务端加载（insert 块）
lib/index.js         # 服务端：设置节 + /context + /ask 流式代理 + 会话日志解析
lib/client.js        # 浏览器 bundle：Store + 右缘面板/浮窗 + 拖出/缩放 + 三模式 + 流式 UI（零构建）
```

## 已知限制 / 待确认

- **「浮窗」为页内可拖拽自由浮层**（position:fixed），非独立 OS 窗口；如需真·独立窗口需宿主额外桥（`dsh-float-window` 的 Electron 桥）。
- v0.2.0 曾计划的「右缘停靠 + 主布局挤压」形态在实现中按用户要求移除，当前为**纯浮窗形态**：浮窗始终独立于主布局，互不影响。
- mode3 依赖 dsh 主机 `/v1/chat/completions` 端点；不可用时按 Spec 提示切换模式，可用 mode1/mode2 兜底。
- 读取类文件仅 best-effort（取 `tool/call` 的 `path` 字段）。
- 上下文有截断上限（transcript ~120 条/40K 字符；单文件 24KB；文件 200 个），防止 prompt 膨胀。

## 变更记录

- **0.2.1**（修复版）：补全 client.js 被截断的 apply 接线——footer 💬 图标槽
  （sidebar.footer.action）、设置节（settings.section）、会话监视轮询、全局
  快捷键、面板挂载/卸载清理全部生效；默认不自动弹出浮窗（footer 图标或
  Ctrl+Shift+S 唤起）；同步修正 README 与实现一致。
- **0.2.0**（2026-08-17）：右缘停靠 + 主界面向右推开；头部拖出浮窗（跟随鼠标）/
  浮窗缩放/双击收回；UI 全面对齐主界面（官方令牌 + 官方气泡/Composer/markdown
  排版）；新增面板宽度设置。
- **0.1.0**：初版（右侧自绘固定面板 + 撕出浮窗按钮 + 三模式引擎）。