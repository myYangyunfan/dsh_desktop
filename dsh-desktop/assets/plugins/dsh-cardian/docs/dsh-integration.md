# cardian 接入 DeepSeek Harness 宿主

本文说明 cardian 如何作为一个真实 dsh 插件接入宿主，以及在 **左下栏（左侧边栏）** 添加「知识树」栏目来使用与管理整个插件。

## 一、两半侧模型

dsh 客户端插件是「两个半侧住在同一个包里」：

| 半侧 | 位置 | 入口 | 作用 |
|---|---|---|---|
| Host（宿主） | `src/` | `main`（`src/index.js`） | 跑在 Node 端：三大功能、30 个工具、Obsidian 仓库读写、数据读模型 |
| Browser（浏览器） | `src/client/` | `./client`（`src/client/index.tsx`） | 跑在 Web 端：渲染「知识树」栏目、调用宿主数据 |

`package.json` 用两个字段声明：

```jsonc
{
  "exports": {
    ".":        { "default": "./src/index.js" },
    "./client": { "default": "./client/index.tsx" }
  },
  "dsh": {
    // Host 半侧：bundle patch，启动时 insert cardian 插件行
    "bundle": { "patch": "./cordis.patch.yml" },
    // Browser 半侧：web 客户端插件
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-sidebar"
      ]
    }
  }
}
```

> 注意：`dsh.client` 声明的是**包依赖**（决定 slot 可见性与加载顺序），不是服务名；服务名写在客户端插件的 `export const inject` 里。

## 二、「知识树」栏目实现

沿用 dsh 官方 slot 契约（`docs/cookbook/extension-cookbook`、`ui-sidebar`/`ui-layout` 的 SlotMap）：

- 三列布局由 `ui-layout` 的 `root` slot 声明：`sidebar`（左）/ `conversation`（中）/ `details`（右）+ `shell.overlay`（浮动层）。
- 左侧边栏 `sidebar` 是 **single** slot（被 `ui-sidebar` 的 SidebarRoot 独占），因此**不能**往 `sidebar` 里塞东西（那会替换整列导航）。正确的做法是注册进它声明的**内部子 slot**：
  - `sidebar.footer.action`（**list**，可加性）——侧边栏脚部、Settings 旁边的动作位，即「左下栏」入口。
  - `shell.overlay`（**list**，可加性）——帧级浮动层，用来放「知识树」面板。

cardian 客户端插件（`src/client/index.tsx`）注册两个可加性条目：

1. **`sidebar.footer.action`** → `KnowledgeTreeTrigger`：侧边栏脚部一行「🌳 知识树」（rail 折叠态只显示图标，展开态显示图标+文字）。
2. **`shell.overlay`** → `KnowledgeTreePanel`：点击后展开的浮动面板，内部渲染：
   - 搜索框（防抖调用宿主 `cardian.search`）；
   - 三个分区的条目树（RepoWiki / 知识卡片 / 记忆）；
   - 点击条目查看详情。

## 三、数据流（浏览器 → 宿主）

知识数据在 **Host**（Obsidian 仓库在磁盘上）。浏览器通过 dsh 客户端运行时的 **remote 桥** 调用宿主服务。cardian 在宿主暴露一个 `cardian` 服务，读模型方法都返回可 JSON 序列化的纯数据：

| 方法 | 返回 |
|---|---|
| `cardian.describe()` | 完整知识树 `{ vaultPath, sections:[{key,title,count,entries,repos?}] }` |
| `cardian.search(query)` | 混合检索的排序结果 |
| `cardian.status()` | 分区统计 + 过期数 |

`client/controller.ts` 里的 `callHost()` 是**唯一的适配点**——如果所装 dsh 版本的 remote 调用面命名不同，只改这一处：

```ts
async function callHost(ctx, method, params) {
  return ctx.remote.call(`cardian.${method}`, params)
}
```

## 四、构建（已可执行）

客户端半侧需构建成 dsh loader 的 **lazy-CJS bundle**（`lib/client.js`，内含 `window.__ModuleLoader__.load({id, factory})` 闭包工厂，`react` 走模块表外部依赖）。本仓库已内置构建配置，**可直接构建**：

```bash
npm install          # 安装 react + tsdown + typescript（React 18，与 dsh 客户端包一致）
npm run build:client # 产出 lib/client.js
```

- 构建入口 `src/client/index.ts`，配置在 `tsdown.config.ts`（复刻官方 `clientBundle` 预设的 banner/footer 与 external 规则）。
- dsh 客户端包（`@deepseek-ai/dsh-client-runtime` 等）在本仓库是 **type-only import**（编译期擦除），因此无需安装——它们的不完整发布（传递依赖未上 npm）不影响构建。
- 构建产物 `lib/client.js` 已按官方预设核对：`react`/`react/jsx-runtime` 为 `require(...)` 外部依赖，`exports.inject`/`exports.apply` 正常导出。
- 尚未验证的是**在真实 dsh Web 客户端里的渲染**——那需要你的 dsh desktop + 浏览器，本沙箱没有。

## 五、知识树能力对照

| 主流知识中心能力模型 | cardian |
|---|---|
| 左侧知识面板入口 | `sidebar.footer.action`「知识树」入口 |
| 知识列表 / 检索 | `KnowledgeTreePanel` 搜索框 + 分区条目树 |
| RepoWiki | `Repos/` 分区（`cardian.wiki.*`） |
| 知识卡片 | `Cards/` 分区（`cardian.card.*`，含闪卡） |
| 记忆 | `Memory/` 分区（`cardian.memory.*`） |
| 全部落盘可查看 | 同一 Obsidian 仓库，随时用 Obsidian 打开 |

## 六、文件清单

```
src/client/
├── index.tsx                  # 客户端插件入口（inject + apply + 两个 slot 注册）
├── KnowledgeTree.tsx          # 触发按钮 + 知识树面板组件
├── styles.ts / ui.tsx         # 样式与轻量 Markdown 渲染（cardian-kt-* 前缀，避免污染宿主）
├── controller.ts              # 数据控制器 + remote 桥（唯一适配点）
└── locales.ts                 # zh/en 文案
```
