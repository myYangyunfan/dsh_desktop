//! 应用运行态状态机（boot 时序的规范载体）。
//!
//! 契约（data-flow.md §3）：
//! ```text
//! Boot → Repair → Sync → Patch → Spawn → Ready
//!                 │（崩溃环触发）│
//!                 ▼              ▼
//!             CrashLoop ←────────┘ → Recovery
//! ```
//! 状态迁移只能沿上述边进行；非法迁移返回原状态（保守，不 panic）。

/// 运行态。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunState {
    /// 启动初始化（单实例锁 / 路径解析）。
    Boot,
    /// sidecar：损坏 manifest/home patch 自愈。
    Repair,
    /// sidecar：伴随插件同步。
    Sync,
    /// sidecar：22 个文本手术（幂等）。
    Patch,
    /// preflight + spawn 内核 + 等就绪行。
    Spawn,
    /// Web UI 就绪，主窗已换页。
    Ready,
    /// 崩溃环触发，进入恢复页。
    CrashLoop,
    /// 恢复页（用户选择重载 / 重启 / 看日志）。
    Recovery,
    /// 退出清理中。
    Shutdown,
}

impl RunState {
    /// 迁移表。返回 `Err(理由)` 表示非法迁移。
    pub fn can_transition_to(self, next: RunState) -> Result<(), &'static str> {
        use RunState::*;
        let ok = matches!(
            (self, next),
            (Boot, Repair)
                | (Repair, Sync)
                | (Sync, Patch)
                | (Patch, Spawn)
                | (Spawn, Ready)
                | (Spawn, CrashLoop)
                | (Ready, CrashLoop)
                | (Ready, Spawn)          // restartService 原地重启
                | (CrashLoop, Recovery)
                | (Recovery, Boot)
                | (Recovery, Shutdown)
                | (Ready, Shutdown)
                | (Boot, Shutdown)        // 早期失败直接退出
                | (Spawn, Shutdown)
                | (CrashLoop, Shutdown)
        );
        if ok {
            Ok(())
        } else {
            Err("illegal run-state transition")
        }
    }

    /// 是否处于「内核进程可能存活」的状态（退出路径需要杀树）。
    pub fn kernel_may_live(self) -> bool {
        matches!(self, RunState::Spawn | RunState::Ready | RunState::CrashLoop)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_path_order() {
        use RunState::*;
        for (a, b) in [(Boot, Repair), (Repair, Sync), (Sync, Patch), (Patch, Spawn), (Spawn, Ready)] {
            assert!(a.can_transition_to(b).is_ok(), "{a:?}→{b:?} 应合法");
        }
    }

    #[test]
    fn crash_and_recovery_edges() {
        use RunState::*;
        assert!(Spawn.can_transition_to(CrashLoop).is_ok());
        assert!(Ready.can_transition_to(CrashLoop).is_ok());
        assert!(CrashLoop.can_transition_to(Recovery).is_ok());
        assert!(Recovery.can_transition_to(Boot).is_ok());
        assert!(Ready.can_transition_to(Spawn).is_ok(), "restartService 需要此边");
    }

    #[test]
    fn illegal_edges_rejected() {
        use RunState::*;
        assert!(Boot.can_transition_to(Ready).is_err());
        assert!(Repair.can_transition_to(Spawn).is_err(), "必须先 Sync+Patch");
        assert!(Sync.can_transition_to(Sync).is_err());
    }

    #[test]
    fn kernel_alive_states() {
        assert!(!RunState::Boot.kernel_may_live());
        assert!(RunState::Ready.kernel_may_live());
        assert!(RunState::CrashLoop.kernel_may_live());
    }
}
