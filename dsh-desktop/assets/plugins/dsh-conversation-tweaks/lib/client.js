window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-conversation-tweaks",
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
		const NS = "dsh-conversation-tweaks";
		const L = {
			quietTitle: "隐藏对话输出",
			quietDesc: "开启后隐藏大量工具调用、工具结果与思考过程，只显示每一轮的最终总结输出。",
			quietOn: "已隐藏",
			quietOff: "显示全部"
		};

		const CSS = [
			// 通用设置行
			".dct-row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}",
			".dct-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}",
			".dct-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
			".dct-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}",
			".dct-switch{width:44px;height:26px;background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;border:none;border-radius:999px;flex:none;position:relative;transition:background .15s}",
			".dct-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary)}",
			".dct-switch:disabled{opacity:.5;cursor:default}",
			".dct-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .15s}",
			".dct-switch[aria-checked=true] .dct-knob{transform:translateX(18px)}",

			// dsh-compat:quiet-output-attrs —— 原来那五条规则在内核换代后一条都不命中：
			// .Md3f7G_flowItem / .QWLzlG_root / .Sxvs8a_root / ._markdown_1nba0_5 全是
			// CSS Module 哈希类，重打包后已变成 _RXqYG_ / t2QtNG_ / _2erCIa_ /
			// _markdown_177e0_（实机命中各 0）。症状是「开关能拨、什么也没藏」。
			// 新契约只用稳定属性：行锚 [data-chat-flow-kind]；过程成员
			// [data-turn-process-member]——内核 ChatNodeSeat 给「答案锚点之前」的行打此
			// 标记，最终答案所在行永不是成员，故不必再逐轮找总结；思考块
			// [data-variant="think"]。turn-process 是「N 次工具调用」折叠头，成员既已
			// 全藏，留着只会是个点了没反应的死控件，一并隐藏。
			'body[data-dsh-quiet-output] [data-chat-flow-kind="tool-call"]{display:none!important}',
			'body[data-dsh-quiet-output] [data-chat-flow-kind="tool-result"]{display:none!important}',
			'body[data-dsh-quiet-output] [data-chat-flow-kind="turn-process"]{display:none!important}',
			'body[data-dsh-quiet-output] [data-chat-flow-kind][data-turn-process-member]{display:none!important}',
			'body[data-dsh-quiet-output] [data-variant="think"]{display:none!important}',

			// 上一代内核的哈希类规则原样留着：新内核下命中 0，是纯空规则。
			// 原先挂在 .Md3f7G_flowItem 上的两条已删——属性-only 的新规则同样命中旧内核
			// 的行（旧行本就带 data-chat-flow-kind），不必重复。
			'body[data-dsh-quiet-output] .QWLzlG_root{display:none!important}',
			'body[data-dsh-quiet-output] .Sxvs8a_root .Sxvs8a_body > ._markdown_1nba0_5{display:none!important}',
			'body[data-dsh-quiet-output] .Sxvs8a_root[data-dsh-keep-summary] .Sxvs8a_body > ._markdown_1nba0_5{display:block!important}'
		].join("");

		function ensureCss() {
			if (typeof document === "undefined") return;
			const tagId = "@deepseek-ai/dsh-conversation-tweaks/client.css";
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]")) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-conversation-tweaks";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ------------------------------------------------------------------
		// 设置-通用：隐藏对话输出
		// ------------------------------------------------------------------
		function QuietOutputRow({ useScope, scope }) {
			const snap = useScope((s) => s);
			const ready = snap && snap.status === "ready";
			const enabled = !!(ready && snap.value && snap.value.quietOutput === true);
			return jsxs("div", {
				className: "dct-row",
				children: [
					jsxs("div", {
						className: "dct-rowText",
						children: [
							jsx("div", { className: "dct-title", children: L.quietTitle }),
							jsx("div", { className: "dct-desc", children: L.quietDesc })
						]
					}),
					jsx("button", {
						type: "button",
						role: "switch",
						"aria-checked": enabled,
						"aria-label": L.quietTitle,
						title: enabled ? L.quietOn : L.quietOff,
						className: "dct-switch",
						disabled: !ready || !snap.writable,
						onClick: () => { scope.set("quietOutput", !enabled).catch(() => {}); },
						children: jsx("span", { className: "dct-knob" })
					})
				]
			});
		}


		// 上一代内核的哈希类根节点。新内核换成 _2erCIa_root（哈希还会再变），所以这里
		// 只用来判定「是否还需要 DOM 打标记」，不作为可见性选择器。
		function legacyQuietDom() {
			return document.querySelector(".Sxvs8a_root, .Md3f7G_flowItem") !== null;
		}

		// ------------------------------------------------------------------
		// 隐藏输出（仅旧内核需要）：工具调用/工具结果/思考行由 CSS 整体隐藏；
		// 旧内核没有 data-turn-process-member 可靠，这里把每一轮最后一个带
		// Markdown 正文的助手消息标记为「总结」，保持最终输出可见。
		// 当前内核的可见性已由上面的属性契约独立完成，扫描路径不再进入。
		// DOM 高频变化时用 250ms 防抖。
		// ------------------------------------------------------------------
		function refreshQuietMarkers() {
			if (typeof document === "undefined") return;
			if (!legacyQuietDom()) return;
			const roots = Array.from(document.querySelectorAll(".Sxvs8a_root"));
			for (const root of roots) root.removeAttribute("data-dsh-keep-summary");
			if (!document.body.hasAttribute("data-dsh-quiet-output")) return;

			// 按 DOM 顺序扫描聊天流：每个 user 节点表示新的一轮；轮到下一个
			// user（或流末尾）时，把本轮最后一个带正文的助手消息标记为总结。
			const flowItems = Array.from(document.querySelectorAll(".Md3f7G_flowItem[data-chat-flow-kind]"));
			let turnSummary = null;
			const flushTurn = () => {
				if (turnSummary) turnSummary.setAttribute("data-dsh-keep-summary", "1");
				turnSummary = null;
			};
			for (const item of flowItems) {
				const kind = item.getAttribute("data-chat-flow-kind");
				if (kind === "assistant" || kind === "assistant-step") {
					const root = item.querySelector(".Sxvs8a_root");
					if (root && root.querySelector(".Sxvs8a_body > ._markdown_1nba0_5")) turnSummary = root;
				} else if (kind === "user") {
					flushTurn();
				}
			}
			flushTurn();
		}

		function setupQuietMarkers() {
			if (typeof document === "undefined") return () => {};
			let pending = null;
			const schedule = () => {
				if (pending) return;
				// 隐藏输出关闭时不跟跑 body 观察器；开关切换由 applyQuiet 直接刷新。
				if (!document.body.hasAttribute("data-dsh-quiet-output")) return;
				// 新内核没有标记可打：不跟跑观察器（流式输出时 DOM 变动极密）。
				if (!legacyQuietDom()) return;
				pending = setTimeout(() => {
					pending = null;
					refreshQuietMarkers();
				}, 250);
			};
			refreshQuietMarkers();
			const observer = new MutationObserver(schedule);
			observer.observe(document.body, { childList: true, subtree: true });
			return () => {
				if (pending) clearTimeout(pending);
				observer.disconnect();
			};
		}

		// ------------------------------------------------------------------
		// 插件入口
		// ------------------------------------------------------------------
		function apply(ctx) {
			ensureCss();

			const scope = ctx.settingsScope.bind({ namespace: NS });
			const useScope = bindSnapshotSelector(scope);

			const applyQuiet = () => {
				if (typeof document === "undefined") return;
				const snap = scope.getSnapshot();
				const enabled = snap && snap.status === "ready" && snap.value && snap.value.quietOutput === true;
				if (enabled) document.body.setAttribute("data-dsh-quiet-output", "1");
				else document.body.removeAttribute("data-dsh-quiet-output");
				refreshQuietMarkers();
			};
			applyQuiet();
			scope.subscribe(applyQuiet);

			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "quiet-output",
				order: 25,
				inject: () => ({ useScope, scope })
			}, QuietOutputRow), "dsh-conversation-tweaks: quiet output row");

			ctx.effect(() => setupQuietMarkers(), "dsh-conversation-tweaks: quiet summary markers");
		}

		exports.apply = apply;
		exports.inject = ["slots", "settingsScope"];
		return module.exports;
	}
});
