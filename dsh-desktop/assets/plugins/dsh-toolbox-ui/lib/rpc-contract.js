// RPC 契约的**唯一**定义。
//
// 同一批方法有四张脸：
//   1. 宿主实现（`lib/index.js` 的 `@Remote("…")` 装饰器，顺序即契约顺序）；
//   2. 宿主契约（`lib/typert.js`）；
//   3. 客户端 descriptor（`lib/client.js` 里的 `MCP_CONTRIBUTION.descriptors`）；
//   4. 网关原型（`McpManagerGateway.prototype` 的方法集合——`test/package-contract.test.mjs`
//      的"第四面"）。
//
// 第 2、3 张由这份表**生成**（`node scripts/rpc-contract.mjs --write`，CI 里 `--check`），
// 第 1 张由生成器校验顺序与名字（装饰器必须贴在方法上，没法整段生成），第 4 张由测试兜底。
// 于是"加了 @Remote 忘了写契约""删了实现留着契约"这类**片间漂移**在结构上不可能静默通过。
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
  { method: 'revealWorkspaceServer', params: ['payload:ImportPayload'], result: 'RevealResult' },
  { method: 'projectConnections', params: [], result: 'ProjectConnectionsResult' },
  { method: 'reconnectWorkspaceServer', params: ['payload:ImportPayload'], result: 'NoteResult', mutating: true },
  { method: 'updateHint', params: [], result: 'UpdateHintResult' },
  { method: 'whatsNew', params: [], result: 'WhatsNewResult' },
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

/** 两个命名空间合起来的清单（按上面的拼接顺序）。 */
export const NAMESPACES = [
  { service: 'mcpManager', methods: MCP_METHODS },
  { service: 'skillsManager', methods: SKILL_METHODS },
]

/** 仅内部使用、不上面 wire 的网关方法（第四面契约要求显式登记 + 理由）。 */
export const INTERNAL_ONLY = [
  ['setDisabled', 'enable/disable 的共用实现，面板不直接调它'],
  ['loadingPolicy', '目录/搜索/守卫共用的一次性决策函数，面板走 toolLoadingSettings'],
  ['collectAvailableTools', '面板与策略共用的可见工具枚举；两种视图都从它派生，不单独上 wire'],
  ['deferStateOf', '服务器级芯片的判定，经 listMcpServers 行内下发，客户端不直接调'],
]

/** 拆 `"name:String"` → `{name, symbol}`。 */
export function splitParam(param) {
  const index = param.indexOf(':')
  if (index <= 0 || index === param.length - 1) throw new Error(`非法的参数声明：${param}（应为 "名字:类型符号"）`)
  return { name: param.slice(0, index), symbol: param.slice(index + 1) }
}
