//! 统一错误（contracts/error-codes.md 的代码载体）。
//!
//! 形态沿用 PR #121 的 PluginError：`{code, message, detail?}`。
//! Tauri command 的 Err 端必须是 Serialize 类型——这里序列化为
//! `{"code": "...", "message": "..."}`，垫片转成 `Error("[CODE] message")`。

use serde::{Serialize, Serializer};

/// 契约错误码常量（contracts/error-codes.md §1-§5 的代码载体）。
///
/// string 字面量与契约文档逐字一致——**code 是稳定契约，只追加不复用**
/// （error-codes.md §6.1）。跨文件使用错误码一律引这里，不得手写字面量
/// （防拼写漂移：错误码是插件侧按 `[CODE]` 前缀识别的硬契约面）。
pub mod codes {
    // §1 通用壳错误
    pub const INTERNAL: &str = "E_INTERNAL";
    pub const INVALID_ARG: &str = "E_INVALID_ARG";
    pub const NOT_FOUND: &str = "E_NOT_FOUND";
    pub const CUT_FEATURE: &str = "E_CUT_FEATURE";
    pub const TIMEOUT: &str = "E_TIMEOUT";
    pub const NOT_IMPLEMENTED: &str = "E_NOT_IMPLEMENTED";
    pub const UNAUTHORIZED: &str = "E_UNAUTHORIZED";
    // E_IMAGE_PASTE（剪贴板粘贴图落盘）常量已随 dsh-image-paste 插件裁撤移除
    // （2026-10）：码值按 §6.1「只追加不复用」在契约中保留占位，无生产方。
    // §2 内核进程域（kernel-process）
    pub const KERNEL_SPAWN: &str = "E_KERNEL_SPAWN";
    pub const KERNEL_PORT: &str = "E_KERNEL_PORT";
    pub const KERNEL_CRASH_LOOP: &str = "E_KERNEL_CRASH_LOOP";
    pub const KERNEL_NOT_READY: &str = "E_KERNEL_NOT_READY";
    // §3 Sidecar / 插件域（执行在 Node sidecar；Rust 编排在 app commands/sidecar）
    pub const SIDECAR_EXIT: &str = "E_SIDECAR_EXIT";
    pub const PATCH_ALREADY: &str = "E_PATCH_ALREADY";
    pub const PATCH_ANCHOR_MISSING: &str = "E_PATCH_ANCHOR_MISSING";
    pub const PATCH_ANCHOR_CHANGED: &str = "E_PATCH_ANCHOR_CHANGED";
    pub const MANIFEST_INVALID: &str = "E_MANIFEST_INVALID";
    pub const QUARANTINE: &str = "E_QUARANTINE";
    pub const UPDATE_VERIFY: &str = "E_UPDATE_VERIFY";
    pub const WRITE_GATE: &str = "E_WRITE_GATE";
    // §4 围栏 / 文件域（fence）
    pub const FENCE_ROOT: &str = "E_FENCE_ROOT";
    pub const FENCE_ZSTD: &str = "E_FENCE_ZSTD";
    pub const FILE_ATOMIC: &str = "E_FILE_ATOMIC";
    // §5 更新域（tauri-plugin-updater）
    pub const UPDATER_SIGNATURE: &str = "E_UPDATER_SIGNATURE";
    pub const UPDATER_NETWORK: &str = "E_UPDATER_NETWORK";
    pub const UPDATER_CONFIG: &str = "E_UPDATER_CONFIG";
}

/// 壳统一错误。code 是稳定契约（error-codes.md §6：只追加不复用）。
#[derive(Debug, Clone)]
pub struct BridgeError {
    pub code: &'static str,
    pub message: String,
    pub detail: Option<serde_json_slim::Value>,
}

/// 避免给 bridge 拉 serde_json 依赖：detail 仅需透传形态，
/// 用极简 JSON 值枚举（app 层用 serde_json::Value 互转）。
pub mod serde_json_slim {
    /// 极简 JSON 值（只用于 detail 透传）。
    #[derive(Debug, Clone)]
    pub enum Value {
        Null,
        Bool(bool),
        Number(f64),
        String(String),
        Array(Vec<Value>),
        Object(Vec<(String, Value)>),
    }
}

impl BridgeError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: None }
    }

    /// 壳内部未分类错误（§1）。
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(codes::INTERNAL, message)
    }

    /// 参数校验失败（§1）。
    pub fn invalid_arg(message: impl Into<String>) -> Self {
        Self::new(codes::INVALID_ARG, message)
    }

    /// 目标不存在（§1）。
    pub fn not_found(what: impl Into<String>) -> Self {
        Self::new(codes::NOT_FOUND, what)
    }

    /// 已裁撤能力（§1；ipc-commands.md §2.4 裁撤表）。
    pub fn cut(what: impl Into<String>) -> Self {
        Self::new(codes::CUT_FEATURE, what)
    }

    /// 下游超时（§1）。
    pub fn timeout(what: impl Into<String>) -> Self {
        Self::new(codes::TIMEOUT, what)
    }

    /// 能力已规划未实装（§1；占位拒绝，非裁撤）。
    pub fn not_implemented(what: impl Into<String>) -> Self {
        Self::new(codes::NOT_IMPLEMENTED, what)
    }

    /// 调用窗越权（§1；Electron pluginManagerIpcAllowed 语义——插件管理/
    /// 诊断/备份族仅主窗 label 可调）。
    pub fn unauthorized(what: impl Into<String>) -> Self {
        Self::new(codes::UNAUTHORIZED, what)
    }

    /// 就绪行未在期限内出现 / 内核未就绪（§2）。
    pub fn kernel_not_ready(what: impl Into<String>) -> Self {
        Self::new(codes::KERNEL_NOT_READY, what)
    }

    /// 路径不在允许的 fileRoots 内（§4，越界拒绝）。
    pub fn fence_root(what: impl Into<String>) -> Self {
        Self::new(codes::FENCE_ROOT, what)
    }

    /// 更新链未配置（§5；DSH_UPDATER_ENDPOINT/PUBKEY 缺失）。
    pub fn updater_config(what: impl Into<String>) -> Self {
        Self::new(codes::UPDATER_CONFIG, what)
    }

    /// 更新 manifest/产物下载失败（§5）。
    pub fn updater_network(what: impl Into<String>) -> Self {
        Self::new(codes::UPDATER_NETWORK, what)
    }

    /// minisign 签名校验失败（§5，fail-closed）。
    pub fn updater_signature(what: impl Into<String>) -> Self {
        Self::new(codes::UPDATER_SIGNATURE, what)
    }
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for BridgeError {}

impl Serialize for BridgeError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let n = if self.detail.is_some() { 3 } else { 2 };
        let mut map = s.serialize_map(Some(n))?;
        map.serialize_entry("code", self.code)?;
        map.serialize_entry("message", &self.message)?;
        if let Some(d) = &self.detail {
            // detail 只进日志/诊断，不承诺序列化形态（error-codes.md §6.2）。
            map.serialize_entry("detail", &format!("{d:?}"))?;
        }
        map.end()
    }
}

/// 便捷：把 io 错误包成 E_INTERNAL。
impl From<std::io::Error> for BridgeError {
    fn from(e: std::io::Error) -> Self {
        Self::internal(format!("io: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_format() {
        let e = BridgeError::cut("内核自动更新链已删除");
        assert_eq!(e.to_string(), "[E_CUT_FEATURE] 内核自动更新链已删除");
    }

    #[test]
    fn codes_stable() {
        assert_eq!(BridgeError::internal("x").code, "E_INTERNAL");
        assert_eq!(BridgeError::invalid_arg("x").code, "E_INVALID_ARG");
        assert_eq!(BridgeError::not_found("x").code, "E_NOT_FOUND");
        assert_eq!(BridgeError::cut("x").code, "E_CUT_FEATURE");
        assert_eq!(BridgeError::timeout("x").code, "E_TIMEOUT");
    }

    /// 常量与契约文档（error-codes.md §1-§5）逐字锚定——错误码是稳定契约，
    /// 拼写漂移即破坏插件侧 `[CODE]` 前缀识别。
    #[test]
    fn code_constants_match_contract_literals() {
        use codes::*;
        assert_eq!(INTERNAL, "E_INTERNAL");
        assert_eq!(INVALID_ARG, "E_INVALID_ARG");
        assert_eq!(NOT_FOUND, "E_NOT_FOUND");
        assert_eq!(CUT_FEATURE, "E_CUT_FEATURE");
        assert_eq!(TIMEOUT, "E_TIMEOUT");
        assert_eq!(NOT_IMPLEMENTED, "E_NOT_IMPLEMENTED");
        assert_eq!(UNAUTHORIZED, "E_UNAUTHORIZED");
        assert_eq!(KERNEL_SPAWN, "E_KERNEL_SPAWN");
        assert_eq!(KERNEL_PORT, "E_KERNEL_PORT");
        assert_eq!(KERNEL_CRASH_LOOP, "E_KERNEL_CRASH_LOOP");
        assert_eq!(KERNEL_NOT_READY, "E_KERNEL_NOT_READY");
        assert_eq!(SIDECAR_EXIT, "E_SIDECAR_EXIT");
        assert_eq!(PATCH_ALREADY, "E_PATCH_ALREADY");
        assert_eq!(PATCH_ANCHOR_MISSING, "E_PATCH_ANCHOR_MISSING");
        assert_eq!(PATCH_ANCHOR_CHANGED, "E_PATCH_ANCHOR_CHANGED");
        assert_eq!(MANIFEST_INVALID, "E_MANIFEST_INVALID");
        assert_eq!(QUARANTINE, "E_QUARANTINE");
        assert_eq!(UPDATE_VERIFY, "E_UPDATE_VERIFY");
        assert_eq!(WRITE_GATE, "E_WRITE_GATE");
        assert_eq!(FENCE_ROOT, "E_FENCE_ROOT");
        assert_eq!(FENCE_ZSTD, "E_FENCE_ZSTD");
        assert_eq!(FILE_ATOMIC, "E_FILE_ATOMIC");
        assert_eq!(UPDATER_SIGNATURE, "E_UPDATER_SIGNATURE");
        assert_eq!(UPDATER_NETWORK, "E_UPDATER_NETWORK");
        assert_eq!(UPDATER_CONFIG, "E_UPDATER_CONFIG");
    }

    /// 便捷构造器逐个回码（与 codes 常量一致，防手滑引错常量）。
    #[test]
    fn convenience_constructors_carry_contract_codes() {
        assert_eq!(BridgeError::not_implemented("x").code, codes::NOT_IMPLEMENTED);
        assert_eq!(BridgeError::unauthorized("x").code, codes::UNAUTHORIZED);
        assert_eq!(BridgeError::kernel_not_ready("x").code, codes::KERNEL_NOT_READY);
        assert_eq!(BridgeError::fence_root("x").code, codes::FENCE_ROOT);
        assert_eq!(BridgeError::updater_config("x").code, codes::UPDATER_CONFIG);
        assert_eq!(BridgeError::updater_network("x").code, codes::UPDATER_NETWORK);
        assert_eq!(BridgeError::updater_signature("x").code, codes::UPDATER_SIGNATURE);
    }
}
