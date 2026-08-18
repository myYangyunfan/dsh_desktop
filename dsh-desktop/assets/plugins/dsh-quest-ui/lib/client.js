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

			// 通用设置开关行样式（qdu- 前缀，从 conversation-tweaks 的 dct-*
			// 原样改名复制；开关行不依赖 body 属性 —— 模式关闭时也必须可见）。
			const ROW_CSS = [
				".qdu-row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}",
				".qdu-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}",
				".qdu-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
				".qdu-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}",
				".qdu-switch{width:44px;height:26px;background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;border:none;border-radius:999px;flex:none;position:relative;transition:background .15s}",
				".qdu-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary)}",
				".qdu-switch:disabled{opacity:.5;cursor:default}",
				".qdu-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .15s}",
				".qdu-switch[aria-checked=true] .qdu-knob{transform:translateX(18px)}"
			].join("");

			// 主题 CSS（纲要阶段三/五）：每条规则都必须以 body[data-dsh-quest-ui]
			// 开头（验收静态扫描）；设计令牌全部映射宿主 --dsw-alias-* token，
			// 深浅色自动兼容。定位一律走结构位置（role/data-*）或类名子串/后缀
			// 试探 —— 官方类名带 hash，禁止精确匹配。
			const CSS = [
				// —— 设计令牌 ——
				'body[data-dsh-quest-ui]{--qdu-radius-card:12px;--qdu-radius-pill:999px;--qdu-radius-item:8px;--qdu-shadow-card:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.04);--qdu-bg-card:var(--dsw-alias-container-bg-secondary,#f9fafb);--qdu-bg-hover:var(--dsw-alias-interactive-bg-hover);--qdu-border:var(--dsw-alias-border-l2);--qdu-label-1:var(--dsw-alias-label-primary);--qdu-label-3:var(--dsw-alias-label-tertiary)}',

				// —— S1 侧边会话栏行：圆角 8px、hover/选中浅底、行距 40px ——
				'body[data-dsh-quest-ui] [role="treeitem"]{border-radius:var(--qdu-radius-item);min-height:40px;transition:background-color .15s ease}',
				'body[data-dsh-quest-ui] [role="treeitem"]:hover{background:var(--qdu-bg-hover)}',
				'body[data-dsh-quest-ui] [role="treeitem"][aria-selected="true"]{background:var(--qdu-bg-hover)}',

				// —— S2 侧边栏与主区间分隔线柔和化（宽度不变）——
				// !important：宿主 hashed 类自带 border-right 颜色，需提升特异性覆盖。
				'body[data-dsh-quest-ui] [class$="_sidebar"],body[data-dsh-quest-ui] [class$="_Sidebar"]{border-right:1px solid var(--qdu-border)!important}',

				// —— S3 输入区卡片化：卡片底色 + 12px 圆角 + 浅阴影 ——
				'body[data-dsh-quest-ui] [class*="composer"],body[data-dsh-quest-ui] [class*="Composer"]{background:var(--qdu-bg-card);border-radius:var(--qdu-radius-card);box-shadow:var(--qdu-shadow-card)}',
				'body[data-dsh-quest-ui] textarea{border-radius:var(--qdu-radius-item)}',

				// —— S4 消息气泡：12px 圆角、去硬边框改浅阴影 ——
				// !important：覆盖宿主 hashed 类气泡边框色。
				'body[data-dsh-quest-ui] [data-chat-flow-kind="assistant"]{border-radius:var(--qdu-radius-card)}',
				'body[data-dsh-quest-ui] [class*="messageItem"],body[data-dsh-quest-ui] [class*="MessageItem"]{border-radius:var(--qdu-radius-card);border-color:transparent!important;box-shadow:var(--qdu-shadow-card)}',

				// —— S5 按钮/开关统一 8px 圆角与 150ms 过渡（排除自有 qdu-* 节点）——
				'body[data-dsh-quest-ui] button:not([class^="qdu-"]){border-radius:var(--qdu-radius-item);transition:border-radius .15s ease,background-color .15s ease,box-shadow .15s ease,color .15s ease}',

				// —— S6 细滚动条（8px、圆角、半透明；后代与 body 自身两种前缀变体）——
				'body[data-dsh-quest-ui] ::-webkit-scrollbar{width:8px;height:8px}',
				'body[data-dsh-quest-ui] ::-webkit-scrollbar-thumb{border-radius:var(--qdu-radius-pill);background:rgba(127,127,127,.35)}',
				'body[data-dsh-quest-ui] ::-webkit-scrollbar-track{background:transparent}',
				'body[data-dsh-quest-ui]::-webkit-scrollbar{width:8px;height:8px}',
				'body[data-dsh-quest-ui]::-webkit-scrollbar-thumb{border-radius:var(--qdu-radius-pill);background:rgba(127,127,127,.35)}',
				'body[data-dsh-quest-ui]::-webkit-scrollbar-track{background:transparent}',

				// —— 自有节点：侧栏分组头 ——
				'body[data-dsh-quest-ui] .qdu-nav-head{box-sizing:border-box;padding:10px 12px 6px;font-size:12px;line-height:16px;letter-spacing:.04em;color:var(--qdu-label-3);user-select:none}',

				// —— 自有节点：元数据药丸条（纯展示，不拦截主区点击）——
				'body[data-dsh-quest-ui] .qdu-pillbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 16px;pointer-events:none}',
				'body[data-dsh-quest-ui] .qdu-pill{border:1px solid var(--qdu-border);border-radius:var(--qdu-radius-pill);padding:4px 10px;font-size:12px;color:var(--qdu-label-3);display:inline-flex;align-items:center;gap:4px}',

				// —— 空态建议卡：圆点前缀（::before 14px 描边圆）+ 40px 行高 + hover 浅底 ——
				// 官方欢迎页有建议条目时才命中；无条目则本组规则安静无效（不做兜底）。
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

			// 阶段五：元数据药丸条。挂对话主区顶部（[data-slot="conversation"]
			// 的父列首位）；找不到主列时退化到会话根容器首位。
			function applyMetaPills() {
				removeOwnedNodes(PILLBAR_CLASS);
				var conv = document.querySelector('[data-slot="conversation"]');
				var host = (conv && conv.parentElement) || document.querySelector('[data-slot="conversation.session"]');
				if (!host) return;
				var texts = window.__dshQuestUiCore.PILL_TEXTS.slice();
				var meta = null;
				try { meta = window.__dshQuestUiCore.readWorkspaceMeta(); } catch (e) { /* P8 */ }
				if (meta && meta.branch) texts.push(String(meta.branch)); // 二期：分支名药丸
				var bar = document.createElement("div");
				bar.className = PILLBAR_CLASS;
				for (var i = 0; i < texts.length; i++) {
					var pill = document.createElement("span");
					pill.className = "qdu-pill";
					pill.textContent = texts[i];
					bar.appendChild(pill);
				}
				host.insertBefore(bar, host.firstChild);
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
