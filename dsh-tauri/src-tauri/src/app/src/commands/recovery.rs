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
        // 崩溃环/无内核 URL 态（v0.5.2 真机死锁复现）：此前仅导航 loading 页，
        // 不复位崩溃环也不重启 boot 链——旧世代看门狗仍在计时，5 分钟后
        // enter_recovery_tx 因「已在 CrashLoop」幂等抑制换页事件，主窗永久
        // 停在「正在启动 DSH 内核…」，无任何用户出路。与「重启内核」同路径：
        // 复位崩溃环 + 重启 boot 链（复用 supervisor_tx，事件路由不断链）。
        let preferred = state.last_port.load(std::sync::atomic::Ordering::Relaxed);
        let tx = state
            .supervisor_tx
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        match tx {
            Some(tx) => sv.recovery_restart_with_port(tx, u16::try_from(preferred).ok()),
            None => {
                let (tx, _rx) = std::sync::mpsc::channel();
                sv.recovery_restart_with_port(tx, u16::try_from(preferred).ok());
            }
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
pub fn recovery_restart(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if let Some(sv) = sv {
        // 事件路由复用（v0.5.1「恢复页重启后白屏」回归根治）：走 route_events
        // 消费的 supervisor_tx 通道——此前新建通道且 rx 即刻丢弃，重启成功后
        // KernelReady 无人路由、失败后 CrashLoop 无人路由，页面永远停在
        // loading 页（真机复现：内核 3s 就绪 + 稳定落定，页面零进度卡死）。
        // 端口优先复用上次内核端口（origin 稳定，SPA localStorage 偏好不丢）。
        let preferred = state.last_port.load(std::sync::atomic::Ordering::Relaxed);
        let tx = state
            .supervisor_tx
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        match tx {
            Some(tx) => sv.recovery_restart_with_port(tx, u16::try_from(preferred).ok()),
            None => {
                let (tx, _rx) = std::sync::mpsc::channel();
                sv.recovery_restart_with_port(tx, u16::try_from(preferred).ok());
            }
        }
    } else {
        // 内核从未装配：恢复页「重启内核」= 重新装配（如用户刚补齐安装产物）。
        crate::start_supervisor(app.clone()).map_err(BridgeError::internal)?;
    }
    let loading = state.loading_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
    navigate_main(&app, &loading).map(|_| serde_json::Value::Null)
}

/// 恢复页「以安全模式重启」——**保底进入通道**（1.0.9 用户反馈根治）。
///
/// 背景：壳侧原本只有两条路进恢复页（内核装配失败、内核崩溃环）。「内核健康、
/// WebView 正常、客户端插件装配失败」这一类落在两条之外——`dsh-client-web` 的
/// `BootController.run` 只把失败条目画成 `Failed to load plugins` 面板，不抛错、
/// 不进 `desktop.log`，重载还是同一结果，用户除了手删 profile 无路可走。
///
/// 本命令只写 `<DSH_HOME>/safe-mode.flag` 再走与「重启内核」**完全相同**的路径
/// 重启 boot 链（复用 `recovery_restart`：`supervisor_tx` 事件路由不断链、端口
/// 优先复用）。boot 同步读标记后把伴随插件在补丁层全部写成 `disabled`——只留
/// 内置插件管理页（唯一自救界面）与 billion-context 的 gate（禁掉会让四个出厂
/// 预设的 `inject` 永久 pending），并消费标记：一次性熔断，之后由用户在
/// 设置 → 插件 → 内置插件 里逐个开回来。
#[tauri::command]
pub fn recovery_safe_mode(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let flag = shell_core::DshPaths::resolve()
        .dsh_home
        .join("safe-mode.flag");
    if let Some(parent) = flag.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| BridgeError::internal(format!("创建 DSH_HOME 失败: {e}")))?;
    }
    std::fs::write(&flag, b"1\n")
        .map_err(|e| BridgeError::internal(format!("写入安全模式标记失败: {e}")))?;
    // 标记必须在重启之前落盘：顺序反了则 boot 同步读不到标记，用户点一次什么都
    // 不会发生（且日志里只有一次「已重启内核」，无从分辨）。
    recovery_restart(app)
}

#[tauri::command]
pub fn recovery_open_logs(_app: AppHandle) -> Result<serde_json::Value, BridgeError> {
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
            .split("pub fn recovery_restart")
            .nth(1)
            .and_then(|s| s.split("pub fn recovery_open_logs").next())
            .expect("recovery_restart 段");
        assert!(seg.contains("supervisor_tx"), "必须复用装配通道 supervisor_tx: {seg}");
        assert!(seg.contains("recovery_restart_with_port"), "必须走带优先端口的重启入口");
        assert!(seg.contains("last_port"), "优先复用上次内核端口（origin 稳定）");
    }

    /// 「以安全模式重启」必须先把标记写进 DSH_HOME 再复用重启路径（1.0.9 保底
    /// 进入通道回归锚点）：顺序反了 boot 同步读不到标记，用户点一次毫无反应，
    /// 而日志里只有一次「已重启内核」，无从分辨。
    #[test]
    fn recovery_safe_mode_writes_flag_then_restarts_shape() {
        let src = include_str!("recovery.rs").replace("\r\n", "\n");
        let seg = src
            .split("pub fn recovery_safe_mode")
            .nth(1)
            .and_then(|s| s.split("pub fn recovery_open_logs").next())
            .expect("recovery_safe_mode 段");
        assert!(seg.contains("safe-mode.flag"), "必须写 safe-mode.flag");
        assert!(seg.contains("dsh_home"), "标记必须落在 DSH_HOME（与 boot 同步读的同一处）");
        assert!(seg.contains("recovery_restart(app)"), "必须复用重启路径（事件路由不断链）");
        let write_at = seg.find("std::fs::write").expect("必须写标记");
        let restart_at = seg.find("recovery_restart(app)").expect("必须重启");
        assert!(write_at < restart_at, "标记必须先落盘再重启");
    }

    /// 恢复页「重新加载」在崩溃环态（无内核 URL）必须走与「重启内核」同
    /// 路径的复位重启（v0.5.2 真机死锁回归锚点）：此前仅导航 loading 页，
    /// 崩溃环未复位 + 旧世代看门狗超时后 enter_recovery_tx 幂等抑制换页 →
    /// 主窗永久停在「正在启动 DSH 内核…」（真机复现：坏 .env 触发崩溃环后
    /// 点「重新加载」，5 分钟看门狗开火但页面零变化）。
    #[test]
    fn recovery_reload_crashloop_restarts_boot_shape() {
        let src = include_str!("recovery.rs").replace("\r\n", "\n");
        let seg = src
            .split("pub fn recovery_reload")
            .nth(1)
            .and_then(|s| s.split("pub fn recovery_restart").next())
            .expect("recovery_reload 段");
        assert!(seg.contains("recovery_restart_with_port"), "无内核 URL 时必须复位崩溃环并重启 boot 链");
        assert!(seg.contains("supervisor_tx"), "必须复用装配通道（事件路由不断链）");
    }
}
