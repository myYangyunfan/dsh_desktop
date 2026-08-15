window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-conversation-tweaks",
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

			// 隐藏大量工具调用、工具结果与思考过程；每一轮最终总结文字由
			// refreshQuietMarkers 标记 data-dsh-keep-summary 后保持可见。
			'body[data-dsh-quiet-output] .Md3f7G_flowItem[data-chat-flow-kind="tool-call"]{display:none!important}',
			'body[data-dsh-quiet-output] .Md3f7G_flowItem[data-chat-flow-kind="tool-result"]{display:none!important}',
			'body[data-dsh-quiet-output] .QWLzlG_root{display:none!important}',
			'body[data-dsh-quiet-output] .Sxvs8a_root .Sxvs8a_body > ._markdown_1nba0_5{display:none!important}',
			'body[data-dsh-quiet-output] .Sxvs8a_root[data-dsh-keep-summary] .Sxvs8a_body > ._markdown_1nba0_5{display:block!important}',

			// 会话右侧导航滑轨
			".dct-rail{position:fixed;z-index:60;width:16px;cursor:pointer;user-select:none;-webkit-app-region:no-drag}",
			".dct-railTrack{position:absolute;top:0;bottom:0;left:7px;width:0;border-left:2px dashed color-mix(in srgb,var(--dsw-alias-label-tertiary) 55%,transparent);opacity:.25;transition:opacity .15s;z-index:0}",
			".dct-railMarkers{position:absolute;top:0;bottom:0;left:0;right:0;pointer-events:none;z-index:1}",
			".dct-railDot{position:absolute;left:5px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);opacity:.4;transform:translateY(-50%);transition:opacity .15s}",
			".dct-rail:hover .dct-railDot{opacity:.9}",
			".dct-railThumb{position:absolute;left:4px;width:8px;border-radius:999px;background:var(--dsw-alias-label-tertiary);opacity:.45;transition:opacity .15s,background .15s;z-index:2}",
			".dct-rail:hover .dct-railTrack{opacity:.8}",
			".dct-rail:hover .dct-railThumb{background:var(--dsw-alias-state-business-primary);opacity:.95}",
			".dct-railPreview{position:absolute;left:1px;width:14px;height:28px;border-radius:7px;background:var(--dsw-alias-state-business-primary);opacity:0;pointer-events:none;box-shadow:0 0 10px color-mix(in srgb,var(--dsw-alias-state-business-primary) 65%,transparent);transition:opacity .1s;z-index:3}",
			".dct-rail[data-preview=\"1\"] .dct-railPreview{opacity:.9}"
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

		// ------------------------------------------------------------------
		// 会话右侧导航滑轨
		// ------------------------------------------------------------------
		function setupNavRail() {
			if (typeof document === "undefined") return () => {};

			const rail = document.createElement("div");
			rail.className = "dct-rail";
			rail.style.display = "none";
			const track = document.createElement("div");
			track.className = "dct-railTrack";
			const markers = document.createElement("div");
			markers.className = "dct-railMarkers";
			const thumb = document.createElement("div");
			thumb.className = "dct-railThumb";
			const preview = document.createElement("div");
			preview.className = "dct-railPreview";
			rail.append(track, markers, thumb, preview);
			(document.body || document.documentElement).appendChild(rail);

			let target = null;
			let previewRatio = 0.5;
			let rafId = 0;
			let rafPending = false;
			let updateTimer = 0;
			let markerTimer = 0;
			let lastUpdateAt = 0;
			let markersDirty = true;
			let lastSizeSignature = "";
			const dotByKey = new Map();

			// 新用户消息出现时只做标记，250ms 内合并到同一次 update，
			// 避免流式输出期间每个 DOM 变更都触发一轮全量布局读取。
			const domObserver = new MutationObserver(() => {
				markersDirty = true;
				if (markerTimer) clearTimeout(markerTimer);
				markerTimer = setTimeout(() => requestUpdate(), 250);
			});

			// 密集滚动/动画事件统一进动画帧，并把布局读取限到 ~120ms 一次；
			// 不在 scroll handler 里同步执行 update，避免滚动时明显掉帧。
			function requestUpdate() {
				if (rafPending) return;
				const since = performance.now() - lastUpdateAt;
				const wait = Math.max(0, 120 - since);
				rafPending = true;
				if (wait > 0) {
					updateTimer = setTimeout(() => {
						rafPending = false;
						rafId = requestAnimationFrame(() => update());
					}, wait);
					return;
				}
				rafId = requestAnimationFrame(() => {
					rafPending = false;
					update();
				});
			}

			function findTarget() {
				const root = document.querySelector(".wSkVaW_root");
				const flow = document.querySelector("[data-chat-flow]");
				if (!root || !flow || !root.contains(flow)) return null;
				// 官方 ConversationRoot 的主滚动容器；若未来版本改名，
				// 退化到 data-chat-flow 的最近可滚动祖先。
				const primary = root.querySelector(".wSkVaW_scrollBody");
				if (primary && (primary.scrollHeight > primary.clientHeight + 1 || primary.scrollTop > 0)) return primary;
				const fallback = flow.closest(".Md3f7G_scroll");
				if (fallback && fallback.scrollHeight > fallback.clientHeight + 1) return fallback;
				return primary || fallback;
			}

			function observeTarget(next) {
				domObserver.disconnect();
				if (next) domObserver.observe(next, { childList: true, subtree: true });
			}

			// 每个圆形点对应一条用户消息（data-chat-flow-kind="user"）。
			// 点按消息顶部在整个内容里的比例放在滑轨上；只在内容或滑轨尺寸
			// 变化时重算，滚动过程中只挪滑块、不重读所有消息位置。
			function refreshMarkers(scrollport, trackHeight) {
				const contentHeight = Math.max(scrollport.scrollHeight, scrollport.clientHeight, 1);
				const portRect = scrollport.getBoundingClientRect();
				const rows = Array.from(scrollport.querySelectorAll('[data-chat-flow-kind="user"]'));
				const seen = new Set();
				rows.forEach((row, index) => {
					const key = row.getAttribute("data-chat-anchor-key") || ("user-" + index);
					seen.add(key);
					const rowRect = row.getBoundingClientRect();
					const contentTop = rowRect.top - portRect.top + scrollport.scrollTop;
					const ratio = Math.max(0, Math.min(1, contentTop / contentHeight));
					let dot = dotByKey.get(key);
					if (!dot) {
						dot = document.createElement("div");
						dot.className = "dct-railDot";
						dot.dataset.anchor = key;
						markers.appendChild(dot);
						dotByKey.set(key, dot);
					}
					dot.style.top = (ratio * trackHeight) + "px";
					dot.style.display = "block";
				});
				for (const [key, dot] of dotByKey) {
					if (!seen.has(key)) {
						dot.remove();
						dotByKey.delete(key);
					}
				}
			}

			function update() {
				lastUpdateAt = performance.now();
				const t = findTarget();
				if (t !== target) {
					if (target) target.removeEventListener("scroll", requestUpdate);
					target = t;
					if (target) {
						target.addEventListener("scroll", requestUpdate, { passive: true });
						observeTarget(target);
					} else {
						domObserver.disconnect();
					}
					markers.replaceChildren();
					dotByKey.clear();
					markersDirty = true;
					lastSizeSignature = "";
				}
				if (!target) {
					rail.style.display = "none";
					return;
				}
				const rect = target.getBoundingClientRect();
				// 滑轨固定在会话内容区右侧（而不是默认的 static position 偏到窗口左侧）。
				const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
				rail.style.left = "auto";
				rail.style.right = Math.max(8, viewportWidth - rect.right + 8) + "px";
				const top = Math.max(0, rect.top) + 12;
				const height = Math.max(0, rect.height - 24);
				if (height < 80) {
					rail.style.display = "none";
					return;
				}
				rail.style.display = "block";
				rail.style.top = top + "px";
				rail.style.height = height + "px";

				const viewport = target.clientHeight;
				const content = Math.max(target.scrollHeight, viewport);
				const trackHeight = height;
				const sizeSignature = [content, viewport, trackHeight].join(":");
				if (markersDirty || sizeSignature !== lastSizeSignature) {
					lastSizeSignature = sizeSignature;
					refreshMarkers(target, trackHeight);
					markersDirty = false;
				}
				// 长条长度随 session 内容长度变化：内容越长，滑块越短。
				const thumbHeight = Math.max(24, Math.min(trackHeight, (viewport / content) * trackHeight));
				thumb.style.height = thumbHeight + "px";
				const travel = Math.max(0, trackHeight - thumbHeight);
				const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
				thumb.style.top = (maxScroll > 0 ? (target.scrollTop / maxScroll) * travel : 0) + "px";

				const previewTop = Math.max(0, Math.min(1, previewRatio)) * trackHeight - 14;
				preview.style.top = Math.max(0, Math.min(trackHeight - 28, previewTop)) + "px";
			}

			function ratioFromEvent(e) {
				const r = rail.getBoundingClientRect();
				if (r.height <= 0) return 0;
				return Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
			}

			rail.addEventListener("pointermove", (e) => {
				previewRatio = ratioFromEvent(e);
				rail.dataset.preview = "1";
				requestUpdate();
			});
			rail.addEventListener("pointerleave", () => {
				rail.dataset.preview = "0";
				requestUpdate();
			});
			// 只有真实点击才跳转；hover 只预览位置。
			rail.addEventListener("click", (e) => {
				const t = findTarget();
				if (!t) return;
				const ratio = ratioFromEvent(e);
				const max = Math.max(0, t.scrollHeight - t.clientHeight);
				if (max <= 0) return;
				t.scrollTo({ top: ratio * max, behavior: "smooth" });
			});

			const timer = setInterval(requestUpdate, 1000);
			window.addEventListener("resize", requestUpdate);
			document.addEventListener("scroll", requestUpdate, true);
			update();

			return () => {
				clearInterval(timer);
				if (updateTimer) clearTimeout(updateTimer);
				if (markerTimer) clearTimeout(markerTimer);
				if (rafId) cancelAnimationFrame(rafId);
				domObserver.disconnect();
				window.removeEventListener("resize", requestUpdate);
				document.removeEventListener("scroll", requestUpdate, true);
				if (target) target.removeEventListener("scroll", requestUpdate);
				rail.remove();
			};
		}

		// ------------------------------------------------------------------
		// 隐藏输出：工具调用/工具结果/思考行由 CSS 整体隐藏；这里把每一轮
		// 最后一个带 Markdown 正文的助手消息标记为「总结」，保持最终输出可见。
		// DOM 高频变化时用 250ms 防抖。
		// ------------------------------------------------------------------
		function refreshQuietMarkers() {
			if (typeof document === "undefined") return;
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

			ctx.effect(() => setupNavRail(), "dsh-conversation-tweaks: conversation nav rail");
			ctx.effect(() => setupQuietMarkers(), "dsh-conversation-tweaks: quiet summary markers");
		}

		exports.apply = apply;
		exports.inject = ["slots", "settingsScope"];
		return module.exports;
	}
});
