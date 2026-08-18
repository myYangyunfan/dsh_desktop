---
name: plugin-development-spec
description: 'DSH 插件开发规范（中英双语）——依据 DSH 插件生态倡议编写可组合插件：三层结构、宿主/客户端半边契约、loader id 一致性、Desktop 服务探测、组合守则与发布检查清单。Plugin development specification for DSH/DSH Desktop: composable plugin structure, host/client halves, loader-id consistency, Desktop service probing, composition rules and release checklist.'
whenToUse: '为 DSH / DSH Desktop 编写、审查或重构插件时（assets/plugins/ 配套插件、第三方插件、bundle 插件），或排查插件组合冲突、duplicate loader entry、slot/service 声明、双登记启动崩溃等问题时使用。Use when writing, reviewing or refactoring DSH plugins, or debugging plugin composition conflicts, duplicate loader entries, or slot/service declaration issues.'
---

# DSH 插件开发规范 / DSH Plugin Development Specification

本规范依据 DSH 插件生态倡议书（plugin-ecosystem.md）与官方插件开发文档（plugin-development.md）整理，并结合 DSH Desktop 内置插件的实际工程实践。
This specification condenses the DSH plugin ecosystem manifesto and the official plugin-development guide, combined with hands-on practice from DSH Desktop built-in plugins.

## 0. 三条原则 / The Three Principles

一切条目都从这三条推导。All rules derive from these three:

1. **组合优先 / Composition first**：通过官方 slot、service 和 patch 组合能力；绝不假设或覆盖其他插件的内部实现。Extend through official slots, services and patches; never assume or override another plugin's internals.
2. **声明清晰 / Declare clearly**：显式声明依赖的 service 与 slot，不依赖运行时巧合。Declare the services and slots you depend on; never rely on runtime coincidence.
3. **兼容优先 / Compatibility first**：升级保持向后兼容，不破坏已有组合。Keep upgrades backward compatible; never break existing compositions.

## 1. 两层插件模型 / The Two-Layer Model

一个 DSH 插件有两半，职责严格分离。A DSH plugin has two halves with strictly separated concerns:

| 半边 / Half | 运行环境 / Runtime | 形态 / Form | 职责 / Responsibility |
| --- | --- | --- | --- |
| 宿主半边 Host half | dsh web 进程（Node ESM） | `lib/index.js`（或 `.mjs`） | 注册 service / 路由 / 设置命名空间 / 事件 Register services, routes, settings namespaces, events |
| 客户端半边 Client half | 浏览器（渲染层） | `lib/client.js`（classic script） | UI 注入 / DOM 增强 / 状态展示 UI injection, DOM enhancement, display |

普通 DSH 插件应只依赖官方 DSH contract，从而在 CLI、普通 web profile、DSH Desktop 三处复用。An ordinary plugin should depend only on official DSH contracts so it works in CLI, plain web profiles and DSH Desktop alike.

## 2. 标准结构 / Standard Structure

目录式插件的标准布局（`assets/plugins/<dir>/`）：
Standard layout for a directory plugin:

```
my-plugin/
├── package.json        # 独立 npm 包声明 / npm package manifest
├── cordis.patch.yml    # 对宿主的组合声明 / composition patch for the host
├── dsh.plugin.json     # 可选：插件元数据（id/version/main）/ optional plugin metadata
├── lib/
│   ├── index.js        # 宿主半边（ESM）/ host half
│   └── client.js       # 客户端半边（classic script）/ client half
├── README.md           # 中英说明 / docs
└── LICENSE
```

关键 `package.json` 字段 / Key `package.json` fields:

```json
{
  "name": "@dsh-external/my-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "peerDependencies": { "@deepseek-ai/cordis": "*" },
  "dsh": {
    "client": {
      "inject": ["@deepseek-ai/dsh-client-ui-conversation"],
      "platform": "web"
    }
  }
}
```

- `dsh.client.inject` 声明客户端半边需要宿主预注入的模块；`platform: "web"` 限定浏览器端。
  `dsh.client.inject` lists host modules the client half needs pre-injected; `platform: "web"` scopes it to the browser.

`cordis.patch.yml` 最小形态（把宿主半边注册进插件栈）：
Minimal `cordis.patch.yml` (registers the host half into the plugin tree):

```yaml
# my-plugin profile composition patch.
# Kept as a flat list of entries (never mix a top-level `[]` with list items).
- insert:
    - id: my-plugin
      name: '@dsh-external/my-plugin'
      config: {}
```

## 3. 铁律：loader id 三处一致 / Iron Rule: Loader-id Consistency

`cordis.patch.yml` 的 `id`、`dsh.plugin.json` 的 `id`、宿主半边导出的 `name`（包名可不同）必须指向同一个 loader id。一旦错位，bundle 迁移自愈、插件管理卸载标记等一切按 id 匹配的逻辑都会静默失效——典型后果是 `duplicate loader entry id` 双登记启动崩溃循环（DSH Desktop issue #104 教训）。
The `id` in `cordis.patch.yml`, the `id` in `dsh.plugin.json` and the host half's exported identity must agree on one loader id. Any drift silently breaks every id-matching path (bundle-migration healing, uninstall markers), typically ending in a `duplicate loader entry id` boot crash loop (DSH Desktop issue #104).

## 4. 宿主半边 / Host Half

导出契约：`name` / `inject` / `apply(ctx, config)`。
Export contract: `name` / `inject` / `apply(ctx, config)`.

```js
// lib/index.js — ESM host half
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

const name = "@dsh-external/my-plugin";
const inject = ["settings"];                    // 显式声明依赖的 service / declare dependencies

const NS = settingsNamespace("my-plugin");
const Config = z.object({ enabled: z.boolean().default(true) });

function apply(ctx, config) {
  // 设置注册必须降级：register 抛异常只告警，绝不阻断 dsh 启动。
  // Settings registration must degrade gracefully: warn, never crash host boot.
  try {
    const scope = ctx.settings.register(NS, Config, { base: config || {} });
    return () => { void scope; };
  } catch (error) {
    console.warn("[my-plugin] settings section unavailable: " + (error?.message || error));
  }
}

export { Config, apply, inject, name };
```

守则 / Rules:
- 需要什么 service 就写进 `inject`，不要运行时碰运气读取。Declare every service you need in `inject`; do not probe at runtime "just in case".
- 可选依赖用 `ctx.get("service", false)`（不抛错形态）动态探测并优雅降级。For optional dependencies use the non-throwing `ctx.get("service", false)` and degrade gracefully.
- 注册类调用（设置、路由、slot）全部 try/catch 降级——一个插件的失败不能拖垮整个插件树。Wrap registrations in try/catch—one plugin's failure must never take down the whole tree.

## 5. 客户端半边 / Client Half

classic script，经 `window.__ModuleLoader__.load` 注册模块：
A classic script registering a module through `window.__ModuleLoader__.load`:

```js
// lib/client.js — browser half (classic script)
window.__ModuleLoader__.load({
  id: "@dsh-external/my-plugin",
  factory: (require) => {
    const react = require("react");
    const { jsx } = require("react/jsx-runtime");
    // ... 组件与注入逻辑 / components and injection logic
    exports.apply = apply;
    exports.inject = ["slots"];                  // 客户端 service 声明 / client-side service deps
    return module.exports;
  }
});
```

守则 / Rules:
- 只插入自有节点，不移动/删除 React 管理的节点；DOM 增强须幂等（指纹去重）。Insert only nodes you own; never move/remove React-managed nodes; DOM enhancement must be idempotent (fingerprint dedupe).
- 长驻监听（MutationObserver/定时器）必须在关闭/卸载路径上彻底拆除——关闭态零开销。Tear down every observer/timer on the off path—zero cost when disabled.
- CSS 一律以作用域属性（如 `body[data-my-plugin]`）圈定，防跨插件污染。Scope all CSS behind an attribute selector to avoid cross-plugin leakage.

## 6. Desktop 专属服务 / Desktop-only Services

DSH Desktop 额外提供两个公开 Host service：`desktopProfiles`（读取/切换 profile）与 `desktopPnpm`（在当前 profile 执行 pnpm / 官方插件管理语义）。它们属于 Electron main 进程，Renderer 不可直达。
DSH Desktop exposes two public host services: `desktopProfiles` (read/switch profiles) and `desktopPnpm` (pnpm / official plugin-management semantics in the active profile). They live in the Electron main process and are not reachable from the renderer.

- `runPlugin(['add', target], invokingDir, signal)` 保留上游 `dsh plugin` 语义，安装/卸载/更新/依赖修复一律用它；`run()` 是低层 pnpm，不保证 profile 初始化。
  Use `runPlugin(['add'|'remove'|'update'|'install', ...], invokingDir, signal)` for package operations—it preserves upstream `dsh plugin` semantics; `run()` is low-level pnpm without profile guarantees.
- 参数按 argv 传递，绝不拼接 shell 字符串；一个 generation 同时只允许一个 package operation，插件卸载时必须取消并等待其结束。
  Args always go as argv—never concatenate shell strings. One package operation per generation; cancel and await it on dispose.

兼容普通 DSH 的写法——不要把 Desktop service 放进顶层 `inject`，运行时动态探测：
To stay compatible with plain DSH, keep Desktop services out of top-level `inject` and probe dynamically:

```js
export const inject = ["webServer", "loader"];

export function apply(ctx, config) {
  const profiles = ctx.get("desktopProfiles");
  if (profiles === undefined) {
    mountOrdinaryDshManager(ctx, config.profile ?? "web");   // 普通 DSH fallback
    return;
  }
  ctx.inject(["desktopPnpm"], (desktopPnpm) => {
    mountManager(ctx, { runPlugin: (args, cwd, signal) => desktopPnpm.runPlugin(args, cwd, signal) });
  });
}
```

不要从 `process.argv`、`ctx.baseUrl`、settings 或 `$DSH_HOME` 推断 Desktop profile；在 Desktop 中以 `desktopProfiles.current` 为准。
Never infer the Desktop profile from `process.argv`, `ctx.baseUrl`, settings or `$DSH_HOME`; in Desktop, `desktopProfiles.current` is authoritative.

## 7. 禁止依赖的内部接口 / Internal APIs You Must Not Depend On

以下即便出现在声明或运行时上下文中，也不属于第三方兼容 contract：
The following are Desktop internals even when they surface in declarations or runtime contexts:

`desktopRuntime`、`desktopPnpmBootstrap`、Electron `BrowserWindow`、托盘注册表、private Node helper、`ELECTRON_RUN_AS_NODE`、生成的 shim。
`desktopRuntime`, `desktopPnpmBootstrap`, Electron `BrowserWindow`, tray registries, the private Node helper, `ELECTRON_RUN_AS_NODE`, generated shims.

同时不要假设或覆盖其他插件（含官方插件）的内部实现、私有模块路径或 DOM 结构类名中的 hash 片段——官方类名带 hash，一律走结构定位或稳定 data-* 属性。
Likewise, never assume or override other plugins' internals, private module paths, or hash-suffixed class names—target stable structure or `data-*` attributes instead.

## 8. 测试与发布检查清单 / Test & Release Checklist

发布前逐项自查（不满足则打回）：
Verify every item before publishing:

- [ ] 普通 DSH（无 Desktop service）中能加载，或按产品定义保持 pending。Loads in plain DSH without Desktop services, or stays pending by design.
- [ ] Desktop 中读取的 profile name/dir 与用户实际选择一致。Profile name/dir read in Desktop match the user's actual selection.
- [ ] package operation 的取消、非零退出、spawn 失败、generation teardown 全部处理。Package operations handle cancel, non-zero exit, spawn failure and generation teardown.
- [ ] 插件变更后重启，bundle 能进入下一次 Loader 组合。After changes + restart the bundle enters the next loader composition.
- [ ] 配套自动化测试就位（纯函数 unit-* / 桌面逻辑 desktop-*；bug 修复必须带回归用例并注明 issue 号）。Automated tests in place; bug fixes carry regression tests referencing the issue.
- [ ] 版本号 bump——同步器按「安装包版本 > profile 版本」决定覆盖，不 bump 则存量用户拿不到更新。Bump the version—syncers only overwrite when the packaged version is newer.
- [ ] loader id 三处一致（§3）。Loader id consistent across all three sites (§3).
- [ ] 卸载/关闭路径拆除全部监听与定时器。All listeners and timers torn down on the off path.

## 9. 在 DSH Desktop 仓库登记配套插件 / Registering a Companion Plugin in DSH Desktop

内置插件还需两步（单一数据源约定）：
Built-in plugins additionally require two steps (single-source-of-truth convention):

1. 在 `dsh-desktop/scripts/lib/companion-plugins.js` 的 `COMPANION_PLUGINS` 追加 `{ id, name }` 条目（`id` = loader id；`name` = profile node_modules 包名）。桌面壳与 CLI 同步入口自动生效。
   Append an `{ id, name }` entry to `COMPANION_PLUGINS` in `dsh-desktop/scripts/lib/companion-plugins.js` (`id` = loader id; `name` = package name). Both sync entry points pick it up automatically.
2. 同步更新 `scripts/test/unit-patch-engine.test.js` 的前缀顺序断言（`slice` 长度与期望数组）——该测试是清单漂移的防线。
   Update the prefix-order assertion in `scripts/test/unit-patch-engine.test.js` (`slice` length and expected array)—it is the drift guard for the manifest.

## 10. 参考实现 / Reference Implementations

仓库内范例（由简到繁）：
In-repo references, simple to complex:

- `assets/plugins/dsh-session-manager/` —— 设置面板 + 行菜单桥 + RPC 扩展的最小完整样例。Minimal complete sample: settings panel + row-menu bridge + RPC extension.
- `assets/plugins/dsh-quest-ui/` —— 纯客户端 DOM 增强（默认关闭、零关闭态开销、单一去抖观察器）。Pure client-side DOM enhancement (off by default, zero idle cost, one debounced observer).
- `assets/plugins/dsh-side-session/` —— 宿主服务 + 悬浮窗客户端 + 设置命名空间的完整双半边实践。Full two-half practice: host service + floating-window client + settings namespace.

完整愿景见上游倡议书与 Community Fabric RFC（manifest/capability 仍为 Draft，不能作为依赖或发布目标）。
See the upstream manifesto and Community Fabric RFC for the full vision (manifest/capability are still drafts—do not depend on or target them).
