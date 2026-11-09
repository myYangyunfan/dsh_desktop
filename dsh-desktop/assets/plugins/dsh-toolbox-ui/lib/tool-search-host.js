// 宿主能力探测：本插件对宿主的每一处依赖都在这里**一次性**问清楚，之后的装配/守卫/搜索
// 热路径不再探测。探测结果只描述"宿主提供了什么"，不含本插件的任何决定。
//
// 为什么要有这一层：本功能的两处关键依赖不在公开类型面上（`tools.modeFor` 与
// `tools.sdkSchemas` 在 `dsh-tools` 的 `index.d.ts` 里都标着 `private`）。仓里没有 typecheck
// （`package.json` 只有 `node --test`），所以宿主一旦改名，代价是**运行时**才发现。
// 探测把"宿主改名"从"装配时炸"降级成"退化成今天的行为 + 一条日志"，与 B3 的
// "只可能变好，最坏 = 现状"同一条不变量。
//
// 缺项一律**不抛错**（那是"少了优化"，不是"装不上"）；只有一条硬依赖留在 runtime 里
// 硬校验：`ctx.tools.register` / `ctx.tools.guard`——缺了就不是降级运行能表达的。

/**
 * 每个 ctx 上已报过的缺项。用 WeakMap 而不是模块级 Set：同一个进程里可以并存多个宿主
 * Context（测试、HMR），键必须按 ctx 隔离，否则一个 ctx 的告警会压掉另一个的。
 * @type {WeakMap<object, Set<string>>}
 */
const reported = new WeakMap()

/**
 * 同一个 ctx 上同一个 key 只记一次日志，返回"这次是否真的记了"。
 * 缺项是**退化**不是失败，所以不抛错；但必须显式记账——静默退化正是本项目禁止的
 * "看起来成功了其实没生效"。
 * @param {object} ctx - 宿主 Context（只需要可选的 logger）。
 * @param {string} key - 去重键（通常是缺的那个能力名）。
 * @param {string} message - 人读的说明，会带上 `mcp-manager:` 前缀。
 * @returns {boolean} 首次记录返回 true。
 */
export function warnOnce(ctx, key, message) {
  let seen = reported.get(ctx)
  if (seen === undefined) {
    seen = new Set()
    reported.set(ctx, seen)
  }
  if (seen.has(key)) return false
  seen.add(key)
  const logger = ctx?.logger
  const sink = typeof logger?.warn === 'function' ? logger.warn : logger?.error
  // 宿主 Context 恒有 logger；console 只作为"宿主没给 logger"时的最后出口，
  // 因为一条告警的代价远小于静默。
  if (typeof sink === 'function') sink.call(logger, `mcp-manager: ${message}`)
  else console.warn(`mcp-manager: ${message}`)
  return true
}

/**
 * 探测宿主提供的能力。安装时调用一次，结果存起来。
 *
 * 四处的可见性与"拿不到时怎么办"（依据 DECISIONS §4.2.1 / §11.3）：
 * - `modeFor`（private）→ 每个 agent 的有效呈现模式。缺失用 assembly 形状推断（G1）。
 * - `sdkSchemas`（private）→ 宿主渲染 `tools:sdk` 的**原输入**的快路径。缺失不影响正确性，
 *   只是每次 revision 多付一次逐工具 `get()`（F22 已实测公开路径逐字节相等）。
 * - `sessionProjections`（公开服务，但部署可选）→ 发现集恢复。缺失退回
 *   `discoveredFromMessages`（native 有效、PTC 不恢复）（G2）。
 * - `agents`（公开服务）→ 面板显示真实生效状态（C2，本轮不做）。缺失不告警。
 *
 * @param {object} ctx - 宿主 Context。
 * @returns {{modeFor: boolean, sdkSchemas: boolean, definitions: boolean, projections: boolean, agents: boolean}}
 */
export function probeHost(ctx) {
  const tools = ctx?.tools
  const get = typeof ctx?.get === 'function' ? (name) => ctx.get(name) : () => undefined
  const projections = get('sessionProjections')
  const agents = get('agents')
  const caps = {
    modeFor: typeof tools?.modeFor === 'function',
    sdkSchemas: typeof tools?.sdkSchemas === 'function',
    definitions: typeof tools?.definitions === 'function' && typeof tools?.resolve === 'function',
    projections: typeof projections?.register === 'function' && typeof projections?.stateOf === 'function',
    agents: typeof agents?.list === 'function',
  }
  if (!caps.modeFor) {
    warnOnce(ctx, 'modeFor',
      'ctx.tools.modeFor() 不可用（宿主 private API 可能已改名）：呈现模式改用 assembly 形状推断，判不出时按 native 处理')
  }
  if (!caps.projections) {
    warnOnce(ctx, 'sessionProjections',
      'ctx.sessionProjections 不可用（该部署未挂 dsh-session-projection）：发现集恢复退回会话派生消息，PTC 会话将无法恢复')
  }
  // sdkSchemas 缺失只影响耗时（公开 API 逐工具 get 代替），不进日志：它不是缺项。
  // agents 缺失只影响下一轮的面板展示（C2），本轮没有消费者。
  return caps
}

/**
 * 注册 `tool_search` 前的重名预检（G4）。
 *
 * 为什么需要：宿主的 `NamedEntries.insert` 对重名**直接抛错**（`packages/core/scope/src/store.ts`），
 * 而这是本插件构造函数里的同步路径——一个将来可能出现的同名工具（宿主自带、别的插件）
 * 会让整个 mcp-manager 装载失败。换名比装不上好，但换了必须说清楚。
 *
 * @param {object} tools - 宿主 tools 服务（只需要公开的 `get(name)`）。
 * @param {string} preferred - 首选名。
 * @param {string[]} candidates - 备选名（按确定性顺序，不含 preferred）。
 * @param {{ctx?: object}} [options] - 仅用于记日志；缺省则只返回结果。
 * @returns {{name: string, renamed: boolean}}
 * @throws 全部候选都被占用时抛错——明确失败优于静默装一个模型看不见的入口。
 */
export function chooseToolName(tools, preferred, candidates = [], options = {}) {
  const { ctx } = options
  if (typeof tools?.get !== 'function') {
    // 预检是前瞻性护栏，不是正确性前提：宿主不给 get 时保留首选名，让宿主在注册时按
    // 它自己的规则报错（那就是今天的行为）。凭空换名会让模型记熟的入口消失。
    if (ctx !== undefined) warnOnce(ctx, 'toolNamePreflight', 'ctx.tools.get() 不可用：跳过 tool_search 重名预检')
    return { name: preferred, renamed: false }
  }
  if (tools.get(preferred) === undefined) return { name: preferred, renamed: false }
  const tried = [preferred]
  for (const candidate of candidates) {
    if (candidate === preferred || tried.includes(candidate)) continue
    tried.push(candidate)
    if (tools.get(candidate) === undefined) {
      if (ctx !== undefined) {
        warnOnce(ctx, 'toolNameRenamed',
          `工具名 ${JSON.stringify(preferred)} 已被占用，本插件改用 ${JSON.stringify(candidate)} 注册（目录/守卫/引导文案同步使用新名字）`)
      }
      return { name: candidate, renamed: true }
    }
  }
  throw new Error(`mcp-manager: tool-search 无可用的工具名：${tried.map((name) => JSON.stringify(name)).join(' / ')} 全部被占用`)
}

/**
 * `run_code` 的传输名。宿主 `dsh-tools` 导出 `RUN_CODE_NAME`；这里不 import 该包就为了一个
 * 字符串，但**同一个事实只写一次**：`test/tool-search-sdk.test.mjs` 断言本常量等于宿主导出，
 * 宿主改名时那条会红。
 */
export const RUN_CODE_TOOL = 'run_code'

/**
 * `modeFor` 缺席时的公开退化判据（G1）。
 *
 * 模型看到的工具面有两条投影：函数清单（`assembly.tools`）与 `tools:sdk` 手册。`ptc` 下
 * 清单只剩 `run_code`（`wireSchemas` 的 collapse），`both` 下两个都在——所以形状足以区分
 * 三者，且只用**公开**信息。判不出的"空清单"按 native：那是插件今天的默认前提。
 *
 * @param {{name?: string}[]|undefined} assemblyTools - 组装后的工具清单。
 * @param {Set<string>} managed - 本机制管理的工具名（判定 `both` 用）。
 * @returns {'native'|'ptc'|'both'}
 */
export function inferMode(assemblyTools, managed) {
  const list = Array.isArray(assemblyTools) ? assemblyTools : []
  if (!list.some((tool) => tool?.name === RUN_CODE_TOOL)) return 'native'
  return list.some((tool) => managed?.has(tool?.name)) ? 'both' : 'ptc'
}
