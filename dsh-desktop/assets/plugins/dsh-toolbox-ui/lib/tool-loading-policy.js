// 统一的工具加载策略（纯决策层）。
//
// Note: 为什么非 MCP 工具默认常驻、为什么保护名单写在这层 —— 见
// .agents/notes/implemented/2026-11-01-unified-tool-loading-policy.md
//
// 现状与取舍：本插件原先只有「按 MCP 服务器延迟」这一维。用户要的是统一口径——
// **内置工具与 MCP 工具同一套规则、可逐工具覆盖、可整体切换、关键入口永不被隐藏**。
// 这一层只回答一个问题：`给定这批工具与这几份配置，每个工具该常驻还是按需加载，理由是什么`。
//
// 三条硬边界（缺一条都会变成猜）：
//   1. 宿主**没有**公开的工具来源（provenance）API。因此本层不判断"是不是 DSH 内置"，
//      只区分「归属某台 MCP 服务器」与「其余工具」。后者默认常驻，只有用户显式逐个
//      设为按需加载才会被延迟——把第三方插件的工具误当内置隐藏，比省下的上下文贵得多。
//   2. 保护名单优先于一切用户配置：搜索入口自身、PTC 的 transport 一旦被隐藏，
//      模型就再也找不到工具；这类"断掉入口"的配置不该被写出来。
//   3. 触发不超过既定范围：`legacy` 模式完整保留老行为（MCP 服务器只有显式 defer 才延迟），
//      不做静默迁移。`recommended` 只能由用户显式应用；`all-resident` 只是关掉延迟，
//      不删除任何覆盖项，切回来时用户的逐工具设置还在。

import { groupMembershipOf, normalizeCustomGroups } from './tool-grouping.js'

/** 运行模式。`legacy` 是"没有写过新配置"时的既有行为，不是可写取值。 */
export const MODES = Object.freeze(['legacy', 'recommended', 'all-resident'])

/** 可写入配置的取值（`legacy` 用"删掉这个键"表达，不落盘）。 */
export const WRITABLE_MODES = Object.freeze(['recommended', 'all-resident'])

/** 单工具/单组的两种状态。`inherit` 用"删掉这个键"表达。 */
export const TOOL_POLICIES = Object.freeze(['resident', 'deferred'])

/** 决策理由。UI 负责翻译；纯层只给稳定的枚举码，避免文案在这里过期。 */
export const REASONS = Object.freeze({
  PROTECTED: 'protected',
  MASTER_SWITCH: 'master-switch',
  PROJECT_TOOL: 'project-tool',
  GLOBAL_TOOL: 'global-tool',
  /** 用户自定义分组（全页可用，见 DESIGN §18）：比服务器整台默认更具体，输给逐工具例外。 */
  USER_GROUP: 'user-group',
  PROJECT_GROUP: 'project-group',
  GLOBAL_GROUP: 'global-group',
  LEGACY_DEFER: 'legacy-defer',
  LEGACY_RESIDENT: 'legacy-resident',
  MODE_RECOMMENDED: 'mode-recommended',
  MODE_RESIDENT: 'mode-resident',
  DEFAULT_RESIDENT: 'default-resident',
})

const isPolicy = (value) => value === 'resident' || value === 'deferred'

function asObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * 把任意输入归一成一份可用的策略配置。
 *
 * 读侧宽容（文件可能被手改）、写侧严格（见 `validatePolicyConfig`）：
 * 这样坏文件不会让面板整页打不开，而写坏值又不会被悄悄忽略。
 *
 * @param {unknown} raw - 例如 profile 的 `config.toolLoading`。
 * @returns {{mode: 'legacy'|'recommended'|'all-resident', groups: object, tools: object}}
 */
export function normalizePolicyConfig(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const mode = MODES.includes(source.mode) ? source.mode : 'legacy'
  const groups = {}
  for (const [key, value] of Object.entries(asObject(source.groups))) {
    if (isPolicy(value)) groups[key] = value
  }
  const tools = {}
  for (const [key, value] of Object.entries(asObject(source.tools))) {
    if (isPolicy(value)) tools[key] = value
  }
  // 非 MCP 工具（DSH 内置、其他插件的工具）由同一份 `tools` 覆盖表管理：**默认常驻**，
  // 只有逐个点成"可搜索"才会延迟。早先这里是 `manageBuiltin` 布尔（"纳管内置工具"），
  // 但它从未被决策层读过——写了不生效的死字段比没有更糟，已删除（写侧现在会明确报错）。
  return { mode, groups, tools }
}

/**
 * 写侧校验：拒绝未知键与非法值（不静默过滤——静默过滤会把用户的配置改坏）。
 *
 * @param {unknown} raw - 即将落盘的策略配置。
 * @returns {{mode: 'recommended'|'all-resident', groups: object, tools: object}} 归一化后的稀疏配置。
 */
export function validatePolicyConfig(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('工具加载策略必须是对象')
  }
  const extra = Object.keys(raw).filter((key) => !['mode', 'groups', 'tools'].includes(key))
  if (extra.length) throw new Error(`未知的工具加载策略字段：${extra.join('、')}（支持：mode、groups、tools）`)
  // mode 可以缺席：缺席 = 跟随既有行为（legacy）。这样"只打开内置纳管、其它保持原样"
  // 也能表达，而不必被迫先选一个整体方案。
  if (raw.mode !== undefined && !WRITABLE_MODES.includes(raw.mode)) {
    throw new Error(`mode 只能是 ${WRITABLE_MODES.join(' / ')}，或省略表示跟随既有行为`)
  }
  return {
    ...(raw.mode === undefined ? {} : { mode: raw.mode }),
    groups: pickPolicies(raw.groups, 'groups'),
    tools: pickPolicies(raw.tools, 'tools'),
  }
}

function pickPolicies(raw, field) {
  if (raw === undefined) return {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${field} 必须是「名字 → resident|deferred」的对象`)
  }
  const result = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === '') throw new Error(`${field} 里不能有空名字`)
    if (!isPolicy(value)) throw new Error(`${field}.${key} 只能是 resident 或 deferred`)
    result[key] = value
  }
  return result
}

/**
 * 计算每个工具的加载策略。**纯函数**：同输入同输出，不读文件、不碰宿主。
 *
 * 优先级（自上而下第一个命中者胜）：
 *   保护名单 → 总开关(off) → 「全部常驻」模式 → 项目逐工具 → 全局逐工具
 *   → 自定义分组 → 项目服务器组 → 全局服务器组 → 既有 defer → 模式默认。
 *
 * 自定义分组排在服务器组之上、逐工具之下：它比"整台默认"更具体，且是用户显式创建的；
 * 但它永远让位给单工具例外。分组策略缺席时**不产生任何影响**（纯组织），继续落到下一层。
 *
 * 「全部常驻」排在覆盖之前是有意的：它的语义就是**整体关掉延迟**（排障与兼容出口）。
 * 覆盖项原样留在配置里，切回推荐时用户的逐工具设置还在——"关掉"不等于"清空"。
 * 总开关（`DSH_MCP_TOOL_SEARCH=off`）同理：它只让本次决策全部常驻，**不删除偏好**。
 *
 * @param {object} input
 * @param {{name: string, owner?: string|null}[]} input.tools - 本会话宿主允许的工具。
 * @param {(name: string) => (string|null)} [input.ownerOf] - 工具名 → MCP 服务器名（其余为 null）。
 * @param {object} [input.policy] - 全局策略（normalizePolicyConfig 的产物）。
 * @param {object} [input.projectPolicy] - 项目策略（同形状，可为空）。
 * @param {object} [input.customGroups] - 自定义分组（`normalizeCustomGroups` 的产物或原始配置）。
 * @param {Iterable<string>} [input.legacyDeferServers] - 老配置里 defer=true 的服务器名（**已按作用域解析**）。
 * @param {Iterable<string>} [input.residentNames] / [input.protectedNames] - 见下。
 * @param {'on'|'off'} [input.masterSwitch] - 总开关。off 时全部常驻（不删偏好）。
 * @returns {{mode: string, entries: Map<string, {policy: 'resident'|'deferred', reason: string}>}}
 */
export function resolveToolLoadingPolicy({
  tools,
  ownerOf = () => null,
  policy,
  projectPolicy,
  customGroups,
  legacyDeferServers = [],
  legacyResidentServers = [],
  protectedNames = [],
  masterSwitch = 'on',
} = {}) {
  const global = normalizePolicyConfig(policy)
  const project = normalizePolicyConfig(projectPolicy)
  // 读侧归一：坏分组不能让整个策略层抛错（面板此时正是靠它给理由码的）。
  const custom = normalizeCustomGroups(customGroups).groups
  const membership = groupMembershipOf(custom)
  // 模式以项目为准（同一份工作区可以更激进地常驻），但项目的 `legacy` 表示**没有自己的方案**，
  // 不是"把全局的选择盖回旧行为"：读侧归一永远会给出一个 mode，把它当覆盖会让
  // "全局开推荐、项目里不生效"成为一个看不见的坑。
  const projectMode = MODES.includes(projectPolicy?.mode) ? projectPolicy.mode : 'legacy'
  const mode = projectMode === 'legacy' ? global.mode : projectMode
  const legacy = new Set(legacyDeferServers)
  const legacyResident = new Set(legacyResidentServers)
  const guarded = new Set(protectedNames)
  const entries = new Map()

  for (const tool of tools ?? []) {
    const name = tool?.name
    if (typeof name !== 'string' || name === '') continue
    const owner = tool.owner !== undefined ? tool.owner : ownerOf(name)
    const decide = (policyValue, reason) => entries.set(name, { policy: policyValue, reason })

    if (guarded.has(name)) { decide('resident', REASONS.PROTECTED); continue }
    // 总开关是**运行时语义**：所有策略路径（全局/项目/旧 defer/逐工具覆盖）统一常驻，
    // 但配置一个字都不改——关掉再看，用户的设置还在。
    if (masterSwitch === 'off') { decide('resident', REASONS.MASTER_SWITCH); continue }
    if (mode === 'all-resident') { decide('resident', REASONS.MODE_RESIDENT); continue }
    if (isPolicy(project.tools[name])) { decide(project.tools[name], REASONS.PROJECT_TOOL); continue }
    if (isPolicy(global.tools[name])) { decide(global.tools[name], REASONS.GLOBAL_TOOL); continue }
    // 自定义分组：对 MCP 工具也生效（可以盖过服务器整台默认），但上面两条逐工具覆盖永远赢。
    // 组策略缺席时**不 decide**，继续往下走——"只组织、不改行为"就是靠这条表达。
    const groupName = membership.get(name)
    if (groupName !== undefined && isPolicy(custom[groupName]?.policy)) {
      decide(custom[groupName].policy, REASONS.USER_GROUP)
      continue
    }
    if (owner !== null && owner !== undefined) {
      if (isPolicy(project.groups[owner])) { decide(project.groups[owner], REASONS.PROJECT_GROUP); continue }
      if (isPolicy(global.groups[owner])) { decide(global.groups[owner], REASONS.GLOBAL_GROUP); continue }
      // 老配置优先于模式默认：显式配过 defer 的服务器，行为不因新功能上线而变。
      if (legacy.has(owner)) { decide('deferred', REASONS.LEGACY_DEFER); continue }
      // 明确关掉延迟 = 这台常驻（芯片的"全量"），优先于整体方案。
      if (legacyResident.has(owner)) { decide('resident', REASONS.LEGACY_RESIDENT); continue }
      if (mode === 'recommended') { decide('deferred', REASONS.MODE_RECOMMENDED); continue }
      decide('resident', REASONS.DEFAULT_RESIDENT)
      continue
    }
    // 非 MCP 工具（DSH 内置、其他插件的工具）：**默认常驻**，只有用户逐个点成"可搜索"
    // 才会进入延迟集合（上面两条逐工具覆盖已经处理）。来源不可证明，猜错会藏掉日常工具；
    // 没有全局开关——列表本身就是开关，默认一个都不动。
    decide('resident', REASONS.DEFAULT_RESIDENT)
  }
  return { mode, entries }
}

/** 策略结果 → 延迟集合（供搜索划分与守卫使用）。 */
export function deferredNamesOf(resolution) {
  const deferred = new Set()
  for (const [name, entry] of resolution?.entries ?? []) {
    if (entry.policy === 'deferred') deferred.add(name)
  }
  return deferred
}

/**
 * 服务器「组级」的生效值：项目组 > 全局组 > 旧 defer > 模式默认。
 *
 * MCP 列表的行内芯片显示的是**这一层**，不是逐工具分布。两者混在一起就会出现
 * 「芯片写着全量、实际还有一半工具按需」——同一列两种语义，用户没法判断哪个是事实。
 * 逐工具的分布由 `tools` 层决定，工具页与详情页各自如实展示；芯片只回答“这台默认怎么加载”。
 *
 * `projectPolicy` 只在项目作用域传；全局作用域传 undefined。
 *
 * @param {{serverName: string, policy?: object, projectPolicy?: object, legacyDefer?: boolean}} input
 * @returns {'resident'|'deferred'}
 */
export function groupPolicyOf({ serverName, policy, projectPolicy, legacyDefer } = {}) {
  const global = normalizePolicyConfig(policy)
  const project = normalizePolicyConfig(projectPolicy)
  if (isPolicy(project.groups[serverName])) return project.groups[serverName]
  if (isPolicy(global.groups[serverName])) return global.groups[serverName]
  if (legacyDefer === true) return 'deferred'
  if (legacyDefer === false) return 'resident'
  // 与 resolveToolLoadingPolicy 的模式继承同一条规则：项目的 legacy = 没有自己的方案。
  const mode = project.mode !== 'legacy' ? project.mode : global.mode
  return mode === 'recommended' ? 'deferred' : 'resident'
}

/**
 * 工具页组头的两份事实：这一层配了什么（configured）与没有这一层时会是什么（inherited）。
 *
 * 纯函数，不碰宿主；`legacyOf` 由调用点提供（全局查 loader 条目、项目查合并表）。
 * 关键：**项目作用域的“跟随”要保留全局 groups**（下一层），只清项目 groups；
 * 全局作用域的“跟随”才清自己的 groups，落到 legacy/mode。两处清错一层，工具页组头
 * 就会和 MCP 芯片显示相反的值。
 */
export function groupStatesOf({ owners, ownPolicy, inheritedPolicy, inheritedProjectPolicy, legacyOf = () => undefined }) {
  const own = normalizePolicyConfig(ownPolicy)
  const inherited = normalizePolicyConfig(inheritedPolicy)
  const inheritedProject = inheritedProjectPolicy === undefined ? undefined : normalizePolicyConfig(inheritedProjectPolicy)
  return [...new Set(owners)].map((owner) => ({
    owner,
    configured: own.groups[owner] ?? 'inherit',
    inherited: groupPolicyOf({
      serverName: owner,
      policy: inheritedProject === undefined ? { ...inherited, groups: {} } : inherited,
      projectPolicy: inheritedProject === undefined ? undefined : { ...inheritedProject, groups: {} },
      legacyDefer: legacyOf(owner),
    }),
  })).sort((left, right) => (left.owner < right.owner ? -1 : left.owner > right.owner ? 1 : 0))
}

/**
 * 写盘用的策略形状。`legacy` 用「删掉这个键」表达，`validatePolicyConfig` 不接受它——
 * 调用点若直接把读侧归一的结果传进去（mode: 'legacy'），保存会当场报错。
 */
export function writablePolicy(policy) {
  const normalized = normalizePolicyConfig(policy)
  return {
    ...(normalized.mode === 'legacy' ? {} : { mode: normalized.mode }),
    groups: { ...normalized.groups },
    tools: { ...normalized.tools },
  }
}
