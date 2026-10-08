# 契约 4：插件契约（桌面端消费规范）

> 上游：官方 [deepseek-harness docs]（cordis-primer / architecture / capability-seams）。
> 本文档定义**桌面壳与三层「插件」的关系**，不重新发明官方契约，只声明消费方式。

## 0. 三层「插件」辨析（易混，先钉死）

| 层 | 是什么 | 契约归属 | 桌面壳的关系 |
|----|--------|----------|--------------|
| A. **内核 cordis 插件** | dsh 运行时内 service（ctx 容器 + inject 依赖 + 可逆副作用） | 官方契约 | 壳**只做安装/开关/修复**，不感知其内部 |
| B. **伴随插件**（assets/plugins/，33 个） | 桌面客户端带的 A 层插件包 + 各自的 client.js 页面脚本 | 官方 A 层契约 + 本壳桥契约（bridge-api.md） | 壳负责同步进 overlay 布局并打文本手术 |
| C. **用户插件**（插件市场安装） | 用户后装的 A 层插件 | 官方 A 层契约 | 壳经 sidecar 提供 list/开关/卸载/恢复/更新 |

## 1. A 层：内核 cordis 插件（官方契约要点，壳侧消费口径）

官方五核心概念（cordis-primer）与壳的对应职责：

| 官方概念 | 官方语义 | 桌面壳消费口径 |
|----------|----------|----------------|
| service | 一切皆插件：实现 start/stop 的对象 | 壳只保证**文件落位正确**，加载顺序交给官方 loader |
| ctx 容器 | `inject(dep, impl, id?)` 注册、`ctx[dep]` 取用 | 壳的文本手术不得破坏 inject 调用形态（锚点匹配即为此设计） |
| 事件 | emit / waterfall / parallel / serial 四模式 | 壳不代理内核事件；桥事件仅壳自身用 emit 口径 |
| 可逆副作用 | `ctx.on('dispose', ...)` 回收 | 卸载=移除文件+清 patch 条目；不做运行时热插拔（需重启 dsh web，restartService 即为此） |
| loader 配置 | `!!js` 表达式 + overlay 合并 | 壳的 overlay 即官方 `--patch` 层（见 data-flow.md §1） |

**叠加树与 patch-by-id**（architecture）：壳的所有写入必须落在官方四层之一（bundle /
profile patch / home patch / overlay），同 id 整体替换语义由官方 loader 保证——壳不自作
聪明做合并。

## 2. B 层：伴随插件（桌面端自有契约）

一个伴随插件的完整构成：

```
assets/plugins/<id>/
├── package.json          # 官方 A 层插件清单（name/version/main）
├── lib/*.js              # 内核侧代码（进 overlay 的 node_modules）
└── lib/client.js         # 【本壳契约】页面侧脚本（在 Web UI 的 WebView 里执行）
```

**client.js 的运行环境契约**（bridge-api.md 是其 API 面）：

1. 运行在内核 Web UI 页面（`http://127.0.0.1:<port>`）上，与内核前端同源同上下文。
2. 可依赖的宿主 API 白名单：
   - `window.dshDesktop.*`（本壳桥，46 方法，见 bridge-api.md §2）
   - `window.__DSH_FLOAT__`（模式全局；`__DSH_PET__` 已随 harness-pet 插件退役移除）
   - window CustomEvent：本壳已无派发方（`dsh-balance-changed` 随 Electron 余额遗留线
     退役、`dsh-pet-state` 同上退役），插件不得依赖
   - 标准浏览器 API + 内核前端自身暴露的稳定挂点
3. **不得依赖**：Electron/WebView 宿主细节、`require`、IPC 通道名、内部未文档化全局。
4. 降级义务：桥方法全部可能失败（后端超时/裁撤），client.js 必须 try/catch 并有浏览器
   模式降级（`getPathForFile` 返回 `''` 即范例）。

## 3. C 层：用户插件（插件市场）

- 安装/卸载/更新全部经 **sidecar**（Node）执行，Rust 只编排（单一数据流，data-flow.md §2）。
- 禁用持久化在 home patch 用户层 `disabled` 条目（官方层 [3]），**完全退出并重启生效**
  （Electron 版语义保持）。
- 隔离区恢复：`%APPDATA%/dsh-desktop/plugin-quarantine/`，restore = 原子移回 + manifest 校验。
- 更新链 fail-closed（#121 语义）：校验不过 → 隔离不动原物，绝不半更新。

## 4. seam 三角色对齐（capability-seams）

官方把服务分为 definition / provider / consumer 三角色。桌面壳的插件管理 inventory 分组
沿用同一口径标注，不自造分类：

> **状态：未实装 / 规划态**。sidecar 当前 inventory 不做 `provides`/`consumes`
> 推导，也无卸载预检——本节的三角色推导与预检仅为对齐官方 capability-seams
> 术语的规划口径，落地前不作为行为契约。

- 壳 inventory 展示插件时，`provides`（该插件提供哪些 seam 能力）与 `consumes`
  （依赖哪些 seam）从其 package.json 的依赖声明推导。
- 卸载预检：若被卸载者是某 seam 的唯一 provider 且存在 consumer → 警告（不阻断，
  官方 loader 启动时会自然报 inject 缺失，壳只提前告知）。

## 5. 版本与兼容

- 桥 API 变更：升 `appVersion` minor，CHANGELOG 标注破坏面；垫片保持旧方法位
  （返回 `E_CUT_FEATURE`）至少一个大版本。
- 内核版本兼容：壳按 dist-tag 读取内核包版本做行为门控（范例：`--no-open` 自 rc.8 起
  必需——Electron 版 main.js startServer 的 compareVersions 门控语义，Tauri 版在
  kernel-process 以同规则实现）。
- **内核不再自动更新**（用户决策）：内核版本 = 随客户端分发的版本，升级只随客户端发版。
