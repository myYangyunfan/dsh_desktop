D
# Changelog — DSH Desktop

DeepSeek Harness（dsh）的 Windows 桌面客户端：内置独立 Node 运行时与 dsh CLI，
一键启动 Web UI。

## [Unreleased]

### fix(flash)：选择工作文件夹时「跳闪」（chip 闪回「选择工作区」+ 输入框瞬时禁用）

- **现象**：选完工作文件夹后，对话区头部短暂闪回「选择工作区」（文件夹图标换成
  关闭态、宽度跳变），同时输入框瞬时变禁用、placeholder 闪成「选择一个工作区开始」。
- **历史补丁排查（A 线，未失配）**：0.2.4 时代的 `applyRuntimeFlashFix` /
  `mergeOrderedBaseline` 修复仍在位（`patch-registry` 的 `runtime-flash-fix`，order 40，
  靶点已随 0.1.2-alpha.1 内核分解迁至 `dsh-api-session-controller/lib/client.js`）；
  vendor alpha.5 pristine `:289` 与仓库 / profiles / 运行副本三处均已含 `?? value`，
  全仓也无第二处 `mergeOrderedBaseline` 同源实现 → 会话列表侧不复发。
- **壳层排查（B 线，排除）**：目录选择器走 `dsh-host-directory-picker-native`
  （koffi + 独立 node 子进程开 `IFileOpenDialog`），选完不触发 webview reload /
  窗口重建 / 尺寸变化；渲染恢复梯（EvalReload→NativeReload→NativeNavigate）仅在
  心跳停摆 4×10s 后介入，报障时段日志无换页记录。
- **根因（新向量，UI 派生层）**：`dsh-client-ui-conversation/lib/client.js:14405` 的
  `chipTitle` 把 `workspaces.phase === "ready"` 当作「投影已权威」而屏蔽 `cwd` 派生
  回退。选完文件夹的那一帧里，会话已 open、`useSessions.byId[id].cwd` 即时就位，
  而 `workspaces.items[].sessionIds` 要等宿主下一次 upsert 才回显该 sessionId ⇒
  `sessionWorkspace === undefined` 且 phase 已 ready ⇒ `chipTitle` 塌成 `undefined` ⇒
  WorkspaceChip 回落 `t("hero.chooseWorkspace")`，并因 `inert = hero && chipTitle === void 0`
  （:14436）连带 composer `disabled`。属 alpha 世代引入 Workspace 投影后的回归。
- **修复（兼容层补丁 `workspace-chip-label-hold`）**：删除该表达式里的
  `workspaces.phase === "ready" ||` 一项，让 `cwd` 派生标签（`workspaceLabel(cwd)`，与
  投影回显后的 workspace 标题同源）覆盖投影缺口帧；真正的「无工作目录」hero 仍由
  剩余 `cwd === void 0 || cwd === ""` 两项塌空，引导语义不变。纯显示面，不改状态机与数据流。
- **登记与护栏**：`patch-adapters.transformWorkspaceChipLabelHold`（marker
  `dsh-desktop fix: workspace chip keeps cwd label across projection gap`，OLD/NEW 常量对机械可逆）；
  `patch-registry` 新增 spec（order 350、layout runtime-local、wslLayout wsl、failPolicy warn、
  cli true，pkgRel 复用已导出的 `CONVERSATION_PKG_REL`）；spec 总数 50→51、cli:true 24→25，
  同步 `ta6-registry-invariants` / `ta6-transform-contract` / `ta6-heal-rollback-audit` /
  `ta6-baseline-matrix` / `ta3-boot-chain` / `unit-patch-registry` 计数与基线；`patch-surface`
  快照重跑（37 个被干预文件 / 54 个标记家族）后 verify 零漂移。
- **生效链路证据**：浏览器并非跑 `dsh-web-frontend/dist` 里的打包副本，而是由
  `dsh-client-modules` 的 `ClientModuleRegistry` 把各包 `exports["./client"]` 解析成磁盘
  绝对路径后 `readFileSync` 原样发给 `/plugins/<id>/client.js`（`index.js:526/635/734`）——
  因此改 `node_modules` 里的 `lib/client.js` 确实改变运行 UI；反之缓存按 bundle rev 建立，
  补丁需重启内核/应用后才对新开的页面生效。
- **已知相邻面（本次不改）**：配套插件 `dsh-mini`（DSH-Mobile 手机桥）自带一份 vendored
  `gui/bundles/@deepseek-ai/dsh-client-ui-conversation/client.js`（`:6827`）含同一 gate，
  手机浏览器面同症状；它是插件自身 `build.sh` 的产物、非内核 node_modules 树，现有
  LAYOUTS 全部只解析 `node_modules` 落点，改它属另一条链路（待上游/插件侧随版收）。
- **测试**：新增 `unit-workspace-chip-label-hold.test.js`（8 例：三态契约、注入体语法自洽、
  vm 实跑缺口帧不塌空 / 权威 title 仍优先 / 空 cwd 与无会话语义保持、上游退役形态失配、
  真实 alpha 内核产物锚点、registry 字段契约）。

### fix(balance)：「本轮 ¥」峰谷切换整段跳变 + `isPeakHour` 缺周末规则（issue #168）

- **根因 1（计价时刻错）**：`tokenUsage` 投影是会话**累计总量**，展示层每帧做
  「累计量 × 推送时刻价目」；主进程 `doRefresh()` 的 `prices`/`priceTable`/`peak`
  又全部按推送时刻单点求值——于是跨过整点（或周末零点）的那一次推送，会把之前
  时段已消耗的全部 token 按新价目重算，用户看到「本轮 ¥」突然翻倍/减半。
- **根因 2（两条同一规则的口径）**：官方 2026-08-23 起周六/周日全天空闲价，
  `assets/plugins/dsh-offpeak`（issue #158 产物）已实现，但 `balance.js`
  `isPeakHour()` 周末 9-12 / 14-18 仍返高峰 → 周末高峰时 chip 与计价都错。
- **修复（主进程只增字段）**：`balance.js` 新增 `pricingTier()` /
  `periodTables()`（peak·off·legacy 三张全模型表）/ `pricingSince()`；
  `balance-scheduler.js` 推送携带三字段，均为**可选注入 + 优雅降级**（旧宿主
  如 Tauri sidecar 不注入即退回旧载荷形态），且守
  `periodTables[pricingTier] === priceTable` 身份不变量，首帧金额与旧实现逐字一致。
- **修复（展示层增量账本）**：`dsh-balance` 插件新增 `observeSessionCost()`，
  每个用量增量按被观察时刻选档入账、分段锁定不追溯；高水位差量保证渲染期
  幂等（StrictMode 双渲染 / 无新 token 轮询 / 投影小幅回退均不叠加）；
  `localStorage["dsh-balance:cost-ledger:v1"]` 按 `sessionId` 持久化（上限 60 会话
  按 `updatedAt` 淘汰，损坏/超额/写失败一律静默重建）；老会话无账本时首帧按当前
  价目一次性入账（`backfilled` + `cost-ledger backfill` 日志），与旧行为金额等价。
- **修复（周末口径对齐）**：`isPeakHour()` 补周六/周日全天空闲，新增门槛常量
  `WEEKEND_OFFPEAK_SINCE_UTC`（北京 2026-08-23 00:00）并**不溯及既往**；与
  dsh-offpeak 采用「复制口径 + 注明来源 + 源码交叉对拍」（避开 CJS 要求 ESM 插件
  源的打包耦合）；tooltip 文案补「周六/周日全天空闲价」与分段明细。
- **测试 / 门**：新增 `unit-balance-weekend.test.js`（12）、
  `unit-balance-scheduler-payload.test.js`（10）、`unit-balance-ledger.test.js`（22），
  含门槛前后周末、与 dsh-offpeak 逐小时对拍、价目切换金额不变、老会话一次性入账
  兼容、双向 payload 兼容；`edge-client.test.js` 两个赖于旧「重定价」语义的用例
  拆为独立沙箱；`docs/balance-architecture.md` 同步 §1/§2.1/§7/§9/§10。

### fix(presets)：内置预设不出现在客户端（issue #174）

- **根因（写入路径 ≠ 发现路径）**：`6e38c3b5`（v0.5.6）把 `installBuiltinPresets()`
  的参数语义从「dsh 包目录」改成「DSH home」，安装器 / `sync-companion-plugins` /
  相应测试都跟了，唯独 sidecar boot 的 `presets` 步调用点没跟（仍传
  `installedDshPackageDir()`）——8 个内置预设被写进
  `<payload>/node_modules/@deepseek-ai/dsh/.agent-presets`，而内核只扫「出厂集 +
  `config.roots` + `<DSH_HOME>/.agent-presets`」三类根，模式列表因此只剩
  `standard`/`ptc`/`minimal`/`cordis`。写入本身成功（payload 可写）且日志报
  `boot 步骤 presets OK`，故障静默（0.6.2 安装副本实测：旧落点 56 个文件躺着，
  `~/.dsh/.agent-presets` 不存在）。
- **修复**：`dsh-tauri/sidecar/cli.js` 的 `presets` 步 local / WSL 两分支均改传
  effective DSH home（WSL 为 UNC home）；新增 boot `repair` 步的「只补缺、绝不动
  已有」幂等自愈 `scripts/lib/preset-heal.js`（原子写 + 备份 + mtime 对齐源 +
  全容忍不阻断，风格对齐 `pi-ai-settings-heal.js`），覆盖已经写歪的存量安装——
  升级后首次 boot 即在正确落点补齐，用户自定义预设与定制内容不受影响；旧落点
  残留由 `detectLegacyPresetCopy()` 记诊断行（不自动删）。
- **同源隐患收口**：预设槽/文件枚举收敛为 `scripts/lib/preset-files.js` 单一实现
  （递归到底 + 正斜杠相对路径），自愈与安装器共用；此前两份枚举各自只拷顶层，
  预设携带嵌套资源（如内核出厂 `cordis` 的 `skills/`）时会静默丢文件且不报错。
  `stage-payload.sh` 对整个 `assets/` 递归镜像（非白名单），打包面无此缺口；WSL 侧
  agent 经 `npm install` 安装（内核包 `files` 含 `presets` 整目录），预设由壳层写穿
  UNC home，与打包资源清单无关——本环无「缺目录」问题。
- **测试 / 门**：新增 `scripts/test/unit-preset-heal.test.js`（21 用例：缺失补写 /
  存在不覆盖 / 嵌套目录 / 源不可用与目标不可写容忍 / heal×installer 落地集合与
  时戳对账 / composition 相对引用命中）；`sidecar/cli.test.js` 加 boot 落点红线
  （预设必落 `<DSH_HOME>/.agent-presets`，并对 payload 包目录做反向断言）；
  `ta9-boot-disk-faults.test.js` 的 `install-minimal-win-preset` 桩与新契约对齐；
  `scripts/check-syntax.js` 入口清单纳入 `preset-files.js` / `preset-heal.js`；
  `docs/agent-presets.md` 补「分发链路（源 → 打包 → 落点 → UI）」与本案例留档。

### fix(boot)：profile 孤儿依赖致内核启动期退出，回滚也救不回（issue #177）

- **现象（v0.6.0 GA 生产事故）**：恢复页红字「回滚后仍失败：内核启动期退出
  code=Some(1)」+ `ERR_MODULE_NOT_FOUND: Cannot find package
  '@deepseek-ai/cordis-plugin-timer' imported from C:\Users\GC\.dsh\profiles\web\`，
  累计异常退出 3 次——回滚 / 重置都无效，因为脏数据在**用户 profile 的
  `package.json`** 里，不在程序侧。
- **根因（#156 / #170 欠账的爆点）**：v0.5.3 时代的写入器把内置件 / 宿主内核家族件
  按 npm 精确版本形状写进 profile `dependencies`（hub 识别登记 `6070d5ab`、dshmarket
  时代 `corePackageNames()` 把 cordis 家族含 `timer` 当「宿主核心件」传播、
  `profile-bundle-heal.recoverManifestBundles` 按包内版本补写）。这些包后来从内核
  移除 / 改名 / 退役（`@deepseek-ai/cordis-plugin-timer` 不在 vendor 的 242 个内核
  tarball 闭包里，离线分发也装不到），profile 留下**孤儿条目**；内核 boot 按 manifest
  声明装配即解析失败退出。而既有清理链 `hub-registry.cleanLegacyProfileDependencies`
  只按「当前配套件名单」对账，`if (!plugin) continue;` 恰恰把「名字已不在名单里」的
  孤儿永久跳过——#170 回复里承诺「另开跟进」的就是这一环。
- **修复（boot repair 步新增 `scripts/lib/profile-orphan-dep-heal.js`）**：先于内核
  拉起与 compat-pin 相关步骤，遍历 `profiles/` 下每个 profile，按**本地确定性证据**
  （全为只读，boot 期绝不联网）判定孤儿并移除：① 只碰 `@deepseek-ai/` scope；
  ② spec 不是 `link:` / `file:` / `workspace:` / `npm:` / git 等协议形态；③ 不在内核
  vendor 闭包（`kernel-pin.packageVersion` + `vendor/dsh-kernel/deepseek-ai-<name>-<ver>.tgz`
  名单还原）；④ 不是内置配套件（`COMPANION_PLUGINS`）、不在同 manifest 的
  `dsh.profile.bundles` 里、profile 自有 `node_modules` 与 `.dsh-module-fallback`
  都无实体，且安装闭包派生的共享 farm（`<home>/profiles/node_modules`）也提供不了它
  ——后者保护「不在 vendor tarball 名单里但随客户端 npm 闭包分发」的合法声明（
  `@deepseek-ai/schemastery` / `@deepseek-ai/cordis-plugin-*`），farm 有货而 profile 内
  是无 package.json 的坏 shadow 时仍按孤儿处理（它就是 NOT_FOUND 的根源）。
  任一证据读不到（pin / vendor 目录不可用或名单为空）即**整体放弃**，
  宁漏勿误；健康 profile 零写入 no-op；清理动作 = 备份原文件
  （`package.json.heal-orphan-<ts>`）+ 原子写 + 日志归因（已知退役件单独标注）。
- **与既有链协调**：`cleanLegacyProfileDependencies` 的 `if (!plugin) continue;` 保留
  （用户自装与孤儿在此无法区分），但模块头与其行注释收口「issue #177 分工」——两条链
  各自幂等、判定面不重叠；已核实不会与 `recoverManifestBundles` / dsh-hub /
  super-injector 的写入路径来回拉扯（它们只补「盘上有实体且校验通过」或 `link:` 源的
  条目，正是本步的保留判据）。
- **测试 / 门**：新增 `scripts/test/unit-profile-orphan-dep-heal.test.js`（16 用例：
  孤儿剪除 + 备份 / 闭包内不动 / 非内核 scope 不动 / 解析失败容忍 / 无孤儿零写入零日志 /
  多 profile 且单个坏 manifest 不牵连 / 协议 spec 与 bundles 仍登记与 profile 内实装
  三保护面 / 剪空移除 `dependencies` 键 / 证据不可用整体放弃 / tarball 名还原包名（含
  `-vlln` 形态与陈旧版本剔除）/ 幂等二次 no-op 不重复备份 / dryRun 零落盘 / 未初始化
  profile 不凭空建文件 / farm 可解析的 npm 闭包件不误剪 / 坏 shadow 仍剪）；
  `unit-plugin-integration.test.js` 加 boot 接线红线
  （`healBeforeServer()` 走真实闭包证据把孤儿剪掉且保留合法声明）；
  `scripts/check-syntax.js` 入口清单纳入新模块。

### 插件市场整体替换：dshmarket → dsh-community-market（F5）

- **内置市场切换为上游 DSH Desktop 同款社区市场**：`assets/plugins/dsh-community-market`（源码构建自 [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) 的 `dsh-community-market`，MIT）——开放目录源架构（内置 DSH 1024Store / dshfind 两个合作目录适配器 + 标准 HTTP 目录源，用户自行添加与启用）、契约 schema 校验的目录快照、npm registry 精确版本 + 完整性校验安装（禁装产品包/生命周期脚本防护、失败自动回滚）、安装回执与启停管理。宿主半边挂 `/api/community-market/*` 十条路由；客户端半边（`window.__ModuleLoader__` CJS bundle）注册设置页市场 tab + 侧栏入口 + 全屏 overlay。
- **新增配套桥接插件 `dsh-market-desktop-bridge`（本仓库内置）**：上游市场在其 DSH Plugin Desktop 壳层环境赖以工作的四个 cordis 服务（`desktopProfiles` / `desktopPnpm` / `desktopPlugins` / `desktopActions`）由桥提供——`desktopPnpm` 重新调起启动本 host 的 dsh CLI 跑 `dsh plugin add/remove`（`dshArgv` 锚点与 pnpm 兼容语义移植自原 dshmarket 的 dsh-cli）；`desktopPlugins` 的启停读写 web profile 的 `cordis.patch.yml`，文件格式与壳层 patch-surgery `togglePluginInPatch` 双向兼容（关闭 = insert 内层条目迁出为顶层 `disabled: true` 块；启用 = 移除禁用行，带 name 的块保留为激活登记）；`desktopActions.requestRestart` 在受监管环境下为 no-op，实际重启由市场客户端补丁转接壳层桥。
- **构建与适配（源码 → 产物）**：esbuild 直出宿主 ESM bundle（`@deepseek-ai/*` + ajv/semver/yaml 外部化，经 profile vendor 同步与运行时闭包解析）+ 客户端 CJS bundle（上游 tsdown banner/footer 同构包装）；契约 schema JSON 构建期内联（上游运行期相对读 `docs/schemas/` 在 bundle 布局下层级错位）；sharp 换惰性解析 shim（调用期先按常规解析、再锚定 dsh CLI 入口同级取运行时二进制，缺二进制时按单图降级、绝不在加载期崩插件）；客户端产物打 `[desktop-restart-fix]` 补丁（重启转接 `window.dshDesktop.restartService()` 壳层原地监管重启，等价原 patch-dshmarket-restart 方案，脚本化为 `scripts/patch-community-market-restart.js`，市场重构建后需重跑）。
- **dshmarket 退役**：删除 `assets/plugins/dshmarket/` 与 `scripts/patch-dshmarket-restart.js`；`COMPANION_PLUGINS` 换登记 `community-market` + `market-desktop-bridge`；同步链新增 `removeRetiredDshMarketDir`（profile node_modules 目录 + manifest bundles/dependencies 登记，内置装配特征门防误删用户自装同名包）与 `removeRetiredDshMarketPatchRows`（patch 层 `dsh-market` 行，锚定 `dropBlocksByIds`），三条同步面（壳层 boot / WSL·Linux CLI / 退役清理）共用同一实现；VENDOR_DEPS 增补市场纯 JS 运行时依赖（ajv / ajv-formats / semver / yaml / @deepseek-ai/schemastery / @deepseek-ai/dsh-settings）；dsh-hub 中枢页市场检测切到新包。hub-registry 登记面随 COMPANION_PLUGINS 自动适配。
- **测试**：新增 `unit-community-market.test.js`（产物加载 / settings 命名空间与十条路由注册 / state 骨架 / 同源守卫 / 客户端包装与注入清单对齐）与 `unit-market-desktop-bridge.test.js`（patch 手术解析与幂等往返 / CRLF 保真 / 与壳层 patch-surgery 双向兼容 / hub 元数据规则）；sync CLI E2E 5 用例全绿。

### Tauri 线同步（tauri/modular，2026-08-22 持续优化批次）
- 内核家族 @deepseek-ai/* 0.1.1-rc.1 → 0.1.1-rc.2（19 pin，纯重发布）；patch 家族扩至 36 项
- 新增 runtime 补丁：agent-preset-fallback / prompt-context-literal / session-orphans / fallback-heal-isolation / credentials-initial-retry / credentials-absent-guidance / device-auth-guidance（双形态锚点）
- 插件波次：dsh-subagent-lens（新）、better-sidebar chunk 自愈重试、dsh-balance 槽竞态修复、graph-memory 模板 defuse、synapse 滚动三层防御+锁修复、dsh-file-drop 📎 附件链、dsh-float-window mount-then-hide、dsh-plugin-manager 后端健康卡
- composition-integrity 探测 + compositionPreflight 自愈（credentials 偶发缺席根治）


### 重构：插件管理子系统（plugin-center，单一门面 + 统一数据流）

- **统一门面与分层**：新增 `scripts/plugin-core/`（errors / ids / text / fs-atomic /
  state-store / patch-surgery / manifest-store / inventory / lifecycle / updates /
  scan / quarantine / markers / capability / supervision + `createPluginCenter`
  组装根），main.js 的插件段只接线不持业务。公共接口与数据流规范见
  `docs/plugin-center-architecture.md`；`scripts/lib/patch-io.js`、
  `scripts/plugin-manager-patch.js`、`patch-row-heal.js`、`profile-patch-heal.js`
  收敛为兼容再导出（全仓唯一实现，消除历史三处漂移）。
- **插件错误自动隔离（新能力，四级）**：
  - L1 加载期隔离：`scripts/lib/loader-isolation.js` 对 vendored
    cordis-plugin-loader / dsh-app-boot 注入自动隔离——条目 apply / fiber 结算 /
    激活审计失败只跳过并打 `[loader-isolation]` 标记，其余插件照常组合；
    受保护核心（dsh-base / dsh-web-app）失败仍 fatal；
  - L2 运行时异常隔离：web-crash-shield 升级（武装标记 + 按肇事来源归因计数），
    installFailLoud 就绪后不再 exit(1)；
  - L3 自动隔离落盘：壳层观察标记 → quarantine（官方 disabled 覆盖行 + 状态存储
    `desktop-plugin-state.json` v2）→ 系统通知 + 守护重启；插件管理页可一键恢复
    （闭环、无死循环；启用/恢复清除本会话去重，会话内可重复触发）；
  - L4 挂死恢复：dsh web 存活探针（连续 3 次探活失败且非忙态 → 守护重启），
    补「进程存活但假死」盲区；同一 10 分钟窗口最多自动重启 2 次，耗尽后停止
    自动重启并提示排查（稳定落地后配额复位）。
- **安装/卸载自由面修复**：第三方 bundle 归入 community 组（可开关/可卸载）；
  卸载完整清理（bundles 登记 + dependencies 键 + 目录 + .pnpm store 无引用副本），
  决策落家级状态存储——patch 被自愈重置也不复活；第三方恢复返回
  `PLUGIN_RESTORE_NO_SOURCE`（不再假成功）；运行中目录操作 rename 语义。
- **更新链加固（fail-closed）**：npm integrity（sha512）/ GitHub digest 缺失一律
  拒绝；下载仅 https（重定向禁降级/环）；传输层字节上限（JSON 4MB 在传输层生效）；
  tar 归档条目预检（拒绝 `../`、绝对路径、ADS、保留设备名含 `CON .txt` 形态、
  symlink/hardlink/设备）与解压后链接复检；包名必须存在且与目标一致、版本严格
  高于当前安装版本（拒绝降级）；更新内容静态扫描门禁（高危需确认）；原子替换 +
  rename 回滚（与卸载共用 `profile-modules` 锁）。
- **IPC 与权限收紧**：插件管理 IPC 全量 frame-origin 精确校验（修复 list/set-enabled
  只查 sender 的不一致）；卸载/更新/备份恢复/重排等破坏性动作主进程二次确认（文案
  按 capability.CONFIRM_MESSAGES 单一数据源）；`setPermissionRequestHandler` 拒绝
  摄像头/麦克风/定位等媒体权限（白名单放行 fullscreen/pointerLock/notifications/
  clipboard 且请求 origin 与当前 webUrl 精确相等）。
- **对账/同步修复**：reconcile 隔离记录同 code+reason 去重、removedByPolicy 只报
  实际移除名、reset 仅表示「存在但损坏」、manifest 写失败仅告警、包名形状校验；
  companion 过期清理加白名单并覆盖非 scope 落点；loader id 字符集全仓统一（点号
  id 可写可愈）；removeBundledRowDuplicates 的 id 级去重接线；plugin-guard 扫描
  收口 scan.js。
- **测试**：新增 20 个测试文件、354 项单测（`unit-plugin-core-*` 14 个模块深测 +
  `unit-loader-isolation(-deep)` + `unit-web-crash-shield(-deep)` +
  `unit-compat-*` 回归钉死 + `unit-plugin-center` 组装根端到端），覆盖：状态存储写穿
  合并/回滚/readOnly、WriteGate TOCTOU/心跳/重入、卸载 I1 失败注入中止、更新链全
  拒绝路径 + 回滚、归档名 fuzz、扫描 5 模式、quarantine 闭环、标记跨 chunk 逐字节
  切割、capability 全矩阵、supervision 假时钟全窗口、隔离变换语法变体 + 子进程执行
  级行为、compat 修复逐项钉死；全量单测 1056 项全绿（2 项既有环境跳过）；
- **集成场景**（真实 Electron 隔离环境）：新增 `plugin-uninstall-restore-e2e`
  （卸载四层清理 → 完整重启不复活 → 恢复 → 完整重启重新装配）与
  `plugin-supervision-zombie-cap`（假活判定 → 守护重启 → 配额耗尽停止自动重启）；
  `plugin-auto-isolation` 扩展「会话内重新启用 → 热更新路径再次隔离」闭环断言。

### 修复
- **模型设置读取不到 opencode-go 的 DeepSeek V4 Flash Vision Exp（`deepseek-v4-flash-vision-exp`）**：设置页「模型」对该源「获取可用模型」与模型选择器都经 pi-ai 内置 catalog 作答（`dsh-llm-pi-ai` 的 discovery 对 catalog 命中源不访问端点），而 pi-ai 的 `opencode-go` catalog 落后于端点——线上 `https://opencode.ai/zen/go/v1/models` 实际返回该型号（唯一 vision/exp 变体，`opencode` zen/v1 源无此型号、`deepseek-official` 源本就内置），本地目录缺失 → 全链路看不到。修复（新增 `scripts/patch-pi-ai-opencode-go-models.js`，幂等、锚点失配自动跳过）：向 `@earendil-works/pi-ai/dist/providers/data/opencode-go.json` 的 openai-completions 分组克隆同族基型 `deepseek-v4-flash` 条目并追加 image 输入（容量/计费/compat/thinkingLevelMap 沿用基型，与 `dsh-llm-deepseek` 官方目录的登记方式一致；上游重新生成 catalog 收录后经「已存在即跳过」自然退役）；以 `pi-ai-opencode-go-models` 规格登记进 patch-registry（`nm-roots` 布局 + cli:true，桌面壳启动 / CLI 同步覆盖全部运行副本），并接入 patch-deps（postinstall dev node_modules）与 check-syntax 语法门。端点另有 glm-5.3 / qwen3.8-max / mimo-v2-omni 等目录缺失型号，因 /models 列表不含容量与计费、无法安全推导而有意不自动补齐（可在设置页手工录入）。新增 `unit-patch-pi-ai-opencode-go-models`（8 项：克隆形态/幂等/上游自然退役/锚点缺失与非法 JSON 字节级不损坏/目录缺失静默/dry-run/stats 计数），registry 计数断言同步 10→11。

## [0.4.1] — 2026-08-19

> 热修复版：插件市场装插件后「服务意外退出」崩溃事故根治（三层防线）+ 空 tool-call 存量会话打不开修复。

### 修复
- **空 tool-call 持久化导致存量会话打不开（SessionPersistenceCorruptionError）根治**：session writer 曾把 id/name 为空的 tool-call 写入持久化（assistant message 的 tool-call block、tool/call 事件的 callId/name 均为空串），随后生成 callId/toolCallId 为空的 tool/result；export 能导出该 JSONL，但 dsh-session restore 的 `assertMessageEventShape` 严格校验要求 tool/result 必须有非空 tool source，整个会话「历史加载失败」打不开（事故会话 seq 连续 0..515255、帧可解，仅此一条空链击穿）。双端修复（新增 `scripts/lib/tool-source-patch.js`，幂等、锚点失配自动跳过，接入 main.js 启动 / patch-deps / after-pack / sync-companion-plugins 四条布线，覆盖内置副本 / profile fallback / agent overlay / WSL）：
  - **读端容错（存量会话能打开）**：dsh-session 校验遇到空 callId/缺 kind 的 tool/result 时就地修复——优先采用 block.toolCallId 非空侧，否则合成 `recovered-seq-<seq>` 并拉齐两侧，告警落日志；修复写入失败（对象已冻结）保留原严格报错；两侧 callId 都非空且不一致仍是真损坏继续拒绝。
  - **写端防护（不再产生新坏数据）**：dsh-agent-loop `appendToolCall`/`appendToolResult` 遇空 block.id 时合成 `recovered-<turn>-<step>-call`（两函数同规则保证 tool/call 与 tool/result 一致）并告警，空 name 落 `invalid-tool-call`。
  - **测试**：新增 `unit-tool-source-compat`（7 项：双变换真实 vendored 文件锚点命中/幂等、空 callId 就地修复放行、缺失形态以非空侧为准、双非空不一致仍拒绝、正常事件不受影响）。
- **发布流水线修复（三平台五架构全绿）**：① Windows 两腿「Verify packaged app natives」失败——node-pty 1.2.0-beta.15 的 win32 预编译目录从 `pty.node` 改为 `conpty.node`/`conpty_console_list.node`，校验 glob 改为 `*.node` 通配；② Linux 腿 Publish 失败——electron-builder 把 AppImage 的 `${arch}` 渲染为 `x86_64`（非 `x64`），上传 glob 改为 `dist/*.AppImage`；③ ci workflow 余额渲染层验证——npm ci 不触发 electron 二进制下载，步骤内显式 `node node_modules/electron/install.js`；无 GPU runner 补强（harness `app.disableHardwareAcceleration()` + GPU 子进程消失容忍、驱动层禁 Windows 无头遮挡判定节流、integration-runner `--disable-gpu`）。
- **插件市场装插件后「DSH 服务意外退出」崩溃根治（三层防线）**：用户从插件市场安装插件后点「立即重启」，dshmarket 直连其服务端自重启端点 `scheduleRestart()`——SIGTERM 掉被壳层监管的 dsh web 进程，再由 detached 助手拉起替身。壳层把自杀当「服务意外退出」弹窗（即事故截图），且替身进程脱离监管：退出应用时杀不掉、日志不落 dsh-web.log、用户点弹窗「重新启动」会拉起第三个实例撞端口。dshmarket 原有桌面分支（`allowRestart: false`，注释写明 "The shell remains responsible for restart"）依赖壳层注册 `desktopProfiles` 服务，而壳层从未注册，永远落入普通 DSH 分支（自重启开启）。三层根治：
  - **L1 重启权收归壳层**：壳层 `childEnv` 注入 `DSH_DESKTOP_SUPERVISED=1` 监管标识；dshmarket 服务端见到标识默认禁用自重启端点（显式 `config.allowRestart` 仍优先）；dshmarket 客户端「立即重启」在壳层桥（`window.dshDesktop.restartService`，即 `chrome:restart-service` 监管重启）可用时优先走桥，boot-id 轮询重载逻辑原样复用——按钮可用、重启受监管、不弹窗、不产生游离进程（与 dsh-hub 同款桥接模式）；
  - **L2 壳层稳定性看管（任何环插件均受益）**：① 「最后良好」快照延迟落定——旧实现 dsh web 一达就绪横幅即 `markGood`，环插件「启动成功、几秒后拖死宿主」的形态会把含环插件的配置固化成回滚基线、回滚永久无效；现改为服务连续存活 30s 才 `confirmPendingGood` 落定并清零崩溃环计数；② 就绪后崩溃环自愈——进程达就绪后 30s 内意外退出不再直接弹窗，而是自动走守护重启（体检/修复/回滚到最后良好快照），上限 2 次，耗尽才降级弹窗；③ 「服务已停止」弹窗的「重新启动」按钮改走守护启动（旧为裸 `startAndShow`，环插件会导致「点一次崩一次」死循环）；④ `restartService`（插件市场/集成测试共用的原地重启）同样改走守护启动；⑤ 回滚 lift 修复：旧实现回滚后成功拉起时把 `listSnapshots()[0]`（= restore 前的 pre-restore 快照 = 坏状态）标为良好，现改为对回滚后的健康状态新拍快照待落定；⑥ 意外退出弹窗延迟 500ms 再读日志，给 stderr 尾部真实崩溃栈落盘窗口（exit 事件可能早于最后几个 stdio data 事件，立即读会丢现场）；
  - **L3 dsh web 进程崩溃屏蔽**：新增 `scripts/lib/web-crash-shield.js`（纯 Node 核心依赖，经 `--require` 注入 + `DSH_CRASH_SHIELD=1` 自装）：就绪横幅出现前保持 fail-fast（启动失败快速退出语义不变，既有启动自愈照常工作）；就绪后 uncaughtException/unhandledRejection 吞掉并打日志到 stderr（随管道落 dsh-web.log），环插件运行时错误不再击穿整个宿主；风暴断路——60s 窗口内错误超 20 次恢复抛出（进程退出 → 壳层崩溃环自愈接管回滚），避免僵尸态。`scripts/**/*` 已在四个打包配置的 files 清单，随包分发。
  - **测试**：新增 `unit-web-crash-shield`（8 项：启动期 fail-fast、就绪后吞错落日志、unhandledRejection 同语义、风暴断路与窗口清零、就绪横幅探测 arm、事件监听注册）与 `unit-plugin-guard`（5 项：成功不立即落定、confirm 后落定、崩溃环场景回滚目标为此前稳定快照而非环配置、setPendingGood(null) 安全、失败无快照落事故报告）。

## [0.4.0] — 2026-08-19

### 新增
- **Quest 模式界面（dsh-quest-ui，默认关闭）**：全新 Qoder Quest 风格视觉重设计——输入区与画布彻底融合（去白底、去圆角、下栏拉高）、底部一体化（去胶囊 CSS / 幽灵按钮 / 余额同层 / 聚焦顶线）、全开布局（去胶囊 / 卡占满下栏 / 部件贴缘压底）。设置页弹窗重设计，聚焦线加浓加粗 + 编辑钮隐藏 + 临时会话移右上角 + 面板降噪。左侧栏启动时强制展开。多轮迭代至 v0.5.4：synapse 会话地图适配双 UI 通用 + 输入区底部一体化
- **内置 dsh-synapse 会话地图插件（vendored，MIT）**：可视化会话关系图谱，快速跳转关联会话，随包分发并自动装配
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测
- **手机远程控制（DSH-Mobile v1.4.2）**：随包分发手机端 APK，「远程控制」按钮一键连接，支持外网穿透 + P0 同步修复 + 安全加固
- **macOS 无签名构建 Gatekeeper 指引与配置显式化**：未签名 / ad-hoc 签名构建首次启动若提示「已损坏，无法打开」，README 与 troubleshooting.md 提供修复指引（`sudo xattr -cr` → codesign 重签 → 右键打开 → 终端直启取证）；构建配置显式关闭 `gatekeeperAssess` 与 `hardenedRuntime`（无 Developer ID 的包无意义，消除误导性警告）

### 修复
- **自定义卸载器升级链路根治（2026-08 数据丢失事故修复）**：electron-builder 的 `uninstallOldVersion` 宏把注册表里旧的 `UninstallString` 指向的卸载器拷到临时目录执行 `old-uninstaller.exe /S /KEEP_APP_DATA --updated`，旧版自定义卸载器不识别这两个升级契约参数，静默模式下默认全删用户数据（sessions / settings / credentials 等全部丢失）。双层根治：① **卸载器侧**：识别 `/KEEP_APP_DATA`、`--updated`、`/updated`、`--upgrade` 等升级意图参数 → 等价 `/KeepAll` 保留全部用户数据；静默模式安全契约——无升级标记且无显式 `/FullWipe` 时拒绝删除用户数据直接退出；Roaming 目录（`%APPDATA%\DSH Desktop`，含 logs / settings.json / window-state）在保留应用设置或其他用户数据时不再删除；UAC 提权子进程在静默模式下 `WaitForExit` 等待完成，避免安装器与子进程并发删文件。② **安装器侧**（`installer.nsh` `customInit` 宏）：`.onInit` 阶段（早于 install section 的 `uninstallOldVersion`）抢先把旧安装目录里的 `Uninstall_DSH_Desktop.exe` 覆盖为本安装包自带的修复版——即使存量用户机器上仍是旧坏卸载器，升级安装时实际执行的也已是修复版。InstallLocation 缺失时回退解析 `UninstallString`（含引号剥离 + 文件名校验），覆盖路径万无一失。经实机演练验证：编译旧版坏卸载器 → 布置数据标记 → 静默覆盖安装新包 → 标记文件存活 / settings.yaml 完整 / Roaming 数据保留 / 卸载器被自动替换
- **余额显示链路整体加固（架构重构而非补丁）**：本轮费用计算、余额查询、编排推送全链路系统性修复 21 处缺陷（2 严重 / 3 高 / 8 中 / 8 低），全部按「整体架构改进」落地：
  - **本轮费用输入项恒为 0（严重，OpenAI 兼容端点）**：`sessionCost` 的 `uncachedInputTokens + cacheWriteTokens` 求和先于 `||0` 守卫求值，openai-compat 适配器产出 `inputTokens` 形态且不产出 `cacheWriteTokens`，两处契约不匹配 → `undefined+undefined=NaN→0`，所有 one-api/SiliconFlow/Ollama 端点本轮费用只剩 cacheRead+output 计费。根治：① 客户端新增 `normalizeUsage` 归一化（投影/透传两种形态统一四桶、每操作数独立守卫）；② `openai-compat.js` 的 `mapUsage` 对齐 harness DISJOINT 契约（`inputTokens = prompt − cacheRead − cacheWrite`，缓存写单列、兼容多种 provider 字段命名）并附带 `model` 字段。
  - **重定向无条件携带 Authorization 泄露 API Key（严重，安全）**：`fetchJson` 跟随 3xx 时把密钥原样转发到新 URL，跨主机或 https→http 降级时计费凭证被发往非预期主机。根治：首跳（用户显式配置的端点）始终携带密钥；重定向跳仅「同主机且全程 https」保留，其余剥离并经 `warning` 显式告警。
  - **refreshBalance 无并发去重（高）**：并发触发时慢失败覆盖快成功 / 旧数据覆盖新数据（last-writer-wins）。根治：新增 `balance-scheduler.js` 编排模块——in-flight 去重（并发共享一次请求）+ latest-sequence 守卫（只有最新请求结果写 cache/推送）。
  - **持久失败 30s 无限重试（高）**：密钥错误/断网时每 30s 两发 HTTP 永不停歇。根治：指数退避 30s→1m→2m→5m 封顶，成功清零，禁用状态不重试，退出前统一清理。
  - **默认模型价估实际会话费用，最大 3x 偏差（高）**：prices 取 settings 默认模型档套到会话全部 token。根治：主进程每次推送**全模型价目表 `priceTable`**（同一时刻求值），适配器 usage 携带 `model`，客户端按会话真实模型选档；会话模型不可知时明确标注「按默认模型 X 单价估算（会话实际模型未知）」，绝不假装精确。
  - **peak 与 prices 两次独立 `new Date()` + 切换点不检查（中）**：临界秒 chip 文案与计价档可能自相矛盾，且旧版期 `isPeakHour` 也返回 true。根治：编排层取单一 `now` 传入三个函数（签名支持 date 参数）；`isPeakHour` 在峰谷生效节点（2026-08-16 16:00 UTC）之前恒 false。
  - **pickUsageWindow 把 percent:null 转 0（中）**：`Number(null)=0` 使「未知用量」显示成「0%」。根治：`percent == null ? NaN : Number(...)`，非有限一律保持 null。
  - **超时为 socket 空闲超时、1MB 上限按字符计（中）**：slow-drip 服务器可长期保活绕过 15s；多字节内容实际可超 1MB。根治：跨重定向共享 deadline 的总超时 + socket 空闲双保险；按 `Buffer` 字节累计上限。
  - **readCredentialLine 逐行正则不区分 YAML 段（中）**：嵌套段同名键可能读到错误密钥。根治：只匹配列 0 顶层键，支持引号值/行尾注释/正则元字符键名。
  - **http 端点明文传输无提示（中）**：显式支持 http 代理但密钥明文过网。根治：结果携带 `warning`，主进程记日志，README 提示仅建议本地代理。
  - **格式化余额字符串静默清零（中）**：`Number("1,234.56")=NaN→0`。根治：`parseAmount` 剥离千分位/货币符号、负数钳 0、脏数据显式告警。
  - **sessionCost 无下限保护（中）**：负 token 产生负费用。根治：逐桶 `Math.max(0, …)`。
  - **OpenCode URL 硬编码无环境覆盖（中）**：代理场景必走公网。根治：`OPENCODE_USAGE_URL` 环境变量覆盖。
  - **低危项全部修复**：`money` 格式化边界（0→"0.00"、超大→本地化不出现 `1e+21`、非有限→"—"）；外链 `rel="noopener noreferrer"`；`goUsageText` 全空返回 null 不再渲染空白 chip；`readActiveModel` 逐行状态机锚定段（前缀相似段/深层嵌套同名键不误匹配）；refreshBalance 内 settings 双读合并为单读；IPC 双通道重复投递改为「处理器只触发不返回数据 + 客户端只消费事件 + 页面内已收推送不再重复触发」；数组子元素补稳定 key 消除 React dev 告警；价目表 `PRICING_MODELS` 统一维护。切换瞬间价格跳变（低）经评估为官方整点计费口径本身，保持整点切换并保证显示与计价档自洽（见 `docs/balance-architecture.md` §7）。
  - **测试体系**：新增/扩充 79 项 node:test 断言——`unit-balance`（21：峰谷临界点 ±1ms、顶层键锚定、段锚定、金额解析矩阵、端点覆盖、重定向端口归一）、`unit-balance-scheduler`（14：节流/去重/stop 守卫/退避重试/单一 now/设置单读/禁用短路）、`integration-balance`（16：真实回环 HTTP/HTTPS mock——重定向密钥剥离矩阵、slow-drip 总超时、字节体积上限、http 警告）、`edge-client`（19：vm 沙箱加载真实产物，token 归一化矩阵含 [BUG] 回归用例）、`unit-openai-compat`（9：适配器 DISJOINT 契约端到端 + 缓存字段规整）+ **真实环境验证 `verify-balance-renderer`**（16：仓库自带 Electron 在隐藏 BrowserWindow + 真实 React 18 + 真实 DOM 中加载 client.js 产物，全程零网络、userData 指向临时目录、绝不触碰真实 ~/.dsh）；存量 `verify-balance-dock` 17 项断言保持通过，合计 112 项全部通过。全量测试目录仅剩 2 项与本改动无关的既有环境前提失败（`unit-updater` 的 activeVersion 两项断言依赖「本机无 bundled agent」，在干净检出通过、带 node_modules 的开发检出受本机 dsh 版本影响）。
  - **文档与打包**：新增 `docs/balance-architecture.md`（数据流/载荷契约/token 契约/安全边界/编排语义/缺陷映射表）；README 余额段更新（3 分钟轮询、峰谷价目表、新环境变量、http 告警）；`balance-scheduler.js` 纳入四个 electron-builder 配置的 files 清单与 `check-syntax.js` 语法门。
- **余额显示链路加固——全量 review 修正**：
  - **`balancePrices.<model>` 覆盖现作用于价目表（修复功能回归）**：原实现把用户单价覆盖只并入 `prices`（默认模型档），而客户端按会话真实模型优先走 `priceTable`，导致「真实跑该模型的会话静默忽略覆盖」。现覆盖统一合并进 `priceTable`，`prices` 恒等于 `priceTable[默认模型]`，定价单一真源；`unit-balance-scheduler` 断言同步更新。
  - **`mapUsage` 缓存字段 Number 规整**：`cacheReadTokens`/`cacheWriteTokens` 原样透传，provider 返回字符串会破坏 DISJOINT 三桶不变量、垃圾串会产出 `inputTokens=NaN`。现经 `toFiniteTokenCount` 规整（仅接受非负有限数，其余忽略），并补「数字串/垃圾串」断言。
  - **OpenCode Go 告警可见性**：http 明文 / 重定向剥离密钥的 `warning` 原落在 `opencodeGo.warning` 但既不记日志也不展示，现 `apply` 补记日志，与余额侧一致。
  - **latest-sequence 守卫口径修正**：该守卫在当前 API 下恒真（in-flight 去重已杜绝并发多请求），属防御性兜底；补「stop() 期间在途请求不推送」单测覆盖其可达的 `!stopped` 分支，架构文档与测试头注释如实标注。
  - **低危收口**：纯浏览器兜底价 `FALLBACK_PRICES` 对齐默认模型 deepseek-v4-pro（原为 flash，低估 3x）；重定向同主机判定改为 hostname+port（默认端口归一化）；`disabled` 退化形态补齐契约字段；`queryBalance` 对非对象响应加守卫 + 去重 `parseAmount` 调用；fetchJson 重定向清理本跳 socket 空闲定时器；React 数组子元素 key 修正（消除残留 dev 告警）；`verify-balance-renderer` 防御性清除 `ELECTRON_RUN_AS_NODE` 并加 `--disable-gpu`（无 GPU 环境可复现）。
- **内置插件市场 zat-dsh-engine 默认移除（社区反馈：默认不要带旧引擎市场）**：`COMPANION_PLUGINS` 移除 `plugin-market`（`assets/plugins/zat-dsh-engine` 目录随包删除），内置市场统一为 dshmarket（设置页入口不变）。存量 profile 里已装配的旧市场副本由 `retireZatEngine` 一次性清理（profile node_modules 目录 + manifest bundles 登记），settings 标记 `zatEngineRetired` 保证只清一次——之后用户从 dshmarket 主动重装不受影响。
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测。
- **agent 更新回退失败后静默卡住**：overlay agent 启动失败弹窗的「回退到内置版本并重试」分支直接调用 `updater.rollback()` 且无异常保护——回退本身失败（overlay 目录被安全软件/句柄锁定）时异常成为 unhandledRejection，用户点击后应用无任何反应、静默卡在失败页。现回退包 try/catch，失败显式弹「回退失败」错误框（说明文件可能被占用）并给「重试回退 / 退出」两个出口。
- **profile bundle 装配链根治性重构（「declares no dsh.bundle」一类启动失败不再依赖锚点补丁）**：`dsh.profile.bundles` 中任何一条登记不满足 dsh 装配契约（包未安装 / 未声明 `dsh.bundle.patch` / 补丁层缺失或损坏 / 入口文件缺失），官方 `dsh-app-boot` 即 fail-loud 以退出码 1 启动失败。此前唯一防线是启动前对 dsh 构建产物做字符串锚点改写（跳过 + 诊断），锚点随 dsh 版本变化失配即静默失效——用户反馈的 `profile bundle "dsh-hub" declares no dsh.bundle`（纯客户端 bundle 被登记进 profile.bundles）正是该形状，且入口缺失形状（loader 激活期 `plugin tree failed to load`）在防护覆盖范围之外。本次重构把「启动前把 manifest 对账到可装配状态」收口为唯一实现 `scripts/lib/profile-reconcile.js`（main.js 与 `sync-companion-plugins.js` 共用），运行时防护保留为纵深防御：
  - **全量逐条校验**：每条 bundles 登记按与 dsh 装配契约一一对应的 11 种失败码校验（登记名非法 / 包未安装 / 未声明补丁层 / 补丁层越界·缺失·不可解析 / 入口越界·缺失·指向目录 / client 入口越界·缺失，补丁层用与 dsh 相同的 entry-list YAML 方言解析；client 入口校验与上游 `verifyBundleDir` 新增的 `exports["./client"]` 校验同语义、文案逐字一致，并在对账侧收口为结构化失败码）；无效且非核心的登记**从 manifest 移除**并写入隔离记录 `dsh-desktop.broken-bundles.json`（移除原因 + 时间，重装插件重新登记即恢复，恢复健康后记录自动清除）；核心 bundles（`@deepseek-ai/dsh-base` / `dsh-web-app`）校验失败绝不移除（核心缺失是安装损坏而非数据问题，保留并由启动防护兜底跳过 + 告警）；
  - **校验实现单一化**：`profile-bundle-heal.js` 提取 `inspectBundleDir` 为唯一结构化校验实现（`verifyBundleDir` 变为兼容包装，文案与契约不变），对账与同步侧防呆共用同一判定语义；
  - **家级补丁层启动前预检**（`healHomePatch`）：`$DSH_HOME/cordis.patch.yml` 损坏此前只由 profile-boot 锚点补丁兜底，现启动 dsh web 前用同一方言预检，损坏 → 备份 `.broken-<ts>` + 重置为最小合法文件；
  - **既有语义逐项保留**：损坏 manifest 备份重建（.broken-<ts>）、核心补齐（issue #16）、配套登记追加、源缺失/卸载标记移除、重置后用户 bundle 恢复（issue #48）与全部日志文案不变；健康 manifest 零写入（幂等），写入全部原子化；
  - **CLI 同步收口**：`sync-companion-plugins.js` 的 manifest 段改用同一对账实现（`initMissing=false` 保持「不凭空创建 manifest」历史契约；损坏 manifest 在核心可解析时同样备份重建，dry-run 输出计划）；
  - **测试**：新增 `unit-profile-reconcile` 25 项单测（含两个真实 `dsh-app-boot` 复现测试——无效登记在官方 `loadProfile` 下必崩、对账后正常装配）；集成场景 `heal-missing-bundle` / `heal-manifestless-bundle` / `heal-broken-bundle-patch` / `heal-broken-home-patch` 断言更新为「移除 + 隔离记录 + 正常启动」，新增 `heal-entry-missing-bundle`（防护覆盖不到的入口缺失形状）；`check-syntax.js` 纳入新模块。
- **全量 review 修正（装配对账判定与 dsh 官方契约逐字对齐）**：
  - **补丁层条目级校验**：dsh 官方 `parsePatchList` 要求补丁层「顶层数组且每项为映射」，原校验只查顶层数组——`- 42` / `- "x"` / `- [1,2]` / `- null` 等畸形文件会被判健康、dsh 装配时仍 fail-loud。`inspectBundleDir`、`healHomePatch` 与 `healProfilePatch` 现共用 `isPatchListValid`（与官方逐字同构）判定；
  - **包解析与官方同构**：`validateBundleEntry` / 核心可解析判定改用与 `resolveBundleDir` 相同的 `createRequire.resolve.paths` 探测（含 NODE_PATH 与全局 node_modules）——此前 `packageDirUpward` 探测不到 NODE_PATH/全局安装的包，会把官方实际能装配的健康登记误判 UNRESOLVABLE 而误删；
  - **配套登记与恢复登记复检**：`addNames` 追加与 issue #48 恢复的登记此前只经 `verifyBundleDir`（不查补丁层可解析性），YAML 损坏的配套/恢复 bundle 会留下一个「仅靠运行时防护兜底」的启动窗口；现追加前/恢复后统一过 `validateBundleEntry` 复检，失败 → 不登记/移除 + 隔离记录。
- **全量 review 第二轮修正（对账语义收口与记录生命周期）**：
  - **入口文件必须是普通文件**：`inspectBundleDir` 的入口校验由 `existsSync` 升级为 `statSync().isFile()`——入口路径指向目录时（`main: "./lib"` 等形状）存在性检查会放过，而 dsh Loader 用 ESM `import()` 激活入口必然 `ERR_UNSUPPORTED_DIR_IMPORT`（防护覆盖不到的崩溃形状），现判 `ENTRY_MISSING` 并在启动前移除登记；
  - **策略性移除不进隔离记录**：配套源缺失 / 插件管理「卸载」标记的登记由步骤 4/6 按「用户意图禁用」移除，不再被步骤 2 判 UNRESOLVABLE 写入隔离记录（卸载/源缺失是用户意图而非无效登记，避免记录误导；CLI 同步同步补上 `removedBundles` 与 `excludeFromRecover`，与 main.js 口径完全一致——此前 CLI 不会把已卸载配套从 manifest 移除，且重置恢复可能把用户已卸载的配套重新登记）；
  - **隔离记录同轮清除**：`addNames` 登记成功与重置恢复成功时，同名历史隔离记录当轮即清除（此前要等下一次启动的步骤 2）；
  - **记录写入去重**：同 code + reason 的既有隔离条目不重写（保留首次 `removedAt`，持续损坏状态不再每次启动重写记录文件）；`addNames` 校验失败不再对未改动的 manifest 做内容相同的重写；
  - **健康检查口径统一**：`logProfileBundleHealth` 改用与对账相同的 `resolveBundleDirLike` 双锚点解析，消除「对账判定可解析、健康检查误报缺失」的口径撕裂（诊断只读）；
  - **重复登记去重**：同一 bundle 名在 `dsh.profile.bundles` 中登记两次时，其补丁层条目会重复出现在组合 entry list 中，loader 装配期抛 `duplicate loader entry id`（fail-loud → 退出码 1），且启动防护覆盖不到（两层都能正常加载）——现对账保留首次出现、移除重复项（冗余而非无效登记，不进隔离记录），该形状此前从不清理；
  - **测试环境封闭**：`unit-sync-cli` 的 CLI 调用 PATH 收口到 System32——CLI 的 `findDshPackageDir` 会经 PATH 探测 `dsh` 命令，环境 PATH 上的真实 dsh（如 harness 安装）会被当作预设同步目标，把 `assets/agent-presets` 写进真实安装（内容相同、mtime 被改写）；测试必须封闭，绝不触碰真实环境。
- **防护层修复（issue #97/#98/#99/#100，另含 #75 补强）**：社区批量上报的「防护罩有洞」问题逐一修复——
  - **插件 GitHub Release 多资产选择（#97）**：原实现 `isWinAsset` 用子串匹配（`darwin` 含 `win` 会误判为 Windows 资产，选中 macOS 二进制）、无架构优先级（`win-ia32` 与 `win-x64` 乱序时选错）、无归档时可能选中 `.sha256` 校验和文本。现收口为纯函数 `selectReleaseAsset(assets)`：词边界平台判定（`win32-x64.tgz` ✓ / `darwin-x64.tgz` ✗）、架构优先级（x64/amd64 → arm64/aarch64 → ia32/x86 → arm → 无架构兜底，稳定排序）、任何阶段排除校验和/签名/说明等非二进制文件（含无扩展名 `SHA256SUMS`/`SHA512SUMS` 与 `.sha1`；全部被排除 → 明确拒绝更新并提示），10 项单测；
  - **语法门禁剥离器支持正则字面量（#98）**：`check-syntax.js` 的字符串/注释剥离器不识别 JS 正则字面量——含引号的正则（如 `/[&<>"']/g`）会把引号当字符串起始，与后方引号配对将中间真实代码整段涂白，门禁对「孤立 async」失明（实测 preload.js 77.2% 被涂白、19 个 function 被吞）。现新增 `scanRegexLiteral`（跳过转义与字符类、拒绝跨行伪正则、闭 `/` 后按 flags/除法链判定）整体涂白正则字面量；补除法链识别（`a / /re/g` 第一个 `/` 按除法跳过，`return /re/` 等关键字后接正则按白名单放行）、flags 白名单含 ES2022 `d`/ES2024 `v`；并给门禁加 preload.js 失明硬断言（保留率 <23% 或 function 被吞 >5 即 FAIL 且报错注明触发项，正常基线 ~29%/吞 1 字符串内文本），26 项单测（含 mid 注入回归，防 EOF 特判假绿）；
  - **防砖体检 manifest 读取失败假绿（#99）**：`desktop-validity.js` 的 `validatePlugins` 用 `catch {}` 静默吞掉 profile `package.json` 读取/解析失败——启动清单读不到时清单内缺陷全部降级为 warning，体检返回「未发现问题」（假绿）。现显式记录 `manifestError`、总结论判定失败（含 `dsh.profile.bundles` 字段存在但非数组的结构损坏变体；字段缺失仍视为合法空清单），设置页体检区红字提示「无法读取启动清单，体检结果不可信」，4 种情形回归测试（缺失/损坏 JSON/bundles 非数组/正常）；
  - **补丁条目 id 负向断言漏掉行内空白（#100）**：`togglePluginInPatch` 的条目定位负向断言 `(?![A-Za-z0-9_.-])` 对行内空格放行——非标 id `- id: foo bar` 会被 `toggle('foo')` 命中误加 disabled（insert 内层更会被整条误删）。负向断言加入空格/tab（只排除行内空白，不排除 `\n`——排除换行会让所有既有条目匹配不上退化为重复新建），3 项回归测试；
  - **行注释内引号吞代码（#75 补强）**：剥离器此前不处理 `//` 行注释，注释内的引号会被当字符串起始吞掉后续代码（漏报比误报更危险）。现行注释整体涂白到行尾（保留换行），8 场景探测全过。
- **主窗口位置记忆（重启后回到用户放置的位置）**：主窗口关闭时持久化屏幕坐标与尺寸，下次启动恢复到用户上次放置的位置（跨屏校验 + 钳制回可视区），不再每次居中
- **会话删除守卫改为实时查询运行状态**：删除非当前会话后补回输入框焦点（修复光标消失仍可输入的边界问题），修复删除后输入锁死与误弹失败提示
- **清单 id 对齐 loader id 修复双登记崩溃（#104）**：插件清单 id 与 cordis loader id 不一致导致 `duplicate loader entry id` 启动失败，现统一对齐；side-session 升级 v0.3.0
- **卸载器清理加固（P0-P8）**：自定义卸载器全面加固——进程关闭重试策略、目录删除重试、注册表清理完整性、快捷方式清理全覆盖；dist 脚本自动构建卸载器（`predist` 钩子）；卸载二次确认弹窗防误操作
- **侧边临时会话透传服务端 error 字段**：模式 1 默认配置报错时正确展示服务端返回的错误信息，而非只显示「HTTP 502」；`deepseek-official` 供应商解析修复
- **WSL 清理命令双重登录 shell 嵌套与失败清理超时**：WSL 后端清理命令不再嵌套多余的 `cmd /c`，失败清理流程超时兜底
- **会话持久化容错增强**：进程中断留下的 zstd frame 尾部半截 JSONL 容错处理——只允许最后一个 frame 进入 torn-tail 截断/重放流程，中段损坏继续拒绝，覆盖内置 / profile / agent overlay 三份运行副本
- **自动更新 null 版本兜底 + keyed slot 注册错误隔离**：版本比较对 null/undefined 安全兜底；keyed slot 注册缺少 key/id 时容忍而非崩溃
- **打包白名单补齐 plugin-guard 依赖链**：`profile-module-heal.js`、`patch-row-heal.js`、`plugin-guard.js` 纳入四个 electron-builder 配置的 files 清单，防止启动期自愈链路因文件缺失而崩溃

### 优化
- **启动与运行性能系统性优化**：① 启动冒烟门禁与打包 `require` 完整性校验（`boot:ready` 时序标记 + `bench-baseline.json`）；② 补丁代际签名——签名命中跳过 18 个文件补充；③ koffi 预检异步化——boot 不等待，`startAndShow` 有界等待 3s 决定 overlay；④ SessionWatcher 句柄收敛——仅活跃会话 watch，冷会话复活才 scan；⑤ 会话根索引头部读取替代全目录扫描（TTL 失效增量重扫）；⑥ 非关键功能延后启动——会话监视器/余额轮询延至首屏稳定后 500ms；⑦ 长时内存观测——10 分钟采样后端/渲染 RSS 环形落盘；⑧ 崩溃转储清理增加数量上限（保留最近 5 个 + 最新豁免）；⑨ 无运行中会话时兜底扫描降为 0s；⑩ M3 设置页 observer 导航门控——离开设置页即断开；⑪ settings.yaml 写后校验与自动回写防损坏；⑫ NSIS 显式 lzma 压缩并关闭 solid 字典共享
- **agent 更新检查去 npm CLI 化**：纯 HTTPS dist-tags/版本探测，不再 spawn npm 子进程，启动更快
- **客户端更新检查双源并行 + 1h 窗口缓存 + 失败退避**：GitHub + Gitee 同时查询取最高版本，1 小时内不重复检查，失败后指数退避
- **余额轮询最小化暂停 + 凭证 mtime 缓存 + HTTPS_PROXY 支持**：窗口不可见时暂停轮询，凭证文件未变化时跳过重读，支持系统代理
- **自更新 SHA256SUMS 强制校验（fail-closed）**：下载完整性校验不通过即拒绝安装，不再静默放行
- **统一日志轮转（5MB 双代滚动）**：覆盖 desktop/web/watchdog 日志，不再无限增长
- **LLM 错误落盘与透出**：`llm-errors.jsonl`（5MB 环形缓冲），诊断模型小节可在设置页查看
- **replayState 降级补丁**：legacy 会话续聊失败回落 foreignAssistant 模式，不再直接报错
- **页面错误节流 + 图标 memo + 启动超时单常量**：减少渲染进程无效工作

## [0.3.10] — 2026-08-17
### 新增
- **插件中枢 dsh-hub v1.1.3 + 内置 graph-memory 与 dshmarket（知识图谱记忆 + 可视化插件市场）**：dsh-hub 对齐上游 ARFCON/dsh-hub-DSH v1.1.3（卸载 entry-id 顺序修复 1.1.2 内置时已同步，本次仅版本对齐 + 内置装配适配）；内置并随壳自动装配两个挂载目标——**graph-memory v1.6.0-beta.1**（adoresever/graph-memory 作者为 DSH 重新发布的原生适配版：跨会话知识图谱记忆，自动抽取三元组、PageRank/社区检测、向量去重与召回注入，SQLite 存储 `~/.dsh/graph-memory/graph-memory.db`；依赖 `@photostructure/sqlite` 原生模块随包分发全平台 prebuild，`dist/dsh.js` 入口 + `cordis.patch.yml` 完整声明）与 **dshmarket v1.11.1**（dsh-market/dsh-market 可视化插件市场：浏览/搜索/一键安装社区插件，`js-yaml` 依赖随包 vendored）。两者走配套插件通道（`COMPANION_PLUGINS` + 同步器）注册进 profile bundles；dsh-hub 中枢页适配内置装配——源码检测新增「随壳内置」分支、装配判定放宽（companion 同步是真实目录而非 link junction），设置页显示「内置 vX」与已装配状态，无需手动 clone plugin-src 源码
- **工作区锚点（workspace-anchor）**：新增 `@deepseek-ai/dsh-workspace-anchor` 配套插件，在每个 agent 的稳定 system prompt 中注入约 70 token 的 `{{cwd}}` 工作区偏好（默认在 cwd 内编辑/构建/交付、优先相对路径、允许读取/搜索任何位置但不得把搜索命中的外部目录当作新项目根、仅当用户显式指定或确有必要时才离开 cwd 并随后返回）。纯提示词偏好，不改变任何权限/沙箱行为。`minimal-win`、`anchored-standard`、`zero-anchored-standard`、`whoami-standard`、`warmupbetter`、`warmupbetter-replay` 六个 complete-persona 预设因会丢弃插件注入节，已在各自的 `agent.cordis.yml` persona 文本中直接写入同一锚点；`standard` / `code` / `router-standard` / `v4-flash-godmode-opencode-go` 等非 complete 预设由插件节覆盖
- **macOS 版客户端自动更新（多操作系统支持）**：此前客户端自更新仅 Windows（安装版/便携版），macOS 入口降级为手动下载。现 macOS 走独立链路——资产选择支持 `DSH-Desktop-<版本>-macos-<arch>.zip`（优先，免挂载自更新）/ `.dmg`（兜底，hdiutil 挂载）及 Gitee 分片（`.partN` 按序拼接）；更新脚本（bash，纯 ASCII，系统自带工具零依赖）等待旧进程退出 → `ditto` 解压 → 备份 `.bak` → 同卷 `mv` 原子替换 `/Applications/DSH Desktop.app`（`ditto` 复制兜底）→ `xattr -dr com.apple.quarantine` 解除隔离（未签名构建首次启动不被 Gatekeeper 拦截）→ `open` 重启；替换失败自动还原旧版并启动，应用绝不消失。平台判定支持 `DSH_DESKTOP_PLATFORM` 强制（仅资产选择等纯函数），新增 5 个 macOS 单测（zip/dmg 直选、arm64 架构、分片排序、模板 ASCII 结构、平台判定）
- **设置页「插件」页融合为单一「管理」标签（`dsh-plugin-manager`）**：启动时幂等隐藏官方只读「全部」清单（`applyPluginInventoryTabMergeFix` 过滤 `settings.plugins.tab` 中 id 为 `all` 的条目），管理标签成为唯一插件入口——**搜索框**（按名称/包名/描述过滤）+ **可点击分类标签**（配套插件可开关 / 其他插件可开关 / 核心组件只读，点击过滤、再点取消，各组显示启用/关闭计数）+ **双视图**（简洁：卡片网格——标题+状态圆点+迷你开关，窄屏自动单列；详情：+状态徽章+中文描述）+ 全量 live 清单与本地清单融合（描述取自各插件 package.json）+ **乐观 UI 开关**（点击立即翻转并标记「重启后生效」，写盘失败自动回滚；反复开关不堆积标记注释）。关闭/重新打开写入 web profile `cordis.patch.yml` 的用户层 `disabled` 条目（与 `llm-deepseek` 同款覆盖机制，同一 id 只保留一处，避免 loader 双登记崩溃），完全退出并重启 DSH Desktop 生效。解决「插件看不懂作用、默认启用无法关闭」的社区反馈
- **插件卸载/恢复**：详情视图每行「卸载」按钮（两步确认防误删）。内置配套插件 = 标记卸载（patch 写入 `removed: true`，启动同步器据此跳过文件复制与 manifest 装配，列表「已卸载（可恢复）」分组一键恢复）；第三方插件 = 标记 + 删除 profile 安装目录（不可恢复）；核心组件与带 config 的系统条目（`web`）禁止卸载
- **插件更新检查与手动更新（双下载源）**：工具栏「检查更新」→ 有独立发布源的插件显示「可更新 vX → vY」与「更新」按钮，点击后 下载 → sha512 校验（npm 源）→ 备份旧版 → 解压替换 → 重启生效，失败自动回滚。下载源：npm 官方 `registry.npmjs.org` + 镜像 `registry.npmmirror.com`（自动切换）、GitHub Releases 官方直链 + 加速镜像（`gh-proxy` 系列）；暂列 `dsh-better-sidebar`、`billion-context-dsh`（npm）与 `dsh-side-session`（GitHub）三个有公开发布源的插件，其余第一方插件随应用整体更新（应用更新本身已是 GitHub + Gitee 双源）。启动同步器新增「profile 版本高于安装包版本则保留」，更新后的插件不会被下次启动覆盖回安装包版本
- **插件管理界面打磨**：「可更新」分类标签仅在有可更新项时出现（全部更新完后自动回到「全部」）；工具栏按钮组重排（简洁/详情切换高亮、检查更新为主操作样式、刷新按钮统一）；操作结果提示条、分组标题（组名+说明+计数）与空态框统一样式；修复「已卸载（可恢复）」分类切换导致页面空白的问题（分组标题映射补全 `removed` 键，并对缺失映射做兜底防崩溃）
- **余额栏峰谷计价提醒（dsh-balance）**：对话底部统计栏左侧新增峰谷状态可见提示——高峰时段显示橙色「⛰ 高峰价」，空闲时段显示绿色「🌙 空闲价」，hover 完整说明（高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价；空闲价 = 高峰价的一半）。主进程推送的 `peak` 字段按当前时刻实时判定（`isPeakHour`），本轮费用随时段自动切换单价（高峰全价 / 空闲半价），无需用户手动换算
- **识图插件多模态体感：直接发图/发文件、后台自动识别、识别结果不进对话（dsh-vision）**：输入框工具行新增「📎 添加图片或文件」按钮（外观与官方「/」命令按钮完全一致，也可粘贴/拖放图片），图片按官方附件链路进入草稿并随消息发送；**文本类文件（60+ 扩展名：md/json/csv/ts/日志/配置/脚本…含 Dockerfile/LICENSE 等无扩展名约定名）选入即读取内容、截断后追加进草稿**，发送前可见可编辑，二进制/超限文件明确提示。宿主半边在 `llm/stream` 边界拦截请求中的图片块（比 `agent/pre-step` 更靠后：只改写**送进模型的消息副本**，会话里持久化的仍是原始图片消息），调 VLM 识别后替换为「[图片] 识别结果」文本（多图自动编号 1/N；用户消息文本自动作为识别问题；识别失败/超限/附件异常一律降级为说明文本，绝不阻断对话）——**用户界面始终显示图片卡片，识别文本永不回流对话**，纯文本模型全程只见文本，发图体验与多模态模型一致。识别结果按附件 id 缓存（同图跨轮不重复请求）；`view_image` 工具与自动识别共用同一模型/备用链/超时/降档配置

### 修复
- **内置插件市场 dshmarket 客户端 bundle 未同步 → dsh web 启动失败（MissingClientBundleError）**：配套插件同步的目录清单此前只有 lib/assets/src/dist/node_modules，dshmarket 的客户端构建产物在 `client/`、运行时数据在 `data/`（`exports["../client"]` 声明入口），落盘缺失让 client-modules 装配 fail-loud 直接启动失败。现目录清单补 `client` 与 `data`；`verifyBundleDir` 增加 client 入口校验（声明了 client 入口的 bundle 必须落盘对应文件，缺失按「源缺失」处理不登记），下次启动自动补齐。新增 3 个单测（client 入口存在/缺失/未声明）。

- **dsh web 启动失败（exit 1）：healProfilesModuleFallback 未捕获 ENOENT 崩溃根治**：官方 profile-boot 装配每次 boot 无条件调用 healProfilesModuleFallback(INSTALL_ANCHOR)（BFS 依赖闭包逐包 readFileSync package.json），客户机器上（便携版解压不完整 / 杀软锁定 / 云同步抽风）会 ENOENT 且无保护——main.js 的 repairProfileFallback 只护壳自己的那次调用，挡不住引擎 boot 内部这次 → 启动失败页。profile-boot 防护补丁新增独立 heal 调用防护：调用包 try/catch，失败仅 stderr 告警「continuing boot without fallback healing」，绝不 brick 启动；幂等标记独立于补丁层自愈标记，已打过旧补丁的安装也会补上。新增 3 个单测，unit-profile-bundle-heal 16/16。
- **图片字节信任补丁（修复「仅支持 PNG、JPG、WebP、GIF」却发不出 png）**：官方 attachment-local 严格比对「浏览器声明的 MIME」与「字节解码出的格式」，声明跟随文件扩展名不可信（webp/jpeg 改名 .png 后 file.type 仍是 image/png，字节却是 webp），不一致直接拒发整条消息。本补丁把声明为 image/* 时的媒体类型改为以字节实际格式为准记录，不再拒绝发送；幂等，覆盖内置/profile fallback/agent overlay 三份运行副本，WSL --with-patches 同步生效。新增 2 个变换单测（真实 vendored 文件幂等 + 锚点缺失跳过）。

- **桌面宠物小窗拖动触发主进程半崩溃（启动崩溃日志 `Error processing argument at index 1, conversion failure from`）**：小窗拖拽过程中 pointermove 在捕获/窗口边缘会给出 NaN 屏幕坐标，渲染端直接相加后经 IPC（structured clone 保留 NaN）送达主进程，旧版主进程仅校验入参 `x/y` 为有限数，`getDisplayMatching` 异常/钳制计算产生 NaN 后直接 `petWindow.setPosition(NaN, NaN)`，触发 Electron native 参数转换 TypeError 把 uncaughtException 冒泡到主进程（IPC 处理中断 → 状态损坏 = 半崩溃）。双层根治：① 主进程 `pet:move-to` 全防线（显示器匹配 try/catch + workArea 逐字段有限数校验 + 钳制结果最终校验 + 整体 try/catch 记录警告，任何非法输入静默忽略，绝不再触发 native 参数转换）；② 渲染端 harness-pet 发送前 `Number.isFinite` 四重校验（screenX/screenY/grabOffsetX/grabOffsetY），NaN 直接跳过本次移动等下一个合法事件
- **识图插件升级后重启被回滚（dsh-vision 0.1.0 → 0.2.0）**：启动同步器按「profile 版本 > 安装包版本则保留」判断是否覆盖 profile 副本，此前 dsh-vision 三处（仓库/安装包/profile）版本同为 0.1.0，每次重启都会用安装包内置旧副本覆盖 profile 上的新部署，服务端修复（llm 服务实例 wrap）因此从不生效。版本升为 0.2.0 后 profile 更新版得以保留；仓库、安装副本、profile 三处已同步为同一新版本
- **识图插件发图修复升级：wrap 改挂 llm 服务实例方法（修复「重启后发图仍失败/图片丢失」）**：此前在适配器层 wrap，但 `llm/adapters-updated` 监听缺 `{global:true}`（cordis 事件只沿作用域祖先链冒泡，插件作用域不在 llm 服务祖先链上）+ 初始调用早于 DeepSeek 适配器注册 → wrap 实际从未生效，发图仍被 prompt 入口拦截。现改为 wrap **llm 服务实例的 `resolveModelInfo` 方法**（host prompt 图片门槛的唯一调用点；llm 服务已在 `inject` 中装配，apply 时必然可 wrap，不依赖适配器注册时序；绑定原方法保留 `this`；幂等标记 + 插件卸载时恢复原方法）。同时消除双重污染：adapter wrap 的 `resolveModel` 改为**只记录原生能力、原样返回**（加 `image` 的唯一入口是服务实例 wrap，两处都加会互相污染原生能力判断，误把文本模型当原生多模态透传原图）；`listModels` 仍加 image（仅 UI 一致性）；`llm/adapters-updated` 监听补 `{global:true}` 覆盖热装配。wrap 生效后 host 侧「图片自动转述」兜底自动跳过（inputModalities 已含 image）——界面显示原图卡片、识别文本只进模型。单测更新：服务实例 wrap 7 项（text-only 放行+原生缓存 / 原生多模态透传 / 未声明原样 / `this` 绑定 / 幂等 / restore 恢复 own+原型两种形态 / 无方法安全返回）+ wrapAdapter 语义更新，dsh-vision 单测 40/40
- **客户端自动更新「下载完成后不弹安装 / 更新脚本终端闪一下」**：① 更新脚本启动全程无窗口（`spawn` detached + `stdio: ignore` + `windowsHide`，覆盖安装版 cmd→powershell 与便携版 cmd）；② 残留安装包清理——已处理（安装成功 / 当前版本已不低于待安装版本 / 文件丢失）的待安装标记现在会**连带删除 updates 目录里的过时安装包与 .part 分片**（每包 120+MB），不再让「下载了却从不安装」的旧包永久占用磁盘、误导用户；③ 手动「检查客户端更新」时**优先处理已下载的待安装包**（弹「立即重启」按钮），不再被 24h 静默期挡住——用户主动检查即表明更新意图；④ 端到端脚本级验证：`buildNsisCmd` + `buildNsisPs1` 生成的更新脚本在真实 `cmd /c` 下秒级走完「启动→等待退出→拉起安装器（失败 catch）→兜底恢复」全部分支并逐行写日志，无静默退出（历史「点安装没反应」根因是无控制台进程下控制台程序输出丢失，PR #46 起已用 PowerShell/.NET 流规避）
- **客户端更新 Gitee v0.3.9 旧命名分片无法选择**：`selectAsset` 的分片兜底此前只按 v0.3.9+ 新命名（`win-portable` / `win-setup`）拼 base，而 Gitee 已发布的 v0.3.9 分片仍为旧命名（`DSH-Desktop-<版本>-portable-<arch>.exe.partN` / `DSH-Desktop-Setup-<版本>-<arch>.exe.partN`），导致 GitHub 不可用回退到 Gitee 时，检查成功但下载报「未找到匹配的安装包资产」。现按 新命名 → 旧命名 顺序尝试，安装版与便携版均能正确排序并拼接 Gitee v0.3.9 分片；新增两个旧命名分片单测，并用真实 Gitee release 验证安装版/便携版均选中 3 分片。
- **工具调用兼容修复（code 模式）**：`PTC 模式`（code preset）下 DeepSeek 模型常直接调用 `read`/`grep`/`todo_write` 等原生工具而收到 `UNKNOWN_TOOL`，且 `run_code` 生成的程序调用 `pwsh`/`bash` 时频繁省略仅用于 UI 展示的 `description` 而收到 `INVALID_ARGS`。现启动时幂等补丁：① 官方 `code` preset 的 tool-presentation 由 `code` 改为 `both`——`run_code` 仍可用，原生工具调用也可直接通过；② `dsh-tool-pwsh` / `dsh-tool-bash` 的 `description` 改为可选，缺失时用 command 首行自动生成。补丁覆盖内置副本 / profile fallback / agent overlay（WSL 同步脚本 `--with-patches` 同步生效），锚点失配自动跳过，不修改用户数据。新增 4 个变换单测与真实 vendored 文件幂等验证。

- **工具调用兼容修复 schema 部分撤销（修复「模型操作失败：unsupported JSON schema: parameters.description.required must be true when present」）**：上一轮把 dsh-tool-pwsh / dsh-tool-bash 的 description schema 改为 required: false，但引擎 schema 校验器拒绝非必填 description——preset 挂载直接失败，选模型/发消息报「模型操作失败」。现撤销 schema 改动（恢复 required: true），只保留运行时兜底（缺省 description 时用 command 首行自动生成，该部分不受 schema 校验约束）；transform 会自动回滚已写入的 required: false（幂等标记识别），并导出 OLD/NEW 常量供单测做「还原后断言」；新增回滚单测，unit-patch-engine 22/22。

- **识图插件发图降级「附件存储服务不可用」（dsh-vision 0.2.1）**：cordis 上下文的服务属性访问有 inject 检查（Proxy trap：cannot get property `attachments` without inject），此前 dsh-vision 未声明该 inject，用 try/catch 可选访问把错误吞成 undefined——每次发图都降级为「附件存储服务不可用（已跳过该图片）」文本进模型，图片识别从不生效。现 inject 显式声明 attachments（宿主 prompt 入口的 saveImage 依赖同一服务，装配时必然可用），apply 直接访问 ctx.attachments；发图识别恢复正常。版本升 0.2.1（仓库/安装副本/web profile 三处同步），重启 DSH Desktop 生效。
- **侧边临时会话大日志解析风暴 → 聊天响应偶发延迟**（dsh-side-session v0.2.4）：面板展开时每 2s 轮询会对整个会话日志做全量 zstd 解压+逐行解析（实测 7MB 压缩 ≈ 20MB 文本 ≈ **600ms 同步阻塞**），会话进行中 mtime 持续变化导致反复全量解析，与聊天请求同进程排队。改为**增量解析**（只解自上次帧边界以来的新帧并累计，结果与全量解析逐字节等价；文件整体替换自动回退全量）+ 客户端**全量拉取 4s 节流**（切换会话立即拉取）。新增 6 个增量/全量等价性单测
- **侧边临时会话升级 v0.2.5（合入上游更新）**：左侧栏图标对齐、浮窗展开/收起动画档位（0/300/500/800/1200ms，默认 500）、输入框与发送按钮样式与主会话同款、移除「停止回答」按钮；服务端**热重载自愈**（`settings.registrations.delete(NS)` + 路由重注册，开发热重载后不再残留重复注册）。保留本地增量解析与 4s 拉取节流。版本号定为 0.2.5 与上游 0.2.4 区分
- **桌面宠物默认关闭（插件级）**：harness-pet 常驻 canvas 逐帧绘制在软渲染/流式输出下持续占用主进程，且旧版保存的开关值会覆盖客户端默认关闭。现启动同步时幂等写入 profile patch `- id: harness-pet\n  disabled: true`（一票否决任何已保存状态），需要时在 设置 → 插件 → 管理 一键开启
- **更新后桌面快捷方式消失**：安装版（NSIS）此前依赖安装器创建桌面快捷方式，壳层只在便携版下补建——安装版更新（向导取消勾选创建 / 旧版卸载清理 / 手动覆盖安装目录）后桌面快捷方式缺失且永远不会自愈。现壳层对**安装版与便携版一致**地「缺失即补建」规范名 `DSH Desktop.lnk`（去重逻辑先行，桌面上至多保留一个，不会复现旧版「每次启动生成多个快捷方式」），并修复快捷方式指向被移动/更新后的 exe。另给 `maintainShortcuts` 加 `DSH_DESKTOP_TEST=1` 显式守卫：集成测试（dev electron 以文件路径启动时 `app.isPackaged` 也为 true）不再把用户真实快捷方式改指向测试用 electron.exe
- **profile bundle 缺失 / 损坏导致 dsh web 启动失败（退出码 1）根治 + 重启丢插件数据恢复（issue #48）**：dsh 官方装配对 `dsh.profile.bundles` fail-loud——登记了未安装的插件抛 `cannot resolve profile bundle`、普通库或仅客户端 bundle 被登记抛 `declares no dsh.bundle`、bundle 的 `cordis.patch.yml` 损坏抛 `failed to parse overlay`、profile `package.json` 损坏直接抛 JSON 错误、家级 `cordis.patch.yml` 损坏抛 `failed to parse patches`——任一命中桌面端永久无法启动。四层修复：
  - **启动防护**（`applyProfileBundleGuard`，幂等运行时补丁，dsh 更新后自动重打）：改写 `@deepseek-ai/dsh-app-boot` 的 `loadProfile`——bundle 层逐个跳过并写带修复指引的 stderr 诊断；profile manifest 损坏则备份 `.broken-<ts>` 后按出厂模板重建；改写 dsh `profile-boot` 装配——家级补丁层与 profile 补丁层损坏时备份 + 重置为空列表（同时覆盖启动与 HMR 热重载路径）。用户数据只备份不删除，重装插件即恢复。
  - **写盘侧防呆**：配套插件同步在 bundle 落盘后校验「补丁层 + 入口文件」存在才登记进 manifest（`billion-context-dsh` 上游缺 `dist` 构建产物时不再登记，杜绝整棵插件树加载失败）；profile manifest 损坏时先备份原文再重建；manifest 写入全部原子化（消除写盘撕裂这一损坏来源）。
  - **用户插件数据恢复**（issue #48）：manifest 损坏被重置后，用户手动安装的第三方 bundle 仍实际落在 profile node_modules 里——启动自愈会扫描、校验并把它们合并回 manifest（`bundles` + `dependencies`），用户插件照常装配；普通依赖与损坏包不恢复登记。同时弹「配置自愈」系统通知（集成测试态抑制），不再静默。
  - **启动前健康检查**：`dsh web` 启动前把每个 bundles 条目的装配状态落到 `desktop.log`（缺失 / 未声明 / 补丁层缺失一目了然），`dsh-web.log` 保留完整 stderr 诊断。
  变换与恢复逻辑收口为纯模块 `profile-bundle-heal.js`（`node --test` 单测 13 项 + 7 个新集成场景：heal-missing-bundle / heal-manifestless-bundle / heal-broken-manifest / heal-broken-manifest-recovers / heal-broken-home-patch / heal-broken-bundle-patch / companion-bundle-invariant）。
- **宠物插件流式输出期间界面卡死（「半崩溃」）根治**：dsh 客户端运行时对会话快照按帧合并推送（`Notifier.markFrameDirty` 每帧至多一次，长回复/工具调用期间持续触发），harness-pet 每次快照都跑完整状态映射 + 6 处 DOM 写入 + 320×320 canvas 整幅重绘 + 强制 reflow（`offsetWidth/offsetHeight`），软渲染/低配机上渲染进程主线程饱和。三处修复：① 快照 listener 120ms 节流 + trailing 合并（流式期间每 ~120ms 处理一次最新快照，60Hz 输入实测降到 ~8Hz，不丢尾）；② `setStatus` 内容相等早退（状态/标题/回复都没变时跳过全部 DOM 写与重绘，静态期零开销）；③ `updateStatus` 的同步 `render()` 改为仅在动画循环未运行（关闭/减少动态效果）时绘制，消除 rAF 动画与快照重绘的双绘制源
- **运行时补丁引擎与配套插件同步统一收口（PR #51）**：12 个运行时补丁（闪跳修复 / 设置暴露 / 识图密钥 / profile bundle 防护 / workspace 搜索栏 / 插件页标签合并 / web-search baseURL / menu 视口 / 会话管理）与配套插件同步（清理 / 复制 / bundle 登记 / patch 条目注册 / 默认禁用）收口为 `scripts/lib/` 单一实现（patch-io / patch-engine / companion-plugins / companion-profile / runtime-patches），main.js 与 `sync-companion-plugins.js` 共用同一数据源，杜绝两处实现逐步漂移；WSL·overlay 覆盖缺口补齐（识图 / web-search / menu / 会话删除 / 插件页标签在 WSL 更新分支同样应用）；`dshDesktop.appVersion` 回填与菜单 IPC 防未处理拒绝；补丁候选路径构造器新增单测逐项断言；同步收口时保留插件卸载标记（removedIds）与「profile 版本高于安装包则保留」的更新版本防覆盖。
- **壳层技术债清理（PR #55）**：版本比较收口为 `scripts/lib/versions.js` 全仓唯一实现（消除双实现语义漂移）；补丁引擎与原子写加固——并发临时名（pid+时间戳+序号）、`readFileCached` TOCTOU（读前读后 stat）、CRLF 锚点兼容、`transformExposeFix` 尾逗号不重复、卸载标记正则转义契约；WSL 托管后端探测异步化 + 输出解码修复 + 配置错误自动回落本地后端（issue #54，新增 `wsl-broken-fallback` 集成场景）；自更新链路（下载完整性校验 / 失败清理分片 / 整体截止时间 / 首刻挂 error 监听）、恢复链路（nextAction 注入 / attach 幂等 / 窗口销毁清定时器）与看门狗（spawn 失败不计额度 / run-state.json 原子写）缺陷根治；会话监视 / 档案自愈 / 余额模块收口（`scanZstdFrames` 三副本统一到 session-watcher、`bundleEntryOf` 只返回字符串、`readActiveModel` 锚定 agent-default-model 段）；移除 M3 主题过时部署链（4 个安装脚本 + 3 个资产 + 设计稿）与 preload 死 API；IPC 鉴权按 origin 精确比较、启动竞态与通知引用治理。新增 unit-wsl-backend(11) / unit-patch-io(5) / unit-balance(4) 单测。
- **插件中枢 dsh-hub（ARFCON/dsh-hub-DSH v1.1.2，内置）**：设置页新增「插件中枢」页签，整合四块能力——① **插件更新引擎**：已装插件版本对比（npm registry / GitHub release/tag）、一键更新与批量更新、sha512 校验 + 备份回滚、启动自检自动修复（损坏的 package.json / cordis.patch.yml 原子写恢复）；② **全局记忆**：5 个 `memory_*` 工具（save / search / list / get / delete），JSONL 存储 `~/.dsh/memory/memories.jsonl`；③ **graph-memory 挂载**：检测到 `plugin-src/graph-memory` 源码自动装配（profile bundles + link + junction，幂等），设置页展示记忆库统计（节点/边/社区）；④ **dsh-market 联动**与**自身更新检查**（raw.githubusercontent + jsDelivr + ghfast.top 多源）。原生适配 Gitee 版 DSH Desktop：客户端最新版本对比走 GitHub + Gitee 双源（与客户端同款「取最高版本」语义），国内用户可直接打开 Gitee 发布页下载。
- **内置 dsh-hub 插件两处修复**（对齐 ARFCON/dsh-hub-DSH 生态）：插件卸载时先解析 entry id 再删 insert 行（此前先删行后查 id 永远查不到），避免 disable 块残留孤儿条目；客户端安装目录候选增加常见自定义路径（`D:\app\dsh\DSH Desktop`），使「DSH Desktop 客户端」检查与客户端插件更新在自定义安装位置生效。
- **余额栏消失（ReferenceError: parts is not defined）**：dsh-balance 客户端在对话底部统计栏渲染余额/费用 dock 时引用了已不存在的 `parts` 变量（组件重写把列表变量改名为 `items`/`joined` 时漏改一处）——组件渲染即抛异常，整个余额 dock 静默消失。已改回 `joined.join(" · ")` 并同步到安装副本与 web profile，重启应用即恢复。
- **余额 dock 左侧显示「Object」**：修复上一处后 dock 恢复显示，但峰谷提示 chip（`peakChip`，React 元素）与文本一起经 `joined.join(" · ")` 拼接——数组 `join` 会把 React 元素 `toString` 成 `[object Object]`，于是 dock 最左侧出现一个「Object」。现 dock 的 `children` 直接传数组（React 原生渲染元素 + 字符串分隔符），高峰/空闲提示正常显示「⛰ 高峰价 / 🌙 空闲价」。
- **本轮费用估算：未知模型按低价档计费**：`effectivePrice` 对价格表外的模型名（如 `deepseek-v4-max`）此前回退到 `deepseek-v4-flash`（低价档），与「未知模型按高单价估算、避免少报费用」的注释意图相反——现回退到 `deepseek-v4-pro`（最高档）。同时核对计费口径与官方公告一致：输入未命中（含缓存写入）按未命中价、输入缓存命中按命中价、输出按输出价；高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价（v4-flash 未命中 3.0 / 命中 0.10 / 输出 9.0，v4-pro 未命中 9.0 / 命中 0.30 / 输出 27.0，¥/百万 token），空闲 = 高峰一半，2026-08-17 00:00（北京时间）起生效。
- **点击系统通知回到应用前台**：所有系统通知（任务完成 / 崩溃自愈恢复 / 安全模式 / 配置自愈 / 渲染进程恢复）统一支持点击回到应用——`showNotification` 默认给通知挂 `onClick → showMainWindow()`（覆盖最小化、隐藏、关闭到托盘、窗口销毁后重建等全部恢复路径），调用方无需各自实现；任务完成通知的旧实现（仅 restore+show+focus，窗口销毁场景会失效）改为走统一默认。Windows toast 点击激活依赖的 `AppUserModelID`（`com.deepseek.dsh.desktop`）与开始菜单/桌面快捷方式同 id 创建已就绪，点击 toast 即恢复窗口到前台。
- **核心运行时健壮性加固（PR #56）**：① 更新流程守卫竞态根治——`runUpdateFlow` / `runClientUpdateFlow` 的 busy 标志改为入口同步置位 + 全程 try/finally 复位（此前在 checkLatest 网络请求与版本对话框之后才置位，自动更新定时器与手动触发可并发通过守卫，双 npm 安装互踩 staging 会损坏 agent）；② 预览路径围栏本地 DoS 根治——`isUnderFileRoots` 缓存 miss 强制失效改为冷却窗口（至多每 5s 一次强制刷新），浏览器恶意页面无法再通过无效预览请求放大为 sessions 全目录遍历 + 逐文件 zstd 解压的 CPU/IO 攻击；③ 服务启动写流泄漏——`watchServerProc` 的 dsh-web.log 写流 spawn error 路径不再泄漏 fd（幂等 `endOut` 在 error/exit 统一收口，stderr 写入包 try，不再冒泡 uncaughtException）；④ 服务就绪行处理提前退出——`onData` settle 后立即 return，同 chunk 第二行 URL 不再 killTree 刚就绪的服务；⑤ `killTree` 的 taskkill spawn 挂 error 监听并收敛到幂等 finish；⑥ 余额估算回退档位统一——`effectivePrice` 峰谷期与旧版固定价期均回退 `deepseek-v4-pro`，移除死代码 `FALLBACK_PRICES`，补齐旧版期未知模型断言。
- **客户端更新分片选择与合并校验加固（自动更新 review）**：① `selectAsset` 分片集增加**序号连续性校验**（必须从 `.part1` 连续到 `.partN`）——此前缺失中间分片（如只有 part1+part3）仍会照常选择并拼接，产出损坏安装包；单靠下载后 64MB 下限兜底存在漏网窗口（仅缺尾部小块时拼接结果仍超下限被放行，安装器失败后用户会看到「下载了却从不弹安装」）。现不连续的分片集直接拒绝，宁可用下一个命名候选或报错，也不拼坏包；② 分片合并后**大小与上游声明严格一致校验**（每片已按 content-length 完整性校验，不一致只可能是分片集不完整）——不一致即删除并抛错，下一轮自动更新会重试，不再把残缺包标记为「已下载待安装」。新增 2 个分片连续性单测。
- **设置页「插件」分区新增「诊断与管理」标签页**：原插件管理页内嵌的诊断/备份恢复面板整体迁入该标签，并新增三项维护能力——① **一键导出诊断日志包**：诊断报告 + 桌面/Web 日志尾部聚合 + 崩溃转储元信息 + 环境信息，打码 home/userData 路径后存为单个 JSON（本地操作不上传）；② **防砖体检**：逐个检查已装配插件的 dsh 清单、补丁入口可解析性与跨包 loader 条目 id 冲突（重复 id 会在下次启动触发 `duplicate loader entry id` 失败，提前标红）；③ **Bundle 顺序检测与重排**：读取声明规则（`dsh.bundle.order.before/after`）与插件依赖，LOOT 式拓扑排序给出建议顺序，一键写回 profile `package.json`（官方内置 bundle 保持原位、原子写），重启生效
- **诊断与管理安全加固**（专业测试流程产出）：恢复路径拒绝含 `node_modules` 段（junction/symlink 装配点）与符号链接逃逸（realpath 包含性校验，恶意备份无法经 junction 写穿到根外）；诊断日志包脱敏移至序列化前深度掩码（Windows 反斜杠转义导致的静默失效修复，掩码集含 userData/home/安装目录）；IPC 鉴权改 origin 相等比较（防 userinfo 技巧绕过前缀匹配）；恢复/顺序写回加主进程互斥；非 UTF-8 文本按 base64 原字节备份还原（GBK 等不再乱码损坏）；恢复输入 >4MB 拒绝；备份元数据不再记录本机绝对路径
- **启动自愈：bundle 契约缺失自动修复 + 防砖体系升级**（针对 `Error: dsh: profile bundle "X" declares no dsh.bundle in its package.json` 启动崩溃，loadProfile fail-loud）：① **启动自愈**——boot 失败时识别 `dsh-web.log` 的第四种 loader 失败形态（`profile bundle "X" declares no dsh.bundle`，`parseFailedLoaderIds` 扩展），经文件系统二次确认（须在 `dsh.profile.bundles` 清单内、包目录存在但缺 `dsh.bundle.patch` 声明，绝不触碰 `@deepseek-ai/*`）后备份 manifest 并移出启动栈，依赖包仍保留以兼容纯客户端插件，随后自动重试启动并弹窗通知；② **防砖体检升级**——启动清单内缺 `dsh.bundle.patch` 声明的包由 warning 升级为 error（真实 fail-loud 必挂，提前标红），新增「一键移除失效条目」按钮（两步确认，备份后原子写回 bundles，重启生效）；覆盖条目（`disabled`/config/定向 insert）不再误计为 loader 注册，消除「默认禁用条目 vs 包注册」的假跨包冲突；③ **启用前契约校验**——zat-dsh-engine 启用插件（setEnabled）前检查包是否声明 `dsh.bundle.patch`，缺声明或不可读直接拒绝并给出修复指引，杜绝「启用即踩雷」。**自愈主路径升级为不依赖日志的 manifest 直扫**（`scanBundleContracts`：直接遍历 `dsh.profile.bundles` 二次确认声明，日志轮转/截断/编码异常时仍能发现坏条目，日志形态保留为兜底）；**启用校验补 patch 文件存在检查**（声明存在但补丁文件缺失同样阻止启用）。
- **启动自愈链路修复与提示增强**：修复安全 overlay / 自愈重试必败的根因——`web` 子命令遇到 `--host` 等应用参数后会透传剩余参数，此前 `--patch` 拼在这些参数之后而未被启动器解析；现将 overlay 参数放在 `web` 之后、应用参数之前。自愈成功后追加模态提示框（系统通知之外的双保险），明确说明已移出启动栈/禁用哪些插件、配置已备份、无需操作。
- **诊断报告展示「最近启动自愈」记录**：每次自愈动作（自动移除/禁用坏插件）写入 `userData/self-heal-history.json`（保留最近 5 条），随诊断报告带回并在「诊断与管理」报告顶部以蓝色信息条持久展示（模态框/通知是一次性的，这里提供事后回看）；进入「诊断与管理」标签页自动运行一次诊断，报告立即可见；修复前端取值层级错误（自愈数据在 `report.sections.selfHeal`，此前误读 `report.selfHeal` 导致蓝条永不显示）

## [0.3.9] — 2026-08-16

### 新增
- **对话删除与归档管理（dsh-session-manager 内置插件）**：dsh 官方只有归档没有删除，现补齐：
  - 会话行 ⋯ 菜单「归档会话」下方新增「删除对话」（**所有会话行均显示**，含当前会话）：确认后经宿主 RPC 删除会话日志与附件（**正在运行**的会话被拒绝），列表经官方 host 帧实时移除；
  - 设置 →「归档对话管理」面板：列出全部已归档对话（标题/项目/更新时间），每条提供「恢复」（回到原工作区与顺序，经 `workspace.unarchiveSession` 持久化并实时广播）与「删除」；
  - 实现：`scripts/patch-session-manage.js` 对官方包做幂等运行时/打包补丁（`dsh-workspace` WorkspaceRegistry.unarchiveSession；`dsh-session` Sessions.remove——从 live 注册表摘除、优雅 flush 后释放并广播 session/disposed；`dsh-host-apiproxy` 新增 workspace.unarchiveSession / workspace.deleteSession RPC——删除先查 agent 运行状态表（agent/status 事件维护，仅拒绝真正运行中的会话），再按 jsonl 布局移除 `<DSH_HOME>/sessions/<project>/<id>/`、摘除 live 会话、清理归档集并广播；`dsh-client-connection` API 面与 unary 响应 schema；`dsh-client-ui-workspace` 菜单项与中英文案）；`assets/plugins/dsh-session-manager`（bundle，设置面板 + `window.__dshSessionManager` 桥），启动/打包三路覆盖（dev / afterPack / 运行时），dev node_modules 已实测应用
  - 端到端集成场景 `session-delete-flow`：真实 RPC 链路验证 创建→归档→恢复→再归档→删除（目录消失 + 归档集清理）→空闲 live 会话摘除删除
- **对话节点导航条（dsh-navbar，vlln/dsh-navbar，MIT）内置**：对话区右缘节点串快速跳转 user 消息（悬停预览 6 行截断 / 点击平滑跳转 + 品牌蓝高亮 / 连续悬停与滚轮切换 / >11 节点自动滑动窗口 / <2 条 user 消息自动隐藏 / 消息精选 pin 按会话持久化），实现 dsh-external/issues#144 规格，纯浏览器端 bundle（`assets/plugins/dsh-navbar`，含 LICENSE 与预编译 lib）。**取代** `dsh-conversation-tweaks` 内置的会话右侧导航滑轨（dct-rail 已移除），conversation-tweaks 保留「隐藏对话输出」；`sync-companion-plugins.js` 的插件清单与 `lib/index.mjs` 复制规则同步补齐（该清单此前与 main.js 漂移，缺 better-sidebar / harness-pet，已对齐）
- **侧边临时会话（dsh-side-session，hzhz314159/dsh-side-session，MIT）内置**：基于当前主会话上下文在独立浮窗发起临时追问（答案不写入主会话）；💬 图标 / `Ctrl+Shift+S` 唤起；三种回答引擎（全局 Key / 插件 Key / 宿主 LLM）；zstd 帧扫描自动捕获上下文（含截断护栏）；bundle 随桌面端分发并自动同步。**内置版本升级至 v0.2.3**：纯浮窗形态（头部拖拽移动 + 右下角缩放）、上下文长度三档（标准/加长/完整，设置面板「确定」应用）、meta 指纹轻量轮询（2s 心跳仅对比计数指纹，变化才拉全量）、`/side-session` 斜杠命令、mode3 走宿主 `ctx.llm.stream`（不读任何 key）
- **主动上下文压缩（billion-context-dsh，Tyan66666/billion-context-dsh，MIT）内置**：模型驱动的上下文压缩后端（ACP，内核 acp-kernel 复用）——由模型决定何时压缩、压缩什么，替代自动摘要式压缩；`compress`/`decompress`/`search_context`/`acp_status` 四工具 + `/acp` 命令，自动策略只 nudge 不强制。bundle 随桌面端分发（含 dist 与私有依赖 acp-kernel，同步逻辑补齐 `dist`/`node_modules` 目录），启动时自动同步进 web profile 并幂等写入 `compaction-basic` 禁用条目（同一 realm 仅保留一个压缩后端）
- **余额面板并行展示 OpenCode Go 订阅额度**：5 小时滚动 / 每周 / 每月用量百分比（percent=已用比例），查询失败不影响主余额展示

### 修复
- **客户端更新「能下载但无法更新」闭环修复**：① 点击「立即重启」后不再提前清掉 `pendingClientUpdate`，只写入含下载包路径的 `clientUpdateAttempt`；安装器失败/被取消时，下次启动会真正进入「客户端更新未完成」重试流程（旧实现把待安装标记清掉，重试对话框永远不出现，用户只能重新下载）；② NSIS 更新脚本只在安装成功且新版本已启动后删除安装包，失败/取消时保留安装包供重试，并以退出码 0 判定成功（取消不再被误判为成功）；③ 便携版替换脚本对 `NEW→OLD` 复制失败增加 12 次退避重试（吸收杀软扫描锁定），等待/替换失败时用写入探针区分「目录只读」与「文件仍被占用」：只读目录直接降级为启动新 exe，可写目录用 `.bak` 还原当前版本；④ `downloadFile` 监听 `aborted/error`，服务器中途断开时立即报错而非无限转圈。新增 `scripts/test/unit-client-updater.test.js`（纯函数单测，无需网络）
- **更新进度窗口阻塞整个应用**：`showUpdateWindow` 去掉 `modal/parent` 并改为 `minimizable: true`，下载期间主窗口可继续点击、最小化，进度窗自身也可最小化或关闭（关闭不取消后台更新/下载）；「更新完成/下载完成」对话框弹出前先关闭进度窗，避免窗口叠层导致确认框无法显示。`assets/updating.html` 文案同步说明后台继续
- **集成测试模式抑制对话框弹窗**：`showBox` 在 `DSH_DESKTOP_TEST=1` 时不再弹真实对话框（测试实例与正在使用的桌面端并存时，失败的测试会在用户屏幕上弹出「启动失败」窗），改为记录日志并按取消键处理（boot 失败 → 快速退出让场景明确失败）
- **存量坏 profile manifest 不自愈 → 启动必失败**（issue #16，PR #21）：旧版本（0.3.3/0.3.4）写坏的 `profiles/web/package.json` 中 `dsh.profile.bundles` 只有配套 bundle、缺少核心 bundles（`@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`），核心服务无人提供，插件树永久 `N entries did not activate`。`syncCompanionPlugins` 现在对已存在的 manifest 做「校验 + 补齐」：把缺失且实测可解析的核心 bundles 补到列表最前，其余条目（含用户添加的）原样保留；健康 manifest 零写入（幂等）。核心逻辑抽为 `profile-manifest.js`（纯函数，含 `node --test` 单测 + 集成场景 `heal-stale-manifest`）
- **profile patch 同 id 重复注册 → 插件树崩溃**（issue #17，PR #24）：旧版本插件安装向 `cordis.patch.yml` 写入重复的 `- insert: - id: X` 块（或插件升级为 bundle 后 patch 残留行），cordis loader 抛 `duplicate loader entry id: X` 且永远无法自愈。新增 `profile-patch-heal.js`：启动时块级按 id 去重（保留首个、备份原文件）、把已升级为 bundle 的插件残留注册从 patch 层移除（`dropBlocksByIds`），并支持从 `dsh-web.log` 解析三种 loader 失败形态（hash / duplicate-id / 括号包名）映射回 patch 条目。含 `node --test` 单测 + 集成场景 `heal-dup-patch` / `heal-bundle-patch`
- **web-search「接口地址」填第三方地址仍被拼 `/messages` 按 Anthropic 协议请求 → 404**（issue #20，PR #22）：`dsh-web-search-deepseek` 的 baseURL 拼接归一化（尾斜杠不产生双斜杠；基址已含 `/messages` 不再重复拼接），HTTP 失败信息附上实际请求地址与协议契约指引（裸 404 变可自解的提示），设置页中英文文案明确「POST <基址>/messages」契约。补丁本体在 `scripts/patch-web-search-baseurl.js`（打包补丁与运行时补丁共用同一实现，覆盖内置副本 / profile fallback / agent overlay），含 `node --test` 单测（含本地 mock 服务的真实 HTTP 回归）与集成场景 `web-search-patch`
- **客户端自更新在中文 Windows 上解析失败**（`apply-update.ps1` 报 `Unexpected token '}'`，issue #23，PR #25）：更新脚本改为带 UTF-8 BOM 写出，Windows PowerShell 5.1 不再按系统 ANSI 代码页（GBK）误读中文注释导致换行符被吞、语法乱码；`buildNsisPs1()` 模板注释同步 ASCII 化，脚本在任何代码页与换行风格下均安全
- **桌面版默认启用硬件加速，修复软件渲染掉帧**（issue #26，PR #28）：移除无条件 `app.disableHardwareAcceleration()`（软件渲染导致 GPU 进程空转 ~40-60% 单核、设置页等整页重绘明显掉帧）。改为：默认硬件加速；仅当 `settings.json` 标记 `hardwareAcceleration:'off'` 时禁用；GPU 进程 60 秒内连续崩溃 3 次（`gpu-process-crashed` / `child-process-gone` 双事件去重）自动持久化降级标记并重启应用，保留崩溃日志与自恢复兜底。降级逻辑抽为 `scripts/gpu-crash-guard.js`（含 `node --test` 单测）
- **M3 主题管理器设置观察器防抖**（issue #26 附加项）：`assets/themes/m3-theme-manager.js` 的 `MutationObserver` 不再每批 DOM 变更都执行全文档 `querySelector`，改为 300ms 防抖（与 preload.js 中同功能实现对齐）
- **M3 主题全局过渡拖慢整页**（issue #26 附加项）：`body[data-m3-theme="m3"] * { transition-duration }` 默认 `transition-property: all`，每个元素的所有属性变化（含布局开销最高的 width/height/transform）都被动画化，M3 模式下掉帧显著。收窄为颜色类属性（背景/文字/边框/阴影/透明度/transform），保留主题切换的平滑变色意图，几何变化不再动画
- **WSL 模式「模式列表」比 local 少**（PR #29）：WSL 托管后端经 npm 安装的 dsh 是干净包，不含壳内置的 8 个 Agent 预设。`main.js` 在 WSL bootstrap 与更新后会经 UNC 把 `assets/agent-presets` 写入 WSL agent 包的 `config/agent-presets`；`scripts/sync-companion-plugins.js` 也自动同步预设（可 `--dsh-package <目录>` 显式指定）
- **本地模式 agent 更新后丢失壳内置 Agent 预设**：`updater.applyUpdate` 全新安装的 overlay 也是干净 npm 包，8 个壳内置预设同样缺失（WSL 同族问题的 local 半边）。新增 `syncLocalAgentPresets()`：启动与更新后把预设幂等补进「当前生效」的 dsh 包（overlay 优先，否则内置），三种布局（内置 / 更新 overlay / WSL）模式列表一致
- **识图 view_image 三个根因修复**（issue #33，PR #31 + #32）：① 旧模型（`glm-4v-flash` / `glm-4.1v-thinking-flash`）钳制 `maxTokens ≤ 1024` 并对 400 自动降档 1024 重试一次，400 code 1210 不再直接失败且 fallback 链持续生效；② 设置页保存不再把「等于插件默认值」的字段写进 `settings.yaml`（避免旧模型 maxTokens 2048 被写死固化）；③ `role('secret')` 的 apiKey 永不回显，留空 = 保持已存密钥，仅非空输入才写入（修复「改模型/地址后保存会静默清空密钥」）。新增 `scripts/verify-vision-upgrade.js` 交付前识图链路验证（插件完整性 / patch 唯一性 / 配置与模型上限兼容）
- **余额欠费误报「API key is invalid」**：第三方 provider（opencode 等）余额不足返回 401 + CreditsError 时被 `dsh-llm-pi-ai` 一律判 AUTH。新增 `scripts/patch-pi-ai-credits.js` 把余额判定前置到 401-AUTH 之前：欠费 → QUOTA（客户端显示真实原因），真 key 无效仍判 AUTH
- **便携版「有进程无窗口 / 双击无反应」**（issue #30）：① 便携版数据目录重定向提前到单实例锁校验之前——Electron 实例锁以 userData 为键，旧实现与安装版共用 `%APPDATA%\DSH Desktop` 锁，安装版在跑时双击便携版会静默退出；② 主进程启动期兜底：任何模块级 / 启动早期未捕获异常落盘 `<userData>/logs/startup-crash.log` 并在启动完成前弹可见错误框，杜绝静默失败
- **桌面版关闭到托盘后无法重新打开 / 桌面重复快捷方式**（用户反馈）：① `showMainWindow()` 防御性强化——窗口被销毁/未创建时重建主窗并加载 Web UI，隐藏/最小化时 restore+show+置顶聚焦；托盘左键/双击、`second-instance`（再次双击桌面图标）统一走该恢复路径并记录日志（此前托盘左键采用「可见则隐藏」双态逻辑，隐藏态误判会导致点按无反应；second-instance 对异常窗口状态无兜底）；② `maintainShortcuts()` 增加**快捷方式去重**——每次启动清理桌面与开始菜单中规范名（`DSH Desktop.lnk`）之外的同族快捷方式（Windows 自动重命名副本 `(1)`、手动“发送到桌面”副本、旧版残留），只保留一个；**安装版不再由壳层自动创建桌面快捷方式**（由 NSIS 安装器负责），仅便携版维护桌面快捷方式，消除「每次启动自动生成多个快捷方式」；标题栏 ⋯ 菜单与托盘菜单原有的「退出」「关闭时最小化到托盘」开关保持可用
- **打包前语法门覆盖补丁/自愈模块**：`scripts/check-syntax.js` 的入口清单并入 `profile-manifest.js` / `profile-patch-heal.js` / `patch-web-search-baseurl.js` / `gpu-crash-guard.js` / `install-minimal-win-preset.js` / `patch-deps.js` / `patch-pi-ai-credits.js` / `sync-companion-plugins.js` / `after-pack.js` / `patch-portable-template.js`，此类模块的语法/「async 与声明被拆开」问题在打包前即可拦截
- **启动提速**（PR #39）：① `repairProfileFallback` 增加健康快照（`profile-fallback-cache.json`，含 dsh 包签名）——依赖闭包未变、链接逐项校验通过时跳过耗时的 `import('dsh-app-boot')` + BFS + heal；dsh 升级后签名失效自动重算；② 配套插件同步（vendor 依赖与 lib/assets/src 递归目录、固定文件清单）逐文件比对 size+mtime，一致跳过写盘（复制改用 `preserveTimestamps`，确保二次启动命中跳过）；③ loading 窗口提前到启动最前段创建，用户第一时间看到「正在启动」，并同步提前装配渲染进程自恢复与挂起心跳（loading 阶段崩溃/挂起也有兜底）
- **router flash 等重负载场景掉帧 / 周期性假死**（issue #34）：① `harness-pet` 默认改为关闭（opt-in，设置卡可开启），且关闭时完全停掉 rAF 动画循环（此前隐藏状态下仍逐帧绘制 320x320 canvas）；② `dsh-conversation-tweaks` 会话滑轨的 MutationObserver 不再每 250ms 全量 `querySelectorAll + getBoundingClientRect`，改为仅在内容尺寸真实变化时重算标记位置；③ 修复 `syncCompanionPlugins` 自愈死循环——bundle 插件源缺失时不再被当普通插件写回 `cordis.patch.yml`（此前会注册不存在的包导致 dsh web 启动崩溃），并从 manifest bundles 移除（视为用户禁用）、清理 patch 残留注册（用户手写 config/disabled 覆盖条目保留）
- **Agent 预设很多时「上面的不显示」**（issue #36）：`dsh-client-ui-primitives` 的 Menu portal 弹层在条目超过视口时没有高度上限，`place()` 把整列推到视口上方、顶部条目被裁掉且无法触达。新增 `scripts/patch-menu-viewport.js`：portal 列表加 `max-height: min(calc(100vh - 24px), 560px)` + `overflow-y: auto`，y 夹紧按封顶后高度计算，任何视口高度下完整可用（打包 afterPack / 启动运行时 / dev node_modules 三路覆盖，含 `node --test` 单测）
- **第三方模型思考强度**（issue #37）：功能已就绪（`dsh-third-party-thinking` 默认关闭、可对支持的 provider 开启并把档位注入请求体）；设置页「请求字段名」提示补充 opencode-go 套餐内 DeepSeek Flash/Pro 的开启说明
- **桌面宠物原生置顶小窗**（harness-pet「主窗最小化后宠物消失」根治）：插件自带 Document PiP 独立窗口在 Electron 中不可用（`requestWindow` 抛 `Internal error: no window`）。改为主进程原生方案：  - `main.js`：新增 360×420 无边框透明置顶（screen-saver）不进任务栏的宠物小窗（与主窗共享分区/localStorage），位置经 `userData/pet-window.json` 持久化（跨屏校验 + 钳制回可视区，拖动 400ms 防抖保存）；IPC 双端契约：`chrome:pet-window`（open/toggle/state，校验主窗来源）、`pet:close`、`pet:move-to`（绝对目标位置，至少露出 80px）、`pet:set-auto-open`；主窗最小化且插件开启「最小化自动显示小窗」时自动弹出；before-quit 清理；复用 `guardWebContents` 与 `recovery.attach`
  - `preload.js`：`--dsh-pet=1` 模式检测 → 注入 `window.__DSH_PET__`、隐藏除宠物根节点外的全部界面、跳过自绘标题栏；桥接 `dshDesktop.petWindow`（open/toggle/isOpen/close/moveTo/setAutoOpen）；主进程 `pet:state` 转发为页面事件 `dsh-pet-state`
  - `harness-pet` 插件：原生桥优先（浏览器仍回退 PiP）；小窗布局（宠物贴底居中、气泡锚定鲸鱼正上方随大小自适应、齿轮右下角、面板内嵌）；双宠物互斥（小窗打开时主窗宠物/气泡/齿轮隐藏，含刷新后状态查询恢复，`applySettings`/`setDialogVisible` 共用可见性表达式）；拖动（小窗 = 绝对定位搬窗无抖动、主窗 = 取整落位）；朝向只越水平中线才调转（主窗视口中线 / 小窗屏幕中线）；会话跟随（共享 localStorage + storage 事件 + `sessions.open`）；新设置项 `autoDesktop`（最小化自动显示小窗，默认开）/ `sound`（状态跃迁 Web Audio 合成提示音：等待输入/任务完成，仅主窗、仅跃迁响一声、首状态不响）/ `labelSize`（提示文本字号 10–26px 默认 15px，四语言文案齐全）；提示文本 9 种状态前景/背景配色

## [0.3.8] — 2026-08-15

### 修复
- **安装后启动即报 `ReferenceError: async is not defined`**：`main.js` 中 `async` 关键字与 `probeOverlayAgent` 函数声明被注释行拆开，导致主进程模块加载失败。已重接 `async function`；新增 `scripts/check-syntax.js` 并接入 `prepack` / `predist`，打包前强制做入口 JS 语法检查与「async/await 关键字与声明被拆开」模式扫描，此类坏包无法再打包。
- **安装后启动即弹「应用初始化失败：home is not defined」**：`main.js` 的 `applySettingsSectionGuard()` 构造候选补丁路径时引用了未声明的 `home` 变量（相邻的 `applyProfilePatchGuard` / `applyWorkspaceSearchRailFix` 均有声明，唯独此处遗漏），`boot()` 无条件调用该函数导致每次启动必现初始化失败弹窗。已在该函数内补齐 `const home = effectiveDshHome() || path.join(os.homedir(), '.dsh')`，与相邻防护函数保持一致。

## [0.3.6] — 2026-08-15

> 注意：Zat-DSH Engine 市场替换与客户端更新闭环修复已合入 main，但本版本尚未发布；
> Gitee 分片合并脚本（merge.bat）已重写为 CRLF + ASCII 提示，修复换行符丢失导致
> `set FAILED` / `pause` 失效的问题。发布前请重新执行打包并核验全部文档链接。

### 新增
- **内置 Agent 预设扩充至 8 个**：按上游最新版本同步 `router-standard`（yjh051108/dsh-routing-suite）、`anchored-standard` / `zero-anchored-standard`（xiaobright/dsh-anchored-standard），并新增 `whoami-standard`、`v4-flash-godmode-opencode-go`（SheberDavid）、`warmupbetter` / `warmupbetter-replay`（0liveiraaa/myDshPresets）；每个预设目录附带上游 LICENSE/NOTICE，详见 `docs/agent-presets.md`
- **Gitee 分片合并脚本重写**：`scripts/fix-merge-bat.cjs` 生成 CRLF + ASCII 提示的 merge.bat，修复 `set FAILED` / `pause` 被 echo 吞掉的问题；README 下载说明同步修正
- **插件市场整体替换为 [Zat-DSH Engine](https://github.com/mishibeikejie/zat-dsh-engine)（MIT）**：移除旧 `@deepseek-ai/dsh-plugin-marketplace` 的同步副本与 patch 条目，新增 `zat-dsh-engine` bundle（社区目录 / 双语简介 / 一键安装更新卸载启停 / 网络自适应 / 自更新）；`zod` 转为显式依赖随包分发
- **新增内置 bundle 插件**：`dsh-better-sidebar`（[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)，MIT，VSCode 式侧边栏工作台）与 `harness-pet`（[cakeni/harness-pet](https://github.com/cakeni/harness-pet)，MIT，桌面宠物）；`syncCompanionPlugins` 支持递归同步 `lib/assets/src` 目录，并为 profile 补齐 `schemastery / cosmokit / @standard-schema/spec` 内置依赖
- **文本模型自动识图**：`dsh-host-apiproxy` 发送入口在模型不支持图片输入时，自动复用已安装 `dsh-vision` 的 VLM 配置把图片转述为文字（含 OCR）后再发送；支持图片的模型仍走原生通道
- **第三方许可文档**：新增 `docs/attributions.md` 与 README「第三方组件与许可」，明确 Zat-DSH Engine、dsh、koffi、Electron、React、zod 等 MIT 组件来源

### 修复
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记原子写盘 + 回读校验；每次重启安装记录 `clientUpdateAttempt`，启动识别「客户端更新未完成」并支持重试 / 打开日志 / 24h 稍后；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本

## [0.3.4] — 2026-08-15（BUG 修复版）

### 修复
- **koffi 3.1.3/3.1.4 win32-x64 预编译二进制损坏**（目录选择器 worker 无消息退出、部分客户机器启动即崩）：`package.json` overrides 锁定 `koffi@3.1.5`（上游已回退 Windows 原生编译）；新增 `scripts/koffi-preflight.cjs`，启动前用内置 Node 做 FFI 冒烟，失败自动注入 browse 目录选择器 overlay
- **目录选择器 worker 崩溃后报错无任何诊断信息**：新增 `scripts/patch-deps.js`（postinstall / pack / dist 幂等补丁），worker 无消息退出时把真实 exit code / signal 带进错误文案
- **启动项配置生成错误导致整体打不开**：`dsh web` 退出码 1 时自动解析 `dsh-web.log` 中加载失败的 patch 插件 id，写入 `safe-boot.overlay.yml`（`dsh web --patch`）禁用后自动重试，不修改用户 patch 文件，并弹系统通知
- **EPERM: operation not permitted, symlink 导致退出码 1**：检测到 `profiles/node_modules` 目录联接创建被拒时，自动改名备份半成品缓存、重跑官方 `healProfilesModuleFallback` 重建联接并重试启动，不再需要客户手动按手册操作
- **部分用户设置页看不到插件设置（视图/识图/思考强度等）**：`dsh-host-apiproxy` 设置命名空间白名单补丁改为同时覆盖内置 app、profile fallback 与**更新后的 agent overlay** 三处副本，并锚定 `WEB_SETTINGS_NAMESPACES` 数组自身收尾插入；启动顺序调整为先修复 profile 联接再应用补丁
- **启动失败弹窗缺少日志内容**：失败对话框与「服务已停止」对话框附带 `dsh-web.log` 最近日志，客户截图即可定位
- **syncCompanionPlugins 覆盖用户禁用**：patch 中 id 已存在（含用户手写 disabled 条目）时不再自动重插，避免重复 id 与「禁用后又被加回来」
- **全新 DSH_HOME 首次启动必失败（退出码 1，插件树无法激活）**：`syncCompanionPlugins` 在 dsh 初始化 profile 之前预写 manifest 时，只写入 bundle 插件导致核心 bundles（dsh-base / dsh-web-app）缺失。现改为以实际将运行的 dsh 包为锚点实测可解析后，先写核心 bundles 再追加 bundle 插件；解析不到则不写 manifest，交由 dsh 自行初始化（PR #14）
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记改为原子写盘 + 回读校验；每次重启安装都记录 `clientUpdateAttempt`，下次启动若仍是旧版本则识别为「客户端更新未完成」，提供重试安装 / 打开 `apply-update.log` / 稍后（24h 不再打扰）；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本，避免“重启后应用消失”
- **渲染进程崩溃后永久黑屏/白屏（0xC0000005）**：新增 `renderer-recovery.js` 自恢复状态机，主窗与会话浮窗统一接管：
  - `render-process-gone`（crashed/killed/oom）→ 指数退避自动重载（首次 0.8s，上限 15s + 抖动）
  - 连续失败第 3 次 → 主窗销毁重建 BrowserWindow（保持隐藏/托盘状态）；浮窗直接关闭
  - 失败超过上限 → 主窗切到本地恢复页（重新加载/重启客户端/打开日志），并弹系统通知；绝不无限循环
  - 页面加载成功后需「稳定存活 30 秒」才清零故障计数，杜绝「加载即崩溃」型循环
  - `clean-exit`、退出中、窗口已销毁一律不触发恢复；服务进程退出时交由既有重启对话框，不双弹窗
- **界面挂起（AppHangB1）无恢复**：监听 `unresponsive`，20s 宽限后强制终结 renderer 复用恢复路径；preload 每 5s 心跳兜底「挂起但无 unresponsive 事件」的场景（以 show/hide 事件追踪可见性，隐藏/最小化不误判）
- **加载失败白屏**：新增 `did-fail-load` 处理，服务健在时退避重试（覆盖插件市场重启间隙），`ERR_ABORTED` 忽略
- **崩溃无法取证**：固定 `crashDumps` 到数据目录并启用本地 Crashpad（`uploadToServer:false`），minidump 可离线分析 0xC0000005 底层来源；恢复状态写入 `run-state.json`
- **dsh web / 预览服务随机命中 Chromium 受限端口导致页面永远无法加载**：命中即自动重启服务换端口（上限 4 次）；本地稳定端口选择也会避开受限端口

### 开发
- 新增 `scripts/test/unit-recovery.test.js`（node:test 状态机单元测试，17 例）与 `scripts/test/integration-runner.js`（真实 Electron 集成测试，10 场景）
- 集成测试通道：`DSH_DESKTOP_TEST=1` 时经文件轮询下达命令（crash/kill/hang/quit…），renderer 崩溃时仍可用

## [0.3.3] — 2026-08-15

### 新增
- **内置「极简模式_win」Agent 预设**：把官方极简模式的 bash/PTY 工具替换为 Windows PowerShell（`@deepseek-ai/dsh-tool-pwsh`），开发模式 `npm start` 自动安装，打包流程 `afterPack` 自动写入内置 dsh CLI。
- **内置 dsh-routing-suite**：`dsh-super-injector`（dev_* 注入器/自愈工具）作为 bundle 插件随包同步进 web profile；`router-standard` 预设随包写入内置 dsh CLI。
- **内置 dsh-anchored-standard**：`anchored-standard` 与 `zero-anchored-standard` 两个实验性预设随包写入内置 dsh CLI。
- **识图插件设置页**：`dsh-vision` 新增设置页，可直接填写 API 地址、密钥、模型、备用模型与请求限制；设置保存后热生效。
- **余额/本轮费用开关**：自绘菜单新增「显示余额/本轮费用」，第三方中转/不需要余额提示的用户可一键关闭整个统计 dock。
- **会话导航滑轨输入位置圆点**：每条用户消息在右侧滑轨上以圆点标出位置，内容或尺寸变化时才重算，滚动时不额外读取布局。

### 修复
- **客户端更新多源选择错误**：GitHub 与 Gitee 双源现在取版本最高的 release，而不是返回第一个可用源；修复 GitHub latest 落后时“内置在线更新失效、只能手动覆盖安装”。
- **插件市场安装报 `args fields do not match`**：`installPlugin` 的 Typert 描述符参数名从 `packageName` 对齐为宿主方法的 `spec`。
- **识图插件无法配置/加载**：修正 `dsh-vision` 的 peer 依赖（`@deepseek-ai/cordis`），补齐 `dsh.client` 清单与设置 UI，配置不再依赖手工写文件。
- **第三方模型思考强度默认不再破坏 API**：`reasoning_effort` 注入默认关闭，仅 provider 确认支持时启用；字段名留空表示只显示档位、不注入参数，避免百炼等严格接口报错。
- **会话导航滑轨**：滑轨固定到会话内容区右侧，并在滑轨上以圆点标出每条用户输入的位置；不再因 `position:fixed` 缺省位置偏到窗口左侧。
- **设置页出现两个「插件」栏**：移除 `dsh-super-injector` 重复注册的同名空白设置栏，设置导航只保留官方「插件」页（插件市场为其标签页）。
- **余额/本轮费用开关失效导致金额不显示**：`balanceDockEnabled` / `setBalanceDock` 曾被误放进通知点击回调的作用域，余额刷新与菜单开关运行时抛出 `ReferenceError`；现提升为模块级函数，dock 恢复显示且开关真正生效。
- **README 下载链接**：根 README 中英文下载链接从 0.3.1 同步为 0.3.3，并补充手动安装第三方插件说明。
- **服务启动失败弹窗叠加**：主进程对话框串行化，启动失败/更新/错误弹窗不会同时叠成多个。
- **「隐藏对话输出」按预期工作**：`dsh-conversation-tweaks` 设置命名空间加入浏览器设置白名单，开关保存后真正写入；开启时隐藏大量工具调用、工具结果与思考过程，每一轮最终总结输出仍然显示。
- **桌面端卡顿优化**：会话日志目录枚举改为 5 秒缓存并降低轮询频率；会话导航滑轨滚动事件合并到 requestAnimationFrame 并限频；M3 设置观察器防抖；高频重复的页面 warning/error 日志按签名节流，减少同步磁盘写入。
- **左侧会话分组偏好丢失**：`dsh web` 不再每次随机换端口，改为复用上次保存的 `127.0.0.1` 端口（占用时自动选新端口）。Web UI 的 localStorage 偏好（如会话分组方式）不再因 origin 变化而每次重置。
- **客户端更新“重启后不自动安装/重复弹窗”**：启动更新脚本前清除待安装标记，失败后不会再反复弹同一个更新框；安装版安装完成后会检测新版本是否启动，未启动则从卸载注册表定位并显式拉起；NSIS 明确开启 `runAfterFinish`。
- **插件事件导致会话历史无法加载**：打包时对内置 `@deepseek-ai/dsh-session` 事件词汇表打补丁（`afterPack` 自动执行；开发模式 `npm start` 同样幂等补丁），接受 dsh-agent-teams / dsh-message-edit / dsh-web-search-exa 写入的自定义会话事件，修复 `SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`。
- **0.3.2 实际未随包携带「极简模式_win」**：该预设此前只写进了 changelog，本次补齐源文件与安装流程。


## [0.3.2] — 2026-08-15

### 新增
- **内置识图插件 `dsh-vision`**（`assets/plugins/dsh-vision`）：为纯文本 DeepSeek 注册 `view_image` 工具，把图片与问题转发给任意 OpenAI 兼容 VLM 端点（默认智谱免费 `glm-4.6v-flash`，可换通义 qwen3-vl / Ollama 本地 / 未来 DeepSeek 官方识图 API），答案以文本返回；无需 API key 时按插件配置或 `DSH_VISION_API_KEY` 等环境变量取用。

### 修复
- **客户端自更新“点击重启后无任何反应”**：安装版/便携版更新脚本原来以含空格的完整路径作为 `cmd /c` 的第一个参数，会被 cmd 剥掉引号而静默失败；现在把工作目录切到 `updates` 并只传脚本文件名，更新安装器可正常拉起。
## [0.3.1] — 2026-08-15

### 新增
- **设置-通用「隐藏对话输出」**：一键隐藏模型长篇文字输出，仅保留工具调用、文件操作与结果等重要信息（`assets/plugins/dsh-conversation-tweaks`）。
- **会话右侧导航滑轨**：对话区右侧提供一条跟随会话长度的虚化滑轨；鼠标悬停时在鼠标位置显示垂直短横线预览目标位置，仅点击才跳转（同插件）。
- **便携版解压缓存**：portable 版首次启动后保留 `%TEMP%\dsh-desktop-portable` 解压缓存，后续同版本启动直接复用，避免 Defender 扫描 2.4 万文件造成的分钟级冷启动。
- **异常退出看门狗与恢复提醒**：安装版内置轻量看门狗；主进程异常消失时自动拉起应用，并在下次启动时发系统通知。

### 修复
- **会话浮窗空白**：修复 `display:none` 导致 CSS Grid 自动前移、会话列宽度为 0 的根因。
- **同一会话拖出两个浮窗**：主进程按 sessionId 去重复用已有浮窗；客户端拖拽增加节流。
- **后台完成不提醒**：仅主窗口可见且聚焦时抑制通知，最小化/隐藏/失焦时正常弹通知。
- **终端路由冲突残留**：清理旧 `@deepseek-ai/dsh-terminal` 私有包，启动时自动移除过期配套插件。
- **profile 链接损坏导致启动失败（退出码 1）**：启动前调用官方 `healProfilesModuleFallback` 自愈，自动移除被复制/同步还原成真实目录的 fallback 链接。
- **托盘偶发丢失**：每 30 秒检测并在不可用时重建托盘。

### 开发
- 新增 `scripts/patch-portable-template.js`、`watchdog.js`、浮窗诊断脚本 `_float-diag.js`。
- `npm run dist` 已内置便携版缓存模板补丁，直接打包即可。

## [0.3.0] — 2026-08-15

### 新增
- **第三方模型思考强度**（`assets/plugins/dsh-third-party-thinking`）：让接入的第三方
  OpenAI 兼容模型（pi-ai 自定义 provider / openclaw-bridge 等）也能在模型选择器右下角
  调整思考强度（off / high / max），与官方 DeepSeek 模型同一位置、同一交互。官方
  DeepSeek 模型行为不受影响，已声明 reasoning 的第三方模型保留原生元数据。
- **极简模式_win Agent 预设**：基于官方极简模式，将 bash 工具替换为 Windows PowerShell
  （`@deepseek-ai/dsh-tool-pwsh`），Windows 用户可直接使用。
- **自定义提示词「预览官方提示词」**：设置页自定义提示词区域新增按钮，点击显示官方
  默认系统提示词的渲染结果（只读），方便对比修改。

### 修复
- **插件市场搜索崩溃**：非 npm 来源（GitHub / deepseekdocs）的搜索结果会触发
  `Cannot read properties of null (reading 'version')`，已修复空值判断。
- **会话浮窗内容空白**：拖出会话到独立窗口后，若服务端会话列表尚未同步目标会话，
  会因 `unknown session` 导致浮窗空内容。现增加快照内会话存在性校验，确保目标会话
  已在列表中再执行选中。

### 优化
- **会话完成通知去重**：主窗口在前台时不再弹通知，同一会话 30 秒内最多弹 1 次，
  全局 15 秒内最多弹 1 次，避免连续刷屏。
- **安装包继续瘦身**：在 0.2.3 语言包裁剪 + 冗余文件清理的基础上，进一步优化
  after-pack 清理范围。

## [0.2.0] — 2026-08-14

### 新增
- **伴侣插件体系（一切插件化）**：新增 `assets/plugins/` 机制——宿主启动时把
  配套插件同步进 web profile（`~/.dsh/profiles/web`）并幂等打 `cordis.patch.yml`
  补丁启用。本版随客户端分发的插件：
  - `dsh-terminal`：会话内终端标签页（与 对话/轨迹/文件 并列）。在当前会话项目目录
    启动持久 PowerShell（SSE 流式，非 PTY），命令历史/清屏/重启/断线重连（保留
    512KB 回放）；显式 UTF-8 mini-REPL 规避 PS 5.1 重定向 stdin 的代码页问题；
  - `dsh-file-changes` + `dsh-client-file-changes`：会话文件修改追踪与一键还原。
    「文件」标签页聚合当前会话 agent 修改过的全部文件（新建/修改/删除 + 行级 diff），
    支持逐文件/全部还原（桌面壳做内容精确匹配后替换，冲突安全提示）。数据只读复用
    会话日志已持久化的 `tool/result.meta.diffs`（fs 写前锁内全文 diff），零写入、
    零格式变更；另提供项目文件树（`/api/dsh-files/list`）、站内 HTML/端口预览
    （`/dsh-files/static/*`、`ports`、`check`），全部仅回环；
  - `dsh-balance`：对话底部统计栏内联「本轮 ¥X.XX · 余额 ¥Y.YY」小部件
    （桌面壳读 `~/.dsh/.credentials.yaml` 调 `api.deepseek.com/user/balance`，
    15 分钟刷新，可配置价格档）；
  - `dsh-plugin-marketplace`：插件市场入口。
- **客户端自更新**（`client-updater.js`）：GitHub Releases → Gitee Releases 双源回退
  （`DSH_DESKTOP_RELEASE_API` 可自定义镜像），Gitee 100MB 分片自动下载合并；
  便携版原地替换 + 自动重启，安装版引导新安装包；失败自动保留当前版本。
- **跟随官方更新**（`updater.js`）：检测 `@deepseek-ai/dsh` 新版本，经用户同意后
  用内置 node+npm 安装到数据目录 overlay，staging 原子切换、失败回退、
  启动失败一键回退内置版本；尊重 `NPM_CONFIG_REGISTRY`。
- **会话完成系统通知**：agent 任务跑完弹 Windows 通知，点击回到窗口。
- **快捷键自动维护**：便携版自动创建/重建桌面+开始菜单快捷方式（exe 移动后自愈）。

### 说明
- 便携版数据目录跟随 exe（`data\`）；安装版在 `%APPDATA%\DSH Desktop\`。
- 与 dsh CLI 共享 `DSH_HOME`（默认 `~/.dsh`），已有会话/凭据直接生效。

## [0.2.1] — 2026-08-14

### 新增
- **会话分屏独立窗口**（`assets/plugins/dsh-float-window`）：会话头「弹出独立窗口」
  图标，或把侧栏会话拖出窗口边界，即可创建浮动窗口独立查看/操作该会话（同源镜像 +
  沉浸折叠，自动选中目标会话、折叠侧栏、隐藏标题栏）。最多 8 个浮动窗口，经 IPC
  `too-many` 校验防资源过载；全部浮动窗口共享同一会话数据源、各自独立选中态。
- **自定义注入提示词**（`assets/plugins/dsh-prompt-custom`）：设置页可自定义官方内核
  每次为会话注入的系统提示词，支持「替换整体 / 追加到末尾」两种方式（应用到
  standard 完整 Agent 基准预设），新会话即刻生效。配置持久化到 web profile 的
  `settings.yaml`（`dsh-prompt` 命名空间）。
- **插件市场多源聚合**（`assets/plugins/dsh-plugin-marketplace`）：搜索聚合
  npm registry、GitHub（`topic:dsh-plugin`）与 deepseekdocs 生态三源，各源独立熔断；
  结果展示来源徽标 / stars / GitHub 链接 / 版本；支持 npm 包名与 git spec
  （`github:owner/repo#branch`、`git+https`、`https`）安装。
- **请作者喝咖啡**：chrome 栏 ⋯ 菜单新增「请作者喝咖啡」，弹层展示支付宝/微信收款码
  （`assets/sponsor/`），对照 README「支持作者」小节。
- **官方峰谷计价**：`balance.js` 加入官方峰谷计价引擎（`PEAK_PRICES` /
  `LEGACY_PRICES` / `isPeakHour()` / `effectivePrice()`），余额小部件显示当前模型与
  峰/谷价格，v4-flash 底价同步至峰时费率。

### 变更
- **终端插件更名**：`dsh-terminal` → `dsh-terminal-tab`，修复与官方
  `@deepseek-ai/dsh-terminal` 同名导致的重复路由注册与预设加载失败。

### 修复
- **会话列表刷新闪跳**：选择工作区 / 切换模式 / 开启新对话后，UI 会瞬时闪回
  「选择工作区 / 无会话」状态。根因是官方 `dsh-client-runtime` 的
  `mergeOrderedBaseline` 在会话列表刷新时会丢弃「本地已创建、宿主全量列表尚未
  回显」的新会话，使 `current` 瞬时变 `undefined`。桌面启动时
  （`applyRuntimeFlashFix`）幂等地对运行时打补丁——保留 baseline 缺席的本地会话，
  下一次 baseline 带上该会话后自动收敛为官方值。dsh 包更新后会在下次启动重新应用。

## [0.2.3] — 2026-08-14

### 优化（缩小安装体积、缩短安装时长）
- **语言包裁剪**：`electron-builder.yml` 新增 `electronLanguages: [en-US, zh-CN]`，
  移除 Electron 其余 53 个语言包（.pak，约 80MB）。不影响功能与体验——右键菜单、
  DevTools 等界面语言随系统 locale 自动取 en-US/zh-CN。
- **冗余文件清理**：`scripts/after-pack.js` 在打包后递归清理纯冗余文件
  （源码映射 `*.map`、文档与许可 `README*/CHANGELOG*/LICENSE*/*.md`、TS 构建产物
  `*.tsbuildinfo/*.d.ts` 等），覆盖 `resources/app/` 与自带 npm CLI
  `resources/npm/`。绝不触碰任何运行时文件（`.js/.json/.node/.exe/.dll`），
  功能与体验完整保留。

### 说明
- 0.2.3 为安装优化版，功能与 0.2.2 完全一致（含浮窗会话、自定义提示词、
  咖啡二维码长条三项修复），仅体积与安装时长得到改善。

## [0.2.2] — 2026-08-14

### 修复
- **自定义提示词设置不可用 / 无法输入**：官方 `dsh-host-apiproxy` 只把白名单里的
  settings 命名空间暴露给浏览器端，`dsh-prompt` 默认不在白名单，导致设置页该栏只读
  （显示「设置不可用」，无输入框）。新增 `applyPromptExposeFix()`，启动时幂等地把
  `dsh-prompt` 追加进 `WEB_SETTINGS_NAMESPACES` 暴露白名单，使输入框可正常编辑保存；
  dsh 包更新后会在下次启动重新应用。
- **会话分屏浮窗内容为空 / 按键不响应**：浮窗早期会话服务未就绪时 `sessions.open()`
  会抛 `unknown session`，首屏未选中任何会话导致内容空白。改为浮窗 preload 在页面
  JS 运行前把目标会话预置进 `localStorage['dsh.sessions.current']`，应用一启动即带
  目标会话首屏渲染（与正常恢复会话同一机制）；`sessions.open()` 保留作兜底。
- **「请作者喝咖啡」展示优化**：由全屏遮罩 + 居中卡片改为点击 ⋯ 菜单后从右上角
  （标题栏下方）展开的一条可关闭长条，两个收款码并排显示，支持 × 按钮与 Esc 关闭，
  不再把二维码平铺到页面下方。

# Changelog — DSH Desktop

DeepSeek Harness（dsh）的 Windows 桌面客户端：内置独立 Node 运行时与 dsh CLI，
一键启动 Web UI。

## [Unreleased]

> 内核升级：内置 DeepSeek Harness 从 0.1.0-rc.7 升至 **0.1.0-rc.8**（npm `next` tag，2026-08-19 发布）。含行为适配与补丁体系全量重锚定审查。**同时修复存量 rc.8 overlay 用户的补丁失配**（更新器按 dist-tags 最大值推荐版本，rc.8 发布当天起线上用户已可装到 rc.8 overlay，而既有补丁锚定 rc.7 形态）。

### 修复（0.4.1 用户反馈）
- **设置页左侧导航无法滚动**：装的插件多或展开「高级」分组后，导航行数超出设置面板高度，官方 navList 无 overflow，下方条目被裁掉看不清也点不到。dsh-settings-groups 就地把 navList 容器化（overflow-y:auto + min-height:0/max-height:100% 允许在 flex 布局正确收缩 + overscroll-behavior:contain 防滚动穿透），未超出时零影响。
- **「操作失败： signal timed out」弹窗友好化**：该错误是连接层 AbortSignal.timeout 的裸 DOMException（后端正忙/假死时所有带超时的请求都报它），直接 alert 用户无法理解。dsh-session-manager 的会话操作超时改为：人话说明（后端响应超时，输入不显示/内容刷不出通常同因）+ 「是否立即重启 DSH 服务」一键走壳层受监管重启（window.dshDesktop.restartService，不产生游离进程）。后端假死的根治（存活探针 + 受控自动重启）由 #121 插件中心重构的 supervision 层承载。

### 升级与适配
- **依赖平移**：`@deepseek-ai/dsh` 与 19 个 `@deepseek-ai/dsh-*` 兄弟包从 `0.1.0-rc.7` 精确锁版整体升至 `0.1.0-rc.8`（54 包全家桶齐发；cordis 系 1.x/4.x 版本线冻结不变；新增传递依赖 `dsh-tool-pwsh-persistent` 随 minimal preset 的 win32 pwsh 栈引入）。
- **禁止内核自动开浏览器（关键行为适配）**：rc.8 `dsh web` 新增 `openBrowser` 默认 `true`（非 SSH 环境经 `open` 模块拉起系统浏览器；WSL 内经 `wslview` 弹 Windows 浏览器）。桌面内嵌场景由壳层 spawn 时显式传 `--no-open`（main.js `startServer()` 与 wsl-backend.js `spawnServer()`），**按内核版本门控**（≥ 0.1.0-rc.8 才传；rc.7 的 web 命令无此选项，commander 遇未知选项直接报错）。
- **补丁锚点 rc.8 审查结果**（postinstall 链 + 22 项注册表 applyAll 实测）：session-manage（5 文件）、open-project-dir、session-persistence、tool-source 双端、keyed slot runner 侧、识图链路、settings/patch/bundle 三重防护、web-search、pi-ai-credits、picker-native 等 **17 组补丁在 rc.8 上原样命中，无需改动**。真实回归仅 2 处，已修复（双形态兼容，rc.7 overlay 副本仍走原锚点路径）：
  - `profile-boot` 存根识别：rc.8 把两个 `profile-boot-*.js` 之一变成纯 re-export 存根（85 字节，真身在另一 bundle 且已注入防护），存根无装配面，按已处理跳过，不再计为失配；
  - workspace 搜索栏修复：rc.8 **上游原生合入同款守卫**（`|| searchOnExpand` 无 marker 裸形态），命中即视为已修复。
- **菜单视口封顶改为 CSS 注入（issue #36 的 rc.8 形态）**：rc.8 菜单组件移入压缩前端 dist 产物（`dsh-web-frontend`，mangled 标识符），文本手术锚点不再可用，且其放置夹紧在列表高于视口时仍裁顶部条目（与 rc.7 bug 同源）。改由 preload 以语义选择器注入 `[role="menu"]{max-height:min(calc(100vh - 24px),560px);overflow-y:auto}`——不依赖 CSS-module 哈希类名，对后续版本漂移稳健；rc.7 树仍由原文本补丁覆盖。
- **keyed slot 兼容的 rc.8 布局**：rc.8 移除 `dsh-client-ui-slots` 独立包（slot core 并入前端 dist），core 侧两个补丁（legacy-key 提升、注册错误隔离）在 rc.8 布局下无目标可打（文件不存在即静默跳过，不计失配；`fault-isolation` 预检同为"文件不存在即跳过"，不误报）。注册链路防护由 **runner 侧** unkeyed 兼容补丁承载（rc.8 实测命中）：显式 key 优先、legacy `id` 提升、全无时按包身份派生——所有经 cordis-client-runner 的注册（含全部第三方客户端插件）均受覆盖。相关单测在 rc.8 布局下跳过对已不存在文件的真实锚点校验。
- **已知后续项（fail-soft，不阻断）**：M3 主题按钮的设置页外观区锚（rc.6 CSS 哈希类 + `[class*="appearance"]` 回退链）在 rc.8 前端中已无 "appearance" 命名，注入静默失效，待运行时 DOM 侦察后重锚；`dsh-mini` 手机端 gui 快照（38 包自洽 rc7 副本）与桌面内核独立，重新采集列为后续任务。

### 验证
- `npm ci`（postinstall patch-deps 对 rc.8 实装）：17 组补丁全部命中，0 失配。
- 注册表 applyAll：写入 16 处 / 失配 3 项（均为 rc.7 时代即存在的 slot 交叉失配基线，与升级前一致，零新增）/ 降级 1 项（同基线）。
- 全量单测 633 项：630 过 / 0 挂 / 3 跳过（2 项既有环境跳过 + 1 项 rc.8 布局跳过）。
- 真实 Electron 集成测试：31 场景 30 过（boot/heal 全家/补丁链/会话删除/识图/崩溃恢复/WSL 回退等，实际 spawn rc.8 内核，含 `--no-open` 门控链路）；`preview-fence` 为升级前即存在的开发环境性失败（rc.7 基线同败，与内核版本无关）。
- 集成断言双形态化（`runtime-patches-suite`）：menu-viewport 前缀日志/primitives 落盘仅 rc.7 树要求，rc.8 树改为断言 preload 封顶 CSS 存在；workspace 搜索栏接受 marker 或 rc.8 原生守卫；提示词暴露接受 marker 或 rc.7+ 动态 settings 原生形态。

## [0.4.1] — 2026-08-19

> 热修复版：插件市场装插件后「服务意外退出」崩溃事故根治（三层防线）+ 空 tool-call 存量会话打不开修复。

### 修复
- **空 tool-call 持久化导致存量会话打不开（SessionPersistenceCorruptionError）根治**：session writer 曾把 id/name 为空的 tool-call 写入持久化（assistant message 的 tool-call block、tool/call 事件的 callId/name 均为空串），随后生成 callId/toolCallId 为空的 tool/result；export 能导出该 JSONL，但 dsh-session restore 的 `assertMessageEventShape` 严格校验要求 tool/result 必须有非空 tool source，整个会话「历史加载失败」打不开（事故会话 seq 连续 0..515255、帧可解，仅此一条空链击穿）。双端修复（新增 `scripts/lib/tool-source-patch.js`，幂等、锚点失配自动跳过，接入 main.js 启动 / patch-deps / after-pack / sync-companion-plugins 四条布线，覆盖内置副本 / profile fallback / agent overlay / WSL）：
  - **读端容错（存量会话能打开）**：dsh-session 校验遇到空 callId/缺 kind 的 tool/result 时就地修复——优先采用 block.toolCallId 非空侧，否则合成 `recovered-seq-<seq>` 并拉齐两侧，告警落日志；修复写入失败（对象已冻结）保留原严格报错；两侧 callId 都非空且不一致仍是真损坏继续拒绝。
  - **写端防护（不再产生新坏数据）**：dsh-agent-loop `appendToolCall`/`appendToolResult` 遇空 block.id 时合成 `recovered-<turn>-<step>-call`（两函数同规则保证 tool/call 与 tool/result 一致）并告警，空 name 落 `invalid-tool-call`。
  - **测试**：新增 `unit-tool-source-compat`（7 项：双变换真实 vendored 文件锚点命中/幂等、空 callId 就地修复放行、缺失形态以非空侧为准、双非空不一致仍拒绝、正常事件不受影响）。
- **发布流水线修复（三平台五架构全绿）**：① Windows 两腿「Verify packaged app natives」失败——node-pty 1.2.0-beta.15 的 win32 预编译目录从 `pty.node` 改为 `conpty.node`/`conpty_console_list.node`，校验 glob 改为 `*.node` 通配；② Linux 腿 Publish 失败——electron-builder 把 AppImage 的 `${arch}` 渲染为 `x86_64`（非 `x64`），上传 glob 改为 `dist/*.AppImage`；③ ci workflow 余额渲染层验证——npm ci 不触发 electron 二进制下载，步骤内显式 `node node_modules/electron/install.js`；无 GPU runner 补强（harness `app.disableHardwareAcceleration()` + GPU 子进程消失容忍、驱动层禁 Windows 无头遮挡判定节流、integration-runner `--disable-gpu`）。
- **插件市场装插件后「DSH 服务意外退出」崩溃根治（三层防线）**：用户从插件市场安装插件后点「立即重启」，dshmarket 直连其服务端自重启端点 `scheduleRestart()`——SIGTERM 掉被壳层监管的 dsh web 进程，再由 detached 助手拉起替身。壳层把自杀当「服务意外退出」弹窗（即事故截图），且替身进程脱离监管：退出应用时杀不掉、日志不落 dsh-web.log、用户点弹窗「重新启动」会拉起第三个实例撞端口。dshmarket 原有桌面分支（`allowRestart: false`，注释写明 "The shell remains responsible for restart"）依赖壳层注册 `desktopProfiles` 服务，而壳层从未注册，永远落入普通 DSH 分支（自重启开启）。三层根治：
  - **L1 重启权收归壳层**：壳层 `childEnv` 注入 `DSH_DESKTOP_SUPERVISED=1` 监管标识；dshmarket 服务端见到标识默认禁用自重启端点（显式 `config.allowRestart` 仍优先）；dshmarket 客户端「立即重启」在壳层桥（`window.dshDesktop.restartService`，即 `chrome:restart-service` 监管重启）可用时优先走桥，boot-id 轮询重载逻辑原样复用——按钮可用、重启受监管、不弹窗、不产生游离进程（与 dsh-hub 同款桥接模式）；
  - **L2 壳层稳定性看管（任何环插件均受益）**：① 「最后良好」快照延迟落定——旧实现 dsh web 一达就绪横幅即 `markGood`，环插件「启动成功、几秒后拖死宿主」的形态会把含环插件的配置固化成回滚基线、回滚永久无效；现改为服务连续存活 30s 才 `confirmPendingGood` 落定并清零崩溃环计数；② 就绪后崩溃环自愈——进程达就绪后 30s 内意外退出不再直接弹窗，而是自动走守护重启（体检/修复/回滚到最后良好快照），上限 2 次，耗尽才降级弹窗；③ 「服务已停止」弹窗的「重新启动」按钮改走守护启动（旧为裸 `startAndShow`，环插件会导致「点一次崩一次」死循环）；④ `restartService`（插件市场/集成测试共用的原地重启）同样改走守护启动；⑤ 回滚 lift 修复：旧实现回滚后成功拉起时把 `listSnapshots()[0]`（= restore 前的 pre-restore 快照 = 坏状态）标为良好，现改为对回滚后的健康状态新拍快照待落定；⑥ 意外退出弹窗延迟 500ms 再读日志，给 stderr 尾部真实崩溃栈落盘窗口（exit 事件可能早于最后几个 stdio data 事件，立即读会丢现场）；
  - **L3 dsh web 进程崩溃屏蔽**：新增 `scripts/lib/web-crash-shield.js`（纯 Node 核心依赖，经 `--require` 注入 + `DSH_CRASH_SHIELD=1` 自装）：就绪横幅出现前保持 fail-fast（启动失败快速退出语义不变，既有启动自愈照常工作）；就绪后 uncaughtException/unhandledRejection 吞掉并打日志到 stderr（随管道落 dsh-web.log），环插件运行时错误不再击穿整个宿主；风暴断路——60s 窗口内错误超 20 次恢复抛出（进程退出 → 壳层崩溃环自愈接管回滚），避免僵尸态。`scripts/**/*` 已在四个打包配置的 files 清单，随包分发。
  - **测试**：新增 `unit-web-crash-shield`（8 项：启动期 fail-fast、就绪后吞错落日志、unhandledRejection 同语义、风暴断路与窗口清零、就绪横幅探测 arm、事件监听注册）与 `unit-plugin-guard`（5 项：成功不立即落定、confirm 后落定、崩溃环场景回滚目标为此前稳定快照而非环配置、setPendingGood(null) 安全、失败无快照落事故报告）。

## [0.4.0] — 2026-08-19

### 新增
- **Quest 模式界面（dsh-quest-ui，默认关闭）**：全新 Qoder Quest 风格视觉重设计——输入区与画布彻底融合（去白底、去圆角、下栏拉高）、底部一体化（去胶囊 CSS / 幽灵按钮 / 余额同层 / 聚焦顶线）、全开布局（去胶囊 / 卡占满下栏 / 部件贴缘压底）。设置页弹窗重设计，聚焦线加浓加粗 + 编辑钮隐藏 + 临时会话移右上角 + 面板降噪。左侧栏启动时强制展开。多轮迭代至 v0.5.4：synapse 会话地图适配双 UI 通用 + 输入区底部一体化
- **内置 dsh-synapse 会话地图插件（vendored，MIT）**：可视化会话关系图谱，快速跳转关联会话，随包分发并自动装配
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测
- **手机远程控制（DSH-Mobile v1.4.2）**：随包分发手机端 APK，「远程控制」按钮一键连接，支持外网穿透 + P0 同步修复 + 安全加固
- **macOS 无签名构建 Gatekeeper 指引与配置显式化**：未签名 / ad-hoc 签名构建首次启动若提示「已损坏，无法打开」，README 与 troubleshooting.md 提供修复指引（`sudo xattr -cr` → codesign 重签 → 右键打开 → 终端直启取证）；构建配置显式关闭 `gatekeeperAssess` 与 `hardenedRuntime`（无 Developer ID 的包无意义，消除误导性警告）

### 修复
- **自定义卸载器升级链路根治（2026-08 数据丢失事故修复）**：electron-builder 的 `uninstallOldVersion` 宏把注册表里旧的 `UninstallString` 指向的卸载器拷到临时目录执行 `old-uninstaller.exe /S /KEEP_APP_DATA --updated`，旧版自定义卸载器不识别这两个升级契约参数，静默模式下默认全删用户数据（sessions / settings / credentials 等全部丢失）。双层根治：① **卸载器侧**：识别 `/KEEP_APP_DATA`、`--updated`、`/updated`、`--upgrade` 等升级意图参数 → 等价 `/KeepAll` 保留全部用户数据；静默模式安全契约——无升级标记且无显式 `/FullWipe` 时拒绝删除用户数据直接退出；Roaming 目录（`%APPDATA%\DSH Desktop`，含 logs / settings.json / window-state）在保留应用设置或其他用户数据时不再删除；UAC 提权子进程在静默模式下 `WaitForExit` 等待完成，避免安装器与子进程并发删文件。② **安装器侧**（`installer.nsh` `customInit` 宏）：`.onInit` 阶段（早于 install section 的 `uninstallOldVersion`）抢先把旧安装目录里的 `Uninstall_DSH_Desktop.exe` 覆盖为本安装包自带的修复版——即使存量用户机器上仍是旧坏卸载器，升级安装时实际执行的也已是修复版。InstallLocation 缺失时回退解析 `UninstallString`（含引号剥离 + 文件名校验），覆盖路径万无一失。经实机演练验证：编译旧版坏卸载器 → 布置数据标记 → 静默覆盖安装新包 → 标记文件存活 / settings.yaml 完整 / Roaming 数据保留 / 卸载器被自动替换
- **余额显示链路整体加固（架构重构而非补丁）**：本轮费用计算、余额查询、编排推送全链路系统性修复 21 处缺陷（2 严重 / 3 高 / 8 中 / 8 低），全部按「整体架构改进」落地：
  - **本轮费用输入项恒为 0（严重，OpenAI 兼容端点）**：`sessionCost` 的 `uncachedInputTokens + cacheWriteTokens` 求和先于 `||0` 守卫求值，openai-compat 适配器产出 `inputTokens` 形态且不产出 `cacheWriteTokens`，两处契约不匹配 → `undefined+undefined=NaN→0`，所有 one-api/SiliconFlow/Ollama 端点本轮费用只剩 cacheRead+output 计费。根治：① 客户端新增 `normalizeUsage` 归一化（投影/透传两种形态统一四桶、每操作数独立守卫）；② `openai-compat.js` 的 `mapUsage` 对齐 harness DISJOINT 契约（`inputTokens = prompt − cacheRead − cacheWrite`，缓存写单列、兼容多种 provider 字段命名）并附带 `model` 字段。
  - **重定向无条件携带 Authorization 泄露 API Key（严重，安全）**：`fetchJson` 跟随 3xx 时把密钥原样转发到新 URL，跨主机或 https→http 降级时计费凭证被发往非预期主机。根治：首跳（用户显式配置的端点）始终携带密钥；重定向跳仅「同主机且全程 https」保留，其余剥离并经 `warning` 显式告警。
  - **refreshBalance 无并发去重（高）**：并发触发时慢失败覆盖快成功 / 旧数据覆盖新数据（last-writer-wins）。根治：新增 `balance-scheduler.js` 编排模块——in-flight 去重（并发共享一次请求）+ latest-sequence 守卫（只有最新请求结果写 cache/推送）。
  - **持久失败 30s 无限重试（高）**：密钥错误/断网时每 30s 两发 HTTP 永不停歇。根治：指数退避 30s→1m→2m→5m 封顶，成功清零，禁用状态不重试，退出前统一清理。
  - **默认模型价估实际会话费用，最大 3x 偏差（高）**：prices 取 settings 默认模型档套到会话全部 token。根治：主进程每次推送**全模型价目表 `priceTable`**（同一时刻求值），适配器 usage 携带 `model`，客户端按会话真实模型选档；会话模型不可知时明确标注「按默认模型 X 单价估算（会话实际模型未知）」，绝不假装精确。
  - **peak 与 prices 两次独立 `new Date()` + 切换点不检查（中）**：临界秒 chip 文案与计价档可能自相矛盾，且旧版期 `isPeakHour` 也返回 true。根治：编排层取单一 `now` 传入三个函数（签名支持 date 参数）；`isPeakHour` 在峰谷生效节点（2026-08-16 16:00 UTC）之前恒 false。
  - **pickUsageWindow 把 percent:null 转 0（中）**：`Number(null)=0` 使「未知用量」显示成「0%」。根治：`percent == null ? NaN : Number(...)`，非有限一律保持 null。
  - **超时为 socket 空闲超时、1MB 上限按字符计（中）**：slow-drip 服务器可长期保活绕过 15s；多字节内容实际可超 1MB。根治：跨重定向共享 deadline 的总超时 + socket 空闲双保险；按 `Buffer` 字节累计上限。
  - **readCredentialLine 逐行正则不区分 YAML 段（中）**：嵌套段同名键可能读到错误密钥。根治：只匹配列 0 顶层键，支持引号值/行尾注释/正则元字符键名。
  - **http 端点明文传输无提示（中）**：显式支持 http 代理但密钥明文过网。根治：结果携带 `warning`，主进程记日志，README 提示仅建议本地代理。
  - **格式化余额字符串静默清零（中）**：`Number("1,234.56")=NaN→0`。根治：`parseAmount` 剥离千分位/货币符号、负数钳 0、脏数据显式告警。
  - **sessionCost 无下限保护（中）**：负 token 产生负费用。根治：逐桶 `Math.max(0, …)`。
  - **OpenCode URL 硬编码无环境覆盖（中）**：代理场景必走公网。根治：`OPENCODE_USAGE_URL` 环境变量覆盖。
  - **低危项全部修复**：`money` 格式化边界（0→"0.00"、超大→本地化不出现 `1e+21`、非有限→"—"）；外链 `rel="noopener noreferrer"`；`goUsageText` 全空返回 null 不再渲染空白 chip；`readActiveModel` 逐行状态机锚定段（前缀相似段/深层嵌套同名键不误匹配）；refreshBalance 内 settings 双读合并为单读；IPC 双通道重复投递改为「处理器只触发不返回数据 + 客户端只消费事件 + 页面内已收推送不再重复触发」；数组子元素补稳定 key 消除 React dev 告警；价目表 `PRICING_MODELS` 统一维护。切换瞬间价格跳变（低）经评估为官方整点计费口径本身，保持整点切换并保证显示与计价档自洽（见 `docs/balance-architecture.md` §7）。
  - **测试体系**：新增/扩充 79 项 node:test 断言——`unit-balance`（21：峰谷临界点 ±1ms、顶层键锚定、段锚定、金额解析矩阵、端点覆盖、重定向端口归一）、`unit-balance-scheduler`（14：节流/去重/stop 守卫/退避重试/单一 now/设置单读/禁用短路）、`integration-balance`（16：真实回环 HTTP/HTTPS mock——重定向密钥剥离矩阵、slow-drip 总超时、字节体积上限、http 警告）、`edge-client`（19：vm 沙箱加载真实产物，token 归一化矩阵含 [BUG] 回归用例）、`unit-openai-compat`（9：适配器 DISJOINT 契约端到端 + 缓存字段规整）+ **真实环境验证 `verify-balance-renderer`**（16：仓库自带 Electron 在隐藏 BrowserWindow + 真实 React 18 + 真实 DOM 中加载 client.js 产物，全程零网络、userData 指向临时目录、绝不触碰真实 ~/.dsh）；存量 `verify-balance-dock` 17 项断言保持通过，合计 112 项全部通过。全量测试目录仅剩 2 项与本改动无关的既有环境前提失败（`unit-updater` 的 activeVersion 两项断言依赖「本机无 bundled agent」，在干净检出通过、带 node_modules 的开发检出受本机 dsh 版本影响）。
  - **文档与打包**：新增 `docs/balance-architecture.md`（数据流/载荷契约/token 契约/安全边界/编排语义/缺陷映射表）；README 余额段更新（3 分钟轮询、峰谷价目表、新环境变量、http 告警）；`balance-scheduler.js` 纳入四个 electron-builder 配置的 files 清单与 `check-syntax.js` 语法门。
- **余额显示链路加固——全量 review 修正**：
  - **`balancePrices.<model>` 覆盖现作用于价目表（修复功能回归）**：原实现把用户单价覆盖只并入 `prices`（默认模型档），而客户端按会话真实模型优先走 `priceTable`，导致「真实跑该模型的会话静默忽略覆盖」。现覆盖统一合并进 `priceTable`，`prices` 恒等于 `priceTable[默认模型]`，定价单一真源；`unit-balance-scheduler` 断言同步更新。
  - **`mapUsage` 缓存字段 Number 规整**：`cacheReadTokens`/`cacheWriteTokens` 原样透传，provider 返回字符串会破坏 DISJOINT 三桶不变量、垃圾串会产出 `inputTokens=NaN`。现经 `toFiniteTokenCount` 规整（仅接受非负有限数，其余忽略），并补「数字串/垃圾串」断言。
  - **OpenCode Go 告警可见性**：http 明文 / 重定向剥离密钥的 `warning` 原落在 `opencodeGo.warning` 但既不记日志也不展示，现 `apply` 补记日志，与余额侧一致。
  - **latest-sequence 守卫口径修正**：该守卫在当前 API 下恒真（in-flight 去重已杜绝并发多请求），属防御性兜底；补「stop() 期间在途请求不推送」单测覆盖其可达的 `!stopped` 分支，架构文档与测试头注释如实标注。
  - **低危收口**：纯浏览器兜底价 `FALLBACK_PRICES` 对齐默认模型 deepseek-v4-pro（原为 flash，低估 3x）；重定向同主机判定改为 hostname+port（默认端口归一化）；`disabled` 退化形态补齐契约字段；`queryBalance` 对非对象响应加守卫 + 去重 `parseAmount` 调用；fetchJson 重定向清理本跳 socket 空闲定时器；React 数组子元素 key 修正（消除残留 dev 告警）；`verify-balance-renderer` 防御性清除 `ELECTRON_RUN_AS_NODE` 并加 `--disable-gpu`（无 GPU 环境可复现）。
- **内置插件市场 zat-dsh-engine 默认移除（社区反馈：默认不要带旧引擎市场）**：`COMPANION_PLUGINS` 移除 `plugin-market`（`assets/plugins/zat-dsh-engine` 目录随包删除），内置市场统一为 dshmarket（设置页入口不变）。存量 profile 里已装配的旧市场副本由 `retireZatEngine` 一次性清理（profile node_modules 目录 + manifest bundles 登记），settings 标记 `zatEngineRetired` 保证只清一次——之后用户从 dshmarket 主动重装不受影响。
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测。
- **agent 更新回退失败后静默卡住**：overlay agent 启动失败弹窗的「回退到内置版本并重试」分支直接调用 `updater.rollback()` 且无异常保护——回退本身失败（overlay 目录被安全软件/句柄锁定）时异常成为 unhandledRejection，用户点击后应用无任何反应、静默卡在失败页。现回退包 try/catch，失败显式弹「回退失败」错误框（说明文件可能被占用）并给「重试回退 / 退出」两个出口。
- **profile bundle 装配链根治性重构（「declares no dsh.bundle」一类启动失败不再依赖锚点补丁）**：`dsh.profile.bundles` 中任何一条登记不满足 dsh 装配契约（包未安装 / 未声明 `dsh.bundle.patch` / 补丁层缺失或损坏 / 入口文件缺失），官方 `dsh-app-boot` 即 fail-loud 以退出码 1 启动失败。此前唯一防线是启动前对 dsh 构建产物做字符串锚点改写（跳过 + 诊断），锚点随 dsh 版本变化失配即静默失效——用户反馈的 `profile bundle "dsh-hub" declares no dsh.bundle`（纯客户端 bundle 被登记进 profile.bundles）正是该形状，且入口缺失形状（loader 激活期 `plugin tree failed to load`）在防护覆盖范围之外。本次重构把「启动前把 manifest 对账到可装配状态」收口为唯一实现 `scripts/lib/profile-reconcile.js`（main.js 与 `sync-companion-plugins.js` 共用），运行时防护保留为纵深防御：
  - **全量逐条校验**：每条 bundles 登记按与 dsh 装配契约一一对应的 11 种失败码校验（登记名非法 / 包未安装 / 未声明补丁层 / 补丁层越界·缺失·不可解析 / 入口越界·缺失·指向目录 / client 入口越界·缺失，补丁层用与 dsh 相同的 entry-list YAML 方言解析；client 入口校验与上游 `verifyBundleDir` 新增的 `exports["./client"]` 校验同语义、文案逐字一致，并在对账侧收口为结构化失败码）；无效且非核心的登记**从 manifest 移除**并写入隔离记录 `dsh-desktop.broken-bundles.json`（移除原因 + 时间，重装插件重新登记即恢复，恢复健康后记录自动清除）；核心 bundles（`@deepseek-ai/dsh-base` / `dsh-web-app`）校验失败绝不移除（核心缺失是安装损坏而非数据问题，保留并由启动防护兜底跳过 + 告警）；
  - **校验实现单一化**：`profile-bundle-heal.js` 提取 `inspectBundleDir` 为唯一结构化校验实现（`verifyBundleDir` 变为兼容包装，文案与契约不变），对账与同步侧防呆共用同一判定语义；
  - **家级补丁层启动前预检**（`healHomePatch`）：`$DSH_HOME/cordis.patch.yml` 损坏此前只由 profile-boot 锚点补丁兜底，现启动 dsh web 前用同一方言预检，损坏 → 备份 `.broken-<ts>` + 重置为最小合法文件；
  - **既有语义逐项保留**：损坏 manifest 备份重建（.broken-<ts>）、核心补齐（issue #16）、配套登记追加、源缺失/卸载标记移除、重置后用户 bundle 恢复（issue #48）与全部日志文案不变；健康 manifest 零写入（幂等），写入全部原子化；
  - **CLI 同步收口**：`sync-companion-plugins.js` 的 manifest 段改用同一对账实现（`initMissing=false` 保持「不凭空创建 manifest」历史契约；损坏 manifest 在核心可解析时同样备份重建，dry-run 输出计划）；
  - **测试**：新增 `unit-profile-reconcile` 25 项单测（含两个真实 `dsh-app-boot` 复现测试——无效登记在官方 `loadProfile` 下必崩、对账后正常装配）；集成场景 `heal-missing-bundle` / `heal-manifestless-bundle` / `heal-broken-bundle-patch` / `heal-broken-home-patch` 断言更新为「移除 + 隔离记录 + 正常启动」，新增 `heal-entry-missing-bundle`（防护覆盖不到的入口缺失形状）；`check-syntax.js` 纳入新模块。
- **全量 review 修正（装配对账判定与 dsh 官方契约逐字对齐）**：
  - **补丁层条目级校验**：dsh 官方 `parsePatchList` 要求补丁层「顶层数组且每项为映射」，原校验只查顶层数组——`- 42` / `- "x"` / `- [1,2]` / `- null` 等畸形文件会被判健康、dsh 装配时仍 fail-loud。`inspectBundleDir`、`healHomePatch` 与 `healProfilePatch` 现共用 `isPatchListValid`（与官方逐字同构）判定；
  - **包解析与官方同构**：`validateBundleEntry` / 核心可解析判定改用与 `resolveBundleDir` 相同的 `createRequire.resolve.paths` 探测（含 NODE_PATH 与全局 node_modules）——此前 `packageDirUpward` 探测不到 NODE_PATH/全局安装的包，会把官方实际能装配的健康登记误判 UNRESOLVABLE 而误删；
  - **配套登记与恢复登记复检**：`addNames` 追加与 issue #48 恢复的登记此前只经 `verifyBundleDir`（不查补丁层可解析性），YAML 损坏的配套/恢复 bundle 会留下一个「仅靠运行时防护兜底」的启动窗口；现追加前/恢复后统一过 `validateBundleEntry` 复检，失败 → 不登记/移除 + 隔离记录。
- **全量 review 第二轮修正（对账语义收口与记录生命周期）**：
  - **入口文件必须是普通文件**：`inspectBundleDir` 的入口校验由 `existsSync` 升级为 `statSync().isFile()`——入口路径指向目录时（`main: "./lib"` 等形状）存在性检查会放过，而 dsh Loader 用 ESM `import()` 激活入口必然 `ERR_UNSUPPORTED_DIR_IMPORT`（防护覆盖不到的崩溃形状），现判 `ENTRY_MISSING` 并在启动前移除登记；
  - **策略性移除不进隔离记录**：配套源缺失 / 插件管理「卸载」标记的登记由步骤 4/6 按「用户意图禁用」移除，不再被步骤 2 判 UNRESOLVABLE 写入隔离记录（卸载/源缺失是用户意图而非无效登记，避免记录误导；CLI 同步同步补上 `removedBundles` 与 `excludeFromRecover`，与 main.js 口径完全一致——此前 CLI 不会把已卸载配套从 manifest 移除，且重置恢复可能把用户已卸载的配套重新登记）；
  - **隔离记录同轮清除**：`addNames` 登记成功与重置恢复成功时，同名历史隔离记录当轮即清除（此前要等下一次启动的步骤 2）；
  - **记录写入去重**：同 code + reason 的既有隔离条目不重写（保留首次 `removedAt`，持续损坏状态不再每次启动重写记录文件）；`addNames` 校验失败不再对未改动的 manifest 做内容相同的重写；
  - **健康检查口径统一**：`logProfileBundleHealth` 改用与对账相同的 `resolveBundleDirLike` 双锚点解析，消除「对账判定可解析、健康检查误报缺失」的口径撕裂（诊断只读）；
  - **重复登记去重**：同一 bundle 名在 `dsh.profile.bundles` 中登记两次时，其补丁层条目会重复出现在组合 entry list 中，loader 装配期抛 `duplicate loader entry id`（fail-loud → 退出码 1），且启动防护覆盖不到（两层都能正常加载）——现对账保留首次出现、移除重复项（冗余而非无效登记，不进隔离记录），该形状此前从不清理；
  - **测试环境封闭**：`unit-sync-cli` 的 CLI 调用 PATH 收口到 System32——CLI 的 `findDshPackageDir` 会经 PATH 探测 `dsh` 命令，环境 PATH 上的真实 dsh（如 harness 安装）会被当作预设同步目标，把 `assets/agent-presets` 写进真实安装（内容相同、mtime 被改写）；测试必须封闭，绝不触碰真实环境。
- **防护层修复（issue #97/#98/#99/#100，另含 #75 补强）**：社区批量上报的「防护罩有洞」问题逐一修复——
  - **插件 GitHub Release 多资产选择（#97）**：原实现 `isWinAsset` 用子串匹配（`darwin` 含 `win` 会误判为 Windows 资产，选中 macOS 二进制）、无架构优先级（`win-ia32` 与 `win-x64` 乱序时选错）、无归档时可能选中 `.sha256` 校验和文本。现收口为纯函数 `selectReleaseAsset(assets)`：词边界平台判定（`win32-x64.tgz` ✓ / `darwin-x64.tgz` ✗）、架构优先级（x64/amd64 → arm64/aarch64 → ia32/x86 → arm → 无架构兜底，稳定排序）、任何阶段排除校验和/签名/说明等非二进制文件（含无扩展名 `SHA256SUMS`/`SHA512SUMS` 与 `.sha1`；全部被排除 → 明确拒绝更新并提示），10 项单测；
  - **语法门禁剥离器支持正则字面量（#98）**：`check-syntax.js` 的字符串/注释剥离器不识别 JS 正则字面量——含引号的正则（如 `/[&<>"']/g`）会把引号当字符串起始，与后方引号配对将中间真实代码整段涂白，门禁对「孤立 async」失明（实测 preload.js 77.2% 被涂白、19 个 function 被吞）。现新增 `scanRegexLiteral`（跳过转义与字符类、拒绝跨行伪正则、闭 `/` 后按 flags/除法链判定）整体涂白正则字面量；补除法链识别（`a / /re/g` 第一个 `/` 按除法跳过，`return /re/` 等关键字后接正则按白名单放行）、flags 白名单含 ES2022 `d`/ES2024 `v`；并给门禁加 preload.js 失明硬断言（保留率 <23% 或 function 被吞 >5 即 FAIL 且报错注明触发项，正常基线 ~29%/吞 1 字符串内文本），26 项单测（含 mid 注入回归，防 EOF 特判假绿）；
  - **防砖体检 manifest 读取失败假绿（#99）**：`desktop-validity.js` 的 `validatePlugins` 用 `catch {}` 静默吞掉 profile `package.json` 读取/解析失败——启动清单读不到时清单内缺陷全部降级为 warning，体检返回「未发现问题」（假绿）。现显式记录 `manifestError`、总结论判定失败（含 `dsh.profile.bundles` 字段存在但非数组的结构损坏变体；字段缺失仍视为合法空清单），设置页体检区红字提示「无法读取启动清单，体检结果不可信」，4 种情形回归测试（缺失/损坏 JSON/bundles 非数组/正常）；
  - **补丁条目 id 负向断言漏掉行内空白（#100）**：`togglePluginInPatch` 的条目定位负向断言 `(?![A-Za-z0-9_.-])` 对行内空格放行——非标 id `- id: foo bar` 会被 `toggle('foo')` 命中误加 disabled（insert 内层更会被整条误删）。负向断言加入空格/tab（只排除行内空白，不排除 `\n`——排除换行会让所有既有条目匹配不上退化为重复新建），3 项回归测试；
  - **行注释内引号吞代码（#75 补强）**：剥离器此前不处理 `//` 行注释，注释内的引号会被当字符串起始吞掉后续代码（漏报比误报更危险）。现行注释整体涂白到行尾（保留换行），8 场景探测全过。
- **主窗口位置记忆（重启后回到用户放置的位置）**：主窗口关闭时持久化屏幕坐标与尺寸，下次启动恢复到用户上次放置的位置（跨屏校验 + 钳制回可视区），不再每次居中
- **会话删除守卫改为实时查询运行状态**：删除非当前会话后补回输入框焦点（修复光标消失仍可输入的边界问题），修复删除后输入锁死与误弹失败提示
- **清单 id 对齐 loader id 修复双登记崩溃（#104）**：插件清单 id 与 cordis loader id 不一致导致 `duplicate loader entry id` 启动失败，现统一对齐；side-session 升级 v0.3.0
- **卸载器清理加固（P0-P8）**：自定义卸载器全面加固——进程关闭重试策略、目录删除重试、注册表清理完整性、快捷方式清理全覆盖；dist 脚本自动构建卸载器（`predist` 钩子）；卸载二次确认弹窗防误操作
- **侧边临时会话透传服务端 error 字段**：模式 1 默认配置报错时正确展示服务端返回的错误信息，而非只显示「HTTP 502」；`deepseek-official` 供应商解析修复
- **WSL 清理命令双重登录 shell 嵌套与失败清理超时**：WSL 后端清理命令不再嵌套多余的 `cmd /c`，失败清理流程超时兜底
- **会话持久化容错增强**：进程中断留下的 zstd frame 尾部半截 JSONL 容错处理——只允许最后一个 frame 进入 torn-tail 截断/重放流程，中段损坏继续拒绝，覆盖内置 / profile / agent overlay 三份运行副本
- **自动更新 null 版本兜底 + keyed slot 注册错误隔离**：版本比较对 null/undefined 安全兜底；keyed slot 注册缺少 key/id 时容忍而非崩溃
- **打包白名单补齐 plugin-guard 依赖链**：`profile-module-heal.js`、`patch-row-heal.js`、`plugin-guard.js` 纳入四个 electron-builder 配置的 files 清单，防止启动期自愈链路因文件缺失而崩溃

### 优化
- **启动与运行性能系统性优化**：① 启动冒烟门禁与打包 `require` 完整性校验（`boot:ready` 时序标记 + `bench-baseline.json`）；② 补丁代际签名——签名命中跳过 18 个文件补充；③ koffi 预检异步化——boot 不等待，`startAndShow` 有界等待 3s 决定 overlay；④ SessionWatcher 句柄收敛——仅活跃会话 watch，冷会话复活才 scan；⑤ 会话根索引头部读取替代全目录扫描（TTL 失效增量重扫）；⑥ 非关键功能延后启动——会话监视器/余额轮询延至首屏稳定后 500ms；⑦ 长时内存观测——10 分钟采样后端/渲染 RSS 环形落盘；⑧ 崩溃转储清理增加数量上限（保留最近 5 个 + 最新豁免）；⑨ 无运行中会话时兜底扫描降为 0s；⑩ M3 设置页 observer 导航门控——离开设置页即断开；⑪ settings.yaml 写后校验与自动回写防损坏；⑫ NSIS 显式 lzma 压缩并关闭 solid 字典共享
- **agent 更新检查去 npm CLI 化**：纯 HTTPS dist-tags/版本探测，不再 spawn npm 子进程，启动更快
- **客户端更新检查双源并行 + 1h 窗口缓存 + 失败退避**：GitHub + Gitee 同时查询取最高版本，1 小时内不重复检查，失败后指数退避
- **余额轮询最小化暂停 + 凭证 mtime 缓存 + HTTPS_PROXY 支持**：窗口不可见时暂停轮询，凭证文件未变化时跳过重读，支持系统代理
- **自更新 SHA256SUMS 强制校验（fail-closed）**：下载完整性校验不通过即拒绝安装，不再静默放行
- **统一日志轮转（5MB 双代滚动）**：覆盖 desktop/web/watchdog 日志，不再无限增长
- **LLM 错误落盘与透出**：`llm-errors.jsonl`（5MB 环形缓冲），诊断模型小节可在设置页查看
- **replayState 降级补丁**：legacy 会话续聊失败回落 foreignAssistant 模式，不再直接报错
- **页面错误节流 + 图标 memo + 启动超时单常量**：减少渲染进程无效工作

## [0.3.10] — 2026-08-17
### 新增
- **插件中枢 dsh-hub v1.1.3 + 内置 graph-memory 与 dshmarket（知识图谱记忆 + 可视化插件市场）**：dsh-hub 对齐上游 ARFCON/dsh-hub-DSH v1.1.3（卸载 entry-id 顺序修复 1.1.2 内置时已同步，本次仅版本对齐 + 内置装配适配）；内置并随壳自动装配两个挂载目标——**graph-memory v1.6.0-beta.1**（adoresever/graph-memory 作者为 DSH 重新发布的原生适配版：跨会话知识图谱记忆，自动抽取三元组、PageRank/社区检测、向量去重与召回注入，SQLite 存储 `~/.dsh/graph-memory/graph-memory.db`；依赖 `@photostructure/sqlite` 原生模块随包分发全平台 prebuild，`dist/dsh.js` 入口 + `cordis.patch.yml` 完整声明）与 **dshmarket v1.11.1**（dsh-market/dsh-market 可视化插件市场：浏览/搜索/一键安装社区插件，`js-yaml` 依赖随包 vendored）。两者走配套插件通道（`COMPANION_PLUGINS` + 同步器）注册进 profile bundles；dsh-hub 中枢页适配内置装配——源码检测新增「随壳内置」分支、装配判定放宽（companion 同步是真实目录而非 link junction），设置页显示「内置 vX」与已装配状态，无需手动 clone plugin-src 源码
- **工作区锚点（workspace-anchor）**：新增 `@deepseek-ai/dsh-workspace-anchor` 配套插件，在每个 agent 的稳定 system prompt 中注入约 70 token 的 `{{cwd}}` 工作区偏好（默认在 cwd 内编辑/构建/交付、优先相对路径、允许读取/搜索任何位置但不得把搜索命中的外部目录当作新项目根、仅当用户显式指定或确有必要时才离开 cwd 并随后返回）。纯提示词偏好，不改变任何权限/沙箱行为。`minimal-win`、`anchored-standard`、`zero-anchored-standard`、`whoami-standard`、`warmupbetter`、`warmupbetter-replay` 六个 complete-persona 预设因会丢弃插件注入节，已在各自的 `agent.cordis.yml` persona 文本中直接写入同一锚点；`standard` / `code` / `router-standard` / `v4-flash-godmode-opencode-go` 等非 complete 预设由插件节覆盖
- **macOS 版客户端自动更新（多操作系统支持）**：此前客户端自更新仅 Windows（安装版/便携版），macOS 入口降级为手动下载。现 macOS 走独立链路——资产选择支持 `DSH-Desktop-<版本>-macos-<arch>.zip`（优先，免挂载自更新）/ `.dmg`（兜底，hdiutil 挂载）及 Gitee 分片（`.partN` 按序拼接）；更新脚本（bash，纯 ASCII，系统自带工具零依赖）等待旧进程退出 → `ditto` 解压 → 备份 `.bak` → 同卷 `mv` 原子替换 `/Applications/DSH Desktop.app`（`ditto` 复制兜底）→ `xattr -dr com.apple.quarantine` 解除隔离（未签名构建首次启动不被 Gatekeeper 拦截）→ `open` 重启；替换失败自动还原旧版并启动，应用绝不消失。平台判定支持 `DSH_DESKTOP_PLATFORM` 强制（仅资产选择等纯函数），新增 5 个 macOS 单测（zip/dmg 直选、arm64 架构、分片排序、模板 ASCII 结构、平台判定）
- **设置页「插件」页融合为单一「管理」标签（`dsh-plugin-manager`）**：启动时幂等隐藏官方只读「全部」清单（`applyPluginInventoryTabMergeFix` 过滤 `settings.plugins.tab` 中 id 为 `all` 的条目），管理标签成为唯一插件入口——**搜索框**（按名称/包名/描述过滤）+ **可点击分类标签**（配套插件可开关 / 其他插件可开关 / 核心组件只读，点击过滤、再点取消，各组显示启用/关闭计数）+ **双视图**（简洁：卡片网格——标题+状态圆点+迷你开关，窄屏自动单列；详情：+状态徽章+中文描述）+ 全量 live 清单与本地清单融合（描述取自各插件 package.json）+ **乐观 UI 开关**（点击立即翻转并标记「重启后生效」，写盘失败自动回滚；反复开关不堆积标记注释）。关闭/重新打开写入 web profile `cordis.patch.yml` 的用户层 `disabled` 条目（与 `llm-deepseek` 同款覆盖机制，同一 id 只保留一处，避免 loader 双登记崩溃），完全退出并重启 DSH Desktop 生效。解决「插件看不懂作用、默认启用无法关闭」的社区反馈
- **插件卸载/恢复**：详情视图每行「卸载」按钮（两步确认防误删）。内置配套插件 = 标记卸载（patch 写入 `removed: true`，启动同步器据此跳过文件复制与 manifest 装配，列表「已卸载（可恢复）」分组一键恢复）；第三方插件 = 标记 + 删除 profile 安装目录（不可恢复）；核心组件与带 config 的系统条目（`web`）禁止卸载
- **插件更新检查与手动更新（双下载源）**：工具栏「检查更新」→ 有独立发布源的插件显示「可更新 vX → vY」与「更新」按钮，点击后 下载 → sha512 校验（npm 源）→ 备份旧版 → 解压替换 → 重启生效，失败自动回滚。下载源：npm 官方 `registry.npmjs.org` + 镜像 `registry.npmmirror.com`（自动切换）、GitHub Releases 官方直链 + 加速镜像（`gh-proxy` 系列）；暂列 `dsh-better-sidebar`、`billion-context-dsh`（npm）与 `dsh-side-session`（GitHub）三个有公开发布源的插件，其余第一方插件随应用整体更新（应用更新本身已是 GitHub + Gitee 双源）。启动同步器新增「profile 版本高于安装包版本则保留」，更新后的插件不会被下次启动覆盖回安装包版本
- **插件管理界面打磨**：「可更新」分类标签仅在有可更新项时出现（全部更新完后自动回到「全部」）；工具栏按钮组重排（简洁/详情切换高亮、检查更新为主操作样式、刷新按钮统一）；操作结果提示条、分组标题（组名+说明+计数）与空态框统一样式；修复「已卸载（可恢复）」分类切换导致页面空白的问题（分组标题映射补全 `removed` 键，并对缺失映射做兜底防崩溃）
- **余额栏峰谷计价提醒（dsh-balance）**：对话底部统计栏左侧新增峰谷状态可见提示——高峰时段显示橙色「⛰ 高峰价」，空闲时段显示绿色「🌙 空闲价」，hover 完整说明（高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价；空闲价 = 高峰价的一半）。主进程推送的 `peak` 字段按当前时刻实时判定（`isPeakHour`），本轮费用随时段自动切换单价（高峰全价 / 空闲半价），无需用户手动换算
- **识图插件多模态体感：直接发图/发文件、后台自动识别、识别结果不进对话（dsh-vision）**：输入框工具行新增「📎 添加图片或文件」按钮（外观与官方「/」命令按钮完全一致，也可粘贴/拖放图片），图片按官方附件链路进入草稿并随消息发送；**文本类文件（60+ 扩展名：md/json/csv/ts/日志/配置/脚本…含 Dockerfile/LICENSE 等无扩展名约定名）选入即读取内容、截断后追加进草稿**，发送前可见可编辑，二进制/超限文件明确提示。宿主半边在 `llm/stream` 边界拦截请求中的图片块（比 `agent/pre-step` 更靠后：只改写**送进模型的消息副本**，会话里持久化的仍是原始图片消息），调 VLM 识别后替换为「[图片] 识别结果」文本（多图自动编号 1/N；用户消息文本自动作为识别问题；识别失败/超限/附件异常一律降级为说明文本，绝不阻断对话）——**用户界面始终显示图片卡片，识别文本永不回流对话**，纯文本模型全程只见文本，发图体验与多模态模型一致。识别结果按附件 id 缓存（同图跨轮不重复请求）；`view_image` 工具与自动识别共用同一模型/备用链/超时/降档配置

### 修复
- **内置插件市场 dshmarket 客户端 bundle 未同步 → dsh web 启动失败（MissingClientBundleError）**：配套插件同步的目录清单此前只有 lib/assets/src/dist/node_modules，dshmarket 的客户端构建产物在 `client/`、运行时数据在 `data/`（`exports["../client"]` 声明入口），落盘缺失让 client-modules 装配 fail-loud 直接启动失败。现目录清单补 `client` 与 `data`；`verifyBundleDir` 增加 client 入口校验（声明了 client 入口的 bundle 必须落盘对应文件，缺失按「源缺失」处理不登记），下次启动自动补齐。新增 3 个单测（client 入口存在/缺失/未声明）。

- **dsh web 启动失败（exit 1）：healProfilesModuleFallback 未捕获 ENOENT 崩溃根治**：官方 profile-boot 装配每次 boot 无条件调用 healProfilesModuleFallback(INSTALL_ANCHOR)（BFS 依赖闭包逐包 readFileSync package.json），客户机器上（便携版解压不完整 / 杀软锁定 / 云同步抽风）会 ENOENT 且无保护——main.js 的 repairProfileFallback 只护壳自己的那次调用，挡不住引擎 boot 内部这次 → 启动失败页。profile-boot 防护补丁新增独立 heal 调用防护：调用包 try/catch，失败仅 stderr 告警「continuing boot without fallback healing」，绝不 brick 启动；幂等标记独立于补丁层自愈标记，已打过旧补丁的安装也会补上。新增 3 个单测，unit-profile-bundle-heal 16/16。
- **图片字节信任补丁（修复「仅支持 PNG、JPG、WebP、GIF」却发不出 png）**：官方 attachment-local 严格比对「浏览器声明的 MIME」与「字节解码出的格式」，声明跟随文件扩展名不可信（webp/jpeg 改名 .png 后 file.type 仍是 image/png，字节却是 webp），不一致直接拒发整条消息。本补丁把声明为 image/* 时的媒体类型改为以字节实际格式为准记录，不再拒绝发送；幂等，覆盖内置/profile fallback/agent overlay 三份运行副本，WSL --with-patches 同步生效。新增 2 个变换单测（真实 vendored 文件幂等 + 锚点缺失跳过）。

- **桌面宠物小窗拖动触发主进程半崩溃（启动崩溃日志 `Error processing argument at index 1, conversion failure from`）**：小窗拖拽过程中 pointermove 在捕获/窗口边缘会给出 NaN 屏幕坐标，渲染端直接相加后经 IPC（structured clone 保留 NaN）送达主进程，旧版主进程仅校验入参 `x/y` 为有限数，`getDisplayMatching` 异常/钳制计算产生 NaN 后直接 `petWindow.setPosition(NaN, NaN)`，触发 Electron native 参数转换 TypeError 把 uncaughtException 冒泡到主进程（IPC 处理中断 → 状态损坏 = 半崩溃）。双层根治：① 主进程 `pet:move-to` 全防线（显示器匹配 try/catch + workArea 逐字段有限数校验 + 钳制结果最终校验 + 整体 try/catch 记录警告，任何非法输入静默忽略，绝不再触发 native 参数转换）；② 渲染端 harness-pet 发送前 `Number.isFinite` 四重校验（screenX/screenY/grabOffsetX/grabOffsetY），NaN 直接跳过本次移动等下一个合法事件
- **识图插件升级后重启被回滚（dsh-vision 0.1.0 → 0.2.0）**：启动同步器按「profile 版本 > 安装包版本则保留」判断是否覆盖 profile 副本，此前 dsh-vision 三处（仓库/安装包/profile）版本同为 0.1.0，每次重启都会用安装包内置旧副本覆盖 profile 上的新部署，服务端修复（llm 服务实例 wrap）因此从不生效。版本升为 0.2.0 后 profile 更新版得以保留；仓库、安装副本、profile 三处已同步为同一新版本
- **识图插件发图修复升级：wrap 改挂 llm 服务实例方法（修复「重启后发图仍失败/图片丢失」）**：此前在适配器层 wrap，但 `llm/adapters-updated` 监听缺 `{global:true}`（cordis 事件只沿作用域祖先链冒泡，插件作用域不在 llm 服务祖先链上）+ 初始调用早于 DeepSeek 适配器注册 → wrap 实际从未生效，发图仍被 prompt 入口拦截。现改为 wrap **llm 服务实例的 `resolveModelInfo` 方法**（host prompt 图片门槛的唯一调用点；llm 服务已在 `inject` 中装配，apply 时必然可 wrap，不依赖适配器注册时序；绑定原方法保留 `this`；幂等标记 + 插件卸载时恢复原方法）。同时消除双重污染：adapter wrap 的 `resolveModel` 改为**只记录原生能力、原样返回**（加 `image` 的唯一入口是服务实例 wrap，两处都加会互相污染原生能力判断，误把文本模型当原生多模态透传原图）；`listModels` 仍加 image（仅 UI 一致性）；`llm/adapters-updated` 监听补 `{global:true}` 覆盖热装配。wrap 生效后 host 侧「图片自动转述」兜底自动跳过（inputModalities 已含 image）——界面显示原图卡片、识别文本只进模型。单测更新：服务实例 wrap 7 项（text-only 放行+原生缓存 / 原生多模态透传 / 未声明原样 / `this` 绑定 / 幂等 / restore 恢复 own+原型两种形态 / 无方法安全返回）+ wrapAdapter 语义更新，dsh-vision 单测 40/40
- **客户端自动更新「下载完成后不弹安装 / 更新脚本终端闪一下」**：① 更新脚本启动全程无窗口（`spawn` detached + `stdio: ignore` + `windowsHide`，覆盖安装版 cmd→powershell 与便携版 cmd）；② 残留安装包清理——已处理（安装成功 / 当前版本已不低于待安装版本 / 文件丢失）的待安装标记现在会**连带删除 updates 目录里的过时安装包与 .part 分片**（每包 120+MB），不再让「下载了却从不安装」的旧包永久占用磁盘、误导用户；③ 手动「检查客户端更新」时**优先处理已下载的待安装包**（弹「立即重启」按钮），不再被 24h 静默期挡住——用户主动检查即表明更新意图；④ 端到端脚本级验证：`buildNsisCmd` + `buildNsisPs1` 生成的更新脚本在真实 `cmd /c` 下秒级走完「启动→等待退出→拉起安装器（失败 catch）→兜底恢复」全部分支并逐行写日志，无静默退出（历史「点安装没反应」根因是无控制台进程下控制台程序输出丢失，PR #46 起已用 PowerShell/.NET 流规避）
- **客户端更新 Gitee v0.3.9 旧命名分片无法选择**：`selectAsset` 的分片兜底此前只按 v0.3.9+ 新命名（`win-portable` / `win-setup`）拼 base，而 Gitee 已发布的 v0.3.9 分片仍为旧命名（`DSH-Desktop-<版本>-portable-<arch>.exe.partN` / `DSH-Desktop-Setup-<版本>-<arch>.exe.partN`），导致 GitHub 不可用回退到 Gitee 时，检查成功但下载报「未找到匹配的安装包资产」。现按 新命名 → 旧命名 顺序尝试，安装版与便携版均能正确排序并拼接 Gitee v0.3.9 分片；新增两个旧命名分片单测，并用真实 Gitee release 验证安装版/便携版均选中 3 分片。
- **工具调用兼容修复（code 模式）**：`PTC 模式`（code preset）下 DeepSeek 模型常直接调用 `read`/`grep`/`todo_write` 等原生工具而收到 `UNKNOWN_TOOL`，且 `run_code` 生成的程序调用 `pwsh`/`bash` 时频繁省略仅用于 UI 展示的 `description` 而收到 `INVALID_ARGS`。现启动时幂等补丁：① 官方 `code` preset 的 tool-presentation 由 `code` 改为 `both`——`run_code` 仍可用，原生工具调用也可直接通过；② `dsh-tool-pwsh` / `dsh-tool-bash` 的 `description` 改为可选，缺失时用 command 首行自动生成。补丁覆盖内置副本 / profile fallback / agent overlay（WSL 同步脚本 `--with-patches` 同步生效），锚点失配自动跳过，不修改用户数据。新增 4 个变换单测与真实 vendored 文件幂等验证。

- **工具调用兼容修复 schema 部分撤销（修复「模型操作失败：unsupported JSON schema: parameters.description.required must be true when present」）**：上一轮把 dsh-tool-pwsh / dsh-tool-bash 的 description schema 改为 required: false，但引擎 schema 校验器拒绝非必填 description——preset 挂载直接失败，选模型/发消息报「模型操作失败」。现撤销 schema 改动（恢复 required: true），只保留运行时兜底（缺省 description 时用 command 首行自动生成，该部分不受 schema 校验约束）；transform 会自动回滚已写入的 required: false（幂等标记识别），并导出 OLD/NEW 常量供单测做「还原后断言」；新增回滚单测，unit-patch-engine 22/22。

- **识图插件发图降级「附件存储服务不可用」（dsh-vision 0.2.1）**：cordis 上下文的服务属性访问有 inject 检查（Proxy trap：cannot get property `attachments` without inject），此前 dsh-vision 未声明该 inject，用 try/catch 可选访问把错误吞成 undefined——每次发图都降级为「附件存储服务不可用（已跳过该图片）」文本进模型，图片识别从不生效。现 inject 显式声明 attachments（宿主 prompt 入口的 saveImage 依赖同一服务，装配时必然可用），apply 直接访问 ctx.attachments；发图识别恢复正常。版本升 0.2.1（仓库/安装副本/web profile 三处同步），重启 DSH Desktop 生效。
- **侧边临时会话大日志解析风暴 → 聊天响应偶发延迟**（dsh-side-session v0.2.4）：面板展开时每 2s 轮询会对整个会话日志做全量 zstd 解压+逐行解析（实测 7MB 压缩 ≈ 20MB 文本 ≈ **600ms 同步阻塞**），会话进行中 mtime 持续变化导致反复全量解析，与聊天请求同进程排队。改为**增量解析**（只解自上次帧边界以来的新帧并累计，结果与全量解析逐字节等价；文件整体替换自动回退全量）+ 客户端**全量拉取 4s 节流**（切换会话立即拉取）。新增 6 个增量/全量等价性单测
- **侧边临时会话升级 v0.2.5（合入上游更新）**：左侧栏图标对齐、浮窗展开/收起动画档位（0/300/500/800/1200ms，默认 500）、输入框与发送按钮样式与主会话同款、移除「停止回答」按钮；服务端**热重载自愈**（`settings.registrations.delete(NS)` + 路由重注册，开发热重载后不再残留重复注册）。保留本地增量解析与 4s 拉取节流。版本号定为 0.2.5 与上游 0.2.4 区分
- **桌面宠物默认关闭（插件级）**：harness-pet 常驻 canvas 逐帧绘制在软渲染/流式输出下持续占用主进程，且旧版保存的开关值会覆盖客户端默认关闭。现启动同步时幂等写入 profile patch `- id: harness-pet\n  disabled: true`（一票否决任何已保存状态），需要时在 设置 → 插件 → 管理 一键开启
- **更新后桌面快捷方式消失**：安装版（NSIS）此前依赖安装器创建桌面快捷方式，壳层只在便携版下补建——安装版更新（向导取消勾选创建 / 旧版卸载清理 / 手动覆盖安装目录）后桌面快捷方式缺失且永远不会自愈。现壳层对**安装版与便携版一致**地「缺失即补建」规范名 `DSH Desktop.lnk`（去重逻辑先行，桌面上至多保留一个，不会复现旧版「每次启动生成多个快捷方式」），并修复快捷方式指向被移动/更新后的 exe。另给 `maintainShortcuts` 加 `DSH_DESKTOP_TEST=1` 显式守卫：集成测试（dev electron 以文件路径启动时 `app.isPackaged` 也为 true）不再把用户真实快捷方式改指向测试用 electron.exe
- **profile bundle 缺失 / 损坏导致 dsh web 启动失败（退出码 1）根治 + 重启丢插件数据恢复（issue #48）**：dsh 官方装配对 `dsh.profile.bundles` fail-loud——登记了未安装的插件抛 `cannot resolve profile bundle`、普通库或仅客户端 bundle 被登记抛 `declares no dsh.bundle`、bundle 的 `cordis.patch.yml` 损坏抛 `failed to parse overlay`、profile `package.json` 损坏直接抛 JSON 错误、家级 `cordis.patch.yml` 损坏抛 `failed to parse patches`——任一命中桌面端永久无法启动。四层修复：
  - **启动防护**（`applyProfileBundleGuard`，幂等运行时补丁，dsh 更新后自动重打）：改写 `@deepseek-ai/dsh-app-boot` 的 `loadProfile`——bundle 层逐个跳过并写带修复指引的 stderr 诊断；profile manifest 损坏则备份 `.broken-<ts>` 后按出厂模板重建；改写 dsh `profile-boot` 装配——家级补丁层与 profile 补丁层损坏时备份 + 重置为空列表（同时覆盖启动与 HMR 热重载路径）。用户数据只备份不删除，重装插件即恢复。
  - **写盘侧防呆**：配套插件同步在 bundle 落盘后校验「补丁层 + 入口文件」存在才登记进 manifest（`billion-context-dsh` 上游缺 `dist` 构建产物时不再登记，杜绝整棵插件树加载失败）；profile manifest 损坏时先备份原文再重建；manifest 写入全部原子化（消除写盘撕裂这一损坏来源）。
  - **用户插件数据恢复**（issue #48）：manifest 损坏被重置后，用户手动安装的第三方 bundle 仍实际落在 profile node_modules 里——启动自愈会扫描、校验并把它们合并回 manifest（`bundles` + `dependencies`），用户插件照常装配；普通依赖与损坏包不恢复登记。同时弹「配置自愈」系统通知（集成测试态抑制），不再静默。
  - **启动前健康检查**：`dsh web` 启动前把每个 bundles 条目的装配状态落到 `desktop.log`（缺失 / 未声明 / 补丁层缺失一目了然），`dsh-web.log` 保留完整 stderr 诊断。
  变换与恢复逻辑收口为纯模块 `profile-bundle-heal.js`（`node --test` 单测 13 项 + 7 个新集成场景：heal-missing-bundle / heal-manifestless-bundle / heal-broken-manifest / heal-broken-manifest-recovers / heal-broken-home-patch / heal-broken-bundle-patch / companion-bundle-invariant）。
- **宠物插件流式输出期间界面卡死（「半崩溃」）根治**：dsh 客户端运行时对会话快照按帧合并推送（`Notifier.markFrameDirty` 每帧至多一次，长回复/工具调用期间持续触发），harness-pet 每次快照都跑完整状态映射 + 6 处 DOM 写入 + 320×320 canvas 整幅重绘 + 强制 reflow（`offsetWidth/offsetHeight`），软渲染/低配机上渲染进程主线程饱和。三处修复：① 快照 listener 120ms 节流 + trailing 合并（流式期间每 ~120ms 处理一次最新快照，60Hz 输入实测降到 ~8Hz，不丢尾）；② `setStatus` 内容相等早退（状态/标题/回复都没变时跳过全部 DOM 写与重绘，静态期零开销）；③ `updateStatus` 的同步 `render()` 改为仅在动画循环未运行（关闭/减少动态效果）时绘制，消除 rAF 动画与快照重绘的双绘制源
- **运行时补丁引擎与配套插件同步统一收口（PR #51）**：12 个运行时补丁（闪跳修复 / 设置暴露 / 识图密钥 / profile bundle 防护 / workspace 搜索栏 / 插件页标签合并 / web-search baseURL / menu 视口 / 会话管理）与配套插件同步（清理 / 复制 / bundle 登记 / patch 条目注册 / 默认禁用）收口为 `scripts/lib/` 单一实现（patch-io / patch-engine / companion-plugins / companion-profile / runtime-patches），main.js 与 `sync-companion-plugins.js` 共用同一数据源，杜绝两处实现逐步漂移；WSL·overlay 覆盖缺口补齐（识图 / web-search / menu / 会话删除 / 插件页标签在 WSL 更新分支同样应用）；`dshDesktop.appVersion` 回填与菜单 IPC 防未处理拒绝；补丁候选路径构造器新增单测逐项断言；同步收口时保留插件卸载标记（removedIds）与「profile 版本高于安装包则保留」的更新版本防覆盖。
- **壳层技术债清理（PR #55）**：版本比较收口为 `scripts/lib/versions.js` 全仓唯一实现（消除双实现语义漂移）；补丁引擎与原子写加固——并发临时名（pid+时间戳+序号）、`readFileCached` TOCTOU（读前读后 stat）、CRLF 锚点兼容、`transformExposeFix` 尾逗号不重复、卸载标记正则转义契约；WSL 托管后端探测异步化 + 输出解码修复 + 配置错误自动回落本地后端（issue #54，新增 `wsl-broken-fallback` 集成场景）；自更新链路（下载完整性校验 / 失败清理分片 / 整体截止时间 / 首刻挂 error 监听）、恢复链路（nextAction 注入 / attach 幂等 / 窗口销毁清定时器）与看门狗（spawn 失败不计额度 / run-state.json 原子写）缺陷根治；会话监视 / 档案自愈 / 余额模块收口（`scanZstdFrames` 三副本统一到 session-watcher、`bundleEntryOf` 只返回字符串、`readActiveModel` 锚定 agent-default-model 段）；移除 M3 主题过时部署链（4 个安装脚本 + 3 个资产 + 设计稿）与 preload 死 API；IPC 鉴权按 origin 精确比较、启动竞态与通知引用治理。新增 unit-wsl-backend(11) / unit-patch-io(5) / unit-balance(4) 单测。
- **插件中枢 dsh-hub（ARFCON/dsh-hub-DSH v1.1.2，内置）**：设置页新增「插件中枢」页签，整合四块能力——① **插件更新引擎**：已装插件版本对比（npm registry / GitHub release/tag）、一键更新与批量更新、sha512 校验 + 备份回滚、启动自检自动修复（损坏的 package.json / cordis.patch.yml 原子写恢复）；② **全局记忆**：5 个 `memory_*` 工具（save / search / list / get / delete），JSONL 存储 `~/.dsh/memory/memories.jsonl`；③ **graph-memory 挂载**：检测到 `plugin-src/graph-memory` 源码自动装配（profile bundles + link + junction，幂等），设置页展示记忆库统计（节点/边/社区）；④ **dsh-market 联动**与**自身更新检查**（raw.githubusercontent + jsDelivr + ghfast.top 多源）。原生适配 Gitee 版 DSH Desktop：客户端最新版本对比走 GitHub + Gitee 双源（与客户端同款「取最高版本」语义），国内用户可直接打开 Gitee 发布页下载。
- **内置 dsh-hub 插件两处修复**（对齐 ARFCON/dsh-hub-DSH 生态）：插件卸载时先解析 entry id 再删 insert 行（此前先删行后查 id 永远查不到），避免 disable 块残留孤儿条目；客户端安装目录候选增加常见自定义路径（`D:\app\dsh\DSH Desktop`），使「DSH Desktop 客户端」检查与客户端插件更新在自定义安装位置生效。
- **余额栏消失（ReferenceError: parts is not defined）**：dsh-balance 客户端在对话底部统计栏渲染余额/费用 dock 时引用了已不存在的 `parts` 变量（组件重写把列表变量改名为 `items`/`joined` 时漏改一处）——组件渲染即抛异常，整个余额 dock 静默消失。已改回 `joined.join(" · ")` 并同步到安装副本与 web profile，重启应用即恢复。
- **余额 dock 左侧显示「Object」**：修复上一处后 dock 恢复显示，但峰谷提示 chip（`peakChip`，React 元素）与文本一起经 `joined.join(" · ")` 拼接——数组 `join` 会把 React 元素 `toString` 成 `[object Object]`，于是 dock 最左侧出现一个「Object」。现 dock 的 `children` 直接传数组（React 原生渲染元素 + 字符串分隔符），高峰/空闲提示正常显示「⛰ 高峰价 / 🌙 空闲价」。
- **本轮费用估算：未知模型按低价档计费**：`effectivePrice` 对价格表外的模型名（如 `deepseek-v4-max`）此前回退到 `deepseek-v4-flash`（低价档），与「未知模型按高单价估算、避免少报费用」的注释意图相反——现回退到 `deepseek-v4-pro`（最高档）。同时核对计费口径与官方公告一致：输入未命中（含缓存写入）按未命中价、输入缓存命中按命中价、输出按输出价；高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价（v4-flash 未命中 3.0 / 命中 0.10 / 输出 9.0，v4-pro 未命中 9.0 / 命中 0.30 / 输出 27.0，¥/百万 token），空闲 = 高峰一半，2026-08-17 00:00（北京时间）起生效。
- **点击系统通知回到应用前台**：所有系统通知（任务完成 / 崩溃自愈恢复 / 安全模式 / 配置自愈 / 渲染进程恢复）统一支持点击回到应用——`showNotification` 默认给通知挂 `onClick → showMainWindow()`（覆盖最小化、隐藏、关闭到托盘、窗口销毁后重建等全部恢复路径），调用方无需各自实现；任务完成通知的旧实现（仅 restore+show+focus，窗口销毁场景会失效）改为走统一默认。Windows toast 点击激活依赖的 `AppUserModelID`（`com.deepseek.dsh.desktop`）与开始菜单/桌面快捷方式同 id 创建已就绪，点击 toast 即恢复窗口到前台。
- **核心运行时健壮性加固（PR #56）**：① 更新流程守卫竞态根治——`runUpdateFlow` / `runClientUpdateFlow` 的 busy 标志改为入口同步置位 + 全程 try/finally 复位（此前在 checkLatest 网络请求与版本对话框之后才置位，自动更新定时器与手动触发可并发通过守卫，双 npm 安装互踩 staging 会损坏 agent）；② 预览路径围栏本地 DoS 根治——`isUnderFileRoots` 缓存 miss 强制失效改为冷却窗口（至多每 5s 一次强制刷新），浏览器恶意页面无法再通过无效预览请求放大为 sessions 全目录遍历 + 逐文件 zstd 解压的 CPU/IO 攻击；③ 服务启动写流泄漏——`watchServerProc` 的 dsh-web.log 写流 spawn error 路径不再泄漏 fd（幂等 `endOut` 在 error/exit 统一收口，stderr 写入包 try，不再冒泡 uncaughtException）；④ 服务就绪行处理提前退出——`onData` settle 后立即 return，同 chunk 第二行 URL 不再 killTree 刚就绪的服务；⑤ `killTree` 的 taskkill spawn 挂 error 监听并收敛到幂等 finish；⑥ 余额估算回退档位统一——`effectivePrice` 峰谷期与旧版固定价期均回退 `deepseek-v4-pro`，移除死代码 `FALLBACK_PRICES`，补齐旧版期未知模型断言。
- **客户端更新分片选择与合并校验加固（自动更新 review）**：① `selectAsset` 分片集增加**序号连续性校验**（必须从 `.part1` 连续到 `.partN`）——此前缺失中间分片（如只有 part1+part3）仍会照常选择并拼接，产出损坏安装包；单靠下载后 64MB 下限兜底存在漏网窗口（仅缺尾部小块时拼接结果仍超下限被放行，安装器失败后用户会看到「下载了却从不弹安装」）。现不连续的分片集直接拒绝，宁可用下一个命名候选或报错，也不拼坏包；② 分片合并后**大小与上游声明严格一致校验**（每片已按 content-length 完整性校验，不一致只可能是分片集不完整）——不一致即删除并抛错，下一轮自动更新会重试，不再把残缺包标记为「已下载待安装」。新增 2 个分片连续性单测。
- **设置页「插件」分区新增「诊断与管理」标签页**：原插件管理页内嵌的诊断/备份恢复面板整体迁入该标签，并新增三项维护能力——① **一键导出诊断日志包**：诊断报告 + 桌面/Web 日志尾部聚合 + 崩溃转储元信息 + 环境信息，打码 home/userData 路径后存为单个 JSON（本地操作不上传）；② **防砖体检**：逐个检查已装配插件的 dsh 清单、补丁入口可解析性与跨包 loader 条目 id 冲突（重复 id 会在下次启动触发 `duplicate loader entry id` 失败，提前标红）；③ **Bundle 顺序检测与重排**：读取声明规则（`dsh.bundle.order.before/after`）与插件依赖，LOOT 式拓扑排序给出建议顺序，一键写回 profile `package.json`（官方内置 bundle 保持原位、原子写），重启生效
- **诊断与管理安全加固**（专业测试流程产出）：恢复路径拒绝含 `node_modules` 段（junction/symlink 装配点）与符号链接逃逸（realpath 包含性校验，恶意备份无法经 junction 写穿到根外）；诊断日志包脱敏移至序列化前深度掩码（Windows 反斜杠转义导致的静默失效修复，掩码集含 userData/home/安装目录）；IPC 鉴权改 origin 相等比较（防 userinfo 技巧绕过前缀匹配）；恢复/顺序写回加主进程互斥；非 UTF-8 文本按 base64 原字节备份还原（GBK 等不再乱码损坏）；恢复输入 >4MB 拒绝；备份元数据不再记录本机绝对路径
- **启动自愈：bundle 契约缺失自动修复 + 防砖体系升级**（针对 `Error: dsh: profile bundle "X" declares no dsh.bundle in its package.json` 启动崩溃，loadProfile fail-loud）：① **启动自愈**——boot 失败时识别 `dsh-web.log` 的第四种 loader 失败形态（`profile bundle "X" declares no dsh.bundle`，`parseFailedLoaderIds` 扩展），经文件系统二次确认（须在 `dsh.profile.bundles` 清单内、包目录存在但缺 `dsh.bundle.patch` 声明，绝不触碰 `@deepseek-ai/*`）后备份 manifest 并移出启动栈，依赖包仍保留以兼容纯客户端插件，随后自动重试启动并弹窗通知；② **防砖体检升级**——启动清单内缺 `dsh.bundle.patch` 声明的包由 warning 升级为 error（真实 fail-loud 必挂，提前标红），新增「一键移除失效条目」按钮（两步确认，备份后原子写回 bundles，重启生效）；覆盖条目（`disabled`/config/定向 insert）不再误计为 loader 注册，消除「默认禁用条目 vs 包注册」的假跨包冲突；③ **启用前契约校验**——zat-dsh-engine 启用插件（setEnabled）前检查包是否声明 `dsh.bundle.patch`，缺声明或不可读直接拒绝并给出修复指引，杜绝「启用即踩雷」。**自愈主路径升级为不依赖日志的 manifest 直扫**（`scanBundleContracts`：直接遍历 `dsh.profile.bundles` 二次确认声明，日志轮转/截断/编码异常时仍能发现坏条目，日志形态保留为兜底）；**启用校验补 patch 文件存在检查**（声明存在但补丁文件缺失同样阻止启用）。
- **启动自愈链路修复与提示增强**：修复安全 overlay / 自愈重试必败的根因——`web` 子命令遇到 `--host` 等应用参数后会透传剩余参数，此前 `--patch` 拼在这些参数之后而未被启动器解析；现将 overlay 参数放在 `web` 之后、应用参数之前。自愈成功后追加模态提示框（系统通知之外的双保险），明确说明已移出启动栈/禁用哪些插件、配置已备份、无需操作。
- **诊断报告展示「最近启动自愈」记录**：每次自愈动作（自动移除/禁用坏插件）写入 `userData/self-heal-history.json`（保留最近 5 条），随诊断报告带回并在「诊断与管理」报告顶部以蓝色信息条持久展示（模态框/通知是一次性的，这里提供事后回看）；进入「诊断与管理」标签页自动运行一次诊断，报告立即可见；修复前端取值层级错误（自愈数据在 `report.sections.selfHeal`，此前误读 `report.selfHeal` 导致蓝条永不显示）

## [0.3.9] — 2026-08-16

### 新增
- **对话删除与归档管理（dsh-session-manager 内置插件）**：dsh 官方只有归档没有删除，现补齐：
  - 会话行 ⋯ 菜单「归档会话」下方新增「删除对话」（**所有会话行均显示**，含当前会话）：确认后经宿主 RPC 删除会话日志与附件（**正在运行**的会话被拒绝），列表经官方 host 帧实时移除；
  - 设置 →「归档对话管理」面板：列出全部已归档对话（标题/项目/更新时间），每条提供「恢复」（回到原工作区与顺序，经 `workspace.unarchiveSession` 持久化并实时广播）与「删除」；
  - 实现：`scripts/patch-session-manage.js` 对官方包做幂等运行时/打包补丁（`dsh-workspace` WorkspaceRegistry.unarchiveSession；`dsh-session` Sessions.remove——从 live 注册表摘除、优雅 flush 后释放并广播 session/disposed；`dsh-host-apiproxy` 新增 workspace.unarchiveSession / workspace.deleteSession RPC——删除先查 agent 运行状态表（agent/status 事件维护，仅拒绝真正运行中的会话），再按 jsonl 布局移除 `<DSH_HOME>/sessions/<project>/<id>/`、摘除 live 会话、清理归档集并广播；`dsh-client-connection` API 面与 unary 响应 schema；`dsh-client-ui-workspace` 菜单项与中英文案）；`assets/plugins/dsh-session-manager`（bundle，设置面板 + `window.__dshSessionManager` 桥），启动/打包三路覆盖（dev / afterPack / 运行时），dev node_modules 已实测应用
  - 端到端集成场景 `session-delete-flow`：真实 RPC 链路验证 创建→归档→恢复→再归档→删除（目录消失 + 归档集清理）→空闲 live 会话摘除删除
- **对话节点导航条（dsh-navbar，vlln/dsh-navbar，MIT）内置**：对话区右缘节点串快速跳转 user 消息（悬停预览 6 行截断 / 点击平滑跳转 + 品牌蓝高亮 / 连续悬停与滚轮切换 / >11 节点自动滑动窗口 / <2 条 user 消息自动隐藏 / 消息精选 pin 按会话持久化），实现 dsh-external/issues#144 规格，纯浏览器端 bundle（`assets/plugins/dsh-navbar`，含 LICENSE 与预编译 lib）。**取代** `dsh-conversation-tweaks` 内置的会话右侧导航滑轨（dct-rail 已移除），conversation-tweaks 保留「隐藏对话输出」；`sync-companion-plugins.js` 的插件清单与 `lib/index.mjs` 复制规则同步补齐（该清单此前与 main.js 漂移，缺 better-sidebar / harness-pet，已对齐）
- **侧边临时会话（dsh-side-session，hzhz314159/dsh-side-session，MIT）内置**：基于当前主会话上下文在独立浮窗发起临时追问（答案不写入主会话）；💬 图标 / `Ctrl+Shift+S` 唤起；三种回答引擎（全局 Key / 插件 Key / 宿主 LLM）；zstd 帧扫描自动捕获上下文（含截断护栏）；bundle 随桌面端分发并自动同步。**内置版本升级至 v0.2.3**：纯浮窗形态（头部拖拽移动 + 右下角缩放）、上下文长度三档（标准/加长/完整，设置面板「确定」应用）、meta 指纹轻量轮询（2s 心跳仅对比计数指纹，变化才拉全量）、`/side-session` 斜杠命令、mode3 走宿主 `ctx.llm.stream`（不读任何 key）
- **主动上下文压缩（billion-context-dsh，Tyan66666/billion-context-dsh，MIT）内置**：模型驱动的上下文压缩后端（ACP，内核 acp-kernel 复用）——由模型决定何时压缩、压缩什么，替代自动摘要式压缩；`compress`/`decompress`/`search_context`/`acp_status` 四工具 + `/acp` 命令，自动策略只 nudge 不强制。bundle 随桌面端分发（含 dist 与私有依赖 acp-kernel，同步逻辑补齐 `dist`/`node_modules` 目录），启动时自动同步进 web profile 并幂等写入 `compaction-basic` 禁用条目（同一 realm 仅保留一个压缩后端）
- **余额面板并行展示 OpenCode Go 订阅额度**：5 小时滚动 / 每周 / 每月用量百分比（percent=已用比例），查询失败不影响主余额展示

### 修复
- **客户端更新「能下载但无法更新」闭环修复**：① 点击「立即重启」后不再提前清掉 `pendingClientUpdate`，只写入含下载包路径的 `clientUpdateAttempt`；安装器失败/被取消时，下次启动会真正进入「客户端更新未完成」重试流程（旧实现把待安装标记清掉，重试对话框永远不出现，用户只能重新下载）；② NSIS 更新脚本只在安装成功且新版本已启动后删除安装包，失败/取消时保留安装包供重试，并以退出码 0 判定成功（取消不再被误判为成功）；③ 便携版替换脚本对 `NEW→OLD` 复制失败增加 12 次退避重试（吸收杀软扫描锁定），等待/替换失败时用写入探针区分「目录只读」与「文件仍被占用」：只读目录直接降级为启动新 exe，可写目录用 `.bak` 还原当前版本；④ `downloadFile` 监听 `aborted/error`，服务器中途断开时立即报错而非无限转圈。新增 `scripts/test/unit-client-updater.test.js`（纯函数单测，无需网络）
- **更新进度窗口阻塞整个应用**：`showUpdateWindow` 去掉 `modal/parent` 并改为 `minimizable: true`，下载期间主窗口可继续点击、最小化，进度窗自身也可最小化或关闭（关闭不取消后台更新/下载）；「更新完成/下载完成」对话框弹出前先关闭进度窗，避免窗口叠层导致确认框无法显示。`assets/updating.html` 文案同步说明后台继续
- **集成测试模式抑制对话框弹窗**：`showBox` 在 `DSH_DESKTOP_TEST=1` 时不再弹真实对话框（测试实例与正在使用的桌面端并存时，失败的测试会在用户屏幕上弹出「启动失败」窗），改为记录日志并按取消键处理（boot 失败 → 快速退出让场景明确失败）
- **存量坏 profile manifest 不自愈 → 启动必失败**（issue #16，PR #21）：旧版本（0.3.3/0.3.4）写坏的 `profiles/web/package.json` 中 `dsh.profile.bundles` 只有配套 bundle、缺少核心 bundles（`@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`），核心服务无人提供，插件树永久 `N entries did not activate`。`syncCompanionPlugins` 现在对已存在的 manifest 做「校验 + 补齐」：把缺失且实测可解析的核心 bundles 补到列表最前，其余条目（含用户添加的）原样保留；健康 manifest 零写入（幂等）。核心逻辑抽为 `profile-manifest.js`（纯函数，含 `node --test` 单测 + 集成场景 `heal-stale-manifest`）
- **profile patch 同 id 重复注册 → 插件树崩溃**（issue #17，PR #24）：旧版本插件安装向 `cordis.patch.yml` 写入重复的 `- insert: - id: X` 块（或插件升级为 bundle 后 patch 残留行），cordis loader 抛 `duplicate loader entry id: X` 且永远无法自愈。新增 `profile-patch-heal.js`：启动时块级按 id 去重（保留首个、备份原文件）、把已升级为 bundle 的插件残留注册从 patch 层移除（`dropBlocksByIds`），并支持从 `dsh-web.log` 解析三种 loader 失败形态（hash / duplicate-id / 括号包名）映射回 patch 条目。含 `node --test` 单测 + 集成场景 `heal-dup-patch` / `heal-bundle-patch`
- **web-search「接口地址」填第三方地址仍被拼 `/messages` 按 Anthropic 协议请求 → 404**（issue #20，PR #22）：`dsh-web-search-deepseek` 的 baseURL 拼接归一化（尾斜杠不产生双斜杠；基址已含 `/messages` 不再重复拼接），HTTP 失败信息附上实际请求地址与协议契约指引（裸 404 变可自解的提示），设置页中英文文案明确「POST <基址>/messages」契约。补丁本体在 `scripts/patch-web-search-baseurl.js`（打包补丁与运行时补丁共用同一实现，覆盖内置副本 / profile fallback / agent overlay），含 `node --test` 单测（含本地 mock 服务的真实 HTTP 回归）与集成场景 `web-search-patch`
- **客户端自更新在中文 Windows 上解析失败**（`apply-update.ps1` 报 `Unexpected token '}'`，issue #23，PR #25）：更新脚本改为带 UTF-8 BOM 写出，Windows PowerShell 5.1 不再按系统 ANSI 代码页（GBK）误读中文注释导致换行符被吞、语法乱码；`buildNsisPs1()` 模板注释同步 ASCII 化，脚本在任何代码页与换行风格下均安全
- **桌面版默认启用硬件加速，修复软件渲染掉帧**（issue #26，PR #28）：移除无条件 `app.disableHardwareAcceleration()`（软件渲染导致 GPU 进程空转 ~40-60% 单核、设置页等整页重绘明显掉帧）。改为：默认硬件加速；仅当 `settings.json` 标记 `hardwareAcceleration:'off'` 时禁用；GPU 进程 60 秒内连续崩溃 3 次（`gpu-process-crashed` / `child-process-gone` 双事件去重）自动持久化降级标记并重启应用，保留崩溃日志与自恢复兜底。降级逻辑抽为 `scripts/gpu-crash-guard.js`（含 `node --test` 单测）
- **M3 主题管理器设置观察器防抖**（issue #26 附加项）：`assets/themes/m3-theme-manager.js` 的 `MutationObserver` 不再每批 DOM 变更都执行全文档 `querySelector`，改为 300ms 防抖（与 preload.js 中同功能实现对齐）
- **M3 主题全局过渡拖慢整页**（issue #26 附加项）：`body[data-m3-theme="m3"] * { transition-duration }` 默认 `transition-property: all`，每个元素的所有属性变化（含布局开销最高的 width/height/transform）都被动画化，M3 模式下掉帧显著。收窄为颜色类属性（背景/文字/边框/阴影/透明度/transform），保留主题切换的平滑变色意图，几何变化不再动画
- **WSL 模式「模式列表」比 local 少**（PR #29）：WSL 托管后端经 npm 安装的 dsh 是干净包，不含壳内置的 8 个 Agent 预设。`main.js` 在 WSL bootstrap 与更新后会经 UNC 把 `assets/agent-presets` 写入 WSL agent 包的 `config/agent-presets`；`scripts/sync-companion-plugins.js` 也自动同步预设（可 `--dsh-package <目录>` 显式指定）
- **本地模式 agent 更新后丢失壳内置 Agent 预设**：`updater.applyUpdate` 全新安装的 overlay 也是干净 npm 包，8 个壳内置预设同样缺失（WSL 同族问题的 local 半边）。新增 `syncLocalAgentPresets()`：启动与更新后把预设幂等补进「当前生效」的 dsh 包（overlay 优先，否则内置），三种布局（内置 / 更新 overlay / WSL）模式列表一致
- **识图 view_image 三个根因修复**（issue #33，PR #31 + #32）：① 旧模型（`glm-4v-flash` / `glm-4.1v-thinking-flash`）钳制 `maxTokens ≤ 1024` 并对 400 自动降档 1024 重试一次，400 code 1210 不再直接失败且 fallback 链持续生效；② 设置页保存不再把「等于插件默认值」的字段写进 `settings.yaml`（避免旧模型 maxTokens 2048 被写死固化）；③ `role('secret')` 的 apiKey 永不回显，留空 = 保持已存密钥，仅非空输入才写入（修复「改模型/地址后保存会静默清空密钥」）。新增 `scripts/verify-vision-upgrade.js` 交付前识图链路验证（插件完整性 / patch 唯一性 / 配置与模型上限兼容）
- **余额欠费误报「API key is invalid」**：第三方 provider（opencode 等）余额不足返回 401 + CreditsError 时被 `dsh-llm-pi-ai` 一律判 AUTH。新增 `scripts/patch-pi-ai-credits.js` 把余额判定前置到 401-AUTH 之前：欠费 → QUOTA（客户端显示真实原因），真 key 无效仍判 AUTH
- **便携版「有进程无窗口 / 双击无反应」**（issue #30）：① 便携版数据目录重定向提前到单实例锁校验之前——Electron 实例锁以 userData 为键，旧实现与安装版共用 `%APPDATA%\DSH Desktop` 锁，安装版在跑时双击便携版会静默退出；② 主进程启动期兜底：任何模块级 / 启动早期未捕获异常落盘 `<userData>/logs/startup-crash.log` 并在启动完成前弹可见错误框，杜绝静默失败
- **桌面版关闭到托盘后无法重新打开 / 桌面重复快捷方式**（用户反馈）：① `showMainWindow()` 防御性强化——窗口被销毁/未创建时重建主窗并加载 Web UI，隐藏/最小化时 restore+show+置顶聚焦；托盘左键/双击、`second-instance`（再次双击桌面图标）统一走该恢复路径并记录日志（此前托盘左键采用「可见则隐藏」双态逻辑，隐藏态误判会导致点按无反应；second-instance 对异常窗口状态无兜底）；② `maintainShortcuts()` 增加**快捷方式去重**——每次启动清理桌面与开始菜单中规范名（`DSH Desktop.lnk`）之外的同族快捷方式（Windows 自动重命名副本 `(1)`、手动“发送到桌面”副本、旧版残留），只保留一个；**安装版不再由壳层自动创建桌面快捷方式**（由 NSIS 安装器负责），仅便携版维护桌面快捷方式，消除「每次启动自动生成多个快捷方式」；标题栏 ⋯ 菜单与托盘菜单原有的「退出」「关闭时最小化到托盘」开关保持可用
- **打包前语法门覆盖补丁/自愈模块**：`scripts/check-syntax.js` 的入口清单并入 `profile-manifest.js` / `profile-patch-heal.js` / `patch-web-search-baseurl.js` / `gpu-crash-guard.js` / `install-minimal-win-preset.js` / `patch-deps.js` / `patch-pi-ai-credits.js` / `sync-companion-plugins.js` / `after-pack.js` / `patch-portable-template.js`，此类模块的语法/「async 与声明被拆开」问题在打包前即可拦截
- **启动提速**（PR #39）：① `repairProfileFallback` 增加健康快照（`profile-fallback-cache.json`，含 dsh 包签名）——依赖闭包未变、链接逐项校验通过时跳过耗时的 `import('dsh-app-boot')` + BFS + heal；dsh 升级后签名失效自动重算；② 配套插件同步（vendor 依赖与 lib/assets/src 递归目录、固定文件清单）逐文件比对 size+mtime，一致跳过写盘（复制改用 `preserveTimestamps`，确保二次启动命中跳过）；③ loading 窗口提前到启动最前段创建，用户第一时间看到「正在启动」，并同步提前装配渲染进程自恢复与挂起心跳（loading 阶段崩溃/挂起也有兜底）
- **router flash 等重负载场景掉帧 / 周期性假死**（issue #34）：① `harness-pet` 默认改为关闭（opt-in，设置卡可开启），且关闭时完全停掉 rAF 动画循环（此前隐藏状态下仍逐帧绘制 320x320 canvas）；② `dsh-conversation-tweaks` 会话滑轨的 MutationObserver 不再每 250ms 全量 `querySelectorAll + getBoundingClientRect`，改为仅在内容尺寸真实变化时重算标记位置；③ 修复 `syncCompanionPlugins` 自愈死循环——bundle 插件源缺失时不再被当普通插件写回 `cordis.patch.yml`（此前会注册不存在的包导致 dsh web 启动崩溃），并从 manifest bundles 移除（视为用户禁用）、清理 patch 残留注册（用户手写 config/disabled 覆盖条目保留）
- **Agent 预设很多时「上面的不显示」**（issue #36）：`dsh-client-ui-primitives` 的 Menu portal 弹层在条目超过视口时没有高度上限，`place()` 把整列推到视口上方、顶部条目被裁掉且无法触达。新增 `scripts/patch-menu-viewport.js`：portal 列表加 `max-height: min(calc(100vh - 24px), 560px)` + `overflow-y: auto`，y 夹紧按封顶后高度计算，任何视口高度下完整可用（打包 afterPack / 启动运行时 / dev node_modules 三路覆盖，含 `node --test` 单测）
- **第三方模型思考强度**（issue #37）：功能已就绪（`dsh-third-party-thinking` 默认关闭、可对支持的 provider 开启并把档位注入请求体）；设置页「请求字段名」提示补充 opencode-go 套餐内 DeepSeek Flash/Pro 的开启说明
- **桌面宠物原生置顶小窗**（harness-pet「主窗最小化后宠物消失」根治）：插件自带 Document PiP 独立窗口在 Electron 中不可用（`requestWindow` 抛 `Internal error: no window`）。改为主进程原生方案：  - `main.js`：新增 360×420 无边框透明置顶（screen-saver）不进任务栏的宠物小窗（与主窗共享分区/localStorage），位置经 `userData/pet-window.json` 持久化（跨屏校验 + 钳制回可视区，拖动 400ms 防抖保存）；IPC 双端契约：`chrome:pet-window`（open/toggle/state，校验主窗来源）、`pet:close`、`pet:move-to`（绝对目标位置，至少露出 80px）、`pet:set-auto-open`；主窗最小化且插件开启「最小化自动显示小窗」时自动弹出；before-quit 清理；复用 `guardWebContents` 与 `recovery.attach`
  - `preload.js`：`--dsh-pet=1` 模式检测 → 注入 `window.__DSH_PET__`、隐藏除宠物根节点外的全部界面、跳过自绘标题栏；桥接 `dshDesktop.petWindow`（open/toggle/isOpen/close/moveTo/setAutoOpen）；主进程 `pet:state` 转发为页面事件 `dsh-pet-state`
  - `harness-pet` 插件：原生桥优先（浏览器仍回退 PiP）；小窗布局（宠物贴底居中、气泡锚定鲸鱼正上方随大小自适应、齿轮右下角、面板内嵌）；双宠物互斥（小窗打开时主窗宠物/气泡/齿轮隐藏，含刷新后状态查询恢复，`applySettings`/`setDialogVisible` 共用可见性表达式）；拖动（小窗 = 绝对定位搬窗无抖动、主窗 = 取整落位）；朝向只越水平中线才调转（主窗视口中线 / 小窗屏幕中线）；会话跟随（共享 localStorage + storage 事件 + `sessions.open`）；新设置项 `autoDesktop`（最小化自动显示小窗，默认开）/ `sound`（状态跃迁 Web Audio 合成提示音：等待输入/任务完成，仅主窗、仅跃迁响一声、首状态不响）/ `labelSize`（提示文本字号 10–26px 默认 15px，四语言文案齐全）；提示文本 9 种状态前景/背景配色

## [0.3.8] — 2026-08-15

### 修复
- **安装后启动即报 `ReferenceError: async is not defined`**：`main.js` 中 `async` 关键字与 `probeOverlayAgent` 函数声明被注释行拆开，导致主进程模块加载失败。已重接 `async function`；新增 `scripts/check-syntax.js` 并接入 `prepack` / `predist`，打包前强制做入口 JS 语法检查与「async/await 关键字与声明被拆开」模式扫描，此类坏包无法再打包。
- **安装后启动即弹「应用初始化失败：home is not defined」**：`main.js` 的 `applySettingsSectionGuard()` 构造候选补丁路径时引用了未声明的 `home` 变量（相邻的 `applyProfilePatchGuard` / `applyWorkspaceSearchRailFix` 均有声明，唯独此处遗漏），`boot()` 无条件调用该函数导致每次启动必现初始化失败弹窗。已在该函数内补齐 `const home = effectiveDshHome() || path.join(os.homedir(), '.dsh')`，与相邻防护函数保持一致。

## [0.3.6] — 2026-08-15

> 注意：Zat-DSH Engine 市场替换与客户端更新闭环修复已合入 main，但本版本尚未发布；
> Gitee 分片合并脚本（merge.bat）已重写为 CRLF + ASCII 提示，修复换行符丢失导致
> `set FAILED` / `pause` 失效的问题。发布前请重新执行打包并核验全部文档链接。

### 新增
- **内置 Agent 预设扩充至 8 个**：按上游最新版本同步 `router-standard`（yjh051108/dsh-routing-suite）、`anchored-standard` / `zero-anchored-standard`（xiaobright/dsh-anchored-standard），并新增 `whoami-standard`、`v4-flash-godmode-opencode-go`（SheberDavid）、`warmupbetter` / `warmupbetter-replay`（0liveiraaa/myDshPresets）；每个预设目录附带上游 LICENSE/NOTICE，详见 `docs/agent-presets.md`
- **Gitee 分片合并脚本重写**：`scripts/fix-merge-bat.cjs` 生成 CRLF + ASCII 提示的 merge.bat，修复 `set FAILED` / `pause` 被 echo 吞掉的问题；README 下载说明同步修正
- **插件市场整体替换为 [Zat-DSH Engine](https://github.com/mishibeikejie/zat-dsh-engine)（MIT）**：移除旧 `@deepseek-ai/dsh-plugin-marketplace` 的同步副本与 patch 条目，新增 `zat-dsh-engine` bundle（社区目录 / 双语简介 / 一键安装更新卸载启停 / 网络自适应 / 自更新）；`zod` 转为显式依赖随包分发
- **新增内置 bundle 插件**：`dsh-better-sidebar`（[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)，MIT，VSCode 式侧边栏工作台）与 `harness-pet`（[cakeni/harness-pet](https://github.com/cakeni/harness-pet)，MIT，桌面宠物）；`syncCompanionPlugins` 支持递归同步 `lib/assets/src` 目录，并为 profile 补齐 `schemastery / cosmokit / @standard-schema/spec` 内置依赖
- **文本模型自动识图**：`dsh-host-apiproxy` 发送入口在模型不支持图片输入时，自动复用已安装 `dsh-vision` 的 VLM 配置把图片转述为文字（含 OCR）后再发送；支持图片的模型仍走原生通道
- **第三方许可文档**：新增 `docs/attributions.md` 与 README「第三方组件与许可」，明确 Zat-DSH Engine、dsh、koffi、Electron、React、zod 等 MIT 组件来源

### 修复
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记原子写盘 + 回读校验；每次重启安装记录 `clientUpdateAttempt`，启动识别「客户端更新未完成」并支持重试 / 打开日志 / 24h 稍后；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本

## [0.3.4] — 2026-08-15（BUG 修复版）

### 修复
- **koffi 3.1.3/3.1.4 win32-x64 预编译二进制损坏**（目录选择器 worker 无消息退出、部分客户机器启动即崩）：`package.json` overrides 锁定 `koffi@3.1.5`（上游已回退 Windows 原生编译）；新增 `scripts/koffi-preflight.cjs`，启动前用内置 Node 做 FFI 冒烟，失败自动注入 browse 目录选择器 overlay
- **目录选择器 worker 崩溃后报错无任何诊断信息**：新增 `scripts/patch-deps.js`（postinstall / pack / dist 幂等补丁），worker 无消息退出时把真实 exit code / signal 带进错误文案
- **启动项配置生成错误导致整体打不开**：`dsh web` 退出码 1 时自动解析 `dsh-web.log` 中加载失败的 patch 插件 id，写入 `safe-boot.overlay.yml`（`dsh web --patch`）禁用后自动重试，不修改用户 patch 文件，并弹系统通知
- **EPERM: operation not permitted, symlink 导致退出码 1**：检测到 `profiles/node_modules` 目录联接创建被拒时，自动改名备份半成品缓存、重跑官方 `healProfilesModuleFallback` 重建联接并重试启动，不再需要客户手动按手册操作
- **部分用户设置页看不到插件设置（视图/识图/思考强度等）**：`dsh-host-apiproxy` 设置命名空间白名单补丁改为同时覆盖内置 app、profile fallback 与**更新后的 agent overlay** 三处副本，并锚定 `WEB_SETTINGS_NAMESPACES` 数组自身收尾插入；启动顺序调整为先修复 profile 联接再应用补丁
- **启动失败弹窗缺少日志内容**：失败对话框与「服务已停止」对话框附带 `dsh-web.log` 最近日志，客户截图即可定位
- **syncCompanionPlugins 覆盖用户禁用**：patch 中 id 已存在（含用户手写 disabled 条目）时不再自动重插，避免重复 id 与「禁用后又被加回来」
- **全新 DSH_HOME 首次启动必失败（退出码 1，插件树无法激活）**：`syncCompanionPlugins` 在 dsh 初始化 profile 之前预写 manifest 时，只写入 bundle 插件导致核心 bundles（dsh-base / dsh-web-app）缺失。现改为以实际将运行的 dsh 包为锚点实测可解析后，先写核心 bundles 再追加 bundle 插件；解析不到则不写 manifest，交由 dsh 自行初始化（PR #14）
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记改为原子写盘 + 回读校验；每次重启安装都记录 `clientUpdateAttempt`，下次启动若仍是旧版本则识别为「客户端更新未完成」，提供重试安装 / 打开 `apply-update.log` / 稍后（24h 不再打扰）；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本，避免“重启后应用消失”
- **渲染进程崩溃后永久黑屏/白屏（0xC0000005）**：新增 `renderer-recovery.js` 自恢复状态机，主窗与会话浮窗统一接管：
  - `render-process-gone`（crashed/killed/oom）→ 指数退避自动重载（首次 0.8s，上限 15s + 抖动）
  - 连续失败第 3 次 → 主窗销毁重建 BrowserWindow（保持隐藏/托盘状态）；浮窗直接关闭
  - 失败超过上限 → 主窗切到本地恢复页（重新加载/重启客户端/打开日志），并弹系统通知；绝不无限循环
  - 页面加载成功后需「稳定存活 30 秒」才清零故障计数，杜绝「加载即崩溃」型循环
  - `clean-exit`、退出中、窗口已销毁一律不触发恢复；服务进程退出时交由既有重启对话框，不双弹窗
- **界面挂起（AppHangB1）无恢复**：监听 `unresponsive`，20s 宽限后强制终结 renderer 复用恢复路径；preload 每 5s 心跳兜底「挂起但无 unresponsive 事件」的场景（以 show/hide 事件追踪可见性，隐藏/最小化不误判）
- **加载失败白屏**：新增 `did-fail-load` 处理，服务健在时退避重试（覆盖插件市场重启间隙），`ERR_ABORTED` 忽略
- **崩溃无法取证**：固定 `crashDumps` 到数据目录并启用本地 Crashpad（`uploadToServer:false`），minidump 可离线分析 0xC0000005 底层来源；恢复状态写入 `run-state.json`
- **dsh web / 预览服务随机命中 Chromium 受限端口导致页面永远无法加载**：命中即自动重启服务换端口（上限 4 次）；本地稳定端口选择也会避开受限端口

### 开发
- 新增 `scripts/test/unit-recovery.test.js`（node:test 状态机单元测试，17 例）与 `scripts/test/integration-runner.js`（真实 Electron 集成测试，10 场景）
- 集成测试通道：`DSH_DESKTOP_TEST=1` 时经文件轮询下达命令（crash/kill/hang/quit…），renderer 崩溃时仍可用

## [0.3.3] — 2026-08-15

### 新增
- **内置「极简模式_win」Agent 预设**：把官方极简模式的 bash/PTY 工具替换为 Windows PowerShell（`@deepseek-ai/dsh-tool-pwsh`），开发模式 `npm start` 自动安装，打包流程 `afterPack` 自动写入内置 dsh CLI。
- **内置 dsh-routing-suite**：`dsh-super-injector`（dev_* 注入器/自愈工具）作为 bundle 插件随包同步进 web profile；`router-standard` 预设随包写入内置 dsh CLI。
- **内置 dsh-anchored-standard**：`anchored-standard` 与 `zero-anchored-standard` 两个实验性预设随包写入内置 dsh CLI。
- **识图插件设置页**：`dsh-vision` 新增设置页，可直接填写 API 地址、密钥、模型、备用模型与请求限制；设置保存后热生效。
- **余额/本轮费用开关**：自绘菜单新增「显示余额/本轮费用」，第三方中转/不需要余额提示的用户可一键关闭整个统计 dock。
- **会话导航滑轨输入位置圆点**：每条用户消息在右侧滑轨上以圆点标出位置，内容或尺寸变化时才重算，滚动时不额外读取布局。

### 修复
- **客户端更新多源选择错误**：GitHub 与 Gitee 双源现在取版本最高的 release，而不是返回第一个可用源；修复 GitHub latest 落后时“内置在线更新失效、只能手动覆盖安装”。
- **插件市场安装报 `args fields do not match`**：`installPlugin` 的 Typert 描述符参数名从 `packageName` 对齐为宿主方法的 `spec`。
- **识图插件无法配置/加载**：修正 `dsh-vision` 的 peer 依赖（`@deepseek-ai/cordis`），补齐 `dsh.client` 清单与设置 UI，配置不再依赖手工写文件。
- **第三方模型思考强度默认不再破坏 API**：`reasoning_effort` 注入默认关闭，仅 provider 确认支持时启用；字段名留空表示只显示档位、不注入参数，避免百炼等严格接口报错。
- **会话导航滑轨**：滑轨固定到会话内容区右侧，并在滑轨上以圆点标出每条用户输入的位置；不再因 `position:fixed` 缺省位置偏到窗口左侧。
- **设置页出现两个「插件」栏**：移除 `dsh-super-injector` 重复注册的同名空白设置栏，设置导航只保留官方「插件」页（插件市场为其标签页）。
- **余额/本轮费用开关失效导致金额不显示**：`balanceDockEnabled` / `setBalanceDock` 曾被误放进通知点击回调的作用域，余额刷新与菜单开关运行时抛出 `ReferenceError`；现提升为模块级函数，dock 恢复显示且开关真正生效。
- **README 下载链接**：根 README 中英文下载链接从 0.3.1 同步为 0.3.3，并补充手动安装第三方插件说明。
- **服务启动失败弹窗叠加**：主进程对话框串行化，启动失败/更新/错误弹窗不会同时叠成多个。
- **「隐藏对话输出」按预期工作**：`dsh-conversation-tweaks` 设置命名空间加入浏览器设置白名单，开关保存后真正写入；开启时隐藏大量工具调用、工具结果与思考过程，每一轮最终总结输出仍然显示。
- **桌面端卡顿优化**：会话日志目录枚举改为 5 秒缓存并降低轮询频率；会话导航滑轨滚动事件合并到 requestAnimationFrame 并限频；M3 设置观察器防抖；高频重复的页面 warning/error 日志按签名节流，减少同步磁盘写入。
- **左侧会话分组偏好丢失**：`dsh web` 不再每次随机换端口，改为复用上次保存的 `127.0.0.1` 端口（占用时自动选新端口）。Web UI 的 localStorage 偏好（如会话分组方式）不再因 origin 变化而每次重置。
- **客户端更新“重启后不自动安装/重复弹窗”**：启动更新脚本前清除待安装标记，失败后不会再反复弹同一个更新框；安装版安装完成后会检测新版本是否启动，未启动则从卸载注册表定位并显式拉起；NSIS 明确开启 `runAfterFinish`。
- **插件事件导致会话历史无法加载**：打包时对内置 `@deepseek-ai/dsh-session` 事件词汇表打补丁（`afterPack` 自动执行；开发模式 `npm start` 同样幂等补丁），接受 dsh-agent-teams / dsh-message-edit / dsh-web-search-exa 写入的自定义会话事件，修复 `SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`。
- **0.3.2 实际未随包携带「极简模式_win」**：该预设此前只写进了 changelog，本次补齐源文件与安装流程。


## [0.3.2] — 2026-08-15

### 新增
- **内置识图插件 `dsh-vision`**（`assets/plugins/dsh-vision`）：为纯文本 DeepSeek 注册 `view_image` 工具，把图片与问题转发给任意 OpenAI 兼容 VLM 端点（默认智谱免费 `glm-4.6v-flash`，可换通义 qwen3-vl / Ollama 本地 / 未来 DeepSeek 官方识图 API），答案以文本返回；无需 API key 时按插件配置或 `DSH_VISION_API_KEY` 等环境变量取用。

### 修复
- **客户端自更新“点击重启后无任何反应”**：安装版/便携版更新脚本原来以含空格的完整路径作为 `cmd /c` 的第一个参数，会被 cmd 剥掉引号而静默失败；现在把工作目录切到 `updates` 并只传脚本文件名，更新安装器可正常拉起。
## [0.3.1] — 2026-08-15

### 新增
- **设置-通用「隐藏对话输出」**：一键隐藏模型长篇文字输出，仅保留工具调用、文件操作与结果等重要信息（`assets/plugins/dsh-conversation-tweaks`）。
- **会话右侧导航滑轨**：对话区右侧提供一条跟随会话长度的虚化滑轨；鼠标悬停时在鼠标位置显示垂直短横线预览目标位置，仅点击才跳转（同插件）。
- **便携版解压缓存**：portable 版首次启动后保留 `%TEMP%\dsh-desktop-portable` 解压缓存，后续同版本启动直接复用，避免 Defender 扫描 2.4 万文件造成的分钟级冷启动。
- **异常退出看门狗与恢复提醒**：安装版内置轻量看门狗；主进程异常消失时自动拉起应用，并在下次启动时发系统通知。

### 修复
- **会话浮窗空白**：修复 `display:none` 导致 CSS Grid 自动前移、会话列宽度为 0 的根因。
- **同一会话拖出两个浮窗**：主进程按 sessionId 去重复用已有浮窗；客户端拖拽增加节流。
- **后台完成不提醒**：仅主窗口可见且聚焦时抑制通知，最小化/隐藏/失焦时正常弹通知。
- **终端路由冲突残留**：清理旧 `@deepseek-ai/dsh-terminal` 私有包，启动时自动移除过期配套插件。
- **profile 链接损坏导致启动失败（退出码 1）**：启动前调用官方 `healProfilesModuleFallback` 自愈，自动移除被复制/同步还原成真实目录的 fallback 链接。
- **托盘偶发丢失**：每 30 秒检测并在不可用时重建托盘。

### 开发
- 新增 `scripts/patch-portable-template.js`、`watchdog.js`、浮窗诊断脚本 `_float-diag.js`。
- `npm run dist` 已内置便携版缓存模板补丁，直接打包即可。

## [0.3.0] — 2026-08-15

### 新增
- **第三方模型思考强度**（`assets/plugins/dsh-third-party-thinking`）：让接入的第三方
  OpenAI 兼容模型（pi-ai 自定义 provider / openclaw-bridge 等）也能在模型选择器右下角
  调整思考强度（off / high / max），与官方 DeepSeek 模型同一位置、同一交互。官方
  DeepSeek 模型行为不受影响，已声明 reasoning 的第三方模型保留原生元数据。
- **极简模式_win Agent 预设**：基于官方极简模式，将 bash 工具替换为 Windows PowerShell
  （`@deepseek-ai/dsh-tool-pwsh`），Windows 用户可直接使用。
- **自定义提示词「预览官方提示词」**：设置页自定义提示词区域新增按钮，点击显示官方
  默认系统提示词的渲染结果（只读），方便对比修改。

### 修复
- **插件市场搜索崩溃**：非 npm 来源（GitHub / deepseekdocs）的搜索结果会触发
  `Cannot read properties of null (reading 'version')`，已修复空值判断。
- **会话浮窗内容空白**：拖出会话到独立窗口后，若服务端会话列表尚未同步目标会话，
  会因 `unknown session` 导致浮窗空内容。现增加快照内会话存在性校验，确保目标会话
  已在列表中再执行选中。

### 优化
- **会话完成通知去重**：主窗口在前台时不再弹通知，同一会话 30 秒内最多弹 1 次，
  全局 15 秒内最多弹 1 次，避免连续刷屏。
- **安装包继续瘦身**：在 0.2.3 语言包裁剪 + 冗余文件清理的基础上，进一步优化
  after-pack 清理范围。

## [0.2.0] — 2026-08-14

### 新增
- **伴侣插件体系（一切插件化）**：新增 `assets/plugins/` 机制——宿主启动时把
  配套插件同步进 web profile（`~/.dsh/profiles/web`）并幂等打 `cordis.patch.yml`
  补丁启用。本版随客户端分发的插件：
  - `dsh-terminal`：会话内终端标签页（与 对话/轨迹/文件 并列）。在当前会话项目目录
    启动持久 PowerShell（SSE 流式，非 PTY），命令历史/清屏/重启/断线重连（保留
    512KB 回放）；显式 UTF-8 mini-REPL 规避 PS 5.1 重定向 stdin 的代码页问题；
  - `dsh-file-changes` + `dsh-client-file-changes`：会话文件修改追踪与一键还原。
    「文件」标签页聚合当前会话 agent 修改过的全部文件（新建/修改/删除 + 行级 diff），
    支持逐文件/全部还原（桌面壳做内容精确匹配后替换，冲突安全提示）。数据只读复用
    会话日志已持久化的 `tool/result.meta.diffs`（fs 写前锁内全文 diff），零写入、
    零格式变更；另提供项目文件树（`/api/dsh-files/list`）、站内 HTML/端口预览
    （`/dsh-files/static/*`、`ports`、`check`），全部仅回环；
  - `dsh-balance`：对话底部统计栏内联「本轮 ¥X.XX · 余额 ¥Y.YY」小部件
    （桌面壳读 `~/.dsh/.credentials.yaml` 调 `api.deepseek.com/user/balance`，
    15 分钟刷新，可配置价格档）；
  - `dsh-plugin-marketplace`：插件市场入口。
- **客户端自更新**（`client-updater.js`）：GitHub Releases → Gitee Releases 双源回退
  （`DSH_DESKTOP_RELEASE_API` 可自定义镜像），Gitee 100MB 分片自动下载合并；
  便携版原地替换 + 自动重启，安装版引导新安装包；失败自动保留当前版本。
- **跟随官方更新**（`updater.js`）：检测 `@deepseek-ai/dsh` 新版本，经用户同意后
  用内置 node+npm 安装到数据目录 overlay，staging 原子切换、失败回退、
  启动失败一键回退内置版本；尊重 `NPM_CONFIG_REGISTRY`。
- **会话完成系统通知**：agent 任务跑完弹 Windows 通知，点击回到窗口。
- **快捷键自动维护**：便携版自动创建/重建桌面+开始菜单快捷方式（exe 移动后自愈）。

### 说明
- 便携版数据目录跟随 exe（`data\`）；安装版在 `%APPDATA%\DSH Desktop\`。
- 与 dsh CLI 共享 `DSH_HOME`（默认 `~/.dsh`），已有会话/凭据直接生效。

## [0.2.1] — 2026-08-14

### 新增
- **会话分屏独立窗口**（`assets/plugins/dsh-float-window`）：会话头「弹出独立窗口」
  图标，或把侧栏会话拖出窗口边界，即可创建浮动窗口独立查看/操作该会话（同源镜像 +
  沉浸折叠，自动选中目标会话、折叠侧栏、隐藏标题栏）。最多 8 个浮动窗口，经 IPC
  `too-many` 校验防资源过载；全部浮动窗口共享同一会话数据源、各自独立选中态。
- **自定义注入提示词**（`assets/plugins/dsh-prompt-custom`）：设置页可自定义官方内核
  每次为会话注入的系统提示词，支持「替换整体 / 追加到末尾」两种方式（应用到
  standard 完整 Agent 基准预设），新会话即刻生效。配置持久化到 web profile 的
  `settings.yaml`（`dsh-prompt` 命名空间）。
- **插件市场多源聚合**（`assets/plugins/dsh-plugin-marketplace`）：搜索聚合
  npm registry、GitHub（`topic:dsh-plugin`）与 deepseekdocs 生态三源，各源独立熔断；
  结果展示来源徽标 / stars / GitHub 链接 / 版本；支持 npm 包名与 git spec
  （`github:owner/repo#branch`、`git+https`、`https`）安装。
- **请作者喝咖啡**：chrome 栏 ⋯ 菜单新增「请作者喝咖啡」，弹层展示支付宝/微信收款码
  （`assets/sponsor/`），对照 README「支持作者」小节。
- **官方峰谷计价**：`balance.js` 加入官方峰谷计价引擎（`PEAK_PRICES` /
  `LEGACY_PRICES` / `isPeakHour()` / `effectivePrice()`），余额小部件显示当前模型与
  峰/谷价格，v4-flash 底价同步至峰时费率。

### 变更
- **终端插件更名**：`dsh-terminal` → `dsh-terminal-tab`，修复与官方
  `@deepseek-ai/dsh-terminal` 同名导致的重复路由注册与预设加载失败。

### 修复
- **会话列表刷新闪跳**：选择工作区 / 切换模式 / 开启新对话后，UI 会瞬时闪回
  「选择工作区 / 无会话」状态。根因是官方 `dsh-client-runtime` 的
  `mergeOrderedBaseline` 在会话列表刷新时会丢弃「本地已创建、宿主全量列表尚未
  回显」的新会话，使 `current` 瞬时变 `undefined`。桌面启动时
  （`applyRuntimeFlashFix`）幂等地对运行时打补丁——保留 baseline 缺席的本地会话，
  下一次 baseline 带上该会话后自动收敛为官方值。dsh 包更新后会在下次启动重新应用。

## [0.2.3] — 2026-08-14

### 优化（缩小安装体积、缩短安装时长）
- **语言包裁剪**：`electron-builder.yml` 新增 `electronLanguages: [en-US, zh-CN]`，
  移除 Electron 其余 53 个语言包（.pak，约 80MB）。不影响功能与体验——右键菜单、
  DevTools 等界面语言随系统 locale 自动取 en-US/zh-CN。
- **冗余文件清理**：`scripts/after-pack.js` 在打包后递归清理纯冗余文件
  （源码映射 `*.map`、文档与许可 `README*/CHANGELOG*/LICENSE*/*.md`、TS 构建产物
  `*.tsbuildinfo/*.d.ts` 等），覆盖 `resources/app/` 与自带 npm CLI
  `resources/npm/`。绝不触碰任何运行时文件（`.js/.json/.node/.exe/.dll`），
  功能与体验完整保留。

### 说明
- 0.2.3 为安装优化版，功能与 0.2.2 完全一致（含浮窗会话、自定义提示词、
  咖啡二维码长条三项修复），仅体积与安装时长得到改善。

## [0.2.2] — 2026-08-14

### 修复
- **自定义提示词设置不可用 / 无法输入**：官方 `dsh-host-apiproxy` 只把白名单里的
  settings 命名空间暴露给浏览器端，`dsh-prompt` 默认不在白名单，导致设置页该栏只读
  （显示「设置不可用」，无输入框）。新增 `applyPromptExposeFix()`，启动时幂等地把
  `dsh-prompt` 追加进 `WEB_SETTINGS_NAMESPACES` 暴露白名单，使输入框可正常编辑保存；
  dsh 包更新后会在下次启动重新应用。
- **会话分屏浮窗内容为空 / 按键不响应**：浮窗早期会话服务未就绪时 `sessions.open()`
  会抛 `unknown session`，首屏未选中任何会话导致内容空白。改为浮窗 preload 在页面
  JS 运行前把目标会话预置进 `localStorage['dsh.sessions.current']`，应用一启动即带
  目标会话首屏渲染（与正常恢复会话同一机制）；`sessions.open()` 保留作兜底。
- **「请作者喝咖啡」展示优化**：由全屏遮罩 + 居中卡片改为点击 ⋯ 菜单后从右上角
  （标题栏下方）展开的一条可关闭长条，两个收款码并排显示，支持 × 按钮与 Esc 关闭，
  不再把二维码平铺到页面下方。kernel/dsh-rc8
