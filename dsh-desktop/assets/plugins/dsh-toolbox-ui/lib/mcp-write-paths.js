// 写入路径：一个项目 / 全局配置改动怎样"既落盘、又尽量立刻生效"。
//
// 从 lib/index.js 整块搬出来的（R6 第 2 步），一个字符都没改。这一层唯一的纪律是**两个事实分开报**：
// 写盘是既成事实，生效是另一件事。所以每次写都产出 { persisted, live, diagnostics } 三个字段，
// 而"没生效"必须带上原因（宿主没有热应用入口 / 对齐失败 / 只是翻了开关不重连），不许压成一句
// "成功了"——面板照它显示"已保存但未生效"，用户才知道要不要重启。
//
// 另一条纪律：**锁的范围**。写盘在 withPatchWrite / withRegisteredWorkspaceWrite 里，
// reconcile（可能 await 整条 teardown、关子进程）在**锁外**——否则"移除一个卡住的 server"
// 会把该项目之后的每次保存一起卡住。
import { basename } from "node:path";
import { admitImportedServers } from "./import-admission.js";
import { planMerge, withSkipped } from "./mcp-import-plan.js";
import { commitPatch, managedLiveEntry, managedState, mutationResult, withPatchWrite } from "./patch-store.js";
import { normalizePolicyConfig, writablePolicy } from "./tool-loading-policy.js";
import { toolSearchDisabled } from "./tool-search-config.js";
import { pluginPatchIdentity, setToolLoadingPolicyInPatch } from "./tool-search-settings.js";
import { composedRowVisible } from "./profile-composition.js";
import { assertRegisteredWorkspace, canonicalWorkspacePath, readWorkspaceConfigCached, reconcileWorkspaceConnections, setAgentToolLoadingPolicy, withRegisteredWorkspaceWrite, writeWorkspaceConfigFile } from "./workspace-runtime.js";

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
// 项目族的行内芯片：改 `<项目>/.dsh/mcp.json` 的 `toolLoading.groups`。
//
// **不再写旧 `defer`**：同一件事只允许一份可写配置。旧 defer 仍被读取（组级/逐工具覆盖
// 都没有时它说了算），但没有任何界面再产生它。组级值是活值，不触发连接重载。
async function applyProjectDefer(ctx, gateway, wsPath, next, names) {
	const target = next ? "deferred" : "resident";
	const result = await withRegisteredWorkspaceWrite(ctx, wsPath, async () => {
		const config = await readWorkspaceConfigCached(ctx, wsPath);
		if (config.error) throw new Error(config.error);
		if (toolSearchDisabled()) throw new Error("ToolSearch 总开关生效中：所有工具常驻，服务器级开关不生效");
		const projectPolicy = normalizePolicyConfig(config.toolLoading);
		const globalMode = normalizePolicyConfig(gateway.globalToolLoading).mode;
		const effectiveMode = projectPolicy.mode === "legacy" ? globalMode : projectPolicy.mode;
		if (effectiveMode === "all-resident") throw new Error("当前整体方案为「全部常驻」（配置里写的）：服务器级开关不生效");
		if (!config.servers.length) return { changed: 0, note: "该项目没有 MCP" };
		const targets = names === undefined ? config.servers : config.servers.filter((server) => names.includes(server.name));
		if (names !== undefined && !targets.length) throw new Error("该项目没有这个 MCP");
		const policy = writablePolicy(projectPolicy);
		const groups = { ...policy.groups };
		const changed = [];
		for (const server of targets) {
			if (groups[server.name] === target) continue;
			groups[server.name] = target;
			changed.push(server.name);
		}
		if (!changed.length) {
			return {
				changed: 0,
				note: names === undefined ? "该项目的 MCP 已经都是这个加载方式" : `${names[0]} 已经是这个加载方式`,
			};
		}
		// servers / exclude 原样传回：只改加载策略，不动连接配置与屏蔽名单。
		const updated = normalizePolicyConfig({ ...policy, groups });
		await writeWorkspaceConfigFile(wsPath, config.servers, config.exclude, updated);
		return {
			changed: changed.length,
			policy: updated,
			note: names === undefined
				? `已把该项目的 ${changed.length} 个 MCP 的默认加载方式设为${next ? "延迟" : "全量"}`
				: `已把 ${names[0]} 的默认加载方式设为${next ? "延迟" : "全量"}`,
		};
	});
	if (result.changed === 0) return mutationResult("unchanged", "unchanged", result);
	// 策略是活值：只刷新内存里那一份，不重连任何 MCP。
	const liveAgents = setAgentToolLoadingPolicy(ctx, wsPath, result.policy);
	return mutationResult("applied", "applied", { ...result, liveAgents });
}
// 全局族的行内芯片：改 `<profile>/cordis.patch.yml` 里插件自己那条 `config.toolLoading.groups`。
//
// 只改**本 profile 且能定位到活条目**的服务器（managedLiveEntry）——外部 bundle/agent 的
// 同名条目不在 patch 里，扫过去只会静默失败。
//
// `names === undefined` = 全部（一键）；给 names = 只改这几台（行内单台开关）。
// 单台时找不到目标必须**报错**：面板点了没反应（静默 no-op）是最难排查的形态。
//
// 与逐工具策略共用同一个写盘事务（commitPatch：覆盖判定 + 失败回滚），不碰 mcp-client 的连接。
// 旧 `defer` 不再由这里产生：它是策略链里的一层只读输入。
async function applyGlobalDefer(ctx, gateway, next, names) {
	const target = next ? "deferred" : "resident";
	if (toolSearchDisabled()) throw new Error("ToolSearch 总开关生效中：所有工具常驻，服务器级开关不生效");
	if (normalizePolicyConfig(gateway.globalToolLoading).mode === "all-resident") throw new Error("当前整体方案为「全部常驻」（配置里写的）：服务器级开关不生效");
	const identity = pluginPatchIdentity();
	const canCheckOverride = await composedRowVisible(ctx, identity.id);
	return withPatchWrite(ctx, async () => {
		const state = await managedState(ctx);
		const policy = writablePolicy(gateway.globalToolLoading);
		const groups = { ...policy.groups };
		const changed = [];
		for (const name of state.byName.keys()) {
			if (names !== undefined && !names.includes(name)) continue;
			if (!managedLiveEntry(ctx, state, name)) {
				if (names !== undefined) throw new Error("此 MCP 不属于当前 Web profile，不能改延迟开关");
				continue;
			}
			if (groups[name] === target) continue;
			groups[name] = target;
			changed.push(name);
		}
		if (names !== undefined && !state.byName.has(names[0])) throw new Error("当前 Web profile 没有这个 MCP");
		if (!changed.length) {
			return {
				changed: 0, persisted: "unchanged", live: "unchanged", diagnostics: [],
				note: names === undefined ? "当前 Web profile 的 MCP 已经都是这个加载方式" : `${names[0]} 已经是这个加载方式`,
			};
		}
		const writePolicy = { ...policy, groups };
		const content = setToolLoadingPolicyInPatch(state.content, writePolicy, identity);
		const outcome = await commitPatch(ctx, state, content, {
			label: "MCP 组级加载策略",
			...(canCheckOverride ? { entryId: identity.id, expect: { present: true } } : {}),
			applyLive: () => { gateway.globalToolLoading = normalizePolicyConfig(writePolicy); },
		});
		return {
			...outcome,
			changed: changed.length,
			note: names === undefined
				? `已把 ${changed.length} 个 MCP 的默认加载方式设为${next ? "延迟" : "全量"}`
				: `已把 ${names[0]} 的默认加载方式设为${next ? "延迟" : "全量"}`,
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
export {
  alignWorkspaceConnections,
  applyGlobalDefer,
  applyProjectDefer,
  applyWorkspaceImport,
  copyPreviewOf,
  copyResultNote,
  resolveWorkspaceCopy,
};
