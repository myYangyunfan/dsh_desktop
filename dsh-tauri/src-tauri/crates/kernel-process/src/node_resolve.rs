//! Node 可执行文件三级解析链（v0.5.4 便携版修复 + 安装包瘦身基础）。
//!
//! 需求背景：便携版在无内置 node 的机器上打不开（spawn 报 os error 2，用户
//! 无法理解）；安装版始终内置 91MB node 即便用户机器已有 node。
//!
//! 优先级（design 契约）：
//! 1. **内置 vendor node**（`<appDir>/vendor/node/node.exe|node`，厂商测过的
//!    确定性运行时）→ 在位且 `--version` 探测健康即优先。根治「系统装了没测过
//!    的 node（如某些 24.x minor）→ 内核内部 ESM loader 归类失败 → 打不开」。
//! 2. **系统 PATH 中的 node**（`<exe> --version` 大版本 ≥ [`MIN_NODE_MAJOR`]）
//!    → 仅在 vendor 缺失（便携版）或 vendor 被杀软拦到探测不通时回落。
//! 3. 都没有 → `None`，调用方（supervisor boot 瀑布）发清晰 BootStep 错误
//!    并转恢复页（替代旧「sidecar spawn 失败 os error 2」不可读形态）。
//!
//! 版本门控的理由：WindowsApps 的 node.exe 占位 stub（运行即开商店/报错）与
//! 过旧 node（内核 engines 要求 22+）在被回落到系统一级时必须被挡下。vendor
//! 优先前也过一次带超时探测，避免把被拦到半死的 vendor 强推致 loading 永挂。
//!
//! WSL 托管模式不受影响：内核 spawn 走 WSL 内 node（ensure_installed 链），
//! 本链只解析 **Windows 侧** sidecar/guard/watcher 所用的 node。
//!
//! 测试缝：[`NodeProbe`]——生产 [`RealNodeProbe`]（真实 PATH 扫描 + 带超时的
//! `--version` 探测），测试注入桩验证优先级矩阵（design D7 同手法）。

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// 系统 node 最低大版本（vendor 回落为保底时才走系统 node；此下限对齐内核
/// engines 声明的 22，达标才采用系统 node，否则视同不可用）。
pub const MIN_NODE_MAJOR: u32 = 22;

/// `node --version` 探测超时：D2「永挂形态」在 setup 线程的前置防线——
/// vendor/系统 node 被杀软拦到半死时，解析不得拖死构造（超时按无系统
/// node 处理，回落 vendor）。
const VERSION_PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// 平台主名（vendor 目录按平台分发双二进制；见 [`vendor_node_exe`]）。
#[cfg(windows)]
pub const NODE_BINARY_NAME: &str = "node.exe";
#[cfg(not(windows))]
pub const NODE_BINARY_NAME: &str = "node";

/// 解析命中形态。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedNode {
    /// 系统 PATH 命中且大版本 ≥ 22。
    System { exe: PathBuf, major: u32, minor: u32 },
    /// 内置 vendor node 保底命中。
    Vendor(PathBuf),
}

impl ResolvedNode {
    /// 命中的可执行路径。
    pub fn exe(&self) -> &Path {
        match self {
            ResolvedNode::System { exe, .. } => exe,
            ResolvedNode::Vendor(p) => p,
        }
    }

    /// 日志标签（boot 瀑布首步透出，用户可自查命中的是哪一级）。
    pub fn label(&self) -> String {
        match self {
            ResolvedNode::System { exe, major, .. } => {
                format!("系统 node v{major}（{}）", exe.display())
            }
            ResolvedNode::Vendor(p) => format!("内置 vendor node（{}）", p.display()),
        }
    }

    /// 该 node 是否支持 `--use-system-ca`（node 级参数）。
    ///
    /// vendor 内置 node（v24）恒支持；系统 node 按版本门控（见
    /// [`node_use_system_ca_supported`]）。issue #163：系统 node 为 22.0–22.14
    /// 时 `--use-system-ca` 尚未引入（`bad option: --use-system-ca`，退出码 9），
    /// 必须撤下该 flag，否则内核起不来。
    pub fn supports_use_system_ca(&self) -> bool {
        match self {
            ResolvedNode::Vendor(_) => true,
            ResolvedNode::System { major, minor, .. } => node_use_system_ca_supported(*major, *minor),
        }
    }
}

/// `--use-system-ca` 的 node 版本门槛（Node 官方 changelog，纯函数可单测）。
///
/// - v22：`>= 22.15.0`（#56833 Windows / #56599 macOS / #57009 其余，均同一版）；
/// - v23：Windows/macOS `>= 23.8.0`，其余平台 `>= 23.9.0`——取 23.9 保守口径，
///   最坏情况只是少发一个 flag（TLS 退回内置 CA），不影响内核启动；
/// - v24+：全支持（分支自 v22.15.0/v23.8.0 之后）。
pub fn node_use_system_ca_supported(major: u32, minor: u32) -> bool {
    match major {
        22 => minor >= 15,
        23 => minor >= 9,
        _ => major >= 24,
    }
}

/// 解析 `"v22.14.0"` / `"22.14.0"` → `Some((22, 14))`（major, minor）；垃圾输入
/// （商店 stub 输出、空串、含非数字前缀）→ `None`。纯函数。
pub fn parse_node_version(ver: &str) -> Option<(u32, u32)> {
    let v = ver.trim().trim_start_matches('v');
    let mut it = v.split('.');
    let major = it.next()?.trim();
    if major.is_empty() || !major.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let minor = it.next().unwrap_or("0").trim();
    if minor.is_empty() || !minor.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((major.parse().ok()?, minor.parse().ok()?))
}

/// 探测原语（生产 [`RealNodeProbe`]；测试注桩——优先级矩阵的确定性验证）。
pub trait NodeProbe: Send + Sync {
    /// PATH 中首个 node 候选的完整路径（生产：split_paths 扫描，等价
    /// `where node`/`which node` 但零 spawn、无控制台窗闪烁）。
    fn find_node_in_path(&self) -> Option<PathBuf>;
    /// `<exe> --version` 的 stdout（生产：带 [`VERSION_PROBE_TIMEOUT`] 超时；
    /// 失败/超时/退出码非零 → None）。
    fn node_version(&self, exe: &Path) -> Option<String>;
}

/// 生产探测原语。
pub struct RealNodeProbe;

impl NodeProbe for RealNodeProbe {
    fn find_node_in_path(&self) -> Option<PathBuf> {
        // 增量扫描替代 `where node` spawn：零子进程、零窗闪烁、可注入测试。
        let path = std::env::var_os("PATH")?;
        std::env::split_paths(&path)
            .map(|dir| dir.join(NODE_BINARY_NAME))
            .find(|cand| cand.is_file())
    }

    fn node_version(&self, exe: &Path) -> Option<String> {
        output_with_timeout(exe, VERSION_PROBE_TIMEOUT)
    }
}

/// 三级解析链核心（注桩可测）：**内置 vendor node 优先**（厂商测过的确定性
/// 运行时，杜绝系统 node 大版本差异击穿内核 ESM loader）→ 系统 PATH 中达标
/// node（vendor 缺失/探测不通时回落，覆盖便携版与杀软拦 vendor 的机型）→ 都
/// 不行则 `None`。健康 vendor 在位即优先；否则回落系统；系统也不达标但 vendor
/// 在位时仍作最后保底返回（总得试一个，与旧行为终底一致）。
pub fn resolve_node_with(probe: &dyn NodeProbe, vendor: Option<PathBuf>) -> Option<ResolvedNode> {
    // 1. 内置 vendor node 在位且 --version 探测健康 → 优先。
    if let Some(v) = vendor.as_ref() {
        if probe.node_version(v).as_deref().and_then(parse_node_version).is_some() {
            return Some(ResolvedNode::Vendor(v.clone()));
        }
    }
    // 2. 回落系统 PATH 中 major ≥ MIN_NODE_MAJOR 的 node。
    if let Some(exe) = probe.find_node_in_path() {
        if let Some((major, minor)) = probe.node_version(&exe).as_deref().and_then(parse_node_version) {
            if major >= MIN_NODE_MAJOR {
                return Some(ResolvedNode::System { exe, major, minor });
            }
        }
    }
    // 3. 终底：vendor 在位（即便探测失败）仍返回它，否则 None。
    vendor.map(ResolvedNode::Vendor)
}

/// 公开入口（仅文档 / 无注桩场景）：三级解析链（真实探测 +
/// `<appDir>/vendor/node` 保底）。**生产构造不走此入口**——supervisor
/// 直接调 [`resolve_node_with`] 以注入 [`NodeProbe`]（N1 注桩缝，可测优先级
/// 矩阵与缺失路径），本函数仅供无注桩的直用方 / 文档引用，避免两入口语义
/// 漂移。若未来生产改走此入口，须先移除 N1 缝或同步其语义。
pub fn resolve_node(app_dir: &Path) -> Option<ResolvedNode> {
    resolve_node_with(&RealNodeProbe, existing_vendor_node(app_dir))
}

/// 内置 vendor node 中真实在位的那个（主名/备名都不在 → None）。
pub fn existing_vendor_node(app_dir: &Path) -> Option<PathBuf> {
    let dir = app_dir.join("vendor").join("node");
    let primary = dir.join(NODE_BINARY_NAME);
    if primary.is_file() {
        return Some(primary);
    }
    let alt_name = if cfg!(windows) { "node" } else { "node.exe" };
    let alt = dir.join(alt_name);
    if alt.is_file() {
        return Some(alt);
    }
    None
}

/// vendor node 路径（旧 supervisor 语义原样迁移）：主名优先，备名兜底
/// （检出形态可能只带其一）；都不在时返回主名占位——调用方 spawn 报错走
/// 既有恢复页路径，不 panic。
pub fn vendor_node_exe(app_dir: &Path) -> PathBuf {
    app_dir.join("vendor").join("node").join(NODE_BINARY_NAME)
}

/// GUI 进程起 console 子进程抑制终端窗（与 supervisor 同口径）。
#[cfg(windows)]
fn no_window(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW)
}
#[cfg(not(windows))]
fn no_window(cmd: &mut Command) -> &mut Command {
    cmd
}

/// 带超时的 `<exe> --version`（std 无限时 .output()；杀软半死形态下不能
/// 拖死调用线程）。超时/失败/非零退出 → None。`--version` 输出 ~10 字节，
/// 无管道缓冲死锁面。
fn output_with_timeout(exe: &Path, timeout: Duration) -> Option<String> {
    use std::io::Read;
    let mut child = no_window(&mut Command::new(exe))
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut buf = String::new();
                child.stdout.take()?.read_to_string(&mut buf).ok()?;
                return Some(buf);
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// 桩探测（优先级矩阵确定性验证）：区分 vendor / 系统两路 `--version` 输出
    /// （`node_version` 据 exe 是否等于注入的 PATH 命中路径来分流）。
    struct StubProbe {
        path_hit: Option<PathBuf>,
        version: Option<String>,
        vendor_version: Option<String>,
    }
    impl NodeProbe for StubProbe {
        fn find_node_in_path(&self) -> Option<PathBuf> {
            self.path_hit.clone()
        }
        fn node_version(&self, exe: &Path) -> Option<String> {
            if self.path_hit.as_deref() == Some(exe) {
                self.version.clone()
            } else {
                self.vendor_version.clone()
            }
        }
    }

    fn fake_system_path() -> PathBuf {
        PathBuf::from(if cfg!(windows) {
            r"C:\fake\node.exe"
        } else {
            "/fake/node"
        })
    }

    /// 系统命中桩：`sys_ver` 给系统 node，`vendor_ver` 给 vendor node（None=探测不通）。
    fn stub(sys_ver: Option<&str>, vendor_ver: Option<&str>) -> StubProbe {
        StubProbe {
            path_hit: Some(fake_system_path()),
            version: sys_ver.map(String::from),
            vendor_version: vendor_ver.map(String::from),
        }
    }

    #[test]
    fn parse_node_version_forms() {
        assert_eq!(parse_node_version("v22.14.0"), Some((22, 14)));
        assert_eq!(parse_node_version("22.14.0"), Some((22, 14)));
        assert_eq!(parse_node_version("v24.15.0\n"), Some((24, 15)));
        assert_eq!(parse_node_version("v22.14.0-nightly.1"), Some((22, 14)));
        assert_eq!(parse_node_version("v0.10.32"), Some((0, 10)));
        assert_eq!(parse_node_version("v22"), Some((22, 0)), "缺 minor 按 0 补");
        // 商店 stub / 报错文本 / 空串 → None（不得 panic、不得误判 0 后放过）。
        assert_eq!(parse_node_version(""), None);
        assert_eq!(parse_node_version("此应用无法在你的电脑上运行"), None);
        assert_eq!(parse_node_version("not recognized"), None);
        assert_eq!(parse_node_version("vX.Y.Z"), None);
        assert_eq!(parse_node_version("vv22.1.0"), Some((22, 1)), "多 v 前缀仍可解析");
    }

    #[test]
    fn use_system_ca_gate() {
        // issue #163：系统 node v22.0–v22.14 尚无 `--use-system-ca`（bad option，退出码 9）。
        assert!(!node_use_system_ca_supported(22, 0));
        assert!(!node_use_system_ca_supported(22, 14));
        assert!(node_use_system_ca_supported(22, 15));
        assert!(node_use_system_ca_supported(22, 23));
        // v23 保守口径（非 Windows/macOS 需 23.9；Windows/macOS 只需 23.8）。
        assert!(!node_use_system_ca_supported(23, 0));
        assert!(!node_use_system_ca_supported(23, 8));
        assert!(node_use_system_ca_supported(23, 9));
        // v24+ 全支持；v21 及以下不支持（本就不该命中）。
        assert!(node_use_system_ca_supported(24, 0));
        assert!(node_use_system_ca_supported(26, 1));
        assert!(!node_use_system_ca_supported(21, 7));
    }

    #[test]
    fn supports_use_system_ca_per_source() {
        let v = ResolvedNode::Vendor(PathBuf::from("/app/vendor/node/node.exe"));
        assert!(v.supports_use_system_ca(), "vendor node（v24）恒支持");
        let s_old = ResolvedNode::System { exe: PathBuf::from("/usr/bin/node"), major: 22, minor: 14 };
        assert!(!s_old.supports_use_system_ca(), "系统 v22.14 不支持");
        let s_ok = ResolvedNode::System { exe: PathBuf::from("/usr/bin/node"), major: 22, minor: 15 };
        assert!(s_ok.supports_use_system_ca(), "系统 v22.15 支持");
    }

    #[test]
    fn healthy_vendor_wins_over_system() {
        let vendor = PathBuf::from("/app/vendor/node/node.exe");
        // vendor 探测健康 → 即便系统也有达标 node，仍优先 vendor（装机版确定性运行时口径）。
        let p = stub(Some("v24.15.0"), Some("v24.15.0"));
        assert_eq!(
            resolve_node_with(&p, Some(vendor.clone())),
            Some(ResolvedNode::Vendor(vendor)),
            "健康 vendor 优先于系统 node"
        );
    }

    #[test]
    fn broken_vendor_falls_back_to_system() {
        let vendor = PathBuf::from("/app/vendor/node/node.exe");
        // vendor 探测不通（缺失/被杀软拦到超时），系统达标 → 回落系统 node。
        let p = stub(Some("v22.1.0"), None);
        assert_eq!(
            resolve_node_with(&p, Some(vendor)),
            Some(ResolvedNode::System { exe: fake_system_path(), major: 22, minor: 1 }),
            "vendor 探测不通须回落系统 node"
        );
    }

    #[test]
    fn missing_vendor_uses_system() {
        // 便携版：无 vendor（None），系统达标 → 系统 node（无内置 node 也能跑的起死回生主路径）。
        assert!(matches!(
            resolve_node_with(&stub(Some("v22.1.0"), None), None),
            Some(ResolvedNode::System { major: 22, .. })
        ));
    }

    #[test]
    fn healthy_vendor_preempts_any_system() {
        let vendor = PathBuf::from("/app/vendor/node/node.exe");
        // vendor 健康：无论系统过旧/垃圾/探测失败，第 1 级都先命中 vendor。
        for bad_sys in ["v21.7.3", "v18.20.4", "此应用无法在你的电脑上运行", ""] {
            assert_eq!(
                resolve_node_with(&stub(Some(bad_sys), Some("v24.15.0")), Some(vendor.clone())),
                Some(ResolvedNode::Vendor(vendor.clone())),
                "健康 vendor 须先于任何系统 node 命中：{bad_sys}"
            );
        }
    }

    #[test]
    fn dead_vendor_and_old_system_returns_vendor_as_last_resort() {
        let vendor = PathBuf::from("/app/vendor/node/node.exe");
        // vendor 探测不通 + 系统过旧：第 1、2 级皆不命中，终底仍返回在位的 vendor（总得试一个）。
        assert_eq!(
            resolve_node_with(&stub(Some("v18.20.4"), None), Some(vendor.clone())),
            Some(ResolvedNode::Vendor(vendor)),
            "vendor 在位但坏、系统过旧 → 终底返回 vendor 保底"
        );
    }

    #[test]
    fn no_system_no_vendor_is_none() {
        let p = StubProbe { path_hit: None, version: None, vendor_version: None };
        assert_eq!(resolve_node_with(&p, None), None, "三级链全空 → None（调用方报清晰错误）");
    }

    #[test]
    fn label_mentions_source_and_path() {
        let s = ResolvedNode::System { exe: PathBuf::from("/usr/bin/node"), major: 24, minor: 15 };
        assert!(s.label().contains("v24") && s.label().contains("系统"));
        let v = ResolvedNode::Vendor(PathBuf::from("/app/vendor/node/node.exe"));
        assert!(v.label().contains("vendor"));
    }

    /// vendor 平台名选择（supervisor 旧测试迁移，P0 回归锚点）：本平台主名
    /// 优先；主名缺失兜底另一名；两者皆缺 None（新链语义）。
    #[test]
    fn vendor_node_platform_name_with_fallback() {
        let dir = std::env::temp_dir().join(format!("dsh-nr-vendor-{}", std::process::id()));
        let vdir = dir.join("vendor").join("node");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&vdir).unwrap();
        let primary = if cfg!(windows) { "node.exe" } else { "node" };
        let alt = if cfg!(windows) { "node" } else { "node.exe" };
        // 只放主名：命中主名。
        std::fs::write(vdir.join(primary), b"").unwrap();
        assert_eq!(existing_vendor_node(&dir), Some(vdir.join(primary)));
        // 主名 + 备名都在：仍主名。
        std::fs::write(vdir.join(alt), b"").unwrap();
        assert_eq!(existing_vendor_node(&dir), Some(vdir.join(primary)));
        // 只放备名（单平台检出形态）：备名兜底。
        let dir2 = std::env::temp_dir().join(format!("dsh-nr-vendor2-{}", std::process::id()));
        let vdir2 = dir2.join("vendor").join("node");
        let _ = std::fs::remove_dir_all(&dir2);
        std::fs::create_dir_all(&vdir2).unwrap();
        std::fs::write(vdir2.join(alt), b"").unwrap();
        assert_eq!(existing_vendor_node(&dir2), Some(vdir2.join(alt)));
        // 全缺：None（新语义——调用方据此发清晰错误，不再拼死占位路径）。
        let dir3 = std::env::temp_dir().join(format!("dsh-nr-vendor3-{}", std::process::id()));
        std::fs::create_dir_all(dir3.join("vendor").join("node")).unwrap();
        assert_eq!(existing_vendor_node(&dir3), None);
        // 占位路径函数：恒主名（缺省时的 spawn 错误路径用）。
        assert_eq!(vendor_node_exe(&dir3), dir3.join("vendor").join("node").join(primary));
        for d in [&dir, &dir2, &dir3] {
            let _ = std::fs::remove_dir_all(d);
        }
    }

    /// 真实探测的失败面（不依赖机器是否装有 node）：对必然不存在的 exe，
    /// 版本探测必须 None 而非 panic/永挂。
    #[test]
    fn real_probe_missing_exe_returns_none() {
        let missing = std::env::temp_dir().join(format!("dsh-nr-definitely-missing-{}.exe", std::process::id()));
        assert_eq!(RealNodeProbe.node_version(&missing), None);
        // PATH 扫描不 panic（返回值依机器而定，不断言）。
        let _ = RealNodeProbe.find_node_in_path();
    }

    /// PATH 增量扫描形态：把仅含伪 node 的目录注入 PATH（仅本测试进程；
    /// kernel-process 测试并行无共享 env 需求，用独立锁防 cargo 并行串扰）。
    static PATH_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn real_probe_finds_injected_path_entry() {
        let _g = PATH_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let dir = std::env::temp_dir().join(format!("dsh-nr-path-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // 伪 node：脚本形态探测（仅验证「PATH 扫描能定位文件」，不执行它）。
        let name = if cfg!(windows) { "node.exe" } else { "node" };
        std::fs::write(dir.join(name), b"fake").unwrap();
        let old = std::env::var_os("PATH");
        std::env::set_var("PATH", &dir);
        let hit = RealNodeProbe.find_node_in_path();
        match old {
            Some(v) => std::env::set_var("PATH", v),
            None => std::env::remove_var("PATH"),
        }
        assert_eq!(hit, Some(dir.join(name)), "PATH 扫描须命中注入目录的首个 node");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
