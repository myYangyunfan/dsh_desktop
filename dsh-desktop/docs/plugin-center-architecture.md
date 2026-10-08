# 插件中心架构（Plugin Center Architecture）

本文档规范 DSH Desktop 第三方插件管理子系统的分层、公共接口、数据流与不变量。
实现位于 `scripts/plugin-core/`，组装根为 `createPluginCenter`（`scripts/plugin-core/index.js`），
`main.js` 只做接线，不再持有任何插件管理业务逻辑。

> [!NOTE]
> **适用范围（v1.0.0，2026-10-07）**：本文描述的**契约仍然生效**——`cordis.patch.yml` 的唯一写入口
> （`patch-surgery`）、启停 / 卸载 / 恢复生命周期（`lifecycle`）、卸载与隔离决策的持久化点
> （`PluginStateStore`，落 `<DSH_HOME>/desktop-plugin-state.json`）、能力鉴权与自动隔离四级防线，
> 服务的仍是随包的 28 个内置配套插件与用户自行安装的第三方插件。
> **已退役、本文不再描述其安装面的部分**：可视化插件市场 `dsh-community-market` 与其桌面服务桥
> `dsh-market-desktop-bridge`、插件中枢 `dsh-hub`（仅用于挂载市场与 `graph-memory`）——三者连同
> `graph-memory` / `harness-pet` / `dsh-cardian` 等于 2026-10-07 按用户点名移除（内置插件 39 → 28）。
> 因此：§4.4 的更新链失去了内置市场 / 插件中枢这两个页面内调用方（壳层插件管理页的
> `dsh:plugin-update` 通道仍是其使用面）；`sync-companion-plugins.js` / `companion-profile.js` 里
> 针对 harness-pet / cardian / graph-memory 的「随包默认禁用」块随之失去对象。
> 第三方安装本身仍是**用户主动行为**（`dsh plugin --profile web add …`），§7 的能力策略与 §8 的
> 不变量对这类安装继续适用——这也是本套机制在退役后仍要保留的原因。

## 1. 目标与原则

1. **单一门面**：main.js / CLI 只通过 `createPluginCenter`（及其共享 lib）与插件层交互。
2. **单一数据流**：所有"用户意图"（开关 / 卸载 / 恢复）先落 `PluginStateStore`，再经
   `PatchLayer → ManifestLayer → ModulesLayer` 按固定顺序应用；任何写入都有迹可循、可回滚。
3. **单一写入方**：profile `package.json` 只允许 `ManifestStore` 写入（进程内互斥 + 锁文件 +
   原子写 + 备份保留）；`cordis.patch.yml` 只允许 `patch-surgery` 写入（同一 WriteGate）。
4. **统一错误**：所有失败返回 `PluginError { code, message, detail }`，code 取自
   `errors.js` 的 `PLUGIN_ERROR_CODES`；UI/日志只依赖 code 做分支，不解析文案。
5. **向后兼容**：IPC 通道名、请求/响应结构、preload 桥 `window.dshDesktop`、
   CLI（`sync-companion-plugins.js`）命令行与快照格式全部保持不变。

## 2. 分层

```
main.js（仅接线：注册 IPC、启动/重启、存活看管钩子）
 └─ scripts/plugin-core/index.js        createPluginCenter —— 组装根（composition root）
     ├─ lib/errors.js                   PluginError / PLUGIN_ERROR_CODES（统一错误税）
     ├─ lib/ids.js                      LOADER_ID_RE / PACKAGE_NAME_RE（全局唯一 id 税）
     ├─ lib/text.js                     escRegExp / EOL 检测与保持 / 行级工具
     ├─ lib/fs-atomic.js                writeFileAtomic / writeJsonAtomic / backupFile /
     │                                  WriteGate（锁文件互斥，跨进程防并发写）
     ├─ lib/state-store.js              PluginStateStore —— 卸载 + 自动隔离决策唯一持久化点
     ├─ lib/patch-surgery.js            cordis.patch.yml 全部文本手术（唯一实现）
     ├─ lib/manifest-store.js           profile package.json 唯一读写（含 bundle/dependency 增删）
     ├─ lib/inventory.js                插件清单收集（统一分组语义，唯一实现）
     ├─ lib/lifecycle.js                setEnabled / uninstall / restore（安装卸载自由面）
     ├─ lib/updates.js                  下载→校验→预检→解压→扫描→原子替换→回滚（更新链）
     ├─ lib/scan.js                     静态高危扫描（更新门禁 / 启动体检共用）
     ├─ lib/quarantine.js               自动隔离落盘（loader 标记 → disabled 覆盖 + 状态）
     ├─ lib/markers.js                  dsh web stderr 机器可读标记解析（跨 chunk 累积）
     ├─ lib/capability.js               IPC 能力策略 + 统一鉴权（frame origin 全量覆盖）
     └─ lib/supervision.js              dsh web 存活探针（防"假活"，补崩溃环盲区）
```

另有两处「进程内补丁」不属于 plugin-core 但同属插件隔离体系：
- `scripts/lib/loader-isolation.js` —— 对 vendored cordis-plugin-loader /
  dsh-app-boot 构建产物的自动隔离注入（失败条目跳过而非拖垮整树）；
- `scripts/lib/web-crash-shield.js` —— dsh web 进程崩溃屏蔽（--require 注入，
  就绪后吞异常 + 归因计数 + 武装标记）。

依赖方向：`index → lib/*`；`lib` 内部只允许下层依赖上层以下模块
（errors/ids/text/fs-atomic 为最底层，不依赖任何业务模块）；**任何 lib 不 require Electron**，
Electron 能力（dialog、ipcMain、app）一律经 `createPluginCenter(ctx)` 注入，保证纯 Node 可测。

## 3. 公共接口（createPluginCenter）

```js
const center = createPluginCenter({
  getHome,            // () => string           有效 DSH_HOME
  getProfile,         // () => string           桌面端恒为 'web'
  log,                // (topic, msg) => void
  companionPlugins,   // 配套插件清单（可选，默认 COMPANION_PLUGINS）
  dialogs,            // { confirm(message) => Promise<boolean> }（Electron 注入；测试注入桩）
});

center.inventory.rows() / center.inventory.collect()   // 与历史 pluginManagerCollect 同构
center.inventory.describe(id)                          // 单插件 inventory 行（未知返回 null）
center.lifecycle.setEnabled(id, enabled)               // → { ok, restartRequired } | PluginError
center.lifecycle.uninstall(id)                         // → { ok, restartRequired } | PluginError
center.lifecycle.restore(id)                           // → { ok, restartRequired } | PluginError（仅配套可恢复）
center.updates.sources                                 // 更新源表（与历史 PLUGIN_UPDATE_SOURCES 一致）
center.updates.checkUpdates()                          // → items[]（npm 双源 / GitHub 官方）
center.updates.update(id)                              // 加固更新链（fail-closed）
center.quarantine.apply(id, info) / applyBySource(source, info) / clear(id)  // 自动隔离落盘/解除
center.scan.profile()                                  // → findings[]（全 profile node_modules 静态扫描）
center.markers.parseMarkers / createMarkerAccumulator  // stderr 机器可读标记解析
center.isMutating()                                    // 是否有插件变更进行中（存活探针 isBusy 用）
center.bootCleanup()                                   // 启动残留清理（.trash / .bak）
center.removedIds()                                    // patch removed 行 ∪ state.uninstalled 并集
center.supervision({ getBaseUrl, httpGet, isBusy, onZombie })  // → { start, stop, state }（工厂）
center.state / center.manifestStore / center.patchGate // 底层句柄（同步器/自愈共用）
center.ipc.actions / center.ipc.confirmMessages / center.ipc.authorize(event, deps, action)
```

## 4. 数据流（规范）

### 4.1 开关插件
```
IPC dsh:plugin-set-enabled
 → pluginManagerIpcAllowed（capability.authorize，action='*' 通用口径）
 → inventory.collect() 定位分组（core 拒绝）
 → lifecycle.setEnabled
   → WriteGate.acquire
   → patch-surgery.togglePluginInPatch（EOL 保持、原子写；disabled:false 翻转 true）
   → 启用时一并解除自动隔离决策（state.clearQuarantined，失败仅日志）
   → 返回 restartRequired: true（生效语义不变：重启后由 dsh loader 组合）
```

### 4.2 卸载插件（内置配套 / 第三方统一走本流）
```
IPC dsh:plugin-uninstall
 → authorize + dialogs.confirm（破坏性确认）
 → lifecycle.uninstall(id)
   → inventory 定位；core / 带用户 config 拒绝
   → PluginStateStore.markUninstalled(id, name)          # 决策先落盘，抗 patch 重置复活
   → patch-surgery.setPluginRemoved(text, id, true, name) # disabled+removed 顶层条目
   → ManifestStore.removeBundles / removeDependencies（写锁 + 原子写 + 备份）
   → ModulesLayer.removePackageDir（rename→.trash 后再删；与更新链共用 profile-modules 锁）
   → ModulesLayer.prunePackageStore(name)                 # .pnpm store 同名精确清理（尽力）
   → 返回 restartRequired: true
```

### 4.3 恢复卸载（仅内置配套）
```
 → PluginStateStore.clearUninstalled(id)（失败即中止，绝不返回「已恢复」假成功）
 → PluginStateStore.clearQuarantined(id)（解除自动隔离决策；失败仅日志，补丁层仍会移除 disabled 行）
 → patch-surgery.setPluginRemoved(text, id, false, name)
 → 下次启动 sync 重新装配（sync 消费 state + patch 双源）
第三方（无源可装）→ { ok:false, code:'PLUGIN_RESTORE_NO_SOURCE' }（不再假成功）
```

### 4.4 插件更新（加固链）
```
IPC dsh:plugin-update
 → authorize + confirm
 → 查询元数据（npm 官方→镜像；GitHub 官方 API）
 → 完整性锚点必须存在：npm=sha512(integrity)、GitHub=sha256(digest)，缺失一律拒绝
 → 下载：仅 https、64MB 上限、重定向禁止降级/环
 → 解压预检：tar -tvf 逐条目校验（拒绝 ../、绝对路径、symlink/hardlink/设备条目）
 → 解压至独立临时目录 → findPackageRoot 围栏 → 全树 lstat 复检无链接
 → 包名与目标一致、version 合法
 → scan.js 静态扫描（命中高危 → dialogs.confirm，拒绝则中止）
 → 原子替换：pkgDir → .bak-<ts>；tempRoot → pkgDir；失败 rename 回滚
 → 成功：清理 .bak（服务占用失败则留存，下次启动清理 >24h 的 .bak）
```

### 4.5 启动链路（不变，但数据源收口）
```
boot:
  healBeforeServer（profile/home patch 预检，写经 patch-surgery）
  syncPlugins（removedIds = patch removed 行 ∪ PluginStateStore.uninstalled）
  applyPatches（注册表驱动，不变；loader-isolation 三守卫在此注入）
  preflight（只读）
  startAndShowGuarded（plugin-guard 守护启动）
    → 服务就绪 → supervision.start()（grace 120s 覆盖稳定窗口，稳定 30s 落定「最后良好」）
```

### 4.6 插件错误自动隔离（四级，核心需求：单插件错误完全不影响其他功能）

**L1 加载期隔离（loader 树级）**：`loader-isolation.js` 对上游 loader 三处
fail-loud 语义注入自动隔离（详见该文件头注释）：
- `EntryGroup.update` / `EntryTree.await` —— 条目 apply / fiber 结算失败
  → stderr 打 `[loader-isolation] entry <id> (<name>) ...` 标记并跳过，
  其余条目照常组合；
- `assertEntriesActivated` 审计（dsh-app-boot boot 调用点）→ 无 fiber /
  未激活 / pending 条目同样跳过并标记；
- 受保护核心（@deepseek-ai/dsh-base / dsh-web-app）失败仍 fatal（安装损坏，
  跳过只会更糟），走既有启动自愈/回滚。

**L2 运行时异常隔离（进程级）**：`web-crash-shield.js`（--require 注入）就绪后
吞掉 uncaughtException / unhandledRejection（启动期保持 fail-fast）；风暴断路
（60s 内 20 次）恢复抛出交壳层崩溃环自愈；武装时置
`DSH_CRASH_SHIELD_ARMED=1`，`installFailLoud`（被 loader-isolation 补丁改写）
就绪后不再 exit(1)；按肇事来源归因计数，阈值达 3/10min 输出
`[crash-shield] attribute: <source> count: n` 标记。

**L3 自动隔离落盘（quarantine，壳层）**：main.js 观测两类 stderr 标记 →
`quarantine.apply(id)`：
1. patch-surgery 写官方 `disabled: true` 顶层覆盖行（运行期防线先落盘：即使
   状态持久化失败，重启后该条目仍被跳过，其余插件完全不受影响）；
2. `PluginStateStore.markQuarantined`（决策持久化，失败仅日志不阻塞隔离）；
3. 系统通知「插件 X 已自动隔离，可在插件管理页恢复」+ 守护重启一次（限频）。
用户 `setEnabled(true)` / 恢复即 `quarantine.clear`（移除 disabled 行 + 决策）；
插件若仍坏，下一轮自动隔离再次触发（闭环，风暴/崩溃环上限兜底无死循环）。

**L4 挂死恢复（假活探针）**：`supervision.js` 见 §4.6 原探活语义（连续 3 次
失败且非忙态 → 守护重启）。**重启有上限**：同一 10 分钟窗口内最多自动重启
2 次（插件占死事件循环的场合无限重启只会无限失败），耗尽后停止自动重启并
弹窗提示排查；服务稳定落地（30s）后配额复位。

**诚实边界**：同进程插件造成的共享状态破坏无法逐插件回滚——L2/L3 通过
「隔离 + 重启」恢复干净状态；插件代码永不进入 Electron 主进程执行路径
（进程隔离是真实的）。

## 5. 状态存储（PluginStateStore）

- 位置：`<DSH_HOME>/desktop-plugin-state.json`（家级，随 cordis.patch.yml 同级）。
- Schema v2：
  ```json
  {
    "v": 2,
    "uninstalled": { "<loader-id>": { "name": "<包名>", "at": "<ISO 时间>", "source": "ui" } },
    "quarantine":  { "<loader-id>": { "name": "<包名>", "at": "<ISO 时间>", "source": "runtime|boot|client", "reason": "<摘要>" } }
  }
  ```
- 语义：`uninstalled` 是「用户卸载决策」的唯一权威来源；`quarantine` 是「自动
  隔离决策」的唯一权威来源（插件管理页据此展示隔离状态，用户启用即解除）。
  `cordis.patch.yml` 的 removed/disabled 行是运行期禁用面。二者互为备份：
  patch 被自愈重置时，sync 依据 state 不复活插件；state 损坏时，patch 行仍
  保证插件处于禁用态。
- 兼容：v1 文件（无 quarantine 字段）原位迁移 v2；损坏 → `.broken-<ts>` 备份
  + 重建空状态，绝不阻塞启动；非法条目净化：id 非法/危险键（`__proto__` 等）
  丢弃，包名非法置空保留（决策以 id 为准）。
- 写入：writeJsonAtomic + WriteGate；**写穿语义**——锁内重读磁盘，只叠加本
  实例自上次成功落盘以来修改过的键（dirty 集）并应用本实例的删除（tombstone），
  其余键原样保留：既不丢「他进程的新增」也不复活「他进程的删除」。构造期
  迁移为同步原子写；`readOnly`（CLI --dry-run）构造期与 save 一律不写盘。
- 消费方：`plugin-sync.js`（sync）、`sync-companion-plugins.js`（CLI）、
  `lifecycle.js`、`quarantine.js`、`inventory.js`。CLI 与壳层共用同一文件，
  双入口不再漂移。

## 6. 插件分组语义（inventory）

| group | 判定 | 可开关 | 可卸载 |
| --- | --- | --- | --- |
| core | bundles ∩ CORE_BUNDLE_NAMES | 否 | 否 |
| companion | COMPANION_PLUGINS | 是 | 是（可恢复） |
| community | bundles 中除 core/companion 外的第三方 | **是** | **是**（不可恢复） |
| other | 仅 patch insert/用户层条目（非 bundle） | 是 | 是（不可恢复） |
| removed | 带 removed 标记 / state.uninstalled | — | 可恢复（仅 companion） |

历史实现把第三方 bundle 归入 core 导致其不可管理；本重构将第三方 bundle 归入
community 组并开放开关/卸载（bundles 登记由 ManifestStore 一并清理）。

## 7. IPC 能力策略（capability）

- **全量 frame-origin 精确校验**：所有插件管理 IPC（含只读 list 与 guard:action）
  统一走 `capability.authorize(event, deps, action)`（main.js 的
  `pluginManagerIpcAllowed` 以 action='*' 通用口径委托同一实现，单一数据源）：
  `sender === mainWindow.webContents && senderFrame.url.origin === webUrl.origin`，
  消除历史上 list/set-enabled 只查 sender 的不一致。
- **破坏性确认**：uninstall / update / restore / backup-restore / diag-order-apply
  / diag-remove-bundle 在主进程经 `dialogs.confirm` 二次确认（测试可注入桩）；
  确认文案集中声明于 `capability.js` 的 `CONFIRM_MESSAGES`（键：uninstall /
  update / restore / order-apply / remove-bundle / backup-restore），
  main.js 只按键引用，禁止散落文案。
- **参数白名单**：id/包名一律过 `ids.js`；payload 体积与形状在 handler 内校验。
- 能力表（action → {originCheck, confirm, mutating}）集中声明于 `capability.js`，
  新增 IPC 必须在此登记，禁止散落判断。

## 8. 不变量（Invariants）

- I1 写入顺序固定：State → Patch → Manifest → Modules；前一步失败即中止，不留半状态。
- I2 patch/manifest/state 全部原子写；改动文件保持原 EOL（CRLF/LF），全文不做无关改写。
- I3 manifest 由 ManifestStore 独占写入；备份 `.bak-<ts>-<pid>` 保留最近 5 份。
- I4 更新链 fail-closed：缺完整性锚点 / 非 https / 解压条目非法 / 包名不匹配 / 扫描高危
   任一命中即拒绝，绝不降级安装。
- I5 运行中的插件目录操作一律 rename 语义（先移走再替换/删除），不直接 rm 被引用目录。
- I6 第三方插件代码不进入 Electron 主进程执行路径；主进程只做文件/进程级操作。
- I7 所有对外错误带稳定 code；新增 code 必须同步 `errors.js` 与本文档 §9。
- I8 任何 lib 模块不 require('electron')；Electron 能力注入，纯 Node 单测可覆盖。

## 9. 错误码（PLUGIN_ERROR_CODES）

| code | 含义 |
| --- | --- |
| PLUGIN_NOT_FOUND | 插件 id 不存在 |
| PLUGIN_CORE_PROTECTED | 核心组件不可操作 |
| PLUGIN_HAS_CONFIG | 带用户配置，禁止卸载 |
| PLUGIN_NOT_TOGGLEABLE | 该插件不可开关 |
| PLUGIN_RESTORE_NO_SOURCE | 第三方插件无源可恢复 |
| PLUGIN_BUSY | 同 id 更新进行中 / 写入锁超时（生命周期操作靠 WriteGate 串行 + 幂等） |
| PLUGIN_SERVICE_RUNNING | 服务运行中，操作需先重启/已安全降级（保留码） |
| PLUGIN_BAD_ID | 插件 id 含非法字符 |
| PLUGIN_BAD_PACKAGE | 包名含非法字符 |
| UPDATE_NO_INTEGRITY | 元数据缺少完整性锚点，拒绝更新 |
| UPDATE_INTEGRITY_MISMATCH | 下载内容校验失败 |
| UPDATE_BAD_URL | tarball 非 https / 协议非法 |
| UPDATE_ARCHIVE_UNSAFE | 归档条目预检失败（../、绝对路径、链接等） |
| UPDATE_PACKAGE_MISMATCH | 包名/版本不匹配 |
| UPDATE_SCAN_BLOCKED | 静态扫描高危且用户拒绝 |
| UPDATE_ROLLBACK_FAILED | 回滚失败（备份保留于 .bak） |
| UPDATE_DOWNLOAD_FAILED | 下载/解压/网络失败 |
| STATE_CORRUPT | 状态文件损坏（保留码：损坏走备份重建 + 日志自愈，不对外抛出） |
| UNAUTHORIZED | IPC 鉴权失败 |

## 10. 测试策略

- 纯 Node 单测：每个 lib 模块独立 `node:test`，临时目录注入，零 Electron、零网络
  （updates 的网络层注入 http 桩）；覆盖正常/异常/边界/幂等/并发。
- 集成测试：`integration-runner.js` 既有场景全量回归（行为文案不变）；新增场景
  （第三方卸载彻底性、更新链拒绝路径、存活探针恢复）经独立 DSH_HOME/userData 跑真实 Electron。
- 隔离铁律：任何测试不得读写真实 `~/.dsh`；测试用 `mkdtemp` + 显式环境变量。
