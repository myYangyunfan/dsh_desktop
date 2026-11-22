import { readFileSync } from "node:fs";
import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { applyRemoteMethods } from "./remote-wiring.js";
// 包身份、让位检测的判据与更新提示都住这里（R6 第 2 步从本文件整块搬出）。
import { checkForUpdate, isHostBundledMcpManager, isMcpManagerPluginName, pluginName, pluginVersion } from "./update-hint.js";
// profile patch 的存储层（读-改-写、HMR 锁、托管条目定位、从 patch 内容派生的视图）。
import { applyDeferMask, commitPatch, doomedMcpIds, effectiveMcpServers, entryIdOf, externalMcpEntries, hasExternalMcpName, legacyDeferOf, managedLiveEntry, managedState, mutationResult, readPatch, refreshSkillCatalog, resolveManagedEntry, revealRevision, withPatchWrite } from "./patch-store.js";
// 配置的投影规则（掩码 / 保留原值标记 / reveal 求值）。读出去与写回来成对住在这里。
import { REDACTED_VALUE, containsRedactedValue, redactArgs, redactMap, redactUrl, resolveLiveConfigValue, resolveSpecValue, restoreRedactedSpec, restoreTemplate } from "./mcp-projection.js";
// mcp-client 的日志采集：连接状态只存在于日志里，那是"状态"的唯一来源。
import { ensureLogCapture, lastLogFor, recentLogsFor } from "./mcp-log.js";
// 导入/合并的**决策**层：什么算新增/更新/移除、以及预览文案。预览与落盘共用同一份判定。
import { admittedImport, applyManagedImport, assertSourceLayer, importPreview, mergePreview, planMerge, projectSourceRow, readSourceText, reservedEntryIds, selectSourceServers, sourceContext, withSkipped, workspaceImportPreview } from "./mcp-import-plan.js";
// 一行的展示投影：全局行与项目行用同一套规则、同一个 deriveMcpPhase。
import { containsExpressionValue, listRevision, normalizeOne, summarize, summarizeWorkspaceRow, touchesConnection, workspaceServerView } from "./mcp-rows.js";
// 写入路径：落盘与生效分开报（persisted / live / diagnostics），锁内的写与锁外的 reconcile 分工。
import { alignWorkspaceConnections, applyGlobalDefer, applyProjectDefer, applyWorkspaceImport, copyPreviewOf, copyResultNote, resolveWorkspaceCopy } from "./mcp-write-paths.js";
import { interpolate } from "@deepseek-ai/cordis-plugin-loader";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendSelectedBuiltinMcpServers, BUILTIN_MCP_SERVERS, builtinMcpCatalog, builtinSpec, MANAGED_CONFIG_FIELDS, normalizeMcpImport, readManagedMcpServers, setManagedMcpDisabled, updateManagedMcpPatch } from "./mcp-config.js";
import { admitImportedServers } from "./import-admission.js";
import { collectImportLocations, missingEnvNames, resolveImportLocation } from "./mcp-import-sources.js";
import { deriveMcpPhase, formatMcpLog, sanitizeMcpLog } from "./mcp-observability.js";
import { allMcpEntries, entriesForName, projectToolSchema, revisionOf } from "./mcp-registry.js";
import { diagnoseSkill } from "./skills-frontmatter.js";
import { invocationOf, listSkillViews, resolveSkillReference, resolveTargetReference, skillRowKey, skillTargetsView } from "./skills-registry.js";
import { importSkill, readHubSource, readSkillDocument, removeSkill, scanDisabledSkills, setSkillEnabled, setSkillModelInvocable, setSkillUserInvocable, writeHubSource } from "./skills-file-ops.js";
import { downloadHubArchive, hubCategories, hubSkillDetail, searchHubSkills } from "./skillhub.js";
import { setOwn } from "./own-property.js";
import { commitProfilePatches, composedRowVisible, ProfileMutationError, profileSources } from "./profile-composition.js";
import { WHATS_NEW } from "./whats-new.js";
import { evaluateEnvExpression, jsExpressionToTemplate, specToMcpEntry, toMcpClientConfig } from "./workspace-config.js";
import { canonicalWorkspacePath, assertRegisteredWorkspace, entryIsActive, globalToolSchemas, installAgentRuntime, listWorkspaceRecords, toolsGenerationOf, liveWorkspaceAgentCount, projectConnectionsView, readWorkspaceConfigCached, reconcileWorkspaceConnections, reconcileWorkspaceRestricts, reconnectWorkspaceServer, toolInventoryOf, withRegisteredWorkspaceWrite, workspaceConnectionStatus, workspaceMountErrorsView, workspaceRestrictErrorView, workspaceScopeErrorsView, workspaceToolSchemas, writeWorkspaceConfigFile } from "./workspace-runtime.js";
import { installToolSearchRuntime, uniqueOwner } from "./tool-search-runtime.js";
import { agentWorkspace, deferServersOf, residentServersOf, serverDeferTable, serverNamesOf, toolSearchDisabled } from "./tool-search-config.js";
import { groupPolicyOf, groupStatesOf, normalizePolicyConfig, resolveToolLoadingPolicy, validatePolicyConfig, writablePolicy } from "./tool-loading-policy.js";
import { CUSTOM_GROUPS_CONFIG_KEY, TOOL_LOADING_CONFIG_KEY, TOOL_SEARCH_CONFIG_KEY, ToolSearchConfigSchema, assertToolSearchSettingsPayload, effectiveToolSearchSettings, normalizeToolSearchSettings, pluginPatchIdentity, readCustomGroupsFromPatch, readToolLoadingPolicy, readToolSearchSettings, setCustomGroupsInPatch, setToolLoadingPolicyInPatch, setToolSearchSettingsInPatch } from "./tool-search-settings.js";
import { normalizeCustomGroups, validateCustomGroups } from "./tool-grouping.js";
import { agentToolLoadingPolicy, liveAgents, setAgentToolLoadingPolicy } from "./workspace-runtime.js";
// wire 上的方法名与顺序只来自这两张表（与 lib/typert.js / client descriptor 同一份定义）。
// 导入写法逐字母一致不是风格问题：`test/package-contract.test.mjs` 按这个形状读装配点。
import { MCP_METHODS, MCP_SERVICE, SKILL_METHODS } from "./rpc-contract.js";
// 上下文面的数据组装（纯函数，不碰 ctx）：见 lib/context-report.js 顶部那张分工表。
import { buildContextReport, foldRequestContext, foldRequestHeader, foldSessionMeta } from "./context-report.js";

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
		// 工具代次：视图 revision 里最贵的那一半（全量 schema 内容 hash）按它复用。
		// 返回 undefined 时运行时会退回每次全量算——那正是"没有订阅就不可信"的表达。
		toolsGeneration: () => toolsGenerationOf(ctx),
		...settings,
	});
}

function installToolSearchIsolated(ctx, settings, policyFor) {
	try {
		const dispose = installToolSearch(ctx, settings, policyFor);
		// `dispose` 同时带 `status()`（能力状态）与 `generation`：面板/诊断读它，
		// 而不是靠"装上了"推断"延迟加载真的生效"。
		return { settings, dispose, status: () => dispose?.status?.(), catalog: () => dispose?.catalog?.() ?? null, searches: () => dispose?.searches?.() ?? [], error: undefined };
	} catch (error) {
		const message = `mcp-manager: ToolSearch 初始化失败，MCP 与 skills 管理仍保持可用：${error?.message ?? error}`;
		ctx.logger?.error?.(message);
		return {
			settings,
			dispose: () => {},
			// 初始化就失败了 ⇒ 从来没组装过目录、也没搜过。给 null / 空数组而不是编数字。
			catalog: () => null,
			searches: () => [],
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



// 这里不再有「serverName 全进程唯一」的校验函数：那是 DSH 0.1.0-rc.7 时期 mcp-client 的行为
// （它把注册表挂在 ctx.root 上）。0.1.5 起官方按注册作用域判重，而本插件给每个
// (项目, serverName) 一个独立作用域，所以跨项目、全局与项目之间同名都是合法配置。
// 仍然成立的唯一约束是同一作用域内不得重名：项目内同名会静默覆盖 mcpServers 的对象键，
// 由各写入路径自己校验；全局重名由 profile patch 的条目 id 承担。


// `list` 与 `getWorkspaceView` 共用的一行：可见工具收集**一次**，再把同一份交给每行的芯片判定。
// 曾经 getWorkspaceView 传的是 `(name) => deferStateOf(name)`，于是每台全局服务器各重收一次
// （735 工具 / 20 台约 2s 每次轮询）；list 早就按"一次枚举、每行复用"写了，两套实现。
// 收成一个模块函数而不是实例方法：它只读 gateway 的两件东西，桩夹具（`{ ctx }`）因此不受影响。
function deferStateResolver(gateway) {
	if (typeof gateway?.deferStateOf !== "function") return undefined;
	const available = gateway.collectAvailableTools();
	return (name, options) => gateway.deferStateOf(name, { ...options, schemas: available });
}

// 全局 MCP 列表核心（list / getWorkspaceView 共用）。
async function listMcpServers(ctx, deferStateOf) {
	ensureLogCapture(ctx);
	const state = await managedState(ctx);
	const inventory = toolInventoryOf(ctx);
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
		// 旧 defer 作为**输入**传进去：同名条目里 true 压 false（与 deferServersOf 同一条规则），
		// 否则主行显示的值会取决于“哪一条被选中”，而模型看到的是合并后的结果。
		const legacyDefer = entries.some((candidate) => candidate.options.config.defer === true)
			? true
			: entries.some((candidate) => candidate.options.config.defer === false) ? false : undefined;
		if (typeof deferStateOf === 'function') Object.assign(row, deferStateOf(name, { legacyDefer }));
		servers.push(row);
	}
	return {
		servers,
		revision: listRevision(servers),
		revealRevision: revealRevision(state, groups),
	};
}

// 面板与策略共用的一份"可见工具"枚举：根作用域 + 每个 MCP 条目自己的作用域 + 每个存活会话。
// 0.2.2 把 MCP 工具注册在条目作用域里（根的 schemas() 看不到），只读根会得到"没有 MCP 工具"。
//
// 第三个来源必须是**宿主 agent 注册表**，而不只是本插件监听 agent/created 得到的集合：
// 插件升级、HMR 或桌面端先开会话时，会话可能早于插件加载；只靠事件会漏掉它，面板就只剩
// 根作用域那几个工具（真机表现：文件 1 / MCP 资源 3 / 代码与工作区 1，共 5 个）。
/**
 * 取宿主服务：先 `ctx.get(name)`，拿不到再退回属性访问。
 *
 * 为什么两种都要：
 *   · **真机必须走 `ctx.get()`**。Cordis 的属性式服务访问要求该服务在 `static inject` 里
 *     声明过，否则抛 `cannot get property "x" without inject`——而这里外面套着 try/catch，
 *     异常会被**静默吞掉**，于是这一路永远是空且没有任何线索。真机实测就是这样丢掉了
 *     agents 注册表（面板一直报"没有会话"）。
 *   · **但属性访问仍然要留**：轻量替身（单测夹具、老宿主）把服务直接挂在 ctx 上、没有
 *     `get`，或者 `get` 不认这个名字。
 * 顺序是"先 get 后属性"：get 是正式的取法，属性只是兜底。两条都失败返回 undefined。
 *
 * @param {object} ctx cordis 上下文
 * @param {string} name 服务名
 * @returns {unknown}
 */
function serviceOf(ctx, name) {
	if (typeof ctx?.get === 'function') {
		try {
			const value = ctx.get(name);
			if (value !== undefined && value !== null) return value;
		} catch { /* 走属性兜底 */ }
	}
	try {
		return ctx?.[name];
	} catch {
		return undefined;
	}
}

function hostLiveAgents(ctx, localAgents) {
	const agents = new Set([...liveAgents(), ...(localAgents ?? [])]);
	try {
		const registry = serviceOf(ctx, 'agents');
		for (const agent of registry?.list?.() ?? []) {
			if (agent) agents.add(agent);
		}
	} catch { /* 注册表不可用时保留已跟踪的会话，不影响其余来源 */ }
	return [...agents];
}

/**
 * 取工作区的**显示名**：cwd 的最后一段。取不到就 null（面板显示"未知工作区"，不编）。
 *
 * 为什么在后端算而不是让客户端切字符串：Windows 路径同时有 `\` 与 `/` 两种分隔符，
 * 而客户端那份实现还得处理末尾分隔符——两处各切一次就是两个真相源。
 */
function workspaceNameOf(cwd) {
	if (typeof cwd !== 'string' || cwd === '') return null;
	const parts = cwd.split(/[\\/]/).filter((part) => part !== '');
	return parts.length === 0 ? null : parts[parts.length - 1];
}

/**
 * 「上下文」面的一次读数：把**正在运行的会话**读成报告。
 *
 * ## 只观测活着的东西
 *
 * 这个面板回答的是"下一轮请求里上下文被谁占着"——没有请求就没有上下文。所以它只读
 * **活着的会话**（`ctx.agents` 的 session，以及 `ctx.sessions` 里已加载的 Session），
 * 不去翻磁盘上的历史记录。
 *
 * 这条边界是产品决策，不是技术限制：早期版本会扫 `~/.dsh/sessions` 把几十个历史会话列成
 * 一排按钮，用户的反馈是"会话太多了，我看你不知道啥策略，有的工作区好几个、有的没有"。
 * 一个观测面不该变成一个需要人做选择的会话列表——那是宿主侧栏的职责。
 *
 * 删除磁盘路径同时删掉了一整条降级链：zstd 多帧解码、两阶段解析（先读 64KB 摘要再按需
 * 完整解析）、"字符 vs token"的量纲换算、DSH_HOME 路径解析。活会话永远有 Session 对象，
 * 于是 tokenMeter 的价格是标准路径，构成天然是 token 级。
 *
 * ## 剩下的三件事（缺一条就会得到假数）
 *
 *   · 会话日志（`session.snapshotEvents()`）→ 谁在 surface 上、第几轮、属于哪个工具；
 *   · `ctx.tokenMeter.measure(session)` → 每个 surface 节点的价格；**估算构成**；
 *   · `ctx.tokenMeter.contextPressure(session)` → 提供方报告的真实提示词规模；**真实总量**。
 * 后两者仍是可选能力（宿主可能裁掉 token-meter）：缺失时报告照样出，只是把"没有价格"
 * 如实写进 notes，由面板切成按字符排布，不编 0。
 *
 * ⚠️ `snapshotEvents()` 在宿主里标记为「新代码不建议调用」（推荐走会话投影）。这里仍然用：
 * 投影只回答**它自己那部分**状态，而本面板要的是逐事件的"谁占了多大"——那正是 snapshot
 * 的语义。它也**不复制**：宿主对整段快照做了缓存，直到下一次 append 才重算。
 */
async function contextReportFor(ctx, payload) {
	const wanted = typeof payload?.sessionId === 'string' && payload.sessionId !== '' ? payload.sessionId : null;
	// ── ① 收集活会话 ──────────────────────────────────────────────────────────
	// ⚠️ 必须走 `ctx.get(...)`，**不能**写 `ctx.sessions`：Cordis 的属性式服务访问要求该服务
	// 在 `static inject` 里声明过，否则抛 `cannot get property "sessions" without inject`
	// （真机实测原话）。也不能把 'sessions' 加进主 gateway 的 inject：`inject` 是**激活条件**，
	// 服务缺失时整个 fiber 保持不激活——为一个只读面板把 MCP 面一起拖下水不值。
	const live = [];
	const pushLive = (session) => {
		if (!session || typeof session !== 'object') return;
		const id = typeof session.id === 'string' ? session.id : null;
		if (id === null) return;
		if (live.some((entry) => entry.id === id)) return;
		live.push({ id, session });
	};
	// agents 先行：有 agent 才说明这个会话在被用；sessions 里可能有已加载但没人用的对象。
	//
	// ⚠️ "两个服务都没有" ≠ "没有会话在跑"。前者是这台宿主根本给不出会话（面板会永远显示
	// 空状态，而用户以为是自己没开会话）；后者是正常状态。这两种情况在界面上长得一模一样，
	// 所以这里必须把它们分开：一条明确的错误，比一个永远空着的面板诚实。
	const agentsService = serviceOf(ctx, 'agents');
	const sessionsService = serviceOf(ctx, 'sessions');
	if (!agentsService && !sessionsService) {
		throw new Error('宿主没有提供会话服务（agents / sessions 都取不到），读不到任何上下文');
	}
	try {
		for (const agent of hostLiveAgents(ctx, null)) pushLive(agent?.session);
	} catch { /* agents 不可用时退回 sessions */ }
	try {
		for (const session of sessionsService?.list?.() ?? []) pushLive(session);
	} catch { /* 两个来源都取不到就是空状态 */ }
	// "现在没有会话在跑"是**正常状态**，不是错误：面板每 3 秒轮询一次，抛错会让错误条
	// 反复闪。所以这里返回一份**空报告**，由面板画一个空状态。
	//
	// ⚠️ 这里**不回带** `requested`。曾经带过，设计文档还据此写了"两种空状态"——而面板从没
	// 读过它：空状态是通用的（用户原话："我那么多会话你为啥显示这个"）。"点选的会话没了"
	// 这件事由面板比对 `wanted` 与回带的 `session.id` 自行判定（不一致就退回总览），
	// 不需要宿主再记一份"你问过谁"。
	if (live.length === 0) {
		return {
			ok: true,
			at: Date.now(),
			empty: true,
			session: null,
			sessions: [],
			route: { provider: null, model: null, contextWindow: null },
			budget: { window: null, used: null, projected: null, remaining: null, ratio: null },
			cache: { prompt: null, cacheRead: null, hitRate: null, sessionHitRate: null, fresh: null },
			tools: { total: null, tokens: null, chars: null, search: { calls: 0, byName: 0, byKeyword: 0, withResult: 0, resultChars: 0, recent: [] } },
			turns: [],
			turnTotal: 0,
			billed: { prompt: 0, cacheRead: 0, cacheWrite: 0, output: 0, requests: 0 },
			totals: { itemTokens: 0, measured: false, surfaceChars: 0 },
			kinds: [],
			items: [],
		};
	}
	const candidates = live.map((entry) => {
		let events = [];
		try {
			events = [...(entry.session.snapshotEvents?.() ?? [])];
		} catch (error) {
			ctx.logger?.warn?.(`dsh-toolbox-ui: 会话日志读取失败：${error?.message ?? error}`);
		}
		const meta = foldSessionMeta(events);
		return {
			id: entry.id,
			session: entry.session,
			events,
			meta,
			cwd: typeof entry.session?.header?.cwd === 'string' ? entry.session.header.cwd : meta.cwd,
			lastAt: meta.lastAt,
		};
	});

	// 挑哪个：**先要有请求发生过**（没有请求就没有上下文可看），再按最近活跃。
	// 只按 lastAt 排会把"刚打开还没发消息的空会话"排到最前面——那种会话的构成是空的，
	// 面板会显得像坏了。
	const ranked = candidates.slice().sort((left, right) => {
		const leftHas = left.meta.requests > 0 ? 1 : 0;
		const rightHas = right.meta.requests > 0 ? 1 : 0;
		if (leftHas !== rightHas) return rightHas - leftHas;
		return right.lastAt - left.lastAt;
	});
	const chosen = (wanted !== null && candidates.find((entry) => entry.id === wanted)) || ranked[0];
	const session = chosen.session;

	// ── ② 价格与压力 ──────────────────────────────────────────────────────────
	let measurement = null;
	let pressure = null;
	let breakdown = null;
	const meter = serviceOf(ctx, 'tokenMeter');
	// 三个读取各自 try：任何一个坏掉都只影响自己那一块，不能让整个面板变成白屏。
	if (typeof meter?.measure === 'function') {
		try {
			measurement = meter.measure(session);
		} catch (error) {
			ctx.logger?.warn?.(`dsh-toolbox-ui: token 计量读取失败：${error?.message ?? error}`);
		}
	}
	if (typeof meter?.contextPressure === 'function') {
		try {
			pressure = meter.contextPressure(session);
		} catch (error) {
			ctx.logger?.warn?.(`dsh-toolbox-ui: 上下文压力读取失败：${error?.message ?? error}`);
		}
	}
	// 工具定义不在 surface 上，它的价格只存在于 contextBreakdown 投影里（宿主同一套估算器）。
	//
	// ⚠️ **投影的 state 是两层的**：
	//      `{ systems, surfaceTokens, claim?, breakdown: { systemTokens, toolsTokens, messageTokens } }`
	// 而 `buildContextReport` 要的是里面那个 `breakdown`。此前这里把整个 state 传了下去，
	// 于是 `breakdown?.toolsTokens` 永远是 undefined，面板工具卡的「占上下文」一直显示「—」
	// （2026-11-19 真机现象：37 工具数 / — 占上下文），而纯函数那组用例喂的是内层对象，
	// 两边各自都绿。宿主状态形状**只在这里解释一次**：换宿主版本若要改读法，改这一行。
	const projections = serviceOf(ctx, 'sessionProjections');
	if (typeof projections?.stateOf === 'function') {
		try {
			breakdown = projections.stateOf(session, 'contextBreakdown')?.breakdown ?? null;
		} catch (error) {
			ctx.logger?.warn?.(`dsh-toolbox-ui: 工具定义占用读取失败：${error?.message ?? error}`);
		}
	}

	// 会话上的两个读法（路由 / 请求头）也是**宿主 API**：它们坏了只该让面板少一块，
	// 不该让整个请求抛出去——面板每 3 秒拉一次，抛一次就是**永久**一条错误条。
	// 与上面三个计量读取同一条纪律：逐个接住，读不到就退回"从事件里折"的那份。
	const readSafely = (call) => {
		try {
			return call();
		} catch (error) {
			ctx.logger?.debug?.(`dsh-toolbox-ui: 会话上下文读取失败：${error?.message ?? error}`);
			return null;
		}
	};
	const requestContext = typeof session?.requestContext === 'function' ? readSafely(() => session.requestContext()) : null;
	const requestHeader = typeof session?.requestHeader === 'function' ? readSafely(() => session.requestHeader()) : null;

	const report = buildContextReport({
		session: { id: chosen.id, cwd: chosen.cwd },
		events: chosen.events,
		context: requestContext ?? foldRequestContext(chosen.events),
		header: requestHeader ?? foldRequestHeader(chosen.events),
		measurement,
		pressure,
		breakdown,
	});
	// 每个活会话的**轻量摘要**（给"全部会话"列表用）。
	//
	// 只读 `contextPressure` 这个投影（O(1) 的标量读），**不调 `measure()`**：后者是 O(surface)
	// 的回放计价，列表要列 N 个会话时就变成 N 次全量回放（真机上大会话一次就几百毫秒）。
	// 列表只需要"用了多少 / 上限多少"，那正好是 pressure + requestContext 能给的全部。
	const sessions = ranked.map((entry) => {
		let used = null;
		let window = null;
		try {
			const snapshot = typeof meter?.contextPressure === 'function' ? meter.contextPressure(entry.session) : null;
			used = Number.isFinite(snapshot?.pressureTokens) ? snapshot.pressureTokens : null;
			window = Number.isFinite(snapshot?.contextWindow) ? snapshot.contextWindow : null;
		} catch (error) {
			// 这一个会话读不到就不报数，不影响其它会话。**但原因要留一条**：面板上它只会显示
			// "还没有数据"，不写日志的话没人分得清"它真没跑过"与"读的时候抛了"。
			// 用 debug：这条路每 3 秒走一次，抛一次的会话会每轮都抛，warn 会刷屏。
			ctx.logger?.debug?.(`dsh-toolbox-ui: 会话用量读取失败（${entry.id}）：${error?.message ?? error}`);
		}
		if (!Number.isFinite(window) && typeof entry.session?.requestContext === 'function') {
			try {
				const route = entry.session.requestContext();
				window = Number.isFinite(route?.contextWindow) ? route.contextWindow : window;
			} catch (error) {
				ctx.logger?.debug?.(`dsh-toolbox-ui: 会话路由读取失败（${entry.id}）：${error?.message ?? error}`);
			}
		}
		return {
			id: entry.id,
			title: entry.meta.title,
			cwd: entry.cwd,
			workspace: workspaceNameOf(entry.cwd),
			lastAt: entry.lastAt,
			requests: entry.meta.requests,
			// 列表里要能一眼看出"哪个正在生成"——否则多个会话同时跑时分不清谁在动。
			running: entry.meta.running === true,
			// 列表里要能一眼比出"谁快满了"，所以给已用/上限/占比三个数（都为 null 时面板显示"未知"）。
			used,
			window,
			ratio: used !== null && window !== null && window > 0 ? used / window : null,
			active: entry.id === chosen.id,
		};
	});
	return { ...report, sessions };
}


let McpManagerGateway = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	return class McpManagerGateway extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			// 「哪些方法上 wire、叫什么、什么顺序」只在 lib/rpc-contract.js（MCP_METHODS）里写一次，
			// 这里按表装配（lib/remote-wiring.js）：加方法只改那张表，不再在下面抄两行字面量。
			applyRemoteMethods(this, MCP_METHODS, { decorate: __esDecorate, metadata: _metadata, initializers: _instanceExtraInitializers });
			if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
		}
		static inject = ["loader", "tools"];
		// C2：插件配置面。**这是本插件第一次有 Config**——所以 schema 必须接受 `undefined`
		// （存量 profile 的 patch 行没有 config），否则升级即等于面板消失。
		static Config = ToolSearchConfigSchema;
		constructor(ctx, config) {
			super(ctx, MCP_SERVICE);
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
			// 自定义分组是**兄弟键**（config.customGroups）：写 toolLoading 的路径碰不到它，
			// 反之亦然。诊断留一份，面板能如实说"有几个分组读不出来"。
			{
				const normalizedGroups = normalizeCustomGroups(config?.[CUSTOM_GROUPS_CONFIG_KEY]);
				this.customGroups = normalizedGroups.groups;
				this.customGroupsDiagnostics = normalizedGroups.diagnostics;
			}
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
			return listMcpServers(this.ctx, deferStateResolver(this));
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
			const inventory = toolInventoryOf(this.ctx);
			const managed = entry.options.id === profileId ? state.byName.get(value) : null;
			const duplicates = matches.filter((candidate) => candidate !== entry);
			return {
				server: {
					...summarize(entry, inventory, managed, conflict, lastLogFor(this.ctx, value, entry.fiber), duplicates),
					// 只给**单台详情**（点击才取），不放进行投影：见 lib/mcp-log.js 的 recentLogsFor。
					recentLogs: recentLogsFor(this.ctx, value, entry.fiber),
				},
			};
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
			const inventory = toolInventoryOf(this.ctx);
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
				// 编辑表单不再拥有 defer：它由 MCP 页的组级开关与工具页管。没传就保留原值，
				// 否则 updateEntry 的“缺省即删键”会把旧版本/手写留下的 defer 抹掉。
				if (normalized.defer === undefined && current.defer !== undefined) normalized.defer = current.defer;
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
		 *
		 * 这个方法**曾经漏了 @Remote**：服务端有实现、面板有按钮，wire 上却没有 descriptor，于是
		 * 客户端 call('setDeferAll') 拿到的是「服务未连接」——真浏览器里点“全部开启/关闭延迟”
		 * 毫无反应。名字现在只来自 lib/rpc-contract.js 的表，漏不掉了；这条留着是因为它记的正是
		 * 那类故障的形态：实现和界面都在，唯独 wire 那一面缺，其他用例全绿。
		 */
		async setDeferAll(payload) {
			const next = payload?.defer === true;
			// ⚠️ 这里不能把判空并进 canonicalWorkspacePath：「没传 wsPath」= 全局族，是合法输入，
			// 而 canonicalWorkspacePath 现在把空/空白/相对路径一律当错误抛出。所以先自己判空，
			// 只有真给了路径才交给它规范化（绝对路径与 realpath 都在那一处）。
			const requested = typeof payload?.wsPath === "string" ? payload.wsPath.trim() : "";
			const wsPath = requested ? canonicalWorkspacePath(requested) : "";
			if (wsPath) return applyProjectDefer(this.ctx, this, wsPath, next, undefined);
			return applyGlobalDefer(this.ctx, this, next, undefined);
		}
		/**
		 * 单台的延迟开关（面板行内那颗「延迟 / 全量」芯片直接调它）。
		 *
		 * 它写的是**组级默认**（`toolLoading.groups[serverName]`），不是逐工具策略，也不是旧 `defer`。
		 * 逐工具覆盖比它高：芯片旁边会显示“N 个单独设置”，写完也会把“仍有工具不跟随”说出来——
		 * 这比“点了没变化却提示成功”诚实。
		 */
		async setDefer(payload) {
			const name = String(payload?.name ?? "").trim();
			if (name === "") throw new Error("缺少 MCP 名称");
			const next = payload?.defer === true;
			const requested = typeof payload?.wsPath === "string" ? payload.wsPath.trim() : "";
			const wsPath = requested ? canonicalWorkspacePath(requested) : "";
			const projectPolicy = wsPath ? (await readWorkspaceConfigCached(this.ctx, wsPath)).toolLoading : undefined;
			// 锁定先判：总开关或“全部常驻”方案生效时，写下去也不会改变模型看到的东西。
			// 这时报错而不是“写成功 + 一句提醒”——后者会让用户以为下次会生效。
			const before = this.deferStateOf(name, { wsPath: wsPath || undefined, projectPolicy, schemas: [] });
			if (before.deferLocked === "master-switch") throw new Error("ToolSearch 总开关（DSH_MCP_TOOL_SEARCH=off）生效中：所有工具常驻，服务器级开关不生效");
			if (before.deferLocked === "all-resident") throw new Error("当前整体方案为「全部常驻」：服务器级开关不生效，请先在「工具」页切换方案");
			const outcome = wsPath
				? await applyProjectDefer(this.ctx, this, wsPath, next, [name])
				: await applyGlobalDefer(this.ctx, this, next, [name]);
			// 组级开关只管“整台默认”。逐工具覆盖在它之上，所以点完仍可能有工具不跟随；
			// 这不是失败，但必须当场说清楚。schemas 传空数组：这里只需要覆盖条数。
			if (before.deferOverrides > 0) {
				const message = `这台服务器有 ${before.deferOverrides} 个工具在「工具」页被单独设置，仍按那里生效`;
				return { ...outcome, note: outcome.note ? `${outcome.note}；${message}` : message, diagnostics: [...(outcome.diagnostics ?? []), { code: "DEFER_HAS_TOOL_OVERRIDES", message }] };
			}
			return outcome;
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
				customGroups: options.customGroups ?? this.customGroups,
				projectPolicy: options.projectPolicy ?? (agent === undefined ? undefined : agentToolLoadingPolicy(agent)),
				legacyDeferServers: options.legacyDeferServers ?? deferServersOf(this.ctx, agent),
				legacyResidentServers: options.legacyResidentServers ?? residentServersOf(this.ctx, agent),
				protectedNames: [this.toolSearchRuntime?.settings?.toolName ?? "tool_search", "run_code"],
				// 总开关在所有策略路径上统一生效（全局/项目/旧 defer/逐工具覆盖），且**不删偏好**：
				// 关掉再看，用户设置还在。只放在 deferServersOf 里是不够的——统一策略不经过它。
				masterSwitch: toolSearchDisabled() ? "off" : "on",
			});
		}

		// C2：延迟加载的三个参数。读/写分成两个方法，而不是一个 get/set 复用的方法——契约表逐个
		// 方法列名字与参数，一个方法承担两种语义会让“这次只读”与“这次要写盘”在调用点上分不清。
		async toolSearchSettings() {
			// 只回答**配置**：参数是什么、默认是什么、写在哪个键下。
			// 目录状态（多少台按需、目录多大、被截了多少）是观测，改由 `contextReport` 一并给出——
			// 一个接口只服务一种用途，面板才不会在两个地方各长一块同样的读数。
			return {
				settings: { ...this.toolSearchRuntime.settings },
				defaults: effectiveToolSearchSettings({}),
				configKey: TOOL_SEARCH_CONFIG_KEY,
			};
		}
		// 体检数据的唯一组装点（面板与将来的诊断视图都读它，不各自拼一遍）。
		//
		// ⚠️ **这个函数绝不能碰工具清单**。它最初统计了"全局可见工具数"（`globalToolSchemas`），
		// 而那在缓存未命中时是宿主的**全量 schema 深拷贝**（实测 735 工具 ≈ 92ms / 1.6–2MB）——
		// 等于让"打开设置页"这个只读动作付一次全量枚举。ToolSearch 存在的意义就是省上下文，
		// 体检自己触发一次全量枚举是完全反过来的。所以这里只读**已经存在**的东西：
		// 设置值、延迟服务器名（纯内存遍历）、以及上一次目录组装的统计（runtime 里现成的）。
		//
		// 「最近的搜索」不在这里：它是**会话**里发生过的事，从会话日志数出来（见
		// lib/context-report.js 的 foldToolSearchStats）。runtime 那张全局旁路表不分会话，
		// 两套数摆在一起就是两个真相源；工具页那份展示搬走之后，这里也不再捎带它。
		catalogFacts() {
			return {
				budget: this.toolSearchRuntime.settings.maxCatalogChars ?? null,
				// 延迟服务器名：这是"谁在按需加载"，且来自与守卫同一个函数。
				deferredServers: deferServersOf(this.ctx),
				// 尚未组装过目录 ⇒ null（"还没跑过"与"跑了但没截断"是两件事，不能都写 0）。
				lastAssembly: this.toolSearchRuntime.catalog?.() ?? null,
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
		// 全局可见集走按代次共享的快照：它与工具清单是同一次枚举，不该各付一次深拷贝。
		collect(typeof this.ctx.tools?.schemas === "function" ? globalToolSchemas(this.ctx) : []);
		for (const entry of allMcpEntries(this.ctx)) {
			try {
				const entryCtx = entry?.fiber?.ctx;
				if (typeof entryCtx?.tools?.schemas === "function") collect(entryCtx.tools.schemas(entryCtx));
			} catch { /* 单个条目视图读失败不影响其余 */ }
		}
		for (const agent of hostLiveAgents(this.ctx, this.liveAgents)) {
			try {
				collect(agent?.ctx?.tools?.schemas ? agent.ctx.tools.schemas(agent) : []);
			} catch { /* 单个会话视图读失败不影响其余 */ }
		}
		return available;
	}

	// 一台服务器在**当前作用域**下的加载状态。返回两个不同的东西，消费方不能混用：
	//
	//   · deferConfigured —— **组级默认**（项目组 > 全局组 > 旧 defer > 模式默认）。
	//     MCP 列表的行内芯片显示这个，并且点它只改这一层；芯片因此永远不会“写着全量、
	//     实际还有一半按需”，也不会出现“点了没变化”。
	//   · deferEffective —— 该服务器名下的工具**实际**有多少被延迟（resident / deferred /
	//     mixed）。详情页与工具页显示这个。工具数为 0 时**不下发**，让客户端回退到配置值，
	//     而不是把“还没连上”谎报成“全量”。
	//
	// `deferOverrides` 是逐工具覆盖的条数：芯片旁边据此显示“N 个单独设置”，把“为什么还有
	// 工具跟整台默认不一样”放在用户看得见的地方，而不是让他去猜。
	deferStateOf(serverName, options = {}) {
		const prefix = `mcp__${serverName}__`;
		const schemas = options.schemas ?? this.collectAvailableTools();
		const available = schemas.filter((schema) => String(schema?.name).startsWith(prefix));
		const wsPath = typeof options.wsPath === "string" && options.wsPath ? options.wsPath : undefined;
		// 假 agent 只用于让 serverNamesOf 拿到**这个项目**的服务器名集合；项目策略由调用方显式传入
		// （agentToolLoadingPolicy 只认活着的 agent 对象，面板这里没有）。
		const scopeAgent = wsPath ? { session: { header: { cwd: wsPath } } } : undefined;
		const global = normalizePolicyConfig(this.globalToolLoading);
		const project = normalizePolicyConfig(options.projectPolicy);
		const mode = project.mode !== "legacy" ? project.mode : global.mode;
		const ownerSet = new Set(options.serverNames ?? serverNamesOf(this.ctx, scopeAgent));
		const legacy = options.legacyDefer === true ? true : options.legacyDefer === false ? false : undefined;
		const legacyDeferServers = legacy === true ? [serverName] : [];
		const legacyResidentServers = legacy === false ? [serverName] : [];
		const resolution = this.loadingPolicy(scopeAgent, available, {
			projectPolicy: options.projectPolicy,
			serverNames: ownerSet,
			legacyDeferServers,
			legacyResidentServers,
		});
		const deferred = available.filter((schema) => resolution.entries.get(schema.name)?.policy === "deferred").length;
		const overrideNames = [...new Set([...Object.keys(global.tools), ...Object.keys(project.tools)])]
			.filter((name) => uniqueOwner(name, ownerSet) === serverName);
		return {
			deferConfigured: groupPolicyOf({ serverName, policy: global, projectPolicy: project, legacyDefer: legacy }),
			deferMode: mode,
			deferOverrides: overrideNames.length,
			deferLocked: toolSearchDisabled() ? "master-switch" : mode === "all-resident" ? "all-resident" : null,
			...(available.length ? { deferEffective: deferred === 0 ? "resident" : deferred === available.length ? "deferred" : "mixed" } : {}),
			deferredCount: deferred,
			toolCountForDefer: available.length,
		};
	}
	// 统一工具加载策略：全局读写 + 项目读写。这四个方法的 @Remote 名单不再手写——按契约表装配
	// （见 lib/rpc-contract.js），所以两面不会因为“加了一个、另一个忘了”而漂移。
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
			const owners = tools.map((tool) => tool.owner).filter((owner) => typeof owner === "string" && owner !== "");
			const groups = groupStatesOf({
				owners,
				ownPolicy: policy,
				inheritedPolicy: policy,
				legacyOf: (name) => legacyDeferOf(this.ctx, name),
			});
			return { policy, tools, groups, customGroups: this.customGroups, customGroupsDiagnostics: this.customGroupsDiagnostics ?? [], masterSwitch: toolSearchDisabled() ? "off" : "on", configKey: TOOL_LOADING_CONFIG_KEY };
		}

		/**
		 * 写全局加载策略。`policy: null` = 回到既有行为（删掉这个键）。
		 *
		 * 先校验再落盘；运行值在写锁内更新，保证"盘上写的是 A、内存里是 B"不会发生。
		 * 不重装运行时：策略是活值，下一次组装自己就用到新结果（与 defer 开关同一条语义）。
		 */
		async updateToolLoadingSettings(payload) {
			if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
				throw new Error("工具加载策略必须以 { policy, customGroups } 对象提交");
			}
			const extra = Object.keys(payload).filter((key) => key !== "policy" && key !== "customGroups");
			if (extra.length) throw new Error(`未知的工具加载载荷字段：${extra.join("、")}（只接受 policy、customGroups）`);
			// 两个键各自独立：undefined = 这次不动它；null = 删掉它（回到"没配"）。
			// 早先 undefined 被当成"重置"，加进分组后那条语义会变成"只改分组却顺手清掉策略"。
			const wantsPolicy = Object.hasOwn(payload, "policy");
			const wantsGroups = Object.hasOwn(payload, "customGroups");
			if (!wantsPolicy && !wantsGroups) throw new Error("至少要提交 policy 或 customGroups 之一");
			const requestedPolicy = !wantsPolicy || payload.policy === null ? null : validatePolicyConfig(payload.policy);
			const requestedGroups = !wantsGroups || payload.customGroups === null ? {} : validateCustomGroups(payload.customGroups);
			let changedLive = false;
			const identity = pluginPatchIdentity();
			// 同 updateToolSearchSettings：走唯一事务入口，拿到覆盖判定与回滚，而不是自己 writePatch。
			// 策略是活值（下一次组装就用新结果），所以 applyLive 只换内存里那一份，不重装运行时、
			// 不重连任何 MCP。
			const canCheckOverride = await composedRowVisible(this.ctx, identity.id);
			const outcome = await withPatchWrite(this.ctx, async () => {
				const state = await readPatch(this.ctx);
				// 两个兄弟键在**同一次事务**里写：只改一个时另一个的内容一个字节都不动（writeConfigKey 保留兄弟键）。
				let content = state.content;
				if (wantsPolicy) content = setToolLoadingPolicyInPatch(content, requestedPolicy, identity);
				if (wantsGroups) content = setCustomGroupsInPatch(content, requestedGroups, identity);
				return commitPatch(this.ctx, state, content, {
					label: wantsGroups && !wantsPolicy ? "工具分组" : "工具加载策略",
					...(canCheckOverride ? { entryId: identity.id, expect: { present: true } } : {}),
					applyLive: () => {
						if (wantsPolicy) {
							const next = normalizePolicyConfig(requestedPolicy);
							if (JSON.stringify(next) !== JSON.stringify(this.globalToolLoading)) {
								changedLive = true;
								this.globalToolLoading = next;
							}
						}
						if (wantsGroups) {
							const nextGroups = normalizeCustomGroups(requestedGroups);
							if (JSON.stringify(nextGroups.groups) !== JSON.stringify(this.customGroups)) {
								changedLive = true;
								this.customGroups = nextGroups.groups;
								this.customGroupsDiagnostics = nextGroups.diagnostics;
							}
						}
					},
				});
			});
			return mutationResult(outcome.persisted, changedLive ? "applied" : "unchanged", {
				diagnostics: outcome.diagnostics ?? [],
				policy: { ...this.globalToolLoading },
				customGroups: this.customGroups,
				customGroupsDiagnostics: this.customGroupsDiagnostics ?? [],
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
			for (const agent of hostLiveAgents(this.ctx, this.liveAgents)) {
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
			const owners = tools.map((tool) => tool.owner).filter((owner) => typeof owner === "string" && owner !== "");
			// 与生效值同一份旧 defer 表（按当前项目解析），不为每个 owner 重算一次。
			const legacyTable = serverDeferTable(this.ctx, scopeAgent);
			const groups = groupStatesOf({
				owners,
				ownPolicy: projectPolicy,
				inheritedPolicy: this.globalToolLoading,
				inheritedProjectPolicy: projectPolicy,
				legacyOf: (name) => legacyTable.get(name),
			});
			return { wsPath, policy: projectPolicy, tools, groups, customGroups: this.customGroups, customGroupsDiagnostics: this.customGroupsDiagnostics ?? [], masterSwitch: toolSearchDisabled() ? "off" : "on", configKey: TOOL_LOADING_CONFIG_KEY };
		}

		/**
		 * 写项目策略：只动 `.dsh/mcp.json` 的 `toolLoading` 键，服务器与 exclude 原样保留，
		 * 并且**不触及连接**（加载策略不是连接配置）。
		 */
		async setWorkspaceToolLoading(payload) {
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath ?? ""));
			assertRegisteredWorkspace(this.ctx, wsPath);
			// 分组是 profile 级事实（工具本身也是），不属于任何项目：明确拒绝，不静默忽略。
			if (payload !== null && typeof payload === "object" && Object.hasOwn(payload, "customGroups")) {
				throw new Error("分组是全局配置：项目层不能写 customGroups，请切到「全局」作用域里改");
			}
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
			const wsPath = canonicalWorkspacePath(String(payload?.wsPath ?? (payload?.path || "")));
			const config = await readWorkspaceConfigCached(this.ctx, wsPath);
			// 诊断只描述**当前配置会去挂载的条目**。记录表本身没有寿命：清除者只有「同一条目再次
			// 挂载成功」，而删除与禁用都不会再走到那条路（挂载循环直接跳过 disabled 的条目），
			// 于是横幅会永久点一个已经不存在、或永远不会被挂载的条目，用户无法消除。
			// 过滤只在读取端做一处：写路径与记录逻辑都不动，否则就是第二个真相源。
			const activeNames = new Set(config.servers.filter((server) => !server.disabled).map((server) => server.name));
			const currentOnly = (rows) => rows.filter((row) => activeNames.has(row.serverName));
			// 项目 MCP 的连接诊断与全局走同一条日志通路（按 mcp-client(<serverName>) 过滤）。
			const mountErrors = currentOnly(workspaceMountErrorsView(wsPath));
			const mountErrorByName = new Map(mountErrors.map((m) => [m.serverName, m.error]));
			const servers = config.servers.map((server) => summarizeWorkspaceRow(this.ctx, wsPath, server, mountErrorByName.get(server.name)));
			// 项目行的芯片必须按**这个项目**的策略算：项目组/逐工具覆盖优先于全局，而旧 defer
			// 要把全局与项目同名条目合并（与 deferServersOf 同一条规则）。之前这里没有下发任何
			// deferEffective，客户端于是回退到原始 defer，项目行永远显示配置值、从不显示实际。
			if (typeof this.deferStateOf === "function") {
				const projectPolicy = normalizePolicyConfig(config.toolLoading);
				const legacyTable = serverDeferTable(this.ctx, { session: { header: { cwd: wsPath } } });
				for (const row of servers) {
					Object.assign(row, this.deferStateOf(row.serverName, {
						wsPath,
						projectPolicy,
						legacyDefer: legacyTable.get(row.serverName),
						schemas: workspaceToolSchemas(this.ctx, row.serverName, wsPath),
					}));
				}
			}
			const globalResult = await listMcpServers(this.ctx, deferStateResolver(this));
			const global = globalResult.servers.map((server) => ({ ...server, excluded: config.exclude.includes(server.serverName) }));
			const recordedRestrictError = workspaceRestrictErrorView(wsPath);
			// deny 里装的是工具名（`mcp__<server>__<tool>`）：它指向的全局条目全没了，这条告警就没
			// 有可作用的对象（exclude 自己变了由写路径重算，不在这里兜）。
			let restrictError = recordedRestrictError;
			if (restrictError !== null) {
				const globalNames = allMcpEntries(this.ctx).map((entry) => entry.options.config.serverName);
				if (!restrictError.deny.some((tool) => globalNames.some((name) => tool.startsWith(`mcp__${name}__`)))) restrictError = null;
			}
			const scopeErrors = currentOnly(workspaceScopeErrorsView(wsPath));
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
		async exportGlobalJson() {
			// 导出**全局层**的配置快照：与 exportWorkspaceJson 同一个 `{ mcpServers }` 形状（同一个
			// specToMcpEntry），所以导出的东西能直接当 `.dsh/mcp.json` 放到任何一个工作区，
			// 也能被「导入 MCP」粘贴回来。
			//
			// 两处差异必须说清楚，不能照抄项目导出的措辞：
			//   ① **没有 exclude**：exclude 是「这个项目屏蔽了哪些全局 MCP」，属于项目不属于全局层，
			//      恒为空数组（客户端只读它自己的字段，拿到空数组就是"没有这一项"）。
			//   ② **导出的可能是字面凭据，而不是 `${VAR}` 模板**：patch 里存的是**求值后**的结果
			//      （toMcpClientConfig 用 evaluateEnvExpression），所以通过面板添加过的 env/header
			//      在文件里已经是实际值，导出只能如实给出。手写的 `!!js process.env.X` 相反，
			//      仍会被 jsExpressionToTemplate 转回 `${X}`。⇒ 界面上全局导出的警告文案必须与
			//      项目导出不同（后者保留模板），那是数据形态决定的，不是选择。
			const state = await managedState(this.ctx);
			const mcpServers = {};
			for (const server of state.servers) setOwn(mcpServers, server.name, specToMcpEntry(server));
			return {
				// 文件名用**本包名**而不是 profile 目录名：目录名来自本地布局（可能是 tmp 里的路径），
				// 而文件名是用户看到并保存的东西，不该随部署位置变。
				name: pluginName(),
				count: state.servers.length,
				excluded: [],
				json: JSON.stringify({ mcpServers }, null, 2) + "\n",
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
	async contextReport(payload) {
		const report = await contextReportFor(this.ctx, payload);
		// 工具目录的状态（多少台按需、目录多大、被截了多少）是**观测**，所以跟上下文一起出，
		// 不留在工具页。工具页只负责配置——用户的原话是"既然都有专门显示这个上下文的页面，
		// 那也应该显示这里"。
		//
		// ⚠️ 只取**目录**那部分，不取 `recentSearches`：那是宿主侧的全局旁路表（不分会话），
		// 而上下文页的"搜索次数"是从**本会话日志**里数的。两个来源混在一起会给出两套数。
		let catalog = null;
		try {
			const facts = this.catalogFacts();
			catalog = {
				budget: facts.budget,
				deferredServers: facts.deferredServers,
				lastAssembly: facts.lastAssembly,
			};
		} catch (error) {
			// 目录状态取不到不影响上下文本身：面板只是不显示那一行。
			this.ctx?.logger?.warn?.(`dsh-toolbox-ui: 目录状态读取失败：${error?.message ?? error}`);
		}
		return { ...report, catalog };
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
 * 与 MCP 服务的 `MCP_SERVICE` 互不影响。
 *
 * **管理动作不依赖会话**（SPEC 约束 14）：面板的读取与文件操作都不要求存在活动会话——
 * 官方 `ctx.remote.skills.list` 需要真实 sessionId，会激活冷 Agent，故本插件走自己的 RPC。
 */
let SkillsManagerGateway = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	return class SkillsManagerGateway extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			// 技能面同理：方法名与顺序只来自契约表（SKILL_METHODS）。
			applyRemoteMethods(this, SKILL_METHODS, { decorate: __esDecorate, metadata: _metadata, initializers: _instanceExtraInitializers });
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
			// R14：外部源装进来的技能带一份来源记录（slug/version/pageUrl）。
			// 读失败**不抛**：`.hub.json` 只是元数据，它坏了不该让整个详情页打不开；
			// 但也不能静默——把原因放在 `hubError` 里让面板说出来（"没有来源"与"来源坏了"是两件事）。
			let hub = null;
			let hubError = "";
			try {
				hub = await readHubSource({ kind: resolved.kind, path: resolved.path });
			} catch (error) {
				hubError = String(error?.message ?? error);
			}
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
					// 本机导入的技能没有来源 ⇒ null（不是错误）。
					hub,
					...(hubError ? { hubError } : {}),
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
			//
			// 三种源形状并存，都不是可选项：
			//   \`path\`  —— 宿主侧调用/命令行（路径就在本机，直接读）；
			//   \`content\` / \`archiveBase64\` —— **浏览器上传**（浏览器拿不到宿主机路径，只能给内容）。
			// 后者比前者**更窄**：客户端因此拿不到"读宿主任意文件"的能力。详情见 lib/skills-file-ops.js
			// 的 importSkill（内容会先落到 system tmp 再走同一条导入路径）。
			const target = await resolveTargetReference(this.ctx, {
				source: payload?.source,
				root: payload?.root,
				projectPath: payload?.projectPath,
			});
			if (target.writable === false) throw new Error("该位置是只读的（bundled），不能写入");
			const upload = typeof payload?.archiveBase64 === "string"
				? { type: "archive", archiveBase64: payload.archiveBase64 }
				: typeof payload?.content === "string"
					? { type: "file", content: payload.content }
					: { type: payload?.type, path: String(payload?.path ?? "") };
			const result = await importSkill({
				root: target.root,
				scope: target.scope,
				writable: true,
				source: upload,
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
				// R14：把"从哪来、哪个版本"落盘。**技能已经落盘了**，所以这里失败不能把整次安装
				// 报成失败——那是两件事。但也不能静默：来源丢了，用户以后就不知道自己装的是什么版本、
				// 也就无从检查更新。所以在结果里如实标"来源没记住"，让人能看见。
				let hub = null;
				let hubError = "";
				try {
					hub = await writeHubSource(result, { slug, version: payload?.version, pageUrl: payload?.pageUrl });
				} catch (error) {
					hubError = String(error?.message ?? error);
				}
				return mutationResult("applied", refreshSkillCatalog(this.ctx), {
					...result,
					hub,
					...(hubError ? { hubError } : {}),
				});
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
					// 宿主自带的那一份不是“对手面板”：它没有客户端入口（只有 watch/restart/probe）、
					// 随 web-app 打包不可卸载。向它让位 = 永久失去唯一的面板入口（真机上就是这样）。
					if (isHostBundledMcpManager(name)) continue;
					// **必须在跑，不只是“配置里存在”**：disabled / import 失败（没有 fiber）/
					// apply 失败（state=FAILED）的条目一行代码都没执行，让位于它 = 入口凭空消失。
					// 真机（0.2.2-rc.2）：`@deepseek-ai/dsh-web-app` 内置了
					// `@deepseek-ai/dsh-mcp-manager`，它在宿主里“启动失败”，而本插件据此把入口
					// 整体让掉——用户看到的就是“插件入口没有挂载”（issue #11）。
					if (!entryIsActive(entry)) continue;
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






