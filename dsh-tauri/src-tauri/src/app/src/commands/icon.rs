//! 自定义桌面客户端图标（⋯ 菜单「自定义图标…」/「恢复默认图标」）。
//!
//! 用户经垫片选图（`<input type=file>` 读 bytes → data URL）→ 壳侧按魔数
//! 白名单校验（仅 PNG / ICO——与 `tauri::image::Image::from_bytes` 的运行时
//! 解码面一致，也和 bundle.icon 同口径）→ 落一份副本到 app_data → 同步设置
//! 主窗（`WebviewWindow::set_icon`）+ 托盘（`TrayIcon::set_icon`）。重启后由
//! [`apply_custom_icon_if_present`] 在 setup 里重放。
//!
//! 走 `menu_action` 动作分发（`set-custom-icon` / `reset-custom-icon`），与
//! `check-client-update` / `install-client-update` 同为「菜单动作」而非独立
//! bridge 通道：CHANNELS 映射表（contracts/ipc-commands.md §2）是 Electron
//! 母本 IPC 通道 → 命令的映射，菜单动作不是通道（bridge 自测
//! `tauri_command_for("check-agent-update") == None` 同口径）。

use bridge::BridgeError;
use tauri::{AppHandle, Manager};

use super::common::b64_decode;

/// 自定义图标原始字节上限（对齐 `image_paste_save` 的 15MB 兜底）。
const CUSTOM_ICON_MAX_BYTES: usize = 15 * 1024 * 1024;
/// 图标最长边上限（窗口/托盘图标远超此值即异常，防解压炸弹）。
const CUSTOM_ICON_MAX_DIM: u32 = 4096;

/// 自定义图标文件候选路径（按魔数判定扩展名后写入，读时探测存在者）。
fn custom_icon_candidates() -> [std::path::PathBuf; 2] {
    let root = shell_core::DshPaths::resolve().app_data;
    [root.join("custom-icon.png"), root.join("custom-icon.ico")]
}

/// 已存在的自定义图标文件路径（取第一个候选；无则 None）。
fn existing_custom_icon() -> Option<std::path::PathBuf> {
    custom_icon_candidates().into_iter().find(|p| p.is_file())
}

/// 魔数 → 格式标识（仅 PNG / ICO）。不信前端 MIME，按真实字节判定。
fn detect_icon_format(bytes: &[u8]) -> Result<&'static str, BridgeError> {
    const PNG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.len() >= 8 && bytes[..8] == PNG {
        return Ok("png");
    }
    // ICO：reserved=0 (2B) + type=1 (2B) 小端，即 00 00 01 00。
    if bytes.len() >= 4 && bytes[0] == 0x00 && bytes[1] == 0x00 && bytes[2] == 0x01 && bytes[3] == 0x00 {
        return Ok("ico");
    }
    Err(BridgeError::invalid_arg("无法识别的图片格式（仅支持 PNG / ICO）"))
}

/// 解码图标并做尺寸白名单校验。返回 owned Image（from_bytes 内部已是
/// Owned RGBA，目标类型标注 'static 即零拷贝）。
fn decode_icon(bytes: &[u8]) -> Result<tauri::image::Image<'static>, BridgeError> {
    let img: tauri::image::Image<'static> = tauri::image::Image::from_bytes(bytes)
        .map_err(|e| BridgeError::invalid_arg(format!("图片解码失败（仅支持 PNG / ICO）: {e}")))?;
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 || w > CUSTOM_ICON_MAX_DIM || h > CUSTOM_ICON_MAX_DIM {
        return Err(BridgeError::invalid_arg(format!("图标尺寸异常（{w}x{h}）")));
    }
    Ok(img)
}

/// 把一张图设置到「主窗 + 托盘」全部运行时显示面。任一失败不 panic，
/// 返回 BridgeError 供上层回显。
fn apply_icon(app: &AppHandle, img: tauri::image::Image<'_>) -> Result<(), BridgeError> {
    if let Some(win) = app.get_webview_window("main") {
        win.set_icon(img.clone())
            .map_err(|e| BridgeError::internal(format!("设置主窗图标失败: {e}")))?;
    }
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_icon(Some(img))
            .map_err(|e| BridgeError::internal(format!("设置托盘图标失败: {e}")))?;
    }
    Ok(())
}

/// 恢复默认图标（主窗 + 托盘）。默认图标来自 `default_window_icon`
/// （tauri bundle icon 的编译期 RGBA 嵌入，与加载键同源）。
fn apply_default_icon(app: &AppHandle) -> Result<(), BridgeError> {
    let default = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| BridgeError::internal("无默认应用图标"))?;
    apply_icon(app, default)
}

/// 「自定义图标…」：payload 为 `{ dataUrl }`（PNG/ICO 的 base64 data URL）。
/// 校验/解码 → 写 app_data 副本 → 设置窗+托盘。返回实际格式（"png"|"ico"），
/// 响应体 JSON 由 menu.rs 分支组装（IPC 返回字段契约留在 menu.rs，与其余
/// action 分支同构）。
pub(super) fn set_custom_icon(
    app: &AppHandle,
    payload: &serde_json::Value,
) -> Result<&'static str, BridgeError> {
    let data_url = payload
        .get("dataUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| BridgeError::invalid_arg("缺自定义图标数据（dataUrl）"))?;
    let (_, b64) = data_url.split_once(',').ok_or_else(|| BridgeError::invalid_arg("不是合法的图片 data URL"))?;
    let bytes = b64_decode(b64).ok_or_else(|| BridgeError::invalid_arg("base64 解码失败"))?;
    if bytes.is_empty() {
        return Err(BridgeError::invalid_arg("图片内容为空"));
    }
    if bytes.len() > CUSTOM_ICON_MAX_BYTES {
        return Err(BridgeError::invalid_arg("图片超过 15MB 上限"));
    }
    let ext = detect_icon_format(&bytes)?;
    let img = decode_icon(&bytes)?;

    let dir = shell_core::DshPaths::resolve().app_data;
    std::fs::create_dir_all(&dir).map_err(BridgeError::from)?;
    // 清旧自定义图标（换格式时不留两份、残留不误读）。
    for stale in custom_icon_candidates() {
        let _ = std::fs::remove_file(stale);
    }
    let path = dir.join(format!("custom-icon.{ext}"));
    std::fs::write(&path, &bytes).map_err(BridgeError::from)?;

    apply_icon(app, img)?;
    Ok(ext)
}

/// 「恢复默认图标」：删除自定义图标文件，恢复窗+托盘默认图标。
pub(super) fn reset_custom_icon(app: &AppHandle) -> Result<(), BridgeError> {
    for stale in custom_icon_candidates() {
        let _ = std::fs::remove_file(stale);
    }
    apply_default_icon(app)
}

/// 启动重放：若存在自定义图标文件则加载并应用（窗+托盘）；加载失败仅日志并
/// 回退默认（兼容性第一：坏图标文件绝不阻断启动，也绝不 panic）。
pub(crate) fn apply_custom_icon_if_present(app: &AppHandle) {
    let Some(path) = existing_custom_icon() else { return };
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[icon] 读取自定义图标失败（回退默认）: {e}");
            return;
        }
    };
    match decode_icon(&bytes) {
        Ok(img) => {
            if let Err(e) = apply_icon(app, img) {
                eprintln!("[icon] 应用自定义图标失败: {e}");
            }
        }
        Err(e) => eprintln!("[icon] 自定义图标解码失败（回退默认）: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 魔数白名单：PNG / ICO 放行，JPG/其他拒绝（tauri 运行时只解码 PNG+ICO，
    /// 不能假装支持 JPG）。
    #[test]
    fn detect_icon_format_magic_only() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
        assert_eq!(detect_icon_format(&png).unwrap(), "png");
        let ico = [0x00, 0x00, 0x01, 0x00, 0, 0];
        assert_eq!(detect_icon_format(&ico).unwrap(), "ico");
        // JPEG 魔数 FFD8FF，不受支持。
        let jpg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0];
        assert!(detect_icon_format(&jpg).is_err());
        // 空/过短/未知。
        assert!(detect_icon_format(b"").is_err());
        assert!(detect_icon_format(b"not-an-image").is_err());
    }

    /// 自定义图标路径落在 app_data（与 window-state.json 同层），升级不覆盖；
    /// 用 DSH_TEST_APPDATA 重定向隔离断言，不改真实用户目录。
    #[test]
    fn custom_icon_paths_live_in_app_data() {
        let _g = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = std::env::temp_dir().join(format!("dsh-icon-path-{}", std::process::id()));
        std::env::set_var("DSH_TEST_APPDATA", home.join("appdata"));
        let cands = custom_icon_candidates();
        for c in &cands {
            assert!(
                c.to_string_lossy().contains("appdata"),
                "自定义图标必须落在 app_data 下: {c:?}"
            );
            assert!(
                c.file_name().unwrap().to_string_lossy().starts_with("custom-icon."),
                "文件名前缀 custom-icon: {c:?}"
            );
        }
        std::env::remove_var("DSH_TEST_APPDATA");
        let _ = std::fs::remove_dir_all(&home);
    }

    /// PNG 解码链路真实打通（image-png feature 接线回归）：1x1 PNG 经
    /// decode_icon 解码为 RGBA（宽高 1），非 PNG/ICO 字节被拒。证明
    /// `tauri::image::Image::from_bytes` 的 png 特性已启用（否则运行时
    /// 图设置全静默失败，而编译期 cargo check 无法捕获）。
    #[test]
    fn decode_icon_decodes_real_png_and_rejects_junk() {
        let png: Vec<u8> = vec![
            137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,4,0,0,0,181,28,12,2,0,0,0,11,73,68,65,84,120,218,99,100,248,15,0,1,5,1,1,39,24,227,102,0,0,0,0,73,69,78,68,174,66,96,130,
        ];
        let img = decode_icon(&png).expect("1x1 PNG 必须能解码");
        assert_eq!((img.width(), img.height()), (1, 1));
        // ICO 魔数的伪字节：过魔数但过不了 from_bytes（非完整 ICO），仍应报错。
        let ico = [0x00, 0x00, 0x01, 0x00, 0, 0];
        assert!(decode_icon(&ico).is_err());
    }
}