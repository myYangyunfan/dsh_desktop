# dsh-TUI 团队 ADAPTER 协议消化（v0.6.0 兼容层输入）

> 来源：`ccch1mneyyy/dsh-TUI` 仓库根 `ADAPTER.md`（2026-08-31 经 gh-proxy 抓取全文）。
> 相关仓库：`dsh-tui/dsh-tui`（out-of-tree plugin bundle）、`dsh-tui-ecosystem/dsh-tui-ecosystem`（插件模板与收录列表）。

## 1. 一句话定位

dsh-TUI 团队的 **adapter 边界规范**：把对官方 `@deepseek-ai/*` 的全部接触收敛到
单一适配器目录（`src/dsh-adapter/`），配以**版本契约 + patch 面快照 + 三道 CI 门禁**，
使「官方内核升级」只要求审查适配器目录，业务 UI 零修改——**与我们 v0.6.0 兼容层
的目标同构**，且已是工程验证过的实现。

## 2. 边界规则（他们的「命门」）

- 官方 `@deepseek-ai/*` 包**只允许在 `src/dsh-adapter/` 内被 import**。
- UI 层（`screens/` `components/` `ink/` `hooks/` `utils/` `cc/`）一律经 adapter
  facade 间接接触上游：`src/dsh-adapter/types.ts` 的类型 re-export +
  `channel.ts` / `plugin.ts` 等运行期服务。
- **门禁**：`pnpm run verify:boundary`（扫描全部源码，发现越界 import 即失败，
  已挂进 `build`）。

## 3. 上游契约（版本钉 + drift 检测）

- **校验版本线**：主 `0.1.2-alpha.2`，兼容 `0.1.1-rc.2 / 0.1.1-rc.1 / 0.1.0-rc.8 /
  0.1.0-rc.6`——`src/dsh-adapter/contract.ts` 的 `UPSTREAM_VALIDATED_VERSIONS`。
- 特性门控：`installedMeetsVersion(pkg, 'x.y.z-<alpha|beta|rc>.n')` 跨家族、跨
  预发布通道比较，老安装上优雅降级。
- peer 范围：`^0.1.0-rc.6 || ^0.1.1-rc.1 || ^0.1.2-alpha.2`；契约外版本启动时打
  drift 警告；CI 上 `pnpm run verify:contract` 直接失败。
- **白名单包**：blessed list——harness 包按完整版本号校验，框架包
  （cordis / schemastery）按 major 校验。

## 4. Patch Surface 快照（他们对我们「51 补丁」问题的答案）

`cordis.patch.yml` 对官方行的干预已快照到 **`patch-surface.snapshot.json`**：

| 干预类型 | 数量 | 说明 |
|---|---|---|
| disabled overrides | 24 行 | 23 行恒定禁用；`command-goal` 条件禁用（仅当官方 preset 实际自带该命令时；alpha.2 与 web-app 对齐，rc.2 保留 host `/goal`） |
| config overrides | 8 行 | 含 session-telemetry-otel / plugin-package-inventory-deepseek（TUI 隐私默认） |
| inserts | 17 行 | dsh-tui、working-activity、dsh-tui-auth、六个插件互通行 + 9 个 dsh-tui 作用域 host-plane 行；**检测到官方同 id/name 行已存在时自行 disabled**（安全共存） |

- 上游发版后 patch 面变化：`pnpm run verify:patch-surface` 在 CI 先爆；确认差异后
  `node --import tsx/esm scripts/verify-patch-surface.ts --snapshot` 重新生成。
- **web 共存校验**：`verify:web-coexistence` 把 dsh-tui patch 与官方 web-app patch
  按 include 语义合成一遍，直接拦截 loader entry id 复用；相邻 deepseek-harness
  源码存在时还会额外校验其 base + web patch。

## 5. 升级流程（四步，业务 UI 零修改）

1. `pnpm add` 各 `@deepseek-ai/*` 到新预发布版本
2. `pnpm run build`（typecheck + 三道门禁）
3. 若 patch-surface 或 contract 报警：审查差异，更新 `contract.ts` 校验版本 /
   重新生成快照
4. 业务 UI 代码原则上零修改；若需要改，**改动必须落在 `src/dsh-adapter/` 内**

## 6. 映射到我们 v0.6.0 兼容层五组件

| TUI 团队机制 | 我们的对应组件 | 采纳建议 |
|---|---|---|
| `contract.ts` UPSTREAM_VALIDATED_VERSIONS + drift 警告 | ① kernel-pin | 直接采纳：pin 清单增「校验版本线 + peer 范围 + 启动 drift 警告」三件 |
| `verify:boundary`（import 越界扫描） | ② composition adapter 的命门校验 | 采纳为内置插件分发前的静态扫描（官方包 import 只允许出现在声明适配区内） |
| `patch-surface.snapshot.json` + `verify:patch-surface` | ③ runtime-adapter registry | **核心采纳**：51+ 补丁的干预面做成快照 + CI 比对（补丁漂移在 CI 先爆，而非内核升级时） |
| `verify:web-coexistence`（patch 合成 + id 复用拦截） | ② composition adapter | 采纳：多补丁源（内置/用户/覆盖层）合成前先做 id 复用拦截 |
| 四步升级流程 | §6 里程碑 M2 | 升级 SOP 直接照抄 |

## 7. 与 TUI 团队校验线的交叉

其校验版本线主版本同样是 `0.1.2-alpha.2`——与我们 M2 的目标版本一致。其
`patch-surface` 的 24 disabled / 8 config / 17 inserts 与我们桌面壳的补丁面
（51+）**共同作用于同一内核**：若桌面壳与 TUI 共存于同一安装，双方 patch 面的
合成冲突（loader entry id 复用）需要 `verify:web-coexistence` 同款的合成校验——
已在组件②的采纳建议中。

## 8. 许可证

dsh-TUI 仓库含 `LICENSE`（上游文档未在 ADAPTER.md 声明协议本身的许可限制）；
协议文档引用属事实性描述，无再分发障碍。
