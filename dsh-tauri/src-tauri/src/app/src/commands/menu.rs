//! ⋯ 菜单动作分发（`menu_action`，bridge-api.md §2.3 的 act 枚举）+
//! settings 单键开关 helper + 客户端更新链（`super::updater_client` 双源
//! GitHub/Gitee Releases：check-client-update 检查 / install-client-update
//! 下载并安装）。
//!
//! v0.5.3 起 `check-agent-update`（npm 内核 latest 比对链）退役：内核随
//! 客户端整体分发，无独立 overlay 更新链——内核版本变化由客户端发版承载，
//! 菜单唯一更新项即「检查客户端更新…」。退役的 E_AGENT_UPDATE_NETWORK
//! 错误码在 contracts/error-codes.md 加「已退役」注记（码值不复用）。

use bridge::BridgeError;
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

use super::common::{open_http_url, open_in_explorer, terr};
use super::updater_client::{self, CheckOutcome};

#[tauri::command]
pub async fn menu_action(action: String, payload: Option<serde_json::Value>, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    match action.as_str() {
        "open-logs" => {
            let dir = shell_core::DshPaths::resolve().logs;
            let _ = std::fs::create_dir_all(&dir);
            open_in_explorer(&dir)
        }
        "open-browser" => {
            let url = payload
                .and_then(|p| p.get("url").and_then(|v| v.as_str()).map(String::from))
                .unwrap_or_else(|| {
                    app.state::<AppState>()
                        .supervisor
                        .lock().unwrap_or_else(|p| p.into_inner())
                        .clone()
                        .and_then(|s| s.kernel_url())
                        .unwrap_or_else(|| "http://127.0.0.1".into())
                });
            open_http_url(&url)
        }
        // （check-agent-update 分支已删除——见模块 doc。）
        "reload" => {
            // Electron reloadMainWindow 语义：当前页软重载（内核 SPA 状态丢失可接受）。
            let win = main_window(&app)?;
            win.eval("try{location.reload()}catch(e){}").map_err(terr)?;
            Ok(serde_json::Value::Null)
        }
        "devtools" => {
            // open_devtools 仅 debug 构建可用（release 无 devtools feature）。
            #[cfg(debug_assertions)]
            {
                let win = main_window(&app)?;
                win.open_devtools();
                Ok(serde_json::json!({ "ok": true }))
            }
            #[cfg(not(debug_assertions))]
            {
                Ok(serde_json::json!({ "ok": false, "error": "开发者工具仅开发版可用" }))
            }
        }
        "fullscreen" => {
            let win = main_window(&app)?;
            let now = win.is_fullscreen().map_err(terr)?;
            win.set_fullscreen(!now).map_err(terr)?;
            Ok(serde_json::json!({ "fullscreen": !now }))
        }
        "about" => {
            let kernel = {
                let state = app.state::<AppState>();
                let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
                sv.map(|s| s.kernel_version.clone()).unwrap_or_else(|| "未装配".into())
            };
            Ok(serde_json::json!({
                "appVersion": env!("CARGO_PKG_VERSION"),
                "platform": std::env::consts::OS,
                "kernelVersion": kernel,
            }))
        }
        "quit" => {
            // 托盘「退出」同语义（lib.rs setup_tray）：先同步杀内核树（shutdown，
            // Job Object），再 exit(0)——RunEvent::Exit 再做锁与收尾。
            if let Some(state) = app.try_state::<AppState>() {
                if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                    sv.shutdown();
                }
            }
            app.exit(0);
            Ok(serde_json::Value::Null)
        }
        "toggle-notify" | "toggle-close-to-tray" | "toggle-balance" | "toggle-auto-update" => {
            let key = toggle_key(&action);
            let state = app.state::<AppState>();
            let store = shell_core::SettingsStore::new(state.paths.settings.clone());
            let next = toggle_setting(&store, key).map_err(|e| BridgeError::internal(e.0))?;
            // Electron main.js：toggle-balance 后立即刷一次余额（关闭态经
            // disabled 数据即时隐藏 dock、重开即时取数），不等下一轮询周期。
            if action == "toggle-balance" {
                super::balance::trigger_fetch(&app);
            }
            // 单键返回（垫片 merge 进菜单 state 后重渲染）。
            let mut out = serde_json::Map::new();
            out.insert(key.to_string(), serde_json::json!(next));
            Ok(serde_json::Value::Object(out))
        }
        "check-client-update" => {
            // 双源（GitHub/Gitee Releases）latest 检查：updater_client 单一
            // 来源（启动自动检查的 client-update-available 事件同链，lib.rs
            // setup hook）。当前版本取编译期 CARGO_PKG_VERSION（与 tag 比较前
            // 由 cmp_semver 归一）。离线/双源不可达 → E_UPDATER_NETWORK +
            // 友好文案（见 updater_err_to_bridge）。
            let current = env!("CARGO_PKG_VERSION").to_string();
            let outcome = updater_client::check_latest(&current).await.map_err(updater_err_to_bridge)?;
            match outcome {
                CheckOutcome::UpToDate => Ok(serde_json::json!({ "ok": true, "upToDate": true })),
                CheckOutcome::Available(u) => Ok(serde_json::json!({
                    "ok": true,
                    "current": u.current,
                    "next": u.next,
                    "notes": u.notes,
                    "asset": { "name": u.asset.name, "size": u.asset.size },
                    "source": u.source,
                })),
            }
        }
        "install-client-update" => {
            // 安装链：check_latest 复核（UpToDate → {ok,upToDate:true} 不空装，
            // 垫片回显「已是最新」，非报错）→ download_to_temp
            // 下载（sha256 校验在 updater_client::download_to_temp 内完成：
            // None = 依次取 GitHub digest 缓存 / <url>.sha256 边车，无哈希时
            // 元数据 size + 安装器 >50MB 下限兜底——见其 doc）→ 平台分支
            // （Windows 静默安装 + 自动重启；mac/linux 诚实降级）。
            let current = env!("CARGO_PKG_VERSION").to_string();
            let outcome = updater_client::check_latest(&current).await.map_err(updater_err_to_bridge)?;
            let upd = match outcome {
                CheckOutcome::Available(u) => u,
                CheckOutcome::UpToDate => return Ok(serde_json::json!({ "ok": true, "upToDate": true })),
            };
            let next = upd.next.clone();
            // 进度弹窗（下载时置顶小窗显示进度条 + 百分比）：创建失败/被用户
            // 关闭均不影响下载主链——弹窗是增强，不是功能面。
            let _ = crate::windows::open_update_progress_window(&app, &next);
            // 下载进度经 `client-update-progress` {received,total} 事件发给
            // 页面（垫片在菜单行尾就地显示百分比；emit 只借 &self，跨 await 安全）。
            // RV9 P1 节流：流式下载每 chunk 都回调（100Mbps ≈ 800 次/s），
            // UI 只显示百分比——按「≥1% 增量或 ≥200ms」节流后再 emit，
            // 事件频率从百级/秒压到 ≤5 次/s。
            let emit_app = app.clone();
            let mut last_emit: Option<(u64, std::time::Instant)> = None;
            let asset = upd.asset;
            let download_result = updater_client::download_to_temp(&asset, move |received: u64, total: u64| {
                let now = std::time::Instant::now();
                let fire = match last_emit {
                    None => true,
                    Some((prev_recv, prev_at)) => {
                        let pct_gain = u64::checked_div(
                            received.saturating_sub(prev_recv).saturating_mul(100),
                            total,
                        )
                        .unwrap_or(0);
                        pct_gain >= 1 || now.duration_since(prev_at).as_millis() >= 200
                    }
                };
                if fire {
                    last_emit = Some((received, now));
                    let _ = emit_app.emit(
                        "client-update-progress",
                        serde_json::json!({ "received": received, "total": total }),
                    );
                    // 进度弹窗同步更新（与菜单行尾百分比并存，互不干扰）。
                    let pct = crate::windows::update_popup_pct(received, total);
                    crate::windows::emit_update_progress(
                        &emit_app,
                        crate::windows::update_popup_phase_from_pct(pct),
                        None,
                    );
                }
            }, None)
            .await;

            // 下载结果分路：成功不立即弹「正在安装」（Windows 分支才弹；mac/linux
            // 降级分支发 Closed 收掉弹窗——见平台分支）；失败转失败文案 + 关闭按钮。
            let path = match download_result {
                Ok(path) => path,
                Err(e) => {
                    let bridge_err = updater_err_to_bridge(e);
                    crate::windows::emit_update_progress(
                        &app,
                        crate::windows::UpdatePopupPhase::Failed,
                        Some(&bridge_err.message),
                    );
                    return Err(bridge_err);
                }
            };

            // ---- 平台分支 -----------------------------------------------------
            // Windows（唯一发版目标，tauri.conf.json bundle.targets=["nsis"]）：
            // 静默安装参数 `/S /R /UPDATE`，语义引安装器脚本（nsis/installer-template.nsi，
            // vendor 自 tauri-bundler 2.11.4）与 tauri-plugin-updater 2.10.1
            // install_inner 的 Quiet 形参（["/S","/R"] + "/UPDATE"）：
            //   · /S —— NSIS 原生静默。页面函数不执行 → PageLeaveReinstall 的
            //     reinst_uninstall（installer-template.nsi:362）永不可达，旧
            //     卸载器根本不会被调用；被动模式（/P）下 /UPDATE 也直接
            //     reinst_done 跳过旧版卸载（:334-336），两条路都是「只覆盖文件」。
            //   · /UPDATE —— 更新模式（.onInit :503-506 解析）：跳过 WebView2
            //     段（:576，升级机必有）；卸载器侧保留快捷方式/自启/绝不删
            //     %APPDATA%（un.* :838/:879/:885-899 的 $UpdateMode 守卫）——
            //     v0.5.1 起的修复版卸载器（识别 /KEEP_APP_DATA/--updated，
            //     commits 0d568947/6a7dc82a）之上再加一层保险。
            //   · /R —— .onInstSuccess（:758-769）静默装完 RunAsUser 自动重启
            //     应用，实现「下载并安装」一键闭环。
            //   数据安全结论：/S 下 Install section 只写 $INSTDIR 程序文件
            //   （:653-756），用户数据（~/.dsh、%APPDATA%\dsh-desktop）不在
            //   写入面；不传任何卸载/清数据参数即保数据。
            // 退出时序/文件锁：bundler utils.nsh 的 CheckIfAppIsRunning 在
            //   静默/被动模式下发现本进程仍在运行会直接 KillProcessCurrentUser
            //   后 Sleep 500 继续写文件（文件锁随进程终止释放）——因此这里先
            //   spawn 安装器（detached），再走 quit 同款正常退出路径：同步
            //   supervisor.shutdown（Job Object 杀内核树）→ app.exit(0) 触发
            //   RunEvent::Exit 收尾锁文件。即使安装器抢先硬杀本进程：内核树
            //   受 Job Object KILL_ON_JOB_CLOSE（kernel-process/job_object.rs:29）
            //   OS 级收割，单实例锁有陈锁回收兜底，均无泄漏。
            #[cfg(windows)]
            {
                // 弹窗转「正在安装」（进程即将退出，弹窗随之消亡）。
                crate::windows::emit_update_progress(&app, crate::windows::UpdatePopupPhase::Installing, None);
                let mut installer = std::process::Command::new(&path);
                installer.args(["/S", "/R", "/UPDATE"]);
                installer.spawn().map_err(|e| BridgeError::internal(format!("启动安装器失败: {e}")))?;
                if let Some(state) = app.try_state::<AppState>() {
                    if let Some(sv) = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone() {
                        sv.shutdown();
                    }
                }
                app.exit(0);
                Ok(serde_json::json!({ "ok": true, "installing": next }))
            }
            // macOS：DMG 无法静默安装（hdiutil attach + cp .app 理论可行，但
            // 权限/盘符卸载/Applications 替换确认的边缘形态多，不做半吊子自动
            // 化）——诚实降级：open DMG，返回 {manual:true}，垫片提示
            // 「已下载 vX，请拖入 Applications 完成更新」。
            #[cfg(target_os = "macos")]
            {
                std::process::Command::new("open")
                    .arg(&path)
                    .spawn()
                    .map_err(|e| BridgeError::internal(format!("打开 DMG 失败: {e}")))?;
                // 降级形态：下载已完成、安装交用户 → 弹窗关闭（不弹「正在安装」）。
                crate::windows::emit_update_progress(&app, crate::windows::UpdatePopupPhase::Closed, None);
                Ok(serde_json::json!({ "ok": true, "manual": true, "version": next }))
            }
            // Linux：AppImage 自替换。运行中的 AppImage 挂的是旧 inode，
            // rename(2) 原子换路径不影响运行实例——chmod +x 后 rename 覆盖
            // current_exe 即完成「下载到固定位置替换自身」；失败（目标目录
            // 只读等）降级 open 所在目录 + {manual:true} 指引，如实返回形态。
            #[cfg(all(unix, not(target_os = "macos")))]
            {
                use std::os::unix::fs::PermissionsExt;
                let exe = std::env::current_exe()
                    .map_err(|e| BridgeError::internal(format!("定位当前可执行文件失败: {e}")))?;
                let replaced = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).is_ok()
                    && std::fs::rename(&path, &exe).is_ok();
                if !replaced {
                    if let Some(dir) = exe.parent() {
                        let _ = open_in_explorer(dir);
                    }
                }
                // 降级形态：AppImage 就地替换 / 手动 → 弹窗关闭（不弹「正在安装」）。
                crate::windows::emit_update_progress(&app, crate::windows::UpdatePopupPhase::Closed, None);
                Ok(serde_json::json!({ "ok": true, "replaced": replaced, "manual": !replaced, "version": next }))
            }
        }
        // 自定义桌面客户端图标（⋯ 菜单「自定义图标…」/「恢复默认图标」）：
        // 菜单动作（非独立 bridge 通道），壳侧实现见 super::icon。payload 由
        // 垫片按 <input type=file> 读 bytes 后以 base64 data URL 传入。
        "set-custom-icon" => {
            let payload = payload
                .as_ref()
                .ok_or_else(|| BridgeError::invalid_arg("缺自定义图标数据"))?;
            let format = super::icon::set_custom_icon(&app, payload)?;
            Ok(serde_json::json!({ "ok": true, "format": format }))
        }
        "reset-custom-icon" => {
            super::icon::reset_custom_icon(&app)?;
            Ok(serde_json::json!({ "ok": true }))
        }
        other => Err(BridgeError::invalid_arg(format!("未知菜单动作：{other}"))),
    }
}

/// 主窗句柄（⋯ 菜单动作多数作用于主窗）。
pub(super) fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, BridgeError> {
    app.get_webview_window("main").ok_or_else(|| BridgeError::not_found("主窗不存在"))
}

/// 更新链错误归一：Offline（双源均不可达）用面向用户的友好文案 +
/// E_UPDATER_NETWORK；其余按 updater_client 的 From 映射（HashMismatch →
/// E_UPDATER_SIGNATURE fail-closed、Io → internal 等，错误类型信息经
/// Display 保留），不重复发明映射。
fn updater_err_to_bridge(e: super::updater_client::UpdaterError) -> BridgeError {
    match e {
        super::updater_client::UpdaterError::Offline(m) => {
            BridgeError::updater_network(format!("无法连接更新源（GitHub/Gitee 均不可达），请检查网络后从右上角 ⋯ 菜单重试（{m}）"))
        }
        other => other.to_bridge(),
    }
}

/// 菜单 toggle 动作 → settings.json 键（前三者 Electron updater.loadSettings
/// 同键；autoInstallUpdates 为 Tauri 版新键——自动装更新会重启应用）。
fn toggle_key(action: &str) -> &'static str {
    match action {
        "toggle-notify" => "notifyOnTurnEnd",
        "toggle-close-to-tray" => "closeToTray",
        "toggle-auto-update" => "autoInstallUpdates",
        _ => "showBalanceDock",
    }
}

/// 各开关缺省值：Electron 三键沿 `s.x !== false` 缺省 true；autoInstallUpdates
/// 缺省 **false**——自动下载安装会中断运行中的会话并重启应用，必须用户显式
/// 开启（⋯ 菜单「自动安装客户端更新」）。
fn key_default(key: &str) -> bool {
    !matches!(key, "autoInstallUpdates")
}

/// 读 settings.json 布尔键（显式缺省）。损坏/缺失回落 default。
pub(super) fn setting_bool_or(store: &shell_core::SettingsStore, key: &str, default: bool) -> bool {
    store.get(key).ok().flatten().and_then(|v| v.as_bool()).unwrap_or(default)
}

/// 读 settings.json 布尔键（Electron `s.x !== false` 缺省 true 同口径）。
pub(super) fn setting_bool(store: &shell_core::SettingsStore, key: &str) -> bool {
    setting_bool_or(store, key, true)
}

/// 读-改-写布尔开关（Electron toggle-* 语义）：取反写回，返回新值。
/// 缺省值按 [`key_default`]（autoInstallUpdates 缺省 false，其余 true）。
fn toggle_setting(store: &shell_core::SettingsStore, key: &str) -> Result<bool, shell_core::settings::SettingsError> {
    let next = !setting_bool_or(store, key, key_default(key));
    store.set(key, serde_json::json!(next))?;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ⋯ 菜单 toggle：读-改-写 settings 往返（缺省 true → false → true），
    /// 读-改-写不破坏同文件其他键，损坏形态（非布尔值）回落缺省；
    /// autoInstallUpdates 缺省 false（改动系统行为的开关必须显式开启）。
    #[test]
    fn menu_toggle_setting_roundtrip() {
        let mut path = std::env::temp_dir();
        path.push(format!("dsh-cmd-toggle-{}-{}.json", std::process::id(), line!()));
        let _ = std::fs::remove_file(&path);
        let store = shell_core::SettingsStore::new(&path);
        // 缺省 true（Electron `s.x !== false` 同口径）。
        assert!(setting_bool(&store, "notifyOnTurnEnd"));
        // 翻转并持久化：true → false。
        assert!(!toggle_setting(&store, "notifyOnTurnEnd").unwrap());
        assert_eq!(store.get("notifyOnTurnEnd").unwrap(), Some(serde_json::json!(false)));
        // 显式 false 再翻：false → true（读文件真值，非内存态）。
        assert!(toggle_setting(&store, "notifyOnTurnEnd").unwrap());
        assert_eq!(store.get("notifyOnTurnEnd").unwrap(), Some(serde_json::json!(true)));
        // 读-改-写不破坏同文件其他键。
        store.set("lastWebPort", serde_json::json!(51731)).unwrap();
        toggle_setting(&store, "closeToTray").unwrap();
        assert_eq!(store.get("lastWebPort").unwrap(), Some(serde_json::json!(51731)));
        // 非布尔值（损坏形态）回落缺省 true，toggle 后写回正常布尔。
        store.set("showBalanceDock", serde_json::json!("oops")).unwrap();
        assert!(setting_bool(&store, "showBalanceDock"));
        assert!(!toggle_setting(&store, "showBalanceDock").unwrap());
        // autoInstallUpdates：缺省 false → 首次 toggle 后 true。
        assert!(!setting_bool_or(&store, "autoInstallUpdates", key_default("autoInstallUpdates")));
        assert!(toggle_setting(&store, "autoInstallUpdates").unwrap());
        assert_eq!(store.get("autoInstallUpdates").unwrap(), Some(serde_json::json!(true)));
        let _ = std::fs::remove_file(&path);
    }

    /// 菜单 toggle 动作 → settings.json 键映射（Electron 同键 + 新键）。
    #[test]
    fn menu_toggle_key_mapping() {
        assert_eq!(toggle_key("toggle-notify"), "notifyOnTurnEnd");
        assert_eq!(toggle_key("toggle-close-to-tray"), "closeToTray");
        assert_eq!(toggle_key("toggle-balance"), "showBalanceDock");
        assert_eq!(toggle_key("toggle-auto-update"), "autoInstallUpdates");
    }

    /// 菜单 quit 语义 = 托盘退出（lib.rs setup_tray 同款）：先 supervisor
    /// .shutdown（同步杀树）再 exit(0)。源码形态断言（WebviewWindow/AppHandle
    /// 无法在单测构造），防「顺手改成直接 exit」回退——那会留内核孤儿进程。
    #[test]
    fn menu_quit_shutdown_before_exit_shape() {
        let src = include_str!("menu.rs");
        let seg = src
            .split("\"quit\" =>")
            .nth(1)
            .and_then(|s| s.split("\"toggle-notify\"").next())
            .expect("quit 分支");
        let sh = seg.find("sv.shutdown()").expect("必须先同步杀内核树");
        let ex = seg.find("app.exit(0)").expect("必须退出进程");
        assert!(sh < ex, "先 shutdown 后 exit（Job Object 杀树语义）: {seg}");
    }

    /// check-agent-update 退役锚点（v0.5.3）：分支与整条 npm latest 比对链
    /// （npm_latest_version/http_get_version/extract_json_version/
    /// compare_versions/E_AGENT_UPDATE_NETWORK）不得回潮——内核随客户端
    /// 整体分发，无独立更新链。（只查实现段：退役名单本身出现在测试里是
    /// 自引用，不构成残留。）
    #[test]
    fn agent_update_chain_fully_retired() {
        let src = include_str!("menu.rs");
        let code = src
            .split("#[tauri::command]")
            .nth(1)
            .and_then(|s| s.split("#[cfg(test)]").next())
            .expect("实现段（menu_action 起、测试前止）");
        assert!(!code.contains("\"check-agent-update\" =>"), "check-agent-update 分支必须删除");
        for gone in [
            "npm_latest_version",
            "http_get_version",
            "extract_json_version",
            "fn compare_versions",
            "E_AGENT_UPDATE_NETWORK",
        ] {
            assert!(!code.contains(gone), "退役链残留在 menu.rs: {gone}");
        }
    }

    /// check-client-update 源码形态锚点（updater_client 是网络依赖模块，
    /// 无法在单测离线验证——沿用 include_str! 形态断言法）：
    /// · 必须以 CARGO_PKG_VERSION 为当前版本 await updater_client::check_latest
    ///   （双源 latest 单一来源，不再走 tauri-plugin-updater 端点门控）；
    /// · 网络失败经 updater_err_to_bridge 归一（Offline → E_UPDATER_NETWORK +
    ///   「GitHub/Gitee 均不可达」友好文案，见 helper 段）；
    /// · UpToDate → {ok,upToDate:true}；Available → {current,next,notes,
    ///   asset:{name,size},source}（垫片就地回显消费）。
    #[test]
    fn client_update_check_calls_updater_client_check_latest() {
        let src = include_str!("menu.rs");
        let check = src
            .split("\"check-client-update\" =>")
            .nth(1)
            .and_then(|s| s.split("\"install-client-update\" =>").next())
            .expect("check-client-update 分支");
        assert!(check.contains("updater_client::check_latest"), "必须直连 updater_client::check_latest（U1 契约）");
        assert!(check.contains("env!(\"CARGO_PKG_VERSION\")"), "当前版本取编译期 CARGO_PKG_VERSION");
        assert!(check.contains(".await"), "check_latest 是 async 契约（直 await，不 spawn_blocking）");
        assert!(check.contains("updater_err_to_bridge"), "错误经 updater_err_to_bridge 归一");
        assert!(check.contains("\"upToDate\": true"), "无更新返回 upToDate:true");
        for field in ["\"current\"", "\"next\"", "\"notes\"", "\"asset\"", "\"source\""] {
            assert!(check.contains(field), "返回契约必须带 {field}");
        }
        assert!(!check.contains("DSH_UPDATER_ENDPOINT"), "旧端点门控已随 updater 插件链退役");
        assert!(!check.contains("UpdaterExt"), "不再走 tauri-plugin-updater");
        // 离线文案锚点（helper 段）：Offline 专用友好文案 + UPDATER_NETWORK 码，
        // 其余错误按 updater_client 的 From 映射（HashMismatch → SIGNATURE）。
        let helper = src
            .split("fn updater_err_to_bridge")
            .nth(1)
            .and_then(|s| s.split("\n}\n").next())
            .expect("updater_err_to_bridge 段");
        assert!(helper.contains("GitHub/Gitee 均不可达"), "离线文案须含双源不可达指引");
        assert!(helper.contains("updater_network"), "Offline 归一 updater_network");
        assert!(helper.contains("to_bridge()"), "其余错误走 updater_client 既定映射（不重复发明）");
    }

    /// install-client-update 源码形态锚点：
    /// · 必须先 check_latest 复核，UpToDate 返回 {ok,upToDate:true} 不空装
    ///   （垫片回显「已是最新」，非报错）；
    /// · 下载必须经 updater_client::download_to_temp（sha256 校验在其内
    ///   完成：digest 缓存/边车/大小下限——调用形态即校验路径），进度经
    ///   client-update-progress 事件；
    /// · Windows 分支顺序锚定：spawn 安装器(/S /R /UPDATE) → supervisor
    ///   shutdown → app.exit(0)（quit 同语义，防「先退出后 spawn」把安装器
    ///   一起带走，也防「只 spawn 不退出」文件锁死锁）。
    #[test]
    fn client_update_install_downloads_then_exits_gracefully() {
        let src = include_str!("menu.rs");
        let install = src
            .split("\"install-client-update\" =>")
            .nth(1)
            .and_then(|s| s.split("other =>").next())
            .expect("install-client-update 分支");
        // 调用形态锚定（注释里也会提到函数名，必须找真实调用形）。
        let chk = install.find("updater_client::check_latest(&current)").expect("必须先 check_latest 复核");
        let dl = install.find("updater_client::download_to_temp(&asset").expect("必须经 download_to_temp 下载（含 sha256 校验）");
        assert!(chk < dl, "先检查后下载（UpToDate 拒绝空装）");
        assert!(install.contains("\"upToDate\": true"), "无更新时返回 upToDate 而非空装/报错");
        assert!(install.contains(".await"), "download_to_temp 是 async 契约");
        assert!(install.contains("\"client-update-progress\""), "下载进度必须经事件发出");
        assert!(install.contains("\"received\"") && install.contains("\"total\""), "进度载荷 {{received,total}}");
        // Windows 静默参数 + 退出时序（只锚定 #[cfg(windows)] 代码块，注释里
        // 的参数/时序说明不参与匹配）。
        let win = install
            .split("#[cfg(windows)]")
            .nth(1)
            .and_then(|s| s.split("#[cfg(target_os = \"macos\")]").next())
            .expect("windows 安装分支");
        let sp = win.find(".args([\"/S\", \"/R\", \"/UPDATE\"])").expect("Windows 静默安装参数 /S /R /UPDATE");
        let sh = win.find("sv.shutdown()").expect("退出前必须同步杀内核树");
        let ex = win.find("app.exit(0)").expect("必须退出本进程交给安装器");
        assert!(dl < install.find("#[cfg(windows)]").unwrap_or(usize::MAX), "先下载后启动安装器");
        assert!(sp < sh && sh < ex, "spawn 安装器 → 杀内核树 → exit（quit 同语义）");
        // 哈希校验 fail-closed 由 download_to_temp 的 UpdaterError::HashMismatch
        // → From 映射 E_UPDATER_SIGNATURE 保证（updater_client.rs 自测覆盖），
        // menu 侧不吞错误：错误链必须走 updater_err_to_bridge。
        assert!(install.contains("updater_err_to_bridge"), "下载错误不得吞/改写（保 HashMismatch→SIGNATURE 映射）");
    }

    /// 客户端更新进度弹窗接线形态锚点：install-client-update 下载链必须
    /// · 下载前打开弹窗（open_update_progress_window）；
    /// · 进度回调在发 client-update-progress 的同时经 emit_update_progress
    ///   更新弹窗（update_popup_phase_from_pct）；
    /// · 下载失败转 UpdatePopupPhase::Failed；Windows 成功转 Installing；
    ///   mac/linux 降级（manual/replaced）转 Closed（不弹「正在安装」）；
    /// · 主窗菜单行尾百分比事件（client-update-progress）不得回退丢失。
    #[test]
    fn client_update_install_wires_progress_popup() {
        let src = include_str!("menu.rs");
        let install = src
            .split("\"install-client-update\" =>")
            .nth(1)
            .and_then(|s| s.split("other =>").next())
            .expect("install-client-update 分支");
        assert!(install.contains("open_update_progress_window"), "下载前必须打开进度弹窗: {install}");
        assert!(install.contains("emit_update_progress"), "必须经 emit_update_progress 发弹窗事件: {install}");
        assert!(install.contains("update_popup_phase_from_pct"), "进度必须按 pct 折算弹窗阶段: {install}");
        assert!(install.contains("UpdatePopupPhase::Failed"), "下载失败必须转失败阶段: {install}");
        assert!(install.contains("UpdatePopupPhase::Installing"), "Windows 成功必须转安装中阶段: {install}");
        assert!(install.contains("UpdatePopupPhase::Closed"), "mac/linux 降级必须关闭弹窗: {install}");
        assert!(install.contains("\"client-update-progress\""), "主窗菜单进度事件不得回退丢失: {install}");
    }
}
