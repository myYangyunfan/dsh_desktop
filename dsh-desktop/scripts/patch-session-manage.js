'use strict';

// 对话删除 / 归档管理运行时补丁（幂等、锚点不匹配时跳过且绝不损坏文件）。
//
// 背景：dsh 只有归档（workspace 域 archivedSessionIds）没有删除；取消归档
// （unarchive）在注册表层也没有。本补丁在官方包上做外科手术式扩展，打通
// 「删除按钮 + 设置内归档管理面板」所需的完整链路：
//
//   1. @deepseek-ai/dsh-workspace        —— WorkspaceRegistry 增加
//      unarchiveSession(sessionId)（幂等地从归档集合移除并持久化）。
//      【0.2.0-rc.2 退役】上游已原生同名方法，语义逐字相同，见下文第 1 节。
//   2. @deepseek-ai/dsh-session          —— SessionStore 增加 remove(id)
//      （从 live 注册表摘除，优雅 flush 后释放持久化状态并广播
//      session/disposed）。
//   3. @deepseek-ai/dsh-api-workspace-controller（旧 dsh-host-apiproxy 拆分后
//      的 workspace 宿主控制器）—— 新增两个 RPC：
//        · workspace.unarchiveSession    恢复归档（返回完整归档集，域变更
//          自动广播 archived 帧，客户端实时恢复显示）；【0.2.0-rc.2 起原生，
//          本层只保留 deleteSession】
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
//      确认框 + RPC + 错误提示）。【0.2.0-rc.2 起该菜单改为 slot 列表；
//      0.2.2-rc.1 起再改为 registerSessionMenus 里的 contextMenus 数据项，
//      本层改为注册 order 650 的数据项，见第 7 节】
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

// 「桥缺失则不渲染」判定式。必须与 scripts/lib/host-capabilities.js 的
// DELETE_SESSION_MENU_GUARD 逐字一致——unit-host-capabilities 的「桥契约一致性」
// 用例按字面量在本文件源码里核对，改这里就得同步改那边，否则测试红。
// 用单引号常量再拼进注入体：字面量留在源码里（契约可核对），落到内核文件的字节
// 又与清单完全一致（不会因双引号转义而漂移）。
const DELETE_SESSION_MENU_GUARD = 'window.__dshSessionManager && typeof window.__dshSessionManager.deleteSession === "function"';

// ---------------------------------------------------------------------------
// 1. dsh-workspace：unarchiveSession —— 0.2.0-rc.2 起原生，本层退役。
//    上游 WorkspaceRegistry.unarchiveSession（lib/index.js:551）与我们的注入体
//    逐语义相同：enqueueOperation + requireState，不在归档集合中即 no-op
//    （不校验 sessionKnown，已删除会话的陈旧归档项仍能清掉），命中则
//    setState 过滤后持久化。故 WS_ANCHOR / WS_INSERT 删除，dsh-workspace 不再
//    是补丁靶。
// ---------------------------------------------------------------------------

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
// 0.2.1-rc.1 重锚：上游把单行数组改写成多行、并新增 "remoteAccess"，故锚点取
// 五行形态（rc.2 的单行字面串在此已 0 命中）。
const HOST_INJECT_ANCHOR = [
  '\t\tstatic inject = [',
  '\t\t\t"remoteAccess",',
  '\t\t\t"typert",',
  '\t\t\t"workspaceRegistry"',
  '\t\t];',
].join('\n');
const HOST_INJECT_INSERT = [
  '\t\tstatic inject = [',
  '\t\t\t"remoteAccess",',
  '\t\t\t"typert",',
  '\t\t\t"workspaceRegistry",',
  '\t\t\t"agents",',
  '\t\t\t"sessions",',
  '\t\t\t"sessionPersistence"',
  '\t\t];',
].join('\n');

// 3b. WorkspaceCommands：在原生 unarchiveSession 命令之后、pinSession 之前插入
// deleteSession 命令。0.2.0-rc.2 重锚：archiveSession 与 unarchiveSession 之间
// 已不相邻（unarchive 原生、其后还有 pin/unpin），故锚点改取原生 unarchiveSession
// 命令本体四行（全文件唯一），删除原注入里我们自己那份 unarchiveSession 命令
// （上游已提供，语义相同）。
const HOST_CMDS_ANCHOR = '\tasync unarchiveSession(request) {\n\t\tawait this.ctx.workspaceRegistry.unarchiveSession(request.sessionId);\n\t\treturn { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] };\n\t}';
const HOST_CMDS_INSERT = HOST_CMDS_ANCHOR + '\n\t/**\n\t* dsh-desktop patch (session manage): 彻底删除一个会话（日志与附件一并移除，\n\t* 不可恢复）。拒绝正在运行的会话（实时查询 ctx.agents 注册表，宿主权威状态，\n\t* 与 sessions.list 的 running 同源）；随后摘除 live 注册表（session/disposed\n\t* 广播 → 客户端实时移除行）、清理归档集合、从所属工作区 sessionIds 摘除并\n\t* 持久化，最后按 jsonl 布局移除会话目录。\n\t* @param request - Session identity to delete.\n\t* @returns deletion confirmation.\n\t*/\n\tasync deleteSession(request) {\n\t\tconst { sessionId } = request;\n\t\t// 拒绝「正在运行」的会话（agent 活跃时写路径会重建目录，删除不安全）。\n\t\tif (this.ctx.agents.get(sessionId)?.status === "running") {\n\t\t\tthrow new RemoteError("session-running", "cannot delete a running session: stop it first", { sessionId });\n\t\t}\n\t\t// 先摘除 live 注册表（detachEntered 优雅 flush 后释放持久化状态并广播\n\t\t// session/disposed）；此后写路径不再拥有该会话，目录移除才安全。\n\t\tthis.ctx.sessions.remove(sessionId);\n\t\t// dsh-desktop patch (session orphans): 上游 agent 只随内核退出卸载，删除\n\t\t// 会话后其名下背景进程与持久终端会一直活到内核退出（孤儿泄漏）。复用内核\n\t\t// 自有 owner 清理 API 终结该 agent 名下全部工作；两者幂等，服务缺失时静默降级。\n\t\ttry {\n\t\t\tconst dshDeletedAgent = this.ctx.agents.get(sessionId);\n\t\t\tif (dshDeletedAgent !== void 0) {\n\t\t\t\ttry { dshDeletedAgent.cancel({ kind: "user" }, { keepInbox: true }); } catch {}\n\t\t\t\tconst dshDeletedJobs = this.ctx.get("jobs");\n\t\t\t\tif (dshDeletedJobs && typeof dshDeletedJobs.disposeOwned === "function") void Promise.resolve(dshDeletedJobs.disposeOwned(dshDeletedAgent)).catch(() => {});\n\t\t\t\tconst dshDeletedTerminals = this.ctx.get("terminals");\n\t\t\t\tif (dshDeletedTerminals && typeof dshDeletedTerminals.disposeOwned === "function") void Promise.resolve(dshDeletedTerminals.disposeOwned(dshDeletedAgent)).catch(() => {});\n\t\t\t}\n\t\t} catch {}\n\t\t// 清理归档集合（含陈旧归档项）；unarchiveSession 系 0.2.0-rc.2 原生。\n\t\tawait this.ctx.workspaceRegistry.unarchiveSession(sessionId);\n\t\t// 从所属工作区的 sessionIds 中摘除并持久化——否则 workspace.json 的\n\t\t// workspaces.<id>.sessionIds 会残留已删除会话引用，磁盘状态与运行时\n\t\t// 状态不一致（issue #82）。用原始 record 判定（sessionIds getter 会按\n\t\t// 已删除会话的 host 路径过滤，看不到残留项）。\n\t\tfor (const ws of this.ctx.workspaceRegistry.list()) {\n\t\t\tif (ws.record && Array.isArray(ws.record.sessionIds) && ws.record.sessionIds.includes(sessionId)) {\n\t\t\t\tawait ws.detachSession(sessionId);\n\t\t\t}\n\t\t}\n\t\t// 移除会话目录（jsonl 布局：listArtifacts 返回 log 文件路径，其父目录即\n\t\t// 会话目录，日志与附件一并移除）。目录移除为 best-effort：失败只告警不\n\t\t// 中断删除主链（已从注册表/归档/工作区摘除）。\n\t\ttry {\n\t\t\tconst artifacts = await this.ctx.sessionPersistence.listArtifacts();\n\t\t\tconst artifact = artifacts.find((entry) => entry && entry.header && entry.header.id === sessionId);\n\t\t\tif (artifact !== void 0) {\n\t\t\t\tawait rm(dirname(artifact.path), { recursive: true, force: true });\n\t\t\t}\n\t\t} catch (error) {\n\t\t\tthis.ctx.logger.warn(`session-manage: session "${sessionId}" directory removal failed: ${String(error)}`);\n\t\t}\n\t\treturn { deleted: true };\n\t}';

// 3c. WorkspaceController 门面：unarchive 已原生（0.1.6），只注入 deleteSession
// 门面。锚定门面类自身的 unarchive（commands 委托风格，双 tab），与 3b 的
// commands 类区域完全解耦。
const HOST_CTRL_ANCHOR = "\t\tunarchiveSession(request) {\n\t\t\treturn this.commands.unarchiveSession(request);\n\t\t}";
const HOST_CTRL_INSERT = "\t\tunarchiveSession(request) {\n\t\t\treturn this.commands.unarchiveSession(request);\n\t\t}\n\t\t/**\n\t\t* dsh-desktop patch (session manage): 彻底删除一个会话（后端见 3b 注入的\n\t\t* commands.deleteSession）。\n\t\t* @param request - Session identity to delete.\n\t\t* @returns deletion confirmation.\n\t\t*/\n\t\tdeleteSession(request) {\n\t\t\treturn this.commands.deleteSession(request);\n\t\t}";

// ---------------------------------------------------------------------------
// 4. dsh-api-workspace-controller/lib/typert.host.js：STRICT 分发描述符
// ---------------------------------------------------------------------------
// 0.2.1-rc.1 重锚（两处结构性变化）：
//   · descriptors 从「数组 + {id, service, namespace, method}」改成「以
//     '<namespace>/<method>' 为键的对象」，每个参数还补了 strictCodec + 内联 jsonSchema；
//   · 载荷 schema 不再包 z.intersection(z.string(), z.unknown())，改直写 z.string()，
//     且 parameter / result（宽松段）与 parameter_strict（strictObject 段）分两段落款。
// 锚点一律只取「原生 unarchiveSession 自己的块/收尾」，注入体 = 锚点原文 + 追加内容，
// 因此 insert 原样保留 anchor（unit-session-manage 的「链式安全」不变量：不与共享同一
// 原生锚的其它补丁互相挤掉）。这些块在各自文件里实测唯一。
const TW = '_deepseek_ai_dsh_api_workspace_controller_workspace_';
/** 宽松对象 schema 常量块（生成器形态：let $value + const = () => (…??= z.object({…}))）。 */
const hostLooseSchema = (name, body) =>
  `let ${TW}${name}$schema$value\nconst ${TW}${name}$schema = () => (${TW}${name}$schema$value ??= z.object({\n  '${body[0]}': ${body[1]},\n}))`;
/** strictObject 参数 schema 常量块。 */
const hostStrictSchema = (name, body) =>
  `let ${TW}${name}_strict$schema$value\nconst ${TW}${name}_strict$schema = () => (${TW}${name}_strict$schema$value ??= z.strictObject({\n  '${body[0]}': ${body[1]},\n}))`;

// 4a. 宽松段：unarchiveSession_result 之后插 deleteSession 的 parameter_0 + result。
const TYPERT_HOST_SCHEMA_ANCHOR =
  hostLooseSchema('unarchiveSession_result', ['archivedSessionIds', 'z.array(z.string()).readonly()']);
const TYPERT_HOST_SCHEMA_INSERT = [
  TYPERT_HOST_SCHEMA_ANCHOR,
  hostLooseSchema('deleteSession_parameter_0', ['sessionId', 'z.string().readonly()']),
  hostLooseSchema('deleteSession_result', ['deleted', 'z.boolean().readonly()']),
].join('\n');

// 4a-2. strictObject 段：unarchiveSession_parameter_0_strict 之后插 deleteSession 同名块
// （descriptor 的 strictCodec.create 要引用它，缺一个就是半个注入）。
const TYPERT_HOST_STRICT_ANCHOR =
  hostStrictSchema('unarchiveSession_parameter_0', ['sessionId', 'z.string().readonly()']);
const TYPERT_HOST_STRICT_INSERT = [
  TYPERT_HOST_STRICT_ANCHOR,
  hostStrictSchema('deleteSession_parameter_0', ['sessionId', 'z.string().readonly()']),
].join('\n');

// 4b. descriptor 条目（原生 'workspace/unarchiveSession' 收尾之后插 deleteSession 条目；
// 锚点取该条目的 sourceLocation(line 170) + 收尾两行，实测全文件唯一）。
const TYPERT_HOST_INVOKE_ANCHOR = [
  '      sourceLocation: {"file":"packages/api/workspace-controller/src/index.ts","line":170,"column":3},',
  '    },',
].join('\n');
const TYPERT_HOST_INVOKE_INSERT = [
  TYPERT_HOST_INVOKE_ANCHOR,
  "    'workspace/deleteSession': {",
  "      service: 'workspaceController',",
  "      description: 'Permanently delete one Session (log and attachments included).',",
  '      invocation: { kind: \'direct\' },',
  '      parameters: [',
  '        {',
  "          name: 'request',",
  "          description: 'Session identity to delete.',",
  "          source: 'json',",
  '          codec: {',
  "            mode: 'strict',",
  "            typeSymbol: '@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionRequest',",
  `            create: ${TW}deleteSession_parameter_0$schema,`,
  '            jsonSchema: {"type":"object","properties":{"sessionId":{"type":"string"}},"required":["sessionId"],"additionalProperties":true},',
  '          },',
  '          strictCodec: {',
  "            mode: 'strict',",
  "            typeSymbol: '@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionRequest',",
  `            create: ${TW}deleteSession_parameter_0_strict$schema,`,
  '            jsonSchema: {"type":"object","properties":{"sessionId":{"type":"string"}},"required":["sessionId"],"additionalProperties":false},',
  '          },',
  '        },',
  '      ],',
  '      result: {',
  "        mode: 'strict',",
  "        typeSymbol: '@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionValue',",
  `        create: ${TW}deleteSession_result$schema,`,
  "        description: 'deletion confirmation.',",
  '        jsonSchema: {"type":"object","properties":{"deleted":{"type":"boolean"}},"required":["deleted"],"additionalProperties":true},',
  '      },',
  '      sourceLocation: {"file":"packages/api/workspace-controller/src/index.ts","line":999,"column":3},',
  '    },',
].join('\n');

// ---------------------------------------------------------------------------
// 5. dsh-api-workspace-controller/lib/client.js：客户端模型/服务门面
// ---------------------------------------------------------------------------
// 5a. ClientWorkspaceModel：原生 unarchiveSession（带 requestSeq 竞态守卫）之后、
// replaceBaseline 之前插入 deleteSession（unarchive 0.1.6 已原生）。
// 0.2.2-rc.2 重锚：`lib/client.js` 起改成**压缩产物**（整包 3 行、方法之间无换行、
// 模板字符串替掉双引号、无尾随分号），于是旧的「多行 + 制表符」锚点整体失效。
// 新锚取方法原文单行字节（全文件唯一），不依赖任何缩进/换行——换代只剩字节漂移一种风险。
const CLIENT_MODEL_ANCHOR = 'async unarchiveSession(sessionId){const requestSeq=++this.archiveRequestSeq;const result=await this.remote.unarchiveSession({sessionId});if(result.ok&&requestSeq===this.archiveRequestSeq)this.installArchived(result.value.archivedSessionIds);return result}';
const CLIENT_MODEL_INSERT = CLIENT_MODEL_ANCHOR + '\n// dsh-desktop patch (session manage): 删除一个会话（日志与附件一并移除，不可恢复）。\nasync deleteSession(sessionId){return await this.remote.deleteSession({sessionId})}';

// 5b. WorkspaceController（客户端服务）：原生 unarchiveSession 之后、
// insertSessionBefore 之前插入 deleteSession。
const CLIENT_CTRL_ANCHOR = 'async unarchiveSession(sessionId){const result=await this.model.unarchiveSession(sessionId);if(!result.ok)throw commandError(`session unarchive`,result.error)}';
const CLIENT_CTRL_INSERT = CLIENT_CTRL_ANCHOR + '\n// dsh-desktop patch (session manage): 删除一个会话（后端见 ClientWorkspaceModel.deleteSession）。\nasync deleteSession(sessionId){const result=await this.model.deleteSession(sessionId);if(!result.ok)throw commandError(`session delete`,result.error)}';

// ---------------------------------------------------------------------------
// 6. dsh-api-remotes/lib/client.js：客户端 remote 注册表 bundle
// ---------------------------------------------------------------------------
// 0.2.1-rc.1 重锚：与 4 节同型漂移——descriptors 改键控对象、参数补 strictCodec +
// jsonSchema、载荷 schema 去 intersection；另有两点 bundle 侧差异：zod 走 `zod.z.`
// 命名空间前缀，且每条 schema 语句以分号收尾、缩进为制表符。
// 0.2.2-rc.2 重锚：remotes 的客户端 bundle 同样是**压缩产物**——`let`/`const` 两条
// 语句挤在同一行、`??=` 与对象字面量无空格、属性键仍是双引号、整体无缩进。锚与注入
// 体都按压缩形生成（换行只当语句分隔，合法且不依赖缩进）。
/** 客户端 bundle 的宽松对象 schema 常量两条语句（压缩形）。 */
const remotesLooseSchema = (name, body) =>
  `let ${TW}${name}$schema$value;const ${TW}${name}$schema=()=>${TW}${name}$schema$value??=zod.z.object({${body}});`;
/** 客户端 bundle 的 strictObject 参数 schema 常量两条语句（压缩形）。 */
const remotesStrictSchema = (name, body) =>
  `let ${TW}${name}_strict$schema$value;const ${TW}${name}_strict$schema=()=>${TW}${name}_strict$schema$value??=zod.z.strictObject({${body}});`;

// 6a. 宽松段 + strict 段（各锚「unarchive 自己的块」，注入体=锚点原文+追加，
// 与 4 节同理由：insert 必须原样保留 anchor）。
const REMOTES_SCHEMA_ANCHOR =
  remotesLooseSchema('unarchiveSession_result', '"archivedSessionIds":zod.z.array(zod.z.string()).readonly()');
const REMOTES_SCHEMA_INSERT = [
  REMOTES_SCHEMA_ANCHOR,
  remotesLooseSchema('deleteSession_parameter_0', '"sessionId":zod.z.string().readonly()'),
  remotesLooseSchema('deleteSession_result', '"deleted":zod.z.boolean().readonly()'),
].join('\n');
const REMOTES_STRICT_ANCHOR =
  remotesStrictSchema('unarchiveSession_parameter_0', '"sessionId":zod.z.string().readonly()');
const REMOTES_STRICT_INSERT = [
  REMOTES_STRICT_ANCHOR,
  remotesStrictSchema('deleteSession_parameter_0', '"sessionId":zod.z.string().readonly()'),
].join('\n');

// 6b. descriptor 条目（插在原生 "workspace/unpinSession" descriptor 之前——它在
// 字节序上紧随 unarchiveSession 的 descriptor）。锚取 unpin 条目的开头（全文件唯一），
// insert 原样保留锚：链式安全契约要求「insert 必须包含自己的锚」，否则与共享同一
// 原生锚的补丁会互相挤掉。
// 0.2.2-rc.2 压缩形：descriptor 里字符串值是模板字面量、键名不带引号、无空行缩进。
const REMOTES_INVOKE_ANCHOR = '"workspace/unpinSession":{service:`workspaceController`,';
const REMOTES_DELETE_DESC = [
  '"workspace/deleteSession":{',
  'service:`workspaceController`,',
  'description:`Permanently delete one Session (log and attachments included).`,',
  'invocation:{kind:`direct`},',
  'parameters:[{name:`request`,description:`Session identity to delete.`,source:`json`,',
  'codec:{mode:`strict`,typeSymbol:`@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionRequest`,create:' + TW + 'deleteSession_parameter_0$schema,jsonSchema:{"type":`object`,"properties":{"sessionId":{"type":`string`}},"required":[`sessionId`],"additionalProperties":true}},',
  'strictCodec:{mode:`strict`,typeSymbol:`@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionRequest`,create:' + TW + 'deleteSession_parameter_0_strict$schema,jsonSchema:{"type":`object`,"properties":{"sessionId":{"type":`string`}},"required":[`sessionId`],"additionalProperties":false}}}],',
  'result:{mode:`strict`,typeSymbol:`@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceDeleteSessionValue`,create:' + TW + 'deleteSession_result$schema,description:`deletion confirmation.`,jsonSchema:{"type":`object`,"properties":{"deleted":{"type":`boolean`}},"required":[`deleted`],"additionalProperties":true}},',
  'sourceLocation:{"file":`packages/api/workspace-controller/src/index.ts`,"line":999,"column":3}},',
].join('');
// 注：注入体按「数组 join('\n')」形态保留（换行在压缩 bundle 里只是语句分隔），
// unit-patch-output-parsable 的反证会按这个形态核对「锚点之后不得紧跟无头尾巴」。
const REMOTES_INVOKE_INSERT = [
  REMOTES_DELETE_DESC,
  REMOTES_INVOKE_ANCHOR,
].join('\n');

// ---------------------------------------------------------------------------
// 7. dsh-client-ui-workspace：会话行菜单「删除对话」+ 翻译
// ---------------------------------------------------------------------------
// 0.2.2-rc.1 重锚（第三次结构变化）：会话 ⋯ 菜单再一次重构——
//   · 上游把 slot 列表（pin 100 / rename 200 / fork 300 / archive 400 /
//     session-id 450 + 五个 *SessionMenuItem 组件）整块删除，改为
//     `registerSessionMenus(ctx, actions)` 里的数据项注册：
//     `ctx.contextMenus.register({ id: \`session.${id}\`, target: "session",
//      order, observe, resolve })`，条目 = { id, label, icon?, danger?,
//     separatorBefore?, commandId?, run }；
//   · 于是 DeleteSessionMenuItem 组件与 deleteInjected 闭包一并消失，
//     本层改为「在 registerSessionMenus 里注册第 6 个数据项」：order 650
//     （archive 600 之后，视觉仍紧贴归档项）。
// 锚点取原生 archive 项的 run 收尾 + 该 register 调用收尾三行（全文件唯一，
// 16 个候选锚点里实测 1 命中）。insert 原样保留锚点字节（链式安全）。
// 0.2.2-rc.2 重锚（第四次结构变化：改成压缩产物）：`registerSessionMenus` 仍是
// 「一串 register(id, order, observe, resolve) 数据项注册」，但整段被压到一行——
// 三元式无空格、`run:()=>{…}` 与数组收尾之间也不再有换行/制表符。锚取 archive 项的
// run 收尾到 register 调用收尾（`}}]})`），不碰闭合外层函数的那个 `}`，全文件唯一。
const UI_MENU_ANCHOR = '(restoring?actions.unarchiveSession:actions.archiveSession)(target.sessionId)}}]})';
const UI_MENU_INSERT = [
	UI_MENU_ANCHOR + ';',
	'// dsh-desktop patch (session manage): 归档下方增加「删除对话」（order 650）。',
	'// 桥缺失（未装 dsh-session-manager）时 resolve 返回空数组 = 整行不渲染——',
	'// 显式降级，不是点了没反应。',
	'register(`delete`,650,[],target=>{',
	'if(!(' + DELETE_SESSION_MENU_GUARD + '))return[];',
	'return[{id:`delete`,label:t(`menu.deleteSession`),danger:true,separatorBefore:true,run:()=>{window.__dshSessionManager?.deleteSession(target.sessionId)}}]',
	'});',
].join('\n');

// 0.2.2-rc.2：locales 字典同样压缩（键双引号、值模板字面量、逗号后无空格）。
const UI_ZH_ANCHOR = '"menu.archiveSession":`归档会话`,';
const UI_ZH_INSERT = '"menu.archiveSession":`归档会话`,"menu.deleteSession":`删除对话`,';
const UI_EN_ANCHOR = '"menu.archiveSession":`Archive session`,';
const UI_EN_INSERT = '"menu.archiveSession":`Archive session`,"menu.deleteSession":`Delete conversation`,';

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
    if (stats) stats.failed += 1;
    return false;
  }
  const alreadyMarked = src.includes(MARKER);
  let changed = false;
  for (const { anchor, insert, done } of replacements) {
    if (src.includes(done !== undefined ? done : insert)) continue; // 本替换已完成（insert/done 自身即完成标记）
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
    if (stats) stats.failed += 1;
    return false;
  }
}

/**
 * 对某个 node_modules 根目录应用对话删除/归档管理补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats] 计数回流
 *   （锚点失配与读写失败均由调用方报告采集）
 * @param {{dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchSessionManage(nmRoot, log = () => {}, stats, options) {
  // dsh-workspace/lib/index.js 已退出目标清单：unarchiveSession 在 0.2.0-rc.2
  // 原生（见上方第 1 节退役说明），无需注入。
  const targets = TARGETS.map((t) => ({
    file: path.join(nmRoot, ...t.rel),
    replacements: t.replacements,
  }));
  let changed = 0;
  for (const t of targets) {
    if (!fs.existsSync(t.file)) continue;
    if (applyReplacements(t.file, t.replacements, log, stats, options)) changed += 1;
  }
  return changed;
}

/**
 * 测试用：目标清单（相对 node_modules 的路径分段 + 各自的替换项）。
 * unit-session-manage.test.js 据此逐包拼夹具、逐锚点做反证。
 */
const TARGETS = [
  {
    rel: ['@deepseek-ai', 'dsh-session', 'lib', 'index.js'],
    replacements: [{ anchor: SESSION_ANCHOR, insert: SESSION_INSERT }],
  },
  {
    rel: ['@deepseek-ai', 'dsh-api-workspace-controller', 'lib', 'index.js'],
    replacements: [
      { anchor: HOST_IMPORT_ANCHOR, insert: HOST_IMPORT_INSERT },
      { anchor: HOST_INJECT_ANCHOR, insert: HOST_INJECT_INSERT },
      { anchor: HOST_CMDS_ANCHOR, insert: HOST_CMDS_INSERT },
      { anchor: HOST_CTRL_ANCHOR, insert: HOST_CTRL_INSERT },
    ],
  },
  {
    rel: ['@deepseek-ai', 'dsh-api-workspace-controller', 'lib', 'typert.host.js'],
    replacements: [
      { anchor: TYPERT_HOST_SCHEMA_ANCHOR, insert: TYPERT_HOST_SCHEMA_INSERT },
      { anchor: TYPERT_HOST_STRICT_ANCHOR, insert: TYPERT_HOST_STRICT_INSERT },
      { anchor: TYPERT_HOST_INVOKE_ANCHOR, insert: TYPERT_HOST_INVOKE_INSERT },
    ],
  },
  {
    rel: ['@deepseek-ai', 'dsh-api-workspace-controller', 'lib', 'client.js'],
    replacements: [
      { anchor: CLIENT_MODEL_ANCHOR, insert: CLIENT_MODEL_INSERT },
      { anchor: CLIENT_CTRL_ANCHOR, insert: CLIENT_CTRL_INSERT },
    ],
  },
  {
    rel: ['@deepseek-ai', 'dsh-api-remotes', 'lib', 'client.js'],
    replacements: [
      { anchor: REMOTES_SCHEMA_ANCHOR, insert: REMOTES_SCHEMA_INSERT },
      { anchor: REMOTES_STRICT_ANCHOR, insert: REMOTES_STRICT_INSERT },
      { anchor: REMOTES_INVOKE_ANCHOR, insert: REMOTES_INVOKE_INSERT },
    ],
  },
  {
    rel: ['@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'],
    replacements: [
      // done 判据一律取「本注入体内部的独有文案」，绝不用 insert 全字节。原因（实测）：
      // 后跑的 open-project-dir（order 200）拿同一行 `function ArchiveSessionMenuItem(…)`
      // 与 `const archiveInjected = () => ({` 当锚点，把自身注入体插在锚点行之前 —— 那段
      // 位置正落在本补丁 UI_COMP / UI_INJECT 的 insert 字节区间内部，于是 insert 串被从
      // 中间劈开、判据变 false，二遍 boot 重插一次 → `function DeleteSessionMenuItem` 与
      // `const deleteInjected` 各声明两遍 → 该 bundle 直接 SyntaxError（Identifier
      // 'deleteInjected' has already been declared），工作区侧栏整块坏掉。注入体内的
      // 注释行不会被别的补丁触碰，故一律用它。
      { anchor: UI_MENU_ANCHOR, insert: UI_MENU_INSERT, done: 'dsh-desktop patch (session manage): 归档下方增加「删除对话」' },
      { anchor: UI_ZH_ANCHOR, insert: UI_ZH_INSERT, done: '"menu.deleteSession":`删除对话`' },
      { anchor: UI_EN_ANCHOR, insert: UI_EN_INSERT, done: '"menu.deleteSession":`Delete conversation`' },
    ],
  },
];

/** 测试用：为每个目标包拼一份「只含本包全部锚点」的最小夹具文本。 */
function buildFixtures() {
  return TARGETS.map((t) => ({
    rel: t.rel,
    text: t.replacements.map((r) => r.anchor).join('\n// ---- 夹具分隔 ----\n') + '\n',
  }));
}

module.exports = { patchSessionManage, MARKER, TARGETS, buildFixtures };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchSessionManage(root, (m) => console.log(m));
  console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}
