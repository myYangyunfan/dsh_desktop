import z from "@deepseek-ai/schemastery";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { dshHomeDisplay, resolveDshHome } from "@deepseek-ai/dsh-home-paths";
/** The public config schema. */
const Config = z.object({
	/** Upper bound on a single skill file the editor may load (bytes). */
	maxSkillBytes: z.number().min(1).default(524288),
	/** Upper bound on a single rule file the editor may load or write (bytes). */
	maxRuleBytes: z.number().min(1).default(1048576),
	/** Upper bound on a single JSON request body (bytes). */
	maxBodyBytes: z.number().min(1).default(1048576),
	/** Additional absolute composition-file paths the panel may edit (deployment-managed). */
	extraMcpFiles: z.array(z.string()).default([]),
	/** Force the whole panel read-only (no MCP toggle, no skill save, no rule edit, no archive restore/delete). */
	readOnly: z.boolean().default(false),
	/** Upper bound on the session ids one archived-session restore/delete call may address. */
	maxBatchIds: z.number().min(1).default(200),
	/** Allow deleting archived sessions (their durable artifacts) from the panel. */
	allowSessionDelete: z.boolean().default(true),
	/** Durable session-artifact root; empty resolves `$DSH_HOME/sessions` (the JSONL backend's default). */
	sessionsRoot: z.string().default("")
});
/** Normalize raw config (for direct callers that bypass the Loader schema). */
function resolveBasicsConfig(config) {
	return {
		maxSkillBytes: config?.maxSkillBytes ?? 524288,
		maxRuleBytes: config?.maxRuleBytes ?? 1048576,
		maxBodyBytes: config?.maxBodyBytes ?? 1048576,
		extraMcpFiles: config?.extraMcpFiles ?? [],
		readOnly: config?.readOnly ?? false,
		maxBatchIds: config?.maxBatchIds ?? 200,
		allowSessionDelete: config?.allowSessionDelete ?? true,
		sessionsRoot: config?.sessionsRoot ?? ""
	};
}
//#endregion
//#region src/wire.ts
/** One API failure with its wire code and HTTP status. */
var BasicsError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
};
/** Read and parse the JSON request body (bounded; malformed → bad-request). */
async function readJsonBody(req, maxBodyBytes) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > maxBodyBytes) throw new BasicsError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new BasicsError("bad-request", "request body is not valid JSON");
	}
}
/** Write a JSON response with the given status. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(payload);
}
/** Write the success envelope. */
function writeOk(res, value) {
	writeJson(res, 200, {
		ok: true,
		value
	});
}
/** Write the failure envelope for any thrown value (unknown → internal 500). */
function writeError(res, error) {
	if (error instanceof BasicsError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
/** Narrow an unknown payload value to a non-empty string, else throw bad-request. */
function requireString(payload, key) {
	const value = payload?.[key];
	if (typeof value !== "string" || value === "") throw new BasicsError("bad-request", `missing or invalid "${key}"`);
	return value;
}
/** Narrow an unknown payload value to an optional non-empty string. */
function optionalString(payload, key) {
	const value = payload?.[key];
	return typeof value === "string" && value !== "" ? value : void 0;
}
/** Narrow an unknown payload value to a boolean. */
function requireBoolean(payload, key) {
	const value = payload?.[key];
	if (typeof value !== "boolean") throw new BasicsError("bad-request", `missing or invalid "${key}"`);
	return value;
}
/**
* Narrow an unknown payload value to a non-empty list of unique non-empty
* strings (order preserved, duplicates dropped).
*
* The raw list length is checked BEFORE any de-duplication work, so an
* oversized body cannot buy a long synchronous scan; the returned list is
* capped by the same bound.
* @param payload - request payload.
* @param key - the array field name.
* @param max - maximum accepted entries (the batch cap).
* @returns the de-duplicated ids.
*/
function requireStringList(payload, key, max) {
	const value = payload?.[key];
	if (!Array.isArray(value) || value.length === 0) throw new BasicsError("bad-request", `缺少或非法的 "${key}" 列表`);
	if (value.length > max) throw new BasicsError("bad-request", `"${key}" 列表超过单次上限 ${max} 项，请分批操作`);
	const seen = /* @__PURE__ */ new Set();
	const ids = [];
	for (const entry of value) {
		if (typeof entry !== "string" || entry === "") throw new BasicsError("bad-request", `"${key}" 列表中包含非法项`);
		if (seen.has(entry)) continue;
		seen.add(entry);
		ids.push(entry);
	}
	return ids;
}
//#endregion
//#region src/trust-fence.ts
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
/** Whether the request authority matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
/**
* Decide whether one request may reach the plugin routes.
* @param request - node HTTP request facts (headers).
* @param trustedHosts - non-loopback authorities this deployment serves.
* @returns true when the Host is ours (loopback or trusted) and browser markers are same-origin.
*/
function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region src/features/registry.ts
/** Merge every feature's methods; throw on a duplicate method name. */
function collectApi(features, fc) {
	const api = {};
	for (const feature of features) {
		const methods = feature.register(fc);
		for (const [method, handler] of Object.entries(methods)) {
			if (api[method] !== void 0) throw new Error(`basics-panel: duplicate API method "${method}" (from feature "${feature.id}")`);
			api[method] = handler;
		}
	}
	return api;
}
//#endregion
//#region src/atomic.ts
/**
* Shared filesystem helpers: atomic write (temp file + rename, so a reader
* never sees a half-written file) and case-aware path comparison for the
* write allowlist on Windows.
*/
/** Write `content` to `path` atomically (throws a plain Error on failure). */
async function atomicWrite(path, content) {
	const tmp = `${path}.dsh-basics-tmp-${process.pid}`;
	try {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(tmp, content, "utf8");
		await rename(tmp, path);
	} catch (error) {
		await rm(tmp, { force: true }).catch(() => {});
		throw error;
	}
}
/** Compare two absolute paths, case-insensitively on Windows. */
function samePath(left, right) {
	const a = resolve(left);
	const b = resolve(right);
	if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
	return a === b;
}
//#endregion
//#region src/features/skills/frontmatter.ts
/**
* Skill-file frontmatter parsing and editing. A skill file is Markdown with a
* leading YAML frontmatter block delimited by `---` lines. This module splits
* the block from the body, parses it, and edits it through the `yaml` package
* Document API so unknown frontmatter keys and comments survive a save.
*
* Canonical keys (mirroring @deepseek-ai/dsh-skill-filesystem):
*   name, description, whenToUse?, metadata?, disable-model-invocation?,
*   user-invocable?
*/
/** The public skill-name grammar (mirror of dsh-skill's SKILL_NAME). */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Whether a string is a valid kebab-case skill name. */
function isSkillName(name) {
	return SKILL_NAME_RE.test(name);
}
/**
* Split a raw skill file into its frontmatter text and body. Returns
* undefined when the file has no `---`-delimited frontmatter block.
*/
function splitSkillFile(raw) {
	const firstLineEnd = raw.indexOf("\n");
	if (firstLineEnd < 0) return void 0;
	if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return void 0;
	const start = firstLineEnd + 1;
	let lineStart = start;
	while (lineStart <= raw.length) {
		const nextNewline = raw.indexOf("\n", lineStart);
		const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
		if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
			const bodyStart = nextNewline < 0 ? raw.length : nextNewline + 1;
			return {
				frontmatter: raw.slice(start, lineStart),
				body: raw.slice(bodyStart)
			};
		}
		if (nextNewline < 0) return void 0;
		lineStart = nextNewline + 1;
	}
}
/**
* Validate an edit's frontmatter fields, returning the normalized patch to
* apply to the YAML node. Throws a TypeError with a Chinese message on an
* invalid field.
*/
function normalizeSkillPatch(edit) {
	const patch = {};
	if (edit.description !== void 0) {
		if (typeof edit.description !== "string" || edit.description.trim() === "") throw new TypeError("描述不能为空");
		patch.description = edit.description;
	}
	if (edit.whenToUse !== void 0) {
		if (edit.whenToUse === null || edit.whenToUse === "") patch.whenToUse = void 0;
		else patch.whenToUse = edit.whenToUse;
	}
	if (edit.metadata !== void 0) {
		if (edit.metadata === null) patch.metadata = void 0;
		else if (typeof edit.metadata !== "object" || Array.isArray(edit.metadata)) throw new TypeError("metadata 必须是对象");
		else patch.metadata = edit.metadata;
	}
	if (edit.modelInvocable !== void 0) patch["disable-model-invocation"] = edit.modelInvocable ? void 0 : true;
	if (edit.userInvocable !== void 0) patch["user-invocable"] = edit.userInvocable ? void 0 : false;
	return patch;
}
/** Apply a patch map to a frontmatter YAML node, preserving unknown keys and comments. */
function applyPatch(doc, patch) {
	let root = doc.contents;
	if (root === null) {
		doc.contents = doc.createNode({});
		root = doc.contents;
	}
	if (!isMap(root)) throw new TypeError("frontmatter 必须是 YAML 映射");
	for (const [key, value] of Object.entries(patch)) if (value === void 0) root.delete(key);
	else root.set(key, value);
}
/**
* Apply a skill edit to a raw skill file. The edit is validated, the
* frontmatter is patched in place (round-tripped through the yaml Document so
* unknown keys and comments survive), and the body is replaced when supplied.
* Returns the full edited file text.
*/
function applySkillEdit(raw, edit) {
	const parts = splitSkillFile(raw);
	if (parts === void 0) throw new TypeError("技能文件缺少 frontmatter 块");
	const patch = normalizeSkillPatch(edit);
	const doc = parseDocument(parts.frontmatter);
	if (doc.errors.length > 0) throw new TypeError("frontmatter YAML 解析失败");
	applyPatch(doc, patch);
	const data = doc.toJS();
	if (typeof data?.name !== "string" || !isSkillName(data.name)) throw new TypeError("技能 name 非法（必须为 kebab-case）");
	if (typeof data?.description !== "string" || data.description.trim() === "") throw new TypeError("技能 description 不能为空");
	return `---\n${doc.toString().trimEnd()}\n---\n${edit.body ?? parts.body}`;
}
//#endregion
//#region src/features/skills/skills-service.ts
/**
* Skills feature (host): list skills grouped by scope, load one skill for
* editing, and save an edit back to the skill file. Reads/writes go through
* the filesystem provider's own paths (resolved via `ctx.skills`), so the
* registry — not this plugin — is the authority on where a skill lives; a
* save re-resolves the path from the registry to avoid path spoofing.
*/
/** Map a provider `source` string to a scope key. */
function scopeOfSource(source) {
	switch (source) {
		case "project-dsh":
		case "project-agents": return "project";
		case "custom": return "custom";
		case "user-dsh":
		case "user-agents": return "user";
		case "bundled": return "bundled";
		case "runtime": return "runtime";
		default: return "other";
	}
}
/** Order of scope groups in the list. */
const SCOPE_ORDER = [
	"project",
	"custom",
	"user",
	"bundled",
	"runtime",
	"other"
];
/** Whether a definition may be edited through the panel. */
function isEditable(def) {
	return def.path !== void 0 && def.source !== "bundled" && def.source !== "runtime";
}
/** Whether a summary's source denotes an editable skill (path resolved later on open). */
function sourceEditable(source) {
	return source !== "bundled" && source !== "runtime";
}
/** Display location from a summary's resource base. */
function locationOf(summary) {
	if (summary.resourceBase?.kind === "directory" && summary.resourceBase.path !== void 0) return summary.resourceBase.path;
	if (summary.resourceBase?.kind === "url" && summary.resourceBase.url !== void 0) return summary.resourceBase.url;
}
function toRow(summary, readOnly) {
	const location = locationOf(summary);
	return {
		name: summary.name,
		description: summary.description,
		...summary.whenToUse !== void 0 ? { whenToUse: summary.whenToUse } : {},
		modelInvocable: summary.invocation.modelInvocable,
		userInvocable: summary.invocation.userInvocable,
		source: summary.source,
		provider: summary.provider,
		...location !== void 0 ? { location } : {},
		editable: !readOnly && sourceEditable(summary.source)
	};
}
/** Read the raw skill file body (untrimmed) plus its mtime, falling back to the definition's trimmed content. */
async function readRawBody(def) {
	if (def.path === void 0) return { body: def.content };
	try {
		const [raw, info] = await Promise.all([readFile(def.path, "utf8"), stat(def.path)]);
		return {
			body: splitSkillFile(raw)?.body ?? def.content,
			mtime: info.mtimeMs
		};
	} catch {
		return { body: def.content };
	}
}
/** Build the skills feature API. */
function registerSkills(fc) {
	const { ctx, resolved } = fc;
	const cwdOf = (payload) => {
		const cwd = optionalString(payload, "cwd");
		return cwd === void 0 ? fc.sessionCwdOf(payload) : cwd;
	};
	/** The most recently registered live top-level Agent (the newest open session). */
	const lastLiveAgent = (agents) => {
		try {
			const roots = typeof agents.roots === "function" ? agents.roots() : agents.list?.() ?? [];
			return roots[roots.length - 1];
		} catch {
			return;
		}
	};
	/**
	* Resolve the viewing scope key (the live Agent) so preset-scoped skill
	* providers are included. DSH ≥0.1.7 mounts the filesystem skill provider
	* inside each session preset's composition, so a read with no scope observes
	* the global layer alone — which holds no skills at all. When the caller
	* cannot name a live session, fall back to the newest live Agent and report
	* that choice instead of rendering a silently empty list.
	*/
	const resolveScope = (payload) => {
		const record = payload;
		const sessionId = typeof record?.sessionId === "string" ? record.sessionId : "";
		const agents = ctx.get("agents");
		if (agents !== void 0 && typeof agents.get === "function") {
			if (sessionId !== "") try {
				const agent = agents.get(sessionId);
				if (agent !== void 0) return {
					scope: agent,
					sessionId,
					source: "session"
				};
			} catch {}
			const fallback = lastLiveAgent(agents);
			if (fallback !== void 0) return {
				scope: fallback,
				...typeof fallback.id === "string" && fallback.id !== "" ? { sessionId: fallback.id } : {},
				source: "fallback"
			};
		}
		return { source: "none" };
	};
	const view = (payload) => {
		const cwd = cwdOf(payload);
		const { scope } = resolveScope(payload);
		return {
			cwd,
			...scope !== void 0 ? { scope } : {}
		};
	};
	const list = async (payload) => {
		const cwd = cwdOf(payload);
		const { scope, sessionId, source } = resolveScope(payload);
		const snapshot = await ctx.skills.snapshot({
			...cwd !== void 0 ? { cwd } : {},
			...scope !== void 0 ? { scope } : {}
		});
		const groups = /* @__PURE__ */ new Map();
		for (const summary of snapshot.skills) {
			const scopeKey = scopeOfSource(summary.source);
			const bucket = groups.get(scopeKey) ?? [];
			bucket.push(toRow(summary, resolved.readOnly));
			groups.set(scopeKey, bucket);
		}
		return {
			groups: SCOPE_ORDER.filter((key) => groups.has(key)).map((key) => ({
				scope: key,
				skills: groups.get(key)
			})),
			complete: snapshot.complete,
			scopeSource: source,
			...sessionId !== void 0 ? { sessionId } : {}
		};
	};
	const get = async (payload) => {
		const name = requireString(payload, "name");
		const def = await ctx.skills.get(name, view(payload));
		if (def === void 0) throw new BasicsError("not-found", `技能 "${name}" 不存在`, 404);
		const { body, mtime } = await readRawBody(def);
		return {
			name: def.name,
			description: def.description,
			...def.whenToUse !== void 0 ? { whenToUse: def.whenToUse } : {},
			...def.metadata !== void 0 ? { metadata: def.metadata } : {},
			modelInvocable: def.invocation.modelInvocable,
			userInvocable: def.invocation.userInvocable,
			body,
			...def.path !== void 0 ? { path: def.path } : {},
			source: def.source,
			provider: def.provider,
			editable: !resolved.readOnly && isEditable(def),
			...mtime !== void 0 ? { mtime } : {}
		};
	};
	const save = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const name = requireString(payload, "name");
		const record = payload;
		const expectedMtime = typeof record?.expectedMtime === "number" ? record.expectedMtime : void 0;
		const edit = record?.edit ?? {};
		const def = await ctx.skills.get(name, view(payload));
		if (def === void 0) throw new BasicsError("not-found", `技能 "${name}" 不存在`, 404);
		if (!isEditable(def)) throw new BasicsError("skill-error", "该技能为只读（内置或运行时技能）", 403);
		const path = def.path;
		let raw;
		let mtime;
		try {
			raw = await readFile(path, "utf8");
			mtime = (await stat(path)).mtimeMs;
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取技能文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		if (expectedMtime !== void 0 && mtime !== void 0 && Math.abs(expectedMtime - mtime) > 1) throw new BasicsError("conflict", "技能文件已被修改，请刷新后重试", 409);
		let next;
		try {
			next = applySkillEdit(raw, edit);
		} catch (error) {
			throw new BasicsError("skill-error", error instanceof Error ? error.message : String(error), 400);
		}
		if (Buffer.byteLength(next, "utf8") > resolved.maxSkillBytes) throw new BasicsError("skill-error", `技能文件超过大小上限 ${resolved.maxSkillBytes} 字节`, 400);
		try {
			await atomicWrite(path, next);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入技能文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const info = await stat(path).catch(() => void 0);
		return {
			ok: true,
			...info !== void 0 ? { mtime: info.mtimeMs } : {}
		};
	};
	return {
		"skills.list": list,
		"skills.get": get,
		"skills.save": save
	};
}
//#endregion
//#region src/features/mcp/composition-scan.ts
/**
* Composition scanning: locate every source that may declare MCP servers and
* extract the `mcp-client` rows it holds.
*
* Sources are (a) the profile patch layers (home-level and per-profile),
* (b) the agent-preset declarations those files carry — DSH ≥0.1.7 keeps a
* preset's composition in the declaration row's `config.plugins`, so a preset
* is scanned by descending into that list, (c) agent-preset declarations
* mounted from installed bundles, whose effective `config` is read from the
* Loader entry and which stay read-only, and (d) any deployment-declared extra
* files. Legacy directory presets (`$DSH_HOME/.agent-presets/<id>/`) are read
* only when no agent-preset roster service exists: DSH ≥0.1.7 reads no such
* directory, so listing it would show inert configuration.
*/
/** Whether a plugin module specifier names the MCP client bridge. */
function isMcpClientName(name) {
	return typeof name === "string" && /mcp-client/.test(name);
}
/** Whether a plugin module specifier names the agent-preset declaration. */
function isAgentPresetName(name) {
	return typeof name === "string" && /dsh-agent-preset/.test(name);
}
/** Preset identity a declaration publishes (`config.id`), when it is readable. */
function presetIdOfConfig(config) {
	if (config === null || typeof config !== "object") return void 0;
	const id = config.id;
	return typeof id === "string" && id !== "" ? id : void 0;
}
/** Read one `mcp-client` row from a composition row object. */
function toRowFile(obj, presetId) {
	const config = obj.config ?? {};
	return {
		rowId: typeof obj.id === "string" ? obj.id : null,
		serverName: typeof config.serverName === "string" ? config.serverName : "",
		disabled: obj.disabled === true,
		config,
		...presetId !== void 0 ? { presetId } : {}
	};
}
/**
* Walk a composition value, collecting `mcp-client` rows. A preset declaration
* re-scopes the rows below it to that preset; an `insert` list and a group's
* child list are walked in place.
*/
function walkValue(node, presetId, rows) {
	if (Array.isArray(node)) {
		for (const item of node) walkValue(item, presetId, rows);
		return;
	}
	if (node === null || typeof node !== "object") return;
	const obj = node;
	if (isAgentPresetName(obj.name)) {
		const declared = presetIdOfConfig(obj.config);
		if (declared === void 0) return;
		walkValue(obj.config?.plugins, declared, rows);
		return;
	}
	if (Array.isArray(obj.insert)) for (const item of obj.insert) walkValue(item, presetId, rows);
	if (isMcpClientName(obj.name)) rows.push(toRowFile(obj, presetId));
	if (Array.isArray(obj.config)) walkValue(obj.config, presetId, rows);
}
/** Every MCP row declared in one already-parsed composition value. */
function collectMcpRowsFromValue(value) {
	const rows = [];
	walkValue(value, void 0, rows);
	return rows;
}
/** Every MCP row declared in one already-parsed preset plugin list. */
function collectPresetRows(presetId, plugins) {
	const rows = [];
	walkValue(plugins, presetId, rows);
	return rows;
}
/**
* Extract every `mcp-client` row from a composition document (a top-level YAML
* array). Handles profile patch entries (`{insert: [...]}`), plain rows, preset
* declarations (`{id, name, config: {plugins}}`) and entry groups alike.
*/
function collectMcpRows(text) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return [];
	return collectMcpRowsFromValue(doc.toJS());
}
/** Group rows by their owning preset, preserving declaration order. */
function byPreset(rows) {
	const groups = /* @__PURE__ */ new Map();
	for (const row of rows) {
		if (row.presetId === void 0) continue;
		const bucket = groups.get(row.presetId) ?? [];
		bucket.push(row);
		groups.set(row.presetId, bucket);
	}
	return groups;
}
async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
async function listDirs(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
	} catch {
		return [];
	}
}
async function rowsOf(path) {
	try {
		return collectMcpRows(await readFile(path, "utf8"));
	} catch {
		return [];
	}
}
/** Preset declarations mounted from installed bundles, with their live config. */
function loaderPresetRows(ctx) {
	const found = [];
	try {
		const loader = ctx.get("loader");
		if (loader === void 0 || typeof loader.entries !== "function") return found;
		for (const entry of loader.entries()) {
			if (!isAgentPresetName(entry.options?.name)) continue;
			const config = entry.options?.config;
			const id = presetIdOfConfig(config) ?? entry.options?.id;
			if (typeof id !== "string" || id === "") continue;
			const plugins = config?.plugins;
			found.push({
				id,
				rows: collectPresetRows(id, plugins)
			});
		}
	} catch {}
	return found;
}
/**
* Legacy directory presets (`$DSH_HOME/.agent-presets/<id>/agent.cordis.yml`),
* the DSH ≤0.1.6 layout. Read only when no roster service answers, because
* DSH ≥0.1.7 mounts no such directory (its own migration guide says so).
*/
async function legacyDirectoryPresets(ctx) {
	if (ctx.get("agentPresets") !== void 0) return [];
	const root = join(resolveDshHome(), ".agent-presets");
	const sources = [];
	for (const id of await listDirs(root)) {
		const path = join(root, id, "agent.cordis.yml");
		if (!await isFile(path)) continue;
		sources.push({
			scope: "preset",
			scopeLabel: id,
			path,
			readOnly: false,
			rows: await rowsOf(path)
		});
	}
	return sources;
}
/** Discover every composition source and its MCP rows. */
async function scanMcpSources(ctx, resolved) {
	const home = resolveDshHome();
	const profiles = [];
	const presets = [];
	const seenPresets = /* @__PURE__ */ new Set();
	/** Split one file's rows into its profile source and one source per preset. */
	const addFile = (scopeLabel, path, rows) => {
		profiles.push({
			scope: "profile",
			scopeLabel,
			path,
			readOnly: false,
			rows: rows.filter((row) => row.presetId === void 0)
		});
		for (const [presetId, presetRows] of byPreset(rows)) {
			seenPresets.add(presetId);
			presets.push({
				scope: "preset",
				scopeLabel: presetId,
				path,
				readOnly: false,
				rows: presetRows
			});
		}
	};
	const homePatch = join(home, "cordis.patch.yml");
	if (await isFile(homePatch)) addFile("home", homePatch, await rowsOf(homePatch));
	for (const profileName of await listDirs(join(home, "profiles"))) {
		const path = join(home, "profiles", profileName, "cordis.patch.yml");
		if (await isFile(path)) addFile(profileName, path, await rowsOf(path));
	}
	for (const extra of resolved.extraMcpFiles) if (await isFile(extra)) addFile("extra", extra, await rowsOf(extra));
	presets.push(...await legacyDirectoryPresets(ctx));
	for (const preset of loaderPresetRows(ctx)) {
		if (seenPresets.has(preset.id) || preset.rows.length === 0) continue;
		seenPresets.add(preset.id);
		presets.push({
			scope: "preset",
			scopeLabel: preset.id,
			path: "",
			readOnly: true,
			rows: preset.rows
		});
	}
	return [...profiles, ...presets.filter((source) => source.rows.length > 0)];
}
//#endregion
//#region src/features/mcp/yaml-edit.ts
/**
* Round-trip editing of a composition document: flip one row's `disabled`
* flag or update one row's `config`, while preserving comments and every other
* key. Editing works on the yaml Document node tree (never on the plain JS
* value) so the file text other than the edited keys is byte-stable.
*
* A target names its scope: a profile row lives at the document's top level or
* inside an `insert` list, while a preset row lives inside the `plugins` list
* of an `@deepseek-ai/dsh-agent-preset` declaration (DSH ≥0.1.7 composition
* shape). The lookup therefore descends into preset declarations and entry
* groups, and never matches a row from a different scope than the target asks
* for — two presets may declare servers with the same name.
*/
/** Read a scalar node as a string (empty for non-scalars). */
function scalarString(node) {
	if (!isScalar(node)) return "";
	const value = node.value;
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
/** Whether the row at hand matches the target inside the scope being walked. */
function considerRow(map, target, presetId) {
	if (!isMcpClientName(scalarString(map.get("name", true)))) return void 0;
	if ((target.presetId ?? null) !== presetId) return void 0;
	const config = map.get("config", true);
	const serverName = isMap(config) ? scalarString(config.get("serverName", true)) : "";
	if (serverName !== "" && serverName === target.serverName) return map;
	if (target.rowId != null && scalarString(map.get("id", true)) === target.rowId) return map;
}
/**
* Locate the YAML mapping of the row matching `target`, walking insert lists,
* entry-group child lists and preset declarations alike.
*/
function findRowNode(node, target, presetId) {
	if (isSeq(node)) {
		for (const item of node.items) {
			const found = findRowNode(item, target, presetId);
			if (found !== void 0) return found;
		}
		return;
	}
	if (!isMap(node)) return void 0;
	if (isAgentPresetName(scalarString(node.get("name", true)))) {
		const config = node.get("config", true);
		if (!isMap(config)) return void 0;
		const declared = scalarString(config.get("id", true));
		if (declared === "" || (target.presetId ?? null) !== declared) return void 0;
		return findRowNode(config.get("plugins", true), target, declared);
	}
	const insert = node.get("insert", true);
	if (isSeq(insert)) for (const item of insert.items) {
		const found = findRowNode(item, target, presetId);
		if (found !== void 0) return found;
	}
	const config = node.get("config", true);
	if (isSeq(config)) {
		const found = findRowNode(config, target, presetId);
		if (found !== void 0) return found;
	}
	return considerRow(node, target, presetId);
}
/**
* Flip one row's `disabled` flag in a composition document. `disabled === true`
* adds the flag; `false` removes it (the Loader default). Returns the edited
* text, or the original text with `ok: false` when the row or document is
* unparsable/unfound.
*/
function setRowDisabled(text, target, disabled) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return {
		ok: false,
		text
	};
	const row = findRowNode(doc.contents, target, null);
	if (row === void 0) return {
		ok: false,
		text
	};
	if (disabled) row.set("disabled", true);
	else row.delete("disabled");
	return {
		ok: true,
		text: doc.toString()
	};
}
/**
* Append a new row to a composition document. The row lands inside an existing
* top-level `insert` list when one is present, otherwise a fresh `insert` block
* is created; an empty document is seeded with one. Comments and every other
* key stay byte-stable because the edit happens on the node tree.
*/
function addRow(text, row) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return {
		ok: false,
		text
	};
	const node = doc.createNode(row);
	const contents = doc.contents;
	if (contents === null) {
		doc.contents = doc.createNode([{ insert: [row] }]);
		return {
			ok: true,
			text: doc.toString()
		};
	}
	if (isSeq(contents)) {
		let insert;
		for (const item of contents.items) {
			if (!isMap(item)) continue;
			const candidate = item.get("insert", true);
			if (isSeq(candidate)) {
				insert = candidate;
				break;
			}
		}
		if (insert !== void 0) insert.items.push(node);
		else contents.items.push(doc.createNode({ insert: [row] }));
		return {
			ok: true,
			text: doc.toString()
		};
	}
	if (isMap(contents)) {
		const existing = contents.get("insert", true);
		if (isSeq(existing)) existing.items.push(node);
		else contents.set("insert", doc.createNode([row]));
		return {
			ok: true,
			text: doc.toString()
		};
	}
	return {
		ok: false,
		text
	};
}
/**
* Update one row's `config` mapping in place. A null/absent patch value is
* skipped; an explicit null deletes the key. Values are converted through the
* document's node factory so nested objects/arrays serialize correctly.
*/
function setRowConfig(text, target, patch) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return {
		ok: false,
		text
	};
	const row = findRowNode(doc.contents, target, null);
	if (row === void 0) return {
		ok: false,
		text
	};
	const rawConfig = row.get("config", true);
	const config = isMap(rawConfig) ? rawConfig : doc.createNode({});
	if (!isMap(rawConfig)) row.set("config", config);
	for (const [key, value] of Object.entries(patch)) {
		if (value === void 0) continue;
		if (value === null) config.delete(key);
		else config.set(key, doc.createNode(value));
	}
	return {
		ok: true,
		text: doc.toString()
	};
}
//#endregion
//#region src/features/mcp/secret-mask.ts
/**
* Secret masking for MCP server config. The panel never ships a raw secret
* across the wire: env values, header values, URL userinfo passwords, and
* the value that follows a sensitive command-line flag are replaced with a
* fixed marker. The host keeps the raw config in memory only.
*/
/** The display marker for a masked secret. */
const MASK = "••••";
/** Command-line flags whose following argument is a secret. */
const SENSITIVE_FLAG = /^--?(password|passwd|pass|token|secret|api[-_]?key|authorization)$/i;
/** Mask every value in an env/header-style map, keeping the keys. */
function maskValues(map) {
	if (map === void 0) return void 0;
	const out = {};
	for (const key of Object.keys(map)) out[key] = MASK;
	return out;
}
/** Mask the argument that follows a sensitive flag; everything else verbatim. */
function maskArgs(args) {
	if (args === void 0) return void 0;
	const out = [...args];
	for (let i = 0; i < out.length; i += 1) {
		const token = out[i];
		if (token !== void 0 && SENSITIVE_FLAG.test(token) && i + 1 < out.length) {
			out[i + 1] = MASK;
			i += 1;
		}
	}
	return out;
}
/** Mask the password in a URL's userinfo (e.g. http://user:pass@host). */
function maskUrl(url) {
	if (url === void 0) return void 0;
	try {
		const parsed = new URL(url);
		if (parsed.password !== "") {
			parsed.password = MASK;
			return parsed.toString();
		}
		return url;
	} catch {
		return url;
	}
}
//#endregion
//#region src/features/mcp/mcp-service.ts
/**
* MCP feature (host): list every MCP server grouped by source scope, report
* its masked config and live runtime status, toggle a server on/off by
* flipping the `disabled` flag in its source file (profile patches hot-reload;
* preset compositions take effect for new sessions), and append a new server
* row into an editable patch layer.
*/
function maskedView(row, editable, mounted, toolCount, probe) {
	const c = row.config;
	const transport = c.transport === "streamable-http" ? "streamable-http" : c.transport === "stdio" ? "stdio" : "unknown";
	return {
		rowId: row.rowId,
		serverName: row.serverName,
		transport,
		disabled: row.disabled,
		editable,
		...typeof c.command === "string" ? { command: c.command } : {},
		...Array.isArray(c.args) ? { args: maskArgs(c.args) } : {},
		...typeof c.env === "object" && c.env !== null ? { env: maskValues(c.env) } : {},
		...typeof c.cwd === "string" && c.cwd !== "" ? { cwd: c.cwd } : {},
		...typeof c.url === "string" ? { url: maskUrl(c.url) } : {},
		...typeof c.headers === "object" && c.headers !== null ? { headers: maskValues(c.headers) } : {},
		...typeof c.toolCallTimeoutMs === "number" ? { toolCallTimeoutMs: c.toolCallTimeoutMs } : {},
		runtime: {
			mounted,
			toolCount,
			probe
		}
	};
}
/** Restore masked placeholders against the raw config so unchanged secrets survive a save. */
function resolveMaskedPatch(patch, raw) {
	const out = { ...patch };
	const rawArgs = Array.isArray(raw.args) ? raw.args : void 0;
	if (Array.isArray(out.args) && rawArgs !== void 0) out.args = out.args.map((value, index) => value === "••••" && rawArgs[index] !== void 0 ? rawArgs[index] : value);
	const rawEnv = typeof raw.env === "object" && raw.env !== null ? raw.env : void 0;
	if (out.env !== null && out.env !== void 0 && rawEnv !== void 0) {
		const env = { ...out.env };
		for (const key of Object.keys(env)) if (env[key] === "••••" && rawEnv[key] !== void 0) env[key] = rawEnv[key];
		out.env = env;
	}
	if (typeof out.url === "string" && out.url.includes("••••") && typeof raw.url === "string") out.url = raw.url;
	return out;
}
/** Cross-reference the loader tree and tool registry for live status. */
function runtimeFacts(ctx) {
	const mountedByServer = /* @__PURE__ */ new Map();
	try {
		const loader = ctx.get("loader");
		if (loader !== void 0 && typeof loader.entries === "function") for (const entry of loader.entries()) {
			const name = entry.options?.name ?? "";
			if (!/mcp-client/.test(name)) continue;
			const cfg = entry.options?.config;
			const serverName = cfg !== void 0 && typeof cfg.serverName === "string" ? cfg.serverName : "";
			if (serverName !== "") mountedByServer.set(serverName, !entry.disabled);
		}
	} catch {}
	let toolNames = [];
	try {
		toolNames = ctx.tools.schemas().map((schema) => schema.name);
	} catch {
		toolNames = [];
	}
	return {
		mountedByServer,
		toolNames
	};
}
function toolCountFor(serverName, toolNames) {
	const prefix = `mcp__${serverName}__`;
	let count = 0;
	for (const name of toolNames) if (name.startsWith(prefix)) count += 1;
	return count;
}
/**
* The cordis `FiberState.ACTIVE` ordinal. The inventory reports the raw numeric
* enum (0 PENDING, 1 LOADING, 2 ACTIVE, 3 FAILED, 4 DISPOSED, 5 UNLOADING), so
* a string comparison would silently read every row as inactive.
*/
const FIBER_STATE_ACTIVE = 2;
/**
* Live activation of the MCP rows inside each preset's composition, keyed
* `presetId::rowId`. A preset's plugins mount in that preset's own scoped
* world, so the host Loader tree and tool registry cannot see them; the preset
* registry's inventory is the only host-side witness that the row activated.
* A row the inventory reports without a fiber state stays out of the map, which
* the caller reads as "activation unknown" rather than "not active".
*/
async function presetRowStates(ctx) {
	const states = /* @__PURE__ */ new Map();
	const agentPresets = ctx.get("agentPresets");
	if (agentPresets === void 0 || typeof agentPresets.compositionInventory !== "function") return states;
	try {
		for (const preset of await agentPresets.compositionInventory()) for (const row of preset.rows) {
			if (row.entryId === null || !isMcpClientName(row.moduleName)) continue;
			if (typeof row.fiberState !== "number") continue;
			states.set(`${preset.id}::${row.entryId}`, row.fiberState === FIBER_STATE_ACTIVE);
		}
	} catch {}
	return states;
}
/** Build the MCP feature API. */
function registerMcp(fc) {
	const { ctx, resolved } = fc;
	const list = async () => {
		const sources = await scanMcpSources(ctx, resolved);
		const { mountedByServer, toolNames } = runtimeFacts(ctx);
		const presetStates = await presetRowStates(ctx);
		return { groups: sources.map((source) => ({
			scope: source.scope,
			scopeLabel: source.scopeLabel,
			path: source.path,
			readOnly: source.readOnly,
			servers: source.rows.map((row) => {
				const editable = !resolved.readOnly && !source.readOnly;
				if (source.scope === "preset") {
					const state = row.rowId === null ? void 0 : presetStates.get(`${source.scopeLabel}::${row.rowId}`);
					return maskedView(row, editable, state === true, 0, state === void 0 ? "unknown" : "preset");
				}
				return maskedView(row, editable, mountedByServer.get(row.serverName) ?? false, toolCountFor(row.serverName, toolNames), "global");
			})
		})) };
	};
	/**
	* Resolve the addressed row inside the editable scan. A file may declare the
	* same server name in its profile rows and inside a preset declaration, so
	* the client's `presetId` (the group it rendered) selects the scope; without
	* it the first source holding a matching row wins, which keeps older client
	* bundles working.
	*/
	const resolveTarget = (sources, path, match, presetId) => {
		const candidates = sources.filter((s) => s.path !== "" && !s.readOnly && samePath(s.path, path));
		if (candidates.length === 0) throw new BasicsError("forbidden", "该文件不在可编辑范围内", 403);
		for (const source of candidates) {
			if (presetId !== null && (source.scope !== "preset" || source.scopeLabel !== presetId)) continue;
			const row = source.rows.find(match);
			if (row !== void 0) return {
				source,
				row
			};
		}
		throw new BasicsError("not-found", "配置中未找到对应的 MCP 服务器行", 404);
	};
	const setEnabled = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const path = requireString(payload, "path");
		const serverName = requireString(payload, "serverName");
		const rowId = optionalString(payload, "rowId") ?? null;
		const enabled = requireBoolean(payload, "enabled");
		const presetId = optionalString(payload, "presetId") ?? null;
		const sources = await scanMcpSources(ctx, resolved);
		const { source, row } = resolveTarget(sources, path, (r) => r.serverName === serverName || rowId !== null && r.rowId === rowId, presetId);
		let text;
		try {
			text = await readFile(path, "utf8");
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const result = setRowDisabled(text, {
			rowId,
			serverName,
			presetId: row.presetId ?? null
		}, !enabled);
		if (!result.ok) throw new BasicsError("mcp-error", `配置中未找到服务器 "${serverName}" 对应的行`, 400);
		try {
			await atomicWrite(path, result.text);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		return {
			ok: true,
			disabled: !enabled,
			takesEffect: source.scope === "preset" ? "new-session" : "live"
		};
	};
	const save = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const path = requireString(payload, "path");
		const serverName = requireString(payload, "serverName");
		const rowId = optionalString(payload, "rowId") ?? null;
		const presetId = optionalString(payload, "presetId") ?? null;
		const patch = payload?.patch ?? {};
		const sources = await scanMcpSources(ctx, resolved);
		const { row } = resolveTarget(sources, path, (r) => r.serverName === serverName || rowId !== null && r.rowId === rowId, presetId);
		let text;
		try {
			text = await readFile(path, "utf8");
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const result = setRowConfig(text, {
			rowId,
			serverName,
			presetId: row.presetId ?? null
		}, resolveMaskedPatch(patch, row.config));
		if (!result.ok) throw new BasicsError("mcp-error", `配置中未找到服务器 "${serverName}" 对应的行`, 400);
		try {
			await atomicWrite(path, result.text);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		return { ok: true };
	};
	/**
	* Append a new `mcp-client` row. Without an explicit `path` the row lands in
	* the first editable profile source, falling back to the home-level patch when
	* the deployment has none yet — the empty-state case this method exists for.
	*/
	const create = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const serverName = requireString(payload, "serverName");
		const transport = requireString(payload, "transport");
		if (transport !== "stdio" && transport !== "streamable-http") throw new BasicsError("bad-request", "非法的传输方式 \"transport\"（仅 stdio / streamable-http）");
		const record = payload ?? {};
		const command = optionalString(payload, "command");
		const url = optionalString(payload, "url");
		const cwd = optionalString(payload, "cwd");
		const args = Array.isArray(record.args) ? record.args.filter((value) => typeof value === "string") : void 0;
		const envValue = record.env;
		const env = envValue !== null && typeof envValue === "object" && !Array.isArray(envValue) ? envValue : void 0;
		const toolCallTimeoutMs = typeof record.toolCallTimeoutMs === "number" ? record.toolCallTimeoutMs : void 0;
		const sources = await scanMcpSources(ctx, resolved);
		if (sources.some((source) => source.rows.some((row) => row.serverName === serverName))) throw new BasicsError("conflict", `MCP 服务器 "${serverName}" 已存在`, 409);
		const pathParam = optionalString(payload, "path");
		let target;
		if (pathParam !== void 0) {
			const source = sources.find((candidate) => candidate.path !== "" && !candidate.readOnly && samePath(candidate.path, pathParam));
			if (source === void 0) throw new BasicsError("forbidden", "该文件不在可编辑范围内", 403);
			target = source.path;
		} else target = sources.find((source) => source.scope === "profile" && !source.readOnly)?.path ?? join(resolveDshHome(), "cordis.patch.yml");
		const config = {
			serverName,
			transport
		};
		if (command !== void 0) config.command = command;
		if (url !== void 0) config.url = url;
		if (cwd !== void 0) config.cwd = cwd;
		if (args !== void 0) config.args = args;
		if (env !== void 0) config.env = env;
		if (toolCallTimeoutMs !== void 0) config.toolCallTimeoutMs = toolCallTimeoutMs;
		let text = "";
		try {
			text = await readFile(target, "utf8");
		} catch {
			text = "";
		}
		const result = addRow(text, {
			id: `mcp-${serverName}`,
			name: "@deepseek-ai/dsh-mcp-client",
			config
		});
		if (!result.ok) throw new BasicsError("mcp-error", "无法解析 MCP 组合文件以追加新服务器", 400);
		try {
			await atomicWrite(target, result.text);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		return {
			ok: true,
			serverName,
			path: target
		};
	};
	return {
		"mcp.list": list,
		"mcp.setEnabled": setEnabled,
		"mcp.save": save,
		"mcp.create": create
	};
}
//#endregion
//#region src/features/rules/scan.ts
/**
* Rule-file discovery (host, pure functions): mirrors the authoritative
* discovery of @deepseek-ai/dsh-agent-instructions — a fixed user-global
* `AGENTS.md` under the harness home, plus the candidate instruction files on
* the project-root-to-cwd directory chain. The panel never trusts a
* client-supplied path: every read/save/create re-resolves candidates from
* these functions, and the service re-checks the resolved path against the
* freshly discovered set.
*
* Candidates mirror the DSH defaults:
*   base:  AGENTS.md, CLAUDE.md
*   local: AGENTS.local.md, CLAUDE.local.md
*   project root marker: .git
*/
/** The fixed user-global rule file name (mirror of dsh-agent-instructions' USER_GLOBAL_FILE). */
const RULES_GLOBAL_FILE = "AGENTS.md";
/** Ordered base candidates per directory (highest precedence first). */
const RULES_BASE_CANDIDATES = ["AGENTS.md", "CLAUDE.md"];
/** Ordered local-overlay candidates per directory (loaded after the base files). */
const RULES_LOCAL_CANDIDATES = ["AGENTS.local.md", "CLAUDE.local.md"];
/** Every candidate file the panel may create. */
const RULES_ALL_CANDIDATES = [...RULES_BASE_CANDIDATES, ...RULES_LOCAL_CANDIDATES];
/** Directory entries that identify the project root while walking upward. */
const RULES_ROOT_MARKERS = [".git"];
/** Probe whether a path exists on the host filesystem. */
async function fileExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
/**
* Walk upward from `cwd` to the first directory containing a root marker.
* @returns the discovered project root, or `cwd` itself when no marker exists.
*/
async function findProjectRoot(cwd, markers = RULES_ROOT_MARKERS, exists = fileExists) {
	let dir = resolve(cwd);
	for (;;) {
		for (const marker of markers) if (await exists(join(dir, marker))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return resolve(cwd);
		dir = parent;
	}
}
/**
* Build the inclusive root-to-cwd directory chain.
* @param root - project root directory.
* @param cwd - most-specific directory in the chain.
* @returns directories ordered from broadest (root) to most specific (cwd).
*/
function ancestorChain(root, cwd) {
	const chain = [];
	let dir = resolve(cwd);
	const rootResolved = resolve(root);
	for (;;) {
		chain.unshift(dir);
		if (dir === rootResolved) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return chain;
}
/**
* Discover every existing rule file for a session cwd: the user-global file
* first, then the root-to-cwd chain candidates.
* @param options - cwd, harness home, display form of the home (e.g. `~/.dsh`), probe.
* @returns discovered files in precedence order (global first, then broadest→most specific).
*/
async function discoverRuleFiles(options) {
	const exists = options.exists ?? fileExists;
	const displayHome = options.displayHome ?? options.dshHome;
	const files = [];
	const globalPath = join(options.dshHome, RULES_GLOBAL_FILE);
	if (await exists(globalPath)) files.push({
		scope: "global",
		fileName: RULES_GLOBAL_FILE,
		absolutePath: globalPath,
		displayPath: `${displayHome.replaceAll("\\", "/")}/${RULES_GLOBAL_FILE}`,
		directory: options.dshHome
	});
	const cwd = resolve(options.cwd);
	const root = options.projectRoot ?? await findProjectRoot(cwd, RULES_ROOT_MARKERS, exists);
	for (const dir of ancestorChain(root, cwd)) for (const candidate of [...RULES_BASE_CANDIDATES, ...RULES_LOCAL_CANDIDATES]) {
		const absolutePath = join(dir, candidate);
		if (await exists(absolutePath)) files.push({
			scope: "project",
			fileName: candidate,
			absolutePath,
			displayPath: relative(root, absolutePath).replaceAll("\\", "/"),
			directory: dir
		});
	}
	return files;
}
/**
* Resolve the target path of a create request against the allowlist.
* @returns the resolved target, or undefined when the scope/file combo is not allowed.
*   - `global` allows only AGENTS.md under the harness home;
*   - `project` places the file at the project root;
*   - `cwd` places the file at the current working directory.
*/
async function createRulePath(options) {
	const { scope, fileName } = options;
	if (!RULES_ALL_CANDIDATES.includes(fileName)) return void 0;
	const displayHome = options.displayHome ?? options.dshHome;
	const exists = options.exists ?? fileExists;
	if (scope === "global") {
		if (fileName !== "AGENTS.md") return void 0;
		return {
			scope: "global",
			fileName,
			absolutePath: join(options.dshHome, fileName),
			displayPath: `${displayHome.replaceAll("\\", "/")}/${fileName}`,
			directory: options.dshHome
		};
	}
	if (scope === "cwd") {
		const directory = resolve(options.cwd);
		return {
			scope: "project",
			fileName,
			absolutePath: join(directory, fileName),
			displayPath: fileName,
			directory
		};
	}
	const directory = await findProjectRoot(resolve(options.cwd), RULES_ROOT_MARKERS, exists);
	return {
		scope: "project",
		fileName,
		absolutePath: join(directory, fileName),
		displayPath: fileName,
		directory
	};
}
/** The starter content written for a newly created rule file. */
function ruleTemplate(fileName) {
	return `# ${fileName}

此文件由 dsh-basics-panel 创建，作为 DSH 的规则/指令文件加载。

> 作用域内规则适用于该作用域的所有会话；直接用户指令优先于一切指令。

## 规则

1.
`;
}
//#endregion
//#region src/features/rules/rules-service.ts
/**
* Rules feature (host): list every DSH rule file (the user-global AGENTS.md
* plus the project-root-to-cwd instruction chain), load one rule for editing,
* save an edit back, and create a new rule file. Every read/save/create
* re-resolves candidates from the filesystem discovery (never from a
* client-supplied path alone), mirroring how @deepseek-ai/dsh-agent-instructions
* finds instruction files. Rule baselines load at session start, so saves
* take effect for new sessions.
*/
/** Build the rules feature API. */
function registerRules(fc) {
	const { ctx, resolved } = fc;
	const cwdOf = (payload) => {
		const record = payload;
		return (typeof record?.cwd === "string" && record.cwd !== "" ? record.cwd : void 0) ?? fc.sessionCwdOf(payload);
	};
	const homeOf = () => {
		const dshHome = resolveDshHome();
		return {
			dshHome,
			displayHome: dshHomeDisplay(dshHome)
		};
	};
	/** Re-resolve a rule key against the fresh discovery; reject anything else. */
	const findRule = async (key, cwd) => {
		const { dshHome, displayHome } = homeOf();
		const rule = (await discoverRuleFiles({
			cwd,
			dshHome,
			displayHome
		})).find((candidate) => samePath(candidate.absolutePath, key));
		if (rule === void 0) throw new BasicsError("forbidden", "该规则文件不在可编辑范围内", 403);
		return rule;
	};
	const list = async (payload) => {
		const cwd = cwdOf(payload);
		const { dshHome, displayHome } = homeOf();
		const projectRoot = await findProjectRoot(cwd);
		const rules = await discoverRuleFiles({
			cwd,
			dshHome,
			displayHome,
			projectRoot
		});
		const rows = await Promise.all(rules.map(async (rule) => {
			const info = await stat(rule.absolutePath).catch(() => void 0);
			return {
				key: rule.absolutePath,
				scope: rule.scope,
				fileName: rule.fileName,
				displayPath: rule.displayPath,
				directory: rule.directory,
				...info !== void 0 ? {
					size: info.size,
					mtime: info.mtimeMs
				} : {},
				editable: !resolved.readOnly
			};
		}));
		const globals = rows.filter((row) => row.scope === "global");
		const projects = rows.filter((row) => row.scope === "project");
		const groups = [];
		if (globals.length > 0) groups.push({
			scope: "global",
			rules: globals
		});
		if (projects.length > 0) groups.push({
			scope: "project",
			rules: projects
		});
		return {
			groups,
			cwd,
			projectRoot
		};
	};
	const get = async (payload) => {
		const key = requireString(payload, "key");
		const cwd = cwdOf(payload);
		const rule = await findRule(key, cwd);
		let raw;
		let mtime;
		try {
			const [content, info] = await Promise.all([readFile(rule.absolutePath, "utf8"), stat(rule.absolutePath)]);
			raw = content;
			mtime = info.mtimeMs;
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		if (Buffer.byteLength(raw, "utf8") > resolved.maxRuleBytes) throw new BasicsError("rule-error", `规则文件超过大小上限 ${resolved.maxRuleBytes} 字节，无法编辑`, 400);
		return {
			key: rule.absolutePath,
			scope: rule.scope,
			fileName: rule.fileName,
			displayPath: rule.displayPath,
			content: raw,
			...mtime !== void 0 ? { mtime } : {},
			editable: !resolved.readOnly
		};
	};
	const save = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const key = requireString(payload, "key");
		const record = payload;
		const content = record?.content;
		if (typeof content !== "string") throw new BasicsError("bad-request", "缺少规则内容 \"content\"");
		const expectedMtime = typeof record?.expectedMtime === "number" ? record.expectedMtime : void 0;
		const cwd = cwdOf(payload);
		const rule = await findRule(key, cwd);
		let mtime;
		try {
			mtime = (await stat(rule.absolutePath)).mtimeMs;
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		if (expectedMtime !== void 0 && mtime !== void 0 && Math.abs(expectedMtime - mtime) > 1) throw new BasicsError("conflict", "规则文件已被修改，请刷新后重试", 409);
		if (Buffer.byteLength(content, "utf8") > resolved.maxRuleBytes) throw new BasicsError("rule-error", `规则文件超过大小上限 ${resolved.maxRuleBytes} 字节`, 400);
		try {
			await atomicWrite(rule.absolutePath, content);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const info = await stat(rule.absolutePath).catch(() => void 0);
		return {
			ok: true,
			...info !== void 0 ? { mtime: info.mtimeMs } : {}
		};
	};
	const create = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const scope = requireString(payload, "scope");
		const fileName = requireString(payload, "fileName");
		if (scope !== "global" && scope !== "project" && scope !== "cwd") throw new BasicsError("bad-request", "非法的规则作用域 \"scope\"");
		const cwd = cwdOf(payload);
		const { dshHome, displayHome } = homeOf();
		const target = await createRulePath({
			cwd,
			dshHome,
			displayHome,
			scope,
			fileName
		});
		if (target === void 0) throw new BasicsError("forbidden", "不允许创建该规则文件", 403);
		try {
			await stat(target.absolutePath);
			throw new BasicsError("conflict", "规则文件已存在，请改为编辑", 409);
		} catch (error) {
			if (error instanceof BasicsError) throw error;
		}
		try {
			await atomicWrite(target.absolutePath, ruleTemplate(target.fileName));
		} catch (error) {
			throw new BasicsError("fs-error", `无法创建规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const info = await stat(target.absolutePath).catch(() => void 0);
		return {
			ok: true,
			key: target.absolutePath,
			scope: target.scope,
			fileName: target.fileName,
			displayPath: target.displayPath,
			...info !== void 0 ? { mtime: info.mtimeMs } : {}
		};
	};
	return {
		"rules.list": list,
		"rules.get": get,
		"rules.save": save,
		"rules.create": create
	};
}
//#endregion
//#region src/features/archived/archive-store.ts
/** Whether a value is a plain non-null object. */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Read a state object's archived ids as a string list. */
function toStringList(value) {
	return Array.isArray(value) ? value.map((id) => String(id)) : void 0;
}
/** Read the workspace domain's global state, preferring the domain over any cached snapshot. */
function readState(registry, global) {
	try {
		const fromDomain = global?.get();
		if (isRecord(fromDomain)) return fromDomain;
	} catch {}
	return isRecord(registry.state) ? registry.state : void 0;
}
/**
* Build the archive store over one host context.
*
* Both services are resolved on EVERY call, never captured while the plugin
* applies: Cordis's `ctx.get` (strict) answers `undefined` until the fiber
* that provides a service is ACTIVE, and `dsh-workspace` opens the workspace
* domain, recovers pending mutations, and indexes stored headers across
* several awaits before it publishes `workspaceRegistry`. This plugin, whose
* own `inject` list never names that service, therefore applies inside that
* window — a captured value would be `undefined` for the whole process
* lifetime even though the registry is live a moment later.
*/
function createArchiveStore(ctx) {
	/** The workspace registry as it stands now (undefined while its fiber is not active). */
	const registryOf = () => ctx.get("workspaceRegistry");
	/** The `workspace` domain's global singleton as it stands now. */
	const globalOf = () => {
		try {
			return ctx.get("storageDomain")?.get?.("workspace")?.global;
		} catch {
			return;
		}
	};
	const idsOf = (registry, global) => {
		try {
			const direct = toStringList(registry?.archivedSessionIds);
			if (direct !== void 0) return direct;
		} catch {}
		return toStringList(readState(registry ?? {}, global)?.archivedSessionIds) ?? [];
	};
	const ids = () => idsOf(registryOf(), globalOf());
	const writable = () => {
		const registry = registryOf();
		if (registry === void 0) return false;
		if (typeof registry.unarchiveSession === "function") return true;
		if (typeof registry.setState === "function") return true;
		return typeof globalOf()?.set === "function";
	};
	/**
	* Commit one whole state value through the registry's own write path when it
	* exists. The fallback path pre-flights the in-process snapshot assignment
	* BEFORE the durable write: a build whose registry state cannot be
	* resynchronized is refused instead of leaving a medium that the next
	* registry write would silently revert.
	*/
	const commit = async (registry, global, next) => {
		if (typeof registry.setState === "function") {
			await registry.setState(next);
			return registry.state === next;
		}
		if (!("state" in registry) || typeof global?.set !== "function") throw new BasicsError("archive-error", "当前 DSH 版本未暴露归档集合的写入通道，无法恢复会话", 500);
		try {
			registry.state = registry.state;
			await global.set(next);
			registry.state = next;
		} catch (error) {
			throw new BasicsError("archive-error", `写入归档集合失败：${error instanceof Error ? error.message : String(error)}`, 500);
		}
		return registry.state === next;
	};
	const drop = async (remove) => {
		const registry = registryOf();
		if (registry === void 0) throw new BasicsError("archive-error", "当前部署未挂载工作区注册表（workspaceRegistry），无法管理归档会话", 500);
		const global = globalOf();
		const wanted = new Set(remove);
		const before = idsOf(registry, global);
		if (before.every((id) => !wanted.has(id))) return {
			archivedIds: before,
			absent: [...wanted],
			staleSnapshot: false
		};
		if (typeof registry.unarchiveSession === "function") {
			const removed = [...wanted].filter((id) => before.includes(id));
			for (const id of removed) await registry.unarchiveSession(id);
			return {
				archivedIds: idsOf(registry, global),
				absent: [...wanted].filter((id) => !removed.includes(id)),
				staleSnapshot: false
			};
		}
		let staleSnapshot = false;
		let removed = [];
		const write = async () => {
			const current = readState(registry, global);
			const currentIds = toStringList(current?.archivedSessionIds);
			if (current === void 0 || currentIds === void 0) throw new BasicsError("archive-error", "无法读取 DSH 的归档集合状态，无法恢复会话", 500);
			const filtered = currentIds.filter((id) => !wanted.has(id));
			if (filtered.length === currentIds.length) return;
			removed = [...wanted].filter((id) => currentIds.includes(id));
			staleSnapshot = !await commit(registry, global, {
				...current,
				archivedSessionIds: filtered
			});
		};
		if (typeof registry.enqueueOperation === "function") await registry.enqueueOperation(write);
		else await write();
		return {
			archivedIds: idsOf(registry, global),
			absent: [...wanted].filter((id) => !removed.includes(id)),
			staleSnapshot
		};
	};
	return {
		get mounted() {
			return registryOf() !== void 0;
		},
		ids,
		writable,
		drop
	};
}
//#endregion
//#region src/features/archived/session-artifacts.ts
/**
* Session-artifact lookup and deletion (host, filesystem level).
*
* DSH's persistence seam has no delete operation, so the archived-sessions
* feature removes a session's durable artifacts itself: the per-session
* directory the JSONL backend owns (`<root>/<project-dir>/<session-id>/`,
* holding one generation log `session[.vN].jsonl[.zstd]` plus any
* session-local auxiliary files).
*
* Two rules keep this safe:
* - the directory is FOUND by scanning the configured root for a direct child
*   named exactly like the session id, never re-derived from a cwd (the
*   project-directory encoding is the backend's private business) and never
*   taken from the client;
* - a directory is only removed after it proved to be that session's artifact
*   (expected basename, inside the root, holds a generation log), so a miss or
*   a shape change refuses instead of guessing.
*/
/**
* Canonical generation log names: `session.jsonl`, `session.jsonl.zstd`,
* `session.v3.jsonl`, … Version zero keeps the suffix-only name, so `.v0` and
* leading-zero versions are deliberately not canonical (mirrors the backend's
* own filename parser).
*/
const SESSION_LOG_NAME = /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/;
/** The id must be one plain path segment (DSH session ids are `[session-]<uuid>`). */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;
/**
* Whether a raw session id may be used as one path segment (no separators, no
* traversal, no NUL). Mirrors the backend's "encode before use" intent: an id
* that needs escaping is refused rather than re-encoded here.
* @param id - candidate session id.
* @returns true when the id is a safe single path segment.
*/
function isSafeSessionId(id) {
	return SAFE_SEGMENT.test(id) && id !== "." && id !== "..";
}
/** Whether a file name is a canonical session generation log. */
function isSessionLogName(name) {
	return SESSION_LOG_NAME.test(name);
}
/**
* Whether `target` is strictly inside `root` (no traversal escape).
* @param root - container directory.
* @param target - candidate path.
* @returns true when the resolved target lives under the resolved root.
*/
function isInside(root, target) {
	const rel = relative(resolve(root), resolve(target));
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
/**
* Describe one candidate session directory, refusing anything that is not the
* named session's artifact (wrong basename, outside the root, no generation log).
* @param root - the configured sessions root.
* @param sessionId - the session the directory must belong to.
* @param directory - candidate directory (absolute).
* @returns the artifact facts, or undefined when the candidate is refused.
*/
async function describeSessionArtifact(root, sessionId, directory) {
	if (!isSafeSessionId(sessionId)) return void 0;
	if (basename(resolve(directory)) !== sessionId) return void 0;
	if (!isInside(root, directory)) return void 0;
	let entries;
	try {
		entries = await readdir(resolve(directory), { withFileTypes: true });
	} catch {
		return;
	}
	const logs = [];
	let bytes = 0;
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const path = join(resolve(directory), entry.name);
		const info = await stat(path).catch(() => void 0);
		if (info !== void 0) bytes += info.size;
		if (isSessionLogName(entry.name)) logs.push(path);
	}
	if (logs.length === 0) return void 0;
	return {
		directory: resolve(directory),
		logs,
		bytes
	};
}
/**
* Locate one session's artifact directory under the configured sessions root.
* The scan mirrors the backend's own session-directory lookup: one level of
* project directories, then a child named exactly like the session id.
* @param root - the JSONL backend's sessions root (`$DSH_HOME/sessions` by default).
* @param sessionId - the stored session id.
* @returns the located artifact, or undefined when no project directory owns it.
*/
async function findSessionArtifact(root, sessionId) {
	if (!isSafeSessionId(sessionId)) return void 0;
	const rootResolved = resolve(root);
	let projectDirs;
	try {
		projectDirs = (await readdir(rootResolved, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return;
	}
	for (const projectDir of projectDirs) {
		const artifact = await describeSessionArtifact(rootResolved, sessionId, join(rootResolved, projectDir, sessionId));
		if (artifact !== void 0) return artifact;
	}
}
/**
* Delete one located session-artifact directory recursively.
* @param root - the sessions root the artifact was found under.
* @param sessionId - the session the directory must belong to.
* @param directory - the located session directory.
* @returns the number of bytes removed.
* @throws when the directory no longer passes the shape checks (never deletes blind).
*/
async function removeSessionArtifact(root, sessionId, directory) {
	const fresh = await describeSessionArtifact(root, sessionId, directory);
	if (fresh === void 0) throw new Error("会话目录已失效或不是有效的会话产物，已跳过删除");
	await rm(fresh.directory, {
		recursive: true,
		force: true
	});
	return fresh.bytes;
}
//#endregion
//#region src/features/archived/archived-service.ts
/**
* Archived-sessions feature (host): list every archived session, restore a
* selection, and delete a selection.
*
* DSH archives one-way (a session hidden from every grouping surface keeps its
* log and its Workspace slot; older builds expose no unarchive action), so this
* feature supplies the missing surface:
* - **list** — the registry-global archive set joined with the durable session
*   listing (cwd, size, event count) and this process's liveness, so the panel
*   can also show archive entries whose artifacts are already gone;
* - **restore** — drop ids from the archive set (durable, in-memory, and the
*   `domain/changed` event every Workspace surface follows), leaving the log
*   and the accounting slot untouched;
* - **delete** — remove the session's durable artifact directory, prune its
*   Workspace accounting slot, then drop it from the archive set. Only
*   archived sessions that are NOT running are deletable, and the filesystem
*   work is driven by a fresh scan of the configured sessions root — never by
*   a client-supplied path.
*
* Liveness has two distinct levels, and the panel shows both:
* - `loaded` — `ctx.sessions.get(id)` answers, i.e. the session object sits in
*   this process's in-memory store. Archiving never unloads a session, so a
*   session that is still open in a client stays loaded indefinitely;
* - `running` — the session's Agent exists and its status is `running`
*   (dsh-agent's `AgentStatus`), i.e. a driver is actively draining turns.
*   This is the same predicate the harness's own session list reports.
* Delete blocks only on `running`: a loaded-but-idle session has no driver to
* race, so removing its artifacts cannot interleave with a write in flight.
*/
/** Message of any thrown value. */
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Build the archived feature API. */
function registerArchived(fc) {
	const { ctx, resolved } = fc;
	const store = createArchiveStore(ctx);
	/** The sessions root the JSONL backend owns (configured override, else `$DSH_HOME/sessions`). */
	const sessionsRoot = () => resolved.sessionsRoot !== "" ? resolved.sessionsRoot : join(resolveDshHome(), "sessions");
	/**
	* Display form of the sessions root: `~/.dsh/sessions` (or `$DSH_HOME/...`)
	* when it lives under the harness home, the absolute path otherwise.
	* `dshHomeDisplay` only names the home itself, so the tail is joined here.
	*/
	const displayRoot = () => {
		const root = sessionsRoot();
		const home = resolveDshHome();
		if (isInside(home, root)) return `${dshHomeDisplay(home)}/${relative(home, root).replaceAll("\\", "/")}`;
		return root.replaceAll("\\", "/");
	};
	/** Read the durable session listing, or undefined when the backend cannot answer. */
	const storedSessions = async () => {
		const persistence = ctx.get("sessionPersistence");
		if (persistence === void 0 || typeof persistence.list !== "function") return void 0;
		try {
			const snapshots = await persistence.list();
			const map = /* @__PURE__ */ new Map();
			for (const snapshot of snapshots) {
				const id = snapshot?.header?.id;
				if (typeof id === "string" && id !== "") map.set(id, snapshot);
			}
			return map;
		} catch {
			return;
		}
	};
	/**
	* The live Agent registry as it stands now. Resolved per call, never captured
	* while this plugin applies — the same Cordis strict-`get` window that hides
	* `workspaceRegistry` also hides `agents`.
	*/
	const agentsOf = () => {
		try {
			const agents = ctx.get("agents");
			return agents !== void 0 && typeof agents.get === "function" ? agents : void 0;
		} catch {
			return;
		}
	};
	/** Whether the session is attached to an Agent in this process. */
	const isLoaded = (id) => {
		try {
			return ctx.sessions.get(id) !== void 0;
		} catch {
			return false;
		}
	};
	/** Whether the session's Agent is draining turns right now. */
	const isRunning = (agents, id) => {
		if (agents === void 0) return false;
		try {
			return agents.get(id)?.status === "running";
		} catch {
			return false;
		}
	};
	/** Prune deleted ids from every Workspace's accounting slot (best-effort). */
	const detachFromWorkspaces = async (ids) => {
		const registry = ctx.get("workspaceRegistry");
		if (registry === void 0 || typeof registry.list !== "function") return;
		let workspaces;
		try {
			workspaces = registry.list();
		} catch {
			return;
		}
		for (const workspace of workspaces) for (const id of ids) {
			if (!workspace.sessionIds.includes(id)) continue;
			try {
				await workspace.detachSession(id);
			} catch {}
		}
	};
	const list = async () => {
		const archivedIds = store.ids();
		const writable = store.writable();
		const mounted = store.mounted;
		const agents = agentsOf();
		const persisted = await storedSessions();
		const rows = archivedIds.map((id) => {
			const snapshot = persisted?.get(id);
			const header = snapshot?.header;
			const running = isRunning(agents, id);
			const stored = snapshot !== void 0;
			return {
				id,
				...typeof header?.cwd === "string" && header.cwd !== "" ? { cwd: header.cwd } : {},
				...typeof header?.createdAt === "number" ? { createdAt: header.createdAt } : {},
				...typeof snapshot?.sizeBytes === "number" ? { sizeBytes: snapshot.sizeBytes } : {},
				...typeof snapshot?.eventCount === "number" ? { eventCount: snapshot.eventCount } : {},
				loaded: isLoaded(id),
				running,
				stored,
				restorable: !resolved.readOnly && writable,
				deletable: !resolved.readOnly && resolved.allowSessionDelete && persisted !== void 0 && !running
			};
		});
		rows.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
		return {
			rows,
			archivedIds,
			totalBytes: rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0),
			writable,
			mounted,
			readOnly: resolved.readOnly,
			deleteEnabled: resolved.allowSessionDelete,
			maxBatchIds: resolved.maxBatchIds,
			listingFailed: persisted === void 0,
			sessionsRoot: displayRoot()
		};
	};
	const restore = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const ids = requireStringList(payload, "ids", resolved.maxBatchIds);
		const result = await store.drop(ids);
		const absent = new Set(result.absent);
		return {
			ok: true,
			changed: ids.filter((id) => !absent.has(id)),
			skipped: result.absent.map((id) => ({
				id,
				reason: "该会话不在归档集合中"
			})),
			archivedIds: result.archivedIds,
			freedBytes: 0,
			staleSnapshot: result.staleSnapshot
		};
	};
	const remove = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		if (!resolved.allowSessionDelete) throw new BasicsError("forbidden", "当前部署已禁用归档会话删除（allowSessionDelete: false）", 403);
		const ids = requireStringList(payload, "ids", resolved.maxBatchIds);
		const root = sessionsRoot();
		const archived = new Set(store.ids());
		const agents = agentsOf();
		const changed = [];
		const skipped = [];
		let freedBytes = 0;
		for (const id of ids) {
			if (!archived.has(id)) {
				skipped.push({
					id,
					reason: "该会话未归档，本页仅支持删除已归档会话"
				});
				continue;
			}
			if (isRunning(agents, id)) {
				skipped.push({
					id,
					reason: "该会话正在运行（Agent 状态为 running），请先结束该回合再删除"
				});
				continue;
			}
			const artifact = await findSessionArtifact(root, id);
			if (artifact === void 0) {
				if (!isSafeSessionId(id)) {
					skipped.push({
						id,
						reason: "会话 ID 无法安全映射到目录名，未做删除"
					});
					continue;
				}
				changed.push(id);
				continue;
			}
			try {
				freedBytes += await removeSessionArtifact(root, id, artifact.directory);
				changed.push(id);
			} catch (error) {
				skipped.push({
					id,
					reason: `删除失败：${messageOf(error)}`
				});
			}
		}
		let staleSnapshot = false;
		let warning;
		if (changed.length > 0) {
			await detachFromWorkspaces(changed);
			try {
				staleSnapshot = (await store.drop(changed)).staleSnapshot;
			} catch (error) {
				warning = `会话文件已删除，但归档记录清理失败：${messageOf(error)}`;
			}
		}
		return {
			ok: true,
			changed,
			skipped,
			archivedIds: store.ids(),
			freedBytes,
			staleSnapshot,
			...warning !== void 0 ? { warning } : {}
		};
	};
	return {
		"archived.list": list,
		"archived.restore": restore,
		"archived.delete": remove
	};
}
//#endregion
//#region src/index.ts
/**
* dsh-basics-panel host half: a single fenced /basics JSON API that merges
* every feature backend's methods. The route passes the same browser-trust
* fence as the /api gateway (loopback or `webRuntime.trustedHosts`), and each
* feature re-resolves its own authorities (the skill registry for skill
* paths, the composition scan for MCP files) so the panel never trusts a
* client-supplied path alone.
*/
/** Plugin identity for cordis.yml rows. */
const name = "dsh-basics-panel";
/** Services required before mounting. */
const inject = [
	"webServer",
	"webRuntime",
	"sessions",
	"skills",
	"tools"
];
/**
* Resolve a session's authoritative working directory. The session header
* wins; the client summary cwd is the fallback while the session is still
* hydrating; the process cwd is the last resort.
*/
function sessionCwdOf(ctx, payload) {
	const record = payload;
	const sessionId = typeof record?.sessionId === "string" ? record.sessionId : "";
	if (sessionId !== "") {
		const headerCwd = ctx.sessions.get(sessionId)?.header.cwd;
		if (headerCwd !== void 0 && headerCwd !== "") return headerCwd;
	}
	const clientCwd = typeof record?.cwd === "string" ? record.cwd : "";
	if (clientCwd !== "") return clientCwd;
	return process.cwd();
}
/**
* Plugin body: mount the fenced routes over the merged feature APIs.
* @param ctx - host plugin context (webServer, webRuntime, sessions, skills, tools).
* @param config - deployment limits; the Loader validates against {@link Config}.
*/
function apply(ctx, config) {
	const resolved = resolveBasicsConfig(config);
	const api = collectApi([
		{
			id: "skills",
			register: registerSkills
		},
		{
			id: "mcp",
			register: registerMcp
		},
		{
			id: "rules",
			register: registerRules
		},
		{
			id: "archived",
			register: registerArchived
		}
	], {
		ctx,
		resolved,
		sessionCwdOf: (payload) => sessionCwdOf(ctx, payload)
	});
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/basics/api",
		handler: async (req, res) => {
			if (!isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)) {
				writeError(res, new BasicsError("forbidden", "forbidden", 403));
				return;
			}
			if (req.method !== "POST") {
				writeError(res, new BasicsError("method-error", "method not allowed", 405));
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/basics/api/") ? pathname.slice(12) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new BasicsError("not-found", "unknown basics API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req, resolved.maxBodyBytes);
				const handler = api[method];
				if (handler === void 0) throw new BasicsError("not-found", `unknown basics API method "${method}"`, 404);
				writeOk(res, await handler(payload));
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-basics-panel: /basics/api routes");
}
//#endregion
export { Config, apply, inject, name };
