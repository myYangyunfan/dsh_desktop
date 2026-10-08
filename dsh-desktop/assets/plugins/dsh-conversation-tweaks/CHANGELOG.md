# @deepseek-ai/dsh-conversation-tweaks

## 0.1.1

### Patch Changes

- 修「设置项静默存不住」：这个包的设置子系统两端都对着不存在的 API。

  - 宿主半边 `ctx.settings.register(NS, Config, {base})`：内核 0.1.7-rc.1 的
    `SettingsForms` 没有 `register`。它被 try/catch 包着，所以不崩、只打一行
    `settings section unavailable` —— 属于最坏的那类失败：看起来正常，设置永远不生效。
    改为导出 `Config` 并把 `quietOutput` 标 `.volatile()`（非 volatile 字段不进
    `describe()` 生成的表单，也就写不回去），另加 `settings.configure({auto:false})`
    关掉内核自动生成页 —— 开关由本包在「设置-通用」里自己投一行，不关会出现两处。
  - 页内半边 `ctx.settingsScope.bind({namespace: NS})`：`settingsScope` 这个服务
    **全内核 0 处命中**。真实形状是 `ctx.remote.settings.describe()/mutate()`
    （照官方 dsh-client-ui-settings/lib/client.js:1469/:1182）。换成 bundle 内的
    `bindSettingsScope(ctx, ENTRY_ID)` 适配器，`exports.inject` 相应从
    `settingsScope` 改成 `remote`。
  - ⚠ 键也一直是错的：内核 `describe()` 的 ns 是 **profile 条目 id**
    （`conversation-tweaks`），不是包名、更不是原先写死的 `dsh-conversation-tweaks`。
    照搬旧 NS 就算换对 API 也取不到值，所以测试里专门钉了这条。

  验证：
  - `packages/dsh-conversation-tweaks/test/settings-scope.test.mjs` 9 条含反证
    （键错→missing、describe 失败→非 ready、mutate 被拒→必须抛、同值→快照对象不得换新）。
  - J4 真启动：本包不再出现在降级清单（8 项→7 项）。
  - 隔离实例真挂载 + 探针读 `settings.describe()`：命名空间列表含 `conversation-tweaks`，
    `value={"quietOutput":false}`、带 revision，即客户端要查的那个键确实存在。
    未做的：设置页那一行的**视觉**确认（应用内浏览器 viewport 为 0x0，截图不可用）。

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

