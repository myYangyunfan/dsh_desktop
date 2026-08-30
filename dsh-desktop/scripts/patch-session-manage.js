'use strict';

// 对话删除 / 归档管理运行时补丁（幂等、锚点不匹配时跳过且绝不损坏文件）。
//
// 背景：dsh 只有归档（workspace 域 archivedSessionIds）没有删除；取消归档
// （unarchive）在注册表层也没有。本补丁在官方包上做外科手术式扩展，打通
// 「删除按钮 + 设置内归档管理面板」所需的完整链路：
//
//   1. @deepseek-ai/dsh-workspace        —— WorkspaceRegistry 增加
//      unarchiveSession(sessionId)（幂等地从归档集合移除并持久化）。
//   2. @deepseek-ai/dsh-session          —— SessionStore 增加 remove(id)
//      （从 live 注册表摘除，优雅 flush 后释放持久化状态并广播
//      session/disposed）。
//   3. @deepseek-ai/dsh-api-workspace-controller（旧 dsh-host-apiproxy 拆分后
//      的 workspace 宿主控制器）—— 新增两个 RPC：
//        · workspace.unarchiveSession    恢复归档（返回完整归档集，域变更
//          自动广播 archived 帧，客户端实时恢复显示）；
//        · workspace.deleteSession       删除：拒绝运行中会话（实时查询
//          ctx.agents 注册表，宿主权威状态）→ 摘除 live 注册表（session/disposed
//          广播 → 客户端实时移除行）→ 清理归档集合 → 从所属工作区 sessionIds
//          摘除并持久化 → 按 jsonl 布局移除会话目录（日志与附件一并移除）。
//      typert 协议三处同步：lib/index.js（命令实现 + 控制器门面）、
//      lib/typert.host.js（宿主 STRICT 分发描述符，运行时经 typert-loader 加载）、
//      lib/client.js（客户端模型/服务门面）。
//   4. @deepseek-ai/dsh-api-remotes      —— 客户端 remote 注册表 bundle 增加
//      两个方法的 schema + descriptor（客户端 callUnary 据此装配 remote.workspace
//      命名空间；旧版在 dsh-client-connection 里，现已收口到该 bundle）。
//   5. @deepseek-ai/dsh-client-ui-workspace —— 会话行 ⋯ 菜单在「归档会话」
//      下方增加「删除对话」（当前会话行也显示），点击走
//      window.__dshSessionManager（由配套插件 dsh-session-manager 提供：
//      确认框 + RPC + 错误提示）。
//
// 孤儿进程清理（旧 patch-session-orphans.js 的职责）已内联到 deleteSession：
// 删除会话后复用内核自有 owner 清理 API（jobs.disposeOwned / terminals
// .disposeOwned / agent.cancel）终结该 agent 名下全部工作，避免背景进程与
// 持久终端活到内核退出。旧文件已在新内核中失去锚点（deleteSession 已迁入
// workspace-controller），不再单列一个锚点依赖补丁。
//
// 用法：
//   node scripts/patch-session-manage.js [<node_modules 根目录>]
// 同时导出 patchSessionManage(nmRoot, log, stats, options) 供启动补丁与
// 打包补丁复用（覆盖内置副本 / profile fallback / agent overlay / dev）。

const fs = require('node:fs');
const path = require('node:path');
// 原子写与其它补丁脚本共用同一实现（scripts/lib/patch-io.js）。
const { writeFileAtomic } = require('./lib/patch-io');

const MARKER = 'dsh-desktop patch (session manage)';

// ---------------------------------------------------------------------------
// 1. dsh-workspace：unarchiveSession（锚点与 0.1.2-alpha.1 的 archiveSession 同源）
// ---------------------------------------------------------------------------
const WS_ANCHOR = 'archivedSessionIds: [...state.archivedSessionIds, sessionId]\n\t\t\t});\n\t\t});\n\t}';
const WS_INSERT = '\t/**\n\t* dsh-desktop patch (session manage): 从归档集合移除一个会话（恢复）。\n\t* 幂等：不在归档集合中是 no-op；不校验 sessionKnown —— 已删除会话的\n\t* 陈旧归档项也应能清掉。恢复后会话沿用原有 workspace 槽位与显示顺序。\n\t* @param sessionId - 要恢复的会话 id。\n\t*/\n\tunarchiveSession(sessionId) {\n\t\treturn this.enqueueOperation(async () => {\n\t\t\tconst state = this.requireState();\n\t\t\tif (!state.archivedSessionIds.includes(sessionId)) return;\n\t\t\tawait this.setState({\n\t\t\t\t...state,\n\t\t\t\tarchivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId)\n\t\t\t});\n\t\t});\n\t}';

// ---------------------------------------------------------------------------
// 2. dsh-session：SessionStore.remove(id) —— 删除前从 live 注册表摘除
// ---------------------------------------------------------------------------
const SESSION_ANCHOR = 'list() {\n\t\treturn [...this.store.values()].map((entry) => entry.session);\n\t}';
const SESSION_INSERT = 'list() {\n\t\treturn [...this.store.values()].map((entry) => entry.session);\n\t}\n\t/**\n\t* dsh-desktop patch (session manage): 从 live 注册表摘除一个会话并广播\n\t* session/disposed（优雅 flush 后释放持久化状态）。删除前调用：摘除后\n\t* 写路径不再拥有该会话，目录可安全移除；正在运行的会话由调用方先行拒绝。\n\t* @param id - 要摘除的会话 id。\n\t* @returns 是否确实摘除了一个 live 会话。\n\t*/\n\tremove(id) {\n\t\tconst entry = this.store.get(id);\n\t\tif (entry === void 0) return false;\n\t\tthis.detachEntered(entry);\n\t\treturn true;\n\t}';

// ---------------------------------------------------------------------------
// 3. dsh-api-workspace-controller/lib/index.js：两个 RPC 的命令实现 + 控制器门面
// ---------------------------------------------------------------------------
// 3a. 顶部追加 node:fs/promises.rm 与 node:path.dirname 导入（ESM 模块）。
const HOST_IMPORT_ANCHOR = 'import { DirectoryPickerError } from "@deepseek-ai/dsh-host-directory-picker";';
const HOST_IMPORT_INSERT = 'import { DirectoryPickerError } from "@deepseek-ai/dsh-host-directory-picker";\nimport { rm } from "node:fs/promises";\nimport { dirname } from "node:path";';

// 3a-2. WorkspaceController 的 cordis inject 声明补全（2026-08-31 隔离实测根因）。
// deleteSession 访问 this.ctx.agents / this.ctx.sessions / this.ctx.sessionPersistence，
// 而控制器只声明了 ["typert", "workspaceRegistry"] —— cordis 对未声明服务做属性
// 访问直接抛 `cannot get property "agents" without inject`，删除在宿主第一行就炸
// （探针实证：fake-delete-REJECT → alert「操作失败: workspace session delete failed」）。
// 三个服务均为内核根作用域服务（agents：dsh-goal/file-reference-local 同名注入；
// sessions：dsh-session:1674；sessionPersistence：dsh-session-persistence:1478），
// 与 workspaceRegistry 同域，inject 可解析。
const HOST_INJECT_ANCHOR = 'static inject = ["typert", "workspaceRegistry"];';
const HOST_INJECT_INSERT = 'static inject = ["typert", "workspaceRegistry", "agents", "sessions", "sessionPersistence"];';

// 3b. WorkspaceCommands：archiveSession 之后、requireWorkspace 之前插入两个命令。
const HOST_CMDS_ANCHOR = '\t\treturn { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] };\n\t}\n\trequireWorkspace(workspaceId) {';
const HOST_CMDS_INSERT = '\t\treturn { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] };\n\t}\n\t/**\n\t* dsh-desktop patch (session manage): 从归档集合移除一个会话（恢复）。\n\t* 幂等：不在归档集合中是 no-op。恢复后会话沿用原有 workspace 槽位与显示顺序。\n\t* @param request - Session identity to unarchive.\n\t* @returns the complete resulting archive set.\n\t*/\n\tasync unarchiveSession(request) {\n\t\tawait this.ctx.workspaceRegistry.unarchiveSession(request.sessionId);\n\t\treturn { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] };\n\t}\n\t/**\n\t* dsh-desktop patch (session manage): 彻底删除一个会话（日志与附件一并移除，\n\t* 不可恢复）。拒绝正在运行的会话（实时查询 ctx.agents 注册表，宿主权威状态，\n\t* 与 sessions.list 的 running 同源）；随后摘除 live 注册表（session/disposed\n\t* 广播 → 客户端实时移除行）、清理归档集合、从所属工作区 sessionIds 摘除并\n\t* 持久化，最后按 jsonl 布局移除会话目录。\n\t* @param request - Session identity to delete.\n\t* @returns deletion confirmation.\n\t*/\n\tasync deleteSession(request) {\n\t\tconst { sessionId } = request;\n\t\t// 拒绝「正在运行」的会话（agent 活跃时写路径会重建目录，删除不安全）。\n\t\tif (this.ctx.agents.get(sessionId)?.status === "running") {\n\t\t\tthrow failure("session-running", "cannot delete a running session: stop it first", { sessionId });\n\t\t}\n\t\t// 先摘除 live 注册表（detachEntered 优雅 flush 后释放持久化状态并广播\n\t\t// session/disposed）；此后写路径不再拥有该会话，目录移除才安全。\n\t\tthis.ctx.sessions.remove(sessionId);\n\t\t// dsh-desktop patch (session orphans): 上游 agent 只随内核退出卸载，删除\n\t\t// 会话后其名下背景进程与持久终端会一直活到内核退出（孤儿泄漏）。复用内核\n\t\t// 自有 owner 清理 API 终结该 agent 名下全部工作；两者幂等，服务缺失时静默降级。\n\t\ttry {\n\t\t\tconst dshDeletedAgent = this.ctx.agents.get(sessionId);\n\t\t\tif (dshDeletedAgent !== void 0) {\n\t\t\t\ttry { dshDeletedAgent.cancel({ kind: "user" }, { keepInbox: true }); } catch {}\n\t\t\t\tconst dshDeletedJobs = this.ctx.get("jobs");\n\t\t\t\tif (dshDeletedJobs && typeof dshDeletedJobs.disposeOwned === "function") void Promise.resolve(dshDeletedJobs.disposeOwned(dshDeletedAgent)).catch(() => {});\n\t\t\t\tconst dshDeletedTerminals = this.ctx.get("terminals");\n\t\t\t\tif (dshDeletedTerminals && typeof dshDeletedTerminals.disposeOwned === "function") void Promise.resolve(dshDeletedTerminals.disposeOwned(dshDeletedAgent)).catch(() => {});\n\t\t\t}\n\t\t} catch {}\n\t\t// 清理归档集合（含陈旧归档项）。\n\t\tawait this.ctx.workspaceRegistry.unarchiveSession(sessionId);\n\t\t// 从所属工作区的 sessionIds 中摘除并持久化——否则 workspace.json 的\n\t\t// workspaces.<id>.sessionIds 会残留已删除会话引用，磁盘状态与运行时\n\t\t// 状态不一致（issue #82）。用原始 record 判定（sessionIds getter 会按\n\t\t// 已删除会话的 host 路径过滤，看不到残留项）。\n\t\tfor (const ws of this.ctx.workspaceRegistry.list()) {\n\t\t\tif (ws.record && Array.isArray(ws.record.sessionIds) && ws.record.sessionIds.includes(sessionId)) {\n\t\t\t\tawait ws.detachSession(sessionId);\n\t\t\t}\n\t\t}\n\t\t// 移除会话目录（jsonl 布局：listArtifacts 返回 log 文件路径，其父目录即\n\t\t// 会话目录，日志与附件一并移除）。目录移除为 best-effort：失败只告警不\n\t\t// 中断删除主链（已从注册表/归档/工作区摘除）。\n\t\ttry {\n\t\t\tconst artifacts = await this.ctx.sessionPersistence.listArtifacts();\n\t\t\tconst artifact = artifacts.find((entry) => entry && entry.header && entry.header.id === sessionId);\n\t\t\tif (artifact !== void 0) {\n\t\t\t\tawait rm(dirname(artifact.path), { recursive: true, force: true });\n\t\t\t}\n\t\t} catch (error) {\n\t\t\tthis.ctx.logger.warn(`session-manage: session "${sessionId}" directory removal failed: ${String(error)}`);\n\t\t}\n\t\treturn { deleted: true };\n\t}\n\trequireWorkspace(workspaceId) {';

// 3c. WorkspaceController 门面：archiveSession 之后、follow 之前插入两个门面。
const HOST_CTRL_ANCHOR = '\t\tarchiveSession(request) {\n\t\t\treturn this.commands.archiveSession(request);\n\t\t}\n\t\t/**\n\t\t* Stream a complete Workspace baseline followed by ordered increments.';
const HOST_CTRL_INSERT = '\t\tarchiveSession(request) {\n\t\t\treturn this.commands.archiveSession(request);\n\t\t}\n\t\t/**\n\t\t* dsh-desktop patch (session manage): 从归档集合移除一个会话（恢复）。\n\t\t* @param request - Session identity to unarchive.\n\t\t* @returns the complete resulting archive set.\n\t\t*/\n\t\tunarchiveSession(request) {\n\t\t\treturn this.commands.unarchiveSession(request);\n\t\t}\n\t\t/**\n\t\t* dsh-desktop patch (session manage): 彻底删除一个会话。\n\t\t* @param request - Session identity to delete.\n\t\t* @returns deletion confirmation.\n\t\t*/\n\t\tdeleteSession(request) {\n\t\t\treturn this.commands.deleteSession(request);\n\t\t}\n\t\t/**\n\t\t* Stream a complete Workspace baseline followed by ordered increments.';

// ---------------------------------------------------------------------------
// 4. dsh-api-workspace-controller/lib/typert.host.js：STRICT 分发描述符
// ---------------------------------------------------------------------------
// 4a. schema 常量（archiveSession_result 之后、create 之前插入）。
const TYPERT_HOST_SCHEMA_ANCHOR = "const _deepseek_ai_dsh_api_workspace_controller_workspace_archiveSession_result$schema = z.object({\n  'archivedSessionIds': z.array(z.intersection(z.string(), z.unknown())).readonly(),\n})\nconst _deepseek_ai_dsh_api_workspace_controller_workspace_create_parameter_0$schema";
const TYPERT_HOST_SCHEMA_INSERT = "const _deepseek_ai_dsh_api_workspace_controller_workspace_archiveSession_result$schema = z.object({\n  'archivedSessionIds': z.array(z.intersection(z.string(), z.unknown())).readonly(),\n})\nconst _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_parameter_0$schema = z.object({\n  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),\n})\nconst _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_result$schema = z.object({\n  'archivedSessionIds': z.array(z.intersection(z.string(), z.unknown())).readonly(),\n})\nconst _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_parameter_0$schema = z.object({\n  'sessionId': z.intersection(z.string(), z.unknown()).readonly(),\n})\nconst _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_result$schema = z.object({\n  'deleted': z.boolean().readonly(),\n})\nconst _deepseek_ai_dsh_api_workspace_controller_workspace_create_parameter_0$schema";

// 4b. invocation 条目（archiveSession 之后、create 之前插入）。
const TYPERT_HOST_INVOKE_ANCHOR = '      sourceLocation: {"file":"packages/api/workspace-controller/src/index.ts","line":108,"column":3},\n    },\n    {\n      id: \'@deepseek-ai/dsh-api-workspace-controller#workspace/create\',';
const TYPERT_HOST_INVOKE_INSERT = '      sourceLocation: {"file":"packages/api/workspace-controller/src/index.ts","line":108,"column":3},\n    },\n    {\n      id: \'@deepseek-ai/dsh-api-workspace-controller#workspace/unarchiveSession\',\n      service: \'workspaceController\',\n      namespace: \'workspace\',\n      method: \'unarchiveSession\',\n      invocation: { kind: \'direct\' },\n      parameters: [\n        {\n          name: \'request\',\n          wire: \'request\',\n          source: \'json\',\n          codec: {\n            mode: \'strict\',\n            typeSymbol: \'@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceUnarchiveSessionRequest\',\n            schema: _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_parameter_0$schema,\n          },\n        },\n      ],\n      result: {\n        mode: \'strict\',\n        typeSymbol: \'@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceUnarchiveValue\',\n        schema: _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_result$schema,\n      },\n      sourceLocation: {"file":"packages/api/workspace-controller/src/index.ts","line":999,"column":3},\n    },\n    {\n      id: \'@deepseek-ai/dsh-api-workspace-controller#workspace/deleteSession\',\n      service: \'workspaceController\',\n      namespace: \'workspace\',\n      method: \'deleteSession\',\n      invocation: { kind: \'direct\' },\n      parameters: [\n        {\n          name: \'request\',\n          wire: \'request\',\n          source: \'json\',\n          codec: {\n            mode: \'strict\',\n            typeSymbol: \'@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionRequest\',\n            schema: _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_parameter_0$schema,\n          },\n        },\n      ],\n      result: {\n        mode: \'strict\',\n        typeSymbol: \'@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionValue\',\n        schema: _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_result$schema,\n      },\n      sourceLocation: {"file":"packages/api/workspace-controller/src/index.ts","line":999,"column":3},\n    },\n    {\n      id: \'@deepseek-ai/dsh-api-workspace-controller#workspace/create\',';

// ---------------------------------------------------------------------------
// 5. dsh-api-workspace-controller/lib/client.js：客户端模型/服务门面
// ---------------------------------------------------------------------------
// 5a. ClientWorkspaceModel：archiveSession 之后、replaceBaseline 之前插入。
const CLIENT_MODEL_ANCHOR = '\t\t\tasync archiveSession(sessionId) {\n\t\t\t\tconst result = await this.remote.archiveSession({ sessionId });\n\t\t\t\tif (result.ok) this.installArchived(result.value.archivedSessionIds);\n\t\t\t\treturn result;\n\t\t\t}\n\t\t\t/**\n\t\t\t* Replace the projection from one complete stream-generation baseline.';
const CLIENT_MODEL_INSERT = '\t\t\tasync archiveSession(sessionId) {\n\t\t\t\tconst result = await this.remote.archiveSession({ sessionId });\n\t\t\t\tif (result.ok) this.installArchived(result.value.archivedSessionIds);\n\t\t\t\treturn result;\n\t\t\t}\n\t\t\t/**\n\t\t\t* dsh-desktop patch (session manage): 恢复一个归档会话并安装返回的完整归档集。\n\t\t\t* @param sessionId - Session to unarchive.\n\t\t\t* @returns generated Remote result.\n\t\t\t*/\n\t\t\tasync unarchiveSession(sessionId) {\n\t\t\t\tconst result = await this.remote.unarchiveSession({ sessionId });\n\t\t\t\tif (result.ok) this.installArchived(result.value.archivedSessionIds);\n\t\t\t\treturn result;\n\t\t\t}\n\t\t\t/**\n\t\t\t* dsh-desktop patch (session manage): 删除一个会话。\n\t\t\t* @param sessionId - Session to delete.\n\t\t\t* @returns generated Remote result.\n\t\t\t*/\n\t\t\tasync deleteSession(sessionId) {\n\t\t\t\treturn await this.remote.deleteSession({ sessionId });\n\t\t\t}\n\t\t\t/**\n\t\t\t* Replace the projection from one complete stream-generation baseline.';

// 5b. WorkspaceController（客户端服务）：archiveSession 之后、insertSessionBefore 之前。
const CLIENT_CTRL_ANCHOR = '\t\t\tasync archiveSession(sessionId) {\n\t\t\t\tconst result = await this.model.archiveSession(sessionId);\n\t\t\t\tif (!result.ok) throw commandError("session archive", result.error);\n\t\t\t}\n\t\t\tasync insertSessionBefore(workspaceId, sessionId, beforeSessionId) {';
const CLIENT_CTRL_INSERT = '\t\t\tasync archiveSession(sessionId) {\n\t\t\t\tconst result = await this.model.archiveSession(sessionId);\n\t\t\t\tif (!result.ok) throw commandError("session archive", result.error);\n\t\t\t}\n\t\t\tasync unarchiveSession(sessionId) {\n\t\t\t\tconst result = await this.model.unarchiveSession(sessionId);\n\t\t\t\tif (!result.ok) throw commandError("session unarchive", result.error);\n\t\t\t}\n\t\t\tasync deleteSession(sessionId) {\n\t\t\t\tconst result = await this.model.deleteSession(sessionId);\n\t\t\t\tif (!result.ok) throw commandError("session delete", result.error);\n\t\t\t}\n\t\t\tasync insertSessionBefore(workspaceId, sessionId, beforeSessionId) {';

// ---------------------------------------------------------------------------
// 6. dsh-api-remotes/lib/client.js：客户端 remote 注册表 bundle
// ---------------------------------------------------------------------------
// 6a. schema 常量（archiveSession_result 之后、create 之前插入）。
const REMOTES_SCHEMA_ANCHOR = 'const _deepseek_ai_dsh_api_workspace_controller_workspace_archiveSession_result$schema = object({ "archivedSessionIds": array(intersection(string(), unknown())).readonly() });\n\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_create_parameter_0$schema';
const REMOTES_SCHEMA_INSERT = 'const _deepseek_ai_dsh_api_workspace_controller_workspace_archiveSession_result$schema = object({ "archivedSessionIds": array(intersection(string(), unknown())).readonly() });\n\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_parameter_0$schema = object({ "sessionId": intersection(string(), unknown()).readonly() });\n\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_result$schema = object({ "archivedSessionIds": array(intersection(string(), unknown())).readonly() });\n\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_parameter_0$schema = object({ "sessionId": intersection(string(), unknown()).readonly() });\n\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_result$schema = object({ "deleted": boolean().readonly() });\n\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_create_parameter_0$schema';

// 6b. descriptor 条目（archiveSession 之后、create 之前插入）。
const REMOTES_INVOKE_ANCHOR = '\t\t\t\t\tsourceLocation: {\n\t\t\t\t\t\t"file": "packages/api/workspace-controller/src/index.ts",\n\t\t\t\t\t\t"line": 108,\n\t\t\t\t\t\t"column": 3\n\t\t\t\t\t}\n\t\t\t\t},\n\t\t\t\t{\n\t\t\t\t\tid: "@deepseek-ai/dsh-api-workspace-controller#workspace/create",';
const REMOTES_INVOKE_INSERT = '\t\t\t\t\tsourceLocation: {\n\t\t\t\t\t\t"file": "packages/api/workspace-controller/src/index.ts",\n\t\t\t\t\t\t"line": 108,\n\t\t\t\t\t\t"column": 3\n\t\t\t\t\t}\n\t\t\t\t},\n\t\t\t\t{\n\t\t\t\t\tid: "@deepseek-ai/dsh-api-workspace-controller#workspace/unarchiveSession",\n\t\t\t\t\tservice: "workspaceController",\n\t\t\t\t\tnamespace: "workspace",\n\t\t\t\t\tmethod: "unarchiveSession",\n\t\t\t\t\tinvocation: { kind: "direct" },\n\t\t\t\t\tparameters: [{\n\t\t\t\t\t\tname: "request",\n\t\t\t\t\t\twire: "request",\n\t\t\t\t\t\tsource: "json",\n\t\t\t\t\t\tcodec: {\n\t\t\t\t\t\t\tmode: "strict",\n\t\t\t\t\t\t\ttypeSymbol: "@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceUnarchiveSessionRequest",\n\t\t\t\t\t\t\tschema: _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_parameter_0$schema\n\t\t\t\t\t\t}\n\t\t\t\t\t}],\n\t\t\t\t\tresult: {\n\t\t\t\t\t\tmode: "strict",\n\t\t\t\t\t\ttypeSymbol: "@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceUnarchiveValue",\n\t\t\t\t\t\tschema: _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_result$schema\n\t\t\t\t\t},\n\t\t\t\t\tsourceLocation: {\n\t\t\t\t\t\t"file": "packages/api/workspace-controller/src/index.ts",\n\t\t\t\t\t\t"line": 999,\n\t\t\t\t\t\t"column": 3\n\t\t\t\t\t}\n\t\t\t\t},\n\t\t\t\t{\n\t\t\t\t\tid: "@deepseek-ai/dsh-api-workspace-controller#workspace/deleteSession",\n\t\t\t\t\tservice: "workspaceController",\n\t\t\t\t\tnamespace: "workspace",\n\t\t\t\t\tmethod: "deleteSession",\n\t\t\t\t\tinvocation: { kind: "direct" },\n\t\t\t\t\tparameters: [{\n\t\t\t\t\t\tname: "request",\n\t\t\t\t\t\twire: "request",\n\t\t\t\t\t\tsource: "json",\n\t\t\t\t\t\tcodec: {\n\t\t\t\t\t\t\tmode: "strict",\n\t\t\t\t\t\t\ttypeSymbol: "@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionRequest",\n\t\t\t\t\t\t\tschema: _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_parameter_0$schema\n\t\t\t\t\t\t}\n\t\t\t\t\t}],\n\t\t\t\t\tresult: {\n\t\t\t\t\t\tmode: "strict",\n\t\t\t\t\t\ttypeSymbol: "@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionValue",\n\t\t\t\t\t\tschema: _deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_result$schema\n\t\t\t\t\t},\n\t\t\t\t\tsourceLocation: {\n\t\t\t\t\t\t"file": "packages/api/workspace-controller/src/index.ts",\n\t\t\t\t\t\t"line": 999,\n\t\t\t\t\t\t"column": 3\n\t\t\t\t\t}\n\t\t\t\t},\n\t\t\t\t{\n\t\t\t\t\tid: "@deepseek-ai/dsh-api-workspace-controller#workspace/create",';

// ---------------------------------------------------------------------------
// 7. dsh-client-ui-workspace：会话行菜单「删除对话」+ 翻译
// ---------------------------------------------------------------------------
const UI_MENU_ANCHOR = '{\n\t\t\t\t\tid: "archive",\n\t\t\t\t\tlabel: t("menu.archiveSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })\n\t\t\t\t}\n\t\t\t];';
const UI_MENU_INSERT = '{\n\t\t\t\t\tid: "archive",\n\t\t\t\t\tlabel: t("menu.archiveSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })\n\t\t\t\t},\n\t\t\t\t// dsh-desktop patch (session manage): 归档下方增加删除。\n\t\t\t\t// 桥 window.__dshSessionManager 由 dsh-session-manager 插件提供；桥缺失\n\t\t\t\t// 时隐藏「删除对话」项（显式降级，而非可选链静默无反应）。\n\t\t\t\t...(window.__dshSessionManager && typeof window.__dshSessionManager.deleteSession === "function" ? [{\n\t\t\t\t\tid: "delete",\n\t\t\t\t\tlabel: t("menu.deleteSession")\n\t\t\t\t}] : [])\n\t\t\t];';

const UI_SELECT_ANCHOR = 'if (id === "archive") onArchive(node.id);';
const UI_SELECT_INSERT = 'if (id === "archive") onArchive(node.id);\n\t\t\t\t\t\t\t\t\tif (id === "delete") window.__dshSessionManager?.deleteSession(node.id);';

const UI_ZH_ANCHOR = '"menu.archiveSession": "归档会话",';
const UI_ZH_INSERT = '"menu.archiveSession": "归档会话",\n\t\t\t"menu.deleteSession": "删除对话",';
const UI_EN_ANCHOR = '"menu.archiveSession": "Archive session",';
const UI_EN_INSERT = '"menu.archiveSession": "Archive session",\n\t\t\t"menu.deleteSession": "Delete conversation",';

// ---------------------------------------------------------------------------
// 工具：在文件中做「锚点必须存在 + 增量幂等」的替换
// ---------------------------------------------------------------------------
// 增量幂等（2026-08-31）：幂等判定从「全局 MARKER 存在即整文件跳过」改为
// 「逐替换项以 insert 自身判已完成」。背景：已打补丁的存量文件（旧版补丁
// 产物）带着 MARKER，后加的替换项（如 3a-2 inject 补全）永远到不了它们——
// 启动补丁每次 boot 都跑，全局跳过 = 新修复对存量安装零生效。逐项判定下：
// 旧替换在存量文件里 insert 已在 → 跳过；新替换 insert 不在 → 锚点命中 → 补上。
// 部分应用时任一锚点缺失即整体放弃（不落盘），保持单文件原子性。
function applyReplacements(file, replacements, log, stats, options) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('session-manage 补丁: 读取失败 ' + file + ': ' + err.message);
    return false;
  }
  const alreadyMarked = src.includes(MARKER);
  let changed = false;
  for (const { anchor, insert } of replacements) {
    if (src.includes(insert)) continue; // 本替换已完成（insert 自身即 done 标记）
    if (!src.includes(anchor)) {
      log('session-manage 补丁: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file + ' :: ' + anchor.slice(0, 60));
      if (stats) stats.anchorMissing += 1;
      return false;
    }
    src = src.replace(anchor, insert);
    changed = true;
  }
  if (!changed && alreadyMarked) {
    log('session-manage 补丁: 已应用，跳过 ' + file);
    return false;
  }
  if (!alreadyMarked) {
    src = '// ' + MARKER + ': 对话删除/归档管理运行时补丁\n' + src;
  }
  try {
    if (options && options.dryRun) {
      log('session-manage 补丁: dry-run: 将应用 ' + file);
      return false; // dryRun 不落盘，不计为已写
    }
    writeFileAtomic(file, src);
    log('session-manage 补丁: 已应用 ' + file);
    return true;
  } catch (err) {
    log('session-manage 补丁: 写入失败 ' + file + ': ' + err.message);
    return false;
  }
}

/**
 * 对某个 node_modules 根目录应用对话删除/归档管理补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number}} [stats]
 * @param {{dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchSessionManage(nmRoot, log = () => {}, stats, options) {
  const targets = [
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-workspace', 'lib', 'index.js'),
      replacements: [{ anchor: WS_ANCHOR, insert: WS_ANCHOR + '\n' + WS_INSERT }],
    },
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-session', 'lib', 'index.js'),
      replacements: [{ anchor: SESSION_ANCHOR, insert: SESSION_INSERT }],
    },
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-api-workspace-controller', 'lib', 'index.js'),
      replacements: [
        { anchor: HOST_IMPORT_ANCHOR, insert: HOST_IMPORT_INSERT },
        { anchor: HOST_INJECT_ANCHOR, insert: HOST_INJECT_INSERT },
        { anchor: HOST_CMDS_ANCHOR, insert: HOST_CMDS_INSERT },
        { anchor: HOST_CTRL_ANCHOR, insert: HOST_CTRL_INSERT },
      ],
    },
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-api-workspace-controller', 'lib', 'typert.host.js'),
      replacements: [
        { anchor: TYPERT_HOST_SCHEMA_ANCHOR, insert: TYPERT_HOST_SCHEMA_INSERT },
        { anchor: TYPERT_HOST_INVOKE_ANCHOR, insert: TYPERT_HOST_INVOKE_INSERT },
      ],
    },
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-api-workspace-controller', 'lib', 'client.js'),
      replacements: [
        { anchor: CLIENT_MODEL_ANCHOR, insert: CLIENT_MODEL_INSERT },
        { anchor: CLIENT_CTRL_ANCHOR, insert: CLIENT_CTRL_INSERT },
      ],
    },
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-api-remotes', 'lib', 'client.js'),
      replacements: [
        { anchor: REMOTES_SCHEMA_ANCHOR, insert: REMOTES_SCHEMA_INSERT },
        { anchor: REMOTES_INVOKE_ANCHOR, insert: REMOTES_INVOKE_INSERT },
      ],
    },
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
      replacements: [
        { anchor: UI_MENU_ANCHOR, insert: UI_MENU_INSERT },
        { anchor: UI_SELECT_ANCHOR, insert: UI_SELECT_INSERT },
        { anchor: UI_ZH_ANCHOR, insert: UI_ZH_INSERT },
        { anchor: UI_EN_ANCHOR, insert: UI_EN_INSERT },
      ],
    },
  ];
  let changed = 0;
  for (const t of targets) {
    if (!fs.existsSync(t.file)) continue;
    if (applyReplacements(t.file, t.replacements, log, stats, options)) changed += 1;
  }
  return changed;
}

module.exports = { patchSessionManage, MARKER };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchSessionManage(root, (m) => console.log(m));
  console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}
