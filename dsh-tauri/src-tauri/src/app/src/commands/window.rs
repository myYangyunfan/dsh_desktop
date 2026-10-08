//! 窗口族命令：window_control / 浮窗 / 赞助（ipc-commands.md §2.1）。
//!
//! 建窗细节在 `crate::windows`；本模块只做 command 参数分发与 label 校验。
//! 2026-10 宠物窗四通道（pet_window / pet_close / pet_move_to /
//! pet_set_auto_open）随 harness-pet 插件裁撤一并移除。

use bridge::BridgeError;
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::AppState;

use super::common::{b64, terr};

#[tauri::command]
pub fn window_control(window: WebviewWindow, action: String) -> Result<serde_json::Value, BridgeError> {
    match action.as_str() {
        "minimize" => window.minimize().map_err(terr)?,
        "toggle-maximize" => {
            let maxed = window.is_maximized().map_err(terr)?;
            if maxed {
                window.unmaximize().map_err(terr)?;
            } else {
                window.maximize().map_err(terr)?;
            }
        }
        "close" => {
            // 0.5.0 语义：标题栏 ✕（bridge-shim windowControls.close）= 隐藏主窗
            // 留托盘（后台常驻，内核继续）；真退出走托盘「退出」。
            // 防御：非主窗误入本通道（浮窗有自己的 floatWindow.close）保持真关闭。
            if window.label() == "main" {
                crate::windows::hide_main_to_tray(&window);
            } else {
                window.close().map_err(terr)?;
            }
        }
        "is-maximized" => {
            return Ok(serde_json::json!(window.is_maximized().map_err(terr)?));
        }
        other => return Err(BridgeError::invalid_arg(format!("未知窗口动作：{other}"))),
    }
    Ok(serde_json::Value::Null)
}

#[tauri::command]
pub fn float_window(action: String, session_id: Option<String>, app: AppHandle, window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    if window.label() != "main" {
        return Err(BridgeError::not_found("仅主窗可开浮窗"));
    }
    match action.as_str() {
        "open" => {
            let sid = session_id.filter(|s| !s.is_empty()).ok_or_else(|| BridgeError::invalid_arg("bad-session"))?;
            let state = app.state::<AppState>();
            let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
            let sv = sv.ok_or_else(|| BridgeError::kernel_not_ready("内核未就绪"))?;
            let url = sv.kernel_url().ok_or_else(|| BridgeError::kernel_not_ready("内核未就绪"))?;
            crate::windows::open_float_window(&app, &url, &sid)
        }
        other => Err(BridgeError::invalid_arg(format!("bad-action: {other}"))),
    }
}

#[tauri::command]
pub fn float_close(window: WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    if window.label().starts_with("float-") {
        let _ = window.close();
    }
    Ok(serde_json::Value::Null)
}

#[tauri::command]
pub fn sponsor_qr(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let Some(sv) = sv else { return Ok(serde_json::json!({ "ok": false })) };
    let read = |name: &str| -> String {
        let p = sv.app_dir.join("assets").join("sponsor").join(name);
        std::fs::read(p).map(|b| format!("data:image/{};base64,{}", if name.ends_with(".png") { "png" } else { "jpeg" }, b64(&b))).unwrap_or_default()
    };
    Ok(serde_json::json!({ "ok": true, "alipay": read("sponsor-alipay.jpg"), "wechat": read("sponsor-wechat.png") }))
}

#[tauri::command]
pub fn sponsor_window(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let Some(sv) = sv else { return Err(BridgeError::internal("supervisor 未初始化")) };
    // 图片缺失不 Err 不吞：打日志 + 返回空串，窗口层渲染诊断占位块
    // （窗口照常可关；「点了没反应」和「无图空窗」都是 v0.5.0 被骂的形态）。
    let base = sv.app_dir.join("assets").join("sponsor");
    let read = |name: &str| -> String {
        let p = base.join(name);
        match std::fs::read(&p) {
            Ok(b) => format!("data:image/{};base64,{}", if name.ends_with(".png") { "png" } else { "jpeg" }, b64(&b)),
            Err(e) => {
                eprintln!("[sponsor] 收款码读取失败（{}）: {e}", p.display());
                String::new()
            }
        }
    };
    crate::windows::open_sponsor_window(&app, &read("sponsor-alipay.jpg"), &read("sponsor-wechat.png"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sponsor_and_qr_helpers() {
        // 注入脚本版（file:// 落盘版已废）：data URI 内嵌 + 文案在场。
        let script = crate::windows::sponsor_inject_script("data:image/jpeg;base64,AAA", "data:image/png;base64,BBB");
        assert!(script.contains("data:image/jpeg;base64,AAA"));
        assert!(script.contains("data:image/png;base64,BBB"));
        assert!(script.contains("请作者喝咖啡"));
        // sponsor_qr 的 data URI 组装（页面内嵌放大用）：ff d8 ff e0 → "/9j/4A=="。
        assert_eq!(b64(b"\xff\xd8\xff\xe0"), "/9j/4A==");
    }

    /// window_control close 语义（0.5.0）：主窗 ✕ = 隐藏留托盘，非真退出。
    /// 单测无法构造 WebviewWindow，按 contract_audit 同法做源码形态断言
    /// （防「顺手改回 close()」回退——那会让 ✕ 直接杀进程，托盘保活失效）。
    #[test]
    fn window_control_close_hides_main_window_shape() {
        let src = include_str!("window.rs");
        let seg = src
            .split("\"close\" =>")
            .nth(1)
            .and_then(|s| s.split("other =>").next())
            .expect("close 分支");
        assert!(seg.contains("window.label() == \"main\""), "主窗判定缺失: {seg}");
        assert!(seg.contains("hide_main_to_tray"), "主窗 close 必须走隐藏留托盘: {seg}");
        assert!(seg.contains("window.close()"), "非主窗误入应保持真关闭: {seg}");
        // close 分支整体不得出现进程退出语义。
        assert!(!seg.contains("exit("), "close 分支不得退出进程: {seg}");
    }
}
