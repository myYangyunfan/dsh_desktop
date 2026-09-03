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

		/** 按四桶用量（已归一化的非负有限数）计价（¥）——sessionCost 与增量账本共用。 */
		function costOfBuckets(b, prices) {
			if (!b || typeof b !== "object") return 0;
			const num = (v) => {
				const n = Number(v);
				return Number.isFinite(n) && n > 0 ? n : 0;
			};
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
			const miss = Math.max(0, perM(num(b.uncached) + num(b.write)));
			const hit = Math.max(0, perM(num(b.read)));
			const out = Math.max(0, perM(num(b.output)));
			return Math.max(0, miss * cacheMiss + hit * cacheHit + out * output);
		}

		/** token 用量 → 本轮费用（¥）。缓存写入按 miss 价计费（与官方一致）。 */
		function sessionCost(usage, prices) {
			const u = normalizeUsage(usage);
			if (!u) return 0;
			return costOfBuckets(u, prices);
		}

		// ---------------------------------------------------------------------
		// 增量计价账本（issue #168）
		//
		// 缺陷根因：tokenUsage 投影是「会话累计总量」，旧实现每帧做
		//   累计量 × 推送时刻价目，峰谷切换后历史费用被整段重算（数字跳变）。
		// 修复口径（与官方结算规则一致）：已结算部分不追溯——每观察到一个
		//   「用量增量」就按该增量被观察到的时刻价目入账，累计费用 = 各分段之和。
		//   峰谷切换只影响后续新增量，历史分段锁死。
		//
		// 幂等性：入账基于「高水位累计用量」求差——同一观测重复渲染（StrictMode
		//   双渲染 / 无新 token 的轮询帧）增量恒为 0，因此在渲染期调用安全，
		//   无需额外引用计数。投影累计小幅回退（chunk 样本与 final 样本不一致、
		//   重试替换）按不追溯处理：差额丢弃，不高开账本水位。
		//
		// 向后兼容（两个方向）：
		//   · 老会话无账本记录而已累计用量 → 首帧按当前价目一次性入账（backfill），
		//     与旧实现首帧金额完全一致，并打日志标注；此后才进入增量模式。
		//   · 新 client 收旧 payload（无 periodTables/pricingTier）→ 用 priceTable
		//     （即推送时刻价目）+ peak 推档位入账，计价结果等价旧行为，但不再重算历史。
		//   · 旧 client 收新 payload → 新字段是附加项，旧代码不读（本函数不影响）。
		// ---------------------------------------------------------------------

		const LEDGER_KEY = "dsh-balance:cost-ledger:v1";
		const LEDGER_VERSION = 1;
		const LEDGER_MAX_SESSIONS = 60;         // 容量上限（超出按 updatedAt 淘汰最旧）
		const LEDGER_EPHEMERAL = "__ephemeral__"; // slot 未提供 sessionId 时的归属键
		const TIER_UNKNOWN = "unknown";
		const TOKEN_KEYS = ["uncached", "write", "read", "output"];

		/** 无真实 sessionId（旧宿主不传 / 测试床）时的账本键：退化为「本页一会话」。 */
		function ledgerKey(sessionId) {
			const s = typeof sessionId === "string" ? sessionId.trim() : "";
			return s.length > 0 ? s : LEDGER_EPHEMERAL;
		}

		function emptyBuckets() {
			return { uncached: 0, write: 0, read: 0, output: 0 };
		}

		// 存储后端：优先 window.localStorage（会话费用跨刷新持久）；受限环境
		// （sandboxed iframe 无 allow-same-origin 访盘会直抛 SecurityError）或
		// vm 测试床无 localStorage 时，退回模块级内存 shim（本页面生命周期内持久）。
		let memoryLedger = null;
		function ledgerStorage() {
			try {
				if (typeof window !== "undefined" && window.localStorage) {
					window.localStorage.getItem(LEDGER_KEY); // 探针：受限上下文在此抛错
					return window.localStorage;
				}
			} catch {
				// 不可用 → 落到内存兜底
			}
			if (!memoryLedger) {
				const bag = new Map();
				memoryLedger = {
					getItem: (k) => (bag.has(k) ? bag.get(k) : null),
					setItem: (k, v) => { bag.set(k, String(v)); },
					removeItem: (k) => { bag.delete(k); },
				};
			}
			return memoryLedger;
		}

		/** 读账本容器；结构/版本不符或 JSON 损坏时一律重建（绝不抛）。 */
		function loadLedgerStore() {
			try {
				const raw = ledgerStorage().getItem(LEDGER_KEY);
				if (!raw) return { v: LEDGER_VERSION, sessions: {} };
				const parsed = JSON.parse(raw);
				if (!parsed || typeof parsed !== "object" || parsed.v !== LEDGER_VERSION) return { v: LEDGER_VERSION, sessions: {} };
				if (!parsed.sessions || typeof parsed.sessions !== "object") parsed.sessions = {};
				return parsed;
			} catch {
				return { v: LEDGER_VERSION, sessions: {} };
			}
		}

		/** 落盘账本（带会话数上限治理）；写失败（配额/受限）静默降级为不落盘。 */
		function saveLedgerStore(store) {
			try {
				const sessions = store && store.sessions ? store.sessions : {};
				const ids = Object.keys(sessions);
				if (ids.length > LEDGER_MAX_SESSIONS) {
					const stamp = (id) => {
						const t = Date.parse(sessions[id] && sessions[id].updatedAt);
						return Number.isFinite(t) ? t : 0;
					};
					ids.sort((a, b) => stamp(b) - stamp(a));
					for (const dead of ids.slice(LEDGER_MAX_SESSIONS)) delete sessions[dead];
				}
				ledgerStorage().setItem(LEDGER_KEY, JSON.stringify(store));
			} catch {
				// 账本是展示层估计数据，丢了可重建，绝不因此影响渲染
			}
		}

		/** 清空账本（单测隔离用；不传 sessionId 清全部）。 */
		function resetLedger(sessionId) {
			if (sessionId === undefined) {
				try { ledgerStorage().removeItem(LEDGER_KEY); } catch {}
				return;
			}
			const store = loadLedgerStore();
			delete store.sessions[ledgerKey(sessionId)];
			saveLedgerStore(store);
		}

		/** 当前推送对应的计价档位：新 payload 用主进程同刻判定，旧 payload 由 peak 推导。 */
		function tierOf(data) {
			const t = data && data.pricingTier;
			if (t === "peak" || t === "off" || t === "legacy") return t;
			if (data && typeof data.peak === "boolean") return data.peak ? "peak" : "off";
			return TIER_UNKNOWN;
		}

		/** 档位对应的价目表：优先 periodTables[tier]，降级到 priceTable（推送时刻表）。 */
		function tableForTier(data, tier) {
			const pts = data && data.periodTables;
			if (pts && typeof pts === "object" && tier && pts[tier] && typeof pts[tier] === "object") return pts[tier];
			if (data && data.priceTable && typeof data.priceTable === "object") return data.priceTable;
			return null;
		}

		/** 按模型名在价目表取档；未知模型回退默认模型档（与旧实现一致）。 */
		function pricesForModel(data, tier, model) {
			const table = tableForTier(data, tier);
			if (model && table && table[model]) return table[model];
			if (table && data && typeof data.model === "string" && table[data.model]) return table[data.model];
			return data && data.prices ? data.prices : void 0;
		}

		/** 累计用量 → 与高水位的差量（投影回退一律计 0，不追溯已入账部分）。 */
		function usageDelta(seen, u) {
			const prev = seen && typeof seen === "object" ? seen : emptyBuckets();
			const num = (v) => {
				const n = Number(v);
				return Number.isFinite(n) && n > 0 ? n : 0;
			};
			const delta = emptyBuckets();
			let grew = false;
			for (const k of TOKEN_KEYS) {
				const cur = num(u[k]);
				const old = num(prev[k]);
				const d = cur > old ? cur - old : 0;
				delta[k] = d;
				if (d > 0) grew = true;
			}
			return { delta, grew };
		}

		/** 新高水位 = max(旧水位, 本次累计观测)。 */
		function bumpHighWater(seen, u) {
			const prev = seen && typeof seen === "object" ? seen : emptyBuckets();
			const num = (v) => {
				const n = Number(v);
				return Number.isFinite(n) && n > 0 ? n : 0;
			};
			const next = emptyBuckets();
			for (const k of TOKEN_KEYS) next[k] = Math.max(num(prev[k]), num(u[k]));
			return next;
		}

		/** 账本记录 → 累计费用（¥）：各分段桶 cost 之和。 */
		function ledgerTotalOf(rec) {
			if (!rec || typeof rec !== "object" || !rec.buckets) return 0;
			let sum = 0;
			for (const key of Object.keys(rec.buckets)) {
				const b = rec.buckets[key];
				const c = Number(b && b.cost);
				if (Number.isFinite(c) && c > 0) sum += c;
			}
			return sum;
		}

		/** 只读账本累计费用（无用量帧不写盘）。 */
		function ledgerTotal(sessionId) {
			const store = loadLedgerStore();
			return ledgerTotalOf(store.sessions[ledgerKey(sessionId)]);
		}

		/** 账本分段列表（供 tooltip 展示「哪些时段各结了多少」）。 */
		function ledgerSegments(sessionId) {
			const store = loadLedgerStore();
			const rec = store.sessions[ledgerKey(sessionId)];
			if (!rec || !rec.buckets) return [];
			return Object.keys(rec.buckets).map((key) => {
				const b = rec.buckets[key];
				const at = key.lastIndexOf("|");
				return {
					model: at > 0 ? key.slice(0, at) : "",
					tier: at > 0 ? key.slice(at + 1) : key,
					cost: Number(b && b.cost) || 0,
				};
			});
		}

		const TIER_LABELS = { peak: "高峰", off: "空闲", legacy: "旧版价", unknown: "未分档" };

		/** 分段明细文案；单分段（未发生过峰谷切换）时返回空串，不增噪。 */
		function ledgerSegmentsText(sessionId) {
			const segs = ledgerSegments(sessionId).filter((s) => s.cost > 0);
			if (segs.length < 2) return "";
			return "（" + segs.map((s) => (TIER_LABELS[s.tier] || s.tier) + " ¥" + money(s.cost)).join(" + ") + "）";
		}

		/**
		 * 观察一次会话用量：按消耗时刻价目入账增量，返回该会话累计费用（¥）。
		 * 渲染期调用安全：幂等于「高水位差量」，重复渲染不叠加。
		 * @param {string} [sessionId] slot 标准 kit 提供的会话 id（缺失时归入临时键）
		 * @param {object} usage tokenUsage 投影（会话累计）
		 * @param {object|null} data 桌面壳推送载荷（可为 null = 纯浏览器模式）
		 */
		function observeSessionCost(sessionId, usage, data) {
			const key = ledgerKey(sessionId);
			const store = loadLedgerStore();
			const prev = store.sessions[key];
			const u = normalizeUsage(usage);
			if (!u) return ledgerTotalOf(prev);
			const rec = prev && typeof prev === "object" && prev.buckets
				? prev
				: { seen: emptyBuckets(), buckets: {}, model: null, backfilled: false };
			const { delta, grew } = usageDelta(rec.seen, u);
			if (!grew) return ledgerTotalOf(rec); // 无增量：历史不重算，不写盘
			const tier = tierOf(data);
			const model = u.model || (data && typeof data.model === "string" && data.model) || "deepseek-v4-pro";
			const prices = pricesForModel(data, tier, model);
			const cost = costOfBuckets(delta, prices);
			const bucketKey = model + "|" + tier;
			const bucket = rec.buckets[bucketKey] && typeof rec.buckets[bucketKey] === "object"
				? rec.buckets[bucketKey]
				: { ...emptyBuckets(), cost: 0 };
			for (const k of TOKEN_KEYS) bucket[k] = (Number(bucket[k]) || 0) + delta[k];
			bucket.cost = (Number(bucket.cost) || 0) + cost;
			rec.buckets[bucketKey] = bucket;
			// 首帧就已有累计用量 = 账本落地前的老会话（或升级后重开的会话）：
			// 按「当前价目」一次性入账，与旧实现首帧金额一致，并显式标注。
			const isFirstObservation = !prev;
			if (isFirstObservation) {
				rec.backfilled = true;
				try {
					if (typeof console !== "undefined" && console.info) {
						console.info("[dsh-balance] cost-ledger backfill: session=" + key + " model=" + model + " tier=" + tier + " cost=" + cost.toFixed(6) + "（首帧按当前价目一次性入账，此后增量才按消耗时刻分档）");
					}
				} catch {}
			}
			rec.seen = bumpHighWater(rec.seen, u);
			rec.model = model;
			rec.updatedAt = new Date().toISOString();
			store.sessions[key] = rec;
			saveLedgerStore(store);
			return ledgerTotalOf(rec);
		}

		/**
		 * 会话费用取价（展示用）：usage 携带真实模型且价目表含该模型
		 * → 按真实模型；否则回退默认模型档。tier 缺省时行为与旧实现一致。
		 */
		function pricesFor(usage, data, tier) {
			const u = normalizeUsage(usage);
			return pricesForModel(data, tier || TIER_UNKNOWN, u && u.model ? u.model : null);
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
		// 桥在场但事件迟迟不来（Tauri 版余额数据链 Phase 3 前未实装——壳只
		// 探活内核、无人投递 dsh-balance-changed）的降级时限：超时后视同
		// 「无桌面壳」的浏览器模式（本轮费用按内置价目，余额区不渲染），
		// 绝不让整个 dock 因 {loading:true} 永挂而消失。
		const BRIDGE_PUSH_TIMEOUT_MS = 4000;

		/** 订阅桌面壳推送的余额数据（首次挂载触发一次主动刷新，数据只走事件通道）。 */
		function useBalanceData() {
			const hasBridge = typeof window !== "undefined" && window.dshDesktop && typeof window.dshDesktop.refreshBalance === "function";
			const [data, setData] = react.useState(() => hasBridge && !bridgePushedOnce ? { loading: true } : null);
			react.useEffect(() => {
				let alive = true;
				const apply = (next) => { if (alive && next) { bridgePushedOnce = true; setData(next); } };
				const handler = (event) => apply(event.detail);
				window.addEventListener("dsh-balance-changed", handler);
				const bridge = window.dshDesktop;
				let timer = null;
				if (bridge && typeof bridge.refreshBalance === "function") {
					// 只触发刷新，不消费返回值（处理器按单一投递契约不返回数据）。
					if (!bridgePushedOnce) bridge.refreshBalance().catch(() => {});
					// 超时降级：时限内无任何推送 → 桥的事件链未实装（或网络久未
					// 回包），转浏览器模式兜底；之后真实事件到达时 apply 仍会接管
					// （loading=false 不阻断后续 setData）。
					timer = setTimeout(() => {
						if (alive && !bridgePushedOnce) setData(null);
					}, BRIDGE_PUSH_TIMEOUT_MS);
				}
				return () => {
					alive = false;
					if (timer) clearTimeout(timer);
					window.removeEventListener("dsh-balance-changed", handler);
				};
			}, []);
			return data;
		}

		function BalanceDock({ useProjection, sessionId }) {
			const usage = typeof useProjection === "function" ? useProjection("tokenUsage") : void 0;
			const data = useBalanceData();
			// 用户关闭「显示余额/本轮费用」时整个 dock 隐藏；等待首次推送期间也不闪现。
			if (data && (data.disabled === true || data.loading === true)) return null;
			const balances = data && Array.isArray(data.balances) ? data.balances : [];
			const primary = balances.find((b) => b.currency === "CNY") || balances[0];
			const hasBalance = !!(data && data.ok && primary);
			const usageKnown = hasUsage(usage);
			// issue #168：本轮费用 = 增量账本各时段分段之和（已结算不追溯）。
			// 渲染期调用幂等（同一观测增量为 0），峰谷切换不重算历史。
			const roundCost = usageKnown ? observeSessionCost(sessionId, usage, data) : 0;
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
			const usageTier = tierOf(data);
			const usagePrices = pricesFor(usage, data, usageTier);
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
			if (usageKnown) items.push(react_jsx_runtime.jsx("span", { children: "本轮 ¥" + money(roundCost) }, "cost"));
			if (hasBalance) items.push(react_jsx_runtime.jsx("span", { children: "余额 ¥" + money(primary.total) }, "balance"));
			// children 传数组且每项带稳定 key（真实 React 下数组子元素必须带 key，
			// 否则 dev 模式持续告警）；分隔符用 span 包裹避免字符串无法挂 key。
			// 曾踩过的坑：join 会把元素 toString 成 "[object Object]"（见 53e0a4c）。
			const joined = [];
			items.forEach((it, i) => {
				if (i > 0) joined.push(react_jsx_runtime.jsx("span", { className: "dsh-balance-sep", children: " · " }, "sep" + i));
				joined.push(it);
			});
			// 峰谷时段文案：2026-08-23 起周六/周日全天空闲（与 dsh-offpeak 口径对齐，
			// 主进程随 pricingSince 下发生效节点）。周末说明独立于当前档位展示，
			// 否则高峰时段反而看不到「周末全天空闲」这条规则。
			const weekendNote = data && data.pricingSince && data.pricingSince.weekendOffpeak ? "；周六/周日全天空闲价" : "";
			const periodNote = peak
				? (data.peak ? " · 高峰价（北京时间工作日 9:00-12:00 / 14:00-18:00，全价）" : " · 空闲价（高峰价的一半）")
				: "";
			// 账本分段说明（issue #168）：告知「本轮」已按时段锁定，不再因切换跳变。
			const ledgerNote = usageKnown
				? "；本轮费用按各时段消耗时刻分段计价（已结算不追溯，峰谷切换不重算历史）" + ledgerSegmentsText(sessionId)
				: "";
			const title = hasBalance
				? `${primary.currency} 余额 ¥${money(primary.total)}（充值 ¥${money(primary.toppedUp)} · 赠送 ¥${money(primary.granted)}）；本轮费用${priceNote}（¥/百万 token：命中 ${usagePrices?.cacheHit ?? FALLBACK_PRICES.cacheHit} / 未命中 ${usagePrices?.cacheMiss ?? FALLBACK_PRICES.cacheMiss} / 输出 ${usagePrices?.output ?? FALLBACK_PRICES.output}${periodNote}${weekendNote}${ledgerNote}），点击前往充值`
				: "本轮费用按 token 用量估算" + ledgerNote + "；未读取到 DeepSeek API Key，无法显示余额";
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
			// 一方包正确姿势（C2 定性，对齐 dsh-client-ui-goal 同款）：keyed slot 的
			// 子条目必须经 ctx.slots.inject(key, factory) 注册——前端 boot 用
			// Promise.all 并发物化全部插件 entry，不保证 conversation 大 bundle 先于
			// 本插件小 bundle 就绪；裸 slots.register 会在父 entry 尚未声明 children
			// 表时硬抛 "slot is not declared"（0.5.0 用户实机复现，插件整包加载失败）。
			// inject 把注册推迟到父 entry 就绪后派发，消除冷缓存首启竞态。
			// TA4：旧宿主（rc.7- 形态）slots kit 无 inject 时降级直 register
			//（可能撞 conversation 未声明竞态，但优于整插件 TypeError 加载失败）。
			ctx.effect(() => {
				if (typeof ctx.slots.inject === "function") {
					ctx.slots.inject(
						"conversation.composer.dock",
						() => ctx.slots.register({
							name: "conversation.composer.dock",
							id: "balance",
							order: 100
						}, BalanceDock),
						"dsh-balance: composer dock entry"
					);
				} else {
					ctx.slots.register({
						name: "conversation.composer.dock",
						id: "balance",
						order: 100
					}, BalanceDock);
				}
			});
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		// 纯函数暴露给单测（不触发 DOM / React 副作用），口径对齐
		// dsh-client-file-changes 的同名惯例。
		exports.__internals = {
			normalizeUsage,
			hasUsage,
			sessionCost,
			costOfBuckets,
			pricesFor,
			pricesForModel,
			money,
			goUsageText,
			goUsageTitle,
			// 增量计价账本（issue #168）
			observeSessionCost,
			ledgerTotal,
			ledgerTotalOf,
			ledgerSegments,
			ledgerSegmentsText,
			loadLedgerStore,
			saveLedgerStore,
			resetLedger,
			tierOf,
			tableForTier,
			usageDelta,
			bumpHighWater,
			emptyBuckets,
			ledgerKey,
			LEDGER_KEY,
			LEDGER_VERSION,
			LEDGER_EPHEMERAL,
			TIER_UNKNOWN,
		};
		return module.exports;
	}
});
