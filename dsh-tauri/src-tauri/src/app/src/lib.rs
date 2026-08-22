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

mod bounded;
mod commands;
mod pages;
mod poc_page;
mod supervisor;
// pub 供 tests/sponsor_window.rs 集成测试走生产同款建窗路径（mock runtime）。
pub mod windows;

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
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
    /// 主窗心跳计数（性能审计 2026-08 拆分）：假死看门狗只看本计数——
    /// 全窗口共用一个计数时，活的浮窗/宠物窗会永久掩蔽死的主窗（漏恢复）。
    /// 垫片按窗口归属标签上报（bridge-shim.js WINDOW_LABEL）。
    pub heartbeats_main: AtomicU32,
    /// 副窗（浮窗/宠物窗/未知标签）心跳计数（诊断用途，不参与假死判定）。
    pub heartbeats_side: AtomicU32,
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
    /// 静态页目录（%TEMP%/dsh-tauri-pages-<pid>；退出时清理，防随启动累积）。
    pub pages_dir: std::path::PathBuf,
}

impl AppState {
    fn empty() -> Self {
        Self {
            supervisor: Mutex::new(None),
            loading_url: Mutex::new(String::new()),
            recovery_url: Mutex::new(String::new()),
            heartbeats_main: AtomicU32::new(0),
            heartbeats_side: AtomicU32::new(0),
            page_errors: AtomicU32::new(0),
            current_session: Mutex::new(None),
            last_port: AtomicU32::new(0),
            paths: shell_core::DshPaths::resolve(),
            supervisor_tx: Mutex::new(None),
            boot_error: Mutex::new(None),
            balance: commands::balance::BalanceState::new(),
            pages_dir: std::env::temp_dir().join(format!("dsh-tauri-pages-{}", std::process::id())),
        }
    }
}

/// 测试用：环境变量互斥锁（DSH_TEST_HOME / DSH_HOME 变更期间串行化，
/// 防止并行测试读到中间态路径）。
#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// 进程级单实例锁（退出时 Drop 删锁文件；强杀残留由陈锁回收逻辑兜底）。
static INSTANCE_LOCK: std::sync::Mutex<Option<shell_core::SingleInstanceGuard>> = std::sync::Mutex::new(None);

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

pub fn run() {
    install_panic_hook();
    tauri::Builder::default()
        // 第二实例拉起（用户双击图标而应用已在跑）：聚焦既有主窗而非报错退出。
        // 必须注册在最前（官方要求）；shell-core 单实例锁保留为跨窗体兜底。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
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
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                            sv.shutdown();
                        }
                    }
                }
                tauri::RunEvent::Exit => {
                    // std::process::exit 不跑 Drop：锁与内核树在此显式收尾
                    //（Review#2：exit(0) 后锁残留实测）。
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                            sv.shutdown();
                        }
                        // 静态页目录随退出清理（防 %TEMP% 随启动累积）。
                        let _ = std::fs::remove_dir_all(&state.pages_dir);
                    }
                    if let Some(mut g) = INSTANCE_LOCK.lock().unwrap_or_else(|p| p.into_inner()).take() {
                        g.release();
                    }
                }
                _ => {}
            }
        });
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // ---- 升级适配：便携版 userData 重定向（Electron main.js:5317 同语义）----
    // 顺序必须在「读取任何 userData 路径」之前：paths/锁/日志全部随之落到 data/。
    if let Some(portable) = shell_core::upgrade::portable_user_data_dir() {
        // 重定向方式：环境变量注入（shell-core paths 的 dev 覆盖通道复用，
        // 语义 = Electron app.setPath('userData', portable)）。
        std::env::set_var("DSH_TAURI_USERDATA", &portable);
        eprintln!("[upgrade] 便携版运行：userData → {}", portable.display());
    }
    let state = AppState::empty();
    upgrade_first_run_report(&state);
    // 历史残留清扫（性能审计 2026-08）：静态页目录每次启动新建一个
    // （dsh-tauri-pages-<pid>），强杀形态无人清理会在 %TEMP% 无限累积——
    // 启动时清 7 天前的旧目录（本次目录刚建，mtime 新，天然不受影响）。
    sweep_stale_page_dirs();
    // ---- 静态页（loading / recovery / poc）经 preview-server 托管 ----
    let dir = state.pages_dir.clone();
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
            eprintln!("[route] 事件路由 panic（已隔离，继续处理后续事件）");
        }
    }
}

fn route_one_event(app: &tauri::AppHandle, ev: SupervisorEvent) {
    match ev {
            SupervisorEvent::BootStep { name, ok, ms, error } => {
                // boot 步骤结果必须落日志（此前只 emit 给 loading 页不打日志，
                // 「启动受阻」类误报在 app.log 中不可见、无法取证）。
                if ok {
                    eprintln!("[route] boot 步骤 {name} OK（{ms}ms）");
                } else {
                    eprintln!("[route] boot 步骤 {name} FAIL（{ms}ms）: {}", error.as_deref().unwrap_or("未知失败"));
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
                let _ = commands::navigate_main(&app, &url);
                // 诊断探针 t0：DSH_TAURI_DIAG=1 才启用（性能审计 2026-08 门控
                // 修正）——历史缺陷：无条件执行，每次内核就绪都 invoke 一次
                // current_session('[diag] t0')，把真实会话指针顶掉（通知跳转
                // 的聚焦豁免失效直到用户切会话）+ 一次 preview-server 空转。
                if std::env::var("DSH_TAURI_DIAG").ok().as_deref() == Some("1") {
                    if let Some(w) = app.get_webview_window("main") {
                        let diag_base = { let u = app.state::<AppState>().loading_url.lock().unwrap_or_else(|p| p.into_inner()).clone(); let mut o = String::new(); if let Some(pos) = u.rfind('/') { o = u[..pos].to_string(); } o };
                        match w.eval(&format!("window.__DIAG_BASE__={:?}; window.__TAURI_INTERNALS__.invoke('current_session',{{sessionId:'[diag] t0'}}).then(function(){{fetch(window.__DIAG_BASE__+'/__diag/t0-invoke-OK')}},function(err){{fetch(window.__DIAG_BASE__+'/__diag/t0-invoke-REJECT-'+encodeURIComponent(String(err&&err.message||err)))}})", diag_base)) {
                            Ok(_) => eprintln!("[diag] t0 eval OK"),
                            Err(e) => eprintln!("[diag] t0 eval ERR: {e}"),
                        }
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
                // 诊断探针（DSH_TAURI_DIAG=1）：换页 10s 后抓 dialog/composer/console 状态。
                inject_diag_probe(app.clone());
            }
            SupervisorEvent::KernelExit { code, .. } => {
                eprintln!("[route] 内核退出 code={code:?}");
            }
            SupervisorEvent::CrashLoop { crashes } => {
                // 崩溃环路由此前零日志：真机排障时「频繁重启」在日志里不可见。
                eprintln!("[route] 崩溃环触发（累计 {crashes} 次），主窗转恢复页");
                let _ = app.emit("kernel-fail", serde_json::json!({ "reason": "内核反复异常退出" }));
                if let Some(state) = app.try_state::<AppState>() {
                    let recovery = state.recovery_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
                    let _ = commands::navigate_main(&app, &recovery);
                }
                let _ = app.notification().builder()
                    .title("DSH Desktop")
                    .body("内核服务反复异常退出，已进入恢复模式")
                    .show();
            }
            SupervisorEvent::ProbeFailed { consecutive } => {
                eprintln!("[route] 探活失败 ×{consecutive}");
            }
            SupervisorEvent::ZombieSuspect { consecutive } => {
                // 假死形态（#122/#129）：TCP 通、HTTP 无响应——日志可区分于崩溃重启。
                eprintln!("[route] 内核假死可疑 ×{consecutive}（端口通、HTTP 无响应）");
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
/// CARGO_MANIFEST_DIR 是编译机绝对路径，在用户机上必然不存在——打包态
/// 只有 exe 相对布局可靠。
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
        let mut cur = exe.parent().map(|p| p.to_path_buf());
        while let Some(d) = cur {
            candidates.push(d.join("resources"));
            candidates.push(d.clone());
            cur = d.parent().map(|p| p.to_path_buf());
        }
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
    let menu = tauri::menu::MenuBuilder::new(app)
        .text("show", "显示主窗口")
        .text("logs", "打开日志")
        .separator()
        .text("quit", "退出")
        .build()?;
    let tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().ok_or("无应用图标")?)
        .tooltip("DSH Desktop")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "logs" => {
                // 跨平台开启器（explorer/open/xdg-open）——此前仅 Windows 拉
                // explorer，mac/linux 托盘「打开日志」点了没反应。
                let dir = shell_core::DshPaths::resolve().logs;
                let _ = std::fs::create_dir_all(&dir);
                let _ = commands::open_in_explorer(&dir);
            }
            "quit" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                        sv.shutdown();
                    }
                }
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    // 托盘生命周期：随进程退出回收；Drop 会摘图标，进程内需常驻 → forget。
    std::mem::forget(tray);
    Ok(())
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
                reg.contains(&c.tauri) || c.tauri == "guard_action",
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
        assert!(!reg.contains(&"guard_action"), "裁撤命令不得注册");
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
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
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
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
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
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
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
/// 判定口径（性能审计 2026-08 修正）：
/// - 只统计主窗心跳（heartbeats_main，垫片按窗口归属标签上报）——全窗口
///   共用一个计数时，活的浮窗/宠物窗会永久掩蔽死的主窗（漏恢复）。
/// - 不可见**或最小化**都不计失联（common::window_watchable 单一口径）——
///   Windows 上最小化窗 is_visible 仍为 true，缺 minimized 检查时定时器
///   节流（~1 次/分）被误判为停摆 → 每 ~5-6 分钟一次的重载风暴。
///
/// 内存审计（2026-08）：KernelReady 事件在每次内核重启（自动重启 / 假死受控
/// 重启 / restart_service / 恢复页重试）都会触发——且单次 boot 会发两回
/// （stdout 就绪行线程 + 瀑布 on_boot_success）。旧实现每次都 spawn 一个
/// 「永不退出」的监测线程（仅主窗销毁才退），随重启次数只增不减（每次
/// 崩溃环 5 次重启 = 累积 10 线程，各持 AppHandle 每 10s 轮询）。
/// 修法：代数号交替——新监测线程上岗即令旧线程（≤10s 内）自行退出，
/// 任一时刻至多一个活跃监测线程。
static HEARTBEAT_WATCHER_GEN: AtomicU64 = AtomicU64::new(0);
fn watch_renderer_heartbeat(app: tauri::AppHandle) {
    let gen = HEARTBEAT_WATCHER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        // 宽限：等第一条心跳到达（或 60s 超时进入持续监测）。
        let baseline = app
            .try_state::<AppState>()
            .map(|s| s.heartbeats_main.load(Ordering::Relaxed))
            .unwrap_or(0);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        while std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_secs(5));
            if let Some(state) = app.try_state::<AppState>() {
                if state.heartbeats_main.load(Ordering::Relaxed) > baseline {
                    break;
                }
            }
        }
        let mut last = app
            .try_state::<AppState>()
            .map(|s| s.heartbeats_main.load(Ordering::Relaxed))
            .unwrap_or(0);
        let mut stall: u32 = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(10));
            // 代数交替：有更晚的监测线程接岗 → 本线程退出（防重启循环下线程只增不减）。
            if HEARTBEAT_WATCHER_GEN.load(Ordering::Relaxed) != gen {
                return;
            }
            let Some(state) = app.try_state::<AppState>() else { return };
            let Some(win) = app.get_webview_window("main") else { return };
            // 不可见/最小化窗口定时器被节流（Electron 判定口径 + minimized，
            // 全仓统一 common::window_watchable）——不计失联。
            let watchable = commands::common::window_watchable(win.is_visible().ok(), win.is_minimized().ok());
            if !watchable {
                stall = 0;
                last = state.heartbeats_main.load(Ordering::Relaxed);
                continue;
            }
            let now = state.heartbeats_main.load(Ordering::Relaxed);
            if now == last {
                stall += 1;
            } else {
                stall = 0;
                last = now;
            }
            if stall >= 4 {
                eprintln!("[renderer-recovery] 可见主窗心跳停摆 {}0 秒，自动重载页面", stall);
                let _ = win.eval("try{location.reload()}catch(e){}");
                stall = 0;
            }
        }
    });
}

/// 清扫 %TEMP% 里 7 天前的 dsh-tauri-pages-* 残留目录（强杀形态无人清理；
/// 原子性：目录 mtime 判龄，本次运行的目录天然不受影响）。
fn sweep_stale_page_dirs() {
    const SEVEN_DAYS_SECS: u64 = 7 * 86400;
    let Ok(rd) = std::fs::read_dir(std::env::temp_dir()) else { return };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("dsh-tauri-pages-") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_dir() {
            continue;
        }
        let aged = meta
            .modified()
            .ok()
            .and_then(|m| m.elapsed().ok())
            .map(|age| age.as_secs() > SEVEN_DAYS_SECS)
            .unwrap_or(false);
        if aged {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
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
          rep('confirm-returns:'+r+' polyfilled='+(window.__dshDialogPolyfilled===true));
          rep('bridge:'+typeof window.dshDesktop);
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
        })()"#;

        // 探针基址注入（fetch 通道）。`probe base eval`
        if let Some(state) = app.try_state::<AppState>() {
            let u = state.loading_url.lock().unwrap_or_else(|p| p.into_inner()).clone();
            if let Some(pos) = u.rfind('/') {
                let _ = win.eval(&format!("window.__DIAG_BASE__={:?}", &u[..pos]));
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
    use super::*;

    /// 形态锚点（内存审计 2026-08）：心跳监测线程必须带代数交替退出路径
    /// ——KernelReady 每次内核重启都会触发（且单次 boot 发两回），无守卫时
    /// 监测线程随重启次数只增不减（各持 AppHandle 永久 10s 轮询）。
    /// 性能审计（同月）追加两条判定口径锚点：
    /// - 只统计主窗计数 heartbeats_main（全窗共用计数会被活的浮窗掩蔽）；
    /// - 不可见**或最小化**均不计失联（window_watchable 单一口径——Windows
    ///   上最小化窗 is_visible 仍为 true，缺此检查 = 周期性重载风暴）。
    #[test]
    fn heartbeat_watcher_has_generation_guard_shape() {
        let src = include_str!("lib.rs");
        let seg = src
            .split("fn watch_renderer_heartbeat")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 清扫 %TEMP%").next())
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
        assert!(
            !seg.contains("s.heartbeats.load") && !seg.contains("state.heartbeats.load"),
            "不得再读全窗口混计的 heartbeats（浮窗掩蔽主窗假死）: {seg}"
        );
        assert!(
            seg.contains("heartbeats_main.load"),
            "必须只统计主窗计数 heartbeats_main: {seg}"
        );
        assert!(
            seg.contains("window_watchable") && seg.contains("is_minimized"),
            "失联判定必须含最小化检查（window_watchable 单一口径）: {seg}"
        );
    }

    /// 静态页目录清扫（性能审计 2026-08）：7 天前的 dsh-tauri-pages-* 删除，
    /// 新建的与无关目录不动。（目录 mtime 回拨需 PowerShell——std 无法对
    /// 目录句柄 set_modified，Windows 目录句柄不可写。）
    #[cfg(windows)]
    #[test]
    fn sweep_stale_page_dirs_removes_only_aged() {
        use crate::commands::common::NoWindow;
        let tmp = std::env::temp_dir();
        let mk = |name: &str| {
            let d = tmp.join(name);
            let _ = std::fs::remove_dir_all(&d);
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join("x.html"), b"x").unwrap();
            d
        };
        let backdate = |d: &std::path::Path, days: u64| {
            let script = format!(
                "(Get-Item -LiteralPath '{}').LastWriteTime = (Get-Date).AddDays(-{})",
                d.to_string_lossy().replace('\'', "''"),
                days
            );
            let ok = std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", &script])
                .creation_flags_no_window()
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            assert!(ok, "目录 mtime 回拨失败（前置条件）: {}", d.display());
        };
        let stale = mk(&format!("dsh-tauri-pages-19999-stale-{}", std::process::id()));
        let fresh = mk(&format!("dsh-tauri-pages-19998-fresh-{}", std::process::id()));
        let unrelated = mk(&format!("dsh-unrelated-{}", std::process::id()));
        backdate(&stale, 8);
        backdate(&unrelated, 30);
        sweep_stale_page_dirs();
        assert!(!stale.exists(), "8 天前的静态页目录必须被清");
        assert!(fresh.exists(), "新目录不得误删");
        assert!(unrelated.exists(), "无关目录不得误删");
        let _ = std::fs::remove_dir_all(&fresh);
        let _ = std::fs::remove_dir_all(&unrelated);
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
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let root = fake_root("env");
        std::env::set_var("DSH_TAURI_REPO_ROOT", &root);
        let found = find_repo_root().expect("显式覆盖且布局合法时必须命中");
        std::env::remove_var("DSH_TAURI_REPO_ROOT");
        assert_eq!(found, root);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn find_repo_root_env_override_invalid_is_error() {
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        std::env::set_var("DSH_TAURI_REPO_ROOT", std::env::temp_dir());
        let r = find_repo_root();
        std::env::remove_var("DSH_TAURI_REPO_ROOT");
        assert!(r.is_err(), "显式覆盖但布局非法应 Err（提示覆盖值问题）");
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
    use super::*;

    #[test]
    fn panic_payload_str_variants() {
        assert_eq!(crate::supervisor::panic_payload_str(&"boom"), "boom");
        assert_eq!(crate::supervisor::panic_payload_str(&String::from("boxed")), "boxed");
        assert_eq!(crate::supervisor::panic_payload_str(&42u8), "未知 panic 载荷");
    }
}
