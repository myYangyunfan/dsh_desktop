# alpha.1 → alpha.2 内核升级冲击评估（v0.6.0 M2 输入）

> 评估方法：官方仓库 `deepseek-ai/deepseek-harness` 两 tag 浅克隆 + 全量文件级 diff
> （234 提交、~1500 变更文件）× 与桌面壳 25 个补丁目标包逐一对照。评估脚本产出与
> 分类为**包级**判定（文件级锚点红黄绿细分为 M2 执行期工作）。

## 1. 变更面总览

- **~1500 个文件变更**，官方 234 提交；关键重构：
  `refactor(session): migrate host state reads to projections`（会话域读路径迁移到
  projection 层——**全部会话域补丁的重靶点**）。
- **25/25 个补丁目标包全部受影响，无一干净**。结构性变化两处：
  - `dsh-host-apiproxy` 已分解：RPC 网关现位于 `packages/api/gateway`（包级改名）
  - `dsh-web-frontend` 在 alpha.2 仓库目录命名不同（待 M2 时定位构建产物映射）

## 2. 补丁目标包 × 变更面分类表

| 包（补丁目标） | alpha.2 变更文件数 | 仓库位置 | 涉及的桌面补丁（非穷举） |
|---|---|---|---|
| dsh-api-session-controller | **44** | packages/api/session-controller | session 域 RPC 补丁（deleteSession 等）、client-connection 相关 |
| dsh-client-ui-conversation | **23** | packages/client/ui-conversation | 流式渲染/消息相关补丁 |
| dsh-client-ui-workspace | **20** | packages/client/ui-workspace | 项目目录菜单、会话行菜单注入 |
| dsh-client-connection | **18** | packages/client/connection | unary 响应 schema / 门面补丁（deleteSession 客户端面） |
| dsh-agent-presets | **18** | packages/preset/agent-presets | agent-presets 回落与 roots 补丁 |
| dsh-cordis-client-runner | **12** | packages/extensions/cordis-client-runner | 客户端 runner / keyed-slot 兼容 |
| dsh-llm | **12** | packages/llm/llm | 思考强度 / reasoning-effort 补丁 |
| dsh-llm-deepseek | **7** | packages/llm/llm-deepseek | reasoning_effort wire 补丁 |
| dsh-api-settings-controller | **6** | packages/api/settings-controller | 设置写入 resilience 相关 |
| dsh-system-prompt | **6** | packages/core/system-prompt | system-prompt / skill 目录补丁 |
| dsh-subagent-claude-code | **5** | packages/subagent/subagent-claude-code | subagent 相关 |
| dsh-terminal-bash | **4** | packages/terminal/terminal-bash | terminal 补丁 |
| dsh-tool-bash | **4** | packages/shell/tool-bash | shell 域补丁 |
| dsh-tool-pwsh | **3** | packages/shell/tool-pwsh | pwsh 域补丁 |
| dsh-client-ui-skill | **3** | packages/client/ui-skill | skill UI |
| dsh-app-boot | **2** | packages/boot/app-boot | boot 链（healProfilesModuleFallback 等） |
| dsh-session-persistence-jsonl | **2** | packages/session/session-persistence-jsonl | **会话头扫描缓存 + TTL 补丁（高优先重靶）** |
| dsh-tool-bash-persistent | **2** | packages/shell/tool-bash-persistent | 持久 shell |
| dsh-tool-pwsh-persistent | **2** | packages/shell/tool-pwsh-persistent | 持久 pwsh |
| dsh-host-directory-picker-auto | **2** | packages/host/directory-picker-auto | 目录选择器 |
| dsh-attachment-local | **1** | packages/attachment/attachment-local | 附件 |
| dsh-client-ui-slots | **1** | packages/client/ui-slots | slots |
| dsh-skill-filesystem | **1** | packages/skill/skill-filesystem | **skill 目录 roots 兼容补丁（f2b8a8bd）** |
| dsh-host-apiproxy | **已分解** | packages/api/gateway（新家） | 旧宿主补丁已全部退役（v0.5.6），无重靶负担 |
| dsh-web-frontend | 命名待定位 | packages/web/* | compat 构建输入（CI rc7 client 包） |

## 3. 风险分级（M2 执行顺序建议）

1. **红（高优）**：`dsh-session-persistence-jsonl`（会话头扫描/TTL 补丁——用户数据面）、
   `dsh-api-session-controller`（44 文件重构 + deleteSession 宿主 RPC——刚修好的
   删除对话功能就在这里）、`dsh-client-ui-workspace`（会话行菜单注入）。
2. **黄（中）**：`dsh-llm`/`llm-deepseek`（思考强度）、`dsh-agent-presets`（预设回落
   与 roots）、`dsh-cordis-client-runner`（keyed-slot）、`dsh-app-boot`（heal 链）。
3. **绿（低，锚点大概率存活）**：逐文件锚点比对后确认（M2 执行期产出绿表）。

## 4. 升级建议

- **顺序**：先 M1 收尾（kernel-pin 接线 fail-closed + patch-surface 快照机制——
  TUI 团队同款，见 tui-adapter-protocol.md §4）→ 换 vendor tarball 至 alpha.2 →
  逐红黄包重靶 → `verify:patch-surface` 同款快照比对进 CI → 全量测试。
- **工作量**：44/23/20/18 文件级的四处重构包是主要成本；projections 重构若改变
  会话读路径语义，会话域补丁可能需要**语义重写**而非锚点平移。
- **风险**：官方 developer preview 破坏性变更随时发生——升级完成后立即以
  kernel-pin 钉死 alpha.2，并评估是否跳过后续 alpha 直取 beta/rc。

## 5. 评估产物

- 文件级变更清单：Temp/dsh-alpha-eval/diff-all.txt（~1500 行，含 alpha1/alpha2 双树）
- 分类脚本与原始输出：见会话记录（包级红黄表即本文 §2）
