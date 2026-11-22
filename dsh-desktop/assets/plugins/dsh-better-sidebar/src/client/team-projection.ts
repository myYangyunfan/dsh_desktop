/**
 * The plugin's view of the host's `agentTeam` Session projection — the Lead
 * Session's shared task board — plus the roster the board draws beside it.
 *
 * DSH 0.2.2 reshaped that projection: the wire value is now
 * `{ enabled, tasks, failure? }` and **no longer carries `members`**
 * (upstream upgrade-guide v0.2.1-rc.2「agentTeam.members is removed」；Team 包的
 * 迁移 `122dc3af42` 把名册永久移出该投影)。旧实现按 0.1.7 形状读
 * `team.members.map(…)`，于是每打开一次「子代理 / 编队」页就在渲染期抛
 * `Cannot read properties of undefined (reading 'map')`——而且 `team === undefined`
 * 那道唯一守卫永远不生效：内核 `teamProjectionDefinition.init` 让**每个会话都发这条投影**。
 *
 * 名册的唯一来源因此变成**目录**：一个团队成员就是 Lead 的一个直接 subagent，
 * 即 `subagentCatalog` 里挂在 Lead 名下的行——本插件的 ./subagent-catalog.ts 已经在折叠它，
 * 这里只把 Lead 行补在最前。没有第二份名单可以互相矛盾，这正是旧 `members` 漂移一直隐身的原因。
 *
 * 该投影以前携带、如今真的没了的两个事实，本模块**不伪造**：
 *
 * - 没有持久 `phase`：`provisioning` / `failed` 属于旧名册的生命周期，而一个从未产出
 *   catalog 行的 spawn 根本没有行可画。**凡是出现在名册里的行都已是「已上线」**，所以
 *   `phase` 一律取 `active`（这是从「它在 catalog 里」推出来的结论，不是补一个常量占位）。
 * - 没有 per-member `error`：只剩看板级的 `failure` 字符串，由 TeamBoard 自己展示。
 *
 * 轮次活跃度是**派生**的：会话列表的 `running` 位权威，`subagents.live` 的标记只做兜底
 * （前者是「agent 在跑」，后者是「会话驻留」，retained 会话在 live 里仍是 true）。
 */
import type {
  SidebarChildLiveView,
  SidebarSessionList,
  SidebarSessionSummary,
  SidebarSubagentCatalogEntry,
  SidebarTeamProjection,
} from '../context-types.ts'

/**
 * 根 agent 的固定名（宿主的 `ROOT_AGENT_NAME`）。在此逐字重述而不 import：
 * 客户端 bundle 不允许 value-import 宿主的 subagent 包，而 Lead 是唯一一个
 * 名字不来自 catalog 行的成员。
 */
const ROOT_AGENT_NAME = 'lead'

/**
 * One roster row as this page consumes it: identity plus the derived runtime
 * status. 第三类型，故意不复用宿主 0.1.6 的 `SidebarTeamMemberView`
 * （那套 status/description/provider/model 本插件早已不读）。
 */
export interface TeamMemberRow {
  /** The member's session id (the Lead itself, or a direct child under it). */
  id: string
  /** The member's agent name: `lead` at the root, the catalog title below it. */
  name: string
  role: 'lead' | 'teammate'
  /**
   * 已上线：名册来自 catalog，能出现在这里的成员都已 provisioned。
   * 旧值域仍保留 `provisioning | failed`，供看板/任务图形沿用状态色。
   */
  phase: 'provisioning' | 'active' | 'failed'
  /** Derived display status: the session's own run bit, live flag as the fallback. */
  status: 'running' | 'idle'
  /** 旧名册的 per-member 备注位；新版宿主不再下发，恒为空数组（看板级 failure 另有落点）。 */
  diagnostics: string[]
}

/**
 * The team board led by `rootId`, or undefined when that session leads none.
 *
 * ABSENT MEANS NO TEAM, and there are three ways to get there: the deployment
 * never mounted the Team layer（完全没有投影键）, the session leads no team
 * (`enabled: false` 是持久的模式选择）, or the root is a teammate rather than
 * the Lead. All three collapse into「这页不画 Teams 块」。
 *
 * 仍发旧形状的宿主没有 `enabled` 字段——那按「已启用」读，看板出现在它原来的位置。
 *
 * @param projections - `SessionListState.projectionsBySession`.
 * @param rootId - the tree's root session (the only session that can be Lead).
 */
export function teamProjectionOf(
  projections: SidebarSessionList['projectionsBySession'],
  rootId: string | undefined,
): SidebarTeamProjection | undefined {
  if (rootId === undefined) return undefined
  const team = projections?.[rootId]?.values.agentTeam
  return team?.enabled === false ? undefined : team
}

/**
 * Build the roster: the Lead, then the Lead's direct children from its catalog.
 *
 * The catalog is the ONLY roster source now (see the module header), so a child
 * that the catalog does not list is not a member——没有第二份名单可分歧。
 *
 * @param team - the Lead's projection ({@link teamProjectionOf}).
 * @param rootId - the tree's root session id.
 * @param entries - the Lead's `subagentCatalog` rows, in catalog order.
 * @param live - the `subagents.live` map（session id → live view）.
 * @param byId - the session list by id (the Lead's own running flag lives here).
 */
export function teamMembersOf(
  team: SidebarTeamProjection | undefined,
  rootId: string | undefined,
  entries: readonly SidebarSubagentCatalogEntry[],
  live: Readonly<Record<string, SidebarChildLiveView | undefined>>,
  byId: Readonly<Record<string, SidebarSessionSummary | undefined>>,
): TeamMemberRow[] {
  if (team === undefined || rootId === undefined) return []
  const statusOf = (id: string): TeamMemberRow['status'] => {
    const running = byId[id]?.running ?? live[id]?.running
    return running === true ? 'running' : 'idle'
  }
  // 目录行只有 id 与可选的 label；展示名优先用会话列表的标题，再退回 label / id。
  const nameOf = (id: string, fallback: string): string => {
    const title = byId[id]?.displayTitle
    return title !== undefined && title !== '' ? title : fallback
  }
  return [
    {
      id: rootId,
      name: ROOT_AGENT_NAME,
      role: 'lead',
      phase: 'active',
      status: statusOf(rootId),
      diagnostics: [],
    },
    ...entries.map(entry => ({
      id: entry.id,
      name: nameOf(entry.id, entry.label ?? entry.id),
      role: 'teammate' as const,
      phase: 'active' as const,
      status: statusOf(entry.id),
      diagnostics: [],
    })),
  ]
}
