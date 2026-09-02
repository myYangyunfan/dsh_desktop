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
		 * priceTable, periodTables, pricingSince, model, peak, opencodeGo, at }，
		 * 契约见 docs/balance-architecture.md）；纯浏览器环境（无桌面壳）时
		 * 只显示「本轮费用」，价格用内置默认档。
		 *
		 * 本轮费用按「token 消耗时刻」的时段单价增量入账（见下方账本实现）：
		 * 峰谷切换只影响之后的新增量，已入账部分不随推送重算——与官方
		 * 峰谷计费口径一致。
		 *
		 * 单一投递契约：数据只从事件通道进入（window.dshDesktop.refreshBalance
		 * 只用于触发刷新、不消费其返回值），杜绝「IPC 返回值 + 事件推送」
		 * 双通道重复渲染。
		 */
		// 纯浏览器降级（无桌面壳）时的兜底价格档：与全链路默认模型
		// DEFAULT_MODEL = deepseek-v4-pro 一致（保守档，避免少报费用）。
		const FALLBACK_PRICES = { cacheMiss: 9, cacheHit: 0.3, output: 27 };

		// -----------------------------------------------------------------
		// 按消耗时段计价（与官方峰谷计费口径对齐）
		//
		// 官方规则：每个 token 按它被消耗那一刻的时段单价结算，已结算的量
		// 不随后续峰谷切换重算。tokenUsage 投影只给出累计四桶、无时间戳，
		// 因此在展示层做增量计价账本：每次观察到累计用量前进，只对增量按
		// 「观察时刻」的时段价入账；基线（首次观察到的存量）按当时时段价
		// 一次性入账。峰谷切换只影响之后的新增量，显示不再随推送整段跳变。
		// 时段价目来自主进程推送的三张表（periodTables：peak/off/legacy，
		// 见 docs/balance-architecture.md §2）；客户端按自身时钟选档，推送
		// 滞后（一个轮询周期）不影响计价正确性。
		// -----------------------------------------------------------------

		// 高峰窗口（分钟数，含起点不含终点）——镜像 balance.js isPeakHour。
		const PEAK_WINDOWS = [
			{ start: 9 * 60, end: 12 * 60 },
			{ start: 14 * 60, end: 18 * 60 },
		];
		// 周末全天空闲的生效日（北京日历日）——官方 2026-08-23 公告，
		// 与 dsh-offpeak 插件（issue #158）、balance.js 同口径，不溯及既往。
		const WEEKEND_OFFPEAK_SINCE = "2026-08-23";

		/** 北京时间（UTC+8，无夏令时）的分钟数/日历日/星期；用 UTC 字段平移读墙钟。 */
		function beijingPartsOf(ms) {
			const shifted = new Date(ms + 8 * 3600 * 1000);
			const year = shifted.getUTCFullYear();
			const month = shifted.getUTCMonth() + 1;
			const day = shifted.getUTCDate();
			const jsWeekday = shifted.getUTCDay(); // 0=周日 … 6=周六
			return {
				minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
				date: year + "-" + (month < 10 ? "0" : "") + month + "-" + (day < 10 ? "0" : "") + day,
				weekday: jsWeekday === 0 ? 7 : jsWeekday, // 1=周一 … 7=周日
			};
		}

		/** 指定时刻是否高峰时段（镜像主进程 isPeakHour 的峰谷期语义）。 */
		function isPeakAt(ms) {
			const p = beijingPartsOf(ms);
			if ((p.weekday === 6 || p.weekday === 7) && p.date >= WEEKEND_OFFPEAK_SINCE) return false;
			return PEAK_WINDOWS.some((w) => p.minutes >= w.start && p.minutes < w.end);
		}

		/** 推送载荷里的三张时段价目表（无该字段 → null，调用方走旧口径）。 */
		function periodTablesOf(data) {
			return data !== null && typeof data === "object" && data.periodTables !== null && typeof data.periodTables === "object"
				? data.periodTables
				: null;
		}

		/**
		 * 消耗时刻 ms 所处的时段价目表（peak/off/legacy 三选一）。
		 * 返回 null = 载荷未携带 periodTables（旧形态）→ 调用方回退
		 * pricesFor（按推送时刻已解析的单价）。
		 */
		function periodTableAt(data, ms) {
			const tables = periodTablesOf(data);
			if (tables === null) return null;
			const sinceMs = typeof data.pricingSince === "string" ? Date.parse(data.pricingSince) : NaN;
			let table;
			if (Number.isFinite(sinceMs) && ms < sinceMs) table = tables.legacy;
			else table = isPeakAt(ms) ? tables.peak : tables.off;
			return table !== null && typeof table === "object" ? table : null;
		}

		/** 价目表中该用量所属模型的档位（与 pricesFor 的取档规则一致）。 */
		function pickModelEntry(table, usage, data) {
			if (table === null) return null;
			const model = normalizeUsage(usage)?.model ?? null;
			const defaultModel = (data && typeof data.model === "string" && data.model) || "deepseek-v4-pro";
			const entry = (model !== null && table[model]) || table[defaultModel];
			return entry !== null && typeof entry === "object" ? entry : null;
		}

		/**
		 * 当前时刻的本地高峰判定（chip 显示与增量计价共用）。
		 * 返回 null = 无 periodTables（旧形态载荷）→ 调用方回退推送的 peak。
		 * 峰谷生效节点之前恒 false（旧版固定价期无高峰概念，与主进程一致）。
		 */
		function livePeakState(data) {
			if (periodTablesOf(data) === null) return null;
			const nowMs = Date.now();
			const sinceMs = typeof data.pricingSince === "string" ? Date.parse(data.pricingSince) : NaN;
			if (Number.isFinite(sinceMs) && nowMs < sinceMs) return false;
			return isPeakAt(nowMs);
		}

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

		/**
		 * token 桶用量 → 费用（¥）。缓存写入按 miss 价计费（与官方一致）。
		 * 桶分量允许为负——增量计价时 (turn,step) 样本替换会造成累计回退，
		 * 按有符号增量冲回；总费用下限 0，任何异常输入都不产生负费用。
		 */
		function bucketsCost(buckets, prices) {
			const price = (key, fallback) => {
				const v = Number(prices && prices[key]);
				return Number.isFinite(v) && v >= 0 ? v : fallback;
			};
			const cacheMiss = price("cacheMiss", FALLBACK_PRICES.cacheMiss);
			const cacheHit = price("cacheHit", FALLBACK_PRICES.cacheHit);
			const output = price("output", FALLBACK_PRICES.output);
			const perM = (n) => n / 1e6;
			// 输入未命中 = 未缓存输入 + 缓存写（两桶合并按 miss 价，不双计）。
			const miss = perM(buckets.uncached + buckets.write);
			const hit = perM(buckets.read);
			const out = perM(buckets.output);
			return Math.max(0, miss * cacheMiss + hit * cacheHit + out * output);
		}

		/** token 用量 → 本轮费用（¥）。缓存写入按 miss 价计费（与官方一致）。 */
		function sessionCost(usage, prices) {
			const u = normalizeUsage(usage);
			if (!u) return 0;
			return bucketsCost({ uncached: u.uncached, read: u.read, write: u.write, output: u.output }, prices);
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

		// -----------------------------------------------------------------
		// 会话费用账本（按消耗时段增量计价，见文件头「按消耗时段计价」段）
		//
		// - 键 = 会话 id（sessions 服务读取；取不到时退化为单槽 "unknown"）；
		// - localStorage 持久化：页面重载后从上次的累计与费用继续，不重置；
		// - 同一 usage 重复观察增量为零，天然幂等——渲染期调用安全（React
		//   StrictMode 双渲染/丢弃渲染重放同一份投影值，不会重复入账）；
		// - 已知近似（架构权衡，token 无时间戳）：基线（首次观察到的存量）
		//   按观察时刻的时段价一次性入账；页面关闭期间消耗的量在下次打开时
		//   按当时的时段价补记。自本插件在场起的新增量全部按真实消耗时段
		//   计价，显示不再随推送时刻的峰谷状态整段重算。
		// -----------------------------------------------------------------
		const LEDGER_STORAGE_KEY = "dsh-balance:cost-ledger:v1";
		const LEDGER_MAX_SESSIONS = 32;
		const LEDGER_TOUCH_PERSIST_MS = 60 * 1000;

		let ledgerMap = null; // Map<sessionId, {u:{uncached,read,write,output}, cost:number, at:number}>
		let ledgerPersistBroken = false;

		function ledgerStorage() {
			if (ledgerPersistBroken) return null;
			try {
				if (typeof localStorage === "undefined") return null;
				return localStorage;
			} catch {
				ledgerPersistBroken = true;
				return null;
			}
		}

		function validBuckets(b) {
			return b !== null && typeof b === "object"
				&& ["uncached", "read", "write", "output"].every((k) => Number.isFinite(b[k]));
		}

		function loadLedger() {
			if (ledgerMap !== null) return ledgerMap;
			ledgerMap = new Map();
			const store = ledgerStorage();
			if (store !== null) {
				try {
					const raw = store.getItem(LEDGER_STORAGE_KEY);
					const parsed = raw === null || raw === "" ? null : JSON.parse(raw);
					const sessions = parsed !== null && typeof parsed === "object"
						&& parsed.v === 1 && typeof parsed.sessions === "object" && parsed.sessions !== null
						? parsed.sessions
						: null;
					if (sessions !== null) {
						for (const key of Object.keys(sessions)) {
							const e = sessions[key];
							if (e !== null && typeof e === "object" && validBuckets(e.u)
								&& Number.isFinite(e.cost) && e.cost >= 0) {
								ledgerMap.set(String(key), {
									u: { uncached: e.u.uncached, read: e.u.read, write: e.u.write, output: e.u.output },
									cost: e.cost,
									at: Number.isFinite(e.at) ? e.at : 0,
								});
							}
						}
					}
				} catch {
					/* 脏数据 → 空账本继续（下次观察重建基线），绝不让 dock 挂掉 */
				}
			}
			return ledgerMap;
		}

		function persistLedger() {
			const store = ledgerStorage();
			if (store === null) return;
			try {
				// 容量上限：按最近使用时间保留最新 LEDGER_MAX_SESSIONS 条。
				let entries = Array.from(loadLedger().entries());
				if (entries.length > LEDGER_MAX_SESSIONS) {
					entries.sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
					entries = entries.slice(0, LEDGER_MAX_SESSIONS);
					ledgerMap = new Map(entries);
				}
				const sessions = {};
				for (const [key, e] of entries) {
					sessions[key] = { u: e.u, cost: Math.max(0, e.cost), at: e.at };
				}
				store.setItem(LEDGER_STORAGE_KEY, JSON.stringify({ v: 1, sessions }));
			} catch {
				ledgerPersistBroken = true; // 配额满/隐私模式 → 之后只走内存账本
			}
		}

		/**
		 * 观察一次累计用量并返回入账后的会话费用（¥）。
		 * 增量按观察时刻的时段价入账（periodTables 优先，旧形态载荷回退
		 * pricesFor）；账本领先于当前累计（异常回退）时重新入基线。
		 * 同一 usage 重复观察增量为零（幂等，见上方注释）。
		 */
		function observeCost(sessionId, usage, data) {
			const u = normalizeUsage(usage);
			if (!u) return 0;
			const map = loadLedger();
			const id = typeof sessionId === "string" && sessionId !== "" ? sessionId : "unknown";
			const current = { uncached: u.uncached, read: u.read, write: u.write, output: u.output };
			const nowMs = Date.now();
			const prices = pickModelEntry(periodTableAt(data, nowMs), usage, data) || pricesFor(usage, data);
			let entry = map.get(id);
			if (entry === undefined
				|| entry.u.uncached > current.uncached || entry.u.read > current.read
				|| entry.u.write > current.write || entry.u.output > current.output) {
				// 新会话或账本异常领先：以当前时刻的时段价对存量入基线。
				entry = { u: current, cost: bucketsCost(current, prices), at: nowMs };
				map.set(id, entry);
				persistLedger();
				return entry.cost;
			}
			const du = {
				uncached: current.uncached - entry.u.uncached,
				read: current.read - entry.u.read,
				write: current.write - entry.u.write,
				output: current.output - entry.u.output,
			};
			if (du.uncached === 0 && du.read === 0 && du.write === 0 && du.output === 0) {
				// 无增量：纯读路径；超过触碰窗口才回写 at（维持 LRU 新鲜度，
				// 推送触发的重渲染零 localStorage 写入）。
				if (nowMs - entry.at > LEDGER_TOUCH_PERSIST_MS) {
					entry.at = nowMs;
					persistLedger();
				}
				return entry.cost;
			}
			entry.cost = Math.max(0, entry.cost + bucketsCost(du, prices));
			entry.u = current;
			entry.at = nowMs;
			persistLedger();
			return entry.cost;
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
			const peakState = livePeakState(data);
			// 峰谷提醒：优先客户端本地判定（整点切换即时生效，不受推送周期
			// 滞后影响；含 2026-08-23 起周末全天空闲）；旧形态载荷（无
			// periodTables）回退主进程推送的 peak。可见文本放最前；高峰橙/空闲绿。
			const peak = peakState !== null ? peakState : (typeof data?.peak === "boolean" ? data.peak : null);
			const peakChip = peak !== null
				? react_jsx_runtime.jsx("span", {
					className: peak ? "dsh-balance-peak" : "dsh-balance-offpeak",
					children: peak ? "⛰ 高峰价" : "🌙 空闲价"
				}, "peak")
				: null;
			const usagePrices = pricesFor(usage, data);
			const usageModel = normalizeUsage(usage)?.model ?? null;
			// 本轮费用：账本按「token 消耗时刻」的时段单价增量入账（data 到位
			// 后启用）；data 缺位（纯浏览器模式/首次推送前）退回旧口径
			// （全量 × 已知单价）——首帧不空，浏览器模式行为与历史版本一致。
			const sessionCostNow = usageKnown && data
				? observeCost(sessionIdOf(), usage, data)
				: sessionCost(usage, usagePrices);
			// tooltip 里的当前单价：优先「此刻时段」的模型档（与增量计价同一
			// 取价口径，告诉用户新 token 现在什么价）。
			const nowPrices = usageKnown && data
				? (pickModelEntry(periodTableAt(data, Date.now()), usage, data) || usagePrices || FALLBACK_PRICES)
				: (usagePrices || FALLBACK_PRICES);
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
			if (usageKnown) items.push(react_jsx_runtime.jsx("span", { children: "本轮 ¥" + money(sessionCostNow) }, "cost"));
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
				? `${primary.currency} 余额 ¥${money(primary.total)}（充值 ¥${money(primary.toppedUp)} · 赠送 ¥${money(primary.granted)}）；本轮费用${priceNote}，按 token 消耗时段单价累加估算（¥/百万 token：命中 ${nowPrices?.cacheHit ?? FALLBACK_PRICES.cacheHit} / 未命中 ${nowPrices?.cacheMiss ?? FALLBACK_PRICES.cacheMiss} / 输出 ${nowPrices?.output ?? FALLBACK_PRICES.output}${peak !== null ? (peak ? " · 当前高峰（工作日北京时间 9:00-12:00 / 14:00-18:00 全价，周末空闲价）" : " · 当前空闲（高峰价的一半）") : ""}），点击前往充值`
				: "本轮费用按 token 消耗时段单价累加估算；未读取到 DeepSeek API Key，无法显示余额";
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
		// 会话 id 读取（费用账本键控）：sessions 服务的当前会话快照（与
		// dsh-offpeak 客户端同款取法）；服务缺席/形态不符时退化为单槽
		// "unknown"（单会话场景不受影响，会话间切换会重建基线）。
		let currentCtx = null; // apply(ctx) 捕获
		function sessionIdOf() {
			try {
				const sessions = currentCtx !== null ? currentCtx.get("sessions") : undefined;
				if (sessions !== undefined && sessions.list !== undefined) {
					const snap = sessions.list.getSnapshot();
					if (snap !== null && typeof snap === "object" && typeof snap.current === "string" && snap.current !== "") return snap.current;
				}
			} catch { /* 服务缺席 → unknown 单槽账本 */ }
			return "unknown";
		}

		function apply(ctx) {
			currentCtx = ctx;
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
		return module.exports;
	}
});
