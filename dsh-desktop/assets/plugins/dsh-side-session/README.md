# dsh-side-session — DSH 临时会话

DSH（DeepSeek Harness）**临时会话**插件：基于**当前主对话上下文 + agent 触及的文件**，
在**独立悬浮窗**里发起**不污染主会话**的临时追问。

## 功能（v0.3.0）

- **独立悬浮窗**（无侧栏停靠形态）：`position:fixed` 可拖拽移动、右下角缩放手柄；
  启动不自动弹出，由左下角 💬 图标 / `Ctrl+Shift+S` / `/side-session` 斜杠命令唤起。
- **自动导入主对话上下文**：打开即自动加载当前会话的对话记录 + 触及文件
  （解析 `session.jsonl.zstd` 日志，实测准确）；主对话变化时**事件驱动缓存失效** + 2s 轮询刷新。
- **实时显示当前会话模型**：浮窗头部与上下文卡实时展示当前会话实际使用的
  provider/model（如 `opencode-go/deepseek-v4-flash`），并标注 DSH 当前默认
  （`agent-default-model`）；模型切换即时刷新（meta 指纹含 provider/model）。
- **上下文长度三档**（设置 → 临时会话 → 上下文长度，选择后点**确定**生效；
  仅当数值变化时才拉取全量上下文，轮询开销极小）：
  - 1 标准：120 条 / 40K 字符；24 文件 / 单文件 24KB / 合计 200KB
  - 2 加长（默认）：600 条 / 200K；80 文件 / 64KB / 800KB
  - 3 完整：5000 条 / 2M；300 文件 / 256KB / 4MB（最接近通读全文）
- **流式回答 + Stop 按钮**：回答可中止（AbortController）；浮窗隐藏时暂停轮询（省资源）。
- **三种回答引擎**（互斥、持久化、即时切换）：
  1. 复用 dsh 全局 Key（默认）——**自动读取 DSH 当前默认供应商**（`settings.yaml`
     `agent-default-model` + `llm-pi-ai.providers.<p>.apiKeyEnv`），按供应商解析
     环境变量 / `$DSH_HOME/.credentials.yaml` 的对应 key 与 OpenAI 兼容端点；
     不再只认 `DEEPSEEK_API_KEY`（支持 deepseek / opencode-go / openai / groq /
     openrouter / together 等内置表；baseURL 缺失或非 OpenAI 协议时给出明确指引）
  2. 插件自带 Key（apiKey / model / endpoint，secret 持久化）
  3. 走 dsh 宿主 LLM（`ctx.llm.stream`，不读任何 key；失败时错误透传到 UI）
- 主界面同款 UI（`--dsw-alias-*` 设计令牌，深浅主题自动跟随）；输入框复刻官方 Composer。

## 设置

「设置 → 临时会话」：回答引擎模式（1/2/3）+ mode2 的 API Key/model/endpoint + **上下文长度**（三档）。

## 安装 / 加载

```bash
dsh plugin --profile <name> add <本仓库 git 地址>#<分支>
# 或复制到 ~/.dsh/profiles/<name>/node_modules/@dsh-external/dsh-side-session/ 并重启
```

## 文件结构

```
package.json        # 含 dsh.client.inject / platform 声明
dsh.plugin.json      # 插件描述
cordis.patch.yml     # 服务端加载（insert 块）
lib/index.js         # 服务端：设置节 + /context + /ask 流式代理 + 日志解析 + 事件缓存失效
lib/client.js        # 浏览器 bundle：Store + 悬浮窗 + 拖拽/缩放 + 三模式 + 流式 UI（零构建）
```

## 安全与限制

- 路由仅限回环（`isLoopback`）；API Key 走 settings secret role。
- 大文件注入前先 `stat`，二进制跳过、超大文件只读前 N KB（防 OOM）。
- 「浮窗」为页内可拖拽自由浮层（position:fixed），非独立 OS 窗口。
- 上下文数据源为会话日志解析（`session.jsonl.zstd` 属平台实现细节，升级后若格式变化需适配）。

## 变更记录

- **0.3.0**（2026-08-18）：**模式 1 改为「当前会话供应商感知」**——不再只认
  `DEEPSEEK_API_KEY`，按实时 `agent-default-model` 的 provider 解析
  `llm-pi-ai.providers.<p>.apiKeyEnv`（settings.yaml）→ 环境变量 /
  `.credentials.yaml` 取 key，并匹配内置供应商表（deepseek / opencode-go /
  opencode / openai / openrouter / groq / together…）的 OpenAI 兼容端点；
  已知表未覆盖或非 OpenAI 协议时给出明确指引（配 baseURL 或转 mode3/2）。
  新增**实时模型显示**：浮窗头部 + 上下文卡展示当前会话 provider/model 与
  DSH 默认（agent-default-model），meta 指纹含 provider/model 即时刷新。
- **0.2.3**（2026-08-16）：上下文长度切换改为**选择暂存 + 确定按钮**（不再每改即写设置，
  消除切换卡顿）；新增 `?meta=1` 轻量轮询端点（只回计数与指纹，客户端指纹变化才拉全量，
  大幅降低主对话变化时的轮询开销）。
- **0.2.2**（2026-08-16）：上下文长度三档（标准/加长/完整）；删除侧栏停靠死代码与
  无效的面板宽度设置；默认不自动弹出；事件驱动缓存失效替代无效的实时订阅猜测；
  mode3 错误透传；文件读取 stat + 二进制跳过；缓存 LRU 上限；Stop 按钮；
  context 响应补充 provider/model。
- **0.2.0**（2026-08-15）：独立浮窗形态（此前为右缘停靠，已按用户要求移除侧栏样式）。
- **0.1.0**：初版（右侧自绘固定面板 + 撕出浮窗按钮 + 三模式引擎）。
