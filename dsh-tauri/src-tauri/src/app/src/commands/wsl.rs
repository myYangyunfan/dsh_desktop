//! WSL 配置三通道（ipc-commands.md §2.3 / bridge-api.md §2.4）。
//!
//! 配置存取经 settings.json 扁平键（与 Electron updater.loadSettings 同键，
//! 用户目录互迁不丢）；WSL 后端在 Tauri 版暂未实装（保存时诚实告知）。

use bridge::BridgeError;
use tauri::{AppHandle, Manager};

use crate::AppState;

use super::common::NoWindow;

/// 读 WSL 配置三键（纯逻辑，可单测）。扁平键 `backend` / `wslDistro` /
/// `wslInstallDir` 与 Electron `updater.loadSettings` 同键同文件（用户目录
/// 互迁不丢）；兼容迁移 0.5.0 早期误写的嵌套 `wslBackend` 键（扁平键优先）。
fn wsl_settings_load_from(store: &shell_core::SettingsStore) -> (String, String, String) {
    let get_str = |k: &str| -> String {
        store
            .get(k)
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default()
    };
    let legacy = store.get("wslBackend").ok().flatten();
    let legacy_field = |k: &str| -> String {
        legacy
            .as_ref()
            .and_then(|v| v.get(k))
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_default()
    };
    let mut backend = get_str("backend");
    if backend.is_empty() {
        // 旧嵌套键字段名两代：`backend`（Electron 形态）/ `mode`（0.5.0 早期）。
        backend = legacy_field("backend");
        if backend.is_empty() {
            backend = legacy_field("mode");
        }
    }
    let distro = {
        let d = get_str("wslDistro");
        if d.is_empty() { legacy_field("wslDistro") } else { d }
    };
    let install_dir = {
        let d = get_str("wslInstallDir");
        if d.is_empty() { legacy_field("wslInstallDir") } else { d }
    };
    (
        if backend == "wsl" { "wsl".into() } else { "local".into() },
        distro,
        install_dir,
    )
}

/// WSL 配置校验（Electron dsh:wsl-config-save 同规则）。
fn validate_wsl_cfg(backend: &str, install_dir: &str) -> Result<(), String> {
    if backend != "local" && backend != "wsl" {
        return Err(format!("后端模式必须是 local 或 wsl（收到 {backend:?}）"));
    }
    if !install_dir.is_empty() && !install_dir.starts_with('/') && !install_dir.starts_with('~') {
        return Err("WSL 安装目录必须是 WSL 内绝对路径（以 / 或 ~ 开头）".into());
    }
    if install_dir.chars().any(|c| c.is_whitespace()) {
        return Err("WSL 安装目录不能包含空白字符".into());
    }
    Ok(())
}

/// WSL 探活：`wsl --status` 退出码（输出 UTF-16 无需解码，只看可用性）。
fn wsl_available() -> Result<bool, String> {
    #[cfg(windows)]
    {
        match std::process::Command::new("wsl")
            .args(["--status"])
            .creation_flags_no_window()
            .output()
        {
            Ok(o) => Ok(o.status.success()),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

/// 契约形态（bridge-api.md §2.4，溯源 Electron `dsh:wsl-config`）：
/// `{backend, wslDistro, wslInstallDir, status:{configured, distro, installDir,
/// nodeVersion, npmVersion, agentVersion, lastError}, fallbackReason}`。
/// node/npm/agent 版本属 WSL 完整托管链（migration-roadmap Phase 3 后续），
/// 简版如实留空（页面 kvRow 显示「—」），不假装探测成功。
fn wsl_config_payload(backend: &str, distro: &str, install_dir: &str) -> serde_json::Value {
    let last_error = if backend == "wsl" {
        match wsl_available() {
            Ok(true) => String::new(),
            Ok(false) => "wsl --status 退出非零（WSL 未安装或无发行版）".to_string(),
            Err(e) => format!("无法启动 wsl 命令：{e}"),
        }
    } else {
        String::new()
    };
    serde_json::json!({
        "backend": backend,
        "wslDistro": distro,
        "wslInstallDir": install_dir,
        "status": {
            "configured": false, // W2: WSL 未实装，恒 false 防误导
            "distro": distro,
            "installDir": install_dir,
            "nodeVersion": "",
            "npmVersion": "",
            "agentVersion": "",
            "lastError": last_error,
        },
        "fallbackReason": "",
    })
}

#[tauri::command]
pub async fn wsl_config_get(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    // WSL 托管：Phase 3 简版（配置存取 + recheck 探活）；完整 wsl-backend 复用
    // 随 Phase 3 后续（migration-roadmap）。形态必须与 Electron 一致——此前
    // 返回 `{mode:"local"}` 致设置页 backend/status 全空、dirty 恒真（实测 bug）。
    let state = app.state::<AppState>();
    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
    let (backend, distro, install_dir) = wsl_settings_load_from(&store);
    // 进程隔离（性能审计 2026-08）：wsl --status 探活在半安装形态下可达秒级，
    // spawn_blocking 挪出 UI 主线程。
    let payload = tauri::async_runtime::spawn_blocking(move || wsl_config_payload(&backend, &distro, &install_dir))
        .await
        .map_err(|e| BridgeError::internal(format!("wsl 探活任务失败: {e}")))?;
    Ok(payload)
}

#[tauri::command]
pub fn wsl_config_save(cfg: serde_json::Value, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let backend = cfg.get("backend").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    let distro = cfg.get("wslDistro").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let install_dir = cfg.get("wslInstallDir").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if let Err(e) = validate_wsl_cfg(&backend, &install_dir) {
        // Electron 语义：配置错误以 {ok:false,error} 返回（设置页显示 error 文案）。
        return Ok(serde_json::json!({ "ok": false, "error": e }));
    }
    // W2 review 定性：Tauri 版 supervisor 无 WSL 分支（spawn/kill/boot 链五缺口），
    // 保存后重启无任何变化 = 假开关。诚实告知而非静默无效。
    if backend == "wsl" {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "WSL 后端在 Tauri 版暂未支持（规划中）。当前版本始终使用本地内核。"
        }));
    }
    let state = app.state::<AppState>();
    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
    // 扁平键存储（与 Electron 同键；空值存空串，读取端 default 兜底）。
    // 旧嵌套 wslBackend 键不清理：读取端扁平键优先，自然废弃（清理需
    // SettingsStore 增加 remove API，收益不值契约面扩张）。
    for (k, v) in [("backend", serde_json::json!(backend)), ("wslDistro", serde_json::json!(distro)), ("wslInstallDir", serde_json::json!(install_dir))] {
        store.set(k, v).map_err(|e| BridgeError::internal(e.0))?;
    }
    Ok(serde_json::json!({ "ok": true, "restartRequired": true }))
}

#[tauri::command]
pub async fn wsl_recheck(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    // Electron 语义：recheck 返回与 getConfig 同形态（status 强制重探测）。
    // 此前返回 `{ok,available}` 与契约不符——设置页「重新检测」把表单状态
    // 打回空（实测「WSL 行空」根因之一）。
    let state = app.state::<AppState>();
    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
    let (backend, distro, install_dir) = wsl_settings_load_from(&store);
    let payload = tauri::async_runtime::spawn_blocking(move || wsl_config_payload(&backend, &distro, &install_dir))
        .await
        .map_err(|e| BridgeError::internal(format!("wsl 探活任务失败: {e}")))?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// wsl 三通道契约形态（bridge-api.md §2.4 / Electron dsh:wsl-config）：
    /// getConfig/recheck 必须返回 {backend, wslDistro, wslInstallDir, status,
    /// fallbackReason}——此前 `{mode:"local"}` / `{ok,available}` 形态不符是
    /// 设置页「WSL 后端」行空的根因（回归锚点）。
    #[test]
    fn wsl_config_payload_contract_shape() {
        let p = wsl_config_payload("local", "", "");
        assert_eq!(p["backend"], serde_json::json!("local"));
        assert_eq!(p["wslDistro"], serde_json::json!(""));
        assert_eq!(p["wslInstallDir"], serde_json::json!(""));
        assert_eq!(p["fallbackReason"], serde_json::json!(""));
        // status 全字段在场（dsh-wsl-settings kvRow 逐字段消费；缺键=行不渲染）。
        let st = &p["status"];
        for k in ["configured", "distro", "installDir", "nodeVersion", "npmVersion", "agentVersion", "lastError"] {
            assert!(st.get(k).is_some(), "status.{k} 缺失：{st}");
        }
        assert_eq!(st["configured"], serde_json::json!(false), "local 模式 configured=false");
        assert_eq!(st["lastError"], serde_json::json!(""), "local 模式不探测，lastError 必空");
        // wsl 模式：回显 distro/installDir；configured 仍恒 false——实现有意
        // 语义（「W2: WSL 未实装，恒 false 防误导」，见 wsl_config_payload）。
        // 此前断言 true 与实现矛盾（预先存在的坏测试，随本轮回绿修正）。
        let p2 = wsl_config_payload("wsl", "Ubuntu-24.04", "~/.dsh-desktop");
        assert_eq!(p2["status"]["configured"], serde_json::json!(false), "WSL 未实装，configured 恒 false 防误导");
        assert_eq!(p2["status"]["distro"], serde_json::json!("Ubuntu-24.04"));
        assert_eq!(p2["status"]["installDir"], serde_json::json!("~/.dsh-desktop"));
    }

    /// wsl 配置读取：空 store 默认 local；扁平键优先；0.5.0 旧嵌套键
    /// （wslBackend: {mode|backend, wslDistro, wslInstallDir}）迁移读取。
    #[test]
    fn wsl_settings_load_flat_and_legacy_migration() {
        let mut path = std::env::temp_dir();
        path.push(format!("dsh-cmd-wsl-{}-{}.json", std::process::id(), line!()));
        let _ = std::fs::remove_file(&path);
        let store = shell_core::SettingsStore::new(&path);
        // 空 store：默认 local，无 distro/dir。
        assert_eq!(wsl_settings_load_from(&store), ("local".into(), String::new(), String::new()));
        // 旧嵌套键（mode 字段形态）。
        store.set("wslBackend", serde_json::json!({"mode": "wsl", "wslDistro": "Ubuntu", "wslInstallDir": "~/d"})).unwrap();
        assert_eq!(
            wsl_settings_load_from(&store),
            ("wsl".into(), "Ubuntu".into(), "~/d".into()),
            "旧嵌套键（mode 字段）应迁移读取"
        );
        // 扁平键（Electron 同键）优先于旧嵌套键。
        store.set("backend", serde_json::json!("local")).unwrap();
        store.set("wslDistro", serde_json::json!("Debian")).unwrap();
        assert_eq!(
            wsl_settings_load_from(&store),
            ("local".into(), "Debian".into(), "~/d".into()),
            "扁平键优先；未覆盖的字段回落旧键"
        );
        let _ = std::fs::remove_file(&path);
    }

    /// wsl 配置校验：Electron dsh:wsl-config-save 同规则。
    #[test]
    fn wsl_config_validate_rules() {
        assert!(validate_wsl_cfg("local", "").is_ok());
        assert!(validate_wsl_cfg("wsl", "").is_ok());
        assert!(validate_wsl_cfg("wsl", "~/.dsh-desktop").is_ok());
        assert!(validate_wsl_cfg("wsl", "/opt/dsh").is_ok());
        assert!(validate_wsl_cfg("remote", "").is_err(), "backend 枚举外拒绝");
        assert!(validate_wsl_cfg("wsl", "C:\\dsh").is_err(), "非 WSL 绝对路径拒绝");
        assert!(validate_wsl_cfg("wsl", "/opt/d sh").is_err(), "含空白拒绝");
    }
}
