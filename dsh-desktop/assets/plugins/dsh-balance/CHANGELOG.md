# @deepseek-ai/dsh-balance

## 0.1.3

### Patch Changes

- 价目对齐官网 + 补上内核真实模型 id，修正「本轮费用 / 命中缓存算错」。

  - 新增 `deepseek-flash` 键（`dsh-llm-deepseek` 的 DEFAULT_MODELS 真实下发的模型名）：
    此前它不在价目表内，精确查表未命中即静默落回 pro 档——缓存命中价 0.3 是官方
    flash 档 0.04 的 7.5 倍（主因）。
  - flash 档（`deepseek-v4-flash` / `deepseek-chat`）高峰价按官方价目表改为
    未命中 2 / 命中 0.04 / 输出 8（元/百万 token）；原值 3/0.1/9 是按 pro÷3 推导的，
    命中价高估 2.5 倍。空闲 = 高峰一半，不变。
  - `LEGACY_PRICES` 同步补 `deepseek-flash` 镜像旧价 {1, 0.02, 2}（旧版期不得落回
    pro 旧价）；未知模型仍回退 pro 最高档（不改）。
  - 回归锁同步：`unit-balance-pricing-key`（真实 id / 后缀变体 / 旧版期镜像）、
    `unit-balance`、`unit-balance-weekend` 与插件自带 `test/balance-core.test.js`。

## 0.1.2

### Patch Changes

- 设置子系统全部改到内核真实 API（详见 AGENTS.md 契约 11）。

  - 宿主半边：不存在的 `settings.register` / `settings.get` → 声明式 `Config` + `describe()` 读、`update()` 写。
  - 页内半边：不存在的 `ctx.settingsScope.bind` → `ctx.remote.settings`，inject 相应换成 `remote`。
  - ns 一律改成 **profile 条目 id**（多处原先写的是包名，find 永不命中 ⇒ 设置静默失效）。
  - dsh-better-sidebar：界面偏好从 PrefsSchema 并进导出的 Config（不并就永远不进设置页），
    schemastery 换成 @deepseek-ai/schemastery（`.volatile()` 是这个 fork 的扩展）。
  - dsh-offpeak：定时执行改走真实存在的 `ctx.sessionController.prompt`（旧代码等的 apiProxy 不存在）。
  - dsh-easyrewrite：删掉恒假的 typeof 守卫死代码。

