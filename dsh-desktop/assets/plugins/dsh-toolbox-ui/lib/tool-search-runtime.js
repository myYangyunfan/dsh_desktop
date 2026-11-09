// MCP ToolSearch 运行时：遮罩、守卫、搜索工具、状态恢复。
//
// 机制采用参考实现（lordqyxz/dsh-tool-search）验证过的架构，按本插件定位改造：
//   - 遮罩做在 `system-prompt/assemble` waterfall：过滤 `resolved.tools`，全局族与项目族
//     （scoped 注册）通吃，且每次组装都过滤——晚连服务器的工具在首次出现的那次组装里就被滤掉，
//     不存在"先放行后补遮罩"的窗口（设计文档决策 8）。
//   - 自愈走 `tools.guard`：工具不 restrict（保持可解析），守卫对"未发现的延迟工具"返回带指引的
//     拒绝。guard 能触发正因工具没被 restrict——dsh-tools 的 prepareExecution 在
//     dispatchToolBody 抛 UNKNOWN_TOOL **之前**就跑 guardReason（:3241 vs :3307），
//     所以遮罩掉的工具同样能拿到带指引的拒绝。
//   - 延迟粒度是**按服务器**（deferServers），不是参考实现的"全延迟 + alwaysVisible 白名单"：
//     未列入 defer 的服务器工具天然稳定，不需要维护一份内置工具白名单，也与本插件的
//     per-server UI 开关一一对应（设计文档 §3.3 策略决策 B）。
//   - 恢复走派生消息：搜索结果带累积发现列表（protocol: dsh-tool-search/v1），render 时剥掉
//     不泄露进提示词；重建的 agent 从 `session.deriveMessages()` 还原。
//
// 本文件分两层：导出的是**纯决策函数**（不碰 DSH 服务，可单测）；installToolSearchRuntime 是
// 一层薄装配（register/guard/on），用夹具按宿主契约测。
//
// 结构：所有派生状态（managed 划分、目录、目录正文、遮罩集、阈值判定）都挂在**一个按
// revision 缓存的视图对象**上。三个调用点（assemble / guard / execute）只做"取视图 + 做自己
// 那一件事"，取视图包在同一个 fail-open 边界里。这样就不需要 agent/created 预热、
// tools/change 脏标记、agent/disposed 清理这三个订阅——视图按 revision 自愈，标志是要人
// 记得置的，漏置就是静默失配。

import { buildCatalog, parseQuery, searchCatalog } from './tool-search-index.js'
import { revisionOf } from './mcp-registry.js'
import { chooseToolName, inferMode, probeHost, warnOnce } from './tool-search-host.js'
import { detectToolsGeneration, installPresentationPort } from './tool-search-adapter.js'
import { deferredOf, maskSection, presentAssembly, visibleTools } from './tool-search-presentation.js'
import { loadRenderers, readSdkSchemas, rendererFor, schemaTypeRendererFor, trimSdkText } from './tool-search-sdk.js'
import { createDiscoveryStore } from './tool-search-discovery.js'
import { installProjectionPort } from './tool-search-projections.js'
import { createState, discover, discoveredFromMessages, discoveryProjection, evict, META_PROTOCOL, META_PROTOCOL_V2, parseDiscoveredMeta, PROJECTION_KEY, projectionBound, promise, seed, touch, versionOf } from './tool-search-state.js'
import { z } from 'zod'
import * as dshTools from '@deepseek-ai/dsh-tools'

// 发现集的解析与 fold 住在 tool-search-state.js：协议 + 解析器 + 投影必须同时改，分开放
// 就是静默失败。这里再导出一次，是因为它们长期是本模块的导出面（既有用例与文档按这里引用）。
export { discoveredFromMessages, parseDiscoveredMeta }

/**
 * `tool_search` 的备选名（确定性顺序）：只在首选名已被别人占用时才用到（G4）。
 * 顺序是固定的而不是随机的——换名会出现在守卫指引与目录文案里，模型要能稳定记住它。
 */
const TOOL_NAME_CANDIDATES = ['deferred_tool_search', 'mcp_tool_search']

/**
 * 宿主 PTC 手册的段名。裁剪就是替换 `assembly.sections` 里这一段——它和 `mcp:<server>`
 * 指令段在同一个数组里，而本插件本来就在改那个数组（F38）。
 * 段**存在但文本为空**是常见情形（PTC 部署下的 native agent：`sdkSection` 对 native
 * 返回 ''），所以"按段名找 + 空文本短路"是两件事。
 */
const SDK_SECTION_NAME = 'tools:sdk'

/**
 * 配置缺省。
 *
 * **没有门槛**（B1/C3）：`threshold`（会话级聚合）与 `minServerTools`（per-server 下限）
 * 整个删掉了。官方没有这两道（F8：官方原话「Claude Code 不会对每个服务器施加固定的工具
 * 上限」，唯一的阈值模式是按**体积**百分比），它们只制造"勾了却没生效"的断层——
 * 代码替用户猜他的处境。用户勾了就生效，逃逸通道是面板上的开关本身。
 * 这两个键若被写进配置，`resolveRuntimeConfig` **显式报错**（不静默忽略）。
 */
export const DEFAULTS = Object.freeze({
  toolName: 'tool_search',
  /**
   * 一次搜索返回的最大工具数。**10 而不是 5**：关键词排序对"抽象概念 → 具体工具名"的
   * 映射有天花板（BM25 只做词面匹配，bridging 不了 declared→declaration、
   * function→symbol 这类派生与同义关系），所以相关工具常散落在 4–10 名。实测两个真实
   * MCP 工具集（serena 28 工具 / chrome-devtools 32 工具）：top5 漏掉 serena 33% 的
   * 核心工具，top10 把它拉到 100%，而 chrome-devtools 两种限额都本就 100%——
   * 即抬高限额只在不漏的场合多花约 570 token，换来难查的服务器不再漏。
   * 别照抄"一次返回上百个 schema 没有意义"那条顾虑放到 10 上：那是针对全量枚举，
   * 而枚举该走目录 section 或 `select:`（那里本来就返回请求的全部名字）。
   */
  maxResults: 10,
  /**
   * 已发现集的上限。别把它当"内部状态大小"来读：已发现的工具是**掀罩**的，会和常驻工具一起
   * 出现在模型面前，所以它真正约束的是"当前会话里模型面对多少个可选工具"。
   * 官方给的退化带是"超过 30–50 个可用工具后，选择准确率显著下降"（Anthropic 2025-11-24 博客 +
   * API 文档同一条）；常驻工具（内置工具 + 未延迟服务器）通常 10–15 个，20 + 12 ≈ 32 正落在下沿。
   * 20 因此不是随手写的数，只是当初没把这条推导写下来（见 `.tasks/mcp-tool-search/TUNING-DECISIONS.md` Q2）。
   */
  maxDiscovered: 20,
  /**
   * 目录名字预算：**默认不设 = 不截断**（2026-10-26 起；原默认 12,500）。
   *
   * 显式写 `undefined` 而不是把键删掉：`normalizeToolSearchSettings`（`tool-search-settings.js`）
   * 按 `DEFAULTS[key]` 判断"这个值是不是默认"，缺键会让那条比较变成两处各写一个事实——
   * 将来把默认值改回数字时，稀疏落盘与"恢复默认"会各说各话。缺省的推导见
   * `resolveRuntimeConfig` 里的注释（与"没有本功能"的基线比：常驻 schema 是目录的 17.2×）。
   */
  maxCatalogChars: undefined,
  /**
   * 单复数归一（s-stemmer）。默认开：两个真实 MCP 工具集实测零误伤，且在最难的
   * 工具集（serena）上把核心工具进 top5 从 67% 提到 78%、top10 从 94% 到 100%；
   * chrome-devtools 上无变化（工具名即查询词，本来就能命中）。
   * 留成开关是因为 Harman 1991 证明 stemming 在某些语料上无提升——那种场景可以关掉。
   * 注意查询侧与文档侧必须同一个值（searchCatalog/buildCatalog 都从 config 取）。
   */
  stem: true,
  requireDiscovery: true,
})

/** 已删除的配置键：写进来就报错（C3：不静默忽略，否则后人会以为它还在生效）。 */
const REMOVED_KEYS = Object.freeze({
  threshold: '会话级聚合阈值已删除：用户勾了就生效（官方没有这道门槛，B1/C3）',
  minServerTools: 'per-server 工具数下限已删除：用户勾了就生效（官方没有这道门槛，B1/C3）',
  descriptionChars: '目录已改为只列工具名、不列用途（对齐 Claude Code：延迟工具在 prompt 里只有标识符），'
    + '截断因此不存在；用途由搜索负责（索引吃全文描述）。见 TUNING-DECISIONS.md Q1',
  maxCatalogLines: '目录预算已从「行数」改为「字符数」（新键 maxCatalogChars）：行不是成本，字符才是'
    + '（一行可能是 7 字符也可能是 38 字符），且 token 只跟字符走。换算：原 300 行 ≈ 12,500 字符'
    + '（即新的默认值）。面板「延迟参数」里可直接改新键',
})

export function resolveRuntimeConfig(config = {}) {
  for (const [key, reason] of Object.entries(REMOVED_KEYS)) {
    if (config[key] !== undefined) throw new Error(`${key} 已废弃：${reason}；请从配置里删掉它`)
  }
  const toolName = typeof config.toolName === 'string' && config.toolName.trim() !== ''
    ? config.toolName.trim()
    : DEFAULTS.toolName
  const maxResults = positiveInt(config.maxResults, DEFAULTS.maxResults, 'maxResults')
  // deferServers/serverNames 接受**函数**（活配置：每次视图重建重新读，配置改了不用重装）
  // 或可迭代对象（测试与静态配置）。函数形态不在这里校验——来源是本插件自己的配置桥。
  const deferServersOf = typeof config.deferServers === 'function' ? config.deferServers : () => [...(config.deferServers ?? [])]
  const serverNamesOf = typeof config.serverNames === 'function' ? config.serverNames : () => [...(config.serverNames ?? [])]
  // 统一策略：网关合成的决策函数（`(agent, schemas) => {mode, entries}`）。
  // 没有它就是静态夹具/旧部署，走服务器级口径。
  const policyFor = typeof config.policyFor === 'function' ? config.policyFor : undefined
  return {
    toolName,
    deferServersOf,
    serverNamesOf,
    ...(policyFor === undefined ? {} : { policyFor }),
    maxResults,
    // 累积发现集的上限：它决定"有多少份 schema 长期常驻请求"，不设会随长会话长回全量基线。
    // 注意它**不是**一次搜索能返回多少名字的上限——关键词形态受 maxResults 管，而 `select:`
    // 形态按目录 section 的指引按名字取，一次能返回请求的全部名字，可以超过这个数。
    // 所以淘汰必须避开**本次刚返回的**那批（execute 里把下限抬到本批长度），否则模型刚拿到
    // "按名字直接调"的指令与完整 schema，下一次调用就被守卫拒——本期修掉的正是这个自相矛盾。
    maxDiscovered: Math.max(maxResults, positiveInt(config.maxDiscovered, DEFAULTS.maxDiscovered, 'maxDiscovered')),
    // 目录名字预算：**缺省 = 不截断**（2026-10-26 改，原默认 12,500）。
    // 理由是一笔不对称的账：不截断的代价是**可见的**——目录只列名字，成本本来就低
    // （456 工具实测 11,690 字符，而全量 schema 约 19 万，省 ~94–96%），prompt 变长每个请求
    // 都看得见、也付得起（有缓存时几乎免费）；截断的代价是**静默的**——模型拿到半张地图，
    // 可能据此对用户说"没有这个能力"。按 R6 分级，可见的贵优于静默的错。
    // 要给自己一个上限的人显式写正整数：那是**用户自己给的资源预算**（R5），机制保留、
    // 默认关闭。分配粒度仍是整行（I6），任何服务器都不会整台消失（C 档）。
    maxCatalogChars: positiveInt(config.maxCatalogChars, undefined, 'maxCatalogChars'),
    // 布尔不走 positiveInt：显式 false 必须能关掉词干化（上面 DEFAULTS.stem 的取舍）。
    stem: typeof config.stem === 'boolean' ? config.stem : DEFAULTS.stem,
    requireDiscovery: config.requireDiscovery ?? DEFAULTS.requireDiscovery,
  }
}

function positiveInt(value, fallback, path) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${path} must be a safe integer >= 1`)
  return value
}

/**
 * 工具名归属判定：前缀命中且**唯一**。serverName 含 `__` 时裸前缀匹配会误伤
 * （mcp__a__b__x 同时像 a 和 a__b 的工具），所以必须要求唯一 owner——与
 * mcp-registry.toolInventory / workspace-runtime.applyWorkspaceRestrict 同一条规则。
 */
export function uniqueOwner(schemaName, serverNames) {
  let owner = null
  for (const server of serverNames) {
    if (!schemaName.startsWith(`mcp__${server}__`)) continue
    if (owner !== null) return null
    owner = server
  }
  return owner
}

/**
 * 把会话可见的 schema 分成"被本机制管理（可延迟）"与"稳定（永可见）"两部分。
 * 搜索工具自身永远稳定——它不能被自己延迟掉。
 * 入参 serverNames / deferServers 是 Set（由调用方从活配置物化）。
 */
export function partitionSchemas(schemas, { toolName, serverNames, deferServers, deferredNames, residentNames }) {
  const managed = new Map()
  const stable = new Set()
  const ownerOf = new Map()
  for (const schema of schemas ?? []) {
    if (!schema || typeof schema.name !== 'string') continue
    if (schema.name === toolName) {
      stable.add(schema.name)
      continue
    }
    const owner = uniqueOwner(schema.name, serverNames)
    if (owner !== null) ownerOf.set(schema.name, owner)
    // 统一策略（按工具名）优先：它能表达"整台服务器延迟、但这两个常驻"与
    // "非 MCP 工具逐个延迟"，服务器级集合表达不了这两种。
    const defer = deferredNames !== undefined
      ? (deferredNames.has(schema.name) && !(residentNames?.has(schema.name) ?? false))
      : (owner !== null && deferServers.has(owner))
    if (defer) managed.set(schema.name, schema)
    else stable.add(schema.name)
  }
  return { managed, stable, ownerOf }
}

/**
 * 统一策略的两种集合（延迟 / 常驻）从哪来。
 *
 * `policyFor(agent)` 由网关提供（全局 + 项目 + 老 defer + 保护名单已在纯层合好）；
 * 静态夹具没有策略，返回 null 走服务器级旧口径——那条路仍被既有用例与
 * "只按服务器延迟"的部署用着，不能悄悄删掉。
 */
function policySetsOf(config, agent, schemas) {
  if (typeof config.policyFor !== 'function') return null
  // schemas 一并传下去：网关据此合成策略，不必再向宿主深拷贝一次工具表
  // （701 工具下 `schemas(agent)` 是 O(n) 深拷贝，一次组装读两遍没有道理）。
  const resolution = config.policyFor(agent, schemas)
  if (resolution === null || resolution === undefined) return null
  const deferred = new Set()
  const resident = new Set()
  for (const [name, entry] of resolution.entries ?? []) {
    if (entry?.policy === 'deferred') deferred.add(name)
    else resident.add(name)
  }
  return { deferred, resident }
}

/**
 * 过滤 assembly 的工具列表：**只摘本机制管理的**（被延迟且未发现），其余一概不动。
 * 实现住在呈现端口（`tool-search-presentation.js`）里——两代宿主共用同一份规则，
 * 这里保留导出名是因为它长期是本模块的公开面（既有用例与文档按这里引用）。
 */
export const filterManagedTools = visibleTools

/**
 * 守卫决策：返回拒绝原因（字符串）或放行（undefined）。
 * 只管"本机制管理的、未发现的"工具；其他策略（如 workspace exclude）拒掉的工具不在
 * managed 里，守卫不置词——取交集，绝不放宽（设计文档决策 8 附带属性）。
 */
export function guardDecision(name, { managed, discovered }, config) {
  if (name === config.toolName) return undefined
  if (!config.requireDiscovery) return undefined
  if (!managed.has(name)) return undefined
  if (discovered.has(name)) return undefined
  return `tool ${JSON.stringify(name)} is deferred; call ${config.toolName} with the exact name ${JSON.stringify(name)} as the query to load its schema, then call it directly`
}

/** 视图 revision：工具可见面内容 + 全部影响划分的配置。变了才重建，否则复用缓存。 */
export function viewRevision(schemas, config, agent) {
  const policy = policySetsOf(config, agent, schemas)
  return revisionOf({
    toolName: config.toolName,
    tools: (schemas ?? []).map((schema) => [schema?.name, schema?.description, schema?.parameters ?? null, schema?.output ?? null]),
    // 有统一策略时，延迟/常驻按**工具名**算（逐工具覆盖与保护都在里面）；
    // 没有策略的静态夹具仍走服务器级旧口径。
    defer: policy === null ? [...config.deferServersOf(agent)].sort() : [...policy.deferred].sort(),
    resident: policy === null ? [] : [...policy.resident].sort(),
    servers: [...config.serverNamesOf(agent)].sort(),
    maxCatalogChars: config.maxCatalogChars,
    // stem 进 revision：开关翻转要能让缓存失效、视图重建，否则改了不生效。
    stem: config.stem,
  })
}

/**
 * 构建一次视图。纯函数：同样输入同样输出，所以可以按 revision 放心缓存。
 *
 * `managed` = 本次可见面里所有列入 defer 的服务器的工具，**没有门槛**：用户勾了就生效。
 * （两道门槛在第十轮删掉：它们制造"勾了却没生效"的断层，而官方并没有这两道，B1/C3。）
 *
 * 视图**不含** `discovered`：发现集按 agent 变，而视图按 revision 缓存。
 * 由此派生的 `D = managed − discovered` 与两个布尔都在调用点算（B14）：
 * - `hasDeferredServers = managed.size > 0` —— 守卫与搜索用；
 * - `hasDeferredWork = D.size > 0` —— 目录段 / 引导段 / SDK 裁剪用。
 */
export function buildToolSearchView(schemas, config, agent) {
  const policy = policySetsOf(config, agent, schemas)
  const sets = {
    toolName: config.toolName,
    serverNames: new Set(config.serverNamesOf(agent)),
    deferServers: new Set(config.deferServersOf(agent)),
    ...(policy === null ? {} : { deferredNames: policy.deferred, residentNames: policy.resident }),
  }
  const { managed, ownerOf } = partitionSchemas(schemas, sets)
  const catalog = buildCatalog([...managed.values()], config.stem)
  const managedByServer = new Map()
  for (const name of managed.keys()) {
    const owner = ownerOf.get(name)
    if (owner === undefined) continue
    if (!managedByServer.has(owner)) managedByServer.set(owner, new Set())
    managedByServer.get(owner).add(name)
  }
  return {
    managed,
    ownerOf,
    catalog,
    managedByServer,
  }
}

/**
 * `D = managed − discovered`：**还没被发现**的受管工具。
 *
 * 这是装配遮罩、指令段遮罩、目录段、SDK 裁剪、守卫五处共用的唯一集合（B11）。
 * 之前三处各用一个判据（遮罩用 `managed − discovered`、目录用 `managed` 全集、引导用
 * `deferring`），于是"全部发现之后"目录仍列着所有名字、引导仍说"还有工具被延迟"——
 * 都是假话（F15）。
 *
 * @param {Map<string, object>} managed - 生效的受管工具。
 * @param {Set<string>|Map<string, number>} discovered - 已发现集（Set 或 LRU Map 都吃）。
 * @returns {Set<string>}
 */
export const deferredTools = deferredOf

/**
 * 目录正文里只列**还没被发现**的工具（显示过滤，不重建索引——索引建在 managed 上，
 * 才能按 revision 缓存；重建一次的代价是 735 工具 52.8ms，B11 修正）。
 * @param {Map<string, object>} catalog - 全量目录（按 revision 缓存）。
 * @param {Set<string>} deferred - `D`。
 * @returns {Map<string, object>}
 */
export function filterCatalog(catalog, deferred) {
  const shown = new Map()
  for (const [name, tool] of catalog) {
    if (deferred.has(name)) shown.set(name, tool)
  }
  return shown
}

/**
 * 没有东西被延迟时清空静态引导段。**返回新对象**：assembly 的段对象可能被别处共享，
 * mutate 会把改动泄漏到其他消费者；段里没有它时原样返回——"没事情可做就不碰
 * assembly"是本文件既有惯例，调用方因此能保持零干预。
 *
 * 与 `mcp:<server>` 使用说明的区别（这条曾经写错过）：**省的是工具定义，不是操作约束**。
 * 使用说明是"这台服务器怎么用"，工具还没加载时模型更需要它，所以永远不遮。
 */
export function maskGuidanceSection(sections) {
  return maskSection(sections, GUIDANCE_SECTION_NAME)
}

/** Code-unit 名字比较——与区域无关，同一输入在任何机器上给出同一顺序（同宿主 compareToolNames）。 */
function compareNames(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 未归属组的内部键（生产里不该出现：受管工具必有唯一 owner）。 */
const UNATTRIBUTED_KEY = '\u0000unattributed'

/** 每台服务器摘要的字符上限。B 档预算：截断只损失措辞，不损失正确性。 */
const SUMMARY_CHARS = 80

/**
 * 按 owner 把目录切成「服务器 → 工具」，并把名字切成**裸名**。
 *
 * 归属与切分**不做任何字符串解析**（红线 R1/R2，不变量 I1–I3）：
 *   - `owner` 来自 `view.ownerOf`，它是 `uniqueOwner` 前缀**唯一命中**的结果；
 *   - 切分点是 `'mcp__' + owner + '__'` 的**长度**，且先 `startsWith` 验证
 *     ⇒ `prefix + bare === name` 恒成立（I2）；
 *   - 归不上的工具进 `unattributed`、**保留全名**，绝不猜归属（I1 只允许"正确 owner 或 null"）。
 *
 * @param {Map<string, object>} catalog - 目录（`name → {name, description, parameters}`）。
 * @param {Map<string, string>} [ownerOf] - 工具名 → 服务器名。
 * @returns {{groups: {key: string, server: string, names: {name: string, bare: string}[]}[], unattributed: object[]}}
 */
export function groupCatalogByOwner(catalog, ownerOf) {
  const byServer = new Map()
  const unattributed = []
  for (const tool of catalog.values()) {
    const owner = typeof ownerOf?.get === 'function' ? ownerOf.get(tool.name) : undefined
    const prefix = owner === undefined ? undefined : `mcp__${owner}__`
    // 这道校验不是防御性冗余：ownerOf 来自上游，而 I2 必须在本函数内结构性成立。
    if (prefix === undefined || !tool.name.startsWith(prefix) || tool.name.length === prefix.length) {
      unattributed.push(tool)
      continue
    }
    if (!byServer.has(owner)) byServer.set(owner, [])
    byServer.get(owner).push({ name: tool.name, bare: tool.name.slice(prefix.length) })
  }
  const groups = [...byServer].map(([server, names]) => ({
    key: server,
    server,
    names: names.sort((left, right) => compareNames(left.bare, right.bare)),
  })).sort((left, right) => compareNames(left.server, right.server))
  unattributed.sort((left, right) => compareNames(left.name, right.name))
  return { groups, unattributed }
}

/**
 * 一行的字符成本：`- name` 加换行。
 *
 * **行是分配的最小原子单位**——绝不为了凑满预算把一个工具名切一半（不变量 I6）：半个名字
 * 就是给模型一个错的调用名，比少列几个更糟。所以预算永远只会"少装一行"。
 * @param {string} line
 * @returns {number}
 */
function lineCost(line) {
  return String(line ?? '').length + 1
}

/**
 * 字符预算的**注水分配**（整行为单位）：短的组先满足，剩下的额度在还饿着的组之间继续平分。
 *
 * 两条不变量：
 *   · `used ≤ budget` —— 装不下就少一行，绝不切名字（I6）；
 *   · **任何服务器都不会整台消失**（C 档：截断必须可见）——组头照出，只是名字列得少。
 * @param {{key: string, lines: string[]}[]} groups
 * @param {number} budget - 名字行可用的字符数（固定部分已被调用方扣掉）
 * @returns {Map<string, number>} 组键 → 取了几行
 */
export function allocateCatalogNames(groups, budget) {
  const taken = new Map()
  let remaining = Math.max(0, Math.floor(Number(budget)) || 0)
  let pending = groups.filter((group) => group.lines.length > 0)
  while (pending.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / pending.length)
    // 连最短的一行都放不下就停：宁可全部隐藏，也不切名字。
    if (share < lineCost('- x')) break
    let progressed = false
    const hungry = []
    for (const group of pending) {
      const already = taken.get(group.key) ?? 0
      let used = 0
      let extra = 0
      for (let index = already; index < group.lines.length; index++) {
        const cost = lineCost(group.lines[index])
        if (used + cost > share) break
        used += cost
        extra += 1
      }
      if (extra > 0) {
        taken.set(group.key, already + extra)
        remaining -= used
        progressed = true
      }
      if (already + extra < group.lines.length) hungry.push(group)
    }
    if (!progressed) break
    pending = hungry
  }
  return taken
}

/**
 * 压空白后按**字符预算**裁剪（纯资源约束，与内容语义无关——红线 R2 允许的唯一截断形态）。
 *
 * 退到最后一个空格再收尾：不是"猜哪段重要"，只是别把单词切两半（`type tex…`）。
 * 找不到空格（单长词）才硬切。末尾的 `…` 明确标记"这里没说完"（B 档）。
 */
function clipLine(line, max) {
  const flat = String(line ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * 服务器摘要：取 `instructions` 里第一条实质性行，压空白后裁到 {@link SUMMARY_CHARS}。
 *
 * 只做两件确定性的事：① 跳过宿主自己拼的 `### MCP server: <name>` 标题行（格式见
 * `dsh-mcp-client/src/connection.ts`，与本文件的组头重复）；② 按字符预算裁剪。
 * **不判断「这段有没有意义」**——那需要语义猜测（红线 R2 禁止）。取不到就返回空串，不发明描述。
 * @param {string} text - `mcp:<server>` 提示段的正文。
 * @param {string} server - 服务器名，用于精确匹配标题行。
 * @returns {string} 摘要，或空串。
 */
function instructionsSummary(text, server) {
  const lines = String(text ?? '').split(/\r?\n/)
  let index = 0
  while (index < lines.length && lines[index].trim() === '') index++
  if (index < lines.length && lines[index].trim() === `### MCP server: ${server}`) index++
  while (index < lines.length && lines[index].trim() === '') index++
  if (index >= lines.length) return ''
  return clipLine(lines[index], SUMMARY_CHARS)
}

/** 一组的小标题：`### <server> · N tools · <摘要> · M not listed`（缺项整段省略，不留空段）。 */
function catalogGroupHeader(group, hidden, instructionsOf) {
  const total = group.names.length
  if (group.server === undefined) {
    return `### (unattributed) · ${total} tools${hidden > 0 ? ` · ${hidden} not listed` : ''}`
  }
  const parts = [`### ${group.server} · ${total} tools`]
  const summary = typeof instructionsOf === 'function' ? instructionsSummary(instructionsOf(group.server), group.server) : ''
  if (summary !== '') parts.push(summary)
  if (hidden > 0) parts.push(`${hidden} not listed`)
  return parts.join(' · ')
}

/**
 * 无归属信息时的退化形态：平铺全名。既有调用点与用例的语义不变，但预算同样是**字符**。
 * @param {object[]} tools - 目录条目（带 `name`）
 * @param {object} config - 运行时配置
 * @param {number} budget - 整段目录的字符预算
 * @returns {{text: string, truncated: number}}
 */
function flatCatalogText(tools, config, budget) {
  const total = tools.length
  const body = [
    '## Deferred tool catalog',
    '',
    `The tools below stay deferred: only their names are listed here — neither descriptions nor parameter schemas are loaded. When one fits the task, call ${config.toolName} with a capability query; it matches tool names, descriptions and parameter names, returns the most relevant tools with complete schemas, and from then on the chosen tool is callable directly by its exact name.`,
  ]
  // 预算只算**名字行**：标题与 intro 是不可避免的骨架，算进来会让"预算小于骨架"时无解。
  // 截断提示也占字节，但它是截断的后果，按最坏情况预留（否则"有提示"那版会多出预算外开销）。
  const notice = (count) => `(${count} more deferred tools are not listed here. Search with capability keywords; if you already know an exact name from elsewhere, "select:<exact name>" also works.)`
  const reserved = lineCost(notice(total)) + 1
  const taken = allocateCatalogNames([{ key: 'flat', lines: tools.map((tool) => `- ${tool.name}`) }], Math.max(0, budget - reserved))
  const shown = Math.min(total, taken.get('flat') ?? 0)
  if (shown > 0) body.push('', ...tools.slice(0, shown).map((tool) => `- ${tool.name}`))
  const truncated = total - shown
  if (truncated > 0) body.push('', notice(truncated))
  return { text: body.join('\n'), truncated }
}

/**
 * 目录 section 正文：**按 MCP 服务器分组 + 只写裸名**。
 *
 * 为什么改（2026-10-26）：全名每行都重复 `mcp__<server>__`（8–21 字符）。实测 456 个延迟工具，
 * 全名需要 15.4K 字符（超预算必须砍 156 个），裸名只要 8–9.4K —— 同一预算一个名字都不用砍。
 * 去掉前缀后分组头不再是冗余，而是**服务器身份的载体**（早前 F15「分组头只是把排序重复一遍」
 * 的前提是名字带前缀，该前提随本次改动消失）。
 *
 * 预算是**字符**（`maxCatalogChars`），分配粒度是**整行**：装不下就少一行，绝不切名字（I6）。
 * 固定部分（标题 + intro + 全部组头）按**最坏情况**预留（假设每组都被截断、组头带
 * ` · N not listed`），所以实际渲染长度只会 ≤ 预算。
 *
 * @param {Map<string, object>} catalog - 目录（调用方已按 `deferred` 过滤）。
 * @param {object} config - 运行时配置（用 `toolName` 与 `maxCatalogChars`）。
 * @param {{ownerOf?: Map<string,string>, instructionsOf?: (server: string) => string}} [grouping]
 *   `ownerOf` 缺失/为空 ⇒ 退化形态（平铺全名）；`instructionsOf` 缺失 ⇒ 组头不带摘要。
 * @returns {{text: string, truncated: number}} `truncated` 是未列出的名字总数。
 */
export function catalogSectionText(catalog, config, grouping) {
  // 未配置 ⇒ 不截断（Infinity 在注水分配里是良定义：每组的 share 都是 Infinity，全部装下）。
  const budget = config.maxCatalogChars === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(Number(config.maxCatalogChars)) || 0)
  const { groups, unattributed } = groupCatalogByOwner(catalog, grouping?.ownerOf)
  if (groups.length === 0) return flatCatalogText(unattributed, config, budget)

  const all = unattributed.length === 0
    ? groups
    : [...groups, {
      key: UNATTRIBUTED_KEY,
      server: undefined,
      names: unattributed.map((tool) => ({ name: tool.name, bare: tool.name })),
    }]
  // 行是分配到界面上的原子单位：先物化成字符串，之后只做"取前 N 行"，不再按字符切。
  for (const group of all) group.lines = group.names.map((entry) => `- ${entry.bare}`)

  const title = '## Deferred tool catalog'
  const intro = `The tools below stay deferred: only their names are listed here — neither descriptions nor parameter schemas are loaded. Each group is one MCP server, and its tools are listed without the \`mcp__<server>__\` prefix their full callable names carry. When a tool fits the task, call ${config.toolName} with a capability query — it searches the full catalog (including any names not listed here) by tool name, description and parameter names, returns complete schemas, and the names it returns are the exact ones to call.`
  // 预算只算**名字行**（`maxCatalogChars` 缺省不截断，见 resolveRuntimeConfig）：标题、intro、组头是"地图"，
  // 属于固定骨架（≈500–900 字符，随服务器数线性），把它算进预算会让小预算无解——
  // 要么砍掉组头（地图缺块，违反 C 档），要么超支。所以两者分开记。
  const taken = allocateCatalogNames(all, budget)
  const body = [title, '', intro]
  let truncated = 0
  for (const group of all) {
    const shown = Math.min(group.names.length, taken.get(group.key) ?? 0)
    const hidden = group.names.length - shown
    truncated += hidden
    body.push('', catalogGroupHeader(group, hidden, grouping?.instructionsOf))
    for (const line of group.lines.slice(0, shown)) body.push(line)
  }
  return { text: body.join('\n'), truncated }
}

/**
 * 从装配结果里读某台服务器的 `instructions` 正文（`mcp:<server>` 段）。
 * @param {{name?: string, text?: string}[]|undefined} sections
 * @returns {(server: string) => string}
 */
export function instructionReader(sections) {
  const byName = new Map()
  for (const section of sections ?? []) {
    if (typeof section?.name !== 'string' || !section.name.startsWith('mcp:')) continue
    byName.set(section.name, typeof section.text === 'string' ? section.text : '')
  }
  return (server) => byName.get(`mcp:${server}`) ?? ''
}

/**
 * 摘要文本的缓存指纹：只按段名与文本长度累计，O(段数)。
 *
 * 长度相同但内容变化会漏判（B 档：摘要陈旧只损失措辞，不影响正确性）。加它的原因是
 * `instructions` 可能随重连变化，而目录文本按 revision 缓存——不能让摘要永久陈旧。
 * @param {{name?: string, text?: unknown}[]|undefined} sections
 * @returns {number}
 */
export function instructionFingerprint(sections) {
  let total = 0
  for (const section of sections ?? []) {
    if (typeof section?.name !== 'string' || !section.name.startsWith('mcp:')) continue
    total += section.name.length * 31 + (typeof section.text === 'string' ? section.text.length : 0)
  }
  return total
}

/**
 * 提示词 section：第三方文本（MCP 描述）绝不被插值，否则一个 {{var}} 就让每步组装抛错。
 * `order` 只有走 `systemPrompt.section()` 注册时才需要（那个入口要求有限数）；
 * 在 assemble waterfall 里直接追加的 section 不需要。
 */
const GUIDANCE_SECTION_ORDER = 140
/** 静态引导段的段名。组装层要按名字把它摘掉，所以提成常量（两处共用）。 */
const GUIDANCE_SECTION_NAME = 'tool-search:guidance'
/** 活库存目录段的段名（每次组装追加）。 */
const CATALOG_SECTION_NAME = 'tool-search:catalog'

function promptSection(name, text, order) {
  return order === undefined ? { name, text, interpolate: false } : { name, text, interpolate: false, order }
}

/** 搜索工具的结果 schema：宽松对象，具体形状由 execute 决定（render 只做文本投影）。 */
const RESULT_SCHEMA = { type: 'object', additionalProperties: true }

/**
 * 视图算不出来时的零干预视图：回到 feature 前的全量可见行为。
 * **每次新造一份**而不是共享单例——它的集合若被将来某处误改，共享单例会把这个改动
 * 泄漏给所有 agent；新造一份让"视图是只读派生状态"这条不变量有结构性保证。
 */
function inertView(options = {}) {
  return {
    managed: new Map(),
    ownerOf: new Map(),
    catalog: new Map(),
    managedByServer: new Map(),
    // 视图算不出来（而不是"没有延迟服务器"）时要能在报错里说清是哪一种：
    // 两者都表现为 managed 为空，原因完全不同，混成一句话就是误导。
    degraded: options.degraded === true,
  }
}

/**
 * 装配到宿主。返回 cleanup。ctx 契约：tools（register/guard/schemas）、on、effect、logger?。
 * agent 契约：agent.ctx.tools.schemas(agent)、agent.session.deriveMessages()。
 */
export function installToolSearchRuntime(ctx, config = {}) {
  // 硬校验（同 installAgentRuntime 对 ctx.on 的风格）：tools 服务的 register/guard 是本功能的
  // 地基，缺任何一样都不是"降级运行"能表达的——装一半比不装更坏。真实宿主恒提供二者
  // （dsh-tools 服务契约）；缺了即是宿主契约破坏，立刻炸掉好过日志沉底。
  if (typeof ctx.tools?.register !== 'function' || typeof ctx.tools?.guard !== 'function') {
    throw new Error('tool-search: 宿主 tools 服务不完整（缺 register/guard），无法装配')
  }
  const resolved = resolveRuntimeConfig(config)
  // 宿主能力探测：装一次，之后不再探测。缺项只记一次日志（warnOnce），不抛错——
  // 那是"少了优化"，不是"装不上"。
  const caps = probeHost(ctx)
  // 代次只在这里判一次（能力判定，不看版本号）：业务层不自行探测、不拼接两代路径。
  const hostGeneration = detectToolsGeneration(ctx.tools)
  /** 安装期/运行期的诊断事实：面板与 RPC 读它，而不是靠日志猜。 */
  const diagnostics = []
  const noteDiagnostic = (event) => {
    if (diagnostics.length < 20) diagnostics.push({ ...event, at: Date.now() })
    if (event?.code === 'ASSEMBLY_WITHOUT_TOOLS') {
      warnOnce(ctx, 'assemblyWithoutTools',
        '宿主组装结果里没有 tools：本代宿主的接入点可能已变（延迟加载未生效）')
    }
  }
  // 两代宿主都有各自的招牌能力，正常部署不会落到这一支。落到了就是"能力面变了"：
  // 退回旧代 waterfall（它除了 ctx.on 什么都不需要），但**显式记账**——面板会显示
  // `generation: legacy (assumed)`，而不是让用户以为延迟加载已验证可用。
  const assumedGeneration = hostGeneration.generation === 'unknown'
  const presentationGeneration = assumedGeneration ? 'legacy' : hostGeneration.generation
  if (assumedGeneration) {
    noteDiagnostic({ code: 'HOST_GENERATION_ASSUMED', reason: hostGeneration.reason })
    warnOnce(ctx, 'hostGenerationAssumed',
      `没有识别到宿主工具契约（${hostGeneration.reason}）：按旧代 waterfall 接入，`
      + '若模型仍能看到全部声明，说明本代宿主的接入点已变化')
  }
  const loadNewRenderer = async () => {
    if (typeof config.loadNewRenderer === 'function') return config.loadNewRenderer()
    const loader = typeof ctx.get === 'function' ? ctx.get('loader') : undefined
    if (typeof loader?.import !== 'function') throw new Error('host loader.import() is unavailable for PTC renderers')
    return loader.import('@deepseek-ai/dsh-tool-executor-ptc')
  }
  const rendererModule = caps.definitions
    ? loadRenderers({ host: ctx.tools, loadNewRenderer })
    : Promise.resolve()
  // 渲染器的真实状态：它决定 PTC 手册能否裁、签名能否给。加载是异步的，所以这里只记账，
  // 不阻塞安装（手册裁剪在组装时才用得到）。
  const rendererStatus = {
    state: caps.definitions ? 'loading' : 'unsupported',
    reason: caps.definitions ? undefined : 'the host has no tools.definitions(): PTC renderers are resolved from @deepseek-ai/dsh-tools',
  }
  rendererModule.then((module) => {
    const renderer = module?.renderToolsSdk
    if (typeof renderer === 'function') {
      rendererStatus.state = 'ready'
      return
    }
    rendererStatus.state = 'unsupported'
    rendererStatus.reason = 'the resolved renderer module exports no renderToolsSdk()'
  }).catch((error) => {
    rendererStatus.state = 'failed'
    rendererStatus.reason = `PTC renderer load failed: ${error?.message ?? error}`
    warnOnce(ctx, 'ptcRenderers', `新版 PTC renderer 加载失败：${error?.message ?? error}`)
  })
  // 安装的**清理栈**：任何一个阶段失败都要逆序释放已经拿到的资源。旧写法只把
  // disposer 塞进返回闭包，于是"装到一半失败"= 半套注册留在宿主里（工具名被占、守卫仍在拒）。
  const cleanups = []
  const track = (dispose) => {
    if (typeof dispose === 'function') cleanups.push(dispose)
    return dispose
  }
  const cleanup = () => {
    const pending = []
    for (let index = cleanups.length - 1; index >= 0; index -= 1) {
      try {
        const result = cleanups[index]?.()
        // 现代宿主的投影释放是 Promise（`handle.dispose()`）：不 await 就会在 HMR 后
        // 撞上"同一个 key 重复注册"的宿主错误。这里收集起来一起等。
        if (result !== null && typeof result?.then === 'function') pending.push(result)
      } catch { /* 幂等：单个失败不阻断其余释放 */ }
    }
    cleanups.length = 0
    return pending.length === 0 ? undefined : Promise.allSettled(pending).then(() => undefined)
  }
  /** 获取一笔宿主资源；失败时逆序释放已经拿到的那些，再抛出原错误。 */
  const acquire = (fn) => {
    try {
      return track(fn())
    } catch (error) {
      cleanup()
      throw error
    }
  }
  // 重名预检（G4）：宿主的 NamedEntries.insert 对重名直接抛错，而这是构造函数里的同步
  // 路径——一个同名工具就会让整个 mcp-manager 装不上。换名 + 日志，好过装不上。
  const chosen = chooseToolName(ctx.tools, resolved.toolName, TOOL_NAME_CANDIDATES, { ctx })
  // toolName 参与视图划分（搜索工具自身永远稳定）与全部对外文案，换名后必须整体用它。
  // resolved 是 resolveRuntimeConfig 刚造出的局部对象，此处改写一个字段是与"换名"这件事
  // 最直接的表达——再拷贝一份反而会造出两个 toolName。
  if (chosen.renamed) resolved.toolName = chosen.name
  // per-agent 状态只剩"发现集"——它和视图正交，不该混在视图里。
  // 发现集的持久化载体（C4）：`ctx.sessionProjections` 的**内部投影**（无 `wire`，不暴露给
  // 客户端）。这是 PTC 下唯一能恢复发现状态的路径——PTC 的搜索发生在程序内部，只留
  // `tool/ptc-dispatch` 事件，而它不是 surface 事件，`deriveMessages()` 看不到。
  // 投影只当**恢复种子**：运行期状态仍是 per-agent 的 WeakMap，避免"一会话多 agent 共享"。
  // 两代宿主的注册形状不同（同步 disposer / 异步句柄），由端口收敛；现代句柄未就绪时
  // 读取返回 undefined，恢复退回派生消息并在能力状态里如实标注。
  const projectionPort = installProjectionPort(ctx, discoveryProjection({
    z,
    toolName: resolved.toolName,
    // 有界：状态是纯 JSON 且要随会话持久化，长会话不能无限增长。
    max: projectionBound(resolved.maxDiscovered),
    onDiagnostic: noteDiagnostic,
  }), { key: PROJECTION_KEY, onDiagnostic: noteDiagnostic })
  track(() => projectionPort.dispose())
  let projectionReadyState
  projectionPort.ready.then((result) => {
    projectionReadyState = result
    if (result.state === 'failed') {
      warnOnce(ctx, 'projectionRegister', `注册发现集投影失败（退回会话派生消息）：${result.reason}`)
    }
  })

  // per-agent 视图缓存：revision 不变就复用。revision 由视图自己的输入算出来，
  // 所以不需要任何"脏标记"订阅——漏置标志导致静默不遮这一类失配不可能发生。
  const viewCache = new WeakMap()

  // 发现集的所有者：按 agent 隔离（WeakMap 键就是 agent），随本服务实例存活。
  // 参数更新重装运行时**不会**先销毁它再猜回：新实例首次接触 agent 时从投影/派生消息恢复
  // 一次有序快照（见 restoreFrom），之后只由搜索提交推进。
  const discovery = createDiscoveryStore({
    maxDiscovered: resolved.maxDiscovered,
    restore: restoreFrom,
    onDiagnostic: noteDiagnostic,
  })
  const stateFor = (agent) => discovery.stateFor(agent)

  /**
   * 还原发现集（从旧到新）。两条来源，投影优先：
   * 1. 会话投影（native 与 PTC 通吃）——现代宿主是**异步句柄**，未就绪时 `stateOf` 返回
   *    undefined，此时退回派生消息（明确降级，不假装恢复成功）；
   * 2. 会话派生消息——投影缺席时的退路（native 有效、PTC 无效）。
   *
   * "空投影"与"明确清空"必须分开：只有**真实 v2 快照**才写 `protocol: v2`（含空数组）。
   *
   * 注意 init 现在也带 `protocol: v2`，所以 `explicitEmpty` 对 init 同样成立、直接返回 []。
   * 这不是缺陷：宿主在 `ver` 不匹配时**丢弃缓存行并从头折叠**（session-projection-cache 的
   * 契约），所以"已经有过发现"的会话读到的一定是折叠后的快照；看到 init 就说明这份会话
   * 一条相关事件都没有，[] 正是正确答案。派生消息那条退路因此只服务"投影整体缺席"。
   */
  function restoreFrom(agent) {
    const saved = projectionPort.stateOf(agent.session)
    if (Array.isArray(saved?.discovered)) {
      const explicitEmpty = saved.discovered.length === 0 && saved.protocol === META_PROTOCOL_V2
      if (saved.discovered.length > 0 || explicitEmpty) return saved.discovered
    }
    const messages = typeof agent.session?.deriveMessages === 'function' ? agent.session.deriveMessages() : []
    return [...discoveredFromMessages(messages)]
  }

  /**
   * 这个 agent 的呈现模式。
   *
   * **事实只在装配时可得**：模型看到的是函数清单（native）还是 `tools:sdk` 手册（ptc），只由
   * `assembly.tools` 的形状决定。所以：
   *
   *   · 有 assembly（装配路径）→ 用 `modeFor`（宿主渲染手册时用的同一个方法），或按形状推断
   *     （`inferMode`，G1 的公开退化判据），并**按 agent 记下来**；
   *   · 没有 assembly（guard/execute）→ legacy 宿主仍可问 `modeFor`；现代宿主（`modeFor` 已删除）
   *     读装配时的那条记录，从没装配过就按 'native' 处理。
   *
   * ⚠️ 这里**不能**用 `ctx.get('ptcRuntime')` 当判据：executor 是 per-scope 的，而 `ptcRuntime`
   * 对所有作用域都可见——"root 挂 PTC、某个 agent 作用域挂 native"时会把 native 会话判成 PTC，
   * 于是给原生调用附加"返回类型"签名。实测见 PLAN-1.11 §8.6。
   */
  const assembledMode = new WeakMap()
  const modeOf = (scope, assemblyTools, managed) => {
    if (caps.modeFor) {
      try {
        const mode = ctx.tools.modeFor(scope)
        if (assemblyTools !== undefined) assembledMode.set(scope, mode)
        return mode
      } catch (error) {
        warnOnce(ctx, 'modeForThrew', `ctx.tools.modeFor() 调用失败（按 native 处理）：${error?.message ?? error}`)
        return 'native'
      }
    }
    if (assemblyTools !== undefined) {
      const mode = inferMode(assemblyTools, managed)
      assembledMode.set(scope, mode)
      return mode
    }
    return assembledMode.get(scope) ?? 'native'
  }

  /**
   * 取（或按 revision 重建）视图，并判定这个 agent 的呈现模式。
   *
   * 返回 `{ mode, view }`。`mode === 'both'` 时视图被换成 inertView（`managed` 为空 ⇒
   * 两个布尔都假）——**这是唯一 inert 的取值**（B4/§11.4）。写成"非 native 就 inert"
   * 会把 PTC 整个关掉，是本文件最容易写错的一处判据。
   *
   * **唯一的错误边界**：ToolSearch 是优化不是正确性机制，宿主视图不可用、配置读不了都
   * 退回全量可见并记账，绝不让 assemble/guard 抛错——那会否决建会话或让 agent loop 每步失败。
   * `revision` 挂在视图上：目录文本的缓存键要用它（B11 修正）。
   */
  const viewFor = (agent, assemblyTools, toolSet) => {
    try {
      const agentTools = typeof agent?.ctx?.get === 'function' ? agent.ctx.get('tools') : agent?.ctx?.tools
      if (agentTools === undefined) throw new Error('agent tools service is unavailable')
      const registeredSchemas = caps.definitions && toolSet !== undefined
        ? agentTools.definitions(agent, toolSet).map((definition) => ({
          name: definition.name,
          description: definition.description,
          parameters: definition.parameters,
          output: definition.output?.schema,
        }))
        : agentTools.schemas(agent)
      // definitions(scope, toolSet) is the preferred projection, but the admission object is
      // the authoritative boundary. Intersect explicitly so a host implementation that returns
      // registered definitions from this method cannot make conditional tools searchable.
      const admitted = typeof toolSet?.view === 'function' ? toolSet.view(agent) : undefined
      const schemas = admitted === undefined
        ? registeredSchemas
        : registeredSchemas.filter((schema) => admitted.has(schema.name))
      // agent 一路带下去：项目族的加载策略、保护名单与老 defer 都按**这个会话所在项目**解析。
      const revision = viewRevision(schemas, resolved, agent)
      const cached = viewCache.get(agent)
      let view = cached !== undefined && cached.revision === revision ? cached.view : undefined
      if (view === undefined) {
        view = { ...buildToolSearchView(schemas, resolved, agent), revision }
        viewCache.set(agent, { revision, view })
      }
      // 模式不进视图缓存：它对同一个 agent 是恒定的，缓存它只会多一个要失效的字段。
      const mode = modeOf(agent, assemblyTools, view.managed)
      return { mode, view: mode === 'both' ? inertView() : view }
    } catch (error) {
      ctx.logger?.error?.(`mcp-manager: ToolSearch 视图不可用，本轮退回全量可见：${error?.message ?? error}`)
      return { mode: 'native', view: inertView({ degraded: true }) }
    }
  }

  // 目录显示文本缓存（B11 修正）：视图只按 revision 缓存，而目录文本**还**取决于发现集，
  // 所以必须给文本单独一个缓存，否则每次组装都要重算（735 工具 ~11ms）。
  // 键 = `${revision}:${versionOf(state)}`；只留两个 slot——发现集的版本号在淘汰/回灌之间
  // 可能来回，两格足以避免抖动，又不会长成一张表。
  const catalogCache = new WeakMap()
  const catalogTextFor = (agent, view, state, deferred, sections) => {
    // 缓存键必须含 instructions 指纹：组头摘要读的是 `mcp:<server>` 段正文，而它不在
    // view.revision 里。漏掉这一项 = 服务器重连后摘要永久陈旧（B 档，但仍属静默错误）。
    const key = `${view.revision}:${versionOf(state)}:${instructionFingerprint(sections)}`
    let cache = catalogCache.get(agent)
    if (cache === undefined) {
      cache = new Map()
      catalogCache.set(agent, cache)
    }
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const { text, truncated } = catalogSectionText(filterCatalog(view.catalog, deferred), resolved, {
      ownerOf: view.ownerOf,
      instructionsOf: instructionReader(sections),
    })
    // C 档：截断必须**对人也可观测**。模型能从组头看到数量，但运维/用户看不到——
    // 而"目录被预算砍了"正是将来要不要做 `server:<名>` 枚举的判断依据（见 NEXT-SESSION-1.9 §Q2-3）。
    // 键带 revision：同一份库存只记一次，调预算/换模型/工具增减时才再记。
    if (truncated > 0) {
      warnOnce(ctx, `catalogTruncated:${view.revision}`,
        `目录因 maxCatalogChars=${resolved.maxCatalogChars} 未列出 ${truncated} 个工具名`
        + `（模型仍可用关键词或 select: 搜到）；想全列就调大它`)
    }
    cache.set(key, text)
    if (cache.size > 2) cache.delete(cache.keys().next().value)
    return text
  }

  // SDK 手册裁剪的取数缓存：`schemas(scope)` + 逐工具 `get()` 是 O(n²)（701 工具 ~278ms），
  // 按 revision 缓存后一个 revision 只付一次（sdkSchemas 快路径 ~15ms 也一并缓存）。
  const sdkCache = new WeakMap()
  // cacheKey 是 provider 那边"谁在问"的身份（per-agent），scope 是要传给宿主取数 API 的
  // 那个作用域（两者在真实宿主里是同一个对象，但语义不同：混用会让缓存键变成第二个真相源）。
  const sdkReadFor = (cacheKey, scope, revision, toolSet) => {
    const cached = sdkCache.get(cacheKey)
    if (cached !== undefined && cached.revision === revision && cached.toolSet === toolSet) return cached.read
    const read = readSdkSchemas(ctx.tools, scope, caps, toolSet)
    sdkCache.set(cacheKey, { revision, toolSet, read })
    return read
  }

  /**
   * 裁 `tools:sdk` 手册（PTC 下唯一真正省字的一处：35 工具 12651 → 7431 字符，F5）。
   *
   * 四道门，顺序即正确性：
   * 1. 段存在且**文本非空**——PTC 部署下的 native agent 段还在、文本是 ''，此时
   *    `render(全集) !== ''` 会白跑一次全集重渲染再报 premise-mismatch；
   * 2. `requireDiscovery` 为真（B12）——否则藏了签名却允许盲调 = 半失效；
   * 3. 有 `ptcRuntime`——语言与 `programFormat` 都从它来，没有它就不可能有 PTC 会话；
   * 4. 能拿到宿主的原输入（`incomplete`/`none` 一律放弃，绝不发一份少签名的手册）。
   *
   * 整个函数在调用点包在 try/catch 里：任何异常都沿用宿主原文。
   * @returns {object[]} 段数组（失败时原样返回同一个引用）。
   */
  const trimSdkSections = async (agent, scope, view, deferred, sections, toolSet) => {
    const section = (sections ?? []).find((entry) => entry?.name === SDK_SECTION_NAME)
    if (section === undefined || typeof section.text !== 'string' || section.text === '') return sections
    if (resolved.requireDiscovery !== true) return sections
    const runtime = typeof ctx.get === 'function' ? ctx.get('ptcRuntime') : undefined
    if (runtime === undefined) return sections
    const read = sdkReadFor(agent, scope, view.revision, toolSet)
    if (read.schemas === undefined) {
      warnOnce(ctx, `sdkRead:${read.via}`, `取不到宿主渲染 ${SDK_SECTION_NAME} 的原输入（${read.via}）：本次不裁手册`)
      return sections
    }
    // G3：`programFormat` 有值才转发。0.2.1 起 TS 渲染器多这个参数且宿主会传，
    // 不转发就会在自检那一步失败、静默退化成不裁；0.2.0 的渲染器忽略第二个实参。
    const programFormat = typeof runtime.programFormat === 'string' ? runtime.programFormat : undefined
    const module = caps.definitions ? await rendererModule : undefined
    const render = rendererFor(runtime.language, module)
    if (typeof render !== 'function') return sections
    const result = trimSdkText({
      hostText: section.text,
      schemas: read.schemas,
      drop: deferred,
      render,
      programFormat,
    })
    if (!result.ok) {
      // `no-drop` 是正常情形（没有可裁的东西）；其余是"裁剪没发生"，记一次便于排查，
      // 但都**不抛错**——最坏 = 今天的净亏，不会更坏（B3）。
      if (result.reason !== 'no-drop') {
        warnOnce(ctx, `trim:${result.reason}`, `${SDK_SECTION_NAME} 本次未裁剪（${result.reason}）：沿用宿主原文`)
      }
      return sections
    }
    return sections.map((entry) => (entry === section ? { ...entry, text: result.text } : entry))
  }

  /**
   * `tool_search` 结果里的签名（C1）：参数类型 + 返回类型，用**宿主自己的** schema→类型
   * 渲染器生成（`jsonSchemaToTs` / `jsonSchemaToPy`，F3 导出）。这样签名与手册里写的是同一种
   * 语言、同一套渲染规则，模型不用在两套写法之间翻译。
   *
   * 拿不到语言、或拿不到某工具的 `output.schema` 时返回 `undefined`（不给这个字段）：
   * 猜一个类型比不给更坏，而"没有返回类型"恰恰是 C1 要消除的半失效。
   * @returns {{of: (name: string) => string|undefined}|undefined}
   */
  const signatureSource = async (agent, view, toolSet) => {
    const runtime = typeof ctx.get === 'function' ? ctx.get('ptcRuntime') : undefined
    const language = runtime?.language
    if (typeof language !== 'string') return undefined
    const read = sdkReadFor(agent, agent, view.revision, toolSet)
    if (read.schemas === undefined) return undefined
    const module = caps.definitions ? await rendererModule : dshTools
    const toType = schemaTypeRendererFor(language, module)
    if (typeof toType !== 'function') return undefined
    const byName = new Map(read.schemas.map((entry) => [entry.name, entry]))
    // 类型渲染器会按代码块缩进换行；结果里要的是**一行**签名（模型在程序里照写，不是读文档），
    // 所以把连续空白压成单空格。语义不变（TS 的换行只是排版），体积小一个量级。
    const compact = (schema) => toType(schema).replace(/\s+/g, ' ').trim()
    return {
      of: (name) => {
        const entry = byName.get(name)
        if (entry === undefined || entry.output === undefined) return undefined
        return language === 'python'
          ? `async def ${name}(args: ${compact(entry.parameters)}) -> ${compact(entry.output)}`
          : `tools.${name}(args: ${compact(entry.parameters)}) => Promise<${compact(entry.output)}>`
      },
    }
  }

  // 提示词每个面只带**它那个时刻需要的信息**，规则措辞只准有一份：
  // - 工具描述 = 决策（要不要调、调了得到什么）——常驻，所以不放规则，省每个请求的钱；
  // - query 参数 = 组成查询（怎么写才命中）——与描述在同一次请求里同时可见，是规则的**唯一**真源；
  // - 回执 = 调用后（模型唯一会读到"失败了"原文的时刻）——只引用匹配规则，不重述语言规则的道理。
  // 内容全部有据：工具名恒为 ASCII 标识符，描述语言由服务器自己决定——所以英文是"最可靠"
  // 而不是"必须"（中文描述的服务器上，中文关键字照样命中，见 tokenize 的 CJK 二元分词）。
  // 限定在**关键词形态**：`select:`/`+server` 不按词匹配，而这句话紧跟在三形态之后，不限定就是假话。
  // 说"按词不按义"而不是"字面"：`stem: true` 会把单复数归一，说"字面"仍然是过强的断言。
  const MATCH_RULE = 'For keyword queries, matching is by word tokens, not by meaning: a query only hits a tool whose name, description or parameter names contain its keywords.'
  const LANGUAGE_RULE = 'English keywords are the most reliable (tool names are English identifiers); keywords in a server\'s own description language also match.'
  // 命中回执：唯一目的是让模型**停止再搜**——schema 已经完整，再搜一次是在浪费一步。
  const SUCCESS_INSTRUCTION = 'These schemas are complete: call the tool directly by its exact name with arguments matching its parameters. Do not search again for the same capability.'
  // 零命中回执：这是模型唯一会读到"搜索失败"原文的时刻，所以它必须是配方而不是断言。
  // 顺序刻意是"先抄名字再翻译"：`select:` 零翻译成本、对目录里看得见的工具必中，
  // 而"换英文关键词"是一次赌（赌那个工具的描述是英文）。
  // 第 (2) 步必须带免责句：对"自己给中文描述"的服务器，只教它换英文是指错路——而这是模型最后
  // 读到的文本，比 query 参数里那句更靠后，漏掉就等于事后撤掉那条规则。
  const ZERO_HIT_INSTRUCTION = `No tool matched. ${MATCH_RULE} The capability may still exist. Retry in this order: (1) if the deferred catalog lists the name you need, search "select:<name>" for its schema; (2) otherwise restate the capability with English keywords — or with the words that server's own descriptions use. If both fail, report what you tried instead of guessing.`
  // `select:` 落空和关键词落空是**两个病**：前者是"这个名字解析不到"，后者是"词不匹配"。
  // 共用一段话就会把前者诊成后者（实测：`select:browser.capture_network` 未命中，回执却叫它换英文
  // 关键词——方向相反）。而"名字解析不到"本身又有两个原因：写法不认（工具在）／根本没有这个工具。
  // 插件**分不出、也不该猜**（猜就要做模糊匹配，踩 R2），所以给两条**动作**而不是一个诊断：
  // 抄来的名字 ⇒ 那就是不存在，改按能力搜；自己拼的名字 ⇒ 逐字复制。两条都不需要知道是哪一种。
  const SELECT_MISS_INSTRUCTION = 'That exact name is not in the catalog. "select:" matches catalog names character for character — it does not search descriptions, and it does not guess near-misses. If the name came from the catalog or from a result, then no such tool exists: switch to a capability search (plain keywords, or "+<server> <words>"). Do not repeat the same name.'

  // 从这里开始**获取宿主资源**：每一笔都登记进清理栈。任何一步失败都逆序释放，
  // 不让"装了一半"留在进程里（工具名被占、守卫还在拒、装饰器没摘）。
  const disposeTool = track(ctx.tools.register({
    name: resolved.toolName,
    // 描述刻意不列服务器清单：那是活数据，会过期；活库存由目录 section 按组装承载（决策 9）。
    // 语言提示按**实测**写（2026-10-18，见 TUNING-DECISIONS Q3）：索引对 CJK 用字符二元分词，
    // 中文查询**能**命中中文描述；但英文描述 + 中文查询会零命中（`读取文件内容` 搜不到
    // `read_file`——纯英文描述里没有可匹配的中文 token）。工具名恒为英文标识符，所以
    // "英文最稳"是真话，但不能写成"只准英文"，否则中文描述的服务器上反而丢了半条路。
    description: 'Search deferred MCP tools by capability. Their names are listed in the prompt; descriptions and parameter schemas are not — this returns the most relevant tools with complete schemas, ready to call directly.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          // 三种形态**互斥**，必须这么写清楚：实测里模型把 `select:` 与 `+server` 混成
          // `select:browser take_screenshot`——形态列表写得像能组合，模型就会组合。
          // 名字那条用**正向动作**（Copy character-for-character）而不是禁令：模型不觉得自己
          // 在拼，它觉得在精确表达，所以"禁止拼接"打不中；"逐字复制"才是它认识的动作。
          // 末句给判据而非叮嘱：拼出来的名字就是不存在——这句比三条禁令更省字也更硬。
          description: `Capability query. Pick exactly one form: (a) "select:<name>[,<name>...]" for exact names; (b) "+<server> <words>" to require a server; (c) plain keywords otherwise. Copy select: names character-for-character — either a bare name exactly as the catalog lists it, or a full mcp__<server>__<name> from an earlier result. ${MATCH_RULE} ${LANGUAGE_RULE}`,
        },
        max_results: {
          type: 'integer',
          description: `Maximum tools to return (1-${resolved.maxResults}); defaults to ${resolved.maxResults}.`,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: RESULT_SCHEMA,
      // 累积发现快照只进 meta，render 剥掉——否则每次搜索都把不断增长的发现表泄回提示词。
      render: (_args, value) => {
        const rendered = { ...value }
        delete rendered.discoverySnapshot
        return [{ type: 'text', text: JSON.stringify(rendered) }]
      },
      // 恢复种子走**宿主一等公民**的 meta（tool/result.meta），不是模型可读正文：
      // 正文可能被渲染器改写/截断，而 meta 是宿主为投影原样保存的事实。
      presentationMeta: (_args, value) => ({
        protocol: META_PROTOCOL_V2,
        discoverySnapshot: { orderedNames: value.discoverySnapshot?.orderedNames ?? [] },
      }),
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error(`${resolved.toolName} requires an agent-scoped execution`)
      const { mode, view } = viewFor(exec.agent, undefined, exec.toolSet)
      // 没东西可搜 → **明确报错**（B13）。判据是 `managed = ∅`（一个延迟服务器都没有），
      // 不是 `D = ∅`（都发现了——再搜一次是合法的）。修复前这里是"空结果 + 指向一个不存在的
      // 目录段"（F10），那是最坏的一种反馈：模型看不出自己错在哪。
      if (view.managed.size === 0) {
        throw new Error(view.degraded
          ? `${resolved.toolName}: deferred tool loading is unavailable in this session (the host tool view could not be read); every tool is visible — call it directly`
          : `${resolved.toolName}: no MCP server is set to deferred loading in this session; every tool is already available — call it directly`)
      }
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (query === '') throw new Error('query must not be empty')
      const limit = Math.min(Math.max(Number(args.max_results) || resolved.maxResults, 1), resolved.maxResults)
      // 搜索按 `hasDeferredServers`（B14）：受管集为空 = 没有任何服务器被延迟，索引里
      // 本来就没有东西可搜。判据刻意不是 `D`——B13：全部发现之后再搜一次是合法的。
      const matches = searchCatalog(view.catalog, query, limit, resolved.stem)
      const returned = matches.filter((match) => match.found).map((match) => match.name)
      // 先 `discover`（B8：发现即播种 lastUsed）再淘汰——顺序反了会把刚发现的一批当最旧踢掉。
      // 所有提交都是**同步**的：异步签名准备发生在提交之后，绝不会用旧快照覆盖新状态。
      const discoveredNow = discovery.discover(exec.agent, returned)
      // 再把**本批返回的全部名字**（含早就发现的）记成"已承诺、未使用"。少这一步就是
      // 混合批次的自我矛盾：结果里写着"直接调"，而其中较旧的项刚被本次淘汰。
      discovery.claim(exec.agent, returned)
      // **只在本次真的新增了名字时淘汰**（B10）：一次"什么都没搜到"的搜索不该踢掉一半。
      if (discoveredNow.length > 0) discovery.evict(exec.agent, discoveredNow.length)
      // 结果里的快照必须与本次提交一致：同步取，不能在 await 之后再读（那时可能已被
      // 另一次搜索推进，模型会拿到一份"和它看到的 matches 不一致"的累计表）。
      const orderedNames = discovery.snapshot(exec.agent)
      const discoveredCount = discovery.size(exec.agent)
      // C1：非 native 会话补"签名"（参数 + **返回类型**）。PTC 下模型是在程序里调用工具，
      // 手册给的正是这两样；只还参数就等于"比不延迟时更少"——那是半失效。
      // native 下不给：原生调用没有"返回类型"这个契约，加了是噪声。
      // 拿不到语言或拿不到 output.schema 就不给（退回现状），绝不猜。
      const signatures = mode === 'native' ? undefined : await signatureSource(exec.agent, view, exec.toolSet)
      return {
        protocol: META_PROTOCOL_V2,
        query,
      // 刻意**不带 score**：它是内部排序产物（精确命中时是 Infinity），而工具输出要过
      // `snapshotToolValue` 的无损 JSON 校验——`JSON.stringify(Infinity)` 得到 null，
      // 整个结果会被判成 INVALID_TOOL_OUTPUT，`select:` 这个主查询形态就此报错。
      // 排序已由数组顺序表达，模型不需要这个数。
      matches: matches.map((match) => {
        if (!match.found) return { name: match.name, found: false }
        const entry = { name: match.name, description: match.description, parameters: match.parameters }
        const signature = signatures?.of(match.name)
        // 可选字段：老客户端/老协议不认它也照常工作（协议仍是 v1，只增不改）。
        if (signature !== undefined) entry.signature = signature
        return entry
      }),
      discoveredTools: discoveredNow,
      discoveredCount,
      catalogTools: view.catalog.size,
      // v2 有序替换快照（旧 → 新）。顺序就是 LRU 事实：读侧重放时不能再排序/去重。
      discoverySnapshot: { orderedNames },
      // 判据是"**真的找到了**"，不是"数组非空"：`select:` 未命中也会返回一条 found:false
      // 条目（协议要告诉模型这个名字不存在），`matches.length > 0` 会把这种情况判成成功，
      // 于是模型收到"schema 都齐了，直接调吧"——而它手里什么都没有。实测抓到的就是这个
      // （`select:browser take_screenshot` → matched: [] 却拿到成功回执）。
      // 分诊判据是**查询语法**（parseQuery 的 kind），不是对文本内容做启发式：确定事实，不是猜。
      // 解析两遍（这里一次、searchCatalog 内部一次）是刻意的——把 kind 塞进 searchCatalog 的返回值
      // 会改掉那条纯函数的契约，而多解析一遍短查询的代价远小于多一个真源。
      instruction: matches.some((match) => match.found)
        ? SUCCESS_INSTRUCTION
        : (parseQuery(query).kind === 'select' ? SELECT_MISS_INSTRUCTION : ZERO_HIT_INSTRUCTION),
      }
    },
  }))

  const disposeGuard = acquire(() => ctx.tools.guard((execution) => {
    if (execution.agent === undefined) return undefined
    // guard 没有 assembly 可看：`modeFor` 缺席时 `modeOf` 会退回 'native'（缺项已记过日志）。
    const { view } = viewFor(execution.agent, undefined, execution.toolSet)
    // 守卫按 `hasDeferredServers`（B14）：D = ∅ 时"都发现了"，守卫自然放行（每个工具
    // 都在 discovered 里），不需要额外的开关判断。
    if (view.managed.size === 0) return undefined
    const state = stateFor(execution.agent)
    // LRU 的**唯一写入口**（B7）：guard 是"每次调用都经过"的现成钩子——含 PTC 的嵌套派发
    // （已实测走完整管线），所以不需要再加任何订阅。只记录**已发现**的名字：未发现的调用
    // 会被下面拒掉，把被拒的也算"用过"会让一次性试探永久占住热点位。
    discovery.touch(execution.agent, execution.name)
    return guardDecision(execution.name, { managed: view.managed, discovered: state.discovered }, resolved)
  }))

 // 引导 section（静态：是什么/怎么用）。活的库存目录按组装推送（每个 agent 的可见集不同）。
  // 服务访问走 ctx.get 而非属性：cordis 对未注入服务的属性访问直接抛错，而 system-prompt
  // 不属于本插件的硬依赖（缺它时只损失静态引导段，目录 section 与过滤照常）。
  const systemPrompt = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined
  const disposeSection = typeof systemPrompt?.section === 'function'
    ? acquire(() => systemPrompt.section(promptSection(GUIDANCE_SECTION_NAME,
      // 这段只许说**只有它能说**的三件事：① 存在延迟工具（工具描述说不出来，因为工具描述
      // 只描述自己）；② 遇到就调搜索；③ 搜之前不许断言"没有这个能力"。"返回完整 schema"
      // "按准确名字调用"这些工具描述与命中回执已经承担了，这里再说一遍就是每请求白烧 token。
      `Some tools are deferred: only their names are listed, without descriptions or parameter schemas. When one fits the task, call ${resolved.toolName} with a capability query, then call the returned tool by its exact name. Do not claim a capability is unavailable before searching.`,
      GUIDANCE_SECTION_ORDER)))
    : undefined

  /**
   * 同一次组装捕获的**一致快照**：策略视图 + 发现集 + 呈现模式 + 该步准入。
   *
   * 声明、目录、SDK 三处只读这一份——各自重算会读到不同版本的事实（例如策略在两次读之间
   * 被用户改了），那会让"目录说藏了、声明却没藏"，正是本功能最不该出现的自相矛盾。
   * `context.scope` 与 `context.agent` 在真实宿主里标识同一个 agent；SDK 取数用 scope 作参，
   * 与宿主渲染手册时同参——逐字节自检要求两侧同参。
   */
  const snapshotFor = (agent, toolSet, assemblyTools, scope) => {
    const { mode, view } = viewFor(agent, assemblyTools, toolSet)
    return { agent, scope: scope ?? agent, toolSet, mode, view, state: stateFor(agent), config: resolved }
  }

  const presentationHandlers = {
    catalogText: (snapshot, deferred, sections) => catalogTextFor(
      snapshot.agent, snapshot.view, snapshot.state, deferred, sections,
    ),
    // 手册只在 ptc 下裁（presentAssembly 已判过模式）；任何异常都沿用宿主原文——
    // 少裁一次是净亏，发一份错的手册是错误行为。
    trimSdk: async (snapshot, deferred, sections) => {
      try {
        return await trimSdkSections(snapshot.agent, snapshot.scope, snapshot.view, deferred, sections, snapshot.toolSet)
      } catch (error) {
        warnOnce(ctx, 'trim threw', `裁 ${SDK_SECTION_NAME} 时抛错，沿用宿主原文：${error?.message ?? error}`)
        return sections
      }
    },
  }

  /** 呈现端口的唯一入口：两代宿主都走这里（接入点差异在 adapter 里）。 */
  const present = async (assembly, context) => {
    const agent = context?.agent
    if (agent === undefined) return assembly
    const snapshot = snapshotFor(agent, context?.toolSet, assembly?.tools, context?.scope)
    return presentAssembly(assembly, snapshot, presentationHandlers, {
      guidanceSection: GUIDANCE_SECTION_NAME,
      catalogSection: CATALOG_SECTION_NAME,
      onDiagnostic: noteDiagnostic,
    })
  }

  // 代次差异只在这一行：rc.5 走 waterfall，rc.1 走 assemble 装饰（并支持 HMR 重绑）。
  // 不在 acquire 里包：端口自己负责"失败不留下装饰"，这里只要拿到 disposer 就登记。
  const presentationPort = installPresentationPort(ctx, ctx.tools, present, {
    onDiagnostic: noteDiagnostic,
    generation: presentationGeneration,
  })
  track(presentationPort.dispose)
  if (presentationGeneration === 'modern') {
    warnOnce(ctx, 'modernPresentationBridge',
      'host 0.2.2+: presenting through a documented compatibility bridge (systemPrompt.assemble decorator) — '
      + 'not an upstream hook; it is restored on unload and never overwrites a later third-party replacement')
  }

  /**
   * 能力状态：面板与 RPC 读这一份，而不是"supported: true"一个布尔。
   * 每一项都分开报（声明 / PTC 手册 / 签名 / 恢复），并且**只在真的成立时**写 ready。
   */
  const capabilities = () => {
    const portStatus = presentationPort.status()
    const runtime = typeof ctx.get === 'function' ? ctx.get('ptcRuntime') : undefined
    return {
      generation: presentationGeneration,
      generationReason: hostGeneration.reason,
      generationAssumed: assumedGeneration,
      toolName: resolved.toolName,
      presentation: {
        state: portStatus.attached ? 'ready' : 'failed',
        kind: portStatus.kind,
        foreign: portStatus.foreign === true,
      },
      nativeDeclaration: {
        state: portStatus.attached ? 'ready' : 'failed',
        reason: portStatus.attached ? undefined : 'the presentation port is not attached to the host assembly',
      },
      ptcSdk: {
        state: runtime === undefined
          ? 'unsupported'
          : (rendererStatus.state === 'ready' ? (resolved.requireDiscovery ? 'ready' : 'disabled') : rendererStatus.state),
        reason: runtime === undefined ? 'ctx.ptcRuntime is absent: this deployment has no PTC sessions' : rendererStatus.reason,
      },
      signatures: {
        state: typeof runtime?.language === 'string' ? 'ready' : 'unsupported',
        reason: typeof runtime?.language === 'string' ? undefined : 'the PTC runtime does not expose a program language',
      },
      restore: restoreStatus(),
      diagnostics: [...diagnostics],
    }
  }

  /**
   * 恢复能力：投影可用时按它的真实就绪状态报，不可用就降级（native 还能从派生消息恢复，
   * PTC 不能）。绝不把"有目录但恢复不了"写成 ready。
   */
  function restoreStatus() {
    if (!projectionPort.available) {
      return {
        state: 'degraded',
        reason: 'ctx.sessionProjections is absent: native discoveries may still be restored from session messages, PTC discoveries cannot',
      }
    }
    const status = projectionPort.status()
    if (status.state === 'ready') return { state: 'ready', legacy: status.legacy === true }
    if (projectionReadyState?.state === 'failed') return { state: 'failed', reason: projectionReadyState.reason }
    return { state: 'pending', reason: 'the projection handle is not ready yet' }
  }

  return Object.assign(cleanup, { status: capabilities, generation: presentationGeneration })
}


