//! 浮窗集成测试（K23「点击打开小窗 → 白屏 + 应用卡死」根治回归）。
//!
//! mock runtime 下走与生产完全同款的 `build_float_window` builder 路径：
//! 创建 → URL 正确性验证（External 内核 URL，非 file:// / 非 data: / 非空——
//! 白屏根因反锚）→ 关闭 → 销毁验证。
//!
//! 「打开不卡死」无法在 mock runtime 里复现真实 WebView2 建窗的死锁，等价拆解为：
//! 1. 建窗函数（build_*）生命周期 + URL 正确性（本文件）；
//! 2. 建窗移出同步线程的形态锚点（windows.rs 单测
//!    float_window_creation_threaded_shape：std::thread::Builder + build_float_window）。
//!
//! 宠物窗（pet_* / build_pet_window / open_pet_window）已于 2026-10 随
//! harness-pet 插件退役整体下线，本文件同名旧称随之改为 float_window。

use dsh_tauri_app::windows::{build_float_window, open_float_window};
use tauri::Manager;

const KERNEL: &str = "http://127.0.0.1:51731/";

fn kernel_url() -> tauri::Url {
    KERNEL.parse::<tauri::Url>().expect("合法内核 URL")
}

#[test]
fn float_window_create_verify_close_lifecycle() {
    let app = tauri::test::mock_app();
    let handle = app.handle().to_owned();

    let win = build_float_window(&handle, "float-sess-1", kernel_url(), "__DSH_FLOAT__", "")
        .expect("mock runtime 下建浮窗");

    assert_eq!(win.label(), "float-sess-1");

    // URL 正确性：External 内核 URL（非空、非 file://、非 data: 顶层导航）。
    let url = win.url().expect("mock runtime 应能读回 URL").to_string();
    assert_eq!(url, KERNEL, "浮窗 URL 必须是内核 URL（白屏根因反锚）: {url}");
    assert!(!url.starts_with("file://"), "弃 file://: {url}");
    assert!(!url.starts_with("data:"), "弃 data: 顶层导航: {url}");

    // 窗口已在管理器注册（复用路径可见）。
    assert!(handle.get_webview_window("float-sess-1").is_some(), "float 窗应已注册");

    // 关闭语义：destroy 必须成功（无 CloseRequested 拦截 = 默认销毁）。
    win.destroy().expect("销毁浮窗（无拦截 = 默认行为）");
}

/// 复用语义：窗口存在时 open_float_window 只 show 复用，不重复建窗、返回 reused。
#[test]
fn float_window_reuses_existing() {
    let app = tauri::test::mock_app();
    let handle = app.handle().to_owned();
    build_float_window(&handle, "float-sess-1", kernel_url(), "", "").expect("首建");

    let out = open_float_window(&handle, KERNEL, "sess-1").expect("复用路径");
    assert_eq!(out["reused"], serde_json::json!(true), "第二次必须复用: {out}");

    handle.get_webview_window("float-sess-1").expect("复用不销毁").close().unwrap();
}
