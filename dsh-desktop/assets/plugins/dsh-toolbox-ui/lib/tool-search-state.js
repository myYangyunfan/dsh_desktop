// 发现集状态：LRU 记录（B7/B8/B9/B10）+ 会话投影 fold（C4）。
//
// 两套状态刻意分开：
//   - **运行期**状态 `{ tick, version, discovered: Map<name, tick> }` 是按 agent 的
//     （`WeakMap<agent, state>`，在 runtime 里），带 LRU 时间戳；
//   - **投影**状态 `{ discovered: string[] }` 是按 session 的、纯 JSON、有界，只用来
//     "下次恢复时播种"。它不带 lastUsed（首版不持久化，恢复后按发现顺序播种会自愈）。
// 混成一份会带来两个错：投影会跟着 agent 的 LRU 抖动（宿主按引用变化触发下游工作），
// 而运行期状态会变成"一会话多 agent 共享"。

/**
 * 搜索结果的协议标记。
 *
 * v2 与 v1 的差别不是字段多了几个，而是**语义**：v1 的累积列表只能 union（旧结果不知道
 * "现在还剩什么"），于是淘汰、清空、顺序全部丢失；v2 携带**有序替换快照**，读侧直接替换，
 * 空快照就是清空。协议、解析器、fold 必须同时改，所以它们住在一起——三者分开写在三个
 * 文件里时，"改了一处忘另一处"是静默失败（老结果被当成新格式解析）。
 */
export const META_PROTOCOL = 'dsh-tool-search/v1'
export const META_PROTOCOL_V2 = 'dsh-tool-search/v2'

/** 投影键。宿主按 key 注册/计数，命名跟宿主一等公民同风格（camelCase）。 */
export const PROJECTION_KEY = 'toolSearchDiscoveries'

/**
 * 新的运行期发现集状态。
 * @returns {{tick: number, version: number, discovered: Map<string, number>}}
 */
export function createState() {
  // `promised`：已经**返回给模型**的工具名（含本批里早就发现过的）。它不进目录文本
  // （成员没变，version 不动），只决定谁不能被淘汰——"刚把 schema 交给模型、下一句就
  // 拒掉它的调用"是本机制最伤人的自相矛盾。模型真正调用（guard 的 touch）即出集。
  return { tick: 0, version: 0, discovered: new Map(), promised: new Map() }
}

/**
 * 恢复播种：按名字列表的顺序给 tick（最旧的在前）。只在首次接触 agent 时调用一次。
 * @param {object} state - createState() 的产物。
 * @param {Iterable<string>} names - 从旧到新的发现顺序。
 * @returns {void}
 */
export function seed(state, names) {
  for (const name of names ?? []) {
    if (typeof name !== 'string' || state.discovered.has(name)) continue
    state.discovered.set(name, ++state.tick)
  }
  if (state.discovered.size > 0) state.version += 1
}

/**
 * 记一批新的发现（B8：**发现即播种 lastUsed**，所以刚发现的一批一定排在最新端）。
 * @param {object} state - 运行期状态。
 * @param {Iterable<string>} names - 本次结果里命中的名字。
 * @returns {string[]} 真正新增的名字（已发现的不算）。
 */
export function discover(state, names) {
  const fresh = []
  for (const name of names ?? []) {
    if (typeof name !== 'string' || state.discovered.has(name)) continue
    state.discovered.set(name, ++state.tick)
    fresh.push(name)
  }
  if (fresh.length > 0) state.version += 1
  return fresh
}

/**
 * LRU 刷新：只对**已发现**的名字生效（调用点用它记录"模型真的用了这个工具"）。
 * 不推进 version——成员没变，目录文本不该失效。
 * @param {object} state - 运行期状态。
 * @param {string} name - 刚被执行的工具名。
 * @returns {void}
 */
export function touch(state, name) {
  if (!state.discovered.has(name)) return
  state.discovered.set(name, ++state.tick)
  // 真的被调用了：加载承诺已兑现，它只按 LRU 冷热排队，不再享有"本批保护"。
  state.promised?.delete(name)
}

/**
 * 记下"这些工具的 schema 刚交给模型"。
 *
 * 与 `discover` 的分工：discover 管**成员**（新发现才推进版本、才可能触发淘汰），
 * promise 管**承诺**（本次结果里的每一个 found 名字，含早就发现过的）。分开是因为
 * 同一次结果常是"旧 + 新"的混合，而旧项同样不能反口。
 *
 * 保护集自身有界（由调用方传入，通常与 maxDiscovered 同量级）：它只活到模型真的用掉为止；
 * 不设上限的话，模型连搜几十次只用几个，就会把所有工具的 schema 一起留回上下文。
 *
 * @param {object} state - 运行期状态。
 * @param {Iterable<string>} names - 本次结果里 found 的名字（含已发现的）。
 * @param {number} cap - 保护集上限（正整数，其余值按无上限处理）。
 * @returns {void}
 */
export function promise(state, names, cap) {
  const limit = Number.isSafeInteger(cap) && cap > 0 ? cap : Number.POSITIVE_INFINITY
  for (const name of names ?? []) {
    // 未发现的名字不进保护集：它连 schema 都没拿到，守卫本来就该拒。
    if (typeof name !== 'string' || !state.discovered.has(name)) continue
    const tick = ++state.tick
    // 刷新 LRU：刚展示过 schema 的工具是热的，淘汰时不该排在最前面。
    state.discovered.set(name, tick)
    state.promised.set(name, tick)
  }
  const overflow = state.promised.size - limit
  if (overflow > 0) {
    const oldest = [...state.promised.entries()].sort((left, right) => left[1] - right[1]).slice(0, overflow)
    for (const [name] of oldest) state.promised.delete(name)
  }
}

/**
 * 淘汰到上限（B9）：`remove = min(size − cap, max(1, floor(size / 2)))`，
 * 按 tick 从小到大取（最冷的先走）。
 *
 * 为什么不是"踢到 cap 为止"就够：cap 从 100 调到 20 时那会一次踢掉 80 个，其中包含
 * 模型还在用的。为什么不是"每次踢一半"：30 个、cap 20 时只该踢 10——「不超过一半」
 * 是上限，不是步长（DECISIONS §2.1 的修正）。
 * @param {object} state - 运行期状态。
 * @param {number} cap - 上限。
 * @returns {string[]} 被淘汰的名字（调用点不记账：淘汰是正常的上限维护，不是失败）。
 */
export function evict(state, cap) {
  const size = state.discovered.size
  if (size <= cap) return []
  const half = Math.max(1, Math.floor(size / 2))
  const remove = Math.min(size - cap, half)
  const oldest = [...state.discovered.entries()]
    // 已承诺未使用的名字不进候选：宁可暂时超过上限，也不收回刚交给模型的 schema
    //（超出的部分由 `promise` 的自身上限兜底，不会无限长）。
    .filter(([name]) => !state.promised?.has(name))
    .sort((left, right) => left[1] - right[1])
    .slice(0, remove)
    .map(([name]) => name)
  for (const name of oldest) state.discovered.delete(name)
  if (oldest.length > 0) state.version += 1
  return oldest
}

/** 目录文本缓存键的一部分：成员变化才变。 */
export function versionOf(state) {
  return state.version
}

/** 发现集大小。 */
export function sizeOf(state) {
  return state.discovered.size
}

/**
 * 投影状态的有界上限：`max(maxDiscovered * 4, 100)`。
 * 乘 4 是给"上限被调小"留缓冲（运行集会自己收敛，投影只做恢复种子，宁可多留一点）；
 * 下限 100 是因为太小的上限会让恢复集比运行集还小——恢复完立刻被淘汰，等于没恢复。
 * @param {number} maxDiscovered - 运行期发现集上限。
 * @returns {number}
 */
export function projectionBound(maxDiscovered) {
  return Math.max(maxDiscovered * 4, 100)
}

/**
 * 有序的发现集（旧 → 新）。v2 快照按这个顺序写出：顺序就是 LRU 事实，读侧重放时不能再排队。
 * @param {{discovered: Map<string, number>}} state
 * @returns {string[]}
 */
export function orderedNames(state) {
  return [...state.discovered.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([name]) => name)
}

/**
 * 解析一条结果里的**发现快照**。四种结果必须分开，否则"损坏当空集"会把状态覆盖掉：
 * - `{kind:'v2', names}`——有序替换快照（可以是空数组 = 清空）；
 * - `{kind:'v1', names}`——旧累积列表（只能 union，读侧明确降级）；
 * - `{kind:'invalid', reason}`——是本插件的协议但形状坏了：**不许**当有效空集合；
 * - `undefined`——不是本插件的值（别人的工具结果/普通文本）。
 *
 * @param {unknown} value
 * @returns {{kind: 'v2'|'v1', names: string[]}|{kind: 'invalid', reason: string}|undefined}
 */
export function parseDiscoverySnapshot(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (value.protocol === META_PROTOCOL_V2) {
    const snapshot = value.discoverySnapshot
    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return { kind: 'invalid', reason: 'discoverySnapshot is missing or not an object' }
    }
    const ordered = snapshot.orderedNames
    if (!Array.isArray(ordered) || !ordered.every((name) => typeof name === 'string' && name !== '')) {
      return { kind: 'invalid', reason: 'discoverySnapshot.orderedNames must be an array of non-empty strings' }
    }
    return { kind: 'v2', names: [...ordered] }
  }
  if (value.protocol === META_PROTOCOL) {
    for (const key of ['allDiscoveredTools', 'discoveredTools']) {
      const list = value[key]
      if (Array.isArray(list) && list.every((item) => typeof item === 'string')) return { kind: 'v1', names: [...list] }
    }
    if (Array.isArray(value.matches)) {
      return {
        kind: 'v1',
        names: value.matches
          .filter((match) => match !== null && typeof match === 'object' && typeof match.name === 'string' && match.found !== false)
          .map((match) => match.name),
      }
    }
    return { kind: 'invalid', reason: 'v1 payload carries no discovery list' }
  }
  return undefined
}

/**
 * 从搜索结果值里解析累积发现列表（兼容入口；新代码用 `parseDiscoverySnapshot`，
 * 因为它能区分"空"与"损坏"）。
 * @param {unknown} value - 工具结果对象。
 * @returns {string[]|undefined}
 */
export function parseDiscoveredMeta(value) {
  const parsed = parseDiscoverySnapshot(value)
  if (parsed === undefined) return undefined
  if (parsed.kind === 'invalid') return undefined
  return parsed.names
}

/**
 * 从会话派生消息还原发现集（投影缺席时的退路；PTC 下它是空操作，见 F18）。
 * 只认本工具的成功结果：扫 role==='tool' 消息里的 protocol JSON。走**受支持的**
 * `session.deriveMessages()`，而不是已废弃的 `snapshotEvents()`（F20）。
 * @param {unknown[]} messages - deriveMessages() 的产物。
 * @returns {Set<string>}
 */
export function discoveredFromMessages(messages) {
  const discovered = new Set()
  for (const message of messages ?? []) {
    if (message?.role !== 'tool' || message.isError === true) continue
    const block = Array.isArray(message.content) ? message.content[0] : undefined
    if (block?.type !== 'text' || typeof block.text !== 'string') continue
    let value
    try { value = JSON.parse(block.text) } catch { continue }
    for (const name of parseDiscoveredMeta(value) ?? []) discovered.add(name)
  }
  return discovered
}

/**
 * 投影 apply：上一条投影状态 + 一条会话事件 → 下一条。
 *
 * 四条不变量（C4 + v2）：
 * - **恒返回状态对象**（写成 `=> undefined` 会把宿主状态设成 undefined，探针里踩过）；
 * - 没有变化时返回**同一引用**（宿主按 `Object.is` 判变化，否则每个事件都产生下游工作）；
 * - **v2 是替换快照**：`orderedNames: []` 也清空；v1 才 union（旧结果没有"剩余集"事实）；
 * - 单调 seq 决定覆盖顺序；重复/过期事件幂等；协议损坏**不覆盖**现有状态，只报诊断。
 *
 * @param {{discovered: string[], protocol?: string, seq?: number}} state - 上一条投影状态。
 * @param {object} event - 会话事件（`tool/result` 或 `tool/ptc-dispatch`）。
 * @param {{toolName: string, max: number, onDiagnostic?: (event: object) => void}} opts
 * @returns {{discovered: string[], protocol?: string, seq?: number}} 新状态或同一个引用。
 */
export function foldEvent(state, event, opts) {
  const prev = Array.isArray(state?.discovered) ? state.discovered : []
  const seq = typeof event?.seq === 'number' ? event.seq : undefined
  if (seq !== undefined && typeof state?.seq === 'number' && seq <= state.seq) return state
  const value = eventValue(event, opts?.toolName)
  if (value === undefined) return state
  const parsed = parseDiscoverySnapshot(value)
  if (parsed === undefined) return state
  if (parsed.kind === 'invalid') {
    opts?.onDiagnostic?.({ code: 'DISCOVERY_SNAPSHOT_INVALID', reason: parsed.reason, seq })
    return state
  }
  const max = Number.isSafeInteger(opts?.max) && opts.max > 0 ? opts.max : Number.POSITIVE_INFINITY
  if (parsed.kind === 'v1') {
    // 兼容：旧列表只能 union（读侧明确降级，不假装知道剩余集）。
    const seen = new Set(prev)
    const fresh = []
    for (const name of parsed.names) {
      if (seen.has(name)) continue
      seen.add(name)
      fresh.push(name)
    }
    if (fresh.length === 0) return state
    const merged = [...prev, ...fresh]
    return {
      protocol: META_PROTOCOL,
      discovered: merged.length > max ? merged.slice(-max) : merged,
      ...(seq === undefined ? {} : { seq }),
    }
  }
  // v2：替换（含清空），去重保序，超限时保留**最新**的一段。
  const seen = new Set()
  const names = []
  for (const name of parsed.names) {
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  const next = names.length > max ? names.slice(-max) : names
  if (state?.protocol === META_PROTOCOL_V2 && sameNames(prev, next)) return state
  return { protocol: META_PROTOCOL_V2, discovered: next, ...(seq === undefined ? {} : { seq }) }
}

function sameNames(left, right) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false
  return true
}

/**
 * 从一条会话事件里取本插件的结果值：**优先结构化 meta**，再退回正文 JSON。
 *
 * meta 是宿主一等公民（`output.presentationMeta` → `tool/result.meta`），正文只是模型能读的
 * 投影（可能被截断/被别的渲染改写）。恢复种子必须读 meta 才可靠。
 * @param {object} event
 * @param {string} toolName
 * @returns {object|undefined}
 */
function eventValue(event, toolName) {
  if (event === null || typeof event !== 'object') return undefined
  const data = event.data
  if (data === null || typeof data !== 'object') return undefined
  if (event.type !== 'tool/result' && event.type !== 'tool/ptc-dispatch') return undefined
  if (event.type === 'tool/result' && data.message?.isError === true) return undefined
  if (event.type === 'tool/ptc-dispatch' && (data.name !== toolName || data.isError === true)) return undefined
  const meta = data.meta
  if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    const parsed = parseDiscoverySnapshot(meta)
    if (parsed !== undefined && parsed.kind !== 'invalid') return meta
  }
  const blocks = event.type === 'tool/result' ? data.message?.content : data.content
  const block = Array.isArray(blocks) ? blocks[0] : undefined
  if (block?.type !== 'text' || typeof block.text !== 'string') return undefined
  try {
    const value = JSON.parse(block.text)
    if (value !== null && typeof value === 'object' && typeof value.protocol === 'string') return value
  } catch {
    return undefined
  }
  return undefined
}

/**
 * 发现集的宿主内部投影定义（`ctx.sessionProjections.register`，无 `wire` 重载）。
 *
 * @param {{z: object, toolName: string, max: number}} options - zod 命名空间、搜索工具名、有界上限。
 * @returns {object} 宿主 `ProjectionDefinition` 形状。
 */
export function discoveryProjection({ z, toolName, max, onDiagnostic }) {
  return {
    key: PROJECTION_KEY,
    // 纯 JSON：宿主按 (sessionId, key, ver, seq, val) 持久化，并在恢复时 parse 一次。
    stateSchema: z.object({
      protocol: z.string().optional(),
      discovered: z.array(z.string()),
      seq: z.number().optional(),
    }),
    init: () => ({ protocol: META_PROTOCOL_V2, discovered: [] }),
    apply: (state, event) => foldEvent(state, event, { toolName, max, ...(onDiagnostic === undefined ? {} : { onDiagnostic }) }),
    // 折叠语义变了就递增：v1 的累积列表与 v2 的替换快照不是同一种状态，旧行必须作废
    // （宿主按 ver 匹配持久化行，不匹配就丢弃并从头折叠）。
    stateVersion: 2,
  }
}
