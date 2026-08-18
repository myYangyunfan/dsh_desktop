window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		/**
		 * DeepSeek 账户余额 + 本轮会话费用，内联渲染在对话底部统计栏
		 * （conversation.composer.dock list slot，排在 StatsLine 之后）。
		 *
		 * 数据来源：DSH Desktop 壳层通过 preload 派发的
		 * window "dsh-balance-changed" 事件（detail = { ok, balances, prices,
		 * priceTable, model, peak, opencodeGo, at }，契约见
		 * docs/balance-architecture.md）；纯浏览器环境（无桌面壳）时只显示
		 * 「本轮费用」，价格用内置默认档。
		 *
		 * 单一投递契约：数据只从事件通道进入（window.dshDesktop.refreshBalance
		 * 只用于触发刷新、不消费其返回值），杜绝「IPC 返回值 + 事件推送」
		 * 双通道重复渲染。
		 */
		// 纯浏览器降级（无桌面壳）时的兜底价格档：与全链路默认模型
		// DEFAULT_MODEL = deepseek-v4-pro 一致（保守档，避免少报费用）。
		const FALLBACK_PRICES = { cacheMiss: 9, cacheHit: 0.3, output: 27 };

		/**
		 * token 用量归一化 —— 单一真源。
		 * 接受两种上游形态，统一成非负有限数四桶：
		 *   形态 A（会话投影视图，官方 token-meter 契约）：
		 *     { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
		 *   形态 B（provider usage 原样透传，OpenAI 兼容适配器等）：
		 *     { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, model? }
		 * 两种形态的输入语义一致：uncachedInputTokens/inputTokens 均已扣除
		 * 缓存读与缓存写；缓存写单独成桶、与未缓存输入合并按 miss 价计（不双计）。
		 * 每个操作数独立守卫（Number(x) 后判有限），不存在 `undefined + N = NaN`
		 * 的求和先于守卫求值问题；异常值（负数/NaN/Infinity/非数字串）一律归 0。
		 * @returns {null | {uncached:number, read:number, write:number, output:number, model:string|null}}
		 */
		function normalizeUsage(usage) {
			if (!usage || typeof usage !== "object") return null;
			const num = (v) => {
				const n = Number(v);
				return Number.isFinite(n) && n > 0 ? n : 0;
			};
			return {
				uncached: num(usage.uncachedInputTokens ?? usage.inputTokens),
				write: num(usage.cacheWriteTokens),
				read: num(usage.cacheReadTokens),
				output: num(usage.outputTokens),
				model: typeof usage.model === "string" && usage.model.length > 0 ? usage.model : null,
			};
		}

		function hasUsage(usage) {
			const u = normalizeUsage(usage);
			return !!u && (u.uncached > 0 || u.read > 0 || u.write > 0 || u.output > 0);
		}

		/** token 用量 → 本轮费用（¥）。缓存写入按 miss 价计费（与官方一致）。 */
		function sessionCost(usage, prices) {
			const u = normalizeUsage(usage);
			if (!u) return 0;
			const price = (key, fallback) => {
				const v = Number(prices && prices[key]);
				return Number.isFinite(v) && v >= 0 ? v : fallback;
			};
			const cacheMiss = price("cacheMiss", FALLBACK_PRICES.cacheMiss);
			const cacheHit = price("cacheHit", FALLBACK_PRICES.cacheHit);
			const output = price("output", FALLBACK_PRICES.output);
			const perM = (n) => n / 1e6;
			// 输入未命中 = 未缓存输入 + 缓存写；逐桶下限保护：任何异常输入
			// 都不会产生负费用。
			const miss = Math.max(0, perM(u.uncached + u.write));
			const hit = Math.max(0, perM(u.read));
			const out = Math.max(0, perM(u.output));
			return Math.max(0, miss * cacheMiss + hit * cacheHit + out * output);
		}

		/**
		 * 会话费用取价：usage 携带真实模型且主进程价目表
		 * （priceTable）含该模型 → 按真实模型计价；否则回退默认模型档。
		 */
		function pricesFor(usage, data) {
			const u = normalizeUsage(usage);
			const table = data && typeof data.priceTable === "object" ? data.priceTable : null;
			if (u && u.model && table && table[u.model]) return table[u.model];
			return data && data.prices ? data.prices : void 0;
		}

		/** 金额显示：非有限 → "—"；0 → "0.00"；大额走本地化（不会出现 "1e+21"）。 */
		function money(value) {
			const v = Number(value);
			if (!Number.isFinite(v)) return "—";
			if (v === 0) return "0.00";
			const abs = Math.abs(v);
			if (abs >= 100) return v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			if (abs >= 10) return v.toFixed(2);
			if (abs >= 0.1) return v.toFixed(3);
			return v.toFixed(4);
		}

		// 本页面生命周期内是否已收到过余额推送（模块级）：已收到则后续挂载
		// 不再触发强制刷新（会话切换零额外 HTTP），数据由事件通道持续更新。
		let bridgePushedOnce = false;

		/** 订阅桌面壳推送的余额数据（首次挂载触发一次主动刷新，数据只走事件通道）。 */
		function useBalanceData() {
			const hasBridge = typeof window !== "undefined" && window.dshDesktop && typeof window.dshDesktop.refreshBalance === "function";
			const [data, setData] = react.useState(() => hasBridge ? { loading: true } : null);
			react.useEffect(() => {
				let alive = true;
				const apply = (next) => { if (alive && next) { bridgePushedOnce = true; setData(next); } };
				const handler = (event) => apply(event.detail);
				window.addEventListener("dsh-balance-changed", handler);
				const bridge = window.dshDesktop;
				if (bridge && typeof bridge.refreshBalance === "function") {
					// 只触发刷新，不消费返回值（处理器按单一投递契约不返回数据）。
					if (!bridgePushedOnce) bridge.refreshBalance().catch(() => {});
				}
				return () => {
					alive = false;
					window.removeEventListener("dsh-balance-changed", handler);
				};
			}, []);
			return data;
		}

		function BalanceDock({ useProjection }) {
			const usage = typeof useProjection === "function" ? useProjection("tokenUsage") : void 0;
			const data = useBalanceData();
			// 用户关闭「显示余额/本轮费用」时整个 dock 隐藏；等待首次推送期间也不闪现。
			if (data && (data.disabled === true || data.loading === true)) return null;
			const balances = data && Array.isArray(data.balances) ? data.balances : [];
			const primary = balances.find((b) => b.currency === "CNY") || balances[0];
			const hasBalance = !!(data && data.ok && primary);
			const usageKnown = hasUsage(usage);
			// OpenCode Go 套餐用量（官方配额接口 /zen/go/v1/usage 三窗口已用百分比，
			// PR #44 形态：独立状态栏 chip，链接 opencode.ai；percent=已用比例非剩余）。
			const go = data && data.opencodeGo && data.opencodeGo.ok && data.opencodeGo.usage ? data.opencodeGo.usage : null;
			const goText = go ? goUsageText(go) : null;
			// 三样都无内容时整体不渲染（goUsageText 全空返回 null，不再渲染空白 chip）。
			if (!hasBalance && !usageKnown && !goText) return null;
			const peak = typeof data?.peak === "boolean";
			// 峰谷提醒：主进程按当前时刻推送 peak（高峰=全价，空闲=高峰一半）。
			// 可见文本放最前；高峰橙/空闲绿着色。
			const peakChip = peak
				? react_jsx_runtime.jsx("span", {
					className: data.peak ? "dsh-balance-peak" : "dsh-balance-offpeak",
					children: data.peak ? "⛰ 高峰价" : "🌙 空闲价"
				}, "peak")
				: null;
			const usagePrices = pricesFor(usage, data);
			const usageModel = normalizeUsage(usage)?.model ?? null;
			// 计价模型说明：usage 带真实模型且价目表可用 → 按真实模型；否则明确
			// 标注「按默认模型估算」（会话实际模型不可知时不假装精确）。
			const table = data && typeof data.priceTable === "object" ? data.priceTable : null;
			const defaultModel = (data && typeof data.model === "string" && data.model) || "deepseek-v4-pro";
			let priceNote;
			if (usageModel && table && table[usageModel]) {
				priceNote = "按会话模型 " + usageModel + " 单价估算";
			} else if (usageModel) {
				priceNote = "按默认模型 " + defaultModel + " 单价估算（会话模型 " + usageModel + " 不在价目表内）";
			} else {
				priceNote = "按默认模型 " + defaultModel + " 单价估算（会话实际模型未知）";
			}
			const items = [];
			if (peakChip) items.push(peakChip);
			if (usageKnown) items.push(react_jsx_runtime.jsx("span", { children: "本轮 ¥" + money(sessionCost(usage, usagePrices)) }, "cost"));
			if (hasBalance) items.push(react_jsx_runtime.jsx("span", { children: "余额 ¥" + money(primary.total) }, "balance"));
			// children 传数组且每项带稳定 key（真实 React 下数组子元素必须带 key，
			// 否则 dev 模式持续告警）；分隔符用 span 包裹避免字符串无法挂 key。
			// 曾踩过的坑：join 会把元素 toString 成 "[object Object]"（见 53e0a4c）。
			const joined = [];
			items.forEach((it, i) => {
				if (i > 0) joined.push(react_jsx_runtime.jsx("span", { className: "dsh-balance-sep", children: " · " }, "sep" + i));
				joined.push(it);
			});
			const title = hasBalance
				? `${primary.currency} 余额 ¥${money(primary.total)}（充值 ¥${money(primary.toppedUp)} · 赠送 ¥${money(primary.granted)}）；本轮费用${priceNote}（¥/百万 token：命中 ${usagePrices?.cacheHit ?? FALLBACK_PRICES.cacheHit} / 未命中 ${usagePrices?.cacheMiss ?? FALLBACK_PRICES.cacheMiss} / 输出 ${usagePrices?.output ?? FALLBACK_PRICES.output}${peak ? (data.peak ? " · 高峰价（北京时间 9:00-12:00 / 14:00-18:00，全价）" : " · 空闲价（高峰价的一半）") : ""}），点击前往充值`
				: "本轮费用按 token 用量估算；未读取到 DeepSeek API Key，无法显示余额";
			const dock = react_jsx_runtime.jsx("a", {
				className: "dsh-balance-dock",
				href: "https://platform.deepseek.com/top_up",
				target: "_blank",
				rel: "noopener noreferrer",
				title,
				// children 直接传数组：joined 里混有 React 元素（peakChip 的
				// <span>）与字符串分隔符，join 会把元素 toString 成
				// "[object Object]"（曾致 dock 左侧显示 Object）。
				children: joined
			}, "balance-dock");
			if (!goText) return dock;
			const goDock = react_jsx_runtime.jsx("a", {
				className: "dsh-balance-dock dsh-balance-go",
				href: "https://opencode.ai",
				target: "_blank",
				rel: "noopener noreferrer",
				title: goUsageTitle(go),
				children: goText
			}, "go-dock");
			if (!usageKnown && !hasBalance) return goDock;
			return react_jsx_runtime.jsx("span", {
				className: "dsh-balance-wrap",
				children: [dock, goDock]
			});
		}

		/** OpenCode Go 三窗口已用百分比（独立 chip 文本）；全窗口无数据返回 null。 */
		const GO_LABELS = { rolling: "5h", weekly: "周", monthly: "月" };
		const GO_WINDOW_ORDER = ["rolling", "weekly", "monthly"];
		function goUsageText(windows) {
			const parts = GO_WINDOW_ORDER
				.filter((k) => windows && windows[k])
				.map((k) => GO_LABELS[k] + (windows[k].percent == null ? "?" : Math.round(windows[k].percent) + "%"));
			if (parts.length === 0) return null;
			return "Go " + parts.join(" · ");
		}
		function goUsageTitle(windows) {
			const fmt = (iso) => {
				try {
					return new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
				} catch { return ""; }
			};
			const lines = ["OpenCode Go 套餐用量（percent=已用比例，非剩余）"];
			for (const k of GO_WINDOW_ORDER) {
				const w = windows[k];
				if (!w) continue;
				lines.push(GO_LABELS[k] + "：" + (w.percent == null ? "?" : Math.round(w.percent) + "%") + (w.resetsAt ? "，" + fmt(w.resetsAt) + " 重置" : "") + (w.status && w.status !== "ok" ? " · " + w.status : ""));
			}
			lines.push("点击打开 opencode.ai 用量页");
			return lines.join("\n");
		}

		const CSS = [
			".dsh-balance-wrap{display:inline-flex;align-items:center;gap:4px}",
			".dsh-balance-dock{display:inline-flex;align-items:center;box-sizing:border-box;",
			"color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;text-decoration:none;",
			"white-space:nowrap;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;",
			"padding:1px 8px;margin:0 2px;cursor:pointer;font-variant-numeric:tabular-nums;",
			"transition:color .15s,border-color .15s}",
			".dsh-balance-dock:hover{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}",
			".dsh-balance-peak{color:#e8590c;font-weight:600}",
			".dsh-balance-offpeak{color:#2f9e44}"
		].join("");

		const TAG = "@deepseek-ai/dsh-balance/client.css";
		function ensureCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG) + "]")) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-balance";
			tag.dataset.pluginCss = TAG;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		/**
		 * Client plugin body: register a dock entry right after the session stats
		 * line. The slot's standard kit supplies `useProjection` (session-scoped).
		 */
		function apply(ctx) {
			ensureCss();
			ctx.effect(() => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "balance",
				order: 100
			}, BalanceDock), "dsh-balance: composer dock entry");
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
