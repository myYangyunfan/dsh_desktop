//! 桥 command 全量实现（contracts/ipc-commands.md §2.1-2.3 的 Tauri 侧）。
//!
//! 按领域拆分为子模块，本文件是门面（re-export）：对外（lib.rs 的
//! `generate_handler` 注册与 crate 内调用方）统一走 `commands::name` 路径，
//! 拆分不改变任何 IPC 命令签名。分三类：
//! 1. 壳内实现（窗口/恢复/剪贴板/外部打开/文件围栏/浮窗/赞助）；
//! 2. sidecar 转发（插件管理六通道 + 诊断备份族——`run_sidecar`）；
//! 3. 已裁撤（内核更新链——不注册，垫片报错）；
//! 4. guard 交互面（插件保护中心 `guard:action` 分发——读面/轻量解，经 supervisor）。
//!
//! 子模块清单：
//! - [`lifecycle`] —— Phase 1 核心：app_init / 剪贴板 / 外部打开 / 心跳 / 会话 / 重启服务
//! - [`window`]    —— 窗口族：window_control / 浮窗 / 赞助
//! - [`menu`]      —— ⋯ 菜单动作分发 + 设置开关 + 客户端更新检查/安装（双源 releases
//!   链见 [`updater_client`]；npm 内核比对已随 v0.5.3 退役）
//! - [`recovery`]  —— 恢复页四件套
//! - [`sidecar`]   —— sidecar 转发族：插件管理六通道 + 诊断 / 备份
//! - [`file`]      —— 文件域：file_open（fence 围栏）
//! - [`wsl`]       —— WSL 配置三通道
//! - [`acp`]       —— ACP 托管族：自检（initialize 握手）+ Zed 配置片段导出（托盘入口）
//! - [`common`]    —— 共享 OS / 编码 / 时间小工具

pub mod dsh_cli;
mod common;
mod file;
mod guard;
pub(crate) mod icon;
mod lifecycle;
mod menu;
mod recovery;
mod sidecar;
mod window;
mod wsl;
pub mod updater_client;
/// ACP 托管族：不注册 bridge command（托盘菜单直调），路径引用即可。
pub mod acp;

// 注意：必须用 glob re-export。`#[tauri::command]` 会随函数生成隐藏项
// `__cmd__<name>`（generate_handler! 依赖 `commands::__cmd__*` 路径），
// 具名 re-export 只带出函数本体，glob 才能把隐藏项一并带出门面。
pub use common::*;
pub use file::*;
pub use guard::*;
pub use lifecycle::*;
pub use menu::*;
pub use recovery::*;
pub use sidecar::*;
pub use window::*;
pub use wsl::*;
