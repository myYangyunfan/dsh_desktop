import { dirname, join } from 'node:path'
import { evaluateExpression, toTemplate } from './env-expression.js'
import { duplicateServerNames, normalizeMcpImport } from './mcp-config.js'
import { setOwn } from './own-property.js'
import { normalizePolicyConfig } from './tool-loading-policy.js'

/**
 * 项目级 MCP 配置文件（<workspace>/.dsh/mcp.json）的读写。
 *
 * 文件格式与 Claude/Codex 生态兼容（mcpServers 映射），额外支持顶层
 * `exclude` 数组表示“本项目屏蔽的全局 serverName”：
 *
 *   {
 *     "mcpServers": {
 *       "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] },
 *       "unity-mcp": { "type": "http", "url": "http://localhost:8090/" }
 *     },
 *     "exclude": ["github"]
 *   }
 *
 * 环境变量在内部 spec 里以 `!!js process.env.X` 表达式承载（与 profile patch
 * 一致），写回 JSON 时反转为 `${VAR}` 模板，保证文件可被其他工具复用，且
 * 读回时经 normalizeMcpImport 可逆。
 */

export const WORKSPACE_CONFIG_REL = ['.dsh', 'mcp.json']

// `!!js` 语法只在 env-expression.js 里实现（生成/校验/抽取/反转/求值同源）。
// 这两个名字保留下来，是因为项目层的调用点与既有测试都按它们命名。
export const jsExpressionToTemplate = toTemplate
export const evaluateEnvExpression = evaluateExpression

// 用 setOwn 而不是普通赋值：键来自配置（用户可控），`__proto__` 这类键在普通赋值下会走
// 原型 setter，条目静默消失——写的人以为写成功，文件里却没有它。
function mapValues(value, fn) {
  const result = {}
  for (const [key, item] of Object.entries(value)) setOwn(result, key, fn(item))
  return result
}

/**
 * 项目内部 spec → 官方 @deepseek-ai/dsh-mcp-client 插件配置。
 * 环境变量表达式先求值为实际值（cwd 缺省为 workspace 根）。
 */
export function toMcpClientConfig(server, wsPath, env = process.env) {
  const config = {
    serverName: server.name,
    transport: server.transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: server.failOnStartupError,
  }
  if (server.reconnect !== undefined) config.reconnect = structuredClone(server.reconnect)
  if (server.transport === 'stdio') {
    config.command = evaluateEnvExpression(server.command, env)
    if (!config.command) throw new Error(`项目 MCP ${server.name} 的 command 求值为空，请检查环境变量`)
    if (Array.isArray(server.args) && server.args.length) config.args = server.args.map((value) => evaluateEnvExpression(value, env))
    if (server.env && Object.keys(server.env).length) {
      config.env = Object.fromEntries(Object.entries(server.env).map(([key, value]) => [key, evaluateEnvExpression(value, env)]))
    }
    config.cwd = evaluateEnvExpression(server.cwd || '', env) || wsPath
  } else {
    config.url = evaluateEnvExpression(server.url, env)
    if (!config.url) throw new Error(`项目 MCP ${server.name} 的 url 求值为空，请检查环境变量`)
    if (server.headers && Object.keys(server.headers).length) {
      config.headers = Object.fromEntries(Object.entries(server.headers).map(([key, value]) => [key, evaluateEnvExpression(value, env)]))
    }
  }
  return config
}

/**
 * 内部 spec（含 !!js 表达式）→ Claude/Codex 风格 mcpServers 条目（JSON 可写）。
 * HTTP 用 `type: "http"` 显式标注，stdio 由 command 推断；两向均与
 * normalizeMcpImport 兼容。
 */
export function specToMcpEntry(spec) {
  const entry = {}
  if (spec.transport === 'stdio') {
    entry.command = jsExpressionToTemplate(spec.command)
    if (Array.isArray(spec.args) && spec.args.length) entry.args = spec.args.map(jsExpressionToTemplate)
    if (spec.env && Object.keys(spec.env).length) entry.env = mapValues(spec.env, jsExpressionToTemplate)
    if (spec.cwd) entry.cwd = jsExpressionToTemplate(spec.cwd)
  } else {
    entry.type = 'http'
    entry.url = jsExpressionToTemplate(spec.url)
    if (spec.headers && Object.keys(spec.headers).length) entry.headers = mapValues(spec.headers, jsExpressionToTemplate)
  }
  if (spec.toolCallTimeoutMs !== undefined) entry.toolCallTimeoutMs = spec.toolCallTimeoutMs
  if (spec.failOnStartupError !== undefined) entry.failOnStartupError = spec.failOnStartupError
  if (spec.reconnect !== undefined) entry.reconnect = structuredClone(spec.reconnect)
  // 插件自己的项目级字段：必须在这里往返，否则面板每次保存都会把它悄悄丢掉。
  if (spec.idleTimeoutMs !== undefined) entry.idleTimeoutMs = spec.idleTimeoutMs
  if (spec.readyTimeoutMs !== undefined) entry.readyTimeoutMs = spec.readyTimeoutMs
  // 工具延迟加载开关（插件自有，同 idleTimeoutMs 待遇）：项目级服务器也能 per-server 延迟。
  if (spec.defer !== undefined) entry.defer = spec.defer
  if (spec.disabled !== undefined) entry.disabled = spec.disabled
  return entry
}

function configPath(cwd) {
  return join(cwd, ...WORKSPACE_CONFIG_REL)
}

/**
 * 读取项目配置并 normalize 为内部 spec 列表。
 * 文件缺失返回空配置；JSON 非法/条目不合法时返回 error（保留最后有效配置由调用方决定）。
 */
export async function readWorkspaceConfig(cwd, readFileFn) {
  const path = configPath(cwd)
  let text
  try {
    text = await readFileFn(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return { servers: [], exclude: [], error: '', missing: true }
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { servers: [], exclude: [], error: `${WORKSPACE_CONFIG_REL.join('/')} 不是合法 JSON：${error?.message ?? error}` }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { servers: [], exclude: [], error: `${WORKSPACE_CONFIG_REL.join('/')} 根节点必须是 JSON 对象` }
  }
  const exclude = Array.isArray(parsed.exclude) ? parsed.exclude.filter((value) => typeof value === 'string') : []
  // 项目级工具加载策略（本插件自有，与 `exclude` 同一种"插件扩展键"的做法）。
  // 读侧宽容：手改坏了按"没配"处理，不让面板整页打不开；写侧严格（validatePolicyConfig）。
  const toolLoading = normalizePolicyConfig(parsed.toolLoading)
  try {
    const normalized = normalizeMcpImport({ mcpServers: parsed.mcpServers })
    // 文件是"一整份配置"：里面出现归一化后同名的条目就是自相矛盾，整份拒绝比静默少一条好。
    // （导入一批来源/粘贴的取舍不同：那里跳过重复项即可，不能让一条重名挡住其余条目。）
    const duplicates = duplicateServerNames(normalized.servers)
    if (duplicates.length) {
      return { servers: [], exclude, error: `${WORKSPACE_CONFIG_REL.join('/')} 里有归一化后同名的条目（${duplicates.join('、')}）：同一作用域内 serverName 只能有一条`, path }
    }
    return { servers: normalized.servers, exclude, toolLoading, error: '', warnings: normalized.warnings, path, raw: parsed }
  } catch (error) {
    return { servers: [], exclude, toolLoading, error: `${WORKSPACE_CONFIG_REL.join('/')} 配置无效：${error?.message ?? error}`, path }
  }
}

/**
 * 写入项目配置。servers 为内部 spec 列表；exclude 为全局 serverName 列表。
 *
 * **读改写，不重建**：`previous` 是读进来的整份原文（含本插件不认识的顶层键）。
 * 旧实现只按 `{mcpServers, exclude, toolLoading}` 重新拼一份文档，于是用户在同一个文件里
 * 写的任何扩展键（其它工具/编辑器的字段）会在一次"保存"之后凭空消失——那不是本插件的财产。
 *
 * @param {string} cwd
 * @param {{servers: object[], exclude?: string[], toolLoading?: object|null, previous?: object}} input
 *   `toolLoading === null` 表示显式删掉该键；`undefined` 表示这次不改它。
 */
export async function writeWorkspaceConfig(cwd, { servers, exclude, toolLoading, previous }, writeFileFn, mkdirFn) {
  const path = configPath(cwd)
  const mcpServers = {}
  // serverName 可能合法地叫 `__proto__`（SERVER_NAME_PATTERN 允许），普通赋值会丢掉它。
  for (const server of servers) setOwn(mcpServers, server.name, specToMcpEntry(server))
  const doc = previous !== null && typeof previous === 'object' && !Array.isArray(previous) ? { ...previous } : {}
  doc.mcpServers = mcpServers
  // exclude 是"整份列表"语义：传了数组就按它写（空数组 = 明确清空该键）。
  if (Array.isArray(exclude)) {
    if (exclude.length) doc.exclude = [...exclude]
    else delete doc.exclude
  }
  // 只写用户真的设过的东西：legacy 省略 mode，但不能因此丢掉 tools/groups 覆盖。
  // 项目策略可以只表达逐工具/分组例外；把它当成“空策略”会让保存 MCP 时静默抹掉用户设置。
  if (toolLoading !== undefined) {
    if (toolLoading === null) {
      delete doc.toolLoading
    } else {
      const sparse = {}
      if (toolLoading.mode && toolLoading.mode !== 'legacy') sparse.mode = toolLoading.mode
      if (Object.keys(toolLoading.groups ?? {}).length) sparse.groups = { ...toolLoading.groups }
      if (Object.keys(toolLoading.tools ?? {}).length) sparse.tools = { ...toolLoading.tools }
      if (Object.keys(sparse).length) doc.toolLoading = sparse
      else delete doc.toolLoading
    }
  }
  const text = JSON.stringify(doc, null, 2) + '\n'
  await mkdirFn(dirname(path), { recursive: true })
  await writeFileFn(path, text)
  return { text, path }
}
