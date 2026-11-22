// profile patch 的存储层：读-改-写、HMR 锁、托管条目定位、以及从 patch 内容派生的视图。
//
// 从 lib/index.js 整块搬出来的（R6 第 2 步），**一个字符都没改**：缩进、注释、常量名、判定
// 全部原样，所以行为差异只可能来自 import 接错。这一层的职责边界是"文件的真相":
//
//   · 目标文件只从可信的根 include 推导（patchPath），不由会话工作区决定；
//   · 写盘走宿主的原子写 + 进程内 HMR 锁（withPatchWrite/readPatch/writePatch）；
//   · "这一条是不是我们自己的"只有一个判据 —— loader 条目 id（resolveManagedEntry）；
//   · 生效不是写盘的同义词（commitPatch → lib/profile-composition.js 的官方 reconcile）。
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { readManagedMcpServers } from "./mcp-config.js";
import { allMcpEntries, entriesForName } from "./mcp-registry.js";
import { commitProfilePatches } from "./profile-composition.js";

const ROOT_INCLUDE_ID = "include";
const REVEAL_REVISION_KEY = randomBytes(32);
const patchWriteQueues = new WeakMap();

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

/**
 * 全局族的旧 `defer` 值（true 压 false，都没写 = undefined）。
 *
 * 工具页的组头要显示“跟随（按需/常驻）”。跟随值必须用**当前作用域**的旧 defer 算：
 * 全局页不能把某个项目的 defer 算进来，否则一台全局服务器的默认值会随项目漂移。
 */
function legacyDeferOf(ctx, serverName) {
	let value;
	for (const entry of allMcpEntries(ctx)) {
		if (entry.options?.config?.serverName !== serverName) continue;
		const defer = entry.options.config.defer;
		if (defer === true) return true;
		if (defer === false) value = false;
	}
	return value;
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

export {
  applyDeferMask,
  commitPatch,
  doomedMcpIds,
  effectiveMcpServers,
  entryIdOf,
  externalMcpEntries,
  hasExternalMcpName,
  legacyDeferOf,
  managedLiveEntry,
  managedState,
  mutationResult,
  readPatch,
  refreshSkillCatalog,
  resolveManagedEntry,
  revealRevision,
  withPatchWrite,
};
