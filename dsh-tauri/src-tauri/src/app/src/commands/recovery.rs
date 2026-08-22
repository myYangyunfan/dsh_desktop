//! 恢复页四件套（ipc-commands.md §2.1）：状态查询 / 重载 / 重启 / 打开日志。
//!
//! supervisor 缺位时「重启 / 重新加载」= 重新装配（data-flow.md §3.2）。

use bridge::BridgeError;
use tauri::{AppHandle, Manager};

use crate::AppState;

use super::common::{navigate_main, open_in_explorer};

#[tauri::command]
pub fn recovery_state(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let Some(sv) = sv else {
        // 内核未装配（如安装产物缺 dsh-desktop）：客户端仍开着——
        // 展示装配失败原因与「重启内核」重试入口，而非空状态。
        let reason = state
            .boot_error
            .lock().unwrap_or_else(|p| p.into_inner())
            .clone()
            .unwrap_or_else(|| "内核未装配（supervisor 未初始化）".to_string());
        return Ok(serde_json::json!({ "state": "no-kernel", "reason": reason }));
    };
    Ok(serde_json::json!({
        "state": format!("{:?}", sv.state()),
        "kernelUrl": sv.kernel_url(),
        "crashes": sv.crash_count(),
        "reason": sv.last_error(),
    }))
}

#[tauri::command]
pub fn recovery_reload(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if let Some(sv) = sv {
        if let Some(url) = sv.kernel_url() {
            navigate_main(&app, &url)?;
            return Ok(serde_json::Value::Null);
        }
    } else {
        // 内核从未装配（装配失败转恢复页后的重试）：重新装配并回 loading 页。
        crate::start_supervisor(app.clone()).map_err(BridgeError::internal)?;
    }
    // 无 URL：回 loading 页。
    let loading = state.loading_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
    navigate_main(&app, &loading).map(|_| serde_json::Value::Null)
}

#[tauri::command]
pub async fn recovery_restart(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if let Some(sv) = sv {
        // 事件路由复用（v0.5.1「恢复页重启后白屏」回归根治）：走 route_events
        // 消费的 supervisor_tx 通道——此前新建通道且 rx 即刻丢弃，重启成功后
        // KernelReady 无人路由、失败后 CrashLoop 也无人路由，页面永远停在
        // loading 页（真机复现：内核 3s 就绪 + 稳定落定，页面零进度卡死）。
        // 端口优先复用上次内核端口（origin 稳定，SPA localStorage 偏好不丢）。
        let preferred = state.last_port.load(std::sync::atomic::Ordering::Relaxed);
        let tx = state
            .supervisor_tx
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        // 进程隔离（性能审计 2026-08）：重启的杀树段（taskkill /T /F + wait）
        // 挪出 UI 主线程——同步命令会整窗冻结。
        let joined = tauri::async_runtime::spawn_blocking(move || match tx {
            Some(tx) => sv.recovery_restart_with_port(tx, u16::try_from(preferred).ok()),
            None => {
                let (tx, _rx) = std::sync::mpsc::channel();
                sv.recovery_restart_with_port(tx, u16::try_from(preferred).ok());
            }
        })
        .await
        .map_err(|e| BridgeError::internal(format!("重启任务失败: {e}")))?;
        let _ = joined;
    } else {
        // 内核从未装配：恢复页「重启内核」= 重新装配（如用户刚补齐安装产物）。
        crate::start_supervisor(app.clone()).map_err(BridgeError::internal)?;
    }
    let loading = state.loading_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
    navigate_main(&app, &loading).map(|_| serde_json::Value::Null)
}

#[tauri::command]
pub fn recovery_open_logs(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let dir = shell_core::DshPaths::resolve().logs;
    let _ = std::fs::create_dir_all(&dir);
    open_in_explorer(&dir)
}

#[cfg(test)]
mod tests {
    /// 恢复页「重启内核」必须复用 supervisor_tx 装配通道（v0.5.1「恢复页
    /// 重启后白屏」回归锚点，真机复现定案）：此前新建通道且 rx 即刻丢弃，
    /// KernelReady 无人路由 → 页面永远停在 loading 页（内核其实已就绪）；
    /// 失败路径 CrashLoop 也无人路由 → 无法回到恢复页。
    #[test]
    fn recovery_restart_reuses_supervisor_tx_shape() {
        let src = include_str!("recovery.rs").replace("\r\n", "\n");
        let seg = src
            .split("pub async fn recovery_restart")
            .nth(1)
            .and_then(|s| s.split("pub fn recovery_open_logs").next())
            .expect("recovery_restart 段");
        assert!(seg.contains("supervisor_tx"), "必须复用装配通道 supervisor_tx: {seg}");
        assert!(seg.contains("recovery_restart_with_port"), "必须走带优先端口的重启入口");
        assert!(seg.contains("last_port"), "优先复用上次内核端口（origin 稳定）");
    }
}
