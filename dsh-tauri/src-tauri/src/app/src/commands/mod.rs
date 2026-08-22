//! 桥 command 全量实现（contracts/ipc-commands.md §2.1-2.3 的 Tauri 侧）。
//!
//! 按领域拆分为子模块，本文件是门面（re-export）：对外（lib.rs 的
//! `generate_handler` 注册与 crate 内调用方）统一走 `commands::name` 路径，
//! 拆分不改变任何 IPC 命令签名。分三类：
//! 1. 壳内实现（窗口/恢复/剪贴板/外部打开/文件围栏/宠物窗/浮窗/赞助）；
//! 2. sidecar 转发（插件管理六通道 + 诊断备份族——`run_sidecar`）；
//! 3. 已裁撤（内核更新链 guard:action——不注册，垫片报错）。
//!
//! 子模块清单：
//! - [`lifecycle`] —— Phase 1 核心：app_init / 剪贴板 / 外部打开 / 心跳 / 会话 / 重启服务
//! - [`balance`]   —— 余额数据生产链：sidecar balance-fetch 轮询环 + balance_refresh 触发
//! - [`window`]    —— 窗口族：window_control / 浮窗 / 宠物窗 / 赞助
//! - [`menu`]      —— ⋯ 菜单动作分发 + 设置开关 + npm 版本比对
//! - [`recovery`]  —— 恢复页四件套
//! - [`sidecar`]   —— sidecar 转发族：插件管理六通道 + 诊断 / 备份
//! - [`file`]      —— 文件域：file_open / file_revert（fence 围栏）
//! - [`image`]     —— 剪贴板粘贴图落盘
//! - [`wsl`]       —— WSL 配置三通道
//! - [`common`]    —— 共享 OS / 编码 / 时间小工具

// balance 供 lib.rs（AppState 字段与轮询环接线）与 menu.rs（toggle 后触发）
// 经路径直取，pub(crate)；其余子模块保持私有、只走下方 glob 门面。
pub(crate) mod balance;
pub(crate) mod common;
mod file;
mod image;
mod lifecycle;
mod menu;
mod recovery;
mod sidecar;
mod window;
mod wsl;

// 注意：必须用 glob re-export。`#[tauri::command]` 会随函数生成隐藏项
// `__cmd__<name>`（generate_handler! 依赖 `commands::__cmd__*` 路径），
// 具名 re-export 只带出函数本体，glob 才能把隐藏项一并带出门面。
pub use balance::*;
pub use common::*;
pub use file::*;
pub use image::*;
pub use lifecycle::*;
pub use menu::*;
pub use recovery::*;
pub use sidecar::*;
pub use window::*;
pub use wsl::*;
