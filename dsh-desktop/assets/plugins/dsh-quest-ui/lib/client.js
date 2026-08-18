// dsh-quest-ui — Quest 模式界面（DSH Desktop 配套插件，浏览器半边）
//
// 工作原理：通用设置里的开关写入持久化设置 questMode；本文件订阅该设置，
// 在 <body> 上打/摘 data-dsh-quest-ui 属性；全部视觉变化由
// body[data-dsh-quest-ui] 作用域下的 CSS 完成；仅当模式开启时才挂载一个
// 200ms 去抖的单一 MutationObserver 做少量结构性增强（分组头、药丸条）。
//
// 性能合同（纲要 §0.3）：
//   P1 关闭态零开销 —— 只保留 settings 订阅回调，无观察器/定时器；
//   P2 开启态单一观察器，统一 200ms 去抖；
//   P3 观察器回调先算指纹，指纹不变直接 return；
//   P7 只插入自有节点/写属性/CSS 隐藏，绝不移动/删除 React 管理的节点；
//   P8 所有入口与回调整体 try/catch，异常静默（可 console.warn）。
//
// 纯逻辑挂在 window.__dshQuestUiCore 上（生产无副作用），node 测试套件
// 直接评估本文件验证 — 官方模块加载器只支持 classic script，不能 import。
(function () {
	'use strict';

	// ───────────────────────── 纯逻辑（可测） ─────────────────────────
	var GROUP_LABELS = { quests: 'Quests', chats: '会话' };
	var PILL_TEXTS = ['运行于 dsh', 'Quest 模式'];

	// 分组规划（二期预留关键词分组）：一期恒把全部下标归入 quests，
	// 逻辑骨架照抄 dsh-settings-groups 的同名函数。
	function partitionItems(titles) {
		var quests = [];
		var chats = [];
		for (var i = 0; i < titles.length; i++) {
			// 一期：所有会话都归入 Quests 组；关键词分组为二期需求。
			quests.push(i);
		}
		return { quests: quests, chats: chats };
	}

	// 指纹：把「目标区域的结构摘要」映射为稳定字符串。摘要含自有节点
	// 存在位 —— React 重渲染抹掉自有节点时存在位翻转，指纹随之变化，
	// 观察器下一轮即重放恢复（dsh-settings-groups 已验证方案）。
	function fingerprint(summary) {
		if (!summary) return '';
		return 'n' + (summary.sessionCount | 0)
			+ '|h' + (summary.headPresent ? '1' : '0')
			+ '|p' + (summary.pillsPresent ? '1' : '0')
			+ '|c' + (summary.conversationReady ? '1' : '0');
	}

	// 二期预留：workspace/git 元信息（分支名药丸）。一期恒返回 null。
	function readWorkspaceMeta() {
		return null;
	}

	window.__dshQuestUiCore = {
		GROUP_LABELS: GROUP_LABELS,
		PILL_TEXTS: PILL_TEXTS.slice(),
		partitionItems: partitionItems,
		fingerprint: fingerprint,
		readWorkspaceMeta: readWorkspaceMeta
	};

	// ───────────────────────── 浏览器半边 ─────────────────────────
	window.__ModuleLoader__.load({
		id: "@deepseek-ai/dsh-quest-ui",
		factory: (require) => {
			var module = { exports: {} };
			var exports = module.exports;
			Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

			const react = require("react");
			const { jsx, jsxs } = require("react/jsx-runtime");
			const { bindSnapshotSelector } = require("@deepseek-ai/dsh-client-web-react");

			// ------------------------------------------------------------------
			// Settings
			// ------------------------------------------------------------------
			const NS = "dsh-quest-ui";
			const L = {
				questTitle: "Quest 模式界面",
				questDesc: "启用类 Quest 的沉浸式界面：分组会话栏与卡片式输入区。切换即时生效，默认关闭且关闭时零性能开销。",
				questOn: "已开启",
				questOff: "已关闭"
			};

			// 通用设置开关行样式（qdu- 前缀）。开关行不依赖 body 属性 ——
			// 模式关闭时也必须可见；风格与 Quest 设置页行语言保持一致。
			const ROW_CSS = [
				".qdu-row{border-bottom:1px solid var(--qdu-line,#e8eaed);align-items:center;gap:8px;padding:14px 4px;margin:0 -4px;display:flex;border-radius:8px;transition:background-color .15s ease}",
				".qdu-row:hover{background:var(--qdu-hover,rgba(38,49,72,.045))}",
				".qdu-rowText{flex-direction:column;flex:1;gap:3px;min-width:0;padding-right:48px;display:flex}",
				".qdu-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}",
				".qdu-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}",
				".qdu-switch{width:42px;height:24px;background:var(--dsw-alias-border-l2,rgba(0,0,0,.14));cursor:pointer;border:none;border-radius:999px;flex:none;position:relative;transition:background .18s ease}",
				".qdu-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary,#4176e6)}",
				".qdu-switch:disabled{opacity:.45;cursor:default}",
				".qdu-knob{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.25);transition:transform .18s cubic-bezier(.4,0,.2,1)}",
				".qdu-switch[aria-checked=true] .qdu-knob{transform:translateX(18px)}"
			].join("");

			// 主题 CSS（Quest 风格 reskin）：每条规则都必须以 body[data-dsh-quest-ui]
			// 开头（验收静态扫描）；设计令牌全部映射宿主 --dsw-alias-* token，
			// 深浅色自动兼容。选择器基于实机探测的宿主结构（语义后缀子串匹配
			// + 当前版本 hash 前缀双保险，与 conversation-tweaks 用 .Md3f7G_flowItem
			// 同策略：hash 版本内稳定，升级失配时安静降级）。
			//
			// 宿主结构锚点（实机 CDP 探测）：
			//   侧栏  .qDHVXG_list > .qDHVXG_groupSection > span > div[role=treeitem]
			//         .YDXeBa_sessionRow / .YDXeBa_projectRow / .YDXeBa_selected
			//   主区  .pI_x6G_centerCol > [slot=conversation] > .wSkVaW_root
			//   输入  .wSkVaW_composerStack(.wSkVaW_composerHero 空态 hero 形态)
			//         > .uV2eYG_root(.uV2eYG_hero) > .uV2eYG_card > textarea.uV2eYG_input
			//   消息  .Md3f7G_flowItem[data-chat-flow-kind] > .Sxvs8a_root
			const CSS = [
				// —— 设计令牌（实测宿主仅定义 interactive/border/label/business 四组
				//    token，container-bg-* 为空；卡片/画布底色用自定字面量）——
				'body[data-dsh-quest-ui]{--qdu-radius-hero:20px;--qdu-radius-card:14px;--qdu-radius-item:8px;--qdu-radius-pill:999px;--qdu-bg-card:#ffffff;--qdu-bg-canvas:#f7f8fa;--qdu-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));--qdu-active:var(--dsw-alias-interactive-bg-active,rgba(38,49,72,.10));--qdu-line:var(--dsw-alias-border-l2,rgba(0,0,0,.10));--qdu-line-soft:var(--dsw-alias-border-l1,rgba(0,0,0,.05));--qdu-accent:var(--dsw-alias-state-business-primary,#4176e6);--qdu-label-1:var(--dsw-alias-label-primary,#0f1115);--qdu-label-2:var(--dsw-alias-label-secondary,#61666b);--qdu-label-3:var(--dsw-alias-label-tertiary,#818590);--qdu-shadow-float:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06);--qdu-shadow-float-lg:0 2px 4px rgba(16,24,40,.05),0 16px 40px rgba(16,24,40,.10);--qdu-ease:cubic-bezier(.4,0,.2,1)}',
			
				// —— Q1 主画布：中央列换更干净的画布底，与侧栏拉开层次 ——
				'body[data-dsh-quest-ui] [class*="_centerCol"]{background:var(--qdu-bg-canvas)}',
			
				// —— Q2 侧边会话栏（Qoder Quest 分组列表风）：大间距圆角行 +
				//    选中态主色浅底 + 行内文字降噪 ——
				'body[data-dsh-quest-ui] [role="treeitem"]{border-radius:var(--qdu-radius-item);transition:background-color .15s ease,color .15s ease}',
				'body[data-dsh-quest-ui] [role="treeitem"]:hover{background:var(--qdu-hover)}',
				'body[data-dsh-quest-ui] [role="treeitem"][aria-selected="true"]{background:var(--qdu-active)}',
				// 工作区标题（"工作区"）→ 小号大写字距标签；侧栏搜索框胶囊化
				'body[data-dsh-quest-ui] [class*="_sectionLabel"]{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--qdu-label-3)}',
				'body[data-dsh-quest-ui] [class*="_search"]:not(textarea){border-radius:var(--qdu-radius-pill);border:1px solid transparent;transition:border-color .15s ease,background-color .15s ease}',
				'body[data-dsh-quest-ui] [class*="_search"]:not(textarea):hover{border-color:var(--qdu-line)}',
				'body[data-dsh-quest-ui] [class*="_search"]:not(textarea):focus-within{border-color:color-mix(in srgb,var(--qdu-accent) 45%,transparent)}',
				// 行标题与时间戳降噪（限定侧栏容器，避免误伤主区）
				'body[data-dsh-quest-ui] [class*="_groupSection"] [class*="_title"]{color:var(--qdu-label-1)}',
				'body[data-dsh-quest-ui] [class*="_groupSection"] [class*="_time"]{color:var(--qdu-label-3)}',
				// 侧栏分隔线柔化（宽度不变；!important 压宿主 hashed 类边框色）
				'body[data-dsh-quest-ui] [class$="_sidebar"],body[data-dsh-quest-ui] [class$="_Sidebar"]{border-right:1px solid var(--qdu-line-soft)!important}',
			
				// —— Q3 中央输入区（Qoder Quest 打开式）：去边框去嵌套，白底大圆角
				//    开阔区域靠浅灰画布衬托轮廓，按钮与提示贴大区域下缘两端分布 ——
				// 外壳（hero 空态与 normal 会话态共用）：无框无影，豁达打开
				// !important：压宿主自带边框，彻底解除“框中框”束缚
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea){position:relative;display:flex;flex-direction:column;background:transparent!important;border:none!important;box-shadow:none!important;border-radius:0;min-height:140px;padding:0 10px 2px!important;transition:box-shadow .18s var(--qdu-ease)}',
				// 聚焦反馈：仅顶部 2px 主色直线（平角）——下方不再出现任何弧形蓝边
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea):focus-within{box-shadow:none!important}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea):focus-within::after{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:color-mix(in srgb,var(--qdu-accent) 70%,transparent);border-radius:0;pointer-events:none}',
				// 空态 hero：大区域（240px）、内容顶到左上，与画布完全融合（无边角）
				'body[data-dsh-quest-ui] [class*="_composerHero"] [class*="_root"]:has(textarea){border-radius:0;box-shadow:none!important;min-height:240px;display:flex;flex-direction:column;justify-content:flex-start}',
				'body[data-dsh-quest-ui] [class*="_composerHero"]{max-width:820px;margin:0 auto;width:100%}',
				// 输入区内层完全透明化（宿主 card/backdrop 自带底色是“生搬感”根源）；
				// card/scroll 纵向撑满使工具行贴底；打破宿主 780px 居中限宽 ——
				// 输入卡占满整个下栏，从左上角开始（v0.4.1：豁达全开）
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_card"]{position:static!important;border-radius:inherit;background:transparent!important;flex:1;display:flex;flex-direction:column;width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_card"] > [class*="_scroll"]{flex:1;width:100%!important;max-width:none!important;margin:0!important}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_grow"] [class*="_backdrop"]{background:transparent!important;border:none!important;box-shadow:none!important}',
				// textarea：大幅打开 —— normal 态 72px、hero 态 96px，大呼吸内边距
				'body[data-dsh-quest-ui] [class*="_composerStack"] textarea{background:transparent;border-radius:14px;padding:16px 18px 8px;min-height:72px}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] textarea::placeholder{color:var(--qdu-label-3);opacity:.75}',
				'body[data-dsh-quest-ui] [class*="_composerHero"] textarea{min-height:96px}',
				// 发送键：36px 圆形主色，无投影无浮动（下方干净利落）
				// !important：宿主 normal 态自带 8px 方圆角与尺寸
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[class*="_primary"]{width:36px;height:36px;border-radius:999px!important;box-shadow:none!important;transition:opacity .15s ease}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[class*="_primary"]:hover{opacity:.88}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[class*="_primary"]:active{opacity:.75}',
				// 工具行图标钮（命令/附件）：幽灵圆形，去宿主灰底
				// !important + 双属性选择器提升特异性：宿主对 _add 也用了 ！important
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] button[class*="_add"],body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] .dsh-vision-attach-btn{width:32px;height:32px;border-radius:999px!important;background:transparent!important;background-color:transparent!important;color:var(--qdu-label-2)}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] button[class*="_add"]:hover,body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] .dsh-vision-attach-btn:hover{background:var(--qdu-hover)!important;color:var(--qdu-label-1)}',
				// 文字选择器（访问模式/选择模型/上下文环）：去描边去底色的幽灵文字钮
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="访问模式"],body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="选择模型"]{height:28px;border:none!important;border-radius:8px!important;background:transparent!important;background-color:transparent!important;color:var(--qdu-label-2)!important;font-size:12px;box-shadow:none!important;transition:background-color .15s ease,color .15s ease}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="访问模式"]:hover,body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="选择模型"]:hover{background:var(--qdu-hover)!important;color:var(--qdu-label-1)!important}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="上下文"]{border-radius:999px!important;transition:background-color .15s ease}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="上下文"]:hover{background:var(--qdu-hover)!important}',
				// 工具行：绝对定位钉在 root 最底缘（摆脱宿主 card 固定高度限制），
				// 两端分布（左工具组贴左缘 / 右发送组贴右缘）
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"]{position:absolute;left:10px;right:10px;bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 8px}',
				// 余额信息（dsh-balance dock，root 下独占一行）：绝对定位到
				// 工具行同一最底层的中部，与发送键同层，下方不再多出一行
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea) > div:has(.dsh-balance-wrap){display:block;position:absolute;left:50%;transform:translateX(-50%);bottom:10px;margin:0!important;max-width:60%;overflow:hidden;white-space:nowrap}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea) > div:has(.dsh-balance-wrap) .dsh-balance-wrap{white-space:nowrap}',
				// 会话统计条：突破宿主 748px 居中限宽的外层 wrapper，左对齐贴缘，降噪小字
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea) > div:has([class*="_sep"]){width:100%!important;max-width:none!important;margin:0!important;padding:8px 14px 0;box-sizing:border-box}',
				'body[data-dsh-quest-ui] div:has(> span[class*="_sep"]){color:var(--qdu-label-3);font-size:11px;width:100%;max-width:none!important;justify-content:flex-start!important;flex-wrap:wrap}',
				'body[data-dsh-quest-ui] span[class*="_sep"]{color:var(--qdu-line)}',
			
				// —— Q4 消息流降噪：助手消息圆角、去硬边框；用户消息仅圆角化
				//    （不给背景，避免误伤宿主首子元素（如头像）的既有底色）——
				'body[data-dsh-quest-ui] [data-chat-flow-kind="assistant"]{border-radius:var(--qdu-radius-card)}',
				// !important：覆盖宿主 hashed 类气泡边框色（去硬边框改柔和）
				'body[data-dsh-quest-ui] [class*="_flowItem"] [class*="_root"]{border-radius:var(--qdu-radius-card)}',
				'body[data-dsh-quest-ui] [data-chat-flow-kind="user"] > *:first-child{border-radius:var(--qdu-radius-card)}',
			
				// —— Q5 按钮统一圆角与过渡（排除自有 qdu-* 节点）；文本输入白底柔和
				//    描边 + 聚焦主色光环；键盘焦点环主色半透明 ——
				'body[data-dsh-quest-ui] button:not([class^="qdu-"]){border-radius:var(--qdu-radius-item);transition:border-radius .15s var(--qdu-ease),background-color .15s var(--qdu-ease),box-shadow .15s var(--qdu-ease),color .15s var(--qdu-ease)}',
				'body[data-dsh-quest-ui] input[type="text"],body[data-dsh-quest-ui] input[type="search"],body[data-dsh-quest-ui] input[type="password"]{border-radius:var(--qdu-radius-item);border:1px solid var(--qdu-line);transition:border-color .15s ease,box-shadow .15s ease}',
				'body[data-dsh-quest-ui] input[type="text"]:focus,body[data-dsh-quest-ui] input[type="search"]:focus,body[data-dsh-quest-ui] input[type="password"]:focus{border-color:color-mix(in srgb,var(--qdu-accent) 45%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--qdu-accent) 12%,transparent);outline:none}',
				'body[data-dsh-quest-ui] button:focus-visible,body[data-dsh-quest-ui] [role="treeitem"]:focus-visible,body[data-dsh-quest-ui] a:focus-visible{outline:2px solid color-mix(in srgb,var(--qdu-accent) 55%,transparent);outline-offset:2px}',

				// —— Q5b 设置弹窗重设计（VOzbGW_* mask/panel/navList/options）：
				//    浮起大圆角面板 + 导航胶囊选中（主色浅底 + 左侧指示条）+
				//    内容行柔和分隔 + hover 圆角块 ——
				'body[data-dsh-quest-ui] [class*="_mask"]{background:rgba(16,24,40,.28)!important;backdrop-filter:blur(3px)}',
				'body[data-dsh-quest-ui] [role="dialog"][class*="_panel"]{border-radius:var(--qdu-radius-hero);background:var(--qdu-bg-card);box-shadow:var(--qdu-shadow-float-lg);border:1px solid color-mix(in srgb,var(--qdu-label-1) 6%,transparent);overflow:hidden}',
				'body[data-dsh-quest-ui] [class*="_navList"] button{border-radius:var(--qdu-radius-item);transition:background-color .15s var(--qdu-ease),color .15s var(--qdu-ease)}',
				'body[data-dsh-quest-ui] [class*="_navList"] button:hover{background:var(--qdu-hover)}',
				'body[data-dsh-quest-ui] [class*="_navList"] button[aria-selected="true"],body[data-dsh-quest-ui] [class*="_navList"] button[class*="ctive"]{background:color-mix(in srgb,var(--qdu-accent) 9%,transparent);color:var(--qdu-label-1);font-weight:500;position:relative}',
				'body[data-dsh-quest-ui] [class*="_navList"] button[aria-selected="true"]::before,body[data-dsh-quest-ui] [class*="_navList"] button[class*="ctive"]::before{content:"";position:absolute;left:2px;top:50%;transform:translateY(-50%);width:3px;height:16px;border-radius:2px;background:var(--qdu-accent)}',
				// 内容区行（通用设置 settings.general.item）：柔和分隔 + hover 圆角块
				'body[data-dsh-quest-ui] [data-slot="settings.general.item"]{border-bottom:1px solid var(--qdu-line-soft)!important;transition:background-color .15s ease}',
				'body[data-dsh-quest-ui] [data-slot="settings.general.item"]:hover{background:var(--qdu-hover)}',
				// 设置弹窗导航与内容区之间分隔线柔化（排除 navList 自身避免双线）
				'body[data-dsh-quest-ui] [class*="_nav"]:not([class*="_navList"]){border-right:1px solid var(--qdu-line-soft)}',
			
				// —— Q6 细滚动条（8px、圆角、半透明；后代与 body 自身两种前缀变体）——
				'body[data-dsh-quest-ui] ::-webkit-scrollbar{width:8px;height:8px}',
				'body[data-dsh-quest-ui] ::-webkit-scrollbar-thumb{border-radius:var(--qdu-radius-pill);background:rgba(127,127,127,.28)}',
				'body[data-dsh-quest-ui] ::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.45)}',
				'body[data-dsh-quest-ui] ::-webkit-scrollbar-track{background:transparent}',
				'body[data-dsh-quest-ui]::-webkit-scrollbar{width:8px;height:8px}',
				'body[data-dsh-quest-ui]::-webkit-scrollbar-thumb{border-radius:var(--qdu-radius-pill);background:rgba(127,127,127,.28)}',
				'body[data-dsh-quest-ui]::-webkit-scrollbar-track{background:transparent}',
			
				// —— 自有节点：侧栏分组头（Qoder Quest 小号大写字距标签）——
				'body[data-dsh-quest-ui] .qdu-nav-head{box-sizing:border-box;padding:12px 12px 6px;font-size:11px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--qdu-label-3);user-select:none}',
			
			// （v0.4.4：胶囊样式已彻底移除，节点与 CSS 均不再存在）
			
				// —— 空态建议卡：圆点前缀（::before 14px 描边圆）+ 40px 行高 +
				//    hover 浅底；官方欢迎页有建议条目时才命中，无条目安静无效 ——
				'body[data-dsh-quest-ui] [class*="suggestion"] button,body[data-dsh-quest-ui] [class*="Suggestion"] button{position:relative;display:flex;align-items:center;min-height:40px;padding-left:32px;border-radius:var(--qdu-radius-item);transition:background-color .15s ease}',
				'body[data-dsh-quest-ui] [class*="suggestion"] button::before,body[data-dsh-quest-ui] [class*="Suggestion"] button::before{content:"";position:absolute;left:9px;width:14px;height:14px;box-sizing:border-box;border:1.5px solid var(--qdu-label-3);border-radius:50%}',
				'body[data-dsh-quest-ui] [class*="suggestion"] button:hover,body[data-dsh-quest-ui] [class*="Suggestion"] button:hover{background:var(--qdu-bg-hover)}'
			].join("");

			function ensureCss() {
				if (typeof document === "undefined") return;
				const tagId = "@deepseek-ai/dsh-quest-ui/client.css";
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]")) return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "@deepseek-ai/dsh-quest-ui";
				tag.dataset.pluginCss = tagId;
				tag.textContent = ROW_CSS + CSS;
				document.head.appendChild(tag);
			}

			// ------------------------------------------------------------------
			// 设置-通用：Quest 模式界面开关行（逐行仿写 conversation-tweaks 的
			// QuietOutputRow，仅改文案、字段与类名前缀）
			// ------------------------------------------------------------------
			function QuestModeRow({ useScope, scope }) {
				const snap = useScope((s) => s);
				const ready = snap && snap.status === "ready";
				const enabled = !!(ready && snap.value && snap.value.questMode === true);
				return jsxs("div", {
					className: "qdu-row",
					children: [
						jsxs("div", {
							className: "qdu-rowText",
							children: [
								jsx("div", { className: "qdu-title", children: L.questTitle }),
								jsx("div", { className: "qdu-desc", children: L.questDesc })
							]
						}),
						jsx("button", {
							type: "button",
							role: "switch",
							"aria-checked": enabled,
							"aria-label": L.questTitle,
							title: enabled ? L.questOn : L.questOff,
							className: "qdu-switch",
							disabled: !ready || !snap.writable,
							onClick: () => { scope.set("questMode", !enabled).catch(() => {}); },
							children: jsx("span", { className: "qdu-knob" })
						})
					]
				});
			}

			// ------------------------------------------------------------------
			// DOM 增强（仅开启态挂载；全部只插自有节点，绝不搬 React 节点）
			// ------------------------------------------------------------------
			var HEAD_CLASS = "qdu-nav-head";
			var PILLBAR_CLASS = "qdu-pillbar";

			// 移除全部自有节点（幂等；自有节点可安全删除，P7 只保护宿主节点）。
			function removeOwnedNodes(cls) {
				var nodes = document.querySelectorAll("." + cls);
				for (var i = 0; i < nodes.length; i++) {
					if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
				}
			}

			// 会话行：侧栏树行（role=treeitem，官方 hashed 类名不可靠，走结构
			// 定位；与 dsh-better-sidebar 同锚点）。
			function sessionRows() {
				return document.querySelectorAll('[role="treeitem"]');
			}

			// 阶段四：侧栏分组头「Quests」。先清后插保证幂等（防 slots/观察器
			// 回调多次触发与切换会话后的重复堆叠）；找不到会话行时安静返回。
			// 一期全部会话归入 Quests 一组，分组头插在第一个会话行之前；二期
			// 关键词分组时改用 partitionItems(titles) 取两组首个下标定位交界。
			function applySidebarHead() {
				removeOwnedNodes(HEAD_CLASS);
				var rows = sessionRows();
				if (!rows.length) return;
				var first = rows[0];
				var head = document.createElement("div");
				head.className = HEAD_CLASS;
				head.textContent = window.__dshQuestUiCore.GROUP_LABELS.quests;
				if (first.parentNode) first.parentNode.insertBefore(head, first);
			}

			// 阶段五（v0.4.1 调整）：按用户反馈移除元数据药丸条 —— 中间不再插入
			// 任何胶囊节点，输入域直接顶到下栏左上，其余部件压至最底缘。
			// 核心接口（PILL_TEXTS/readWorkspaceMeta）与指纹字段保留供二期恢复。
			function applyMetaPills() {
				return;
			}

			// 目标区域结构摘要（指纹输入）：会话行数 + 自有节点存在位 + 主区就绪位。
			function summaryNow() {
				return {
					sessionCount: sessionRows().length,
					headPresent: !!document.querySelector("." + HEAD_CLASS),
					pillsPresent: !!document.querySelector("." + PILLBAR_CLASS),
					conversationReady: !!document.querySelector('[data-slot="conversation"]')
				};
			}

			// 统一增强器入口（P1/P2/P3）：开启才挂单一观察器，关闭彻底拆除。
			var questEnhancers = {
				_observer: null,
				_timer: null,
				_fp: "",
				setOn: function (on) {
					if (on && !this._observer) this._mount();
					if (!on) this._unmount(); // 关闭态彻底拆除，落实 P1
				},
				_mount: function () {
					if (typeof MutationObserver === "undefined") return;
					var self = this;
					this._observer = new MutationObserver(function () {
						if (self._timer) return; // 200ms 去抖（P2）
						self._timer = setTimeout(function () {
							self._timer = null;
							self._scan();
						}, 200);
					});
					try {
						this._observer.observe(document.body, { childList: true, subtree: true });
					} catch (e) {
						this._observer = null;
						return;
					}
					this._scan();
				},
				_unmount: function () {
					if (this._timer) { clearTimeout(this._timer); this._timer = null; }
					if (this._observer) { this._observer.disconnect(); this._observer = null; }
					this._removeAllOwnedNodes(); // 摘掉全部 qdu-* 自有节点
					this._fp = "";
				},
				_removeAllOwnedNodes: function () {
					try {
						removeOwnedNodes(HEAD_CLASS);
						removeOwnedNodes(PILLBAR_CLASS);
					} catch (e) { /* P8：静默 */ }
				},
				_scan: function () {
					try {
						var fp = window.__dshQuestUiCore.fingerprint(summaryNow());
						if (fp === this._fp) return; // 指纹去重（P3）
						this._fp = fp;
						applySidebarHead(); // 阶段四
						applyMetaPills();   // 阶段五
					} catch (e) { /* P8：静默 */ }
				}
			};

			// ------------------------------------------------------------------
			// 插件入口
			// ------------------------------------------------------------------
			function applyInner(ctx) {
				ensureCss();

				const scope = ctx.settingsScope.bind({ namespace: NS });
				const useScope = bindSnapshotSelector(scope);

				// 模式标志应用（整个插件的枢纽）：设置订阅回调里打/摘 body
				// 属性，并联动增强器挂载/拆除。
				const applyMode = () => {
					try {
						if (typeof document === "undefined" || !document.body) return;
						const snap = scope.getSnapshot();
						const on = !!(snap && snap.status === "ready" && snap.value && snap.value.questMode === true);
						if (on) document.body.setAttribute("data-dsh-quest-ui", "1");
						else document.body.removeAttribute("data-dsh-quest-ui");
						questEnhancers.setOn(on); // 只在 on 时挂观察器，off 时彻底拆除
					} catch (e) {
						console.warn("[dsh-quest-ui] applyMode failed: " + ((e && e.message) || e));
					}
				};
				applyMode();
				scope.subscribe(applyMode);

				// keyed slot 注册必须带 id（缺 id 会直接崩 dsh loader，坑 2）。
				ctx.slots.inject("settings.general.item", () => ctx.slots.register({
					name: "settings.general.item",
					id: "quest-ui-mode",
					order: 18,
					inject: () => ({ useScope, scope })
				}, QuestModeRow), "dsh-quest-ui: quest mode row");

				// 插件卸载时彻底拆除增强器（清理回调语义）。
				ctx.effect(() => () => questEnhancers.setOn(false), "dsh-quest-ui: teardown enhancers");
			}

			function apply(ctx) {
				try {
					applyInner(ctx);
				} catch (error) {
					console.warn("[dsh-quest-ui] apply failed: " + ((error && error.message) || error));
				}
			}

			exports.apply = apply;
			exports.inject = ["slots", "settingsScope"];
			return module.exports;
		}
	});
})();
