# @dsh-external/dsh-subagent-lens

## 0.1.1

### Patch Changes

- 修「设置开关永久禁用、控制台零报错」。

  上一轮把页内半边从幽灵的 `ctx.settingsScope` 换成 `ctx.remote.settings` 之后，
  真浏览器里设置行**渲染出来了但点不动**：`disabled: true`，且控制台一行错误都没有。

  根因：`inject` 里只声明了 `"remote"`，没声明 `"remote.settings"`。
  这种时候 `ctx.remote.settings` 拿到的不是 undefined（所以不抛错），而是一个
  **永不 settle 的代理** —— `describe()` 的 promise 既不 resolve 也不 reject，
  于是快照永远停在 `loading`，控件永久禁用。
  官方 5 个用它的包（dsh-client-ui-settings / -general / -models /
  permission-presets / agent-preset）全都同时声明两个名字。

  - 6 个包的 `inject` 补上 `"remote.settings"`。
  - `tools/audit/settings-api.js` 加第 ④ 条判据：调 `ctx.remote.settings.*` 却没声明
    `"remote.settings"` 即 error；配套两条反证用例（缺声明必红、补上必绿）。
  - AGENTS.md 契约 11 记下这条，因为它的不失败症状是「什么都不发生」，最难查。

  端到端实测（隔离实例、真浏览器、真点击）：
  开关可点 → `aria-checked` 翻转 → `data-dsh-quiet-output="1"` 立即生效 →
  **整页重载后仍为 true** → 临时 profile 的 `cordis.patch.yml` 里出现
  `- id: conversation-tweaks / config: quietOutput: true`（写路径经内核 config editor、
  按 profile 条目 id 落盘）。

- 修「装了却不挂载」，并退役阶梯分层元包。

  **22 个插件的页内 bundle 注册名改成包名。** 官方客户端真机一次报 20 条
  `client-modules: could not load "@dsh-pack/x": loaded without registering "@dsh-pack/x"
  via __ModuleLoader__.load`。内核 boot graph 行以**包名**为键
  （`dsh-client-modules/lib/client.js:625`），而 `register()` 的键是
  `stripClientSuffix(registration.id)`（同文件 569），我们的 bundle 却注册裸名
  （`'dsh-input-fold'`）或换代前的 `@dsh-external/…`，那一行永远等不到。失败形态是
  静默不挂载：宿主照常起来、插件没反应，所以补了一条 P0 门禁
  （`tools/audit/publish-readiness.js`）而不只是改一次。

  **`@dsh-pack/core` / `plus` / `knowledge` / `pocket` / `bridge` / `compaction` 退役，
  只留 `@dsh-pack/all`。** 阶梯分层在内核语义下不成立：`applyEntryPatches` 处理 `insert`
  是 `data.push(...insert)`，不按 id 去重（整行替换只作用于覆盖型补丁），所以两个元包同装
  会把共有成员装配两次，第二次注册路由即报 `webserver: duplicate exact route` ——
  真机那批「N entries did not activate」的成因。用内核自己的 `composeEntries` 实测
  core+all = 18 个重复 id。原来装过这些层的用户请改装 `@dsh-pack/all`。

  ⚠ 随之而来的使用约束：**装了 `all` 就不要再单独装其中的某个成员插件**，
  那同样会把那个成员插两次。想要小集合就别装 `all`，按用途分组单装。

- 设置子系统全部改到内核真实 API（详见 AGENTS.md 契约 11）。

  - 宿主半边：不存在的 `settings.register` / `settings.get` → 声明式 `Config` + `describe()` 读、`update()` 写。
  - 页内半边：不存在的 `ctx.settingsScope.bind` → `ctx.remote.settings`，inject 相应换成 `remote`。
  - ns 一律改成 **profile 条目 id**（多处原先写的是包名，find 永不命中 ⇒ 设置静默失效）。
  - dsh-better-sidebar：界面偏好从 PrefsSchema 并进导出的 Config（不并就永远不进设置页），
    schemastery 换成 @deepseek-ai/schemastery（`.volatile()` 是这个 fork 的扩展）。
  - dsh-offpeak：定时执行改走真实存在的 `ctx.sessionController.prompt`（旧代码等的 apiProxy 不存在）。
  - dsh-easyrewrite：删掉恒假的 typeof 守卫死代码。

- 修「子会话活动永远是空的」：页内半边读的 `binding.session.events` 已经不是数组。

  页内拿到的 binding 形状是 `{ sessionId, session, eventSource, ctx }`
  （dsh-api-session-controller），其中 `session.events` 是 **`SessionEventStream`**
  （异步 RemoteJournalStream，只有 `prepend`/`open`/`dispose`），真正的窗口在
  `binding.eventSource.getSnapshot().entries[i].event`。原先的守卫

  ```js
  Array.isArray(binding.session.events) ? … : null
  ```

  于是恒为 `null` —— 子代理那一行的活动摘要（命令、文件、进度）**从来就没渲染过**，
  无报错、无降级日志，只是永远空白。

  改法：加 `childWindowEvents(binding)`：先走 `eventSource.getSnapshot()` 的
  `entries[].event`，退回老 client-runtime 的 `session.events` 数组，再退回
  `session.snapshotEvents()`；**快照 entries 数组 → 事件数组**做 `WeakMap` 缓存
  （快照是懒物化且同一快照内稳定的），否则 `activityFromEventsCached` 的增量扫描
  会每次都被喂一个新数组、缓存直接失效。

  配套：`test/child-window-events.test.mjs` 7 条（用 vm 沙箱加载真 `lib/client.js`，
  捕获 `window.__ModuleLoader__.load`），含**反证**：同一份 binding 上用旧写法
  `Array.isArray(binding.session.events)` 必须得 `null`；另钉了缓存同实例
  （保证增量扫描不被击穿）与两条回退分支。

  未做的：子代理那一行的**视觉**确认（0.1.6 改版后的页内选择器还无法自动化，
  只能靠控制台与快照形状断言）。

