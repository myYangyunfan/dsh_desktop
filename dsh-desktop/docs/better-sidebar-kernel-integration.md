# better-sidebar 与内核自带右栏的整合

> 本文说明 `assets/plugins/dsh-better-sidebar` 如何把工作台接进内核自带的右栏，
> 以及为什么走这条路（而不是改内核包）。相关代码：
> `src/client/kernel-rightbar.tsx`（接入层）、`src/client/Sidebar.tsx`（embedded 形态）、
> 回归锁 `dsh-desktop/scripts/test/unit-plugin-kernel-rightbar.test.js`。

## 一句话

内核 0.1.6 起自带右栏（`@deepseek-ai/dsh-client-ui-sidebar-right`），它给出**公开的两段式
标签注册 API**；本插件把整块工作台注册成右栏里的**一个标签**，列宽/开关/全屏/拖宽交给内核，
插件不再自绘浮层。**不改内核任何包，也不新增 PatchSpec。**

## 内核的扩展点（我们用到的那部分）

内核自己的「工作区文件 / 文档预览 / 终端」三个标签走的是同一套 API：

```ts
// ① 标签「类型」：id 是身份，kind 是 openTab 用的判别值；页面型不写 patterns
ctx.sidebarRightTabs.register({
  id, kind, title: () => string, priority?: 'extension' | 'builtin' | 'fallback',
  guide?: [{ id, order, title, description?, icon? }],
})

// ② 标签「主体」：注册在**类型的 id** 下的键控槽；inject 按 sessionId 求值后作为 props 注入
ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id, inject: (sessionId) => ({...}) }, Body)
```

主体拿到的 props 里含内核给的 `useTabInfo()`（取 `{ tab, ... }`），本插件用不到，只取自己的
`store`/`sessionId`。打开用 `ctx.sidebarRight.openTab(kind)`（页面型同 kind 在同一 pane 内唯一，
重复调用 = 聚焦已有标签）；开关/宽度/全屏由 `ctx.sidebarRight.isExpanded()/toggleExpanded()` 与
内核自己的拖宽把手负责。

## 两种模式

| | `integrated`（默认） | `legacy`（兜底） |
| --- | --- | --- |
| 触发条件 | 内核提供 `sidebarRightTabs` + `sidebarRight` 两个服务 | 缺任一服务，或偏好 `kernelRightbar: 'legacy'` |
| 右栏 | 内核那一列（`#root` 的第三列网格，可拖宽/全屏/收起） | 插件自绘的浮层 + 给 `#root` 加 `margin-right` |
| 面板 DOM | portal 进内核给的 pane（`[data-dsh-kernel-pane]`） | 留在插件自己的 `[data-dsh-panel-host]` 固定层 |
| 右侧开关 | **内核会话头部的展开按钮** | 插件浮层钮簇里的那颗 |
| 底部面板开关 | **内核右栏标签条按钮排里并列的一颗**（`[底部面板] [分栏] [全屏] [收起]`） | 插件浮层钮簇里的那颗 |
| 浮层钮簇 | 整簇不渲染（应用右上角没有任何我们的浮层按钮） | 保留 |
| 列宽/全屏 | 内核 | 插件（自绘拖宽把手） |
| 底部面板本体 | 不变：仍是会话列下方的独立 Dock（`--dsh-sidebar-height` 顶开） | 同左 |

关键实现点：

1. **单一 React 树**：面板不新建实例，而是用 `MaybePortal` 把面板那一段 portal 进内核 pane。
   这样所有 effect / 拖拽 / observer 仍然只跑一次（渲染第二个 `<Sidebar>` 会把它们全跑两遍）。
2. **「集成生效」≠「pane 元素在位」**：内核列收起时 dock 会卸载我们的标签主体、pane 元素随之
   消失。此时面板必须**不渲染**（`hideWhenNoTarget`），否则会掉回就地渲染、以视口左上角铺满
   整个应用（实测踩过：整屏错位）。
3. **定高链路**：内核 dockkit 的 `_paneBody` 是 `position: relative` 的定高滚动容器，中间隔着两层
   `display: contents` 的 slot outlet，所以宿主必须 `position: absolute; inset: 0`，且被 portal
   的面板要显式补 `display: flex; flex-direction: column`（`.panelBody/.workbench/.pane` 全靠
   `flex: 1 + min-height: 0` 撑满）。少任何一条，内容会按自身高度铺开（实测 13858px / 4586px）。
4. **偏好**：`kernelRightbar: 'auto' | 'legacy'`（逃生阀）、`kernelRightbarAutoOpen`（默认开：
   首次展开内核右栏时自动打开工作台标签，否则展开先落在内核引导页）。
5. **不写进 `dsh.client.inject`**：inject 是硬前置，写进去会让插件在缺少该服务的内核上
   **整体不加载**；这里用 `ctx.inject([...])` 的可选接法，服务缺席只是不集成。
6. **底部面板开关并进内核标签条**（`useKernelStripAnchor` + `KernelBottomPanelToggle`）：
   从我们的 pane 往上找 dock 的标签条，把我们**自己的**宿主 span（`data-dsh-strip-host`）
   插到 kit 的「分栏」按钮之前，再 portal 一颗 28×28 的按钮进去——按钮排读作
   `[底部面板] [分栏] [全屏] [收起]`。只插我们自己的空元素，内核节点既不搬动也不改样式；
   标签条被内核重渲染导致宿主消失时，用 MutationObserver 自愈重建（否则按钮会凭空不见）。

## 用户可见的变化

- 只有一个侧边栏：内核右栏的标签条上出现「工作台」标签（内核自己的「开始 / 工作区文件 / 新建终端」
  照旧）。引导页上本插件卡片排在第一张（`order: 5`）。
- 点内核会话头部的展开按钮 → 直接看到工作台（`kernelRightbarAutoOpen`）。
- 工作台内部：编辑器标签体内是 `[常驻左文件栏 ｜ 预览]`（栏可收起、可拖宽，按会话记忆），
  点文件开成**每文件一个去重标签**（不再原地替换）；分屏、底部面板（终端）都在。
- 2026-10-09 文件体验走 PACK/VSCode 统一模型（「合并/独立」的 `editorExplorer` 选键随停靠树与
  原地切换一并退役）：栏画在**每个编辑器标签体内**——内核右栏没有 pane 级插槽，栏只能住在标签主体里，
  所以非 editor 标签不显示栏；改动台账见 `builtin-plugins-inventory.md` §5.2 #3。

## 验证

```bash
cd dsh-desktop
node --test scripts/test/unit-plugin-kernel-rightbar.test.js   # 两段注册 / 兜底 / 门控 / 偏好
npm test                                                       # 全量
```

实机（装好的客户端，CDP 只读探针）：

- 收起态：`[data-dsh-panel]:not([data-dsh-bottom-panel])` **不存在**（面板不渲染）；
- 展开态：`[data-dsh-kernel-pane]` 与面板都在 `[data-rightbar-col]` 内且同尺寸（实测 472×647）；
  `--dsh-sidebar-width` 恒为 `0px`、`#root` 的 `margin-right` 为 `0px`（没有第二套让位）；
- 点文件：编辑器出现在 pane 内（实测高度吻合 pane，可滚动）。

## 遗留 / 未做

- 内核右栏的**会话域**槽与插件模块级 store 的互动：已实测「切标签 → 面板卸载 → 切回 → 树/标签还在」，
  但多会话并行开着右栏的场景未逐一走查。
- 内核自带标签的完整渲染只在引导页层面确认（其卡片由内核自己的包渲染），未逐个驱动。
- 底部面板**没有**折进右栏（仍是会话列下方的 Dock）——若要「一个面板装下一切」，那是一次独立的改动。
- 后续可选：用 `patterns` + `priority: 'extension'` 接管 `dsh-resource://file/**`，让**内核自带的文件树**
  点文件也开进本插件的编辑器。
