//! 有界子进程执行（超时强杀整树）。
//!
//! 性能审计 2026-08 根因收口：壳内子进程派生（sidecar 转发 / boot 链辅助）
//! 此前一律 `.output()` 无超时——AV/SmartScreen 把子进程拦到半死时（D2 诊断
//! 记录的形态族），调用线程永挂：
//! - 调用线程是 UI 主线程（同步 Tauri 命令）= 整窗冻结（不可拖动/不可 repaint）；
//! - boot 线程 = loading 页直到 5 分钟看门狗兜底（且挂死的子进程本身没人杀）；
//! - 串行锁持有者（run_sidecar 的 SIDECAR_LOCK）= 后续全部 sidecar 命令排队。
//!
//! 本模块是壳内子进程的唯一有界出口：超时按失败处理并杀整树（子进程可能
//! 再派生孙进程——复用 kernel-process 的跨平台杀树：Windows taskkill /T /F，
//! Unix killpg），不留半死进程占资源。stdout/stderr 由读线程先行排空，
//! 防管道写满把子进程卡死在半途（经典死锁形态）。

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// 有界执行结果。
pub struct BoundedOutput {
    /// 子进程完整输出；`None` = 超时被杀（超时路径只关心失败事实，部分输出丢弃）。
    pub output: Option<std::process::Output>,
    /// 是否超时被杀。
    pub timed_out: bool,
}

/// 读线程：把管道排空进缓冲（管道容量 ~64KB，不排空会阻塞子进程写入）。
fn pipe_reader(pipe: Option<Box<dyn Read + Send>>) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut p) = pipe {
            let _ = p.read_to_end(&mut buf);
        }
        buf
    })
}

/// 有界执行：`timeout` 内未退出 → 杀整树并按超时失败返回。
pub fn output_with_timeout(cmd: &mut Command, timeout: Duration) -> std::io::Result<BoundedOutput> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(Stdio::null());
    let mut child = cmd.spawn()?;
    let pid = child.id();
    let out_thread = pipe_reader(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let err_thread = pipe_reader(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));

    let deadline = Instant::now() + timeout;
    let mut timed_out = false;
    let status = loop {
        match child.try_wait()? {
            Some(st) => break Some(st),
            None => {
                if Instant::now() >= deadline {
                    timed_out = true;
                    break None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        }
    };
    if timed_out {
        kernel_process::kill_tree(&mut child, pid);
    }
    let stdout = out_thread.join().unwrap_or_default();
    let stderr = err_thread.join().unwrap_or_default();
    let output = status.map(|st| std::process::Output { status: st, stdout, stderr });
    Ok(BoundedOutput { output, timed_out })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 挂死子进程：超时被杀、及时返回（有界锚点——旧行为是永挂）。
    #[test]
    fn hung_child_is_killed_at_deadline() {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "ping -n 30 127.0.0.1 >nul"]).creation_flags_no_window_for_test();
        let t0 = Instant::now();
        let r = output_with_timeout(&mut cmd, Duration::from_millis(400)).expect("执行");
        assert!(r.timed_out, "挂死子进程必须判超时");
        assert!(!matches!(&r.output, Some(o) if o.status.success()));
        assert!(t0.elapsed() < Duration::from_secs(5), "超时须及时返回（实测 {:?}）", t0.elapsed());
    }

    /// 正常路径：成功 / 非零退出码 / 输出捕获。
    #[test]
    fn success_and_nonzero_exit() {
        let mut ok = Command::new("cmd");
        ok.args(["/C", "echo hello"]).creation_flags_no_window_for_test();
        let r = output_with_timeout(&mut ok, Duration::from_secs(10)).expect("执行");
        assert!(matches!(&r.output, Some(o) if o.status.success()) && !r.timed_out);
        let out = r.output.expect("完整输出");
        assert!(String::from_utf8_lossy(&out.stdout).contains("hello"));

        let mut bad = Command::new("cmd");
        bad.args(["/C", "exit 3"]).creation_flags_no_window_for_test();
        let r2 = output_with_timeout(&mut bad, Duration::from_secs(10)).expect("执行");
        assert!(matches!(&r2.output, Some(o) if !o.status.success()) && !r2.timed_out);
        assert_eq!(r2.output.unwrap().status.code(), Some(3));
    }

    /// 大输出不死锁：2MB stdout（远超管道容量）完整捕获——读线程排空证明。
    #[test]
    fn large_output_does_not_deadlock() {
        let dir = std::env::temp_dir().join(format!("dsh-bounded-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("big.txt");
        std::fs::write(&file, "x".repeat(2 * 1024 * 1024)).unwrap();
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "type", &file.to_string_lossy()]).creation_flags_no_window_for_test();
        let r = output_with_timeout(&mut cmd, Duration::from_secs(30)).expect("执行");
        assert!(matches!(&r.output, Some(o) if o.status.success()), "2MB 输出不得死锁（读线程须排空管道）");
        assert_eq!(r.output.unwrap().stdout.len() >= 2 * 1024 * 1024, true, "输出完整捕获");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 测试辅助：与生产同口径的 CREATE_NO_WINDOW（Windows）。
    trait NoWindowForTest {
        fn creation_flags_no_window_for_test(&mut self) -> &mut Self;
    }
    #[cfg(windows)]
    impl NoWindowForTest for Command {
        fn creation_flags_no_window_for_test(&mut self) -> &mut Self {
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x0800_0000)
        }
    }
    #[cfg(not(windows))]
    impl NoWindowForTest for Command {
        fn creation_flags_no_window_for_test(&mut self) -> &mut Self {
            self
        }
    }
}
