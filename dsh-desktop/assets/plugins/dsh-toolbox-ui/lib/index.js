import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { interpolate } from "@deepseek-ai/cordis-plugin-loader";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendSelectedBuiltinMcpServers, BUILTIN_MCP_SERVERS, builtinMcpCatalog, builtinSpec, MANAGED_CONFIG_FIELDS, normalizeMcpImport, readManagedMcpServers, setManagedMcpDisabled, updateManagedMcpPatch } from "./mcp-config.js";
import { admitImportedServers } from "./import-admission.js";
import { collectImportLocations, missingEnvNames, resolveImportLocation } from "./mcp-import-sources.js";
import { deriveMcpPhase, formatMcpLog, sanitizeMcpLog } from "./mcp-observability.js";
import { allMcpEntries, entriesForName, projectToolSchema, revisionOf, toolInventory } from "./mcp-registry.js";
import { diagnoseSkill } from "./skills-frontmatter.js";
import { invocationOf, listSkillViews, resolveSkillReference, resolveTargetReference, skillRowKey, skillTargetsView } from "./skills-registry.js";
import { importSkill, readSkillDocument, removeSkill, scanDisabledSkills, setSkillEnabled, setSkillModelInvocable, setSkillUserInvocable } from "./skills-file-ops.js";
import { downloadHubArchive, hubCategories, hubSkillDetail, searchHubSkills } from "./skillhub.js";
import { setOwn } from "./own-property.js";
import { commitProfilePatches, composedRowVisible, ProfileMutationError, profileSources } from "./profile-composition.js";
import { WHATS_NEW } from "./whats-new.js";
import { evaluateEnvExpression, jsExpressionToTemplate, specToMcpEntry, toMcpClientConfig } from "./workspace-config.js";
import { canonicalWorkspacePath, assertRegisteredWorkspace, installAgentRuntime, listWorkspaceRecords, liveWorkspaceAgentCount, projectConnectionsView, readWorkspaceConfigCached, reconcileWorkspaceConnections, reconcileWorkspaceRestricts, reconnectWorkspaceServer, withRegisteredWorkspaceWrite, workspaceConnectionStatus, workspaceMountErrorsView, workspaceRestrictErrorView, workspaceScopeErrorsView, workspaceToolSchemas, writeWorkspaceConfigFile } from "./workspace-runtime.js";
import { installToolSearchRuntime, uniqueOwner } from "./tool-search-runtime.js";
import { agentWorkspace, deferServersOf, residentServersOf, serverNamesOf, toolSearchDisabled } from "./tool-search-config.js";
import { normalizePolicyConfig, resolveToolLoadingPolicy, validatePolicyConfig } from "./tool-loading-policy.js";
import { TOOL_LOADING_CONFIG_KEY, TOOL_SEARCH_CONFIG_KEY, ToolSearchConfigSchema, assertToolSearchSettingsPayload, effectiveToolSearchSettings, normalizeToolSearchSettings, pluginPatchIdentity, readToolLoadingPolicy, readToolSearchSettings, setToolLoadingPolicyInPatch, setToolSearchSettingsInPatch } from "./tool-search-settings.js";
import { agentToolLoadingPolicy, liveAgents, setAgentToolLoadingPolicy } from "./workspace-runtime.js";

var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};

const ROOT_INCLUDE_ID = "include";
const REDACTED_VALUE = "__DSH_MCP_REDACTED__";
const REVEAL_REVISION_KEY = randomBytes(32);
const patchWriteQueues = new WeakMap();
const PHASE_TEXT = { 0: "waiting", 1: "loading", 2: "connected", 3: "failed", 4: "stopped", 5: "unloading" };

// mcp-client 至今不暴露任何可订阅的状态面（只导出 name/inject/Config/apply，无事件、无服务），
// 连接状态只存在于日志。
// 我们通过 ctx.logger.exporter 订阅全部日志，按 scope 过滤出 mcp-client(<serverName>) 的记录。
const recentMcpLogs = new WeakMap();
const recentFiberLogs = new WeakMap();
const MAX_LOG_RECORDS = 12;
const logScope = (ctx) => ctx?.root || ctx;
function appendRecent(store, key, record) {
  const list = store.get(key) || [];
  list.push(record);
  if (list.length > MAX_LOG_RECORDS) list.splice(0, list.length - MAX_LOG_RECORDS);
  store.set(key, list);
}
const MCP_LOG_LABEL = /mcp-client\(([^)]+)\)/;
function mcpLogLabelSource(message) {
  // 便宜匹配先行：进程里绝大多数日志与 mcp-client 无关，不能为了判断这件事先去格式化+脱敏
  // （实测前者 0.3µs/行、后者 9.1µs/行，且 info/debug 占了绝大多数日志）。
  const named = String(message.name || "");
  if (named.includes("mcp-client(")) return named;
  const args = Array.isArray(message.args) ? message.args : [];
  return args.find((value) => typeof value === "string" && value.includes("mcp-client(")) || "";
}
function recordMcpLog(ctx, message) {
  const diagnostic = message.type === "error" || message.type === "warn";
  const fiber = diagnostic ? message.fiber?.deref?.() : undefined;
  const labelSource = mcpLogLabelSource(message);
  // 只有「确实是 mcp-client 的日志」或「error/warn 级纤维诊断」才需要真实内容。
  if (!labelSource && !fiber) return;
  const text = sanitizeMcpLog(formatMcpLog(message));
  const record = { type: message.type, text, ts: message.ts };
  if (fiber) appendRecent(recentFiberLogs, fiber, record);
  if (!labelSource) return;
  const match = MCP_LOG_LABEL.exec(labelSource);
  if (!match) return;
  const scope = logScope(ctx);
  const entry = recentMcpLogs.get(scope) || new Map();
  const serverName = match[1];
  appendRecent(entry, serverName, record);
  recentMcpLogs.set(scope, entry);
}
function lastLogFor(ctx, serverName, fiber) {
  const named = recentMcpLogs.get(logScope(ctx))?.get(serverName) || [];
  const scoped = fiber ? recentFiberLogs.get(fiber) || [] : [];
  const logs = [...named, ...scoped].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const diagnostic = logs.filter((record) => /attempt failed|tool .*failed|McpError|ECONNREFUSED|giving up|did not close/i.test(record.text)).at(-1);
  return diagnostic || logs.at(-1) || null;
}
// 每个 ctx 只挂一次 exporter；构造与首次 list/status 都会触发，保证幂等。
const logCaptureState = new WeakMap();
function ensureLogCapture(ctx) {
  const scope = logScope(ctx);
  if (logCaptureState.has(scope)) return logCaptureState.get(scope).dispose;
  const logger = scope?.logger || ctx?.logger;
  const exporter = { colors: 0, levels: { default: 3 }, export: (message) => recordMcpLog(ctx, message) };
  let dispose = () => {};
  // Cordis 4.0.1 LoggerService.exporter() 的 disposer 删除的是“当前最大 ID”而非
  // 注册时 ID。固定 peer 版本下直接捕获 ID，避免热重载泄漏或误删其他 exporter。
  if (logger?.exporters instanceof Map && Number.isInteger(logger._snExporter)) {
    const exporterId = ++logger._snExporter;
    logger.exporters.set(exporterId, exporter);
    dispose = () => logger.exporters.delete(exporterId);
  } else if (logger?.exporter) {
    // 降级通道：cordis 4.0.1 的 exporter() disposer 删的是“当时最大 ID”而不是注册时 ID，
    // 热重载时可能误删其他插件的 exporter。私有字段不在就说明 peer 已偏离验证过的形状：
    // 明确告警，不静默降级。
    logger.warn?.("mcp-manager: cordis LoggerService 的 exporters/_snExporter 形状已变化，MCP 日志诊断退回 exporter() 通道；热重载时可能误删其他插件的 exporter，请核对 cordis peer 版本");
    dispose = logger.exporter(exporter);
  }
  // 回放 exporter 注册前 buffer 中已有的 mcp-client 日志。
  for (const message of logger?.buffer || []) recordMcpLog(ctx, message);
  logCaptureState.set(scope, { dispose });
  // 诊断通路也要有生命周期归属：没有 effect() 就没人卸 exporter，HMR 一次泄一个。
  // 不静默跳过：诊断本身不能以“你看不见的泄漏”为代价。
  if (typeof ctx?.effect !== "function") {
    logger?.warn?.("mcp-manager: 当前 context 没有 effect()，MCP 日志 exporter 没有生命周期归属，插件热重载后会残留一个订阅者");
    return dispose;
  }
  ctx.effect(() => () => {
    dispose();
    logCaptureState.delete(scope);
    recentMcpLogs.delete(scope);
  }, "mcpManager.logCapture");
  return dispose;
}

function hasExternalMcpName(ctx, state, name) {
	return externalMcpEntries(ctx, state).some((entry) => entry.options.config.serverName === name);
}
/**
 * 「这一条 MCP 是不是我们自己的」——身份是 **loader 条目的 id**，名字只用来在我们这一层
 * （profile patch）里定位那一行。
 *
 * 曾经这里还要求 `matches.length === 1`（同名条目全场只能有一条）。那条前置条件把
 * 「别人也有一条同名条目」变成了「你连自己那条都不能改/删」：DSH 在 loader 层不保证
 * serverName 唯一（mcp-client 是在 apply 期按**作用域**判重的，第二条挂载失败，但两条
 * 条目都留在树里），于是真机上出现「一行、两条条目、全灰」的死胡同。
 *
 * 删掉它不是给冲突开旁路，而是把两个问题分开：
 *   可以改哪条 —— 由 id 回答（本函数）；
 *   还有几条同名 —— 由 `summarize()` 的 conflict/duplicates 回答（只作信息，不再决定可写性）。
 * 写操作永远只落到 id 对得上的那一条，别的层的条目一个字节都不动。
 */
function resolveManagedEntry(state, name, matches) {
	const id = state.entryIds.get(name);
	if (!id) return null;
	return matches.find((entry) => entry.options.id === id) ?? null;
}
function managedLiveEntry(ctx, state, name) {
	return resolveManagedEntry(state, name, entriesForName(ctx, name));
}
/**
 * 装配 ToolSearch 运行时。两类输入刻意分开：
 *   - `deferServers` / `serverNames` 是**活值 thunk**：面板翻某个服务器的开关后，下一次视图
 *     重建就读到新值，不需要重装（这是 1.8.0 就有的机制）；
 *   - 三个上限是**装配期取值**：它们会写进模型可见的工具定义（`max_results` 的取值范围与
 *     默认值），所以改它们必须重装，见 `updateToolSearchSettings`。
 */
function installToolSearch(ctx, settings, policyFor) {
	return installToolSearchRuntime(ctx, {
		// 两个 thunk 都接受 agent：项目族的 defer 只按**本会话所在项目**解析。
		deferServers: (agent) => deferServersOf(ctx, agent),
		serverNames: (agent) => serverNamesOf(ctx, agent),
		// 统一策略（逐工具 / 项目覆盖 / 保护名单）在网关里合成，运行时只消费结果。
		...(typeof policyFor === "function" ? { policyFor } : {}),
		...settings,
	});
}

function installToolSearchIsolated(ctx, settings, policyFor) {
	try {
		const dispose = installToolSearch(ctx, settings, policyFor);
		// `dispose` 同时带 `status()`（能力状态）与 `generation`：面板/诊断读它，
		// 而不是靠"装上了"推断"延迟加载真的生效"。
		return { settings, dispose, status: () => dispose?.status?.(), error: undefined };
	} catch (error) {
		const message = `mcp-manager: ToolSearch 初始化失败，MCP 与 skills 管理仍保持可用：${error?.message ?? error}`;
		ctx.logger?.error?.(message);
		return {
			settings,
			dispose: () => {},
			status: () => ({
				presentation: { state: "failed", reason: message },
				nativeDeclaration: { state: "failed", reason: message },
				ptcSdk: { state: "failed", reason: message },
				signatures: { state: "failed", reason: message },
				restore: { state: "failed", reason: message },
				diagnostics: [{ code: "TOOL_SEARCH_INIT_FAILED", message }],
			}),
			error: { code: "TOOL_SEARCH_INIT_FAILED", message },
		};
	}
}
function patchPath(ctx) {
	const entry = [...ctx.loader.entries()].find((candidate) => candidate.options.id === ROOT_INCLUDE_ID && candidate.options.name === "cordis:include");
	const path = entry?.options.config?.path;
	if (typeof path !== "string") return null;
	const filename = path.startsWith("file:") ? fileURLToPath(path) : path;
	return join(dirname(filename), "cordis.patch.yml");
}
// Profile persistence is a Host-owned configuration capability, not a session workspace mutation.
// `ctx.fs` is intentionally fenced by the active workspace-write policy, so this target is
// derived only from the trusted root include and committed through the Host atomic writer.
function patchVersion(content) {
	return createHash("sha256").update(content).digest("hex");
}
async function readProfilePatchFile(path) {
	const [content, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
	if (!info.isFile()) throw new Error("profile patch is not a regular file");
	return { content, target: path, version: patchVersion(content), mode: info.mode & 0o777 || 0o600 };
}
/**
 * 本 app root 当前是否已经持有 HMR 事务锁（用于拒绝嵌套）。
 * 键是 ctx：同一个 root 可能并存多个插件实例（测试/HMR），锁深度必须各自计。
 */
const hmrLockDepth = new WeakMap();
function withPatchWrite(ctx, operation) {
	const previous = patchWriteQueues.get(ctx) || Promise.resolve();
	const run = async () => {
		const path = patchPath(ctx);
		if (!path) throw new Error("root include unavailable; cannot locate profile patch");
		const locked = () => withFileLock(path, operation);
		// 锁顺序：HMR.runExclusive → 官方同一 profile package.json 文件锁。反过来会与官方的
		// 配置编辑器互等（它先拿文件锁，再在锁内做 HMR 相关动作）。
		const hmr = typeof ctx.get === "function" ? ctx.get("hmr") : undefined;
		if (typeof hmr?.runExclusive !== "function") return locked();
		const depth = hmrLockDepth.get(ctx) ?? 0;
		if (depth > 0) {
			// 嵌套 HMR 事务会自锁（runExclusive 不可重入）。明确失败好过静默死等：
			// 事务入口只有一个，出现嵌套即为实现错误。
			throw new Error("mcp-manager: 检测到嵌套的 HMR 事务（同一阶段只能有一个事务入口）");
		}
		hmrLockDepth.set(ctx, depth + 1);
		try {
			return await hmr.runExclusive(locked);
		} finally {
			hmrLockDepth.set(ctx, depth);
		}
	};
	const current = previous.then(run, run);
	patchWriteQueues.set(ctx, current.catch(() => {}));
	return current;
}

async function readPatch(ctx) {
	const path = patchPath(ctx);
	if (!path) throw new Error("root include unavailable; cannot locate profile patch");
	return readProfilePatchFile(path);
}
async function writePatch(state, content, version = state.version) {
	const current = await readProfilePatchFile(state.target);
	if (current.version !== version) throw new Error(`FS_STALE_VERSION: profile patch changed since it was read: ${state.target}`);
	await writeFileAtomic(state.target, content, { mode: current.mode });
	return { operation: "update", version: patchVersion(content), before: current.content, after: content };
}
async function managedState(ctx) {
	const patch = await readPatch(ctx);
	const parsed = readManagedMcpServers(patch.content);
	return { ...patch, servers: parsed.servers, byName: new Map(parsed.servers.map((server) => [server.name, server])), entryIds: new Map(Object.entries(parsed.entryIds)) };
}
/**
 * 写盘 + 生效的**唯一**入口（实现见 `lib/profile-composition.js`）。
 *
 * 之前这里有三份"活操作"实现（`createLiveEntries` / `entry.update` / `entry.parent.remove`），
 * 与官方 `reconcileProfilePatches` 并存——同一件事两个实现，写盘的行与运行中的条目迟早漂移。
 * 现在所有变更型入口都从这里过：写盘、判定"最终组合里我这一行算不算数"、reconcile、
 * 失败回滚，全在一处。
 *
 * @param {object} ctx
 * @param {{content: string, version: string, target: string}} state - 写盘前的快照。
 * @param {string} nextContent - 新的 profile patch 内容。
 * @param {object} [options] - 见 commitProfilePatches（entryId/expect/requiredIds/doomedIds/…）。
 */
function commitPatch(ctx, state, nextContent, options = {}) {
	return commitProfilePatches(ctx, {
		content: state.content,
		version: state.version,
		target: state.target,
		write: (content, version) => writePatch(state, content, version),
	}, nextContent, options);
}
/**
 * 这次写入会让哪些**本 profile 管理的** MCP 行消失。
 *
 * 只算 patch 文件里管的那几条：别的配置层（bundle/preset）提供的 MCP 条目不在 patch 里，
 * 扫过去把它们置成 disabled 等于替用户关掉了别人的插件。返回的 id 交给 reconcile 之前
 * 先标脏——rc.5 的卸载钩子会因此早退，不会把已应用树写回 base 配置（见 profile-composition）。
 */
function doomedMcpIds(state, nextContent) {
	const next = new Set(Object.values(readManagedMcpServers(nextContent).entryIds));
	return [...state.entryIds.values()].filter((id) => !next.has(id));
}
/**
 * 技能文件是我们直接写的（不经过 `ctx.skills`），所以写完之后必须让宿主的技能目录缓存失效——
 * 否则模型看到的还是旧内容（面板自己每次 list 都重读，看起来"已经生效"，模型那边却没有）。
 * 宿主没提供失效入口时如实报 skipped，不假装。
 */
function refreshSkillCatalog(ctx) {
	const skills = typeof ctx.get === "function" ? ctx.get("skills") : undefined;
	if (typeof skills?.invalidateCache !== "function") {
		return { live: "skipped", liveReason: "宿主没有提供技能目录失效入口（ctx.skills.invalidateCache）" };
	}
	skills.invalidateCache();
	return { live: "applied" };
}
/**
 * 变更型 RPC 的结构化结果：写盘事实与运行中事实分开报。
 *
 * live 既可以是枚举字符串，也可以是 { live, liveReason? }（refreshSkillCatalog 与
 * commitProfilePatches 都返回后一种形状）——只有一处归一化，调用点不必各写一遍展开。
 */
function mutationResult(persisted, live, extra = {}) {
	const state = typeof live === "string" ? { live } : live;
	return {
		persisted,
		live: state.live,
		diagnostics: state.diagnostics ?? [],
		...(state.liveReason ? { liveReason: state.liveReason } : {}),
		...extra,
	};
}
/**
 * 只翻 defer 的"活"那半：同步运行中条目的遮罩位。
 *
 * defer 不参与连接（`deferServersOf` 读的就是这几个 options），所以**不**为它 reconcile：
 * reconcile 会重启 mcp-client 的 fiber 重新建连（serena 冷启动实测 1-1.5 分钟），而用户
 * 只是把一个显示开关翻过来。行的增删改（生命周期变了）才走 reconcile。
 */
function applyDeferMask(entries, defer) {
	for (const entry of entries) entry.options.config.defer = defer;
}
/** 刚写出的 patch 内容 → 该 serverName 对应的 loader 条目 id。
 *  `resolveManagedEntry` 靠这个 id 认人（认不上的条目会被划成 external，面板既不能改也不能卸），
 *  所以创建活条目时用的 id 必须与 patch 行一致，不能另起一个。 */
function entryIdOf(patchContent, name) {
	const ids = readManagedMcpServers(patchContent).entryIds;
	return Object.hasOwn(ids, name) ? ids[name] : null;
}
function profileMcpEntries(ctx) {
	const include = [...ctx.loader.entries()].find((entry) => entry.options.id === ROOT_INCLUDE_ID && entry.options.name === "cordis:include");
	const entries = include?.subtree?.entries?.();
	return entries ? new Set(entries) : null;
}
function externalMcpEntries(ctx, state) {
	const profileEntries = profileMcpEntries(ctx);
	const managedIds = new Set(state.entryIds.values());
	const managedNames = new Set(state.servers.map((server) => server.name));
	return allMcpEntries(ctx).filter((entry) => {
		if (profileEntries) return !profileEntries.has(entry) && !managedIds.has(entry.options.id);
		return !managedIds.has(entry.options.id) && !(!entry.options.group && managedNames.has(entry.options.config.serverName));
	});
}
function effectiveMcpServers(ctx, state) {
	return [
		...state.servers,
		...externalMcpEntries(ctx, state).map((entry) => ({ ...entry.options.config, name: entry.options.config.serverName })),
	];
}
function revealRevision(state, groups) {
	const values = [];
	for (const current of state.servers) {
		const entry = resolveManagedEntry(state, current.name, groups.get(current.name) || []);
		if (!entry) continue;
		const live = entry.options.config;
		values.push({
			name: current.name,
			url: live.url ?? current.url,
			args: live.args ?? current.args,
			env: live.env ?? current.env,
			headers: live.headers ?? current.headers,
		});
	}
	return createHmac("sha256", REVEAL_REVISION_KEY).update(JSON.stringify(values)).digest("base64url");
}
// env/headers 的值默认一律掩码：不显示任何实际内容，明文与 `!!js` 引用一视同仁。
// 旧实现把 `!!js process.env.X` 当作「安全引用」保留下来，结果同一份配置会因为写法不同
// 而一个掩盖码、一个把内部 `!!js` 表达式原文摆到界面上（用户看到的正是后者）。
// 需要看真实值时走 reveal（眼睛）——那条通路给的是「有效运行值」。
// key 名保留：用户需要知道配了哪些字段。
function redactMap(value) {
	const result = {};
	for (const key of Object.keys(value || {})) setOwn(result, key, REDACTED_VALUE);
	return result;
}
function redactUrl(value) {
	// `!!js` 表达式可能内嵌密钥，且内部语法不该出现在界面上：一律掩码（不管简单还是复杂）。
	if (typeof value === "string" && value.startsWith("!!js ")) return REDACTED_VALUE;
	try {
		const parsed = new URL(value);
		return parsed.username || parsed.password || parsed.search || parsed.hash ? REDACTED_VALUE : value;
	} catch {
		return REDACTED_VALUE;
	}
}
function redactArgs(value) {
	return value.length ? [REDACTED_VALUE] : [];
}
function restoreRedactedMap(incoming, current, field) {
	if (incoming === undefined) return undefined;
	const result = {};
	for (const [key, value] of Object.entries(incoming)) {
		if (value !== REDACTED_VALUE) setOwn(result, key, value);
		else if (current?.[field] && Object.hasOwn(current[field], key)) setOwn(result, key, current[field][key]);
		else throw new Error(`${field}.${key} 没有可保留的现有值`);
	}
	return result;
}
function restoreRedactedSpec(spec, current) {
	const restored = structuredClone(spec);
	if (restored.url === REDACTED_VALUE) {
		if (current.url === undefined) throw new Error("url 没有可保留的现有值");
		restored.url = current.url;
	}
	if (Array.isArray(restored.args)) {
		const redactedCount = restored.args.filter((value) => value === REDACTED_VALUE).length;
		if (redactedCount > 0) {
			if (restored.args.length !== 1 || redactedCount !== 1) throw new Error("敏感参数的保留原值标记不能与新参数混合；请完整重填参数");
			if (!Array.isArray(current.args)) throw new Error("args 没有可保留的现有值");
			restored.args = structuredClone(current.args);
		}
	}
	if (restored.headers !== undefined) restored.headers = restoreRedactedMap(restored.headers, current, "headers");
	if (restored.env !== undefined) restored.env = restoreRedactedMap(restored.env, current, "env");
	return restored;
}
function containsRedactedValue(value) {
	if (value === REDACTED_VALUE) return true;
	if (Array.isArray(value)) return value.some(containsRedactedValue);
	if (value && typeof value === "object") return Object.values(value).some(containsRedactedValue);
	return false;
}
// ---------- 更新提示（被动、可关闭、绝不自动更新） ----------
// 面板打开时客户端会调一次 updateHint：Host 每天最多向 npm registry 发一次查询（进程内缓存），
// 有新版时返回供面板显示可关闭的提示条。查询失败、超时、限流或被
// DSH_MCP_MANAGER_DISABLE_UPDATE_CHECK 禁用时静默无提示——这是有意设计：更新提示是纯增值信息，
// 不允许影响面板可用性；除这一条 GET 外不发送任何数据。
//
// ⚠️ 问的是**本包在 npm 上的 latest**，不是本仓库的 `/releases/latest`：同一个仓库承载两条产品线
// （本线 `dsh-toolbox-ui` 与老线那个包——两个名字见 release.yml），而仓库级 "latest" 是**共用**的单个
// 槽位，且必须留给老线——老线（≤1.5.3）面板的「升级」按钮读的正是那里，下发的却是**它自己那个包名**的
// 版本，所以本线的 Release 一直带 `--prerelease`（见 release.yml 的说明），让 latest 停在老线的
// 版本上。本线若也读那个 feed，读到的永远是旧线的版本号 → 提示恒为「已是最新」：新版本发出去，
// 装了本线的用户什么也看不到（v1.6.1 → v1.6.2 就这样哑掉过一次）。
// 包名由 package.json 派生（pluginName）：写死任何一个包名都会在另一条线上静默错。
/**
 * 让位检测（`conflictingManager`）的自身判据：**loader 条目的 `name` 等于本包名**。
 *
 * ⚠️ **不得用 patch 的 `id` 排自身。** 新旧两个包共用同一个 `id: mcp-manager-ui`
 * （双包同仓、同 id 是刻意的，`package-contract` 断言它在 patch 里唯一）。按 id 排除自身
 * 会把**旧包一起排掉** → 让位检测永不触发 → 旧包真装在场上却什么也不做。真机 desktop
 * profile 正是这种形态：`dsh.profile.bundles` 里挂着旧包 `dsh-mcp-manager-ui@^1.5.0`。
 *
 * 包名是可靠的自身判据：本插件的 loader `name` 恒等于 `package.json.name`
 * （`cordis.patch.yml` 的 `name:` 由 `test/package-rename.test.mjs` 钉住）；而旧包的
 * 旧包的 `name` 恒为 `dsh-mcp-manager-ui`——含 mcp + manager 两段，于是被正确识别为"另一个"。 */

/**
 * 该 loader 条目名是否像一个「MCP 管理插件」。
 *
 * 判据刻意保守（必须同时含 mcp 与 manager 两段），因为误判的代价是**面板完全打不开**：
 * 宁可漏检（最坏两个入口并存），也不要把无关插件当成冲突。
 *
 * ⚠️ 这里**不**判「是不是自己」——自身排除只有一个判据，就是调用方拿 `name` 与本包名比对
 * （见 `conflictingManager`），而且它在调用本函数**之前**执行。
 * 曾经这里硬写过一次包名，结果是两处都在排自身：删掉另一处用例照样绿（自我排除由这里
 * 悄悄完成），而改名（row 16）之后包名一变、硬写的这处就**静默失效**——失效的恰好是
 * 防「面板打不开」的那道闸。同一件事只能有一处判据。
 */
function isMcpManagerPluginName(name) {
	const lower = String(name).toLowerCase();
	return lower.includes("mcp") && lower.includes("manager");
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 5000;
const UPDATE_CHECK_DISABLED_ENV = "DSH_MCP_MANAGER_DISABLE_UPDATE_CHECK";
let updateCheckState = { checkedAt: 0, result: null };

/** 本包在 npm 上的 latest 端点；包名读不到就没有端点（当作无提示，不猜一个包名）。 */
function updateLatestUrl() {
  const name = pluginName();
  return name === "" ? null : `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
}

/** 说明页：两条线的 tag 都是 vX.Y.Z，故由版本号拼本仓库的 release 页（与老线的 updateHint 一致）。 */
const releasePageOf = (version) => `https://github.com/Imzl-zl/dsh-toolbox-ui/releases/tag/v${version}`;

function pluginVersion() {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "";
  } catch {
    return "";
  }
}

/**
 * 本包名——自身判据的唯一来源（见 `conflictingManager` 上方的注释）。
 * 与 pluginVersion 同一份读法：同一个文件、同一个失败姿态（读不到就返回空串）。
 */
function pluginName() {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).name ?? "";
  } catch {
    return "";
  }
}

function compareVersions(left, right) {
  const a = String(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] || 0) - (b[i] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function checkForUpdate(now = Date.now(), force = false) {
  const current = pluginVersion();
  if (process.env[UPDATE_CHECK_DISABLED_ENV]) return { current, updateAvailable: false, disabled: true };
  const cached = updateCheckState.result;
  if (!force && cached && now - updateCheckState.checkedAt < UPDATE_CHECK_INTERVAL_MS && cached.current === current) return cached;
  let latest = null;
  let url = null;
  const endpoint = updateLatestUrl();
  try {
    if (endpoint !== null) {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
      });
      if (response.ok) {
        const body = await response.json();
        // npm 的 `/<包名>/latest` 只给版本号，没有页面链接——提示条要指得出「更新了什么」，
        // 所以由版本号拼 release 页（两线共用 vX.Y.Z 的 tag 命名）。
        if (typeof body?.version === "string" && body.version !== "") {
          latest = body.version;
          url = releasePageOf(latest);
        }
      }
    }
  } catch {
    // 离线/超时/限流：视作无新版，提示缺失比面板报错更可接受。
  }
  const result = { current, latest, url, updateAvailable: !!latest && compareVersions(latest, current) > 0 };
  updateCheckState = { checkedAt: now, result };
  return result;
}

/**
 * 一行 MCP 的展示投影。
 *
 * `duplicates` 是**同名但 id 不同**的其他条目（别的配置层提供的，或历史脏数据留下的）。
 * 它们只作为事实出现在行上（id + 各自的 fiber 状态），不参与「能不能改」的判断——
 * 那条判断只有 id 一个判据（见 resolveManagedEntry）。为什么必须把 id 说出来：
 * mcp-client 在连接期按作用域判重，同名条目里只有一条连得上，用户看到「连接失败」
 * 时必须能分清失败的是哪一条、另一条是谁的。
 */
function summarize(entry, inventory, managed, conflict = false, lastLog = null, duplicates = []) {
	const live = entry.options.config;
	const raw = managed || live;
	const phase = entry.fiber == null ? "stopped" : PHASE_TEXT[entry.fiber.state] ?? "unknown";
	const transport = live.transport === "streamable-http" || live.transport === "http" ? "http" : live.transport === "stdio" ? "stdio" : "?";
	const toolCountAmbiguous = inventory.ambiguous.has(live.serverName);
	const row = { serverName: live.serverName, enabled: !entry.disabled, managed: !!managed, conflict, transport, phase, toolCount: inventory.counts[live.serverName] || 0, toolCountAmbiguous, toolRevision: inventory.revisions[live.serverName] || "", scope: "global" };
	if (duplicates.length) {
		row.duplicates = duplicates.map((other) => ({
			id: String(other.options.id),
			phase: other.fiber == null ? "stopped" : PHASE_TEXT[other.fiber.state] ?? "unknown",
			disabled: other.disabled === true,
		}));
	}
	for (const field of ["command", "cwd", "toolCallTimeoutMs", "failOnStartupError", "defer"]) if (raw[field] !== undefined) row[field] = raw[field];
	// **不再估算 token**。曾经这里给每行算一个"全量常驻约 N tokens（估算）"，徽标与表单预告都用它。
	// 撤掉的理由：那个数字的精确感是假的——我们不知道用户装了什么 MCP，schema 大小能差一个量级
	// （3 个工具带几千字描述 vs 50 个工具每个一句话），chars/4 或 CJK 粗估在这种差异下没有意义；
	// 而真正的成本还有"工具数量对选择准确率的影响"，那个数字覆盖不了。给了数字用户就拿它做决定
	// （"7.4K 好像不多，不用延迟"），于是它在主动误导。留下的判断材料是**真实数据**：工具数，
	// 门槛一个都不再有（两道门槛在第十轮删除：官方没有，且它们制造"勾了没生效"的断层）。
	if (raw.url !== undefined) row.url = redactUrl(raw.url);
	if (raw.args !== undefined) row.args = redactArgs(raw.args);
	if (raw.env !== undefined) row.env = redactMap(raw.env);
	if (raw.headers !== undefined) row.headers = redactMap(raw.headers);
	if (raw.reconnect !== undefined) row.reconnect = structuredClone(raw.reconnect);
	row.status = deriveMcpPhase(row, lastLog);
	row.lastError = row.status !== "failed" ? null : lastLog && (lastLog.type === "error" || lastLog.type === "warn")
		? sanitizeMcpLog(lastLog.text)
		: "MCP 未注册任何工具：连接失败或 tools/list 同步失败";
	return row;
}
// 项目 MCP 的行状态：与全局 summarize() 走**同一套规则、同一个判定函数**（deriveMcpPhase），
// 不再另写一套。「已连接」的唯一证据是工具数；连接态本身取自 cordis fiber 的状态代号
// （mcp-client 的 apply 要等首次连接与 tools/list 结束才让 fiber ACTIVE，所以 ACTIVE + 0 工具
// 已经是不可用的终态证据），而不是去猜 mcp-client 的日志文案；日志只用来填 lastError 的
// 具体原因。挂载失败（我们自己 setup 阶段就挂不上：配置求值为空、工具注册被拒）与连接
// 失败（mcp-client 那边的事）分开标记，不混为一谈。
// 已导出作为测试接缝（同 checkForUpdate）。
function summarizeWorkspaceRow(ctx, wsPath, server, mountError) {
	// 诊断通路就在这里被依赖，就在这里确保开着（按 root 幂等，与全局 list/status 同一份）。
	ensureLogCapture(ctx);
	const row = workspaceServerView(server);
	if (server.disabled) { row.status = "disabled"; row.phase = "stopped"; return row; }
	const conn = workspaceConnectionStatus(ctx, wsPath, server);
	row.refs = conn.refs;
	row.toolCount = conn.schemas.length;
	// 估算 token 已撤掉，理由同全局行（summarize）：数字的精确感是假的，而用户会拿它做决定。
	// 与全局行同一个含义：工具清单的指纹，客户端据此刷新详情里的工具列表。
	row.toolRevision = conn.schemas.length ? revisionOf(conn.schemas.map(projectToolSchema)) : "";
	// 没有共享连接在跑 = 没有 fiber，与全局「条目未加载」同义。
	row.phase = conn.fiberState === undefined ? "stopped" : PHASE_TEXT[conn.fiberState] ?? "unknown";
	const lastLog = lastLogFor(ctx, server.name);
	if (mountError !== undefined) {
		row.status = "failed";
		row.phase = "failed";
		row.mountFailed = true;
		row.lastError = mountError;
	} else if (conn.scopeError) {
		// 作用域故障：连接可能完全正常，只是工具不在共享作用域层。必须比「0 工具 → 连接失败」
		// 更具体，否则用户会去查 MCP 配置，而根因在 DSH 依赖树。
		row.status = "failed";
		row.phase = "failed";
		row.scopeFailed = true;
		row.lastError = conn.scopeError;
	} else {
		row.status = deriveMcpPhase(row, lastLog);
		row.lastError = row.status !== "failed" ? null : lastLog && (lastLog.type === "error" || lastLog.type === "warn")
			? sanitizeMcpLog(lastLog.text)
			: "MCP 未注册任何工具：连接失败或 tools/list 同步失败";
	}
	// 同名不再等于冲突：DSH 0.1.5 起 mcp-client 按注册作用域判 serverName 唯一性
	// （`scopeOf(ctx) ?? ctx.root`），而本插件给每个 (项目, serverName) 一个独立作用域，
	// 所以全局与项目之间、项目与项目之间同名都是合法的（实测：同一作用域内仍会被拒绝）。
	// 这里如实带上「还有谁同名」作为诊断事实，但只有这份连接本身失败时才把它写成原因，
	// 否则在 0.1.5 上就是拿一条健康的连接报假错。
	if (conn.duplicateOwners.length) {
		row.duplicateOwners = conn.duplicateOwners;
		if (row.mountFailed || row.status === "failed") {
			const notice = `serverName "${server.name}" 也被以下项目使用：${conn.duplicateOwners.join("、")}。DSH 0.1.5 起各注册作用域可独立使用同名；更早的版本按全进程唯一判定，同名会启动失败。`;
			row.lastError = row.lastError ? `${notice}；${row.lastError}` : notice;
		}
	}
	return row;
}
// Fingerprint the exact redacted wire projection. Keeping a manual field list here
// would create a second source of truth and let newly projected fields go stale.
function listRevision(servers) {
	return revisionOf(servers);
}
function normalizeOne(spec) {
	return normalizeMcpImport({ mcpServers: { [spec.name]: spec } }).servers[0];
}
/** 逐字段比较（不整体 JSON.stringify：两侧 key 顺序不可靠，会误报"变了"）。 */
function sameConfigValue(left, right) {
	return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
/**
 * 这份 spec 里有没有"表达式值"（`${VAR}` / 写入后成 `!!js` 的标量）？
 *
 * 用它是为了决定**能不能做 config 深比较**：`toMcpClientConfig()` 会把表达式**求值**成
 * 当时的字符串（实测 `${TEST_TOKEN}` 且变量未设 → `""`），而组合结果保留的是
 * `{ __jsExpr: '…' }`。两者不同形，拿它当期望值会把正常保存判成"被覆盖"。
 *
 * 所以含表达式的行跳过深比较（退回到"条目在不在 + disabled 对不对"），其余行照常对齐官方判据。
 */
function containsExpressionValue(value, depth = 0) {
	if (depth > 8 || value === null || value === undefined) return false;
	if (typeof value === "string") return value.includes("!!js") || value.includes("${");
	if (typeof value !== "object") return false;
	if (Object.hasOwn(value, "__jsExpr")) return true;
	if (Array.isArray(value)) return value.some((item) => containsExpressionValue(item, depth + 1));
	return Object.values(value).some((item) => containsExpressionValue(item, depth + 1));
}
/**
 * 这次改动是否碰了"必须重建条目才生效"的字段。defer 不在其列——它是纯遮罩。
 *
 * `disabled` 也不在 `MANAGED_CONFIG_FIELDS` 里（它是 loader 条目的外壳字段，不是 mcp-client
 * 的 config），但它**改变条目的生命周期**：禁用要停掉 fiber 并撤掉工具，启用要重新连。
 * 只比 MANAGED_CONFIG_FIELDS 会把它误判成"纯遮罩"，于是盘上写了 disabled、运行中照旧，
 * 还回一句"立即生效"——盘上与运行中直接相反。两者都算，判据才完整。
 */
function touchesConnection(spec, current) {
	if ((spec.disabled === true) !== (current.disabled === true)) return true;
	return MANAGED_CONFIG_FIELDS.some((field) => !sameConfigValue(spec[field], current[field]));
}
function reservedEntryIds(ctx, releasedIds = new Set()) {
	const ids = [];
	for (const entry of ctx.loader.entries()) {
		const id = entry.options.id;
		if (typeof id === "string" && !releasedIds.has(id)) ids.push(id);
	}
	return ids;
}
// 原始导入 payload → 可落盘的 spec 集合。粘贴入口只从这里过，准入规则（唯一性、总值表达式）
// 只写在 import-admission.js 里，不在调用点重复。
function admittedImport(input) {
	return admitImportedServers(normalizeMcpImport(input));
}
// 「同一份 incoming 里出现归一化后同名时只认先出现的那条」——这条取舍与 import-admission 相同，
// 所以只能表达一次：import-admission（集合自洽）与这里（清单/落盘）各写一遍迟早会漂移。
// 只规整 incoming：existing 侧的重名由读取层拒绝（项目文件整份拒绝、profile patch 由 mcp-client
// 在加载时拒绝），所以"重名"只可能从用户输入那一侧来。
function firstByName(servers) {
	const seen = new Set();
	return servers.filter((server) => (seen.has(server.name) ? false : Boolean(seen.add(server.name))));
}
// 「哪些名字算新增 / 更新 / 移除」的**唯一**规则。它只跟两份配置的名字集合有关——与写入策略、
// 与这是预览还是落盘都无关，所以任何路径都不可能给出第二个答案。`removed` 一律按「现有 − 导入」
// 算，所以两个作用域也不会再出现不一致的"移除"清单（项目替换曾恒报"移除：无"、却在真删条目）。
// 顺序固定：added 跟 incoming，updated / removed 跟 existing（用户看到的顺序就是配置里的顺序）；
// incoming 侧的重名先经 firstByName 收成一条，所以清单与 servers 不会出现两种答案。
function classifyMerge(existingServers, incomingServers) {
	const incoming = firstByName(incomingServers);
	const existingNames = new Set(existingServers.map((server) => server.name));
	const incomingNames = new Set(incoming.map((server) => server.name));
	return {
		added: incoming.filter((server) => !existingNames.has(server.name)).map((server) => server.name),
		updated: existingServers.filter((server) => incomingNames.has(server.name)).map((server) => server.name),
		removed: existingServers.filter((server) => !incomingNames.has(server.name)).map((server) => server.name),
	};
}
// 「把 incoming 并进 existing，或整份重建」的唯一实现，服务的是**整份配置**形态的两条写盘路径：
// 项目导入（lib/index.js 的 applyWorkspaceImport）与跨工作区复制（resolveWorkspaceCopy）。
// 全局导入写的是 profile patch（带 entry id 的 YAML 增量），形态不同、共用不了这份列表实现，
// 它的物化在 mcp-config.js 的 updateManagedMcpPatch 里——但那边的「哪些算新增/更新/移除」同样
// 来自 classifyMerge，所以**判定只有一份，物化有两份**（一个写整份 JSON、一个改 patch）。
// 改同名语义时两处都要动：这里改策略，那边改物化；别照着这一份推断另一条路径照此办理。
// 两个轴刻意分开，别把它们压成一个 `mode`：
//   - replaceAll：'保底并入' 还是 '整份重建'（导入的替换模式）。只决定落盘结果，不决定清单 ——
//     替换模式同样要如实报出新增/更新/移除。
//   - onExisting：命中同名时 incoming 胜（'replace'）还是目标胜（'skip'）。**这是参数而不是隐含
//     默认值**，因为两条路径的默认确实不同且刻意如此：导入「合并」= 同名更新（用户拿来一份 JSON
//     说"按这个改"），复制默认 = 跳过同名（目标里那条是目标自己的配置，要换得显式要求）。
// 清单与 servers 都由 classifyMerge 与这一次遍历产出，所以"结果文案与文件内容对不上"不是靠
// 约定避免的，是没有第二种可能。
function planMerge(existingServers, incomingServers, { replaceAll = false, onExisting = "replace" } = {}) {
	const incoming = firstByName(incomingServers);
	const names = classifyMerge(existingServers, incoming);
	const pending = new Map(incoming.map((server) => [server.name, server]));
	const existingNames = new Set(existingServers.map((server) => server.name));
	const servers = replaceAll
		? incoming.slice()
		: [
			...existingServers.map((server) => (onExisting === "replace" && pending.has(server.name) ? pending.get(server.name) : server)),
			...[...pending.values()].filter((server) => !existingNames.has(server.name)),
		];
	// 目标胜时被命中的名字进 skipped、updated 为空；incoming 胜时反过来。两者不会同时非空。
	const skipping = onExisting === "skip";
	return { servers, added: names.added, updated: skipping ? [] : names.updated, skipped: skipping ? names.updated : [], removed: names.removed };
}

// 预览的**唯一**格式化：把名字分类 + 来源提示拼成回浏览器的形状。它不再自己数名字（那是
// classifyMerge 的事），所以预览与实际落盘不可能由两套判断算出两种答案。
function mergePreview(existingServers, incomingServers, normalized, conflicts = []) {
	return { warnings: normalized.warnings, ...classifyMerge(existingServers, incomingServers), conflicts };
}
// 「同名，但占位的不是我管理的那个 entry」= 来自其他 bundle / Agent preset。它们的条目不在本
// patch 文件里，所以"跳过"既不会覆盖也不会删掉它们；反过来硬写下去就是同作用域重名，宿主加载
// 时会直接抛。取舍因此与批内重名一致：跳过这一条、导入其余，并把原因带进预览与结果提示。
function externalConflictNames(ctx, state, normalized) {
	const liveByName = new Map();
	for (const entry of externalMcpEntries(ctx, state)) {
		const name = entry.options.config.serverName;
		if (!liveByName.has(name)) liveByName.set(name, []);
		liveByName.get(name).push(entry);
	}
	return normalized.servers.filter((server) => {
		const live = liveByName.get(server.name) || [];
		const managedId = state.entryIds.get(server.name);
		return live.length > 0 && (!managedId || live.some((entry) => entry.options.id !== managedId));
	}).map((server) => server.name);
}
function resolveManagedImport(ctx, state, normalized) {
	const conflicts = externalConflictNames(ctx, state, normalized);
	if (!conflicts.length) return { importable: normalized, conflicts };
	const blocked = new Set(conflicts);
	return {
		importable: {
			...normalized,
			servers: normalized.servers.filter((server) => !blocked.has(server.name)),
			warnings: [...normalized.warnings, `已跳过被其他配置层占用的同名 MCP：${conflicts.join('、')}`],
		},
		conflicts,
	};
}
function importPreview(ctx, normalized, state) {
	const { importable, conflicts } = resolveManagedImport(ctx, state, normalized);
	return mergePreview(state.servers, importable.servers, importable, conflicts);
}
// 「跳过」必须在结果里说出来：否则用户只会觉得"我明明选了它"。
function withSkipped(note, names) {
	const unique = [...new Set(names)];
	return unique.length ? `${note}（跳过 ${unique.length} 条同名条目：${unique.join('、')}）` : note;
}

// ---------- 本机客户端来源导入 ----------
// Host 侧唯一的「读本机文件」通路：路径只在来源表里拼，这里只负责大小拦截与读取。
// 浏览器永远不传路径进来，所以接口面不会退化成「读任意文件」。
async function readSourceText(path, maxBytes) {
	const info = await stat(path);
	if (info.size > maxBytes) throw Object.assign(new Error(`来源文件超过上限：${path}`), { code: "CODE_TOO_LARGE" });
	return readFile(path, "utf8");
}
// wsPath 同时是「扫描上下文」与「写入目标」：全局标签没有 cwd，项目标签带着它，
// 与 previewImport / previewWorkspaceImport 的既有分工保持一致。
// `layer` 也在这里一次推出：它对「扫哪些来源」与「能不能导」必须是同一个值，两处各自推导就会漂移。
function sourceContext(wsPath) {
	return { home: homedir(), platform: process.platform, env: process.env, cwd: wsPath || undefined, layer: wsPath ? "project" : "global" };
}
// 与列表投影共用同一套掩码规则，这里只报字段名：用户在导入前需要知道来源带凭据，
// 但具体值一律不出 Host（要看真实值得走 reveal）。
function maskedSourceFields(spec) {
	const fields = [];
	if (spec.url !== undefined && redactUrl(spec.url) === REDACTED_VALUE) fields.push("url");
	if (Array.isArray(spec.args) && spec.args.length) fields.push("args");
	if (spec.env && Object.keys(spec.env).length) fields.push("env");
	if (spec.headers && Object.keys(spec.headers).length) fields.push("headers");
	return fields;
}
function selectSourceServers(row, names) {
	let wanted = null;
	if (names !== undefined) {
		if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) throw new Error("导入条目名必须是字符串数组");
		wanted = new Set(names);
		const unknown = [...wanted].filter((name) => !row.entries.some((entry) => entry.name === name && !entry.error));
		if (unknown.length) throw new Error(`来源中没有可导入的 MCP：${unknown.join(", ")}`);
	}
	const served = row.entries.filter((entry) => !entry.error && (wanted === null || wanted.has(entry.name)));
	if (!served.length) throw new Error("没有选中任何可导入的 MCP");
	// 提示只跟选中的条目走：没勾的条目（例如 Codex 的 enabled_tools）不该出现在这次预览里。
	const warnings = [...row.warnings, ...served.flatMap((entry) => entry.warnings || [])];
	// 选中的条目就是这次要落盘的那一份，先过准入，缺值提示才算在"真要写下去"的值上。
	const admitted = admitImportedServers({ servers: served.map((entry) => entry.spec), warnings });
	const missing = [...new Set(admitted.servers.flatMap((spec) => missingEnvNames(spec, process.env)))];
	return {
		servers: admitted.servers,
		// 用 admitted.warnings（= 来源级 + 选中条目级 + 准入产生的同名跳过说明），不要再拼一遍
		// 上面的局部数组，否则刚加进去的跳过说明会被这里丢掉。
		warnings: [...admitted.warnings, ...missing.map((name) => `环境变量 ${name} 当前未设置或为空，导入后该处会得到空值`)],
		skipped: admitted.skipped,
	};
}
// 扫描结果回浏览器的唯一边界。这里刻意只发界面真会渲染的字段（键集由
// `test/host-import-sources.test.mjs` 钉死）：多带一个字段就多一个泄密面，
// 而条目本体（含 `!!js` 表达式与字面密钥）永远不出 Host。
function projectSourceRow(row) {
	return {
		key: row.key,
		sourceId: row.sourceId,
		label: row.label,
		scope: row.scope,
		displayPath: row.displayPath,
		error: row.error,
		// 界面上的「N 条提示」是来源级 + 条目级的合计；条目级提示另挂在条目上，
		// 供预览只汇总选中条目的提示。
		warnings: [...row.warnings, ...row.entries.flatMap((entry) => entry.warnings || [])],
		entries: row.entries.map((entry) => ({
			name: entry.name,
			error: entry.error,
			maskedFields: entry.spec ? maskedSourceFields(entry.spec) : [],
			missingEnv: entry.spec ? missingEnvNames(entry.spec, process.env) : [],
		})),
	};
}
// 来源层与导入目标必须同一层，否则报错。「看到的来源 == 会写进去的那一层」这条不变量
// 在这里强制：客户端只是跟着显示（全局标签只列全局来源），不靠 UI 拦截。
function assertSourceLayer(layer, scope) {
	if (scope === layer) return;
	throw new Error(layer === "project"
		? "来源层级与导入目标不一致：项目标签只能导入该项目的项目级来源"
		: "来源层级与导入目标不一致：全局标签只能导入全局来源");
}
// 全局导入的写盘路径：粘贴 JSON 与本机客户端来源共用它，准入、同名跳过与 entry id 预留只写一份。
async function applyManagedImport(ctx, normalized, mode) {
	// 写盘口自己再准入一次（幂等）：不依赖调用方记得做，以后新增的入口也过不去。
	const admitted = admitImportedServers(normalized);
	return withPatchWrite(ctx, async () => {
		const state = await managedState(ctx);
		// 与预览走同一条解析：同名冲突在这里只影响"写哪几条"，不再让整批失败。
		const { importable, conflicts } = resolveManagedImport(ctx, state, admitted);
		const preview = mergePreview(state.servers, importable.servers, importable, conflicts);
		const releasedNames = mode === "replace" ? state.servers.map((server) => server.name) : preview.updated;
		const releasedIds = new Set(releasedNames.map((name) => state.entryIds.get(name)).filter(Boolean));
		const next = updateManagedMcpPatch(state.content, importable.servers, { replace: mode === "replace", reservedIds: reservedEntryIds(ctx, releasedIds) });
		// replace 会整批换掉行：消失的行要按 reconcile 的语义被移除（doomed 先标脏），
		// 新增的行必须真的起来（requiredIds）。两者都走同一个事务入口。
		const doomedIds = mode === "replace" ? doomedMcpIds(state, next) : [];
		const requiredIds = preview.added.map((name) => entryIdOf(next, name)).filter((id) => typeof id === "string");
		const outcome = await commitPatch(ctx, state, next, { label: "MCP 导入", doomedIds, requiredIds });
		return {
			added: preview.added,
			updated: preview.updated,
			removed: mode === "replace" ? preview.removed : [],
			warnings: preview.warnings,
			...outcome,
			note: withSkipped(mode === "replace" ? "已替换当前 profile 管理的 MCP 配置" : "已合并 MCP 配置", [...admitted.skipped, ...conflicts]),
		};
	});
}
function workspaceImportPreview(config, normalized) {
	// 项目导入没有「跨配置层同名冲突」这一说：官方按注册作用域判重，不同作用域同名合法；
	// 只有全局导入路径（importPreview）要处理外部 bundle/preset 占用的同名（跳过并提示）。
	return mergePreview(config.servers, normalized.servers, normalized);
}
// 项目导入的写盘路径，同样是粘贴 JSON 与来源导入共用。
// 写盘之后、**锁外**对齐连接。两件事必须这样安排：
//   1. reconcile 会 await 整条 teardown（dsh-scope 释放 + mcp-client 子进程关闭），放进写锁里会让
//      「移除一个卡住的 server」把该项目之后的每一次保存都一起卡住；
//   2. 它的失败不该把一个**已经落盘**的写报成失败 —— 写是既成事实，对齐失败只意味着"没立刻生效"。
//      所以吞成日志，不吞事实（面板按真实连接态显示）。
// **注意这里没有"下次挂载会重试"这条兜底**：挂载路径只遍历配置里**现存**的 server，所以
// 「新增/改配置」在下一次会话挂载时确实会被重新对齐，但**被删除**的 server 不在任何后续挂载里，
// 而 reconcile 是唯一会回收"配置里已不存在"的连接的路径 —— 对齐失败时它会留到空闲超时或卸载。
// 这是有意的取舍（写已经成功，不该因为一次 teardown 失败就报错），所以日志要如实说清后果。
async function alignWorkspaceConnections(ctx, wsPath) {
	try {
		await reconcileWorkspaceConnections(ctx, wsPath);
		return [];
	} catch (error) {
		const message = `mcp-manager: 项目 MCP 配置已写入，但对齐连接失败（下次会话挂载会重新对齐现存条目；若本次是删除，该连接要等空闲超时或插件卸载才回收）: ${error?.message ?? error}`;
		ctx.logger?.error?.(message);
		// 写是既成事实，对齐失败只意味着"没立刻生效"——所以吞成诊断，不能吞成事实。
		return [{ code: "WORKSPACE_ALIGN_FAILED", message }];
	}
}
// 项目族的延迟开关：整份重写 `.dsh/mcp.json`，只翻 defer 位。
// 与全局族分开两条写路径——项目配置不归 profile patch 管，混在一起会写错文件。
// defer 是活值：连接记录上的 entry.defer 由 mountProjectMcpForAgent 刷新，而下面的
// alignWorkspaceConnections 会对该项目的每个存活会话跑一次挂载，所以运行中的会话在
// 下一次视图重建就读到新值（deferServers 集合变 → revision 变 → 视图重建）。
//
// `names === undefined` = 该项目全部（一键）；给 names = 只翻这几台（行内单台开关）。
// 两条路共用同一份重写逻辑，所以"批量"与"单台"不可能写出不同的形状。
async function applyProjectDefer(ctx, wsPath, next, names) {
	const result = await withRegisteredWorkspaceWrite(ctx, wsPath, async () => {
		const config = await readWorkspaceConfigCached(ctx, wsPath);
		if (config.error) throw new Error(config.error);
		if (!config.servers.length) return { changed: 0, note: "该项目没有 MCP" };
		const targets = names === undefined ? config.servers : config.servers.filter((server) => names.includes(server.name));
		if (names !== undefined && !targets.length) throw new Error("该项目没有这个 MCP");
		// `{...server, defer: next}` 只翻这一位，其余字段原样带走；exclude 也原样传回去
		// （writeWorkspaceConfigFile 的第三个参数），翻 defer 不该动屏蔽名单。
		const servers = config.servers.map((server) => (names === undefined || names.includes(server.name) ? { ...server, defer: next } : server));
		await writeWorkspaceConfigFile(wsPath, servers, config.exclude);
		return {
			changed: targets.length,
			note: names === undefined
				? (next
					? `已把该项目的 ${servers.length} 个 MCP 切到延迟加载（ToolSearch 按需搜索）`
					: `已把该项目的 ${servers.length} 个 MCP 切回全量常驻`)
				: (next
					? `已把 ${names[0]} 切到延迟加载（ToolSearch 按需搜索）`
					: `已把 ${names[0]} 切回全量常驻`),
		};
	});
	if (result.changed === 0) return mutationResult("unchanged", "unchanged", result);
	const diagnostics = await alignWorkspaceConnections(ctx, wsPath);
	return mutationResult("applied", diagnostics.length ? "failed" : "applied", { ...result, diagnostics });
}
// 全局族的延迟开关：改 `<profile>/cordis.patch.yml`，只翻 defer 位。
//
// 只改**本 profile 且能定位到活条目**的服务器（managedLiveEntry）——外部 bundle/agent 的
// 同名条目不在 patch 里，扫过去只会静默失败。
//
// `names === undefined` = 全部（一键）；给 names = 只翻这几台（行内单台开关）。
// 单台时找不到目标必须**报错**：面板点了没反应（静默 no-op）是最难排查的形态。
//
// 刻意**不走 entry.update()**：那条路会 restart mcp-client 的 fiber、重连 MCP（serena 冷启动
// 1-1.5 分钟），而 defer 纯粹是遮罩、与连接无关，为了改遮罩断连接是不该付的代价。
// 直接同步内存 entry.options.config.defer —— deferServersOf 读的正是它；视图按 revision
// 自愈，所以运行中的会话在下一次组装就读到新值。
async function applyGlobalDefer(ctx, next, names) {
	return withPatchWrite(ctx, async () => {
		const state = await managedState(ctx);
		const specs = [];
		const liveEntries = [];
		for (const [name, current] of state.byName) {
			if (names !== undefined && !names.includes(name)) continue;
			const entry = managedLiveEntry(ctx, state, name);
			if (!entry) {
				if (names !== undefined) throw new Error("此 MCP 不属于当前 Web profile，不能改延迟开关");
				continue;
			}
			specs.push(normalizeOne({ ...current, defer: next }));
			liveEntries.push(entry);
		}
		if (names !== undefined && !specs.length) throw new Error("当前 Web profile 没有这个 MCP");
		if (!specs.length) return { changed: 0, persisted: "unchanged", live: "unchanged", diagnostics: [], note: "当前 Web profile 没有可修改的 MCP" };
		const content = updateManagedMcpPatch(state.content, specs, {
			replace: false,
			reservedIds: reservedEntryIds(ctx, new Set(specs.map((spec) => state.entryIds.get(spec.name)).filter(Boolean))),
		});
		const outcome = await commitPatch(ctx, state, content, {
			label: "MCP 延迟开关",
			applyLive: () => applyDeferMask(liveEntries, next),
		});
		return {
			...outcome,
			changed: specs.length,
			note: names === undefined
				? (next
					? `已把 ${specs.length} 个服务器切到延迟加载（ToolSearch 按需搜索，立即生效）`
					: `已把 ${specs.length} 个服务器切回全量常驻，立即生效`)
				: (next
					? `已把 ${names[0]} 切到延迟加载（ToolSearch 按需搜索，立即生效）`
					: `已把 ${names[0]} 切回全量常驻，立即生效`),
		};
	});
}
async function applyWorkspaceImport(ctx, wsPath, normalized, mode) {
	// 同 applyManagedImport：写盘口自己准入，唯一的写盘路径因此不可能写出重名集合。
	const admitted = admitImportedServers(normalized);
	const result = await withRegisteredWorkspaceWrite(ctx, wsPath, async () => {
		const config = await readWorkspaceConfigCached(ctx, wsPath);
		if (config.error) throw new Error(config.error);
		const plan = planMerge(config.servers, admitted.servers, { replaceAll: mode === "replace" });
		await writeWorkspaceConfigFile(wsPath, plan.servers, config.exclude);
		return {
			added: plan.added,
			updated: plan.updated,
			removed: plan.removed,
			warnings: admitted.warnings,
			note: withSkipped(mode === "replace" ? "已替换项目 MCP 配置" : "已合并项目 MCP 配置", admitted.skipped),
		};
	});
	// 导入同样是写盘：就地对齐存活会话（新增即挂、删除即撤、改动即重载）——但在锁外做。
	const diagnostics = await alignWorkspaceConnections(ctx, wsPath);
	return mutationResult("applied", diagnostics.length ? "failed" : "applied", { ...result, diagnostics });
}

// 复制计划的**唯一**解析：校验（目标已注册、源配置可读、选中的名字都在源里）+ 算出会新增/覆盖/
// 跳过哪些名字。预览与写盘共用它，所以界面给用户看的清单与实际落盘的结果不可能由两套判断算出
// 两种答案；预览之后目标被别的会话改过时，写盘会在锁内按最新配置重算一次。
// 这里也要校验目标：写路径由 withRegisteredWorkspaceWrite 兜底，而**预览**没有写动作，用户
// 正是在预览里该知道"这个目标不能写"。同一条规则（assertRegisteredWorkspace），不是两份判断。
async function resolveWorkspaceCopy(ctx, payload) {
	const from = canonicalWorkspacePath(String(payload?.from || ""));
	const to = canonicalWorkspacePath(String(payload?.to || ""));
	if (!to) throw new Error("缺少目标 workspace 路径");
	if (!from) throw new Error("缺少源 workspace 路径");
	if (from === to) throw new Error("源与目标是同一个工作区，无需复制");
	await assertRegisteredWorkspace(ctx, to);
	const source = await readWorkspaceConfigCached(ctx, from);
	if (source.error) throw new Error("源工作区配置无效：" + source.error);
	const wanted = payload?.names;
	let picked = source.servers;
	let selectionIsExplicit = false;
	if (wanted !== undefined) {
		if (!Array.isArray(wanted) || !wanted.every((name) => typeof name === "string")) throw new Error("要复制的条目名必须是字符串数组");
		selectionIsExplicit = true;
		const known = new Set(source.servers.map((server) => server.name));
		const unknown = [...new Set(wanted)].filter((name) => !known.has(name));
		if (unknown.length) throw new Error(`源工作区中没有这些 MCP：${unknown.join("、")}`);
		const selection = new Set(wanted);
		picked = source.servers.filter((server) => selection.has(server.name));
	}
	// 两种"没得复制"是不同的事，别报同一句话：源里本来没有，与这次一条都没勾。
	if (!picked.length) throw new Error(selectionIsExplicit ? "没有选中任何要复制的 MCP" : "源工作区没有可复制的 MCP");
	// 与两条导入路径同一个纪律：写盘口自己再过一遍准入（幂等），不依赖调用方记得做。
	const admitted = admitImportedServers({ servers: picked });
	const target = await readWorkspaceConfigCached(ctx, to);
	if (target.error) throw new Error("目标工作区配置无效：" + target.error);
	// 同名策略由调用点给出（见 planMerge 的注释）：复制默认目标胜，显式 overwrite 才 incoming 胜。
	const merged = planMerge(target.servers, admitted.servers, { onExisting: payload?.overwrite === true ? "replace" : "skip" });
	return {
		from,
		to,
		toName: basename(to),
		targetCount: target.servers.length,
		targetExclude: target.exclude,
		servers: merged.servers,
		added: merged.added,
		updated: merged.updated,
		skipped: merged.skipped,
		changed: merged.added.length + merged.updated.length > 0,
	};
}
// 回浏览器的那部分：只有名字与计数，配置值一律不出 Host（与导入的 mergePreview 同一条纪律）。
function copyPreviewOf(plan) {
	return {
		from: plan.from,
		to: plan.to,
		toName: plan.toName,
		targetCount: plan.targetCount,
		added: plan.added,
		updated: plan.updated,
		skipped: plan.skipped,
		changed: plan.changed,
	};
}
// 「跳过」必须被说出来：用户勾了 5 条、目标已有 3 条，只说"已复制 2 条"等于把另外 3 条算丢了。
function copyResultNote(toName, added, updated, skipped) {
	if (!added.length && !updated.length) {
		return `目标工作区 ${toName} 已有同名条目，未改动任何配置（跳过 ${skipped.length} 条：${skipped.join("、")}）`;
	}
	const parts = [];
	if (added.length) parts.push(`新增 ${added.length} 条（${added.join("、")}）`);
	if (updated.length) parts.push(`覆盖 ${updated.length} 条（${updated.join("、")}）`);
	if (skipped.length) parts.push(`跳过同名 ${skipped.length} 条（${skipped.join("、")}）`);
	return `已复制到 ${toName}：${parts.join("；")}`;
}

// ---------- workspace 项目层展示与校验 ----------
// 内部 spec 的 `!!js` 表达式 → 文件中的 `${VAR}` 模板形式；还原失败时原样返回（只影响展示，不落盘）。
function restoreTemplate(value) {
	if (typeof value !== "string" || !value.startsWith("!!js ")) return value;
	try { return jsExpressionToTemplate(value); } catch { return value; }
}
// ---------- 读「有效运行值」（详情页的眼睛）----------
// loader 把 `!!js` 表达式以 raw 形式留在 `entry.options.config`（官方为了写回保留 `!!js`
// 形式），到 apply 之前才用 loader 自己的 interpolate 求值。所以要把「解析后的值」显示出来
// 必须求值一次，而且必须用 entry 自己的 ctx——表达式可以引用该行 inject 的服务（官方用例：
// `!!js ctx.phaseOne.value`）。直接把 raw 当解析结果返回，对象就会序列化成 "[object Object]"。
const resolveLiveConfigValue = (entry, value) => interpolate(entry.ctx, value);
// 项目 spec 的字段值（内部 `!!js` 表达式）→ 有效运行值；与 `toMcpClientConfig` 用同一个求值器。
function resolveSpecValue(value, env) {
	if (typeof value === "string") return evaluateEnvExpression(value, env);
	if (Array.isArray(value)) return value.map((item) => resolveSpecValue(item, env));
	if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSpecValue(item, env)]));
	return value;
}

function workspaceServerView(server) {
	const row = {
		serverName: server.name,
		enabled: !server.disabled,
		managed: true,
		conflict: false,
		transport: server.transport === "stdio" ? "stdio" : "http",
		phase: "stopped",
		toolCount: 0,
		toolCountAmbiguous: false,
		toolRevision: "",
		status: "stopped",
		lastError: null,
		scope: "workspace",
	};
	// 展示层把内部 `!!js` 表达式还原为文件中的 `${VAR}` 模板，避免向用户泄漏内部表示；
	// 提交时 normalizeEntry 会再转回内部形式，roundtrip 可逆。
	// 这份投影必须覆盖"编辑表单不渲染但必须原样带回"的字段（idleTimeoutMs/readyTimeoutMs），
	// 否则用户编辑一次就把它们抹掉 —— 表单是重建 spec，不是增量改 spec。defer（ToolSearch
	// 延迟开关）同理：表单渲染它，但初始值要从行数据带进来。
	for (const field of ["command", "cwd", "toolCallTimeoutMs", "failOnStartupError", "idleTimeoutMs", "readyTimeoutMs", "defer"]) if (server[field] !== undefined) row[field] = restoreTemplate(server[field]);
	if (server.url !== undefined) row.url = restoreTemplate(redactUrl(server.url));
	if (server.args !== undefined) row.args = redactArgs(server.args);
	if (server.env !== undefined) row.env = redactMap(server.env);
	if (server.headers !== undefined) row.headers = redactMap(server.headers);
	if (server.reconnect !== undefined) row.reconnect = structuredClone(server.reconnect);
	return row;
}
// 这里不再有「serverName 全进程唯一」的校验函数：那是 DSH 0.1.0-rc.7 时期 mcp-client 的行为
// （它把注册表挂在 ctx.root 上）。0.1.5 起官方按注册作用域判重，而本插件给每个
// (项目, serverName) 一个独立作用域，所以跨项目、全局与项目之间同名都是合法配置。
// 仍然成立的唯一约束是同一作用域内不得重名：项目内同名会静默覆盖 mcpServers 的对象键，
// 由各写入路径自己校验；全局重名由 profile patch 的条目 id 承担。


// 全局 MCP 列表核心（list / getWorkspaceView 共用）。
async function listMcpServers(ctx, deferStateOf) {
	ensureLogCapture(ctx);
	const state = await managedState(ctx);
	const inventory = toolInventory(ctx);
	const groups = new Map();
	for (const entry of allMcpEntries(ctx)) {
		const name = entry.options.config.serverName;
		if (!groups.has(name)) groups.set(name, []);
		groups.get(name).push(entry);
	}
	const servers = [];
	for (const [name, entries] of groups) {
		const profileId = state.entryIds.get(name);
		const entry = entries.find((candidate) => candidate.options.id === profileId) || entries[0];
		// 「有几条同名」与「能改哪条」是两件事：前者只用于展示，后者只看 id。
		// 旧实现把两者合成一个 managed（冲突即 null），于是别人多一条同名条目就等于自己那条
		// 被锁死——真机上的「无法编辑和卸载」正是这个。
		const conflict = entries.length > 1;
		const managed = entry.options.id === profileId ? state.byName.get(name) : null;
		const duplicates = entries.filter((candidate) => candidate !== entry);
		const row = summarize(entry, inventory, managed, conflict, lastLogFor(ctx, name, entry.fiber), duplicates);
		// 统一策略下的实际延迟状态：与工具页同源（同一份 rows 的判定），芯片读这个而不是旧 defer。
		if (typeof deferStateOf === 'function') Object.assign(row, deferStateOf(name));
		servers.push(row);
	}
	return {
		servers,
		revision: listRevision(servers),
		revealRevision: revealRevision(state, groups),
	};
}

let McpManagerGateway = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _toolLoadingSettings_decorators, _updateToolLoadingSettings_decorators, _workspaceToolLoading_decorators, _setWorkspaceToolLoading_decorators;
	let _list_decorators, _status_decorators, _enable_decorators, _disable_decorators, _reconnect_decorators, _tools_decorators, _builtins_decorators, _installBuiltins_decorators, _add_decorators, _update_decorators, _remove_decorators, _setDeferAll_decorators, _setDefer_decorators, _toolSearchSettings_decorators, _updateToolSearchSettings_decorators, _reveal_decorators, _previewImport_decorators, _importJson_decorators, _scanImportSources_decorators, _previewImportSource_decorators, _importSource_decorators, _listWorkspaces_decorators, _getWorkspaceView_decorators, _addWorkspaceServer_decorators, _updateWorkspaceServer_decorators, _removeWorkspaceServer_decorators, _setWorkspaceExclude_decorators, _installWorkspaceBuiltins_decorators, _previewWorkspaceImport_decorators, _importWorkspaceJson_decorators, _copyWorkspaceServers_decorators, _previewWorkspaceCopy_decorators, _exportWorkspaceJson_decorators, _revealWorkspaceServer_decorators, _projectConnections_decorators, _reconnectWorkspaceServer_decorators, _updateHint_decorators, _whatsNew_decorators;
	return class McpManagerGateway extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_list_decorators = [Remote("list")];
			__esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: (obj) => "list" in obj, get: (obj) => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
			_status_decorators = [Remote("status")];
			__esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: (obj) => "status" in obj, get: (obj) => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
			_enable_decorators = [Remote("enable")];
			__esDecorate(this, null, _enable_decorators, { kind: "method", name: "enable", static: false, private: false, access: { has: (obj) => "enable" in obj, get: (obj) => obj.enable }, metadata: _metadata }, null, _instanceExtraInitializers);
			_disable_decorators = [Remote("disable")];
			__esDecorate(this, null, _disable_decorators, { kind: "method", name: "disable", static: false, private: false, access: { has: (obj) => "disable" in obj, get: (obj) => obj.disable }, metadata: _metadata }, null, _instanceExtraInitializers);
			_reconnect_decorators = [Remote("reconnect")];
			__esDecorate(this, null, _reconnect_decorators, { kind: "method", name: "reconnect", static: false, private: false, access: { has: (obj) => "reconnect" in obj, get: (obj) => obj.reconnect }, metadata: _metadata }, null, _instanceExtraInitializers);
			_tools_decorators = [Remote("tools")];
			__esDecorate(this, null, _tools_decorators, { kind: "method", name: "tools", static: false, private: false, access: { has: (obj) => "tools" in obj, get: (obj) => obj.tools }, metadata: _metadata }, null, _instanceExtraInitializers);
			_builtins_decorators = [Remote("builtins")];
			__esDecorate(this, null, _builtins_decorators, { kind: "method", name: "builtins", static: false, private: false, access: { has: (obj) => "builtins" in obj, get: (obj) => obj.builtins }, metadata: _metadata }, null, _instanceExtraInitializers);
			_installBuiltins_decorators = [Remote("installBuiltins")];
			__esDecorate(this, null, _installBuiltins_decorators, { kind: "method", name: "installBuiltins", static: false, private: false, access: { has: (obj) => "installBuiltins" in obj, get: (obj) => obj.installBuiltins }, metadata: _metadata }, null, _instanceExtraInitializers);
			_add_decorators = [Remote("add")];
			__esDecorate(this, null, _add_decorators, { kind: "method", name: "add", static: false, private: false, access: { has: (obj) => "add" in obj, get: (obj) => obj.add }, metadata: _metadata }, null, _instanceExtraInitializers);
			_update_decorators = [Remote("update")];
			__esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: (obj) => "update" in obj, get: (obj) => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
			_remove_decorators = [Remote("removeServer")];
			__esDecorate(this, null, _remove_decorators, { kind: "method", name: "removeServer", static: false, private: false, access: { has: (obj) => "removeServer" in obj, get: (obj) => obj.removeServer }, metadata: _metadata }, null, _instanceExtraInitializers);
			// setDeferAll 曾经漏了这条 @Remote：服务端有实现、面板有按钮，wire 上却没有 descriptor，
			// 于是客户端 call('setDeferAll') 拿到的是「服务未连接」——真浏览器里点"全部开启/关闭延迟"
			// 毫无反应。补在 removeServer 之后，与 typert.js / client.js 两份清单同序。
			_setDeferAll_decorators = [Remote("setDeferAll")];
			__esDecorate(this, null, _setDeferAll_decorators, { kind: "method", name: "setDeferAll", static: false, private: false, access: { has: (obj) => "setDeferAll" in obj, get: (obj) => obj.setDeferAll }, metadata: _metadata }, null, _instanceExtraInitializers);
			// 单台的延迟开关（行内芯片用）。与 setDeferAll 共用写路径，只把 names 收窄到一个。
			_setDefer_decorators = [Remote("setDefer")];
			__esDecorate(this, null, _setDefer_decorators, { kind: "method", name: "setDefer", static: false, private: false, access: { has: (obj) => "setDefer" in obj, get: (obj) => obj.setDefer }, metadata: _metadata }, null, _instanceExtraInitializers);
			// C2：延迟加载的三个参数。读/写分开两个方法，而不是一个 get/set 复用的方法——
			// 三边清单（@Remote / typert / client descriptor）按位置比对，一个方法承担两种语义
			// 会让"这次只读"和"这次要写盘"在调用点上分不清。
			_toolSearchSettings_decorators = [Remote("toolSearchSettings")];
			__esDecorate(this, null, _toolSearchSettings_decorators, { kind: "method", name: "toolSearchSettings", static: false, private: false, access: { has: (obj) => "toolSearchSettings" in obj, get: (obj) => obj.toolSearchSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
			_updateToolSearchSettings_decorators = [Remote("updateToolSearchSettings")];
			__esDecorate(this, null, _updateToolSearchSettings_decorators, { kind: "method", name: "updateToolSearchSettings", static: false, private: false, access: { has: (obj) => "updateToolSearchSettings" in obj, get: (obj) => obj.updateToolSearchSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
			// 统一工具加载策略：全局读写 + 项目读写。三边清单（@Remote / typert / client）必须同序。
			_toolLoadingSettings_decorators = [Remote("toolLoadingSettings")];
			__esDecorate(this, null, _toolLoadingSettings_decorators, { kind: "method", name: "toolLoadingSettings", static: false, private: false, access: { has: (obj) => "toolLoadingSettings" in obj, get: (obj) => obj.toolLoadingSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
			_updateToolLoadingSettings_decorators = [Remote("updateToolLoadingSettings")];
			__esDecorate(this, null, _updateToolLoadingSettings_decorators, { kind: "method", name: "updateToolLoadingSettings", static: false, private: false, access: { has: (obj) => "updateToolLoadingSettings" in obj, get: (obj) => obj.updateToolLoadingSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
			_workspaceToolLoading_decorators = [Remote("workspaceToolLoading")];
			__esDecorate(this, null, _workspaceToolLoading_decorators, { kind: "method", name: "workspaceToolLoading", static: false, private: false, access: { has: (obj) => "workspaceToolLoading" in obj, get: (obj) => obj.workspaceToolLoading }, metadata: _metadata }, null, _instanceExtraInitializers);
			_setWorkspaceToolLoading_decorators = [Remote("setWorkspaceToolLoading")];
			__esDecorate(this, null, _setWorkspaceToolLoading_decorators, { kind: "method", name: "setWorkspaceToolLoading", static: false, private: false, access: { has: (obj) => "setWorkspaceToolLoading" in obj, get: (obj) => obj.setWorkspaceToolLoading }, metadata: _metadata }, null, _instanceExtraInitializers);
			_reveal_decorators = [Remote("reveal")];
			__esDecorate(this, null, _reveal_decorators, { kind: "method", name: "reveal", static: false, private: false, access: { has: (obj) => "reveal" in obj, get: (obj) => obj.reveal }, metadata: _metadata }, null, _instanceExtraInitializers);
			_previewImport_decorators = [Remote("previewImport")];
			__esDecorate(this, null, _previewImport_decorators, { kind: "method", name: "previewImport", static: false, private: false, access: { has: (obj) => "previewImport" in obj, get: (obj) => obj.previewImport }, metadata: _metadata }, null, _instanceExtraInitializers);
			_importJson_decorators = [Remote("importJson")];
			__esDecorate(this, null, _importJson_decorators, { kind: "method", name: "importJson", static: false, private: false, access: { has: (obj) => "importJson" in obj, get: (obj) => obj.importJson }, metadata: _metadata }, null, _instanceExtraInitializers);
			_scanImportSources_decorators = [Remote("scanImportSources")];
			__esDecorate(this, null, _scanImportSources_decorators, { kind: "method", name: "scanImportSources", static: false, private: false, access: { has: (obj) => "scanImportSources" in obj, get: (obj) => obj.scanImportSources }, metadata: _metadata }, null, _instanceExtraInitializers);
			_previewImportSource_decorators = [Remote("previewImportSource")];
			__esDecorate(this, null, _previewImportSource_decorators, { kind: "method", name: "previewImportSource", static: false, private: false, access: { has: (obj) => "previewImportSource" in obj, get: (obj) => obj.previewImportSource }, metadata: _metadata }, null, _instanceExtraInitializers);
			_importSource_decorators = [Remote("importSource")];
			__esDecorate(this, null, _importSource_decorators, { kind: "method", name: "importSource", static: false, private: false, access: { has: (obj) => "importSource" in obj, get: (obj) => obj.importSource }, metadata: _metadata }, null, _instanceExtraInitializers);
			_listWorkspaces_decorators = [Remote("listWorkspaces")];
			__esDecorate(this, null, _listWorkspaces_decorators, { kind: "method", name: "listWorkspaces", static: false, private: false, access: { has: (obj) => "listWorkspaces" in obj, get: (obj) => obj.listWorkspaces }, metadata: _metadata }, null, _instanceExtraInitializers);
			_getWorkspaceView_decorators = [Remote("getWorkspaceView")];
			__esDecorate(this, null, _getWorkspaceView_decorators, { kind: "method", name: "getWorkspaceView", static: false, private: false, access: { has: (obj) => "getWorkspaceView" in obj, get: (obj) => obj.getWorkspaceView }, metadata: _metadata }, null, _instanceExtraInitializers);
			_addWorkspaceServer_decorators = [Remote("addWorkspaceServer")];
			__esDecorate(this, null, _addWorkspaceServer_decorators, { kind: "method", name: "addWorkspaceServer", static: false, private: false, access: { has: (obj) => "addWorkspaceServer" in obj, get: (obj) => obj.addWorkspaceServer }, metadata: _metadata }, null, _instanceExtraInitializers);
			_updateWorkspaceServer_decorators = [Remote("updateWorkspaceServer")];
			__esDecorate(this, null, _updateWorkspaceServer_decorators, { kind: "method", name: "updateWorkspaceServer", static: false, private: false, access: { has: (obj) => "updateWorkspaceServer" in obj, get: (obj) => obj.updateWorkspaceServer }, metadata: _metadata }, null, _instanceExtraInitializers);
			_removeWorkspaceServer_decorators = [Remote("removeWorkspaceServer")];
			__esDecorate(this, null, _removeWorkspaceServer_decorators, { kind: "method", name: "removeWorkspaceServer", static: false, private: false, access: { has: (obj) => "removeWorkspaceServer" in obj, get: (obj) => obj.removeWorkspaceServer }, metadata: _metadata }, null, _instanceExtraInitializers);
			_setWorkspaceExclude_decorators = [Remote("setWorkspaceExclude")];
			__esDecorate(this, null, _setWorkspaceExclude_decorators, { kind: "method", name: "setWorkspaceExclude", static: false, private: false, access: { has: (obj) => "setWorkspaceExclude" in obj, get: (obj) => obj.setWorkspaceExclude }, metadata: _metadata }, null, _instanceExtraInitializers);
			_installWorkspaceBuiltins_decorators = [Remote("installWorkspaceBuiltins")];
			__esDecorate(this, null, _installWorkspaceBuiltins_decorators, { kind: "method", name: "installWorkspaceBuiltins", static: false, private: false, access: { has: (obj) => "installWorkspaceBuiltins" in obj, get: (obj) => obj.installWorkspaceBuiltins }, metadata: _metadata }, null, _instanceExtraInitializers);
			_previewWorkspaceImport_decorators = [Remote("previewWorkspaceImport")];
			__esDecorate(this, null, _previewWorkspaceImport_decorators, { kind: "method", name: "previewWorkspaceImport", static: false, private: false, access: { has: (obj) => "previewWorkspaceImport" in obj, get: (obj) => obj.previewWorkspaceImport }, metadata: _metadata }, null, _instanceExtraInitializers);
			_importWorkspaceJson_decorators = [Remote("importWorkspaceJson")];
			__esDecorate(this, null, _importWorkspaceJson_decorators, { kind: "method", name: "importWorkspaceJson", static: false, private: false, access: { has: (obj) => "importWorkspaceJson" in obj, get: (obj) => obj.importWorkspaceJson }, metadata: _metadata }, null, _instanceExtraInitializers);
			_copyWorkspaceServers_decorators = [Remote("copyWorkspaceServers")];
			__esDecorate(this, null, _copyWorkspaceServers_decorators, { kind: "method", name: "copyWorkspaceServers", static: false, private: false, access: { has: (obj) => "copyWorkspaceServers" in obj, get: (obj) => obj.copyWorkspaceServers }, metadata: _metadata }, null, _instanceExtraInitializers);
			_previewWorkspaceCopy_decorators = [Remote("previewWorkspaceCopy")];
			__esDecorate(this, null, _previewWorkspaceCopy_decorators, { kind: "method", name: "previewWorkspaceCopy", static: false, private: false, access: { has: (obj) => "previewWorkspaceCopy" in obj, get: (obj) => obj.previewWorkspaceCopy }, metadata: _metadata }, null, _instanceExtraInitializers);
			_exportWorkspaceJson_decorators = [Remote("exportWorkspaceJson")];
			__esDecorate(this, null, _exportWorkspaceJson_decorators, { kind: "method", name: "exportWorkspaceJson", static: false, private: false, access: { has: (obj) => "exportWorkspaceJson" in obj, get: (obj) => obj.exportWorkspaceJson }, metadata: _metadata }, null, _instanceExtraInitializers);
			_revealWorkspaceServer_decorators = [Remote("revealWorkspaceServer")];
			__esDecorate(this, null, _revealWorkspaceServer_decorators, { kind: "method", name: "revealWorkspaceServer", static: false, private: false, access: { has: (obj) => "revealWorkspaceServer" in obj, get: (obj) => obj.revealWorkspaceServer }, metadata: _metadata }, null, _instanceExtraInitializers);
			_projectConnections_decorators = [Remote("projectConnections")];
			__esDecorate(this, null, _projectConnections_decorators, { kind: "method", name: "projectConnections", static: false, private: false, access: { has: (obj) => "projectConnections" in obj, get: (obj) => obj.projectConnections }, metadata: _metadata }, null, _instanceExtraInitializers);
			_reconnectWorkspaceServer_decorators = [Remote("reconnectWorkspaceServer")];
			__esDecorate(this, null, _reconnectWorkspaceServer_decorators, { kind: "method", name: "reconnectWorkspaceServer", static: false, private: false, access: { has: (obj) => "reconnectWorkspaceServer" in obj, get: (obj) => obj.reconnectWorkspaceServer }, metadata: _metadata }, null, _instanceExtraInitializers);
			_updateHint_decorators = [Remote("updateHint")];
			__esDecorate(this, null, _updateHint_decorators, { kind: "method", name: "updateHint", static: false, private: false, access: { has: (obj) => "updateHint" in obj, get: (obj) => obj.updateHint }, metadata: _metadata }, null, _instanceExtraInitializers);
			_whatsNew_decorators = [Remote("whatsNew")];
			__esDecorate(this, null, _whatsNew_decorators, { kind: "method", name: "whatsNew", static: false, private: false, access: { has: (obj) => "whatsNew" in obj, get: (obj) => obj.whatsNew }, metadata: _metadata }, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
		}
		static inject = ["loader", "tools"];
		// C2：插件配置面。**这是本插件第一次有 Config**——所以 schema 必须接受 `undefined`
		// （存量 profile 的 patch 行没有 config），否则升级即等于面板消失。
		static Config = ToolSearchConfigSchema;
		constructor(ctx, config) {
			super(ctx, "mcpManager");
			ensureLogCapture(ctx);
			installAgentRuntime(ctx);
			// MCP ToolSearch：按服务器延迟加载工具定义（docs/mcp-tool-search-design.md）。
			// 配置走**函数**形态（活配置）：用户在面板改 defer 开关、或 loader 条目变化后，
			// 下一次组装即生效，不重装本功能。总开关
			// DSH_MCP_TOOL_SEARCH=off 在配置桥里短路。生命周期归属走 effect，与
			// installAgentRuntime 同一惯例。
			//
			// **无条件装配**，呈现模式由每个 agent 自己判（`ctx.tools.modeFor(agent)`）：
			// 装配点这里能拿到的只有**部署默认层**的模式，而模式是 per-agent 的（preset 的
			// `presentAs` 会覆盖它）。原来的 `modeFor() === "native"` 是进程级判断，于是
			// "部署 PTC + 某个 agent 要 native"（或反过来）整机都不装——那才是缺陷本体。
			//
			// 三种取值的行为（DECISIONS §11.4）：`native` 与 `ptc` 都启用（遮罩/目录/守卫
			// 照旧，`ptc` 另裁 `tools:sdk` 手册），**只有 `both` 是 inert**。
			// "非 native 就 inert" 会把 PTC 整个关掉，是这条判据最容易写错的地方。
			//
			// C2：三个有证据的参数（maxResults / maxCatalogChars / maxDiscovered）由插件自己的
			// config（`config.toolSearch`，已过 Config schema）提供，装配时传**生效值**。
			// 改参数走 updateToolSearchSettings：写盘 + **重装**本运行时（理由见那里的注释）。
			const toolSearchSettings = effectiveToolSearchSettings(readToolSearchSettings(config));
			// 统一加载策略：全局这一份随插件 config 一起进内存，项目那一份由挂载路径带进会话状态。
			// 策略是**活值**（每次视图重建重新合成），所以改完不需要重装运行时。
			// 会话清单必须**独立于项目 MCP 挂载**地维护：没有项目配置的工作区一样有会话，
			// 而 DSH 0.2 把大量模型可见工具放在 agent 作用域里——不记这些 agent，面板就只能看到全局那几个。
			this.liveAgents = new Set();
			ctx.on("agent/created", (payload) => {
				const agent = payload?.agent;
				if (agent) this.liveAgents.add(agent);
			});
			ctx.on("agent/disposed", (payload) => {
				const agent = payload?.agent;
				if (agent) this.liveAgents.delete(agent);
			});
			this.globalToolLoading = readToolLoadingPolicy(config);
			const policyFor = (agent, schemas) => this.loadingPolicy(agent, schemas);
			this.toolSearchRuntime = installToolSearchIsolated(ctx, toolSearchSettings, policyFor);
			// 闭包读 this.toolSearchRuntime：重装之后 teardown 拿到的才是最新那份 disposer。
			ctx.effect(() => () => this.toolSearchRuntime.dispose(), "mcp-manager.toolSearch");
			// 技能服务作为**子插件**在同一个 patch 条目内挂载（SPEC 约束 15）：
			// cordis.patch.yml 只有一条 `- id: mcp-manager-ui / name: <包名>`，而package-contract
			// 断言该 id 与 name 各出现恰好 1 次，所以不得为 skills 新增 patch 条目。
			// 子插件自带 inject=["skills"]，未挂载 dsh-skill 时它只保持不激活，不影响本服务。
			ctx.plugin(SkillsManagerGateway, {});
			__runInitializers(this, _instanceExtraInitializers);
		}
		async list() {
			return listMcpServers(this.ctx, typeof this.deferStateOf === "function" ? (name) => this.deferStateOf(name) : undefined);
		}
		async status(name) {
			ensureLogCapture(this.ctx);
			const value = String(name);
			const state = await managedState(this.ctx);
			const matches = entriesForName(this.ctx, value);
			if (!matches.length) throw new Error("no such MCP: " + name);
			const profileId = state.entryIds.get(value);
			const entry = matches.find((candidate) => candidate.options.id === profileId) || matches[0];
			const conflict = matches.length > 1;
			const inventory = toolInventory(this.ctx);
			const managed = entry.options.id === profileId ? state.byName.get(value) : null;
			const duplicates = matches.filter((candidate) => candidate !== entry);
			return { server: summarize(entry, inventory, managed, conflict, lastLogFor(this.ctx, value, entry.fiber), duplicates) };
		}
		async enable(name) {
			return this.setDisabled(String(name), false);
		}
		async disable(name) {
			return this.setDisabled(String(name), true);
		}
		async setDisabled(name, disabled) {
			return withPatchWrite(this.ctx, async () => {
				const state = await managedState(this.ctx);
				const entry = managedLiveEntry(this.ctx, state, name);
				if (!entry) throw new Error("此 MCP 来自其他 bundle，或不属于当前 Web profile，不能修改");
				const entryId = entry.options.id;
				const next = setManagedMcpDisabled(state.content, name, disabled);
				const alreadyThere = next === state.content && entry.disabled === disabled;
				// 内容没变也照样 reconcile：盘上早就是 disabled、运行中却还在跑（或反过来）正是
				// 需要"校准"的状态，不能因为"文件不用改"就把它留下。
				const result = await commitPatch(this.ctx, state, next, {
					label: "MCP 状态更新",
					entryId,
					expect: { present: true, disabled },
					verifyLive: (entries) => {
						if (entries.length !== 1) throw new Error(`MCP 条目 ${entryId} 生效后 live owner 数量异常：${entries.length}`);
						if (entries[0].disabled !== disabled) throw new Error(`MCP 条目 ${entryId} 的${disabled ? "禁用" : "启用"}未生效`);
					},
				});
				const note = alreadyThere
					? (disabled ? "already disabled" : "already enabled")
					: result.live === "applied"
						? (disabled ? "已禁用并写入 profile patch" : "已启用并写入 profile patch")
						: `已写入 profile patch；${result.liveReason ?? "本部署没有热应用入口"}，重启宿主后${disabled ? "才会停" : "才会启动"}`;
				return { ...result, note };
			});
		}
		async reconnect(name) {
			const value = String(name);
			const state = await managedState(this.ctx);
			const entry = managedLiveEntry(this.ctx, state, value);
			if (!entry) throw new Error("此 MCP 来自其他 bundle，或不属于当前 Web profile，不能重连");
			if (entry.disabled) throw new Error("MCP 已禁用，请先启用");
			try {
				if (entry.fiber) await entry.fiber.restart();
				else await entry.refresh();
			} catch (error) {
				throw new ProfileMutationError(`MCP 重连失败：${error?.message ?? error}`, mutationResult("unchanged", "failed", {
					diagnostics: [{ code: "MCP_RECONNECT_FAILED", message: String(error?.message ?? error) }],
					cause: error,
				}));
			}
			// 重连不改配置：盘上 unchanged，运行中的连接已经按当前配置重建。
			return mutationResult("unchanged", "applied", { note: "restart requested" });
		}
		async tools(payload) {
			// 契约声明的是一个 payload 对象：全局 MCP 只需 name，项目 MCP 还要 wsPath。跳作用域
			// 同名是合法配置（官方按注册作用域隔离），所以光按名字扫描会把 A 项目的工具列到
			// B 项目的详情里；有 wsPath 时必须按 (wsPath, serverName) 精确定位。
			const value = String(payload?.name ?? "");
			const inventory = toolInventory(this.ctx);
			const global = inventory.schemas.get(value);
			if (global !== undefined) return { tools: global.map(projectToolSchema), ambiguous: inventory.ambiguous.has(value) };
			// 项目 MCP 不是 loader 条目，它的工具注册在共享作用域层里，toolInventory 走的全局视图
			// 根本看不到（这是之前面板列表报“N 工具”、详情却永远空白的原因）。按 scopeKey 枚举。
			const rawPath = payload?.wsPath;
			const wsPath = typeof rawPath === "string" && rawPath ? canonicalWorkspacePath(rawPath) : undefined;
			return { tools: workspaceToolSchemas(this.ctx, value, wsPath).map(projectToolSchema), ambiguous: false };
		}
		async builtins() {
			const state = await managedState(this.ctx);
			return { builtins: builtinMcpCatalog(effectiveMcpServers(this.ctx, state)) };
		}
		async installBuiltins(payload) {
			return withPatchWrite(this.ctx, async () => {
				const state = await managedState(this.ctx);
				const result = appendSelectedBuiltinMcpServers(
					state.content,
					effectiveMcpServers(this.ctx, state),
					payload?.ids,
					{ reservedIds: reservedEntryIds(this.ctx) },
				);
				const notes = [];
				if (result.added.length) notes.push(`已追加：${result.added.join(", ")}`);
				if (result.skipped.length) notes.push(`已存在并跳过：${result.skipped.join(", ")}`);
				const { content: _content, ...summary } = result;
				if (!result.added.length) return { ...summary, persisted: "unchanged", live: "unchanged", note: notes.join("；") || "未修改配置" };
				// 追加的条目也要在运行中的进程里真跑起来：只写盘的话，用户点完"安装"连不上、
				// 也没工具，必须重启宿主。id 取自刚写出的 patch（与 add 同一条规则）。
				const pending = [];
				for (const builtin of BUILTIN_MCP_SERVERS) {
					if (!result.added.includes(builtin.id)) continue;
					const entryId = entryIdOf(result.content, builtin.name);
					if (!entryId) throw new Error(`内置 MCP 追加后未在 profile patch 中找到条目 id：${builtin.name}`);
					pending.push(entryId);
				}
				if (pending.length !== result.added.length) throw new Error(`内置 MCP 追加数与 patch 条目数不一致：${result.added.join(", ")}`);
				const outcome = await commitPatch(this.ctx, state, result.content, {
					label: "内置 MCP 安装",
					requiredIds: pending,
					verifyLive: () => {
						for (const entryId of pending) {
							const live = [...this.ctx.loader.entries()].filter((entry) => entry.options.id === entryId);
							if (live.length !== 1) throw new Error(`内置 MCP 条目 ${entryId} 生效后 live owner 数量异常：${live.length}`);
						}
					},
				});
				return {
					...summary,
					...outcome,
					note: outcome.live === "applied"
						? `${notes.join("；")}，已开始连接（无需重启宿主）`
						: `${notes.join("；")}；${outcome.liveReason ?? "本部署没有热应用入口"}，重启宿主后生效`,
				};
			});
		}
		async add(spec) {
			if (containsRedactedValue(spec)) throw new Error("新增 MCP 不能包含保留原值标记");
			const normalized = normalizeOne(spec);
			return withPatchWrite(this.ctx, async () => {
				const state = await managedState(this.ctx);
				if (hasExternalMcpName(this.ctx, state, normalized.name) || state.byName.has(normalized.name)) throw new Error("MCP already exists: " + normalized.name);
				const next = updateManagedMcpPatch(state.content, [normalized], { replace: false, reservedIds: reservedEntryIds(this.ctx) });
				// id 必须与 patch 行一致：resolveManagedEntry 靠它认人。它同时也是 reconcile 的
				// requiredIds（这一行起不来就必须报错，而不是留一条连不上的行）。
				const entryId = entryIdOf(next, normalized.name);
				if (!entryId) throw new Error(`新增 MCP 后未在 profile patch 中找到条目 id：${normalized.name}`);
				const result = await commitPatch(this.ctx, state, next, {
					label: "MCP 新增",
					entryId,
					// 覆盖判定对齐官方：**整份 config 深比较**。含表达式的行跳过这一半（见
					// containsExpressionValue 的注释），否则会把正常保存判成"被覆盖"。
					expect: {
						present: true,
						disabled: false,
						...(containsExpressionValue(normalized) ? {} : { config: toMcpClientConfig(normalized) }),
					},
					requiredIds: [entryId],
					verifyLive: (entries) => {
						if (entries.length !== 1) throw new Error(`MCP 条目 ${entryId} 生效后 live owner 数量异常：${entries.length}`);
					},
				});
				return {
					...result,
					note: result.live === "applied"
						? "已添加并开始连接（无需重启宿主）"
						: `已写入 profile 配置；${result.liveReason ?? "本部署没有热应用入口"}，重启宿主后生效`,
				};
			});
		}
		async update(spec) {
			const requestedName = String(spec?.name || "").trim();
			return withPatchWrite(this.ctx, async () => {
				const state = await managedState(this.ctx);
				const current = state.byName.get(requestedName);
				const entry = current && managedLiveEntry(this.ctx, state, requestedName);
				if (!current || !entry) throw new Error("此 MCP 不属于当前 Web profile，不能编辑");
				const entryId = entry.options.id;
				const normalized = normalizeOne(restoreRedactedSpec(spec, current));
				if (!Object.hasOwn(normalized, "disabled") && current.disabled) normalized.disabled = true;
				const next = updateManagedMcpPatch(state.content, [normalized], { replace: false, reservedIds: reservedEntryIds(this.ctx, new Set([state.entryIds.get(normalized.name)].filter(Boolean))) });
				// 生效路径按"这次改了什么"分流，两条都走同一个事务（写盘 + 回滚）：
				//
				//   - 只翻 defer（纯遮罩、与连接无关）→ 同步运行中的 options 即可。为翻一个布尔位
				//     重启 mcp-client（serena 冷启动 1-1.5 分钟）是不该付的代价。
				//   - 动了连接身份/行为字段 → reconcile 重启该行的 fiber、重连，并判定它真的起来了。
				if (!touchesConnection(normalized, current)) {
					const result = await commitPatch(this.ctx, state, next, {
						label: "MCP 更新",
						entryId,
						applyLive: () => applyDeferMask([entry], normalized.defer === true),
					});
					return { ...result, note: "已更新 profile patch，立即生效" };
				}
				const result = await commitPatch(this.ctx, state, next, {
					label: "MCP 更新",
					entryId,
					// 同 add()：表达式行跳过 config 深比较，其余行照常。
					expect: {
						present: true,
						disabled: normalized.disabled === true,
						...(containsExpressionValue(normalized) ? {} : { config: toMcpClientConfig(normalized) }),
					},
					requiredIds: normalized.disabled === true ? [] : [entryId],
					verifyLive: (entries) => {
						if (entries.length !== 1) throw new Error(`MCP 条目 ${entryId} 生效后 live owner 数量异常：${entries.length}`);
					},
				});
				return { ...result, note: result.live === "applied" ? "已更新 profile patch，正在重连" : `已更新 profile patch；${result.liveReason ?? "本部署没有热应用入口"}，重启宿主后生效` };
			});
		}
		/**
		 * 一键把 MCP 切到延迟加载（或全量常驻）。两个作用域各走各的写路径：
		 *
		 *   - `wsPath` 为空 → 全局族：改 `<profile>/cordis.patch.yml`（withPatchWrite）
		 *   - `wsPath` 非空 → 项目族：改 `<项目>/.dsh/mcp.json`（withRegisteredWorkspaceWrite）
		 *
		 * 服务端批量而不是客户端循环调 update：① 只读一次、只写一次盘，N 个服务器不会付 N 次
		 * 读-改-写；② spec 从配置原文构造，不经过客户端，也就不会碰到"保留原值标记"那套密钥
		 * 回流逻辑；③ 一次写入是原子的，看不到半套改完的中间态。
		 *
		 * 全局族只改**本 profile 且能定位到活条目**的服务器（managedLiveEntry）——外部
		 * bundle/agent 的同名条目不在 patch 里，扫过去只会静默失败。项目族没有这个歧义：
		 * `.dsh/mcp.json` 就是这个项目自己的配置，整份重写。
		 */
		async setDeferAll(payload) {
			const next = payload?.defer === true;
			// ⚠️ 不能写 `canonicalWorkspacePath(String(payload?.wsPath || ""))` 判真假：
			// Windows 上 `realpathSync("")` 返回 **cwd** 而不抛错，于是"没传 wsPath"会被
			// 解析成当前目录、误走项目分支。先自己判空，再规范化。
			const requested = typeof payload?.wsPath === "string" ? payload.wsPath.trim() : "";
			const wsPath = requested ? canonicalWorkspacePath(requested) : "";
			if (wsPath) return applyProjectDefer(this.ctx, wsPath, next, undefined);
			return applyGlobalDefer(this.ctx, next, undefined);
		}
		/**
		 * 单台的延迟开关（面板行内那颗「延迟 / 全量」芯片直接调它）。
		 *
		 * 与 setDeferAll 共用同一份写路径（`applyGlobalDefer` / `applyProjectDefer`），
		 * 区别只有 `names`：批量传 undefined，单台传 [name]。这样"批量"与"单台"不可能
		 * 写出不同的配置形状，也不需要客户端自己去拼一份 spec（那会碰"保留原值标记"那套
		 * 密钥回流逻辑，为了翻一个布尔位不值得）。
		 */
		async setDefer(payload) {
			const name = String(payload?.name ?? "").trim();
			if (name === "") throw new Error("缺少 MCP 名称");
			const next = payload?.defer === true;
			const requested = typeof payload?.wsPath === "string" ? payload.wsPath.trim() : "";
			const wsPath = requested ? canonicalWorkspacePath(requested) : "";
			const outcome = wsPath ? await applyProjectDefer(this.ctx, wsPath, next, [name]) : await applyGlobalDefer(this.ctx, next, [name]);
			// 写完再看**模型实际会看到**的状态。策略层（组级 / 单工具覆盖）的优先级高于这台服务器的
			// 开关，被压着的时候翻开关不会有任何变化——必须当场说出来，否则用户看到"已切到延迟"
			// 却什么也没发生，那是最难排查的一种反馈。
			const effective = this.deferStateOf(name);
			if (effective.toolCountForDefer === 0 || effective.deferEffective === next) return outcome;
			const message = "这台服务器的加载方式由「工具」页的策略决定（组级或单工具覆盖优先于服务器开关），本次开关没有改变模型看到的工具列表";
			return {
				...outcome,
				note: outcome.note ? `${outcome.note}；${message}` : message,
				diagnostics: [...(outcome.diagnostics ?? []), { code: "DEFER_GOVERNED_BY_POLICY", message }],
			};
		}
		/**
		 * C2：读延迟加载参数（面板表单的初值、默认值，以及哪些值此刻不是默认）。
		 *
		 * 返回的是**当前进程的生效值**，不是盘上的值：profile patch 不会被热加载，手工改盘上的
		 * `config` 要重启才生效。面板若显示"盘上写着什么"，就等于展示一个用户此刻并没有得到的
		 * 行为——与「延迟徽标只表示配置」那条注释是同一类诚实问题。
		 */
		/**
		 * 合成一份会话可见的工具加载策略。**唯一决策点**：目录、搜索、守卫、PTC 手册与面板
		 * 全都读同一份结果（纯层是 tool-loading-policy.js）。
		 *
		 * 保护名单刻意写死在这两处而不是暴露成配置：搜索入口被隐藏就再也搜不回来；
		 * `run_code` 是 PTC 的 transport，宿主明确不允许它被 restrict。
		 */
		loadingPolicy(agent, schemas, options = {}) {
			// 没有 agent（面板读取）时用**全局可见集**：那正是面板要列的东西。
			// 早先这里只认 `agent.ctx.tools.schemas`，于是面板拿到空列表，永远显示
			// "当前没有可管理的工具"——一个只在真宿主上才看得见的空状态。
			const available = schemas ?? (agent?.ctx?.tools?.schemas
				? agent.ctx.tools.schemas(agent)
				: (typeof this.ctx.tools?.schemas === "function" ? this.ctx.tools.schemas() : []));
			const ownerSet = new Set(options.serverNames ?? serverNamesOf(this.ctx, agent));
			return resolveToolLoadingPolicy({
				tools: available.map((schema) => ({ name: schema?.name })),
				ownerOf: (name) => uniqueOwner(name, ownerSet),
				policy: options.policy ?? this.globalToolLoading,
				projectPolicy: options.projectPolicy ?? (agent === undefined ? undefined : agentToolLoadingPolicy(agent)),
				legacyDeferServers: options.legacyDeferServers ?? deferServersOf(this.ctx, agent),
				legacyResidentServers: options.legacyResidentServers ?? residentServersOf(this.ctx, agent),
				protectedNames: [this.toolSearchRuntime?.settings?.toolName ?? "tool_search", "run_code"],
				// 总开关在所有策略路径上统一生效（全局/项目/旧 defer/逐工具覆盖），且**不删偏好**：
				// 关掉再看，用户设置还在。只放在 deferServersOf 里是不够的——统一策略不经过它。
				masterSwitch: toolSearchDisabled() ? "off" : "on",
			});
		}

		async toolSearchSettings() {
			return {
				settings: { ...this.toolSearchRuntime.settings },
				defaults: effectiveToolSearchSettings({}),
				configKey: TOOL_SEARCH_CONFIG_KEY,
			};
		}

		/** 读统一加载策略（全局）+ 当前可见工具的实际决策（面板据此显示"设置"与"实际"两列）。 */
		// 面板与策略共用的一份"可见工具"枚举：根作用域 + 每个 MCP 条目自己的作用域 + 每个存活会话。
	// 0.2.2 把 MCP 工具注册在条目作用域里（根的 schemas() 看不到），只读根会得到"没有 MCP 工具"。
	collectAvailableTools() {
		const available = [];
		const seen = new Set();
		const collect = (list) => {
			for (const schema of list ?? []) {
				const name = schema?.name;
				if (typeof name !== "string" || name === "" || seen.has(name)) continue;
				seen.add(name);
				available.push(schema);
			}
		};
		collect(typeof this.ctx.tools?.schemas === "function" ? this.ctx.tools.schemas() : []);
		for (const entry of allMcpEntries(this.ctx)) {
			try {
				const entryCtx = entry?.fiber?.ctx;
				if (typeof entryCtx?.tools?.schemas === "function") collect(entryCtx.tools.schemas(entryCtx));
			} catch { /* 单个条目视图读失败不影响其余 */ }
		}
		for (const agent of [...liveAgents(), ...(this.liveAgents ?? [])]) {
			try {
				collect(agent?.ctx?.tools?.schemas ? agent.ctx.tools.schemas(agent) : []);
			} catch { /* 单个会话视图读失败不影响其余 */ }
		}
		return available;
	}

	// 一台服务器在**统一策略**下的实际延迟状态（不是旧 config.defer）：该服务器名下的工具
	// 全部判定为 deferred 才算"延迟"。面板芯片必须用它，否则组级/单工具设置一改，芯片还在说"全量"。
	deferStateOf(serverName) {
		const prefix = `mcp__${serverName}__`;
		const available = this.collectAvailableTools().filter((schema) => String(schema?.name).startsWith(prefix));
		if (available.length === 0) return { deferEffective: false, deferredCount: 0, toolCountForDefer: 0 };
		const resolution = this.loadingPolicy(undefined, available);
		const deferred = available.filter((schema) => resolution.entries.get(schema.name)?.policy === "deferred").length;
		return { deferEffective: deferred === available.length, deferredCount: deferred, toolCountForDefer: available.length };
	}
	async toolLoadingSettings() {
			const policy = { ...this.globalToolLoading, groups: { ...this.globalToolLoading.groups }, tools: { ...this.globalToolLoading.tools } };
			// 全局视图 + 每个存活会话的可见集：DSH 0.2 的模型可见工具大多注册在 agent 作用域，
			// 只看全局会漏掉它们（实测只看到 4 个）。同名以后者为准，描述用第一份非空的。
			const available = this.collectAvailableTools();

			const descriptions = new Map(available.map((schema) => [schema?.name, schema?.description ?? ""]));
			const resolution = this.loadingPolicy(undefined, available);
			const ownerSet = new Set(serverNamesOf(this.ctx));
			const tools = [];
			for (const [name, entry] of resolution.entries) {
				const owner = uniqueOwner(name, ownerSet);
                if (name.startsWith("mcp__") && owner === null) continue;
                const inheritedTools = { ...policy.tools };
                delete inheritedTools[name];
                const inherited = this.loadingPolicy(undefined, [{ name }], {
                    policy: { ...policy, tools: inheritedTools },
                }).entries.get(name);
				// kind 让面板能分组：MCP 工具按服务器，非 MCP 工具单独一组（并可被总开关关掉）。
				// description 只给面板显示用途；它不进策略计算。
				tools.push({
					name,
					owner,
					kind: owner === null ? "builtin" : "mcp",
					description: descriptions.get(name) ?? "",
					// 保护标记与"当前是否纳管"无关：搜索入口永远不可被隐藏，面板据此把它从可设置列表里去掉。
					protected: name === (this.toolSearchRuntime?.settings?.toolName ?? "tool_search") || name === "run_code",
					policy: entry.policy,
					reason: entry.reason,
                    inheritedPolicy: inherited?.policy,
                    inheritedReason: inherited?.reason,
				});
			}
			return { policy, tools, configKey: TOOL_LOADING_CONFIG_KEY };
		}

		/**
		 * 写全局加载策略。`policy: null` = 回到既有行为（删掉这个键）。
		 *
		 * 先校验再落盘；运行值在写锁内更新，保证"盘上写的是 A、内存里是 B"不会发生。
		 * 不重装运行时：策略是活值，下一次组装自己就用到新结果（与 defer 开关同一条语义）。
		 */
		async updateToolLoadingSettings(payload) {
			if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
				throw new Error("工具加载策略必须以 { policy } 对象提交");
			}
			const extra = Object.keys(payload).filter((key) => key !== "policy");
			if (extra.length) throw new Error(`未知的工具加载载荷字段：${extra.join("、")}（只接受 policy）`);
			const requested = payload.policy === null || payload.policy === undefined ? null : validatePolicyConfig(payload.policy);
			let changedLive = false;
			const identity = pluginPatchIdentity();
			// 同 updateToolSearchSettings：走唯一事务入口，拿到覆盖判定与回滚，而不是自己 writePatch。
			// 策略是活值（下一次组装就用新结果），所以 applyLive 只换内存里那一份，不重装运行时、
			// 不重连任何 MCP。
			const canCheckOverride = await composedRowVisible(this.ctx, identity.id);
			const outcome = await withPatchWrite(this.ctx, async () => {
				const state = await readPatch(this.ctx);
				const content = setToolLoadingPolicyInPatch(state.content, requested, identity);
				return commitPatch(this.ctx, state, content, {
					label: "工具加载策略",
					...(canCheckOverride ? { entryId: identity.id, expect: { present: true } } : {}),
					applyLive: () => {
						const next = normalizePolicyConfig(requested);
						if (JSON.stringify(next) === JSON.stringify(this.globalToolLoading)) return;
						changedLive = true;
						this.globalToolLoading = next;
					},
				});
			});
			return mutationResult(outcome.persisted, changedLive ? "applied" : "unchanged", {
				diagnostics: outcome.diagnostics ?? [],
				policy: { ...this.globalToolLoading },
				configKey: TOOL_LOADING_CONFIG_KEY,
			});
		}

		/** 读某个项目的加载策略与该作用域实际可见工具（面板项目页签）。 */
		async workspaceToolLoading(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath ?? ""));
			assertRegisteredWorkspace(this.ctx, wsPath);
			const config = await readWorkspaceConfigCached(this.ctx, wsPath);
			if (config.error) throw new Error(config.error);
			const projectPolicy = normalizePolicyConfig(config.toolLoading);
			const globalSchemas = typeof this.ctx.tools?.schemas === "function" ? this.ctx.tools.schemas() : [];
			const projectSchemas = [];
			for (const agent of new Set([...liveAgents(), ...(this.liveAgents ?? [])])) {
				if (agentWorkspace(agent) !== wsPath) continue;
				try {
					for (const schema of agent?.ctx?.tools?.schemas?.(agent) ?? []) projectSchemas.push(schema);
				} catch { /* 某个会话读取失败时仍返回其它可见工具 */ }
			}
			const available = [];
			const seen = new Set();
			for (const schema of [...globalSchemas, ...projectSchemas]) {
				if (!schema || typeof schema.name !== "string" || schema.name === "" || seen.has(schema.name)) continue;
				seen.add(schema.name);
				available.push(schema);
			}
			const ownerSet = new Set(serverNamesOf(this.ctx, { session: { header: { cwd: wsPath } } }));
			const scopeAgent = { session: { header: { cwd: wsPath } } };
            const resolution = this.loadingPolicy(scopeAgent, available, {
                serverNames: ownerSet,
                projectPolicy,
            });
			const descriptions = new Map();
			for (const schema of available) {
				if (!descriptions.get(schema.name) && schema.description) descriptions.set(schema.name, schema.description);
			}
			const tools = [...resolution.entries].map(([name, entry]) => {
				const owner = uniqueOwner(name, ownerSet);
                const inheritedTools = { ...projectPolicy.tools };
                delete inheritedTools[name];
                const inherited = this.loadingPolicy(scopeAgent, [{ name }], {
                    serverNames: ownerSet,
                    projectPolicy: { ...projectPolicy, tools: inheritedTools },
                }).entries.get(name);
				return {
					name,
					owner,
					kind: owner === null ? "builtin" : "mcp",
					description: descriptions.get(name) ?? "",
					protected: name === (this.toolSearchRuntime?.settings?.toolName ?? "tool_search") || name === "run_code",
					policy: entry.policy,
					reason: entry.reason,
                    inheritedPolicy: inherited?.policy,
                    inheritedReason: inherited?.reason,
				};
			});
			return { wsPath, policy: projectPolicy, tools, configKey: TOOL_LOADING_CONFIG_KEY };
		}

		/**
		 * 写项目策略：只动 `.dsh/mcp.json` 的 `toolLoading` 键，服务器与 exclude 原样保留，
		 * 并且**不触及连接**（加载策略不是连接配置）。
		 */
		async setWorkspaceToolLoading(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath ?? ""));
			assertRegisteredWorkspace(this.ctx, wsPath);
			const requested = payload?.policy === null || payload?.policy === undefined ? null : validatePolicyConfig(payload.policy);
			const policy = normalizePolicyConfig(requested);
			let persisted = "unchanged";
			await withRegisteredWorkspaceWrite(this.ctx, wsPath, async () => {
				const config = await readWorkspaceConfigCached(this.ctx, wsPath);
				if (config.error) throw new Error(config.error);
				// 写盘函数本身不做变更检测（它按内容整体重写），所以"有没有改"在这里判：
				// 与当前生效值相同的一键保存不该在盘上刷一次 mtime，也不该报"已改"。
				persisted = JSON.stringify(normalizePolicyConfig(config.toolLoading)) === JSON.stringify(policy) ? "unchanged" : "applied";
				await writeWorkspaceConfigFile(wsPath, config.servers, config.exclude, policy);
			});
			const live = setAgentToolLoadingPolicy(this.ctx, wsPath, policy);
			return mutationResult(persisted, "applied", { wsPath, policy: { ...policy }, liveAgents: live, configKey: TOOL_LOADING_CONFIG_KEY });
		}
		/**
		 * C2：写延迟加载参数 —— 写进**插件自己那条 patch 条目的 `config.toolSearch`**，然后在
		 * 运行中的进程里**重装** ToolSearch 运行时。
		 *
		 * 为什么是重装而不是"活值 getter"：`max_results` 的取值范围与默认值写在**工具定义**里
		 * （模型据它决定传什么数字），而工具定义只在 `tools.register` 那一刻生成一次。把上限做成
		 * 活值就会变成"运行值 25、模型看到的上限 10"——正是本项目最不能接受的那种假生效。
		 * 重装的代价（已发现集要从会话投影恢复）由 test/tool-search-runtime 的
		 * 「换参数重装后已发现集仍在」与 test/real-host-loader 那一条共同钉住。
		 *
		 * 顺序即正确性：先校验（非法值一步都不动）→ 再写盘（写锁内；失败就整个失败，运行时不改，
		 * 免得"只在本进程生效、盘上没写"在下次重启时静默回退）→ 最后重装。
		 */
		async updateToolSearchSettings(payload) {
			// 严格校验放在最前：拼错的键（`maxResutls`）与已删除的键（`threshold`）必须当场报错。
			// 少这一步，`normalizeToolSearchSettings` 会把它静默过滤成 {}，用户此前的设置
			// 随之被当作"恢复默认"写掉——那不是忽略一个错键，是改坏一份配置。
			const settings = assertToolSearchSettingsPayload(payload);
			const next = effectiveToolSearchSettings(normalizeToolSearchSettings(settings));
			const identity = pluginPatchIdentity();
			let changedLive = false;
			// 只有组合层里**真能看见我自己那一行**时才做覆盖判定：看不见（极简 profile / 测试夹具）
			// 时判"不算数"是假失败，如实跳过而不是拒绝用户的保存。
			const canCheckOverride = await composedRowVisible(this.ctx, identity.id);
			// **比较、落盘、判定覆盖、重装四件事在同一个串行操作里**。旧写法把 `live` 快照取在
			// 等锁之前，两个标签页几乎同时保存时，后来的那次会拿一个过期的 live 判出"参数没有
			// 变化"，于是盘上写成了 B、运行时停在 A。
			//
			// 走 `commitPatch`（= 全插件唯一的写盘事务入口）而不是自己 writePatch：
			//   · 覆盖判定：被 home patch / CLI overlay 盖住时**回滚并报错**，不再"写成功、
			//     下次重启发现不是这个值"；
			//   · 重装失败同样回滚：盘上与运行中必须一致。留一个"已写入、重启后生效"的假成功，
			//     正是本项目最不接受的那种状态。
			const outcome = await withPatchWrite(this.ctx, async () => {
				const state = await readPatch(this.ctx);
				// 身份从出货文件读（包名 + 条目 id）：`dsh plugin add` 装成 bundle 时，那条 insert
				// 住在**包自己的** patch 里，用户 profile 的 patch 只有（或将有）一条 id 定向覆盖。
				const content = setToolSearchSettingsInPatch(state.content, next, identity);
				return commitPatch(this.ctx, state, content, {
					label: "延迟加载参数",
					// 没有条目 id 或组合里看不见自己那行时不做覆盖判定（如实跳过，不假装检查过）。
					...(canCheckOverride ? { entryId: identity.id, expect: { present: true } } : {}),
					applyLive: () => {
						const live = this.toolSearchRuntime.settings;
						if (JSON.stringify(next) === JSON.stringify(live)) return;
						changedLive = true;
						const policyFor = (agent, schemas) => this.loadingPolicy(agent, schemas);
						const previous = this.toolSearchRuntime;
						// 先拆后装：同名工具会让 `chooseToolName` 把第二个改名，且两个守卫 / 两个
						// assemble 处理器会同时生效。两步都是同步的，宿主看不到中间态。
						previous.dispose();
						try {
							const nextRuntime = installToolSearchIsolated(this.ctx, next, policyFor);
							if (nextRuntime.error !== undefined) throw new Error(nextRuntime.error.message);
							this.toolSearchRuntime = nextRuntime;
						} catch (error) {
							// 重装失败必须把旧配置装回来：少一个优化，远好过功能整个消失。
							this.toolSearchRuntime = installToolSearchIsolated(this.ctx, previous.settings, policyFor);
							throw error;
						}
					},
				});
			});
			// live 用 changedLive 判定，不用常量：运行值本来就等于目标值时，「生效了」与「没变化」
			// 对调用方是两种事实（面板据此决定是否提示"已立即生效"）。
			return mutationResult(outcome.persisted, changedLive ? "applied" : "unchanged", {
				diagnostics: outcome.diagnostics ?? [],
				settings: { ...next },
				defaults: effectiveToolSearchSettings({}),
				configKey: TOOL_SEARCH_CONFIG_KEY,
				changed: changedLive || outcome.persisted === "applied",
				note: changedLive || outcome.persisted === "applied"
					? "已写入 profile 配置，当前会话立即生效"
					: "参数没有变化（与当前生效值相同）",
			});
		}
		async removeServer(name) {
			const value = String(name);
			return withPatchWrite(this.ctx, async () => {
				const state = await managedState(this.ctx);
				const entry = managedLiveEntry(this.ctx, state, value);
				if (!entry) throw new Error("此 MCP 不属于当前 Web profile，不能移除");
				const entryId = entry.options.id;
				// 同名的其他条目（别的配置层提供的）在删掉本行后仍然存在，而且大多是**挂载失败**态：
				// mcp-client 按作用域判重，它们当初就是因为这条先占了名字才起不来。删完必须说出来，
				// 否则"移除成功"之后用户仍然看到一堆失败日志，会以为移除没生效。
				const remaining = entriesForName(this.ctx, value).filter((candidate) => candidate !== entry);
				const next = updateManagedMcpPatch(state.content, [], { removeNames: [value] });
				// 移除是一条**可断言**的事实：patch 里不再有这一行（expect.present=false），
				// reconcile 之后运行中也必须没有它。判不准就回滚，不留"删了但还在跑"的状态。
				const outcome = await commitPatch(this.ctx, state, next, {
					label: "MCP 移除",
					entryId,
					expect: { present: false },
					doomedIds: [entryId],
					verifyLive: (entries) => {
						if (entries.length > 0) throw new Error(`MCP 条目 ${entryId} 移除后仍在运行（${entries.length} 个 live owner）`);
					},
				});
				if (remaining.length) {
					return { ...outcome, note: `已移除并停止运行中的连接；另有 ${remaining.length} 条同名条目来自其他配置层（id: ${remaining.map((candidate) => candidate.options.id).join("、")}），未改动——它们要重启宿主后才会重新尝试连接` };
				}
				if (outcome.live !== "applied") {
					return { ...outcome, note: `已从 profile 配置移除；${outcome.liveReason ?? "本部署没有热应用入口"}，重启宿主后这条连接才会停` };
				}
				return { ...outcome, note: "已移除并停止运行中的连接" };
			});
		}
		async reveal(payload) {
			const name = String(payload?.name || "");
			const field = String(payload?.field || "");
			const key = payload?.key === undefined ? undefined : String(payload.key);
			const state = await managedState(this.ctx);
			const current = state.byName.get(name);
			const entry = current ? managedLiveEntry(this.ctx, state, name) : null;
			if (!current || !entry) throw new Error("此 MCP 不属于当前 Web profile，不能读取配置");
			if (!["url", "args", "env", "headers"].includes(field)) throw new Error("不支持读取该配置字段");
			// 编辑表单仅把有效运行值用于显示；未实际修改输入时仍提交保留原值标记，
			// 不会把密钥写回 profile。options.config 里是 raw 的 `!!js` 表达式，必须求值一次。
			const value = resolveLiveConfigValue(entry, entry.options.config[field] ?? current[field]);
			if (key !== undefined) {
				if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error("没有该配置项");
				return { value: value[key] };
			}
			return { value: structuredClone(value) };
		}
		async previewImport(payload) {
			const json = typeof payload?.json === "string" ? JSON.parse(payload.json) : payload?.json;
			const state = await managedState(this.ctx);
			return importPreview(this.ctx, admittedImport(json), state);
		}
		async importJson(payload) {
			const mode = payload?.mode === "replace" ? "replace" : "merge";
			const json = typeof payload?.json === "string" ? JSON.parse(payload.json) : payload?.json;
			return applyManagedImport(this.ctx, admittedImport(json), mode);
		}
		async scanImportSources(payload) {
			const context = sourceContext(payload?.wsPath ? canonicalWorkspacePath(String(payload.wsPath)) : "");
			const rows = await collectImportLocations(context, readSourceText, context.layer);
			return { sources: rows.map(projectSourceRow) };
		}
		async previewImportSource(payload) {
			const context = sourceContext(payload?.wsPath ? canonicalWorkspacePath(String(payload.wsPath)) : "");
			assertSourceLayer(context.layer, payload?.scope);
			const row = await resolveImportLocation(context, payload || {}, readSourceText);
			if (!row.exists) throw new Error(`来源文件不存在：${row.displayPath}`);
			if (row.error) throw new Error(row.error);
			const selected = selectSourceServers(row, payload?.names);
			let preview;
			if (context.cwd) {
				const config = await readWorkspaceConfigCached(this.ctx, context.cwd);
				if (config.error) throw new Error(config.error);
				preview = workspaceImportPreview(config, selected);
			} else {
				preview = importPreview(this.ctx, selected, await managedState(this.ctx));
			}
			// 指纹跟随预览返回：导入时用它拦住「预览之后文件被改」的情况。
			return { preview, contentHash: row.contentHash, source: { label: row.label, scope: row.scope, displayPath: row.displayPath } };
		}
		async importSource(payload) {
			const context = sourceContext(payload?.wsPath ? canonicalWorkspacePath(String(payload.wsPath)) : "");
			const mode = payload?.mode === "replace" ? "replace" : "merge";
			assertSourceLayer(context.layer, payload?.scope);
			const row = await resolveImportLocation(context, payload || {}, readSourceText);
			if (!row.exists) throw new Error(`来源文件不存在：${row.displayPath}`);
			if (row.error) throw new Error(row.error);
			// 指纹必须回传：没有它，"预览的是 A、导入的是 B"只差一次文件改动。
			if (typeof payload?.contentHash !== "string" || !payload.contentHash) throw new Error("缺少来源内容指纹：请先预览、再导入");
			if (payload.contentHash !== row.contentHash) throw new Error("来源配置在预览之后发生了变化，请重新预览");
			const selected = selectSourceServers(row, payload?.names);
			return context.cwd ? applyWorkspaceImport(this.ctx, context.cwd, selected, mode) : applyManagedImport(this.ctx, selected, mode);
		}
		async listWorkspaces() {
			const records = await listWorkspaceRecords(this.ctx);
			const workspaces = [];
			for (const record of records) {
				const config = await readWorkspaceConfigCached(this.ctx, record.path);
				workspaces.push({
					path: record.path,
					name: record.title || basename(record.path),
					serverCount: config.servers.length,
					excluded: config.exclude,
					error: config.error || "",
				});
			}
			return { workspaces, revision: revisionOf(workspaces) };
		}
		async getWorkspaceView(payload) {
			const rawPath = String(payload?.wsPath ?? (payload?.path || ""));
			if (!rawPath) throw new Error("缺少 workspace path");
			const wsPath = canonicalWorkspacePath(rawPath);
			const config = await readWorkspaceConfigCached(this.ctx, wsPath);
			// 项目 MCP 的连接诊断与全局走同一条日志通路（按 mcp-client(<serverName>) 过滤）。
			const mountErrors = workspaceMountErrorsView(wsPath);
			const mountErrorByName = new Map(mountErrors.map((m) => [m.serverName, m.error]));
			const servers = config.servers.map((server) => summarizeWorkspaceRow(this.ctx, wsPath, server, mountErrorByName.get(server.name)));
			const globalResult = await listMcpServers(this.ctx, typeof this.deferStateOf === "function" ? (name) => this.deferStateOf(name) : undefined);
			const global = globalResult.servers.map((server) => ({ ...server, excluded: config.exclude.includes(server.serverName) }));
			const restrictError = workspaceRestrictErrorView(wsPath);
			const scopeErrors = workspaceScopeErrorsView(wsPath);
			const liveAgents = liveWorkspaceAgentCount(wsPath);
			return {
				path: wsPath,
				name: basename(wsPath),
				error: config.error || "",
				mountErrors,
				scopeErrors,
				restrictError,
				liveAgents,
				revision: revisionOf({ servers, exclude: config.exclude, global: globalResult.revision, mountErrors, scopeErrors, restrictError, liveAgents }),
				servers,
				exclude: config.exclude,
				global,
			};
		}
		async addWorkspaceServer(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const spec = payload?.spec;
			if (!wsPath) throw new Error("缺少 workspace 路径");
			if (containsRedactedValue(spec)) throw new Error("新增 MCP 不能包含保留原值标记");
			const normalized = normalizeOne(spec);
			const result = await withRegisteredWorkspaceWrite(this.ctx, wsPath, async () => {
				const config = await readWorkspaceConfigCached(this.ctx, wsPath);
				if (config.error) throw new Error(config.error);
				// 只拦同一作用域内的重名：项目内同名会静默覆盖 mcpServers 的对象键。跨作用域同名
				// 由官方按注册作用域隔离，是合法配置。
				if (config.servers.some((server) => server.name === normalized.name)) throw new Error("该项目已存在：" + normalized.name);
				await writeWorkspaceConfigFile(wsPath, [...config.servers, normalized], config.exclude);
				return { note: `已添加到项目配置：${normalized.name}` };
			});
			// 写盘即对齐：存活会话立刻拿到这条新连接，不需要等它重开（在写锁外做，见 alignWorkspaceConnections）。
			const diagnostics = await alignWorkspaceConnections(this.ctx, wsPath);
			return mutationResult("applied", diagnostics.length ? "failed" : "applied", { ...result, diagnostics });
		}
		async updateWorkspaceServer(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const spec = payload?.spec;
			const requestedName = String(spec?.name || "").trim();
			if (!wsPath) throw new Error("缺少 workspace 路径");
			const result = await withRegisteredWorkspaceWrite(this.ctx, wsPath, async () => {
				const config = await readWorkspaceConfigCached(this.ctx, wsPath);
				if (config.error) throw new Error(config.error);
				const current = config.servers.find((server) => server.name === requestedName);
				if (!current) throw new Error("该项目中没有此 MCP：" + requestedName);
				const normalized = normalizeOne(restoreRedactedSpec(spec, current));
				if (normalized.name !== requestedName) {
					// 改名同样需要拦截同项目内的名称冲突，否则写盘时 mcpServers 对象键会静默覆盖。
					if (config.servers.some((server) => server.name === normalized.name)) throw new Error("该项目已存在：" + normalized.name);
				}
				const servers = config.servers.map((server) => (server.name === requestedName ? normalized : server));
				await writeWorkspaceConfigFile(wsPath, servers, config.exclude);
				return { note: `已更新项目配置：${normalized.name}` };
			});
			// 配置变更就地重载共享连接（工具名不变，会话历史安全）。
			const diagnostics = await alignWorkspaceConnections(this.ctx, wsPath);
			return mutationResult("applied", diagnostics.length ? "failed" : "applied", { ...result, diagnostics });
		}
		async removeWorkspaceServer(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const name = String(payload?.name || "");
			if (!wsPath) throw new Error("缺少 workspace 路径");
			const result = await withRegisteredWorkspaceWrite(this.ctx, wsPath, async () => {
				const config = await readWorkspaceConfigCached(this.ctx, wsPath);
				if (config.error) throw new Error(config.error);
				const servers = config.servers.filter((server) => server.name !== name);
				if (servers.length === config.servers.length) throw new Error("该项目中没有此 MCP：" + name);
				await writeWorkspaceConfigFile(wsPath, servers, config.exclude);
				return { note: `已从项目配置移除：${name}` };
			});
			// 移除同样就地生效：连接立刻销毁，工具从存活会话里撤掉（不必重开会话）。
			const diagnostics = await alignWorkspaceConnections(this.ctx, wsPath);
			return mutationResult("applied", diagnostics.length ? "failed" : "applied", { ...result, diagnostics });
		}
		// 面板的「重连」：拆掉并按当前配置重建这条项目连接，再对齐存活会话。
		// 存在的理由：mcp-client 重连预算耗尽后会注销工具并停止，只能靠重载配置/重启宿主恢复
		//（README 明写）；项目 MCP 又不是常驻服务，所以这个终态几乎必然出现，必须有出口。
		async reconnectWorkspaceServer(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const name = String(payload?.name || "");
			if (!wsPath) throw new Error("缺少 workspace 路径");
			if (!name) throw new Error("缺少 serverName");
			const result = await reconnectWorkspaceServer(this.ctx, wsPath, name);
			return mutationResult("unchanged", "applied", {
				note: result.hadLiveConnection ? `已重连项目 MCP：${name}` : `该项目 MCP 原本没有活动连接，已按配置新建：${name}`,
			});
		}
		async setWorkspaceExclude(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath ?? (payload?.path || "")));
			const serverName = String(payload?.serverName || "");
			const hidden = payload?.hidden === true;
			if (!wsPath) throw new Error("缺少 workspace 路径");
			if (!serverName) throw new Error("缺少 serverName");
			const result = await withRegisteredWorkspaceWrite(this.ctx, wsPath, async () => {
				const config = await readWorkspaceConfigCached(this.ctx, wsPath);
				if (config.error) throw new Error(config.error);
				const exclude = config.exclude.filter((name) => name !== serverName);
				if (hidden) exclude.push(serverName);
				await writeWorkspaceConfigFile(wsPath, config.servers, exclude);
				return { note: hidden ? `已屏蔽 ${serverName}，对运行中的会话立即生效` : `已取消屏蔽 ${serverName}，对运行中的会话立即生效`, exclude };
			});
			// 立刻写入运行中会话：工具清单是每步重新组装的，所以新的 deny 在下一轮请求就生效
			//（不是"只对新会话生效"——那种说法把"请求 header 稳定"误当成了"模型看不见新工具"）。
			// 与连接对齐同样放在锁外：写已经落盘，副作用不该按住写锁（restrict 也会动作用域层）。
			let diagnostics = [];
			try { await reconcileWorkspaceRestricts(this.ctx, wsPath); }
			catch (error) {
				const message = `mcp-manager: 屏蔽已写入，但对齐会话作用域失败（下次挂载会重试）: ${error?.message ?? error}`;
				this.ctx.logger?.error?.(message);
				diagnostics = [{ code: "WORKSPACE_RESTRICT_FAILED", message }];
			}
			return mutationResult("applied", diagnostics.length ? "failed" : "applied", { ...result, diagnostics });
		}
		async installWorkspaceBuiltins(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const ids = payload?.ids;
			if (!wsPath) throw new Error("缺少 workspace 路径");
			if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === "string")) throw new Error("内置 MCP ids 必须是非空字符串数组");
			const result = await withRegisteredWorkspaceWrite(this.ctx, wsPath, async () => {
				const config = await readWorkspaceConfigCached(this.ctx, wsPath);
				if (config.error) throw new Error(config.error);
				const known = new Map(BUILTIN_MCP_SERVERS.map((builtin) => [builtin.id, builtin]));
				const unknown = ids.filter((id) => !known.has(id));
				if (unknown.length) throw new Error(`未知的内置 MCP：${unknown.join(", ")}`);
				const existing = new Set(config.servers.map((server) => server.name));
				const added = [];
				const skipped = [];
				for (const id of ids) {
					const builtin = known.get(id);
					if (existing.has(builtin.name)) { skipped.push(id); continue; }
					// 字段面走 mcp-config 的 builtinSpec（与全局 installBuiltins 同一个函数），
					// 不在这里另抄一份 10 字段清单——曾经两处各抄一遍，目录加字段就要改两处。
					added.push(builtinSpec(builtin));
				}
				if (!added.length) return { note: skipped.length ? `已存在并跳过：${skipped.join(", ")}` : "未修改配置", unchanged: true };
				await writeWorkspaceConfigFile(wsPath, [...config.servers, ...added], config.exclude);
				return { note: `已追加：${added.map((server) => server.name).join(", ")}${skipped.length ? `；已存在并跳过：${skipped.join(", ")}` : ""}` };
			});
			// 没写盘就不用对齐（否则每次点"安装内置"都会白跑一遍挂载）。
			if (result.unchanged) return mutationResult("unchanged", "unchanged", { note: result.note });
			const diagnostics = await alignWorkspaceConnections(this.ctx, wsPath);
			return mutationResult("applied", diagnostics.length ? "failed" : "applied", { note: result.note, diagnostics });
		}
		async previewWorkspaceImport(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const json = typeof payload?.json === "string" ? JSON.parse(payload.json) : payload?.json;
			const config = await readWorkspaceConfigCached(this.ctx, wsPath);
			if (config.error) throw new Error(config.error);
			return workspaceImportPreview(config, admittedImport(json));
		}
		async importWorkspaceJson(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const mode = payload?.mode === "replace" ? "replace" : "merge";
			const json = typeof payload?.json === "string" ? JSON.parse(payload.json) : payload?.json;
			return applyWorkspaceImport(this.ctx, wsPath, admittedImport(json), mode);
		}
		// 项目 → 项目的批量搬迁，整条链路都在 Host 内完成：源配置（含字面凭据与 `!!js` 表达式）
		// 从不经过浏览器，所以跨工作区复制不像"导出文件再导入"那样多一个泄密面。
		// 同名策略**与导入的「合并」不同**：这里默认跳过（目标里那条是目标自己的配置），
		// 必须显式 overwrite 才覆盖；导入的「合并」按名字更新，因为它表达的是"照这份 JSON 改"。
		// 目标的 `exclude` 不动 ——「本项目屏蔽了哪些全局 MCP」是那个项目自己的意图，不是配置数据。
		async copyWorkspaceServers(payload) {
			const to = canonicalWorkspacePath(String(payload?.to || ""));
			if (!to) throw new Error("缺少目标 workspace 路径");
			const plan = await withRegisteredWorkspaceWrite(this.ctx, to, async () => {
				// 锁内解析：预览到写入之间目标配置可能被别的会话改过，以锁内最新为准。
				const current = await resolveWorkspaceCopy(this.ctx, payload);
				// 全部被跳过时不动文件：一次"什么都没变"的复制不该刷新目标的 mtime（那会让
				// 缓存失效、白跑一次连接对齐）。changed 与 servers 同源，不会不一致。
				if (current.changed) await writeWorkspaceConfigFile(current.to, current.servers, current.targetExclude);
				return current;
			});
			if (!plan.changed) {
				return mutationResult("unchanged", "unchanged", { ...copyPreviewOf(plan), note: copyResultNote(plan.toName, plan.added, plan.updated, plan.skipped) });
			}
			const diagnostics = await alignWorkspaceConnections(this.ctx, plan.to);
			return mutationResult("applied", diagnostics.length ? "failed" : "applied", {
				...copyPreviewOf(plan),
				diagnostics,
				note: copyResultNote(plan.toName, plan.added, plan.updated, plan.skipped),
			});
		}
		// 只读预览：写入前先说清「目标已有哪几条同名、按当前选择会怎么处理」。与导入的
		// previewImport 同一条纪律——先看清再写；这里不需要内容指纹，因为源与目标都是本机配置，
		// 而写盘那次会在锁内按最新配置重算。
		async previewWorkspaceCopy(payload) {
			return copyPreviewOf(await resolveWorkspaceCopy(this.ctx, payload));
		}
		// 导出本项目的配置快照（与 `.dsh/mcp.json` 同格式），用于备份、跨机器迁移与分享。
		// 内容走 specToMcpEntry：文件里的环境变量引用回到 `${VAR}` 模板形式，插件专有字段
		// （idleTimeoutMs / readyTimeoutMs / disabled）原样保留——所以导出的文件既能被本插件的
		// 粘贴导入吃回去，也能直接当 `.dsh/mcp.json` 放到另一个工作区。
		// 代价写清楚：字面值（URL 里的 token、字面 header/env）会原样出现在导出结果里，界面上必须提示。
		async exportWorkspaceJson(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			if (!wsPath) throw new Error("缺少 workspace 路径");
			const config = await readWorkspaceConfigCached(this.ctx, wsPath);
			if (config.error) throw new Error(config.error);
			const mcpServers = {};
			for (const server of config.servers) setOwn(mcpServers, server.name, specToMcpEntry(server));
			const doc = { mcpServers };
			// exclude 是这份文件的一部分（格式与 .dsh/mcp.json 一致），所以照实导出；
			// 但粘贴导入只读 mcpServers，界面上要说明这一点，不能让用户以为它会被带过去。
			if (config.exclude.length) doc.exclude = [...config.exclude];
			return {
				path: wsPath,
				name: basename(wsPath),
				count: config.servers.length,
				excluded: [...config.exclude],
				json: JSON.stringify(doc, null, 2) + "\n",
			};
		}
		async revealWorkspaceServer(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath || ""));
			const name = String(payload?.name || "");
			const field = String(payload?.field || "");
			const key = payload?.key === undefined ? undefined : String(payload.key);
			const config = await readWorkspaceConfigCached(this.ctx, wsPath);
			if (config.error) throw new Error(config.error);
			const current = config.servers.find((server) => server.name === name);
			if (!current) throw new Error("该项目中没有此 MCP：" + name);
			if (!["url", "args", "env", "headers"].includes(field)) throw new Error("不支持读取该配置字段");
			// 列表与详情的默认显示走 workspaceServerView 的模板形式（`${VAR}`，与文件一致、
			// 不泄露）；这里是被眼睛点开的通路，要的是「有效运行值」，所以按建连同一个求值器解析。
			const value = resolveSpecValue(current[field], process.env);
			if (key !== undefined) {
				if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error("没有该配置项");
				return { value: value[key] };
			}
			return { value: structuredClone(value) };
		}
	async projectConnections() {
		// 只读排障接口：本进程内每一条项目 MCP 共享连接的真实状态。面板暂未接线；
		// 它回答的是单行视图回答不了的问题——refs 是不是卡住不归零（refs > sessions）。
		return { connections: await projectConnectionsView(this.ctx) };
	}
	async updateHint() {
		return checkForUpdate();
	}
	async whatsNew() {
		// 只回数据，不在宿主判定「该不该弹」：「上次看到的版本」是每台浏览器自己的事实
		// （localStorage），宿主没有这个视角；判定在客户端（whatsNewFor）。
		return { current: pluginVersion(), entries: WHATS_NEW };
	}
	};
})();

/**
 * 技能能力面的宿主服务。
 *
 * 为什么是**独立**的 TypertRemoteService，而不是往 McpManagerGateway 里加方法：
 * `ctx.skills` 只在挂了 `@deepseek-ai/dsh-skill` 的 profile 里存在，而那个内置插件是**可被
 * 用户禁用**的。Cordis 的 `static inject` 是**依赖声明**——服务缺失时该 fiber 只是保持不激活
 * 并等待，**不报错也不激活**（cordis 的 notify() → fiber._refresh()）。所以一旦把 `skills`
 * 加进现有 gateway 的 inject，未挂载 dsh-skill 的 profile 会连 **MCP 面板一起静默失效**。
 * 独立子插件自带 `inject = ["skills"]`，未满足时只影响技能这一块。
 *
 * serviceKey（'skillsManager'）同时是 Cordis 服务键与默认 wire namespace，
 * 与 MCP 的 'mcpManager' 互不影响。
 *
 * **管理动作不依赖会话**（SPEC 约束 14）：面板的读取与文件操作都不要求存在活动会话——
 * 官方 `ctx.remote.skills.list` 需要真实 sessionId，会激活冷 Agent，故本插件走自己的 RPC。
 */
let SkillsManagerGateway = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _list_decorators, _detail_decorators, _setEnabled_decorators, _setModelInvocable_decorators, _setUserInvocable_decorators, _removeSkill_decorators, _importSkill_decorators, _skillTargets_decorators, _skillHubSearch_decorators, _skillHubDetail_decorators, _skillHubCategories_decorators, _skillHubInstall_decorators, _conflictingManager_decorators;
	return class SkillsManagerGateway extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_list_decorators = [Remote("list")];
			__esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: (obj) => "list" in obj, get: (obj) => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
			_detail_decorators = [Remote("detail")];
			__esDecorate(this, null, _detail_decorators, { kind: "method", name: "detail", static: false, private: false, access: { has: (obj) => "detail" in obj, get: (obj) => obj.detail }, metadata: _metadata }, null, _instanceExtraInitializers);
			_setEnabled_decorators = [Remote("setEnabled")];
			__esDecorate(this, null, _setEnabled_decorators, { kind: "method", name: "setEnabled", static: false, private: false, access: { has: (obj) => "setEnabled" in obj, get: (obj) => obj.setEnabled }, metadata: _metadata }, null, _instanceExtraInitializers);
			_setModelInvocable_decorators = [Remote("setModelInvocable")];
			__esDecorate(this, null, _setModelInvocable_decorators, { kind: "method", name: "setModelInvocable", static: false, private: false, access: { has: (obj) => "setModelInvocable" in obj, get: (obj) => obj.setModelInvocable }, metadata: _metadata }, null, _instanceExtraInitializers);
			_setUserInvocable_decorators = [Remote("setUserInvocable")];
			__esDecorate(this, null, _setUserInvocable_decorators, { kind: "method", name: "setUserInvocable", static: false, private: false, access: { has: (obj) => "setUserInvocable" in obj, get: (obj) => obj.setUserInvocable }, metadata: _metadata }, null, _instanceExtraInitializers);
			_removeSkill_decorators = [Remote("removeSkill")];
			__esDecorate(this, null, _removeSkill_decorators, { kind: "method", name: "removeSkill", static: false, private: false, access: { has: (obj) => "removeSkill" in obj, get: (obj) => obj.removeSkill }, metadata: _metadata }, null, _instanceExtraInitializers);
			_importSkill_decorators = [Remote("importSkill")];
			__esDecorate(this, null, _importSkill_decorators, { kind: "method", name: "importSkill", static: false, private: false, access: { has: (obj) => "importSkill" in obj, get: (obj) => obj.importSkill }, metadata: _metadata }, null, _instanceExtraInitializers);
			_skillTargets_decorators = [Remote("skillTargets")];
			__esDecorate(this, null, _skillTargets_decorators, { kind: "method", name: "skillTargets", static: false, private: false, access: { has: (obj) => "skillTargets" in obj, get: (obj) => obj.skillTargets }, metadata: _metadata }, null, _instanceExtraInitializers);
			_skillHubSearch_decorators = [Remote("skillHubSearch")];
			__esDecorate(this, null, _skillHubSearch_decorators, { kind: "method", name: "skillHubSearch", static: false, private: false, access: { has: (obj) => "skillHubSearch" in obj, get: (obj) => obj.skillHubSearch }, metadata: _metadata }, null, _instanceExtraInitializers);
			_skillHubDetail_decorators = [Remote("skillHubDetail")];
			__esDecorate(this, null, _skillHubDetail_decorators, { kind: "method", name: "skillHubDetail", static: false, private: false, access: { has: (obj) => "skillHubDetail" in obj, get: (obj) => obj.skillHubDetail }, metadata: _metadata }, null, _instanceExtraInitializers);
			_skillHubCategories_decorators = [Remote("skillHubCategories")];
			__esDecorate(this, null, _skillHubCategories_decorators, { kind: "method", name: "skillHubCategories", static: false, private: false, access: { has: (obj) => "skillHubCategories" in obj, get: (obj) => obj.skillHubCategories }, metadata: _metadata }, null, _instanceExtraInitializers);
			_skillHubInstall_decorators = [Remote("skillHubInstall")];
			__esDecorate(this, null, _skillHubInstall_decorators, { kind: "method", name: "skillHubInstall", static: false, private: false, access: { has: (obj) => "skillHubInstall" in obj, get: (obj) => obj.skillHubInstall }, metadata: _metadata }, null, _instanceExtraInitializers);
			_conflictingManager_decorators = [Remote("conflictingManager")];
			__esDecorate(this, null, _conflictingManager_decorators, { kind: "method", name: "conflictingManager", static: false, private: false, access: { has: (obj) => "conflictingManager" in obj, get: (obj) => obj.conflictingManager }, metadata: _metadata }, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
		}
		// 只依赖 skills：缺 dsh-skill 时本服务不激活，但**不连累** MCP 面板（见类注释）。
		static inject = ["skills"];
		constructor(ctx) {
			super(ctx, "skillsManager");
			__runInitializers(this, _instanceExtraInitializers);
		}
		async list(payload) {
			const workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces.map(String) : [];
			const rows = await listSkillViews(this.ctx, { workspaces });
			// ⚠️ 「已停用」不再是**另一个数组**，而是行上的派生态（enabled）。
			//
			// 旧版这里是 `{ skills, disabled }` 两组：停用 = 把 SKILL.md 改名成 .disabled，
			// 宿主因此看不见它，面板只好自己扫盘补一份。那套做法有两个结构性代价，都已实际爆过：
			//   ① 状态只存在于文件名里 → 现场扫盘比宿主缓存新 → 同一个身份在两组里各出现一次
			//      → 客户端 React 重复 key（生产版不报警告，静默重复渲染 + 徽章挂错行）；
			//   ② `.disabled` 不是任何规范认可的形态，而 `~/.agents/skills` 是 Agent Skills 标准的
			//      共享位置（VS Code / Codex 都扫它）——改名等于把用户的技能在别的工具里弄坏。
			//
			// 现在停用 = 写宿主**原生的两个调用面字段**（disable-model-invocation + user-invocable），
			// 而宿主的 list 是**调用无关**的：两个面都关掉的技能照样出现在目录里。
			// 于是「面板看得见的东西」与「宿主报告的东西」重新变成同一件事——
			// 不需要扫盘、不需要两组互斥、不可能双行。这是一个身份一行在结构上的保证。
			const skills = rows.map((row) => ({ ...row, key: skillRowKey(row) }));
			// 旧版约定（.disabled 改名）留下的条目：**一次性迁移读取**，不是第二个真值来源。
			// 1.6.x 的用户磁盘上可能已经有这种文件（我们自己写进去的），必须列出来并能恢复，
			// 否则那些技能永远回不来。用户恢复之后就走新机制；本段与它的 wire 字段可整体删除。
			//
			// 待扫的根必须来自**能力**（skillTargetsView），不能从可见行反推：某个根里的技能
			// 全被旧机制停用时，可见行里根本没有那个根 → 它永远不被扫 → 面板零显示、也救不回来。
			const { targets } = await skillTargetsView(this.ctx, { workspaces });
			const migrated = [];
			const seenKeys = new Set(skills.map((row) => row.key));
			for (const target of targets) {
				if (target.writable === false) continue; // bundled 根只读：我们从不往那里写 .disabled
				if (target.exists === false) continue;   // 目录还没建，扫它只会白挨一个 ENOENT
				for (const row of await scanDisabledSkills({ root: target.root, scope: target.scope })) {
					// 技能名要**读那个文件**才知道（旧机制的条目名也不保证等于技能名）。
					const document = await readSkillDocument(row).catch(() => undefined);
					const diagnosed = document === undefined ? undefined : diagnoseSkill(document.text);
					const name = diagnosed?.name ?? row.entry;
					const identity = {
						name,
						source: target.source,
						cwd: target.projectPath,
						root: target.root,
						entry: row.entry,
						kind: row.kind,
					};
					const key = skillRowKey(identity);
					// 同一个身份已经在可见行里（用户恢复了一半、或宿主也报了这一条）：可见行优先，
					// 它是宿主认可的当前真相。这里只补宿主**看不见**的那些，仍然保证一个身份一行。
					if (seenKeys.has(key)) continue;
					seenKeys.add(key);
					// ⚠️ 迁移行的权限推导**单独**兜住读失败：这里任何一个文件读不出来都不该让 list
					// 整体 reject——那会让面板技能页整块打不开，连健康的技能都管不了。
					// 注意这只兜「这个文件读不到」这一类（`invocationOf` 自己已经把「读不到」
					// 压成 null），不是把 bug 藏起来：真正的实现错误照原样抛。
					const invocation = await invocationOf({
						entry: row.entry, root: target.root, kind: row.kind, scope: target.scope,
					});
					migrated.push({
						...identity,
						key,
						description: diagnosed?.description ?? "",
						...invocation,
						enabled: false,
						scope: target.scope,
						provider: "filesystem",
						path: row.path,
						source: target.source,
						writable: target.writable !== false,
						// 客户端据此把这一行标成「旧机制留下的」，并给出与新机制不同的操作文案。
						migrated: true,
					});
				}
			}
			migrated.sort((left, right) => left.name.localeCompare(right.name));
			// 曾经这里还返回一个 `revision`（目录指纹）供面板轮询判断要不要重渲染——
			// 但技能面从来没有轮询循环，那个字段没有任何消费者，已删（MCP 面有它自己的指纹与轮询）。
			return { skills: [...skills, ...migrated] };
		}
		async detail(payload) {
			// ⚠️ 按**引用定位到的那个根**读正文，不再走 `ctx.skills.get(name)`：那个按 rank
			// 返回**生效者**，而面板的模型是 (根, 条目) 精确操作（D8）——点「被遮蔽」那一行
			// 会看到生效者的正文，用户以为自己在读被遮蔽的那份。
			const resolved = await resolveSkillReference(this.ctx, payload);
			// 正文与调用权限来自**同一次读**（readSkillDocument 的契约）：分两次读会配错版本，
			// 用户看到的就是「这份正文 + 别人的权限」。
			const document = await readSkillDocument(resolved);
			// 技能名以**文件里**的 frontmatter 为准（磁盘条目名可以与之不同，见 resolveSkillTarget）。
			const name = diagnoseSkill(document.text).name ?? String(payload?.name ?? "");
			const modelInvocable = document.invocation?.modelInvocable ?? null;
			const userInvocable = document.invocation?.userInvocable ?? null;
			// ⚠️ `enabled` 必须与 `list` 的**同一套判据**（否则同一件事在两个 RPC 上结论相反）。
			// 两条分支缺一不可：
			//   · 旧机制残留：它的「停用」在**文件名**里（`.disabled`），不在 frontmatter 里，
			//     所以恒为 false——照内容派生会把它说成「已启用」（真机实测过这个矛盾）。
			//   · 普通技能：两个调用面都关掉才是停用；读不出来（null）就是不知道。
			const migrated = resolved.migratedDisabled === true;
			const enabled = migrated
				? false
				: modelInvocable === null || userInvocable === null
					? null
					: !(modelInvocable === false && userInvocable === false);
			return {
				skill: {
					name,
					content: document.text,
					modelInvocable,
					userInvocable,
					enabled,
					kind: resolved.kind,
					entry: resolved.entry,
					path: resolved.path,
					migrated,
					source: payload?.source,
					root: resolved.root,
					scope: resolved.scope,
				},
			};
		}
		async setEnabled(payload) {
			const resolved = await resolveSkillReference(this.ctx, payload);
			const result = await setSkillEnabled(resolved, payload?.enabled !== false);
			return mutationResult("applied", refreshSkillCatalog(this.ctx), result);
		}
		async setModelInvocable(payload) {
			// 「允许模型自动调用」的开关：写技能文件的 disable-model-invocation。纪律与 setEnabled
			// 完全一致——wire 只送引用、服务端核对自己算出来的目标、只读根拒绝；改写的形状规则在
			// lib/skills-frontmatter.js，读不准时那个错误原样上抛给用户。
			const resolved = await resolveSkillReference(this.ctx, payload);
			const result = await setSkillModelInvocable(resolved, payload?.modelInvocable !== false);
			return mutationResult("applied", refreshSkillCatalog(this.ctx), result);
		}
		async setUserInvocable(payload) {
			// 「用户可调用」的开关：写技能文件的 user-invocable。
			//
			// ⚠️ 为什么这个面也要有开关，而不是只让它只读显示：宿主支持的是**两个**调用面，而
			// 「停用」= 两个都关这一种组合。只暴露一个面的话，用户在面板里拨不回「仅手动可调用」
			// 那一档——只能去编辑文件。补上之后面板与文件是 1:1 的，`setEnabled` 退回快捷动作。
			// 与 setModelInvocable 共用同一个实现（setSkillInvocationFace），差别只在写哪个字段。
			const resolved = await resolveSkillReference(this.ctx, payload);
			const result = await setSkillUserInvocable(resolved, payload?.userInvocable !== false);
			return mutationResult("applied", refreshSkillCatalog(this.ctx), result);
		}
		async removeSkill(payload) {
			const resolved = await resolveSkillReference(this.ctx, payload);
			const result = await removeSkill(resolved);
			return mutationResult("applied", refreshSkillCatalog(this.ctx), result);
		}
		async importSkill(payload) {
			// 本机导入（file / directory / archive）：落点同样只认引用，只读根一律拒。
			const target = await resolveTargetReference(this.ctx, {
				source: payload?.source,
				root: payload?.root,
				projectPath: payload?.projectPath,
			});
			if (target.writable === false) throw new Error("该位置是只读的（bundled），不能写入");
			const result = await importSkill({
				root: target.root,
				scope: target.scope,
				writable: true,
				source: { type: payload?.type, path: String(payload?.path ?? "") },
			});
			return mutationResult("applied", refreshSkillCatalog(this.ctx), result);
		}
		async skillTargets(payload) {
			// 「可以装到哪里」——**能力**，与「实际发现了什么」（观察）是两件事：
			// 安装目标必须来自能力，否则还没建的位置永远选不到（用户的原话：「用户没有选择的权力？」）。
			// 规则与真值来源见 skills-registry.js 的 skillTargetsView 注释。
			//
			// 附注：曾经还有一个 `scanSources`（按可见行报告「发现了哪些作用域」）——
			// 它只在契约里挂着、面板从来没有调用点（作用域候选项改从 targets 派生），已删除。
			return await skillTargetsView(this.ctx, {
				workspaces: Array.isArray(payload?.workspaces) ? payload.workspaces.map(String) : [],
			});
		}
		async skillHubSearch(payload) {
			// 外部源（skillhub.cn）的搜索。**直连上游**，不经过任何第三方插件的同源路由：
			// 那是它的私有协议，不是宿主契约（见 lib/skillhub.js 的注释）。
			// 请求在宿主侧发出，所以浏览器 CORS 不存在；面板本身不联网（首屏仍离线）。
			return await searchHubSkills({
				keyword: payload?.keyword,
				category: payload?.category,
				sortBy: payload?.sortBy,
				page: payload?.page,
				pageSize: payload?.pageSize,
			}, {
				// 文案语言由**面板**传（宿主没有 locale 服务）。缺省即中文优先——
				// 老面板不带这个字段，行为与改前逐字节一致。
				locale: payload?.locale,
			});
		}
		async skillHubDetail(payload) {
			return await hubSkillDetail(String(payload?.slug ?? ""), { locale: payload?.locale });
		}
		async skillHubCategories(payload) {
			return { labels: await hubCategories({ locale: payload?.locale }) };
		}
		async skillHubInstall(payload) {
			// 下载 zip 到临时目录，再交给**现有的** importSkill（type: 'archive'）落盘。
			// 这样外部源与「从本机导入」共用同一条写入路径：解压、挑技能根、防重名、
			// 按实际字节判大小上限都在那一处，落点也就能沿用面板的「安装到」
			// （全局/项目 × .dsh/.agents），而不是由上游替用户决定装到哪。
			//
			// ⚠️ 显式确认必须在 **wire 上**（SPEC 约束 17：勾选后才可安装）。UI 里那个勾选框
			// 只是它的界面；把判据留在客户端等于没有闸门——任何别的调用方都能绕过。
			if (payload?.acknowledged !== true) {
				throw new Error("安装外部源技能需要一次显式确认（acknowledged）");
			}
			const target = await resolveTargetReference(this.ctx, {
				source: payload?.source,
				root: payload?.root,
				projectPath: payload?.projectPath,
			});
			if (target.writable === false) throw new Error("该位置是只读的（bundled），不能写入");
			const slug = String(payload?.slug ?? "");
			if (slug === "") throw new Error("缺少 slug");
			const staging = await mkdtemp(join(tmpdir(), "dsh-skillhub-"));
			try {
				const archive = await downloadHubArchive(slug, { version: payload?.version, dir: staging });
				const result = await importSkill({
					root: target.root,
					scope: target.scope,
					writable: true,
					source: { type: "archive", path: archive.path },
				});
				return mutationResult("applied", refreshSkillCatalog(this.ctx), result);
			} finally {
				// 临时目录无论成败都要清掉（成功时技能已经复制进目标根）。
				await rm(staging, { recursive: true, force: true });
			}
		}
		async conflictingManager() {
			// 让位检测（SPEC 约束 10 / D15）：宿主 loader 里是否已挂载**另一个** MCP 管理插件。
			//
			// ⚠️ 自身判据是**包名**，不是 patch id：两个包共用 `id: mcp-manager-ui`，
			// 按 id 排自身会把旧包一起排掉，于是这条检测永远不触发（见上方 pluginName 的注释与
			// test/skills-host.test.mjs 里"旧包同 id"的用例）。
			//
			// **fail-open**（约束 10）：漏检最坏是两个入口并存；误判则用户完全打不开面板。
			// 两者代价不对称，所以任何异常一律返回 null（= 无冲突，照常注册入口）。
			try {
				const entries = this.ctx?.loader?.entries?.();
				if (typeof entries?.[Symbol.iterator] !== "function") return null;
				const self = pluginName();
				for (const entry of entries) {
					const options = entry?.options;
					if (options === undefined || options === null) continue;
					const name = options.name;
					if (typeof name !== 'string' || name === '') continue;
					// 自身：loader name 恒等于本包名。用 id 判定会误伤共用一个 id 的旧包。
					if (self !== '' && name === self) continue;
					if (!isMcpManagerPluginName(name)) continue;
					return { id: options.id ?? null, name };
				}
				return null;
			} catch {
				// 刻意吞掉：检测失败必须 fail-open（见上）。面板打不开时用户也看不到日志，
				// 而「两个入口并存」本身是可自愈的轻微症状。
				return null;
			}
		}
	};
})();

export { checkForUpdate, McpManagerGateway, McpManagerGateway as default, SkillsManagerGateway, summarizeWorkspaceRow };






