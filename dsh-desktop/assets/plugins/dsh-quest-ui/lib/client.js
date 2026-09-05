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
			// bindSnapshotSelector 三级回落（高级设置空白根因修复，issue #124）：
			// rc.8 的 dsh-client-ui-renderer 只导出 apply/inject——require 成功但解构
			// useSyncExternalStoreWithSelector 得 undefined（try 不抛、catch 永不触发），
			// 组件首渲染即 TypeError → slot entry crash 退位 → dead cell → 栏目空白。
			//   1) renderer.useSyncExternalStoreWithSelector —— 仅当真实导出（typeof 校验）
			//   2) web-react.bindSnapshotSelector —— rc.7 官方包（Tauri 由 client-compat
			//      注入页面模块表；Electron 0.4.x 前端 dist 自带）
			//   3) react 原生 useSyncExternalStore 兜底 —— 整快照引用稳定（宿主源均
			//      freeze 快照），selector 每渲染求值；isEqual 语义退化为 Object.is。
			let bindSnapshotSelector;
			try {
				const rendererMod = require("@deepseek-ai/dsh-client-ui-renderer");
				if (typeof rendererMod.useSyncExternalStoreWithSelector === "function") {
					const useSESWS = rendererMod.useSyncExternalStoreWithSelector;
					bindSnapshotSelector = (source) => {
						const subscribe = (fn) => source.subscribe(fn);
						const getSnapshot = () => source.getSnapshot();
						return (selector, isEqual) => useSESWS(subscribe, getSnapshot, void 0, selector, isEqual);
					};
				}
			} catch { /* 模块不在页面表（rc.7 及更早内核）→ 走下一级回落 */ }
			if (!bindSnapshotSelector) {
				try {
					const webReactMod = require("@deepseek-ai/dsh-client-web-react");
					if (typeof webReactMod.bindSnapshotSelector === "function") bindSnapshotSelector = webReactMod.bindSnapshotSelector;
				} catch { /* compat 未注入（罕见）→ react 原生兜底 */ }
			}
			if (!bindSnapshotSelector) {
				const { useSyncExternalStore } = require("react");
				bindSnapshotSelector = (source) => {
					const subscribe = (fn) => source.subscribe(fn);
					const getSnapshot = () => source.getSnapshot();
					return (selector) => selector(useSyncExternalStore(subscribe, getSnapshot));
				};
			}

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
				// 设置行：纯文本行风格（无圆角块无 hover 底色，仅保留柔和分隔线）
				".qdu-row{border-bottom:1px solid var(--qdu-line,#e8eaed);align-items:center;gap:8px;padding:14px 0;display:flex}",
				".qdu-rowText{flex-direction:column;flex:1;gap:3px;min-width:0;padding-right:48px;display:flex}",
				".qdu-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}",
				".qdu-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}",
				".qdu-switch{width:42px;height:24px;background:var(--dsw-alias-border-l2,rgba(0,0,0,.14));cursor:pointer;border:none;border-radius:999px;flex:none;position:relative;transition:background .18s ease}",
				".qdu-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary,#4176e6)}",
				".qdu-switch:disabled{opacity:.45;cursor:default}",
				".qdu-knob{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.25);transition:transform .18s cubic-bezier(.4,0,.2,1)}",
				".qdu-switch[aria-checked=true] .qdu-knob{transform:translateX(18px)}"
			].join("");

			// dsh-synapse 会话地图适配（双 UI 通用，不锁 body[data-dsh-quest-ui]
			// 作用域——默认 UI 与 Quest UI 都生效）：切换按钮与顶部 Session log
			// （wSkVaW_headerUtilities，y≈48）同一水平面；地图 overlay 下移避开
			// Electron 自绘标题栏（0-36px），否则 iframe 内 topbar 被挡上半截。
			// 颜色用字面量（默认 UI 下 --qdu-* 令牌不存在），与 ROW_CSS 同为
			// 无作用域常量，随 ensureCss 一并注入。
			const SYNAPSE_CSS = [
				".dsh-synapse-switch{top:48px!important;border:1px solid rgba(15,17,21,.10)!important;background:#ffffff!important;box-shadow:0 1px 3px rgba(16,24,40,.06)!important;border-radius:999px!important}",
				".dsh-synapse-switch button{font-weight:500!important;color:#61666b!important;border-radius:999px!important;transition:background-color .15s cubic-bezier(.4,0,.2,1),color .15s cubic-bezier(.4,0,.2,1)!important}",
				".dsh-synapse-switch button:hover{background:rgba(38,49,72,.06)!important;color:#0f1115!important}",
				".dsh-synapse-switch button.active{background:#4176e6!important;color:#fff!important}",
				".dsh-synapse-overlay{animation:qdu-synapse-fade-in .18s cubic-bezier(.4,0,.2,1);top:36px!important}",
				"@keyframes qdu-synapse-fade-in{from{opacity:0}to{opacity:1}}"
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
				// dsh-compat:composer-editable —— 输入区这批规则原先全锚在 textarea 上：
				// composer 换代成 Lexical contenteditable 后 :has(textarea) 命中 0、
				// [class*="_composerStack"] textarea 也命中 0（实机 [data-input-scroll]
				// 内 textarea=0、contenteditable=1），整个 Q3 输入区重皮静默失效。
				// 现两代并列：旧内核照旧，当前内核经 [data-composer-input] 恢复生效。
				// 外壳（hero 空态与 normal 会话态共用）：无框无影，豁达打开
				// !important：压宿主自带边框，彻底解除“框中框”束缚
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea, [data-composer-input]){position:relative;display:flex;flex-direction:column;background:transparent!important;border:none!important;box-shadow:none!important;border-radius:0;min-height:140px;padding:0 10px 2px!important;transition:box-shadow .18s var(--qdu-ease)}',
				// 聚焦反馈：仅顶部 2px 主色直线（平角）——下方不再出现任何弧形蓝边
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea, [data-composer-input]):focus-within{box-shadow:none!important}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea, [data-composer-input]):focus-within::after{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:color-mix(in srgb,var(--qdu-accent) 95%,transparent);border-radius:0;pointer-events:none}',
				// 空态 hero：大区域（240px）、内容顶到左上，与画布完全融合（无边角）
				'body[data-dsh-quest-ui] [class*="_composerHero"] [class*="_root"]:has(textarea, [data-composer-input]){border-radius:0;box-shadow:none!important;min-height:240px;display:flex;flex-direction:column;justify-content:flex-start}',
				'body[data-dsh-quest-ui] [class*="_composerHero"]{max-width:820px;margin:0 auto;width:100%}',
				// 输入区内层完全透明化（宿主 card/backdrop 自带底色是“生搬感”根源）；
				// card/scroll 纵向撑满使工具行贴底；打破宿主 780px 居中限宽 ——
				// 输入卡占满整个下栏，从左上角开始（v0.4.1：豁达全开）
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_card"]{position:static!important;border-radius:inherit;background:transparent!important;flex:1;display:flex;flex-direction:column;width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_card"] > [class*="_scroll"]{flex:1;width:100%!important;max-width:none!important;margin:0!important;padding-bottom:44px!important;box-sizing:border-box}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_grow"] [class*="_backdrop"]{background:transparent!important;border:none!important;box-shadow:none!important}',
				// 输入区本体：大幅打开 —— normal 态 72px、hero 态 96px，大呼吸内边距。
				// 两代 composer：<textarea>（旧）与 [data-composer-input] 的 Lexical
				// contenteditable（当前）。占位符旧内核走 ::placeholder，当前内核是一个
				// 独立的 [data-composer-placeholder] 元素（实机 div.fbHfZa_placeholder）。
				'body[data-dsh-quest-ui] [class*="_composerStack"] textarea,body[data-dsh-quest-ui] [class*="_composerStack"] [data-composer-input]{background:transparent;border-radius:14px;padding:16px 18px 8px;min-height:72px}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] textarea::placeholder,body[data-dsh-quest-ui] [class*="_composerStack"] [data-composer-placeholder]{color:var(--qdu-label-3);opacity:.75}',
				'body[data-dsh-quest-ui] [class*="_composerHero"] textarea,body[data-dsh-quest-ui] [class*="_composerHero"] [data-composer-input]{min-height:96px}',
				// 发送键：36px 圆形主色，无投影无浮动（下方干净利落）
				// !important：宿主 normal 态自带 8px 方圆角与尺寸
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[class*="_primary"]{width:36px;height:36px;border-radius:999px!important;box-shadow:none!important;transition:opacity .15s ease}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[class*="_primary"]:hover{opacity:.88}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[class*="_primary"]:active{opacity:.75}',
				// 工具行图标钮（命令/附件）：幽灵圆形，去宿主灰底
				// !important + 双属性选择器提升特异性：宿主对 _add 也用了 ！important
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] button[class*="_add"],body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] .dsh-vision-attach-btn{width:32px;height:32px;border-radius:999px!important;background:transparent!important;background-color:transparent!important;color:var(--qdu-label-2)}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] button[class*="_add"]:hover,body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"] [class*="_tools"] .dsh-vision-attach-btn:hover{background:var(--qdu-hover)!important;color:var(--qdu-label-1)}',
				// 文字选择器（访问模式/选择模型）：彻底隐形 —— 无背景块无圆角框，
				// 纯文字幽灵，hover 仅颜色加深（不再出现任何方形块）
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="访问模式"],body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="选择模型"]{height:28px;border:none!important;border-radius:0!important;background:transparent!important;background-color:transparent!important;box-shadow:none!important;color:var(--qdu-label-2)!important;font-size:12px;transition:color .15s ease}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="访问模式"]:hover,body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="选择模型"]:hover{background:transparent!important;color:var(--qdu-label-1)!important}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="上下文"]{border-radius:999px!important;transition:background-color .15s ease}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] button[aria-label*="上下文"]:hover{background:var(--qdu-hover)!important}',
				// 工具行：绝对定位钉在 root 最底缘（摆脱宿主 card 固定高度限制），
				// 两端分布（左工具组贴左缘 / 右发送组贴右缘）
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_row"]{position:absolute;left:10px;right:10px;bottom:4px;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 8px;z-index:1}',
				// 余额信息（dsh-balance dock，root 下独占一行）：绝对定位到
				// 工具行同一最底层的中部，与发送键同层，下方不再多出一行
				// 注：当前内核里会话统计条与余额条已不在 composer root 之下（实机 _sep
				// 已迁到聊天流的 context 行，dsh-balance-wrap 未安装），这几条定位规则
				// 换代后不再命中；统计条配色由下面两条全局 _sep 规则负责，故不强行
				// 改锚，以免把已换位置的内容钉到错地方。
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea, [data-composer-input]) > div:has(.dsh-balance-wrap){display:block;position:absolute;left:50%;transform:translateX(-50%);bottom:10px;margin:0!important;max-width:60%;overflow:hidden;white-space:nowrap;pointer-events:none;z-index:0}',
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea, [data-composer-input]) > div:has(.dsh-balance-wrap) .dsh-balance-wrap{white-space:nowrap}',
				// 会话统计条：突破宿主 748px 居中限宽的外层 wrapper，左对齐贴缘，降噪小字
				'body[data-dsh-quest-ui] [class*="_composerStack"] [class*="_root"]:has(textarea, [data-composer-input]) > div:has([class*="_sep"]){width:100%!important;max-width:none!important;margin:0!important;padding:8px 14px 0;box-sizing:border-box}',
				'body[data-dsh-quest-ui] div:has(> span[class*="_sep"]){color:var(--qdu-label-3);font-size:11px;width:100%;max-width:none!important;justify-content:flex-start!important;flex-wrap:wrap}',
				'body[data-dsh-quest-ui] span[class*="_sep"]{color:var(--qdu-line)}',
			
				// —— Q4 消息流降噪：助手消息圆角、去硬边框；用户消息仅圆角化
				//    （不给背景，避免误伤宿主首子元素（如头像）的既有底色）——
				// 助手卡片圆角：当前内核的 kind 值域里没有 "assistant"（实机 26 行共
				// 8 类，助手正文行是 "assistant-step"），两代都列上。
				'body[data-dsh-quest-ui] [data-chat-flow-kind="assistant"],body[data-dsh-quest-ui] [data-chat-flow-kind="assistant-step"]{border-radius:var(--qdu-radius-card)}',
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

				// —— 第三方插件元素 Quest 化处理 ——
				// 消息区“编辑”悬浮钮（dshrw-editbtn，白底方形带阴影）：Quest 下隐藏
				'body[data-dsh-quest-ui] .dshrw-editbtn{display:none!important}',
				// 临时会话按钮（dss-footer-icon，原在侧栏底部带文字）：只留图标，
				// fixed 到窗口右上角，与对话/文件/终端标签栏（y≈84）同一水平面
				'body[data-dsh-quest-ui] .dss-footer-icon{position:fixed!important;top:80px;right:14px;width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;z-index:5;background:transparent;border:none}',
				'body[data-dsh-quest-ui] .dss-footer-icon .dss-footer-label{display:none}',
				// 上下文用量面板（JObwrW_panel）：轻度美化降噪（内容为宿主用量数据）
				'body[data-dsh-quest-ui] .JObwrW_panel{line-height:1.6}',
				'body[data-dsh-quest-ui] .JObwrW_figures{color:var(--qdu-label-2)}',
				// —— dsh-synapse 适配已上移为双 UI 通用的 SYNAPSE_CSS（v0.6.0）——
			
				// —— 空态建议卡：圆点前缀（::before 14px 描边圆）+ 40px 行高 +
				//    hover 浅底。dsh-compat:welcome-suggestions-inert —— 当前内核已无
				//    「欢迎页建议条目」这一 UI：实测 dsh-client-ui-conversation 里
				//    suggestion/example/starter/recommend/welcome 全部 0 命中，空态只有
				//    EmptyHero/HeroShell（hero、heroWorkspaceRow）。故这三条今日命中 0、
				//    安静无效（不会误伤别的元素：它们都在 body[data-dsh-quest-ui] 之下）。
				//    保留是给上游哪天把建议卡放回原名时的前向兼容，不是「还在生效」的证据。 ——
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
				tag.textContent = ROW_CSS + SYNAPSE_CSS + CSS;
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

			// —— dsh-synapse 画布主题适配：synapse 以同源 iframe（/synapse/）
			//    呈现，Quest 宿主 CSS 够不到帧内文档；这里在同源安全前提下向
			//    contentDocument 注入一份轻量 Quest 主题（字体/底色/按钮/滚动条
			//    对齐宿主），并随 iframe 重新加载重注入。只插 style 节点，不动
			//    上游 DOM（P7）；iframe 缺失或跨源时安静返回（P8）。
			var SYNAPSE_THEME_ID = "qdu-synapse-theme";
			var SYNAPSE_THEME_CSS = [
				"body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#f7f8fa}",
			"button{border-radius:8px;transition:background-color .15s ease,color .15s ease,border-color .15s ease}",
			"::-webkit-scrollbar{width:8px;height:8px}",
			"::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(127,127,127,.28)}",
			"::-webkit-scrollbar-track{background:transparent}"
			].join("");
			var synapseFrameHooked = null;
			function injectSynapseStyle(doc) {
				if (!doc || !doc.head || doc.getElementById(SYNAPSE_THEME_ID)) return;
				var st = doc.createElement("style");
				st.id = SYNAPSE_THEME_ID;
				st.textContent = SYNAPSE_THEME_CSS;
				doc.head.appendChild(st);
			}
			function ensureSynapseTheme() {
				var frame = document.querySelector(".dsh-synapse-overlay iframe");
				if (!frame) return;
				try { injectSynapseStyle(frame.contentDocument); } catch (e) { /* 跨源/未就绪 */ }
				if (synapseFrameHooked !== frame) {
					if (synapseFrameHooked && synapseFrameHooked.removeEventListener) {
						synapseFrameHooked.removeEventListener("load", synapseFrameReload);
					}
					synapseFrameHooked = frame;
					frame.addEventListener("load", synapseFrameReload);
				}
			}
			// 双 UI 通用（v0.6.0）：synapse 宿主元素由其 client.js 在模块加载时创建，
			// 与本插件加载顺序不确定——启动期有界探测（最多 12 次×800ms）找到
			// iframe 后接管（注入 + load 重挂），找不到即安静放弃，不常驻轮询
			// （P1：模式关闭态除一次性探测外零开销）。
			var synapseBootTimer = null;
			function bootstrapSynapseTheme() {
				if (typeof document === "undefined") return;
				var tries = 0;
				var probe = function () {
					synapseBootTimer = null;
					try {
						if (document.querySelector(".dsh-synapse-overlay iframe")) {
							ensureSynapseTheme();
							return;
						}
					} catch (e) { /* P8 */ }
					if (++tries < 12) synapseBootTimer = setTimeout(probe, 800);
				};
				probe();
			}
			function synapseFrameReload() {
				try { injectSynapseStyle(synapseFrameHooked && synapseFrameHooked.contentDocument); } catch (e) { /* P8 */ }
			}
			function teardownSynapseTheme() {
				if (synapseBootTimer !== null) { clearTimeout(synapseBootTimer); synapseBootTimer = null; }
				if (synapseFrameHooked && synapseFrameHooked.removeEventListener) {
					synapseFrameHooked.removeEventListener("load", synapseFrameReload);
				}
				synapseFrameHooked = null;
				try {
					var frame = document.querySelector(".dsh-synapse-overlay iframe");
					var doc = frame && frame.contentDocument;
					var st = doc && doc.getElementById(SYNAPSE_THEME_ID);
					if (st && st.parentNode) st.parentNode.removeChild(st);
				} catch (e) { /* P8 */ }
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
					// 注：synapse 主题注入为双 UI 通用能力（v0.6.0），模式关闭不拆；
					// 仅在插件卸载时由 teardown effect 清理。
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
						ensureSynapseTheme(); // synapse 画布主题适配（幂等）
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
				// 插件卸载时彻底清理增强器与 synapse 注入（模式开关不由此路径负责）。
				ctx.effect(() => () => { questEnhancers.setOn(false); teardownSynapseTheme(); }, "dsh-quest-ui: teardown enhancers");

				// synapse 适配双 UI 通用：无论模式开关状态，启动即接管画布。
				try { bootstrapSynapseTheme(); } catch (e) { console.warn("[dsh-quest-ui] synapse bootstrap failed: " + ((e && e.message) || e)); }
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
