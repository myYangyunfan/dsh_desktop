# 密钥流向与遥测说明（安全审计 2026-08）

面向用户的密钥安全说明。审计范围：桌面壳（main.js / balance.js / updater /
client-updater / plugin-manager）、内核（@deepseek-ai/dsh 0.1.1-rc.1 全家桶）、
内置插件（assets/plugins/ 下全部包）。

## 你的 API 密钥存在哪里

| 位置 | 内容 | 保护 |
| --- | --- | --- |
| `~/.dsh/.credentials.yaml` | DEEPSEEK_API_KEY（Models 页写入） | 0600 + 0700 目录；POSIX 启动时校验 group/other 位并拒绝启动；Windows 由用户目录 ACL 保护 |
| 环境变量 `DEEPSEEK_API_KEY` | 启动环境注入 | 只读层，优先于文件 |
| `~/.dsh/.env`、项目 `.env` | 兜底层 | 低于受管存储 |

密钥**不会**被写入 settings.json、app 日志或会话日志。

## 密钥会被发到哪里（完整出网点清单）

内核与壳层的全部网络出口（源码逐包核查，2026-08）：

- `https://api.deepseek.com`（+ `/anthropic/v1`）— 唯一默认 API 目标；密钥仅出现在
  `Authorization: Bearer` 请求头，发往 `llm-deepseek.baseURL ?? 环境变量 ?? 官方域`。
- `https://api.deepseek.com/user/balance` — 余额查询，唯一出口在插件宿主半边
  `assets/plugins/dsh-balance/lib/balance-core.js`（自制壳遗留线 `dsh-desktop/balance.js`
  已于 2026-10 整体拆除，同月拆线后不再有第二条会发这个请求的代码，见
  `docs/balance-architecture.md` §1.2）；跨主机/降级 http
  的重定向会剥离 Authorization。
- 更新链（GitHub api / gitee api / registry.npmjs.org / registry.npmmirror.com /
  codeload.github.com 及 gh 镜像）— **请求不带任何凭据**，只有 User-Agent。
- 用户显式配置的第三方端点（自担风险，见下）：
  - openclaw-bridge 的 customBaseURL（如 siliconflow，独立 key）；
  - side-session 摘要模型的自配端点。

  > 2026-08 审计时该清单还有一条「识图插件 `dsh-vision` 的 VLM baseURL（默认 open.bigmodel.cn，
  > 独立 apiKey）」；该插件已于 2026-10-07 退役、不再随包，故从现行清单移出（出网点历史记录保留在此）。

**结论：没有任何代码路径把 DEEPSEEK_API_KEY 发往 deepseek 官方域与用户自配端点之外。**

## 遥测（session telemetry）

- 默认 **DISABLED**（dsh-base/cordis.patch.yml：`mode: DSH_TELEMETRY_MODE || 'DISABLED'`）。
- 仅当显式设置 `DSH_TELEMETRY_MODE=FULL`（或 FEEDBACK_ONLY）时，会话事件经 OTLP 发往
  `DSH_TELEMETRY_OTLP_URL`（默认 `https://harness-telemetry.deepseeksvc.com/v1/logs`）。
  FULL 模式包含会话事件内容（你的提示词/模型回复/工具结果）；FEEDBACK_ONLY 仅在
  你点「反馈」时回放对应片段。附带的标识只有**匿名随机 user.id**
  （@deepseek-ai/dsh-anonymous-user-id），不含 API 密钥、不含环境变量。
- 彻底关闭（推荐隐私敏感用户设置，即使从未开启过）：

  ```
  # Windows（ PowerShell，用户级 ）
  setx DSH_TELEMETRY_DISABLED 1
  # macOS / Linux
  echo 'export DSH_TELEMETRY_DISABLED=1' >> ~/.profile
  ```

  任何非空值（含 `0`/`false`）都会在内核装配层把 `session-telemetry-otel` 行整个
  禁用（off-by-mistake 优先于 on-by-mistake 的设计）。

## LAN 网关（dsh-mini 手机桥）

- 默认监听 `0.0.0.0:46322`（可用设置关闭 LAN 或改端口）；**所有非本机来源必须携带
  128 位随机 bridge token**（`~/.dsh/dsh-mini/token.txt`，扫码配对时发给手机）。
  公网 Host 在未开启「允许外网访问」时一律 403。
- 安全建议：不用手机桥时在设置中关闭 LAN 网关；怀疑 token 泄漏（例如分享过
  dsh-web.log）时用 设置 → 网关 → 重置令牌。
- 2026-08 修复：启动日志不再明文打印 token（仅前 4 后 4 位）；token 比对改为恒时。

## 供应链说明（「很多 GitHub 下载的组件」）

- 内核随客户端整体分发（v0.5.3 起无独立 npm 内核更新链；客户端更新走
  GitHub/Gitee Release 安装包，见下）。
- 壳层插件管理器：npm dist.integrity（sha512）或 GitHub Release API digest（sha256），
  镜像下载同样过校验，无校验和的资产直接拒绝。
- 壳层客户端自更新：GitHub/Gitee Release 安装包，当前仅 64MB 下限 + content-length
  完整性，无签名（已知差距，规划中）。
- 第三方插件安装（**内置市场与插件中枢已随 v1.0.0 退役**）：`dsh-community-market`（可视化插件市场）与
  `dsh-hub`（插件中枢，仅用于挂载市场与 `graph-memory`）已于 2026-10-07 按用户点名移除，客户端不再提供
  页面内的搜索/安装/更新入口。**风险论述不变**：经 `dsh plugin --profile web add <包名或 github 源>`
  或 `dsh-super-injector` 的 `dev_*` 注入装进来的第三方插件，**属主动安装任意代码**——插件在
  内核进程内运行，理论上可读 `~/.dsh` 与调用模型（= 花你的钱）。请只装信任来源的插件。
  历史：2026-08 曾对内置市场的下载链做加固（源码包从官方 codeload 优先下载 + 顶层目录锚点校验），
  该下载链随市场/插件中枢一并退役；`dsh plugin` CLI 的完整性校验行为以内核官方实现为准。
