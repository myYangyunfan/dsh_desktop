//! Windows Job Object：父进程死亡 → OS 收割内核进程树。
//!
//! **为什么必须**：taskkill /F 强杀壳进程时，任何用户态清理钩子
//! （RunEvent::Exit / Drop）都不会执行，内核成为孤儿（Review#2 实测抓到：
//! 63283 端口 LISTENING 残留）。Job Object + KILL_ON_JOB_CLOSE 是 OS 级保证：
//! 壳进程句柄表关闭（无论正常退出还是强杀）→ 内核树全部终结。
//!
//! **句柄生命周期（性能审计 2026-08 修正）**：句柄由调用方持有（随内核
//! 存活），内核终结时关闭——原实现每次 spawn 故意泄漏一个句柄（注释称
//! 「随本进程句柄表关闭触发收割」），崩溃环/自动重启/瀑布重试下每天可累积
//! 上千句柄。语义不变：壳存活期间句柄在场（强杀兜底有效）；内核已终结后
//! 关闭只是释放内核对象（Job 内已无进程，KILL_ON_JOB_CLOSE 无从触发）。

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
        JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// 活跃 Job 句柄计数（泄漏回归锚点：assign +1 / close -1；
    /// 测试断言 spawn/kill 循环后计数回基线）。
    pub static LIVE_JOBS: AtomicUsize = AtomicUsize::new(0);

    /// 杀树 Job 句柄：内核存活期间持有，终结后 Drop 关闭。
    /// （usize 承载原始 HANDLE 以获得 Send——句柄跨线程移交给 supervisor。）
    #[derive(Debug)]
    pub struct JobHandle(usize);

    /// 将子进程纳入杀树 Job。失败时调用方用 [`JobHandle::noop`] 降级
    /// （杀树退回显式 taskkill 路径，不阻断启动）。
    pub fn assign_child_to_kill_on_close_job(child: &std::process::Child) -> Result<JobHandle, String> {
        use std::os::windows::io::AsRawHandle;
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err("CreateJobObjectW 失败".into());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                return Err("SetInformationJobObject(KILL_ON_JOB_CLOSE) 失败".into());
            }
            let proc = child.as_raw_handle() as HANDLE;
            if AssignProcessToJobObject(job, proc) == 0 {
                return Err("AssignProcessToJobObject 失败（杀树保护未生效）".into());
            }
            LIVE_JOBS.fetch_add(1, Ordering::Relaxed);
            Ok(JobHandle(job as usize))
        }
    }

    impl JobHandle {
        /// 降级空句柄（赋值失败路径：杀树走显式 taskkill）。
        pub fn noop() -> Self {
            JobHandle(0)
        }

        /// 关闭句柄（幂等）。应在内核进程终结后调用（Drop 兜底同语义）。
        pub fn close(&mut self) {
            if self.0 != 0 {
                unsafe { CloseHandle(self.0 as HANDLE); }
                LIVE_JOBS.fetch_sub(1, Ordering::Relaxed);
                self.0 = 0;
            }
        }
    }

    impl Drop for JobHandle {
        fn drop(&mut self) {
            self.close();
        }
    }

    /// 当前活跃 Job 句柄数（测试泄漏断言用）。
    pub fn live_jobs() -> usize {
        LIVE_JOBS.load(Ordering::Relaxed)
    }
}

#[cfg(windows)]
pub use imp::{assign_child_to_kill_on_close_job, live_jobs, JobHandle};

#[cfg(not(windows))]
/// 非 Windows 空壳（保持现状，无 OS 句柄可建）。Unix 侧的进程树收割语义
/// 由**进程组**承担：spawn 时设内核为进程组长（`kill_tree::
/// set_process_group_leader`，子孙天然继承 PGID）+ 显式退出/重启路径
/// `killpg(-pgid, SIGKILL)`（`kill_tree::kill_tree`）。注意进程组与 Job
/// Object 的边界差异：Job Object 连「壳被第三方强杀」都能兜（句柄表关闭即
/// 收割）；进程组只覆盖显式 kill 路径——壳本身被 SIGKILL 时内核组不随父
/// 死，属 Unix 已知边界（本次修复目标是「退出应用杀不干净」，显式路径
/// 已全覆盖）。
pub mod imp {
    /// 空句柄（无 OS 对象可管）。
    pub struct JobHandle;

    impl JobHandle {
        pub fn noop() -> Self {
            JobHandle
        }
        pub fn close(&mut self) {}
    }

    pub fn assign_child_to_kill_on_close_job(_child: &std::process::Child) -> Result<JobHandle, String> {
        Ok(JobHandle)
    }

    pub fn live_jobs() -> usize {
        0
    }
}

#[cfg(not(windows))]
pub use imp::{assign_child_to_kill_on_close_job, live_jobs, JobHandle};

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn child_can_be_assigned() {
        // ping 是长命子进程，赋 job 后立即杀——验证赋值路径不报错。
        let mut child = Command::new("cmd")
            .args(["/C", "pause"])
            .spawn()
            .expect("spawn");
        let r = assign_child_to_kill_on_close_job(&child);
        let _ = child.kill();
        let _ = child.wait();
        assert!(r.is_ok(), "Job Object 赋值应成功: {r:?}");
    }

    /// 句柄泄漏回归锚点（性能审计 2026-08）：assign→close 循环后活跃计数
    /// 必须回基线——原实现每次 assign 泄漏一个句柄（进程生命周期内不回收，
    /// 崩溃环/瀑布重试下累积上千）。
    #[test]
    fn handle_count_returns_to_baseline_after_cycles() {
        let baseline = live_jobs();
        let mut handles = Vec::new();
        for _ in 0..20 {
            let mut child = Command::new("cmd").args(["/C", "exit 0"]).spawn().expect("spawn");
            handles.push(assign_child_to_kill_on_close_job(&child).expect("assign"));
            let _ = child.wait();
        }
        assert_eq!(live_jobs(), baseline + 20, "assign 后计数 +20");
        for mut h in handles {
            h.close();
        }
        assert_eq!(live_jobs(), baseline, "全部 close 后计数必须回基线（句柄不泄漏）");
        // Drop 兜底路径：不显式 close，drop 时关闭。
        let mut child = Command::new("cmd").args(["/C", "exit 0"]).spawn().expect("spawn");
        let h = assign_child_to_kill_on_close_job(&child).expect("assign");
        let _ = child.wait();
        drop(h);
        assert_eq!(live_jobs(), baseline, "Drop 必须兜底关闭句柄");
    }
}
