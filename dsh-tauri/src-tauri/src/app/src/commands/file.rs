//! 文件域命令（fence 围栏，ipc-commands.md §2.3）：file_open / file_revert。
//!
//! 越界拒绝语义 = contracts/error-codes.md §4 的 E_FENCE_ROOT。
//!
//! R5/#137 复盘后的语义修订（v0.5.1）：
//! · 围栏本义是防渲染层写任意「新」路径；但会话工作区在用户自选目录
//!   （D:\code\…），只放行 dsh_home 会把「打开/还原工作区文件」全拒——
//!   而内核 node 进程本就能读写任意路径，壳层围栏挡内核能做的事只伤
//!   可用性，不增安全。
//! · 因此：dsh_home 内保持围栏语义；home 外路径要求「已存在的本地
//!   绝对路径」（open 允许文件/目录；revert 仅已存在常规文件——只可能
//!   改既有文件，无法创建新路径）。
//! · 元字符黑名单收窄为控制字符/引号（Windows 路径本就非法引号）；
//!   `& % ; ^ |` 在中文用户路径并不罕见（#137），且 Command::arg 单参数
//!   传递不经 shell 解析，无注入面。

use bridge::BridgeError;
use tauri::AppHandle;
#[cfg(windows)]
use tauri::Manager;

use super::common::atomic_write;

/// 路径合法性（不含 shell 元字符黑名单——见模块注释）：
/// 必须绝对路径、无引号与控制字符。
fn ensure_sane_absolute(path: &str) -> Result<(), BridgeError> {
    let p = std::path::Path::new(path);
    if !p.is_absolute() {
        return Err(BridgeError::invalid_arg("路径必须是绝对路径"));
    }
    if path.contains('"') || path.contains('\0') || path.chars().any(|c| c.is_control()) {
        return Err(BridgeError::invalid_arg("路径含非法字符"));
    }
    Ok(())
}

/// WSL Linux 路径判定（纯函数，可单测）：WSL 模式下内核回报的 cwd / 工作区
/// 路径是 Linux 绝对路径（`/home/u/proj`）——Windows 的 `Path::is_absolute`
/// 与 fence 围栏都不认识（W1 问题三：「打开项目目录」对 Linux 路径无效）。
/// 判据：`/` 开头且无引号/控制字符。
#[cfg(windows)]
fn is_wsl_linux_path(path: &str) -> bool {
    path.starts_with('/')
        && !path.contains('"')
        && !path.contains('\0')
        && !path.chars().any(|c| c.is_control())
}

/// Linux 路径 → explorer 可用的 UNC 形态：`\\wsl.localhost\<distro><path>`
/// （经 wsl-backend `unc_dir` 构造，与安装目录 UNC 同口径）。
#[cfg(windows)]
fn wsl_unc_target(path: &str, distro: &str) -> String {
    wsl_backend::spec::unc_dir("wsl.localhost", distro, path)
}

/// file_open 的 WSL 分支（Windows 壳）：Linux 路径不经 Windows fence/explorer
/// 直接路径，而是映射 UNC 后交 explorer（原生 Windows 窗口）；explorer 拉不起
/// 时回落 WSL 内 xdg-open（经 wsl.exe -e，单参数 argv 不经 shell 解析）。
/// 返回 Ok(true) = 已接管打开；Ok(false) = 非 Linux 路径（调用方走本地分支）。
#[cfg(windows)]
fn file_open_wsl(path: &str, app: &AppHandle) -> Result<bool, BridgeError> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    if !path.starts_with('/') {
        return Ok(false);
    }
    if !is_wsl_linux_path(path) {
        return Err(BridgeError::invalid_arg("路径含非法字符"));
    }
    // distro 来源：supervisor 运行态 WSL 后端（boot 期 configure 已解析）。
    let state = app.state::<crate::AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let distro = match sv.and_then(|s| s.wsl_active()) {
        Some(b) => b.distro(),
        None => {
            return Err(BridgeError::invalid_arg(format!(
                "Linux 路径需 WSL 后端在用（当前为 local 模式或未配置），无法打开: {path}"
            )))
        }
    };
    if distro.is_empty() {
        return Err(BridgeError::invalid_arg(format!("WSL 发行版未解析，无法打开: {path}")));
    }
    let unc = wsl_unc_target(path, &distro);
    if std::process::Command::new("explorer").arg(&unc).spawn().is_ok() {
        return Ok(true);
    }
    // 回落：WSL 内 xdg-open（wslview → Windows 默认处理器）。
    std::process::Command::new("wsl.exe")
        .args(["-d", &distro, "-e", "xdg-open", path])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(BridgeError::from)?;
    Ok(true)
}

/// file_open 的路径解析（纯函数，可单测）：home 内走围栏；home 外要求
/// 已存在（文件或目录）。返回 explorer/open/xdg-open 应使用的路径。
fn resolve_openable_path(path: &str) -> Result<std::path::PathBuf, BridgeError> {
    ensure_sane_absolute(path)?;
    let home = shell_core::DshPaths::resolve().dsh_home;
    let fence = fence::Fence::new([home]);
    let p = std::path::Path::new(path);
    match fence.ensure(p) {
        Ok(c) => Ok(c),
        Err(_) => {
            if !p.exists() {
                Err(BridgeError::fence_root(format!("E_FENCE_ROOT: home 外路径须已存在: {path}")))
            } else {
                Ok(std::path::PathBuf::from(path))
            }
        }
    }
}

#[tauri::command]
pub fn file_open(path: String, app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    // WSL 分支先行（W1 问题三）：Linux 绝对路径不经 Windows fence，映射 UNC 打开。
    #[cfg(windows)]
    {
        if file_open_wsl(&path, &app)? {
            return Ok(serde_json::Value::Null);
        }
    }
    let _ = &app;
    let cleaned = resolve_openable_path(&path)?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer").arg(&cleaned).spawn().map_err(BridgeError::from)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&cleaned).spawn().map_err(BridgeError::from)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(&cleaned).spawn().map_err(BridgeError::from)?;
    }
    Ok(serde_json::Value::Null)
}

#[tauri::command]
pub fn file_revert(changes: Vec<serde_json::Value>) -> Result<serde_json::Value, BridgeError> {
    // Electron 语义：changes=[{path, op, oldText, newText}] 逆序应用，内容精确匹配才动手。
    // home 外仅接受已存在常规文件（见模块注释——工作区还原是本功能主场景）。
    let home = shell_core::DshPaths::resolve().dsh_home;
    let fence = fence::Fence::new([home]);
    let mut applied = 0usize;
    let mut errors: Vec<String> = Vec::new();
    for change in changes.iter().rev() {
        let path = change.get("path").and_then(|v| v.as_str()).unwrap_or("");
        if ensure_sane_absolute(path).is_err() {
            errors.push(format!("非法路径: {path}"));
            continue;
        }
        let p = std::path::Path::new(path);
        let cleaned = match fence.ensure(p) {
            Ok(c) => c,
            Err(_) => {
                if !p.is_file() {
                    errors.push(format!("E_FENCE_ROOT: home 外须为已存在文件: {path}"));
                    continue;
                }
                std::path::PathBuf::from(path)
            }
        };
        let content = match std::fs::read_to_string(&cleaned) {
            Ok(c) => c,
            Err(e) => {
                errors.push(format!("读取 {}: {e}", cleaned.display()));
                continue;
            }
        };
        let old_text = change.get("oldText").and_then(|v| v.as_str()).unwrap_or("");
        let new_text = change.get("newText").and_then(|v| v.as_str()).unwrap_or("");
        if new_text.is_empty() || !content.contains(new_text) {
            continue; // 内容不匹配：跳过（幂等安全）
        }
        let reverted = content.replacen(new_text, old_text, 1);
        if let Err(e) = atomic_write(&cleaned, &reverted) {
            errors.push(format!("写入 {}: {e}", cleaned.display()));
            continue;
        }
        applied += 1;
    }
    Ok(serde_json::json!({ "ok": errors.is_empty(), "applied": applied, "errors": errors }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// file_revert 功能：围栏内替换（逆序）+ 越界拒绝 + 内容不匹配跳过。
    #[test]
    fn file_revert_fence_and_idempotency() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = std::env::temp_dir().join(format!("dsh-cmd-revert-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        // dsh_home = <home>/.dsh（paths 契约）——围栏内文件须在其下。
        let work = home.join(".dsh").join("sessions").join("w1");
        std::fs::create_dir_all(&work).unwrap();
        std::env::set_var("DSH_TEST_HOME", &home);
        std::fs::write(work.join("a.md"), "after-change").unwrap();
        std::fs::write(work.join("b.md"), "unrelated-content").unwrap();

        let changes = vec![
            serde_json::json!({ "path": work.join("a.md").to_string_lossy(), "op": "edit", "oldText": "before-change", "newText": "after-change" }),
            serde_json::json!({ "path": work.join("b.md").to_string_lossy(), "op": "edit", "oldText": "x", "newText": "keep-me" }),
        ];
        let out = file_revert(changes).unwrap();
        assert_eq!(out["ok"], serde_json::json!(true), "{out}");
        assert_eq!(out["applied"], serde_json::json!(1), "b.md 内容不匹配应跳过: {out}");
        assert_eq!(std::fs::read_to_string(work.join("a.md")).unwrap(), "before-change", "应还原为写前文本");
        assert_eq!(std::fs::read_to_string(work.join("b.md")).unwrap(), "unrelated-content", "不匹配的文件必须原样保留");

        std::env::remove_var("DSH_TEST_HOME");
        let _ = std::fs::remove_dir_all(&home);
    }

    /// #137 语义修订回归：home 外「已存在文件」的 revert 必须放行（工作区
    /// 还原主场景）；home 外不存在路径仍拒（不得借 revert 创建新文件）。
    #[test]
    fn file_revert_workspace_file_allowed_and_new_path_denied() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = std::env::temp_dir().join(format!("dsh-cmd-ws-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::env::set_var("DSH_TEST_HOME", &home);

        // 工作区（home 外）已存在文件：应能还原。
        let ws = std::env::temp_dir().join(format!("dsh-ws-{}.txt", std::process::id()));
        std::fs::write(&ws, "agent-edited").unwrap();
        let out = file_revert(vec![
            serde_json::json!({ "path": ws.to_string_lossy(), "op": "edit", "oldText": "user-original", "newText": "agent-edited" }),
        ]).unwrap();
        assert_eq!(out["ok"], serde_json::json!(true), "工作区文件还原应放行: {out}");
        assert_eq!(out["applied"], serde_json::json!(1), "{out}");
        assert_eq!(std::fs::read_to_string(&ws).unwrap(), "user-original");

        // home 外不存在的路径：拒绝（E_FENCE_ROOT），不创建。
        let ghost = std::env::temp_dir().join(format!("dsh-ghost-{}.txt", std::process::id()));
        let out = file_revert(vec![
            serde_json::json!({ "path": ghost.to_string_lossy(), "op": "create", "oldText": "", "newText": "x" }),
        ]).unwrap();
        assert_eq!(out["ok"], serde_json::json!(false), "{out}");
        assert!(!ghost.exists(), "不得借 revert 创建 home 外新文件");
        assert!(out["errors"].as_array().unwrap()[0].as_str().unwrap().contains("E_FENCE_ROOT"), "{out}");

        // 相对路径：拒绝。
        let out = file_revert(vec![
            serde_json::json!({ "path": "relative/x.md", "op": "e", "oldText": "a", "newText": "b" }),
        ]).unwrap();
        assert_eq!(out["ok"], serde_json::json!(false), "相对路径应拒: {out}");

        std::env::remove_var("DSH_TEST_HOME");
        let _ = std::fs::remove_dir_all(&home);
        let _ = std::fs::remove_file(&ws);
    }

    /// file_open 语义修订回归：home 外已存在路径放行；不存在/相对/引号路径
    /// 拒绝；含 `%`/`&` 的合法路径不再被元字符黑名单误杀（#137）。
    #[test]
    fn file_open_workspace_path_and_metachar_paths() {
        let _env = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = std::env::temp_dir().join(format!("dsh-cmd-open-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::env::set_var("DSH_TEST_HOME", &home);

        // home 外已存在文件：放行（resolve 层不拉 explorer）。
        let ws = std::env::temp_dir().join(format!("dsh-ws-open-{}.txt", std::process::id()));
        std::fs::write(&ws, "x").unwrap();
        let r = resolve_openable_path(&ws.to_string_lossy()).expect("工作区已存在文件应放行");
        assert_eq!(r, ws);

        // 含 % & 的合法路径形态：不被元字符黑名单误杀（须已存在才放行，
        // 此处以存在文件命名覆盖）。
        let special = std::env::temp_dir().join(format!("dsh-a%20&b-{}.md", std::process::id()));
        std::fs::write(&special, "x").unwrap();
        resolve_openable_path(&special.to_string_lossy()).expect("含 % & 的已存在路径应放行");

        // home 外不存在：E_FENCE_ROOT。
        let ghost = std::env::temp_dir().join(format!("dsh-open-ghost-{}.txt", std::process::id()));
        let err = resolve_openable_path(&ghost.to_string_lossy()).unwrap_err();
        assert!(err.to_string().contains("E_FENCE_ROOT"), "{err}");

        // 相对路径 / 引号：invalid_arg。
        assert!(resolve_openable_path("relative/x.md").is_err());
        assert!(resolve_openable_path("C:\\x\"y").is_err());

        std::env::remove_var("DSH_TEST_HOME");
        let _ = std::fs::remove_dir_all(&home);
        let _ = std::fs::remove_file(&ws);
        let _ = std::fs::remove_file(&special);
    }

    /// W1 问题三：WSL Linux 路径判定与 UNC 映射（纯函数）。
    /// `/` 开头的干净路径是 WSL 路径；Windows 路径/相对路径/带引号与控制
    /// 字符的路径不是（后者交由上层以 invalid_arg 拒绝）。
    #[cfg(windows)]
    #[test]
    fn wsl_linux_path_detection_and_unc_mapping() {
        assert!(is_wsl_linux_path("/home/u/project"));
        assert!(is_wsl_linux_path("/opt/dsh"));
        // 非 / 前缀：Windows 路径 / UNC / 相对路径都不是 WSL Linux 路径。
        assert!(!is_wsl_linux_path("C:\\Users\\u"));
        assert!(!is_wsl_linux_path("\\\\wsl.localhost\\Ubuntu\\home\\u"));
        assert!(!is_wsl_linux_path("relative/x"));
        assert!(!is_wsl_linux_path(""));
        // 含引号 / 控制字符：不算合法 WSL 路径（file_open_wsl 转 invalid_arg）。
        assert!(!is_wsl_linux_path("/home/u/a\"b"));
        assert!(!is_wsl_linux_path("/home/u/a\u{0007}b"));
        // UNC 映射：与安装目录 unc_dir 同口径（正斜杠 → 反斜杠）。
        assert_eq!(wsl_unc_target("/home/u/project", "Ubuntu-24.04"), "\\\\wsl.localhost\\Ubuntu-24.04\\home\\u\\project");
        assert_eq!(wsl_unc_target("/", "Debian"), "\\\\wsl.localhost\\Debian\\");
    }
}
