# 契约 2：Tauri command 清单（Electron IPC 映射表）

> 溯源：`dsh-desktop/main.js`（43 处注册：36 个 `ipcMain.handle` + 7 个 `ipcMain.on`，
> 提取于 2026-08-19，main@4affaf9）。
> 目标命名法：Electron `chrome:*` / `dsh:*` / `float:*` / `pet:*` / `guard:*` 通道
> 统一映射为 snake_case 的 Tauri command；事件统一为 kebab-case。

## 1. 命名映射规则

| Electron | Tauri | 说明 |
|----------|-------|------|
| `chrome:window {action}` | `window_control {action, window?}` | action 枚举原样保留（`minimize`/`toggle-maximize`/`close`/`is-maximized`） |
| `chrome:menu {action, ...payload}` | `menu_action {action, payload}` | |
| `dsh:xxx-yyy`（invoke） | `xxx_yyy` | 前缀 `dsh:` 去除 |
| `float:close` / `pet:xxx`（send） | `float_close` / `pet_xxx` | fire-and-forget command，返回值固定 `Ok(())` |
| `guard:action` | `guard_action` | 插件保护中心交互面（status/check/incident/resolve-incident 分发；写动作仍走守护瀑布自动面） |
| 事件 `dsh:balance` | event `balance-changed` | 冒号统一转连字符 |

## 2. 全量映射表（45 通道：43 提取自 main.js + 2 Tauri 原生新增，见 §2.2）

### 2.1 保留 —— Phase 1（核心生命周期，main.js:2868-3271）

> 「实现位置」= Tauri 侧实际落点：`app commands/<域>` 为装配根命令模块；
> bridge crate 只承载映射表与垫片 JS（不依赖 tauri 运行时），不实现命令体。

| Electron 通道（行号） | Tauri command | 实现位置 |
|----------------------|---------------|-----------|
| `chrome:init` (2868) | `app_init` | app commands/lifecycle |
| `chrome:recovery-state` (2901) | `recovery_state` | app commands/recovery |
| `chrome:recovery-reload` (2911) | `recovery_reload` | app commands/recovery |
| `chrome:recovery-restart` (2925) | `recovery_restart` | app commands/recovery |
| `chrome:recovery-open-logs` (2937) | `recovery_open_logs` | app commands/recovery |
| `chrome:window` (2942) | `window_control` | app commands/window |
| `chrome:menu` (2953) | `menu_action` | app commands/menu |
| `chrome:restart-service` (2986) | `restart_service` | app commands/lifecycle（supervisor 执行重启；spawn/杀树域在 kernel-process crate） |
| `dsh:image-paste-save` (3036) | `image_paste_save` | app commands/image |
| `chrome:float-window` (3050) | `float_window` | app commands/window |
| `chrome:pet-window` (3083) | `pet_window` | app commands/window |
| `chrome:sponsor-window` (3155) | `sponsor_window` | app commands/window |
| `dsh:copy-text` (3141) | `copy_text` | app commands/lifecycle |
| `dsh:sponsor-qr` (3149) | `sponsor_qr` | app commands/window |
| `dsh:balance-refresh` (3173) | `balance_refresh` | app commands/balance（余额生产链：sidecar balance-fetch + 轮询环） |
| `dsh:open-external` (3254) | `open_external` | app commands/lifecycle |
| `dsh:page-error`（on, 3162） | `page_error` | app commands/lifecycle |
| `dsh:renderer-heartbeat`（on, 2896） | `renderer_heartbeat` | app commands/lifecycle |
| `dsh:current-session`（on, 3168） | `current_session` | app commands/lifecycle（AppState.current_session；session-watcher crate 为 Phase 3 通知链预留，未接线） |
| `float:close`（on, 3072） | `float_close` | app commands/window |
| `pet:close`（on, 3106） | `pet_close` | app commands/window |
| `pet:move-to`（on, 3114） | `pet_move_to` | app commands/window |
| `pet:set-auto-open`（on, 3135） | `pet_set_auto_open` | app commands/window |

### 2.2 保留 —— Phase 2（sidecar 全链路）

| Electron 通道（行号） | Tauri command | 实现位置 |
|----------------------|---------------|-----------|
| `dsh:plugin-list` (3331) | `plugin_list` | app commands/sidecar（`run_sidecar` 转发 → Node sidecar cli.js 执行） |
| `dsh:plugin-set-enabled` (3336) | `plugin_set_enabled` | 同上 |
| `dsh:plugin-uninstall` (3354) | `plugin_uninstall` | 同上 |
| `dsh:plugin-restore` (3366) | `plugin_restore` | 同上 |
| `dsh:plugin-check-updates` (3379) | `plugin_check_updates` | 同上 |
| `dsh:plugin-update` (3390) | `plugin_update` | 同上 |
| `dsh:plugin-list-dead-entries` | `plugin_list_dead_entries` | 同上（**Tauri 原生新增，无 Electron 母本**：cordis.patch.yml 无效条目体检，插件管理页横幅数据源） |
| `dsh:plugin-remove-dead-entries` | `plugin_remove_dead_entries` | 同上（**Tauri 原生新增，无 Electron 母本**：一键清理死条目，sidecar 侧复核 + 备份 + 原子写 + 幂等） |

### 2.3 保留 —— Phase 3（围栏 / 预览 / 诊断 / WSL）

| Electron 通道（行号） | Tauri command | 实现位置 |
|----------------------|---------------|-----------|
| `dsh:file-revert` (3184) | `file_revert` | app commands/file（fence crate 围栏判定） |
| `dsh:file-open` (3238) | `file_open` | app commands/file（fence crate 围栏判定） |
| `dsh:diag-run` (3402) | `diag_run` | app commands/sidecar（`run_sidecar` 转发 → Node sidecar cli.js 执行） |
| `dsh:backup-export` (3438) | `backup_export` | 同上 |
| `dsh:backup-restore` (3471) | `backup_restore` | 同上 |
| `dsh:diag-export` (3548) | `diag_export` | 同上 |
| `dsh:diag-validate` (3634) | `diag_validate` | 同上 |
| `dsh:diag-order` (3654) | `diag_order` | 同上 |
| `dsh:diag-order-apply` (3687) | `diag_order_apply` | 同上 |
| `dsh:diag-remove-bundle` (3715) | `diag_remove_bundle` | 同上 |
| `dsh:wsl-config` (3271) | `wsl_config_get` | app commands/wsl（settings.json 扁平键；Electron 原版此三通道无 ipcAllowed 守卫，保持同口径） |
| `dsh:wsl-config-save` (3284) | `wsl_config_save` | 同上 |
| `dsh:wsl-recheck` (3313) | `wsl_recheck` | 同上 |
| `guard:action` (2994) | `guard_action` | app commands/guard（supervisor `guard_status`/`guard_check`/`guard_incident_read`/`guard_resolve_incident` → Node sidecar `guard-*` 子命令）。交互面只暴露读面 status/check/incident + 轻量解 resolve-incident；写动作（snapshot/restore/repair）仍走守护瀑布自动面（supervisor boot_waterfall） |

### 2.4 裁撤表（Tauri 版不实现）

| Electron 通道/入口 | 裁撤原因 |
|-------------------|----------|
| `check-agent-update` 菜单动作（main.js:2963 → `runUpdateFlow`） | **内核自动更新链整体删除**（用户决策）。overlay 布局、`updater.checkLatest/applyUpdate/rollback`、定时触发器、skipVersion 设置、快照回滚联动全部不移植。**v0.5.3 后菜单项整体移除**：早期（v0.5.0–v0.5.2）曾保留为最简版本比对（本地内核版本 vs npm registry latest），随「内核随客户端分发、无 overlay 更新链」设计定案后，npm 内核检查动作连同菜单项一并退役；客户端更新检查由 `check-client-update`（GitHub+Gitee 双源 releases）完全取代 |
| 客户端更新自研链（`runClientUpdateFlow`，菜单 `check-client-update`，main.js:4744-4954） | 由 `tauri-plugin-updater` 替代（minisign 签名校验，补上现状**无哈希/签名校验**的安全洞）。菜单动作保留但转发到 updater 插件 |

## 3. command 通用约定

1. **参数形态**：Electron 的单 payload 对象拆平为 command 具名参数（`{action}` → `action: String`）。
2. **错误返回**：所有 command 统一返回 `Result<T, BridgeError>`；`BridgeError` 携带 `code`（contracts/error-codes.md）+ `message`，序列化为 `{code, message}` 供垫片转成 `Error`。
3. **origin 白名单（已实装，v0.5.2）**：插件管理八通道（六条 Electron 母本通道
   + 两条 Tauri 原生新增的死条目体检/清理）、诊断/备份族与
   `restart_service` 仅接受主窗 label 的调用（对齐 Electron `pluginManagerIpcAllowed`
   的实际守卫面——含 `chrome:restart-service`，不含 WSL 三通道）；`window_control`
   等任意窗可用。Tauri command 拿不到原生 origin（远程页经 capability `remote.urls`
   已限 127.0.0.1），白名单在命令实现层（app `commands::common::main_window_only`）
   按 `WebviewWindow` label 判定，越权回 `E_UNAUTHORIZED`（bridge crate 不依赖
   tauri 运行时，守卫不放在 bridge）。
4. **fire-and-forget**：垫片对同步 send 语义的方法不 await；command 内部 `spawn`，失败仅日志。
