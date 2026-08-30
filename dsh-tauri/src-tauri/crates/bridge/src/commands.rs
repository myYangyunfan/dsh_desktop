//! Electron IPC 通道 → Tauri command 映射（contracts/ipc-commands.md 的代码载体）。
//!
//! 本表即裁撤/保留决策的机器可读形态：新增/裁撤通道必须同时改 contracts 文档
//! 与本表（完整性测试保证两边不漂移）。

/// 一个通道的映射结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChannelMapping {
    /// Electron 通道名（如 `chrome:window`）。
    pub electron: &'static str,
    /// Tauri command 名（snake_case，如 `window_control`）。
    pub tauri: &'static str,
    /// 归属阶段（1 核心生命周期 / 2 sidecar / 3 围栏诊断）。
    pub phase: u8,
    /// 是否 fire-and-forget（Electron `ipcMain.on`）。
    pub fire_and_forget: bool,
    /// 是否已裁撤（Tauri 版不实现；垫片返回 E_CUT_FEATURE）。
    pub cut: bool,
}

/// 全量映射表（45 通道：43 提取自 main.js + 2 Tauri 原生新增，见 contracts/ipc-commands.md §2）。
pub const CHANNELS: &[ChannelMapping] = &[
    // ---- Phase 1：核心生命周期 ----
    m("chrome:init", "app_init", false, false),
    m("chrome:recovery-state", "recovery_state", false, false),
    m("chrome:recovery-reload", "recovery_reload", false, false),
    m("chrome:recovery-restart", "recovery_restart", false, false),
    m("chrome:recovery-open-logs", "recovery_open_logs", false, false),
    m("chrome:window", "window_control", false, false),
    m("chrome:menu", "menu_action", false, false),
    m("chrome:restart-service", "restart_service", false, false),
    m("chrome:float-window", "float_window", false, false),
    m("chrome:pet-window", "pet_window", false, false),
    m("chrome:sponsor-window", "sponsor_window", false, false),
    m("dsh:copy-text", "copy_text", false, false),
    m("dsh:sponsor-qr", "sponsor_qr", false, false),
    m("dsh:open-external", "open_external", false, false),
    m("dsh:image-paste-save", "image_paste_save", false, false),
    m("dsh:balance-refresh", "balance_refresh", false, false),
    m("dsh:renderer-heartbeat", "renderer_heartbeat", true, false),
    m("dsh:page-error", "page_error", true, false),
    m("dsh:current-session", "current_session", true, false),
    m("float:close", "float_close", true, false),
    m("pet:close", "pet_close", true, false),
    m("pet:move-to", "pet_move_to", true, false),
    m("pet:set-auto-open", "pet_set_auto_open", true, false),
    // ---- Phase 2：sidecar 全链路 ----
    mp("dsh:plugin-list", "plugin_list", false, false),
    mp("dsh:plugin-set-enabled", "plugin_set_enabled", false, false),
    mp("dsh:plugin-uninstall", "plugin_uninstall", false, false),
    mp("dsh:plugin-restore", "plugin_restore", false, false),
    mp("dsh:plugin-check-updates", "plugin_check_updates", false, false),
    mp("dsh:plugin-update", "plugin_update", false, false),
    // Tauri 原生新增（无 Electron 母本）：插件管理页无效条目体检 + 一键清理。
    mp("dsh:plugin-list-dead-entries", "plugin_list_dead_entries", false, false),
    mp("dsh:plugin-remove-dead-entries", "plugin_remove_dead_entries", false, false),
    // ---- Phase 3：围栏 / 诊断 / WSL ----
    mp3("dsh:file-revert", "file_revert", false, false),
    mp3("dsh:file-open", "file_open", false, false),
    mp3("dsh:diag-run", "diag_run", false, false),
    mp3("dsh:backup-export", "backup_export", false, false),
    mp3("dsh:backup-restore", "backup_restore", false, false),
    mp3("dsh:diag-export", "diag_export", false, false),
    mp3("dsh:diag-validate", "diag_validate", false, false),
    mp3("dsh:diag-order", "diag_order", false, false),
    mp3("dsh:diag-order-apply", "diag_order_apply", false, false),
    mp3("dsh:diag-remove-bundle", "diag_remove_bundle", false, false),
    mp3("dsh:wsl-config", "wsl_config_get", false, false),
    mp3("dsh:wsl-config-save", "wsl_config_save", false, false),
    mp3("dsh:wsl-recheck", "wsl_recheck", false, false),
    // ---- 插件保护中心交互面（guard:action 分发；写动作仍走守护瀑布自动面）----
    mp3("guard:action", "guard_action", false, false),
];

const fn m(e: &'static str, t: &'static str, f: bool, cut: bool) -> ChannelMapping {
    ChannelMapping { electron: e, tauri: t, phase: 1, fire_and_forget: f, cut }
}
const fn mp(e: &'static str, t: &'static str, f: bool, cut: bool) -> ChannelMapping {
    ChannelMapping { electron: e, tauri: t, phase: 2, fire_and_forget: f, cut }
}
const fn mp3(e: &'static str, t: &'static str, f: bool, cut: bool) -> ChannelMapping {
    ChannelMapping { electron: e, tauri: t, phase: 3, fire_and_forget: f, cut }
}

/// Electron 通道名 → Tauri command 名（含 7 个 fire-and-forget）。
pub fn tauri_command_for(electron_channel: &str) -> Option<&'static str> {
    CHANNELS.iter().find(|c| c.electron == electron_channel).map(|c| c.tauri)
}

/// 反查（垫片侧调试用）。
pub fn electron_channel_for(tauri_command: &str) -> Option<&'static str> {
    CHANNELS.iter().find(|c| c.tauri == tauri_command).map(|c| c.electron)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// contracts/ipc-commands.md §2 声明的总量：38 invoke + 7 send = 45
    ///（36 + 2 为 Tauri 原生新增的插件死条目体检/清理通道），全部保留。
    #[test]
    fn channel_count_matches_contract() {
        assert_eq!(CHANNELS.len(), 45, "通道总数必须与契约文档一致");
        assert_eq!(CHANNELS.iter().filter(|c| c.cut).count(), 0, "无裁撤通道（guard:action 已迁移）");
        assert_eq!(
            CHANNELS.iter().filter(|c| c.fire_and_forget).count(),
            7,
            "fire-and-forget 通道 7 个"
        );
    }

    #[test]
    fn no_duplicate_names() {
        let mut e = HashSet::new();
        let mut t = HashSet::new();
        for c in CHANNELS {
            assert!(e.insert(c.electron), "Electron 通道重复: {}", c.electron);
            assert!(t.insert(c.tauri), "Tauri command 重复: {}", c.tauri);
        }
    }

    #[test]
    fn lookup_roundtrip() {
        assert_eq!(tauri_command_for("chrome:window"), Some("window_control"));
        assert_eq!(electron_channel_for("plugin_list"), Some("dsh:plugin-list"));
        assert_eq!(tauri_command_for("guard:action"), Some("guard_action"));
        assert_eq!(tauri_command_for("check-agent-update"), None, "菜单动作不是通道");
    }

    #[test]
    fn naming_convention() {
        for c in CHANNELS.iter().filter(|c| !c.cut) {
            assert!(
                !c.tauri.contains(':') && !c.tauri.contains('-'),
                "Tauri command 必须是 snake_case: {}",
                c.tauri
            );
        }
    }
}
