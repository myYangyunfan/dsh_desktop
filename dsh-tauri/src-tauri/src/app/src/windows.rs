//! 多窗管理：主窗（loading→内核页）、浮窗（分屏）、宠物窗（透明）、赞助窗。
//!
//! 参数对齐 Electron 版（main.js createFloatWindow/createPetWindow/createSponsorWindow）：
//! - 浮窗 900×640（min 480×360），同会话复用、上限 4 个；
//! - 宠物窗 160×160 透明置顶、跳过任务栏、不可调尺寸、位置记忆；
//! - 赞助窗原生边框小窗：内嵌资产占位页 + initialization_script 注入
//!   （零 file://、零本地端口、零磁盘写入——v0.5.0 安装版三联症终修）。
//!
//! 所有窗都注入 bridge 垫片（initialization_script 对每次导航生效）；
//! 浮窗/宠物窗追加模式注入脚本（`__DSH_FLOAT__` / `__DSH_PET__`，契约 bridge-api.md §5）。

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use bridge::{BridgeError, BRIDGE_SHIM_JS};
use tauri::{Emitter, Manager, WebviewUrl};

pub const FLOAT_MAX: usize = 4;
pub const PET_W: f64 = 160.0;
pub const PET_H: f64 = 160.0;

/// 浮窗会话注册表（label 前缀 float-）。
pub fn float_label(session_id: &str) -> String {
    format!("float-{}", sanitize_label(session_id))
}

/// label 只允许安全字符（防 label 注入）。
fn sanitize_label(s: &str) -> String {
    s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).take(64).collect()
}

/// 工作区逻辑尺寸 → 首次打开默认几何（纯计算，可单测）：
/// 90% 宽/高，clamp 到 [min 980×600, 舒适上限 1152×720]，并居中于工作区。
/// 小屏（< min）会顶到 min 下限（与 min_inner_size 同口径，绝不小于最小窗）。
fn compute_default_geometry(work_w: f64, work_h: f64, work_x: f64, work_y: f64) -> (f64, f64, f64, f64) {
    const DEFAULT_W: f64 = 1152.0;
    const DEFAULT_H: f64 = 720.0;
    const MIN_W: f64 = 980.0;
    const MIN_H: f64 = 600.0;
    const RATIO: f64 = 0.9;
    let w = (work_w * RATIO).clamp(MIN_W, DEFAULT_W);
    let h = (work_h * RATIO).clamp(MIN_H, DEFAULT_H);
    let x = work_x + (work_w - w) / 2.0;
    let y = work_y + (work_h - h) / 2.0;
    (w, h, x, y)
}

/// 首次打开（无已存状态）默认尺寸：相对主显示器**工作区**取合理比例，
/// 拿不到 monitor / scale_factor 非法 → 回退 1152×720（系统默认居中），
/// 绝不 panic。返回 (w, h, Some((x, y))) 逻辑像素（inner_size/position 同口径）。
fn default_main_window_geometry(app: &tauri::AppHandle) -> (f64, f64, Option<(f64, f64)>) {
    let Some(mon) = app.primary_monitor().ok().flatten() else {
        return (1152.0, 720.0, None);
    };
    let scale = mon.scale_factor();
    if scale <= 0.0 {
        return (1152.0, 720.0, None);
    }
    // work_area 是物理像素，除 scale_factor 转逻辑像素（inner_size/position 口径）。
    let wa = mon.work_area();
    let work_w = wa.size.width as f64 / scale;
    let work_h = wa.size.height as f64 / scale;
    let work_x = wa.position.x as f64 / scale;
    let work_y = wa.position.y as f64 / scale;
    let (w, h, x, y) = compute_default_geometry(work_w, work_h, work_x, work_y);
    (w, h, Some((x, y)))
}

/// 主窗：decorations 平台门 + 导航围栏 + 垫片。初始加载 loading 页。
///
/// Linux 例外：WebKitGTK 下 undecorated 窗口存在首帧不渲染/白屏的已知问题
/// （tauri/wry），故 Linux 退回原生标题栏。
/// macOS 例外：自绘控制条是 Windows 专属视觉（右上 min/max/close），mac
/// 用户只认左上红绿灯（含绿钮全屏）；实测报告「找不到关闭和全屏按钮」。
/// mac 退回原生标题栏（交通灯），垫片在该平台降级为仅注入 ⋯ 菜单悬浮钮
/// （菜单里的更新/退出/通知开关等功能不丢），不注入全宽控制条。
/// 仅 Windows 维持自绘标题栏（decorations:false）。
///
/// 高 DPI（2.8K）缩放：WebView2 已按系统 DPI 自动缩放 web 内容——wry 建窗时
/// 不覆盖 `ICoreWebView2Controller3::RasterizationScale`（默认 = 显示器 DPI ×
/// 系统文字缩放，且 `ShouldDetectMonitorScaleChanges` 默认 true，跨屏拖动到
/// 不同 scale 的显示器时 WebView2 会自动更新它）。因此此处**刻意不调用**
/// `set_zoom(scale_factor)`：`SetZoomFactor` 是乘在 `RasterizationScale` 之上的
/// 额外倍数，设成 `scale_factor` 会让页面 `devicePixelRatio ≈ scale²`，造成
/// 双重缩放。窗口几何的 scale_factor 换算（`default_main_window_geometry` /
/// `save_main_window_state`）是独立口径，已正确按逻辑/物理像素处理。
#[allow(clippy::too_many_arguments)]
pub fn create_main_window(
    app: &tauri::AppHandle,
    loading_url: &str,
    saved: Option<(i32, i32, f64, f64, bool)>,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    let mut b = tauri::webview::WebviewWindowBuilder::new(
        app,
        "main",
        // url 解析失败走既有 Result 通道（上层 setup `?`），不在主窗创建
        // 路径留 panic——「客户端必须能打开」原则。
        WebviewUrl::External(
            loading_url
                .parse::<tauri::Url>()
                .map_err(tauri::Error::InvalidUrl)?,
        ),
    )
    .title("DSH Desktop")
    .min_inner_size(980.0, 600.0)
    // 平台门：Linux（WebKitGTK undecorated 白屏）与 macOS（用户只认原生
    // 红绿灯，自绘控制条是 Windows 专属视觉）退回原生标题栏；仅 Windows
    // 自绘（decorations:false）。垫片在原生标题栏平台同步降级（见
    // bridge-shim.js 平台门），防双份控制条。
    .decorations(cfg!(any(target_os = "linux", target_os = "macos")))
    // 显式声明（用户实测「不能调整窗口大小」）：undecorated 窗口默认应可
    // 拖边缩放，显式置 true 防构建配置漂移；与 Electron frame:false +
    // resizable:true 行为对齐。
    .resizable(true)
    .initialization_script(BRIDGE_SHIM_JS)
    .on_navigation(|url| {
        // 导航围栏：仅 127.0.0.1（内核/内嵌页）与 tauri 内部协议。
        let s = url.as_str();
        s.starts_with("http://127.0.0.1") || s.starts_with("tauri://") || s.starts_with("http://tauri.localhost")
    });
    if let Some((x, y, w, h, maxed)) = saved {
        b = b.position(x as f64, y as f64).inner_size(w, h);
        if maxed {
            b = b.maximized(true);
        }
    } else {
        // 首次打开（无已存状态）：按当前显示器工作区取 90% 比例并居中，
        // 拿不到 monitor 回退 1152×720（系统默认居中），绝不 panic。
        let (w, h, pos) = default_main_window_geometry(app);
        b = b.inner_size(w, h);
        if let Some((x, y)) = pos {
            b = b.position(x, y);
        }
    }
    let win = b.build()?;
    let handle = app.clone();
    let was_minimized = std::sync::Arc::new(AtomicBool::new(false));
    win.on_window_event(move |e| {
        if matches!(e, tauri::WindowEvent::Resized(_)) {
            if let Some(w) = handle.get_webview_window("main") {
                if let Ok(max) = w.is_maximized() {
                    let _ = handle.emit("window-maximized", max);
                }
                // G3：主窗「最小化自动弹宠物窗」。tauri 2 的 WindowEvent 无
                // Minimized 变体（tao Windows 源码注释「if we decide to
                // implement one」），故在 Resized 里轮询 is_minimized()
                // （Win32 IsIconic 直问 OS）抓 WM_SIZE/SIZE_MINIMIZED 上升沿，
                // 语义对齐 Electron mainWindow.on('minimize')。
                if let Ok(min) = w.is_minimized() {
                    let was = was_minimized.swap(min, Ordering::Relaxed);
                    if min && !was {
                        if let Some(state) = handle.try_state::<crate::AppState>() {
                            let store = shell_core::SettingsStore::new(state.paths.settings.clone());
                            let auto_open = pet_auto_open_from_store(&store);
                            let pet_exists = handle.get_webview_window("pet").is_some();
                            if should_open_pet_on_minimize(auto_open, pet_exists) {
                                let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
                                if let Some(url) = sv.as_ref().and_then(|s| s.kernel_url()) {
                                    let _ = open_pet_window(&handle, &url);
                                }
                            }
                        }
                    }
                }
            }
        }
        if let tauri::WindowEvent::CloseRequested { api, .. } = e {
            // #160：关窗读 closeToTray（缺省 true，Electron `s.closeToTray !== false`
            // 同口径）——true 才 prevent_close + hide 到托盘（后台常驻、内核继续
            // 跑）；false 放行默认销毁：主窗为最后窗口时 tauri-runtime 触发
            // ExitRequested → 真退出（杀树仍走托盘「退出」/ExitRequested 的
            // supervisor.shutdown 路径，此处不再直接退进程）。
            let close_to_tray = handle
                .try_state::<crate::AppState>()
                .map(|state| {
                    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
                    close_to_tray_from_store(&store)
                })
                // 拿不到 AppState（异常启动态）保守按 true：宁隐藏留托盘，不误退。
                .unwrap_or(true);
            if close_to_tray {
                // prevent_close 必须显式调：不拦则窗口走默认销毁。
                api.prevent_close();
                if let Some(w) = handle.get_webview_window("main") {
                    hide_main_to_tray(&w);
                }
            }
        }
    });
    Ok(win)
}

/// 读主窗当前 outer_position + inner_size + is_maximized 并存到
/// window-state.json。隐藏到托盘（hide_main_to_tray）与真退出
/// （RunEvent::ExitRequested/Exit）两条路径共用——用户调整过窗口尺寸/位置后，
/// 无论走「关窗→托盘→退出」还是「托盘退出 / Cmd+Q」都能记住。任何读取失败
/// （窗口已销毁 / 异常退出）都 if let 静默跳过，绝不 panic。
///
/// 口径对齐：outer_position/inner_size 返回**物理像素**，而恢复侧
/// create_main_window 的 position/inner_size 吃**逻辑像素**（与
/// default_main_window_geometry 同口径）。必须除 scale_factor 转逻辑像素，
/// 否则高 DPI（scale≠1）下每次保存/恢复都会把窗口放大/偏移，越存越大。
pub fn save_main_window_state(app: &tauri::AppHandle) {
    if let (Some(w), Some(state)) = (app.get_webview_window("main"), app.try_state::<crate::AppState>()) {
        if let (Ok(pos), Ok(size), Ok(scale)) = (w.outer_position(), w.inner_size(), w.scale_factor()) {
            if scale <= 0.0 {
                return;
            }
            let maxed = w.is_maximized().unwrap_or(false);
            let x = pos.x as f64 / scale;
            let y = pos.y as f64 / scale;
            let w = size.width as f64 / scale;
            let h = size.height as f64 / scale;
            let _ = crate::save_window_state(&state, (x.round() as i32, y.round() as i32, w, h, maxed));
        }
    }
}

/// 关窗→托盘（0.5.0）：保存窗口状态后隐藏主窗。进程与内核继续运行，
/// 经托盘「显示主窗口」/ 双击图标（第二实例聚焦）唤回。
/// 唯一真退出入口 = 托盘「退出」（supervisor.shutdown + exit，Job Object 杀树）。
pub fn hide_main_to_tray(win: &tauri::WebviewWindow) {
    let app = win.app_handle();
    // 隐藏前保存窗口状态（settings.json windowState）——此后可能经强杀路径
    // 退出，CloseRequested 不再有触发机会。
    save_main_window_state(&app);
    let _ = win.hide();
}

/// 浮窗（分屏）：同会话复用 + 上限 FLOAT_MAX。
///
/// K23 卡死根治：WebView2 建窗必须在独立线程——同步 command（float_window）
/// 里 `build()` 会在 Windows 上死锁（Tauri 2 官方 Known issues；赞助窗 v0.5.0
/// 三症同源已修，浮窗/宠物窗此前漏改）。复用/FLOAT_MAX/URL 校验仍同步返回，
/// 只有建窗 + show 移入独立线程（与赞助窗/更新进度弹窗同款模式）。
pub fn open_float_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>, kernel_url: &str, session_id: &str) -> Result<serde_json::Value, BridgeError> {
    let label = float_label(session_id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(serde_json::json!({ "ok": true, "reused": true }));
    }
    let floats = app.webview_windows().keys().filter(|k| k.starts_with("float-")).count();
    if floats >= FLOAT_MAX {
        return Err(BridgeError::not_found(format!("浮窗已达上限 {FLOAT_MAX}")));
    }
    // 同步校验 URL：非法立即报错，不落入线程静默失败（白屏）。
    let url = kernel_url.trim_end_matches('/').to_string();
    let parsed = parse_url(&url)?;
    let mode_script = format!(
        r#"(function(){{ try{{ window.__DSH_FLOAT__ = Object.freeze({{ sessionId: {session_id_json} }}); }}catch(e){{}} }})();"#,
        session_id_json = serde_json::to_string(session_id).unwrap_or_else(|_| "\"\"".into())
    );
    let preset_script = float_session_preset(session_id);
    let handle = app.clone();
    std::thread::Builder::new()
        .name(format!("float-window-{label}"))
        .spawn(move || {
            // 双击竞态复检：两个线程同时过了外层检查时，后来者只聚焦。
            if let Some(existing) = handle.get_webview_window(&label) {
                let _ = existing.show();
                let _ = existing.set_focus();
                return;
            }
            match build_float_window(&handle, &label, parsed, &mode_script, &preset_script) {
                Ok(win) => {
                    let _ = win.show();
                }
                Err(e) => eprintln!("[float] 浮窗创建失败（不影响主窗）: {e}"),
            }
        })
        .map_err(|e| BridgeError::internal(format!("浮窗线程启动: {e}")))?;
    Ok(serde_json::json!({ "ok": true, "async": true }))
}

/// 浮窗构造（独立函数供集成测试复用——mock runtime 下走与生产完全
/// 同款的 builder 路径，验证窗口属性与销毁）。泛型 R 兼容 Wry/MockRuntime。
pub fn build_float_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    url: tauri::Url,
    mode_script: &str,
    preset_script: &str,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    tauri::webview::WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
        .title("DSH 会话")
        .inner_size(900.0, 640.0)
        .min_inner_size(480.0, 360.0)
        .decorations(false)
        .initialization_script(BRIDGE_SHIM_JS)
        .initialization_script(mode_script)
        .initialization_script(preset_script)
        .initialization_script(FLOAT_BAR_SCRIPT)
        .initialization_script(FLOAT_WATCHDOG_SCRIPT)
        .on_navigation(|url| url.as_str().starts_with("http://127.0.0.1"))
        .build()
}

/// URL 解析 helper。
fn parse_url(s: &str) -> Result<tauri::Url, BridgeError> {
    s.parse::<tauri::Url>().map_err(|e| BridgeError::internal(format!("url: {e}")))
}

/// 浮窗 localStorage 预置（Electron preload 语义：比 sessions.open() 可靠）。
fn float_session_preset(session_id: &str) -> String {
    format!(
        r#"(function(){{
  try {{
    var sid = {sid};
    var key = 'dsh.sessions.current';
    var raw = localStorage.getItem(key);
    var parsed = raw ? JSON.parse(raw) : {{}};
    if (parsed && typeof parsed === 'object') {{
      parsed.sessionId = String(sid);
      delete parsed.subagentAddress;
      localStorage.setItem(key, JSON.stringify(parsed));
    }}
  }} catch (e) {{}}
}})();"#,
        sid = serde_json::to_string(session_id).unwrap_or_else(|_| "\"\"".into())
    )
}

/// 浮窗 24px 纯拖拽条 + 关闭按钮（DOMContentLoaded 注入，避免 head 未就绪）。
const FLOAT_BAR_SCRIPT: &str = r#"
(function(){
  function inject(){
    if (document.getElementById('__dsh_desktop_floatbar__')) return;
    var bar = document.createElement('div');
    bar.id = '__dsh_desktop_floatbar__';
    bar.setAttribute('data-tauri-drag-region', '');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:24px;z-index:2147483647;' +
      'display:flex;align-items:center;background:rgba(15,20,28,.92);border-bottom:1px solid #232b36;' +
      'font:12px "Segoe UI","Microsoft YaHei",sans-serif;color:#9fb0c0;user-select:none;pointer-events:auto';
    var t = document.createElement('span');
    t.textContent = 'DSH 会话'; t.style.cssText = 'padding:0 10px;pointer-events:none';
    var sp = document.createElement('span'); sp.style.flex = '1';
    var btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.style.cssText = 'width:36px;height:24px;border:0;background:transparent;color:#d7dde4;cursor:pointer;font-size:12px';
    btn.onmouseenter = function(){ btn.style.background = '#c0392b'; };
    btn.onmouseleave = function(){ btn.style.background = 'transparent'; };
    btn.onclick = function(){ try { window.dshDesktop.floatWindow.close(); } catch (e) {} };
    bar.appendChild(t); bar.appendChild(sp); bar.appendChild(btn);
    document.body.style.paddingTop = '24px';
    (document.body || document.documentElement).appendChild(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
"#;

/// 浮窗活性看门狗（FW1 白屏双保险的壳层一半）：
/// - initialization_script 通道（AddScriptToExecuteOnDocumentCreated），每次
///   导航/reload 必执行，不依赖 eval 时序；
/// - 3s 后 body 仍无任何子元素（内核未监听/重启窗口期导航失败、SPA 挂掉）
///   → 自动 reload 一次（sessionStorage 记次数，每窗最多一次）；
/// - reload 后 3s 仍死 → 可见错误卡（重试/关闭），绝不留纯白屏；
/// - about:blank 预导航文档直接跳过（protocol 守卫）。
const FLOAT_WATCHDOG_SCRIPT: &str = r#"
(function(){
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  var FLAG = '__dsh_float_watchdog_reloaded__';
  function flag(){
    try { return sessionStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }
  function setFlag(v){
    try { if (v) sessionStorage.setItem(FLAG, '1'); else sessionStorage.removeItem(FLAG); } catch (e) {}
  }
  function alive(){
    try { return !!(document.body && document.body.childElementCount > 0); } catch (e) { return false; }
  }
  function showError(){
    if (document.getElementById('__dsh_float_load_error__')) return;
    var d = document.createElement('div');
    d.id = '__dsh_float_load_error__';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:12px;background:#0b1220;color:#e6ecff;' +
      'font:14px "Segoe UI","Microsoft YaHei",sans-serif;text-align:center;padding:24px';
    var t = document.createElement('div'); t.textContent = '浮窗页面加载失败';
    var sub = document.createElement('div');
    sub.style.cssText = 'color:#8b9ac4;font-size:12px;line-height:18px';
    sub.textContent = '页面长时间无内容（内核可能正在启动或重启），自动重试一次仍未恢复。';
    var btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:10px';
    var retry = document.createElement('button');
    retry.textContent = '重试';
    retry.style.cssText = 'min-width:88px;padding:6px 14px;border:1px solid #3a4656;border-radius:8px;background:#1a2332;color:#e6ecff;cursor:pointer;font-size:13px';
    retry.onclick = function(){ setFlag(false); location.reload(); };
    var close = document.createElement('button');
    close.textContent = '关闭浮窗';
    close.style.cssText = retry.style.cssText;
    close.onclick = function(){
      try {
        if (window.dshDesktop && window.dshDesktop.floatWindow && window.dshDesktop.floatWindow.close) {
          window.dshDesktop.floatWindow.close();
        } else if (window.close) { window.close(); }
      } catch (e) {}
    };
    btns.appendChild(retry); btns.appendChild(close);
    d.appendChild(t); d.appendChild(sub); d.appendChild(btns);
    (document.body || document.documentElement).appendChild(d);
    document.title = '浮窗加载失败';
  }
  setTimeout(function(){
    if (alive()) { setFlag(false); return; }
    if (!flag()) { setFlag(true); location.reload(); return; }
    showError();
  }, 3000);
})();
"#;

static PET_SEQ: AtomicU64 = AtomicU64::new(0);

/// G3：读 settings.json 的 pet.autoOpen（写侧 commands/window.rs
/// `pet_set_auto_open`，扁平键）。缺省 false（Electron `let petAutoOpen = false`
/// 同口径）；未设置/损坏/非布尔一律不弹。
pub fn pet_auto_open_from_store(store: &shell_core::SettingsStore) -> bool {
    store.get("pet.autoOpen").ok().flatten().and_then(|v| v.as_bool()).unwrap_or(false)
}

/// #160：读 settings.json 的 closeToTray（写侧 commands/menu.rs `toggle_setting`
/// 经 `toggle-close-to-tray`，扁平键）。缺省 **true**——对齐 Electron
/// `closeToTrayEnabled()` 的 `s.closeToTray !== false`（仅显式 false 才直接退出，
/// 未设置/损坏/非布尔一律关到托盘，绝不因坏配置误退丢会话）。
pub fn close_to_tray_from_store(store: &shell_core::SettingsStore) -> bool {
    store.get("closeToTray").ok().flatten().and_then(|v| v.as_bool()).unwrap_or(true)
}

/// G3：主窗最小化时应否自动弹宠物窗（纯判定，供事件分支与单测共用）。
/// `auto_open` 为 settings 的 pet.autoOpen；`pet_exists` 为宠物窗是否已存在
/// （防 minimize 反复触发重复弹）。二者缺一不可。
pub fn should_open_pet_on_minimize(auto_open: bool, pet_exists: bool) -> bool {
    auto_open && !pet_exists
}

/// 宠物窗：透明置顶小窗。WebView2 透明窗为已知风险点（roadmap R2）——
/// 创建失败仅日志，不拖垮主流程。
///
/// K23 卡死根治：建窗必须在独立线程——同步 command（pet_window）与主窗
/// on_window_event（最小化自动弹宠物窗 G3）里 `build()` 都会在 Windows 上
/// 死锁（Tauri 2 官方 Known issues）。复用/URL 校验同步返回，建窗 + show +
/// pet-state 事件移入独立线程（与赞助窗/更新进度弹窗同款模式）。
pub fn open_pet_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>, kernel_url: &str) -> Result<serde_json::Value, BridgeError> {
    if let Some(existing) = app.get_webview_window("pet") {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(serde_json::json!({ "ok": true, "open": true, "reused": true }));
    }
    // 同步校验 URL：非法立即报错，不落入线程静默失败（白屏）。
    let url = kernel_url.trim_end_matches('/').to_string();
    let parsed = parse_url(&url)?;
    let handle = app.clone();
    std::thread::Builder::new()
        .name("pet-window".into())
        .spawn(move || {
            // 双击竞态复检：两个线程同时过了外层检查时，后来者只聚焦。
            if let Some(existing) = handle.get_webview_window("pet") {
                let _ = existing.show();
                let _ = existing.set_focus();
                return;
            }
            let _seq = PET_SEQ.fetch_add(1, Ordering::Relaxed);
            match build_pet_window(&handle, parsed) {
                Ok(win) => {
                    let _ = win.show();
                    let _ = handle.emit("pet-state", serde_json::json!({ "open": true }));
                }
                Err(e) => eprintln!("[pet] 宠物窗创建失败（不影响主窗）: {e}"),
            }
        })
        .map_err(|e| BridgeError::internal(format!("宠物窗线程启动: {e}")))?;
    Ok(serde_json::json!({ "ok": true, "open": true, "async": true }))
}

/// 宠物窗构造（独立函数供集成测试复用——mock runtime 下走与生产完全
/// 同款的 builder 路径，验证窗口属性与销毁）。泛型 R 兼容 Wry/MockRuntime。
pub fn build_pet_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    url: tauri::Url,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let b = tauri::webview::WebviewWindowBuilder::new(
        app,
        "pet",
        WebviewUrl::External(url),
    )
    .title("DSH 宠物")
    .inner_size(PET_W, PET_H)
    .decorations(false);
    // 透明窗口需要平台特定支持：Windows 直接开透明；macOS 上 transparent()
    // 方法仅 macos-private-api feature 才存在（未启用，调用即编译失败），
    // Linux 虽有该方法但需 webkit 特定配置——非 Windows 统一不调用，
    // 默认即不透明（宠物窗有实底色，视觉降级可接受）。
    #[cfg(target_os = "windows")]
    let b = b.transparent(true);
    b.always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .maximizable(false)
    .shadow(false)
    .initialization_script(BRIDGE_SHIM_JS)
    .initialization_script(PET_MODE_SCRIPT)
    .initialization_script(PET_WATCHDOG_SCRIPT)
    .on_navigation(|url| url.as_str().starts_with("http://127.0.0.1"))
    .build()
}

/// 宠物窗模式注入：__DSH_PET__ + 隐藏非宠物节点 + 透明背景（DOMContentLoaded）。
const PET_MODE_SCRIPT: &str = r#"
(function(){
  try { window.__DSH_PET__ = {}; } catch (e) {}
  function inject(){
    var s = document.createElement('style');
    s.textContent = 'html,body{background:transparent!important;overflow:hidden!important}body>:not(#harness-pet-root){display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
"#;

/// 宠物窗白屏看门狗（K23，对齐 FW1 浮窗看门狗）：
/// - initialization_script 通道（每次导航/reload 必执行），about:blank 预导航
///   文档直接跳过（protocol 守卫）；
/// - 3s 后 body 仍无任何子元素（内核页未监听/重启窗口期导航失败 → 白窗）
///   → 自动 reload 一次（sessionStorage 记次数，每窗最多一次）；
/// - reload 后 3s 仍死 → 关闭宠物窗（160×160 透明小窗无内容即无意义，
///   绝不留白窗；宠物窗白屏此前无任何兜底——FW1 只覆盖了浮窗）。
const PET_WATCHDOG_SCRIPT: &str = r#"
(function(){
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  var FLAG = '__dsh_pet_watchdog_reloaded__';
  function flag(){
    try { return sessionStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }
  function setFlag(v){
    try { if (v) sessionStorage.setItem(FLAG, '1'); else sessionStorage.removeItem(FLAG); } catch (e) {}
  }
  function alive(){
    try { return !!(document.body && document.body.childElementCount > 0); } catch (e) { return false; }
  }
  function closeWin(){
    try {
      if (window.dshDesktop && window.dshDesktop.petWindow && window.dshDesktop.petWindow.close) {
        window.dshDesktop.petWindow.close();
      } else if (window.close) { window.close(); }
    } catch (e) {}
  }
  setTimeout(function(){
    if (alive()) { setFlag(false); return; }
    if (!flag()) { setFlag(true); location.reload(); return; }
    closeWin();
  }, 3000);
})();
"#;

/// 赞助小窗（v0.5.0 用户实测「打开卡死 + 无图 + 关不掉」第五轮终修）。
///
/// 【为什么前四轮全挂】旧链路逐条依赖「等待型/路径型」外部条件，在 NSIS
/// 安装版真实环境（AV/SmartScreen 扫描新 WebView2 renderer、用户名含
/// 中文/空格、%TEMP% 被实时扫描）逐条断裂：
/// 1. preview-server 前缀推导：端口存活 + URL 拼接，降级 data: 时直接产坏 URL；
/// 2. data: 顶层导航：WebView2（Chromium 内核）禁止顶层导航到 data: URL——白窗；
/// 3. file:// 直载 %TEMP%：路径编码（非 ASCII 用户名）+ AV 对 %TEMP% 新写入
///    html 的实时扫描锁定 → 导航失败白窗（用户感知「无图」）；
/// 4. 白窗后用户点 X，而 command 在 IPC 上下文同步 build() 等 event loop、
///    event loop 又被新窗口创建（被 AV 拖慢数十秒）占住 → 全应用无响应。
///
/// 【终修】三零依赖：零 file://、零本地端口、零磁盘写入——
/// - URL 用 `WebviewUrl::App`（Windows 实际 `http://tauri.localhost/index.html`，
///   Tauri 内嵌资产，编译期打进 exe，与安装路径/编码/杀软全解耦）；
/// - 页面内容经 `initialization_script` 注入（WebView2 官方
///   AddScriptToExecuteOnDocumentCreated 通道，每次导航必执行、无 eval 时序
///   竞争），图片以 data URI 内嵌——img data URI 在 http 上下文是 Chromium
///   最成熟路径（此前误诊「不稳定」的实为顶层 data: 导航被禁）；
/// - 窗口创建挪到独立线程：IPC 线程零窗口 API 调用，event loop 即使被
///   AV 拖慢也只是延迟弹窗，绝不反卡整个应用；
/// - 不注册任何 on_window_event：原生标题栏 X = 默认 destroy（无回调死锁面）。
pub fn open_sponsor_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>, qr_alipay: &str, qr_wechat: &str) -> Result<serde_json::Value, BridgeError> {
    if let Some(existing) = app.get_webview_window("sponsor") {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(serde_json::json!({ "ok": true, "reused": true }));
    }
    // 纯字符串组装（无窗口 API、无 IO）——IPC 线程只做这件事。
    let script = sponsor_inject_script(qr_alipay, qr_wechat);
    let handle = app.clone();
    std::thread::Builder::new()
        .name("sponsor-window".into())
        .spawn(move || {
            // 双击竞态复检：两个线程同时过了外层检查时，后来者只聚焦。
            if let Some(existing) = handle.get_webview_window("sponsor") {
                let _ = existing.show();
                let _ = existing.set_focus();
                return;
            }
            match build_sponsor_window(&handle, &script) {
                Ok(win) => {
                    let _ = win.show();
                }
                Err(e) => eprintln!("[sponsor] 赞助窗创建失败（不影响主窗）: {e}"),
            }
        })
        .map_err(|e| BridgeError::internal(format!("赞助窗线程启动: {e}")))?;
    Ok(serde_json::json!({ "ok": true, "async": true }))
}

/// 赞助窗构造（独立函数供集成测试复用——mock runtime 下走与生产完全
/// 同款的 builder 路径，验证窗口属性与销毁）。泛型 R 兼容 Wry/MockRuntime。
pub fn build_sponsor_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    inject_script: &str,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    tauri::webview::WebviewWindowBuilder::new(
        app,
        "sponsor",
        WebviewUrl::App("index.html".into()), // 内嵌资产占位页（ui/index.html，纯静态无脚本）
    )
    .title("请作者喝咖啡")
    .inner_size(500.0, 620.0)
    .resizable(false)
    .maximizable(false)
    .closable(true)
    .decorations(true) // 原生标题栏（含 X 关闭钮），默认关闭 = destroy
    .initialization_script(inject_script)
    .build()
}

/// 赞助页注入脚本：initialization_script 通道执行，DOM 就绪后整体替换
/// head（样式）与 body（内容）。脚本在导航前文档（about:blank）也会执行
/// 一次，改了即弃；真实导航后再次注入并应用——天然幂等。
/// pub 供集成测试（tests/sponsor_window.rs）以生产同款产物验证。
pub fn sponsor_inject_script(alipay_uri: &str, wechat_uri: &str) -> String {
    // 空 URI = 安装包 assets 缺失/被安全软件拦截（commands 层已打日志）：
    // 不开无图窗——占位诊断块自证缺什么，窗口仍可正常关闭。
    let qr = |uri: &str, alt: &str| {
        if uri.is_empty() {
            format!(r#"<div class="missing">【{alt}】收款码缺失<br>安装包 assets/sponsor/ 不完整<br>或被安全软件拦截，详见应用日志</div>"#)
        } else {
            format!(r#"<img src="{uri}" alt="{alt}">"#)
        }
    };
    let css = r#"*{box-sizing:border-box;margin:0}body{background:#0b1220;color:#e6ecff;font-family:"Segoe UI","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;height:100vh;user-select:none}
.sub{font-size:12px;color:#8b9ac4;line-height:18px;padding:10px 14px}
.codes{flex:1;display:flex;gap:16px;justify-content:center;align-items:center}
.codes img{width:220px;height:220px;border-radius:10px;background:#fff;padding:6px}
.cap{text-align:center;font-size:12px;color:#8b9ac4;padding-bottom:6px}
.missing{width:220px;height:220px;border-radius:10px;border:1px dashed #3a4656;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;color:#8b9ac4;line-height:20px;padding:12px}"#;
    let body = format!(
        r#"<div class="sub">如果这个工具帮到了你，可以请作者喝杯咖啡 ☕ 支持持续更新。</div>
<div class="codes">
<div>{alipay}<div class="cap">支付宝</div></div>
<div>{wechat}<div class="cap">微信</div></div>
</div>"#,
        alipay = qr(alipay_uri, "支付宝"),
        wechat = qr(wechat_uri, "微信"),
    );
    // serde_json 字符串字面量转义（项目既有模式，见 float_session_preset）。
    format!(
        r#"(function(){{
  var CSS = {css};
  var BODY = {body};
  function apply(){{
    try {{
      // CSS 文本必须包 <style> 再入 head——裸文本只是文本节点，永远不成
      // 样式表（R2 实测：零样式渲染，二维码按 1260px 原图挤进 501×620 窗）。
      if (document.head) document.head.innerHTML = '<style>' + CSS + '</style>';
      if (document.body) document.body.innerHTML = BODY;
      document.title = '请作者喝咖啡';
    }} catch (e) {{}}
  }}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
}})();"#,
        css = serde_json::to_string(css).unwrap_or_else(|_| "\"\"".into()),
        body = serde_json::to_string(&body).unwrap_or_else(|_| "\"\"".into()),
    )
}

// ---------------------------------------------------------------------------
// 客户端更新进度弹窗（下载时置顶小窗：进度条 + 百分比 + 关闭按钮）
// ---------------------------------------------------------------------------

/// 进度弹窗尺寸（小窗放主屏右上角，不遮挡主窗关键区）。
pub const UPDATE_PROGRESS_W: f64 = 360.0;
pub const UPDATE_PROGRESS_H: f64 = 120.0;

/// 进度弹窗事件名（Rust `emit` → 弹窗初始化脚本 `plugin:event|listen`）。
/// 与主窗消费的 `client-update-progress` 分开：弹窗是独立窗口，主窗垫片不
/// 订阅本事件，两条链路互不干扰。
pub const UPDATE_PROGRESS_EVENT: &str = "client-update-progress-window";

/// 更新进度弹窗的阶段（纯数据 + 纯判定，单测决策表）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdatePopupPhase {
    /// 不弹 / 关闭（未下载、mac·linux manual|replaced 降级、用户手动关闭后）。
    Closed,
    /// 下载中（pct 0..100）。
    Downloading(u8),
    /// 下载完成，正在安装（Windows 进程即将退出，弹窗随之消亡）。
    Installing,
    /// 下载失败（payload 带原因，弹窗显示失败文案 + 关闭按钮）。
    Failed,
}

/// 下载进度（received,total）→ 百分比（0..=100；total=0 未知按 0，超界钳到 100）。
pub fn update_popup_pct(received: u64, total: u64) -> u8 {
    if total == 0 {
        return 0;
    }
    ((received as u128 * 100 / total as u128) as u8).min(100)
}

/// 百分比 → 弹窗阶段（100% 归一 Installing，其余 Downloading）。
pub fn update_popup_phase_from_pct(pct: u8) -> UpdatePopupPhase {
    if pct >= 100 {
        UpdatePopupPhase::Installing
    } else {
        UpdatePopupPhase::Downloading(pct)
    }
}

/// 安装结果形态 → 弹窗阶段：仅 `installing`（Windows）走 Installing；
/// `manual`/`replaced`（mac·linux 降级，下载完成但安装交用户/就地替换）与
/// 其它形态 → Closed（不弹「正在安装」）。
pub fn update_popup_phase_from_install(result: &serde_json::Value) -> UpdatePopupPhase {
    if result.get("installing").is_some() {
        UpdatePopupPhase::Installing
    } else {
        UpdatePopupPhase::Closed
    }
}

/// 阶段 → 弹窗事件载荷（`{phase, pct?, message?}`）。
pub fn update_popup_event_payload(phase: UpdatePopupPhase, message: Option<&str>) -> serde_json::Value {
    match phase {
        UpdatePopupPhase::Closed => serde_json::json!({ "phase": "closed" }),
        UpdatePopupPhase::Downloading(pct) => serde_json::json!({ "phase": "downloading", "pct": pct }),
        UpdatePopupPhase::Installing => serde_json::json!({ "phase": "installing", "pct": 100 }),
        UpdatePopupPhase::Failed => {
            serde_json::json!({ "phase": "error", "message": message.unwrap_or("未知错误") })
        }
    }
}

/// 向进度弹窗发一次阶段更新（无窗口/未就绪时静默 no-op，绝不影响下载）。
pub fn emit_update_progress<R: tauri::Runtime>(app: &tauri::AppHandle<R>, phase: UpdatePopupPhase, message: Option<&str>) {
    let _ = app.emit(UPDATE_PROGRESS_EVENT, update_popup_event_payload(phase, message));
}

/// 弹窗默认位置：主屏右上角（留 24px 边距）。无显示器信息（mock/异常）→ None，
/// 交由系统默认居中。
fn update_progress_position<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<(f64, f64)> {
    let mon = app.primary_monitor().ok().flatten()?;
    let scale = mon.scale_factor();
    let x = (mon.size().width as f64 / scale - UPDATE_PROGRESS_W - 24.0).max(0.0);
    Some((x, 24.0))
}

/// 打开/复用客户端更新进度弹窗。复用赞助窗「内嵌资产 + initialization_script
/// 注入」的最小窗口模式：零 file://、零本地端口、零磁盘写入；窗口创建移出
/// IPC 线程（绝不反卡应用）。创建失败仅日志——进度弹窗是增强，下载主链不受影响。
pub fn open_update_progress_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>, version: &str) -> Result<serde_json::Value, BridgeError> {
    if let Some(existing) = app.get_webview_window("update-progress") {
        let _ = existing.show();
        return Ok(serde_json::json!({ "ok": true, "reused": true }));
    }
    let script = update_progress_inject_script(version);
    let handle = app.clone();
    std::thread::Builder::new()
        .name("update-progress-window".into())
        .spawn(move || {
            // 双击竞态复检：两个线程同时过了外层检查时，后来者只聚焦。
            if let Some(existing) = handle.get_webview_window("update-progress") {
                let _ = existing.show();
                return;
            }
            // 位置在窗口线程内算（primary_monitor 属窗口系统调用，与赞助窗
            // 同「IPC 线程零窗口 API」原则；mock runtime 无 primary_monitor，
            // 复用路径早退不会走到这里）。
            let position = update_progress_position(&handle);
            match build_update_progress_window(&handle, &script, position) {
                Ok(win) => {
                    let _ = win.show();
                }
                Err(e) => eprintln!("[update-progress] 进度弹窗创建失败（不影响下载）: {e}"),
            }
        })
        .map_err(|e| BridgeError::internal(format!("进度弹窗线程启动: {e}")))?;
    Ok(serde_json::json!({ "ok": true, "async": true }))
}

/// 进度弹窗构造（独立函数供集成测试复用——mock runtime 下走与生产完全
/// 同款的 builder 路径，验证窗口属性与销毁）。
pub fn build_update_progress_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    inject_script: &str,
    position: Option<(f64, f64)>,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let mut b = tauri::webview::WebviewWindowBuilder::new(
        app,
        "update-progress",
        WebviewUrl::App("index.html".into()), // 内嵌资产占位页（与赞助窗同款 ui/index.html）
    )
    .title("正在下载更新")
    .inner_size(UPDATE_PROGRESS_W, UPDATE_PROGRESS_H)
    .decorations(false) // 无原生标题栏，自绘拖拽区 + 关闭按钮
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(true)
    .always_on_top(true) // 置顶小窗，放角落不遮挡主窗
    .skip_taskbar(true)
    .shadow(false)
    .focused(false) // 创建不抢焦点（下载进度不打断用户当前操作）
    .initialization_script(inject_script);
    if let Some((x, y)) = position {
        b = b.position(x, y);
    }
    b.build()
}

/// 进度弹窗注入脚本：initialization_script 通道执行（每次导航必执行）。
/// DOM 就绪后整体替换 body 为进度 UI，订阅 UPDATE_PROGRESS_EVENT 更新
/// 进度条/百分比/阶段文案；关闭按钮走 window_control close（非主窗真关闭）。
/// 幂等：`__dshUpdWinInit` 防 initialization_script 在同一文档重复执行。
pub fn update_progress_inject_script(version: &str) -> String {
    let version_json = serde_json::to_string(version).unwrap_or_else(|_| "\"\"".into());
    let event_json = serde_json::to_string(UPDATE_PROGRESS_EVENT).unwrap_or_else(|_| "\"\"".into());
    // CSS 走 <style> 注入（内嵌资产页 CSP 不放行内联 style 属性，观感对齐赞助窗）。
    let css = r#"*{box-sizing:border-box;margin:0}body{background:#0b1220;color:#e6ecff;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;overflow:hidden;user-select:none}#__dsh_upd_win__{width:100%;height:100%;display:flex;flex-direction:column;padding:10px 14px;gap:10px}.upd-head{display:flex;align-items:center;gap:8px}.upd-title{flex:1;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.upd-close{flex:none;width:20px;height:20px;border:0;border-radius:5px;background:transparent;color:#8b9ac4;cursor:pointer;font-size:13px;line-height:18px}.upd-close:hover{background:#c0392b;color:#fff}.upd-track{height:8px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}.upd-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#4f7cff,#7aa2ff);transition:width .2s ease}.upd-fill-err{background:#ff5f57}.upd-pct{font-size:11px;color:#8b9ac4}.upd-fail{flex:none;align-self:flex-end;appearance:none;border:1px solid rgba(255,255,255,.16);border-radius:6px;background:transparent;color:#e6ecff;cursor:pointer;font-size:12px;padding:4px 12px}.upd-fail:hover{background:rgba(255,255,255,.09)}"#;
    format!(
        r#"(function(){{
  if (window.__dshUpdWinInit) return;
  window.__dshUpdWinInit = true;
  var EVENT = {event};
  var VERSION = {version};
  var CSS = {css};

  var root, titleEl, fillEl, pctEl, failBtn;
  function mk(tag, cls, text) {{
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }}
  function closeWin() {{
    try {{ window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke('window_control', {{ action: 'close' }}); }}
    catch (e) {{}}
    try {{ window.close(); }} catch (e2) {{}}
  }}
  function build() {{
    if (document.getElementById('__dsh_upd_win__')) return;
    try {{ document.body.innerHTML = ''; }} catch (e) {{}}
    root = mk('div'); root.id = '__dsh_upd_win__';
    var head = mk('div', 'upd-head');
    head.setAttribute('data-tauri-drag-region', ''); // 拖拽区（不遮挡主窗时用户可挪开）
    titleEl = mk('span', 'upd-title');
    titleEl.setAttribute('data-tauri-drag-region', ''); // 标题文字也参与拖拽（FLOAT_BAR 同款直接命中语义）
    head.appendChild(titleEl);
    var close = mk('button', 'upd-close', '\u2715');
    close.onclick = function () {{ closeWin(); }};
    head.appendChild(close);
    root.appendChild(head);
    var track = mk('div', 'upd-track');
    fillEl = mk('div', 'upd-fill');
    track.appendChild(fillEl);
    root.appendChild(track);
    pctEl = mk('div', 'upd-pct');
    root.appendChild(pctEl);
    failBtn = mk('button', 'upd-fail', '关闭');
    failBtn.style.display = 'none';
    failBtn.onclick = function () {{ closeWin(); }};
    root.appendChild(failBtn);
    document.body.appendChild(root);
    setPhase('downloading', 0, '');
  }}
  function setPhase(phase, pct, message) {{
    if (!fillEl) return;
    if (phase === 'error') {{
      titleEl.textContent = '下载失败';
      fillEl.className = 'upd-fill upd-fill-err';
      fillEl.style.width = '100%';
      pctEl.textContent = message ? ('下载失败：' + message) : '下载失败';
      failBtn.style.display = '';
    }} else if (phase === 'installing') {{
      titleEl.textContent = '下载完成';
      fillEl.className = 'upd-fill';
      fillEl.style.width = '100%';
      pctEl.textContent = '下载完成，正在安装…';
      failBtn.style.display = 'none';
    }} else if (phase === 'closed') {{
      closeWin();
    }} else {{
      titleEl.textContent = '正在下载 DSH Desktop v' + VERSION + '…';
      fillEl.className = 'upd-fill';
      var p = pct | 0; if (p < 0) p = 0; else if (p > 100) p = 100;
      fillEl.style.width = p + '%';
      pctEl.textContent = p + '%';
      failBtn.style.display = 'none';
    }}
  }}
  function apply(p) {{
    if (!p || typeof p !== 'object') return;
    if (!root) build();
    setPhase(p.phase || 'downloading', p.pct || 0, p.message || '');
  }}
  function ready(cb) {{
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb);
    else cb();
  }}
  ready(function () {{
    build();
    try {{
      var itn = window.__TAURI_INTERNALS__;
      if (itn && itn.invoke && itn.transformCallback) {{
        itn.invoke('plugin:event|listen', {{
          event: EVENT,
          target: {{ kind: 'Any' }},
          handler: itn.transformCallback(function (ev) {{
            var p = ev && ev.payload !== undefined ? ev.payload : ev;
            apply(p);
          }})
        }}).catch(function () {{}});
      }}
    }} catch (e) {{}}
  }});
}})();"#,
        event = event_json,
        version = version_json,
        css = serde_json::to_string(css).unwrap_or_else(|_| "\"\"".into()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 问题 1：首次打开默认几何——90% 工作区、clamp 到 [980×600, 1152×720]、
    /// 居中于工作区（左上角 + 剩余/2）。纯计算决策表。
    #[test]
    fn default_geometry_clamps_and_centers() {
        // 大屏（1920×1080 逻辑，无任务栏）→ 顶到舒适上限 1152×720，居中。
        assert_eq!(compute_default_geometry(1920.0, 1080.0, 0.0, 0.0), (1152.0, 720.0, 384.0, 180.0));
        // 笔记本 1366×768（任务栏占高，工作区 1366×728）→ 宽顶到 1152 上限、
        // 高 90%（655.2），都留边距不顶屏。
        let (w, h, x, y) = compute_default_geometry(1366.0, 728.0, 0.0, 0.0);
        assert_eq!(w, 1152.0, "宽应顶到新上限 1152（1366×0.9=1229.4 > 1152）");
        assert!((h - 655.2).abs() < 1e-9, "h={h}");
        assert!((x - (1366.0 - w) / 2.0).abs() < 1e-9, "x={x}");
        assert!((y - (728.0 - h) / 2.0).abs() < 1e-9, "y={y}");
        // 小屏 1024×640 → 宽顶到 min 980、高顶到 min 600（与 min_inner_size 同口径）。
        let (w, h, x, y) = compute_default_geometry(1024.0, 640.0, 0.0, 0.0);
        assert_eq!((w, h), (980.0, 600.0));
        assert!((x - (1024.0 - 980.0) / 2.0).abs() < 1e-9 && (y - (640.0 - 600.0) / 2.0).abs() < 1e-9);
        // 工作区左上角偏移（副屏坐标非 0,0）→ 居中基准随工作区平移。
        let (_, _, x2, y2) = compute_default_geometry(1920.0, 1080.0, 2000.0, 100.0);
        assert_eq!((x2, y2), (2000.0 + 384.0, 100.0 + 180.0));
    }

    #[test]
    fn float_label_sanitizes_hostile_input() {
        assert_eq!(float_label("abc123"), "float-abc123");
        // 注入字符被白名单替换。
        assert_eq!(float_label("a\" onclick=x"), "float-a__onclick_x");
        // 超长截断到 64。
        let long = "x".repeat(200);
        assert_eq!(float_label(&long).len(), "float-".len() + 64);
        // 中文 → 下划线（label 安全字符集）。
        assert_eq!(float_label("会话"), "float-__");
    }

    #[test]
    fn float_preset_embeds_session_and_clears_subagent() {
        let js = float_session_preset("sess-42");
        assert!(js.contains("\"sess-42\""), "sessionId 应以 JSON 字符串嵌入: {js}");
        assert!(js.contains("dsh.sessions.current"));
        assert!(js.contains("delete parsed.subagentAddress"), "对齐 Electron 语义（清 subagentAddress）");
        // 引号安全：恶意 id 不逃逸字符串（serde_json 会转义双引号）。
        let evil = float_session_preset("a\";alert(1);//");
        assert!(evil.contains("a\\\";alert(1);//"), "应 JSON 转义: {evil}");
    }

    #[test]
    fn pet_and_float_mode_scripts_present() {
        assert!(PET_MODE_SCRIPT.contains("__DSH_PET__"));
        assert!(PET_MODE_SCRIPT.contains("harness-pet-root"), "对齐 Electron：只保留宠物根节点");
        assert!(PET_MODE_SCRIPT.contains("background:transparent"));
        assert!(FLOAT_BAR_SCRIPT.contains("__dsh_desktop_floatbar__"));
        assert!(FLOAT_BAR_SCRIPT.contains("floatWindow.close"));
    }

    #[test]
    fn parse_url_accepts_local_rejects_junk() {
        assert!(parse_url("http://127.0.0.1:51731/").is_ok());
        assert!(parse_url("not a url").is_err());
        // scheme 不设限（围栏在 on_navigation 层）；只测形态拒绝。
    }

    /// G3：主窗「最小化自动弹宠物窗」决策表（纯函数）——
    /// 仅「设置开启 + 宠物窗未存在」才开；设置关闭 / 已开一律不弹。
    #[test]
    fn should_open_pet_on_minimize_decision_table() {
        assert!(should_open_pet_on_minimize(true, false), "开启+未开 → 应开");
        assert!(!should_open_pet_on_minimize(true, true), "开启+已开 → 不重复开");
        assert!(!should_open_pet_on_minimize(false, false), "关闭+未开 → 不弹");
        assert!(!should_open_pet_on_minimize(false, true), "关闭+已开 → 不弹");
    }

    /// G3：pet.autoOpen 读取口径——true 才弹；缺省/非布尔/损坏一律回落 false
    /// （Electron `let petAutoOpen = false` 同口径，绝不因坏配置误弹）。
    #[test]
    fn pet_auto_open_reads_flat_key_defaults_false() {
        let mut path = std::env::temp_dir();
        path.push(format!("dsh-pet-autoopen-{}-{}.json", std::process::id(), line!()));
        let _ = std::fs::remove_file(&path);
        let store = shell_core::SettingsStore::new(&path);
        // 缺省：未写入 → false。
        assert!(!pet_auto_open_from_store(&store));
        // 显式 true/false 往返。
        store.set("pet.autoOpen", serde_json::json!(true)).unwrap();
        assert!(pet_auto_open_from_store(&store));
        store.set("pet.autoOpen", serde_json::json!(false)).unwrap();
        assert!(!pet_auto_open_from_store(&store));
        // 非布尔（字符串）→ 回落缺省 false。
        store.set("pet.autoOpen", serde_json::json!("yes")).unwrap();
        assert!(!pet_auto_open_from_store(&store));
        let _ = std::fs::remove_file(&path);

        // 损坏文件 → load 自愈为空 → 回落 false。
        let mut bad = std::env::temp_dir();
        bad.push(format!("dsh-pet-autoopen-bad-{}-{}.json", std::process::id(), line!()));
        let _ = std::fs::remove_file(&bad);
        std::fs::write(&bad, "{not json").unwrap();
        let broken = shell_core::SettingsStore::new(&bad);
        assert!(!pet_auto_open_from_store(&broken));
        let _ = std::fs::remove_file(&bad);
        let _ = std::fs::remove_file(bad.with_extension("json.broken"));
    }

    /// G3 接线形态：主窗 Resized 轮询 is_minimized（tauri 2 无 Minimized 事件），
    /// 上升沿经 should_open_pet_on_minimize → open_pet_window，防回退到 V16
    /// 「只写不读」缺口（设置持久化了但从不生效）。
    #[test]
    fn minimize_auto_opens_pet_window_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn create_main_window")
            .nth(1)
            .and_then(|s| s.split("pub fn hide_main_to_tray").next())
            .expect("create_main_window 函数体");
        assert!(seg.contains("is_minimized"), "必须轮询最小化态（tauri 2 无 Minimized 事件）: {seg}");
        assert!(seg.contains("was_minimized"), "必须上升沿去重（防反复触发）: {seg}");
        assert!(seg.contains("pet_auto_open_from_store"), "必须经 pet_auto_open_from_store 读键: {seg}");
        assert!(seg.contains("should_open_pet_on_minimize"), "必须走纯判定门: {seg}");
        assert!(seg.contains("open_pet_window"), "判定为真必须打开宠物窗: {seg}");
    }

    /// 原生标题栏平台门：主窗 decorations 必须平台门控——Linux 退回原生
    /// 标题栏（undecorated 首帧不渲染是 tauri/wry 已知问题）；macOS 同样退
    /// 回原生标题栏（用户只认红绿灯/全屏钮，自绘控制条是 Windows 专属
    /// 视觉，实测「找不到关闭和全屏按钮」）。仅 Windows 维持自绘。
    #[test]
    fn main_window_decorations_platform_gated_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn create_main_window")
            .nth(1)
            .and_then(|s| s.split("pub fn hide_main_to_tray").next())
            .expect("create_main_window 函数体");
        assert!(
            seg.contains(".decorations(cfg!(any(target_os = \"linux\", target_os = \"macos\")))"),
            "主窗 decorations 必须平台门控（Linux 防白屏 + mac 原生红绿灯，仅 Win 自绘）: {seg}"
        );
        assert!(
            !seg.contains(".decorations(false)"),
            "主窗不得硬编码 decorations(false)（Linux 白屏回归面）: {seg}"
        );
    }

    /// G3：非主窗 minimize 不触发自动弹宠物窗——自动弹窗只接在主窗
    /// create_main_window 的 on_window_event 里；宠物/浮窗/赞助窗创建路径
    /// 不得出现 is_minimized / pet_auto_open_from_store / should_open_pet_on_minimize
    /// 触发逻辑（否则最小化宠物/浮窗也会反向弹新宠物窗，形成互相触发的坏循环）。
    #[test]
    fn non_main_windows_do_not_auto_open_pet_shape() {
        let src = include_str!("windows.rs");
        for (fn_name, end_marker) in [
            ("pub fn open_float_window", "/// URL 解析 helper"),
            ("pub fn open_pet_window", "/// 宠物窗模式注入"),
            ("pub fn open_sponsor_window", "pub fn build_sponsor_window"),
        ] {
            let seg = src
                .split(fn_name)
                .nth(1)
                .and_then(|s| s.split(end_marker).next())
                .unwrap_or_else(|| panic!("{fn_name} 函数体边界缺失"));
            assert!(!seg.contains("should_open_pet_on_minimize"), "{fn_name} 不得含自动弹宠物窗判定: {seg}");
            assert!(!seg.contains("pet_auto_open_from_store"), "{fn_name} 不得读 pet.autoOpen 触发弹窗: {seg}");
            assert!(!seg.contains("is_minimized"), "{fn_name} 不得轮询最小化态触发弹窗: {seg}");
        }
    }

    /// FW1 白屏双保险——壳层看门狗形态锚点：
    /// - 3s 活性探测 + reload 恰好一次（sessionStorage 防抖）+ 二次失败错误卡；
    /// - about:blank 预导航守卫（init script 在导航前文档也会执行一次）；
    /// - 错误卡必须可关闭（优先桥 floatWindow.close，退化 window.close）。
    #[test]
    fn float_watchdog_script_shape() {
        assert!(FLOAT_WATCHDOG_SCRIPT.contains("3000"), "3s 活性探测: {FLOAT_WATCHDOG_SCRIPT}");
        assert!(FLOAT_WATCHDOG_SCRIPT.contains("location.reload()"), "死后必须自动 reload: {FLOAT_WATCHDOG_SCRIPT}");
        assert!(FLOAT_WATCHDOG_SCRIPT.contains("__dsh_float_watchdog_reloaded__"), "reload 只做一次（标记）: {FLOAT_WATCHDOG_SCRIPT}");
        assert!(FLOAT_WATCHDOG_SCRIPT.contains("__dsh_float_load_error__"), "二次失败可见错误卡: {FLOAT_WATCHDOG_SCRIPT}");
        assert!(FLOAT_WATCHDOG_SCRIPT.contains("floatWindow.close"), "错误卡可关窗（桥优先）: {FLOAT_WATCHDOG_SCRIPT}");
        assert!(FLOAT_WATCHDOG_SCRIPT.contains("location.protocol"), "预导航 about:blank 守卫: {FLOAT_WATCHDOG_SCRIPT}");
    }

    /// 看门狗必须接进浮窗 builder（initialization_script 通道，reload 后仍生效）。
    #[test]
    fn float_window_builder_wires_watchdog_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn build_float_window")
            .nth(1)
            .and_then(|s| s.split("/// URL 解析 helper").next())
            .expect("build_float_window 函数体");
        assert!(seg.contains(".initialization_script(FLOAT_WATCHDOG_SCRIPT)"), "浮窗必须注入看门狗: {seg}");
        assert!(seg.contains(".initialization_script(BRIDGE_SHIM_JS)"), "桥垫片不得回退丢失: {seg}");
    }

    /// K23：浮窗建窗必须移入独立线程（同步 command 里 build() 在 Windows 死锁——
    /// Tauri 2 官方 Known issues）。open_float_window 只做复用/上限/URL 同步校验，
    /// 建窗 + show 全在 std::thread 线程内。
    #[test]
    fn float_window_creation_threaded_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn open_float_window")
            .nth(1)
            .and_then(|s| s.split("pub fn build_float_window").next())
            .expect("open_float_window 函数体");
        assert!(seg.contains("std::thread::Builder"), "浮窗建窗必须移出同步 command 线程: {seg}");
        assert!(seg.contains("build_float_window(&handle"), "必须经 build_float_window 建窗: {seg}");
        assert!(seg.contains("parse_url(&url)?"), "URL 必须同步校验（非法立即报错不白屏）: {seg}");
    }

    /// K23：宠物窗建窗必须移入独立线程（同步 command + 主窗 on_window_event
    /// 最小化自动弹宠物窗里 build() 都在 Windows 死锁）。open_pet_window 只做
    /// 复用/URL 同步校验，建窗 + show + pet-state 全在 std::thread 线程内。
    #[test]
    fn pet_window_creation_threaded_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn open_pet_window")
            .nth(1)
            .and_then(|s| s.split("pub fn build_pet_window").next())
            .expect("open_pet_window 函数体");
        assert!(seg.contains("std::thread::Builder"), "宠物窗建窗必须移出同步 command/事件线程: {seg}");
        assert!(seg.contains("build_pet_window(&handle"), "必须经 build_pet_window 建窗: {seg}");
        assert!(seg.contains("parse_url(&url)?"), "URL 必须同步校验（非法立即报错不白屏）: {seg}");
    }

    /// K23 宠物窗白屏看门狗形态锚点（对齐 FW1 浮窗看门狗）：
    /// - 3s 活性探测 + reload 恰好一次（sessionStorage 防抖）+ 二次失败关窗；
    /// - about:blank 预导航守卫（protocol 守卫）；
    /// - 关窗走桥 petWindow.close 优先，退化 window.close。
    #[test]
    fn pet_watchdog_script_shape() {
        assert!(PET_WATCHDOG_SCRIPT.contains("3000"), "3s 活性探测: {PET_WATCHDOG_SCRIPT}");
        assert!(PET_WATCHDOG_SCRIPT.contains("location.reload()"), "死后必须自动 reload: {PET_WATCHDOG_SCRIPT}");
        assert!(PET_WATCHDOG_SCRIPT.contains("__dsh_pet_watchdog_reloaded__"), "reload 只做一次（标记）: {PET_WATCHDOG_SCRIPT}");
        assert!(PET_WATCHDOG_SCRIPT.contains("petWindow.close"), "二次失败关窗（桥优先）: {PET_WATCHDOG_SCRIPT}");
        assert!(PET_WATCHDOG_SCRIPT.contains("location.protocol"), "预导航 about:blank 守卫: {PET_WATCHDOG_SCRIPT}");
        assert!(PET_WATCHDOG_SCRIPT.contains("childElementCount"), "活性探测盯 body 子元素: {PET_WATCHDOG_SCRIPT}");
    }

    /// 宠物窗看门狗必须接进 builder（initialization_script 通道，reload 后仍生效）。
    #[test]
    fn pet_window_builder_wires_watchdog_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn build_pet_window")
            .nth(1)
            .and_then(|s| s.split("/// 宠物窗模式注入").next())
            .expect("build_pet_window 函数体");
        assert!(seg.contains(".initialization_script(PET_WATCHDOG_SCRIPT)"), "宠物窗必须注入看门狗: {seg}");
        assert!(seg.contains(".initialization_script(PET_MODE_SCRIPT)"), "宠物模式注入不得回退丢失: {seg}");
        assert!(seg.contains(".initialization_script(BRIDGE_SHIM_JS)"), "桥垫片不得回退丢失: {seg}");
    }

    /// 主窗 CloseRequested 语义（#160）：读 closeToTray——true（缺省）拦截默认
    /// 销毁 → 隐藏留托盘；false 放行默认销毁 → 真退出。源码形态断言（WebviewWindow
    /// 无法在单测构造），防回退到无条件 prevent_close（#160 假开关）或 exit(0)
    /// （0.1.0 语义：关窗即退）。
    #[test]
    fn close_requested_hides_instead_of_exit_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("CloseRequested")
            .nth(1)
            .and_then(|s| s.split("/// 浮窗").next())
            .expect("CloseRequested 处理段");
        assert!(seg.contains("close_to_tray_from_store"), "必须读 closeToTray 设置: {seg}");
        assert!(seg.contains("if close_to_tray"), "必须以 closeToTray 门控: {seg}");
        assert!(seg.contains("prevent_close"), "true 分支必须拦截默认窗口销毁: {seg}");
        assert!(seg.contains("hide_main_to_tray"), "true 分支关窗 = 隐藏留托盘（非退出）: {seg}");
        assert!(!seg.contains("exit(0)"), "关窗不得直接退出进程（真退出走托盘/ExitRequested）: {seg}");
    }

    /// #160：closeToTray 读取口径——缺省 true（关到托盘）；仅显式 false 才放行
    /// 直接退出；显式 true / 非布尔 / 损坏一律回落 true（Electron
    /// `s.closeToTray !== false` 同口径，绝不因坏配置误退丢会话）。
    #[test]
    fn close_to_tray_reads_flat_key_defaults_true() {
        let mut path = std::env::temp_dir();
        path.push(format!("dsh-close-to-tray-{}-{}.json", std::process::id(), line!()));
        let _ = std::fs::remove_file(&path);
        let store = shell_core::SettingsStore::new(&path);
        // 缺省：未写入 → true（关到托盘）。
        assert!(close_to_tray_from_store(&store));
        // 显式 false → 放行直接退出。
        store.set("closeToTray", serde_json::json!(false)).unwrap();
        assert!(!close_to_tray_from_store(&store));
        // 显式 true → 关到托盘。
        store.set("closeToTray", serde_json::json!(true)).unwrap();
        assert!(close_to_tray_from_store(&store));
        // 非布尔（字符串）→ 回落缺省 true。
        store.set("closeToTray", serde_json::json!("yes")).unwrap();
        assert!(close_to_tray_from_store(&store));
        let _ = std::fs::remove_file(&path);

        // 损坏文件 → load 自愈为空 → 回落 true（关到托盘，不误退）。
        let mut bad = std::env::temp_dir();
        bad.push(format!("dsh-close-to-tray-bad-{}-{}.json", std::process::id(), line!()));
        let _ = std::fs::remove_file(&bad);
        std::fs::write(&bad, "{not json").unwrap();
        let broken = shell_core::SettingsStore::new(&bad);
        assert!(close_to_tray_from_store(&broken));
        let _ = std::fs::remove_file(&bad);
        let _ = std::fs::remove_file(bad.with_extension("json.broken"));
    }

    /// hide_main_to_tray 先存状态再隐藏（隐藏后可能经强杀路径退出，
    /// CloseRequested 不再有触发机会）。
    #[test]
    fn hide_main_to_tray_saves_state_before_hide_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn hide_main_to_tray")
            .nth(1)
            .and_then(|s| s.split("// 浮窗").next())
            .expect("hide_main_to_tray 函数体");
        let save_pos = seg.find("save_main_window_state").expect("必须保存窗口状态");
        let hide_pos = seg.find("win.hide()").expect("必须隐藏窗口");
        assert!(save_pos < hide_pos, "先存状态后隐藏（强杀路径兜底）: {seg}");
    }

    /// 赞助窗第五轮终修的形态锚点（v0.5.0「卡死 + 无图 + 关不掉」根治）：
    /// - 必须加载 Tauri 内嵌资产（WebviewUrl::App），源码不得再出现 file:///
    ///   与 %TEMP% 落盘（安装版 AV/路径编码断裂面）；
    /// - 窗口创建必须在独立线程（IPC 线程零窗口 API——反卡整个应用的根因）；
    /// - 不得注册 on_window_event / CloseRequested（回调内 destroy 死锁面）。
    #[test]
    fn sponsor_window_embedded_assets_threaded_closable_shape() {
        let src = include_str!("windows.rs");
        let seg = src
            .split("pub fn open_sponsor_window")
            .nth(1)
            .and_then(|s| s.split("pub fn build_sponsor_window").next())
            .expect("open_sponsor_window 函数体");
        assert!(!seg.contains("file:///"), "不得再依赖 file://（安装版断裂面）: {seg}");
        assert!(!seg.contains("dsh-sponsor"), "不得再落盘 %TEMP%: {seg}");
        assert!(seg.contains("std::thread::Builder"), "窗口创建必须移出 IPC 线程: {seg}");
        assert!(!seg.contains("on_window_event"), "赞助窗不得挂窗口事件回调（死锁面）: {seg}");
        assert!(!seg.contains("CloseRequested"), "赞助窗不走 CloseRequested 拦截: {seg}");
        let build_seg = src
            .split("pub fn build_sponsor_window")
            .nth(1)
            .and_then(|s| s.split("pub fn sponsor_inject_script").next())
            .expect("build_sponsor_window 函数体");
        assert!(build_seg.contains("WebviewUrl::App"), "必须加载内嵌资产（tauri://localhost，与安装路径解耦）: {build_seg}");
        assert!(build_seg.contains("decorations(true)"), "原生标题栏（X 关闭钮）: {build_seg}");
        assert!(build_seg.contains("closable(true)"), "窗口必须可关闭: {build_seg}");
        assert!(build_seg.contains("initialization_script"), "内容必须经 initialization_script 注入: {build_seg}");
        assert!(!build_seg.contains("WebviewUrl::External"), "不得用 External URL: {build_seg}");
    }

    /// 注入脚本产物直验：data URI 双图内嵌、head/body 整体替换 + DOMContentLoaded
    /// 兜底、标题设置；零 file://、零 127.0.0.1 请求、零 fetch/XHR（三零依赖）。
    #[test]
    fn sponsor_inject_script_embeds_qrs_and_replaces_document() {
        let s = sponsor_inject_script(
            "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==",
            "data:image/png;base64,iVBORw0KGgo=",
        );
        assert!(s.contains(r#"src=\"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==\"#)
            || s.contains(r#"src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="#),
            "支付宝 data URI 必须内嵌: {s}");
        assert!(s.contains("data:image/png;base64,iVBORw0KGgo="), "微信 data URI 必须内嵌: {s}");
        assert!(s.contains("document.head.innerHTML"), "样式经 head 整体替换: {s}");
        // R2 实测回归锚点：CSS 必须包 <style> 入 head，裸文本永远不生效。
        assert!(s.contains("'<' + 'style'") || s.contains("'<style>'") || s.contains("\\u003cstyle"),
            "CSS 须经 <style> 包裹注入（裸文本只是文本节点，零样式渲染实锄）: {s}");
        assert!(s.contains("document.body.innerHTML"), "内容经 body 整体替换: {s}");
        assert!(s.contains("DOMContentLoaded"), "loading 态必须等 DOM 就绪: {s}");
        assert!(s.contains("document.title"), "必须设置窗口标题: {s}");
        assert!(!s.contains("file://"), "注入内容不得引用 file://: {s}");
        assert!(!s.contains("127.0.0.1"), "注入内容不得依赖本地端口: {s}");
        assert!(!s.to_ascii_lowercase().contains("fetch("), "不得发网络请求: {s}");
        assert!(!s.to_ascii_lowercase().contains("xmlhttprequest"), "不得用 XHR: {s}");
        // CSS/HTML 以 JSON 字符串字面量嵌入（引号已转义，JS 语法有效）。
        assert!(s.contains("var CSS = \""), "CSS 必须是转义后的 JS 字符串: {s}");
        assert!(s.contains("var BODY = \""), "BODY 必须是转义后的 JS 字符串: {s}");
        assert!(s.contains(".codes img{width:220px"), "图片 220px 对齐 Electron 版: {s}");
    }

    /// 空收款码（安装包 assets 缺失/被拦截）→ 诊断占位块，绝不开「无图空窗」。
    #[test]
    fn sponsor_inject_script_missing_qr_shows_diagnostic() {
        let s = sponsor_inject_script("", "data:image/png;base64,iVBORw0KGgo=");
        assert!(s.contains("missing"), "缺失占位块: {s}");
        assert!(s.contains("收款码缺失"), "诊断文案必须自证缺什么: {s}");
        assert!(!s.contains("src=\\\"\\\""), "不得出现空 src（破图图标）: {s}");
        // 单侧缺失也适用：另一侧正常图仍渲染。
        assert!(s.contains("data:image/png;base64,iVBORw0KGgo="), "存在的码仍内嵌: {s}");
        let both = sponsor_inject_script("", "");
        assert!(both.contains("支付宝") && both.contains("微信"), "标题文字仍在: {both}");
    }

    // ---- 客户端更新进度弹窗 ----

    /// 下载进度百分比：total=0 未知按 0；正常折算；超界钳到 100。
    #[test]
    fn update_popup_pct_clamps() {
        assert_eq!(update_popup_pct(50, 200), 25);
        assert_eq!(update_popup_pct(200, 200), 100);
        assert_eq!(update_popup_pct(0, 200), 0);
        assert_eq!(update_popup_pct(10, 0), 0, "total=0（未知大小）按 0");
        assert_eq!(update_popup_pct(500, 100), 100, "超界钳到 100");
    }

    /// 决策表：百分比 → 阶段（100% 归一 Installing，其余 Downloading）。
    #[test]
    fn update_popup_phase_from_pct_decision_table() {
        assert_eq!(update_popup_phase_from_pct(0), UpdatePopupPhase::Downloading(0));
        assert_eq!(update_popup_phase_from_pct(37), UpdatePopupPhase::Downloading(37));
        assert_eq!(update_popup_phase_from_pct(99), UpdatePopupPhase::Downloading(99));
        assert_eq!(update_popup_phase_from_pct(100), UpdatePopupPhase::Installing);
    }

    /// 决策表：安装结果形态 → 阶段（installing 弹「正在安装」；manual/replaced
    /// 降级不弹）。
    #[test]
    fn update_popup_phase_from_install_decision_table() {
        assert_eq!(
            update_popup_phase_from_install(&serde_json::json!({ "installing": "0.5.3" })),
            UpdatePopupPhase::Installing
        );
        assert_eq!(
            update_popup_phase_from_install(&serde_json::json!({ "manual": true, "version": "0.5.3" })),
            UpdatePopupPhase::Closed,
            "mac 降级不弹"
        );
        assert_eq!(
            update_popup_phase_from_install(&serde_json::json!({ "replaced": true, "version": "0.5.3" })),
            UpdatePopupPhase::Closed,
            "linux 降级不弹"
        );
        assert_eq!(update_popup_phase_from_install(&serde_json::json!({ "ok": true })), UpdatePopupPhase::Closed);
        assert_eq!(update_popup_phase_from_install(&serde_json::Value::Null), UpdatePopupPhase::Closed);
    }

    /// 阶段 → 事件载荷（弹窗脚本消费的 phase/pct/message 字段）。
    #[test]
    fn update_popup_event_payload_shape() {
        assert_eq!(
            update_popup_event_payload(UpdatePopupPhase::Downloading(42), None),
            serde_json::json!({ "phase": "downloading", "pct": 42 })
        );
        assert_eq!(
            update_popup_event_payload(UpdatePopupPhase::Installing, None),
            serde_json::json!({ "phase": "installing", "pct": 100 })
        );
        assert_eq!(
            update_popup_event_payload(UpdatePopupPhase::Failed, Some("boom")),
            serde_json::json!({ "phase": "error", "message": "boom" })
        );
        assert_eq!(
            update_popup_event_payload(UpdatePopupPhase::Closed, None),
            serde_json::json!({ "phase": "closed" })
        );
    }

    /// 注入脚本产物直验：进度条/百分比/阶段文案/关闭按钮/事件订阅/拖拽区
    /// 全部在场；版本与事件名以 JSON 字符串字面量安全内嵌。
    #[test]
    fn update_progress_inject_script_renders_progress_elements() {
        let s = update_progress_inject_script("0.5.3");
        // 版本与事件名内嵌。
        assert!(s.contains("\"0.5.3\""), "版本应内嵌: {s}");
        assert!(s.contains(UPDATE_PROGRESS_EVENT), "事件名必须内嵌: {s}");
        // 进度条 + 百分比元素。
        assert!(s.contains("upd-track"), "进度条轨道缺失: {s}");
        assert!(s.contains("upd-fill"), "进度条填充缺失: {s}");
        assert!(s.contains("upd-pct"), "百分比元素缺失: {s}");
        // 阶段文案。
        assert!(s.contains("正在下载 DSH Desktop v"), "下载中文案缺失: {s}");
        assert!(s.contains("下载完成，正在安装…"), "安装中文案缺失: {s}");
        assert!(s.contains("下载失败"), "失败文案缺失: {s}");
        // 事件订阅 + 信封解包。
        assert!(s.contains("plugin:event|listen"), "事件订阅缺失: {s}");
        assert!(s.contains("ev.payload !== undefined ? ev.payload : ev"), "信封解包缺失: {s}");
        // 关闭按钮（走 window_control close，非主窗真关闭）。
        assert!(s.contains("window_control"), "关闭走 window_control: {s}");
        assert!(s.contains("action: 'close'"), "关闭动作缺失: {s}");
        // 拖拽区。
        assert!(s.contains("data-tauri-drag-region"), "拖拽区缺失: {s}");
        // 零 file:// / 零本地端口 / 零 fetch。
        assert!(!s.contains("file://"), "不得引用 file://: {s}");
        assert!(!s.contains("127.0.0.1"), "不得依赖本地端口: {s}");
        assert!(!s.to_ascii_lowercase().contains("fetch("), "不得发网络请求: {s}");
    }

    /// 进度弹窗形态锚点（对齐赞助窗第五轮终修的「三零依赖 + 独立线程」）：
    /// - 必须加载 Tauri 内嵌资产（WebviewUrl::App），源码不得再出现 file:///；
    /// - 窗口创建在独立线程（IPC 线程零窗口 API）；
    /// - 置顶 + 跳过任务栏 + 创建不抢焦点（focused(false)）+ 自绘关闭；
    /// - 不得注册 on_window_event / CloseRequested（回调内 destroy 死锁面）。
    #[test]
    fn update_progress_window_shape_anchor() {
        let src = include_str!("windows.rs");
        let open_seg = src
            .split("pub fn open_update_progress_window")
            .nth(1)
            .and_then(|s| s.split("pub fn build_update_progress_window").next())
            .expect("open_update_progress_window 函数体");
        assert!(open_seg.contains("std::thread::Builder"), "窗口创建必须移出 IPC 线程: {open_seg}");
        assert!(!open_seg.contains("file:///"), "不得依赖 file://（安装版断裂面）: {open_seg}");
        assert!(!open_seg.contains("on_window_event"), "不得挂窗口事件回调（死锁面）: {open_seg}");
        assert!(!open_seg.contains("CloseRequested"), "不走 CloseRequested 拦截: {open_seg}");
        let build_seg = src
            .split("pub fn build_update_progress_window")
            .nth(1)
            .and_then(|s| s.split("pub fn update_progress_inject_script").next())
            .expect("build_update_progress_window 函数体");
        assert!(build_seg.contains("WebviewUrl::App"), "必须加载内嵌资产（tauri://localhost）: {build_seg}");
        assert!(build_seg.contains("decorations(false)"), "无原生标题栏（自绘关闭）: {build_seg}");
        assert!(build_seg.contains("always_on_top(true)"), "置顶小窗: {build_seg}");
        assert!(build_seg.contains("skip_taskbar(true)"), "跳过任务栏: {build_seg}");
        assert!(build_seg.contains("focused(false)"), "创建不抢焦点: {build_seg}");
        assert!(build_seg.contains("closable(true)"), "窗口必须可关闭: {build_seg}");
        assert!(build_seg.contains("initialization_script"), "内容必须经 initialization_script 注入: {build_seg}");
        assert!(!build_seg.contains("WebviewUrl::External"), "不得用 External URL: {build_seg}");
    }
}
