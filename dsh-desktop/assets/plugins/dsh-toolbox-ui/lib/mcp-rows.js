// 一行的展示投影：把"条目 + 库存 + 托管状态"压成面板读的那一个对象。
//
// 从 lib/index.js 整块搬出来的（R6 第 2 步），一个字符都没改。这一层是**唯一**允许回答
// "这一行看起来是什么样"的地方，所以两条判断都只住在这里：
//   · 连接态只来自 cordis fiber 的状态代号（mcp-client 的 apply 要等首次连接与 tools/list
//     结束才让 fiber ACTIVE），不去猜日志文案——日志只用来填 lastError 的具体原因；
//   · 全局行与项目行走**同一套规则、同一个 deriveMcpPhase**。曾经两处各写一套，于是同一个
//     故障在全局页显示"失败"、在项目页显示"未连接"。
import { MANAGED_CONFIG_FIELDS, normalizeMcpImport } from "./mcp-config.js";
import { ensureLogCapture, lastLogFor } from "./mcp-log.js";
import { deriveMcpPhase, sanitizeMcpLog } from "./mcp-observability.js";
import { redactArgs, redactMap, redactUrl, restoreTemplate } from "./mcp-projection.js";
import { projectToolSchema, revisionOf } from "./mcp-registry.js";
import { toMcpClientConfig } from "./workspace-config.js";
import { workspaceConnectionStatus } from "./workspace-runtime.js";

const PHASE_TEXT = { 0: "waiting", 1: "loading", 2: "connected", 3: "failed", 4: "stopped", 5: "unloading" };

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

export { containsExpressionValue, listRevision, normalizeOne, sameConfigValue, summarize, summarizeWorkspaceRow, touchesConnection, workspaceServerView };
