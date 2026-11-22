import { parseDocument, Scalar, YAMLMap, YAMLSeq, isMap, isSeq } from 'yaml'
import { isSafeExpression, makeEnvExpression, makeExpression } from './env-expression.js'
import { MCP_CATALOG, CATEGORY_ORDER, CATEGORY_LABELS, MCP_COPY_FIELDS, catalogById } from './mcp-catalog.js'
import { hasOwn, setOwn } from './own-property.js'
import { JS_TAG, getNode, getValue, nodeValue, scalarValue } from './yaml-node.js'

export const MCP_PLUGIN_NAME = '@deepseek-ai/dsh-mcp-client'
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const MAX_TIMER_DELAY_MS = 2147483647
// 面板表单拥有并投影给 mcp-client 的字段面。export 出来给 RPC 层构造"同步回内存 entry 的
// config"用——那里必须用**同一份**字段清单，另抄一份迟早和这里漂移（加了字段忘了改第二处，
// 于是内存 config 缺字段、热加载后行为与 patch 不一致）。
export const MANAGED_CONFIG_FIELDS = ['transport', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'toolCallTimeoutMs', 'failOnStartupError', 'reconnect']
// 插件自有的**全局**字段：ToolSearch 延迟加载开关。与 MANAGED_CONFIG_FIELDS 分开记账——
// 后者是"面板表单拥有并投影给 mcp-client 的字段面"，前者由本插件自己消费
// （tool-search-config.deferServersOf 读 loader 条目原值）。mcp-client 对未知键是
// 非严格 merge（schemastery object resolver：`if (!strict) merge(result, data)`），
// 原样透传不抛错，所以放在 patch 里安全。idleTimeoutMs/readyTimeoutMs 是项目级自有字段，
// 不走这里（项目配置由 workspace-config 往返）。
// export 的理由同 MANAGED_CONFIG_FIELDS：RPC 层构造"同步回内存 entry 的 config"时要用同一份清单。
export const PLUGIN_OWN_CONFIG_FIELDS = ['defer']
// 分类取值域与标签都来自生成的目录文件：那里是唯一真相源，顺序由生成器的 CATEGORY_ORDER
// 决定（生成器会按它重排 MCP_CATALOG，面板的 chips 因此取到的首次出现序就是它）。
// 再抄一份到这里就会漂移（加了分类忘了改第二处，市场的 chips 会缺一个分组）。
export const MCP_CATEGORIES = CATEGORY_ORDER
export const MCP_CATEGORY_LABELS = CATEGORY_LABELS
const INTERPOLATION = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-(.*?))?\}/g
const UNSUPPORTED_TEMPLATE = '不支持的变量表达式（只允许 ${VAR}、${VAR:-fallback} 与 ${env:VAR}）'

// 内置目录 = 市场目录的投影。以前这里是硬编码的 5 条，现在是 `lib/mcp-catalog.js`
// 的派生视图：目录加一条，内置清单与身份识别表同时跟上，不需要在两处各改一遍。
//
// `name`（写进配置的 serverName）取 id，是刻意的：id 一旦发布就不能改，而 serverName
// 决定工具名 `mcp__<serverName>__<tool>`，让两者同源就不会出现「目录改名导致老配置变孤儿」。
export const BUILTIN_MCP_SERVERS = MCP_CATALOG.map((entry) => {
  const server = {
    id: entry.id,
    label: entry.label,
    summary: entry.summary,
    access: entry.access,
    name: entry.id,
    transport: entry.transport,
  }
  // 文案字段（label/summary/access/vendor/categoryLabel 及各自 *En，见 build-catalog.mjs）：
  // 只跟着搬运，不参与任何判定——装/卸/识别身份都只看 id 与 endpoint，多带不影响它们。
  // 字段表由生成器随产物导出（MCP_COPY_FIELDS）：加一个可译字段只改生成器一处。
  // 漏搬的后果是字段被静默丢掉、英文界面漏出中文——jsdom 测不出来，真机才看得见，
  // 所以「builtin catalog carries every field the market UI reads」那条用例钉着它。
  for (const field of MCP_COPY_FIELDS) {
    for (const suffix of ['', 'En']) {
      const key = field + suffix
      if (entry[key] !== undefined) server[key] = entry[key]
    }
  }
  // 占位符提示（含英文）：args 派生的**显示**文案（「装完先改这里」），同样随语言切换。
  for (const key of ['placeholders', 'placeholdersEn']) {
    if (entry[key] !== undefined) server[key] = structuredClone(entry[key])
  }
  for (const field of ['url', 'headers', 'command', 'args']) {
    if (entry[field] !== undefined) server[field] = structuredClone(entry[field])
  }
  return server
})

/**
 * 「这个已配置的 server 是不是目录里的某一条」——按 endpoint / 包名认，不只看名字。
 *
 * 从目录派生而不是手工维护：以前这张表只有 5 条、和上面的硬编码清单两处同步，加一条就得
 * 记得改两个地方。现在 hosts 取自 url、packages 取自目录的 `packages`（stdio 型可从 args
 * 推导），新增条目自动生效。
 *
 * 为什么需要它：用户可能把 Exa 配成了 `my-exa`。安装时靠它识别「已经装过」而跳过，
 * 而不是再插入一条重复的。
 */
const BUILTIN_MCP_IDENTITIES = Object.fromEntries(MCP_CATALOG.map((entry) => {
  const hosts = []
  if (typeof entry.url === 'string') {
    try {
      hosts.push(new URL(entry.url).hostname.toLowerCase())
    } catch { /* url 不是合法 URL 时没有可认领的 host，交给 packages 兜底 */ }
  }
  // 包名优先取目录里显式写的（HTTP 型也可能有对应的本地 npx 包，那层知识推不出来），
  // 没有才从 args 推导：只认非开关的参数，`-y`、`--flag` 这类不是包名。
  const packages = entry.packages ?? (entry.args || []).filter((arg) => typeof arg === 'string'
    && !arg.startsWith('-')
    && /^[@a-z0-9]/i.test(arg))
  return [entry.id, { hosts, packages }]
}))

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// 按名建映射与判存在走 lib/own-property.js 的同一份原语（原来这里、index.js、
// mcp-import-sources.js 各有一份定义）。YAML 节点的读取（scalarValue / nodeValue /
// getNode / getValue / JS_TAG）住在 lib/yaml-node.js——同一个 patch 文件现在有两个消费者
// （MCP 条目与插件自身配置），读法必须只有一份。

/**
 * `!!js \`…\`` 这一历史写法 → 受限表达式。`${process.env.X}` 是它唯一的变量语法；
 * 转出时一律走 `makeExpression`，因此产出的一定是「总值」表达式。
 */
function normalizeLegacyTemplate(value) {
  const legacy = /^!!js `([^`\\]*)`$/.exec(value)
  if (!legacy) return null
  const body = legacy[1]
  const pattern = /\$\{process\.env\.([A-Za-z_][A-Za-z0-9_]*)\}/g
  const tokens = []
  let cursor = 0
  let match
  let hasReference = false
  while ((match = pattern.exec(body))) {
    const literal = body.slice(cursor, match.index)
    if (literal.includes('${')) return null
    if (literal) tokens.push({ kind: 'literal', text: literal })
    tokens.push({ kind: 'env', name: match[1] })
    hasReference = true
    cursor = match.index + match[0].length
  }
  const tail = body.slice(cursor)
  if (!hasReference || tail.includes('${')) return null
  if (tail) tokens.push({ kind: 'literal', text: tail })
  return makeExpression(tokens)
}

function expressionValue(value) {
  if (typeof value !== 'string') return value
  if (value.startsWith('!!js ')) {
    if (isSafeExpression(value)) return value
    const normalized = normalizeLegacyTemplate(value)
    if (normalized) return normalized
    throw new Error('!!js 只允许受限的 process.env.NAME 环境变量表达式')
  }
  const reserved = /\$\{(?:workspaceFolder(?:Basename)?|userHome|pathSeparator|\/)\}/.exec(value)
  if (reserved) throw new Error(`${reserved[0]} 是其他客户端变量，DSH 不支持安全转换`)
  const exact = /^\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-(.*))?\}$/.exec(value)
  // 一律走 makeEnvExpression：它**总会**补上 `?? ""`（理由见 env-expression.js）。变量缺失
  // 只该让这一处退化成空字符串——服务器自己连不上、面板里看得见——而不能把宿主一起拖下水。
  if (exact) return makeEnvExpression(exact[1], exact[2])

  const tokens = []
  let cursor = 0
  let match
  INTERPOLATION.lastIndex = 0
  while ((match = INTERPOLATION.exec(value))) {
    const literal = value.slice(cursor, match.index)
    // 不回显出错片段：这段文本来自用户配置（含密钥），错误信息会被送进浏览器。
    if (literal.includes('${')) throw new Error(UNSUPPORTED_TEMPLATE)
    if (literal) tokens.push({ kind: 'literal', text: literal })
    tokens.push(match[2] === undefined ? { kind: 'env', name: match[1] } : { kind: 'fallback', name: match[1], fallback: match[2] })
    cursor = match.index + match[0].length
  }
  INTERPOLATION.lastIndex = 0
  const tail = value.slice(cursor)
  if (tail.includes('${')) throw new Error(UNSUPPORTED_TEMPLATE)
  if (!tokens.length) return value
  if (tail) tokens.push({ kind: 'literal', text: tail })
  return makeExpression(tokens)
}

function normalizeMap(value, field, warnings, serverName) {
  if (value === undefined) return undefined
  if (!isObject(value)) throw new Error(`${serverName}.${field} 必须是对象`)
  const result = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') setOwn(result, key, expressionValue(raw))
    else if (raw === null) {
      setOwn(result, key, '')
      warnings.push(`${serverName}.${field}.${key} 不是字符串，已转换为空字符串`)
    } else {
      setOwn(result, key, expressionValue(String(raw)))
      warnings.push(`${serverName}.${field}.${key} 不是字符串，已转换为字符串`)
    }
  }
  return result
}

function normalizeArgs(value, serverName, warnings) {
  if (value === undefined) return undefined
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === 'string')) throw new Error(`${serverName}.args 必须全部是字符串`)
    return value.map(expressionValue)
  }
  if (typeof value === 'string') {
    warnings.push(`${serverName}.args 是字符串，已作为一个完整参数保留；DSH 不会按 shell 规则拆分`)
    return [value]
  }
  throw new Error(`${serverName}.args 必须是字符串数组`)
}

function warnUnsupported(raw, serverName, warnings) {
  const fatal = ['envFile', 'oauth', 'headersHelper']
  for (const field of fatal) if (hasOwn(raw, field)) throw new Error(`${serverName}.${field} 在 DSH MCP 配置中不支持，无法安全转换`)
  const clientOnly = ['alwaysAllow', 'autoApprove', 'disabledTools', 'sandbox', 'sandboxEnabled', 'dev']
  for (const field of clientOnly) if (hasOwn(raw, field)) warnings.push(`${serverName}.${field} 是其他客户端字段，DSH 不会保存或执行`)
  if (hasOwn(raw, 'directTools')) {
    if (hasOwn(raw, 'disabled')) warnings.push(`${serverName}.directTools 已忽略；显式 disabled 优先`)
    else if (raw.directTools === true) warnings.push(`${serverName}.directTools: true 已转换为 disabled: false（DSH 始终直接注册 MCP 工具）`)
    else if (raw.directTools === false) warnings.push(`${serverName}.directTools: false 已转换为 disabled: true（DSH 不支持间接工具模式）`)
    else warnings.push(`${serverName}.directTools 不是布尔值，已忽略`)
  }
  if (hasOwn(raw, 'timeout') && !hasOwn(raw, 'toolCallTimeoutMs')) warnings.push(`${serverName}.timeout 的单位因客户端而异，未自动转换；如需设置请使用 toolCallTimeoutMs`)
  // known 集合从两份字段常量**派生**（managed + 插件自有），不手抄：曾经这里把 10 个
  // managed 字段连字符串一个个列出来，与 MANAGED_CONFIG_FIELDS 是两份真相源——常量加了
  // 字段而这里忘了跟，用户导入时就会平白多一条"不是 DSH MCP 字段，已忽略"的假警告。
  const known = new Set([
    'serverName', 'name', 'type', 'serverUrl', 'server_url',
    'idleTimeoutMs', 'readyTimeoutMs', 'disabled', 'timeout', 'directTools',
    ...MANAGED_CONFIG_FIELDS, ...PLUGIN_OWN_CONFIG_FIELDS, ...fatal, ...clientOnly,
  ])
  for (const field of Object.keys(raw)) if (!known.has(field)) warnings.push(`${serverName}.${field} 不是 DSH MCP 字段，已忽略`)
}

function normalizeEntry(name, input, warnings) {
  if (!isObject(input)) throw new Error(`${name} 必须是对象`)
  const raw = isObject(input.transport) ? { ...input, ...input.transport } : input
  const serverName = String(raw.serverName || raw.name || name).trim()
  if (!SERVER_NAME_PATTERN.test(serverName)) throw new Error(`${serverName || name} 不符合 DSH serverName 格式：[A-Za-z0-9_-]{1,32}`)
  warnUnsupported(raw, serverName, warnings)
  const hasCommand = typeof raw.command === 'string' && raw.command.trim() !== ''
  const url = raw.url ?? raw.serverUrl ?? raw.server_url
  const hasUrl = typeof url === 'string' && url.trim() !== ''
  if (hasCommand && hasUrl) throw new Error(`${serverName} 同时包含 command 和 url，无法判断传输方式`)
  let transport = raw.type ?? (typeof raw.transport === 'string' ? raw.transport : undefined)
  if (!transport) transport = hasCommand ? 'stdio' : hasUrl ? 'streamable-http' : undefined
  const aliases = { http: 'streamable-http', streamableHttp: 'streamable-http', 'streamable-http': 'streamable-http', stdio: 'stdio', sse: 'sse', ws: 'ws', websocket: 'ws' }
  transport = aliases[transport] || transport
  if (transport === 'sse' || transport === 'ws') throw new Error(`${serverName} 的传输 ${transport} 不受当前 DSH MCP 配置支持；请先转换成 Streamable HTTP`)
  if (transport !== 'stdio' && transport !== 'streamable-http') throw new Error(`${serverName} 缺少可识别的 stdio 或 HTTP 传输类型`)

  const result = { name: serverName, transport }
  if (transport === 'stdio') {
    if (!hasCommand) throw new Error(`${serverName} 的 stdio 配置缺少 command`)
    result.command = expressionValue(raw.command.trim())
    const args = normalizeArgs(raw.args, serverName, warnings)
    if (args?.length) result.args = args
    const env = normalizeMap(raw.env, 'env', warnings, serverName)
    if (env && Object.keys(env).length) result.env = env
    if (raw.cwd !== undefined) {
      if (typeof raw.cwd !== 'string') throw new Error(`${serverName}.cwd 必须是字符串`)
      if (raw.cwd) result.cwd = expressionValue(raw.cwd)
    }
  } else {
    const normalizedUrl = hasUrl ? expressionValue(url.trim()) : ''
    if (!hasUrl) throw new Error(`${serverName} 的 HTTP 配置需要 http(s):// URL`)
    if (!normalizedUrl.startsWith('!!js ')) {
      let parsedUrl
      try {
        parsedUrl = new URL(normalizedUrl)
      } catch {
        throw new Error(`${serverName} 的 HTTP 配置需要有效的 http(s):// URL`)
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) throw new Error(`${serverName} 的 HTTP 配置需要有效的 http(s):// URL`)
    }
    result.url = normalizedUrl
    const headers = normalizeMap(raw.headers, 'headers', warnings, serverName)
    if (headers && Object.keys(headers).length) result.headers = headers
  }
  if (raw.toolCallTimeoutMs !== undefined) {
    if (!Number.isSafeInteger(raw.toolCallTimeoutMs) || raw.toolCallTimeoutMs < 1) throw new Error(`${serverName}.toolCallTimeoutMs 必须是正整数`)
    result.toolCallTimeoutMs = raw.toolCallTimeoutMs
  }
  if (raw.failOnStartupError !== undefined) {
    if (typeof raw.failOnStartupError !== 'boolean') throw new Error(`${serverName}.failOnStartupError 必须是布尔值`)
    result.failOnStartupError = raw.failOnStartupError
  }
  // 工具延迟加载开关（插件自有字段，不下发给 mcp-client）：true = 该服务器的工具走
  // ToolSearch 按需加载而非全量常驻（docs/mcp-tool-search-design.md）。与 idleTimeoutMs
  // 同样属于"配置面但不是 mcp-client 字段"，因此不进 MANAGED_CONFIG_FIELDS。
  if (raw.defer !== undefined) {
    if (typeof raw.defer !== 'boolean') throw new Error(`${serverName}.defer 必须是布尔值`)
    result.defer = raw.defer
  }
  if (raw.reconnect !== undefined) {
    if (!isObject(raw.reconnect)) throw new Error(`${serverName}.reconnect 必须是对象`)
    const reconnect = {}
    const reconnectFields = ['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts']
    for (const key of reconnectFields) if (raw.reconnect[key] !== undefined) reconnect[key] = raw.reconnect[key]
    for (const key of Object.keys(raw.reconnect)) if (!reconnectFields.includes(key)) warnings.push(`${serverName}.reconnect.${key} 不是 DSH MCP 字段，已忽略`)
    for (const key of ['initialDelayMs', 'maxDelayMs']) {
      if (reconnect[key] !== undefined && (!Number.isFinite(reconnect[key]) || reconnect[key] <= 0)) throw new Error(`${serverName}.reconnect.${key} 必须是正数`)
      if (reconnect[key] !== undefined && reconnect[key] > MAX_TIMER_DELAY_MS) throw new Error(`${serverName}.reconnect.${key} 不能大于 ${MAX_TIMER_DELAY_MS}`)
    }
    if (reconnect.maxAttempts !== undefined && (!Number.isSafeInteger(reconnect.maxAttempts) || reconnect.maxAttempts < 1)) {
      throw new Error(`${serverName}.reconnect.maxAttempts 必须是正整数`)
    }
    if (reconnect.initialDelayMs !== undefined && reconnect.maxDelayMs !== undefined && reconnect.initialDelayMs > reconnect.maxDelayMs) {
      throw new Error(`${serverName}.reconnect.initialDelayMs 不能大于 maxDelayMs`)
    }
    if (reconnect.enabled !== undefined && typeof reconnect.enabled !== 'boolean') throw new Error(`${serverName}.reconnect.enabled 必须是布尔值`)
    result.reconnect = reconnect
  }
  if (raw.disabled !== undefined) {
    if (typeof raw.disabled !== 'boolean') throw new Error(`${serverName}.disabled 必须是布尔值`)
    result.disabled = raw.disabled
  } else if (raw.directTools === true) result.disabled = false
  else if (raw.directTools === false) result.disabled = true
  // 项目级连接的**空闲回收**策略（插件自己的字段，不下发给 mcp-client）：会话全部结束不等于
  // 「不再需要」，所以默认保留 5 分钟再回收；0 表示永不自动回收，显式拆除只能来自配置删除/改动、
  // 面板重建或插件卸载。它按 server 生效，属于项目配置面，因此**不**进 MANAGED_CONFIG_FIELDS
  // （那条清单是全局 profile patch 的投影面，写进去等于把它泄漏成全局字段）。
  if (raw.idleTimeoutMs !== undefined) {
    if (!Number.isSafeInteger(raw.idleTimeoutMs) || raw.idleTimeoutMs < 0) throw new Error(`${serverName}.idleTimeoutMs 必须是非负整数（0 = 不回收）`)
    if (raw.idleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`${serverName}.idleTimeoutMs 不能大于 ${MAX_TIMER_DELAY_MS}`)
    result.idleTimeoutMs = raw.idleTimeoutMs
  }
  // 挂载时等待这条连接就绪的**总预算**（毫秒，0 = 不等）。目的只有一个：让「首轮请求里就有工具」
  // 成为确定性结果，而不是一场竞态（mcp-client README 的第一条契约就是 tools appear before the
  // first turn）。超时不算失败：会话照常创建，面板按 fiber 状态如实显示「连接中/连接失败」。
  if (raw.readyTimeoutMs !== undefined) {
    if (!Number.isSafeInteger(raw.readyTimeoutMs) || raw.readyTimeoutMs < 0) throw new Error(`${serverName}.readyTimeoutMs 必须是非负整数（0 = 不等就绪）`)
    if (raw.readyTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`${serverName}.readyTimeoutMs 不能大于 ${MAX_TIMER_DELAY_MS}`)
    result.readyTimeoutMs = raw.readyTimeoutMs
  }
  return result
}

export function normalizeMcpImport(input) {
  if (!isObject(input)) throw new Error('JSON 根节点必须是对象')
  if (Array.isArray(input.inputs) && input.inputs.length) throw new Error('VS Code inputs 需要交互式取值，DSH 当前不支持安全转换')
  if (hasOwn(input, 'mcpServers') && hasOwn(input, 'servers')) throw new Error('JSON 同时包含 mcpServers 和 servers，无法确定应导入哪一组')
  let source = input.mcpServers ?? input.servers
  if (source === undefined && (input.command || input.url || input.serverUrl)) source = { [input.name || input.serverName || 'mcp-server']: input }
  if (!isObject(source)) throw new Error('JSON 中没有找到 mcpServers 或 servers 对象')
  const warnings = []
  const servers = Object.entries(source).map(([name, value]) => normalizeEntry(name, value, warnings))
  return { servers, warnings }
}

/**
 * 归一化之后同名的 serverName（`" a"` 与 `"a"` 会撞成同一个 `a`）。这里只做**检测**，
 * 处理策略留给边界，因为只有边界知道赌注是什么：
 * - 读一份配置文件（`.dsh/mcp.json`）→ 整份拒绝：文件自相矛盾，静默少一条更糟；
 * - 导入一批来源 / 粘贴 → 跳过重复项并逐条提示：不能让一条重名把其余条目挡在门外。
 */
export function duplicateServerNames(servers) {
  const seen = new Set()
  const duplicates = []
  for (const server of servers) {
    if (seen.has(server.name) && !duplicates.includes(server.name)) duplicates.push(server.name)
    seen.add(server.name)
  }
  return duplicates
}

function makeScalar(value) {
  if (typeof value === 'string' && value.startsWith('!!js ')) {
    const scalar = new Scalar(value.slice(5))
    scalar.tag = JS_TAG
    return scalar
  }
  return value
}

function makeNode(doc, value) {
  if (Array.isArray(value)) {
    const seq = new YAMLSeq()
    for (const item of value) seq.items.push(makeNode(doc, item))
    return seq
  }
  if (isObject(value)) {
    const map = new YAMLMap()
    for (const [key, item] of Object.entries(value)) map.set(key, makeNode(doc, item))
    return map
  }
  return makeScalar(value)
}

function entrySpec(entry) {
  const config = getNode(entry, 'config')
  const name = getValue(config, 'serverName')
  if (!isMap(config) || typeof name !== 'string') return null
  const spec = { name, transport: getValue(config, 'transport') }
  // transport 单独取、且排在第一个配置键上：它是**必填判定字段**（没有它连 stdio 与
  // HTTP 都分不出来），读侧形状被下游用例盯着。其余 MANAGED_CONFIG_FIELDS 一律走常量
  // ——这里曾经手抄一份 9 字段清单（比常量少一个 transport），于是"加字段"要记得改两处，
  // 漏改的那一处就是 F2（defer 读不回来）的同一类根因。
  for (const field of MANAGED_CONFIG_FIELDS) {
    if (field === 'transport') continue
    const value = getValue(config, field)
    if (value !== undefined) spec[field] = value
  }
  // 插件自有字段必须读回来。少了这一行，`summarize()` 的 `raw = managed || live` 会落到
  // 没有 defer 的 managed 上，于是**盘上明明是 defer:true、面板详情行与「全部开启延迟」
  // 按钮却都显示关闭**——用户看到的状态与真实状态相反，而 setDeferAll 读的也是这份
  // managed（`state.byName`），一键翻转的方向判断因此建立在丢失的字段上。
  // 写侧（makeEntry / updateEntry）一直在用 PLUGIN_OWN_CONFIG_FIELDS，读侧漏了它。
  for (const field of PLUGIN_OWN_CONFIG_FIELDS) {
    const value = getValue(config, field)
    if (value !== undefined) spec[field] = value
  }
  if (getValue(entry, 'disabled') === true) spec.disabled = true
  return spec
}

function isMcpEntry(entry) {
  return isMap(entry) && getValue(entry, 'name') === MCP_PLUGIN_NAME && entrySpec(entry)
}

function makeEntry(doc, spec, id = `mcp-${spec.name}`) {
  const entry = new YAMLMap()
  entry.set('id', id)
  // 与用户文件里的写法保持一致（`'@deepseek-ai/dsh-mcp-client'`）：不指定引号风格时
  // yaml 会选双引号，新增一行就多一种风格，diff 里看着像改了两处。
  // ⚠️ 这个 yaml 版本的 Scalar 构造函数只接 value，`{ type }` 会被忽略；必须构造后赋 type。
  const name = new Scalar(MCP_PLUGIN_NAME)
  name.type = Scalar.QUOTE_SINGLE
  entry.set('name', name)
  if (spec.disabled) entry.set('disabled', true)
  const config = new YAMLMap()
  config.set('serverName', spec.name)
  for (const field of MANAGED_CONFIG_FIELDS) {
    if (spec[field] !== undefined) config.set(field, makeNode(doc, spec[field]))
  }
  for (const field of PLUGIN_OWN_CONFIG_FIELDS) {
    if (spec[field] !== undefined) config.set(field, makeNode(doc, spec[field]))
  }
  entry.set('config', config)
  return entry
}

function parsePatch(content) {
  const doc = parseDocument(content || '')
  if (doc.errors.length) throw new Error(`MCP patch YAML 无法解析：${doc.errors[0].message}`)
  if (!isSeq(doc.contents)) throw new Error('MCP patch 必须是 YAML 列表')
  return doc
}

function findInsertSeq(item) {
  const insert = getNode(item, 'insert')
  return isSeq(insert) ? insert : null
}

/**
 * 新增条目要落进哪个 insert 序列。
 *
 * 以前新增永远 `items.push(一个新块)`，于是用户在面板里加一台服务器，文件末尾就多一个
 * 顶层 `- insert:`：MCP 段被撕成两段、新条目落在 llm/theme 这些 id 覆盖项之后。功能上
 * loader 认多块，所以它从没表现为故障，只是每次都要人肉把两段拼回去。
 *
 * 规则：**并入第一个已经装着 MCP 条目的 insert 块**；没有这样的块才新建一个。
 * 不去碰「第一个 insert」——那可能是别的插件的块，把 MCP 条目塞进去只是换一种错位。
 */
function findMcpInsertSeq(doc) {
  for (const item of doc.contents.items) {
    const insert = findInsertSeq(item)
    if (insert && insert.items.some((entry) => isMcpEntry(entry))) return insert
  }
  return null
}

export function readManagedMcpServers(content) {
  const doc = parsePatch(content)
  const servers = []
  const entryIds = {}
  const names = new Set()
  for (const item of doc.contents.items) {
    const insert = findInsertSeq(item)
    if (!insert) continue
    for (const entry of insert.items) {
      if (!isMcpEntry(entry)) continue
      const spec = entrySpec(entry)
      if (names.has(spec.name)) throw new Error(`当前 profile 中存在重复 serverName：${spec.name}`)
      names.add(spec.name)
      servers.push(spec)
      const id = getValue(entry, 'id')
      if (typeof id === 'string') setOwn(entryIds, spec.name, id)
    }
  }
  return { servers, entryIds }
}

function collectIds(node, ids = new Set()) {
  if (isMap(node)) {
    const id = getValue(node, 'id')
    if (typeof id === 'string') ids.add(id)
    for (const pair of node.items) collectIds(pair.value, ids)
  } else if (isSeq(node)) {
    for (const item of node.items) collectIds(item, ids)
  }
  return ids
}

function nextEntryId(name, ids) {
  const base = `mcp-${name}`
  let id = base
  let suffix = 2
  while (ids.has(id)) id = `${base}-${suffix++}`
  ids.add(id)
  return id
}

export function setManagedMcpDisabled(content, name, disabled) {
  const doc = parsePatch(content)
  for (const item of doc.contents.items) {
    const insert = findInsertSeq(item)
    if (!insert) continue
    for (const entry of insert.items) {
      const spec = isMcpEntry(entry) ? entrySpec(entry) : null
      if (spec?.name !== name) continue
      if (disabled) entry.set('disabled', true)
      else entry.delete('disabled')
      return doc.toString({ flowCollectionPadding: false })
    }
  }
  throw new Error(`当前 profile 中没有可管理的 MCP：${name}`)
}

function updateEntry(doc, entry, spec) {
  if (Object.hasOwn(spec, 'disabled')) {
    if (spec.disabled) entry.set('disabled', true)
    else entry.delete('disabled')
  }
  const config = getNode(entry, 'config')
  config.set('serverName', spec.name)
  for (const field of MANAGED_CONFIG_FIELDS) {
    if (spec[field] === undefined) config.delete(field)
    else config.set(field, makeNode(doc, spec[field]))
  }
  // 插件自有字段同样参与增删：不删的话"关掉 defer"会在 patch 里留下 true 的残影。
  for (const field of PLUGIN_OWN_CONFIG_FIELDS) {
    if (spec[field] === undefined) config.delete(field)
    else config.set(field, makeNode(doc, spec[field]))
  }
}

export function updateManagedMcpPatch(content, specs, { replace = false, removeNames = [], reservedIds = [] } = {}) {
  const doc = parsePatch(content)
  const specByName = new Map(specs.map((spec) => [spec.name, spec]))
  const remove = new Set(removeNames)
  const updated = new Set()
  for (let index = doc.contents.items.length - 1; index >= 0; index -= 1) {
    const item = doc.contents.items[index]
    const insert = findInsertSeq(item)
    if (!insert) continue
    insert.items = insert.items.filter((entry) => {
      if (!isMcpEntry(entry)) return true
      const name = entrySpec(entry).name
      if (remove.has(name) || (replace && !specByName.has(name))) return false
      const spec = specByName.get(name)
      if (spec && !updated.has(name)) {
        updateEntry(doc, entry, spec)
        updated.add(name)
      }
      return true
    })
    if (insert.items.length === 0 && isMap(item) && item.items.length === 1) doc.contents.items.splice(index, 1)
  }
  const additions = specs.filter((spec) => !updated.has(spec.name))
  if (additions.length) {
    const ids = collectIds(doc.contents, new Set(reservedIds))
    // 有既有的 MCP 块就并进去（见 findMcpInsertSeq），没有才新建。
    const existing = findMcpInsertSeq(doc)
    if (existing) {
      for (const spec of additions) existing.items.push(makeEntry(doc, spec, nextEntryId(spec.name, ids)))
    } else {
      const patch = new YAMLMap()
      const insert = new YAMLSeq()
      for (const spec of additions) insert.items.push(makeEntry(doc, spec, nextEntryId(spec.name, ids)))
      patch.set('insert', insert)
      doc.contents.items.push(patch)
    }
  }
  return doc.toString({ flowCollectionPadding: false })
}

function packageTokenMatches(value, packageName) {
  if (typeof value !== 'string') return false
  return value.split(/\s+/).some((token) => token === packageName || token.startsWith(`${packageName}@`))
}

function matchesBuiltinIdentity(server, builtin) {
  const name = server?.name ?? server?.serverName
  if (name === builtin.name) return true
  const identity = BUILTIN_MCP_IDENTITIES[builtin.id]
  const invocation = [server?.url, server?.command, ...(Array.isArray(server?.args) ? server.args : [])].filter((value) => typeof value === 'string')
  if (identity.hosts?.some((host) => invocation.some((value) => {
    try {
      return new URL(value).hostname.toLowerCase() === host
    } catch {
      return value.includes(`://${host}/`) || value.includes(`://${host}?`)
    }
  }))) return true
  return identity.packages?.some((packageName) => invocation.some((value) => packageTokenMatches(value, packageName))) === true
}

/** 目录条目 → 可落盘的 spec（字段面就是 MANAGED_CONFIG_FIELDS 本身）。
 *  export 出来给 RPC 层的 installWorkspaceBuiltins 用——那里曾经把同一份 10 字段清单
 *  又手抄了一遍（连引号风格都不一样），于是"目录加字段"要记得改两处。 */
export function builtinSpec(builtin) {
  const spec = { name: builtin.name }
  for (const field of MANAGED_CONFIG_FIELDS) {
    if (builtin[field] !== undefined) spec[field] = structuredClone(builtin[field])
  }
  return spec
}

/**
 * 目录 → 面板要的形状。
 *
 * 浏览器那半是预构建 bundle，**拿不到本模块的常量**（不 import Host 侧代码），所以市场的
 * 展示字段（分类、提供方、主页、需要哪些密钥）必须随这次 RPC 一起过去。少带一个字段的
 * 后果是面板侧只能显示 undefined，而那是 jsdom 看不出来的。
 *
 * @param {ReadonlyArray<object>} effectiveServers - 当前生效的 MCP 配置（用来判「已配置」）。
 * @returns {object[]} 面板用的目录条目。
 */
export function builtinMcpCatalog(effectiveServers) {
  return BUILTIN_MCP_SERVERS.map((builtin) => {
    const matches = effectiveServers.filter((server) => matchesBuiltinIdentity(server, builtin))
    const installedAs = [...new Set(matches.map((server) => server?.name ?? server?.serverName).filter(Boolean))]
    const source = catalogById().get(builtin.id) || {}
    return {
      id: builtin.id,
      label: builtin.label,
      summary: builtin.summary,
      access: builtin.access,
      name: builtin.name,
      transport: builtin.transport,
      configuration: builtinSpec(builtin),
      installed: installedAs.length > 0,
      installedAs,
      // —— 市场展示字段（bundle 侧读不到常量，只能这里带过去）——
      category: source.category,
      // 分类标签随目录条目来（生成器维护的中文标签 + categoryLabelEn），
      // 不再在这里查表——查表等于给同一份标签留第二个真相源。
      categoryLabel: source.categoryLabel,
      vendor: source.vendor,
      // 英文文案（可选）：带过去供面板按界面语言挑选，见 lib/client.js 的 pickCatalogText。
      // 缺席时不写这个键——面板的判据是「有没有」，空串会让它以为有英文而显示一句空话。
      // 字段表与上面 BUILTIN_MCP_SERVERS 的搬运共用一份（MCP_COPY_FIELDS）。
      ...Object.fromEntries(
        MCP_COPY_FIELDS.filter((field) => builtin[`${field}En`])
          .map((field) => [`${field}En`, builtin[`${field}En`]]),
      ),
      homepage: source.homepage,
      envKeys: source.envKeys || [],
      // 连接参数（HOST/PORT/USER）与凭据分开：市场对前者显示「需填连接信息」而不是
      // 「需密钥」——Redis / ClickHouse 是本机服务，说成要申请 Key 是误导。
      configKeys: source.configKeys || [],
      // 含 `<占位符>` 的条目（如 filesystem 的 `<允许访问的目录>`）装完**不能直接用**：
      // 拿占位符当真实参数启动会失败。市场要据此提示用户先编辑，而不是显示「安装成功」。
      // placeholdersEn 是同一批占位符的英文提示（英文副本的 args 派生）。
      placeholders: source.placeholders || [],
      ...(source.placeholdersEn ? { placeholdersEn: source.placeholdersEn } : {}),
    }
  })
}

function selectedBuiltins(ids) {
  if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'string')) {
    throw new Error('内置 MCP ids 必须是非空字符串数组')
  }
  const selectedIds = new Set(ids)
  const knownIds = new Set(BUILTIN_MCP_SERVERS.map((builtin) => builtin.id))
  const unknown = [...selectedIds].filter((id) => !knownIds.has(id))
  if (unknown.length) throw new Error(`未知的内置 MCP：${unknown.join(', ')}`)
  return BUILTIN_MCP_SERVERS.filter((builtin) => selectedIds.has(builtin.id))
}

export function appendSelectedBuiltinMcpServers(content, effectiveServers, ids, { reservedIds = [] } = {}) {
  const selected = selectedBuiltins(ids)
  const skipped = selected.filter((builtin) => effectiveServers.some((server) => matchesBuiltinIdentity(server, builtin)))
  const skippedIds = new Set(skipped.map((builtin) => builtin.id))
  const additions = selected.filter((builtin) => !skippedIds.has(builtin.id))
  const updated = additions.length
    ? updateManagedMcpPatch(content, additions.map(builtinSpec), { replace: false, reservedIds })
    : content

  return {
    content: updated,
    added: additions.map((builtin) => builtin.id),
    skipped: skipped.map((builtin) => builtin.id),
  }
}
