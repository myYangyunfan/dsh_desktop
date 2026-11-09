// ToolSearch 的配置桥：把插件的配置状态译成运行时的活输入。
//
// 两个来源：
//   - loader 条目（allMcpEntries）：每个 mcp-client 实例的 options.config——全局 profile 条目
//     与项目级共享连接都在里面，`defer` 字段由 mcp-config.normalizeEntry 归一化后落在这里。
//   - 进程环境：DSH_MCP_TOOL_SEARCH=off 一键回退全量注入（设计文档 §8 全局开关）。
//
// 之所以是**函数**而不是快照 Set：工具集与配置都会在会话生命周期内变化（服务器晚连、
// 用户在面板改开关），运行时的每次视图重建都重新读一遍（视图按 revision 判失效）。

import { allMcpEntries } from './mcp-registry.js'
import { canonicalWorkspacePath, projectMcpServers } from './workspace-runtime.js'

/** 全局开关：置 off 时所有服务器视同 defer=false，本功能整体短路。 */
export function toolSearchDisabled() {
  return String(process.env.DSH_MCP_TOOL_SEARCH ?? '').trim().toLowerCase() === 'off'
}

/**
 * 全部已知 MCP 服务器 → defer 标志。**唯一来源表**，两个族各贡献一半：
 *   - 全局族：loader 条目（profile patch 里的 mcp 条目）
 *   - 项目族：共享连接（connectionCtx.plugin 建出来的，不在 loader 树里）
 *
 * 归属只能按 serverName——工具名只编码它。所以同名的任一条目 defer，该名字就 defer
 * （DSH 0.1.5 起各注册作用域允许同名，这不是冲突，是命字）。
 */
export function serverDeferTable(ctx, agent) {
  const globalEntries = []
  for (const entry of allMcpEntries(ctx)) {
    const serverName = entry.options?.config?.serverName
    if (typeof serverName !== 'string' || serverName === '') continue
    // 原值带出去（true / false / undefined）：`false` 是用户**明确关掉**延迟，
    // 在统一策略下它是"这台常驻"的有效覆盖；undefined 才是"没表态，跟随整体方案"。
    globalEntries.push({ name: serverName, defer: entry.options.config.defer })
  }
  return deferTableFor({ globalEntries, projectServers: projectMcpServers(ctx), wsPath: agentWorkspace(agent) })
}

/**
 * 合并两族的 defer 表。**纯函数**，作用域规则在这里一次说清：
 *
 * - 全局族（loader 条目）对所有会话生效，同名条目取 OR（顺序无关）。
 * - 项目族只取**当前会话所在项目**的那一份（`wsPath` 精确相等）。早先的实现把
 *   所有项目的同名服务器 OR 在一起，于是 A 项目关掉延迟、B 项目开着，A 也会被延迟——
 *   工具权限没串，**加载偏好串了**，用户的逐项目设置形同无效。
 * - `wsPath` 为 null（拿不到会话工作区）时退回旧的全量合并：宁可保守地维持既有行为，
 *   也不在没有依据时改变另一个项目的策略。
 *
 * @param {{globalEntries?: {name: string, defer: boolean}[], projectServers?: {name: string, defer: boolean, wsPath?: string}[], wsPath?: string|null}} input
 * @returns {Map<string, boolean>}
 */
export function deferTableFor({ globalEntries = [], projectServers = [], wsPath = null } = {}) {
  const table = new Map()
  // 合并同一名字的多个条目：true 压过 false，false 压过"没表态"。
  // 顺序无关是硬要求（loader 树顺序用户看不见，不能让它决定结论）。
  const merge = (name, value) => {
    const current = table.get(name)
    if (value === true) { table.set(name, true); return }
    if (value === false) { if (current !== true) table.set(name, false); return }
    if (!table.has(name)) table.set(name, undefined)
  }
  for (const entry of globalEntries) {
    if (typeof entry?.name !== 'string' || entry.name === '') continue
    merge(entry.name, entry.defer === true ? true : entry.defer === false ? false : undefined)
  }
  for (const server of projectServers) {
    if (typeof server?.name !== 'string' || server.name === '') continue
    if (wsPath !== null && server.wsPath !== undefined && server.wsPath !== wsPath) continue
    merge(server.name, server.defer === true ? true : server.defer === false ? false : undefined)
  }
  return table
}

/** 会话所在项目（canonical）；拿不到就是 null（调用方按保守规则处理）。 */
export function agentWorkspace(agent) {
  const cwd = agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') return null
  try {
    return canonicalWorkspacePath(cwd)
  } catch {
    return null
  }
}

/** 全部已知 MCP 服务器名。uniqueOwner 的归属判定需要这份全集。 */
export function serverNamesOf(ctx, agent) {
  return [...serverDeferTable(ctx, agent).keys()]
}

/** 明确开着延迟的服务器名。总开关置 off 时返回空（功能短路）。 */
export function deferServersOf(ctx, agent) {
  if (toolSearchDisabled()) return []
  return [...serverDeferTable(ctx, agent)].filter(([, defer]) => defer === true).map(([name]) => name)
}

/**
 * 明确关掉延迟的服务器名（`defer: false`）。
 *
 * 与"没表态"必须分开：统一策略下，整体方案决定默认值，而列表里的「延迟 / 全量」芯片
 * 是用户对某台服务器的**明确**选择——关掉就该常驻，不能被整体方案重新拉回按需。
 */
export function residentServersOf(ctx, agent) {
  if (toolSearchDisabled()) return []
  return [...serverDeferTable(ctx, agent)].filter(([, defer]) => defer === false).map(([name]) => name)
}
