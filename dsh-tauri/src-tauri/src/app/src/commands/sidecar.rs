//! sidecar 转发族（ipc-commands.md §2.2/§2.3）：插件管理八通道 + 诊断/备份。
//!
//! 全部经 `run_sidecar`（node cli.js <子命令> --app-dir）——单一数据流的
//! Rust 编排侧，业务全在 Node sidecar（plugin-contract.md §3）。

use bridge::BridgeError;
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::AppState;

use super::common::{chrono_now, dirs_docs, main_window_only, NoWindow};

/// sidecar 全局串行锁：同一时刻只允许一个 CLI 进程（withPatchWrite 只在单进程内
/// 串行；跨进程并发会竞写 cordis.patch.yml——Review#2 修复）。
static SIDECAR_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// 跑 sidecar CLI 子命令，解析 stdout 末行 JSON。
pub fn run_sidecar(app: &AppHandle, args: &[&str]) -> Result<serde_json::Value, BridgeError> {
    let _serial = SIDECAR_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let sv = sv.ok_or_else(|| BridgeError::internal("supervisor 未初始化"))?;
    let out = kernel_process::sanitized_node_command(&sv.node_exe)
        .arg(&sv.sidecar_cli)
        .args(args)
        .arg("--app-dir")
        .arg(&sv.app_dir)
        .env("DSH_TAURI_VERSION", env!("CARGO_PKG_VERSION"))
        // GUI 进程起 console 子进程必须抑制终端窗（每个桥命令都走这里，
        // 无旗则插件/诊断/备份每次闪终端窗——0.5.0 实测修复）。
        .creation_flags_no_window()
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(BridgeError::from)?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let line = stdout.trim_end().lines().last().unwrap_or("");
    let parsed: serde_json::Value =
        serde_json::from_str(line).map_err(|e| BridgeError::internal(format!("sidecar 输出解析: {e}")))?;
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Phase 2：插件管理（sidecar 转发；主窗白名单——Electron pluginManagerIpcAllowed）
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn plugin_list(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["plugin-list"])
}
#[tauri::command]
pub fn plugin_set_enabled(id: String, enabled: bool, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["plugin-set-enabled", &id, if enabled { "1" } else { "0" }])
}
#[tauri::command]
pub fn plugin_uninstall(id: String, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["plugin-uninstall", &id])
}
#[tauri::command]
pub fn plugin_restore(id: String, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["plugin-restore", &id])
}
#[tauri::command]
pub fn plugin_check_updates(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["plugin-check-updates"])
}
#[tauri::command]
pub fn plugin_update(id: String, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["plugin-update", &id])
}
// 无效条目体检 + 一键清理（Tauri 原生新增，无 Electron 母本；插件管理页横幅）。
#[tauri::command]
pub fn plugin_list_dead_entries(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["plugin-list-dead-entries"])
}
#[tauri::command]
pub fn plugin_remove_dead_entries(ids: Vec<String>, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    let json = serde_json::to_string(&ids).map_err(|e| BridgeError::internal(e.to_string()))?;
    run_sidecar(&app, &["plugin-remove-dead-entries", &json])
}

// ---------------------------------------------------------------------------
// Phase 3：诊断 / 备份（sidecar 转发；主窗白名单同上——Electron 同款守卫面）
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn diag_run(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["diag-run"])
}

#[tauri::command]
pub fn diag_export(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    // Electron 语义：主进程选路径（对话框）。Tauri Phase 3 用固定日志目录 + 时间戳。
    let dir = shell_core::DshPaths::resolve().logs;
    let _ = std::fs::create_dir_all(&dir);
    let out = dir.join(format!("dsh-diagnostics-{}.json", chrono_now()));
    let out_str = out.to_string_lossy().into_owned();
    run_sidecar(&app, &["diag-export", "--out", &out_str])
}

#[tauri::command]
pub fn diag_validate(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["diag-validate"])
}

#[tauri::command]
pub fn diag_order(app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    run_sidecar(&app, &["diag-order"])
}

#[tauri::command]
pub fn diag_order_apply(order: Vec<String>, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    let json = serde_json::to_string(&order).map_err(|e| BridgeError::internal(e.to_string()))?;
    run_sidecar(&app, &["diag-order-apply", &json])
}

#[tauri::command]
pub fn diag_remove_bundle(names: Vec<String>, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    let json = serde_json::to_string(&names).map_err(|e| BridgeError::internal(e.to_string()))?;
    run_sidecar(&app, &["diag-remove-bundle", &json])
}

#[tauri::command]
pub fn backup_export(label: Option<String>, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    // Electron 语义：对话框选路径。Tauri：固定到「文档」目录 + 时间戳名。
    let docs = dirs_docs();
    let _ = std::fs::create_dir_all(&docs);
    let out = docs.join(format!("dsh-desktop-backup-{}.json", chrono_now()));
    let out_str = out.to_string_lossy().into_owned();
    run_sidecar(&app, &["backup-export", &label.unwrap_or_default(), &out_str])
}

#[tauri::command]
pub fn backup_restore(preview: bool, token: Option<String>, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    main_window_only(&window)?;
    if preview {
        // Electron 语义：主进程选文件。Tauri：读最近一次导出的备份文件（日志/文档目录）。
        let docs = dirs_docs();
        let latest = latest_backup(&docs);
        let Some(file) = latest else {
            return Err(BridgeError::not_found("未找到可恢复的备份文件（文档目录）"));
        };
        let file_str = file.to_string_lossy().into_owned();
        return run_sidecar(&app, &["backup-restore-preview", &file_str]);
    }
    let docs = dirs_docs();
    let latest = latest_backup(&docs);
    let Some(file) = latest else {
        return Err(BridgeError::not_found("未找到可恢复的备份文件"));
    };
    let token = token.ok_or_else(|| BridgeError::invalid_arg("缺少恢复令牌（先 preview）"))?;
    let file_str = file.to_string_lossy().into_owned();
    run_sidecar(&app, &["backup-restore-apply", &file_str, &token])
}

/// 文档目录里最新的 `dsh-desktop-backup-*.json`（backup_restore 的 Tauri
/// 降级语义：无对话框，恢复最近一次导出）。
fn latest_backup(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut best: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("dsh-desktop-backup-") && name.ends_with(".json") {
            if let Ok(meta) = entry.metadata() {
                if let Ok(t) = meta.modified() {
                    if best.as_ref().map(|(_, bt)| t > *bt).unwrap_or(true) {
                        best = Some((entry.path(), t));
                    }
                }
            }
        }
    }
    best.map(|(p, _)| p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_backup_picks_newest_matching_prefix() {
        let dir = std::env::temp_dir().join(format!("dsh-cmd-bak-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(latest_backup(&dir), None, "空目录无备份");
        std::fs::write(dir.join("dsh-desktop-backup-old.json"), b"1").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        std::fs::write(dir.join("dsh-desktop-backup-new.json"), b"2").unwrap();
        std::fs::write(dir.join("unrelated.json"), b"3").unwrap();
        let got = latest_backup(&dir).unwrap();
        assert!(got.ends_with("dsh-desktop-backup-new.json"), "{}", got.display());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// run_sidecar 子进程必须带 CREATE_NO_WINDOW（GUI 起 console 程序闪终端
    /// 窗的回归锚点——每个桥命令都经此通道）。
    #[test]
    fn run_sidecar_suppresses_console_window_shape() {
        let src = include_str!("sidecar.rs");
        let seg = src
            .split("pub fn run_sidecar")
            .nth(1)
            .and_then(|s| s.split("// ---").next())
            .expect("run_sidecar 函数体");
        assert!(seg.contains("sanitized_node_command(&sv.node_exe)"), "锚点漂移（改了 spawn 写法需同步测试）: {seg}");
        assert!(seg.contains(".creation_flags_no_window()"), "sidecar spawn 必须抑制终端窗: {seg}");
    }

    /// 主窗白名单（ipc-commands.md §3.3；Electron pluginManagerIpcAllowed 同守卫面）：
    /// 插件管理八通道 + 诊断/备份族 + restart_service 必须逐个前置 main_window_only
    /// （浮窗/宠物窗内核页不得装/卸插件与重启内核）。WSL 三通道对齐 Electron 不设守卫。
    #[test]
    fn sidecar_family_commands_are_main_window_gated() {
        let src = include_str!("sidecar.rs").replace("\r\n", "\n");
        for cmd in [
            "plugin_list", "plugin_set_enabled", "plugin_uninstall", "plugin_restore", "plugin_check_updates", "plugin_update",
            "plugin_list_dead_entries", "plugin_remove_dead_entries",
            "diag_run", "diag_export", "diag_validate", "diag_order", "diag_order_apply", "diag_remove_bundle",
            "backup_export", "backup_restore",
        ] {
            let seg = src
                .split(&format!("pub fn {cmd}"))
                .nth(1)
                .and_then(|s| s.split("\n}").next())
                .unwrap_or_else(|| panic!("{cmd} 函数体缺失"));
            assert!(
                seg.contains("main_window_only(&window)?"),
                "{cmd} 必须前置主窗白名单（Electron pluginManagerIpcAllowed 同面）: {seg}"
            );
        }
        // restart_service 同守卫（Electron chrome:restart-service 挂同款 guard）。
        let life = include_str!("lifecycle.rs").replace("\r\n", "\n");
        let seg = life
            .split("pub fn restart_service")
            .nth(1)
            .and_then(|s| s.split("\n}").next())
            .expect("restart_service 函数体");
        assert!(seg.contains("main_window_only(&window)?"), "restart_service 必须前置主窗白名单: {seg}");
        // 未加守卫的通道不得误引（wsl 三通道对齐 Electron 不设守卫）。
        let wsl = include_str!("wsl.rs");
        assert!(!wsl.contains("main_window_only"), "WSL 三通道 Electron 原版无守卫，不得私自加严");
    }
}
