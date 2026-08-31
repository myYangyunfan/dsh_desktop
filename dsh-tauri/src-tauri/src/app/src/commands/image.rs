//! 剪贴板粘贴图落盘（`image_paste_save`，ipc-commands.md §2.1 / bridge-api.md §2.5）。
//!
//! Electron imagePasteSave（main.js:2930）对齐：插件 client 已把粘贴图捕获为
//! dataUrl 字符串（真实场景测试 U2 确认），壳侧只需落盘——无需 clipboard 插件。

use bridge::error::codes::IMAGE_PASTE;
use bridge::BridgeError;

use super::common::b64_decode;

#[tauri::command]
pub fn image_paste_save(payload: serde_json::Value) -> Result<serde_json::Value, BridgeError> {
    image_paste_save_impl(&payload).map_err(|e| BridgeError::new(IMAGE_PASTE, &e))
}

fn image_paste_save_impl(payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let data_url = payload.get("dataUrl").and_then(|v| v.as_str()).ok_or("缺 dataUrl")?;
    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("粘贴图片");
    let (head, b64) = data_url.split_once(',').ok_or("不是合法的图片 data URL")?;
    let mime = head.strip_prefix("data:").unwrap_or(head).split(';').next().unwrap_or("").to_lowercase();
    let ext = match mime.as_str() {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        "image/bmp" => ".bmp",
        "image/avif" => ".avif",
        "image/ico" => ".ico",
        _ => return Err(format!("不支持的图片类型: {mime}")),
    };
    let bytes = b64_decode(b64).ok_or("base64 解码失败")?;
    if bytes.is_empty() {
        return Err("图片内容为空".into());
    }
    if bytes.len() > 15 * 1024 * 1024 {
        return Err("图片超过 15MB 上限".into());
    }
    let dir = shell_core::DshPaths::resolve().paste_tmp;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 顺手治 Electron 版的小泄漏（U2 发现其从不清理、随系统 %TEMP%）：
    // 每次保存顺带清 7 天前的粘贴文件。
    let _ = cleanup_expired_paste_files(&dir);
    // 文件名消毒（对齐 Electron：禁字符过滤、截 40、空回退），防路径注入。
    let forbidden = r#"\/:*?"<>|"#;
    let base: String = name
        .chars()
        .filter(|c| !forbidden.contains(*c) && (*c as u32) >= 0x20)
        .take(40)
        .collect::<String>()
        .trim()
        .to_string();
    let base = if base.is_empty() { "粘贴图片".to_string() } else { base };
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file = dir.join(format!("{base}-{ts}{ext}"));
    std::fs::write(&file, &bytes).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "path": file.to_string_lossy(), "size": bytes.len() }))
}

/// 粘贴图 TTL 清理：删除修改时间早于 7 天的粘贴文件（`image_paste_save`
/// 每次落盘顺带执行——Electron 版从不清理的小泄漏治理）。返回删除数
/// （生产忽略；抽出独立函数仅为可单测，行为与原内联块逐行一致）。
fn cleanup_expired_paste_files(dir: &std::path::Path) -> usize {
    let mut removed = 0;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            if let Ok(modified) = entry.metadata().and_then(|m| m.modified()) {
                if let Ok(age) = modified.elapsed() {
                    if age.as_secs() > 7 * 86400
                        && std::fs::remove_file(entry.path()).is_ok()
                    {
                        removed += 1;
                    }
                }
            }
        }
    }
    removed
}

#[cfg(test)]
mod image_paste_tests {
    use super::*;
    use crate::commands::b64;

    #[test]
    fn image_paste_save_impl_contract() {
        // Electron 契约形态：合法 png 落盘返回 {ok,path,size}；坏输入带可读错误。
        let _g = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("dsh-paste-test-{}", std::process::id()));
        std::env::set_var("DSH_TEST_TMP", &tmp);
        // 1x1 PNG（70B 真实字节）
        let png: Vec<u8> = vec![
            0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,0,0,0x0D,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,
            0x08,0x06,0,0,0,0x1F,0x15,0xC4,0x89,0,0,0,0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0,1,
            0,0,5,0,0x02,0x0A,0x2B,0xB5,0x38,0xFD,0,0,0,0,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82,
        ];
        let payload = serde_json::json!({
            "dataUrl": format!("data:image/png;base64,{}", b64(&png)),
            "name": "screens\\hot/粘贴:图?"
        });
        let r = image_paste_save_impl(&payload).unwrap();
        assert_eq!(r["ok"], serde_json::json!(true));
        assert_eq!(r["size"], serde_json::json!(png.len()));
        let path = std::path::PathBuf::from(r["path"].as_str().unwrap());
        // 注意 Path::ends_with 是整组件匹配，后缀断言用字符串形态。
        assert!(path.exists() && path.to_string_lossy().ends_with(".png"));
        assert_eq!(std::fs::read(&path).unwrap(), png);
        let fname = path.file_name().unwrap().to_string_lossy().to_string();
        assert!(!fname.contains('\\') && !fname.contains('/') && !fname.contains(':') && !fname.contains('?'), "消毒后文件名 {fname}");
        std::fs::remove_file(&path).ok();
        // 坏输入
        let bad = image_paste_save_impl(&serde_json::json!({ "dataUrl": "data:image/tiff;base64,QUJD", "name": "x" }));
        assert!(bad.unwrap_err().contains("不支持的图片类型"));
        let bad2 = image_paste_save_impl(&serde_json::json!({ "name": "x" }));
        assert!(bad2.unwrap_err().contains("dataUrl"));
        std::env::remove_var("DSH_TEST_TMP");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 7 天 TTL 清理（曾零测试）：注入旧 mtime 文件 → 被删；新文件与
    /// 未满 7 天的边界文件保留；只读的过期文件也被清（std remove_file
    /// 在 Windows 先清只读位再删——用户 %TEMP% 里什么形态都不得漏删）。
    #[test]
    fn image_paste_ttl_cleanup_removes_only_aged_files() {
        use std::time::Duration;
        let dir = std::env::temp_dir().join(format!("dsh-paste-ttl-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // set_modified 需要写句柄（Windows SetFileTime 要求 FILE_WRITE_ATTRIBUTES）。
        let touch = |name: &str, age: Option<Duration>| {
            let p = dir.join(name);
            std::fs::write(&p, b"x").unwrap();
            if let Some(age) = age {
                let f = std::fs::OpenOptions::new().write(true).open(&p).unwrap();
                f.set_modified(std::time::SystemTime::now() - age).unwrap();
            }
        };
        let day = Duration::from_secs(86400);
        touch("aged-8d.png", Some(8 * day));            // 8 天 → 删
        touch("boundary-7d-minus.png", Some(7 * day - Duration::from_secs(30))); // 差 30s 满 7 天 → 留（严格大于）
        touch("fresh.png", None);                        // 刚写 → 留
        // 过期且只读（用户 %TEMP% 的真实形态）：std remove_file 在 Windows
        // 会先清只读位再删——同样必须被清掉，且不 panic。
        touch("aged-readonly-8d.png", Some(8 * day));
        {
            let p = dir.join("aged-readonly-8d.png");
            let mut perm = std::fs::metadata(&p).unwrap().permissions();
            perm.set_readonly(true); // Permissions::set_readonly（跨平台固有方法）
            std::fs::set_permissions(&p, perm).unwrap();
        }
        let removed = cleanup_expired_paste_files(&dir);
        assert_eq!(removed, 2, "两个 8 天前文件（含只读形态）都应被清");
        assert!(!dir.join("aged-8d.png").exists(), "8 天前文件必须被清");
        assert!(!dir.join("aged-readonly-8d.png").exists(), "只读的过期文件也必须被清（不得静默漏删）");
        assert!(dir.join("boundary-7d-minus.png").exists(), "未满 7 天不得误删（严格大于才删）");
        assert!(dir.join("fresh.png").exists(), "新文件必须保留");
        // 幂等：干净后再跑一遍零删除。
        assert_eq!(cleanup_expired_paste_files(&dir), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// TTL 清理经 image_paste_save 主链路真实触发：向 paste_tmp 注入过期
    /// 文件 → 一次正常保存顺带把它清掉（DSH_TEST_TMP 重定向隔离）。
    #[test]
    fn image_paste_save_sweeps_expired_files_via_main_path() {
        use std::time::Duration;
        let _g = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("dsh-paste-sweep-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::env::set_var("DSH_TEST_TMP", &tmp);
        let stale = shell_core::DshPaths::resolve().paste_tmp.join("stale-8d.png");
        std::fs::create_dir_all(stale.parent().unwrap()).unwrap();
        std::fs::write(&stale, b"old").unwrap();
        {
            let f = std::fs::OpenOptions::new().write(true).open(&stale).unwrap();
            f.set_modified(std::time::SystemTime::now() - Duration::from_secs(8 * 86400)).unwrap();
        }
        let png: Vec<u8> = vec![
            0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,0,0,0x0D,0x49,0x48,0x44,0x52,0,0,0,1,0,0,0,1,
            0x08,0x06,0,0,0,0x1F,0x15,0xC4,0x89,0,0,0,0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0,1,
            0,0,5,0,0x02,0x0A,0x2B,0xB5,0x38,0xFD,0,0,0,0,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82,
        ];
        let r = image_paste_save_impl(&serde_json::json!({
            "dataUrl": format!("data:image/png;base64,{}", b64(&png)),
            "name": "sweep"
        })).unwrap();
        assert_eq!(r["ok"], serde_json::json!(true), "保存本身必须成功（清理失败不阻断落盘）");
        assert!(!stale.exists(), "主链路保存应顺带清掉 8 天前的粘贴文件");
        let saved = std::path::PathBuf::from(r["path"].as_str().unwrap());
        assert!(saved.exists(), "新保存的文件必须在场");
        std::env::remove_var("DSH_TEST_TMP");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
