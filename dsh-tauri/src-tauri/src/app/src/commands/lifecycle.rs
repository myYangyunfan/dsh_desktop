//! Phase 1 核心生命周期命令：app_init / 剪贴板 / 外部打开 / 页面心跳 /
//! 当前会话 / 服务重启 / PoC 回显（ipc-commands.md §2.1）。
//! （余额触发 balance_refresh 已随余额生产链迁往 [`super::balance`]。）

use std::sync::atomic::Ordering;

use bridge::BridgeError;
use tauri::{AppHandle, Manager, State};

use crate::AppState;

use super::common::{main_window_only, open_http_url, NoWindow};
use super::menu::{setting_bool, setting_bool_or};

/// 更新源仓库（Electron client-updater DEFAULT_REPOS 同源；⋯ 菜单「更新源」展示+复制）。
pub const REPO_URLS: (&str, &str) = (
    "https://github.com/myYangyunfan/dsh_desktop",
    "https://gitee.com/my-yang-yunfan/dsh_desktop",
);

#[tauri::command]
pub fn app_init(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let (kernel_url, phase_note, kernel_version) = {
        let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
        match sv {
            Some(s) => (s.kernel_url(), format!("kernel={}", s.kernel_version), s.kernel_version.clone()),
            None => (None, "supervisor 未初始化".into(), "未知".into()),
        }
    };
    // ⋯ 菜单面板状态（对齐 Electron chrome:init 的消费字段）：agent 版本/来源、
    // 三个持久化开关现值（settings.json，缺省 true）、更新源 URL——
    // bridge-shim 的菜单 openMenu 经 getInfo 拉取渲染。
    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
    Ok(serde_json::json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "shell": "tauri",
        "kernel": kernel_url.unwrap_or_else(|| "未就绪".into()),
        "phaseNote": phase_note,
        "platform": std::env::consts::OS,
        "agentVersion": kernel_version,
        "agentSource": "bundled", // Tauri 版内核随客户端分发（Electron 的「内置」对应物）
        "notifyOnTurnEnd": setting_bool(&store, "notifyOnTurnEnd"),
        "closeToTray": setting_bool(&store, "closeToTray"),
        "showBalanceDock": setting_bool(&store, "showBalanceDock"),
        // 自动装更新缺省 false（menu.rs key_default 同源；client-update-available
        // 事件命中时垫片据此决定是否直接走 install 流程）。
        "autoInstallUpdates": setting_bool_or(&store, "autoInstallUpdates", false),
        "repoUrls": { "github": REPO_URLS.0, "gitee": REPO_URLS.1 },
    }))
}

#[tauri::command]
pub fn copy_text(text: String) -> Result<serde_json::Value, BridgeError> {
    if text.len() > 1_000_000 {
        return Err(BridgeError::invalid_arg("文本过长"));
    }
    set_clipboard_text(&text)?;
    Ok(serde_json::Value::Null)
}

/// 剪贴板写入（平台三分支）：Windows PowerShell Set-Clipboard（单引号包裹 +
/// 内部单引号翻倍防注入）；macOS pbcopy；Linux xclip/xsel/wl-copy 尝试链
/// （发行版/会话各异，均缺则报可读错误）——此前无平台分支，非 Windows 上
/// spawn powershell 直接失败，复制功能全坏。
#[cfg(windows)]
fn set_clipboard_text(text: &str) -> Result<(), BridgeError> {
    let escaped = text.replace('\'', "''");
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &format!("Set-Clipboard -Value '{escaped}'")])
        .creation_flags_no_window()
        .output()
        .map_err(BridgeError::from)?;
    if !status.status.success() {
        return Err(BridgeError::internal("剪贴板写入失败"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_clipboard_text(text: &str) -> Result<(), BridgeError> {
    use std::io::Write;
    let mut child = std::process::Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(BridgeError::from)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).map_err(BridgeError::from)?;
    }
    let status = child.wait().map_err(BridgeError::from)?;
    if !status.success() {
        return Err(BridgeError::internal("剪贴板写入失败"));
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn set_clipboard_text(text: &str) -> Result<(), BridgeError> {
    use std::io::Write;
    let candidates: &[(&str, &[&str])] = &[
        ("xclip", &["-selection", "clipboard"]),
        ("xsel", &["--clipboard", "--input"]),
        ("wl-copy", &[]),
    ];
    for (tool, args) in candidates {
        let Ok(mut child) = std::process::Command::new(tool)
            .args(*args)
            .stdin(std::process::Stdio::piped())
            .spawn()
        else {
            continue; // 未安装：试下一个
        };
        let mut write_ok = true;
        if let Some(mut stdin) = child.stdin.take() {
            write_ok = stdin.write_all(text.as_bytes()).is_ok();
        }
        match child.wait() {
            Ok(st) if st.success() && write_ok => return Ok(()),
            _ => continue, // 写入/退出失败：试下一个工具
        }
    }
    Err(BridgeError::internal("剪贴板写入失败（未找到可用的 xclip/xsel/wl-copy）"))
}

#[tauri::command]
pub fn open_external(url: String) -> Result<serde_json::Value, BridgeError> {
    open_http_url(&url)
}

#[tauri::command]
pub fn page_error(state: State<AppState>, message: String) -> Result<serde_json::Value, BridgeError> {
    let n = state.page_errors.fetch_add(1, Ordering::Relaxed) + 1;
    eprintln!("[page-error #{n}] {message}");
    // 落盘 desktop.log（2026-08-31 删除对话排障实证盲区）：release 壳是
    // windows_subsystem="windows" GUI 子系统，eprintln 无人接收——bridge-shim
    // 把 alert 转桥到本命令的设计前提（「消息不丢」）在安装态不成立，页面
    // 异常/插件 RPC 失败（如 alert「操作失败: …」）在生产日志里彻底蒸发。
    // 与 route_log 同走 file_log（写者锁串行化，防双写者行撕裂）。
    crate::supervisor::file_log(&format!("[page-error #{n}] {message}"));
    Ok(serde_json::Value::Null)
}

/// 页面心跳（契约 §4）：计数 + 页面自报可见性落盘。
///
/// F3（2026-08 用户反馈「隔几分钟重新加载一遍」）：心跳载荷新增可选
/// `hidden`（bridge-shim 携带 document.hidden）。可见且未最小化的窗口仍
/// 可能被 WebView2（Chromium 原生遮挡跟踪）判为 hidden——被其他窗口完全
/// 遮挡/锁屏/RDP 断开时 Win32 原生 API 失明，此时 5s 心跳被节流到 ~1/min
/// 不是挂死，lib.rs 心跳监测据此（AppState.hb_page_hidden）豁免停摆判定。
/// 仅**主窗**心跳计入该标志（浮窗/宠物窗的 hidden 状态不代表主窗页面）；
/// `hidden` 缺省（KernelReady 探针 `{}` 调用形态）不改动标志——探针只证明
/// 页面活着，不携带可见性信息。
#[tauri::command]
pub fn renderer_heartbeat(
    state: State<AppState>,
    window: tauri::WebviewWindow,
    hidden: Option<bool>,
) -> Result<serde_json::Value, BridgeError> {
    state.heartbeats.fetch_add(1, Ordering::Relaxed);
    if window.label() == "main" {
        // 主窗专属计数（M1，2026-08「多子代理白屏」）：lib.rs 的停摆监测与
        // C2c 探针据此判定**主窗页面**死活——全局 heartbeats 会被浮窗/宠物
        // 窗心跳淹没，主窗渲染进程单独死亡时停摆永不触发。
        state.hb_main.fetch_add(1, Ordering::Relaxed);
        if let Some(h) = hidden {
            state.hb_page_hidden.store(h, Ordering::Relaxed);
        }
    }
    Ok(serde_json::Value::Null)
}

#[tauri::command]
pub fn current_session(state: State<AppState>, session_id: String) -> Result<serde_json::Value, BridgeError> {
    let id = session_id.trim().to_string();
    if id.is_empty() || id.len() > 256 {
        return Err(BridgeError::invalid_arg("sessionId 为空或超长"));
    }
    *state.current_session.lock().unwrap_or_else(|p| p.into_inner()) = Some(id);
    Ok(serde_json::Value::Null)
}

#[tauri::command]
pub fn restart_service(app: AppHandle, window: tauri::WebviewWindow) -> Result<serde_json::Value, BridgeError> {
    // 主窗白名单（Electron chrome:restart-service 挂 pluginManagerIpcAllowed
    // 的同款守卫）：浮窗/宠物窗的内核页不得触发内核重启。
    main_window_only(&window)?;
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let sv = sv.ok_or_else(|| BridgeError::internal("supervisor 未初始化"))?;
    let preferred = state.last_port.load(Ordering::Relaxed);
    // 事件路由复用（v0.5.1「重启后白屏」回归根治）：必须走 AppState 里
    // route_events 消费的那条通道（supervisor_tx），KernelReady/CrashLoop/
    // BootStep 才有人路由——此前这里新建通道并把事件全部 drain 掉，重启
    // 成功后无人换页（真机复现：内核已就绪且稳定落定，页面永远停在
    // loading「正在启动」，白屏形态）。
    let tx = state
        .supervisor_tx
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    match tx {
        Some(tx) => sv.restart(tx, u16::try_from(preferred).ok()),
        None => {
            // 兜底（理论不可达：supervisor 在场则装配通道必在）：drain 防阻塞。
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                while let Ok(ev) = rx.recv() {
                    let _ = ev;
                }
            });
            sv.restart(tx, u16::try_from(preferred).ok());
        }
    }
    Ok(serde_json::json!({ "ok": true }))
}

/// PoC 专用：JSON 回显（验证参数序列化双向通路）。非契约成员。
#[tauri::command]
pub fn poc_echo_json(payload: serde_json::Value) -> Result<serde_json::Value, BridgeError> {
    Ok(payload)
}

#[cfg(test)]
mod tests {
    /// restart_service 必须复用 supervisor_tx 装配通道（v0.5.1「重启后白屏」
    /// 回归锚点）：此前新建通道 + drain 线程把 KernelReady/CrashLoop 全部
    /// 吞掉——重启成功无人换页（真机复现：内核就绪且稳定落定，页面永远停在
    /// loading「正在启动」）。事件必须走 route_events 消费的那条通道。
    #[test]
    fn restart_service_reuses_supervisor_tx_shape() {
        let src = include_str!("lifecycle.rs").replace("\r\n", "\n");
        let seg = src
            .split("pub fn restart_service")
            .nth(1)
            .and_then(|s| s.split("pub fn poc_echo_json").next())
            .expect("restart_service 段");
        assert!(seg.contains("supervisor_tx"), "必须复用装配通道 supervisor_tx: {seg}");
        assert!(seg.contains("sv.restart(tx,"), "restart 必须走复用通道");
    }

    /// copy_text 平台三分支形态锚点（include_str! 形态断言法）：非 Windows
    /// 不得再 spawn powershell（此前 mac/linux 上复制功能全坏——spawn 直接
    /// Err）；macOS 走 pbcopy、Linux 走 xclip/xsel/wl-copy 尝试链。
    #[test]
    fn copy_text_has_platform_branches_shape() {
        // 行尾归一（CI Windows runner 检出可能 CRLF，本地 LF——\n 切分模式
        // 对行尾敏感，实测 CI 首跑即挂）。
        let src = include_str!("lifecycle.rs").replace("\r\n", "\n");
        let seg = src
            .split("#[cfg(windows)]\nfn set_clipboard_text")
            .nth(1)
            .and_then(|s| s.split("#[cfg(target_os = \"macos\")]").next())
            .expect("windows set_clipboard_text 分支");
        assert!(seg.contains("Set-Clipboard"), "Windows 保持 PowerShell 语义");
        let mac = src
            .split("#[cfg(target_os = \"macos\")]\nfn set_clipboard_text")
            .nth(1)
            .and_then(|s| s.split("#[cfg(all(unix, not(target_os = \"macos\")))]").next())
            .expect("macOS set_clipboard_text 分支");
        assert!(mac.contains("pbcopy"), "macOS 须用 pbcopy: {mac}");
        let linux = src
            .split("#[cfg(all(unix, not(target_os = \"macos\")))]\nfn set_clipboard_text")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n#[cfg(test)]").next())
            .expect("Linux set_clipboard_text 分支");
        assert!(linux.contains("xclip") && linux.contains("xsel") && linux.contains("wl-copy"), "Linux 尝试链须齐: {linux}");
        // 命令主体不得残留平台外的 powershell 直调（防回退到单一实现）。
        let cmd_seg = src.split("pub fn copy_text").nth(1).and_then(|s| s.split("\n}").next()).unwrap_or("");
        assert!(!cmd_seg.contains("powershell"), "copy_text 主体须委托 set_clipboard_text: {cmd_seg}");
    }
}
