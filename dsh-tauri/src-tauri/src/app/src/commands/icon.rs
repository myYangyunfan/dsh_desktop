//! 自定义桌面客户端图标（⋯ 菜单「自定义图标…」/「恢复默认图标」）。
//!
//! 用户经垫片选图（`<input type=file>` 读 bytes → data URL）→ 壳侧按魔数
//! 白名单校验（仅 PNG / ICO——与 `tauri::image::Image::from_bytes` 的运行时
//! 解码面一致，也和 bundle.icon 同口径）→ 落一份副本到 app_data → 同步设置
//! 主窗（`WebviewWindow::set_icon`）+ 托盘（`TrayIcon::set_icon`）+ Windows
//! 快捷方式（桌面/开始菜单 .lnk 内嵌图标位置重写，见 `shortcut_icon` 模
//! 块——任务栏分组/桌面快捷方式取的是 .lnk 与 Explorer 图标缓存，WM_SETICON
//! 管不到）。重启后由 [`apply_custom_icon_if_present`] 在 setup 里重放。
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

/// PNG 自定义图标供 .lnk 引用的 ICO 包装路径（Windows 快捷方式图标重写用；
/// .ico 直存时无需包装，.lnk 直接引用 custom-icon.ico）。
fn custom_icon_shortcut_ico() -> std::path::PathBuf {
    shell_core::DshPaths::resolve()
        .app_data
        .join("custom-icon-shortcut.ico")
}

/// PNG IHDR 尺寸（大端 u32×2，偏移 16/20）。非完整 PNG → None。
fn png_ihdr_dims(png: &[u8]) -> Option<(u32, u32)> {
    if png.len() < 24 || png[12..16] != *b"IHDR" {
        return None;
    }
    let w = u32::from_be_bytes(png[16..20].try_into().ok()?);
    let h = u32::from_be_bytes(png[20..24].try_into().ok()?);
    Some((w, h))
}

/// PNG 字节 → 单条目 PNG-compressed ICO（Vista+ 支持 ICO 内嵌 PNG）：ICONDIR
/// (6B) + ICONDIRENTRY (16B) + 原样 PNG。宽高取 IHDR（ICONDIRENTRY 单字节，
/// ≥256 时以 0 表示 256）；读不到 IHDR 退 0/0——壳端按 PNG 头自解码，尺寸
/// 字段仅作提示。Windows 快捷方式图标位置不支持裸 PNG，必须借 ICO 壳。
fn png_bytes_to_ico(png: &[u8]) -> Vec<u8> {
    let (w, h) = png_ihdr_dims(png).unwrap_or((0, 0));
    let mut ico = Vec::with_capacity(22 + png.len());
    ico.extend_from_slice(&[0x00, 0x00]); // reserved = 0
    ico.extend_from_slice(&[0x01, 0x00]); // type = 1（icon）
    ico.extend_from_slice(&[0x01, 0x00]); // count = 1
    ico.push(if w >= 256 { 0 } else { w as u8 }); // 宽
    ico.push(if h >= 256 { 0 } else { h as u8 }); // 高
    ico.push(0); // color count（0 = 不限）
    ico.push(0); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // planes
    ico.extend_from_slice(&32u16.to_le_bytes()); // bitcount = 32
    ico.extend_from_slice(&(png.len() as u32).to_le_bytes()); // bytes in resource
    ico.extend_from_slice(&22u32.to_le_bytes()); // payload 偏移 = 6 + 16
    ico.extend_from_slice(png);
    ico
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
        // Windows：tauri 的 WebviewWindow::set_icon 只发 WM_SETICON(ICON_SMALL)
        // （标题栏小图标），任务栏/alt-tab 用的 ICON_BIG 不会被更新；而主窗
        // decorations:false 又没有原生标题栏，于是「自定义图标只在托盘生效」。
        // 这里直接对窗口 HWND 补设 ICON_SMALL + ICON_BIG（与托盘同款 RGBA→HICON）。
        #[cfg(target_os = "windows")]
        win_icon::apply_to_main_window(&win, &img)?;
    }
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_icon(Some(img))
            .map_err(|e| BridgeError::internal(format!("设置托盘图标失败: {e}")))?;
    }
    Ok(())
}

/// Windows-only 主窗图标补正：把图标同时设置到主窗 HWND 的 ICON_SMALL（标题栏）
/// 与 ICON_BIG（任务栏/alt-tab）。tauri 的 `WebviewWindow::set_icon` 在 Windows
/// 只设 ICON_SMALL（走 tao `set_window_icon`），ICON_BIG 无人更新；本模块直接把
/// RGBA 转成 HICON 后 SendMessageW(WM_SETICON, …) 补设两档。
#[cfg(target_os = "windows")]
mod win_icon {
    use std::sync::{Mutex, OnceLock};

    use bridge::BridgeError;
    use windows_api::Win32::Foundation::{LPARAM, WPARAM};
    use windows_api::Win32::UI::WindowsAndMessaging::{
        CreateIcon, DestroyIcon, SendMessageW, HICON, ICON_BIG, ICON_SMALL, WM_SETICON,
    };

    /// 当前挂到主窗的 HICON 原值（进程生命周期内持有；替换时销毁旧句柄）。
    /// 存 usize 免去 HICON（内部 *mut c_void 非 Send/Sync）作 static 的约束。
    static WINDOW_ICON: OnceLock<Mutex<Option<usize>>> = OnceLock::new();

    fn window_icon_slot() -> &'static Mutex<Option<usize>> {
        WINDOW_ICON.get_or_init(|| Mutex::new(None))
    }

    /// RGBA → 32bpp BGRA + 单色 AND mask 的 HICON。与 tao 的
    /// `RgbaIcon::into_windows_icon` 同款算法（托盘图标即走此实现且已验证可用）。
    fn rgba_to_hicon(rgba: &[u8], width: u32, height: u32) -> Result<HICON, BridgeError> {
        let pixel_count = (width as usize) * (height as usize);
        if rgba.len() != pixel_count * 4 {
            return Err(BridgeError::internal("图标 RGBA 长度与尺寸不符"));
        }

        let mut bgra = rgba.to_vec();
        let mut and_mask = Vec::with_capacity(pixel_count);
        // 逐像素：AND mask 字节 = alpha 取反（== a.wrapping_sub(255)），
        // 像素交换 R<->B（RGBA → BGRA）。
        for px in bgra.chunks_exact_mut(4) {
            let a = px[3];
            and_mask.push(a.wrapping_sub(u8::MAX));
            px.swap(0, 2);
        }

        unsafe {
            CreateIcon(
                None,
                width as i32,
                height as i32,
                1,
                32,
                and_mask.as_ptr(),
                bgra.as_ptr(),
            )
        }
        .map_err(|e| BridgeError::internal(format!("创建窗口图标失败: {e}")))
    }

    pub(super) fn apply_to_main_window(
        win: &tauri::WebviewWindow,
        img: &tauri::image::Image<'_>,
    ) -> Result<(), BridgeError> {
        let hwnd = win
            .hwnd()
            .map_err(|e| BridgeError::internal(format!("获取主窗 HWND 失败: {e}")))?;
        let icon = rgba_to_hicon(img.rgba(), img.width(), img.height())?;
        let icon_raw = icon.0 as usize;

        // WM_SETICON 不接管 HICON 所有权：须本侧持有到下次替换/进程退出。
        {
            let mut slot = window_icon_slot().lock().unwrap_or_else(|p| p.into_inner());
            if let Some(old_raw) = slot.replace(icon_raw) {
                let _ = unsafe { DestroyIcon(HICON(old_raw as *mut std::ffi::c_void)) };
            }
        }

        unsafe {
            // ICON_SMALL = 标题栏；ICON_BIG = 任务栏 / alt-tab。
            let _ = SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_SMALL as usize)),
                Some(LPARAM(icon.0 as isize)),
            );
            let _ = SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_BIG as usize)),
                Some(LPARAM(icon.0 as isize)),
            );
        }
        Ok(())
    }
}

/// Windows-only 快捷方式图标重写（commands/icon.rs 的 shortcut_icon 模块）：
/// NSIS 安装器写出的「DSH Desktop.lnk」（桌面 + 开始菜单）内嵌图标位置指向
/// 安装 exe，任务栏分组/桌面快捷方式取的正是 .lnk 与 Explorer 图标缓存——
/// WM_SETICON 只影响本进程窗体，管不到它们。这里在应用/恢复自定义图标时改写
/// .lnk 的图标位置（COM：ShellLink + IPersistFile）并广播 SHCNE_ASSOCCHANGED
/// 刷新缓存。全程软失败：找不到/改不动快捷方式仅 eprintln 告警，绝不阻断
/// 窗+托盘图标主链路。
#[cfg(target_os = "windows")]
mod shortcut_icon {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};

    use windows_api::core::{Interface, PCWSTR};
    use windows_api::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows_api::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
    };
    use windows_api::Win32::UI::Shell::{
        IShellLinkW, SHChangeNotify, SHGetKnownFolderPath, FOLDERID_Desktop, KNOWN_FOLDER_FLAG,
        SHCNE_ASSOCCHANGED, SHCNF_IDLIST, ShellLink,
    };

    /// 快捷方式名 = NSIS ${PRODUCTNAME} = productName「DSH Desktop」（oneClick:
    /// false 保留空格；见 nsis/installer-template.nsi 的 CreateShortcut 调用）。
    const SHORTCUT_NAME: &str = "DSH Desktop";

    /// 路径 → NUL 结尾 UTF-16（PCWSTR 参数要求；encode_wide 免 lossy 转换）。
    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
    }

    /// 用户桌面目录：优先 known folder `FOLDERID_Desktop`（OneDrive 重定向的
    /// 桌面也返回真实位置，与 NSIS $DESKTOP 同源）；失败退 %USERPROFILE%\Desktop。
    fn desktop_dir() -> Option<PathBuf> {
        unsafe {
            SHGetKnownFolderPath(&FOLDERID_Desktop, KNOWN_FOLDER_FLAG(0), None)
                .ok()
                .map(|pw| {
                    // PWSTR 按宽字符数 NUL 结尾；读毕 CoTaskMemFree 释放（调用方契约）。
                    let mut len = 0usize;
                    while *pw.0.add(len) != 0 {
                        len += 1;
                    }
                    let dir = PathBuf::from(String::from_utf16_lossy(std::slice::from_raw_parts(
                        pw.0, len,
                    )));
                    CoTaskMemFree(Some(pw.0.cast()));
                    dir
                })
        }
        .or_else(|| {
            std::env::var_os("USERPROFILE").map(|h| PathBuf::from(h).join("Desktop"))
        })
    }

    /// NSIS 安装器可能写出的 .lnk 候选（存在与否到用时再判）：桌面一份；开始
    /// 菜单两形态——Programs 直下 / productName 子文件夹（MUI STARTMENU 页用户
    /// 可选文件夹，模板按 STARTMENUFOLDER 两分支 CreateShortcut）。
    fn shortcut_candidates() -> Vec<PathBuf> {
        let mut v = Vec::new();
        if let Some(desktop) = desktop_dir() {
            v.push(desktop.join(format!("{SHORTCUT_NAME}.lnk")));
        }
        if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
            let programs = appdata.join(r"Microsoft\Windows\Start Menu\Programs");
            v.push(programs.join(format!("{SHORTCUT_NAME}.lnk")));
            v.push(programs.join(SHORTCUT_NAME).join(format!("{SHORTCUT_NAME}.lnk")));
        }
        v
    }

    /// .lnk 目标是否指向本应用 exe：canonicalize 精确比对（消解大小写/短路径），
    /// 失败退归一化字符串相等/包含（NSIS 写 $INSTDIR 全路径，包含即同源）。
    /// 只改自家快捷方式，绝不误碰同名无关项。
    fn targets_our_exe(target: Option<&Path>, exe: &Path) -> bool {
        let Some(target) = target else { return false };
        let norm = |p: &Path| p.to_string_lossy().replace(r"\\?\", "").to_lowercase();
        let (t, e) = (norm(target), norm(exe));
        if t == e || t.contains(&e) {
            return true;
        }
        if let (Ok(tc), Ok(ec)) = (std::fs::canonicalize(target), std::fs::canonicalize(exe)) {
            return norm(&tc) == norm(&ec);
        }
        false
    }

    /// 读 .lnk 当前目标路径（GetPath；空串/无路径 → None）。
    fn shortcut_target(link: &IShellLinkW) -> Option<PathBuf> {
        let mut buf = [0u16; 1024];
        unsafe {
            link.GetPath(&mut buf, std::ptr::null_mut(), 0).ok()?;
        }
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        if len == 0 {
            return None;
        }
        Some(PathBuf::from(String::from_utf16_lossy(&buf[..len])))
    }

    /// 单个 .lnk 图标位置改写：Load → 校验目标 → SetIconLocation → Save。
    fn rewrite_shortcut(lnk: &Path, icon_path: &Path, exe: &Path) -> Result<(), String> {
        unsafe {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("CoCreateInstance(ShellLink) 失败: {e}"))?;
            let persist: IPersistFile = link
                .cast()
                .map_err(|e| format!("ShellLink → IPersistFile 转型失败: {e}"))?;
            let lnk_w = wide(lnk);
            persist
                .Load(PCWSTR(lnk_w.as_ptr()), STGM_READ)
                .map_err(|e| format!("加载 .lnk 失败: {e}"))?;
            if !targets_our_exe(shortcut_target(&link).as_deref(), exe) {
                return Err("目标非本应用 exe，跳过".into());
            }
            let icon_w = wide(icon_path);
            link.SetIconLocation(PCWSTR(icon_w.as_ptr()), 0)
                .map_err(|e| format!("SetIconLocation 失败: {e}"))?;
            persist
                .Save(PCWSTR(lnk_w.as_ptr()), true)
                .map_err(|e| format!("保存 .lnk 失败: {e}"))?;
            Ok(())
        }
    }

    /// PNG 自定义图标 → `<app_data>/custom-icon-shortcut.ico`（PNG-compressed
    /// 单条目 ICO，见 [`super::png_bytes_to_ico`]；幂等重写，被删后下次应用
    /// 自愈）。已持久化 .ico 则不经此函数、.lnk 直接引用。
    fn wrap_png_as_shortcut_ico(png_path: &Path) -> Result<PathBuf, String> {
        let png = std::fs::read(png_path).map_err(|e| format!("读取 {png_path:?} 失败: {e}"))?;
        let ico_path = super::custom_icon_shortcut_ico();
        std::fs::write(&ico_path, super::png_bytes_to_ico(&png))
            .map_err(|e| format!("写入 {ico_path:?} 失败: {e}"))?;
        Ok(ico_path)
    }

    /// 应用/恢复快捷方式图标入口（set/reset/启动重放三处调用）：
    /// - `Some(custom)`：.ico 直接引用；.png 现场包 ICO 壳再引用（.lnk 图标
    ///   位置不支持裸 PNG）；
    /// - `None`：指回 `<exe>,0`（安装器默认——exe 内嵌图标第 0 张）。
    ///
    /// 改写成功后 `SHChangeNotify(SHCNE_ASSOCCHANGED)` 通知 Explorer 刷新图标
    /// 缓存（桌面/任务栏免重启生效）。
    pub(super) fn apply_shortcut_icon(custom: Option<&Path>) {
        let exe = match std::env::current_exe() {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[icon] 获取当前 exe 路径失败（跳过快捷方式图标重写）: {e}");
                return;
            }
        };
        let icon_path = match custom {
            None => exe.clone(),
            Some(p) if p.extension() == Some(OsStr::new("ico")) => p.to_path_buf(),
            Some(p) => match wrap_png_as_shortcut_ico(p) {
                Ok(ico) => ico,
                Err(e) => {
                    eprintln!("[icon] 生成快捷方式 ICO 失败（跳过快捷方式图标重写）: {e}");
                    return;
                }
            },
        };

        // 宿主线程可能已按其它模型初始化过 COM（tao/wry 消息循环）：
        // S_OK / S_FALSE → 须配对 CoUninitialize；RPC_E_CHANGED_MODE → 沿用
        // 现状照常调 ShellLink，只是不能 Uninit；其余错误才放弃。
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        let uninit = hr.is_ok();
        if !uninit && hr != RPC_E_CHANGED_MODE {
            eprintln!("[icon] CoInitializeEx 失败（跳过快捷方式图标重写）: {hr:?}");
            return;
        }
        let mut rewritten = 0usize;
        for lnk in shortcut_candidates() {
            if !lnk.is_file() {
                continue;
            }
            match rewrite_shortcut(&lnk, &icon_path, &exe) {
                Ok(()) => rewritten += 1,
                Err(e) => eprintln!("[icon] 快捷方式图标重写未生效 {}: {e}", lnk.display()),
            }
        }
        if uninit {
            unsafe { CoUninitialize() };
        }
        if rewritten > 0 {
            unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// 真链路自测（只碰临时目录 + notepad.exe，绝不触碰用户真实快捷方式）：
        /// 临时造一个指向 notepad.exe 的 .lnk → `rewrite_shortcut` 指到 ICO →
        /// 回读 `GetIconLocation` 断言已改（icon_path,0）→ 复位回 `<exe>,0` →
        /// 目标不符的改写请求被拒。覆盖 Load/SetIconLocation/Save 全链与
        /// targets_our_exe 门禁。
        #[test]
        fn rewrite_shortcut_roundtrip_on_throwaway_lnk() {
            let notepad =
                PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_default())
                    .join(r"System32\notepad.exe");
            if !notepad.is_file() {
                eprintln!("[icon-test] 无 notepad.exe，跳过快捷方式改写自测");
                return;
            }
            let dir = std::env::temp_dir().join(format!("dsh-icon-lnk-{}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let lnk = dir.join("throwaway.lnk");
            let ico = dir.join("throwaway.ico");
            // 1x1 RGBA PNG（可解码向量的同款字节）包 ICO 壳。
            let png: &[u8] = &[
                137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,218,99,100,248,207,80,15,0,3,134,1,128,90,52,125,107,0,0,0,0,73,69,78,68,174,66,96,130,
            ];
            std::fs::write(&ico, super::super::png_bytes_to_ico(png)).unwrap();

            unsafe {
                let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
                assert!(hr.is_ok(), "测试线程 CoInitializeEx 失败: {hr:?}");

                // 造壳：SetPath(notepad) + IPersistFile::Save。
                let link: IShellLinkW =
                    CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
                let persist: IPersistFile = link.cast().unwrap();
                let np = wide(&notepad);
                link.SetPath(PCWSTR(np.as_ptr())).unwrap();
                let lw = wide(&lnk);
                persist.Save(PCWSTR(lw.as_ptr()), true).unwrap();

                // 改写 → 图标位置 == <ico>,0。
                rewrite_shortcut(&lnk, &ico, &notepad).expect("临时 .lnk 必须可改写");
                let (got, idx) = read_icon_location(&lnk);
                assert_eq!(normalize(&got), normalize(&ico.to_string_lossy()), "图标位置未指向 ICO");
                assert_eq!(idx, 0);

                // 复位 → 图标位置 == <exe>,0（安装器默认形态）。
                rewrite_shortcut(&lnk, &notepad, &notepad).unwrap();
                let (got, idx) = read_icon_location(&lnk);
                assert_eq!(normalize(&got), normalize(&notepad.to_string_lossy()));
                assert_eq!(idx, 0);

                // 目标门禁：exe 参数与 .lnk 目标不符 → 拒改（返回 Err）。
                assert!(
                    rewrite_shortcut(&lnk, &ico, &dir.join("other.exe")).is_err(),
                    "目标不符必须拒改"
                );

                CoUninitialize();
            }
            let _ = std::fs::remove_dir_all(&dir);
        }

        fn normalize(p: &str) -> String {
            p.replace('/', "\\").to_lowercase()
        }

        /// 读 .lnk 当前图标位置（断言用）。
        fn read_icon_location(lnk: &Path) -> (String, i32) {
            unsafe {
                let link: IShellLinkW =
                    CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
                let persist: IPersistFile = link.cast().unwrap();
                let lw = wide(lnk);
                persist.Load(PCWSTR(lw.as_ptr()), STGM_READ).unwrap();
                let mut buf = [0u16; 1024];
                let mut idx = 0i32;
                link.GetIconLocation(&mut buf, &mut idx).unwrap();
                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                (String::from_utf16_lossy(&buf[..len]), idx)
            }
        }
    }
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
    // 清旧自定义图标（换格式时不留两份、残留不误读）；PNG 的快捷方式 ICO
    // 包装壳一并清（新图标按需重建）。
    for stale in custom_icon_candidates() {
        let _ = std::fs::remove_file(stale);
    }
    let _ = std::fs::remove_file(custom_icon_shortcut_ico());
    let path = dir.join(format!("custom-icon.{ext}"));
    std::fs::write(&path, &bytes).map_err(BridgeError::from)?;

    apply_icon(app, img)?;
    // Windows：同步重写桌面/开始菜单快捷方式内嵌图标（软失败，绝不阻断）。
    #[cfg(target_os = "windows")]
    shortcut_icon::apply_shortcut_icon(Some(&path));
    Ok(ext)
}

/// 「恢复默认图标」：删除自定义图标文件，恢复窗+托盘默认图标。
pub(super) fn reset_custom_icon(app: &AppHandle) -> Result<(), BridgeError> {
    for stale in custom_icon_candidates() {
        let _ = std::fs::remove_file(stale);
    }
    // PNG 的快捷方式 ICO 包装壳一并清；快捷方式图标指回 `<exe>,0`（软失败）。
    let _ = std::fs::remove_file(custom_icon_shortcut_ico());
    let result = apply_default_icon(app);
    #[cfg(target_os = "windows")]
    shortcut_icon::apply_shortcut_icon(None);
    result
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
        Ok(img) => match apply_icon(app, img) {
            // 启动重放同样重写快捷方式图标：安装器升级/用户重建的 .lnk 指回
            // exe 默认图标，此处自愈回自定义图标（软失败，见模块注释）。
            Ok(()) => {
                #[cfg(target_os = "windows")]
                shortcut_icon::apply_shortcut_icon(Some(&path));
            }
            Err(e) => eprintln!("[icon] 应用自定义图标失败: {e}"),
        },
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
        let _g = crate::logging::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
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

    /// PNG→ICO 包装（Windows 快捷方式图标用）：魔数 reserved=0/type=1、
    /// count=1、IHDR 尺寸 1x1、planes=1/bitcount=32、payload 长度与偏移 22、
    /// 内嵌载荷与原 PNG 逐字节一致；且包出的 ICO 能被 tauri（image-ico）按
    /// PNG-compressed 条目真解码——快捷方式引用面有效而非纸面容器（image 的
    /// ICO 解码只收 RGBA 条目，解码断言用 RGBA 向量；壳侧 GDI+ 无此限制）。
    #[test]
    fn png_bytes_to_ico_wraps_png_payload() {
        // 现有 1x1 灰度+alpha PNG 向量：结构断言主用例。
        let png: Vec<u8> = vec![
            137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,4,0,0,0,181,28,12,2,0,0,0,11,73,68,65,84,120,218,99,100,248,15,0,1,5,1,1,39,24,227,102,0,0,0,0,73,69,78,68,174,66,96,130,
        ];
        let ico = png_bytes_to_ico(&png);
        // ICONDIR：reserved 00 00 + type 01 00 + count 01 00。
        assert_eq!(&ico[..4], &[0x00, 0x00, 0x01, 0x00][..]);
        assert_eq!(&ico[4..6], &[0x01, 0x00][..]);
        // ICONDIRENTRY：宽高取 IHDR（1x1，非 0=256）。
        assert_eq!(ico[6], 1);
        assert_eq!(ico[7], 1);
        assert_eq!(&ico[8..10], &[0x00, 0x00][..]); // color count + reserved
        assert_eq!(u16::from_le_bytes([ico[10], ico[11]]), 1); // planes
        assert_eq!(u16::from_le_bytes([ico[12], ico[13]]), 32); // bitcount
        assert_eq!(
            u32::from_le_bytes(ico[14..18].try_into().unwrap()),
            png.len() as u32
        );
        assert_eq!(u32::from_le_bytes(ico[18..22].try_into().unwrap()), 22);
        // 载荷：原 PNG 逐字节内嵌。
        assert_eq!(&ico[22..], &png[..]);
        // IHDR 缺失（截断 PNG）退 0/0（= 256），不 panic、仍原样内嵌。
        let truncated = png_bytes_to_ico(&png[..12]);
        assert_eq!((truncated[6], truncated[7]), (0, 0));

        // 1x1 RGBA（colortype 6）PNG：包装产物可被 image-ico 按 PNG-compressed
        // 条目真解码，宽高回到 1x1——容器结构有效而非纸面拼装。
        let rgba: Vec<u8> = vec![
            137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,218,99,100,248,207,80,15,0,3,134,1,128,90,52,125,107,0,0,0,0,73,69,78,68,174,66,96,130,
        ];
        let ico_rgba = png_bytes_to_ico(&rgba);
        assert_eq!(&ico_rgba[22..], &rgba[..]);
        let img = decode_icon(&ico_rgba).expect("包出的 ICO 必须可解码");
        assert_eq!((img.width(), img.height()), (1, 1));
    }
}