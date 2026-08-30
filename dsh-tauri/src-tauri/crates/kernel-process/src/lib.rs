//! # kernel-process —— 内核进程保姆（纯逻辑）
//!
//! 对齐 Electron 版 `main.js` 的 startServer / watchServerProc / 崩溃环 / 端口稳定化。
//! 契约：`dsh-tauri/contracts/data-flow.md` §3（boot 时序步骤 [4][5][7]）。
//!
//! 不依赖 tauri；`spawn` 与 `kill_tree` 的 OS 绑定已接入（Windows Job
//! Object + taskkill；Unix 进程组长 + killpg）：
//!
//! - [`ready_line`]      —— `dsh web: https://...` 就绪行流式解析（跨 chunk 缓冲）
//! - [`crash_loop`]      —— 崩溃环判定（窗口 + 次数 + 冷却）
//! - [`job_object`]      —— Windows Job Object（父死 OS 收割；Unix 空壳，见模块注释）
//! - [`kill_tree`]       —— 跨平台杀树（Windows taskkill /T /F；Unix killpg 整组）
//! - [`port`]            —— 安全端口选择（绑 127.0.0.1:0 探测 + Chromium 不安全端口表）
//! - [`spawn_spec`]      —— spawn 参数构造（`--no-open` 按内核版本门控，rc.8 起必需）
//! - [`node_resolve`]    —— Node 三级解析链（系统 PATH ≥22 → 内置 vendor → None）
//! - [`semver`]          —— 内核版本比较（比较 rc 前缀等 dsh 特有形态）

pub mod crash_loop;
pub mod job_object;
pub mod kill_tree;
pub mod node_resolve;
pub mod port;
pub mod ready_line;
pub mod semver;
pub mod spawn_spec;

pub use crash_loop::CrashLoopDetector;
pub use kill_tree::kill_tree;
pub use node_resolve::{resolve_node, NodeProbe, RealNodeProbe, ResolvedNode};
pub use port::choose_stable_port;
pub use ready_line::ReadyLineParser;
pub use spawn_spec::{sanitized_node_command, SpawnSpec};
