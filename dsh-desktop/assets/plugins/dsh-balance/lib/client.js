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
		 * window "dsh-balance-changed" 事件（detail = { ok, balances, prices }）；
		 * 纯浏览器环境（无桌面壳）时只显示“本轮费用”，价格用内置默认档。
		 */
		const FALLBACK_PRICES = { cacheMiss: 3, cacheHit: 0.1, output: 9 };

		function money(value) {
			const v = Number(value) || 0;
			if (v >= 10) return v.toFixed(2);
			if (v >= 0.1) return v.toFixed(3);
			return v.toFixed(4);
		}

		/** tokenUsage 投影 → 本轮费用（¥）。缓存写入按 miss 价计费（与官方一致）。 */
		function sessionCost(usage, prices) {
			if (!usage) return 0;
			const p = { ...FALLBACK_PRICES, ...(prices || {}) };
			const perM = (n) => (Number(n) || 0) / 1e6;
			return (
				perM(usage.uncachedInputTokens + usage.cacheWriteTokens) * p.cacheMiss +
				perM(usage.cacheReadTokens) * p.cacheHit +
				perM(usage.outputTokens) * p.output
			);
		}

		function hasUsage(usage) {
			return !!usage && (usage.outputTokens > 0 ||
				(usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0) > 0);
		}

		/** 订阅桌面壳推送的余额数据（含一次主动拉取）。 */
		function useBalanceData() {
			const hasBridge = typeof window !== "undefined" && window.dshDesktop && typeof window.dshDesktop.refreshBalance === "function";
			const [data, setData] = react.useState(() => hasBridge ? { loading: true } : null);
			react.useEffect(() => {
				let alive = true;
				const apply = (next) => { if (alive && next) setData(next); };
				const handler = (event) => apply(event.detail);
				window.addEventListener("dsh-balance-changed", handler);
				const bridge = window.dshDesktop;
				if (bridge && typeof bridge.refreshBalance === "function") {
					bridge.refreshBalance().then(apply).catch(() => {});
				}
				return () => {
					alive = false;
					window.removeEventListener("dsh-balance-changed", handler);
				};
			}, []);
			return data;
		}

		/** OpenCode Go 套餐用量展示（官方配额接口 /zen/go/v1/usage 三窗口已用百分比）。 */
		const GO_LABELS = { rolling: "滚", weekly: "周", monthly: "月" };
		const GO_WINDOW_ORDER = ["monthly", "weekly", "rolling"];
		function goUsageText(windows) {
			return "Go " + GO_WINDOW_ORDER
				.filter((k) => windows[k])
				.map((k) => GO_LABELS[k] + (windows[k].percent || 0) + "%")
				.join(" · ");
		}
		function goUsageTitle(windows) {
			const fmt = (iso) => {
				try {
					return new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
				} catch { return ""; }
			};
			const lines = ["OpenCode Go 套餐用量（已用百分比）"];
			for (const k of GO_WINDOW_ORDER) {
				const w = windows[k];
				if (!w) continue;
				lines.push(GO_LABELS[k] + "：" + (w.percent || 0) + "%" + (w.resetsAt ? "，" + fmt(w.resetsAt) + " 重置" : ""));
			}
			lines.push("点击打开 opencode.ai 用量页");
			return lines.join("\n");
		}

		function BalanceDock({ useProjection }) {
			const usage = typeof useProjection === "function" ? useProjection("tokenUsage") : void 0;
			const data = useBalanceData();
			// 用户关闭「显示余额/本轮费用」时整个 dock 隐藏；等待首次推送期间也不闪现。
			if (data && (data.disabled === true || data.loading === true)) return null;
			const prices = data && data.prices ? data.prices : void 0;
			const balances = data && Array.isArray(data.balances) ? data.balances : [];
			const primary = balances.find((b) => b.currency === "CNY") || balances[0];
			const hasBalance = !!(data && data.ok && primary);
			const usageKnown = hasUsage(usage);
			const go = data && data.opencodeGo && data.opencodeGo.ok && data.opencodeGo.windows ? data.opencodeGo.windows : null;
			if (!hasBalance && !usageKnown && !go) return null;
			const parts = [];
			if (usageKnown) parts.push("本轮 ¥" + money(sessionCost(usage, prices)));
			if (hasBalance) parts.push("余额 ¥" + money(primary.total));
			const title = hasBalance
				? `${primary.currency} 余额 ¥${money(primary.total)}（充值 ¥${money(primary.toppedUp)} · 赠送 ¥${money(primary.granted)}）；本轮费用按 token 用量估算（¥/百万 token：命中 ${prices?.cacheHit ?? FALLBACK_PRICES.cacheHit} / 未命中 ${prices?.cacheMiss ?? FALLBACK_PRICES.cacheMiss} / 输出 ${prices?.output ?? FALLBACK_PRICES.output}${data.model ? " · " + data.model : ""}${typeof data.peak === "boolean" ? (data.peak ? " · 高峰价" : " · 空闲价") : ""}），点击前往充值`
				: "本轮费用按 token 用量估算；未读取到 DeepSeek API Key，无法显示余额";
			const dock = react_jsx_runtime.jsx("a", {
				className: "dsh-balance-dock",
				href: "https://platform.deepseek.com/top_up",
				target: "_blank",
				rel: "noreferrer",
				title,
				children: parts.join(" · ")
			});
			if (!go) return dock;
			const goDock = react_jsx_runtime.jsx("a", {
				className: "dsh-balance-dock dsh-balance-go",
				href: "https://opencode.ai",
				target: "_blank",
				rel: "noreferrer",
				title: goUsageTitle(go),
				children: goUsageText(go)
			});
			if (!usageKnown && !hasBalance) return goDock;
			return react_jsx_runtime.jsx("span", {
				className: "dsh-balance-wrap",
				children: [dock, goDock]
			});
		}

		const CSS = [
			".dsh-balance-wrap{display:inline-flex;align-items:center;gap:4px}",
			".dsh-balance-dock{display:inline-flex;align-items:center;box-sizing:border-box;",
			"color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;text-decoration:none;",
			"white-space:nowrap;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;",
			"padding:1px 8px;margin:0 2px;cursor:pointer;font-variant-numeric:tabular-nums;",
			"transition:color .15s,border-color .15s}",
			".dsh-balance-dock:hover{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}"
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
