// 组装呈现端口：**一次组装只做一件事**——把「宿主已经组装好的 assembly」按同一份
// 策略/发现快照投影成模型可见的形状。
//
// 为什么单独一层（而不是继续写在 runtime 的 assemble 处理器里）：
//   - 两代宿主的接入点不同（rc.5 在 `system-prompt/assemble` waterfall 里就能改 tools；
//     rc.1 的 waterfall 根本没有 tools，宿主在 waterfall 之后才把 provider-owned 声明贴回
//     最终 assembly），但**投影规则完全相同**。规则写两份必然漂移，而漂移的后果是
//     "目录说藏了、声明没藏"——用户看到的是自相矛盾的功能。
//   - 校验需要能测：这里全部输入来自入参（assembly + snapshot），没有任何宿主探测。
//
// 不变量（对应 SOLUTION §2.1/§4.1）：
//   - V = A − (M − D)：只摘「策略选为延迟、且本 agent 还没发现」的工具；其余原样保留。
//   - 声明、SDK 手册、目录段、引导段**用同一个 snapshot**（同一份 view + 同一份发现集）。
//   - 没东西可做时返回**原 assembly 引用**：零干预是能被外部观察到的（宿主按引用判变化）。
//   - mode === 'both' 整段放行：两条投影都有效时不碰任何一处（rc.5 才有该模式）。

/** 本次要展示的延迟集：D = 已发现的，M = 策略选中的延迟集。 */

/**
 * @typedef {object} PresentationSnapshot
 * @property {'native'|'ptc'|'both'} mode - 本次组装的呈现模式。
 * @property {{managed: Map<string, object>, catalog: Map<string, object>, revision?: number, degraded?: boolean}} view - 策略视图。
 * @property {{discovered: Map<string, number>}} state - 本 agent 的发现集。
 * @property {{toolName: string, requireDiscovery?: boolean}} config - 参与呈现的运行参数。
 * @property {object} [agent] - 快照所属 agent（只用于诊断，不参与决策）。
 * @property {object} [toolSet] - 本步准入（SDK 取数用）。
 */

/**
 * @typedef {object} PresentationHandlers
 * @property {(snapshot: PresentationSnapshot, deferred: Set<string>, sections: object[]) => string} catalogText
 *   目录段正文。缓存与预算都在实现侧（runtime），这里只要求它只用 snapshot。
 * @property {(snapshot: PresentationSnapshot, deferred: Set<string>, sections: object[]) => Promise<object[]>} [trimSdk]
 *   按快照裁 `tools:sdk` 段。失败时**必须**返回原 sections（不许丢手册）。
 */

/**
 * `D = managed − discovered`：还没被发现的受管工具。
 * 这是遮罩、目录段、引导段、SDK 裁剪四处共用的唯一集合。
 * @param {Map<string, object>} managed - 策略选为延迟的工具。
 * @param {Set<string>|Map<string, number>} discovered - 已发现集。
 * @returns {Set<string>}
 */
export function deferredOf(managed, discovered) {
  const deferred = new Set()
  for (const name of managed.keys()) {
    if (!discovered.has(name)) deferred.add(name)
  }
  return deferred
}

/**
 * 只摘「受管且未发现」的工具。刻意用黑名单而不是"稳定集白名单"：
 * assembly 里可能有非本注册表来源的工具（其他插件的 provider），白名单会把它们误删。
 * @param {{name: string}[]|undefined} tools - assembly.tools。
 * @param {Set<string>|Map<string, object>} managed - 受管工具名集。
 * @param {Set<string>|Map<string, number>} discovered - 已发现集。
 * @returns {{name: string}[]}
 */
export function visibleTools(tools, managed, discovered) {
  return (tools ?? []).filter((tool) => !managed.has(tool.name) || discovered.has(tool.name))
}

/**
 * 清空静态引导段（没有延迟工具时它是假话）。返回新对象；段里没有它时原样返回。
 * @param {object[]} sections
 * @param {string} name - 引导段名。
 * @returns {object[]}
 */
export function maskSection(sections, name) {
  if (!(sections ?? []).some((section) => section?.name === name)) return sections
  return sections.map((section) => (section?.name === name ? { ...section, text: '' } : section))
}

/**
 * 把一次组装投影成模型可见的形状。
 *
 * 顺序即正确性：
 * 1. `both` → 原样放行（两条投影都有效，插件一处都不碰）；
 * 2. 宿主没给 tools 数组 → 原样放行并报诊断（**不能**把 tools 覆盖成 []：那会让模型
 *    一个工具都看不见）。rc.1 的 assembly 一定有 tools；缺了说明契约变了。
 * 3. `managed = ∅`（没有延迟服务器）→ 只摘引导段；
 * 4. `D = ∅`（全部已发现）→ 只摘引导段；
 * 5. 其余：摘工具 + 追加目录段 + （PTC）裁 SDK 手册。
 *
 * @param {object} assembly - 宿主组装结果（含 tools / sections）。
 * @param {PresentationSnapshot} snapshot - 同次组装的策略/发现快照。
 * @param {PresentationHandlers} handlers - 目录正文与 SDK 裁剪。
 * @param {{guidanceSection: string, catalogSection: string, onDiagnostic?: (event: object) => void}} options
 * @returns {Promise<object>} 投影后的 assembly（无条件修改时是同一个引用）。
 */
export async function presentAssembly(assembly, snapshot, handlers, options) {
  const { guidanceSection, catalogSection, onDiagnostic } = options
  if (snapshot.mode === 'both') return assembly
  if (!Array.isArray(assembly?.tools)) {
    // 契约破了：没有 tools 就没有"声明"可裁。此时**只**追加目录会让模型看到一份说
    // "这些工具被延迟了"的清单，而宿主实际把所有 schema 都发了出去——正是要避免的假象。
    onDiagnostic?.({ code: 'ASSEMBLY_WITHOUT_TOOLS', mode: snapshot.mode })
    return assembly
  }
  const managed = snapshot.view?.managed ?? new Map()
  const searchName = snapshot.config?.toolName
  const deferred = deferredOf(managed, snapshot.state.discovered)
  // 「没有可搜的东西」= 延迟集为空：要么根本没有延迟工具（`managed` 为空），要么全被发现了。
  // 这时**连搜索入口一起摘掉**——模型只要看见 `tool_search` 就会试着搜一次，而此刻它无论
  // 怎么搜都只有"没有匹配"这一种结果（issue #9：「MCP 全部禁用依然会加载 tool_search」）。
  // 注意这**不是**把保护项交给用户策略：搜索入口仍然不可被用户隐藏；它只是"没有东西可搜时
  // 不出现"，一旦有工具被延迟，下一次组建立刻又有它。
  const nothingToSearch = deferred.size === 0
  const tools = nothingToSearch
    ? assembly.tools.filter((tool) => tool?.name !== searchName)
    : visibleTools(assembly.tools, managed, snapshot.state.discovered)
  const toolsChanged = tools.length !== assembly.tools.length
  let sections = nothingToSearch ? maskSection(assembly.sections, guidanceSection) : [
    ...(assembly.sections ?? []),
    { name: catalogSection, text: handlers.catalogText(snapshot, deferred, assembly.sections), interpolate: false },
  ]
  // 手册只在 ptc 下裁：native 没有可裁的段（`sdkSection` 对 native 返回 ''）。
  if (snapshot.mode === 'ptc' && typeof handlers.trimSdk === 'function') {
    // 没有东西可搜时把搜索入口也放进"要摘掉"的集合：手册里留着它，模型照样会去搜。
    const drop = nothingToSearch && searchName !== undefined ? new Set([...deferred, searchName]) : deferred
    try {
      sections = await handlers.trimSdk(snapshot, drop, sections)
    } catch (error) {
      // 裁剪是优化：失败就沿用宿主原文。发一份"少签名"的手册比不裁更坏。
      onDiagnostic?.({ code: 'SDK_TRIM_THREW', message: error?.message ?? String(error) })
    }
  }
  if (!toolsChanged && sections === assembly.sections) return assembly
  return { ...assembly, tools: toolsChanged ? tools : assembly.tools, sections }
}
