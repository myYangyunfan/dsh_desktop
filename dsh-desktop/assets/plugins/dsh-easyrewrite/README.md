<div align="center">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Renzic-Stone/DSH-EasyRewrite/main/assets/logo-dark.png" />
<img src="https://raw.githubusercontent.com/Renzic-Stone/DSH-EasyRewrite/main/assets/logo.png" alt="dsh-easyrewrite" width="320" />
</picture>

# DSH-EasyRewrite

[English](README.en.md) | [日本語](README.ja.md)

<a href="https://www.npmjs.com/package/dsh-easyrewrite"><img src="https://img.shields.io/npm/v/dsh-easyrewrite?style=flat-square&label=npm&color=4d6bfe" alt="npm version"></a> <a href="https://github.com/Renzic-Stone/DSH-EasyRewrite/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Renzic-Stone/DSH-EasyRewrite?style=flat-square&label=license" alt="license"></a> <a href="https://github.com/Renzic-Stone/DSH-EasyRewrite/stargazers"><img src="https://img.shields.io/github/stars/Renzic-Stone/DSH-EasyRewrite?style=flat-square&label=stars&color=f1c40f" alt="stars"></a> <a href="https://www.npmjs.com/package/dsh-easyrewrite"><img src="https://img.shields.io/npm/dm/dsh-easyrewrite?style=flat-square&label=downloads&color=2ea44f" alt="downloads"></a> <a href="https://dshfind.com/zh/plugins/Renzic-Stone/DSH-EasyRewrite?ref=badge"><img src="https://dshfind.com/api/badge/Renzic-Stone/DSH-EasyRewrite?metric=downloads&lang=zh" alt="dshfind"></a>

`#dsh` `#deepseek-harness` `#撤回` `#气泡编辑` `#重编辑` `#版本翻页器` `#i18n` `#多语言`

**在 DeepSeek Harness Web 里使用撤回键和气泡编辑功能轻松编辑已发出的消息——轻量、原版风格、惰性、无痕、数据任何情况下0丢失。保护您修改过程中的每一份灵感。**

单击自己的消息气泡即可原位编辑；点击复制键旁的撤回键可撤回该消息及其后的全部内容。**一切修改都发生在你真正确认之后**——在按下「确定」（编辑）或「发送」（撤回）之前，对话、模型上下文、会话日志纹丝不动。

> 兼容 DeepSeek Harness Web（**v3.1.0 全面适配 dsh 0.2.x 与 0.1.7 系列**，聚焦性能与底层架构优化及重要稳定性 Bug 修复——含独立并发原子影子仓储、Cordis 热重载全生命周期收口、React Hooks 门卫隔离与翻页防丢护航；0.1.1-rc.2 及更早宿主用户请停留 **2.3.1**——该线最终版，功能完整可用，仅不再追加新功能）。纯官方扩展点实现，不改 DSH 源码。

</div>

---

## 📸 界面一览 / Visual Tour

<div align="center">
  <img src="docs/images/drag-drop-dual-dropzone.png" alt="双区拖拽与协同舒展" width="920" />
  <p><em>✨ <b>独创双区拖拽与协同舒展</b>：气泡编辑拖入文件智能分流（释放到上方气泡添加至正在编辑的消息，释放到底部 2.5x 平滑放大的输入框暂存新对话，双区隔离零串发）</em></p>
</div>

---

## 快速开始

```sh
# npm一键安装
dsh plugin --profile web add dsh-easyrewrite
```

## 已实现功能

### 气泡原位编辑（Rewrite）——已实现（M2/M4）
- **点击即改**：单击自己的消息气泡直接进入原位编辑态（保留原始 Markdown 原文），Esc 取消 / Ctrl+Enter 确定。
- **三档编辑宽度**：紧凑（气泡原宽起步，上限 360px）/ 标准（固定 360px）/ 扩展（顶满消息行）/ 自定义，自动增高并支持内部平滑滚动。
- **模型与推理等级就地切换**：编辑框内原生集成模型选择下拉菜单，可直接切换当前消息的重发模型与推理深度（Reasoning Effort）。
- **图片消息完整编辑与拖拽增删**：多图消息等宽缩略行排布，支持独立 `×` 删除、剪贴板粘贴与拖入新增，刷新后编辑进度原样恢复。

<div align="center">
  <img src="docs/images/bubble-edit-active.png" alt="气泡原位编辑" width="380" />
  &nbsp;&nbsp;
  <img src="docs/images/bubble-edit-model-select.png" alt="模型与推理等级切换" width="380" />
</div>
<div align="center" style="margin-top: 8px;">
  <img src="docs/images/bubble-edit-images.png" alt="带图消息编辑" width="380" />
</div>

<br>

### 撤回（Recall）——端到端完成
- **操作无感原生**：每条用户消息的官方复制键旁常驻撤回键，鼠标悬停即现。
- **行内确认胶囊**：dsh 官方同款极简灰白胶囊（`撤回这条消息及其后 x 条提问？` + 「确定/取消」），实时动态统计将撤回的问题数（0 条时显示「是否撤回这条消息？」）。
- **惰性提交与「正在修改」条**：点击确认仅将草稿回填到底部输入框，顶部弹出「正在修改」标签条；真正截断仅在按下「发送」时执行，中途点击 `×` 取消随时恢复原草稿，会话与上下文纹丝不动。
- **无痕替换与后续折叠**：编辑态或撤回态下自动折叠隐藏目标消息之后的所有历史回复；重发后原会话自动归档，同名新会话无缝顶替，体验如原生编辑。

<div align="center">
  <img src="docs/images/message-hover-actions.png" alt="消息悬停操作" width="220" />
  &nbsp;&nbsp;
  <img src="docs/images/recall-confirm-capsule.png" alt="行内确认胶囊" width="300" />
</div>
<div align="center" style="margin-top: 8px;">
  <img src="docs/images/recall-editing.png" alt="撤回编辑中与上下文隐藏" width="780" />
</div>

<br>

### 版本翻页器（< X >）——已实现（M3）
- **多版本无缝切换**：每次撤回或编辑重发后，该次问询最后回答的操作区自动嵌入 **`‹ X/N ›`** 原生风格翻页器。
- **上下文联动**：点击箭头（或键盘 ←/→）切换分支版本，**后续整个上下文自动跟随版本变动刷新**。
- **视口锚定与归档交换**：切换时视口平滑锚定不跳位，列表始终只保留一个活动会话，全归档版本亦可在设置中随时恢复。

<div align="center">
  <img src="docs/images/version-pager.png" alt="版本翻页器" width="620" />
</div>

<br>

### 设置中心与个性化定制（Settings）——已实现（M3/M4）
- **官方同款折叠配置卡片**：无缝融入 **设置 → 插件 → EasyRewrite**，界面语言随系统自动同步（中文 / English / 日本語）。
- **丰富细致的选项**：
  - 气泡框编辑总开关、关闭气泡编辑时备用撤回键
  - 编辑宽度（紧凑 / 标准 / 扩展 / 自定义）
  - 撤回确认胶囊开关、待定时查看原文显示图片、三种撤回视觉模式（简单 / 极简 / 信息）
  - 快捷键录制（未聚焦输入框时一键撤回最近一条消息）
  - 回填冲突模式（覆盖模式在发送/取消后完整恢复原输入草稿，零丢失）
  - 版本历史树浏览与一键手动恢复
  - 插件内置自更新检测与一键升级

<div align="center">
  <img src="docs/images/settings-panel-1.png" alt="设置卡片（上半部分）" width="440" />
  &nbsp;&nbsp;
  <img src="docs/images/settings-panel-2.png" alt="设置卡片（下半部分）" width="440" />
</div>

<br>

### 草稿自动备份（Auto-backup）——已实现（M3）
- 待定草稿超过 10 秒未处理且有新变动时，自动覆盖备份到本地文件；「确定 / 发送」处理完成即安全删除。
- 备份位置：`$DSH_HOME/dsh-easyrewrite/backups/<会话ID>.json`。
- 恢复兜底：仅当本地没有待定状态时才从备份恢复——绝不覆盖正在编辑的草稿。

---

## 与同类插件的差异与赛道格局

在 DSH 生态的大回滚与状态还原赛道中，目前形成了明显的不同技术路线（本插件当前在大回滚全赛道稳居 Top 4，并在纯消息气泡编辑与交互体验细分领域保持第一梯队）：

1. **工作区/代码文件级强回退派（如 `dsh-rewind` 231⭐、`dsh-turn-rewind` 144⭐）**：
   - 重点在于追踪工作区文件改动（Change Ledger），将代码和对话一同倒退；部分采用同窗口魔改底层内存日志方案避免分叉，但对纯前端交互（气泡内联编辑、多附件流转、防串发隔离）涉猎较少。
2. **全局系统级灾备还原派（如 `dsh-undo-savepoint` 197⭐）**：
   - 专注于全量系统快照与崩溃离线救砖，属于重型全局安全保姆工具，而非日常高频打字交互插件。
3. **沉浸式气泡编辑与原生体验派（🌟 `DSH-EasyRewrite` 129⭐）**：
   - 专注将日常对话的“打字编辑与撤回”做到极致原生。v3.0.0 独创自研**独立影子仓储（Vault）**，不碰底层易碎内存日志，从根本上终结了侧边栏归档污染，并带来了全赛道唯一的气泡原位舒展与全附件流转体验。

| 核心能力与特性 | 🌟 dsh-easyrewrite (v3.1.0) | 传统撤回插件 (如 recall-plugin) | 代码/文件回退派 (如 dsh-rewind/turn-rewind) | 全局快照派 (如 savepoint) |
| :--- | :---: | :---: | :---: | :---: |
| **气泡原位内联编辑（Rewrite）** | **✅ 独家唯一** (点击直接原位展开) | ❌ 无 (仅跳到底部输入框) | ❌ 无 (弹窗/命令行) | ❌ 无 |
| **撤回键（Recall）** | ✅ (原生复制键旁紧随) | ✅ (基础撤回) | ✅ (命令或按钮) | ⚠️ (全量还原) |
| **侧边栏整洁度（防归档污染）** | **✅ 影子仓储（Vault）自治，100% 纯净** | ❌ 产生大量灰色废弃归档 | ⚠️ 同窗口无分支但改底层日志 | ⚠️ 快照覆盖 |
| **历史版本多分支导航** | **✅ 顶部 `< X / Y >` + 设置页版本家族树** | ❌ 无 | ⚠️ 仅线性倒退 | ⚠️ 存档点管理 |
| **全品类通用附件（图片+文档）无损流转** | **✅ 完美对齐官方 FileCard，双向隔离防混发** | ❌ 仅部分支持图片 | ⚠️ 仅侧重代码文件 | ❌ 仅二进制镜像 |
| **模型与推理深度原位切换** | **✅ 气泡内嵌官方下拉选择** | ❌ 无 | ❌ 无 | ❌ 无 |
| **惰性提交（确认后才生效）** | **✅ 确认前 context 零改动** | ❌ 部分直接修改 | ❌ 立即回滚 | ❌ 恢复覆盖 |
| **原生中/英/日多语言 (i18n)** | **✅ zh / en / ja 三语全覆盖** | ❌ 仅中文 | ⚠️ 部分英文 | ⚠️ 部分多语言 |
| **纯官方扩展点（零源码补丁）** | **✅ 卸载即还原，绝不修改 DSH 源码** | ⚠️ 部分需补丁 | ⚠️ 涉深层内部 API | ⚠️ 依赖独立进程 |

---

## 设计哲学

**1. 简单易用，易上手，兼容性好（Simple & Compatible）**

- 交互直观到不需要说明书：**点击气泡就编辑，复制键旁就撤回**——不引入任何新概念、新入口。
- 默认即合理：默认设置就是大多数场景的最优解，装完即用，无需配置。
- 兼容性是硬承诺：只使用官方扩展点（keyed 槽覆盖、官方 fork RPC、官方组件与设计令牌），**不碰源码、不依赖易碎内部 API**；DSH 升级换代时主动适配，绝不拿"改了你的安装"换功能。
- 卸载即还原：不留配置残留、不改动任何官方文件。

**2. 还原原版体验，无痕、无感（Faithful, Seamless & Invisible）**

- 界面语言完全沿用 dsh 原生风格（灰蓝配色、圆角、胶囊、官方图标），深/浅主题自适应——像官方功能，不是"又一个插件皮肤"。
- 原有交互原样保留：复制键、hover 发送时间、气泡外观——一个都不少。
- **无感**：日常使用几乎感觉不到插件的存在——该有的功能都在它该在的位置，按下去的结果就是直觉预期；不弹窗打扰、不打断节奏。
- **惰性提交**是还原体验的根基：进入编辑、确认撤回都只是本地草稿态，**context 只在「确定」（rewrite）或「发送」（recall）时真正修改**——关掉 dsh，一切纹丝不动。
- **无痕替换**：撤回之后，感知上就是"原对话被编辑了"——通过影子仓储实现版本自治，没有"冒出一个新对话"的割裂感与侧栏污染。
- **气泡框编辑（v3.0.x 已全面实装）**：点击气泡即原位编辑、所见即所改——同一套无痕哲学的自然延伸。

**3. 持久化保留，防手误零丢失（Persistent & Accident-proof）**

- 编辑/撤回草稿**按会话持久化**：切对话、刷新页面、重启 dsh，进度原样接续，不存在"写一半没了"。
- 覆盖模式下，回填前的原草稿在发送/取消后都会恢复——**任何操作路径都不丢数据**。
- 待定草稿长时间未处理自动备份到本地文件（处理完成即删），极端情况也有兜底。
- 每一步关键操作都有确认与撤销路径：确认胶囊、× 取消、单待定约束——**手误可撤回，数据不损失**。

**4. 完善日志体系（Log Everything, Diagnose Fast）**

- 全链路打点：client 的每个关键步骤（加载、确认、pending、发送钩子、fork、resume）自动上报 host，统一写入 `$DSH_HOME/dsh-easyrewrite.log`。
- 统一格式（JSON 行：时间 / 级别 / 标签 / 消息 / 数据），一次复现即可定位，**不用你反复描述问题**。
- host 自身行为同样落盘（请求、拒绝原因、异常），前后端一条链路可对账。
- 日志只记录本地行为，不上传任何数据。

**5. 持续更新，积极兼容（Keep Moving）**

- 跟随 DSH 版本迭代（rc.x → 正式版），上游 API 变化第一时间适配。
- 语义化版本 + CHANGELOG，每次改动可追溯；破坏性变更提前声明。
- 社区驱动：issue / PR 积极响应，新点子、新场景持续并入路线图。

---

## 安装

```sh
# npm 已发布（推荐）
dsh plugin --profile web add dsh-easyrewrite
# 或从 GitHub
dsh plugin --profile web add github:Renzic-Stone/DSH-EasyRewrite
```

重启 `dsh web`，页面 `Ctrl+Shift+R` 硬刷新即可。

> **撤回时机说明**：DSH 的 fork 只能在闭合回合边界截断，未结束回合内的消息暂时无法撤回——等回复完成后即可。（界面会提示「该消息所在回合尚未结束…」）

---

## 调试

client 每一步都会上报 host 并写入统一日志：

```
$DSH_HOME/dsh-easyrewrite.log   # 例如 ~/.dsh/dsh-easyrewrite.log
```

JSON 行格式：`{ t, level, tag, message, data }`。

---

## 项目结构

```
dsh-easyrewrite/
├── lib/index.js          # host half：边界解析 + /bubble/recall、/bubble/log
├── src/client.src.js     # client 模板（图标构建期内联）
├── assets/               # 撤回/编辑图标（PNG，深色模式 CSS invert 自适应）
├── build.mjs             # assets → data-URL → lib/client.js
├── DESIGN.md             # 完整交互设计（v1.0，20 项产品决策）
├── PROJECT_PLAN.md       # 路线图、架构、git 工作流
└── docs/                 # api-facts、m0-verify
```

---

## License

MIT
