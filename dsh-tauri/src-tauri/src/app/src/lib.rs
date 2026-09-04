//! # dsh-tauri-app —— 装配根
//!
//! 只做接线（#121「main 仅接线」原则）：
//! 状态装配 → 主窗（loading）→ supervisor 事件路由（就绪换页/崩溃恢复页/托盘通知）
//! → 桥 command 全量注册 → 托盘 → 退出清理（同步杀树）。
//!
//! 业务逻辑全部在 crates/ 与 sidecar/。
//!
//! 运行形态：
//! - 默认：loading 页 → sidecar boot → 内核拉起 → 就绪换页到内核 Web UI；
//! - `DSH_TAURI_POC=1`：PoC 回归模式（不拉内核，加载 PoC 页，Phase 0 验收复用）。

mod commands;
mod pages;
mod poc_page;
// pub 供 tests/（session_notify_boundary.rs 等对抗测试）走纯函数契约
// （N2 P1-D：模块头承诺的 pub 契约此前被私有 mod 挡住）。
pub mod session_notify;
mod supervisor;
// pub 供 tests/sponsor_window.rs 集成测试走生产同款建窗路径（mock runtime）。
pub mod windows;
// C3 极早期日志：boot-early.log / 封顶追加 / panic hook 最早落盘（logging.rs）。
mod logging;

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use supervisor::{Supervisor, SupervisorEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

/// supervisor 的共享句柄。
pub type SupervisorHandle = Arc<Supervisor>;

/// 桥侧运行时状态。
pub struct AppState {
    pub supervisor: Mutex<Option<SupervisorHandle>>,
    pub loading_url: Mutex<String>,
    pub recovery_url: Mutex<String>,
    pub heartbeats: AtomicU32,
    /// **主窗专属**心跳计数（M1，2026-08「多子代理白屏」）：垫片注入所有
    /// 窗口（浮窗/宠物窗照发 renderer_heartbeat），全局 `heartbeats` 会被
    /// 其他窗口淹没——主窗渲染进程单独死亡（多子代理 OOM 崩溃形态）时全局
    /// 计数照常增长，停摆判定（watch_renderer_heartbeat）与 C2c 探针永远
    /// 误判「页面活着」。主窗页面的死活必须盯主窗自己的心跳。
    pub hb_main: AtomicU32,
    /// 主窗页面**自报** hidden（F3，2026-08）：心跳载荷携带 document.hidden。
    /// 原生窗口可见≠页面可见——被其他窗口完全遮挡/锁屏/RDP 断开时 Win32
    /// is_visible 恒真，只有页面（Chromium 原生遮挡跟踪）知道自己在 hidden。
    pub hb_page_hidden: std::sync::atomic::AtomicBool,
    pub page_errors: AtomicU32,
    pub current_session: Mutex<Option<String>>,
    pub last_port: AtomicU32,
    pub paths: shell_core::DshPaths,
    /// supervisor 事件通道（restart_service 复用，保证换页/恢复页路由不断链）。
    pub supervisor_tx: Mutex<Option<std::sync::mpsc::Sender<SupervisorEvent>>>,
    /// 内核装配失败原因（supervisor 未建立时恢复页展示；None = 正常）。
    pub boot_error: Mutex<Option<String>>,
    /// 余额链状态（commands/balance.rs：事件载荷缓存 + in-flight 去重）。
    pub balance: commands::balance::BalanceState,
}

impl AppState {
    fn empty() -> Self {
        Self {
            supervisor: Mutex::new(None),
            loading_url: Mutex::new(String::new()),
            recovery_url: Mutex::new(String::new()),
            heartbeats: AtomicU32::new(0),
            hb_main: AtomicU32::new(0),
            hb_page_hidden: std::sync::atomic::AtomicBool::new(false),
            page_errors: AtomicU32::new(0),
            current_session: Mutex::new(None),
            last_port: AtomicU32::new(0),
            paths: shell_core::DshPaths::resolve(),
            supervisor_tx: Mutex::new(None),
            boot_error: Mutex::new(None),
            balance: commands::balance::BalanceState::new(),
        }
    }
}

/// 测试用 env 互斥的规范锁已迁至 logging::ENV_LOCK（ta9/ta4 以 #[path] 包含
/// logging.rs 时 crate:: 指向测试 crate，lib 内定义的锁在那两个编译单元不可达）。

/// 进程级单实例锁（退出时 Drop 删锁文件；强杀残留由陈锁回收逻辑兜底）。
static INSTANCE_LOCK: std::sync::Mutex<Option<shell_core::SingleInstanceGuard>> = std::sync::Mutex::new(None);

/// 退出竞态闸门（tao "cannot move state from Destroyed" panic 实测修复，
/// boot-early.log 2026-08-31）：托盘「退出」先 shutdown() 杀内核 →
/// app.exit(0) 拆 tao 事件循环，此刻内核就绪线程仍在飞的 KernelReady
/// 若照常走触窗链（eval/show/focus/start_watcher/start_balance_loop），
/// 对已 Destroyed 的事件循环戳窗口即 panic（与「内核退出 code=None」同秒）。
/// 所有退出路径先置位；route_one_event 退出态只留日志直通。
static EXITING: AtomicBool = AtomicBool::new(false);

/// 保存主窗状态——**window-state.json（Electron 同文件同 schema）**：
/// 升级用户窗口位置不丢，回退 Electron 也不丢（双向兼容，contracts 见
/// shell-core/src/upgrade.rs 数据契约表）。
pub fn save_window_state(state: &AppState, (x, y, w, h, maxed): (i32, i32, f64, f64, bool)) -> Result<(), bridge::BridgeError> {
    let ws = shell_core::WindowState { x, y, width: w, height: h, maximized: maxed };
    let file = window_state_file(state);
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| bridge::BridgeError::internal(e.to_string()))?;
    }
    // 原子写（tmp+rename），与 Electron writeFileAtomic 同语义。
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, ws.to_legacy_json()).map_err(|e| bridge::BridgeError::internal(e.to_string()))?;
    std::fs::rename(&tmp, &file).map_err(|e| bridge::BridgeError::internal(e.to_string()))?;
    Ok(())
}

/// window-state.json 路径（userData 根，与 Electron windowStateFile() 一致）。
fn window_state_file(state: &AppState) -> std::path::PathBuf {
    state.paths.app_data.join("window-state.json")
}
fn load_window_state(state: &AppState) -> Option<(i32, i32, f64, f64, bool)> {
    let file = window_state_file(state);
    let raw = std::fs::read_to_string(file).ok()?;
    let ws = shell_core::WindowState::parse_legacy(&raw)?;
    Some((ws.x, ws.y, ws.width, ws.height, ws.maximized))
}
/// 全局 panic hook：panic 落盘到日志目录（不静默消失），进程存活优先。
/// 兼容性原则：任何意外数据/时序都以日志收场，绝不让客户端整个消失。
fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = format!(
            "[panic] thread={:?} location={:?} payload={}",
            std::thread::current().name(),
            info.location().map(|l| l.to_string()),
            supervisor::panic_payload_str(info.payload()),
        );
        eprintln!("{msg}");
        // 落盘（失败仅 stderr——hook 里不允许再 panic）。
        let dir = shell_core::DshPaths::resolve().logs;
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::OpenOptions::new().create(true).append(true)
            .open(dir.join("panics.log"))
            .and_then(|mut f| {
                use std::io::Write;
                writeln!(f, "{} {msg}", chrono_like_now())
            });
        default(info);
    }));
}

/// 无依赖时间戳（年-月-日 时:分:秒，UTC）。算法单一来源：`shell_core::time`。
fn chrono_like_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    shell_core::time::format_unix_secs(secs)
}

/// 便携版 userData 重定向（Electron main.js:5317 同语义，检测逻辑在
/// shell_core::upgrade::portable_user_data_dir：PORTABLE_EXECUTABLE_DIR 环境
/// 优先，否则 exe 同级 portable.marker）。重定向方式：环境变量注入
///（shell-core paths 的覆盖通道复用，语义 = Electron app.setPath('userData')）。
///
/// 调用时机红线：必须在 run() 第一行、**早于 early_log/panic hook**——否则
/// 首行 boot-early.log 与 pre-setup panic 会落到宿主 %APPDATA%\dsh-desktop，
/// 便携「数据随 exe 走（data/）」语义被最早的日志打破，且崩溃取证被劈成
/// AppData 与 data/ 两处（v0.5.x 便携实测形态）。幂等：非便携态零副作用。
fn apply_portable_user_data_redirect() {
    if let Some(portable) = shell_core::upgrade::portable_user_data_dir() {
        std::env::set_var("DSH_TAURI_USERDATA", &portable);
        eprintln!("[upgrade] 便携版运行：userData → {}", portable.display());
    }
}

/// Linux 白屏根治（WebKitGTK DMABUF 渲染协商失败）：Arch 等滚动发行版的
/// webkit2gtk 2.4x 与 NVIDIA / 部分驱动在 DMABUF framebuffer 上谈不拢，症状
/// 正是「窗口能开、内容整片纯白」（tauri-apps/tauri#9394；官方 v2 文档
/// develop/debug/linux-graphics）。对策：建任何 webview 前注入
/// `WEBKIT_DISABLE_DMABUF_RENDERER=1`，让 WebKitGTK 走较慢但可靠的渲染路径。
///
/// 保守边界（避免拖累本就正常的机器）：① 仅 Linux 生效（Windows / macOS 不
/// 触碰）；② 用户 / 环境已显式设置该变量（任意非空值，含 "0"）时一律不覆盖
/// ——把最终决定权留给更了解自身显卡的本地用户。纯判定
/// `webkit_should_inject_dmabuf_off` 不做平台门控，供跨平台单测复用。
fn webkit_should_inject_dmabuf_off(existing: Option<&str>) -> bool {
    // None 或纯空白 → 未显式设置 → 注入；任意非空值 → 尊重用户配置，不注入。
    existing.map(str::trim).map_or(true, |v| v.is_empty())
}

/// 按上述策略在 Linux 落地 DMABUF 关闭；非 Linux 编译期为读取判定后即 no-op
/// （两侧均消费 `inject`，无 dead_code 警告）。必须在 tauri::Builder 建窗前调用。
fn apply_linux_webkit_workaround() {
    let inject = webkit_should_inject_dmabuf_off(
        std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").ok().as_deref(),
    );
    #[cfg(target_os = "linux")]
    if inject {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        logging::early_log("[boot] Linux：注入 WEBKIT_DISABLE_DMABUF_RENDERER=1（WebKitGTK 白屏根治，tauri#9394）");
    }
    #[cfg(not(target_os = "linux"))]
    let _ = inject;
}

pub fn run() {
    // C3：极早期落盘——run() 第一行就写 boot-early.log（v0.5.2 真机：进程死在
    // Builder/setup 早期时 logs/ 目录从未被创建，全程零日志）。Builder::build
    // 的 expect panic 也由此 hook 兜底落盘。
    // 顺序：便携重定向在前（便携版首行日志必须落 exe 旁 data/，不得先写宿主
    // %APPDATA%——见 apply_portable_user_data_redirect 时机红线）。
    apply_portable_user_data_redirect();
    logging::early_log("[boot] 壳进程 run() 入口");
    logging::install_early_panic_hook();
    install_panic_hook();
    apply_linux_webkit_workaround();
    let mut builder = tauri::Builder::default();
    // 第二实例拉起（用户双击图标而应用已在跑）：聚焦既有主窗而非报错退出。
    // 必须注册在最前（官方要求）；shell-core 单实例锁保留为跨窗体兜底。
    //
    // 测试隔离门控（DSH_TAURI_TEST_ISOLATION=1）：插件层互斥体名取自编译期
    // identifier（机器全局），不随 DSH_HOME/DSH_TAURI_USERDATA 沙箱化——机器上
    // 已有任一同标识实例（如正式安装版）时，隔离测试件会被误判为第二实例秒退
    // （实测：target/release 冒烟与 smoke-installed.sh 在正式版运行期间全灭）。
    // 门控下仅依赖 shell-core 文件锁（随 userdata 隔离），生产路径零变化。
    if std::env::var("DSH_TAURI_TEST_ISOLATION").ok().as_deref() != Some("1") {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }
    // C1：会话完成通知点击跳转兜底——tauri-plugin-notification 2.3.3 桌面无
    // 点击回调（action_type_id 仅 mobile），通知发出时记录「最近通知的会话」，
    // 主窗重新聚焦且在新鲜度窗内即补发 notification-jump（垫片已监听该事件，
    // bridge-shim.js:78）。限定主窗：浮窗/宠物窗聚焦不得触发跳转。
    builder = builder.on_window_event(|window, event| {
        if window.label() == "main" {
            if let tauri::WindowEvent::Focused(true) = event {
                session_notify::on_main_window_focused(window.app_handle());
            }
        }
    });
    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Phase 1
            commands::app_init,
            commands::window_control,
            commands::menu_action,
            commands::copy_text,
            commands::open_external,
            commands::file_open,
            commands::page_error,
            commands::renderer_heartbeat,
            commands::current_session,
            commands::restart_service,
            commands::recovery_state,
            commands::recovery_reload,
            commands::recovery_restart,
            commands::recovery_open_logs,
            commands::sponsor_window,
            commands::float_window,
            commands::float_close,
            // Phase 2
            commands::plugin_list,
            commands::plugin_set_enabled,
            commands::plugin_uninstall,
            commands::plugin_restore,
            commands::plugin_check_updates,
            commands::plugin_update,
            commands::plugin_list_dead_entries,
            commands::plugin_remove_dead_entries,
            // Phase 3
            commands::file_revert,
            commands::image_paste_save,
            commands::balance_refresh,
            commands::diag_run,
            commands::diag_export,
            commands::diag_validate,
            commands::diag_order,
            commands::diag_order_apply,
            commands::diag_remove_bundle,
            commands::backup_export,
            commands::backup_restore,
            commands::wsl_config_get,
            commands::wsl_config_save,
            commands::wsl_recheck,
            commands::guard_action,
            commands::pet_window,
            commands::pet_close,
            commands::pet_move_to,
            commands::pet_set_auto_open,
            commands::sponsor_qr,
            // PoC 工具（非契约成员）
            commands::poc_echo_json,
        ])
        .build(tauri::generate_context!())
        .expect("tauri 构建")
        .run(|app, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } => {
                    // 退出竞态闸门：关窗/托盘退出/Cmd+Q 汇聚点，先于一切收尾置位。
                    EXITING.store(true, Ordering::Release);
                    // 问题 2：退出前保存主窗状态——用户调整尺寸/位置后直接走
                    // 托盘「退出」/ Cmd+Q 时不再丢。窗口可能已销毁（closeToTray
                    // =false 关窗即退），save_main_window_state 内部 if let 容错，
                    // 读不到就跳过，绝不 panic。
                    windows::save_main_window_state(app);
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                            sv.shutdown();
                        }
                    }
                    // C1：退出收割 session watcher 子进程（幂等）。
                    session_notify::shutdown_watcher();
                }
                tauri::RunEvent::Exit => {
                    // 兕底置位（ExitRequested 已置时幂等；覆盖未经该事件的退出形态）。
                    EXITING.store(true, Ordering::Release);
                    // std::process::exit 不跑 Drop：锁与内核树在此显式收尾
                    //（Review#2：exit(0) 后锁残留实测）。
                    windows::save_main_window_state(app);
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                            sv.shutdown();
                        }
                    }
                    // C1：退出收割 session watcher 子进程（幂等；RunEvent::Exit
                    // 为进程收尾必经点）。
                    session_notify::shutdown_watcher();
                    if let Some(mut g) = INSTANCE_LOCK.lock().unwrap_or_else(|p| p.into_inner()).take() {
                        g.release();
                    }
                }
                // macOS 点 Dock 图标重开（Reopen = NSApplicationDelegate 的
                // applicationShouldHandleReopen）：关窗到托盘时主窗只是 hide
                // （进程常驻、内核继续跑），无可见窗口时点 Dock 会派发 Reopen——
                // 此前无此分支，隐藏主窗无法被唤回，只能重启 app。三件套与托盘
                // show_main 同口径（show 能唤回 closeToTray 藏起的窗口）；拿不到
                // 主窗（异常态）静默跳过，不 panic。
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
                _ => {}
            }
        });
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // ---- 升级适配：便携版 userData 重定向（Electron main.js:5317 同语义）----
    // 已在 run() 第一行完成（apply_portable_user_data_redirect）——此处不再
    // 重复：任何 userData 路径读取（paths/锁/日志）之前必须已重定向。
    // C3：目录分裂指针文件——%APPDATA%\DSH Desktop（Electron 内核 userData）
    // 与 WebView2 data 目录各放指路 README（幂等，不迁移任何数据）。
    logging::write_log_pointer_files();
    let state = AppState::empty();
    upgrade_first_run_report(&state);
    // ---- 静态页（loading / recovery / poc）经 preview-server 托管 ----
    let dir = std::env::temp_dir().join(format!("dsh-tauri-pages-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("loading.html"), pages::LOADING_HTML)?;
    std::fs::write(dir.join("recovery.html"), pages::RECOVERY_HTML)?;
    std::fs::write(dir.join("poc.html"), poc_page::POC_PAGE_HTML)?;
    // 静态页服务启动失败（端口耗尽等罕见态）不退出：降级为 data: 内嵌页，
    // 保住「客户端能打开」的底线（无 IPC，仅静态提示 + 日志路径）。
    let (loading_url, recovery_url) = match preview_server::PreviewServer::start(&dir) {
        Ok(srv) => {
            let l = srv.url("loading.html");
            let r = srv.url("recovery.html");
            std::mem::forget(srv);
            (l, r)
        }
        Err(e) => {
            eprintln!("[pages] preview-server 启动失败（降级 data: 内嵌页）: {e}");
            let html = format!(
                "<!doctype html><meta charset=\"utf-8\"><body style=\"font:14px system-ui;background:#0b1220;color:#d7dde4;display:flex;align-items:center;justify-content:center;height:100vh\"><div style=\"max-width:520px\">静态页服务启动失败，请查看日志目录：<br>{}<br>重启应用可重试。</div></body>",
                shell_core::DshPaths::resolve().logs.display()
            );
            let url = format!("data:text/html;charset=utf-8,{}", percent_encode(&html));
            (url.clone(), url)
        }
    };
    *state.loading_url.lock().unwrap_or_else(|p| p.into_inner()) = loading_url.clone();
    *state.recovery_url.lock().unwrap_or_else(|p| p.into_inner()) = recovery_url.clone();

    // ---- 单实例锁 ----
    let paths = shell_core::DshPaths::resolve();
    let guard = shell_core::SingleInstanceGuard::acquire(paths.app_data.join("single-instance.lock"))
        .map_err(|_| "DSH Desktop 已在运行")?;
    *INSTANCE_LOCK.lock().unwrap_or_else(|p| p.into_inner()) = Some(guard);

    // ---- 主窗 ----
    let poc_mode = std::env::var("DSH_TAURI_POC").ok().as_deref() == Some("1");
    let saved = load_window_state(&state);
    let initial_url = if poc_mode {
        loading_url.replace("loading.html", "poc.html")
    } else {
        loading_url.clone()
    };
    #[allow(unused_variables)]
    let main_win = windows::create_main_window(app.handle(), &initial_url, saved)?;
    // ---- 文件拖放接线（F1，2026-08）----
    // dragDropEnabled 默认 true（tauri-utils WindowConfig 默认；windows.rs
    // 建主窗未关闭）：wry 在 WebView2 上注册 OLE DropTarget 并
    // SetAllowExternalDrop(false)——页面 HTML5 drop 收不到外部文件
    // （dsh-file-drop 插件在桌面端此前完全失效）。原生 DragDropEvent 在
    // Rust 侧带完整路径 → route_drag_drop 过滤/分类后 app.emit
    // CLIENT_FILE_DROP_EVENT 广播全窗口，bridge 垫片转发为页面级 window
    // CustomEvent `client-file-drop`（dsh-file-drop 插件经
    // window.addEventListener 消费；契约见文件尾部「文件拖放」段）。
    // on_window_event 追加式注册，与 windows.rs 既有监听
    //（Resized/CloseRequested）并存。
    {
        let dd_handle = app.handle().clone();
        main_win.on_window_event(move |e| {
            if let tauri::WindowEvent::DragDrop(ev) = e {
                route_drag_drop(&dd_handle, ev);
            }
        });
    }
    // 诊断开关：DSH_TAURI_DEVTOOLS=1 打开 DevTools（debug build）。
    if std::env::var("DSH_TAURI_DEVTOOLS").ok().as_deref() == Some("1") {
        #[cfg(debug_assertions)]
        main_win.open_devtools();
    }

    // ---- supervisor（PoC 模式不起内核）----
    // 兼容性第一原则：内核装配失败（安装产物缺 dsh-desktop / vendor 残缺 /
    // 任何不兼容形态）绝不让进程退出——主窗转恢复页展示原因与重试入口，
    // 客户端必须能打开。
    app.manage(state);

    if !poc_mode {
        if let Err(e) = start_supervisor(app.handle().clone()) {
            eprintln!("[boot] 内核装配失败（主窗转恢复页，不退出）: {e}");
            let state = app.state::<AppState>();
            *state.boot_error.lock().unwrap_or_else(|p| p.into_inner()) = Some(e);
            let recovery = state.recovery_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
            let _ = commands::navigate_main(app.handle(), &recovery);
        }
    }

    // 托盘失败不影响主窗可用性（日志告警即止）。
    if let Err(e) = setup_tray(app.handle()) {
        eprintln!("[tray] 初始化失败（不影响主窗）: {e}");
    }

    // 启动重放自定义图标（若有持久化副本 → 应用到主窗+托盘；否则走默认）。
    // 坏图标/解码失败内部已回退默认并日志，绝不阻断启动。
    commands::icon::apply_custom_icon_if_present(app.handle());

    // ---- 客户端更新静默检查（一次性，不阻塞启动；引擎见 commands/updater_client.rs）----
    // 独立线程 + 延迟 15s：不挤占启动关键路径（内核拉起/首屏），也给内核页
    // 挂事件监听留时间；无更新 → 零打扰；离线/失败 → 完全静默（仅日志取证）；
    // 有更新 → emit `client-update-available`（**事件名与载荷契约**：
    // {"current","next","notes","asset":{"name","url","size"},"source":
    // "github"|"gitee"}，U2 垫片消费；webview 若尚未挂监听而错过，可经菜单
    // check-client-update 通道主动再查兜底）。PoC 回归/测试隔离模式不查。
    if !poc_mode && std::env::var("DSH_TAURI_TEST_ISOLATION").ok().as_deref() != Some("1") {
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(15));
            match tauri::async_runtime::block_on(commands::updater_client::check_latest(env!("CARGO_PKG_VERSION"))) {
                Ok(commands::updater_client::CheckOutcome::Available(u)) => {
                    route_log(format!(
                        "[update] 检测到客户端新版本 {} → {}（{}，{}）",
                        u.current, u.next, u.source, u.asset.name
                    ));
                    let _ = handle.emit("client-update-available", &u);
                }
                Ok(commands::updater_client::CheckOutcome::UpToDate) => {}
                Err(e) => route_log(format!("[update] 启动更新检查失败（静默忽略）：{e}")),
            }
        });
    }
    Ok(())
}

/// supervisor 装配 + 启动（setup 与恢复页「重启内核 / 重新加载」共用）。
/// 任何失败只返回 Err(String)，由调用方转恢复页或回显——进程绝不退出。
fn start_supervisor(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).is_some() {
        return Ok(()); // 已装配（恢复页重试幂等）
    }
    let root = find_repo_root().map_err(|e| e.to_string())?;
    let supervisor = Arc::new(Supervisor::new(&root));
    let (tx, rx) = std::sync::mpsc::channel::<SupervisorEvent>();
    *state.supervisor_tx.lock().unwrap_or_else(|p| p.into_inner()) = Some(tx.clone());
    *state.supervisor.lock().unwrap_or_else(|p| p.into_inner()) = Some(Arc::clone(&supervisor));
    supervisor.spawn_boot(tx, load_preferred_port(&app));
    let handle = app.clone();
    std::thread::spawn(move || route_events(handle, rx));
    *state.boot_error.lock().unwrap_or_else(|p| p.into_inner()) = None;
    Ok(())
}

/// supervisor 事件路由：换页 / 恢复页 / 通知 / 端口记忆。
fn route_events(app: tauri::AppHandle, rx: std::sync::mpsc::Receiver<SupervisorEvent>) {
    // 逐事件 panic 隔离：单事件路由异常不终结路由线程（后续 kernel-ready /
    // 恢复页路由不受影响）——客户端必须能打开原则的事件层延伸。
    while let Ok(ev) = rx.recv() {
        let h = app.clone();
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || route_one_event(&h, ev)));
        if r.is_err() {
            route_log("[route] 事件路由 panic（已隔离，继续处理后续事件）".to_string());
        }
    }
}

/// 路由层日志：stderr + logs/desktop.log 双写（v0.5.2 真机实测：安装态 GUI
/// 子系统无控制台，stderr 无人接收，logs 目录从未被创建——恢复页/托盘的
/// 「打开日志」是空目录，崩溃环与看门狗事件无从取证）。
fn route_log(msg: String) {
    eprintln!("{msg}");
    supervisor::file_log(&msg);
}

// ---------------------------------------------------------------------------
// C2c 重启风暴渲染抑制（2026-08 崩溃环强化）：KernelReady 在「距上次整页
// 换页 < 90s」内不再无条件 navigate——自动重启（崩溃重启/假死受控重启）换
// 新内核时，旧页面脚本往往还活着（SPA 会自行重连新内核），反复整页换页
// 会打断用户输入/滚动位置并重置页面状态。抑制时改发轻量探针（eval 一条
// 经 renderer_heartbeat 通道回执的 invoke），确认页面死了才真正换页。
// ---------------------------------------------------------------------------

/// 上次**内核页**整页换页时刻（Unix ms；恢复页/初始 loading 换页不锚定）。
static LAST_KERNEL_NAV_MS: AtomicU64 = AtomicU64::new(0);
/// 上次换页使用的内核 URL（RV3 P1-2：抑制窗口内若新内核 URL **不同**
/// （WSL `--port 0` 随机端口 / 端口漂移），页面探针活着也必须换页——
/// 否则 SPA 钉死在死端口上且 KernelReady 只来一次，页面永不自愈）。
static LAST_KERNEL_NAV_URL: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
/// 渲染抑制窗口：窗口内的 KernelReady 只探针不换页。
const KERNEL_NAV_SUPPRESS_WINDOW_MS: u64 = 90_000;

/// 抑制窗口判定（纯函数，可单测）。
fn should_suppress_kernel_nav(since_last_nav_ms: u64) -> bool {
    since_last_nav_ms < KERNEL_NAV_SUPPRESS_WINDOW_MS
}

/// 是否可安全抑制换页：窗口内 **且** URL 未变（URL 变更 = 端口漂移，
/// 抑制会把页面钉死在死端口上——RV3 P1-2）。
fn suppressible(since_last_nav_ms: u64, url_changed: bool) -> bool {
    should_suppress_kernel_nav(since_last_nav_ms) && !url_changed
}

/// KernelReady 换页入口（C2c）：
/// - 距上次换页 ≥ 90s（或首次）/ URL 变更 → 直接整页换页；
/// - 窗口内且 URL 相同 → 后台线程发轻量探针（心跳计数增量回执）：页面活
///   → 跳过换页（日志留痕）；死了 → 换页。探针异步，不阻塞事件路由线程。
fn kernel_ready_navigate(app: tauri::AppHandle, url: String) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_KERNEL_NAV_MS.load(Ordering::Relaxed);
    let url_changed = {
        let guard = LAST_KERNEL_NAV_URL.lock().unwrap_or_else(|p| p.into_inner());
        guard.as_deref().is_some_and(|prev| prev != url)
    };
    if url_changed {
        route_log(format!("[route] 内核 URL 变更（端口漂移），跳过渲染抑制直接换页（{url}）"));
    }
    if !suppressible(now.saturating_sub(last), url_changed) {
        LAST_KERNEL_NAV_MS.store(now, Ordering::Relaxed);
        *LAST_KERNEL_NAV_URL.lock().unwrap_or_else(|p| p.into_inner()) = Some(url.clone());
        let _ = commands::navigate_main(&app, &url);
        return;
    }
    std::thread::spawn(move || {
        let Some(state) = app.try_state::<AppState>() else { return };
        let Some(w) = app.get_webview_window("main") else { return };
        // 探针回执盯主窗专属计数 hb_main（M1）：探针 eval 打进主窗，回执也
        // 只该来自主窗——全局计数会被浮窗/宠物窗心跳淹没（主窗死、浮窗活
        // 时探针被误判「页面活」→ 跳过换页 → 主窗钉死白屏）。
        let before = state.hb_main.load(Ordering::Relaxed);
        // 轻量探针：页面向壳回发一次心跳计数（bridge 垫片 renderer_heartbeat
        // 通道——内核页有 __TAURI_INTERNALS__ invoke 能力）。
        let _ = w.eval("try{window.__TAURI_INTERNALS__.invoke('renderer_heartbeat',{})}catch(e){}");
        std::thread::sleep(std::time::Duration::from_millis(800));
        if state.hb_main.load(Ordering::Relaxed) > before {
            route_log(format!("[route] 重启风暴渲染抑制：距上次换页 <{KERNEL_NAV_SUPPRESS_WINDOW_MS}ms 且页面存活，跳过整页换页（{url}）"));
        } else {
            route_log(format!("[route] 重启风暴渲染抑制：页面探针无响应，执行整页换页（{url}）"));
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            LAST_KERNEL_NAV_MS.store(now, Ordering::Relaxed);
            *LAST_KERNEL_NAV_URL.lock().unwrap_or_else(|p| p.into_inner()) = Some(url.clone());
            let _ = commands::navigate_main(&app, &url);
        }
    });
}

fn route_one_event(app: &tauri::AppHandle, ev: SupervisorEvent) {
    // 退出竞态闸门：置位后仍在飞的事件（内核收割/就绪线程最后一批）只留
    // 日志直通，跳过全部触窗与子系统拉起动作——KernelReady 的 eval/show/
    // watcher/balance 链对已 Destroyed 的 tao 事件循环操作 = EARLY-PANIC
    // 实测形态（boot-early.log 2026-08-31）。
    if EXITING.load(Ordering::Acquire) {
        route_log("[route] 退出中，丢弃在飞 supervisor 事件（触窗动作已跳过）".to_string());
        return;
    }
    match ev {
            SupervisorEvent::BootStep { name, ok, ms, error } => {
                // boot 步骤结果必须落日志（此前只 emit 给 loading 页不打日志，
                // 「启动受阻」类误报在 app.log 中不可见、无法取证）。
                if ok {
                    route_log(format!("[route] boot 步骤 {name} OK（{ms}ms）"));
                } else {
                    route_log(format!("[route] boot 步骤 {name} FAIL（{ms}ms）: {}", error.as_deref().unwrap_or("未知失败")));
                }
                let _ = app.emit("boot-step", serde_json::json!({ "name": name, "ok": ok, "ms": ms, "error": error }));
            }
            SupervisorEvent::KernelReady { url, port } => {
                let _ = app.emit("kernel-ready", serde_json::json!({ "url": url }));
                if let Some(state) = app.try_state::<AppState>() {
                    state.last_port.store(port as u32, Ordering::Relaxed);
                    // 端口稳定化记忆（下次启动优先复用 → origin 稳定 → localStorage 偏好不丢）。
                    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
                    let _ = store.set("lastWebPort", serde_json::json!(port));
                }
                // C2c：重启风暴渲染抑制（窗口内探针确认页面活，死了才整页换页）。
                kernel_ready_navigate(app.clone(), url.clone());
                if let Some(w) = app.get_webview_window("main") {
                    let diag_base = { let u = app.state::<AppState>().loading_url.lock().unwrap_or_else(|p| p.into_inner()).clone(); let mut o = String::new(); if let Some(pos) = u.rfind('/') { o = u[..pos].to_string(); } o };
                    match w.eval(format!("window.__DIAG_BASE__={:?}; window.__TAURI_INTERNALS__.invoke('current_session',{{sessionId:'[diag] t0'}}).then(function(){{fetch(window.__DIAG_BASE__+'/__diag/t0-invoke-OK')}},function(err){{fetch(window.__DIAG_BASE__+'/__diag/t0-invoke-REJECT-'+encodeURIComponent(String(err&&err.message||err)))}})", diag_base)) {
                        Ok(_) => route_log("[diag] t0 eval OK".to_string()),
                        Err(e) => route_log(format!("[diag] t0 eval ERR: {e}")),
                    }
                }
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                // renderer 心跳监测（Electron RendererRecovery 语义）：页面挂死自动重载。
                watch_renderer_heartbeat(app.clone());
                // 余额轮询环（Electron startBalanceLoop 语义：首刷延迟 500ms +
                // 3 分钟轮询 + 最小化暂停 + 恢复补刷；幂等重入——代数守卫防线程累积）。
                commands::balance::start_balance_loop(app.clone());
                // C1：会话完成通知链（Electron main.js:6337 boot 成功后
                // new SessionWatcher(...).start() 的同点位）——vendor node 直起
                // payload 根级 session-watcher.js（stdout 行协议），崩溃退避
                // 重启/退出收割见 session_notify.rs；幂等（代数守卫）。
                // 测试隔离模式不拉真 node 子进程。
                if std::env::var("DSH_TAURI_TEST_ISOLATION").ok().as_deref() != Some("1") {
                    session_notify::start_watcher(app.clone());
                }
                // 诊断探针（DSH_TAURI_DIAG=1）：换页 10s 后抓 dialog/composer/console 状态。
                inject_diag_probe(app.clone());
            }
            SupervisorEvent::KernelExit { code, .. } => {
                route_log(format!("[route] 内核退出 code={code:?}"));
            }
            SupervisorEvent::CrashLoop { crashes } => {
                // 崩溃环路由此前零日志：真机排障时「频繁重启」在日志里不可见。
                route_log(format!("[route] 崩溃环触发（累计 {crashes} 次），主窗转恢复页"));
                let _ = app.emit("kernel-fail", serde_json::json!({ "reason": "内核反复异常退出" }));
                if let Some(state) = app.try_state::<AppState>() {
                    let recovery = state.recovery_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
                    let _ = commands::navigate_main(app, &recovery);
                }
                let _ = app.notification().builder()
                    .title("DSH Desktop")
                    .body("内核服务反复异常退出，已进入恢复模式")
                    .show();
            }
            SupervisorEvent::ProbeFailed { consecutive } => {
                route_log(format!("[route] 探活失败 ×{consecutive}"));
            }
            SupervisorEvent::ZombieSuspect { consecutive } => {
                // 假死形态（#122/#129）：TCP 通、HTTP 无响应——日志可区分于崩溃重启。
                route_log(format!("[route] 内核假死可疑 ×{consecutive}（端口通、HTTP 无响应）"));
            }
            SupervisorEvent::StateChanged(_) => {}
        }
}

fn load_preferred_port(app: &tauri::AppHandle) -> Option<u16> {
    let state = app.try_state::<AppState>()?;
    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
    store.get("lastWebPort").ok()?.and_then(|v| v.as_u64()).and_then(|p| u16::try_from(p).ok())
}

/// 候选目录逐个判定：含 <dir>/dsh-desktop/vendor/node 即视为仓库根/安装根。
fn locate_repo_root(candidates: &[std::path::PathBuf]) -> Option<std::path::PathBuf> {
    candidates.iter().find(|c| c.join("dsh-desktop").join("vendor").join("node").exists()).cloned()
}

/// 内核目录定位（多级回退；找不到只 Err，绝不退出——客户端必须能打开）：
///   1. DSH_TAURI_REPO_ROOT 显式覆盖（诊断/测试）；
///   2. 开发态：CARGO_MANIFEST_DIR 向上（编译检出内 dsh-desktop）；
///   3. 打包态：exe 所在目录向上，含 resources/ 子布局（安装根/dsh-desktop
///      与 安装根/resources/dsh-desktop 两种产物形态）。
///
/// CARGO_MANIFEST_DIR 是编译机绝对路径，在用户机上必然不存在——打包态
/// 只有 exe 相对布局可靠。
/// exe 向上每一跳生成两个候选：`<dir>/resources`（安装根/resources/dsh-desktop
/// 形态——v0.5.x 便携版 zip 与部分安装器布局）与 `<dir>` 本身（安装根
/// /dsh-desktop 形态——NSIS 安装版 exe 与 payload 同级）。
/// 独立成函数仅为可测（find_repo_root 用 current_exe 无法在单测里模拟布局）。
fn exe_walk_candidates(exe: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    let mut cur = exe.parent().map(|p| p.to_path_buf());
    while let Some(d) = cur {
        candidates.push(d.join("resources"));
        candidates.push(d.clone());
        cur = d.parent().map(|p| p.to_path_buf());
    }
    candidates
}

fn find_repo_root() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    if let Ok(root) = std::env::var("DSH_TAURI_REPO_ROOT") {
        let p = std::path::PathBuf::from(&root);
        if p.join("dsh-desktop").join("vendor").join("node").exists() {
            return Ok(p);
        }
        return Err(format!("DSH_TAURI_REPO_ROOT={root} 不含 dsh-desktop/vendor/node").into());
    }
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    // exe 相对布局优先：安装产物必须用自己的 payload——编译机路径若排在
    // 前面，「编译机=测试机」场景会用仓库检出遮蔽安装目录，实装验证失真。
    // 开发态不受影响：target/debug 本就在仓库内，向上走必然命中仓库根。
    if let Ok(exe) = std::env::current_exe() {
        candidates.extend(exe_walk_candidates(&exe));
    }
    // 开发态兜底：CARGO_MANIFEST_DIR（编译机绝对路径）向上。
    let mut dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for _ in 0..6 {
        candidates.push(dir.clone());
        if !dir.pop() {
            break;
        }
    }
    locate_repo_root(&candidates)
        .ok_or_else(|| "未找到内核目录 dsh-desktop（开发检出与安装产物布局均未命中；可设 DSH_TAURI_REPO_ROOT 指定）".into())
}

/// 极简百分号编码（data: URL 降级页用；UTF-8 字节逐个转义即可）。
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 托盘：显示主窗 / 打开日志 / 退出（退出前同步杀树）。
fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    /// 唤起主窗三件套——「显示主窗口」菜单项与托盘左键单击共用（不得复制两份）。
    /// 幂等：已显示/已置前时再调无感，兼作双击防抖（见 on_tray_icon_event）。
    /// show 在前：closeToTray 藏起的窗口也由此唤回；拿不到主窗时静默。
    fn show_main(app: &tauri::AppHandle) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }

    let menu = tauri::menu::MenuBuilder::new(app)
        .text("show", "显示主窗口")
        .text("logs", "打开日志")
        .text("acp-selftest", "ACP 自检")
        .text("acp-config", "ACP 配置（Zed）")
        .separator()
        .text("restart", "一键重启")
        .text("quit", "退出")
        .build()?;
    let tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().ok_or("无应用图标")?)
        .tooltip("DSH Desktop")
        .menu(&menu)
        // 平台惯例：mac 托盘左键=弹菜单（macOS 惯例，保持现状）；Win/Linux
        // 左键=直接唤起主窗、右键才弹菜单——桌面右下角主流习惯（用户反馈）。
        // 运行时 cfg! 单链分支：布尔即平台差异全貌，无需复制两份 builder 链。
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "show" => show_main(app),
            "logs" => {
                // 跨平台开启器（explorer/open/xdg-open）——此前仅 Windows 拉
                // explorer，mac/linux 托盘「打开日志」点了没反应。
                let dir = shell_core::DshPaths::resolve().logs;
                let _ = std::fs::create_dir_all(&dir);
                let _ = commands::open_in_explorer(&dir);
            }
            "acp-selftest" => {
                // ACP 托管①：代跑一次 initialize 握手验证物料/路径健康。握手是
                // 秒级 IO（首跑还含 profile 物料初始化），放后台线程——托盘回调
                // 在事件循环线程，阻塞会冻住全部窗口消息。结果走通知+日志。
                let app2 = app.clone();
                std::thread::spawn(move || {
                    let sv = app2.try_state::<AppState>()
                        .and_then(|s| s.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone());
                    let Some(sv) = sv else {
                        route_log("[acp] supervisor 未就绪，自检取消".to_string());
                        return;
                    };
                    route_log("[acp] 自检开始：spawn --profile acp 做 initialize 握手".to_string());
                    let body = match commands::acp::run_selftest(&sv) {
                        Ok(summary) => {
                            route_log(format!("[acp] 自检通过：{summary}"));
                            format!("ACP 服务就绪：{summary}")
                        }
                        Err(e) => {
                            route_log(format!("[acp] 自检失败：{e}"));
                            format!("ACP 自检失败：{e}")
                        }
                    };
                    let _ = app2.notification().builder().title("DSH Desktop ACP").body(body).show();
                });
            }
            "acp-config" => {
                // ACP 托管②：导出 Zed agent_servers 配置片段（绝对路径）到日志
                // 目录并打开——ACP 协议由外部客户端 spawn server，桌面只负责把
                // 正确的 node/bin.js 路径交给用户。
                let sv = app.try_state::<AppState>()
                    .and_then(|s| s.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone());
                let Some(sv) = sv else {
                    route_log("[acp] supervisor 未就绪，导出取消".to_string());
                    return;
                };
                match commands::acp::export_zed_config(&sv) {
                    Ok(path) => {
                        route_log(format!("[acp] Zed 配置片段已导出：{}", path.display()));
                        let dir = shell_core::DshPaths::resolve().logs;
                        let _ = std::fs::create_dir_all(&dir);
                        let _ = commands::open_in_explorer(&dir);
                        let _ = app.notification().builder().title("DSH Desktop ACP")
                            .body(format!("配置片段已写入：{}（已打开目录，合并进 Zed 设置）", path.display())).show();
                    }
                    Err(e) => {
                        route_log(format!("[acp] 配置导出失败：{e}"));
                        let _ = app.notification().builder().title("DSH Desktop ACP")
                            .body(format!("ACP 配置导出失败：{e}")).show();
                    }
                }
            }
            "restart" => {
                // 一键重启（托盘右键）：整应用退出并重新拉起——与 quit 同序，
                // 先置退出闸门、shutdown 杀内核整树防孤儿 node 进程，再调
                // Tauri 2 原生 AppHandle::restart() 重执行二进制（无需插件）。
                // 用于让新 bundle / 兼容层补丁按 rev 缓存刷新生效（免手动退出重开）。
                EXITING.store(true, Ordering::Release);
                if let Some(state) = app.try_state::<AppState>() {
                    if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                        sv.shutdown();
                    }
                }
                app.restart();
            }
            "quit" => {
                // 先置位退出闸门再 shutdown：shutdown 杀内核到 app.exit 拆
                // 事件循环之间，在飞事件不得再触窗（EXITING 静态注释）。
                EXITING.store(true, Ordering::Release);
                if let Some(state) = app.try_state::<AppState>() {
                    if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                        sv.shutdown();
                    }
                }
                app.exit(0);
            }
            _ => {}
        })
        // 左键唤起主窗（非 macOS）。双击防抖策略：Windows 双击序列连发
        // Click(Up)→DoubleClick（首击即已唤起），三件套幂等 → 重复调用无
        // 视觉抖动，无需抑制计时器。macOS 早退：左键已让位给菜单（平台惯例）。
        // Linux(appindicator 后端)不派发图标点击事件，右键菜单仍由后端弹出。
        .on_tray_icon_event(|tray, ev| {
            if cfg!(target_os = "macos") {
                return;
            }
            match ev {
                tauri::tray::TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Left,
                    button_state: tauri::tray::MouseButtonState::Up,
                    ..
                }
                | tauri::tray::TrayIconEvent::DoubleClick {
                    button: tauri::tray::MouseButton::Left,
                    ..
                } => show_main(tray.app_handle()),
                _ => {}
            }
        })
        .build(app)?;
    // 托盘生命周期：随进程退出回收；Drop 会摘图标，进程内需常驻 → forget。
    std::mem::forget(tray);
    Ok(())
}

/// 托盘左键行为形态锚点（用户反馈 #T1）：Win/Linux 左键=唤起主窗、右键=菜单；
/// macOS 左键=菜单（平台惯例，保持现状）。include_str 形态断言，CRLF 归一。
#[cfg(test)]
mod tray_behavior_shape {
    /// 仓库检出为 CRLF，锚点统一按 \n 书写。
    fn src() -> String {
        include_str!("lib.rs").replace("\r\n", "\n")
    }

    /// setup_tray 函数体段（首处定义 → forget 常驻行；测试模块自身在段外）。
    fn tray_seg(src: &str) -> &str {
        src.split("fn setup_tray")
            .nth(1)
            .and_then(|s| s.split("std::mem::forget").next())
            .expect("setup_tray 函数体")
    }

    /// 左键弹菜单仅 macOS：cfg! 布尔等价于双分支字面量——mac 求值为 true
    /// （菜单惯例不回归），Win/Linux 为 false（左键留给唤窗）。
    #[test]
    fn left_click_menu_only_on_macos() {
        let src = src();
        let seg = tray_seg(&src);
        assert!(
            seg.contains(".show_menu_on_left_click(cfg!(target_os = \"macos\"))"),
            "show_menu_on_left_click 必须按平台取值：mac=true / Win+Linux=false: {seg}"
        );
    }

    /// 非 macOS 左键唤起主窗：单击(Up)与双击同路由到三件套辅助函数。
    #[test]
    fn left_click_raises_window_via_shared_helper() {
        let src = src();
        let seg = tray_seg(&src);
        assert!(seg.contains("on_tray_icon_event"), "必须挂托盘图标事件处理: {seg}");
        assert!(
            seg.contains("TrayIconEvent::Click")
                && seg.contains("MouseButtonState::Up")
                && seg.contains("TrayIconEvent::DoubleClick")
                && seg.contains("MouseButton::Left"),
            "左键单击(Left/Up)与双击(Left)都要唤起主窗: {seg}"
        );
        // 三件套：show（closeToTray 藏起也能唤回）/unminimize/set_focus。
        for call in ["w.show()", "w.unminimize()", "w.set_focus()"] {
            assert!(seg.contains(call), "主窗唤起三件套缺 {call}: {seg}");
        }
        // mac 早退（空白折叠后匹配，防缩进重排误伤）：左键已让位给菜单。
        let flat = seg.split_whitespace().collect::<Vec<_>>().join(" ");
        assert!(
            flat.contains("if cfg!(target_os = \"macos\") { return;"),
            "macOS 左键不得唤窗（左键=菜单是 mac 托盘平台惯例）: {flat}"
        );
    }

    /// 「显示主窗口」菜单项与左键唤起共用同一辅助函数，禁止复制两份三件套。
    #[test]
    fn show_menu_item_and_left_click_share_helper() {
        let src = src();
        let seg = tray_seg(&src);
        assert_eq!(
            seg.matches("fn show_main(").count(),
            1,
            "唤起辅助函数必须恰好定义一次: {seg}"
        );
        assert_eq!(
            seg.matches("show_main(").count(),
            3,
            "定义 1 处 + 调用 2 处（show 菜单项 / 左键图标事件）: {seg}"
        );
    }

    /// 托盘菜单项不回归（含新增「一键重启」）。
    #[test]
    fn tray_menu_items_unchanged() {
        let src = src();
        let seg = tray_seg(&src);
        for item in ["显示主窗口", "打开日志", "一键重启", "退出"] {
            assert!(seg.contains(item), "托盘菜单项「{item}」不得缺失: {seg}");
        }
    }

    /// 一键重启竞态闸门（对齐 quit）：托盘「一键重启」必须先置位 EXITING、
    /// 再 shutdown 杀内核树，最后 app.restart() 重执行——顺序不可颠倒，
    /// 否则在飞 KernelReady 事件会戳销毁中的窗口（EARLY-PANIC 实测），或
    /// 内核树漏杀留孤儿 node 进程。
    #[test]
    fn restart_arms_exiting_gate_before_shutdown() {
        let src = src();
        let seg = tray_seg(&src);
        let restart = seg.split("\"restart\" =>").nth(1).expect("restart 分支");
        let restart = restart.split("\"quit\" =>").next().expect("restart 分支收尾");
        let gate = restart.find("EXITING.store(true").expect("restart 必须置位退出闸门");
        let shutdown = restart.find("sv.shutdown()").expect("restart 必须收尾 supervisor");
        let relaunch = restart.find("app.restart()").expect("restart 必须调 app.restart 重执行");
        assert!(gate < shutdown, "EXITING 置位必须先于 shutdown（先关竞态窗口）");
        assert!(shutdown < relaunch, "shutdown 杀内核必须先于 app.restart 重执行");
    }

    /// 退出竞态闸门（tao Destroyed panic 实测修复）：托盘「退出」必须先置位
    /// EXITING 再 shutdown——shutdown 杀内核与 app.exit 拆事件循环之间，
    /// 在飞 KernelReady 事件对销毁中的窗口戳 eval/show = EARLY-PANIC 实测。
    #[test]
    fn quit_arms_exiting_gate_before_shutdown() {
        let src = src();
        let seg = tray_seg(&src);
        let quit = seg.split("\"quit\" =>").nth(1).expect("quit 分支");
        let gate = quit.find("EXITING.store(true").expect("quit 必须置位退出闸门");
        let shutdown = quit.find("sv.shutdown()").expect("quit 必须收尾 supervisor");
        assert!(gate < shutdown, "EXITING 置位必须先于 shutdown（先关竞态窗口）");
    }
}


// ---------------------------------------------------------------------------
// Review #1 固化：注册命令面 vs 契约映射表的机器核对（防漂移）
// ---------------------------------------------------------------------------

#[cfg(test)]
mod contract_audit {
    use bridge::commands::CHANNELS;

    /// 从 lib.rs 源码提取 invoke_handler 注册的命令（`commands::name` 形态）。
    fn registered() -> Vec<&'static str> {
        let src = include_str!("lib.rs");
        let segment = src
            .split("generate_handler![")
            .nth(1)
            .and_then(|s| s.split(']').next())
            .expect("invoke_handler 段");
        segment
            .split(|c: char| c.is_whitespace() || c == ',')
            .filter_map(|tok| tok.trim().strip_prefix("commands::"))
            .map(|name| name.trim())
            .filter(|n| !n.is_empty())
            .collect()
    }

    #[test]
    fn every_uncut_contract_command_is_registered() {
        let reg = registered();
        for c in CHANNELS.iter().filter(|c| !c.cut) {
            assert!(
                reg.contains(&c.tauri),
                "契约命令未注册: {}（{}）",
                c.tauri,
                c.electron
            );
        }
    }

    #[test]
    fn no_extra_commands_beyond_contract_and_poc() {
        let known: Vec<&str> = CHANNELS.iter().map(|c| c.tauri).chain(["poc_echo_json"]).collect();
        for r in registered() {
            assert!(known.contains(&r), "注册了契约外命令: {r}（需入契约或移除）");
        }
    }

    #[test]
    fn cut_channel_not_registered() {
        let reg = registered();
        for c in CHANNELS.iter().filter(|c| c.cut) {
            assert!(!reg.contains(&c.tauri), "裁撤命令不得注册: {}（{}）", c.tauri, c.electron);
        }
    }
}

#[cfg(test)]
mod window_state_tests {
    use super::*;

    fn sandbox_env(tag: &str) -> std::path::PathBuf {
        let home = std::env::temp_dir().join(format!("dsh-tauri-ws-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).unwrap();
        std::env::set_var("DSH_TEST_HOME", &home);
        std::env::set_var("DSH_TEST_APPDATA", home.join("appdata"));
        std::env::set_var("DSH_TEST_TMP", home.join("tmp"));
        home
    }

    fn clear_env() {
        std::env::remove_var("DSH_TEST_HOME");
        std::env::remove_var("DSH_TEST_APPDATA");
        std::env::remove_var("DSH_TEST_TMP");
    }

    /// 窗口状态 save→load roundtrip（window-state.json，Electron 同构）。
    #[test]
    fn window_state_roundtrip_and_clamps() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox_env("rt");
        let state = AppState::empty();
        save_window_state(&state, (120, 60, 1280.0, 820.0, true)).unwrap();
        assert_eq!(load_window_state(&state), Some((120, 60, 1280.0, 820.0, true)));
        // 文件名/schema 双断言（升级兼容硬契约）。
        let file = state.paths.app_data.join("window-state.json");
        assert!(file.exists(), "必须落在 window-state.json（Electron 同名）");
        let raw = std::fs::read_to_string(&file).unwrap();
        assert!(raw.contains("\"bounds\"") && raw.contains("\"maximized\""), "Electron schema：{raw}");
        // 坏尺寸（窗口被甩出屏幕的防护）→ None 回退默认。
        save_window_state(&state, (5, 5, 2.0, 1.0, false)).unwrap();
        assert_eq!(load_window_state(&state), None, "非法尺寸应拒绝恢复");
        clear_env();
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 升级场景：Electron 版用户已有 window-state.json → Tauri 版原样恢复。
    #[test]
    fn electron_window_state_upgrades_verbatim() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox_env("upg");
        let state = AppState::empty();
        // Electron 版真实样本（main.js loadWindowState 消费的同 schema）。
        std::fs::create_dir_all(&state.paths.app_data).unwrap();
        std::fs::write(
            state.paths.app_data.join("window-state.json"),
            r#"{"bounds":{"x":331,"y":211,"width":1188,"height":761},"maximized":false}"#,
        )
        .unwrap();
        assert_eq!(load_window_state(&state), Some((331, 211, 1188.0, 761.0, false)), "旧版窗口状态应原样恢复");
        // Tauri 版保存后 Electron 版仍可读（双向）。
        save_window_state(&state, (10, 20, 1024.0, 768.0, true)).unwrap();
        let raw = std::fs::read_to_string(state.paths.app_data.join("window-state.json")).unwrap();
        let ws = shell_core::WindowState::parse_legacy(&raw).expect("回写后 Electron 语义可解析");
        assert_eq!((ws.x, ws.y, ws.width, ws.height, ws.maximized), (10, 20, 1024.0, 768.0, true));
        clear_env();
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 升级场景：旧 settings.json 含裁撤键 → 加载不炸、识别（不删除，可回退）。
    #[test]
    fn legacy_settings_keys_ignored_not_deleted() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox_env("legacy");
        let state = AppState::empty();
        std::fs::create_dir_all(&state.paths.app_data).unwrap();
        let raw = r#"{
  "kernelUpdate": { "skipVersion": "0.1.0-rc.7" },
  "pendingClientUpdate": { "path": "C:\\x.exe", "version": "0.4.1" },
  "skipClientVersion": "0.4.0",
  "lastWebPort": 51731,
  "pet": { "autoOpen": true }
}"#;
        std::fs::write(state.paths.settings.clone(), raw).unwrap();
        let store = shell_core::SettingsStore::new(state.paths.settings.clone());
        let map = store.load().unwrap();
        // 首启报告：识别裁撤键。
        let legacy = shell_core::upgrade::legacy_keys_present(&map);
        assert!(legacy.contains(&"kernelUpdate") && legacy.contains(&"pendingClientUpdate"), "{legacy:?}");
        // 保留键照常消费。
        assert_eq!(map.get("lastWebPort"), Some(&serde_json::json!(51731)));
        assert_eq!(map.get("pet").and_then(|p| p.get("autoOpen")), Some(&serde_json::json!(true)));
        // 不删除：Tauri 写入新键后裁撤键仍在（可安全回退 Electron）。
        store.set("lastWebPort", serde_json::json!(60000)).unwrap();
        let after = store.load().unwrap();
        assert!(after.contains_key("kernelUpdate"), "裁撤键必须原样保留（回退兼容）");
        assert_eq!(after.get("lastWebPort"), Some(&serde_json::json!(60000)));
        clear_env();
        let _ = std::fs::remove_dir_all(&home);
    }
}

/// 升级首启报告（只读，绝不改写用户数据）：识别 Electron 版遗留物并落日志。
/// - settings.json 中的裁撤键（内核更新链/自研客户端更新链）→ 列出并忽略；
/// - window-state.json 存在 → 窗口位置将按 Electron schema 恢复；
/// - ~/.dsh 与 userData 全程不动（升级零迁移：同路径同 schema 直读）。
fn upgrade_first_run_report(state: &AppState) {
    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
    if let Ok(map) = store.load() {
        let legacy = shell_core::upgrade::legacy_keys_present(&map);
        if !legacy.is_empty() {
            eprintln!("[upgrade] 识别到 Electron 版遗留设置键（已忽略，不删除，可安全回退）：{legacy:?}");
        }
    }
    if state.paths.app_data.join("window-state.json").exists() {
        eprintln!("[upgrade] 检测到 Electron 版 window-state.json：窗口位置将原样恢复");
    }
}

/// renderer 心跳监测（Electron RendererRecovery 语义）：换页后 60s 宽限
///（页面加载），此后可见主窗连续 ~40s 心跳零增长 → location.reload()。
/// 覆盖「内核活着但页面白屏/JS 死循环」——dsh 可用优先于页面完美。
///
/// 内存审计（2026-08）：KernelReady 事件在每次内核重启（自动重启 / 假死受控
/// 重启 / restart_service / 恢复页重试）都会触发——且单次 boot 会发两回
/// （stdout 就绪行线程 + 瀑布 on_boot_success）。旧实现每次都 spawn 一个
/// 「永不退出」的监测线程（仅主窗销毁才退），随重启次数只增不减（每次
/// 崩溃环 5 次重启 = 累积 10 线程，各持 AppHandle 每 10s 轮询）。
/// 修法：代数号交替——新监测线程上岗即令旧线程（≤10s 内）自行退出，
/// 任一时刻至多一个活跃监测线程。
static HEARTBEAT_WATCHER_GEN: AtomicU64 = AtomicU64::new(0);

/// 心跳监测循环单次 sleep 的 wall-clock 跳跃阈值（系统休眠/唤醒守卫）。
/// 超过即判定进程被系统挂起过（休眠/合盖/锁屏深睡），心跳基准重锚、恢复梯
/// 复位——不把休眠期间的渲染进程冻结误判为停摆（否则唤醒后「睡了一觉」被
/// 当成 40s 停摆，逐级升级到 reload/navigate/整窗重启）。取 30s = 3 倍于
/// 10s 轮询周期，远大于正常调度抖动（毫秒级~数秒），绝不误伤正常轮询。
const RENDERER_WATCH_SLEEP_JUMP: std::time::Duration = std::time::Duration::from_secs(30);

/// 心跳监测的「页面定时器有效」判定（纯函数，可单测）。
///
/// 不可见（closeToTray 隐藏）**或最小化**的主窗，其页面定时器被 WebView2
/// 节流——Chromium 对 hidden 页面 5 分钟后进入 intensive throttling，
/// `setInterval(heartbeat, 5s)` 实际退化为 ~1 次/分钟。此时心跳缺失不代表
/// 页面挂死，不得计入失联（否则最小化挂后台 ~5 分钟后每 ~40s 被误
/// `location.reload()`——C 路径「后台长挂恢复后页面死/事件断」的壳侧主因，
/// 2026-08 最小化 7 分钟真机复现实证）。与 commands/balance.rs
/// `window_visibility` 同口径：查询失败按「定时器有效」处理（宁可漏判停摆
/// 也不误杀节流中的正常页面；真挂死由内核探活环与下次可见期兜底）。
fn heartbeat_timer_active(visible: Option<bool>, minimized: Option<bool>) -> bool {
    visible.unwrap_or(true) && !minimized.unwrap_or(false)
}

/// 失联豁免联合判定（纯函数，可单测）：原生不可见/最小化 **或** 页面自报
/// hidden（F3 第三形态，2026-08 用户反馈「隔几分钟重新加载一遍」）任一
/// 成立即豁免停摆计数。
///
/// 页面自报 hidden 的必要性：可见且未最小化的窗口仍可能被 WebView2
/// （Chromium 原生遮挡跟踪）判为 hidden——被其他窗口**完全遮挡** / 锁屏 /
/// RDP 断开时，Win32 `is_visible` 恒真、`is_minimized` 恒假，壳侧原生 API
/// 全部失明；页面 hidden 5 分钟后进入 intensive throttling（5s 心跳定时器
/// 退化 ~1/min，甚至冻结），4×10s 停摆判定误开火 → `location.reload()`，
/// 重载后 5 分钟节流宽限一过又复发——用户侧即「隔几分钟重新加载一遍」。
/// 页面 hidden 期间心跳仍低速到达（~1/min，载荷带 hidden=true，见
/// bridge-shim.js 心跳段与 renderer_heartbeat 命令），据此豁免；真挂死由
/// 内核探活环与可见期兜底（同「宁可漏判停摆也不误杀节流页」哲学）。
fn stall_exempt(visible: Option<bool>, minimized: Option<bool>, page_hidden: bool) -> bool {
    !heartbeat_timer_active(visible, minimized) || page_hidden
}

// ---------------------------------------------------------------------------
// M1（2026-08「多子代理后不稳定、直接白屏」根治）：渲染进程崩溃感知恢复梯。
//
// 故障链（证据）：多子代理 = 多会话事件流常驻内核 UI（dsh-client-runtime
// Session.events 只追加无上限、Session 实例 dispose() 恒 no-op 常驻）→ 渲染
// 进程内存随流式事件线性增长 → WebView2 渲染进程 OOM 崩溃 → 页面 JS 引擎
// 整体消亡 → 白屏。此时壳侧**所有 JS 通道都是 no-op**：
//   - wry 0.55.1（webview2/mod.rs）没有任何 CoreWebView2 ProcessFailed 处理
//     ——渲染进程崩溃事件无人监听；
//   - tauri 2.11.5 WebviewEvent 枚举仅 DragDrop（tauri-2.11.5/src/app.rs:202）
//     ——壳侧没有崩溃回调面；
//   - ExecuteScript（= WebviewWindow::eval）目标是渲染进程——进程已死则
//     无处执行；navigate_main 的 location.href eval、旧停摆恢复的
//     location.reload() eval 全部失效。
// 唯一能检测「渲染进程死了」的信号是心跳停摆（垫片 setInterval 随进程消亡），
// 唯一能救活死渲染进程的动作是**浏览器进程级**原语：CoreWebView2.Reload /
// Navigate（tauri WebviewWindow::reload / navigate，wry webview2 直接调
// ICoreWebView2 对应方法，不经渲染进程）。
// ---------------------------------------------------------------------------

/// 渲染层恢复动作（升级梯，纯函数可单测）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RendererRecoveryAction {
    /// 第 1 级：页内 JS reload——页面活着但定时器/事件环挂死时最廉价。
    EvalReload,
    /// 第 2 级：原生 reload（CoreWebView2.Reload）——渲染进程已死、eval
    /// 无处执行时的强恢复。
    NativeReload,
    /// 第 3 级：原生重导航到内核 URL（CoreWebView2.Navigate）——reload 仍
    /// 不奏效的终级重建（渲染进程反复崩溃 / 文档钉死在崩溃错误页等形态）。
    NativeNavigate,
    /// 第 4 级（K3 终态兜底）：**supervisor 级内核重启**——连续 N 次第 3 级
    /// 重导航仍救不活（浏览器进程级重载也救不活的死渲染进程，常见反复
    /// OOM），实证「整窗重启」是唯一有效恢复。经 supervisor kill_kernel +
    /// on_kernel_exit 自动重启链（新内核就绪行线程统一换页/布防心跳监测）。
    KernelRestart,
}

/// 升级梯推进（纯函数，可单测）：停摆连续触发而心跳未恢复时逐级上升，
/// 封顶 NativeNavigate（保持重试，不放弃——白屏必须有人持续救）。
fn next_recovery_action(stage: u32) -> RendererRecoveryAction {
    match stage {
        0 => RendererRecoveryAction::EvalReload,
        1 => RendererRecoveryAction::NativeReload,
        _ => RendererRecoveryAction::NativeNavigate,
    }
}

/// K3 终态兜底阈值：连续第 3 级重导航失败（心跳未恢复）次数。
/// 达到即升级 supervisor 级内核重启——实证整窗重启是唯一有效恢复
/// （v0.5.3 白屏：渲染进程 OOM 后 CoreWebView2.Reload/Navigate 也救不活，
/// 无限重试只留白屏挂死）。
const RENDERER_ESCAPE_MAX_CONSECUTIVE_NAVIGATE: u32 = 3;

/// K3 终态兜底决策（纯函数，可单测）：连续 `navigate_failures` 次「第 3 级
/// 原生重导航」后心跳仍未恢复 → 必须升级到 supervisor 级内核重启
/// （kill_kernel + on_kernel_exit 自动重启链）。心跳恢复即复位计数（幂等
/// 循环——每次恢复都从零重来，不在崩溃环里重复升级）。
fn should_escape_to_kernel_restart(navigate_failures: u32) -> bool {
    navigate_failures >= RENDERER_ESCAPE_MAX_CONSECUTIVE_NAVIGATE
}

/// 恢复动作级别号（日志/排障用）：1=页内 eval / 2=原生 reload / 3=原生
/// 重导航 / 4=supervisor 级内核重启。纯函数，可单测。
fn action_level(action: RendererRecoveryAction) -> u32 {
    match action {
        RendererRecoveryAction::EvalReload => 1,
        RendererRecoveryAction::NativeReload => 2,
        RendererRecoveryAction::NativeNavigate => 3,
        RendererRecoveryAction::KernelRestart => 4,
    }
}

/// K3 终态兜底执行：supervisor 级内核重启（实证整窗重启是唯一有效恢复）。
/// 经 supervisor 公共出口 `restart_kernel_after_renderer_escape`（内部 =
/// kill_kernel + on_kernel_exit 自动重启链）——崩溃环判定天然限次（未成环
/// 自动拉起，成环进恢复页），与崩溃环窗口限次/恢复页互斥协同，不双杀。
/// 任何缺位（无 AppState / supervisor / 通道）都返回 Err，调用方降级为继续
/// 第 3 级重试——绝不因兜底不可用而中断恢复链。
fn kernel_restart_escape(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.try_state::<AppState>().ok_or("AppState 缺失（内核重启不可用）")?;
    let sv = state
        .supervisor
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
        .ok_or("supervisor 未装配（内核重启不可用）")?;
    let tx = state
        .supervisor_tx
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
        .ok_or("supervisor 事件通道缺失（内核重启不可用）")?;
    sv.restart_kernel_after_renderer_escape(&tx);
    Ok(())
}

/// 恢复导航目标（第 3 级用）：优先 supervisor 现值（WSL `--port 0` 端口漂移
/// 后仍准确）；supervisor 缺席/未就绪时退主窗当前 URL——`WebviewWindow::url`
/// 读的是浏览器进程持有的 Source，与渲染进程死活无关。
///
/// 返回 `None` = 无可用目标（supervisor 无 URL 且主窗 URL 读取失败），调用方
/// 降级为错误继续升级梯。V13 P2-8 收口：原 `tauri::Url::parse("http://
/// 127.0.0.1").expect(…)` 生产路径 expect（字面量虽必达，仍是 panic 面）改为
/// 纯 `Option` 降级——`win.url().ok()` 失败即 None，全程零 panic。
fn kernel_url_for_recovery(app: &tauri::AppHandle, win: &tauri::WebviewWindow) -> Option<tauri::Url> {
    if let Some(state) = app.try_state::<AppState>() {
        if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
            if let Some(u) = sv.kernel_url() {
                if let Ok(parsed) = u.parse::<tauri::Url>() {
                    return Some(parsed);
                }
            }
        }
    }
    win.url().ok()
}

fn watch_renderer_heartbeat(app: tauri::AppHandle) {
    let gen = HEARTBEAT_WATCHER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        // 宽限：等第一条心跳到达（或 60s 超时进入持续监测）。
        // 盯**主窗专属**计数 hb_main（M1）：垫片注入所有窗口、全体都在发
        // renderer_heartbeat，全局计数会被浮窗/宠物窗淹没——主窗渲染进程
        // 单独死亡（多子代理 OOM 形态）时全局计数照常增长，停摆永不触发。
        let baseline = app
            .try_state::<AppState>()
            .map(|s| s.hb_main.load(Ordering::Relaxed))
            .unwrap_or(0);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        while std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_secs(5));
            if let Some(state) = app.try_state::<AppState>() {
                if state.hb_main.load(Ordering::Relaxed) > baseline {
                    break;
                }
            }
        }
        let mut last = app
            .try_state::<AppState>()
            .map(|s| s.hb_main.load(Ordering::Relaxed))
            .unwrap_or(0);
        let mut stall: u32 = 0;
        // 恢复梯当前级（M1）：0=eval reload / 1=原生 reload / 2=原生重导航；
        // 心跳恢复即复位（下次停摆从最廉价动作重来）。
        let mut stage: u32 = 0;
        // K3 终态兜底计数：连续第 3 级重导航失败（动作后回读心跳无增量）次数。
        // 达阈值升级 supervisor 级内核重启（实证整窗重启是唯一有效恢复）。
        let mut navigate_failures: u32 = 0;
        loop {
            // 系统休眠/唤醒守卫：用 wall-clock（SystemTime）量测本次 sleep 的
            // 实际流逝——Windows 的 std::time::Instant（QPC）在休眠/休眠唤醒
            // 期间不走表，无法判定；SystemTime（GetSystemTimeAsFileTime）随
            // 墙钟前进。实际流逝远超 10s = 进程被系统挂起过，期间渲染进程
            // 同样冻结、心跳必然停摆——这不是真挂死，不得计入失联（否则唤醒后
            // 把「睡了一觉」误判成 40s 停摆，逐级升级到 reload/navigate/整窗重启）。
            let tick_start = std::time::SystemTime::now();
            std::thread::sleep(std::time::Duration::from_secs(10));
            // 代数交替：有更晚的监测线程接岗 → 本线程退出（防重启循环下线程只增不减）。
            if HEARTBEAT_WATCHER_GEN.load(Ordering::Relaxed) != gen {
                return;
            }
            if std::time::SystemTime::now()
                .duration_since(tick_start)
                .unwrap_or_default()
                > RENDERER_WATCH_SLEEP_JUMP
            {
                if let Some(state) = app.try_state::<AppState>() {
                    route_log("[renderer-recovery] 检测到系统休眠/唤醒（wall-clock 跳跃），心跳基准重锚、恢复梯复位".to_string());
                    last = state.hb_main.load(Ordering::Relaxed);
                }
                stall = 0;
                stage = 0;
                navigate_failures = 0;
                continue;
            }
            let Some(state) = app.try_state::<AppState>() else { return };
            let Some(win) = app.get_webview_window("main") else { return };
            // 豁免联合判定（含 F3 第三形态，见 stall_exempt 文档）：
            // 原生不可见/最小化 **或** 页面自报 hidden 任一成立即不计失联。
            if stall_exempt(
                win.is_visible().ok(),
                win.is_minimized().ok(),
                state.hb_page_hidden.load(Ordering::Relaxed),
            ) {
                stall = 0;
                // 计数口径对齐 M1：失联判定盯 hb_main，豁免复位也必须复位到
                // hb_main（复位到全局 heartbeats 会造成一拍的假「有进展」，
                // 虽下一轮自愈，口径混用留给后人必炸）。
                last = state.hb_main.load(Ordering::Relaxed);
                // 全量复位恢复梯：豁免期（最小化/后台/页面 hidden）不单停摆
                // 计数清零，恢复梯阶段与 K3 终态兜底计数也必须清零——否则一次
                // 「可见期瞬时抖动 → 最小化 → 恢复」就把 stage 抬到
                // NativeNavigate 附近，恢复后的下一次停摆直接跳到高级别动作、
                // 再 3 次即整窗重启（用户体感「莫名其妙白屏重启」）。与心跳
                // 恢复分支的复位语义对齐。
                stage = 0;
                navigate_failures = 0;
                continue;
            }
            let now = state.hb_main.load(Ordering::Relaxed);
            if now == last {
                stall += 1;
            } else {
                stall = 0;
                last = now;
                stage = 0; // 心跳恢复 → 恢复梯复位（下次停摆从最廉价动作重来）。
                navigate_failures = 0; // K3：心跳恢复同样复位终态兜底计数（幂等循环）。
            }
            if stall >= 4 {
                // 落盘（v0.5.2 教训：GUI 安装态 eprintln 无人接收——自动重载
                // 是用户可感知事件，desktop.log 必须留痕，否则「页面自己刷了/
                // 流式被打断」在「打开日志」里无从取证）。
                // M1 恢复梯：eval reload 对已死渲染进程是 no-op（ExecuteScript
                // 无处执行），连续停摆必须升级到浏览器进程级原生 reload /
                // 重导航——否则多子代理 OOM 崩溃后的白屏永远无人救。
                // K3 终态兜底：连续 N 次第 3 级重导航仍救不活（浏览器进程级
                // 重载也救不活的死渲染进程，反复 OOM 形态）→ 升级 supervisor
                // 级内核重启——实证「整窗重启」是唯一有效恢复。
                let mut action = next_recovery_action(stage);
                if action == RendererRecoveryAction::NativeNavigate
                    && should_escape_to_kernel_restart(navigate_failures)
                {
                    action = RendererRecoveryAction::KernelRestart;
                }
                let action_name = match action {
                    RendererRecoveryAction::EvalReload => "页内 eval reload",
                    RendererRecoveryAction::NativeReload => "原生 reload（CoreWebView2.Reload）",
                    RendererRecoveryAction::NativeNavigate => "原生重导航（CoreWebView2.Navigate → 内核 URL）",
                    RendererRecoveryAction::KernelRestart => "supervisor 级内核重启（整窗重启）",
                };
                route_log(format!(
                    "[renderer-recovery] 可见主窗心跳停摆 {}0 秒（疑似渲染进程崩溃/挂死），执行第 {} 级恢复：{action_name}",
                    stall,
                    action_level(action)
                ));
                // K3 恢复结果可观测（K2 排障缺口：此前只记动作不记结果）：动作
                // 前快照心跳计数，动作后回读（垫片 5s 一跳，等 4s 已能观察页面
                // 是否复活），把「是否恢复」写进 [renderer-recovery] 日志行——
                // 成功/失败可区分，排障有证。
                let hb_before_action = state.hb_main.load(Ordering::Relaxed);
                let outcome: Result<(), tauri::Error> = match action {
                    RendererRecoveryAction::EvalReload => win.eval("try{location.reload()}catch(e){}"),
                    RendererRecoveryAction::NativeReload => win.reload(),
                    RendererRecoveryAction::NativeNavigate => {
                        // V13 P2-8：导航目标改 Option 降级（无可用目标时按失败
                        // 收链，升级梯继续，不再经 expect 的静态回退 URL）。
                        match kernel_url_for_recovery(&app, &win) {
                            Some(target) => win.navigate(target),
                            None => Err(tauri::Error::AssetNotFound(
                                "无可用恢复导航目标（supervisor URL 与主窗 URL 均不可用）".into(),
                            )),
                        }
                    }
                    RendererRecoveryAction::KernelRestart => {
                        // supervisor 级内核重启：kill_kernel + on_kernel_exit
                        // 自动重启链（崩溃环判定天然限次：未成环自动拉起，成环
                        // 进恢复页——与崩溃环窗口限次互斥协同，不双杀）。新内核
                        // 就绪行线程统一换页并布防新一代心跳监测（本线程随代际
                        // 交替自行退出）。
                        match kernel_restart_escape(&app) {
                            Ok(()) => Ok(()),
                            Err(msg) => Err(tauri::Error::AssetNotFound(msg)),
                        }
                    }
                };
                if let Err(e) = outcome {
                    route_log(format!("[renderer-recovery] 恢复动作执行失败（升级梯将继续）：{e}"));
                }
                // 动作后回读心跳计数，判定恢复结果（K3 可观测性）。
                std::thread::sleep(std::time::Duration::from_secs(4));
                let hb_after = state.hb_main.load(Ordering::Relaxed);
                let recovered = hb_after > hb_before_action;
                if recovered {
                    route_log(format!(
                        "[renderer-recovery] 恢复结果：心跳已恢复（+{}，页面复活）",
                        hb_after - hb_before_action
                    ));
                    navigate_failures = 0;
                } else {
                    // 未恢复 → 计数推进（仅第 3 级重导航计入终态兜底计数；
                    // 内核重启后给新内核完整观察周期，计数复位不连续升级）。
                    route_log(format!("[renderer-recovery] 恢复结果：心跳未恢复（4s 回读无增量）"));
                    if action == RendererRecoveryAction::NativeNavigate {
                        navigate_failures += 1;
                        route_log(format!(
                            "[renderer-recovery] 第 3 级重导航连续失败 {navigate_failures}/{RENDERER_ESCAPE_MAX_CONSECUTIVE_NAVIGATE} 次{}",
                            if should_escape_to_kernel_restart(navigate_failures) { "，下次升级内核重启" } else { "" }
                        ));
                    } else if action == RendererRecoveryAction::KernelRestart {
                        navigate_failures = 0;
                    }
                }
                stage = (stage + 1).min(2);
                stall = 0;
            }
        }
    });
}

/// 诊断探针：非侵入读取页面健康度（confirm 返回值 / composer 可用性 /
/// console 错误），经 page_error 通道回传日志。仅 DSH_TAURI_DIAG=1 启用。
fn inject_diag_probe(app: tauri::AppHandle) {
    if std::env::var("DSH_TAURI_DIAG").ok().as_deref() != Some("1") { return; }
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        let Some(win) = app.get_webview_window("main") else { return };
        let probe = r#"(function(){
          var BASE=null; try{ BASE=window.__DIAG_BASE__ }catch(e){}
          function rep(m){
            try{ fetch(BASE+'/__diag/'+encodeURIComponent(m)) }catch(e){}
            try{ window.__TAURI_INTERNALS__.invoke('current_session',{sessionId:('[diag] '+m).slice(0,250)}) }catch(e){}
            try{ window.__TAURI_INTERNALS__.invoke('page_error',{message:'[diag] '+m}) }catch(e){}
            try{console.log('[diag]',m)}catch(e){}
          }
          var r; try{ r = window.confirm('diag') }catch(e){ r = 'THROW:'+e.message }
          rep('confirm-returns:'+r+' polyfilled='+(window.__dshDialogPolyfilled===true)+
            ' confirmSrc:'+(function(){try{return String(window.confirm).replace(/\s+/g,' ').slice(0,48)}catch(e){return '?'}})());
          rep('bridge:'+typeof window.dshDesktop+
            ' sm:'+typeof window.__dshSessionManager+
            ' smDelete:'+typeof (window.__dshSessionManager && window.__dshSessionManager.deleteSession)+
            ' ml:'+typeof window.__ModuleLoader__);
          // 会话删除链实证（假 id 无破坏性：宿主对不存在 id 走 no-op 返回 deleted:true）。
          // resolve=true ⇒ 桥+RPC 传输+宿主补丁全通（断点收敛到 B/C）；REJECT 内容区分
          // D（传输断裂的报错形态）；STILL-PENDING ⇒ Remote 层挂起；桥缺席 ⇒ A。
          try{
            var dp = window.__dshSessionManager ? window.__dshSessionManager.deleteSession('__nonexistent_test_id__') : null;
            if (dp && typeof dp.then === 'function') {
              dp.then(function(v){ rep('fake-delete-RESOLVE:'+String(v)); },
                      function(e){ rep('fake-delete-REJECT:'+String((e&&e.message)||e).slice(0,160)); });
              setTimeout(function(){ rep('fake-delete-STILL-PENDING-4s'); }, 4000);
            } else { rep('fake-delete-SYNC:'+String(dp)); }
          }catch(e){ rep('fake-delete-THROW:'+String((e&&e.message)||e).slice(0,160)); }
          function probeComposer(tag){
            try{
              var tas = document.querySelectorAll('textarea,[contenteditable]');
              rep(tag+' composer-count:'+tas.length);
              if (tas.length){ var t=tas[0];
                rep(tag+' composer:'+t.tagName+' disabled='+(t.disabled===true)+' readOnly='+(t.readOnly===true)+' contentEditable='+t.getAttribute('contenteditable'));
                try{ t.focus(); rep(tag+' focus-ok active='+(document.activeElement===t)) }catch(e){ rep(tag+' focus-fail:'+e.message) }
              }
            }catch(e){ rep(tag+' probe-fail:'+e.message) }
          }
          var errs=[];
          window.addEventListener('error',function(e){ errs.push('ERR:'+(e.message||'?')) });
          window.addEventListener('unhandledrejection',function(e){ errs.push('REJ:'+((e.reason&&e.reason.message)||e.reason||'?')) });
          // 插件 loader 失败常以 console.error 呈现（不经 error/rejection 事件），
          // 必须同挂——曾因只挂两者漏掉「missed the module table」页面级证据。
          var __ce=console.error; console.error=function(){ try{errs.push('CON:'+[].slice.call(arguments).join(' ').slice(0,200))}catch(e){} __ce.apply(console,arguments) };
          setTimeout(function(){
            probeComposer('t0');
            var btns=[];
            document.querySelectorAll('button').forEach(function(b){ var t=(b.textContent||'').trim(); if(t&&t.length<10) btns.push({t:t,b:b}) });
            rep('buttons:'+btns.map(function(x){return x.t}).slice(0,25).join('|'));
            var news=btns.filter(function(x){ return /new|新建|新会话|^\+$/.test(x.t) });
            if (news.length){ rep('clicking-new-session:'+news[0].t); try{ news[0].b.click() }catch(e){ rep('click-fail:'+e.message) }
              setTimeout(function(){ probeComposer('after-new'); rep('console-errors:'+errs.slice(0,6).join(' / ')); }, 3000);
            } else { rep('no-new-session-button-found'); rep('console-errors:'+errs.slice(0,6).join(' / ')); }
          }, 2500);
          // ---- 菜单 E2E 阶段（+6.5s）：真实点击会话行 ⋯ →「删除对话」----
          // 桥 spy 记录 onSelect 是否真调到桥（断点 B 判据）；E2E 在隔离 home
          // 上进行（删除的是新建会话/镜像副本，真实数据零接触）。
          setTimeout(function(){
            try{
              if (window.__dshSessionManager && typeof window.__dshSessionManager.deleteSession === 'function') {
                var orig = window.__dshSessionManager.deleteSession;
                window.__dshSessionManager.deleteSession = function(id){
                  rep('BRIDGE-CALLED:'+id);
                  try{
                    var rr = orig.apply(this, arguments);
                    if (rr && typeof rr.then === 'function') rr.then(function(v){ rep('BRIDGE-RESOLVE:'+String(v)); }, function(e){ rep('BRIDGE-REJECT:'+String((e&&e.message)||e).slice(0,160)); });
                    else rep('BRIDGE-SYNC:'+String(rr));
                  }catch(e2){ rep('BRIDGE-THROW:'+String((e2&&e2.message)||e2).slice(0,160)); }
                  return rr;
                };
              } else { rep('menu-stage-skip:no-bridge'); }
              function fireClick(el){
                ['pointerover','pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(t){
                  try{ el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window})) }catch(e){}
                });
              }
              function findDeleteItem(){
                var best=null;
                document.querySelectorAll('li,[role="menuitem"],[role="menu"] *,div,span,button').forEach(function(el){
                  var t=(el.textContent||'').trim();
                  if(t==='删除对话'||t==='Delete conversation'){ if(!best||best.contains(el)) best=el; }
                });
                return best;
              }
              var cands=[];
              document.querySelectorAll('button,[role="button"]').forEach(function(b){
                var sig=(((b.getAttribute&&b.getAttribute('aria-label'))||'')+' '+((b.getAttribute&&b.getAttribute('title'))||'')+' '+((b.textContent||'').trim()));
                var dots=/更多|菜单|more|⋯|\.\.\./i.test(sig)&&sig.length<20;
                // 会话/项目行 ⋯ 触发钮：aria-label 为 actions.session/workspace.aria
                // 的本地化插值（含「会话/项目」字样），行 hover 才显形但 DOM 恒在。
                var rowMenu=/会话|session|项目|workspace/i.test(sig)&&sig.length<60&&!/新建|新会话|new/i.test(sig);
                if(dots||rowMenu)cands.push(b);
              });
              rep('menu-candidates:'+cands.length);
              var idx=0, opened=false;
              (function tryOpen(){
                if(opened||idx>=cands.length){ if(!opened) rep('menu-open-FAILED:no-candidate-opened-menu'); return; }
                var b=cands[idx++];
                try{ fireClick(b) }catch(e){}
                setTimeout(function(){
                  var it=findDeleteItem();
                  if(it){ opened=true; rep('menu-opened:candidate'+(idx-1));
                    fireClick(it); rep('delete-item-clicked');
                    setTimeout(function(){ rep('post-delete-errors:'+errs.slice(0,4).join(' / ')); }, 2500);
                  } else { tryOpen(); }
                }, 700);
              })();
            }catch(e){ rep('menu-stage-THROW:'+String((e&&e.message)||e).slice(0,120)); }
          }, 6500);
        })()"#;

        // 探针基址注入（fetch 通道）。`probe base eval`
        if let Some(state) = app.try_state::<AppState>() {
            let u = state.loading_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
            if let Some(pos) = u.rfind('/') {
                let _ = win.eval(format!("window.__DIAG_BASE__={:?}", &u[..pos]));
            }
        }
        match win.eval(probe) {
            Ok(_) => eprintln!("[diag] probe eval OK"),
            Err(e) => eprintln!("[diag] probe eval ERR: {e}"),
        }
        // R2 复盘：title 回读通道已删——探针从不写 document.title（fetch/invoke
        // 双通道才是回传路径），回读分支恒走 else 输出「页面脚本可能未执行」
        // 误导日志，且污染窗口标题语义。fetch 通道自 R2 起带 CORS 头真实可用。
    });
}

#[cfg(test)]
mod heartbeat_watcher_tests {
    /// 形态锚点（内存审计 2026-08）：心跳监测线程必须带代数交替退出路径
    /// ——KernelReady 每次内核重启都会触发（且单次 boot 发两回），无守卫时
    /// 监测线程随重启次数只增不减（各持 AppHandle 永久 10s 轮询）。
    #[test]
    fn heartbeat_watcher_has_generation_guard_shape() {
        let src = include_str!("lib.rs");
        let seg = src
            .split("fn watch_renderer_heartbeat")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 诊断探针").next())
            .expect("watch_renderer_heartbeat 函数体");
        assert!(src.contains("static HEARTBEAT_WATCHER_GEN"), "必须有全局代数号");
        assert!(
            seg.contains("HEARTBEAT_WATCHER_GEN.fetch_add"),
            "新监测线程上岗必须递增代数号（令旧线程失效）: {seg}"
        );
        assert!(
            seg.contains("HEARTBEAT_WATCHER_GEN.load") && seg.contains("return;"),
            "监测循环必须校验代数号并退出旧线程: {seg}"
        );
    }

    /// 形态锚点（C 路径误重载修复，2026-08）：监测循环的失联豁免必须经
    /// stall_exempt（heartbeat_timer_active + 页面自报 hidden 联合判定）——
    /// 只判 is_visible 时，Win32 语义下最小化窗口 IsWindowVisible 恒真，
    /// WebView2 对 hidden 页面 5 分钟后 intensive throttling（5s 心跳退化为
    /// ~1/min）→ stall 4×10s 判停摆 → 每 ~40s location.reload()（最小化
    /// 7 分钟真机复现）；F3 第三形态：可见未最小化但被完全遮挡/锁屏时，
    /// 原生 API 失明，必须叠加页面自报 hidden 豁免。
    #[test]
    fn heartbeat_watcher_exempt_check_covers_minimized_shape() {
        // 仓库检出为 CRLF，多行锚点按 \n 归一。
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn watch_renderer_heartbeat")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 诊断探针").next())
            .expect("watch_renderer_heartbeat 函数体");
        assert!(
            seg.contains("stall_exempt(\n                win.is_visible().ok(),\n                win.is_minimized().ok(),\n                state.hb_page_hidden.load(Ordering::Relaxed),\n            )"),
            "失联豁免必须走 stall_exempt 联合判定（原生可见性 + 页面自报 hidden）: {seg}"
        );
        assert!(
            !seg.contains("win.is_visible().unwrap_or(true)"),
            "不得再裸判 is_visible（漏最小化节流形态）: {seg}"
        );
    }

    /// 形态锚点（休眠/唤醒 + 豁免全量复位，2026-08「合盖/锁屏后唤醒即白屏
    /// 重启」）：① 监测循环必须用 SystemTime 量测 sleep 实际流逝并做跳跃守卫
    /// （Instant/QPC 在 Windows 休眠期间不走表，无法判定）；② 豁免分支必须
    /// 复位恢复梯 stage 与 K3 终态兜底计数 navigate_failures——只复位
    /// stall/last 会把可见期瞬时抖动抬高的 stage 泄漏到恢复后，下一次停摆
    /// 直接跳到高级别动作、再 3 次即整窗重启。
    #[test]
    fn heartbeat_watcher_sleep_guard_and_exempt_full_reset_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn watch_renderer_heartbeat")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 诊断探针").next())
            .expect("watch_renderer_heartbeat 函数体");
        assert!(
            seg.contains("RENDERER_WATCH_SLEEP_JUMP"),
            "必须有系统休眠/唤醒跳跃守卫常量: {seg}"
        );
        assert!(
            seg.contains("SystemTime::now()"),
            "跳跃守卫必须用 wall-clock（SystemTime）——Instant/QPC 休眠期间不走表: {seg}"
        );
        // 豁免分支（stall_exempt 之后到首个 continue）必须复位 stage 与 navigate_failures。
        let exempt_seg = seg
            .split("stall_exempt(")
            .nth(1)
            .and_then(|s| s.split("continue;").next())
            .expect("豁免分支");
        assert!(
            exempt_seg.contains("stage = 0;"),
            "豁免分支必须复位恢复梯 stage（否则泄漏到恢复后）: {exempt_seg}"
        );
        assert!(
            exempt_seg.contains("navigate_failures = 0;"),
            "豁免分支必须复位 K3 终态兜底计数 navigate_failures: {exempt_seg}"
        );
    }

    /// heartbeat_timer_active 决策表（与 balance.rs window_visibility 同口径）：
    /// 可见且未最小化 → 计；不可见 / 最小化（Win32 下 is_visible 仍真）→ 豁免；
    /// 查询失败按「定时器有效」处理（宁可漏判停摆也不误杀节流页）。
    #[test]
    fn heartbeat_timer_active_decision_table() {
        use super::heartbeat_timer_active;
        assert!(heartbeat_timer_active(Some(true), Some(false)), "可见未最小化：正常计失联");
        assert!(!heartbeat_timer_active(Some(false), Some(false)), "不可见（托盘隐藏）：豁免");
        assert!(!heartbeat_timer_active(Some(true), Some(true)), "最小化（is_visible 仍真）：必须豁免——WebView2 hidden 节流");
        assert!(!heartbeat_timer_active(Some(false), Some(true)), "不可见且最小化：豁免");
        assert!(heartbeat_timer_active(None, None), "查询失败按定时器有效（不误杀）");
        assert!(heartbeat_timer_active(None, Some(false)), "可见性未知 + 未最小化：按有效");
        assert!(!heartbeat_timer_active(None, Some(true)), "可见性未知 + 最小化：豁免");
        assert!(heartbeat_timer_active(Some(true), None), "最小化未知：按未最小化（与 balance 同默认）");
    }

    /// stall_exempt 决策表（F3，2026-08）：页面自报 hidden 时**无条件豁免**
    /// ——原生可见且未最小化的窗口（遮挡/锁屏/RDP 断开形态）心跳被节流到
    /// ~1/min 不是挂死，4×10s 停摆判定不得开火（v0.5.3 用户「隔几分钟
    /// 重新加载一遍」主因）。
    #[test]
    fn stall_exempt_decision_table() {
        use super::stall_exempt;
        // 原生口径全绿 + 页面自报可见 → 正常计失联（真挂死仍能救）。
        assert!(!stall_exempt(Some(true), Some(false), false), "可见未最小化且页面自报可见：计失联");
        // F3 形态：原生口径全绿但页面自报 hidden（遮挡/锁屏/RDP）→ 豁免。
        assert!(stall_exempt(Some(true), Some(false), true), "可见未最小化但页面 hidden：必须豁免（WebView2 遮挡节流）");
        // 原生口径已豁免的形态，页面自报任意值都保持豁免。
        assert!(stall_exempt(Some(false), Some(false), false), "不可见：豁免");
        assert!(stall_exempt(Some(true), Some(true), false), "最小化：豁免");
        assert!(stall_exempt(Some(true), Some(true), true), "最小化且页面 hidden：豁免");
        assert!(stall_exempt(Some(false), None, true), "不可见且页面 hidden：豁免");
        // 查询失败（None）+ 页面自报可见 → 按有效计（不误杀）。
        assert!(!stall_exempt(None, None, false), "查询失败且页面自报可见：按有效计");
    }

    /// 形态锚点（F3 链路闭合）：shim 心跳载荷必须携带 document.hidden，
    /// 命令面 renderer_heartbeat 必须接收并落 AppState.hb_page_hidden——
    /// 页面自报可见性链路任何一环缺失，豁免判定就退回原生口径（遮挡
    /// 形态必误杀）。
    #[test]
    fn page_hidden_flag_pipeline_shape() {
        let shim = include_str!("../../../crates/bridge/dist/bridge-shim.js");
        assert!(
            shim.contains("renderer_heartbeat', { hidden"),
            "shim 心跳载荷必须携带 hidden（document.hidden）: 见 bridge-shim.js 心跳段"
        );
        let cmd = include_str!("commands/lifecycle.rs");
        assert!(
            cmd.contains("hb_page_hidden.store"),
            "renderer_heartbeat 必须把页面自报 hidden 落 AppState.hb_page_hidden"
        );
    }

    // -----------------------------------------------------------------------
    // M1（2026-08「开多了子代理后不稳定、直接白屏」）回归锚点。
    //
    // 根因链：多子代理 = 多会话事件流常驻内核 UI（dsh-client-runtime
    // Session.events 只追加无上限、Session 实例常驻不释放）→ 渲染进程内存
    // 随流式增长 → WebView2 渲染进程 OOM 崩溃 → 白屏。壳侧检测/恢复链
    // 此前全断：wry 0.55.1 无 ProcessFailed 处理（webview2/mod.rs 零 crash
    // 代码）、tauri 2.11.5 WebviewEvent 仅 DragDrop（app.rs:202）、唯一检测器
    // 心跳停摆的恢复动作是 eval reload——ExecuteScript 对死渲染进程是 no-op。
    // -----------------------------------------------------------------------

    /// 升级梯决策表（纯函数）：0→eval reload、1→原生 reload、≥2 封顶原生
    /// 重导航（保持重试不放弃——白屏必须有人持续救）。
    #[test]
    fn next_recovery_action_ladder_table() {
        use super::{next_recovery_action, RendererRecoveryAction};
        assert_eq!(next_recovery_action(0), RendererRecoveryAction::EvalReload, "首停摆：最廉价页内 reload");
        assert_eq!(next_recovery_action(1), RendererRecoveryAction::NativeReload, "二停摆：原生 reload（eval 已证明无效）");
        assert_eq!(next_recovery_action(2), RendererRecoveryAction::NativeNavigate, "三停摆起：原生重导航封顶");
        assert_eq!(next_recovery_action(9), RendererRecoveryAction::NativeNavigate, "持续停摆保持第 3 级重试");
    }

    /// 形态锚点（M1 核心）：停摆恢复必须带升级梯，且梯上必须有**浏览器进程
    /// 级**原语（win.reload / win.navigate——CoreWebView2.Reload/Navigate，与
    /// 渲染进程死活无关）；恢复动作的执行结果必须检查并落日志（eval no-op
    /// 形态此前被 `let _` 静默吞掉，白屏无从取证）。心跳恢复后梯必须复位。
    #[test]
    fn renderer_recovery_ladder_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn watch_renderer_heartbeat")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 诊断探针").next())
            .expect("watch_renderer_heartbeat 函数体");
        assert!(
            seg.contains("next_recovery_action(stage)"),
            "停摆开火必须走升级梯决策: {seg}"
        );
        assert!(
            seg.contains("win.eval(\"try{location.reload()}catch(e){}\")"),
            "第 1 级页内 reload 保留（页面活但挂死形态最廉价）: {seg}"
        );
        assert!(seg.contains("win.reload()"), "第 2 级必须原生 reload（死渲染进程唯一可救通道之一）: {seg}");
        assert!(seg.contains("win.navigate(target)"), "第 3 级必须原生重导航: {seg}");
        assert!(
            seg.contains("if let Err(e) = outcome"),
            "恢复动作失败必须落日志（不得 let _ 静默吞）: {seg}"
        );
        assert!(
            seg.contains("stage = 0;"),
            "心跳恢复必须复位升级梯（下次停摆从最廉价动作重来）: {seg}"
        );
        // 恢复导航目标优先 supervisor 现值（WSL --port 0 端口漂移后仍准确）。
        let helper = src
            .split("fn kernel_url_for_recovery")
            .nth(1)
            .and_then(|s| s.split("fn watch_renderer_heartbeat").next())
            .expect("kernel_url_for_recovery 函数体");
        assert!(
            helper.contains("sv.kernel_url()") && helper.contains("win.url()"),
            "导航目标必须 supervisor 现值优先、主窗当前 URL 兜底: {helper}"
        );
    }

    /// 形态锚点（M1 检测面）：停摆判定必须盯**主窗专属**计数 hb_main——垫片
    /// 注入所有窗口，全局 heartbeats 会被浮窗/宠物窗心跳淹没，主窗渲染进程
    /// 单独死亡（OOM）时停摆永不触发、白屏无人救。
    #[test]
    fn heartbeat_watcher_tracks_main_window_counter_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn watch_renderer_heartbeat")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 诊断探针").next())
            .expect("watch_renderer_heartbeat 函数体");
        assert!(
            seg.contains("hb_main.load(Ordering::Relaxed)"),
            "停摆判定必须读主窗专属计数 hb_main: {seg}"
        );
        assert!(
            !seg.contains("state.heartbeats.load"),
            "不得读全局心跳计数（浮窗/宠物窗心跳会淹没主窗死亡）: {seg}"
        );
        // 命令面同步：renderer_heartbeat 必须为主窗心跳单独计数。
        let cmd = include_str!("commands/lifecycle.rs");
        assert!(
            cmd.contains("hb_main.fetch_add"),
            "renderer_heartbeat 必须递增主窗专属计数 hb_main（仅 label==main）"
        );
    }

    // -----------------------------------------------------------------------
    // K3（2026-08 终态兜底）回归锚点。
    //
    // 背景：M1 恢复梯（eval reload → CoreWebView2.Reload → Navigate）是无限
    // 重试，若渲染进程反复 OOM、浏览器进程级重载也救不活，白屏仍无限挂
    // （v0.5.3 实证 2 小时 199 次 reload 循环；整窗重启是唯一有效恢复）。
    // 修法：连续 N 次第 3 级重导航仍无心跳 → 升级 supervisor 级内核重启。
    // -----------------------------------------------------------------------

    /// K3 终态兜底决策表（纯函数）：0~2 次第 3 级失败 → 保持重试不升级；
    /// ≥3 次 → 升级 supervisor 级内核重启；心跳恢复即复位（幂等循环）。
    #[test]
    fn k3_escape_decision_table() {
        use super::{
            action_level, next_recovery_action, should_escape_to_kernel_restart,
            RendererRecoveryAction, RENDERER_ESCAPE_MAX_CONSECUTIVE_NAVIGATE,
        };
        assert_eq!(RENDERER_ESCAPE_MAX_CONSECUTIVE_NAVIGATE, 3, "阈值取 3~5 区间（K3 任务口径）");
        // 未达阈值：不升级（保持第 3 级重试——白屏必须有人持续救）。
        assert!(!should_escape_to_kernel_restart(0));
        assert!(!should_escape_to_kernel_restart(1));
        assert!(!should_escape_to_kernel_restart(2));
        // 达阈值：升级。达阈值后持续成立（若计数漏复位，兜底不会停）。
        assert!(should_escape_to_kernel_restart(3));
        assert!(should_escape_to_kernel_restart(99));
        // 第 4 级动作级别号。
        assert_eq!(action_level(RendererRecoveryAction::KernelRestart), 4);
        assert_eq!(action_level(RendererRecoveryAction::EvalReload), 1);
        assert_eq!(action_level(RendererRecoveryAction::NativeReload), 2);
        assert_eq!(action_level(RendererRecoveryAction::NativeNavigate), 3);
        // 常规升级梯不受影响（M1 语义保持）。
        assert_eq!(next_recovery_action(0), RendererRecoveryAction::EvalReload);
        assert_eq!(next_recovery_action(1), RendererRecoveryAction::NativeReload);
        assert_eq!(next_recovery_action(2), RendererRecoveryAction::NativeNavigate);
        assert_eq!(next_recovery_action(9), RendererRecoveryAction::NativeNavigate);
    }

    /// K3 形态锚点（watch_renderer_heartbeat 段）：
    /// ① 连续第 3 级失败计数 navigate_failures 必须在场，且心跳恢复复位
    ///    （幂等循环）；② 达阈值走 supervisor 级内核重启（restart_kernel_
    ///    after_renderer_escape = kill_kernel + on_kernel_exit 自动重启链）；
    /// ③ 恢复结果必须回读心跳计数落 [renderer-recovery] 日志（成功/失败
    ///    可区分——K2 排障缺口）；④ 内核重启后计数复位（给新内核完整观察
    ///    周期，不双杀/不连续升级）。
    #[test]
    fn k3_renderer_recovery_escape_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn watch_renderer_heartbeat")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 诊断探针").next())
            .expect("watch_renderer_heartbeat 函数体");
        assert!(
            seg.contains("navigate_failures"),
            "连续第 3 级失败计数必须在场: {seg}"
        );
        assert!(
            seg.contains("navigate_failures = 0;"),
            "心跳恢复/豁免/内核重启后必须复位终态兜底计数（幂等循环）: {seg}"
        );
        assert!(
            seg.contains("should_escape_to_kernel_restart(navigate_failures)"),
            "升级判定必须走纯函数决策表: {seg}"
        );
        assert!(
            seg.contains("kernel_restart_escape(&app)"),
            "第 4 级必须经 kernel_restart_escape（supervisor 级内核重启）: {seg}"
        );
        // kernel_restart_escape 内部接线：supervisor 侧 restart_kernel_after_
        // renderer_escape（kill_kernel + on_kernel_exit 自动重启链）。
        let escape_holder = src
            .split("fn kernel_restart_escape")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 诊断探针").next())
            .expect("kernel_restart_escape 函数体");
        assert!(
            escape_holder.contains("restart_kernel_after_renderer_escape(&tx)"),
            "第 4 级必须经 supervisor 级内核重启（kill_kernel + on_kernel_exit 链）: {escape_holder}"
        );
        assert!(
            escape_holder.contains("supervisor_tx"),
            "内核重启必须复用 supervisor 事件通道（路由不断链）: {escape_holder}"
        );
        // 恢复结果可观测：动作后回读心跳，日志行区分成功/失败。
        assert!(
            seg.contains("hb_after > hb_before_action"),
            "必须动作后回读心跳计数判定恢复: {seg}"
        );
        assert!(
            seg.contains("心跳已恢复") && seg.contains("心跳未恢复"),
            "恢复结果必须区分成功/失败（排障有证）: {seg}"
        );
        // 动作级别号含第 4 级文案。
        assert!(
            seg.contains("supervisor 级内核重启（整窗重启）"),
            "第 4 级动作文案: {seg}"
        );
        // supervisor 侧出口：restart_kernel_after_renderer_escape = kill_kernel
        // + on_kernel_exit（崩溃环判定限次，与恢复页互斥协同）。
        let sup = include_str!("supervisor.rs").replace("\r\n", "\n");
        let escape_seg = sup
            .split("pub fn restart_kernel_after_renderer_escape")
            .nth(1)
            .and_then(|s| s.split("/// 杀内核整树").next())
            .expect("restart_kernel_after_renderer_escape 函数体");
        assert!(escape_seg.contains("self.kill_kernel()"), "第 4 级必须杀内核整树: {escape_seg}");
        assert!(escape_seg.contains("self.on_kernel_exit(None, tx)"), "第 4 级必须走 on_kernel_exit 自动重启链: {escape_seg}");
    }

    /// K3 形态锚点（防回退）：终态兜底只在该升级时升级——常规升级梯
    /// next_recovery_action 的封顶仍是 NativeNavigate（第 3 级），不得把
    /// KernelRestart 塞进常规梯封顶（升级须经 navigate_failures 达阈值判定）。
    #[test]
    fn k3_escape_not_in_regular_ladder_cap() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn next_recovery_action")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// K3 终态兜底阈值").next())
            .expect("next_recovery_action 函数体");
        assert!(
            !seg.contains("KernelRestart"),
            "常规升级梯封顶必须保持 NativeNavigate（KernelRestart 只经阈值升级）: {seg}"
        );
    }
}

/// C2c 重启风暴渲染抑制（2026-08 崩溃环强化）：KernelReady 路由分支在
/// 「距上次换页 < 90s」时不整页换页，改 eval 轻量探针确认页面活、死了才换页。
#[cfg(test)]
mod kernel_nav_suppression_tests {
    use super::*;

    /// 窗口判定表（纯函数）：0/89_999ms 抑制；90_000ms 起放行（含首次
    /// last=0 的巨型间隔）。
    #[test]
    fn suppression_window_table() {
        assert!(should_suppress_kernel_nav(0), "连续 KernelReady（重启风暴）必须抑制");
        assert!(should_suppress_kernel_nav(89_999), "窗口内抑制");
        assert!(!should_suppress_kernel_nav(90_000), "恰 90s 放行整页换页");
        assert!(!should_suppress_kernel_nav(u64::MAX - 1), "首次换页（last=0）放行");
    }

    /// 形态锚点：KernelReady 分支必须经 kernel_ready_navigate（不得直连
    /// navigate_main）；探针走 renderer_heartbeat 计数回执；窗口常量 90s。
    #[test]
    fn kernel_ready_routes_through_suppression_helper() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let seg = src
            .split("SupervisorEvent::KernelReady { url, port } => {")
            .nth(1)
            .and_then(|s| s.split("SupervisorEvent::KernelExit").next())
            .expect("KernelReady 路由分支");
        assert!(seg.contains("kernel_ready_navigate(app.clone(), url.clone());"), "KernelReady 必须经抑制入口换页: {seg}");
        assert!(!seg.contains("commands::navigate_main(app, &url)"), "不得直连整页换页（绕过 C2c）");
        let helper = src
            .split("fn kernel_ready_navigate")
            .nth(1)
            .and_then(|s| s.split("fn route_one_event").next())
            .expect("kernel_ready_navigate 函数体");
        // RV3 P1-2 后判定入口统一为 suppressible（窗口 + URL 未变）；旧的纯窗口
        // 判定保留为内部纯函数。
        assert!(helper.contains("suppressible("), "必须走窗口+URL 联合判定（URL 变更即换页）");
        assert!(helper.contains("renderer_heartbeat"), "轻量探针必须经心跳计数回执通道");
        assert!(helper.contains("LAST_KERNEL_NAV_MS.store"), "真实换页后必须更新锚点时刻");
        assert!(helper.contains("LAST_KERNEL_NAV_URL"), "真实换页后必须记录 URL 锚点（漂移检测）");
        // 探针不得阻塞事件路由线程（后台线程）。
        assert!(helper.contains("std::thread::spawn"), "探针须后台线程（路由线程零阻塞）");
        assert!(src.contains("KERNEL_NAV_SUPPRESS_WINDOW_MS: u64 = 90_000"), "90s 窗口常量锚点");
    }

    /// 形态锚点（M1 检测面）：C2c 探针打进主窗，回执必须盯主窗专属计数
    /// hb_main——全局 heartbeats 会被浮窗/宠物窗心跳淹没，主窗渲染进程
    /// 单独死亡时探针被误判「页面活」→ 跳过换页 → 主窗钉死白屏。
    #[test]
    fn suppression_probe_reads_main_window_counter_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let helper = src
            .split("fn kernel_ready_navigate")
            .nth(1)
            .and_then(|s| s.split("fn route_one_event").next())
            .expect("kernel_ready_navigate 函数体");
        assert!(
            helper.contains("state.hb_main.load(Ordering::Relaxed)"),
            "探针回执必须读主窗专属计数 hb_main: {helper}"
        );
        assert!(
            !helper.contains("state.heartbeats.load"),
            "探针不得读全局心跳计数（浮窗心跳会淹没主窗死亡）: {helper}"
        );
    }
}

#[cfg(test)]
mod repo_root_tests {
    use super::*;

    /// 构造伪仓库根：<dir>/dsh-desktop/vendor/node。
    fn fake_root(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("dsh-tauri-root-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(d.join("dsh-desktop").join("vendor").join("node")).unwrap();
        d
    }

    #[test]
    fn locate_repo_root_hits_valid_candidate_only() {
        let good = fake_root("hit");
        let junk = std::env::temp_dir().join("dsh-tauri-root-definitely-nope");
        assert_eq!(locate_repo_root(&[junk.clone(), good.clone()]), Some(good.clone()), "命中含 dsh-desktop/vendor/node 的候选");
        assert_eq!(locate_repo_root(&[]), None, "空候选 → None（调用方转恢复页，不 panic）");
        assert_eq!(locate_repo_root(&[junk]), None, "无效候选 → None");
        let _ = std::fs::remove_dir_all(&good);
    }

    #[test]
    fn find_repo_root_env_override_wins() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let root = fake_root("env");
        std::env::set_var("DSH_TAURI_REPO_ROOT", &root);
        let found = find_repo_root().expect("显式覆盖且布局合法时必须命中");
        std::env::remove_var("DSH_TAURI_REPO_ROOT");
        assert_eq!(found, root);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn find_repo_root_env_override_invalid_is_error() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        std::env::set_var("DSH_TAURI_REPO_ROOT", std::env::temp_dir());
        let r = find_repo_root();
        std::env::remove_var("DSH_TAURI_REPO_ROOT");
        assert!(r.is_err(), "显式覆盖但布局非法应 Err（提示覆盖值问题）");
    }

    /// 便携版 zip 布局 fixture（v0.5.x CI build-portable 产物形态）：
    /// exe 与 portable.marker 在根，payload 全部在 resources/ 下。
    /// 任何一跳缺 resources 候选都会让 exe-walk 只认安装版同根布局，
    /// 便携版找不到 dsh-desktop → 恢复页（无法进主界面）。
    #[test]
    fn exe_walk_resolves_portable_zip_layout() {
        let root = std::env::temp_dir().join(format!("dsh-tauri-portable-fx-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let exe = root.join("DSH Desktop.exe");
        let payload = root.join("resources").join("dsh-desktop");
        std::fs::create_dir_all(payload.join("vendor").join("node")).unwrap();
        std::fs::write(payload.join("vendor").join("node").join("node.exe"), b"fake-node").unwrap();
        std::fs::write(root.join("portable.marker"), b"marker").unwrap();

        let candidates = exe_walk_candidates(&exe);
        // 每一跳 resources 候选排在同根候选之前（便携布局优先命中）。
        assert_eq!(candidates.first(), Some(&root.join("resources")), "首候选必须是 exe 同级 resources/");
        assert!(candidates.contains(&root), "同根候选也必须在列（安装版布局）");
        let hit = locate_repo_root(&candidates).expect("便携 zip 布局必须命中 repo root");
        assert_eq!(hit, root.join("resources"), "repo root 应解析为 resources/（sidecar=resources/sidecar、payload=resources/dsh-desktop）");
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 便携重定向时机：apply_portable_user_data_redirect 必须在 early_log 之前
    /// 生效——用启动器环境通道（PORTABLE_EXECUTABLE_DIR）注入验证：调用后
    /// DSH_TAURI_USERDATA 已指向 <dir>/data（early_log 随之落便携 data/，
    /// 不再写宿主 %APPDATA%）。非便携态不碰环境。
    #[test]
    fn portable_redirect_env_set_before_any_logging_would_run() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let dir = std::env::temp_dir().join(format!("dsh-tauri-portable-redirect-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // 前置：无便携输入时不得改动环境。
        let saved = std::env::var_os("DSH_TAURI_USERDATA");
        std::env::remove_var("DSH_TAURI_USERDATA");
        std::env::remove_var("PORTABLE_EXECUTABLE_DIR");
        apply_portable_user_data_redirect();
        assert!(std::env::var_os("DSH_TAURI_USERDATA").is_none(), "非便携态不得写 DSH_TAURI_USERDATA");
        // 启动器通道：重定向到 <dir>/data。
        std::env::set_var("PORTABLE_EXECUTABLE_DIR", &dir);
        apply_portable_user_data_redirect();
        assert_eq!(std::env::var_os("DSH_TAURI_USERDATA"), Some(dir.join("data").into_os_string()),
            "early_log 之前 DSH_TAURI_USERDATA 必须已指向便携 data/");
        // 收尾还原（防污染同进程其他测试的路径解析）。
        std::env::remove_var("PORTABLE_EXECUTABLE_DIR");
        match saved {
            Some(v) => std::env::set_var("DSH_TAURI_USERDATA", v),
            None => std::env::remove_var("DSH_TAURI_USERDATA"),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// NSIS 安装版布局 fixture：exe 与 dsh-desktop/ 同级、无 resources/。
    #[test]
    fn exe_walk_resolves_installed_flat_layout() {
        let root = std::env::temp_dir().join(format!("dsh-tauri-flat-fx-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let exe = root.join("dsh-tauri-app.exe");
        std::fs::create_dir_all(root.join("dsh-desktop").join("vendor").join("node")).unwrap();
        std::fs::write(root.join("dsh-desktop").join("vendor").join("node").join("node.exe"), b"fake-node").unwrap();

        let candidates = exe_walk_candidates(&exe);
        let hit = locate_repo_root(&candidates).expect("安装版同根布局必须命中 repo root");
        assert_eq!(hit, root, "repo root 应为 exe 所在目录本身");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn percent_encode_keeps_unreserved_and_escapes_rest() {
        assert_eq!(percent_encode("AZaz09-_.~"), "AZaz09-_.~");
        assert_eq!(percent_encode("a b<c>"), "a%20b%3Cc%3E");
        // 中文（UTF-8 三字节）逐字节转义。
        assert_eq!(percent_encode("你"), "%E4%BD%A0");
    }
}

#[cfg(test)]
mod panic_hook_tests {
    #[test]
    fn panic_payload_str_variants() {
        assert_eq!(crate::supervisor::panic_payload_str(&"boom"), "boom");
        assert_eq!(crate::supervisor::panic_payload_str(&String::from("boxed")), "boxed");
        assert_eq!(crate::supervisor::panic_payload_str(&42u8), "未知 panic 载荷");
    }
}

// ---------------------------------------------------------------------------
// 文件拖放（F1，2026-08）：Rust DragDropEvent → client-file-drop 事件
// ---------------------------------------------------------------------------
//
// 背景：Tauri 2 窗口默认 drag_drop_enabled=true（tauri-utils WindowConfig
// 默认；windows.rs 建主窗未关闭），wry-0.55 在 WebView2 上据此注册 OLE
// DropTarget 并 SetAllowExternalDrop(false)——页面 HTML5 dragover/drop 对
// 外部文件不触发，dsh-file-drop 插件（document 级 drop 监听）在桌面端
// 此前完全收不到拖放；网页端（浏览器直开 127.0.0.1）则原生工作——两端
// 行为不一致的根源。修复路线：保持原生拦截（WebView2 远程页的 HTML5
// File 本就拿不到完整路径，而插件对图片/二进制走「路径提示」语义正需要
// 路径），Rust 侧 DragDropEvent::Drop{paths} 携带完整路径，过滤分类后
// 广播给页面。
//
// 事件契约（壳→页面；bridge-shim.js 与 dsh-file-drop 插件消费方对齐）：
// - 事件名：`client-file-drop`（app.emit 全窗口广播；垫片转发为页面级
//   window CustomEvent 同名事件，插件 normalizeDropPayload 取
//   detail.files，多余键被其 sanitizer 忽略）。
// - 载荷：{"type":"drop","files":[{"path","name","ext","size","kind"}],
//   "skipped":[{"path","name","reason"}]} / {"type":"enter","count":N} /
//   {"type":"leave"}。
// - kind 口径：image=内核附件白名单扩展名（dsh-attachment-local
//   MEDIA_TYPES：png/jpeg/webp/gif）；text=插件 TEXT_EXT 同集或无扩展名；
//   其余 binary。与插件 classifyFile 同判定序（image 优先）。

/// 拖放广播事件名（垫片转发为页面级 window CustomEvent 同名事件，
/// dsh-file-drop 插件消费）。
pub const CLIENT_FILE_DROP_EVENT: &str = "client-file-drop";

/// 单次拖放接受的文件数上限（超量部分进 skipped 而非悄悄丢弃）。
pub const DROP_MAX_FILES: usize = 32;
/// 单文件大小预检上限（路径提示语义不读内容，此为载荷/下游防御性上限）。
pub const DROP_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// 图片扩展名白名单（内核 dsh-attachment-local MEDIA_TYPES 同口径）。
pub const DROP_IMAGE_EXT: &[&str] = &[".png", ".jpg", ".jpeg", ".webp", ".gif"];
/// 文本扩展名（与 dsh-file-drop 插件 client.js TEXT_EXT 同集）。
pub const DROP_TEXT_EXT: &[&str] = &[
    ".txt", ".md", ".markdown", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
    ".py", ".rb", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".cs",
    ".php", ".sh", ".bat", ".ps1", ".sql", ".html", ".htm", ".css", ".scss",
    ".less", ".xml", ".csv", ".tsv", ".log", ".env", ".gitignore", ".npmrc",
    ".lock", ".sum", ".properties", ".editorconfig", ".vue", ".svelte",
];

/// 扩展名（小写含点；无扩展名/隐藏文件首点 → 空串，与插件 extOf 的
/// dot<=0 同语义——「.gitignore」按无扩展名处理）。
pub fn drop_ext(file_name: &str) -> String {
    match file_name.rfind('.') {
        Some(dot) if dot > 0 => file_name[dot..].to_ascii_lowercase(),
        _ => String::new(),
    }
}

/// 文件分类：image（内核白名单）/ text（插件 TEXT_EXT 或无扩展名）/ binary。
/// 与插件 classifyFile 同判定序：image 优先，其次 text，兜底 binary。
pub fn drop_kind(ext: &str) -> &'static str {
    if DROP_IMAGE_EXT.contains(&ext) {
        "image"
    } else if ext.is_empty() || DROP_TEXT_EXT.contains(&ext) {
        "text"
    } else {
        "binary"
    }
}

/// Drop 预检结果（JSON 载荷直出，供事件 payload 组装与单测断言）。
pub struct DropPrecheck {
    pub files: Vec<serde_json::Value>,
    pub skipped: Vec<serde_json::Value>,
}

/// Drop 路径预检：目录/不存在/超大/超量剔除进 skipped（带 reason），存活
/// 项带 {path,name,ext,size,kind} 进 files。只读元数据，不读文件内容。
pub fn precheck_drop_paths(paths: &[std::path::PathBuf]) -> DropPrecheck {
    let mut out = DropPrecheck { files: Vec::new(), skipped: Vec::new() };
    for p in paths {
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let skip = |reason: &str| {
            serde_json::json!({ "path": p.display().to_string(), "name": name, "reason": reason })
        };
        let Ok(meta) = std::fs::metadata(p) else {
            out.skipped.push(skip("missing"));
            continue;
        };
        if !meta.is_file() {
            out.skipped.push(skip("directory"));
            continue;
        }
        if meta.len() > DROP_MAX_FILE_BYTES {
            out.skipped.push(skip("too-large"));
            continue;
        }
        if out.files.len() >= DROP_MAX_FILES {
            out.skipped.push(skip("too-many"));
            continue;
        }
        let ext = drop_ext(&name);
        out.files.push(serde_json::json!({
            "path": p.display().to_string(),
            "name": name,
            "ext": ext,
            "size": meta.len(),
            "kind": drop_kind(&ext),
        }));
    }
    out
}

/// DragDropEvent 路由：Drop→预检+全窗口广播；Enter/Leave→悬停反馈；
/// Over 为高频位置噪声，不转发。
fn route_drag_drop(app: &tauri::AppHandle, ev: &tauri::DragDropEvent) {
    match ev {
        tauri::DragDropEvent::Drop { paths, .. } => {
            let pre = precheck_drop_paths(paths);
            let _ = app.emit(
                CLIENT_FILE_DROP_EVENT,
                serde_json::json!({ "type": "drop", "files": pre.files, "skipped": pre.skipped }),
            );
        }
        tauri::DragDropEvent::Enter { paths, .. } => {
            let _ = app.emit(
                CLIENT_FILE_DROP_EVENT,
                serde_json::json!({ "type": "enter", "count": paths.len() }),
            );
        }
        tauri::DragDropEvent::Leave => {
            let _ = app.emit(CLIENT_FILE_DROP_EVENT, serde_json::json!({ "type": "leave" }));
        }
        tauri::DragDropEvent::Over { .. } => {} // 位置高频噪声，不转发
        // DragDropEvent 跨 crate 标记 non_exhaustive：未来新增变体默认静默。
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// TA1 测试加固门（用户批准的最小 cfg(test)] 门）：仅测试构建链接下方两个
// 单元测试文件——它们需要访问私有 mod（commands::updater_client / logging）
// 内的 pub 契约，tests/ 集成测试不可达。纯追加，零生产路径改动。
// ---------------------------------------------------------------------------
#[cfg(test)]
#[path = "ta1_property_unit.rs"]
mod ta1_property_unit;

#[cfg(test)]
#[path = "ta1_concurrency_unit.rs"]
mod ta1_concurrency_unit;
// ---------------------------------------------------------------------------
// Linux WebKitGTK 白屏根治回归门（tauri#9394 / v2 linux-graphics 文档）：
// 纯判定跨平台直验 + run() 接线形态断言（include_str CRLF 归一）。
// ---------------------------------------------------------------------------
#[cfg(test)]
mod linux_webkit_shape {
    use super::webkit_should_inject_dmabuf_off;

    /// 决策表：未设置 / 空 / 纯空白 → 注入；任意非空值（含 "0"/"1"）→ 尊重用户不覆盖。
    #[test]
    fn dmabuf_off_injection_decision_table() {
        assert!(webkit_should_inject_dmabuf_off(None), "未设置应注入默认");
        assert!(webkit_should_inject_dmabuf_off(Some("")), "空串视为未设置");
        assert!(webkit_should_inject_dmabuf_off(Some("   ")), "纯空白视为未设置");
        assert!(!webkit_should_inject_dmabuf_off(Some("1")), "用户已设 1 不覆盖");
        assert!(!webkit_should_inject_dmabuf_off(Some("0")), "用户已设 0 也不覆盖（尊重显式接管）");
    }

    /// 接线形态：run() 必须在建 Builder 之前调用 apply_linux_webkit_workaround；
    /// 该函数注入 DMABUF 变量并做 Linux 平台门控（不拖累 Windows/macOS）。
    #[test]
    fn webkit_workaround_wired_before_builder_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        let body = src
            .split("fn apply_linux_webkit_workaround()")
            .nth(1)
            .and_then(|s| s.split("pub fn run()").next())
            .expect("apply_linux_webkit_workaround 函数体");
        assert!(body.contains("WEBKIT_DISABLE_DMABUF_RENDERER"), "必须注入 DMABUF 关闭变量");
        assert!(body.contains("target_os = \"linux\""), "必须 Linux 门控（不拖累 Win/mac）");
        let run_prologue = src
            .split("pub fn run() {")
            .nth(1)
            .and_then(|s| s.split("let mut builder = tauri::Builder::default();").next())
            .expect("run() prologue（Builder 之前）");
        assert!(run_prologue.contains("apply_linux_webkit_workaround()"), "run() 必须在建 Builder 前调用白屏根治（早于任何建窗）");
    }
}

