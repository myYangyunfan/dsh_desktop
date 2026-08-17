# 侧边栏右键菜单「打开项目目录」方案

> 日期：2026-08-18
> 范围：DSH Desktop（`dsh-desktop/`）侧边栏工作区树的**项目行**与**项目对话（会话）行**
> 目标：右键项目行/对话行弹出菜单，菜单内容 = 原右侧「⋮」三小点菜单 + 新增「打开项目目录」

---

## 1. 需求

在侧边栏（工作区树）中：

- 对**项目行**（Workspace 分组头，带文件夹图标）右键，弹出菜单。
- 对**项目对话行**（会话行，带状态点）右键，弹出菜单。
- 弹菜单内容复用原有「⋮」按钮菜单的全部条目，在末尾追加一项 **「打开项目目录」**：用系统资源管理器打开该项目目录。

## 2. 现状调研（已核实）

### 2.1 三小点菜单代码位置

核心文件：`node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js`（官方包编译产物，与 `deepseek-ai/deepseek-harness` 仓库 `packages/client/ui-workspace` 对应）。

| 行组件 | 函数 | 菜单项数组 | 说明 |
|---|---|---|---|
| 项目行 | `ProjectRowItem`（L454） | `workspaceMenuItems`（L459） | `rename` 改名、`delete` 删除 |
| 会话行 | `SessionNodeItem`（L693） | `sessionMenuItems`（L700） | `rename` 改名、`fork` 分叉、`archive` 归档、`delete` 删除对话（本仓库 `patch-session-manage.js` 已加） |

两处菜单都用 `Menu` 组件（`@deepseek-ai/dsh-client-ui-primitives`），anchor 是 `IconEllipsisOutline16`（⋮）按钮，`portal: true`、`closeOnPointerLeave: true`，`onSelect(id)` 分发：

- 项目行：`if (id === "rename") actions.rename(); else actions.delete();`
- 会话行：`if (id === "rename") onRename(...); if (id === "fork") ...; if (id === "archive") ...; if (id === "delete") window.__dshSessionManager?.deleteSession(...)`

### 2.2 行节点数据可用性

- **项目行**：`row.cwd`（项目目录绝对路径）已在节点上，hover 卡片（`WorkspaceHoverContent`，L418）已显示并可一键复制。✅
- **会话行**：`node` 节点**不含** cwd；cwd 属于其所属分组 `group.cwd`（`buildGroup` L113、`deriveGroups` L203 `cwd: g.cwd`）。会话行渲染位置（组内 children）能拿到 group 上下文。⚠️ 需要在渲染链把 `group.cwd` 传给会话行/或从 runtime workspaces 表反查。

### 2.3 「打开项目目录」宿主能力 —— 已有，零新增 IPC

`main.js` L2861：

```js
ipcMain.handle('dsh:file-open', async (event, { path: p } = {}) => {
  // ... 校验 + shell.openPath(p)
});
```

`preload.js` L83 已暴露到渲染进程：

```js
openPath: (path) => ipcRenderer.invoke('dsh:file-open', { path })
// 即 window.dshDesktop.openPath(cwd)
```

→ **渲染侧直接 `window.dshDesktop?.openPath(cwd)` 即可打开系统资源管理器**，无需改动 Electron 壳。

### 2.4 Menu 组件支持「光标处定位」

`Menu` props（primitives `lib/index.js`，portal 模式）：

- `getAnchorRect`：portal 模式下提供自定义 anchor 矩形（L1516 注释：用于非 trigger 锚点场景，如右键定位）。右键时返回 `{ x, y, width: 0, height: 0 }`（光标点）即可在鼠标处弹出。
- 现有代码为 portal 模式（`portal: true`），结构具备。

### 2.5 本仓库「给右侧菜单加项」的官方补丁范式 —— 已存在

`scripts/patch-session-manage.js` 是完整先例：

- 锚点匹配 + 插入新菜单项（`UI_MENU_ANCHOR`/`UI_MENU_INSERT`）
- 锚点匹配 + 插入 onSelect 分发（`UI_SELECT_ANCHOR`/`UI_SELECT_INSERT`）
- 锚点匹配 + 中英字典（`UI_ZH_ANCHOR`、`UI_EN_ANCHOR`）
- 幂等：文件头写 `// dsh-desktop patch (xxx)` MARKER，已打则跳过；锚点不匹配只告警不损坏
- 三处接入：`scripts/patch-deps.js`（dev 时打 node_modules）、`scripts/lib/runtime-patches.js`（main.js 启动 + after-pack 打包时打所有副本）

**所以本需求不需要改源码仓库、不需要改官方包代码本身——照抄该范式新增一个补丁脚本即可。**

---

## 3. 实现方案

采用「运行时补丁」路线（与 `patch-session-manage.js` 完全同构），新增：

```
dsh-desktop/scripts/patch-open-project-dir.js
```

对上述 4 个锚点做插入，对 `dsh-client-ui-workspace/lib/client.js` 打补丁。

### 3.1 项目行（ProjectRowItem）

**① 菜单项数组**（在 `workspaceMenuItems` 的 `delete` 项后插入）：

```js
{
  id: "open-folder",
  label: t("menu.openProjectDir"),
  icon: jsx(IconFolderOpen16)
}
```

**② onSelect 分发**（在现有 `if (id === "rename") ... else actions.delete();` 后追加）：

```js
if (id === "open-folder") window.__dshDesktopOpenDir?.(row.cwd);
```

**③ 右键打开同一菜单**：行 div（L469）增加：

```js
onContextMenu: (e) => {
  e.preventDefault();
  e.stopPropagation();
  setMenuPos({ x: e.clientX, y: e.clientY });
  setMenuOpen(true);
}
```

Menu 组件加 `getAnchorRect`（仅右键路径提供）：

```js
getAnchorRect: menuPos ? () => ({ x: menuPos.x, y: menuPos.y, width: 0, height: 0 }) : undefined
```

> 说明：三小点按钮点击仍走原 anchor（按钮矩形），右键走 getAnchorRect（光标点），二者共用同一个 `menuOpen` 状态与同一 `workspaceMenuItems`，天然满足「菜单 = 原菜单 + 新项」。

### 3.2 会话行（SessionNodeItem）

会话行需要 cwd。两个可选取法，推荐 **A**：

- **A（推荐）**：渲染链上层（组循环）已有 `group.cwd`，沿用 `patch-session-manage.js` 曾用的「上下文透传」思路，将 `cwd` 作为 prop 传给 `SessionNodeItem`。
  - 改动点：组渲染处（本文将一起 patch）`<SessionNodeItem ... cwd={group.cwd} />`；组件签名加 `cwd` prop。
- B：从 runtime workspaces 表按 `sessionId → workspace.path` 反查（需要注入 `workspaces` 服务，代码更多，不推荐）。

会话行补丁内容同项目行三处：菜单数组加 `open-folder` 项、onSelect 加 `if (id === "open-folder") window.__dshDesktopOpenDir?.(cwd)`、行 div 加 `onContextMenu` + Menu 的 `getAnchorRect`。

**边界**：会话行的 cwd 为空（未分组/流浪会话）时该项置灰或隐藏（`disabled` / 不进数组）。

### 3.3 字典（zh / en）

`dsh-client-ui-workspace` 的 locale 块补两个 key（对齐 `patch-session-manage.js` 的字典锚点写法）：

```js
// zh
"menu.openProjectDir": "打开项目目录",
// en
"menu.openProjectDir": "Open project folder",
```

### 3.4 渲染侧桥接（新增）

补丁调 `window.__dshDesktopOpenDir`，需要一个最小 `client` 插件/脚本把它挂上（对齐 `dsh-session-manager` 提供 `window.__dshSessionManager` 的模式）：

```js
// 可选：合并进 dsh-session-manager 或独立小插件 dsh-open-project-dir
window.__dshDesktopOpenDir = (cwd) => {
  if (!cwd) return;
  if (window.dshDesktop?.openPath) window.dshDesktop.openPath(cwd);
  else console.warn('[open-project-dir] window.dshDesktop.openPath 不可用');
};
```

> 也可更简单：补丁里直接 `window.dshDesktop?.openPath?.(cwd)`（preload 已保证存在），连插件都不用，但独立窗口期/未来非 Electron 环境会丢；**统一走 `__dshDesktopOpenDir` 桥，未来可切换为 web 端「浏览器新标签打开目录」等实现，无需再改补丁锚点**。

### 3.5 接入补丁生命周期（3 处，与 patch-session-manage 一致）

1. `scripts/patch-deps.js`：`require('./patch-open-project-dir')` 并执行 → dev `npm start` 生效；
2. `scripts/lib/runtime-patches.js`：启动时对 profile fallback / 内置副本 / overlay 各副本打补丁（重启保留）；
3. `scripts/after-pack.js`：打包前对内置副本打补丁（发版产物内置）。

---

## 4. 改动文件清单

| 文件 | 改动 | 类型 |
|---|---|---|
| `dsh-desktop/scripts/patch-open-project-dir.js` | 新增：锚点定义 + patchOpenProjectDir(nmRoot) | 新增 |
| `dsh-desktop/scripts/patch-deps.js` | require + 调用 | 修改 |
| `dsh-desktop/scripts/lib/runtime-patches.js` | 注册进补丁目标清单 | 修改 |
| `dsh-desktop/scripts/after-pack.js` | 打包链路调用 | 修改 |
| `node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` | 补丁目标（4+ 锚点） | 运行时被打 |
| （可选）`dsh-session-manager` 或新 client 插件 | `window.__dshDesktopOpenDir` 桥 | 新增 |

---

## 5. 验证清单

1. **项目行右键**：光标处弹出菜单，含「改名 / 删除 / 打开项目目录」；点击「打开项目目录」→ 系统资源管理器打开该 cwd。
2. **会话行右键**：弹出「改名 / 分叉 / 归档 / 删除对话 / 打开项目目录」，打开的是该会话所属项目目录。
3. **⋮ 按钮不回归**：点三小点仍从按钮处弹出原菜单 + 新项。
4. **空白会话/未分组会话**：无 cwd 时新项隐藏或置灰，不报错。
5. **幂等**：重复跑补丁脚本，文件不再重复插入；锚点不匹配时告警且不损坏文件。
6. **重启保留**：重启 DSH Desktop（走 runtime-patches）菜单行为仍在。
7. **打包**：`npm run dist` 产物内已含补丁。

---

## 6. 备选路线（不采用）

- **改官方源码仓库（deepseek-ai/deepseek-harness 上游）**：干净但需 PR/发版，本需求要尽快落地，不适合。
- **独立 client 插件全量重挂 treeview**：重写整个工作区树，成本高、与官方槽机制冲突风险大。
- **DOM 事件委托（监听 contextmenu + 自绘菜单）**：不改包，但菜单样式/定位/Portal 全部自建，与官方 Menu 不一致，且难维护；仅当「不能动 node_modules」时兜底。