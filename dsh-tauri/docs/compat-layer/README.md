# v0.6.0 兼容层（Compat Layer）— 架构总纲

> 目标：在**桌面壳**（Tauri 壳 + 内置插件 + 运行时补丁）与**官方内核**（`deepseek-ai/deepseek-harness`，MIT 开源）之间建立一层正式的**兼容中间层**。此后官方内核更新，只需要更新/调节兼容层，壳与插件不动。
>
> 状态：**M0 规划中**（本目录 = 设计与研究汇总；两份研究子文档见同目录）。

## 1. 为什么需要这一层

现状（v0.5.7）：壳与内核的适配散落在 51+ 个「外科手术式运行时补丁」里（`scripts/lib/patch-registry.js` + `patch-adapters.js` + 20 余个 `patch-*.js`），每个补丁直接 hard-code 内核包的文件路径与文本锚点。内核一更新（官方 developer preview，破坏性变更随时发生——v0.5.6→0.1.2-alpha.1 升级就重靶了全部补丁），补丁逐一排查重靶，成本高且不可预测。

官方内核现已 MIT 开源（`deepseek-ai/deepseek-harness`，tag 形如 `dsh-v0.1.2-alpha.2`），协议研究已沉淀为可查规范（`Desktop\dshplugin\dsh-std/`：Cordis 插件模型、manifest 三层、ctx seam 表、层级覆盖顺序；`adapter/`：LLM adapter seam 契约）。兼容层 = 把这些**协议规范 + 版本钉 + 适配器**正式化为一个中间层。

## 2. 分层图

```
┌─────────────────────────────────────────────────────────┐
│  桌面壳（Tauri 壳 + 内置插件 dsh-* + 桌面 UX）            │
│  只依赖兼容层的公开契约（下 §3），不直接感知内核版本       │
└───────────────────────┬─────────────────────────────────┘
                        │  兼容层公开契约
┌───────────────────────┴─────────────────────────────────┐
│  兼容层（v0.6.0 新增，本目录设计）                        │
│  ① kernel-pin      内核版本钉：官方 tag ↔ 兼容层版本       │
│  ② composition     组合适配器：manifest 三层映射 + 命门校验│
│  ③ runtime-adapter 运行时适配器注册表：51+ 补丁 → 版本化   │
│     适配器包（内核版本范围 + 锚点 + 语义 + 健康检查）      │
│  ④ seam-validator  契约校验：官方 ctx seam 表（dsh-std/01 │
│     §4）逐项核对 live 注册表（替代硬编码 id 的健康检查）   │
│  ⑤ protocol-bridge 协议桥：TUI 团队 ADAPTER.md 等生态协议  │
└───────────────────────┬─────────────────────────────────┘
                        │  官方内核 0.1.2-alpha.2（精确 pin）
┌───────────────────────┴─────────────────────────────────┐
│  官方内核 deepseek-harness（MIT，developer preview）      │
│  一切皆插件：Cordis 模型 + ctx seam + 配置层              │
└─────────────────────────────────────────────────────────┘
```

## 3. 兼容层公开契约（壳唯一可见面）

| 契约项 | 说明 |
|---|---|
| `kernel.tag` | 本兼容层支持的官方内核 tag（如 `dsh-v0.1.2-alpha.2`），精确 pin，不允许浮动 |
| `kernel.acquisition` | 获取方式：官方仓库源码构建 / 官方资产 / 离线 tarball（现状）——由 kernel-pin 声明 |
| `services.required` | 必须在位的后端服务清单（credentials/settings/llm/session/…/webserver），替代各处硬编码 id |
| `patches.pack` | 运行时适配器包版本（内核版本范围 + 补丁集合） |
| `protocols` | 生态协议适配清单（TUI ADAPTER 等） |

## 4. 组件细化

### ① kernel-pin
- 声明：官方 tag、获取方式、离线包清单哈希。
- boot 时校验实际加载内核版本 == pin 版本，不符即 fail-closed 进恢复页（官方随时破坏性变更，浮动的代价已被 0.1.2-alpha.1 升级实证）。

### ② composition adapter
- 职责：把壳侧 30+ 内置插件的 `dsh.bundle.patch` / `dsh.client` 声明组合成 cordis 配置层（现在散在 `companion-profile.js` / `sync-companion-plugins.js`）。
- **命门校验**（dsh-std/02）：`dsh.bundle.patch`（非 bundlePatch）、客户端插件不得进 `dsh.profile.bundles`、层级覆盖顺序（profile bundles → profile patch → home patch → --patch）。
- 校验失败 = fail-closed 进恢复页（不是 warn）。

### ③ runtime-adapter registry
- 每个 51+ 补丁改写为一个**适配器声明**：`{ id, kernel: {from,to}, targets[], apply(), health() }`。
- 内核升级 = 逐个适配器判定：锚点存活（绿）/ 需重靶（黄）/ 原生化可退役（蓝）/ 内核面重构需重写（红）——评估方法学与首轮结果见 `alpha2-migration-assessment.md`。
- 适配器包按内核 tag 分目录：`adapter-packs/dsh-v0.1.2-alpha.2/`。

### ④ seam validator
- 数据源：官方协议的 ctx seam 表（dsh-std/01 §4：sessions/tools/llm/agents/fs/shell/sandbox/skill/credentials/settings/…）。
- boot 后经 pluginInventory 逐项核对**实际挂载**，替代硬编码行 id 的健康检查（v0.5.7 的「API 网关缺席」误报 = 旧 id 查新内核的教训）。

### ⑤ protocol-bridge
- TUI 团队协议（`ccch1mneyyy/dsh-TUI` 的 ADAPTER.md）：调研见 `tui-adapter-protocol.md`。
- 后续：跨框架 adapter（adapter/03）与 LLM adapter seam（adapter/01）——本壳的第三方模型适配按官方 seam 注册，替代部分运行时补丁。

## 5. 内核版本策略

- 官方 = developer preview：**精确 pin**（`dsh-v0.1.2-alpha.2`），升级是显式动作（换 pin + 重跑适配器判定 + 全量测试），不做浮动。
- 获取方式演进：v0.6.0 沿用离线 tarball（241 个，0.1.2-alpha.2 刷新）；v0.6.x 起（官方发布通道成熟后）切官方源码构建/资产。
- alpha.1 → alpha.2 的迁移评估见 `alpha2-migration-assessment.md`。

## 6. 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 规划 | 协议研究消化 + alpha.2 冲击评估 + 本架构 | 🔄 进行中 |
| M1 骨架 | kernel-pin manifest + seam validator + boot 接线（fail-closed） | 待做 |
| M2 更新内核 | vendored tarball → alpha.2 + 补丁适配器包逐个重靶 | 待做 |
| M3 组合适配器 | companion 组合链收编进 composition adapter + 命门校验 | 待做 |
| M4 协议桥 | TUI ADAPTER 接入；LLM adapter seam 试点 | 待做 |

## 7. 研究与规格输入

| 文档 | 内容 |
|---|---|
| `Desktop\dshplugin\dsh-std/01` | 官方插件兼容协议全文（Cordis Service 模型 / manifest 三层 / ctx seam 表 / 层级顺序） |
| `Desktop\dshplugin\dsh-std/02` | manifest 与配置层「命门」细节（字段名 / 分类 / 层级写错即崩） |
| `Desktop\dshplugin\adapter/01` | 官方 LLM adapter seam 契约（LlmAdapter / StreamChunk / 五条硬性义务 / 测试边界） |
| `Desktop\dshplugin\adapter/03` | 跨框架 adapter 模式 |
| `tui-adapter-protocol.md`（本目录） | dsh-TUI 团队 ADAPTER.md 协议消化 |
| `alpha2-migration-assessment.md`（本目录） | alpha.1→alpha.2 升级冲击评估（51+ 补丁红黄绿分类） |
