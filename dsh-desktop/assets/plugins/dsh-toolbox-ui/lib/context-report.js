// 上下文观测面（「上下文」能力层）的**唯一**数据组装点。
//
// 这一层只做三件事：把会话日志读成"谁占了多少"，把宿主计量读成"到底多少"，其余一律如实上报
// （缺什么写 note，不编 0）。它**不自己发明 token 价格**——价格来自两处宿主事实：
//
//   1. `ctx.tokenMeter.measure(session)`：surface 上每个节点的价格（`nodes[].tokens`）。
//      surface = 模型可见的消息序列：system / developer / user / assistant / tool-result。
//      这是"构成"，是估算；它的口径由宿主固定（每 4 字符 1 token + 结构开销），本模块绝不重算。
//   2. `ctx.tokenMeter.contextPressure(session)`：提供方报告的最新提示词规模
//      （`pressureTokens`）与下一个请求的预计规模（`projectedTokens`），以及路由容量。
//      这是"总量"，是真实数字。
//
// 为什么必须分成两个数：构成行是近似，总量是真值，两者**不相等**（CJK 与 JSON schema 在
// 4 字符/token 下会被低估）。把构成放大成总量，或把总量摊给构成，都是在给用户一个
// 看起来精确的假数。上游 token-meter 的 README 把这条写成了硬要求：
// "把构成行呈现为近似构成，绝不呈现为总量"。
//
// ## 分类是**固定的五类**，顺序也是固定的
//
// 面板按 `CONTEXT_KINDS` 的顺序画图、排列图例，**不按面积降序**。真机反馈原话：
// "剩余的为啥显示在左边啊，有点反直觉"——那是按面积降序排的必然结果（剩余空间最大就跑到最左）。
// 固定的分类顺序让"图里第几块"和"图例第几项"永远对得上，看一眼就能形成肌肉记忆。
//
// ## 这一层**不产出任何给人看的文字**
//
// 报告里只有事实：分类 id、条目 id、工具名、计数、轮次、token / 字符数。没有 `label`、没有
// `sublabel`、没有「第 N 轮」这种拼好的中文——那些是**界面文案**，归客户端（`t()` 在那里）。
// 曾经这里拼过 `'×' + count`、`count + ' 条消息'`、`'未知工具'`：中文界面看不出问题，切成
// English 后那三处原样漏出中文，而两边的单测各自都是绿的（宿主断言字符串、客户端断言 DOM）。
// 判据很简单：这里出去的中文，客户端就再也翻不了。
//
// 五类对应宿主真实存在的东西，不多编一类：
//   · `system`      ← `system/message`（系统提示词，多次改写取最后一条）
//   · `tools`       ← 请求头里的 `tools` schema + `developer/message`（source `tool-registry`）
//   · `tool-result` ← `tool/result`（按工具名合并）
//   · `attachment`  ← 消息里的 `image` 块（截图/图片附件）
//   · `conversation`← user/assistant 的文本与推理
//
// 宿主**没有**"记忆"这个维度（没有任何事件或块类型标出它），所以这里也不造一类假的出来：
// 想按记忆/文件细分，得先有宿主侧的标记，否则只能靠文件名猜，那是假精确。

/** 分类的固定顺序。面板的绘制顺序、图例顺序、筛选器顺序全部取这里。 */
export const CONTEXT_KINDS = ['system', 'tools', 'tool-result', 'attachment', 'conversation']

/**
 * 每类最多随报告带多少条明细。
 *
 * 这个数是给**轮询**定的：报告每 3 秒走一次 wire，而明细条数按轮增长。24 条足够画出
 * "前几大 + 其余 N 项"（客户端图例封顶 6 块、明细封顶 20 行），超出的由 `folded` 上报。
 */
export const MAX_ITEMS_PER_KIND = 24

/**
 * 逐轮用量最多带多少轮（从最近往前）。
 *
 * 面板只画最近 60 根柱，所以 120 轮留了一倍余量；再多就是纯 payload（真机 1500 轮 = 165KB）。
 * 总数另给 `turnTotal`，脚注的"N 轮"读它，不读数组长度。
 */
export const TURN_HISTORY_LIMIT = 120

/**
 * 从事件里取**消息本体**。
 *
 * ⚠️ 这张表是拿真实日志换来的，不是猜的：`user/message` 的 `data` **直接就是消息**
 * （`{content, source, role, id}`），而其余四类都包在 `data.message` 里。
 * 最初只读 `data.message`，于是 28 条用户消息一条都没进构成，面板上"会话内容"凭空少一块，
 * 而单测用的是我手写的 `data.message` 形状，全绿。真实日志为准。
 */
function messageOf(event) {
	const data = event?.data
	if (data?.message && typeof data.message === 'object') return data.message
	if (data?.role && Array.isArray(data?.content)) return data
	return undefined
}

/** 事件类型 → 分类。不在表里的（turn/start 等）根本不是 surface。 */
const SURFACE_KIND = {
	'system/message': 'system',
	'developer/message': 'tools',
	'user/message': 'conversation',
	'assistant/message': 'conversation',
	'tool/result': 'tool-result',
}

/** 块 → 细分归属。只有附件从"会话内容"里单独剥出来，其余（文本/推理/工具调用）都算会话内容。 */
function blockKind(block) {
	return block?.type === 'image' ? 'attachment' : 'conversation'
}

/**
 * 一条消息的字符账与**块级拆分**。
 *
 * 为什么要拆：附件（图片）混在用户消息里，而"这条消息有多大"与"这张图有多大"是两个问题。
 * 宿主的价格是**整节点**给的，没有单块的价，所以这里按字符占比把节点价格分给各块。
 * 这是估算，但方向正确且**总和守恒**（拆出来的和等于原值），面板也一直标注"构成是估算"。
 *
 * @param {object} message
 * @returns {{ total: number, byKind: Record<string, number> }} 字符数与逐块字符数
 */
function splitMessageChars(message) {
	const content = Array.isArray(message?.content) ? message.content : []
	const byKind = {}
	let total = 0
	for (const block of content) {
		if (!block || typeof block !== 'object') continue
		let chars = 0
		if (block.type === 'text' || block.type === 'reasoning') chars = String(block.text ?? '').length
		else if (block.type === 'tool-call') chars = String(block.name ?? '').length + String(block.arguments ?? '').length
		else if (block.type === 'image') {
			// 图片没有"字符"，但它在请求里真实占位（视觉 token）。给一个**结构性权重**，
			// 让它不至于在按字符占比拆分价格时被算成 0：JSON 元数据长度足够代表它的占位量级。
			try {
				chars = JSON.stringify(block).length
			} catch {
				chars = 0
			}
		} else {
			try {
				chars = JSON.stringify(block).length
			} catch {
				chars = 0
			}
		}
		const kind = blockKind(block)
		byKind[kind] = (byKind[kind] ?? 0) + chars
		total += chars
	}
	return { total, byKind }
}

/** 系统提示词的文本（给摘要用）。 */
function systemText(message) {
	return (Array.isArray(message?.content) ? message.content : [])
		.filter((block) => block?.type === 'text')
		.map((block) => block.text)
		.join('\n')
}

const firstLine = (text) => {
	const value = String(text ?? '').trim()
	if (!value) return ''
	const line = value.split('\n').find((entry) => entry.trim() !== '') ?? ''
	return line.length > 96 ? line.slice(0, 96) + '…' : line
}

/**
 * 逐轮用量：每个 turn 取**该轮最后一次成功请求**的提示词规模。
 *
 * 为什么是"最后一次"而不是求和：`usage.inputTokens` + `usage.cacheReadTokens`
 * 已经是"这一请求整个上下文的规模"，同轮多次请求是同一份上下文的不同快照；
 * 求和得到的是"这一轮烧了多少 token"（计费口径），不是"上下文有多大"。这个面板回答
 * 后者，所以取末次并写明口径。计费口径另给 `billed`（各次之和），不混为一谈。
 */
export function foldTurnUsage(events) {
	const rows = new Map()
	let billed = { prompt: 0, cacheRead: 0, cacheWrite: 0, output: 0, requests: 0 }
	for (const event of Array.isArray(events) ? events : []) {
		if (event?.type !== 'assistant/message') continue
		const usage = event?.data?.usage
		if (!usage) continue
		const turn = Number(event?.data?.turn)
		const prompt = Number(usage.inputTokens ?? 0) + Number(usage.cacheReadTokens ?? 0)
		const row = Number.isFinite(turn) ? rows.get(turn) : undefined
		const next = {
			turn: Number.isFinite(turn) ? turn : 0,
			at: Number(event?.time ?? 0),
			prompt,
			cacheRead: Number(usage.cacheReadTokens ?? 0),
			output: Number(usage.outputTokens ?? 0),
			requests: (row?.requests ?? 0) + 1,
			billed: (row?.billed ?? 0) + Number(usage.totalTokens ?? 0),
		}
		if (Number.isFinite(turn)) rows.set(turn, next)
		billed = {
			prompt: billed.prompt + prompt,
			cacheRead: billed.cacheRead + Number(usage.cacheReadTokens ?? 0),
			cacheWrite: billed.cacheWrite + Number(usage.cacheWriteTokens ?? 0),
			output: billed.output + Number(usage.outputTokens ?? 0),
			requests: billed.requests + 1,
		}
	}
	const turns = [...rows.values()].sort((left, right) => left.turn - right.turn)
	return { turns, billed }
}

/**
 * 会话的元信息。
 *
 * 标题来自 `session/title` 事件（宿主可能改写多次，取最后一个）；没有就返回 null，
 * 由面板显示会话 id 的短形式——不编一个假标题。
 *
 * `running` 由事件推出：最后一个 `turn/start` 之后还没有配套的 `turn/end`。面板要靠它
 * 说清"这些数字是哪一刻的"——上下文面板读的是**最近一次请求**的快照，正在跑的这一轮
 * 还没进快照，不标注就会让人以为数字是实时的（参考产品也是这么标的）。
 */
export function foldSessionMeta(events) {
	let title = null
	let lastAt = 0
	let requests = 0
	let steps = 0
	let cwd = null
	let openTurn = false
	for (const event of Array.isArray(events) ? events : []) {
		const at = Number(event?.time ?? 0)
		if (at > lastAt) lastAt = at
		if (event?.type === 'session/title' && typeof event?.data?.title === 'string') title = event.data.title
		if (event?.type === 'session' && typeof event?.cwd === 'string') cwd = event.cwd
		if (event?.type === 'request/header') requests += 1
		if (event?.type === 'step/start') steps += 1
		if (event?.type === 'turn/start') openTurn = true
		if (event?.type === 'turn/end') openTurn = false
	}
	return { title, lastAt, requests, steps, cwd, running: openTurn }
}

/** 从事件里折出**最后一次请求的路由信息**（provider / model / contextWindow）。 */
export function foldRequestContext(events) {
	let context
	for (const event of Array.isArray(events) ? events : []) {
		if (event?.type === 'request/context' && event?.data && typeof event.data === 'object') context = event.data
	}
	return context
}

/** 从事件里折出**最后一次请求头**（工具定义在 `header.tools` 里）。 */
export function foldRequestHeader(events) {
	let header
	for (const event of Array.isArray(events) ? events : []) {
		if (event?.type === 'request/header' && event?.data?.header && typeof event.data.header === 'object') header = event.data.header
	}
	return header
}

/**
 * 工具搜索的**本会话**统计。
 *
 * 数据源是会话日志里的 `tool/call`（name 为 `tool_search`）与配套的 `tool/result`，
 * 因此它天然是"这个会话搜了什么"。**这是搜索记录的唯一真相源**：宿主 runtime 里曾经还有
 * 一张全局旁路表，展示搬到这里之后它就没有读者了——两套"搜索记录"摆在一起必然有一天对不上，
 * 所以那张表连同它在热路径上的序列化一起删掉了（见 lib/tool-search-runtime.js 的注释）。
 *
 * `select:foo,bar` 是**点名精确取**，其余是关键词搜索——两者对"目录够不够完整"的含义完全
 * 不同（点名失败说明名字抄错或目录被截断；关键词无命中只是没匹配上），所以分开计数。
 *
 * @param {readonly object[]} events
 * @returns {{ calls: number, byName: number, byKeyword: number, withResult: number, resultChars: number, recent: {query: string, exact: boolean, chars: number|null}[] }}
 */
export function foldToolSearchStats(events) {
	const list = Array.isArray(events) ? events : []
	const resultCharsByCall = new Map()
	for (const event of list) {
		if (event?.type !== 'tool/result') continue
		const callId = String(event?.data?.message?.toolCallId ?? event?.data?.message?.source?.callId ?? '')
		if (callId === '') continue
		const message = messageOf(event)
		const chars = (Array.isArray(message?.content) ? message.content : [])
			.reduce((sum, block) => sum + (block?.type === 'text' ? String(block.text ?? '').length : 0), 0)
		resultCharsByCall.set(callId, chars)
	}
	let calls = 0
	let byName = 0
	let byKeyword = 0
	let withResult = 0
	let resultChars = 0
	const recent = []
	for (const event of list) {
		if (event?.type !== 'tool/call') continue
		if (String(event?.data?.name ?? '') !== 'tool_search') continue
		calls += 1
		let query = ''
		let exact = false
		try {
			const parsed = JSON.parse(String(event?.data?.arguments ?? '{}'))
			query = String(parsed?.query ?? parsed?.select ?? '')
			exact = query.trim().startsWith('select:')
			if (typeof parsed?.select === 'string' && query === '') query = 'select:' + parsed.select
		} catch {
			query = ''
		}
		if (exact) byName += 1
		else byKeyword += 1
		const chars = resultCharsByCall.get(String(event?.data?.callId ?? ''))
		if (chars !== undefined) {
			withResult += 1
			resultChars += chars
		}
		recent.push({ query, exact, chars: chars ?? null, at: Number(event?.time ?? 0) })
	}
	return { calls, byName, byKeyword, withResult, resultChars, recent }
}

/**
 * 从事件日志折出**模型可见的那批消息**（surface 的近似），并给出每条的轮次。
 *
 * 两条用途：① `measure()` 没给节点价格时，构成只能按字符算——没有这一步，降级态的
 * 构成就只剩「工具定义」一项（真机实测：treemap 只有两块，等于没画）；② 有价格时，
 * 它是**唯一**的轮次解析（价格只贴到 seq 上，轮次必须与无价格路径同一套规则）。
 *
 * 与真正的 surface 的差别（如实说明，不假装精确）：
 *   · 压缩（compaction）会用 `replace` 事件取代旧节点，这里不重放替换——被压缩掉的历史
 *     仍会算进字符账。所以这份构成对**压缩过**的会话会偏大。
 *   · `tool/result` 是否被接受进 surface 由宿主的 repair 逻辑判定，这里只看事件类型。
 * 两条偏差都只会让估算**偏大**，且面板的构成本来就是估算，因此可以接受。
 */
export function foldSurfaceEvents(events) {
	const list = Array.isArray(events) ? events : []
	// ① 先反向扫一遍：每个位置"之后最近的 assistant 属于第几轮"。
	//    `user/message` **不带 turn 字段**（真实日志如此），而 `turn/start` 在 fork/恢复过的
	//    会话里可能只在开头出现一次（真机：424 个 step、turn 编号到 15，却只有一条 turn/start）。
	//    所以轮次以宿主的 `assistant/message.data.turn` 为准，用户消息归到它之后那一轮。
	const nextAssistantTurn = new Map()
	let upcoming = null
	for (let index = list.length - 1; index >= 0; index -= 1) {
		const event = list[index]
		if (event?.type === 'assistant/message' && Number.isFinite(event?.data?.turn)) upcoming = event.data.turn
		if (Number.isFinite(event?.seq)) nextAssistantTurn.set(event.seq, upcoming)
	}
	const out = []
	let currentTurn = 0
	for (const event of list) {
		if (event?.type === 'turn/start' && Number.isFinite(event?.data?.turn)) currentTurn = event.data.turn
		const kind = SURFACE_KIND[event?.type]
		if (!kind) continue
		const message = messageOf(event)
		if (!message) continue
		const own = Number.isFinite(event?.data?.turn) ? event.data.turn : null
		const fallback = Number.isFinite(event?.seq) ? nextAssistantTurn.get(event.seq) : null
		out.push({
			seq: Number.isFinite(event?.seq) ? event.seq : out.length,
			kind,
			// 三条来源的优先级：事件自己写的 turn > 之后那条 assistant 的 turn > turn/start 的游标。
			turn: own ?? fallback ?? currentTurn,
			message,
			event,
		})
	}
	return out
}

/** 工具结果的 callId。**三级回退**：真机上 callId 在 `data.message` 里，顶层没有。 */
function toolCallIdOf(event) {
	const data = event?.data
	return String(data?.message?.toolCallId
		?? data?.message?.source?.callId
		?? data?.toolCallId
		?? '')
}

/** 数值累加，但保持 null 语义：没有价格就一直是 null，不能 `null + 0` 变成 0。 */
const addTo = (entry, field, value) => {
	if (Number.isFinite(value)) entry[field] = (entry[field] ?? 0) + value
}

/**
 * 组装报告。
 *
 * 入参全部是**已经取到的宿主事实**，本函数不碰 ctx：这样它能在没有宿主的测试里真跑，
 * 也让"哪些是宿主给的、哪些是这里补的"一眼可见。
 *
 * @param {object} input
 * @param {object} input.session 会话身份 `{ id, cwd }`
 * @param {readonly object[]} input.events `session.snapshotEvents()`
 * @param {object|undefined} input.context `session.requestContext()`（provider/model/contextWindow）
 * @param {object|undefined} input.header `session.requestHeader()`（tools 定义）
 * @param {{totalTokens?: number, surfaceTokens?: number, nodes?: readonly object[]}} [input.measurement]
 *   `ctx.tokenMeter.measure(session)` 的结果；缺省表示宿主没有计量能力。
 * @param {{pressureTokens?: number, projectedTokens?: number, contextWindow?: number}} [input.pressure]
 *   `ctx.tokenMeter.contextPressure(session)` 的结果。
 * @param {{systemTokens?: number, toolsTokens?: number, messageTokens?: number}} [input.breakdown]
 *   `contextBreakdown` 投影（宿主同一套估算器）。
 * @returns {object} 报告
 */
export function buildContextReport(input) {
	const events = Array.isArray(input?.events) ? input.events : []
	const session = input?.session ?? {}
	const context = input?.context ?? {}
	const header = input?.header ?? undefined
	const measurement = input?.measurement ?? null
	const pressure = input?.pressure ?? null
	const breakdown = input?.breakdown ?? null

	// ── ① 事件索引：seq → 事件，callId → 工具名 ──────────────────────────────
	const bySeq = new Map()
	const callNames = new Map()
	for (const event of events) {
		if (Number.isFinite(event?.seq)) bySeq.set(event.seq, event)
		if (event?.type === 'tool/call' && event?.data?.callId) callNames.set(String(event.data.callId), String(event.data.name ?? ''))
	}

	// ── ② 取 surface：有节点价格就按节点，否则按事件折 ────────────────────────
	//
	// ⚠️ **轮次解析只有一处**（`foldSurfaceEvents`）。曾经有价格的那条路自己写
	// `Number(event.data.turn ?? 0)`，于是 `user/message`（不带 turn）在有价格的会话里全被
	// 算成第 0 轮，与无价格路径不一致——同一份日志两种读数，而两边单测各自绿。
	// 现在先用同一套解析得到 seq→turn，再按 seq 把价格贴上去。
	const turnBySeq = new Map()
	for (const entry of foldSurfaceEvents(events)) turnBySeq.set(entry.seq, entry.turn)
	const pricedNodes = Array.isArray(measurement?.nodes) ? measurement.nodes : []
	const surface = pricedNodes.length > 0
		? pricedNodes
			.map((node) => {
				const event = bySeq.get(node?.seq)
				const kind = event ? SURFACE_KIND[event.type] : undefined
				const message = event ? messageOf(event) : undefined
				if (!kind || !message) return null
				return {
					seq: node.seq,
					kind,
					turn: turnBySeq.get(node.seq) ?? 0,
					message,
					event,
					tokens: Number.isFinite(node?.tokens) ? node.tokens : null,
				}
			})
			.filter(Boolean)
		: foldSurfaceEvents(events).map((entry) => ({ ...entry, tokens: null }))

	// ── ③ 聚合：五类条目 + 按轮 + 按工具 ─────────────────────────────────────
	const items = []
	const conversationByTurn = new Map()
	const toolItems = new Map()
	const kindTotals = Object.fromEntries(CONTEXT_KINDS.map((kind) => [kind, { tokens: null, chars: 0 }]))
	let systemItem = null
	let attachmentItem = null
	// `developer/message`（source `tool-registry`）的字符与价格：并入「工具定义」那一行，
	// 不再单列成「工具注册消息」。理由很实际——用户不需要知道"宿主管这叫注册消息"，
	// 他只需要知道"工具这一块一共占多少"。多列一行只是把同一个答案拆成两半。
	let registryChars = 0
	let registryTokens = null

	const ensureKind = (kind) => {
		kindTotals[kind] ??= { tokens: null, chars: 0 }
		return kindTotals[kind]
	}

	for (const entry of surface) {
		const { kind, message } = entry
		const { total, byKind } = splitMessageChars(message)
		const tokens = entry.tokens

		if (kind === 'system') {
			// 系统提示词只有最后一条生效（改写时后覆盖前），所以**合计也是覆盖**而不是累加：
			// 累加会把 5 条历史改写都算进去（真机：合计 120K、明细 24.7K，图例与列表自相矛盾）。
			ensureKind('system').chars = total
			ensureKind('system').tokens = Number.isFinite(tokens) ? tokens : null
			systemItem = {
				id: 'system',
				kind: 'system',
				// 系统提示词的首行是**内容**（给读者一个"这条是什么"的抓手），不是界面文案。
				preview: firstLine(systemText(message)) || null,
				tokens,
				chars: total,
				count: 1,
				turn: null,
			}
			continue
		}

		ensureKind(kind).chars += total
		addTo(ensureKind(kind), 'tokens', tokens)

		if (kind === 'tools') {
			// 工具注册消息：只累加，最终并进「工具定义」那一行（见上面 registryChars 的说明）。
			registryChars += total
			if (Number.isFinite(tokens)) registryTokens = (registryTokens ?? 0) + tokens
			continue
		}
		if (kind === 'tool-result') {
			// `label` 是**工具名**（标识符，原样显示）。解析不到名字就留 null，由客户端说
			// "未知工具"——这里不写中文，否则英文界面里会漏出一句中文。
			const name = callNames.get(toolCallIdOf(entry.event)) ?? null
			const key = name ?? ''
			const item = toolItems.get(key) ?? { id: 'tool:' + key, kind: 'tool-result', label: name, tokens: null, chars: 0, count: 0, turn: null }
			item.count += 1
			item.chars += total
			addTo(item, 'tokens', tokens)
			toolItems.set(key, item)
			continue
		}
		// conversation：附件按字符占比**从这条消息里剥出来**，剩下的算会话内容。
		const attachmentChars = byKind.attachment ?? 0
		if (attachmentChars > 0) {
			const share = total > 0 ? attachmentChars / total : 0
			const item = attachmentItem ?? { id: 'attachment', kind: 'attachment', tokens: null, chars: 0, count: 0, turn: null }
			item.count += 1
			item.chars += attachmentChars
			if (Number.isFinite(tokens)) item.tokens = (item.tokens ?? 0) + tokens * share
			attachmentItem = item
			// 同一份 token 不能再算给会话内容，否则总和会翻倍。
			ensureKind('attachment').chars += attachmentChars
			if (Number.isFinite(tokens)) ensureKind('attachment').tokens = (ensureKind('attachment').tokens ?? 0) + tokens * share
			ensureKind('conversation').chars -= attachmentChars
			if (Number.isFinite(tokens)) ensureKind('conversation').tokens = (ensureKind('conversation').tokens ?? 0) - tokens * share
		}
		const turn = Number(entry.turn ?? 0)
		const item = conversationByTurn.get(turn) ?? { id: 'turn:' + turn, kind: 'conversation', tokens: null, chars: 0, count: 0, turn }
		item.count += 1
		item.chars += total - attachmentChars
		if (Number.isFinite(tokens)) item.tokens = (item.tokens ?? 0) + tokens * (1 - (attachmentChars > 0 && total > 0 ? attachmentChars / total : 0))
		conversationByTurn.set(turn, item)
	}

	// 工具定义：数量与价格都来自请求头/投影（宿主口径），读不到就 null，不编 0。
	const toolCount = Array.isArray(header?.tools) ? header.tools.length : null
	let toolChars = null
	if (toolCount !== null) {
		try {
			toolChars = JSON.stringify(header.tools).length
		} catch {
			toolChars = null
		}
	}
	const toolsItem = {
		id: 'tools',
		kind: 'tools',
		tokens: Number.isFinite(breakdown?.toolsTokens) ? breakdown.toolsTokens : null,
		chars: toolChars,
		count: toolCount,
		turn: null,
	}
	if (Number.isFinite(toolsItem.tokens)) ensureKind('tools').tokens = (ensureKind('tools').tokens ?? 0) + toolsItem.tokens
	if (Number.isFinite(toolChars)) ensureKind('tools').chars += toolChars
	// 工具注册消息并进「工具定义」这一行（schema + 注册说明本来就是同一件事的两部分）。
	if (registryChars > 0) {
		toolsItem.chars = (Number.isFinite(toolsItem.chars) ? toolsItem.chars : 0) + registryChars
		if (Number.isFinite(registryTokens) || Number.isFinite(toolsItem.tokens)) {
			toolsItem.tokens = (Number.isFinite(toolsItem.tokens) ? toolsItem.tokens : 0) + (registryTokens ?? 0)
		}
	}

	// 输出顺序：**按分类固定顺序**（不按面积），分类内按大小降序。图例与筛选器用同一张表。
	//
	// 每类最多带 `MAX_ITEMS_PER_KIND` 条：这一面每 3 秒轮询一次，而明细按轮增长（真机 400+ 轮）。
	// 不封顶的话，一份长会话的报告是 **287KB**，也就是开着面板每秒约 95KB 的 wire 流量——
	// 客户端封顶只省了 DOM，省不了这一笔。超出部分由 `kinds[].folded` 如实上报，
	// 客户端据此写"其余 N 项"，不会悄悄少画。
	const bySize = (left, right) => (right.tokens ?? right.chars ?? 0) - (left.tokens ?? left.chars ?? 0)
	const grouped = {
		system: systemItem ? [systemItem] : [],
		tools: [toolsItem].filter(Boolean),
		'tool-result': [...toolItems.values()].sort(bySize),
		attachment: attachmentItem ? [attachmentItem] : [],
		conversation: [...conversationByTurn.values()].sort(bySize),
	}
	const foldedByKind = {}
	for (const kind of CONTEXT_KINDS) {
		const list = grouped[kind]
		const kept = list.slice(0, MAX_ITEMS_PER_KIND)
		foldedByKind[kind] = list.length - kept.length
		items.push(...kept)
	}

	// ── ④ 总数：真实值优先，估算值单独摆 ────────────────────────────────────
	const usage = foldTurnUsage(events)
	const meta = foldSessionMeta(events)
	const allTurns = usage.turns
	const lastTurn = allTurns.length ? allTurns[allTurns.length - 1] : null
	const window = Number.isFinite(context?.contextWindow) ? context.contextWindow
		: Number.isFinite(pressure?.contextWindow) ? pressure.contextWindow
			: null
	const used = Number.isFinite(pressure?.pressureTokens) && pressure.pressureTokens > 0
		? pressure.pressureTokens
		: lastTurn
			? lastTurn.prompt
			: null
	// ⚠️ 这两个数必须按**封顶前**的全量算：`totals.itemTokens` 是客户端把估算构成换算到真实
	// 总量时的分母，拿封顶后的和去当分母，缺的那 1400 轮会被摊到剩下的几项上——数字变大、
	// 还"加得起来"，正是这个面板反复要避免的那种假精确。
	const allItems = CONTEXT_KINDS.flatMap((kind) => grouped[kind])
	const itemTokens = allItems.reduce((sum, item) => sum + (Number.isFinite(item.tokens) ? item.tokens : 0), 0)
	const fullyPriced = allItems.length > 0 && allItems.every((item) => Number.isFinite(item.tokens))

	// 分类合计：图例与筛选器读这里，保证"每类多少"只有一个来源（不各算一遍）。
	// `count` 是**真实**条数、`folded` 是没随报告走的条数——两者一起让客户端能写"其余 N 项"。
	const kinds = CONTEXT_KINDS
		.map((kind) => ({
			kind,
			tokens: Number.isFinite(kindTotals[kind]?.tokens) ? kindTotals[kind].tokens : null,
			chars: kindTotals[kind]?.chars ?? 0,
			count: grouped[kind].length,
			folded: foldedByKind[kind],
		}))
		.filter((entry) => entry.chars > 0 || Number.isFinite(entry.tokens) || entry.count > 0)

	const toolSearch = foldToolSearchStats(events)

	return {
		ok: true,
		at: Date.now(),
		session: {
			id: typeof session.id === 'string' ? session.id : null,
			cwd: typeof session.cwd === 'string' ? session.cwd : meta.cwd,
			title: meta.title,
			requests: meta.requests,
			steps: meta.steps,
			lastAt: meta.lastAt,
			// 正在跑一轮时为 true：面板据此标注"数字来自上一轮"。
			running: meta.running === true,
		},
		route: {
			provider: typeof context?.provider === 'string' ? context.provider : null,
			model: typeof context?.model === 'string' ? context.model : null,
			contextWindow: Number.isFinite(context?.contextWindow) ? context.contextWindow : null,
		},
		budget: {
			window,
			used,
			projected: Number.isFinite(pressure?.projectedTokens) ? pressure.projectedTokens : null,
			remaining: window !== null && used !== null ? Math.max(0, window - used) : null,
			ratio: window !== null && used !== null && window > 0 ? used / window : null,
		},
		cache: {
			prompt: lastTurn ? lastTurn.prompt : null,
			cacheRead: lastTurn ? lastTurn.cacheRead : null,
			// 命中率的分母是**提示词规模**（含缓存读），分子是缓存命中部分。
			hitRate: lastTurn && lastTurn.prompt > 0 && Number.isFinite(lastTurn.cacheRead) ? lastTurn.cacheRead / lastTurn.prompt : null,
			sessionHitRate: usage.billed.prompt > 0 ? usage.billed.cacheRead / usage.billed.prompt : null,
			// 「新增」= 这次请求里真正要重新算的那部分（未命中缓存的输入）。
			fresh: lastTurn ? Math.max(0, lastTurn.prompt - (lastTurn.cacheRead ?? 0)) : null,
		},
		tools: {
			total: toolCount,
			tokens: toolsItem.tokens,
			chars: toolChars,
			search: toolSearch,
		},
		// 逐轮：只带最近 `TURN_HISTORY_LIMIT` 轮（面板只画最近 60 根柱），总数另给 `turnTotal`。
		turns: allTurns.slice(-TURN_HISTORY_LIMIT),
		turnTotal: allTurns.length,
		billed: usage.billed,
		totals: {
			itemTokens,
			measured: fullyPriced,
			surfaceChars: allItems.reduce((sum, item) => sum + (item.chars ?? 0), 0),
		},
		kinds,
		items,
	}
}
