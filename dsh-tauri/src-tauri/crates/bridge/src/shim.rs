//! 垫片 JS 的嵌入与静态自检。
//!
//! `dist/bridge-shim.js` 是 contracts/bridge-api.md 的页面侧实现（48 方法），
//! 编进二进制后由 app 层作为 `initialization_script` 注入每个页面。

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
    fn all_48_surfaces_present() {
        let missing: Vec<&str> = REQUIRED_SURFACES.iter().copied().filter(|s| !defines(s)).collect();
        assert!(missing.is_empty(), "垫片缺失契约方法: {missing:?}");
        assert_eq!(REQUIRED_SURFACES.len(), 49, "契约方法计数（48+recovery.openLogs）");
    }

    /// check-agent-update 需求变更锚点：菜单保留「检查 dsh 更新…」，垫片
    /// 不再本地拦截（此前的 E_CUT_FEATURE 短路已删——Rust 侧 menu_action 走
    /// npm latest 对比链实现）。E_CUT_FEATURE 不应再出现在垫片（无其他裁撤
    /// 方法位需要垫片侧守卫；guard:action 通道本就不在垫片面）。
    #[test]
    fn cut_feature_guard_present() {
        assert!(BRIDGE_SHIM_JS.contains("check-agent-update"), "菜单项「检查 dsh 更新…」需保留");
        assert!(!BRIDGE_SHIM_JS.contains("E_CUT_FEATURE"), "check-agent-update 已实现，垫片裁撤守卫应移除");
    }

    #[test]
    fn event_names_align_contract() {
        for ev in ["window-maximized", "notification-jump", "balance-changed", "pet-state"] {
            assert!(BRIDGE_SHIM_JS.contains(ev), "事件 {ev} 缺失");
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

    /// 内核页窗口控制条：decorations:false 主窗导航到内核 Web UI 后，
    /// 页面不认识 data-tauri-drag-region（Electron 用 -webkit-app-region，
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
    /// 左边；菜单含「检查 dsh 更新…」/更新源/三开关/reload/devtools/fullscreen/
    /// open-browser/open-logs/sponsor/about/quit；**不含「检查客户端更新…」**
    /// （唯一不展示的更新项；通道在壳侧保留但菜单不露出）。
    #[test]
    fn window_chrome_dots_menu_items() {
        for marker in [
            "dch-menu-btn",                    // ⋯ 按钮（30x28 同款）
            "cx: '2.4'",                       // 实心三点图形（Electron GLYPHS.menu 同款）
            "MENU_ID",                         // 菜单面板 id
            "menuItemHtml('check-agent-update'", // 保留「检查 dsh 更新…」
            "检查 dsh 更新",
            "更新源（点击复制）",
            "menuItemHtml('toggle-notify'",
            "menuItemHtml('toggle-close-to-tray'",
            "menuItemHtml('toggle-balance'",
            "menuItemHtml('reload'",
            "menuItemHtml('devtools'",
            "menuItemHtml('fullscreen'",
            "menuItemHtml('open-browser'",
            "menuItemHtml('open-logs'",
            "menuItemHtml('sponsor'",
            "☕ 请作者喝咖啡",
            "sponsorWindow()",                 // sponsor 走赞助窗通道
            "menuItemHtml('about'",
            "关于 DSH Desktop",
            "menuItemHtml('quit'",
            "' data-act=\"' + act",            // 菜单项统一带 data-act（事件路由键）
            "menu_action",                     // 动作统一经 menu_action 桥
        ] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "⋯ 菜单缺 {marker}");
        }
        // 渲染段（renderMenu 函数体）不得出现客户端更新项——全文断言会误伤
        // menu.action 注释里「为何不展示」的说明文字。
        let menu_seg = BRIDGE_SHIM_JS
            .split("function renderMenu()")
            .nth(1)
            .and_then(|s| s.split("function closeMenu()").next())
            .expect("renderMenu 函数段");
        assert!(!menu_seg.contains("check-client-update"), "客户端更新项不得进菜单");
        assert!(!menu_seg.contains("检查客户端更新"), "同上（中文文案）");
    }

    /// ⋯ 菜单交互契约：点击外部 / Escape 关闭；开关类 toggle 后重渲染（菜单
    /// 保持打开）；agent 更新检查就地回显（检查中…/可更新/已是最新/检查失败）；
    /// 自愈重注不重复挂 document 监听。
    #[test]
    fn window_chrome_dots_menu_interaction() {
        for marker in [
            "'Escape'",                     // Escape 关闭
            "bar.contains(e.target)",       // 点击面板外关闭（面板在条内）
            "installMenuHooks",             // document 监听一次性安装
            "menuHooksInstalled",           // 防自愈重注重复累积
            "renderMenu()",                 // toggle 成功后重渲染（菜单不关）
            "检查中…",                      // agent 更新检查就地反馈
            "已是最新",
            "检查失败",
            "可更新 v",
        ] {
            assert!(BRIDGE_SHIM_JS.contains(marker), "菜单交互缺 {marker}");
        }
        // 开关类点击不得关菜单（Electron 同语义：toggle 后留在菜单里看新状态）。
        let toggle_seg = BRIDGE_SHIM_JS
            .split("if (act === 'toggle-notify'")
            .nth(1)
            .and_then(|s| s.split("if (act === 'check-agent-update'").next())
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

/// 帧定位与生命周期（iframe 重复壳机制 / 监听表累积的历史缺陷回归锚点；
/// 行为级验证在 sidecar/bridge-shim.test.js 的 vm 沙箱测试，此处固化源码形态）。
#[cfg(test)]
mod frame_guard_tests {
    use super::BRIDGE_SHIM_JS;

    /// 守卫次序：IS_TOP 判定必须先于任何壳机制注册——历史缺陷是守卫写在
    /// 壳机制之后，每个同源 iframe 都装 5s 心跳 + 3s 会话轮询 + 4 个事件
    /// 订阅（开销随帧数翻倍，且 iframe 心跳污染全局计数、掩蔽主窗假死判定）。
    #[test]
    fn top_frame_guard_precedes_shell_machinery_shape() {
        assert!(BRIDGE_SHIM_JS.contains("var IS_TOP = false;"), "帧定位守卫缺失");
        assert!(BRIDGE_SHIM_JS.contains("window.top === window.self"), "守卫语义必须是 top===self");
        let guard_pos = BRIDGE_SHIM_JS.find("var IS_TOP = false;").expect("帧定位守卫位置");
        let top_block = BRIDGE_SHIM_JS.find("if (IS_TOP) {").expect("主框架壳机制分支");
        let first_listen = BRIDGE_SHIM_JS.find("onEvent('window-maximized'").expect("首个事件订阅");
        let first_beat = BRIDGE_SHIM_JS.find("send('renderer_heartbeat'").expect("首拍心跳");
        assert!(guard_pos < first_listen, "帧定位守卫必须先于事件订阅注册");
        assert!(guard_pos < first_beat, "帧定位守卫必须先于心跳发送");
        assert!(top_block < first_listen, "事件订阅必须在 IS_TOP 分支内（iframe 全跳过）");
    }

    /// 心跳窗口归属标签：主窗假死判定只统计 main；浮窗（__DSH_FLOAT__）与
    /// 宠物窗（__DSH_PET__）独立标签——多窗共用一个全局计数时，活的浮窗会
    /// 永久掩蔽死的主窗（漏恢复），反之亦然（误重载）。
    #[test]
    fn heartbeat_carries_window_label_shape() {
        assert!(BRIDGE_SHIM_JS.contains("WINDOW_LABEL"), "心跳必须带窗口归属标签");
        assert!(BRIDGE_SHIM_JS.contains("window.__DSH_FLOAT__"), "浮窗标签判定缺失");
        assert!(BRIDGE_SHIM_JS.contains("window.__DSH_PET__"), "宠物窗标签判定缺失");
        let beat = BRIDGE_SHIM_JS.find("send('renderer_heartbeat', { window: WINDOW_LABEL })").expect("心跳发送必须带标签");
        let label_def = BRIDGE_SHIM_JS.find("var WINDOW_LABEL = 'main';").expect("标签定义");
        assert!(label_def < beat, "标签定义必须先于心跳发送");
    }

    /// pagehide 生命周期：plugin:event|listen 注册的监听在页面导航/重载后
    /// 由 Rust 侧监听表持有死回调——必须经 plugin:event|unlisten 退订 + 清
    /// 定时器（历史缺陷：listen 只增不减）。
    #[test]
    fn pagehide_unlistens_events_and_clears_timers_shape() {
        assert!(BRIDGE_SHIM_JS.contains("plugin:event|unlisten"), "必须经 plugin:event|unlisten 退订");
        assert!(BRIDGE_SHIM_JS.contains("onPageHide"), "必须有 pagehide 收尾函数");
        assert!(BRIDGE_SHIM_JS.contains("addEventListener('pagehide'"), "必须挂 pagehide 监听");
        assert!(BRIDGE_SHIM_JS.contains("clearInterval(lifecycleTimers.pop())"), "pagehide 必须清壳机制定时器");
    }
}
