// RPC 契约的**唯一**定义。
//
// 同一批方法有四张脸：
//   1. 宿主实现（`lib/index.js` 的两个 gateway 类，装饰器由 `applyRemoteMethods` 按这份表装配，
//      lib/remote-wiring.js）；
//   2. 宿主契约（`lib/typert.js`）；
//   3. 客户端 descriptor（`lib/client.js` 里的 `MCP_CONTRIBUTION.descriptors`）；
//   4. 网关原型（`McpManagerGateway.prototype` 的方法集合——`test/package-contract.test.mjs`
//      的"第四面"）。
//
// 第 2、3 张由这份表**生成**（`node scripts/rpc-contract.mjs --write`，CI 里 `--check`）。
// 第 1 张由这份表**装配**（R6.1 之前它是 55 条手写 `Remote("…")`，与表逐字重复；现在名字与顺序
// 只有这一处，`--check` 校验的是"宿主确实走的是这张表"），第 4 张由测试兜底。于是"加了方法忘了写
// 契约""删了实现留着契约""表里写错一个名字"这类**片间漂移**在结构上不可能静默通过。
//
// 字段说明：
//   method  —— wire 上的方法名（= 网关上的方法名）。
//   params  —— `"名字:类型符号"`；空数组 = 无参数。参数名进 wire，客户端按名字填。
//   result  —— 结果 codec 的类型符号后缀（宿主的 TYPERT 与客户端 descriptor 必须逐字一致）。
//   mutating—— 会改变状态的方法。它们的结果**必须**带 `{ persisted, live, diagnostics }`
//              三字段（写盘事实与运行中事实分开报；面板据此显示"已保存但未生效"）。

/** @typedef {{method: string, params: string[], result: string, mutating?: boolean}} RpcMethod */

/** MCP 能力面（`mcpManager` 命名空间）。顺序 = 宿主 @Remote 的声明顺序。 */
export const MCP_METHODS = [
  { method: 'list', params: [], result: 'ListResult' },
  { method: 'status', params: ['name:String'], result: 'StatusResult' },
  { method: 'enable', params: ['name:String'], result: 'NoteResult', mutating: true },
  { method: 'disable', params: ['name:String'], result: 'NoteResult', mutating: true },
  { method: 'reconnect', params: ['name:String'], result: 'NoteResult', mutating: true },
  // tools 收 payload 而不是裸 name：项目 MCP 必须带 wsPath 才能精确定位（两个项目可能同名）。
  { method: 'tools', params: ['payload:ImportPayload'], result: 'ToolsResult' },
  { method: 'builtins', params: [], result: 'BuiltinCatalogResult' },
  { method: 'installBuiltins', params: ['payload:BuiltinInstallPayload'], result: 'BuiltinInstallResult', mutating: true },
  { method: 'add', params: ['spec:Spec'], result: 'NoteResult', mutating: true },
  { method: 'update', params: ['spec:Spec'], result: 'NoteResult', mutating: true },
  { method: 'removeServer', params: ['name:String'], result: 'NoteResult', mutating: true },
  { method: 'setDeferAll', params: ['payload:DeferAllPayload'], result: 'DeferAllResult', mutating: true },
  { method: 'setDefer', params: ['payload:DeferPayload'], result: 'NoteResult', mutating: true },
  { method: 'toolSearchSettings', params: [], result: 'ToolSearchSettings' },
  { method: 'updateToolSearchSettings', params: ['payload:ToolSearchSettingsPayload'], result: 'ToolSearchSettings', mutating: true },
  { method: 'toolLoadingSettings', params: [], result: 'ToolLoadingSettings' },
  { method: 'updateToolLoadingSettings', params: ['payload:ToolLoadingPayload'], result: 'ToolLoadingSettings', mutating: true },
  { method: 'workspaceToolLoading', params: ['payload:ToolLoadingPayload'], result: 'ToolLoadingSettings' },
  { method: 'setWorkspaceToolLoading', params: ['payload:ToolLoadingPayload'], result: 'ToolLoadingSettings', mutating: true },
  { method: 'reveal', params: ['payload:ImportPayload'], result: 'RevealResult' },
  { method: 'previewImport', params: ['payload:ImportPayload'], result: 'ImportPreview' },
  { method: 'importJson', params: ['payload:ImportPayload'], result: 'ImportResult', mutating: true },
  { method: 'scanImportSources', params: ['payload:ImportPayload'], result: 'ImportSourcesResult' },
  { method: 'previewImportSource', params: ['payload:ImportPayload'], result: 'ImportPreview' },
  { method: 'importSource', params: ['payload:ImportPayload'], result: 'ImportResult', mutating: true },
  { method: 'listWorkspaces', params: [], result: 'WorkspaceListResult' },
  { method: 'getWorkspaceView', params: ['payload:ImportPayload'], result: 'WorkspaceViewResult' },
  { method: 'addWorkspaceServer', params: ['payload:ImportPayload'], result: 'NoteResult', mutating: true },
  { method: 'updateWorkspaceServer', params: ['payload:ImportPayload'], result: 'NoteResult', mutating: true },
  { method: 'removeWorkspaceServer', params: ['payload:ImportPayload'], result: 'NoteResult', mutating: true },
  { method: 'setWorkspaceExclude', params: ['payload:ImportPayload'], result: 'NoteResult', mutating: true },
  { method: 'installWorkspaceBuiltins', params: ['payload:BuiltinInstallPayload'], result: 'BuiltinInstallResult', mutating: true },
  { method: 'previewWorkspaceImport', params: ['payload:ImportPayload'], result: 'ImportPreview' },
  { method: 'importWorkspaceJson', params: ['payload:ImportPayload'], result: 'ImportResult', mutating: true },
  { method: 'copyWorkspaceServers', params: ['payload:ImportPayload'], result: 'WorkspaceCopyResult', mutating: true },
  { method: 'previewWorkspaceCopy', params: ['payload:ImportPayload'], result: 'WorkspaceCopyPreview' },
  { method: 'exportWorkspaceJson', params: ['payload:ImportPayload'], result: 'WorkspaceExportResult' },
  // 全局层的导出。与 exportWorkspaceJson 同形状（只差"有没有项目路径"），但**数据源不同**：
  // 前者读 <工作区>/.dsh/mcp.json，这个读 profile patch 里的 managed 条目。
  // 无参数：全局层不属于任何项目，没有可传的定位参数。
  { method: 'exportGlobalJson', params: [], result: 'WorkspaceExportResult' },
  { method: 'revealWorkspaceServer', params: ['payload:ImportPayload'], result: 'RevealResult' },
  { method: 'projectConnections', params: [], result: 'ProjectConnectionsResult' },
  { method: 'reconnectWorkspaceServer', params: ['payload:ImportPayload'], result: 'NoteResult', mutating: true },
  { method: 'updateHint', params: [], result: 'UpdateHintResult' },
  { method: 'whatsNew', params: [], result: 'WhatsNewResult' },
  // 上下文观测面。**故意挂在这个命名空间上**而不是另起一个服务：它读的是宿主已有的
  // `agents` / `sessionProjections` / `tokenMeter`，没有任何自己的依赖可以声明，另起服务
  // 只会多一个"服务没连上"的失败面。命名空间叫 toolboxMcp 是历史（见 MCP_SERVICE 的注释），
  // 这张表早就不只装 MCP——updateHint / whatsNew / projectConnections 同样如此。
  //
  // `sessionId` 是**可选**的：面板是多会话共用的入口，宿主默认挑最近活跃的那个会话，
  // 选中项由返回里的 `sessions[].active` 表达（不在客户端维护"当前会话"这个第二真相源）。
  { method: 'contextReport', params: ['payload:ContextPayload'], result: 'ContextReport' },
]

/** 技能能力面（`skillsManager` 命名空间）。顺序 = `SkillsManagerGateway` 的 @Remote 顺序。 */
export const SKILL_METHODS = [
  { method: 'list', params: ['payload:SkillPayload'], result: 'SkillListResult' },
  { method: 'detail', params: ['payload:SkillPayload'], result: 'SkillDetailResult' },
  { method: 'setEnabled', params: ['payload:SkillPayload'], result: 'SkillMutationResult', mutating: true },
  { method: 'setModelInvocable', params: ['payload:SkillPayload'], result: 'SkillMutationResult', mutating: true },
  { method: 'setUserInvocable', params: ['payload:SkillPayload'], result: 'SkillMutationResult', mutating: true },
  // ⚠️ 不能叫 `remove`：客户端适配器（dsh-api-gateway 的 RemoteNamespaceService）自己就有原型
  // 方法 `remove(kind, method, token)`，`ctx.remote.$mount` 会把「与命名空间服务自身成员重名」
  // 的 endpoint 直接拒掉。同类保留名还有 ctx/empty/has/install/methods/name/namespace。
  // 回归闸见 test/client-admission.test.mjs（用真网关跑我们的真 bundle）。
  { method: 'removeSkill', params: ['payload:SkillPayload'], result: 'SkillMutationResult', mutating: true },
  { method: 'importSkill', params: ['payload:SkillPayload'], result: 'SkillMutationResult', mutating: true },
  { method: 'skillTargets', params: ['payload:SkillPayload'], result: 'SkillTargetsResult' },
  { method: 'skillHubSearch', params: ['payload:SkillPayload'], result: 'SkillHubSearchResult' },
  { method: 'skillHubDetail', params: ['payload:SkillPayload'], result: 'SkillHubDetailResult' },
  // 分类标签要按语言挑 nameEn：宿主实现是 `skillHubCategories(payload)`、读 `payload.locale`，
  // 所以这里必须声明 payload 参数。声明成 0 参时客户端代理按描述符判实参个数，
  // `call('skillHubCategories', { locale })` 在**发出去之前**就抛 "expected 0 argument(s), got 1"，
  // 被调用处的 try/catch 吞掉 → 英文界面下分类名永远是中文（且无任何报错线索）。
  { method: 'skillHubCategories', params: ['payload:SkillPayload'], result: 'SkillHubCategoriesResult' },
  { method: 'skillHubInstall', params: ['payload:SkillPayload'], result: 'SkillMutationResult', mutating: true },
  { method: 'conflictingManager', params: [], result: 'SkillConflictResult' },
]

/**
 * 本插件的 MCP 服务在 host（`ctx.provide`）与 wire（`/api/<namespace>/…`）上的名字。
 *
 * ⚠️ **不能叫 `mcpManager`**：0.2.2-rc.2 起宿主的 web-app bundle 自带
 * `@deepseek-ai/dsh-mcp-manager`，它 `super(ctx, "mcpManager")` 注册的正是这个名字。
 * 两边撞上时后注册的那个直接抛错（`service "mcpManager" has been registered at <McpManagerGateway>`），
 * 也就是真机上看到的“官方 MCP 管理器启动失败”（issue #11）。它只提供
 * `watch/restart/probe`（只读 + 重启，不写配置），与我们的面板职责不重叠，所以做法是**让开名字**
 * 而不是让位。
 */
export const MCP_SERVICE = 'toolboxMcp'

/** 两个命名空间合起来的清单（按上面的拼接顺序）。 */
export const NAMESPACES = [
  { service: MCP_SERVICE, methods: MCP_METHODS },
  { service: 'skillsManager', methods: SKILL_METHODS },
]

/** 仅内部使用、不上面 wire 的网关方法（第四面契约要求显式登记 + 理由）。 */
export const INTERNAL_ONLY = [
  ['setDisabled', 'enable/disable 的共用实现，面板不直接调它'],
  ['loadingPolicy', '目录/搜索/守卫共用的一次性决策函数，面板走 toolLoadingSettings'],
  ['collectAvailableTools', '面板与策略共用的可见工具枚举；两种视图都从它派生，不单独上 wire'],
  ['catalogFacts', '目录状态的唯一组装点；面板走 contextReport 读它（配置归 toolSearchSettings），不单独上 wire'],
  ['deferStateOf', '服务器级芯片的判定，经 listMcpServers 行内下发，客户端不直接调'],
]

/** 拆 `"name:String"` → `{name, symbol}`。 */
export function splitParam(param) {
  const index = param.indexOf(':')
  if (index <= 0 || index === param.length - 1) throw new Error(`非法的参数声明：${param}（应为 "名字:类型符号"）`)
  return { name: param.slice(0, index), symbol: param.slice(index + 1) }
}
