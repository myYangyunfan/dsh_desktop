// 自定义工具分组：写侧校验、读侧归一化、成员索引。
//
// 为什么单独成模块：它同时被三条路径读——宿主启动（插件 config）、patch 读写（面板保存）、
// 纯策略层（决策链）。分开放会让"什么是合法分组"出现三个口径，而这三处一旦漂移，
// 表现就是"盘上写着按需、模型那边没生效"。
//
// 两条形状约束（理由都在 .tasks/tool-grouping/DESIGN.md §18）：
//   1. **一个工具只属于一个组**。多标签会逼出"两个组策略冲突听谁的"这条新仲裁规则，
//      收益（一个工具归两类）远低于成本。
//   2. **组策略可省略**。省略 = 不参与决策（纯组织），下一层（服务器组 / 宿主默认）照常生效。
//      没设默认的组不该被说成有默认——面板的跟随文案也照这条写。
//
// 读侧宽容 / 写侧严格，与 `tool-loading-policy` 同一条纪律：坏文件不能让面板整页打不开，
// 坏写入不能落盘成半份配置。

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isPolicy = (value) => value === 'resident' || value === 'deferred'

/** 组内允许的字段。写侧拒绝其它键；读侧只记诊断、不因此丢掉整组。 */
const ENTRY_KEYS = ['policy', 'tools']

/**
 * 读侧归一化：把任意输入变成可渲染、可决策的分组表。
 *
 * @param {unknown} raw - 例如插件 config 的 `customGroups`。
 * @returns {{groups: Record<string, {policy?: 'resident'|'deferred', tools: string[]}>, diagnostics: {code: string, message: string}[]}}
 */
export function normalizeCustomGroups(raw) {
  const groups = {}
  const diagnostics = []
  if (raw === undefined || raw === null) return { groups, diagnostics }
  if (!isPlainObject(raw)) {
    diagnostics.push({ code: 'not-object', message: '自定义分组必须是「组名 → { policy, tools }」的对象' })
    return { groups, diagnostics }
  }
  const owner = new Map()
  for (const [rawName, entry] of Object.entries(raw)) {
    const name = String(rawName).trim()
    if (name === '') {
      diagnostics.push({ code: 'empty-name', message: '忽略了空分组名' })
      continue
    }
    if (Object.hasOwn(groups, name)) {
      diagnostics.push({ code: 'duplicate-name', message: `分组名「${name}」重复出现，保留第一个` })
      continue
    }
    if (!isPlainObject(entry)) {
      diagnostics.push({ code: 'bad-entry', message: `分组「${name}」不是对象，已忽略` })
      continue
    }
    const unknown = Object.keys(entry).filter((key) => !ENTRY_KEYS.includes(key))
    if (unknown.length) {
      diagnostics.push({ code: 'unknown-key', message: `分组「${name}」有未知字段：${unknown.join('、')}` })
    }
    let policy
    if (entry.policy !== undefined) {
      if (isPolicy(entry.policy)) policy = entry.policy
      else diagnostics.push({ code: 'bad-policy', message: `分组「${name}」的 policy 只能是 resident 或 deferred，已忽略` })
    }
    if (!Array.isArray(entry.tools)) {
      diagnostics.push({ code: 'bad-tools', message: `分组「${name}」的 tools 不是数组，整组已忽略` })
      continue
    }
    const tools = []
    const local = new Set()
    for (const item of entry.tools) {
      if (typeof item !== 'string' || item.trim() === '') {
        diagnostics.push({ code: 'bad-tool', message: `分组「${name}」里有不是工具名的条目，已忽略` })
        continue
      }
      const tool = item.trim()
      if (local.has(tool)) {
        diagnostics.push({ code: 'duplicate-in-group', message: `工具 ${tool} 在分组「${name}」里重复，保留一个` })
        continue
      }
      if (owner.has(tool)) {
        diagnostics.push({ code: 'duplicate-across-groups', message: `工具 ${tool} 同时属于「${owner.get(tool)}」与「${name}」，按先出现的分组处理` })
        continue
      }
      local.add(tool)
      tools.push(tool)
      owner.set(tool, name)
    }
    groups[name] = policy === undefined ? { tools } : { policy, tools }
  }
  return { groups, diagnostics }
}

/**
 * 写侧校验：拒绝未知键与非法值，返回归一化后的稀疏对象。
 *
 * 不静默过滤——静默过滤会把用户已有的分组改坏（与 `validatePolicyConfig` 同一条理由）。
 *
 * @param {unknown} raw - 即将落盘的 `customGroups`。
 * @returns {Record<string, {policy?: 'resident'|'deferred', tools: string[]}>}
 */
export function validateCustomGroups(raw) {
  if (!isPlainObject(raw)) throw new Error('自定义分组必须是「组名 → { policy, tools }」的对象')
  const result = {}
  const owner = new Map()
  for (const [rawName, entry] of Object.entries(raw)) {
    const name = String(rawName).trim()
    if (name === '') throw new Error('分组名不能为空')
    if (Object.hasOwn(result, name)) throw new Error(`分组名重复：${name}`)
    if (!isPlainObject(entry)) throw new Error(`分组「${name}」必须是对象`)
    const extra = Object.keys(entry).filter((key) => !ENTRY_KEYS.includes(key))
    if (extra.length) throw new Error(`分组「${name}」有未知字段：${extra.join('、')}（支持：policy、tools）`)
    if (entry.policy !== undefined && !isPolicy(entry.policy)) {
      throw new Error(`分组「${name}」的 policy 只能是 resident 或 deferred`)
    }
    if (!Array.isArray(entry.tools)) throw new Error(`分组「${name}」的 tools 必须是工具名数组`)
    const tools = []
    const local = new Set()
    for (const item of entry.tools) {
      if (typeof item !== 'string' || item.trim() === '') throw new Error(`分组「${name}」里有空的工具名`)
      const tool = item.trim()
      if (local.has(tool)) throw new Error(`工具 ${tool} 在分组「${name}」里出现两次`)
      if (owner.has(tool)) throw new Error(`工具 ${tool} 已在分组「${owner.get(tool)}」中`)
      local.add(tool)
      tools.push(tool)
      owner.set(tool, name)
    }
    result[name] = entry.policy === undefined ? { tools } : { policy: entry.policy, tools }
  }
  return result
}

/**
 * 成员索引：工具名 → 组名（先出现者胜）。
 *
 * 决策链每个工具都要问一次"它在不在某个组里"，所以只建一次索引；
 * 不要在循环里对每个工具遍历全部组（700 工具 × N 组会退化成平方）。
 *
 * @param {Record<string, {policy?: string, tools?: string[]}>} groups
 * @returns {Map<string, string>}
 */
export function groupMembershipOf(groups) {
  const membership = new Map()
  for (const [name, entry] of Object.entries(groups ?? {})) {
    for (const tool of entry?.tools ?? []) {
      if (!membership.has(tool)) membership.set(tool, name)
    }
  }
  return membership
}

/**
 * 面板用的成员归属表：与 `groupMembershipOf` 同一份事实，但按组返回（渲染顺序）。
 *
 * @param {Record<string, {tools?: string[]}>} groups
 * @returns {{name: string, tools: string[]}[]}
 */
export function customGroupList(groups) {
  return Object.entries(groups ?? {}).map(([name, entry]) => ({ name, tools: [...(entry?.tools ?? [])] }))
}
