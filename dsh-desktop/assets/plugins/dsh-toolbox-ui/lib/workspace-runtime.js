import { mkdir, readFile, stat } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { allMcpEntries, entriesForName, MCP_NAME } from "./mcp-registry.js";
import { readWorkspaceConfig, toMcpClientConfig, writeWorkspaceConfig, WORKSPACE_CONFIG_REL } from "./workspace-config.js";

// ---------- workspace 项目层运行时 ----------
// 项目配置的读写状态，以及 agent setup 时把项目 MCP 挂到 agent scope 的装饰器。
// 只依赖 mcp-registry 与 workspace-config，不认识 profile patch，因此可被 index.js 单向依赖。

// ---------- 模块级状态的键约定（全模块唯一一份，不要再引入第三种）----------
//   属于某个 dsh app 实例的状态 → 以 appRoot(ctx) 为键存进 WeakMap，app 消失即随之回收
//     （官方 mcp-client 的 serverName 注册表用的也是 `WeakMap keyed by ctx.root`）。
//   属于某个项目目录的状态       → 以 canonical wsPath 为键（文件路径本就全进程唯一）。
function appRoot(ctx) {
	const root = (ctx && typeof ctx === "object" && ctx.root) || ctx;
	if (!root || typeof root !== "object") throw new TypeError("mcp-manager: 需要一个 cordis context 才能定位 app root");
	return root;
}
function bucketOf(store, ctx) {
	const root = appRoot(ctx);
	let bucket = store.get(root);
	if (!bucket) { bucket = new Map(); store.set(root, bucket); }
	return bucket;
}

// 配置缓存按 app root 隔离（多 app 同进程时互不串读），每 app 内按插入序有上限。
const workspaceConfigCache = new WeakMap(); // appRoot -> Map<canonicalWsPath, { stamp, mtimeMs, size, config }>
const WORKSPACE_CACHE_LIMIT = 64;
// 某个项目目录的写序：既要串行化 read→modify→write（与全局 withPatchWrite 对称，防止并发写
// 丢更新），又要给配置缓存一个「写入代号」——写盘后自增，缓存条目记下读取时的代号，失效因此
// 不需要枚举所有 app 的缓存桶（WeakMap 不可枚举），也顺带盖住「同一 mtime 粒度内改回同样
// 字节数」这种骗过 stat 的情况。两者是同一个不变量的两面，放一张表，不各存一份。
const workspaceWriteState = new Map(); // canonicalWsPath -> { queue: Promise, stamp: number }
function workspaceWriteEntry(wsPath) {
	let state = workspaceWriteState.get(wsPath);
	if (!state) { state = { queue: Promise.resolve(), stamp: 0 }; workspaceWriteState.set(wsPath, state); }
	return state;
}
function workspaceWriteStamp(wsPath) { return workspaceWriteState.get(wsPath)?.stamp ?? 0; }
// 会话记录：本模块对该会话的项目层记账（属于哪个项目、restrict 当前展开成什么）。
// 它**不是**任何存活性凭据：会话是否还活着由 cordis 的 agentCtx.effect() 判定，
// 本代挂载器是否还在管事由 installAgentRuntime 的 generation 令牌判定。
const agentWorkspaceStates = new Map(); // agent -> { root, wsPath, restrictKey, restrictDisposer }；随 agent scope 清理
// 当前活着的挂载器代次（按 app root）：reconcile 与挂载用同一个令牌，于是「插件已卸载」在
// 两处是同一个事实，而不是各写一套判定。
const activeGenerationByRoot = new WeakMap(); // appRoot -> generation
// 项目 MCP 挂载失败（serverName 冲突/启动/连接失败）的可观测记录：Host 无法直接看到 agent 层
// 注册，因此把 setup 阶段的失败显式呈现给用户，避免“静默缺失”。
// 这两张表按 wsPath 而不按 app root 分桶：诊断对象是「某项目的某个 server」，而项目路径本身
// 就全进程唯一；即使两个 app 同时读同一项目，结论也应该是同一份。
const workspaceMountErrors = new Map(); // wsPath -> Map<serverName, errorMessage>
const workspaceRestrictErrors = new Map(); // wsPath -> { deny, error, ts }
// 作用域身份失效的可观测记录：宿主工具视图读失败，或工具落到了全局层而不是共享作用域层。
// 这一类失败在面板上原本只能表现为「0 工具」→「连接失败」，根因（作用域标签认不出来）完全不可见。
const workspaceScopeErrors = new Map(); // wsPath -> Map<serverName, message>
// 诊断日志按「内容变化」打一次：面板每 5s 轮询会重复走到同一条路径，按次打会把日志刷爆，
// 而一次次都不打就等于把故障留在暗处。
const warnedDiagnostics = new Map(); // key -> message
const WARN_DIAGNOSTIC_LIMIT = 64;
function warnDiagnosticOnce(logger, key, message) {
	if (warnedDiagnostics.get(key) === message) return;
	if (warnedDiagnostics.size >= WARN_DIAGNOSTIC_LIMIT && !warnedDiagnostics.has(key)) warnedDiagnostics.clear();
	warnedDiagnostics.set(key, message);
	logger?.warn?.(message);
}
// cordis FiberState.ACTIVE 的代号：建连完成前读空集是正常中间态，不是故障信号。
const FIBER_ACTIVE = 2;

// ---------- 项目 MCP 共享连接（每 (wsPath, serverName) 一份实例）----------
// 官方 mcp-client 的 serverName 在 ctx.root（=整个 app）内唯一，而且它同时是模型可见工具名
// `mcp__<serverName>__*` 的前缀。所以「每会话各挂一份」既会撞名，也无法用「每会话换个名字」
// 规避——换名等于换工具名，会话恢复时的历史工具调用与 prompt 缓存会一起失效。
// 改为：每 (wsPath, serverName) 只挂一份 mcp-client 到我们自建的隔离作用域上（serverName 只
// 登记一次），再把它注册出的工具定义原样投射进每个会话自己的 own 层——多个会话共享
// 同一份连接、各自可见、互不干扰。
//
// 同一 connKey 的生命周期必须串行化，否则两条异步窗口都会重新撞名：
//   1. 建连：check→await→set 之间并发 setup 会各建一份连接（serverName 在 apply 的 effect
//      里同步登记，第二个实例必抛 already in use）。解法：建连 promise 先入表，并发者共享结果。
//   2. 释放：teardown 是异步的（quiesceFiber → fiber unload），若立即删表并新建，新连接可能
//      撞上尚未归还的旧名。解法：释放后保留「disposing」占位，acquire 等它完成再新建。
//      （cordis 的 fiber unload 是 `Promise.all(_disposables)` 并行释放，serverName 实际上比 stdio
//       子进程更早归还；这里等整条 teardown 比必要更保守，换取不依赖官方内部的释放顺序。）
// 共享单连接对合规服务端无语义损失（依据见 README 的「共享连接模型」一节）；这里要解决的
// 是纯插件层的命名/生命周期串行化问题。
const sharedConnections = new WeakMap(); // appRoot -> Map<connKey, ConnCell>
// ConnCell 状态机（互斥）：
//   { entry }        —— 就绪：refs 计数在 entry 上，acquire 直接复用
//   { pending }      —— 建连中：所有并发 acquire 等待同一 promise，只建一条连接
//   { disposing }    —— 释放中：teardown 完成前保留占位，acquire 等待后新建
// ConnEntry: { key, scopeKey, scoped, fiber, refs, released, serverName, wsPath, configFingerprint }
//
// 引用所有权（本模块最关键的不变量）：一份引用由**一个 cordis effect** 唯一持有。
// acquire 返回后立刻用 `agentCtx.effect()` 把「归还」登记给会话作用域，此后所有权完全在
// cordis 手里：
//   * 会话作用域已销毁 → effect() 的 assertActive() 当场抛 INACTIVE_EFFECT，我们在 catch 里
//     归还。dsh-agent-loop 的 setupAndPublish 用 raceAbort 抛弃 setup 但不取消它，会话完全
//     可能在我们 await 建连时已经销毁——这个窗口由官方的 assertActive 关掉，不需要本模块
//     再自建一套「作用域是否还活着」的判定。
//   * 会话正常结束 → cordis 跑 disposer；重复/并发 dispose 由 effect wrapper 的 runner.epoch
//     幂等；异步 disposer 被 Fiber._unload 的 `await runDisposable(dispose)` 等待，于是会话
//     销毁不早于 MCP 连接关闭完成。
// 下面这张索引表因此**不是所有权凭据**，只是两个遍历需求的视图：tools/change 时要找到所有
// 存活 slot 补投射；HMR 卸载时要撤回所有投射。摘除与否都不影响引用是否归还。
const agentProjectSlotsByRoot = new WeakMap(); // appRoot -> Map<agent, Map<connKey, ProjectSlot>>
// ProjectSlot: { key, entry, ctx, agentCtx, agent, projected: Map<name, { definition, dispose }>, release, disposed }
const scopeModulePromises = new WeakMap(); // appRoot -> Promise<dsh-scope 模块>（按 app 隔离，避免跨 app/HMR 串用）

function connKeyOf(wsPath, serverName) { return `${wsPath}\u0000${serverName}`; }
function sharedConnBucket(ctx) { return bucketOf(sharedConnections, ctx); }
function toolsServiceOf(ctx) {
	const get = typeof ctx.get === "function" ? ctx.get.bind(ctx) : null;
	return (get && get("tools")) || ctx.tools || null;
}
async function loadScopeModule(ctx) {
	// 通过宿主 loader 解析 dsh-scope：与宿主 dsh-tools 用同一份模块（Node ESM 按解析路径缓存），
	// createScope 造出的作用域才会被宿主的 ToolRuntime 认得。
	const root = appRoot(ctx);
	let pending = scopeModulePromises.get(root);
	if (!pending) {
		pending = ctx.loader.import("@deepseek-ai/dsh-scope");
		scopeModulePromises.set(root, pending);
		// 解析失败不缓存失败态，下次重试。
		pending.catch(() => scopeModulePromises.delete(root));
	}
	return pending;
}
// 配置指纹：直接对「实际下发给 mcp-client 的配置」取指纹，而不是对原始 spec 列字段：
//   —— 字段集不会漏（无需手工维护一份清单，日后 mcp-client 加字段自动跟上）；
//   —— 包含 `${VAR}` 求值后的结果，环境变量变了同样算“配置变了”。
// 同一 (wsPath, serverName) 的连接由首个 acquire 的配置建立。配置变更**不**沿用旧连接：
// 挂载路径与写盘对齐都会就地重载（见 retireStaleConnection / reconcileWorkspaceConnections），
// 依据是宿主对配置条目的既有语义（mcp-client README：编辑条目就地重载连接、名字不变）。
// `configStale` 因此只是瞬时状态（正常情况下恒为 false），留着是为了在重载失败/未及重载时
// 仍能看出差异，而不是一条长期存在的提示。
function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
	return JSON.stringify(value) ?? "null";
}
// 「一份下发配置的指纹怎么算」只有这一个地方知道；下面那个按 server 的版本只是把"当前配置"
// 求值出来再交给它（求值失败返回 undefined，由建连路径抛真正的错误，不在这里伪造指纹）。
function fingerprintOfConfig(clientConfig) {
	return stableStringify(clientConfig);
}
function configFingerprintOf(server, wsPath) {
	try { return fingerprintOfConfig(toMcpClientConfig(server, wsPath)); } catch { return undefined; }
}
// 创建一份共享连接（每个 (wsPath, serverName) 全 app 只执行一次，由 acquire 串行化）。
// serverName 在 mcp-client apply 的 effect 里同步登记，因此这条路径不能并发执行。
// clientConfig 由调用方传入：保证指纹与真正下发的配置是同一次求值的结果，不会发散。
async function createSharedConnection(ctx, wsPath, server, clientConfig, configFingerprint) {
	const [scopeMod, mcpClient] = await Promise.all([loadScopeModule(ctx), ctx.loader.import(MCP_NAME)]);
	const scopeKey = { dshMcpProjectConn: true, wsPath, serverName: server.name };
	const scoped = scopeMod.createScope(ctx, scopeKey);
	// 官方判 serverName 唯一性用的键是 `scopeOf(ctx) ?? ctx.root`（mcp-client 的 serverName effect）。
	// 作用域标签是**模块内的 Symbol**：依赖树里 @deepseek-ai/dsh-scope 一旦有两份实例（宿主一份、
	// 插件一份），标签就互不相认，owner 退化成整个 app 的 root —— serverName 于是成了全进程唯一，
	// 两个项目的同名条目必然互相占用：第一个项目照常，第二个项目整批起不来。那是**功能不可用**，
	// 不是配置写错，不能只靠一句提示让用户接受。
	// 因此在隔离作用域之外，再把这条**回退键**做成这条连接独有的：`scopeOf(ctx)` 认得出来时它
	// 根本不会被读到（`??` 短路，行为与修复前逐字一致），认不出来时官方拿到的仍是一个只属于本
	// 连接的 owner，"一条连接一份名字"这条语义在两种安装下都成立。
	// 取值用连接自己的作用域 ctx（不是凭空造的对象）：那是个真 context，任何顺着 root 读服务的
	// 代码照样解得开。安全性核对：`ctx.root` 在 mcp-client 里只有这一处用途（registerServerContext
	// 走 ctx.inject，不读 root），cordis 的服务解析走 fiber 链与 isolate 映射（不读访问方 ctx 的
	// root），而本插件自己的 appRoot() 只用插件自己的 ctx 分桶，从不拿连接 ctx 去分桶。
	const connectionCtx = scoped.ctx.extend({ root: scoped.ctx });
	// 挂在隔离作用域上：serverName 只登记一次；工具注册进该作用域层（不进全局，不进任何会话）。
	const fiber = connectionCtx.plugin({ apply: mcpClient.apply, inject: mcpClient.inject, name: mcpClient.name, Config: mcpClient.Config }, clientConfig);
	// idleTimeoutMs 是插件自己的生命周期策略（不下发给 mcp-client —— 那是未知字段），
	// 随建连时的配置固定下来，与 configFingerprint 同源。defer（ToolSearch 延迟开关）同理，
	// 且**故意不进 clientConfig**：它不是 mcp-client 字段，进指纹会让"改个延迟开关"触发
	// 一次重连。它是活值——每次挂载按当前配置刷新（见 mountProjectMcpForAgent）。
	return { key: connKeyOf(wsPath, server.name), scopeKey, scoped, fiber, refs: 0, serverName: server.name, wsPath, configFingerprint, defer: server.defer === true, idleTimeoutMs: server.idleTimeoutMs, idleTimer: undefined, createdAt: Date.now(), hadTools: false };
}
// 当前活着的项目级共享连接（(wsPath, serverName, defer) 表）。项目连接是 connectionCtx.plugin()
// 建出来的，**不在 ctx.loader.entries() 里**，所以 ToolSearch 的配置桥必须从这里取第二来源——
// 否则项目服务器的 defer 开关在运行时是个静默 no-op。
//
// `wsPath` 必须一起带出去：同名服务器可以在不同项目里各配一份（DSH 0.1.5 起合法），
// 丢掉项目这一维就等于把 A 项目的偏好套到 B 项目上。
export function projectMcpServers(ctx) {
	const servers = [];
	for (const cell of sharedConnBucket(ctx).values()) {
		const entry = cell?.entry;
		if (entry && typeof entry.serverName === "string") servers.push({ name: entry.serverName, defer: entry.defer === true, wsPath: entry.wsPath });
	}
	return servers;
}
// mcp-client 的终态：一次故障共享一个 attempt 预算，耗尽后**注销全部工具并停止重连**，只能靠
// 重载插件或重启宿主恢复（README: "After ten consecutive failed reconnect attempts the server's
// tools are removed and reconnection stops until you reload the configuration or restart the
// harness"）。用户的项目 MCP 不是常驻服务（VS 重启、脚本结束都会让它消失），所以这个终态几乎
// 必然出现 —— 插件必须自己把它当"待重建"，而不是等用户重启宿主。
// 判定口径与面板一致：fiber 已 ACTIVE（apply 结束）却一个工具都没有。
// 另外要求 `hadTools`（这条连接**曾经**读到过工具）：mcp-client 耗尽重连时会注销工具，所以
// "有过、现在没了"才是终态的指纹；一个本来就只提供 resources 之类、零工具的服务器不该被
// 每次挂载都拆掉重建（那会每个会话创建都白起一次子进程）。再要求连接已存在一段时间，
// 避免把"刚建连、还在握手"误判成终态。
const DEAD_CONNECTION_AGE_MS = 5_000;
function isDeadConnection(ctx, entry) {
	if (entry.fiber?.state !== FIBER_ACTIVE) return false;
	if (entry.hadTools !== true) return false;
	if (Date.now() - (entry.createdAt ?? 0) < DEAD_CONNECTION_AGE_MS) return false;
	// 只数名字：这里要回答的是「还有没有工具」。稳态是一次哨兵 `get()`；哨兵读不到（工具已被
	// mcp-client 注销，正是终态该有的样子）时会退回一次 `schemas(scopeKey)` 深拷贝 —— 这条判定
	// 只在挂载路径上问，不在事件链上。
	// 读不出来不算终态——「读不到」和「刚才还有、现在没了」是两个事实。
	const read = readConnectionTools(ctx, entry);
	return !read.failed && read.definitions.size === 0;
}
// 终态连接按需重建：下次有人要用它时先拆掉，让随后的 acquire 建一条新的。
async function retireDeadConnection(ctx, wsPath, server) {
	const entry = sharedConnBucket(ctx).get(connKeyOf(wsPath, server.name))?.entry;
	if (!entry || !isDeadConnection(ctx, entry)) return undefined;
	ctx.logger?.warn?.(`mcp-manager: 项目 MCP ${server.name} 的连接已进入终态（重连耗尽），按需重建`);
	await retireSharedConnection(ctx, entry);
	return entry;
}
// 面板的「重连」：无论当前什么状态，都拆掉这条连接并按当前配置重建，然后对齐存活会话。
// 对应 DSH 的 "reload the configuration" 与主流客户端的 /mcp retry。
async function reconnectWorkspaceServer(ctx, wsPath, serverName) {
	const config = await readWorkspaceConfigCached(ctx, wsPath);
	if (config.error) throw new Error(config.error);
	const server = config.servers.find((candidate) => candidate.name === serverName);
	if (!server) throw new Error(`项目配置里没有这个 MCP：${serverName}`);
	const entry = sharedConnBucket(ctx).get(connKeyOf(wsPath, serverName))?.entry;
	if (entry) await retireSharedConnection(ctx, entry);
	const result = await reconcileWorkspaceConnections(ctx, wsPath);
	// 空闲态必须在这里自己把连接建回来。reconcile 只对**存活会话**重跑挂载，所以
	// 「最后一个会话已结束、连接正处在空闲保留」这个状态（本功能特意制造出来的常态）下，
	// 它会拆掉旧连接而没有任何人来建新的 —— 面板显示「已重连」而连接其实没了。
	// 建起来后立刻把这份引用还回去：连接按空闲策略保留，下次会话直接用（与挂载路径同语义）。
	// disabled 的条目本来就不该有连接（挂载路径同样跳过），所以不为它建。
	if (!result.remounted && !server.disabled) {
		releaseSharedConnection(ctx, await acquireSharedConnection(ctx, wsPath, server));
	}
	// 字段名分开：reconcile 的 retired 是「被回收的 serverName 列表」，这里的 hadLiveConnection
	// 是「点重连之前是否真有一条活动连接」。混用同一个键名会让两个事实互相覆盖。
	return { serverName, hadLiveConnection: entry !== undefined, retired: result.retired, remounted: result.remounted };
}
// 获取（或新建）某 (wsPath, serverName) 的共享连接；refs 计数。只在首次挂载官方 mcp-client。
// 并发 acquire 共享同一份建连结果；释放中的条目等待 teardown 完成后才允许重建。
// 调用方必须把返回的引用交给 commitSharedConnection，否则就漏了一份。
async function acquireSharedConnection(ctx, wsPath, server) {
	const bucket = sharedConnBucket(ctx);
	const key = connKeyOf(wsPath, server.name);
	const clientConfig = toMcpClientConfig(server, wsPath);
	const configFingerprint = fingerprintOfConfig(clientConfig);
	while (true) {
		const cell = bucket.get(key);
		if (!cell) {
			// 建连 promise 先入表：并发 setup 的后续 acquire 命中 pending，共享同一份结果。
			const pending = createSharedConnection(ctx, wsPath, server, clientConfig, configFingerprint);
			const created = { pending };
			bucket.set(key, created);
			try {
				const entry = await pending;
				created.entry = entry; // 就绪：后续 acquire 直接复用
				entry.refs += 1;
				return entry;
			} catch (error) {
				if (bucket.get(key) === created) bucket.delete(key);
				throw error;
			}
		}
		if (cell.entry) {
			clearIdleRetire(cell.entry);
			cell.entry.refs += 1;
			return cell.entry;
		}
		if (cell.disposing) {
			// 释放中：等 teardown 完成（占位被删）后重新走循环新建，避免撞名。
			// disposing 本身就是「删除占位」那一步之后的 promise，所以等待者恢复时 cell 必已不在表中；
			// 多个等待者会收敛成「第一个新建、其余命中 pending」（新建者在首个 await 前已同步入表）。
			await cell.disposing;
			continue;
		}
		// 建连中：等待同一份结果，不再各自创建。恢复后必须确认这份 entry 没有在此期间被归零：
		// 创建者可能在提交点上失败（会话已销毁 / 插件已卸载）并把它释放掉。不校验就会把一份正在
		// teardown 的连接发给这个会话——它永远拿不到工具，面板也看不到任何错误。
		// （当前的微任务序恰好让这个窗口不发生，但那是隐式的、一次重构就会失效的保证。）
		const entry = await cell.pending;
		if (entry.released) continue;
		clearIdleRetire(entry);
		entry.refs += 1;
		return entry;
	}
}
// 连接的空闲回收策略：会话全部结束 ≠「不再需要这份连接」。
//   * MCP 规范里 session 的关闭时机是「客户端不再需要它（例如用户要离开客户端应用）」；
//     一次对话结束显然不是。
//   * 拆掉再建要重新付出握手 + tools/list 的成本，而「用的时候必须已经就绪」是本任务的硬约束；
//     频繁拆建还会让 stdio 服务器反复起停（社区里"重连一次泄漏一个进程"的那类问题）。
// 所以 refs 归零只**起一个空闲计时器**；真正拆除留给：配置删除/改动、面板重建、插件卸载，
// 或空闲超时。默认 5 分钟（与主流客户端的 stdio 空闲超时同量级）；0 = 永不自动回收。
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;
// 同一条策略的两个视角：配置里写的是什么（server）与这条连接当时快照下来的是什么（entry）。
function idleTimeoutOfServer(server) {
	return server.idleTimeoutMs === undefined ? DEFAULT_IDLE_TIMEOUT_MS : server.idleTimeoutMs;
}
function idleTimeoutOf(entry) {
	return entry.idleTimeoutMs === undefined ? DEFAULT_IDLE_TIMEOUT_MS : entry.idleTimeoutMs;
}
function clearIdleRetire(entry) {
	if (entry.idleTimer === undefined) return;
	clearTimeout(entry.idleTimer);
	entry.idleTimer = undefined;
}
function armIdleRetire(ctx, entry) {
	clearIdleRetire(entry);
	const timeoutMs = idleTimeoutOf(entry);
	if (timeoutMs <= 0) return;
	const timer = setTimeout(() => {
		entry.idleTimer = undefined;
		// 期间又被用上、或已被别的路径销毁：什么都不做。
		if (entry.refs > 0 || entry.released) return;
		Promise.resolve(retireSharedConnection(ctx, entry)).catch(() => {});
	}, timeoutMs);
	// 空闲计时器不替宿主把进程吊着（mcp-client 自己的重连计时器同理）。
	timer.unref?.();
	entry.idleTimer = timer;
}
// 归还一份引用（会话结束 / 投射撤回）：只减计数，归零则进入空闲等待，**不拆连接**。
// 返回值保持 undefined —— 没有 teardown 要交给 cordis 等，这也是「会话销毁不再等于连接销毁」。
function releaseSharedConnection(ctx, entry) {
	entry.refs -= 1;
	if (entry.refs > 0) return undefined;
	armIdleRetire(ctx, entry);
	return undefined;
}
// 立刻销毁一份连接：「不再有效」（配置删除/改动、面板重建、插件卸载），而不是「暂时没人用」。
// 返回 teardown promise，让调用方能把它交回 cordis：会话销毁/插件卸载不会早于 MCP 子进程关闭完成。
function retireSharedConnection(ctx, entry) {
	if (entry.released) return undefined;
	clearIdleRetire(entry);
	// 即刻标记：仍停在 `await cell.pending` 上的并发 acquire 据此放弃这份 entry 并重建，
	// 不会把 refs 从 0 再加回到一份正在 teardown 的连接上。
	entry.released = true;
	const bucket = sharedConnBucket(ctx);
	const cell = bucket.get(entry.key);
	const onError = (error) => { ctx.logger?.error?.(`mcp-manager: 项目 MCP ${entry.serverName} 连接释放失败: ${error?.message ?? error}`); };
	// scoped.dispose() 已由 dsh-scope 的 `disposing ??=` 与 cordis 的 runner.epoch 双重幂等守护。
	const beginDispose = () => { try { return entry.scoped.dispose(); } catch (error) { onError(error); return undefined; } };
	if (!cell || cell.entry !== entry) {
		// 该 entry 已不在桶内（HMR/异常路径）：直接释放，不留占位。
		return Promise.resolve(beginDispose()).catch(onError);
	}
	// 转为「释放中」占位：teardown 完成前不删除，期间的 acquire 会等待后重建。
	cell.entry = undefined;
	cell.pending = undefined;
	cell.disposing = Promise.resolve(beginDispose()).catch(onError).finally(() => {
		if (bucket.get(entry.key) === cell) bucket.delete(entry.key);
	});
	return cell.disposing;
}
// 「这条连接的配置是否已经过期」只有一个判定来源：`configFingerprintOf`（对实际下发给
// mcp-client 的配置取指纹）。挂载路径、配置对齐、面板行三处都问它，不各写一遍比较。
// 指纹求值失败（如 command 求值为空）时返回 false：那不是"配置变了"，交给建连路径抛真正的错误。
// **插件自己的策略也参与判定**：`idleTimeoutMs` 在建连时被快照进 entry，而它不在 mcp-client 的
// 配置里（特意不下发），所以只看指纹的话「只改空闲预算」会静默无效 —— 面板显示新值、实际用旧策略。
function isConfigStale(server, wsPath, entry) {
	const fingerprint = configFingerprintOf(server, wsPath);
	if (fingerprint !== undefined && fingerprint !== entry.configFingerprint) return true;
	return idleTimeoutOf(entry) !== idleTimeoutOfServer(server);
}
// 同一 (wsPath, serverName) 的配置变了：旧实现是「继续复用旧连接 + 告警 + 面板标 configStale，
// 等该项目所有会话结束才换新配置」。现在改为**就地重载** —— 依据是宿主自己的配置条目语义
// （mcp-client README："Editing the configuration entry reloads the server connection in place,
// and unchanged names stay unchanged"）：工具名是 (serverName, rawName) 的纯函数，重载后名字不变，
// 所以会话历史与权限规则不受影响；而"等所有会话结束"会让用户改了配置却看不到变化。
// 求值失败（如 command 求值为空）时不在这里动手：交给建连路径抛出真正的错误并记账。
async function retireStaleConnection(ctx, wsPath, server) {
	const entry = sharedConnBucket(ctx).get(connKeyOf(wsPath, server.name))?.entry;
	if (!entry || !isConfigStale(server, wsPath, entry)) return undefined;
	ctx.logger?.warn?.(`mcp-manager: 项目 MCP ${server.name} 的配置已变化，就地重载共享连接（工具名不变，会话无需重开）`);
	await retireSharedConnection(ctx, entry);
	return entry;
}
// 连接已从配置里移除：把指向它的会话投射整批撤掉（撤工具 + 摘索引 + 归还引用）。
// 与 repoint 的分工：repoint 处理「换了新连接」，这里处理「没有新连接可换」。
function dropConnectionSlots(ctx, entry) {
	const slotsByAgent = agentProjectSlotsByRoot.get(appRoot(ctx));
	if (!slotsByAgent) return 0;
	let dropped = 0;
	for (const slots of [...slotsByAgent.values()]) {
		const slot = slots.get(entry.key);
		if (!slot || slot.entry !== entry) continue;
		try { disposeProjectSlot(slot); } catch { /* noop */ }
		dropped += 1;
	}
	return dropped;
}
// 把一个会话槽位从旧连接搬到新连接：撤掉旧投射 → 改指 → **引用随所有权转移** → 重新投射。
// 这是唯一一处做这件事的地方：配置就地重载（repointConnectionSlots 批量搬）与提交时同键换连接
// （commitSharedConnection）都走它。以前这两处各写一遍记账、且写法不同，于是"按需重建"那条路径
// 谁都没走到，漏掉了同项目其他会话的槽位 —— 它们会一直指向已销毁的连接，永久读不到工具。
function moveSlotToConnection(ctx, slot, entry) {
	const previous = slot.entry;
	if (!previous || previous === entry || slot.disposed) return false;
	for (const { dispose } of slot.projected.values()) { try { dispose(); } catch { /* noop */ } }
	slot.projected.clear();
	slot.entry = entry;
	// 槽位原本持有旧连接的一份引用，那份额度随所有权转到新连接。
	entry.refs += 1;
	// 旧连接若还没被销毁（不是 retire 路径），这一份引用要还回去，否则它会永远不归零。
	if (!previous.released) releaseSharedConnection(ctx, previous);
	syncSessionProjectTools(ctx, slot);
	return true;
}
// 就地重载的关键一步：**所有**指向旧连接的会话槽位必须一起改指新连接并重新投射。
// 只改「正在提交的那个会话」是不够的：旧连接的 scope 一销毁，其余会话的投射就会读到空集，
// 随后 tools/change 的幂等重算会把它们的工具全部撤掉 —— 看起来就是「改个配置，别的会话反而没工具了」。
function repointConnectionSlots(ctx, previous, entry) {
	const slotsByAgent = agentProjectSlotsByRoot.get(appRoot(ctx));
	if (!slotsByAgent) return 0;
	let repointed = 0;
	// 遍历用快照：虽然当前 moveSlotToConnection 不动这张索引，但一边遍历一边被回调改索引
	// 是这类代码最容易踩的坑（dropConnectionSlots 同样用快照）。
	for (const slots of [...slotsByAgent.values()]) {
		const slot = slots.get(entry.key);
		if (!slot || slot.entry !== previous) continue;
		if (moveSlotToConnection(ctx, slot, entry)) repointed += 1;
	}
	return repointed;
}
// 配置 → 连接集的唯一同步点：**写盘之后**调用，把该项目对齐到新配置。
//   1. 配置里已不存在、或配置已变化的连接立刻 retire（不做空闲等待：它已经"不再有效"）；
//   2. 对每个存活会话重跑一次挂载（幂等）：缺的连上、换掉的重新投射、已有的当场归还多余引用。
// 会话不需要重开，也不需要等它结束 —— 这正是它与旧实现（写盘只落文件、等下一次 setup）的区别。
async function reconcileWorkspaceConnections(ctx, wsPath) {
	const generation = activeGenerationByRoot.get(appRoot(ctx));
	if (!generation?.active) return { retired: [], remounted: 0 };
	const config = await readWorkspaceConfigCached(ctx, wsPath);
	if (config.error) {
		ctx.logger?.warn?.(`mcp-manager: 项目配置无效，跳过连接对齐 ${wsPath}: ${config.error}`);
		return { retired: [], remounted: 0 };
	}
	const desired = new Map(config.servers.filter((server) => !server.disabled).map((server) => [server.name, server]));
	const retired = [];
	for (const cell of [...sharedConnBucket(ctx).values()]) {
		const entry = cell.entry;
		if (!entry || entry.wsPath !== wsPath) continue;
		const server = desired.get(entry.serverName);
		if (server) {
			// 配置变了：重载。槽位不由这里处理 —— 随后的重跑挂载会 repoint 到新连接上
			//（那时才知道新连接是谁），所以这里只销毁旧连接。
			if (!isConfigStale(server, wsPath, entry)) continue;
			retired.push(entry.serverName);
			await retireSharedConnection(ctx, entry);
			continue;
		}
		// 配置里已经没有这个 server：连接立刻销毁，**并且**把指向它的会话投射一起撤掉。
		// 只销毁连接会留下「指向已销毁连接」的僵尸工具（调用必失败，但模型仍看得见）。
		retired.push(entry.serverName);
		await retireSharedConnection(ctx, entry);
		dropConnectionSlots(ctx, entry);
	}
	let remounted = 0;
	for (const [agent, state] of [...agentWorkspaceStates]) {
		if (state.root !== appRoot(ctx) || state.wsPath !== wsPath) continue;
		// 不在这里等就绪：这些会话已经活着，没有"首轮"要保护；等就绪只会让写盘阻塞，
		// 而工具会在连接就绪后由 tools/change 补投射。
		await mountProjectMcpForAgent(ctx, agent, generation, { awaitReady: false });
		remounted += 1;
	}
	return { retired, remounted };
}
function agentSlotIndex(ctx, agent) {
	const slotsByAgent = bucketOf(agentProjectSlotsByRoot, ctx);
	let slots = slotsByAgent.get(agent);
	if (!slots) { slots = new Map(); slotsByAgent.set(agent, slots); }
	return slots;
}
// 把刚拿到的引用交给 cordis：所有权唯一落在会话作用域的一个 effect 上（见文件上方「引用所有权」）。
// 两种不能接管的情形各用自己的凭据判定，不再共用一张表：
//   * 本代装饰器已被 HMR 卸载 → generation.active（这是插件代次的属性，不是会话的属性）；
//   * 会话作用域已销毁       → agentCtx.effect() 的 assertActive()（cordis 的职责，不自建）。
// effect() 本身是原子的：抛出时它没有登记任何 disposable，我们仍持有唯一的一份引用，直接归还；
// 成功时归还已经不可能丢。因此不再需要「从检查到记账之间不得有 await」这类只能靠注释约束的临界区。
function commitSharedConnection(ctx, agentCtx, agent, entry, generation) {
	if (!generation.active) {
		// 插件已卸载：这份连接不可能再被本代复用，直接销毁而不是进入空闲等待。
		void retireSharedConnection(ctx, entry);
		ctx.logger?.warn?.(`mcp-manager: 插件已卸载，放弃接管项目 MCP ${entry.serverName} 的共享连接引用`);
		return null;
	}
	const slots = agentSlotIndex(ctx, agent);
	const existing = slots.get(entry.key);
	if (existing) {
		if (existing.entry === entry) {
			// 同一会话对同一 connKey 重复 acquire：多出的引用当场归还，不积压。
			void releaseSharedConnection(ctx, entry);
			return existing;
		}
		// 同一 connKey 换了新连接（配置就地重载 / 按需重建）：走同一个搬运函数。
		moveSlotToConnection(ctx, existing, entry);
		// 槽位现在用的是"转移来的"那份额度，所以这次 acquire 多拿的一份要还掉。
		void releaseSharedConnection(ctx, entry);
		return existing;
	}
	const slot = {
		key: entry.key, entry, ctx, agentCtx, agent,
		// projected 是「当前投射出去的东西」，同时记住每个名字用的是哪一版定义（身份对账）。
		projected: new Map(),
		release: undefined, disposed: false,
	};
	try {
		slot.release = agentCtx.effect(() => () => disposeProjectSlot(slot), `mcp-manager.projectConn(${entry.serverName})`);
	} catch (error) {
		void releaseSharedConnection(ctx, entry);
		ctx.logger?.warn?.(`mcp-manager: 会话在项目 MCP ${entry.serverName} 建连期间已结束，已归还共享连接引用: ${error?.message ?? error}`);
		return null;
	}
	slots.set(entry.key, slot);
	return slot;
}
// 撤回一个 slot：撤投射 → 从遍历索引摘除 → 归还引用。返回 teardown promise 供 cordis 等待。
// 幂等由自身 disposed 标志与 cordis effect wrapper 的 runner.epoch 双重保证。
function disposeProjectSlot(slot) {
	if (slot.disposed) return undefined;
	slot.disposed = true;
	for (const { dispose } of slot.projected.values()) { try { dispose(); } catch { /* noop */ } }
	slot.projected.clear();
	const slotsByAgent = agentProjectSlotsByRoot.get(appRoot(slot.ctx));
	const slots = slotsByAgent?.get(slot.agent);
	if (slots?.get(slot.key) === slot) {
		slots.delete(slot.key);
		if (!slots.size) slotsByAgent.delete(slot.agent);
	}
	// 默认只归还引用（连接进入空闲等待）；插件卸载这类「没人会再复用」的场合由调用方标记 retire。
	return slot.retireOnDispose === true
		? retireSharedConnection(slot.ctx, slot.entry)
		: releaseSharedConnection(slot.ctx, slot.entry);
}
// 把某共享连接当前注册出的工具定义投射进该会话自己的 own 层；工具增减时幂等重算。
// register() 自身会**同步**派发 tools/change（dsh-scope 的 ScopedLayers.onChange 是同步 emit），
// 所以每注册一个工具都会同步再排一轮重算。这里不抑制那批事件（见 reconcileSessionProjectTools），
// 靠的是本条重算的**幂等性**：注册项在 register 返回后立刻落进 projected，重入的一轮因此在哨兵
// 处短路，不会对同一个名字再注册一次。
function syncSessionProjectTools(ctx, slot) {
	if (slot.disposed) return;
	const { entry, agentCtx } = slot;
	const tools = toolsServiceOf(ctx);
	const agentTools = agentCtx.tools;
	if (!tools || !agentTools || typeof agentTools.register !== "function") return;
	const present = new Set();
	let failed = false;
	// 与面板读同一份判定（含归属过滤与作用域故障记账），不另写一套「读空就当没有工具」的启发式。
	const read = readConnectionTools(ctx, entry);
	// 读不到 ≠ 没有工具：读取失败时本轮不增不删，只把原因留在诊断通道里。否则一次宿主视图抖动就会
	// 把会话已注册的项目工具全部 dispose()，等下一轮 tools/change 再装回来 —— 用户看到的是工具时灵时不灵。
	if (read.failed) return;
	// 按名字对账之外还要按**定义身份**对账：重连/就地重载会换一批新定义，旧的那批指向已经关掉的
	// client，只按名字跳过就会把死工具留在会话里。
	for (const [name, def] of read.definitions) {
		present.add(name);
		const projected = slot.projected.get(name);
		if (projected !== undefined && projected.definition === def) continue;
		try {
			// 先撤旧定义再注册新定义（同一层里同名不能并存）。
			if (projected !== undefined) {
				slot.projected.delete(name);
				try { projected.dispose(); } catch { /* noop */ }
			}
			const dispose = agentTools.register(def);
			slot.projected.set(name, { definition: def, dispose });
		} catch (error) {
			failed = true;
			recordWorkspaceMountError(ctx, entry.wsPath, entry.serverName, error);
			ctx.logger?.warn?.(`mcp-manager: 项目 MCP ${entry.serverName} 工具 ${name} 注册失败: ${error?.message ?? error}`);
		}
	}
	// 只在本轮全部成功、且确实拿到了工具时才清除失败记录。放在循环里清会让前一个工具刚记下的
	// 失败被后一个工具的成功抹掉，于是面板看起来一切正常而会话实际缺工具。
	if (!failed && slot.projected.size) clearWorkspaceMountError(entry.wsPath, entry.serverName);
	// 撤掉已从共享连接消失的工具（服务器 tools/list_changed 或断连）。
	for (const [name, projected] of slot.projected) {
		if (present.has(name)) continue;
		try { projected.dispose(); } catch { /* noop */ }
		slot.projected.delete(name);
	}
}
// 撤回某 app root 下所有存活会话的项目工具投射并释放引用（插件 HMR/卸载时调用）。
// 不撤的话，运行中会话的工具定义仍指向已被销毁的共享连接（僵尸工具）。
// 走每个 slot 自己的 cordis disposer（官方幂等），于是会话之后正常销毁时不会重复释放。
function disposeAllProjectSlots(ctx) {
	const slotsByAgent = agentProjectSlotsByRoot.get(appRoot(ctx));
	const pending = [];
	if (slotsByAgent) {
		for (const slots of [...slotsByAgent.values()]) {
			for (const slot of [...slots.values()]) {
				try {
					// 插件卸载：本模块即将消失，没有谁会再来复用这些连接 —— 立刻销毁，而不是进入空闲等待。
					slot.retireOnDispose = true;
					const settled = typeof slot.release === "function" ? slot.release() : disposeProjectSlot(slot);
					if (settled) pending.push(Promise.resolve(settled));
				} catch (error) {
					ctx.logger?.error?.(`mcp-manager: 撤回项目 MCP ${slot.entry.serverName} 的会话投射失败: ${error?.message ?? error}`);
				}
			}
		}
	}
	// **没有会话持有**的连接（refs=0 的空闲保留态）在上面那条路里一个 slot 都没有，因此必须
	// 在这里单独收掉 —— 它是本功能特意制造出来的常态（最后一个会话结束 = 连接留着待用）。
	// 漏掉它的后果不是"多留一会儿"：模块级 bucket 会留在进程里，而这条 entry 的 fiber 已经随
	// 插件 fiber 一起被销毁（作用域 fiber 挂在插件 fiber 下），`released` 却仍是 false。
	// 于是 HMR 重装后的 acquire 会命中 `if (cell.entry)` 把这条**已死**的连接发给新会话
	//（fiber 已终态、零工具），而且它永远不会再被回收。所以卸载路径必须按 bucket 兜底。
	for (const cell of [...sharedConnBucket(ctx).values()]) {
		const entry = cell.entry;
		if (!entry || entry.refs > 0) continue;
		try {
			const settled = retireSharedConnection(ctx, entry);
			if (settled) pending.push(Promise.resolve(settled));
		} catch (error) {
			ctx.logger?.error?.(`mcp-manager: 卸载时销毁空闲连接 ${entry.serverName} 失败: ${error?.message ?? error}`);
		}
	}
	return pending.length ? Promise.all(pending) : undefined;
}
// 项目 MCP 是一份长驻共享连接，Host 侧可以枚举它的真实连接态（与全局 MCP 一致）：
// 该 (wsPath, serverName) 的共享作用域里注册了多少个工具、当前有几个会话在用。
// 未建连/建连中/释放中（refs 均为 0，即尚无会话持有）时 mounted=false。
// 传入 server 而不是 serverName：还要拿当前配置与建连时的指纹对比（同一个 isConfigStale），
// 好让诊断视图能如实说出「这条连接是旧配置建的」。注意它现在只是**瞬时**状态：写盘路径会立刻
// 就地重载，所以正常情况下它一直是 false；留着它是为了在重载失败/未及重载时仍能看出差异。
// phase 直接取 cordis fiber 的状态代号，交给 mcp-observability 的 deriveMcpPhase 判定——
// 项目行因此和全局行走同一套规则、同一个真相源，而不是再写一套日志启发式。
function workspaceConnectionStatus(ctx, wsPath, server) {
	const entry = sharedConnections.get(appRoot(ctx))?.get(connKeyOf(wsPath, server.name))?.entry;
	const duplicateOwners = duplicateServerNameOwners(ctx, wsPath, server.name);
	if (!entry) return { mounted: false, schemas: [], refs: 0, configStale: false, fiberState: undefined, duplicateOwners, scopeError: workspaceScopeErrorOf(wsPath, server.name) };
	const read = readScopedToolSchemas(ctx, entry);
	return {
		mounted: true,
		schemas: read.schemas,
		refs: entry.refs,
		configStale: isConfigStale(server, wsPath, entry),
		fiberState: entry.fiber?.state,
		duplicateOwners,
		scopeError: read.error,
	};
}
function workspaceScopeErrorOf(wsPath, serverName) {
	return workspaceScopeErrors.get(wsPath)?.get(serverName) ?? "";
}
// 跨连接的只读诊断视图。面板每行只看得见自己那一格（某项目某 server 的 refs 与失败原因），
// 看不到进程级的事实：一共有几条共享连接、有没有 refs 卡住不归零的僵尸。模块级表按 app root
// 分桶（WeakMap 本身不可枚举），但桶内是普通 Map，所以按 root 枚举可行，且这条路径全程只读，
// 不 acquire、不 release、不碰 fiber。
// 三种 cell 状态都如实出现：卡在建连中/释放中恰恰是最需要排障的形态，过滤掉就等于看不见。
// refs 与 sessions 分开给而不合成一个「健康」布尔：健康时两者相等；refs > sessions 就是漏了
// 引用（会话已销毁但引用没归还 → 连接永不释放，配置也永远刷不新），判定留给读的人。
async function projectConnectionsView(ctx) {
	const bucket = sharedConnections.get(appRoot(ctx));
	if (!bucket) return [];
	const rows = [];
	for (const [key, cell] of [...bucket]) {
		const separator = key.indexOf("\u0000");
		const wsPath = key.slice(0, separator);
		const serverName = key.slice(separator + 1);
		const base = {
			wsPath,
			serverName,
			sessions: sessionSlotCount(ctx, key),
			duplicateOwners: duplicateServerNameOwners(ctx, wsPath, serverName),
		};
		const entry = cell.entry;
		if (!entry) {
			// 还没有 entry：要么在建连，要么在释放。两者都没有连接态可读，configStale 无从判定。
			rows.push({ ...base, state: cell.disposing ? "disposing" : "connecting", refs: 0, toolCount: 0, fiberState: undefined, configStale: null, configError: "", scopeError: workspaceScopeErrorOf(wsPath, serverName) });
			continue;
		}
		// configStale 与 toolCount 走面板那条同一个判定（workspaceConnectionStatus），不另写一套
		// 指纹比较——两套判定迟早会对同一条连接给出两种说法。
		const current = await currentServerSpec(ctx, wsPath, serverName);
		const status = current.server ? workspaceConnectionStatus(ctx, wsPath, current.server) : null;
		rows.push({
			...base,
			state: entry.released ? "disposing" : "ready",
			refs: entry.refs,
			// 空闲回收策略与当前是否处于空闲等待：面板据此区分「没人用但连接还在」与「连接没了」。
			idleTimeoutMs: idleTimeoutOf(entry),
			idle: entry.refs === 0 && entry.idleTimer !== undefined,
			toolCount: (status ? status.schemas : projectToolSchemasOf(ctx, entry)).length,
			fiberState: entry.fiber?.state,
			// 配置里已经没有这个 server（刚被移除），或读配置失败 → 无从判定，给 null 并带上原因，
			// 不伪造一个 false 说「配置没变」。
			configStale: status ? status.configStale : null,
			configError: current.error,
			scopeError: status ? status.scopeError : workspaceScopeErrorOf(wsPath, serverName),
		});
	}
	return rows;
}
// 某 connKey 当前被多少个存活会话持有（遍历索引即事实来源：每个 slot 就是一个会话的投射）。
function sessionSlotCount(ctx, key) {
	const slotsByAgent = agentProjectSlotsByRoot.get(appRoot(ctx));
	if (!slotsByAgent) return 0;
	let count = 0;
	for (const slots of slotsByAgent.values()) if (slots.has(key)) count += 1;
	return count;
}
// 该项目当前磁盘配置里的这个 server（诊断视图专用）。读失败原样带回给调用方，不吞。
async function currentServerSpec(ctx, wsPath, serverName) {
	try {
		const config = await readWorkspaceConfigCached(ctx, wsPath);
		return { server: config.servers.find((server) => server.name === serverName), error: config.error || "" };
	} catch (error) {
		return { server: undefined, error: error?.message ?? String(error) };
	}
}
// 同一 app 内还有哪些项目在用这个 serverName。DSH 0.1.5 起这不是冲突（官方按注册作用域
// 判重，跨作用域同名合法），所以它是一条诊断事实而不是拦截条件；更早的宿主按全进程唯一
// 判定，同名才会真的启动失败——那时「和谁同名」就是根因，值得摆到面板上。
function duplicateServerNameOwners(ctx, wsPath, serverName) {
	const bucket = sharedConnections.get(appRoot(ctx));
	if (!bucket) return [];
	const owners = [];
	for (const cell of bucket.values()) {
		const entry = cell.entry;
		if (entry && entry.serverName === serverName && entry.wsPath !== wsPath) owners.push(entry.wsPath);
	}
	return owners;
}
// 某共享连接当前真实注册出的工具。它们在共享作用域层里，全局视图看不到，所以必须按 scopeKey 读 ——
// 这也是面板能枚举项目 MCP 工具的唯一通路（mcp-registry.toolInventory 只认 loader 条目 + 全局视图）。
// 读法只用宿主公开面：`schemas(scope)` 一次拿名字（全量深拷贝，只在换代时付），`get(name, scope)`
// 逐个拿定义；稳态靠「代次哨兵」短路，见 readConnectionTools。`view()`/`schemaOf()` 是宿主私有方法，
// 插件不碰。
// 读取这里有两种失败，都不得静默：
//   1. 宿主视图抛错：契约变化或服务不可用——记下原因，不把空集当成「这个服务器没有工具」；
//   2. 工具落到了全局层：@deepseek-ai/dsh-scope 在宿主与插件之间解析成了两份模块实例，
//      作用域标签认不出来。这是真故障：工具会对所有会话、所有项目可见（隔离失效），
//      而按 scopeKey 读会**退回全局层**把它们读出来，于是面板显示「已连接 N 工具」——
//      比读空集隐蔽得多。所以判定必须直接对比全局视图：同名前缀的工具出现在全局视图里，
//      就说明它们不属于本作用域。
// 判定只在「没有同名全局条目、也没有其他项目同名」时成立，否则无法与「别人的同名实例
// 本来就在全局视图里」区分，此时宁可不断言。每个连接只判定一次（结论缓存在 entry 上），
// 面板每 5s 轮询因此不重复付这笔开销。
// ---- 连接工具视图：一次读 + 按「代次哨兵」失效 ----
// 宿主公开读面只有 `get(name, scope)` 与 `schemas(scope)`：前者每次重建整张表，后者对每个工具的
// parameters 深拷贝。所以这里不「每次事件全量重读」，而是缓存每条连接的 {定义, 哨兵}，用**一个
// 哨兵定义的对象身份**判断代次：mcp-client 每次 tools/list 变化都整批重建定义（connection.ts 的
// generation：先 dispose 旧代再 register 新代），所以「哨兵换人」⇔「这条连接的工具集可能变了」；
// 没换就零读取。新建会话、无关事件、我们自己的投射都不再读工具表 —— 开销与工具数无关。
// 它同时修掉一个真缺陷：重连 / 就地重载后定义对象会换新，只按名字对账会把**旧定义**留在会话层，
// 那些工具调用会打到已经关掉的 client 上。
function toolCacheOf(entry) {
	if (entry.toolCache === undefined) entry.toolCache = { sentinel: undefined, definitions: new Map(), checkedEpoch: undefined };
	return entry.toolCache;
}
// 缓存命中的唯一形状：名字就是 definitions 的键，不再单独存一份（两份表示迟早漂移）。
function cachedConnectionTools(ctx, entry, cache) {
	return { definitions: cache.definitions, error: settleScopeRead(ctx, entry, cache.definitions.size), failed: false };
}
function scopeReadFailed(ctx, entry, cache, error) {
	const message = `读取作用域工具视图失败：${error?.message ?? error}`;
	recordWorkspaceScopeError(ctx, entry.wsPath, entry.serverName, message);
	return { definitions: cache.definitions, error: message, failed: true };
}
function readConnectionTools(ctx, entry) {
	const tools = toolsServiceOf(ctx);
	const cache = toolCacheOf(entry);
	if (!tools) return { definitions: cache.definitions, error: "", failed: false };
	// 空连接躲开哨兵：没有工具就没有哨兵可读，而 `schemas(scope)` 会把**全局层**整个深拷贝一遍。
	// 一轮合并事件里每条连接只探一次就够（同一轮里没有第二次变更）；下一轮会重新探。
	if (cache.sentinel === undefined && cache.checkedEpoch === toolsEpoch) return cachedConnectionTools(ctx, entry, cache);
	// 代次哨兵：一次 `get()`（公开 API，本身就是一次整表重建，但只有它这一次）。
	if (cache.sentinel !== undefined) {
		let current;
		try {
			current = tools.get(cache.sentinel, entry.scopeKey);
		} catch (error) {
			return scopeReadFailed(ctx, entry, cache, error);
		}
		if (current !== undefined && current === cache.definitions.get(cache.sentinel)) return cachedConnectionTools(ctx, entry, cache);
	}
	try {
		const prefix = `mcp__${entry.serverName}__`;
		const names = dropForeignNames(ctx, entry, (tools.schemas(entry.scopeKey) || [])
			.map((schema) => schema.name)
			.filter((name) => name.startsWith(prefix)));
		const definitions = new Map();
		for (const name of names) {
			const definition = tools.get(name, entry.scopeKey);
			if (definition !== undefined) definitions.set(name, definition);
		}
		cache.definitions = definitions;
		// 哨兵 = 第一个工具的定义身份；空集则没有哨兵（退到上面那条 checkedEpoch 的判定）。
		cache.sentinel = definitions.keys().next().value;
		cache.checkedEpoch = toolsEpoch;
		return { definitions, error: settleScopeRead(ctx, entry, definitions.size), failed: false };
	} catch (error) {
		return scopeReadFailed(ctx, entry, cache, error);
	}
}
// 前缀不等于归属：`schemas(scope)` 是「全局层 + 作用域链」的**合并**视图，所以同名实例（全局条目，
// 或另一份 mcp-client）的工具也带同样前缀。只有存在同名实例时才需要判定 —— 合并视图对同一个工具
// 返回同一个对象，身份相同即「不是本连接注册的」；非同名时（常态）零额外开销。这是罕见路径，
// 逐个全局 `get()` 的代价只在这里付。
function dropForeignNames(ctx, entry, names) {
	if (!names.length) return names;
	if (!entriesForName(ctx, entry.serverName).length
		&& !duplicateServerNameOwners(ctx, entry.wsPath, entry.serverName).length) return names;
	const tools = toolsServiceOf(ctx);
	return names.filter((name) => tools.get(name) !== tools.get(name, entry.scopeKey));
}
// 一次读取的收支，两种投影共用：记「这条连接曾经有工具」，并按作用域隔离结论写/清诊断。
// 分成一处，是因为「谁负责清掉旧错误」散成两份时，总有一份会在新路径上被忘掉。
function settleScopeRead(ctx, entry, count) {
	const verdict = scopeVerdict(ctx, entry);
	// 记下"这条连接曾经有工具"：终态判定（isDeadConnection）靠它区分「重连耗尽把工具注销了」
	// 与「这个服务器本来就没有工具」——后者不该被反复重建。
	if (count > 0) entry.hadTools = true;
	if (!verdict) {
		clearWorkspaceScopeError(entry.wsPath, entry.serverName);
		return "";
	}
	recordWorkspaceScopeError(ctx, entry.wsPath, entry.serverName, verdict);
	return verdict;
}
// 面板路径（5s 轮询）：要的是 schema 字段（详情里的 parameters），公开面只有 `schemas(scope)` 能给。
// 名字与定义走缓存（哨兵短路），深拷贝的代价留在这条 5s 一次的路上，不进事件链。
function readScopedToolSchemas(ctx, entry) {
	const tools = toolsServiceOf(ctx);
	const prefix = `mcp__${entry.serverName}__`;
	let schemas;
	try {
		schemas = (tools?.schemas(entry.scopeKey) || []).filter((schema) => schema.name.startsWith(prefix));
	} catch (error) {
		const message = `读取作用域工具视图失败：${error?.message ?? error}`;
		recordWorkspaceScopeError(ctx, entry.wsPath, entry.serverName, message);
		return { schemas: [], error: message };
	}
	const read = readConnectionTools(ctx, entry);
	if (read.failed) return { schemas: [], error: read.error };
	// 同名实例存在时 `schemas` 会多出别人的工具：按缓存里的归属结果过滤（常态下两者等长）。
	if (read.definitions.size !== schemas.length) {
		const owned = new Set(read.definitions.keys());
		schemas = schemas.filter((schema) => owned.has(schema.name));
	}
	return { schemas, error: read.error };
}
// 某连接的「作用域是否真的隔离」结论，每个连接只算一次（undefined = 还没定论）。
// 文案只在这里成形一次（行、详情、面板横幅读的都是它），措辞按"用户要做什么"来写：
// 先说后果（这批工具对所有项目可见），再说原因（安装树里 dsh-scope 有多份），最后说修法。
function scopeVerdict(ctx, entry) {
	if (entry.scopeVerdict !== undefined) return entry.scopeVerdict;
	// 建连没结束之前定不了：工具还没注册完，此时全局视图里本来就不应该有它们。
	if (entry.fiber?.state !== FIBER_ACTIVE) return undefined;
	const leaked = leakedGlobalToolNames(ctx, entry);
	entry.scopeVerdict = leaked.length
		? `这批工具对所有项目的会话都可见（它们出现在了全局层：${leaked.slice(0, 3).join("、")}${leaked.length > 3 ? " 等" : ""}）：这台机器的 DSH 安装里 @deepseek-ai/dsh-scope 有多份模块实例，作用域标签互不相认，项目之间因此无法隔离。把安装树收成一份即可（重装该 profile，或清掉多余的 dsh-scope 副本）`
		: "";
	return entry.scopeVerdict;
}
// 全局视图里出现了本 serverName 的工具——只在不存在同名实例时可判定。
function leakedGlobalToolNames(ctx, entry) {
	const name = entry.serverName;
	if (entriesForName(ctx, name).length) return [];
	if (duplicateServerNameOwners(ctx, entry.wsPath, name).length) return [];
	const tools = toolsServiceOf(ctx);
	const prefix = `mcp__${name}__`;
	// 读不出来就不下结论（返回空 = 不断言），而不是把它当成「没有泄漏」。
	if (!tools) return [];
	// 读不出来就不下结论（返回空 = 不断言），而不是把它当成「没有泄漏」。这条结论每个连接只算一次
	// （scopeVerdict 缓存），`schemas()` 的深拷贝也只在这里付一次。
	try { return (tools.schemas() || []).map((schema) => schema.name).filter((name) => name.startsWith(prefix)); } catch { return []; }
}
function projectToolSchemasOf(ctx, entry) {
	return readScopedToolSchemas(ctx, entry).schemas;
}
// 枚举某项目 MCP 当前的工具（面板详情用）。优先按 (wsPath, serverName) 精确定位：serverName
// 的全 app 唯一性只在保存路径被校验，手工编辑 `.dsh/mcp.json` 能造出两个项目同名，按名字扫描
// 就会把另一个项目的工具显示到这里。wsPath 缺省时退回按名字取首个匹配（全局条目的调用方没有 wsPath）。
function workspaceToolSchemas(ctx, serverName, wsPath) {
	const bucket = sharedConnections.get(appRoot(ctx));
	if (!bucket) return [];
	if (wsPath) {
		const entry = bucket.get(connKeyOf(wsPath, serverName))?.entry;
		return entry ? projectToolSchemasOf(ctx, entry) : [];
	}
	for (const cell of bucket.values()) {
		if (cell.entry?.serverName === serverName) return projectToolSchemasOf(ctx, cell.entry);
	}
	return [];
}

function workspaceCacheGet(ctx, wsPath) { return workspaceConfigCache.get(appRoot(ctx))?.get(wsPath); }
function workspaceCacheSet(ctx, wsPath, entry) {
	const bucket = bucketOf(workspaceConfigCache, ctx);
	if (bucket.size >= WORKSPACE_CACHE_LIMIT && !bucket.has(wsPath)) bucket.delete(bucket.keys().next().value);
	bucket.set(wsPath, entry);
}
function workspaceCacheDelete(ctx, wsPath) {
	workspaceConfigCache.get(appRoot(ctx))?.delete(wsPath);
}
function withWorkspaceWrite(wsPath, operation) {
	const state = workspaceWriteEntry(wsPath);
	const run = async () => operation();
	const current = state.queue.then(run, run);
	state.queue = current.catch(() => {});
	return current;
}
// 「和谁同名」：官方 mcp-client 把一个 serverName 当**注册作用域内**唯一的登记名，占用时的错误
// 原文只说 "already in use"，不说被谁占。处置所需的唯一线索就在这里补齐——全局条目（同一个
// serverName 也可能挂在全局层），以及其他项目里已经建了连接的同名条目。
// 它是诊断而不是拦截：0.1.5 起跨作用域同名合法，这条补充只在真出现占用时才有内容。
function nameOwnersOf(ctx, wsPath, serverName) {
	const owners = [];
	if (entriesForName(ctx, serverName).length) owners.push("全局 MCP");
	for (const path of duplicateServerNameOwners(ctx, wsPath, serverName)) owners.push(`项目 ${path}`);
	return owners;
}
const SERVER_NAME_IN_USE = /is already in use/;
// 走到这里说明"一条连接一份 serverName"没成立——而这条不变量本该由结构保证（连接自己的作用域
// 标签，标签认不出来时回退到连接自己的 root，见 createSharedConnection）。所以这条占用本身就能
// 定位到宿主侧：该宿主没有按注册作用域判重（依赖树里 @deepseek-ai/dsh-scope 有两份实例，或
// mcp-client 更早的版本把注册表挂在全进程）。这两条都要用户去核对环境，不是改 MCP 配置能解决的。
const SERVER_NAME_IN_USE_ROOT_CAUSE = "官方按注册作用域判 serverName 唯一性、跨作用域同名合法，而本插件给每条连接一个独有的判重键，所以出现这条占用只能是该宿主没有按注册作用域判重：请核对依赖树里 @deepseek-ai/dsh-scope 是否被解析成了多份实例，以及 DSH 版本";
// 挂载失败的可观测记录：**唯一**成形挂载失败文本的地方。
// 官方 fiber 拒绝时抛出的原始错误是唯一的事实来源，所以默认原样记录——换成我们自己的措辞
// （曾经的「共享连接启动失败（fiber 4）」）等于把用户和维护者都需要的线索丢掉：面板上只剩
// 一句没有原因的话，谁都无法处置。只有确实拿不到原因时，调用方才传兜底错误进来。
function recordWorkspaceMountError(ctx, wsPath, serverName, error) {
	const message = error?.message ?? String(error);
	const owners = SERVER_NAME_IN_USE.test(message) ? nameOwnersOf(ctx, wsPath, serverName) : [];
	let byServer = workspaceMountErrors.get(wsPath);
	if (!byServer) { byServer = new Map(); workspaceMountErrors.set(wsPath, byServer); }
	byServer.set(serverName, owners.length
		? `${message}（同名条目：${owners.join("、")}）—— ${SERVER_NAME_IN_USE_ROOT_CAUSE}`
		: message);
}
function clearWorkspaceMountError(wsPath, serverName) {
	const byServer = workspaceMountErrors.get(wsPath);
	if (!byServer) return;
	byServer.delete(serverName);
	if (!byServer.size) workspaceMountErrors.delete(wsPath);
}
function workspaceMountErrorsView(wsPath) {
	const byServer = workspaceMountErrors.get(wsPath);
	if (!byServer) return [];
	return [...byServer.entries()].map(([serverName, error]) => ({ serverName, error }));
}
// 作用域故障与挂载失败并列但分开：挂载失败是本插件在 setup 阶段就挂不上，作用域故障是
// 「挂上了但工具不在共享作用域层」——两者的处置完全不同（看 DSH 依赖树 vs 看 MCP 配置）。
function recordWorkspaceScopeError(ctx, wsPath, serverName, message) {
	let byServer = workspaceScopeErrors.get(wsPath);
	if (!byServer) { byServer = new Map(); workspaceScopeErrors.set(wsPath, byServer); }
	byServer.set(serverName, message);
	warnDiagnosticOnce(ctx?.logger, `scope:${wsPath}\u0000${serverName}`, `mcp-manager: 项目 MCP ${serverName} 的作用域工具视图不可用：${message}`);
}
function clearWorkspaceScopeError(wsPath, serverName) {
	const byServer = workspaceScopeErrors.get(wsPath);
	if (!byServer) return;
	byServer.delete(serverName);
	if (!byServer.size) workspaceScopeErrors.delete(wsPath);
}
function workspaceScopeErrorsView(wsPath) {
	const byServer = workspaceScopeErrors.get(wsPath);
	if (!byServer) return [];
	return [...byServer.entries()].map(([serverName, error]) => ({ serverName, error }));
}
// restrict 失败此前只写进一个读不到的 logger，等于静默失败：用户点了屏蔽却毫无反馈，
// 也无从判断是没生效还是宿主拒绝。与挂载失败同样记为可观测状态。
function recordWorkspaceRestrictError(wsPath, deny, error) {
	workspaceRestrictErrors.set(wsPath, { deny, error: error?.message ?? String(error), ts: Date.now() });
}
function clearWorkspaceRestrictError(wsPath) {
	workspaceRestrictErrors.delete(wsPath);
}
function workspaceRestrictErrorView(wsPath) {
	return workspaceRestrictErrors.get(wsPath) ?? null;
}
// 该项目当前有多少个会话持有项目作用域。共享连接下它不再是“撞名”的诊断线索（已不可能
// 撞名），而是告知面板「这份连接当前被几个会话共用、何时会释放」——也就是配置何时才能生效。
// 按 wsPath 统计而不区分 app root：与 mountErrors 一致，诊断对象是项目目录本身。
function liveWorkspaceAgentCount(wsPath) {
	let count = 0;
	for (const state of agentWorkspaceStates.values()) if (state.wsPath === wsPath) count += 1;
	return count;
}

function canonicalWorkspacePath(path) {
	try { return realpathSync(path); } catch { return path; }
}
function workspaceRegistryOf(ctx) {
	const get = typeof ctx.get === "function" ? ctx.get.bind(ctx) : null;
	const registry = get && get("workspaceRegistry");
	return registry && typeof registry.list === "function" ? registry : null;
}
async function listWorkspaceRecords(ctx) {
	const registry = workspaceRegistryOf(ctx);
	if (!registry) return [];
	try { return registry.list() || []; }
	catch (error) {
		warnDiagnosticOnce(ctx?.logger, "workspaceRegistry.list()", `mcp-manager: 读取工作区注册表失败，项目标签页会显示为空：${error?.message ?? error}`);
		return [];
	}
}
// 与 listWorkspaceRecords 同一份数据，但**如实抛出**读不到的情况：清单页把"读失败"降级成空列表是
// 为了面板不整片报错，而写路径要的是准确结论——把"读不到"当成"没注册"，会对一个已经打开的工作区
// 说"请先去打开它一次"。注册表访问只在这里表达（`workspaceRegistryOf` 是低层取用，这里是它的
// 抛出式投影），新增调用点不再各写一遍 `ctx.get("workspaceRegistry")`。
function registeredWorkspacePaths(ctx) {
	const registry = workspaceRegistryOf(ctx);
	if (!registry) throw new Error("当前宿主没有提供工作区注册表，无法确认目标工作区");
	let records;
	try { records = registry.list() || []; }
	catch (error) { throw new Error(`读取工作区注册表失败，无法确认目标工作区：${error?.message ?? error}`); }
	return records.map((record) => canonicalWorkspacePath(String(record.path ?? "")));
}
// 「本插件只写自己认识的工作区」这条不变量在这里表达**一次**。写一个工作区的配置与读一个目录的
// 配置不是同一件事：只按 canonical 路径写，等于把「往任意目录写 `.dsh/mcp.json`」暴露给浏览器，
// 而那是与「读任意文件」完全不同量级的能力。
function assertRegisteredWorkspace(ctx, wsPath) {
	if (!registeredWorkspacePaths(ctx).includes(wsPath)) throw new Error("目标工作区不在已注册的工作区列表里：请先在 DSH 中打开它一次");
}
// 所有会落盘 <工作区>/.dsh/mcp.json 的 Remote 的唯一入口（`withWorkspaceWrite` 留在模块内，
// 不再对外导出——它是串行化本身，不构成对"能写哪里"的授权）。校验放在排队之前：未注册的路径
// 连队列都不该进（也省得为一个不存在的目标建一条写队列）。
function withRegisteredWorkspaceWrite(ctx, wsPath, operation) {
	assertRegisteredWorkspace(ctx, wsPath);
	return withWorkspaceWrite(wsPath, operation);
}
async function readWorkspaceConfigCached(ctx, wsPath) {
	const filePath = join(wsPath, ...WORKSPACE_CONFIG_REL);
	let info;
	try {
		info = await stat(filePath);
	} catch (error) {
		if (error?.code === "ENOENT") {
			workspaceCacheDelete(ctx, wsPath);
			return { servers: [], exclude: [], error: "", missing: true };
		}
		throw error;
	}
	const stamp = workspaceWriteStamp(wsPath);
	const cached = workspaceCacheGet(ctx, wsPath);
	if (cached && cached.stamp === stamp && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.config;
	const config = await readWorkspaceConfig(wsPath, (path) => readFile(path, "utf8"));
	// 读盘期间又发生了写入：本次结果可能已陈旧，当次返回但不入缓存，下次重读。
	if (workspaceWriteStamp(wsPath) === stamp) workspaceCacheSet(ctx, wsPath, { stamp, mtimeMs: info.mtimeMs, size: info.size, config });
	return config;
}
async function writeWorkspaceConfigFile(wsPath, servers, exclude, toolLoading) {
	// 读改写：`previous.raw` 是整份原文，未知顶层键必须原样保留——旧实现按已知字段重建文档，
	// 用户在同一个文件里写的扩展键会随一次"保存 MCP"凭空消失。
	const previous = await readWorkspaceConfig(wsPath, (path) => readFile(path, "utf8")).catch(() => null);
	// 保留项目级的**工具加载策略**：增删改一台服务器与它不是同一件事，
	// 不保留就等于每次编辑服务器都把用户设过的加载策略悄悄清空。
	const policy = toolLoading === undefined ? previous?.toolLoading : toolLoading;
	await writeWorkspaceConfig(
		wsPath,
		{ servers, exclude, toolLoading: policy, previous: previous?.raw },
		(path, text) => writeFileAtomic(path, text, { mode: 0o600 }),
		(path, options) => mkdir(path, options),
	);
	// 写后自增写入代号：所有 app 的缓存条目下次读取时会因代号不符而失效，无需枚举缓存桶。
	workspaceWriteEntry(wsPath).stamp += 1;
}

// ---- agent setup 时挂载到 agent scope ----
// exclude 展开成 deny：只认「某工具的唯一 owner 是被排除的 serverName」，归属判定与 toolInventory 一致，
// 避免 serverName 含 `__` 时裸前缀匹配误伤其他服务器的同名工具。
// 公开面拿不到「只要名字」的读法（`schemas()` 会对每个工具深拷贝 parameters），所以缓存：
// 空 exclude 直接短路；一次事件合并后只重算一次，而不是每个存活会话各算一次（issue #8 的另一半放大）。
// 键是 (工具代次, 全局 serverName 集合, exclude)。deny 还依赖全局工具**内容**，那一半由代次近似：
// toolsEpoch 每轮 flush 自增，而 flush 正是由每一次 register/dispose 派发的 tools/change 排出来的，
// 所以任何一次工具集变化都会换 key。前提是没有任何事件被过滤掉 —— 本模块现在不做那种过滤。
let toolsEpoch = 0;
const denyCacheByRoot = new WeakMap(); // appRoot -> Map<key, string[]>
function denyForExclude(ctx, exclude) {
	if (!exclude.length) return [];
	const globalNames = allMcpEntries(ctx).map((entry) => entry.options.config.serverName);
	const root = appRoot(ctx);
	const cacheKey = `${toolsEpoch}\u0000${globalNames.join("\u0000")}\u0000${exclude.join("\u0000")}`;
	let bucket = denyCacheByRoot.get(root);
	if (bucket === undefined) { bucket = new Map(); denyCacheByRoot.set(root, bucket); }
	const hit = bucket.get(cacheKey);
	if (hit !== undefined) return hit;
	const excluded = new Set(exclude);
	const deny = [];
	for (const schema of ctx.tools.schemas()) {
		const owners = globalNames.filter((name) => schema.name.startsWith(`mcp__${name}__`));
		if (owners.length === 1 && excluded.has(owners[0])) deny.push(schema.name);
	}
	deny.sort();
	if (bucket.size > 32) bucket.clear();
	bucket.set(cacheKey, deny);
	return deny;
}
function applyWorkspaceRestrict(ctx, agentCtx, agent, exclude) {
	const state = agentWorkspaceStates.get(agent);
	if (!state) return;
	const deny = denyForExclude(ctx, exclude);
	// key 基于展开后的 deny 工具名：全局工具集变化或 exclude 变化都会触发重算。
	const key = JSON.stringify(deny);
	if (state.restrictKey === key) return;
	if (state.restrictDisposer) { try { state.restrictDisposer(); } catch { /* noop */ } state.restrictDisposer = undefined; }
	if (!deny.length) { state.restrictKey = key; clearWorkspaceRestrictError(state.wsPath); return; }
	try {
		state.restrictDisposer = agentCtx.tools.restrict({ deny });
		// 仅在 restrict 真正生效后记账：先记账会让抛错的这次被误认为已应用，
		// 之后同一 deny 因 key 命中被跳过，限制永远补不上。
		state.restrictKey = key;
		clearWorkspaceRestrictError(state.wsPath);
	} catch (error) {
		state.restrictKey = undefined;
		recordWorkspaceRestrictError(state.wsPath, deny, error);
		ctx.logger?.warn?.(`mcp-manager: restrict(${deny.join(", ")}) 失败: ${error?.message ?? error}`);
	}
}
// 重算 exclude 并写入会话作用域。工具清单是**每一步**重新组装的（assemblies 读的是作用域视图），
// 所以新的 deny 对运行中的会话在下一轮请求就生效 —— 不需要"等新会话"。
// 这里之所以还要在写盘后主动重算一次：`restrict()` 是**作用域层**上的登记，得有人把它写下去；
// 挂载时算的那一次只覆盖当时已知的工具名（MCP 仍在异步注册时可能还看不到），所以 tools/change
// 到达后也要重算。
// wsPath 省略时重算全部（tools/change 场景：全局工具集变了，所有会话的 deny 都要重新展开）。
// 按 wsPath 分组：同一工作区的会话共用同一份配置，而这个函数每次 tools/change 都会跑一遍全部会话，
// 逐个会话读配置就是 O(会话数) 次 stat（一次 200 个工具的注册会派发 200+ 次事件，issue #8）。
async function reconcileWorkspaceRestricts(ctx, wsPath) {
	const root = appRoot(ctx);
	const byPath = new Map();
	for (const [agent, state] of agentWorkspaceStates) {
		// 多 app 同进程：别拿其他 app 的全局工具集去展开本 app 会话的 deny。
		if (state.root !== root) continue;
		if (!agent?.ctx) continue;
		if (wsPath && state.wsPath !== wsPath) continue;
		const group = byPath.get(state.wsPath);
		if (group) group.push(agent);
		else byPath.set(state.wsPath, [agent]);
	}
	for (const [path, agents] of byPath) {
		let config;
		try {
			config = await readWorkspaceConfigCached(ctx, path);
		} catch { continue; /* 下一次变化再重试 */ }
		for (const agent of agents) {
			try {
				applyWorkspaceRestrict(ctx, agent.ctx, agent, config.exclude);
			} catch { /* 下一次变化再重试 */ }
		}
	}
}
// 工具集变化时重算所有存活会话的项目工具投射（共享连接异步就绪/重连/工具增减）。这是生产
// 上的主路径：真实 mcp-client 的 apply 在 cordis 的微任务里才跑、工具要等 connect + tools/list
// 才注册，所以 setup 当场投射到的往往是空集，全靠这里补。
// 投射自身也会派发 tools/change（register() → ScopedLayers.onChange，同步 emit）。这里**不**抑制它：
// emit 是同步派发，别的监听器同样会在这一次派发里注册工具，按「是我自己发的」去吞事件会把别人的
// 变更一起吞掉，而 tools/change 没有载荷，这种过滤只能靠猜。多出来的那一轮由 scheduleToolsChange
// 合并吸收，且重算是幂等的（哨兵没换就不注册），所以只多排一轮空转，不会自激。
function reconcileSessionProjectTools(ctx) {
	const slotsByAgent = agentProjectSlotsByRoot.get(appRoot(ctx));
	if (!slotsByAgent) return;
	for (const slots of [...slotsByAgent.values()]) {
		for (const slot of [...slots.values()]) {
			try { syncSessionProjectTools(ctx, slot); } catch { /* 下一次变化再试 */ }
		}
	}
}
// `tools/change` 没有载荷，而一次 207 个工具的注册会派发 200+ 次。把同一轮微任务里的事件合并成一次
// 重算：重算读的是「当前」状态，合并不会丢变化；返回同一个 promise，`await handler()` 的语义不变。
// 每次合并后自增 toolsEpoch —— deny 展开的结果只在这一轮内复用，不会跨轮变陈旧。
const toolsChangeFlushByRoot = new WeakMap(); // appRoot -> Promise
function scheduleToolsChange(ctx) {
	const root = appRoot(ctx);
	const pending = toolsChangeFlushByRoot.get(root);
	if (pending !== undefined) return pending;
	const flush = Promise.resolve().then(() => {
		toolsChangeFlushByRoot.delete(root);
		toolsEpoch += 1;
		reconcileSessionProjectTools(ctx);
		return reconcileWorkspaceRestricts(ctx);
	});
	toolsChangeFlushByRoot.set(root, flush);
	return flush;
}
// 挂载时把「等就绪」做成**有预算**的等待：预算内就绪 → 工具赶在首轮组装之前进声明
//（这是宿主自己的契约：mcp-client README 第一句就是 "The server's tools appear before the
// harness starts its first turn"）。超时不算失败、也不阻断会话：连接状态由 fiber 状态 + 工具数
// 如实呈现（面板显示「连接中…」或「连接失败」）。
// 预算是**一次挂载共享的总预算**（取各 server 的上限，而不是逐个相加）：否则 5 个连不上的服务器
// 会给每次会话创建加上 5 倍等待，正好和「不阻断」自相矛盾。按挂载顺序消耗，先到先得。
const DEFAULT_READY_TIMEOUT_MS = 5_000;
function readyTimeoutOf(server) {
	return server.readyTimeoutMs === undefined ? DEFAULT_READY_TIMEOUT_MS : server.readyTimeoutMs;
}
async function waitForConnectionReady(entry, deadline, signal) {
	if (entry.fiber === undefined) return 'ready';
	// 创建已被取消（宿主在 agent/created 载荷里给了 signal）：别再把这次创建按在预算上。
	if (signal?.aborted) return 'skipped';
	const remaining = deadline - Date.now();
	if (remaining <= 0) return 'timeout';
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve('timeout'), remaining);
		timer.unref?.();
	});
	let resolveAbort;
	const onAbort = () => resolveAbort?.('skipped');
	const aborted = signal
		? new Promise((resolve) => { resolveAbort = resolve; signal.addEventListener("abort", onAbort, { once: true }); })
		: undefined;
	try {
		return await Promise.race([
			Promise.resolve(entry.fiber).then(() => 'ready', () => 'failed'),
			timeout,
			aborted,
		].filter(Boolean));
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}
// 会话记录 + 生命周期归属：同一会话只登记一次。配置变更后的 reconcile 会重跑挂载路径，
// 重复登记会把旧 state 连同它的 restrictDisposer 一起覆盖成孤儿（再也无人撤销那条 restrict）。
function ensureAgentWorkspaceState(ctx, agentCtx, agent, wsPath) {
	const existing = agentWorkspaceStates.get(agent);
	if (existing) return existing;
	// 不允许缺少 effect()：没有生命周期归属就宁可不挂项目 MCP。
	if (typeof agentCtx.effect !== "function") throw new Error("会话作用域没有 effect()，无法为项目 MCP 建立生命周期归属");
	agentCtx.effect(() => () => { agentWorkspaceStates.delete(agent); }, "mcp-manager.workspaceScope");
	const state = { root: appRoot(ctx), wsPath, restrictKey: undefined, restrictDisposer: undefined, toolLoading: undefined };
	agentWorkspaceStates.set(agent, state);
	return state;
}
// 本项目配置里的工具加载策略（读侧归一后的形状）。拿不到就是 undefined：
// 调用方按"没有项目覆盖"处理，而不是编一份默认策略出来。
function agentToolLoadingPolicy(agent) {
	return agentWorkspaceStates.get(agent)?.toolLoading;
}
// 当前活着的会话（按 agent 对象）。面板枚举工具时要问**每个会话**：DSH 0.2 把大量
// 模型可见工具注册在 agent 作用域里，只看全局视图会漏掉它们。
function liveAgents() {
	return [...agentWorkspaceStates.keys()];
}
// 面板保存项目策略后，存活会话必须立刻看到新值（视图按 revision 自愈，不需要重连）。
function setAgentToolLoadingPolicy(ctx, wsPath, policy) {
	let changed = 0;
	for (const state of agentWorkspaceStates.values()) {
		if (state.wsPath !== wsPath) continue;
		state.toolLoading = policy;
		changed += 1;
	}
	return changed;
}
// generation 是「本代挂载器还在管事吗」这一事实的唯一载体：installAgentRuntime 建立，
// cleanup（HMR/卸载）置为 false。它与「会话是否还活着」彻底分开——后者归 cordis。
// 挂载点是官方的 agent/created **串行监听器**（`@mode serial`）：宿主在创建事务里 await 它，
// 所有监听器跑完才释放排队输入，所以项目工具一定在首轮组装之前就位。
// 载荷里的 agent 公开 ctx 与 session（dsh-agent 的 Agent 接口），所以这里既能拿 cwd 判项目，
// 也能用 agent.ctx 建立作用域注册与生命周期归属——不再需要碰 agents.create/resume。
// 监听器**绝不抛错**：宿主的语义是「a listener failure rejects」，抛出去等于否决整个会话创建，
// 所以这里任何失败都只记账 + 告警，让会话照常开起来。
async function mountProjectMcpForAgent(ctx, agent, generation, options = {}) {
	// awaitReady=false 用在"会话已经活着、只是配置变了"的场合（reconcile）：那时没有"首轮"要保护，
	// 而逐个会话各等一次就绪预算会让一次面板保存阻塞 N×预算（3 个会话 + 不可达服务器 = 十几秒）。
	// 工具照样会到：连接就绪后 tools/change 会补投射。
	const awaitReady = options.awaitReady !== false;
	const signal = options.signal;
	const agentCtx = agent?.ctx;
	if (!agentCtx) {
		// 官方契约保证载荷里的 agent 带 ctx（Agent 接口公开 ctx 与 session）。拿不到只能是契约变了：
		// 明确告警后放行，不假装挂上了，也不拿自己的猜测去填一个 agent。
		ctx.logger?.warn?.("mcp-manager: agent/created 未提供 agent.ctx（dsh-agent 契约已变？），本次不挂载项目 MCP");
		return;
	}
	const cwd = agent.session?.header?.cwd;
	if (typeof cwd === "string" && cwd.length > 0) {
		const wsPath = canonicalWorkspacePath(cwd);
		try {
			const config = await readWorkspaceConfigCached(ctx, wsPath);
			if (!config.error && !config.missing) {
				// 会话记录只承载「本会话属于哪个项目 + restrict 展开到哪一步」。它不再是任何
				// 存活性凭据：共享连接的引用由 commitSharedConnection 交给 cordis 的 effect 持有。
				const wsState = ensureAgentWorkspaceState(ctx, agentCtx, agent, wsPath);
				// 策略随挂载时的配置一起固定下来；改配置走 reconcile/下一次挂载（与 error/exclude 同一条语义）。
				wsState.toolLoading = config.toolLoading;
				// 本次挂载的共享就绪预算（见 waitForConnectionReady）：取各 server 上限里的最大值，
				// 而不是逐个相加 —— 预算是给「这次会话创建」的，不是给每个 server 各发一份。
				let readyDeadline = Date.now();
				for (const server of config.servers) {
					if (server.disabled) continue;
					readyDeadline = Math.max(readyDeadline, Date.now() + readyTimeoutOf(server));
				}
				for (const server of config.servers) {
					if (server.disabled) continue;
					try {
						// 配置变了就**就地重载**（而不是继续复用旧连接）：这就是宿主对配置条目的既有
						// 语义（mcp-client README："Editing the configuration entry reloads the server
						// connection in place, and unchanged names stay unchanged"）。工具名是
						// (serverName, rawName) 的纯函数，所以重载不会让会话历史/权限规则失效。
						// 挂载路径上做这件事，是为了让「手改 .dsh/mcp.json」也在下一次挂载时被采纳
						//（面板写盘那条路径另有 reconcile 立刻对齐）。
						// 两条"要换掉旧连接"的理由，都必须把它交出来：配置变了（就地重载），
						// 或上一轮重连已经耗尽（按需重建）。**丢掉这个返回值就是 bug** ——
						// 后面的 repointConnectionSlots 拿不到旧 entry，同项目其他存活会话的槽位
						// 就会一直指向已销毁的连接，永久读不到工具（只有正在挂载的这个被顺带修好）。
						const dead = await retireDeadConnection(ctx, wsPath, server);
						const previous = dead ?? (await retireStaleConnection(ctx, wsPath, server));
						// 共享连接：每 (wsPath, serverName) 全 app 只挂一份官方 mcp-client，所以 serverName
						// 只登记一次——同项目再开多少个会话都不会再撞名。
						const entry = await acquireSharedConnection(ctx, wsPath, server);
					// defer 是活值：它不在 clientConfig / configFingerprint 里（不该触发重连），
					// 所以每次挂载按当前配置刷新一次。ToolSearch 的配置桥读的就是这个字段。
					entry.defer = server.defer === true;
						// 就地重载：把其余会话的槽位一起改指新连接，否则旧 scope 一销毁，它们的投射
						// 就会读到空集，随后 tools/change 的幂等重算会把工具全撤掉。
						if (previous) repointConnectionSlots(ctx, previous, entry);
						// 提交：把引用交给 cordis。会话在建连期间被销毁、或本插件已 HMR 卸载时返回 null，
						// 引用已在里面归还。
						const slot = commitSharedConnection(ctx, agentCtx, agent, entry, generation);
						if (!slot) break;
						if (server.failOnStartupError) {
							// 与 mcp-client 全局语义一致：显式要求“启动失败阻止”的服务器等待就绪。
							// 这条等待是用户显式选择的，不受共享预算约束。
							try {
								await entry.fiber;
								clearWorkspaceMountError(wsPath, server.name);
							} catch (error) {
								recordWorkspaceMountError(ctx, wsPath, server.name, error);
								ctx.logger?.warn?.(`mcp-manager: 项目 MCP ${server.name} 启动失败: ${error?.message ?? error}`);
							}
						} else {
							// 默认路径：在共享预算内等就绪，好让工具赶在首轮组装之前进声明
							//（宿主契约：tools appear before the harness starts its first turn）。
							const outcome = awaitReady ? await waitForConnectionReady(entry, readyDeadline, signal) : 'skipped';
							if (outcome === 'ready') {
								clearWorkspaceMountError(wsPath, server.name);
							} else if (outcome === 'timeout' || outcome === 'skipped') {
								// 没等到（或不打算等）就先放行；就绪后由 tools/change 补投射。
								void Promise.resolve(entry.fiber).then(
									() => clearWorkspaceMountError(wsPath, server.name),
									(error) => {
										recordWorkspaceMountError(ctx, wsPath, server.name, error);
										ctx.logger?.warn?.(`mcp-manager: 项目 MCP ${server.name} 加载失败: ${error?.message ?? error}`);
									},
								);
							} else {
								// fiber 自己拒绝了这条连接。**原始错误就是全部线索**（配置被宿主拒绝、
								// serverName 已被占用…），所以再 await 一次把它取出来如实记账；
								// 只有确实取不到时才退到「fiber N」这种没有原因的兜底话。
								// 再 await 是安全的：cordis 的 await() 只等生命周期收尾并重抛已缓存的
								// 启动错误，不会重跑插件（见 Fiber.await）。
								let reason;
								try { await entry.fiber; } catch (error) { reason = error; }
								recordWorkspaceMountError(ctx, wsPath, server.name,
									reason ?? new Error(`共享连接启动失败（fiber ${entry.fiber?.state}）`));
								ctx.logger?.warn?.(`mcp-manager: 项目 MCP ${server.name} 启动失败: ${reason?.message ?? `fiber ${entry.fiber?.state}`}`);
							}
						}
						// 把当前已注册的工具投射进本会话 own 层（通常为空，等 tools/change 补）。
						syncSessionProjectTools(ctx, slot);
					} catch (error) {
						recordWorkspaceMountError(ctx, wsPath, server.name, error);
						ctx.logger?.warn?.(`mcp-manager: 项目 MCP ${server.name} 挂载失败: ${error?.message ?? error}`);
					}
				}
				applyWorkspaceRestrict(ctx, agentCtx, agent, config.exclude);
			}
		} catch (error) {
			ctx.logger?.warn?.(`mcp-manager: 项目 MCP 作用域初始化失败 ${cwd}: ${error?.message ?? error}`);
		}
	}
}
// 安装：一个 agent/created 串行监听器（挂载）+ 一个 tools/change 监听器（重算投射与 restrict），
// 两者的生命周期都挂在本代 effect 上。
//
// 为什么不包装宿主的 agents.create/resume（那条路已删除）：agent/created 本来就是**被 await 的
// 串行事件** —— 宿主在创建事务里 await 它，所有监听器跑完才释放排队输入，所以「首轮之前就绪」由
// 官方契约保证，不需要改写宿主服务，也不再依赖 cordis 的 proxy 赋值语义（旧实现自己把那条依赖
// 标注为“值得付的代价”）。
// 旧注释曾断言该事件是 fire-and-forget，那是对的结论错的对象：fire-and-forget 的是**同步的**
// `sessions.announce()`；`agents.announce()` 是 `await ctx.serial(carrier, 'agent/created', …)`，
// 并且监听器抛错会否决创建（见下面挂载处的边界处理）。
function installAgentRuntime(ctx) {
	if (typeof ctx.on !== "function") throw new Error("mcp-manager: 宿主 context 没有 on()，无法订阅 agent/created");
	if (typeof ctx.effect !== "function") throw new Error("mcp-manager: 宿主 context 没有 effect()，无法为项目 MCP 挂载器建立生命周期归属");
	// 本代挂载器的令牌：飞行中的挂载靠它判断「我还该不该接管资源」（HMR/卸载后即失效）。
	const generation = { active: true };
	let disposeAgentCreated;
	let disposeToolsChange;
	const cleanup = () => {
		if (!generation.active) return undefined;
		generation.active = false;
		try { disposeAgentCreated?.(); } catch { /* noop */ }
		try { disposeToolsChange?.(); } catch { /* noop */ }
		// HMR/卸载：本 app 的会话不再由本模块管理，必须全部撕干净，否则运行中会话会留下指向已
		// 销毁连接的僵尸工具、以及再也无人重算的 restrict（旧模块的 agent 级清理只在会话销毁时
		// 才跑，而那时旧模块已经不在了）。teardown promise 交回 cordis 等待。
		const root = appRoot(ctx);
		// 本 app root 的共享状态（连接、会话记录、投射）**归当前代次所有**，这三件销毁动作
		// 必须共用同一条归属判定，否则就是自相矛盾：`activeGenerationByRoot` 若真会新旧重叠
		// （令牌只删自己那一份就是为了防它），那么被取代的旧代在这里无条件抹掉会话记录与投射，
		// 就把**存活代**的工具连带撕掉了 —— 会话还在跑，却再也读不到项目工具，而且新的那一代
		// 找不到会话记录、reconcile 从此不再对齐（remounted=0）。
		// 所以：令牌已易主且新代仍活着 ⇒ 旧代只收回自己的订阅，不碰共享状态；
		// 新代自己卸载时会走同一段代码把它们收干净（同 app root 的连接也被它继承，不会漏）。
		const current = activeGenerationByRoot.get(root);
		if (current !== undefined && current !== generation && current.active) {
			return undefined;
		}
		// 只删自己那一份：每个 app root 只有一个令牌槽位，若新旧两代短暂重叠（HMR 先装后卸），
		// 旧代无条件删除会把新代的令牌清掉 —— 症状是配置对齐静默失效（reconcile 找不到代次就早退）。
		if (activeGenerationByRoot.get(root) === generation) activeGenerationByRoot.delete(root);
		for (const [agent, state] of agentWorkspaceStates) {
			if (state.root !== root) continue;
			if (state.restrictDisposer) { try { state.restrictDisposer(); } catch { /* noop */ } }
			agentWorkspaceStates.delete(agent);
		}
		return disposeAllProjectSlots(ctx);
	};
	// 生命周期归属先建立、再订阅事件：反过来的话，effect() 抛出（fiber 已 inactive）就会留下一个
	// 被死插件永久持有的监听器，而且再也没有重新安装的机会。
	const owner = ctx.effect(() => () => cleanup(), "mcp-manager.agentRuntime");
	activeGenerationByRoot.set(appRoot(ctx), generation);
	try {
		disposeAgentCreated = ctx.on("agent/created", async (payload) => {
			// 边界（显式且必须）：宿主把本监听器的抛错当作「否决这次会话创建」。一个连不上的 MCP
			// 服务器绝不能把用户挡在会话门外，所以这里把一切错误吞成日志——挂载失败本身由
			// mountProjectMcpForAgent 逐 server 记账（面板可见），不靠抛错表达。
			// 载荷**不在参数位置上解构**：解构发生在 try 之前，一个 null/undefined 载荷就会让本
			// 监听器 reject，正好破坏这条边界。签名只声明"有个载荷"，取值放在 try 里面。
			const payloadAgent = payload?.agent;
			try {
				await mountProjectMcpForAgent(ctx, payloadAgent, generation, { signal: payload?.signal });
			} catch (error) {
				ctx.logger?.error?.(`mcp-manager: agent/created 挂载流程异常（已吞掉，不阻断会话创建）: ${error?.message ?? error}`);
			}
		});
		// 自己投射出来的那一批事件也走这里：合并把它们和真正的外部变更吸收成同一轮，不必也不该按
		// 「是谁发的」过滤（`tools/change` 没有载荷，过滤只能靠猜，而且会连别人的变更一起吞掉）。
		disposeToolsChange = ctx.on("tools/change", () => scheduleToolsChange(ctx));
	} catch (error) {
		// 订阅中途失败：先把已经建立的订阅收回去（cleanup 自身置 generation.active = false，
		// 也是幂等的），再让错误浮出去，不静默半装配状态。
		cleanup();
		throw error;
	}
	return cleanup;
}

export {
	agentToolLoadingPolicy,
	liveAgents,
	assertRegisteredWorkspace,
	canonicalWorkspacePath,
	installAgentRuntime,
	listWorkspaceRecords,
	liveWorkspaceAgentCount,
	projectConnectionsView,
	readWorkspaceConfigCached,
	reconcileWorkspaceConnections,
	reconcileWorkspaceRestricts,
	reconnectWorkspaceServer,
	setAgentToolLoadingPolicy,
	withRegisteredWorkspaceWrite,
	workspaceConnectionStatus,
	workspaceMountErrorsView,
	workspaceRestrictErrorView,
	workspaceScopeErrorsView,
	workspaceToolSchemas,
	writeWorkspaceConfigFile,
};
