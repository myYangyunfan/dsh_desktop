// 导入/合并的**决策**层：哪些算新增、更新、移除，以及预览文案。
//
// 从 lib/index.js 整块搬出来的（R6 第 2 步），一个字符都没改。这一层的价值全在"只有一份判定"：
// 预览与落盘必须由同一个函数算出同一个答案，否则"预览的是 A、导入的是 B"没有任何东西能拦住。
// 物化有一份还是两份不影响这条——全局导入写 patch（带 entry id 的 YAML 增量），项目导入写
// 整份 .dsh/mcp.json，但"什么算新增/更新/移除"来自同一处（classifyMerge）。
//
// 浏览器永远不传路径进来：来源表在这里拼路径，所以接口面不会退化成"读任意文件"。
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { admitImportedServers } from "./import-admission.js";
import { normalizeMcpImport, updateManagedMcpPatch } from "./mcp-config.js";
import { missingEnvNames } from "./mcp-import-sources.js";
import { REDACTED_VALUE, redactUrl } from "./mcp-projection.js";
import { commitPatch, doomedMcpIds, entryIdOf, externalMcpEntries, managedState, withPatchWrite } from "./patch-store.js";

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

export {
  admittedImport,
  applyManagedImport,
  assertSourceLayer,
  importPreview,
  mergePreview,
  planMerge,
  projectSourceRow,
  readSourceText,
  reservedEntryIds,
  selectSourceServers,
  sourceContext,
  withSkipped,
  workspaceImportPreview,
};
