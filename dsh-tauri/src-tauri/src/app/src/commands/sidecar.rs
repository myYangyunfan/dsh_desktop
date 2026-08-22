//! sidecar 转发族（ipc-commands.md §2.2/§2.3）：插件管理六通道 + 诊断/备份。
//!
//! 全部经 `run_sidecar`（node cli.js <子命令> --app-dir）——单一数据流的
//! Rust 编排侧，业务全在 Node sidecar（plugin-contract.md §3）。

use std::time::Duration;

use bridge::BridgeError;
use tauri::{AppHandle, Manager};

use crate::AppState;
use crate::bounded;

use super::common::{chrono_now, dirs_docs, NoWindow};

/// sidecar 全局串行锁：同一时刻只允许一个 CLI 进程（withPatchWrite 只在单进程内
/// 串行；跨进程并发会竞写 cordis.patch.yml——Review#2 修复）。
static SIDECAR_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// sidecar 子命令执行上限：最重链路是 plugin-update（下载 ≤64MB + 解压
/// ≤120s）——300s 足够宽裕；AV 拦半死时有界失败（旧行为：无界永挂 +
/// 串行锁被占死，后续全部 sidecar 命令排队到天荒地老）。
const SIDECAR_TIMEOUT: Duration = Duration::from_secs(300);

/// 跑 sidecar CLI 子命令，解析 stdout 末行 JSON。
///
/// 进程隔离（性能审计 2026-08）：Tauri 同步命令在 UI 主线程执行——子进程
/// 等待（node 冷启动数百 ms 起、插件检查/更新分钟级）会冻结整窗（拖动/
/// 重绘/全部 IPC 派发停摆，menu.rs check-agent-update 注释记录的同一实测
/// 形态）。统一 spawn_blocking 挪出主线程；串行锁语义不变（防竞写
/// cordis.patch.yml），只是排队发生在后台线程池而非 UI 线程。
pub async fn run_sidecar(app: &AppHandle, args: &[&str]) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let sv = sv.ok_or_else(|| BridgeError::internal("supervisor 未初始化"))?;
    let argv: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let node_exe = sv.node_exe.clone();
    let sidecar_cli = sv.sidecar_cli.clone();
    let app_dir = sv.app_dir.clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        let _serial = SIDECAR_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let mut cmd = std::process::Command::new(&node_exe);
        cmd.arg(&sidecar_cli)
            .args(&argv)
            .arg("--app-dir")
            .arg(&app_dir)
            .env("DSH_TAURI_VERSION", env!("CARGO_PKG_VERSION"))
            // GUI 进程起 console 子进程必须抑制终端窗（每个桥命令都走这里，
            // 无旗则插件/诊断/备份每次闪终端窗——0.5.0 实测修复）。
            .creation_flags_no_window();
        bounded::output_with_timeout(&mut cmd, SIDECAR_TIMEOUT)
    })
    .await
    .map_err(|e| BridgeError::internal(format!("sidecar 执行任务失败: {e}")))?
    .map_err(BridgeError::from)?;
    if out.timed_out {
        return Err(BridgeError::internal("sidecar 子命令超时（300s）被终止"));
    }
    let raw = out.output.expect("非超时路径必有完整输出");
    let stdout = String::from_utf8_lossy(&raw.stdout);
    let line = stdout.trim_end().lines().last().unwrap_or("");
    let parsed: serde_json::Value =
        serde_json::from_str(line).map_err(|e| BridgeError::internal(format!("sidecar 输出解析: {e}")))?;
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Phase 2：插件管理（sidecar 转发）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn plugin_list(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["plugin-list"]).await
}
#[tauri::command]
pub async fn plugin_set_enabled(id: String, enabled: bool, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["plugin-set-enabled", &id, if enabled { "1" } else { "0" }]).await
}
#[tauri::command]
pub async fn plugin_uninstall(id: String, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["plugin-uninstall", &id]).await
}
#[tauri::command]
pub async fn plugin_restore(id: String, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["plugin-restore", &id]).await
}
#[tauri::command]
pub async fn plugin_check_updates(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["plugin-check-updates"]).await
}
#[tauri::command]
pub async fn plugin_update(id: String, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["plugin-update", &id]).await
}

// ---------------------------------------------------------------------------
// Phase 3：诊断 / 备份（sidecar 转发）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn diag_run(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["diag-run"]).await
}

#[tauri::command]
pub async fn diag_export(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    // Electron 语义：主进程选路径（对话框）。Tauri Phase 3 用固定日志目录 + 时间戳。
    let dir = shell_core::DshPaths::resolve().logs;
    let _ = std::fs::create_dir_all(&dir);
    let out = dir.join(format!("dsh-diagnostics-{}.json", chrono_now()));
    let out_str = out.to_string_lossy().into_owned();
    run_sidecar(&app, &["diag-export", "--out", &out_str]).await
}

#[tauri::command]
pub async fn diag_validate(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["diag-validate"]).await
}

#[tauri::command]
pub async fn diag_order(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    run_sidecar(&app, &["diag-order"]).await
}

#[tauri::command]
pub async fn diag_order_apply(order: Vec<String>, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let json = serde_json::to_string(&order).map_err(|e| BridgeError::internal(e.to_string()))?;
    run_sidecar(&app, &["diag-order-apply", &json]).await
}

#[tauri::command]
pub async fn diag_remove_bundle(names: Vec<String>, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let json = serde_json::to_string(&names).map_err(|e| BridgeError::internal(e.to_string()))?;
    run_sidecar(&app, &["diag-remove-bundle", &json]).await
}

#[tauri::command]
pub async fn backup_export(label: Option<String>, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    // Electron 语义：对话框选路径。Tauri：固定到「文档」目录 + 时间戳名。
    let docs = dirs_docs();
    let _ = std::fs::create_dir_all(&docs);
    let out = docs.join(format!("dsh-desktop-backup-{}.json", chrono_now()));
    let out_str = out.to_string_lossy().into_owned();
    run_sidecar(&app, &["backup-export", &label.unwrap_or_default(), &out_str]).await
}

#[tauri::command]
pub async fn backup_restore(preview: bool, token: Option<String>, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    if preview {
        // Electron 语义：主进程选文件。Tauri：读最近一次导出的备份文件（日志/文档目录）。
        let docs = dirs_docs();
        let latest = latest_backup(&docs);
        let Some(file) = latest else {
            return Err(BridgeError::not_found("未找到可恢复的备份文件（文档目录）"));
        };
        let file_str = file.to_string_lossy().into_owned();
        return run_sidecar(&app, &["backup-restore-preview", &file_str]).await;
    }
    let docs = dirs_docs();
    let latest = latest_backup(&docs);
    let Some(file) = latest else {
        return Err(BridgeError::not_found("未找到可恢复的备份文件"));
    };
    let token = token.ok_or_else(|| BridgeError::invalid_arg("缺少恢复令牌（先 preview）"))?;
    let file_str = file.to_string_lossy().into_owned();
    run_sidecar(&app, &["backup-restore-apply", &file_str, &token]).await
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
            .split("pub async fn run_sidecar")
            .nth(1)
            .and_then(|s| s.split("// ---").next())
            .expect("run_sidecar 函数体");
        assert!(seg.contains("Command::new(&node_exe)"), "锚点漂移（改了 spawn 写法需同步测试）: {seg}");
        assert!(seg.contains(".creation_flags_no_window()"), "sidecar spawn 必须抑制终端窗: {seg}");
    }

    /// 进程隔离锚点（性能审计 2026-08）：run_sidecar 必须是 async + 经
    /// spawn_blocking 执行子进程——Tauri 同步命令在 UI 主线程跑，node 子进程
    /// 等待（数百 ms 起、插件更新分钟级）会冻结整窗（拖动/重绘/全部 IPC
    /// 停摆）。且必须有超时上限（旧行为无界永挂 + 占死串行锁）。
    #[test]
    fn run_sidecar_off_main_thread_and_bounded_shape() {
        let src = include_str!("sidecar.rs");
        let seg = src
            .split("pub async fn run_sidecar")
            .nth(1)
            .and_then(|s| s.split("// ---").next())
            .expect("run_sidecar 函数体");
        assert!(seg.contains("spawn_blocking"), "子进程等待必须挪出调用线程（spawn_blocking）: {seg}");
        assert!(src.contains("const SIDECAR_TIMEOUT"), "必须有执行超时上限常量");
        assert!(seg.contains("SIDECAR_TIMEOUT"), "执行必须受超时约束");
        assert!(seg.contains("out.timed_out"), "超时必须显式报错（不得当成功/静默）");
        // 串行锁语义保持（Review#2：防竞写 cordis.patch.yml）。
        assert!(seg.contains("SIDECAR_LOCK.lock()"), "串行锁必须保持（锁内移到后台线程，语义不变）");
        // 全部包装命令必须 async（同步包装会让等待链断在主线程）。
        for cmd in [
            "pub async fn plugin_list", "pub async fn plugin_set_enabled", "pub async fn plugin_uninstall",
            "pub async fn plugin_restore", "pub async fn plugin_check_updates", "pub async fn plugin_update",
            "pub async fn diag_run", "pub async fn backup_export", "pub async fn backup_restore",
        ] {
            assert!(src.contains(cmd), "sidecar 包装命令必须 async: {cmd}");
        }
    }
}
