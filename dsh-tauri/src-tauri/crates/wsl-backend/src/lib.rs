//! # wsl-backend —— WSL 托管后端编排（纯 std，不依赖 tauri）
//!
//! 蓝本 = Electron `dsh-desktop/wsl-backend.js`（全量移植对象）+ main.js 的
//! WSL 接线段。契约：`dsh-tauri/contracts/wsl-backend.md`（单一事实源）。
//!
//! 分层铁律（design 文档 §2）：本 crate 只做 wsl.exe 原语与命令编排，
//! spawn/收割的 supervisor 侧接线在 app 层；sidecar JS 半边（boot 链 UNC
//! 写穿）在 `dsh-tauri/sidecar/wsl-mode.js`——两侧零交叠。
//!
//! 可测试性（design D7）：wsl.exe 原语收口为 [`WslInvoker`] trait，生产实现
//! [`RealWslInvoker`] spawn wsl.exe（超时用 kill 兜底）；单测注入桩
//! （预录 stdout/exit 形态）。命令串构造全部为 [`spec`] 纯函数。
//!
//! 绝不调用 `wsl --terminate` / `wsl --shutdown`（会终结整个发行版内用户的
//! 其他进程）——收割三层语义见契约 §4.6。

pub mod spec;
pub mod text;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// WSL 域错误码（contracts/error-codes.md §7，新码只追加）。
pub const E_WSL_UNAVAILABLE: &str = "E_WSL_UNAVAILABLE";
pub const E_WSL_NO_NODE: &str = "E_WSL_NO_NODE";
pub const E_WSL_DIR_INVALID: &str = "E_WSL_DIR_INVALID";
pub const E_WSL_PROBE: &str = "E_WSL_PROBE";
pub const E_WSL_INSTALL: &str = "E_WSL_INSTALL";

/// 探测超时表（契约 §4.1）。
pub const TIMEOUT_LIST: Duration = Duration::from_secs(30);
pub const TIMEOUT_HOME: Duration = Duration::from_secs(60);
pub const TIMEOUT_NODE: Duration = Duration::from_secs(90);
pub const TIMEOUT_STOP: Duration = Duration::from_secs(30);
pub const TIMEOUT_INSTALL: Duration = Duration::from_secs(30 * 60);
pub const TIMEOUT_CLEANUP: Duration = Duration::from_secs(15);
pub const TIMEOUT_VERSION: Duration = Duration::from_secs(60);
/// 存活探测超时（探活防误杀：`kill -0` 一条轻命令；转发抖动时 wsl.exe 本身
/// 仍可快速响应，10s 足够且远小于 supervisor 的重启判据窗口）。
pub const TIMEOUT_PROBE: Duration = Duration::from_secs(10);

/// Docker Desktop 辅助发行版（不含交互 shell 与 node，自动选择时跳过）。
fn is_system_distro(d: &str) -> bool {
    let l = d.to_ascii_lowercase();
    l == "docker-desktop" || l == "docker-desktop-data"
}

/// WSL 域错误（code 供程序识别，message 人话可直接展示）。
#[derive(Debug, Clone)]
pub struct WslError {
    pub code: &'static str,
    pub message: String,
}

impl WslError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

impl std::fmt::Display for WslError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}（{}）", self.message, self.code)
    }
}

impl std::error::Error for WslError {}

/// 一次 wsl.exe 命令的执行结果（stdout/stderr 已过三形态解码）。
#[derive(Debug, Clone)]
pub struct WslRunResult {
    pub ok: bool,
    pub code: i32,
    pub timed_out: bool,
    pub stdout: String,
    pub stderr: String,
}

impl WslRunResult {
    fn spawn_err(e: &std::io::Error) -> Self {
        Self { ok: false, code: -1, timed_out: false, stdout: String::new(), stderr: e.to_string() }
    }
    /// stderr/stdout 合并尾部（错误消息组装用）。
    pub fn tail(&self, max_lines: usize) -> String {
        let combined = if self.stderr.trim().is_empty() { self.stdout.clone() } else { format!("{}{}", self.stderr, self.stdout) };
        let lines: Vec<&str> = combined.lines().collect();
        let start = lines.len().saturating_sub(max_lines);
        lines[start..].join("\n")
    }
}

/// wsl.exe 原语（生产 [`RealWslInvoker`]；单测注入桩——design D7）。
///
/// `run_with_lines` 的 `on_line` 回调在 stdout 行到达时被调（npm 安装进度），
/// 回调在调用线程上执行（实现内部自行搬运）。
pub trait WslInvoker: Send + Sync {
    /// 执行一条 WSL 内命令（已包装 `wsl.exe -d <distro> -e sh -lc <cmd>`）。
    fn run_with_lines(
        &self,
        distro: &str,
        cmd: &str,
        timeout: Duration,
        on_line: &mut (dyn FnMut(&str) + Send),
    ) -> WslRunResult;

    /// 无行回调的便捷形态（默认组装空回调）。
    fn run(&self, distro: &str, cmd: &str, timeout: Duration) -> WslRunResult {
        self.run_with_lines(distro, cmd, timeout, &mut |_| {})
    }

    /// `wsl -l -q` 发行版清单（解码 + 解析后；失败空表 = fail-closed）。
    fn list_distros(&self) -> Vec<String>;

    /// spawn `wsl.exe -d <distro> -e sh -lc <cmd>`（内核启动用；stdio：
    /// stdin null / stdout+stderr piped / 无窗口）。返回的 Child 生命周期与
    /// WSL 内 exec 后的进程绑定（stdout EOF = 内核退出）。
    fn spawn_server(&self, distro: &str, cmd: &str) -> std::io::Result<std::process::Child>;
}

/// 生产实现：真 spawn wsl.exe。
pub struct RealWslInvoker;

#[cfg(windows)]
fn set_no_window(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn set_no_window(_cmd: &mut std::process::Command) {}

/// wsl.exe 可执行名（DSH_TAURI_WSL_EXE 调试缝——与 sidecar wsl-mode.js 同键）。
fn wsl_exe() -> String {
    std::env::var("DSH_TAURI_WSL_EXE").unwrap_or_else(|_| "wsl.exe".into())
}

/// 轮询分片（超时预算的计步单位；S2 P1-A 修复）。
const POLL_SLICE: Duration = Duration::from_millis(50);
/// kill 后收尸宽限（100 × 50ms = 5s；分片计，睡眠安全同预算本体）。
const KILL_GRACE_SLICES: u32 = 100;

/// 超时预算状态机——**中断时钟语义**（S2 P1-A 修复核心）。
///
/// 不用 `Instant` deadline（QPC 含睡眠时间）：30min 安装窗（TIMEOUT_INSTALL）
/// 内用户合盖 85s，唤醒瞬间 deadline 已「过期」→ kill 正在健康运行的 wsl
/// 子进程、安装/探测整体误判失败。改为每轮 `thread::sleep(POLL_SLICE)` 后
/// 扣减一个分片——系统睡眠期间线程 timer 暂停、分片不推进，唤醒后继续用
/// 剩余预算（分片计数驱动，与 supervisor 探活/崩溃环的计数判据同族）。
#[derive(Debug)]
struct SliceBudget {
    remaining_slices: u64,
    timed_out: bool,
    grace_slices: u32,
}

/// 一轮分片后的动作。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BudgetAction {
    /// 预算未耗尽，继续轮询。
    Continue,
    /// 预算耗尽：kill 子进程（进入收尸宽限）。
    Kill,
    /// kill 后宽限耗尽仍未退出：放弃收尸（code=-1）。
    Abandon,
}

impl SliceBudget {
    fn new(timeout: Duration) -> Self {
        let slices = timeout.as_millis().div_ceil(POLL_SLICE.as_millis()) as u64;
        Self { remaining_slices: slices, timed_out: false, grace_slices: 0 }
    }

    /// 每轮 `sleep(POLL_SLICE)` 结束后调用一次。**无任何时钟输入**——挂钟/
    /// QPC 跳变（系统睡眠唤醒）对本状态机不可见，预算只由真实轮询分片消耗。
    fn on_slice(&mut self) -> BudgetAction {
        if !self.timed_out {
            if self.remaining_slices == 0 {
                self.timed_out = true;
                return BudgetAction::Kill;
            }
            self.remaining_slices -= 1;
            BudgetAction::Continue
        } else {
            self.grace_slices += 1;
            if self.grace_slices >= KILL_GRACE_SLICES {
                BudgetAction::Abandon
            } else {
                BudgetAction::Continue
            }
        }
    }
}

impl WslInvoker for RealWslInvoker {
    fn run_with_lines(
        &self,
        distro: &str,
        cmd: &str,
        timeout: Duration,
        on_line: &mut (dyn FnMut(&str) + Send),
    ) -> WslRunResult {
        let mut c = std::process::Command::new(wsl_exe());
        c.args(["-d", distro, "-e", "sh", "-lc", cmd])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        set_no_window(&mut c);
        let mut child = match c.spawn() {
            Ok(ch) => ch,
            Err(e) => return WslRunResult::spawn_err(&e),
        };
        // 读取线程：原始字节累积（最终统一三形态解码——多字节跨 chunk 安全，
        // wsl.exe 自身错误消息的无 BOM UTF-16LE 形态靠它识别，issue #126）；
        // stdout 侧另做 utf8 行流转发（npm 进度）。
        let raw_out: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
        let raw_err: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
        let (line_tx, line_rx) = std::sync::mpsc::channel::<String>();
        let readers: Vec<std::thread::JoinHandle<()>> = [
            (child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>), Arc::clone(&raw_out), true),
            (child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>), Arc::clone(&raw_err), false),
        ]
        .into_iter()
        .map(|(stream, raw, is_stdout)| {
            let tx = line_tx.clone();
            std::thread::spawn(move || {
                use std::io::Read;
                let Some(mut s) = stream else { return };
                let mut buf = [0u8; 4096];
                let mut pending = String::new();
                while let Ok(n) = s.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    raw.lock().unwrap_or_else(|p| p.into_inner()).extend_from_slice(&buf[..n]);
                    if is_stdout {
                        // 进度行走 utf8 流式（多字节跨 chunk 的罕见截断只影响进度
                        // 日志一行，最终返回值用整体解码不受影响）。
                        pending.push_str(&String::from_utf8_lossy(&buf[..n]));
                        while let Some(nl) = pending.find('\n') {
                            let line: String = pending.drain(..=nl).collect();
                            let line = line.trim_end_matches(['\n', '\r']);
                            if !line.trim().is_empty() {
                                let _ = tx.send(line.to_string());
                            }
                        }
                    }
                }
            })
        })
        .collect();
        drop(line_tx);
        // 有界等待（分片预算——中断时钟语义，见 SliceBudget 文档）：预算耗尽
        // kill；kill 后 5s 宽限仍未收尸则放弃（code=-1）。
        let mut budget = SliceBudget::new(timeout);
        let mut timed_out = false;
        let status = loop {
            while let Ok(line) = line_rx.try_recv() {
                on_line(&line);
            }
            match child.try_wait() {
                Ok(Some(st)) => break Some(st),
                Ok(None) => {
                    std::thread::sleep(POLL_SLICE);
                    match budget.on_slice() {
                        BudgetAction::Continue => {}
                        BudgetAction::Kill => {
                            timed_out = true;
                            let _ = child.kill();
                        }
                        BudgetAction::Abandon => break None,
                    }
                }
                Err(_) => break None,
            }
        };
        for h in readers {
            let _ = h.join();
        }
        // 进程退出后抽干管道缓冲内的剩余行。
        while let Ok(line) = line_rx.try_recv() {
            on_line(&line);
        }
        let code = status.and_then(|s| s.code()).unwrap_or(-1);
        let stdout = text::decode_wsl_text(&raw_out.lock().unwrap_or_else(|p| p.into_inner()));
        let stderr = text::decode_wsl_text(&raw_err.lock().unwrap_or_else(|p| p.into_inner()));
        WslRunResult { ok: !timed_out && code == 0, code, timed_out, stdout, stderr }
    }

    fn list_distros(&self) -> Vec<String> {
        let mut c = std::process::Command::new(wsl_exe());
        c.args(["-l", "-q"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        set_no_window(&mut c);
        let out = match c.output() {
            Ok(o) => o,
            Err(_) => return Vec::new(),
        };
        if !out.status.success() {
            return Vec::new();
        }
        text::parse_distro_list(&text::decode_wsl_text(&out.stdout))
    }

    fn spawn_server(&self, distro: &str, cmd: &str) -> std::io::Result<std::process::Child> {
        let mut c = std::process::Command::new(wsl_exe());
        c.args(["-d", distro, "-e", "sh", "-lc", cmd])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        set_no_window(&mut c);
        c.spawn()
    }
}

// ---------------------------------------------------------------------------
// 配置解析（settings 三键 + env 覆盖——与 sidecar wsl-mode.js detectWslBackend 同口径）
// ---------------------------------------------------------------------------

/// 后端模式检测结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendCfg {
    pub backend: String,
    pub distro: String,
    pub install_dir: String,
    /// DSH_WSL_MODE 模拟缝命中（真设置页解锁前的临时调试通道）。
    pub simulated: bool,
}

/// 检测优先级（契约 §1.2 + X2 模拟缝；与 JS detectWslBackend 逐分支一致）：
/// 非 Windows 恒 local → `DSH_DESKTOP_BACKEND=local` 显式本地 →
/// `DSH_WSL_MODE` 模拟缝 / `DSH_DESKTOP_BACKEND=wsl` → settings `backend=wsl`
/// → 默认 local。distro/installDir 字段级优先：
/// env（`DSH_TAURI_WSL_DISTRO` / `DSH_DESKTOP_WSL_DISTRO` / `DSH_DESKTOP_WSL_DIR`）
/// > settings 扁平键 > 旧嵌套键（wsl_settings_load 三方同键）。
pub fn detect_backend_mode(
    env: &dyn Fn(&str) -> Option<String>,
    settings: &serde_json::Map<String, serde_json::Value>,
) -> BackendCfg {
    let env_str = |k: &str| -> String { env(k).unwrap_or_default().trim().to_string() };
    let flat = |k: &str| -> Option<String> {
        settings.get(k).and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    };
    // 旧嵌套键（0.5.0 早期形态）迁移读取：扁平键优先。
    let legacy = settings.get("wslBackend").and_then(|v| v.as_object()).cloned();
    let legacy_str = |k: &str| -> Option<String> {
        legacy.as_ref().and_then(|o| o.get(k)).and_then(|v| v.as_str()).map(String::from)
    };
    if !cfg!(windows) {
        return BackendCfg { backend: "local".into(), distro: String::new(), install_dir: String::new(), simulated: false };
    }
    let distro = [
        env_str("DSH_TAURI_WSL_DISTRO"),
        env_str("DSH_DESKTOP_WSL_DISTRO"),
        flat("wslDistro").unwrap_or_default(),
        legacy_str("wslDistro").unwrap_or_default(),
    ]
    .into_iter()
    .find(|s| !s.is_empty())
    .unwrap_or_default();
    let install_dir = [
        env_str("DSH_DESKTOP_WSL_DIR"),
        flat("wslInstallDir").unwrap_or_default(),
        legacy_str("wslInstallDir").unwrap_or_default(),
    ]
    .into_iter()
    .find(|s| !s.is_empty())
    .unwrap_or_default();
    let env_backend = env_str("DSH_DESKTOP_BACKEND").to_ascii_lowercase();
    if env_backend == "local" {
        return BackendCfg { backend: "local".into(), distro, install_dir, simulated: false };
    }
    let sim = matches!(env_str("DSH_WSL_MODE").to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "wsl");
    if sim || env_backend == "wsl" {
        return BackendCfg { backend: "wsl".into(), distro, install_dir, simulated: sim && env_backend != "wsl" };
    }
    // 扁平键 backend **存在即权威**（哪怕值是 local——旧嵌套键整体让位）；
    // 缺失时才回落旧嵌套键（backend/mode 两代字段名）。
    let backend_is_wsl = match flat("backend") {
        Some(b) => b == "wsl",
        None => {
            legacy_str("backend").as_deref() == Some("wsl") || legacy_str("mode").as_deref() == Some("wsl")
        }
    };
    if backend_is_wsl {
        return BackendCfg { backend: "wsl".into(), distro, install_dir, simulated: false };
    }
    BackendCfg { backend: "local".into(), distro, install_dir, simulated: false }
}

/// settings map 形态的便捷封装（commands/wsl.rs 与 supervisor 共用：settings
/// 加载属配置域，`detect_backend_mode` 为唯一实现）。
pub fn detect_backend_mode_from_map(map: &serde_json::Map<String, serde_json::Value>) -> BackendCfg {
    detect_backend_mode(&|k| std::env::var(k).ok(), map)
}

// ---------------------------------------------------------------------------
// WslBackend（运行态）
// ---------------------------------------------------------------------------

/// configure 探测链选项（含调试/测试覆盖缝，与 JS resolveWslBackend 同名键）。
#[derive(Debug, Clone, Default)]
pub struct ConfigureOpts {
    /// 显式 distro（空 = 自动检测：首个非 docker-desktop 系）。
    pub distro: String,
    /// 显式 installDir（空/`~` 前缀 = 经 $HOME 解析展开）。
    pub install_dir: String,
    /// DSH_TAURI_WSL_UNC_HOST：UNC 主机覆盖（wsl.localhost|wsl$）。
    pub unc_host_override: Option<String>,
    /// DSH_TAURI_WSL_HOME：跳过 WSL 内 $HOME 探测（测试/调试缝）。
    pub wsl_home_override: Option<String>,
    /// DSH_TAURI_WSL_UNC_HOME：UNC home 整体覆盖（自描述反解 installDir）。
    pub unc_home_override: Option<String>,
}

impl ConfigureOpts {
    /// 从环境变量读取覆盖缝（生产入口）。
    pub fn from_env(distro: &str, install_dir: &str) -> Self {
        let env = |k: &str| std::env::var(k).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        Self {
            distro: distro.trim().to_string(),
            install_dir: install_dir.trim().to_string(),
            unc_host_override: env("DSH_TAURI_WSL_UNC_HOST"),
            wsl_home_override: env("DSH_TAURI_WSL_HOME"),
            unc_home_override: env("DSH_TAURI_WSL_UNC_HOME"),
        }
    }
}

#[derive(Debug, Default)]
struct WslState {
    configured: bool,
    distro: String,
    install_dir: String,
    unc_dir: String,
    node_version: String,
    npm_version: String,
    last_error: String,
    /// agent 版本缓存（None = 未读；Some(None) = 读过但失败）。
    version_cache: Option<Option<String>>,
}

/// WSL 后端运行态（configure 后只读共享；可变字段在内层 Mutex）。
pub struct WslBackend {
    invoker: Arc<dyn WslInvoker>,
    state: Mutex<WslState>,
}

impl WslBackend {
    pub fn new(invoker: Arc<dyn WslInvoker>) -> Self {
        Self { invoker, state: Mutex::new(WslState::default()) }
    }

    /// configure 探测链（契约 §4.1；保存预检 / 启动解析 / recheck 共用）。
    ///
    /// 失败即 Err（code + 人话）；成功更新运行态。**绝不把 `wsl --status`
    /// 当可用性判定**（VM 起不来时 exit 0 = 假阳性，061a8ba 实证）——可用性
    /// 以 `wsl -l -q` 名单为准。
    pub fn configure(&self, opts: &ConfigureOpts) -> Result<(), WslError> {
        let mut st = self.state.lock().unwrap_or_else(|p| p.into_inner());
        st.configured = false;
        st.last_error.clear();
        // ① wsl -l -q 名单。
        let distros = self.invoker.list_distros();
        if distros.is_empty() {
            let e = WslError::new(
                E_WSL_UNAVAILABLE,
                "未检测到 WSL 发行版。请确认已安装 WSL（wsl --install），或通过设置 wslDistro 指定发行版名。",
            );
            st.last_error = e.message.clone();
            return Err(e);
        }
        // ② distro 解析：显式（须在名单内——UTF-16 残留字符形态防御）｜自动。
        let distro = if opts.distro.is_empty() {
            distros.iter().find(|d| !is_system_distro(d)).or_else(|| distros.first()).cloned().unwrap_or_default()
        } else {
            if !distros.iter().any(|d| d == &opts.distro) {
                let e = WslError::new(
                    E_WSL_UNAVAILABLE,
                    format!("配置的发行版 {} 不在本机 WSL 名单内（实测名单：{:?}）。请核对 wslDistro 设置。", opts.distro, distros),
                );
                st.last_error = e.message.clone();
                return Err(e);
            }
            opts.distro.clone()
        };
        // ③ $HOME 解析（installDir 需展开时才探测）。
        let needs_home = opts.install_dir.is_empty() || opts.install_dir.starts_with('~');
        let mut install_dir = opts.install_dir.clone();
        let mut wsl_home = opts.wsl_home_override.clone().unwrap_or_default();
        if needs_home && wsl_home.is_empty() {
            if let Some((.., linux)) = opts.unc_home_override.as_deref().and_then(spec::parse_unc) {
                // UNC 覆盖自描述：反解 installDir，免 $HOME 探测（与 JS 同式）。
                if linux != "/" {
                    install_dir = linux;
                }
            }
        }
        needs_home_and_probe(&self.invoker, &distro, &mut wsl_home, &mut install_dir, &opts.unc_home_override)?;
        // ④ installDir 归一化（§1.3 校验 + ~ 展开 + 默认值）。
        if install_dir.starts_with('~') {
            if wsl_home.is_empty() {
                let e = WslError::new(E_WSL_PROBE, format!("wslInstallDir 以 ~ 开头但 WSL $HOME 未解析: {install_dir}"));
                st.last_error = e.message.clone();
                return Err(e);
            }
            install_dir = format!("{}{}", wsl_home, &install_dir[1..]);
        }
        if !install_dir.starts_with('/') {
            let e = WslError::new(
                if install_dir.is_empty() { E_WSL_PROBE } else { E_WSL_DIR_INVALID },
                if install_dir.is_empty() {
                    "wslInstallDir 未配置且 WSL $HOME 未解析，无法落到默认 ~/.dsh-desktop".to_string()
                } else {
                    format!("wslInstallDir 必须是 WSL 内的绝对路径（以 / 或 ~ 开头）: {install_dir}")
                },
            );
            st.last_error = e.message.clone();
            return Err(e);
        }
        if spec::dir_forbidden(&install_dir) {
            let e = WslError::new(E_WSL_DIR_INVALID, format!("wslInstallDir 不能包含空白或 shell 特殊字符（$ ` ; & | < > 引号 括号）: {install_dir}"));
            st.last_error = e.message.clone();
            return Err(e);
        }
        // ⑤ node/npm 探活（登录 shell PATH 上的 fnm/nvm node 均可）。
        let node_res = self.invoker.run(&distro, "node --version", TIMEOUT_NODE);
        let npm_res = self.invoker.run(&distro, "npm --version", TIMEOUT_NODE);
        let node_version = if node_res.ok { node_res.stdout.trim().to_string() } else { String::new() };
        let npm_version = if npm_res.ok { npm_res.stdout.trim().to_string() } else { String::new() };
        if node_version.is_empty() || npm_version.is_empty() {
            let e = WslError::new(
                E_WSL_NO_NODE,
                format!(
                    "WSL 内未找到可用的 node/npm。请先在 WSL 里安装 Node.js（如 apt install nodejs npm，或 fnm/nvm），然后重启应用。\n{}{}",
                    node_res.tail(6),
                    npm_res.tail(6)
                ),
            );
            st.last_error = e.message.clone();
            return Err(e);
        }
        // ⑥ UNC 主机（wsl.localhost 优先，探测失败回落 wsl$）+ UNC 目录构造。
        let unc_host = match opts.unc_host_override.as_deref() {
            Some(h) if spec::is_unc_host(h) => h.to_string(),
            Some(h) => {
                let e = WslError::new(E_WSL_PROBE, format!("DSH_TAURI_WSL_UNC_HOST 必须是 wsl.localhost 或 wsl$: {h}"));
                st.last_error = e.message.clone();
                return Err(e);
            }
            _ => pick_unc_host(),
        };
        let unc_dir = opts
            .unc_home_override
            .clone()
            .unwrap_or_else(|| spec::unc_dir(&unc_host, &distro, &install_dir));
        st.distro = distro;
        st.install_dir = install_dir;
        st.unc_dir = unc_dir;
        st.node_version = node_version;
        st.npm_version = npm_version;
        st.configured = true;
        Ok(())
    }

    pub fn is_configured(&self) -> bool {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).configured
    }
    pub fn distro(&self) -> String {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).distro.clone()
    }
    pub fn install_dir(&self) -> String {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).install_dir.clone()
    }
    /// Windows 侧数据落点（effectiveDshHome 语义：UNC 等价路径）。
    pub fn unc_home(&self) -> PathBuf {
        PathBuf::from(self.state.lock().unwrap_or_else(|p| p.into_inner()).unc_dir.clone())
    }
    pub fn last_error(&self) -> String {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).last_error.clone()
    }

    /// 状态快照（契约 §2.1 status 对象；agentVersion 现读——配置态才探测）。
    /// 注意：先快照再探测（active_version 会再取内层锁，std Mutex 不可重入）。
    pub fn status_json(&self) -> serde_json::Value {
        let (configured, distro, install_dir, node_version, npm_version, last_error) = {
            let st = self.state.lock().unwrap_or_else(|p| p.into_inner());
            (
                st.configured,
                st.distro.clone(),
                st.install_dir.clone(),
                st.node_version.clone(),
                st.npm_version.clone(),
                st.last_error.clone(),
            )
        };
        let agent_version = if configured { self.active_version().unwrap_or_default() } else { String::new() };
        serde_json::json!({
            "configured": configured,
            "distro": distro,
            "installDir": install_dir,
            "nodeVersion": node_version,
            "npmVersion": npm_version,
            "agentVersion": agent_version,
            "lastError": last_error,
        })
    }

    /// ensure_installed（契约 §4.5；版本锚 = payload 版本，D5 决策）。
    ///
    /// 返回 `Ok(true)` = 本次执行了安装（首装/版本漂移）；`Ok(false)` = 已就位
    /// 且版本一致（幂等零安装）。失败清理 staging、保留现状、Err(E_WSL_INSTALL)。
    /// **成功判定必须含 stdout `WSL_INSTALL_OK`**（exit 0 ≠ 成功，issue #87）。
    pub fn ensure_installed(&self, target_version: &str, on_line: &mut (dyn FnMut(&str) + Send)) -> Result<bool, WslError> {
        let install_dir = self.install_dir();
        if !self.is_configured() {
            return Err(WslError::new(E_WSL_PROBE, "WSL 后端未配置（configure 未成功）"));
        }
        if !spec::version_valid(target_version) {
            return Err(WslError::new(E_WSL_INSTALL, format!("非法的目标版本号: {target_version:?}")));
        }
        // mkdir（installDir 可能是首次使用的空目录）。
        let mk = self.invoker.run(&self.distro(), &spec::mkdir_cmd(&install_dir), TIMEOUT_HOME);
        if !mk.ok {
            let e = WslError::new(E_WSL_INSTALL, format!("无法在 WSL 内创建安装目录 {install_dir}: {}", mk.tail(4)));
            self.set_last_error(&e);
            return Err(e);
        }
        // 预检：入口存在 + 版本比对。
        let check = self.invoker.run(&self.distro(), &spec::agent_check_cmd(&install_dir), TIMEOUT_VERSION);
        if check.ok {
            if let Some(v) = parse_pkg_version(&check.stdout) {
                if v == target_version {
                    return Ok(false); // 已就位且版本一致。
                }
                log_to(on_line, &format!("agent 版本漂移（{v} → {target_version}），重装对齐"));
            }
        }
        // 安装（staging + 原子切换；npm 行经 on_line 透出进度）。
        let res = self.invoker.run_with_lines(&self.distro(), &spec::install_cmd(&install_dir, target_version), TIMEOUT_INSTALL, on_line);
        if !res.ok || !res.stdout.contains("WSL_INSTALL_OK") {
            let tail = res.tail(15);
            // 清理命令必须短超时：WSL 卡死场景下不得把失败抛出拖延到不可忍受。
            let _ = self.invoker.run(&self.distro(), &spec::cleanup_staging_cmd(&install_dir), TIMEOUT_CLEANUP);
            let e = WslError::new(
                E_WSL_INSTALL,
                format!(
                    "WSL 内 npm 安装 {}@{target_version} 失败（exit={}{}）:\n{tail}",
                    spec::PKG,
                    res.code,
                    if res.timed_out { "，超时" } else { "" }
                ),
            );
            self.set_last_error(&e);
            return Err(e);
        }
        self.state.lock().unwrap_or_else(|p| p.into_inner()).version_cache = None;
        log_to(on_line, &format!("{}@{target_version} 已安装到 WSL（{install_dir}/agent）", spec::PKG));
        Ok(true)
    }

    /// 当前生效 agent 版本（WSL 内 cat package.json；失败 None 不 panic）。
    pub fn active_version(&self) -> Option<String> {
        {
            let st = self.state.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(cached) = &st.version_cache {
                return cached.clone();
            }
        }
        let install_dir = self.install_dir();
        let pkg_dir = spec::agent_pkg_dir(&install_dir);
        let res = self.invoker.run(&self.distro(), &format!("cat {pkg_dir}/package.json"), TIMEOUT_VERSION);
        let v = if res.ok { parse_pkg_version(&res.stdout) } else { None };
        self.state.lock().unwrap_or_else(|p| p.into_inner()).version_cache = Some(v.clone());
        v
    }

    /// 收割（契约 §4.6 第一层）：WSL 内按 pid 文件 kill + 删 pid 文件。
    /// 幂等（pid 文件缺失不报错）；**绝不 `wsl --terminate`**。
    pub fn stop(&self) -> bool {
        let install_dir = self.install_dir();
        let distro = self.distro();
        let res = self.invoker.run(&distro, &spec::stop_cmd(&install_dir), TIMEOUT_STOP);
        res.ok
    }

    /// 内核 spawn 命令串（`--no-open` 门控由调用方按版本决定；bind host 走白名单）。
    pub fn server_cmd(&self, no_open: bool) -> String {
        spec::server_cmd(&self.install_dir(), no_open, &self.bind_host())
    }

    /// 内核 bind 地址（#1 逃生阀）：读 `DSH_WSL_HOST`，经 [`spec::normalize_bind_host`]
    /// 白名单收口——默认 `127.0.0.1`（回环），仅显式 `0.0.0.0` 放宽到全网卡。
    fn bind_host(&self) -> String {
        let raw = std::env::var("DSH_WSL_HOST").unwrap_or_else(|_| "127.0.0.1".into());
        spec::normalize_bind_host(&raw).to_string()
    }

    /// WSL 内内核进程存活探测（探活防误杀，契约 §4.4 补充）：读 dsh.pid 并
    /// `kill -0`。true = 进程仍存活（stdout 标记 ALIVE）；探测失败/超时/无 pid
    /// 一律 false（fail-closed，调用方据此回落到原重启路径）。供 supervisor 在
    /// WSL 模式「TCP 失联但进程可能还活着（localhost 转发抖动）」时决定重启与否：
    /// 进程仍在就不换内核，让前端既有 reconnect 连回同一进程、靠 durable event 续流。
    pub fn is_server_alive(&self) -> bool {
        let distro = self.distro();
        let cmd = spec::probe_alive_cmd(&self.install_dir());
        let res = self.invoker.run(&distro, &cmd, TIMEOUT_PROBE);
        spec::parse_alive_probe(&res.stdout)
    }

    /// spawn 内核（wsl.exe 包装；Job Object 绑定与就绪行监视在 supervisor 侧）。
    pub fn spawn_server(&self, no_open: bool) -> std::io::Result<std::process::Child> {
        let distro = self.distro();
        self.invoker.spawn_server(&distro, &self.server_cmd(no_open))
    }

    fn set_last_error(&self, e: &WslError) {
        self.state.lock().unwrap_or_else(|p| p.into_inner()).last_error = e.message.clone();
    }
}

/// $HOME 探测 + 默认 installDir 落位（configure ③的内联延续）。
fn needs_home_and_probe(
    invoker: &Arc<dyn WslInvoker>,
    distro: &str,
    wsl_home: &mut String,
    install_dir: &mut String,
    unc_home_override: &Option<String>,
) -> Result<(), WslError> {
    let needs_home = install_dir.is_empty() || install_dir.starts_with('~');
    if !needs_home {
        return Ok(());
    }
    if wsl_home.is_empty() && unc_home_override.is_none() {
        let res = invoker.run(distro, "printf %s \"$HOME\"", TIMEOUT_HOME);
        let home = res.stdout.trim().to_string();
        if !res.ok || !home.starts_with('/') {
            return Err(WslError::new(E_WSL_PROBE, format!("无法解析 WSL 用户主目录: {}", res.tail(3))));
        }
        *wsl_home = home;
    }
    if install_dir.is_empty() && !wsl_home.is_empty() {
        *install_dir = format!("{wsl_home}/.dsh-desktop");
    }
    Ok(())
}

/// UNC 主机探测（wsl.localhost 优先，回落 wsl$；探测失败默认 wsl.localhost）。
fn pick_unc_host() -> String {
    for host in ["wsl.localhost", "wsl$"] {
        if std::fs::metadata(format!("\\\\{host}")).is_ok() {
            return host.to_string();
        }
    }
    "wsl.localhost".to_string()
}

fn parse_pkg_version(stdout: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(stdout.trim()).ok()?;
    v.get("version").and_then(|x| x.as_str()).map(String::from)
}

fn log_to(on_line: &mut (dyn FnMut(&str) + Send), msg: &str) {
    on_line(msg);
}

#[cfg(test)]
mod tests {
    use super::*;
    

    /// 脚本化桩：按命令串特征回放预录响应（单测注桩——design D7）。
    struct StubInvoker {
        distros: Vec<String>,
        /// (命令片段, stdout, exit_code)。
        script: Vec<(&'static str, String, i32)>,
        calls: std::sync::Mutex<Vec<String>>,
    }

    impl StubInvoker {
        fn new(distros: Vec<String>, script: Vec<(&'static str, String, i32)>) -> Self {
            Self { distros, script, calls: std::sync::Mutex::new(Vec::new()) }
        }
        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap_or_else(|p| p.into_inner()).clone()
        }
    }

    impl WslInvoker for StubInvoker {
        fn run_with_lines(
            &self,
            _distro: &str,
            cmd: &str,
            _timeout: Duration,
            on_line: &mut (dyn FnMut(&str) + Send),
        ) -> WslRunResult {
            self.calls.lock().unwrap_or_else(|p| p.into_inner()).push(cmd.to_string());
            for (frag, stdout, code) in &self.script {
                if cmd.contains(frag) {
                    for line in stdout.lines() {
                        on_line(line);
                    }
                    return WslRunResult {
                        ok: *code == 0,
                        code: *code,
                        timed_out: false,
                        stdout: stdout.clone(),
                        stderr: String::new(),
                    };
                }
            }
            WslRunResult { ok: false, code: 1, timed_out: false, stdout: String::new(), stderr: format!("未脚本化命令: {cmd}") }
        }
        fn list_distros(&self) -> Vec<String> {
            self.distros.clone()
        }
        fn spawn_server(&self, _distro: &str, _cmd: &str) -> std::io::Result<std::process::Child> {
            Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "桩不 spawn"))
        }
    }

    fn ok_script() -> Vec<(&'static str, String, i32)> {
        vec![
            ("printf %s \"$HOME\"", "/home/tester\n".into(), 0),
            ("node --version", "v20.11.0\n".into(), 0),
            ("npm --version", "10.2.4\n".into(), 0),
        ]
    }

    #[test]
    fn detect_backend_mode_matrix() {
        let env = |k: &str| -> Option<String> {
            match k {
                "DSH_TAURI_WSL_DISTRO" => Some("Debian".into()),
                _ => None,
            }
        };
        let mk = |json: &str| -> serde_json::Map<String, serde_json::Value> {
            serde_json::from_str(json).unwrap()
        };
        if cfg!(windows) {
            // settings backend=wsl。
            let cfg = detect_backend_mode(&env, &mk(r#"{"backend":"wsl","wslDistro":"Ubuntu","wslInstallDir":"~/d"}"#));
            assert_eq!(cfg.backend, "wsl");
            assert_eq!(cfg.distro, "Debian", "env distro 覆盖 settings");
            assert_eq!(cfg.install_dir, "~/d");
            // DSH_DESKTOP_BACKEND=local 显式本地压制一切。
            let env_local = |k: &str| if k == "DSH_DESKTOP_BACKEND" { Some("local".into()) } else { env(k) };
            let cfg = detect_backend_mode(&env_local, &mk(r#"{"backend":"wsl"}"#));
            assert_eq!(cfg.backend, "local");
            // DSH_WSL_MODE 模拟缝。
            let env_sim = |k: &str| if k == "DSH_WSL_MODE" { Some("1".into()) } else { None };
            let cfg = detect_backend_mode(&env_sim, &mk("{}"));
            assert_eq!((cfg.backend.as_str(), cfg.simulated), ("wsl", true));
            // 旧嵌套键（mode 字段形态）。
            let cfg = detect_backend_mode(&|_| None, &mk(r#"{"wslBackend":{"mode":"wsl","wslDistro":"Ubuntu"}}"#));
            assert_eq!((cfg.backend.as_str(), cfg.distro.as_str()), ("wsl", "Ubuntu"));
            // 默认 local。
            assert_eq!(detect_backend_mode(&|_| None, &mk("{}")).backend, "local");
        } else {
            assert_eq!(detect_backend_mode(&|_| Some("wsl".into()), &mk(r#"{"backend":"wsl"}"#)).backend, "local", "非 Windows 恒 local");
        }
    }

    /// configure 全绿：自动 distro 跳过 docker-desktop 系、~ 展开、UNC 就位
    ///（UNC 主机用覆盖缝钉死——真机探测 \\wsl.localhost 属真机清单）。
    #[test]
    fn configure_full_success_auto_distro() {
        let invoker = Arc::new(StubInvoker::new(
            vec!["docker-desktop".into(), "Ubuntu-22.04".into()],
            ok_script(),
        ));
        let b = WslBackend::new(invoker.clone());
        b.configure(&ConfigureOpts {
            install_dir: "~/.dsh-desktop".into(),
            unc_host_override: Some("wsl.localhost".into()),
            ..Default::default()
        })
        .unwrap();
        assert!(b.is_configured());
        assert_eq!(b.distro(), "Ubuntu-22.04", "自动选择跳过 docker-desktop 系");
        assert_eq!(b.install_dir(), "/home/tester/.dsh-desktop");
        assert_eq!(b.unc_home(), PathBuf::from(r"\\wsl.localhost\Ubuntu-22.04\home\tester\.dsh-desktop"));
        let st = b.status_json();
        assert_eq!(st["nodeVersion"], serde_json::json!("v20.11.0"));
        assert_eq!(st["npmVersion"], serde_json::json!("10.2.4"));
        assert_eq!(st["lastError"], serde_json::json!(""));
        // UNC host 覆盖缝（wsl$ 旧主机）。
        let b2 = WslBackend::new(invoker);
        b2.configure(&ConfigureOpts {
            install_dir: "/opt/dsh".into(),
            unc_host_override: Some("wsl$".into()),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(b2.unc_home(), PathBuf::from(r"\\wsl$\Ubuntu-22.04\opt\dsh"));
    }

    /// UNC home 整体覆盖缝（DSH_TAURI_WSL_UNC_HOME 自描述反解 installDir，
    /// 与 JS resolveWslBackend 同式——supervisor 沙箱测试的主通道）。
    #[test]
    fn configure_unc_home_override_reverse_parses_install_dir() {
        let invoker = Arc::new(StubInvoker::new(vec!["Ubuntu".into()], ok_script()));
        let b = WslBackend::new(invoker);
        b.configure(&ConfigureOpts {
            unc_home_override: Some(r"\\wsl.localhost\Ubuntu\home\u\.dsh-desktop".into()),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(b.install_dir(), "/home/u/.dsh-desktop");
        assert_eq!(b.unc_home(), PathBuf::from(r"\\wsl.localhost\Ubuntu\home\u\.dsh-desktop"));
    }

    /// configure 分支表：无发行版 / 显式不在名单 / 缺 node / $HOME 失败。
    #[test]
    fn configure_failure_branches() {
        // 无发行版 → E_WSL_UNAVAILABLE。
        let b = WslBackend::new(Arc::new(StubInvoker::new(vec![], ok_script())));
        let e = b.configure(&ConfigureOpts::default()).unwrap_err();
        assert_eq!(e.code, E_WSL_UNAVAILABLE);
        // 显式 distro 不在名单 → 配置错误（#126 防御延伸）。
        let b = WslBackend::new(Arc::new(StubInvoker::new(vec!["Ubuntu".into()], ok_script())));
        let e = b.configure(&ConfigureOpts { distro: "Debian".into(), ..Default::default() }).unwrap_err();
        assert_eq!(e.code, E_WSL_UNAVAILABLE);
        assert!(e.message.contains("Debian"));
        // 缺 node → E_WSL_NO_NODE（含 stderr 摘要）。
        let script = vec![
            ("printf %s \"$HOME\"", "/home/u\n".into(), 0),
            ("node --version", "command not found\n".into(), 127),
            ("npm --version", "10.2.4\n".into(), 0),
        ];
        let b = WslBackend::new(Arc::new(StubInvoker::new(vec!["Ubuntu".into()], script)));
        let e = b.configure(&ConfigureOpts { install_dir: "/opt/d".into(), ..Default::default() }).unwrap_err();
        assert_eq!(e.code, E_WSL_NO_NODE);
        // $HOME 解析失败（输出非 / 开头）→ E_WSL_PROBE。
        let script = vec![("printf %s \"$HOME\"", "C:\\Users\\u\n".into(), 0)];
        let b = WslBackend::new(Arc::new(StubInvoker::new(vec!["Ubuntu".into()], script)));
        let e = b.configure(&ConfigureOpts::default()).unwrap_err();
        assert_eq!(e.code, E_WSL_PROBE);
        // 非法目录（shell 元字符）→ E_WSL_DIR_INVALID。
        let b = WslBackend::new(Arc::new(StubInvoker::new(vec!["Ubuntu".into()], ok_script())));
        let e = b.configure(&ConfigureOpts { install_dir: "/opt/d;sh".into(), ..Default::default() }).unwrap_err();
        assert_eq!(e.code, E_WSL_DIR_INVALID);
    }

    /// ensure_installed：已装且版本齐 → 零安装调用（幂等）。
    #[test]
    fn ensure_installed_idempotent_when_version_matches() {
        let script = vec![
            ("printf %s \"$HOME\"", "/home/u\n".into(), 0),
            ("node --version", "v20.11.0\n".into(), 0),
            ("npm --version", "10.2.4\n".into(), 0),
            ("mkdir -p", "".into(), 0),
            ("test -f", r#"{"name":"@deepseek-ai/dsh","version":"0.1.1-rc.1"}"#.into(), 0),
        ];
        let invoker = Arc::new(StubInvoker::new(vec!["Ubuntu".into()], script));
        let b = WslBackend::new(invoker.clone());
        b.configure(&ConfigureOpts { install_dir: "/opt/d".into(), ..Default::default() }).unwrap();
        let mut lines = Vec::new();
        assert!(!b.ensure_installed("0.1.1-rc.1", &mut |l| lines.push(l.to_string())).unwrap(), "版本一致时零安装");
        assert!(!invoker.calls().iter().any(|c| c.contains("npm install")), "不得发 npm install");
        assert!(!invoker.calls().iter().any(|c| c.contains("agent-staging")), "不得动 staging");
    }

    /// ensure_installed：版本漂移 / 缺失 → install_cmd（payload 版本锚）。
    #[test]
    fn ensure_installed_reinstalls_on_drift_or_missing() {
        for (check_out, check_code) in [
            (r#"{"name":"@deepseek-ai/dsh","version":"0.1.0-rc.8"}"#.to_string(), 0), // 漂移
            (String::new(), 1), // 缺失
            ("not json at all".to_string(), 0), // 坏 JSON → 视同缺失
        ] {
            let script = vec![
                ("printf %s \"$HOME\"", "/home/u\n".into(), 0),
                ("node --version", "v20.11.0\n".into(), 0),
                ("npm --version", "10.2.4\n".into(), 0),
                // 注意顺序：install_cmd 同时含 "npm install" 与 "test -f"，
                // npm install 条目必须排在 test -f 之前（首个命中胜出）。
                ("npm install", "...npm 进度行...\nWSL_INSTALL_OK\n".into(), 0),
                ("mkdir -p", "".into(), 0),
                ("test -f", check_out, check_code),
            ];
            let invoker = Arc::new(StubInvoker::new(vec!["Ubuntu".into()], script));
            let b = WslBackend::new(invoker.clone());
            b.configure(&ConfigureOpts { install_dir: "/opt/d".into(), ..Default::default() }).unwrap();
            let mut lines = Vec::new();
            assert!(b.ensure_installed("0.1.1-rc.1", &mut |l| lines.push(l.to_string())).unwrap(), "应执行安装");
            let calls = invoker.calls();
            let install_call = calls.iter().find(|c| c.contains("npm install")).expect("install_cmd 应发出").clone();
            assert!(install_call.contains("@deepseek-ai/dsh@0.1.1-rc.1"), "版本锚=payload 版本: {install_call}");
            assert!(install_call.contains("WSL_INSTALL_OK"));
            assert!(lines.iter().any(|l| l.contains("npm 进度行")), "npm 行经 on_line 透出");
        }
    }

    /// ensure_installed：exit 0 但无 WSL_INSTALL_OK 标记 = 失败（issue #87 锚点）
    /// → 清理 staging + 现状保留。
    #[test]
    fn ensure_installed_exit0_without_marker_fails_and_cleans() {
        let script = vec![
            ("printf %s \"$HOME\"", "/home/u\n".into(), 0),
            ("node --version", "v20.11.0\n".into(), 0),
            ("npm --version", "10.2.4\n".into(), 0),
            ("mkdir -p", "".into(), 0),
            ("test -f", String::new(), 1),
            ("npm install", "静默成功假象（无标记）\n".into(), 0),
            ("rm -rf", "".into(), 0),
        ];
        let invoker = Arc::new(StubInvoker::new(vec!["Ubuntu".into()], script));
        let b = WslBackend::new(invoker.clone());
        b.configure(&ConfigureOpts { install_dir: "/opt/d".into(), ..Default::default() }).unwrap();
        let e = b.ensure_installed("0.1.1-rc.1", &mut |_| {}).unwrap_err();
        assert_eq!(e.code, E_WSL_INSTALL);
        assert!(invoker.calls().iter().any(|c| c.contains("rm -rf /opt/d/agent-staging")), "失败须清理 staging");
    }

    /// stop：pid 文件缺失也发命令（幂等）且绝不含 terminate。
    #[test]
    fn stop_is_idempotent_and_never_terminates() {
        let mut script = ok_script();
        script.push(("p=", "ok\n".to_string(), 0));
        let invoker = Arc::new(StubInvoker::new(vec!["Ubuntu".into()], script));
        let b = WslBackend::new(invoker.clone());
        b.configure(&ConfigureOpts { install_dir: "/opt/d".into(), ..Default::default() }).unwrap();
        assert!(b.stop());
        let calls = invoker.calls();
        let stop_call = calls.iter().find(|c| c.starts_with("p=")).expect("stop_cmd 应发出");
        assert!(!stop_call.contains("--terminate") && !stop_call.contains("--shutdown"), "绝不 wsl --terminate/--shutdown");
    }

    /// active_version：坏 JSON → None 不 panic。
    #[test]
    fn active_version_bad_json_is_none() {
        let script = vec![
            ("printf %s \"$HOME\"", "/home/u\n".into(), 0),
            ("node --version", "v20.11.0\n".into(), 0),
            ("npm --version", "10.2.4\n".into(), 0),
            ("cat", "garbage {{{".into(), 0),
        ];
        let b = WslBackend::new(Arc::new(StubInvoker::new(vec!["Ubuntu".into()], script)));
        b.configure(&ConfigureOpts { install_dir: "/opt/d".into(), ..Default::default() }).unwrap();
        assert!(b.active_version().is_none());
    }

    /// server_cmd 形态经运行态产出（install_dir 注入 + no_open 门控）。
    #[test]
    fn server_cmd_from_backend_state() {
        let b = WslBackend::new(Arc::new(StubInvoker::new(vec!["Ubuntu".into()], ok_script())));
        b.configure(&ConfigureOpts { install_dir: "/opt/d".into(), ..Default::default() }).unwrap();
        let cmd = b.server_cmd(true);
        assert!(cmd.starts_with("cd /opt/d && rm -f dsh.pid"));
        assert!(cmd.ends_with("web --no-open --host 127.0.0.1 --port 0"));
    }

    // ---- SliceBudget：中断时钟语义（S2 P1-A 修复的回归锚点）----

    /// 预算只由真实轮询分片消耗：90s 预算 = 1800 分片，第 1799 轮仍 Continue、
    /// 第 1800 轮 Kill——**分片计数驱动，与时钟读数无关**（挂钟/QPC 跳变不可见，
    /// 系统睡眠期间 sleep 暂停、分片不推进）。
    #[test]
    fn slice_budget_consumes_only_real_slices() {
        let mut b = SliceBudget::new(TIMEOUT_NODE); // 90s = 1800 分片。
        for i in 1..=1800u64 {
            assert_eq!(b.on_slice(), BudgetAction::Continue, "第 {i} 轮不得提前 Kill");
        }
        assert_eq!(b.on_slice(), BudgetAction::Kill, "1800 分片耗尽后的下一轮才 Kill");
    }

    /// 睡眠跳变形态证明（对照 S2 旧 P1：`Instant::now() >= deadline` 逐轮重估
    /// 在唤醒瞬间误杀）：预算状态机无任何时钟输入——两个 on_slice() 之间
    /// 挂钟跳 1h 与跳 50ms 行为完全一致（都只算一个分片）。30min 安装预算
    /// 内合盖 85s 不再触发超时。
    #[test]
    fn slice_budget_invisible_to_clock_jumps() {
        // 30min = 36000 分片：清醒 5s（100 分片）后「睡眠 1h 再唤醒」——状态机
        // 视角与连续运行无差别，剩余 35900 分片。
        let mut b = SliceBudget::new(TIMEOUT_INSTALL);
        for _ in 0..100 {
            assert_eq!(b.on_slice(), BudgetAction::Continue);
        }
        // 唤醒后继续：剩余预算照常可用（36000 - 100 轮 Continue 后 Kill）。
        for i in 0..(36_000 - 100) {
            assert_eq!(b.on_slice(), BudgetAction::Continue, "唤醒后第 {i} 轮继续用剩余预算");
        }
        assert_eq!(b.on_slice(), BudgetAction::Kill, "真实清醒分片累计耗尽才超时");
    }

    /// kill 后收尸宽限：100 分片 Continue 后 Abandon；零预算立即 Kill。
    #[test]
    fn slice_budget_grace_and_zero_timeout() {
        let mut b = SliceBudget::new(Duration::ZERO);
        assert_eq!(b.on_slice(), BudgetAction::Kill, "零预算首轮即 Kill");
        for i in 1..KILL_GRACE_SLICES {
            assert_eq!(b.on_slice(), BudgetAction::Continue, "宽限第 {i} 轮");
        }
        assert_eq!(b.on_slice(), BudgetAction::Abandon, "宽限 100 分片耗尽放弃收尸");
        // 不足一个分片的预算向上取整为 1 分片（首轮 Continue、次轮 Kill）。
        let mut tiny = SliceBudget::new(Duration::from_millis(30));
        assert_eq!(tiny.on_slice(), BudgetAction::Continue);
        assert_eq!(tiny.on_slice(), BudgetAction::Kill);
    }

    /// 源码形态锚点：run_with_lines 必须是分片预算形态、不得回退 QPC deadline。
    #[test]
    fn run_with_lines_slice_budget_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        // 锚定生产实现段（impl 块；trait 声明里也有同名签名，跳过第一个）。
        let seg = src
            .split("impl WslInvoker for RealWslInvoker")
            .nth(1)
            .and_then(|s| s.split("fn list_distros").next())
            .expect("RealWslInvoker::run_with_lines 段");
        assert!(seg.contains("SliceBudget::new(timeout)"), "超时必须走分片预算状态机");
        assert!(seg.contains("std::thread::sleep(POLL_SLICE)"), "轮询节拍必须是相对 sleep（中断时钟）");
        assert!(!seg.contains("Instant::now() + timeout"), "不得回退 QPC deadline（S2 P1-A：睡眠唤醒误杀）");
        assert!(!seg.contains("Instant::now() >="), "不得逐轮重估 Instant");
    }
}

// ---------------------------------------------------------------------------
// TA1 测试加固门（用户批准的最小 cfg(test)] 门）：仅测试构建链接单元测试
// 文件（需访问私有 SliceBudget/BudgetAction 状态机）。纯追加，零生产改动。
// ---------------------------------------------------------------------------
#[cfg(test)]
#[path = "ta1_slice_budget_tests.rs"]
mod ta1_slice_budget_tests;
