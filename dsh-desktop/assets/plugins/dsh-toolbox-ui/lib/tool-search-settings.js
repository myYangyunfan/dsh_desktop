// C2：把三个**有实测依据**的参数开放给用户，落点是插件自己 patch 行（`- id: mcp-manager-ui`）
// 的 `config.toolSearch`，不是新开一个设置文件。
//
// 为什么只开三个（证据在 `.tasks/mcp-tool-search/TUNING-DECISIONS.md`）：
//   · maxResults      —— Q2/F4：serena 28 工具实测 top5 漏 33%，top10 到 100%
//   · maxCatalogChars —— Q4 + 2026-10-26：目录的**字符**预算（原「行数」口径已废弃，
//                        行不是成本、字符才是）。**缺省不设 = 不截断**：不截断的代价是
//                        可见的（prompt 变长），截断的代价是静默的（半张地图 → 模型谎报
//                        "没有这个能力"）。用户显式写正整数才启用，那是他自己给的资源预算
//   · maxDiscovered   —— Q2：20 + 常驻 12 ≈ 32，落在 30–50 退化带的下沿
//
// **不开** requireDiscovery（Q6：关掉 = 让模型凭记忆直调未加载工具，准确性灾难），也不开
// toolName / stem —— 前者是换名逃生门、后者只有两组真实工具集的零误伤证据。没有证据的旋钮
// 放出去，用户只会用它做出我们解释不了的行为。
//
// 三件结构上的事写在这里而不是 RPC 层：
//   ① 校验只有一份（zod schema 给宿主加载用，`resolveRuntimeConfig` 给运行期用，两者共用同一
//      条正整数规则；`descriptionChars` / `threshold` / `minServerTools` 这类已删除的键在
//      schema 的 strict 下当场报错）；
//   ② 缺省与派生规则只有一个真源（`DEFAULTS` + `resolveRuntimeConfig` 的 `maxDiscovered`
//      下限规则），本模块不重抄数字；
//   ③ 落盘是**稀疏**的：与默认相同的值不写。否则将来默认值有了实测依据需要调整时，老用户会被
//      一个当年抄下来的数字钉住，而面板照样显示"默认"。
import { readFileSync } from 'node:fs'
import { parseDocument, YAMLMap, isMap, isSeq } from 'yaml'
import { z } from 'zod'
import { DEFAULTS, resolveRuntimeConfig } from './tool-search-runtime.js'
import { normalizePolicyConfig, validatePolicyConfig } from './tool-loading-policy.js'
import { getNode, getValue } from './yaml-node.js'

/** 插件配置里的键名。面板文案与文档都引用它，所以是常量而不是散落的字面量。 */
export const TOOL_SEARCH_CONFIG_KEY = 'toolSearch'
/** 统一加载策略的键名（profile 的 `config.toolLoading`）。 */
export const TOOL_LOADING_CONFIG_KEY = 'toolLoading'

/**
 * 开放给用户的三项。**顺序即面板顺序**（面板按这份清单渲染字段，不另抄一遍）。
 * 其余参数（toolName / stem / requireDiscovery）不在这里 —— 见文件头的理由。
 */
export const EXPOSED_SETTING_KEYS = ['maxResults', 'maxCatalogChars', 'maxDiscovered']

/**
 * 宿主加载时校验的 schema（`McpManagerGateway.Config`）。
 *
 * 两个形状上的要点：
 *   · 外层 `default({})`：loader 对没有 `config:` 的 patch 行传 `undefined`，而那是**绝大多数
 *     存量 profile 的形状**——不接受 undefined 就等于"升级后面板消失"。
 *   · 两层都 strict：拼错的键（`toolsearch`）与已删除的键（`descriptionChars`）必须当场报错，
 *     而不是写进文件后没人读。这与 `resolveRuntimeConfig` 的 REMOVED_KEYS 是同一条纪律。
 */
export const ToolSearchConfigSchema = z.object({
  [TOOL_SEARCH_CONFIG_KEY]: z.object({
    maxResults: z.number().int().min(1).optional(),
    maxCatalogChars: z.number().int().min(1).optional(),
    maxDiscovered: z.number().int().min(1).optional(),
  }).strict().optional(),
  // 统一加载策略（与 toolSearch 同一层、同一份严格口径）。`legacy` 不可写：
  // "回到既有行为"用删掉这个键表达，避免出现"写着 legacy 却留着覆盖"的半状态。
  [TOOL_LOADING_CONFIG_KEY]: z.object({
    // 缺席 = 跟随既有行为；只做逐工具覆盖时可以不写 mode。
    mode: z.enum(['recommended', 'all-resident']).optional(),
    // 非 MCP 工具（内置 / 其他插件）与 MCP 工具走同一张覆盖表：默认常驻，逐工具可改。
    // 早先这里还有一个 `manageBuiltin` 布尔（"纳管内置工具"），但决策层从未读过它——
    // 写了不生效的死字段比没有更糟，已删除；写侧会对它明确报错。
    groups: z.record(z.string(), z.enum(['resident', 'deferred'])).optional(),
    tools: z.record(z.string(), z.enum(['resident', 'deferred'])).optional(),
  }).strict().optional(),
}).strict().default({})

/**
 * 保存载荷的严格校验（RPC 侧的 `ToolSearchConfigSchema`）。
 *
 * 为什么需要它：**加载**那条路的 config schema 一直是 strict 的（拼错键当场报错），而
 * **保存**那条路的 wire codec 是 `z.unknown()`（三边契约按 `$any` 生成）。于是同一份配置
 * 有两个口径：盘上写错会被拒，而从 RPC 传进来的 `maxResutls` 会被"只按已知键摘值"静默
 * 吞成 `{}`——那不是忽略一个错键，是把用户此前的设置整份当成"恢复默认"写掉。
 *
 * 校验放在这里而不是网关里：规则只有一份，读/写/加载三处共用同一个键清单。
 *
 * @param {unknown} payload - 保存 RPC 的原始载荷。
 * @returns {object} 校验过的 `settings` 对象（稀疏，可省略键）。
 */
export function assertToolSearchSettingsPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('延迟加载参数必须以 { settings } 对象提交')
  }
  const extra = Object.keys(payload).filter((key) => key !== 'settings')
  if (extra.length) throw new Error(`未知的延迟加载载荷字段：${extra.join('、')}（只接受 settings）`)
  const settings = payload.settings
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings 必须是对象（省略某个键表示它跟随默认值）')
  }
  const unknown = Object.keys(settings).filter((key) => !EXPOSED_SETTING_KEYS.includes(key))
  if (unknown.length) {
    throw new Error(`未知的延迟加载参数：${unknown.join('、')}（支持：${EXPOSED_SETTING_KEYS.join('、')}）`)
  }
  return settings
}

/** 从插件 config（已过 schema）取出**稀疏**的用户值。未提供的键不补默认值。 */
export function readToolSearchSettings(config) {
  const raw = config?.[TOOL_SEARCH_CONFIG_KEY]
  if (!isPlainObject(raw)) return {}
  const settings = {}
  for (const key of EXPOSED_SETTING_KEYS) {
    if (raw[key] !== undefined) settings[key] = raw[key]
  }
  return settings
}

/**
 * 稀疏值 → 生效值。派生规则**不在这里重抄**：交给 `resolveRuntimeConfig`（它负责正整数校验与
 * `maxDiscovered` 下限抬到 `maxResults`）。这里只是把三项摘出来给面板。
 */
export function effectiveToolSearchSettings(settings = {}) {
  const resolved = resolveRuntimeConfig({ ...readToolSearchSettings({ [TOOL_SEARCH_CONFIG_KEY]: settings }), deferServers: [], serverNames: [] })
  return {
    maxResults: resolved.maxResults,
    maxCatalogChars: resolved.maxCatalogChars,
    maxDiscovered: resolved.maxDiscovered,
  }
}

/**
 * 写盘前的归一：先校验，再把"与默认相同"的值丢掉。
 * @returns 稀疏对象（可能为空 = 全部跟随默认）
 */
export function normalizeToolSearchSettings(settings = {}) {
  const effective = effectiveToolSearchSettings(settings)
  const sparse = {}
  for (const key of EXPOSED_SETTING_KEYS) {
    if (effective[key] !== DEFAULTS[key]) sparse[key] = effective[key]
  }
  return sparse
}

/** 在 patch 里定位**管我们这份配置**的那个节点。两种形态，都要认：
 *
 *  1. `insert` 里的显式条目（`- id: mcp-manager-ui / name: dsh-toolbox-ui`）——手写或早期安装；
 *  2. **顶层 id 定向覆盖**（`- id: mcp-manager-ui` + `config:`）——`dsh plugin add` 把插件装成
 *     bundle 时，那条 insert 住在**包自己的** `cordis.patch.yml`（bundle 层），用户 profile 的
 *     patch 里只有这条覆盖。早期实现只认形态 1，于是主安装路径下面板保存必然失败。
 *
 * @returns {{entry: object, form: 'insert'|'override'}|null}
 */
function findSettingsEntry(doc, { name, id } = {}) {
  for (const item of doc.contents?.items ?? []) {
    const insert = getNode(item, 'insert')
    if (isSeq(insert)) {
      if (name === '' || name === undefined) continue
      for (const entry of insert.items) {
        if (!isMap(entry)) continue
        if (getValue(entry, 'name') === name) return { entry, form: 'insert' }
      }
      continue
    }
    if (!isMap(item) || typeof id !== 'string' || id === '') continue
    if (getValue(item, 'id') === id) return { entry: item, form: 'override' }
  }
  return null
}

function settingsMap(sparse) {
  const map = new YAMLMap()
  for (const key of EXPOSED_SETTING_KEYS) {
    if (sparse[key] !== undefined) map.set(key, sparse[key])
  }
  return map
}

function parsePatch(content) {
  const doc = parseDocument(content || '')
  if (doc.errors.length) throw new Error(`profile patch YAML 无法解析：${doc.errors[0].message}`)
  if (!isSeq(doc.contents)) throw new Error('profile patch 必须是 YAML 列表')
  return doc
}

/** 读回用户写在 patch 里的稀疏值（写入的逆运算，用例与偏移检查都用它）。 */
export function readToolSearchSettingsFromPatch(content, identity = {}) {
  const doc = parsePatch(content)
  const found = findSettingsEntry(doc, identity)
  if (found === null) return {}
  const settings = getValue(getNode(found.entry, 'config'), TOOL_SEARCH_CONFIG_KEY)
  if (!isPlainObject(settings)) return {}
  const sparse = {}
  for (const key of EXPOSED_SETTING_KEYS) {
    if (settings[key] !== undefined) sparse[key] = settings[key]
  }
  return sparse
}

/**
 * 把稀疏值写进 patch。返回**新内容**（不改入参）。
 *
 * 四条约定：
 *   · 值等于默认 → 删键；三个都回到默认 → 连 `config.toolSearch` 一起删。insert 形态下 `config`
 *     因此变空时连 `config` 也删；覆盖形态下这条条目没有别的键了就整条删（不留空壳）；
 *   · 同一条目里其它 config 键、以及别的条目/注释，一个字都不动；
 *   · **没有现成条目时追加一条 id 定向覆盖**（真实安装形态就是如此），而不是凭空 insert 一个
 *     第二个插件实例——那会把插件挂两遍；
 *   · 先校验再动 YAML：非法值绝不落盘（部分写入比拒绝写入坏得多）。
 */
export function setToolSearchSettingsInPatch(content, settings, identity = {}) {
  const sparse = normalizeToolSearchSettings(settings)
  return writeConfigKey(content, TOOL_SEARCH_CONFIG_KEY, Object.keys(sparse).length === 0 ? null : settingsMap(sparse), identity)
}

/** 从 profile config 读统一加载策略（读侧宽容：坏值按"没配"处理）。 */
export function readToolLoadingPolicy(config) {
  return normalizePolicyConfig(config?.[TOOL_LOADING_CONFIG_KEY])
}

/** 从 patch 内容读统一加载策略（写入的逆运算）。 */
export function readToolLoadingPolicyFromPatch(content, identity = {}) {
  const doc = parsePatch(content)
  const found = findSettingsEntry(doc, identity)
  if (found === null) return normalizePolicyConfig(undefined)
  return normalizePolicyConfig(getValue(getNode(found.entry, 'config'), TOOL_LOADING_CONFIG_KEY))
}

/**
 * 把统一加载策略写进 `config.toolLoading`。
 *
 * `legacy`（= 回到既有行为）用**删掉这个键**表达，不落 `mode: legacy`：
 * 同一件事只有一种写法，读取侧也就不必再猜"写着 legacy 但下面还挂着覆盖"是什么意思。
 */
export function setToolLoadingPolicyInPatch(content, policy, identity = {}) {
  const validated = policy === null || policy === undefined ? null : validatePolicyConfig(policy)
  if (validated === null) return writeConfigKey(content, TOOL_LOADING_CONFIG_KEY, null, identity)
  const map = new YAMLMap()
  if (validated.mode !== undefined) map.set('mode', validated.mode)
  if (Object.keys(validated.groups).length) {
    const groups = new YAMLMap()
    for (const [key, value] of Object.entries(validated.groups)) groups.set(key, value)
    map.set('groups', groups)
  }
  if (Object.keys(validated.tools).length) {
    const tools = new YAMLMap()
    for (const [key, value] of Object.entries(validated.tools)) tools.set(key, value)
    map.set('tools', tools)
  }
  return writeConfigKey(content, TOOL_LOADING_CONFIG_KEY, map, identity)
}

/**
 * 插件自己那条配置里某个键的写入原语（`toolSearch` / `toolLoading` 共用）。
 *
 * 四条约定：
 *   · `valueNode` 为 null → 删这个键；`config` 因此变空时连 `config` 一起删，
 *     覆盖形态下这条条目没有别的键了就整条删（不留空壳）；
 *   · 同一条目里其它 config 键、以及别的条目/注释，一个字都不动；
 *   · **没有现成条目时追加一条 id 定向覆盖**（真实安装形态就是如此），而不是凭空 insert 一个
 *     第二个插件实例——那会把插件挂两遍；
 *   · 非法值在调用方先校验，绝不落盘（部分写入比拒绝写入坏得多）。
 */
function writeConfigKey(content, configKey, valueNode, identity) {
  const doc = parsePatch(content)
  const found = findSettingsEntry(doc, identity)

  if (found === null) {
    // 没有任何可写的落点：要么给 id 让我们追加一条覆盖，要么明确报错（不猜 id）。
    if (typeof identity.id !== 'string' || identity.id === '') {
      throw new Error(`找不到 name 为 ${identity.name} 的插件条目，也没有条目 id：无法定位自己的配置`)
    }
    if (valueNode === null) return content
    const entry = new YAMLMap()
    entry.set('id', identity.id)
    const config = new YAMLMap()
    config.set(configKey, valueNode)
    entry.set('config', config)
    doc.contents.items.push(entry)
    return String(doc)
  }

  const entry = found.entry
  const existingConfig = getNode(entry, 'config')
  const config = isMap(existingConfig) ? existingConfig : new YAMLMap()

  if (valueNode === null) {
    config.delete(configKey)
  } else {
    const existing = getNode(config, configKey)
    // 非映射（例如用户写成 `toolSearch: 20`）不能猜着改写：那是用户的文件，报错让人看见。
    if (existing !== undefined && !isMap(existing)) {
      throw new Error(`config.${configKey} 必须是映射（键值对），当前是：${JSON.stringify(getValue(config, configKey))}`)
    }
    config.set(configKey, valueNode)
  }

  if (config.items.length === 0) {
    if (found.form === 'override') {
      entry.delete('config')
      // 覆盖条目只剩 id 就没存在的理由了；若用户在同一行还写了别的键（至少不是只有 id），留着。
      if ((entry.items ?? []).length <= 1) doc.contents.items = doc.contents.items.filter((item) => item !== entry)
    } else {
      entry.delete('config')
    }
  } else if (!isMap(existingConfig)) {
    entry.set('config', config)
  }
  return String(doc)
}

/**
 * 本插件在 profile patch 里的**身份**：包名（insert 形态的 `name`）+ 条目 id（覆盖形态）。
 * 两者都从**出货文件**读（`package.json` / `cordis.patch.yml`），不在这里另写一份——
 * 写死 `mcp-manager-ui` 就是又一个"改 id 时忘一处"的真源。
 */
export function pluginPatchIdentity() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const name = typeof pkg.name === 'string' ? pkg.name : ''
    const doc = parseDocument(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
    for (const item of doc.contents?.items ?? []) {
      const insert = getNode(item, 'insert')
      if (!isSeq(insert)) continue
      for (const entry of insert.items) {
        if (!isMap(entry)) continue
        if (getValue(entry, 'name') !== name) continue
        const id = getValue(entry, 'id')
        return { name, id: typeof id === 'string' ? id : '' }
      }
    }
    return { name, id: '' }
  } catch {
    return { name: '', id: '' }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
