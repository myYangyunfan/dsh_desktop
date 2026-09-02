//! 垫片 JS 的嵌入与静态自检。
//!
//! `dist/bridge-shim.js` 是 contracts/bridge-api.md 的页面侧实现（55 方法：53
//! Electron 契约面 + 2 Tauri 原生新增的插件死条目体检/清理），编进二进制后
//! 由 app 层作为 `initialization_script` 注入每个页面。

/// 垫片 JS 全文。
pub const BRIDGE_SHIM_JS: &str = include_str!("../dist/bridge-shim.js");

/// 垫片必须覆盖的桥方法/命名空间（与 bridge-api.md §2 对齐的完整性锚点）。
#[cfg(test)]
const REQUIRED_SURFACES: &[&str] = &[
    "appVersion",
    "windowControls.minimize",
    "windowControls.toggleMaximize",
    "windowControls.close",
    "windowControls.isMaximized",
    "windowControls.onMaximizeChange",
    "menu.action",
    "getInfo",
    "refreshBalance",
    "onNotificationJump",
    "wsl.getConfig",
    "wsl.saveConfig",
    "wsl.recheck",
    "restartService",
    "revertFiles",
    "openPath",
    "openExternal",
    "copyText",
    "getPathForFile",
    "imagePaste.save",
    "sponsorQr",
    "sponsorWindow",
    "floatWindow.open",
    "floatWindow.close",
    "pluginManager.list",
    "pluginManager.listDeadEntries",
    "pluginManager.removeDeadEntries",
    "pluginManager.setEnabled",
    "pluginManager.uninstall",
    "pluginManager.restore",
    "pluginManager.checkUpdates",
    "pluginManager.update",
    "diagBackup.runDiagnostics",
    "diagBackup.exportBackup",
    "diagBackup.previewRestore",
    "diagBackup.restore",
    "diagBackup.exportDiagnostics",
    "diagBackup.validatePlugins",
    "diagBackup.removeBundle",
    "diagBackup.analyzeOrder",
    "diagBackup.applyOrder",
    "guard.status",
    "guard.check",
    "guard.incident",
    "guard.resolveIncident",
    "petWindow.open",
    "petWindow.toggle",
    "petWindow.isOpen",
    "petWindow.close",
    "petWindow.moveTo",
    "petWindow.setAutoOpen",
    "recovery.getState",
    "recovery.reload",
    "recovery.restart",
    "recovery.openLogs",
];

/// 垫片源码是否包含某方法名的定义（形如 `name: function` / `name,`）。
#[cfg(test)]
fn defines(surface: &str) -> bool {
    if let Some((ns, method)) = surface.split_once('.') {
        // 命名空间块存在 + 块内方法定义存在（简化为全文出现 `method:`，容差可接受：
        // REQUIRED_SURFACES 是锚点不是解析器）。
        BRIDGE_SHIM_JS.contains(ns)
            && BRIDGE_SHIM_JS.contains(&format!("{method}:"))
    } else {
        BRIDGE_SHIM_JS.contains(&format!("{surface}:")) || BRIDGE_SHIM_JS.contains(&format!("{surface},"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shim_nonempty_and_idempotent_guard() {
        assert!(BRIDGE_SHIM_JS.len() > 4000, "垫片意外地短——疑似被截断");
        assert!(BRIDGE_SHIM_JS.contains("if (window.dshDesktop) return;"), "必须幂等");
        assert!(BRIDGE_SHIM_JS.contains("'use strict'"));
    }

    #[test]
    fn all_surfaces_present() {
        let missing: Vec<&str> = REQUIRED_SURFACES.iter().copied().filter(|s| !defines(s)).collect();
        assert!(missing.is_empty(), "垫片缺失契约方法: {missing:?}");
        assert_eq!(REQUIRED_SURFACES.len(), 55, "契约方法计数（51 + guard 4 面）");
    }

    /// check-agent-update 退役锚点（v0.5.3）：npm 内核更新链整体退役
    /// （内核随客户端分发，无 overlay 更新链）——菜单动作与垫片引用不得
    /// 残留；更新项统一走 check-client-update（updater_client 双源链）。
    /// E_CUT_FEATURE 不应出现在垫片（guard:action 已迁移为 guard 命名空间
    /// 的读面/轻量解，写动作仍走守护瀑布自动面，无垫片侧裁撤守卫）。
    #[test]
    fn agent_update_menu_action_retired() {
        assert!(!BRIDGE_SHIM_JS.contains("check-agent-update"), "check-agent-update 菜单动作已退役，不得残留");
        assert!(BRIDGE_SHIM_JS.contains("check-client-update"), "更新项必须切换到 check-client-update");
        assert!(!BRIDGE_SHIM_JS.contains("E_CUT_FEATURE"), "垫片不应有裁撤守卫残留");
    }

    #[test]
    fn event_names_align_contract() {
        for ev in ["window-maximized", "notification-jump", "balance-changed", "pet-state"] {
            assert!(BRIDGE_SHIM_JS.contains(ev), "事件 {ev} 缺失");
        }
        // 客户端更新链（v0.5.3）：available = 启动自动检查命中（红点/通知/
        // 自动安装）；progress = 下载进度（菜单行尾就地百分比）。
        for ev in ["client-update-available", "client-update-progress"] {
            assert!(BRIDGE_SHIM_JS.contains(ev), "客户端更新事件 {ev} 缺失");
        }
        for js_ev in ["dsh-balance-changed", "dsh-pet-state"] {
            assert!(BRIDGE_SHIM_JS.contains(js_ev), "页面 CustomEvent {js_ev} 缺失");
        }
    }

    #[test]
    fn upstream_channels_align_bridge_crate() {
        // 垫片 invoke 的 command 名必须全部在 bridge::commands 表内（未注册的会运行时失败）。
        let mut invoked: Vec<&str> = Vec::new();
        let mut rest = BRIDGE_SHIM_JS;
        while let Some(pos) = rest.find("call('") {
            rest = &rest[pos + 6..];
            if let Some(end) = rest.find('\'') {
                invoked.push(&rest[..end]);
                rest = &rest[end..];
            } else {
                break;
            }
        }
        // send() 族的四个 fire-and-forget。
        let mut rest = BRIDGE_SHIM_JS;
        while let Some(pos) = rest.find("send('") {
            rest = &rest[pos + 6..];
            if let Some(end) = rest.find('\'') {
                invoked.push(&rest[..end]);
                rest = &rest[end..];
            } else {
                break;
            }
        }
        assert!(!invoked.is_empty(), "未提取到任何 invoke");
        for cmd in invoked {
            assert!(
                crate::commands::CHANNELS.iter().any(|c| c.tauri == cmd && !c.cut),
                "垫片调用的 command {cmd} 不在映射表（或已被裁撤）"
            );
        }
    }

    /// H6 收口锚点：`image_paste_save` 命令的参数是具名 `payload`
    /// （`#[tauri::command] fn image_paste_save(payload: serde_json::Value)`），
    /// 垫片调用体必须携带 `{ payload: ... }` 键——旧形态
    /// `call('image_paste_save', payload || {})` 把 payload 当位置参数裸传，
    /// Tauri 2 只按具名参数匹配会丢参（command 收到空对象，粘贴图落盘失败）。
    /// 本测试锁住「调用体键名 = 命令具名参数」的一致性。
    #[test]
    fn image_paste_save_call_uses_named_payload_key() {
        let block = BRIDGE_SHIM_JS
            .split("imagePaste:")
            .nth(1)
            .and_then(|s| s.split("sponsorQr:").next())
            .expect("imagePaste 块边界缺失");
        assert!(block.contains("image_paste_save"), "imagePaste 块必须含 image_paste_save 调用: {block}");
        assert!(block.contains("{ payload:"), "save 调用体必须携带具名 payload 键: {block}");
        assert!(
            !block.contains("call('image_paste_save', payload"),
            "不得裸传 payload（位置参数形态）: {block}"
        );
    }
}

#[cfg(test)]
mod dialog_polyfill_tests {
    use super::BRIDGE_SHIM_JS;

    /// WebView2 不弹原生 dialog（用户实测 bug 的次因）：垫片必须 polyfill。
    #[test]
    fn native_dialog_polyfill_present() {
        assert!(BRIDGE_SHIM_JS.contains("window.confirm = function () { return true; }"), "confirm 必须放行（删除确认不再恒取消）");
        assert!(BRIDGE_SHIM_JS.contains("window.alert = function (msg)"), "alert 转桥上报（消息不丢）");
        assert!(BRIDGE_SHIM_JS.contains("window.prompt = function () { return null; }"), "prompt 防御性兜底");
        assert!(BRIDGE_SHIM_JS.contains("__dshDialogPolyfilled"), "幂等守卫");
    }
}

#[cfg(test)]
mod window_chrome_tests {
    use super::BRIDGE_SHIM_JS;

    /// 内核页窗口控制条：decorations:false 主窗（Windows）导航到内核 Web UI
    /// 后，页面不认识 data-tauri-drag-region（Electron 用 -webkit-app-region，
    /// WebView2 不支持）→ 不能拖、无窗口按钮（用户实测 bug）。垫片必须注入。
    #[test]
    fn window_chrome_injection_present() {
        assert!(BRIDGE_SHIM_JS.contains("dsh-tauri-chrome"), "控制条特征标记/id 缺失");
        assert!(BRIDGE_SHIM_JS.contains("data-tauri-drag-region"), "拖拽条必须用 Tauri drag-region 机制");
        // 按钮必须走垫片已有的 windowControls 桥方法（window_control 命令）。
        for m in ["windowControls.minimize()", "windowControls.toggleMaximize()", "windowControls.close()"] {
            assert!(BRIDGE_SHIM_JS.contains(m), "按钮缺桥调用 {m}");
        }
        // 最大化/还原图标状态同步。
        assert!(BRIDGE_SHIM_JS.contains("windowControls.isMaximized()"));
        assert!(BRIDGE_SHIM_JS.contains("windowControls.onMaximizeChange"));
        // 内容下推契约：普通流走 padding，fixed 侧边栏（dsh-better-sidebar）读属性。
        assert!(BRIDGE_SHIM_JS.contains("data-dsh-title-bar-height"), "缺 body 下推的属性声明");
        assert!(BRIDGE_SHIM_JS.contains("padding-top:"), "缺 body padding 下推");
    }

    /// 原生标题栏平台门（与 windows.rs decorations 平台门配套，改一侧必须
    /// 同步）：mac/linux 主窗为原生标题栏（mac 红绿灯/全屏钮，linux 防白屏），
    /// 垫片不得注入全宽条（否则双份标题栏 + body 下推破坏布局），降级为 ⋯
    /// 菜单悬浮钮（保住菜单功能面：更新/通知开关/退出等）。
    #[test]
    fn window_chrome_native_title_bar_platform_gate() {
        // 平台判定（UA：Windows UA 不含 Macintosh/Linux 两词，mac/linux 均含其一）。
        assert!(BRIDGE_SHIM_JS.contains("NATIVE_TITLE_BAR"), "缺平台门判定");
        assert!(BRIDGE_SHIM_JS.contains("/(Macintosh|Linux)/.test(navigator.userAgent"), "UA 判定形态漂移");
        // 悬浮钮降级形态存在且为统一入口内分支（浮窗/宠物窗/壳页跳过后先分流）。
        assert!(BRIDGE_SHIM_JS.contains("injectMenuBall"), "缺悬浮钮注入函数");
        assert!(BRIDGE_SHIM_JS.contains("dsh-tauri-menu-ball"), "缺悬浮钮 id");
        assert!(
            BRIDGE_SHIM_JS.contains("if (NATIVE_TITLE_BAR) { injectMenuBall(); return; }"),
            "原生标题栏平台必须在注入条之前分流到悬浮钮"
        );
        // 幂等与自愈重注必须两形态统一防重（悬浮钮被 SPA 摘除后也要能重注）。
        assert!(
            BRIDGE_SHIM_JS.contains("!document.getElementById(BALL_ID)"),
            "幂等/自愈检查必须兼容悬浮钮形态"
        );
        // 红点与点击外关闭必须兼容两种形态（否则悬浮钮形态红点丢失/菜单打不开）。
        assert!(
            BRIDGE_SHIM_JS.contains("btn = document.getElementById(BALL_ID)"),
            "红点兼容悬浮钮形态"
        );
        assert!(
            BRIDGE_SHIM_JS.contains("document.getElementById(CHROME_ID) || document.getElementById(BALL_ID)"),
            "点击外关闭兼容悬浮钮形态（点钮不得关菜单）"
        );
    }

    /// 控制条只注入内核页：浮窗/宠物窗/壳页各有标题栏，注入会重复遮挡。
    #[test]
    fn window_chrome_scoped_to_kernel_page() {
        for marker in ["__DSH_FLOAT__", "__DSH_PET__", "loading|recovery|poc"] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "跳过条件缺 {marker}");
        }
        assert!(BRIDGE_SHIM_JS.contains("getElementById(CHROME_ID)"), "幂等检查（先查已存在标记）");
    }

    /// 初始化脚本先于页面脚本（DOM 未建）→ 等 body；内核 SPA 重挂载 → 自愈。
    #[test]
    fn window_chrome_waits_for_body_and_self_heals() {
        assert!(BRIDGE_SHIM_JS.contains("MutationObserver"), "等 body/重挂观察");
        assert!(BRIDGE_SHIM_JS.contains("onBodyReady"), "body 未就绪时不早注入");
        // 全程 try/catch 包裹：注入失败不得影响桥主流程。
        assert!(BRIDGE_SHIM_JS.contains("注入失败不影响页面主流程"));
    }

    /// 双击最大化由 Tauri 内置 drag-region 脚本处理（mousedown detail===2 →
    /// internal_toggle_maximize）；垫片自己再挂 dblclick 监听会双重切换。
    #[test]
    fn window_chrome_no_manual_dblclick_handler() {
        assert!(!BRIDGE_SHIM_JS.contains("'dblclick'"), "双击切换须交给 Tauri 内置脚本，不得自挂监听");
        assert!(!BRIDGE_SHIM_JS.contains("ondblclick"), "同上");
    }

    /// 沉浸式双主题（对齐 Electron 的适配方式）：条颜色全部消费内核
    /// --dsw-alias-* 设计变量（内核按 body[data-ds-dark-theme] 运行时切换，
    /// 变量级联即时跟随）；变量缺失时按 data-dsh-theme 档位兜底（检测
    /// data-ds-dark-theme → 主题 class/属性 → prefers-color-scheme），
    /// 切换有 CSS transition 平滑过渡。
    #[test]
    fn window_chrome_theme_adaptive() {
        for marker in [
            "--dsw-alias-bg-base",     // 内核主题底色变量（像素级跟随）
            "--dsw-alias-label-primary",
            "data-ds-dark-theme",      // 内核暗色标记（检测优先级最高）
            "data-dsh-theme",          // 条上主题档位属性（light/dark 兜底分档）
            "data-dsh-theme=\"light\"", // 浅色档须有白底兜底（内核 light 值）
            "prefers-color-scheme",    // 系统偏好兜底 + matchMedia 监听
            "attributeFilter",         // MutationObserver 观察主题属性变化
            "transition:background-color .25s",
        ] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "主题化缺 {marker}");
        }
    }

    /// 鲸鱼图标：内核 favicon.svg 同源矢量（单 path，viewBox 0 0 50 50，
    /// 首段 M48.8354 是指纹），fill:currentColor 继承标题色 → 随内核主题
    /// 即时反色；替换旧渐变方块。
    #[test]
    fn window_chrome_whale_icon() {
        assert!(BRIDGE_SHIM_JS.contains("M48.8354"), "鲸鱼 path 缺失（内核 favicon 同源）");
        assert!(BRIDGE_SHIM_JS.contains("viewBox: '0 0 50 50'"), "鲸鱼 viewBox 缺失");
        assert!(BRIDGE_SHIM_JS.contains("fill:currentColor"), "鲸鱼须随主题反色");
        assert!(BRIDGE_SHIM_JS.contains(".dch-whale"), "鲸图样式类缺失");
        assert!(!BRIDGE_SHIM_JS.contains("linear-gradient(135deg,#4f7cff"), "渐变方块 logo 应被鲸鱼替换");
    }

    /// 观感对齐 Electron CHROME_CSS：玻璃底（color-mix 半透明 + 模糊饱和）
    /// + 细边框 + 30x28 圆角按钮 + SVG 线性按钮图形（stroke:currentColor）。
    #[test]
    fn window_chrome_electron_visual_alignment() {
        for marker in [
            "color-mix(in srgb,",
            "backdrop-filter:blur(16px) saturate(1.5)",
            "border-radius:8px",
            "place-items:center",
            "stroke:currentColor",
            "letter-spacing:.2px", // Electron .dch-title 同款
        ] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "对齐 Electron 观感缺 {marker}");
        }
        // 最大化/还原图标状态切换（□/❐ 的 SVG 等价物）。
        assert!(BRIDGE_SHIM_JS.contains("data-maximized"), "缺最大化状态图标切换");
    }

    /// ⋯ 下拉菜单（Electron preload renderMenu 复刻）：⋯ 按钮在 min/max/close
    /// 左边；菜单含「检查客户端更新…」（v0.5.3 唯一更新项，双源 GitHub/Gitee
    /// 客户端更新链）/更新源/四开关（三 Electron 键 + toggle-auto-update）/
    /// reload/devtools/fullscreen/open-browser/open-logs/sponsor/about/quit；
    /// **不得再含「检查 dsh 更新」**（npm 内核链已随「内核随客户端分发」退役）。
    #[test]
    fn window_chrome_dots_menu_items() {
        for marker in [
            "dch-menu-btn",                            // ⋯ 按钮（30x28 同款）
            "cx: '2.4'",                               // 实心三点图形（Electron GLYPHS.menu 同款）
            "MENU_ID",                                 // 菜单面板 id
            "menuItemHtml('check-client-update'",      // 唯一更新项「检查客户端更新…」
            "检查客户端更新",
            "下载并安装",                                // 可更新态的安装按钮
            "更新源（点行内「复制」拷贝地址）",
            "menuItemHtml('toggle-notify'",
            "menuItemHtml('toggle-close-to-tray'",
            "menuItemHtml('toggle-balance'",
            "menuItemHtml('toggle-auto-update'",       // 自动安装客户端更新开关
            "自动安装客户端更新",
            "menuItemHtml('reload'",
            "menuItemHtml('devtools'",
            "menuItemHtml('fullscreen'",
            "menuItemHtml('open-browser'",
            "menuItemHtml('open-logs'",
            "menuItemHtml('sponsor'",
            "☕ 请作者喝咖啡",
            "sponsorWindow()",                         // sponsor 走赞助窗通道
            "menuItemHtml('about'",
            "关于 DSH Desktop",
            "menuItemHtml('quit'",
            "' data-act=\"' + act",                    // 菜单项统一带 data-act（事件路由键）
            "menu_action",                             // 动作统一经 menu_action 桥
        ] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "⋯ 菜单缺 {marker}");
        }
        // 退役锚点（全文级）：npm 内核检查项与其文案不得以任何形态回潮。
        assert!(!BRIDGE_SHIM_JS.contains("检查 dsh 更新"), "「检查 dsh 更新」已退役（内核随客户端分发）");
        // 渲染段（updRowHtml + renderMenu 函数体）必须含客户端更新项。
        let menu_seg = BRIDGE_SHIM_JS
            .split("function updRowHtml()")
            .nth(1)
            .and_then(|s| s.split("function closeMenu()").next())
            .expect("菜单渲染函数段（updRowHtml→closeMenu）");
        assert!(menu_seg.contains("check-client-update"), "更新项必须进菜单渲染");
        assert!(menu_seg.contains("检查客户端更新"), "同上（中文文案）");
        assert!(!menu_seg.contains("check-agent-update"), "退役动作不得进渲染段");
    }

    /// ⋯ 菜单交互契约：点击外部 / Escape 关闭；开关类 toggle 后重渲染（菜单
    /// 保持打开）；客户端更新检查就地回显（检查中…/可更新 vX/已是最新/
    /// 检查失败）+ 下载进度百分比 + 有会话时的显式确认提示 + 启动自动检查
    /// 命中的红点/系统通知/自动安装；自愈重注不重复挂 document 监听。
    #[test]
    fn window_chrome_dots_menu_interaction() {
        for marker in [
            "'Escape'",                     // Escape 关闭
            "bar.contains(e.target)",       // 点击面板外关闭（面板在条内）
            "installMenuHooks",             // document 监听一次性安装
            "menuHooksInstalled",           // 防自愈重注重复累积
            "renderMenu()",                 // toggle 成功后重渲染（菜单不关）
            "检查中…",                      // 客户端更新检查就地反馈
            "已是最新",
            "可更新 v",
            "检查失败",
            "下载中 ",                       // 进度百分比（client-update-progress 驱动）
            "下载完成，正在安装…",
            "继续安装",                       // 有会话运行时安装的显式确认（[继续安装]/[取消]）
            "取消",
            "确认继续",
            "markUpdateDot",                // ⋯ 按钮红点（client-update-available）
            "dch-dot",
            "plugin:notification|notify",   // 系统通知走壳内既有通知插件 IPC
            "handleClientUpdateAvailable",  // 事件消费入口（红点/通知/自动安装）
            "autoInstallUpdates",           // 自动安装开关（app_init 回填）
        ] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "菜单交互缺 {marker}");
        }
        // 开关类点击不得关菜单（Electron 同语义：toggle 后留在菜单里看新状态）。
        let toggle_seg = BRIDGE_SHIM_JS
            .split("if (act === 'toggle-notify'")
            .nth(1)
            .and_then(|s| s.split("if (act === 'check-client-update'").next())
            .expect("toggle 分支");
        assert!(!toggle_seg.contains("closeMenu()"), "toggle 分支应留在菜单重渲染: {toggle_seg}");
    }

    /// 自愈重注防累积（内存泄漏回归锚点）：内核 SPA 反复摘除 body 直接
    /// 子元素会触发控制条重注，两个累积面必须有守卫——
    ///   a) <head> 里的两份 <style data-for=…> 只注入一次（重注只补条本体）；
    ///   b) 每次重注订阅的 onMaximizeChange(setMaxGlyph) 闭包持有旧条
    ///      maxBtn（已摘除的游离 DOM），旧订阅必须先退订（listeners.maximize
    ///      不得随重注次数线性增长）。
    #[test]
    fn window_chrome_self_heal_does_not_accumulate() {
        let inject_seg = BRIDGE_SHIM_JS
            .split("function injectChromeBar()")
            .nth(1)
            .and_then(|s| s.split("function onBodyReady").next())
            .expect("injectChromeBar 函数段");
        // a) 样式查重：两份样式都必须先 querySelector 再决定 append。
        assert!(
            inject_seg.contains("style[data-for=\"' + CHROME_ID + '\"]"),
            "重注不得重复注入主样式 <style>"
        );
        assert!(
            inject_seg.contains("style[data-for=\"' + CHROME_ID + '-layout\"]"),
            "重注不得重复注入布局样式 <style>"
        );
        // b) maximize 订阅先退旧再挂新。
        assert!(BRIDGE_SHIM_JS.contains("maxGlyphUnsub"), "缺 maximize 订阅退订器");
        assert!(
            inject_seg.contains("maxGlyphUnsub()"),
            "重注前必须退订旧条的 maximize 订阅"
        );
        assert!(
            inject_seg.contains("maxGlyphUnsub = dshDesktop.windowControls.onMaximizeChange(setMaxGlyph)"),
            "新订阅的退订器必须落回 maxGlyphUnsub"
        );
    }
}

/// T2 UI 修复：⋯ 菜单「更新源」复制按钮——中文「复制」/「已复制 ✓」不得
/// 溢出按钮框（用户实测：按钮太小、字跑出框外）。复制按钮须有独立
/// .dch-copy 类（不复用单字符快捷键徽章 .dch-kbd），且 CSS 必须带
/// nowrap + fit-content 兜底；含中文的安装按钮 .dch-install 同守卫。
#[cfg(test)]
mod menu_copy_button_tests {
    use super::BRIDGE_SHIM_JS;

    #[test]
    fn copy_button_has_dedicated_class_with_overflow_guards() {
        // 独立类存在且被渲染段使用（GitHub/Gitee 两行各一个）。
        assert!(BRIDGE_SHIM_JS.contains(".dch-copy{"), "复制按钮须有独立 .dch-copy 样式类");
        assert_eq!(
            BRIDGE_SHIM_JS.matches("button class=\"dch-copy\"").count(),
            2,
            "更新源两行（github/gitee）各一个复制按钮"
        );
        // .dch-copy 规则段内的溢出守卫。
        let copy_css = BRIDGE_SHIM_JS
            .split(".dch-copy{")
            .nth(1)
            .and_then(|s| s.split(".dch-copy:hover").next())
            .expect(".dch-copy CSS 规则段");
        for guard in ["white-space:nowrap", "min-width:fit-content", "box-sizing:border-box"] {
            assert!(copy_css.contains(guard), ".dch-copy 缺溢出守卫 {guard}");
        }
    }

    #[test]
    fn chinese_text_badges_have_nowrap_guards() {
        // 安装按钮（「下载并安装」）：同样不得换行/溢出。
        let install_css = BRIDGE_SHIM_JS
            .split(".dch-install{")
            .nth(1)
            .and_then(|s| s.split(".dch-install:hover").next())
            .expect(".dch-install CSS 规则段");
        for guard in ["white-space:nowrap", "min-width:fit-content"] {
            assert!(install_css.contains(guard), ".dch-install 缺溢出守卫 {guard}");
        }
    }
}

/// 事件信封解包回归锚点（tauri-2.11.5 emit_js_script：回调收 {event, payload}）：
/// onEvent 必须先解包 payload 再交 map/消费者——旧代码裸读导致 notification-jump/
/// balance-changed/pet-state/更新进度/拖放转发全部字段 undefined（事件链静默失效）。
#[cfg(test)]
mod event_envelope_tests {
    use super::BRIDGE_SHIM_JS;

    #[test]
    fn onevent_unwraps_envelope_payload() {
        let seg = BRIDGE_SHIM_JS
            .split("function onEvent(name, queue, map)")
            .nth(1)
            .and_then(|s| s.split("onEvent('window-maximized'").next())
            .expect("onEvent 函数段");
        assert!(
            seg.contains("ev.payload !== undefined ? ev.payload : ev"),
            "onEvent 必须解包信封（双形态回退）: {seg}"
        );
        // map 收到的必须是解包后的 payload（不得把信封传给 map）。
        assert!(
            seg.contains("map ? map(payload) : payload"),
            "map 消费的是解包后的 payload"
        );
    }
}

/// 外链点击委托（K15 余额充值 / #149 / #162 外链不跳转）回归锚点：
/// <a target="_blank"> http(s) 外链被 WebView2 导航围栏拦掉（on_navigation 只放行
/// 127.0.0.1 / tauri://），垫片必须全局捕获点击、preventDefault 原生导航并改走
/// openExternal（系统默认浏览器）；且不得劫持内核同源 127.0.0.1 内链。
#[cfg(test)]
mod external_link_delegation_tests {
    use super::BRIDGE_SHIM_JS;

    #[test]
    fn delegation_block_present() {
        for marker in [
            "installExternalLinkDelegation",      // 委托安装函数
            "target.toLowerCase() !== '_blank'", // 只拦 _blank
            "openExternal(href)",                 // 走 open_external 桥
            "e.preventDefault()",                 // 阻止原生导航
            "indexOf('http://127.0.0.1')",      // 内核同源放行
            "slice(0, 7) !== 'http://'",        // 只拦 http(s)
            "installExternalLinkDelegation();",   // 自初始化调用
        ] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "外链点击委托缺 {marker}");
        }
    }
}
