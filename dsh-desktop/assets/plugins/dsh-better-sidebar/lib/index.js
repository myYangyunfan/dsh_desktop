import { access, lstat, mkdir, open, opendir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { parse } from "yaml";
import z from "@deepseek-ai/schemastery";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream, watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { deflateRaw } from "node:zlib";
import { promisify } from "node:util";
import { SettingsConflictError } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { snapshotSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import { SessionLogOffset } from "@deepseek-ai/dsh-session";
//#region src/prefs-shared.ts
/**
* Shared "Side card" preference vocabulary (types + constants), consumed by
* BOTH halves: the host registers the schemastery schema over these values
* (config.ts) and the client reads/writes them through the settings RPC
* (client/prefs.ts, client/SideCardSection.tsx). Kept free of schemastery so
* the browser bundle never pulls the schema runtime in.
*/
/** The user-settings namespace holding the side card preferences. */
const SIDEBAR_PREFS_NS = "dsh-better-sidebar";
/** Fallback prefs used whenever the settings document is unreachable or malformed. */
const SIDEBAR_PREFS_DEFAULTS = {
	autoOpenSubagent: true,
	autoOpenJobs: true,
	tasksViewMode: "graph",
	mobileNoAutoOpen: true,
	mobileDefaultTree: true,
	agentOpenTools: false,
	editorExplorer: false,
	titleBarScheme: "auto",
	titleBarPresetId: "",
	customCss: "",
	titleBarCompat: false,
	titleBarStripPx: 40,
	htmlViewerNoSandbox: false,
	htmlViewerDefaultUnsafe: false,
	tabsEnabled: {},
	viewersEnabled: {},
	pluginSettings: {}
};
//#endregion
//#region src/config.ts
/**
* Serializable configuration and defaults for the sidebar host half. Loader
* schema validation normally fills defaults; {@link resolveSidebarConfig}
* applies the same defaults for direct callers that bypass the Loader.
*
* Schemastery comes from DSH, not from the public `schemastery` package, and
* that is load-bearing rather than stylistic: only DSH's build WRAPS a
* `meta.volatile` field in a cosmokit `Volatile` reference when it parses the
* config. The Loader's volatile-commit path walks those references
* (`volatileEntries` / `updateVolatile`), so a schema built with the public
* package produces plain values, leaves the loader nothing to commit, and
* **silently drops every live preference write** — the write reports success
* and the effective value never changes.
* @module dsh-better-sidebar/config
*/
/** Schemastery schema for the deployment-provided host limits. */
const LimitsSchema = z.object({
	readLimit: z.number().step(1).min(1).default(524288),
	mediaLimit: z.number().step(1).min(1).default(20971520),
	uploadLimit: z.number().step(1).min(1).default(134217728),
	listLimit: z.number().step(1).min(1).default(1e3)
});
/**
* Apply direct-call defaults after Loader schema validation has normally run.
*
* @param config - Deployment-provided sidebar host settings.
* @returns Complete settings consumed by the host half.
*/
function resolveSidebarConfig(config) {
	return {
		readLimit: config?.readLimit ?? 524288,
		mediaLimit: config?.mediaLimit ?? 20971520,
		uploadLimit: config?.uploadLimit ?? 134217728,
		listLimit: config?.listLimit ?? 1e3
	};
}
/**
* Schemastery schema for the user-facing preferences (validated by the
* settings service).
*
* Asserted as `z<SidebarPrefs>` (the interface lives in `prefs-shared.ts`; the
* explicit annotation is also what keeps the emitted declaration portable).
* Unknown keys are TOLERATED by this schema and pass through untouched, which
* is what keeps a legacy `workspaceFence: true` in an old profile harmless.
*/
const PrefsSchema = z.object({
	autoOpenSubagent: z.boolean().default(true),
	autoOpenJobs: z.boolean().default(true),
	tasksViewMode: z.union([z.const("graph"), z.const("tree")]).default("graph"),
	mobileNoAutoOpen: z.boolean().default(true),
	mobileDefaultTree: z.boolean().default(true),
	agentOpenTools: z.boolean().default(false),
	editorExplorer: z.boolean().default(false),
	titleBarScheme: z.union([
		z.const("auto"),
		z.const("web"),
		z.const("preset"),
		z.const("custom")
	]),
	titleBarPresetId: z.string(),
	customCss: z.string(),
	titleBarCompat: z.boolean().default(false),
	titleBarStripPx: z.number().step(1).min(0).max(120).default(40),
	htmlViewerNoSandbox: z.boolean().default(false),
	htmlViewerDefaultUnsafe: z.boolean().default(false),
	tabsEnabled: z.dict(z.boolean()).default({}),
	viewersEnabled: z.dict(z.boolean()).default({}),
	pluginSettings: z.dict(z.dict(z.any())).default({})
});
const volatilePrefs = Object.fromEntries(Object.entries(PrefsSchema.dict ?? {}).map(([key, field]) => [key, field.volatile()]));
/**
* Config schema of this plugin's Loader row: deployment limits plus the live
* user preferences.
*/
const Config = z.object({
	...LimitsSchema.dict,
	...volatilePrefs
});
//#endregion
//#region src/wire.ts
/** One API failure with its wire code and HTTP status. */
var SidebarError = class extends Error {
	code;
	status;
	meta;
	constructor(code, message, status = 400, meta) {
		super(message);
		this.code = code;
		this.status = status;
		this.meta = meta;
	}
};
/** Body size bound of one JSON request (defense against unbounded reads). */
const MAX_BODY_BYTES = 1 << 20;
/** Read and parse the JSON request body (bounded; malformed → bad-request). */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new SidebarError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new SidebarError("bad-request", "request body is not valid JSON");
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
	if (error instanceof SidebarError) {
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
/** Narrow an unknown payload value to a string, else throw bad-request. */
function requireString(payload, key) {
	const value = payload?.[key];
	if (typeof value !== "string" || value === "") throw new SidebarError("bad-request", `missing or invalid "${key}"`);
	return value;
}
//#endregion
//#region src/fs-tree.ts
/**
* Single-level directory listing for the sidebar explorer.
*
* The hot path here IS the explorer's latency budget, so the implementation is
* deliberately allocation-shy: one `readdir(withFileTypes)` call (no
* `opendir` stream), rows built only for the capped slice, paths composed by
* string concatenation, and a hand-rolled case-insensitive sort (see
* {@link compareEntries} — `localeCompare` alone costs ~15ms/10k rows, ~40x
* the whole listing budget). A short TTL cache ({@link DIRECTORY_CACHE_TTL_MS})
* absorbs the repeat listings a tree view makes on every re-render.
*
* Row semantics are unchanged: directories first, case-insensitive name order
* with a deterministic tie-break, POSIX-hidden entries flagged for dimming,
* symlinks stat'ed once so a link to a directory expands like a directory and
* a dangling one is flagged broken.
*/
/**
* Directory-first, case-insensitive name ordering (VSCode explorer order).
*
* `toLowerCase()` + code-point comparison instead of `localeCompare`: measured
* at ~0.35ms/10k rows against ~14.6ms for the collator, and the tie-break on
* the ORIGINAL name keeps the order total and deterministic for names that
* only differ in case (`A` before `a`).
*/
function compareEntries(a, b) {
	if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
	const la = a.name.toLowerCase();
	const lb = b.name.toLowerCase();
	if (la !== lb) return la < lb ? -1 : 1;
	if (a.name === b.name) return 0;
	return a.name < b.name ? -1 : 1;
}
/** How many symlink target stats run in flight during one level listing. */
const SYMLINK_PROBE_CONCURRENCY = 32;
/**
* The level cache, keyed by `"<absoluteDir>\0<cap>"`.
*
* Keyed by ABSOLUTE PATH, not by session: a listing is a pure function of the
* path plus the cap, and its rows already carry absolute paths, so sharing an
* entry between two sessions that read the same directory is correct (and
* desirable — one directory read serves both). Nothing session-scoped is
* stored, so no session's data can leak into another's listing.
*/
const directoryCache = /* @__PURE__ */ new Map();
/** Cache key of one level read. */
function cacheKey(path, maxEntries) {
	return `${path}\0${maxEntries}`;
}
/**
* Drop the cached level(s) for one directory (and, when called with no
* argument, everything). Writers call this after any mutation: `fs.write`,
* `fs.rename`, `fs.remove`, `fs.mkdir`, the upload route and the fs-watch
* notifier all funnel here, so a stale level is never served past the write
* that changed it.
* @param path - absolute (or session-relative) directory to invalidate; absent
*  clears the whole cache.
*/
function invalidateDirectoryCache(path) {
	if (path === void 0) {
		directoryCache.clear();
		return;
	}
	const prefix = `${resolve(path)}\0`;
	for (const key of directoryCache.keys()) if (key.startsWith(prefix)) directoryCache.delete(key);
}
/** Max entries tracked in the TTL cache before the oldest are evicted. */
const DIRECTORY_CACHE_MAX = 512;
/** Read one level through the cache when it is fresh. */
async function listDirectoryCached(path, maxEntries) {
	const key = cacheKey(path, maxEntries);
	const now = Date.now();
	const hit = directoryCache.get(key);
	if (hit !== void 0 && now - hit.at < 1500) return hit.listing;
	const listing = await readDirectory(path, maxEntries);
	if (directoryCache.size >= DIRECTORY_CACHE_MAX) {
		const oldest = directoryCache.keys().next().value;
		if (oldest !== void 0) directoryCache.delete(oldest);
	}
	directoryCache.set(key, {
		at: now,
		listing
	});
	return listing;
}
/**
* List one directory level (cached for {@link DIRECTORY_CACHE_TTL_MS}).
* @param path - absolute directory path.
* @param maxEntries - row bound of one level (extra rows flag `truncated`).
* @returns the sorted listing.
* @throws {SidebarError} fs-error when the level is unreadable or not a directory.
*/
async function listDirectory(path, maxEntries = 1e3) {
	return await listDirectoryCached(path, maxEntries);
}
/** Read one level straight from the filesystem (the cache's slow path). */
async function readDirectory(path, maxEntries) {
	let dirents;
	try {
		dirents = await readdir(path, { withFileTypes: true });
	} catch (error) {
		throw new SidebarError("fs-error", `cannot list "${path}": ${messageOf(error)}`, 400);
	}
	const truncated = dirents.length > maxEntries;
	const kept = truncated ? dirents.slice(0, maxEntries) : dirents;
	const prefix = path.endsWith(sep) ? path : `${path}${sep}`;
	const rows = new Array(kept.length);
	for (let index = 0; index < kept.length; index += 1) {
		const dirent = kept[index];
		rows[index] = {
			name: dirent.name,
			path: `${prefix}${dirent.name}`,
			isDir: dirent.isDirectory(),
			isSymlink: dirent.isSymbolicLink(),
			broken: false,
			hidden: dirent.name.startsWith(".")
		};
	}
	await probeSymlinkTargets(rows);
	rows.sort(compareEntries);
	return {
		path,
		entries: rows,
		truncated
	};
}
/** Probe each symlink row's target once (bounded concurrency, order-preserving). */
async function probeSymlinkTargets(rows, concurrency = SYMLINK_PROBE_CONCURRENCY) {
	let next = 0;
	const workers = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
		for (;;) {
			const index = next;
			next += 1;
			if (index >= rows.length) return;
			const row = rows[index];
			if (!row.isSymlink) continue;
			const info = await stat(row.path).catch(() => void 0);
			row.isDir = info !== void 0 ? info.isDirectory() : row.isDir;
			row.broken = info === void 0;
		}
	});
	await Promise.all(workers);
}
/** The root row label of a listing: the last path segment (or the full path at the filesystem root). */
function rootLabel(path) {
	const base = basename(path);
	return base !== "" ? base : path;
}
/** Parent of a path, or undefined at the filesystem root (the explorer's "up" target). */
function parentOf(path) {
	const parent = dirname(path);
	return parent === path ? void 0 : parent;
}
/**
* Normalize a caller-supplied path to an absolute, resolved path or throw
* fs-error. `path.isAbsolute()` is the OS's own notion of absolute: POSIX
* roots (`/...`), Windows drive letters (`C:\...`) and — on win32 — UNC
* network shares (`\\server\share\...`); drive-relative forms (`C:foo`)
* stay rejected.
*/
function requireAbsolute(path) {
	if (!isAbsolute(path)) throw new SidebarError("fs-error", `"${path}" is not an absolute path`, 400);
	return resolve(path);
}
/** Message text of an unknown thrown value. */
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/session-path.ts
/** `\\wsl.localhost\<distro>` root of a Windows-hosted WSL workspace. */
const WSL_LOCALHOST_ROOT = /^\\\\wsl\.localhost\\([^\\]+)(?:\\|$)/i;
/**
* Reinterpret an already-absolute path in the namespace of one session.
*
* Windows treats `/foo` as rooted on the current drive, so `path.resolve()`
* turns it into e.g. `C:\\foo`. That is wrong for a session whose cwd is a
* WSL UNC path: in that namespace `/foo` means the distro's Linux `/foo`.
* Project only that unambiguous combination onto the matching distro root;
* drive paths, UNC paths, ordinary Windows sessions and non-Windows hosts
* keep their existing semantics.
*
* Workspace containment is intentionally NOT handled here. A projected path
* such as `/tmp/x` can still be rejected later for lying outside the session
* workspace; the important part is that it is checked as WSL `/tmp/x`, not
* silently redirected to `C:\\tmp\\x`.
*/
function resolveSessionPath(cwd, target, platform = process.platform) {
	if (platform !== "win32" || !/^\/(?!\/)/.test(target)) return target;
	const normalizedCwd = cwd.replace(/\//g, "\\");
	const match = WSL_LOCALHOST_ROOT.exec(normalizedCwd);
	if (match === null) return target;
	const distroRoot = `\\\\wsl.localhost\\${match[1]}`;
	const relative = target.slice(1).replace(/\//g, "\\");
	return win32.resolve(distroRoot, relative);
}
//#endregion
//#region src/path-security.ts
/**
* Lexical path resolution for the sidebar's filesystem routes.
*
* ⚠️ **This module no longer enforces workspace containment.** It used to
* canonicalize through `realpath` and reject anything outside the session
* workspace; the user asked for that guard to be removed, so the sidebar fs
* routes now reach any path the HOST USER can reach, bounded only by OS
* permissions (and by the browser-trust fence on the routes themselves).
*
* What remains is the part every caller still needs: turn the client's
* (possibly session-relative) target into one absolute, lexically-normalized
* path. `resolveSessionPath` joins it under the session cwd, `resolve()`
* collapses `.` / `..` segments, and {@link requireAbsolute} rejects
* non-absolute input. No `realpath`, no `isWithin`, no 403.
*
* Kept as one module (and the old names kept) so the call sites read the same
* way they did with the fence: the change is the SEMANTICS — "resolve" rather
* than "guard".
*/
/**
* Resolve an existing path to one absolute, lexically-normalized target.
*
* @param cwd - Session workspace directory (the base of relative targets).
* @param target - Client-supplied absolute or session-relative path.
* @param _fence - IGNORED. Kept as a positional parameter so every call site
*  (and the route tests) did not have to change shape in the same commit; the
*  containment decision it used to carry is gone for good. New code should
*  omit it.
* @returns The absolute path used for the filesystem operation.
* @deprecated The name is historical — this is now plain resolution. Use
*  {@link resolveTarget} in new code.
*/
async function ensureWorkspacePath(cwd, target, _fence) {
	return resolveTarget(cwd, target);
}
/**
* Resolve a path for a WRITE destination (which may not exist yet).
*
* Lexical only, exactly like {@link ensureWorkspacePath}: a missing target is
* returned as the caller composed it (its parent is created on demand), and an
* existing symlink in the path is NOT resolved — the caller writes through it,
* which is what "no containment policy" means.
*
* @param cwd - Session workspace directory (the base of relative targets).
* @param target - Client-supplied absolute or session-relative path.
* @param _fence - IGNORED (see {@link ensureWorkspacePath}).
* @returns The absolute destination path.
* @deprecated The name is historical — this is now plain resolution.
*/
async function ensureWorkspaceWritePath(cwd, target, _fence) {
	return resolveTarget(cwd, target);
}
/**
* The single resolution primitive: session-relative targets resolve under the
* session cwd, absolute targets stay absolute, and the result is `resolve()`d
* (lexical `..` collapse). Throws fs-error for a non-absolute result.
*/
function resolveTarget(cwd, target) {
	return requireAbsolute(resolveSessionPath(cwd, target));
}
//#endregion
//#region src/fs-operations.ts
/**
* File mutations for the sidebar (the upload route and the tree's renames,
* deletes and mkdirs).
*
* ⚠️ **No workspace containment any more.** The guard was removed at the
* user's request, so these operations reach whatever the HOST USER can reach.
* What is still enforced is the SHAPE of a request: the relative upload path
* is sanitized (absolute paths, '.', '..' and empty segments are refused), a
* rename/mkdir name must be one path segment, an existing destination is
* refused instead of clobbered, and the session workspace root itself is never
* renamable or removable. Bytes stream from the request body to a uniquely
* named temp sibling and are renamed into place, so a failed, aborted, or
* oversized upload never leaves a partial file at the target path.
*
* The tree's rename/delete are link-aware: they address the LEXICAL row path
* (lstat decides), so renaming or deleting a symlink row renames/unlinks the
* LINK, never its target — matching what the tree row visually names (VS Code
* semantics). Every mutation invalidates the directory cache of the level(s)
* it touched.
*/
/**
* Stream `chunks` into `dir/relativePath` atomically: a uniquely named temp
* sibling receives the bytes, then is renamed over the target. The parent
* directory is created on demand (recursive), so folder uploads work before
* any level exists. The unique temp name keeps concurrent uploads to the same
* target independent (each writes and renames its own file; the last rename
* wins) and never blocks later uploads after a crashed process.
*
* @throws SidebarError with a wire code for shape and size failures; the temp
* file is always removed on failure.
*/
async function writeWorkspaceUpload(input) {
	const { cwd, dir, relativePath, chunks, limit } = input;
	const base = requireAbsolute(dir);
	await ensureWorkspacePath(cwd, base);
	if (relativePath === "" || relativePath.startsWith("/") || relativePath.startsWith("\\")) throw new SidebarError("bad-request", "relativePath must stay below the upload directory", 400);
	const segments = relativePath.split(/[\\/]/);
	if (segments.some((part) => part === "" || part === "." || part === "..")) throw new SidebarError("bad-request", "relativePath must stay below the upload directory", 400);
	const target = join(base, ...segments);
	const safeTarget = await ensureWorkspaceWritePath(cwd, target);
	const tmp = join(dirname(safeTarget), `.${basename(safeTarget)}.dsh-upload-${randomUUID()}.tmp`);
	await mkdir(dirname(safeTarget), { recursive: true });
	const stream = createWriteStream(tmp, { flags: "wx" });
	const closed = new Promise((resolve) => {
		stream.once("close", () => resolve());
	});
	let size = 0;
	let streamError;
	stream.on("error", (error) => {
		streamError = error;
	});
	try {
		for await (const chunk of chunks) {
			const buffer = Buffer.from(chunk);
			size += buffer.length;
			if (size > limit) throw new SidebarError("too-large", `upload exceeds the ${limit} byte limit`, 413);
			if (!stream.write(buffer)) await once(stream, "drain");
			if (streamError !== void 0) throw streamError;
		}
		await new Promise((resolve, reject) => {
			stream.end((error) => error === void 0 || error === null ? resolve() : reject(error));
		});
		if (streamError !== void 0) throw streamError;
		await rename(tmp, safeTarget);
		const info = await stat(safeTarget);
		invalidateDirectoryCache(dirname(safeTarget));
		return {
			path: target,
			size: info.size
		};
	} catch (error) {
		stream.destroy();
		await closed.catch(() => {});
		await rm(tmp, { force: true }).catch(() => {});
		throw error;
	}
}
/**
* Resolve one existing entry for a link-aware mutation: the lexical row path
* plus the resolved workspace root (for the "never rename/remove the root"
* check). No realpath, no containment: the path exists (lstat decides) and the
* operation addresses it as written.
*/
async function resolveEntry(cwd, target) {
	const absolute = requireAbsolute(resolveSessionPath(cwd, target));
	return {
		absolute,
		real: absolute,
		realCwd: requireAbsolute(cwd)
	};
}
/** Whether a path exists (ENOENT → false; other failures propagate). */
async function pathExists(target) {
	try {
		await access(target);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
/**
* Rename one tree row within its directory: `path` → `<parent>/<name>`.
* The new name must be a single path segment (this is rename, not move);
* an existing destination is refused (POSIX rename would clobber it
* silently); the workspace root itself is never renamable; a symlink row
* renames the link, not its target. A no-op rename (same name) succeeds
* without touching the filesystem.
*
* @throws SidebarError with a wire code for shape, existence and root
* failures.
*/
async function renameWorkspaceEntry(input) {
	const { cwd, path, name } = input;
	if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\")) throw new SidebarError("bad-request", "name must be a single path segment", 400);
	const { absolute, real, realCwd } = await resolveEntry(cwd, path);
	if (real === realCwd) throw new SidebarError("fs-error", "cannot rename the workspace root", 400);
	if (basename(absolute) === name) return { path: absolute };
	const safeDestination = await ensureWorkspaceWritePath(cwd, join(dirname(absolute), name));
	if (await pathExists(safeDestination)) throw new SidebarError("fs-error", `"${name}" already exists`, 409);
	try {
		await rename(absolute, safeDestination);
	} catch (error) {
		throw new SidebarError("fs-error", `cannot rename "${path}" to "${name}": ${error instanceof Error ? error.message : String(error)}`, 400);
	}
	invalidateDirectoryCache(dirname(safeDestination));
	return { path: safeDestination };
}
/**
* Create one directory inside an existing tree row: `<path>/<name>`.
* The name must be a single path segment; an existing destination is refused
* (mkdir would otherwise fail with EEXIST anyway, but the explicit check
* yields the same "already exists" sentence rename uses); the parent row may
* be any directory the host user can write.
*
* @throws SidebarError with a wire code for shape and existence failures.
*/
async function mkdirWorkspaceEntry(input) {
	const { cwd, path, name } = input;
	if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\\")) throw new SidebarError("bad-request", "name must be a single path segment", 400);
	const { absolute } = await resolveEntry(cwd, path);
	const destination = await ensureWorkspaceWritePath(cwd, join(absolute, name));
	if (await pathExists(destination)) throw new SidebarError("fs-error", `"${name}" already exists`, 409);
	try {
		await mkdir(destination);
	} catch (error) {
		throw new SidebarError("fs-error", `cannot create "${name}": ${error instanceof Error ? error.message : String(error)}`, 400);
	}
	invalidateDirectoryCache(absolute);
	return { path: destination };
}
/**
* Delete one tree row permanently (there is no trash on the host): files are
* unlinked, directories removed recursively, a symlink row unlinks the LINK
* only (lstat decides, so a link to a directory does not recurse into its
* target). The workspace root itself is never removable.
*
* @throws SidebarError with a wire code for existence and root failures.
*/
async function removeWorkspaceEntry(input) {
	const { cwd, path } = input;
	const { absolute, real, realCwd } = await resolveEntry(cwd, path);
	if (real === realCwd) throw new SidebarError("fs-error", "cannot remove the workspace root", 400);
	try {
		if ((await lstat(absolute)).isDirectory()) await rm(absolute, { recursive: true });
		else await unlink(absolute);
	} catch (error) {
		throw new SidebarError("fs-error", `cannot remove "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
	}
	invalidateDirectoryCache(dirname(absolute));
	return { path: absolute };
}
//#endregion
//#region src/fs-search.ts
/**
* Recursive file-name search for the editor's merged-mode side panel.
* Streams the tree with opendir and matches the query as a case-insensitive
* substring of each entry's NAME (paths stay relative to the search root —
* the client resolves them against the session cwd). No .gitignore semantics
* (this is a name lookup, not a code search), but known noise directories
* (`.git`, `node_modules`, package-manager stores, build caches) are
* skipped outright and symlink directories are NOT descended (cycle safety).
*
* Two performance budgets bound the walk: `maxMatches` (the client renders
* the flat list) and `maxVisited` (a runaway tree — a home directory root
* — must not stall the host). Exceeding either stops early with
* `truncated: true`.
*/
const DEFAULT_MAX_MATCHES = 200;
const DEFAULT_MAX_VISITED = 1e5;
/**
* Directory names that are never useful filename-search results and would
* burn the visit budget before the walk reaches project files. Compared
* case-insensitively so `Node_Modules` / `.GIT` stay skipped on every
* platform. The directory itself is neither matched nor descended.
*/
const SEARCH_SKIP_DIRS = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	".pnpm-store",
	".yarn",
	".turbo",
	".turbopack",
	".next",
	".nuxt",
	".output",
	".cache",
	".parcel-cache",
	"coverage",
	"dist",
	"build",
	"out",
	".umi",
	".umi-production",
	".dumi"
]);
/**
* Search `root` recursively for entries whose name contains `query`
* (case-insensitive).
* @param root - absolute search root.
* @param query - the name substring; empty matches nothing.
* @param opts - budget overrides (tests).
* @returns the matching paths RELATIVE to `root` ('/'-separated), sorted,
*  plus whether a budget cut the walk short. An unreadable level is skipped
*  (permission errors never fail the whole search).
*/
async function searchFiles(root, query, opts = {}) {
	const needle = query.trim().toLowerCase();
	if (needle === "") return {
		matches: [],
		truncated: false
	};
	const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
	const maxVisited = opts.maxVisited ?? DEFAULT_MAX_VISITED;
	const matches = [];
	let visited = 0;
	let truncated = false;
	const walk = async (dir) => {
		if (truncated) return;
		const level = await opendir(dir).catch(() => void 0);
		if (level === void 0) return;
		for await (const dirent of level) {
			visited += 1;
			if (visited > maxVisited) {
				truncated = true;
				return;
			}
			if (dirent.isDirectory() && SEARCH_SKIP_DIRS.has(dirent.name.toLowerCase())) continue;
			if (dirent.name.toLowerCase().includes(needle)) {
				matches.push(join(relative(root, dir), dirent.name));
				if (matches.length >= maxMatches) {
					truncated = true;
					return;
				}
			}
			if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
				await walk(join(dir, dirent.name));
				if (truncated) return;
			}
		}
	};
	await walk(root);
	return {
		matches: matches.sort().map((path) => path.split(sep).join("/")),
		truncated
	};
}
/**
* Decode a route pathname into the session + absolute file path. Rejects
* a wrong prefix (404), an empty path, malformed percent encoding, and a
* missing sessionId or file path (400). The caller still must bound the
* decoded path with the workspace real-path guard — a decoded `..`
* segment resolves outside the cwd and is refused there.
*/
function decodeHtmlUrl(pathname) {
	if (!pathname.startsWith("/sidebar/html/")) return {
		ok: false,
		status: 404,
		message: "not an html route"
	};
	const rest = pathname.slice(14);
	if (rest === "") return {
		ok: false,
		status: 400,
		message: "invalid html route path"
	};
	let segments;
	try {
		segments = rest.split("/").map((segment) => decodeURIComponent(segment));
	} catch {
		return {
			ok: false,
			status: 400,
			message: "malformed URL encoding"
		};
	}
	const [sessionId, ...pathSegments] = segments;
	if (sessionId === void 0 || sessionId === "") return {
		ok: false,
		status: 400,
		message: "sessionId and file path are required"
	};
	const unc = pathSegments[0] === "";
	const tail = unc ? pathSegments.slice(1) : pathSegments;
	if (tail.length === 0 || tail.some((segment) => segment === "")) return {
		ok: false,
		status: 400,
		message: "sessionId and file path are required"
	};
	let path;
	if (unc) path = `//${tail.join("/")}`;
	else if (/^[A-Za-z]:$/.test(tail[0] ?? "")) path = tail.join("/");
	else path = `/${tail.join("/")}`;
	return {
		ok: true,
		ref: {
			sessionId,
			path
		}
	};
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
* Decide whether one sidebar request may reach the plugin routes.
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
		return new URL(origin).hostname === hostUrl.hostname;
	} catch {
		return false;
	}
}
//#endregion
//#region src/bundle-route.ts
/**
* Lazy chunk route: serves the client bundle's chunk scripts
* (/sidebar/bundle/<name>.js). The official /plugins/<id>/client.js route
* cannot serve arbitrary file names, so the plugin serves its own split
* bundles (lib/client-<name>.js) here; the client injects the script on
* first use of the feature that needs it (see src/client/chunk-loader.ts).
*
* Caching contract: every response carries `cache-control: no-cache` plus an
* ETag (content hash, memoized per file by mtime/size) and honors
* If-None-Match — the browser revalidates each fetch, but a 304 avoids
* re-downloading multi-MB chunks that did not change (page refresh, HMR
* re-activation). Same browser-trust fence as every other /sidebar route;
* only allowlisted chunk names are servable (no path traversal).
*/
/** The chunk names the client may request (mirror of src/client/chunk-loader.ts). */
const CHUNK_NAMES = [
	"editor",
	"mermaid",
	"locale"
];
/** Directory of this host-half module (lib/ — the chunk scripts live next to it). */
const LIB_DIR = dirname(fileURLToPath(import.meta.url));
/** sha1 content hash shortened to 12 hex chars (same shape as the client-modules rev). */
function shortHash(input) {
	return createHash("sha1").update(input).digest("hex").slice(0, 12);
}
/** ETag memo: recompute the content hash only when the file's stat changed. */
const etags = /* @__PURE__ */ new Map();
/**
* The chunk file's ETag (quoted hash), or undefined when the file is
* missing. Hash is recomputed only when mtime/size changed (hashing a
* multi-MB chunk per request is wasteful).
*/
async function etagOf(name, chunkDir) {
	const path = join(chunkDir, `client-${name}.js`);
	const key = `${chunkDir}:${name}`;
	try {
		const info = await stat(path);
		const memo = etags.get(key);
		if (memo !== void 0 && memo.mtimeMs === info.mtimeMs && memo.size === info.size) return memo.etag;
		const etag = `"${shortHash(await readFile(path))}"`;
		etags.set(key, {
			mtimeMs: info.mtimeMs,
			size: info.size,
			etag
		});
		return etag;
	} catch {
		return;
	}
}
/**
* Build the /sidebar/bundle route handler. `fence` is the shared browser-
* trust check every /sidebar route applies; `chunkDir` is the directory the
* chunk scripts live in (overridable for tests).
*/
function createBundleRouteHandler(fence, chunkDir = LIB_DIR) {
	return async (req, res) => {
		if (!fence(req)) {
			res.writeHead(403);
			res.end("forbidden");
			return;
		}
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(405);
			res.end();
			return;
		}
		const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
		const name = /^\/sidebar\/bundle\/([a-z0-9-]+)\.js$/.exec(pathname)?.[1];
		if (name === void 0 || !CHUNK_NAMES.includes(name)) {
			res.writeHead(404);
			res.end("not found");
			return;
		}
		const etag = await etagOf(name, chunkDir);
		if (etag === void 0) {
			res.writeHead(404);
			res.end("not found");
			return;
		}
		if (req.headers["if-none-match"] === etag) {
			res.writeHead(304, {
				"cache-control": "no-cache",
				etag
			});
			res.end();
			return;
		}
		try {
			const body = await readFile(join(chunkDir, `client-${name}.js`));
			res.writeHead(200, {
				"content-type": "text/javascript; charset=utf-8",
				"cache-control": "no-cache",
				etag
			});
			res.end(body);
		} catch {
			res.writeHead(404);
			res.end("not found");
		}
	};
}
/** Register the /sidebar/bundle route (disposed with the fiber). */
function registerBundleRoute(ctx, fence) {
	return ctx.webServer.register({
		kind: "prefix",
		path: "/sidebar/bundle",
		handler: createBundleRouteHandler(fence)
	});
}
//#endregion
//#region src/fs-watch.ts
/**
* Directory change watching behind the file tree's live refresh.
*
* The tree used to go stale the moment anything wrote to disk outside the
* plugin (a build, a formatter, the model's own `bash`): a folder was listed
* once, when it was expanded, and never again. DSH 0.1.7 gave its own tree
* per-directory watching; this plugin owns its tree (it took the `files` kind
* over), so it needs its own watcher.
*
* One connection watches the directories the reader actually has expanded —
* not the whole workspace — because `fs.watch` is one OS handle per directory
* and a deep tree would exhaust them. Collapsing a folder or closing the
* socket releases its handle.
*
* A debounced change also drops the host's listing cache for that directory
* (`invalidateDirectoryCache`), so the re-list the client is about to ask for
* cannot be answered from a level cached before the change.
* @module dsh-better-sidebar/fs-watch
*/
/** How long a burst of filesystem events is folded into a single push. */
const DEBOUNCE_MS = 150;
/**
* Directory watchers one connection may hold. The cap is a resource guard,
* not a policy: a reader with more than this many folders expanded simply
* stops gaining new watchers, and collapsing any folder frees a slot.
*/
const MAX_WATCHES = 64;
/**
* Create the watcher set of one connection.
*
* `fs.watch` reports a directory's own entry list changing, which is exactly
* what re-listing that directory needs — file CONTENTS changing inside an
* expanded folder is not observable this way and is not what the tree shows.
* @param push - called once per debounced burst with the changed directory.
* @param onError - called when a directory cannot be watched or its watcher
*   fails; the directory is dropped either way, so the caller only reports it.
* @returns the connection's watcher set.
*/
function createDirectoryWatchers(push, onError) {
	const watchers = /* @__PURE__ */ new Map();
	const drop = (dir) => {
		const entry = watchers.get(dir);
		if (entry === void 0) return;
		watchers.delete(dir);
		if (entry.timer !== void 0) clearTimeout(entry.timer);
		entry.watcher.close();
	};
	const notify = (dir) => {
		const entry = watchers.get(dir);
		if (entry === void 0 || entry.timer !== void 0) return;
		entry.timer = setTimeout(() => {
			entry.timer = void 0;
			if (!watchers.has(dir)) return;
			invalidateDirectoryCache(dir);
			push({ dir });
		}, DEBOUNCE_MS);
		entry.timer.unref();
	};
	return {
		add(dir) {
			if (watchers.has(dir)) return true;
			if (watchers.size >= MAX_WATCHES) return false;
			let watcher;
			try {
				watcher = watch(dir, { persistent: false });
			} catch (error) {
				onError(dir, error);
				return false;
			}
			watcher.on("change", () => {
				notify(dir);
			});
			watcher.on("error", (error) => {
				onError(dir, error);
				drop(dir);
			});
			watchers.set(dir, {
				watcher,
				timer: void 0
			});
			return true;
		},
		remove: drop,
		close() {
			for (const dir of [...watchers.keys()]) drop(dir);
		}
	};
}
//#endregion
//#region src/open-external.ts
/**
* External open actions for the file tree's "open with" menu: hand a path to
* the OS file manager (reveal/select) or launch a URL scheme's registered
* handler (vscode://, cursor://, zed://, custom schemes).
*
* The client runs in a browser / DSH Desktop renderer where a raw `vscode://`
* navigation is unreliable, so both actions fan out through this host route
* and spawn the platform opener with an argv array (no shell interpolation).
* The command builders are pure — the platform is injectable — so every
* per-platform branch is unit-testable without spawning anything.
*/
/** Reveal/select a path in the OS file manager. On Linux there is no common
*  select protocol — the containing directory is opened instead (KISS). */
function revealCommand(path, platform = process.platform) {
	switch (platform) {
		case "darwin": return {
			command: "open",
			args: ["-R", path]
		};
		case "win32": return {
			command: "explorer.exe",
			args: [`/select,${path}`]
		};
		default: return {
			command: "xdg-open",
			args: [parentOf(path) ?? path]
		};
	}
}
/** Hand a custom-scheme URL to the OS protocol handler. */
function urlCommand(url, platform = process.platform) {
	switch (platform) {
		case "darwin": return {
			command: "open",
			args: [url]
		};
		case "win32": return {
			command: "rundll32.exe",
			args: ["url.dll,FileProtocolHandler", url]
		};
		default: return {
			command: "xdg-open",
			args: [url]
		};
	}
}
/** Validate a URL-scheme open target: a parseable custom-scheme URL (never
*  http/https — those would only dump the URL into a browser tab). */
function validateExternalUrl(raw) {
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) throw new SidebarError("bad-request", "url must be a custom-scheme URL");
	let url;
	try {
		url = new URL(raw);
	} catch {
		throw new SidebarError("bad-request", "invalid url");
	}
	if (url.protocol === "http:" || url.protocol === "https:") throw new SidebarError("bad-request", "only custom-scheme urls can be opened externally");
	return raw;
}
/**
* Launch one external open action and return immediately (detached, no
* stdio). Spawn failures are reported through the child's 'error' event —
* by then the route already returned, so the event is swallowed (the OS
* dialog about a missing handler is the user-visible outcome either way).
*/
function launchExternal(action, value) {
	const platform = process.platform;
	const spec = action === "reveal" ? revealCommand(requireAbsolute(value), platform) : urlCommand(validateExternalUrl(value), platform);
	const child = spawn(spec.command, spec.args, {
		detached: true,
		stdio: "ignore"
	});
	child.on("error", () => {});
	child.unref();
	return { started: true };
}
/** Default entry-count bound of one archive. */
const ZIP_MAX_ENTRIES = 1e4;
/** DOS epoch (1980-01-01) — the smallest representable DOS timestamp. */
const DOS_YEAR_BASE = 1980;
/** CRC-32 (IEEE 802.3, the ZIP polynomial), table built once per process. */
const CRC_TABLE = (() => {
	const table = /* @__PURE__ */ new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let value = i;
		for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 3988292384 ^ value >>> 1 : value >>> 1;
		table[i] = value >>> 0;
	}
	return table;
})();
/** CRC-32 of one buffer. */
function crc32(data) {
	let crc = 4294967295;
	for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 255] ^ crc >>> 8;
	return (crc ^ 4294967295) >>> 0;
}
const deflateRawAsync = promisify(deflateRaw);
/** DOS date + time words for one instant (clamped to the 1980 epoch). */
function dosDateTime(date) {
	const year = Math.max(date.getFullYear(), DOS_YEAR_BASE);
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const seconds = date.getSeconds();
	return {
		time: hours << 11 | minutes << 5 | seconds >> 1,
		date: year - DOS_YEAR_BASE << 9 | month << 5 | day
	};
}
/**
* Normalize an entry name to a '/'-separated relative archive path.
*
* A backslash is NOT a separator here: on POSIX (and on the host half, which
* builds the names) `a\b.txt` is one legal file name, so converting it would
* silently split one file into a directory. Windows separators never reach
* this point — the walk composes names from `basename`/`join` results.
* Leading slashes are dropped (names are archive-relative by definition) and
* `..` segments are refused, so a name can never traverse.
*/
function archiveName(raw, isDir) {
	const segments = raw.replace(/^\/+/, "").split("/").filter((segment) => segment !== "" && segment !== ".");
	if (raw === ".." || segments.length === 0 || segments.includes("..")) throw new SidebarError("bad-request", `invalid archive entry name "${raw}"`);
	const name = segments.join("/");
	return isDir ? `${name}/` : name;
}
/** The absolute filesystem path shape the builder accepts. */
function requireSourcePath(raw) {
	if (raw === "" || raw.includes("\0")) throw new SidebarError("bad-request", "archive entry path is required");
	return raw;
}
/**
* Read + compress one member (deflate only when it actually shrinks).
* @param limit - the archive's total uncompressed ceiling (for the message).
* @param budget - uncompressed bytes still available; the source is stat'ed
*  FIRST and refused when it cannot fit, so an oversized archive never pulls
*  the payload into memory (let alone deflates it) before failing.
*/
async function prepareFile(name, path, limit, budget) {
	let size;
	try {
		size = (await stat(path)).size;
	} catch (error) {
		throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
	}
	if (budget <= 0 || size > budget) throw new SidebarError("fs-error", `archive exceeds the ${limit} byte limit`, 400);
	let data;
	try {
		data = await readFile(path);
	} catch (error) {
		throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
	}
	const crc = crc32(data);
	const deflated = await deflateRawAsync(data);
	const useDeflate = deflated.byteLength < data.byteLength;
	return {
		name: Buffer.from(name, "utf8"),
		data: useDeflate ? deflated : data,
		crc,
		method: useDeflate ? 8 : 0,
		size: data.byteLength
	};
}
/** One directory member (zero payload, name already carries the '/'). */
function directoryMember(name) {
	return {
		name: Buffer.from(name, "utf8"),
		data: Buffer.alloc(0),
		crc: 0,
		method: 0,
		size: 0
	};
}
/** Write one local file header + payload into `out`. */
function writeLocalHeader(out, member, time, date) {
	const header = Buffer.alloc(30);
	header.writeUInt32LE(67324752, 0);
	header.writeUInt16LE(20, 4);
	header.writeUInt16LE(2048, 6);
	header.writeUInt16LE(member.method, 8);
	header.writeUInt16LE(time, 10);
	header.writeUInt16LE(date, 12);
	header.writeUInt32LE(member.crc, 14);
	header.writeUInt32LE(member.data.byteLength, 18);
	header.writeUInt32LE(member.size, 22);
	header.writeUInt16LE(member.name.byteLength, 26);
	header.writeUInt16LE(0, 28);
	out.push(header, member.name, member.data);
}
/**
* Build one ZIP archive from the given entries.
* @param entries - files to read and/or directory rows to record; a directory
*  row contributes its own header, its children are separate entries.
* @param opts - entry-count and total-byte bounds ({@link ZipOptions}).
* @returns the ZIP bytes.
* @throws {SidebarError} bad-request for malformed entry names/paths,
*  fs-error when an entry cannot be read or a bound is exceeded.
*/
async function buildZip(entries, opts = {}) {
	const maxEntries = opts.maxEntries ?? 1e4;
	const maxBytes = opts.maxBytes ?? 268435456;
	if (entries.length > maxEntries) throw new SidebarError("fs-error", `too many entries for one archive (${entries.length} > ${maxEntries})`, 400);
	const stamp = dosDateTime(/* @__PURE__ */ new Date());
	const members = [];
	/** Total uncompressed payload (the bound is checked against it). */
	let totalBytes = 0;
	/** Entries finished so far (the progress hook's `done`). */
	let done = 0;
	const report = () => {
		opts.onProgress?.({
			done,
			total: entries.length,
			bytes: totalBytes
		});
	};
	for (const entry of entries) {
		if (entry.isDir === true) {
			members.push(directoryMember(archiveName(entry.name, true)));
			done += 1;
			report();
			continue;
		}
		const path = requireSourcePath(entry.path);
		const member = await prepareFile(archiveName(entry.name, false), path, maxBytes, maxBytes - totalBytes);
		if (totalBytes + member.size > maxBytes) throw new SidebarError("fs-error", `archive exceeds the ${maxBytes} byte limit`, 400);
		totalBytes += member.size;
		members.push(member);
		done += 1;
		report();
	}
	const out = [];
	const offsets = [];
	let offset = 0;
	for (const member of members) {
		offsets.push(offset);
		writeLocalHeader(out, member, stamp.time, stamp.date);
		offset += 30 + member.name.byteLength + member.data.byteLength;
	}
	const directoryStart = offset;
	members.forEach((member, index) => {
		const isDir = member.name.toString("utf8").endsWith("/");
		const header = Buffer.alloc(46);
		header.writeUInt32LE(33639248, 0);
		header.writeUInt16LE(798, 4);
		header.writeUInt16LE(20, 6);
		header.writeUInt16LE(2048, 8);
		header.writeUInt16LE(member.method, 10);
		header.writeUInt16LE(stamp.time, 12);
		header.writeUInt16LE(stamp.date, 14);
		header.writeUInt32LE(member.crc, 16);
		header.writeUInt32LE(member.data.byteLength, 20);
		header.writeUInt32LE(member.size, 24);
		header.writeUInt16LE(member.name.byteLength, 28);
		header.writeUInt16LE(0, 30);
		header.writeUInt16LE(0, 32);
		header.writeUInt16LE(0, 34);
		header.writeUInt16LE(0, 36);
		const mode = isDir ? 16877 : 33188;
		header.writeUInt32LE(mode * 65536 + (isDir ? 16 : 0), 38);
		header.writeUInt32LE(offsets[index], 42);
		out.push(header, member.name);
		offset += 46 + member.name.byteLength;
	});
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(101010256, 0);
	eocd.writeUInt16LE(0, 4);
	eocd.writeUInt16LE(0, 6);
	eocd.writeUInt16LE(members.length, 8);
	eocd.writeUInt16LE(members.length, 10);
	eocd.writeUInt32LE(offset - directoryStart, 12);
	eocd.writeUInt32LE(directoryStart, 16);
	eocd.writeUInt16LE(0, 20);
	out.push(eocd);
	return Buffer.concat(out);
}
/**
* Sanitize the archive's download name: one flat file name, never a path.
* Separators, control characters, quotes and leading dots are stripped (a
* name cannot look like a traversal or hide as a dotfile); an empty result
* falls back to `archive.zip`, and a `.zip` suffix is applied once.
*/
function archiveNameOf(raw) {
	const trimmed = (raw ?? "").trim();
	if (trimmed === "" || trimmed === ".zip") return "archive.zip";
	const cleaned = [...trimmed].filter((char) => {
		const code = char.codePointAt(0);
		return char !== "\\" && char !== "/" && char !== "\"" && char !== "'" && code >= 32 && code !== 127;
	}).join("").trim().replace(/^\.+/, "").slice(0, 120);
	if (cleaned === "") return "archive.zip";
	return cleaned.toLowerCase().endsWith(".zip") ? cleaned : `${cleaned}.zip`;
}
/**
* The `content-disposition` value for one archive download.
*
* A non-latin1 name (a Chinese folder → `报告.zip`) CANNOT go into the header
* verbatim: Node's `writeHead` validates header values and rejects anything
* above U+00FF with `Invalid character in header content` — the route turned
* that into a 500. So the name is sent twice, exactly like `/sidebar/file`
* does for a download: an ASCII-only `filename="…"` fallback for old clients
* and the RFC 5987 `filename*=UTF-8''…` form (percent-encoded, therefore pure
* ASCII) for everyone else, which wins in every current browser.
*/
function contentDispositionOf(name) {
	return `attachment; filename="${asciiFallbackOf(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
/**
* The ASCII-only fallback of a download name: characters a quoted header
* string cannot carry (or that no latin1 client could render) drop out, and a
* stray quote or backslash does too. A result with no stem left (`''` or a
* bare extension, as a fully non-latin1 name reduces to) becomes
* `download.zip`, so the header always names a usable file.
*/
function asciiFallbackOf(name) {
	const ascii = [...name].filter((char) => {
		const code = char.codePointAt(0);
		return code >= 32 && code <= 126 && char !== "\"" && char !== "\\";
	}).join("");
	const stem = ascii.replace(/\.zip$/i, "");
	if (stem === "" || /^\.+$/.test(stem)) return "download.zip";
	return ascii;
}
/**
* The in-archive name of every selection, disambiguated.
*
* The common case keeps the intuition "one selection is named by its own
* basename" — archive `/ws/src` and the entries live under `src/`. Two
* selections that would collide (multi-select `/ws/a/index.ts` and
* `/ws/b/index.ts` both wanting `index.ts`) are extended with parent
* segments until every name is unique, so an extractor cannot silently
* overwrite one member with another. A path that runs out of ancestors
* (selecting the filesystem root, or `/a` twice) falls back to the full
* '/'-joined path, which is unique by construction.
*
* @param selections - absolute (already fenced) paths, in selection order.
* @returns one '/'-separated archive name per selection, same order.
*/
function disambiguateArchiveNames(selections) {
	const segmentsOf = (absolute, depth) => {
		const parts = [];
		let current = absolute;
		for (let level = 0; level < depth; level += 1) {
			const part = basename(current);
			const parent = dirname(current);
			if (part === "" || parent === current) break;
			parts.unshift(part);
			current = parent;
		}
		return parts.join("/");
	};
	const deepEnough = (absolute, name) => {
		return segmentsOf(absolute, Number.MAX_SAFE_INTEGER) === name ? absolute.replace(/^\/+/, "") : name;
	};
	const depth = new Map(selections.map((path) => [path, 1]));
	for (let round = 0; round < 64; round += 1) {
		const names = selections.map((path) => segmentsOf(path, depth.get(path)));
		const counts = /* @__PURE__ */ new Map();
		for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
		if ([...counts.values()].every((count) => count === 1)) return names;
		const grown = /* @__PURE__ */ new Set();
		for (const [index, path] of selections.entries()) {
			if ((counts.get(names[index]) ?? 0) <= 1) continue;
			depth.set(path, depth.get(path) + 1);
			grown.add(path);
		}
		if (grown.size === 0) break;
	}
	return selections.map((path) => deepEnough(path, segmentsOf(path, depth.get(path))));
}
/**
* Collect one selected path into the archive: a file becomes one entry, a
* directory is walked depth-first and each level contributes its own entry
* (a trailing '/' name), files keep their layout under the directory's own
* name. Symlinks are skipped, never followed. Iterative (an explicit stack)
* because a deep tree must not blow the JS stack, and the count bound is
* enforced HERE so a runaway directory fails before its rows pile up.
*
* @param absolute - the (already fenced) absolute path of the selection.
* @param name - the in-archive name of that selection (its basename).
* @param out - the entry list appended to, in archive order.
* @param maxEntries - entry-count bound.
* @throws {SidebarError} fs-error when a row cannot be read or the bound is hit.
*/
async function collectZipEntries(absolute, name, out, maxEntries = ZIP_MAX_ENTRIES) {
	const stack = [{
		path: absolute,
		name
	}];
	while (stack.length > 0) {
		const item = stack.pop();
		if (out.length >= maxEntries) throw new SidebarError("fs-error", `too many entries for one archive (> ${maxEntries})`, 400);
		const info = await lstat(item.path).catch((error) => {
			throw new SidebarError("fs-error", `cannot read "${item.path}": ${error instanceof Error ? error.message : String(error)}`, 400);
		});
		if (info.isSymbolicLink()) continue;
		if (!info.isDirectory()) {
			out.push({
				path: item.path,
				name: item.name
			});
			continue;
		}
		out.push({
			path: item.path,
			name: item.name,
			isDir: true
		});
		let level;
		try {
			level = await readdir(item.path, { withFileTypes: true });
		} catch (error) {
			throw new SidebarError("fs-error", `cannot list "${item.path}": ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		for (let index = level.length - 1; index >= 0; index -= 1) {
			const child = level[index];
			stack.push({
				path: join(item.path, child.name),
				name: `${item.name}/${child.name}`
			});
		}
	}
}
/** How long a finished (or failed) archive stays downloadable. */
const ARCHIVE_TTL_MS = 3e5;
/**
* Answer one `GET /sidebar/archive?id=&sessionId=` from the task table.
*
* Split out of index.ts because this mapping IS the contract: 400 without
* both parameters, 403 for another session's task, 409 while it builds, 410
* for a failed build, 404 for unknown/expired/already-downloaded, 200 with the
* RFC 5987 disposition otherwise. Kept here so all six branches are testable
* without a live cordis mount.
* @param tasks - the plugin's task table.
* @param query - the request's `sessionId` / `id` values (null = absent).
* @param res - a minimal response face.
* @throws {SidebarError} for every non-200 branch (callers turn it into the
*  JSON error envelope they already use).
*/
function respondArchiveDownload(tasks, query, res) {
	if (query.sessionId === null || query.id === null || query.id === "") throw new SidebarError("bad-request", "sessionId and id are required");
	const found = tasks.lookup(query.id, query.sessionId);
	if (!found.ok || found.task.state !== "ready" || found.task.zip === void 0) {
		if (found.ok) throw new SidebarError("not-found", "archive is gone", 404);
		if (found.reason === "building") throw new SidebarError("bad-request", found.message, 409);
		if (found.reason === "forbidden") throw new SidebarError("forbidden", found.message, 403);
		if (found.reason === "error") throw new SidebarError("fs-error", found.message, 410);
		throw new SidebarError("not-found", found.message, 404);
	}
	const { name, zip } = found.task;
	tasks.release(found.task.id);
	res.writeHead(200, {
		"content-type": "application/zip",
		"content-disposition": contentDispositionOf(name),
		"content-length": String(zip.byteLength),
		"cache-control": "no-cache"
	});
	res.end(zip);
}
/** Create one archive task table (one per plugin mount). */
function createArchiveTasks() {
	const tasks = /* @__PURE__ */ new Map();
	/** Drop settled tasks past their TTL (called on every access). */
	const sweep = (now) => {
		for (const [id, task] of tasks) if (task.state !== "building" && task.expiresAt <= now) tasks.delete(id);
	};
	/** The task one (id, sessionId) pair names, or why it cannot be read. */
	const lookup = (id, sessionId) => {
		sweep(Date.now());
		const task = tasks.get(id);
		if (task === void 0) return {
			ok: false,
			reason: "missing",
			message: "unknown or expired archive"
		};
		if (task.sessionId !== sessionId) return {
			ok: false,
			reason: "forbidden",
			message: "archive belongs to another session"
		};
		if (task.state === "building") return {
			ok: false,
			reason: "building",
			message: "archive is still being built"
		};
		if (task.state === "error") return {
			ok: false,
			reason: "error",
			message: task.error ?? "archive failed"
		};
		return {
			ok: true,
			task
		};
	};
	return {
		start({ sessionId, name, entries }) {
			sweep(Date.now());
			let building = 0;
			for (const task of tasks.values()) if (task.state === "building") building += 1;
			if (building >= 4) throw new SidebarError("bad-request", `too many archives are being built (max 4)`, 409);
			const task = {
				id: `ar-${randomUUID()}`,
				sessionId,
				name,
				state: "building",
				done: 0,
				total: entries.length,
				bytes: 0,
				expiresAt: Number.POSITIVE_INFINITY
			};
			tasks.set(task.id, task);
			buildZip([...entries], { onProgress: (progress) => {
				task.done = progress.done;
				task.bytes = progress.bytes;
			} }).then((zip) => {
				task.zip = zip;
				task.state = "ready";
				task.done = task.total;
				task.expiresAt = Date.now() + ARCHIVE_TTL_MS;
			}, (error) => {
				task.state = "error";
				task.error = error instanceof Error ? error.message : String(error);
				task.expiresAt = Date.now() + ARCHIVE_TTL_MS;
			});
			return {
				id: task.id,
				entries: entries.length
			};
		},
		status(id, sessionId) {
			sweep(Date.now());
			const task = tasks.get(id);
			if (task === void 0) throw new SidebarError("not-found", "unknown or expired archive", 404);
			if (task.sessionId !== sessionId) throw new SidebarError("forbidden", "archive belongs to another session", 403);
			return {
				state: task.state,
				done: task.done,
				total: task.total,
				bytes: task.bytes,
				...task.error === void 0 ? {} : { error: task.error }
			};
		},
		lookup,
		release(id) {
			tasks.delete(id);
		},
		size() {
			sweep(Date.now());
			return tasks.size;
		}
	};
}
//#endregion
//#region src/git.ts
/**
* Git operations for the sidebar source-control panel. Everything goes
* through the system `git` binary spawned per request (no library, no state),
* with porcelain-parseable output formats (`-z` NUL framing, unit separators)
* so parsing never depends on locale or color config. All commands run with
* `-C <cwd>` on the session's working directory and `--no-pager` /
* `-c color.ui=false` so output stays machine-readable.
*
* Commits use the user's git global identity untouched (never sets
* user.name/user.email).
*/
/** One git failure (stderr text as the message). */
var GitCommandError = class extends Error {
	code;
	command;
	constructor(message, code = "git-error", command) {
		super(message);
		this.code = code;
		this.command = command;
	}
};
/** Parse porcelain v1 -z output into entries (rename/copy pairs collapse to one row). */
function parsePorcelainZ(output) {
	const tokens = output.split("\0");
	const entries = [];
	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index];
		index += 1;
		if (token === "") continue;
		const xy = token.slice(0, 2);
		const rest = token.slice(3);
		entries.push({
			path: rest,
			xy
		});
		if ((xy[0] === "R" || xy[0] === "C") && tokens[index] !== void 0 && tokens[index] !== "") index += 1;
	}
	return entries;
}
/** Parse `git worktree list --porcelain` records. Production requests use
* `-z` so even newlines and non-ASCII bytes in checkout paths stay lossless;
* newline framing remains accepted for small fixtures and older Git output. */
function parseWorktreeList(output) {
	const rows = [];
	let path;
	let branch = "HEAD";
	let locked = false;
	let prunable = false;
	const flush = () => {
		if (path !== void 0) rows.push({
			path,
			branch,
			locked,
			prunable
		});
		path = void 0;
		branch = "HEAD";
		locked = false;
		prunable = false;
	};
	const sep = output.includes("\0") ? "\0" : "\n";
	const framed = output.endsWith(sep) ? output : `${output}${sep}`;
	for (const line of framed.split(sep)) if (line === "") flush();
	else if (line.startsWith("worktree ")) path = line.slice(9);
	else if (line.startsWith("branch refs/heads/")) branch = line.slice(18);
	else if (line === "locked" || line.startsWith("locked ")) locked = true;
	else if (line === "prunable" || line.startsWith("prunable ")) prunable = true;
	return rows;
}
/** Parse `git log --pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D` rows. */
function parseLogLines(output) {
	const rows = [];
	for (const line of output.split("\n")) {
		if (line === "") continue;
		const [hash, subject, author, date, hashFull, refs] = line.split("");
		if (hash === void 0 || subject === void 0) continue;
		rows.push({
			hash,
			subject,
			author: author ?? "",
			date: date ?? "",
			hashFull: hashFull ?? hash,
			refs: refs ?? ""
		});
	}
	return rows;
}
/** Run one git command; resolves with stdout, rejects with GitCommandError. */
function runGit(cwd, args, timeoutMs = 3e4) {
	const full = [
		"-C",
		cwd,
		"--no-pager",
		"-c",
		"color.ui=false",
		...args
	];
	return new Promise((resolvePromise, reject) => {
		const child = spawn("git", full, {
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			windowsHide: true,
			env: {
				...process.env,
				GIT_OPTIONAL_LOCKS: "0"
			}
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new GitCommandError(`git ${args[0] ?? ""} timed out after ${timeoutMs}ms`, "git-error", args.join(" ")));
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(new GitCommandError(`cannot run git: ${error.message}`, "git-error", args.join(" ")));
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolvePromise(stdout);
			else reject(new GitCommandError(stderr.trim() || `git exited with ${String(code)}`, "git-error", args.join(" ")));
		});
	});
}
/** Cap on child directories probed by the workspace-container fallback scan.
*  A home-directory cwd can hold hundreds of visible folders (Library, iCloud
*  mounts…); probing them all serially is what froze the panel in #369. */
const DISCOVERY_LIMIT = 200;
/** Per-probe and direct-discovery budget. `rev-parse` is millisecond-scale on
*  a healthy checkout; a probe that needs longer is a stalled mount and is
*  better abandoned than waited on. */
const DISCOVERY_TIMEOUT_MS = 5e3;
/** Discovery results are cheap to recompute but expensive to storm: the panel
*  polls every 2s and each poll fans out into several git.* calls that all
*  resolve the same roots. A short TTL keeps fan-out at one scan per cwd. */
const DISCOVERY_CACHE_TTL_MS = 6e4;
const repoRootsCache = /* @__PURE__ */ new Map();
const repoRootsInFlight = /* @__PURE__ */ new Map();
/** Whether the directory is inside a git work tree (exit-0 `git rev-parse`).
*  Probe timeout is short: a cwd on a stalled mount must not hold the panel
*  hostage for the full command budget (issue #369). */
async function isGitRepo(cwd) {
	try {
		return (await runGit(cwd, ["rev-parse", "--is-inside-work-tree"], DISCOVERY_TIMEOUT_MS)).trim() === "true";
	} catch {
		return false;
	}
}
/** The repository top level containing `cwd` (`git rev-parse --show-toplevel`). */
async function directRepoRoot(cwd) {
	return (await runGit(cwd, ["rev-parse", "--show-toplevel"], DISCOVERY_TIMEOUT_MS)).trim();
}
/** Discover the current repository or direct child repositories. Results are
*  cached per cwd and concurrent callers share one in-flight scan, so opening
*  the panel (three parallel git.* requests) costs a single discovery pass. */
function repoRoots(cwd) {
	const cached = repoRootsCache.get(cwd);
	if (cached !== void 0 && cached.expires > Date.now()) return Promise.resolve(cached.roots);
	const pending = repoRootsInFlight.get(cwd);
	if (pending !== void 0) return pending;
	const promise = discoverRepoRoots(cwd).then((roots) => {
		repoRootsCache.set(cwd, {
			roots,
			expires: Date.now() + DISCOVERY_CACHE_TTL_MS
		});
		repoRootsInFlight.delete(cwd);
		return roots;
	}, (error) => {
		repoRootsInFlight.delete(cwd);
		throw error;
	});
	repoRootsInFlight.set(cwd, promise);
	return promise;
}
async function discoverRepoRoots(cwd) {
	try {
		return [await directRepoRoot(cwd)];
	} catch {
		const entries = await readdir(cwd, { withFileTypes: true }).catch(() => []);
		const roots = [];
		for (const entry of entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules").sort((left, right) => left.name.localeCompare(right.name)).slice(0, DISCOVERY_LIMIT)) try {
			const root = await directRepoRoot(join(cwd, entry.name));
			if (!roots.some((existing) => pathIdentity(existing) === pathIdentity(root))) roots.push(root);
		} catch {}
		return roots;
	}
}
/** Resolve the selected repository, defaulting to the first discovered root. */
async function repoRoot(cwd, selected) {
	const roots = await repoRoots(cwd);
	if (roots.length === 0) throw new GitCommandError("not a git repository", "not-repo", "rev-parse");
	if (selected !== void 0) {
		const identity = pathIdentity(selected);
		const match = roots.find((root) => pathIdentity(root) === identity);
		if (match !== void 0) return match;
	}
	return roots[0];
}
/** The current branch name (`git rev-parse --abbrev-ref HEAD`; 'HEAD' when detached). */
async function currentBranch(cwd) {
	return (await runGit(cwd, [
		"rev-parse",
		"--abbrev-ref",
		"HEAD"
	])).trim();
}
/** Upper bound on status rows shipped to the client. Beyond this the result
*  is truncated (with `truncated: true`) so a pathological untracked set —
*  e.g. the working tree discovered under a home-directory cwd — cannot
*  freeze the browser main thread on JSON parse or list render (#369). */
const GIT_STATUS_LIMIT = 2e3;
/**
* Working-tree status (untracked included). `--untracked-files=all` lists
* the contents of new directories as individual entries, while preserving
* repository discovery and explicit repository selection for workspace roots.
*/
async function status(cwd, selected) {
	const repositories = await repoRoots(cwd);
	if (repositories.length === 0) return {
		isRepo: false,
		entries: [],
		repositories: []
	};
	const root = await repoRoot(cwd, selected);
	const [branch, raw] = await Promise.all([currentBranch(root).catch(() => "HEAD"), runGit(root, [
		"status",
		"--porcelain=v1",
		"-z",
		"--untracked-files=all"
	])]);
	const parsed = parsePorcelainZ(raw);
	const truncated = parsed.length > GIT_STATUS_LIMIT;
	return {
		isRepo: true,
		branch,
		entries: truncated ? parsed.slice(0, GIT_STATUS_LIMIT) : parsed,
		truncated,
		root,
		repositories
	};
}
/** Platform-aware identity used only for comparing absolute checkout roots. */
function pathIdentity(path) {
	const absolute = resolve(path).replace(/[\\/]+$/, "");
	return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
/** Whether the current Git binary supports NUL-framed `worktree list` output.
* Git < 2.36 rejects `-z`; cache the capability after the first attempt so
* the SCM panel's polling does not repeatedly spawn a command known to fail. */
let worktreeListSupportsZ;
/** Raw usable checkout records, shared by inventory and target validation.
* Prunable records point at missing paths and are deliberately excluded from
* both the selector and the command-target allowlist. */
async function listedWorktrees(cwd) {
	let raw;
	if (worktreeListSupportsZ === false) raw = await runGit(cwd, [
		"worktree",
		"list",
		"--porcelain"
	]);
	else try {
		raw = await runGit(cwd, [
			"worktree",
			"list",
			"--porcelain",
			"-z"
		]);
		worktreeListSupportsZ = true;
	} catch {
		worktreeListSupportsZ = false;
		raw = await runGit(cwd, [
			"worktree",
			"list",
			"--porcelain"
		]);
	}
	return parseWorktreeList(raw).filter((entry) => !entry.prunable);
}
/** All linked checkouts of the repository containing `cwd`, enriched with a
* live change count. The current checkout is first so a single-worktree repo
* preserves the old UI ordering. */
async function worktrees(cwd) {
	if (!await isGitRepo(cwd)) return [];
	const currentRoot = await repoRoot(cwd);
	const listed = await listedWorktrees(cwd);
	return (await Promise.all(listed.map(async (entry) => ({
		path: entry.path,
		branch: entry.branch,
		current: pathIdentity(entry.path) === pathIdentity(currentRoot),
		changes: await status(entry.path).then((result) => result.entries.length, () => 0)
	})))).sort((left, right) => Number(right.current) - Number(left.current));
}
/** Resolve an optional client-selected linked checkout. A caller may never use
* this seam to point Git operations at an unrelated repository: the target
* must occur in the authoritative session repository's worktree list. */
async function resolveWorktree(cwd, requested) {
	if (requested === void 0 || requested === "") return cwd;
	const identity = pathIdentity(requested);
	const match = (await listedWorktrees(cwd)).find((entry) => pathIdentity(entry.path) === identity);
	if (match === void 0) throw new GitCommandError(`unknown linked worktree: ${requested}`, "git-worktree", "worktree list");
	return match.path;
}
/** Diff text of the worktree (unstaged) or the index (staged). */
async function diff(cwd, path, staged, selected) {
	const root = await repoRoot(cwd, selected);
	const args = [
		"diff",
		"--no-ext-diff",
		"--no-color",
		"-U3"
	];
	if (staged) args.push("--cached");
	if (path !== void 0) args.push("--", path);
	return runGit(root, args);
}
/** Stage paths (all when path is undefined). */
async function stage(cwd, path, selected) {
	await runGit(await repoRoot(cwd, selected), [
		"add",
		"-A",
		...path !== void 0 ? ["--", path] : []
	]);
}
/** Unstage paths (all when path is undefined). */
async function unstage(cwd, path, selected) {
	await runGit(await repoRoot(cwd, selected), [
		"reset",
		"-q",
		...path !== void 0 ? ["--", path] : []
	]);
}
/** Commit the staged changes with a message (global identity untouched). */
async function commit(cwd, message, selected) {
	await runGit(await repoRoot(cwd, selected), [
		"commit",
		"-m",
		message
	]);
}
/** Branch names (current first). */
async function branches(cwd, selected) {
	const root = await repoRoot(cwd, selected);
	const [current, raw] = await Promise.all([currentBranch(root).catch(() => "HEAD"), runGit(root, [
		"for-each-ref",
		"--format=%(refname:short)",
		"refs/heads"
	])]);
	const names = raw.split("\n").filter((line) => line !== "");
	return {
		current,
		names: names.includes(current) ? names : [current, ...names]
	};
}
/** Switch to an existing branch. */
async function checkout(cwd, branch, selected) {
	await runGit(await repoRoot(cwd, selected), ["checkout", branch]);
}
/** Recent commit history (newest first), lazily pageable via skip/count. */
async function log(cwd, count = 30, skip = 0, selected) {
	return parseLogLines(await runGit(await repoRoot(cwd, selected), [
		"log",
		"-n",
		String(count),
		"--skip",
		String(skip),
		"--decorate=short",
		"--pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D"
	]));
}
/**
* Content of a file at a revision (`git show <rev>:<path>`), or null when the
* revision has no such path (a new/untracked file has no HEAD side).
*/
async function show(cwd, rev, path, selected) {
	try {
		return await runGit(await repoRoot(cwd, selected), ["show", `${rev}:${path}`]);
	} catch {
		return null;
	}
}
/** Full patch text of one commit (`git show` with the commit header suppressed).
*  Merge commits show their diff against the first parent (`-m --first-parent`
*  is a no-op for regular commits), so a history click always has content. */
async function commitDiff(cwd, hash, selected) {
	return runGit(await repoRoot(cwd, selected), [
		"show",
		"--no-ext-diff",
		"--no-color",
		"--format=",
		"-m",
		"--first-parent",
		hash
	]);
}
/** Discard the worktree changes of one path (`git checkout -- <path>`; the index is untouched). */
async function discard(cwd, path, selected) {
	await runGit(await repoRoot(cwd, selected), [
		"checkout",
		"--",
		path
	]);
}
/** Revert one commit onto the current branch with an auto-generated message. */
async function revert(cwd, hash, selected) {
	await runGit(await repoRoot(cwd, selected), [
		"revert",
		"--no-edit",
		hash
	]);
}
/** Cherry-pick one commit onto the current branch. */
async function cherryPick(cwd, hash, selected) {
	await runGit(await repoRoot(cwd, selected), ["cherry-pick", hash]);
}
//#endregion
//#region src/agent-opens.ts
/**
* The model-facing `sidebar_open` tool and its delivery registry.
*
* One tool lets the model actively open a local file, a local folder (as a
* tree rooted there), or an HTTP(S) page in the CALLING session's sidebar.
* Mirroring the agent-terminal tools, the tool binds to the calling agent's
* session through `exec.agent.session.id` — the model never passes a
* sessionId, and opens for non-active sessions are queued until that
* session's sidebar view is next connected.
*
* Delivery is a host→browser push over the dedicated `/sidebar/ws/agent-opens`
* endpoint (the same pattern as `/sidebar/ws/agent-terminals`): the registry
* keeps a per-session queue; a push is consumed on send (`delivered: true`
* means a sidebar view was attached at call time), otherwise the request
* stays queued and is replayed when a view for that session attaches.
*
* Conventions (per plugin-development-guide.md §3):
*   C1 — parameters schema-validated before `execute` runs.
*   C4 — `execute` returns one canonical JSON value; `render` is a separate
*        pure text projection.
*   C6 — `exec.signal.throwIfAborted()` before any fs work.
*   C10 — no UI/transport vocabulary in the canonical value.
*/
/**
* Per-session queue of open requests plus the connected sidebar views.
*
* Lifecycle: `enqueue` adds a request and — when at least one view for the
* session is attached — pushes it immediately and removes it from the queue
* (consume-on-send: a reconnect must never replay an open the client already
* applied, and the browser tab type has no per-URL dedupe, so replaying
* would mint duplicate tabs). With no attached view the request stays queued
* and `attach` replays it on connect. `drainAll` drops every queued request
* (the feature was turned off); `dispose` also drops every subscriber.
*/
var AgentOpenRegistry = class {
	pending = /* @__PURE__ */ new Map();
	subscribers = /* @__PURE__ */ new Map();
	/** Queue one open and deliver it immediately when a view is attached.
	* @returns the request id and whether a connected view received it now. */
	enqueue(sessionId, kind, target, title) {
		const request = {
			id: randomUUID(),
			sessionId,
			kind,
			target,
			title
		};
		const list = this.pending.get(sessionId) ?? [];
		list.push(request);
		this.pending.set(sessionId, list);
		const views = this.subscribers.get(sessionId);
		if (views !== void 0 && views.size > 0) {
			for (const send of views) send(request);
			this.pending.delete(sessionId);
			return {
				id: request.id,
				delivered: true
			};
		}
		return {
			id: request.id,
			delivered: false
		};
	}
	/** Attach one sidebar view (replays queued requests; consume-on-send).
	* @returns the disposer detaching the view. */
	attach(sessionId, send) {
		let views = this.subscribers.get(sessionId);
		if (views === void 0) {
			views = /* @__PURE__ */ new Set();
			this.subscribers.set(sessionId, views);
		}
		views.add(send);
		const queued = this.pending.get(sessionId) ?? [];
		if (queued.length > 0) {
			for (const request of queued) send(request);
			this.pending.delete(sessionId);
		}
		return () => {
			const current = this.subscribers.get(sessionId);
			current?.delete(send);
			if (current !== void 0 && current.size === 0) this.subscribers.delete(sessionId);
		};
	}
	/** Drop every queued request (the feature was turned off mid-session). */
	drainAll() {
		this.pending.clear();
	}
	/** Drop the queue and every subscriber (plugin teardown). */
	dispose() {
		this.pending.clear();
		this.subscribers.clear();
	}
};
/** Extract the calling agent or throw the canonical "no agent" error. */
function requireAgent(agent) {
	if (agent === void 0) throw new Error("sidebar_open requires an initiating agent");
	return agent;
}
/** Resolve the calling agent's session id (the queue scope + ownership key). */
function sessionIdOf(exec) {
	return requireAgent(exec.agent).session.id;
}
/** Pure text projection helper (the canonical value is already structured). */
function textRender(fn) {
	return (_args, value) => [{
		type: "text",
		text: fn(value)
	}];
}
/** Classify a raw target: http(s) URL or a local path (stat-driven). */
async function classifyTarget(raw, cwd) {
	if (/^https?:\/\//i.test(raw)) {
		let parsed;
		try {
			parsed = new URL(raw);
		} catch {
			throw new Error(`"${raw}" is not a valid URL`);
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("sidebar_open only accepts http:// and https:// URLs");
		return {
			kind: "url",
			target: raw,
			title: parsed.hostname !== "" ? parsed.hostname : raw
		};
	}
	if (!isWindowsDrivePrefix(raw) && /^[a-z][a-z0-9+.-]*:/i.test(raw)) throw new Error("sidebar_open only accepts http:// and https:// URLs; use a local path for files");
	const target = resolve(isAbsolute(raw) ? raw : join(cwd, raw));
	let info;
	try {
		info = await stat(target);
	} catch (error) {
		const code = error.code;
		if (code === "ENOENT") throw new Error(`"${raw}" does not exist (resolved to "${target}")`, { cause: error });
		if (code === "EACCES" || code === "EPERM") throw new Error(`"${target}" is not readable`, { cause: error });
		throw new Error(`cannot open "${target}": ${error instanceof Error ? error.message : String(error)}`, { cause: error });
	}
	const title = basenameOf(target);
	return {
		kind: info.isDirectory() ? "folder" : "file",
		target,
		title: title === "" ? raw : title
	};
}
/** The last path segment (mirror of the client's FileTree baseName). */
function basenameOf(path) {
	const trimmed = path.replace(/[\\/]+$/, "");
	const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return at === -1 ? trimmed : trimmed.slice(at + 1);
}
/** Whether a raw target starts with a Windows drive prefix (`C:\` / `C:/`). */
function isWindowsDrivePrefix(raw) {
	return /^[a-zA-Z]:[\\/]/.test(raw);
}
/**
* Register the `sidebar_open` tool against the host tool registry. The tool
* is gated by the side-card setting `agentOpenTools` (the caller registers
* and unregisters it); `readPrefs` supplies the live prefs so a disabled
* target tab type (editor/browser) is reported to the model instead of
* silently no-oping on the client. `resolveCwd` threads the calling
* session's live cwd so relative paths resolve the same way the sidebar's
* own routes do.
* @param ctx - host plugin context (carries the tools service).
* @param registry - the open-request registry (per-session queue + views).
* @param resolveCwd - async cwd resolver for one session id. Resolves through
*  the session header, the client-supplied cwd, and the persistence index
*  before falling back to the host process cwd (production always provides
*  persistence, so the fallback is reached only in tests / stripped-down hosts).
* @param readPrefs - live resolved side card prefs (for tab enable gates).
* @returns a disposer that unregisters the tool.
*/
function registerOpenTool(ctx, registry, resolveCwd, readPrefs) {
	return ctx.tools.register(defineTool({
		name: "sidebar_open",
		description: "Open a local file, a local folder, or an HTTP(S) page in the sidebar of the calling conversation. A file opens in the sidebar editor (per-path dedupe: an already-open file is focused); a folder opens a file window whose tree is rooted at that folder; a URL opens in the sidebar browser (sandboxed iframe). The panel auto-expands for content opens and the tab title defaults to the file/folder name or the URL hostname. The path may be absolute or relative to the session working directory. The open lands in the CALLING session's sidebar: while that session's sidebar view is not connected (e.g. the session is not the active one), the open is queued and delivered when the session sidebar is next shown — the result reports `delivered` so you know whether it is visible right now. The side card setting \"model opens files/folders/pages in the sidebar\" must be on, and the target tab type must be enabled in that session's settings.",
		parameters: {
			target: {
				type: "string",
				required: true,
				description: "Absolute or session-cwd-relative local path, or an http:// / https:// URL."
			},
			title: {
				type: "string",
				description: "Optional tab title (defaults to the file/folder name or the URL hostname)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						description: "What was opened: file | folder | url."
					},
					target: {
						type: "string",
						required: true,
						description: "The absolute path or URL the open was requested for."
					},
					title: {
						type: "string",
						required: true,
						description: "The tab title used (provided title, basename, or hostname)."
					},
					delivered: {
						type: "boolean",
						required: true,
						description: "Whether the open was pushed to a connected sidebar at call time (false = queued until the session sidebar is next shown)."
					}
				}
			},
			render: textRender((v) => v.delivered ? `Opened ${v.kind} "${v.title}" (${v.target}) in the sidebar.` : `Requested opening ${v.kind} "${v.title}" (${v.target}) in the sidebar — the session sidebar is not connected yet, so the open is queued and will appear when it is next shown.`)
		},
		execute: async (args, exec) => {
			exec.signal.throwIfAborted();
			const sessionId = sessionIdOf(exec);
			const cwd = await resolveCwd(sessionId);
			const { kind, target, title: defaultTitle } = await classifyTarget(args.target, cwd);
			const prefs = readPrefs();
			const tab = kind === "url" ? "browser" : "editor";
			if (prefs.tabsEnabled[tab] === false) throw new Error(`the built-in ${tab} tab is disabled in the side card settings; ask the user to enable it (or disable this tool)`);
			const title = args.title !== void 0 && args.title.trim() !== "" ? args.title : defaultTitle;
			const { delivered } = registry.enqueue(sessionId, kind, target, title);
			return {
				kind,
				target,
				title,
				delivered
			};
		}
	}));
}
//#endregion
//#region src/sidechat-core.ts
/** The durable thread-label prefix (also the row filter in the client list). */
const SIDE_LABEL_PREFIX = "Side: ";
/** The pinned label of a freshly created thread that no prompt has reached
*  yet (Codex-style immediate create: the tab opens an EMPTY thread, the
*  first composer message carries the boundary and earns the real label).
*  The client renders it localized; the prefix keeps the row filter honest. */
const SIDE_NEW_THREAD_TITLE = "Side: New thread";
/** The plugin's producer-owned source kind, stamped on the source of
*  context-injection messages (boundary prompt + parked snapshot) so the
*  transcript recognizes them structurally — not by text prefix. Session
*  format v4 retired the bare `kind: 'plugin'` + `plugin` pair; a plugin is
*  now identified by its own `plugin:<name>` kind, which is exactly what
*  DSH's own v3→v4 migration derives for rows this plugin wrote earlier, so
*  both generations read back under one shape. */
const SIDE_INJECTION_SOURCE_KIND = "plugin:dsh-better-sidebar";
/**
* The boundary prompt delivered as the thread's first user message: the
* inherited seed is reference context only, never active instruction.
* Model-facing contract — change only with intent, tests pin the sentences.
*/
const SIDE_BOUNDARY_PROMPT = `Side conversation boundary.

Everything before this boundary is inherited history from the parent session: its completed turns, its pending question, and — if the parent was mid-turn — its in-progress output frozen at the moment this side conversation started. It is reference context only. It is not your current task.

Do not continue, execute, or complete any instructions, plans, tool calls, approvals, edits, or requests from before this boundary. Only messages submitted after this boundary are active user instructions for this side conversation.

Mode: this is a continuable side conversation. Your answers stay in this side thread and are viewed in the side panel; they are never delivered into the parent session.`;
/**
* Project buffered live chunks into wire rows.
* @param chunks - the session's active-attempt chunks, in index order.
* @param tailSeq - the session's last durable seq (live rows order after it).
* @returns the rows to append to the transcript feed.
*/
function liveEventsOf(chunks, tailSeq) {
	return chunks.map((delta, position) => ({
		type: "assistant/live-chunk",
		seq: tailSeq + 1 + position,
		time: delta.time,
		data: {
			attemptId: delta.attemptId,
			turn: delta.turn,
			step: delta.step,
			index: delta.index,
			chunk: delta.chunk
		}
	}));
}
/** The data record of one event (narrowed from the loose face). */
function dataOf(event) {
	return event.data;
}
/** Copy parent events verbatim (their live seq === array index contract).
*  The FULL envelope is preserved — stripping `surfaceOp` would make the
*  seed validator reject every surface-eligible message event. */
function copyEvents(events) {
	return events.map((event) => {
		const source = event;
		return {
			type: source.type,
			seq: source.seq,
			time: source.time,
			data: dataOf(source),
			...source.surfaceOp === void 0 ? {} : { surfaceOp: source.surfaceOp },
			...source.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: source.sourceEventSeqs },
			...source.ignorable === void 0 ? {} : { ignorable: source.ignorable }
		};
	});
}
/** Index of the last `turn/start` or `turn/end`, or -1. */
function lastTurnBoundary(events) {
	for (let index = events.length - 1; index >= 0; index--) {
		const type = events[index]?.type;
		if (type === "turn/start" || type === "turn/end") return index;
	}
	return -1;
}
/** Numeric field of an event's data (turn / step numbers). */
function numberAt(data, key) {
	const value = data[key];
	return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}
/** The step number still open at the log tail inside the turn starting at
*  `turnStart` (undefined when no step is open). */
function openStepInTurn(events, turnStart) {
	let open;
	for (let index = turnStart + 1; index < events.length; index++) {
		const event = events[index];
		if (event === void 0) continue;
		if (event.type === "step/start") open = numberAt(dataOf(event), "step");
		else if (event.type === "step/end") open = void 0;
	}
	return open;
}
/**
* Whether the open turn ending the log has a `tool/call` without its paired
* `tool/result` in the CURRENT open step. Providers reject dangling
* assistant calls, so such a turn cannot be honestly closed and the
* inheritance must fall back to the snapshot.
*/
function hasDanglingToolCall(events, turnStart) {
	const pending = /* @__PURE__ */ new Set();
	for (let index = turnStart + 1; index < events.length; index++) {
		const event = events[index];
		if (event === void 0) continue;
		const data = dataOf(event);
		if (event.type === "step/end") {
			pending.clear();
			continue;
		}
		if (event.type === "tool/call") {
			const callId = data.callId;
			if (typeof callId === "string") pending.add(callId);
			continue;
		}
		if (event.type === "tool/result") {
			const callId = data.message?.source?.callId;
			if (typeof callId === "string") pending.delete(callId);
		}
	}
	return pending.size > 0;
}
/**
* The result content blocks of one tool/result message under BOTH logged
* shapes: 0.1.6 wrapped them in a single `type: 'tool-result'` content block
* on a user-role message, 0.1.7's first-class tool-role message carries them
* at the message's own top level. Historical logs keep the old shape forever,
* so both are read. Undefined when the message carries no block array.
*/
function resultBlocks(content) {
	if (!Array.isArray(content)) return void 0;
	for (const block of content) {
		if (block === null || typeof block !== "object") continue;
		const wrapper = block;
		if (wrapper.type === "tool-result" && Array.isArray(wrapper.content)) return wrapper.content;
	}
	return content;
}
/** The plain text of one tool/result message (its text blocks, under either
*  of the two shapes {@link resultBlocks} reads). */
function toolResultText(data) {
	const message = data.message;
	const blocks = resultBlocks(message?.content);
	if (blocks === void 0) return "";
	const parts = [];
	for (const item of blocks) {
		if (item === null || typeof item !== "object") continue;
		const textItem = item;
		if (textItem.type === "text" && typeof textItem.text === "string") parts.push(textItem.text);
	}
	return parts.join("\n");
}
/** Cap applied to one tool-result's text inside a snapshot (prompt budget). */
const SNAPSHOT_RESULT_CAP = 2e3;
/** Cap applied to the whole snapshot (prompt budget). */
const SNAPSHOT_TOTAL_CAP = 8e3;
/**
* Build the side-thread inheritance for one parent log: the full event log
* up to the click moment, honestly closed when it ends inside an open turn.
* @param events - the parent's log (live or persisted).
* @param live - the parent's in-flight stream chunks (DSH 0.1.5+ publishes
*   them outside the log); used only by the snapshot fallback.
*/
function buildSidechatInheritance(events, live = []) {
	if (events.length === 0) return {
		seed: [],
		snapshot: null
	};
	const boundary = lastTurnBoundary(events);
	if (boundary < 0 || events[boundary]?.type === "turn/end") return {
		seed: copyEvents(events),
		snapshot: null
	};
	if (hasDanglingToolCall(events, boundary)) return {
		seed: copyEvents(events.slice(0, boundary)),
		snapshot: buildOpenTurnSnapshot(events, live)
	};
	const seed = copyEvents(events);
	const last = events[events.length - 1];
	const turn = numberAt(dataOf(events[boundary]), "turn");
	const now = last?.time ?? 0;
	const openStep = openStepInTurn(events, boundary);
	if (openStep !== void 0) seed.push({
		type: "step/end",
		seq: seed.length,
		time: now,
		data: {
			turn,
			step: openStep
		}
	});
	seed.push({
		type: "turn/end",
		seq: seed.length,
		time: now,
		data: {
			turn,
			reason: { kind: "interrupted" }
		}
	});
	return {
		seed,
		snapshot: null
	};
}
/** One assistant content block reduced to the text the snapshot shows. */
function messageTexts(message) {
	const content = message?.content;
	let text = "";
	let reasoning = "";
	if (!Array.isArray(content)) return {
		text,
		reasoning
	};
	for (const block of content) {
		if (block === null || typeof block !== "object") continue;
		const candidate = block;
		if (typeof candidate.text !== "string" || candidate.text === "") continue;
		if (candidate.type === "text") text += candidate.text;
		else if (candidate.type === "reasoning") reasoning += candidate.text;
	}
	return {
		text,
		reasoning
	};
}
/**
* Expand one attempt's compact `AssistantStreamRecord[]` (the durable stream
* DSH 0.1.5 embeds in `assistant/message.stream` and `assistant/attempt.stream`)
* into the text/reasoning it carried. Tool-call records contribute no text.
*/
function streamTexts(stream) {
	let text = "";
	let reasoning = "";
	if (!Array.isArray(stream)) return {
		text,
		reasoning
	};
	for (const record of stream) {
		if (record === null || typeof record !== "object") continue;
		const entry = record;
		if (entry.type === "text-chunks" || entry.type === "reasoning-chunks") {
			if (!Array.isArray(entry.texts)) continue;
			const joined = entry.texts.filter((part) => typeof part === "string").join("");
			if (entry.type === "text-chunks") text += joined;
			else reasoning += joined;
			continue;
		}
		if (entry.type === "chunk") {
			const chunk = entry.chunk;
			if (chunk === null || typeof chunk !== "object" || typeof chunk.text !== "string") continue;
			if (chunk.type === "text-delta") text += chunk.text;
			else if (chunk.type === "reasoning-delta") reasoning += chunk.text;
		}
	}
	return {
		text,
		reasoning
	};
}
/** One live delta's contribution to the snapshot. */
function liveTexts(chunk) {
	if (typeof chunk.text !== "string" || chunk.text === "") return {
		text: "",
		reasoning: ""
	};
	if (chunk.type === "text-delta") return {
		text: chunk.text,
		reasoning: ""
	};
	if (chunk.type === "reasoning-delta") return {
		text: "",
		reasoning: chunk.text
	};
	return {
		text: "",
		reasoning: ""
	};
}
/**
* Structured text snapshot of the parent's OPEN turn (from its `turn/start`
* to the log tail): the assistant/reasoning output so far and the tool
* activity — executed tools with their result text, the still-executing one
* marked. Returns null when there is no open turn or nothing to show.
*
* The in-flight step's text is NOT in the log on DSH 0.1.5 (the model stream
* is process-local until it settles), so it comes from `live`; settled steps
* read their durable `assistant/message` content, and a failed attempt reads
* its embedded `assistant/attempt.stream`.
* @param events - the parent's log.
* @param live - the parent's in-flight stream chunks, in index order.
*/
function buildOpenTurnSnapshot(events, live = []) {
	const boundary = lastTurnBoundary(events);
	if (boundary < 0 || events[boundary]?.type !== "turn/start") return null;
	const openTurn = numberAt(dataOf(events[boundary]), "turn");
	let text = "";
	let reasoning = "";
	const tools = [];
	const pendingCalls = /* @__PURE__ */ new Map();
	for (let index = boundary + 1; index < events.length; index++) {
		const event = events[index];
		if (event === void 0) continue;
		const data = dataOf(event);
		if (event.type === "step/end") {
			pendingCalls.clear();
			continue;
		}
		if (event.type === "assistant/message") {
			const settled = messageTexts(data.message);
			text += settled.text;
			reasoning += settled.reasoning;
			continue;
		}
		if (event.type === "assistant/attempt") {
			const attempt = streamTexts(data.stream);
			text += attempt.text;
			reasoning += attempt.reasoning;
			continue;
		}
		if (event.type === "tool/call") {
			const callId = data.callId;
			if (typeof callId === "string") pendingCalls.set(callId, {
				name: typeof data.name === "string" ? data.name : "tool",
				args: typeof data.arguments === "string" ? data.arguments : ""
			});
			continue;
		}
		if (event.type === "tool/result") {
			const source = data.message;
			const callId = typeof source?.source?.callId === "string" ? source.source.callId : void 0;
			const name = callId !== void 0 ? pendingCalls.get(callId)?.name : void 0;
			const args = callId !== void 0 ? pendingCalls.get(callId)?.args : void 0;
			if (callId !== void 0) pendingCalls.delete(callId);
			const result = toolResultText(data).slice(0, SNAPSHOT_RESULT_CAP);
			const failed = data.error !== void 0;
			const line = [`- \`${name ?? "tool"}\`${failed ? " (failed)" : ""}` + (args !== void 0 && args !== "" ? ` — arguments: \`${args}\`` : ""), ...result === "" ? [] : [`  Result: ${result}`]].join("\n");
			tools.push(line);
		}
	}
	for (const [, call] of pendingCalls) {
		const line = `- \`${call.name}\` (executing) — arguments: \`${call.args}\``;
		tools.push(line);
	}
	for (const delta of live) {
		if (delta.turn !== openTurn) continue;
		const contribution = liveTexts(delta.chunk);
		text += contribution.text;
		reasoning += contribution.reasoning;
	}
	const sections = [];
	if (text.trim() !== "") sections.push(`Assistant output so far:\n\n${text}`);
	if (reasoning.trim() !== "") sections.push(`Reasoning so far:\n\n${reasoning}`);
	if (tools.length > 0) sections.push(`Tool activity:\n${tools.join("\n")}`);
	if (sections.length === 0) return null;
	const body = sections.join("\n\n");
	return body.length > SNAPSHOT_TOTAL_CAP ? `Parent session in-progress turn (reference only):\n\n${body.slice(0, SNAPSHOT_TOTAL_CAP)}…` : `Parent session in-progress turn (reference only):\n\n${body}`;
}
/** Truncate + prefix a question into a durable thread label. */
function sideLabel(question) {
	const flat = question.replace(/\s+/g, " ").trim();
	const max = Math.max(1, 42);
	const body = flat.length > max ? `${flat.slice(0, 41)}…` : flat;
	return `${SIDE_LABEL_PREFIX}${body}`;
}
/**
* Whether the thread log already carries the side boundary message — i.e.
* the first prompt was delivered. Tolerant to the content shape (block
* array or bare string) and to inherited seed messages (only an OWN
* boundary message starts with the prefix; seed messages came from the
* parent's log, which never contains one).
*/
function boundaryDelivered(events) {
	for (const event of events) {
		if (event.type !== "user/message") continue;
		if (messageLeadText(dataOf(event)).startsWith("Side conversation boundary")) return true;
	}
	return false;
}
/** The leading text of a user/message's content (block array or bare string). */
function messageLeadText(data) {
	const content = data.content;
	const first = Array.isArray(content) ? content[0] : content;
	return typeof first === "string" ? first : typeof first === "object" && first !== null && "text" in first ? String(first.text) : "";
}
/** The events a thread produced itself: everything after the LAST
*  `session/end-seed` marker (the fork-seed boundary). A log with no marker
*  (a thread created before seeding existed) is returned whole. */
function threadOwnLogEvents(events) {
	for (let index = events.length - 1; index >= 0; index--) if (events[index]?.type === "session/end-seed") return events.slice(index + 1);
	return [...events];
}
/**
* The agent preset a session actually runs: newest `agent-preset/selected`
* event wins, else the creation header (mirror of the dsh-agent-presets
* resolveSessionPreset helper — replicated here to avoid a host dependency
* on that package).
*/
function resolvePresetId(header, events) {
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.type !== "agent-preset/selected") continue;
		const preset = dataOf(event).agentPreset;
		if (typeof preset === "string") return preset;
	}
	return header.agentPreset;
}
/**
* The host's category map, verbatim (the arms are mutually exclusive, so the
* order only mirrors the host's for review).
* @param name - durable tool-call name.
* @returns the category the main agent's process group counts it under.
*/
function activityOf(name) {
	if (name === "read") return "read";
	if (name === "read_image") return "readImage";
	if (name === "grep" || name === "glob" || name.endsWith("_inspect")) return "search";
	if (name === "write") return "write";
	if (name === "edit" || name === "apply_patch") return "edit";
	if ([
		"bash",
		"pwsh",
		"exec_command",
		"write_stdin"
	].includes(name) || name.startsWith("terminal_")) return "commands";
	if (name === "run_code") return "code";
	if (name === "web_search") return "webSearch";
	if (name === "web_fetch") return "webFetch";
	if (name === "subagent" || name.startsWith("subagent_")) return "subagents";
	if ([
		"todo_write",
		"create_goal",
		"update_goal",
		"get_goal"
	].includes(name)) return "plan";
	if (name === "ask_user_question" || name === "request_user_input") return "questions";
	return "tools";
}
/** The host's live-detail key priority, verbatim. */
const LIVE_TOOL_DETAIL_KEYS = [
	"title",
	"description",
	"objective",
	"task",
	"task_name",
	"name",
	"question",
	"questions",
	"prompt",
	"message",
	"command",
	"cmd",
	"queries",
	"query",
	"pattern",
	"url",
	"uri",
	"file_path",
	"path",
	"target",
	"action",
	"status"
];
/** Grapheme segmenter when the runtime has one (the host relies on `Intl.Segmenter`). */
const SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : void 0;
/** Split into user-perceived characters, falling back to code points. */
function graphemes(text) {
	if (SEGMENTER === void 0) return Array.from(text);
	return Array.from(SEGMENTER.segment(text), (part) => part.segment);
}
/** Collapse whitespace and truncate on a grapheme boundary (the host's normalize). */
function normalizeDetail(value) {
	const flat = (typeof value === "string" ? value : Array.isArray(value) && value.every((item) => typeof item === "string") ? value.join(", ") : "").replace(/\s+/g, " ").trim();
	const chars = graphemes(flat);
	if (chars.length <= 160) return flat;
	return `${chars.slice(0, 159).join("").trimEnd()}…`;
}
/** The first `question` string of an `ask_user_question` argument list. */
function questionDetail(value) {
	if (!Array.isArray(value)) return "";
	for (const item of value) {
		if (item === null || typeof item !== "object") continue;
		const detail = normalizeDetail(item.question);
		if (detail !== "") return detail;
	}
	return "";
}
/**
* The host's `liveToolDetail`: parse the raw arguments and take the first
* present key of {@link LIVE_TOOL_DETAIL_KEYS}, falling back to the tool name.
* @param name - tool-call name.
* @param argsRaw - the call's raw `arguments` JSON string.
*/
function liveToolDetail(name, argsRaw) {
	let args;
	try {
		args = JSON.parse(argsRaw);
	} catch {
		return normalizeDetail(name);
	}
	if (args === null || typeof args !== "object") return normalizeDetail(name);
	const record = args;
	for (const key of LIVE_TOOL_DETAIL_KEYS) {
		if (!(key in record)) continue;
		const value = record[key];
		const detail = key === "questions" ? questionDetail(value) : normalizeDetail(value);
		if (detail !== "") return detail;
	}
	return normalizeDetail(name);
}
/**
* Extract the concatenated plain text of a content-block list (the durable
* `ContentBlock[]` shape, structurally: blocks with `type: 'text'` carry
* `text`; anything else — a tool call, an image, … — contributes nothing).
* @param content - the raw `content` field of a message event.
* @returns the joined text, or undefined when the message carries no text.
*/
function contentText(content) {
	if (!Array.isArray(content)) return void 0;
	const parts = [];
	for (const block of content) {
		if (block === null || typeof block !== "object") continue;
		const candidate = block;
		if (candidate.type === "text" && typeof candidate.text === "string") parts.push(candidate.text);
	}
	return parts.length > 0 ? parts.join("\n") : void 0;
}
/** A tool-call content block under BOTH durable vocabularies (0.1.7 `tool-call`; older logs `tool_use`). */
function announcedCalls(content) {
	if (!Array.isArray(content)) return [];
	const found = [];
	for (const block of content) {
		if (block === null || typeof block !== "object") continue;
		const candidate = block;
		if (candidate.type !== "tool-call" && candidate.type !== "tool_use") continue;
		const rawId = candidate.id ?? candidate.callId;
		if (typeof rawId !== "string" || typeof candidate.name !== "string") continue;
		found.push({
			callId: rawId,
			name: candidate.name,
			args: typeof candidate.arguments === "string" ? candidate.arguments : ""
		});
	}
	return found;
}
/** The callId of one `tool/result` event under both logged shapes. */
function resultCallId(data) {
	const message = data.message;
	for (const candidate of [
		data.callId,
		message?.source?.callId,
		message?.toolCallId,
		data.toolCallId
	]) if (typeof candidate === "string" && candidate !== "") return candidate;
}
/** Rank one range's calls into the host's summary shape. */
function summarize(calls, live) {
	const counts = /* @__PURE__ */ new Map();
	let running;
	let preparing;
	let runningDetail = "";
	let runningSeq = -Infinity;
	const ordered = calls.slice().sort((left, right) => left.seq - right.seq);
	for (const call of ordered) {
		const kind = activityOf(call.name);
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
		if (call.settled || !live) continue;
		if (call.seq < runningSeq) continue;
		runningSeq = call.seq;
		running = kind;
		preparing = call.preparing ? true : void 0;
		runningDetail = call.preparing ? kind === "tools" ? call.name : "" : liveToolDetail(call.name, call.args);
	}
	const ranked = [...counts].map(([kind, count]) => ({
		kind,
		count
	}));
	ranked.sort((left, right) => right.count - left.count);
	return {
		counts: ranked,
		...running === void 0 ? {} : { running },
		runningDetail,
		...preparing === true ? { preparing: true } : {}
	};
}
/** Cap one detail line without cutting a surrogate pair in half. */
function truncateText(text) {
	const chars = graphemes(text);
	if (chars.length <= 400) return text;
	return `${chars.slice(0, 399).join("").trimEnd()}…`;
}
/** Start an empty range. */
function openRange() {
	return {
		calls: [],
		ids: /* @__PURE__ */ new Set()
	};
}
/** Append one call to a range (deduped by callId). */
function addCall(range, call) {
	if (range.ids.has(call.callId)) return;
	range.calls.push(call);
	range.ids.add(call.callId);
}
/**
* Fold a session event log into the host's merged activity view: the newest
* range's summary and the newest text line. Scans BACKWARD from the end and
* stops at the range it reports, so a long history costs only its recent tail.
*
* @param events - the session's append-only event log (oldest → newest).
* @param options - `live` (whether the session is executing; a settled one
*   reports no running tool, like the host's closed groups) and `maxEvents`.
* @returns the current summary plus the optional detail fields.
*/
function foldProcess(events, options) {
	const live = options.live;
	const maxEvents = Math.max(1, options.maxEvents ?? 400);
	let range = openRange();
	/** The newest NON-EMPTY range (the fallback when the newest one is empty). */
	let answer;
	/** Whether {@link answer} is the newest range (only then can it be running). */
	let answerLive = false;
	const settled = /* @__PURE__ */ new Set();
	let latestText;
	let lastEventTime;
	let crossed = 0;
	for (let index = events.length - 1, scanned = 0; index >= 0; index -= 1) {
		if (scanned >= maxEvents) break;
		const event = events[index];
		if (event === void 0) continue;
		scanned += 1;
		lastEventTime ??= event.time;
		const { type, data } = event;
		if (type === "tool/result") {
			const callId = resultCallId(data);
			if (callId !== void 0) settled.add(callId);
			continue;
		}
		if (type === "tool/call") {
			const callId = typeof data.callId === "string" && data.callId !== "" ? data.callId : `anon-${event.seq}`;
			addCall(range, {
				callId,
				name: typeof data.name === "string" ? data.name : "tool",
				args: typeof data.arguments === "string" ? data.arguments : "",
				seq: event.seq,
				settled: settled.has(callId),
				preparing: false
			});
			continue;
		}
		if (type !== "assistant/message" && type !== "user/message") continue;
		const message = type === "assistant/message" ? data.message : void 0;
		if (message !== void 0) for (const announced of announcedCalls(message.content)) {
			const isSettled = settled.has(announced.callId);
			addCall(range, {
				callId: announced.callId,
				name: announced.name,
				args: announced.args,
				seq: event.seq,
				settled: isSettled,
				preparing: !isSettled
			});
		}
		const text = message === void 0 ? void 0 : contentText(message.content);
		if (text !== void 0) latestText ??= text;
		if (type !== "user/message" && text === void 0) continue;
		if (range.calls.length > 0) {
			answer = range.calls;
			answerLive = crossed === 0;
			break;
		}
		crossed += 1;
		if (crossed > 1) break;
		range = openRange();
	}
	return {
		current: summarize(answer ?? range.calls, live && (answer === void 0 ? crossed === 0 : answerLive)),
		...latestText === void 0 ? {} : { text: truncateText(latestText) },
		...lastEventTime === void 0 ? {} : { lastEventTime }
	};
}
//#endregion
//#region src/subagent-live-route.ts
/**
* Build the live-preview routes bound to the plugin context.
* @param ctx - host plugin context.
*/
function buildSubagentLiveApi(ctx) {
	return { async live(payload) {
		const rootSessionId = requireString(payload, "rootSessionId");
		const subagents = ctx.get("subagents");
		if (subagents === void 0 || typeof subagents.listDescendants !== "function") throw new SidebarError("subagents-unavailable", "the subagent service is not mounted in this deployment", 503);
		let descendants;
		try {
			descendants = await subagents.listDescendants(rootSessionId);
		} catch (error) {
			throw new SidebarError("subagents-unavailable", `subagent catalog read failed: ${error instanceof Error ? error.message : String(error)}`, 503);
		}
		const live = {};
		/**
		* Fold one session into the map. `running` is the caller-visible activity
		* flag: the catalog's for a child, undefined for the topology ROOT (the
		* host cannot classify it, and the page already knows the answer from the
		* session list). The fold's own `live` gate is that flag when it exists,
		* and the LOG's evidence for the root.
		*/
		const foldInto = (sessionId, running) => {
			const view = running === void 0 ? {} : { running };
			try {
				const fold = foldProcess(ctx.sessions.get(sessionId)?.snapshotEvents() ?? [], { live: running !== false });
				if (fold.current.counts.length > 0 || fold.current.running !== void 0) view.summary = fold.current;
				if (fold.text !== void 0) view.text = fold.text;
				if (fold.lastEventTime !== void 0) view.lastEventTime = fold.lastEventTime;
			} catch {}
			live[sessionId] = view;
		};
		foldInto(rootSessionId, void 0);
		for (const entry of descendants) {
			if (entry.kind !== "child") continue;
			if (entry.label?.startsWith("Side: ") ?? false) continue;
			foldInto(entry.id, entry.activity === "running");
		}
		return { live };
	} };
}
//#endregion
//#region src/team-routes.ts
/** The CAS actions the wire accepts (mirrors the domain union). */
const TASK_ACTIONS = /* @__PURE__ */ new Set([
	"claim",
	"release",
	"edit",
	"set_dependencies",
	"complete",
	"reopen",
	"reassign",
	"delete"
]);
/** The service's stale-revision code (0.1.6 returned it as a result union). */
const STALE_REVISION_CODE = "TEAM_TASK_STALE_REVISION";
/** Narrow an unknown payload value to a string array (else undefined). */
function stringArrayOf(value) {
	if (!Array.isArray(value)) return void 0;
	const out = value.filter((item) => typeof item === "string");
	return out.length === value.length ? out : void 0;
}
/**
* The thrown value's `HarnessError` code, when it carries one. Read
* structurally: the plugin does not import `@deepseek-ai/dsh-llm` for a
* string, and a non-TeamError rejection simply has no code to route on.
*/
function errorCodeOf(error) {
	if (typeof error !== "object" || error === null) return void 0;
	const code = error.code;
	return typeof code === "string" ? code : void 0;
}
/**
* Build the Agent Teams write routes bound to the plugin context.
* @param ctx - host plugin context.
*/
function buildTeamsApi(ctx) {
	const teams = ctx.get("agentTeams");
	const agents = ctx.get("agents");
	/**
	* The live lead agent of the requested tree plus its membership check.
	* Throws 503 when the experimental layer is absent and 404 when the root
	* simply leads no team (a normal page state, but never for a mutation).
	*/
	const membershipOf = async (payload) => {
		if (teams === void 0) throw new SidebarError("team-error", "the agent-teams layer is not mounted in this deployment", 503);
		const rootSessionId = requireString(payload, "rootSessionId");
		const agent = agents?.get(rootSessionId);
		if (agent === void 0) throw new SidebarError("team-error", "the tree root is not live in this process", 404);
		try {
			if (teams.tryMembership(agent) === void 0) throw new SidebarError("team-error", "the tree root leads no team", 404);
		} catch (error) {
			if (error instanceof SidebarError) throw error;
			throw new SidebarError("team-error", error instanceof Error ? error.message : String(error), 404);
		}
		return {
			svc: teams,
			agent
		};
	};
	/**
	* Translate one service rejection: a stale revision keeps its own wire code
	* so the client's task window can say "someone else changed this task"
	* instead of showing a generic failure.
	*/
	const serviceError = (error) => {
		const message = error instanceof Error ? error.message : String(error);
		return errorCodeOf(error) === STALE_REVISION_CODE ? new SidebarError("team-conflict", message, 409) : new SidebarError("team-error", message, 400);
	};
	return {
		async taskCreate(payload) {
			const membership = await membershipOf(payload);
			const record = payload;
			const blockedBy = stringArrayOf(record.blockedBy);
			const writeScopes = stringArrayOf(record.writeScopes);
			const req = {
				subject: requireString(payload, "subject"),
				description: typeof record.description === "string" ? record.description : "",
				...blockedBy !== void 0 ? { blockedBy } : {},
				...writeScopes !== void 0 ? { writeScopes } : {}
			};
			try {
				return {
					ok: true,
					value: await membership.svc.createTask(membership.agent, req)
				};
			} catch (error) {
				throw serviceError(error);
			}
		},
		async taskUpdate(payload) {
			const membership = await membershipOf(payload);
			const record = payload;
			const expectedRevision = record.expectedRevision;
			if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new SidebarError("bad-request", "missing or invalid \"expectedRevision\"");
			const action = record.action;
			if (typeof action !== "string" || !TASK_ACTIONS.has(action)) throw new SidebarError("bad-request", "missing or invalid \"action\"");
			const blockedBy = stringArrayOf(record.blockedBy);
			const writeScopes = stringArrayOf(record.writeScopes);
			const req = {
				taskId: requireString(payload, "taskId"),
				expectedRevision,
				action,
				...typeof record.subject === "string" ? { subject: record.subject } : {},
				...typeof record.description === "string" ? { description: record.description } : {},
				...blockedBy !== void 0 ? { blockedBy } : {},
				...writeScopes !== void 0 ? { writeScopes } : {},
				...typeof record.owner === "string" ? { owner: record.owner } : {}
			};
			try {
				return {
					ok: true,
					value: await membership.svc.updateTask(membership.agent, req)
				};
			} catch (error) {
				throw serviceError(error);
			}
		}
	};
}
//#endregion
//#region src/workflow-runs.ts
/** The four recorded event types (prefix match keeps the scan cheap). */
const EVENT_PREFIX = "tool-workflow/";
/**
* Fold one session's event log into its workflow runs, oldest first. Rows
* referencing an unknown run (a log window that starts mid-run, or a corrupt
* tail) are skipped — the official panel asserts a leading run-start instead,
* but the route merges two sources where ordering is guaranteed anyway.
* @param events - the session's append-only event log (oldest → newest).
* @param originSessionId - the session the log belongs to.
* @returns the session's runs in run-start order.
*/
function foldWorkflowRuns(events, originSessionId) {
	const runs = [];
	const byRunId = /* @__PURE__ */ new Map();
	for (const event of events) {
		if (!event.type.startsWith(EVENT_PREFIX)) continue;
		const data = event.data;
		switch (event.type) {
			case "tool-workflow/run-start": {
				const runId = typeof data.runId === "string" ? data.runId : void 0;
				if (runId === void 0 || byRunId.has(runId)) break;
				const fold = {
					view: {
						runId,
						name: typeof data.name === "string" && data.name !== "" ? data.name : runId,
						originSessionId,
						status: "running",
						phases: [],
						startedSeq: event.seq,
						startedAt: event.time
					},
					memberBySeq: /* @__PURE__ */ new Map()
				};
				byRunId.set(runId, fold);
				runs.push(fold);
				break;
			}
			case "tool-workflow/agent-start": {
				const fold = runOf(data, byRunId);
				const seq = seqOf(data);
				if (fold === void 0 || seq === void 0 || fold.memberBySeq.has(seq)) break;
				const member = {
					seq,
					label: typeof data.label === "string" && data.label !== "" ? data.label : `#${seq}`,
					...typeof data.phase === "string" ? { phase: data.phase } : {},
					childId: typeof data.childId === "string" ? data.childId : ""
				};
				fold.memberBySeq.set(seq, member);
				let phase = fold.view.phases.find((candidate) => candidate.title === member.phase);
				if (phase === void 0) {
					phase = member.phase === void 0 ? { members: [] } : {
						title: member.phase,
						members: []
					};
					fold.view.phases.push(phase);
				}
				phase.members.push(member);
				break;
			}
			case "tool-workflow/agent-end": {
				const fold = runOf(data, byRunId);
				const seq = seqOf(data);
				const member = fold?.memberBySeq.get(seq ?? -1);
				if (member === void 0) break;
				const outcome = data.outcome;
				if (outcome === "completed" || outcome === "failed" || outcome === "cancelled") member.outcome = outcome;
				break;
			}
			case "tool-workflow/run-end": {
				const fold = runOf(data, byRunId);
				if (fold === void 0) break;
				const stopReason = data.stopReason;
				if (stopReason === "completed" || stopReason === "cancelled" || stopReason === "error") {
					fold.view.stopReason = stopReason;
					fold.view.status = stopReason === "error" ? "failed" : stopReason;
				} else fold.view.status = "failed";
				fold.view.finishedAt = event.time;
				break;
			}
		}
	}
	return runs.map((fold) => fold.view);
}
/** The run a workflow event belongs to (undefined = unknown/orphan row). */
function runOf(data, byRunId) {
	const runId = data.runId;
	return typeof runId === "string" ? byRunId.get(runId) : void 0;
}
/** The member sequence number of one agent-start/agent-end row. */
function seqOf(data) {
	const seq = data.seq;
	return typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0 ? seq : void 0;
}
//#endregion
//#region src/workflow-routes.ts
/** Per-session cap of mirrored live workflow events (a bounded, lossy ring). */
const MIRROR_MAX_ENTRIES = 500;
/**
* The live workflow-event mirror: subscribes to the session append feed and
* caches `tool-workflow/*` rows the session store's own log can lag behind
* (the same rehydration-boundary gap the job-output mirror exists for).
*/
function createWorkflowEventMirror(ctx) {
	const perSession = /* @__PURE__ */ new Map();
	if (typeof ctx.on !== "function") return { entries: () => [] };
	const dispose = ctx.on("session/event", (session, event) => {
		const sessionId = session?.id;
		if (typeof sessionId !== "string" || !event.type.startsWith("tool-workflow/")) return;
		let list = perSession.get(sessionId);
		if (list === void 0) perSession.set(sessionId, list = []);
		const minimal = {
			type: event.type,
			seq: event.seq,
			time: event.time,
			data: event.data
		};
		list.push(minimal);
		if (list.length > MIRROR_MAX_ENTRIES) list.splice(0, list.length - MIRROR_MAX_ENTRIES);
	});
	ctx.effect(() => dispose, "dsh-better-sidebar: workflow event mirror");
	return { entries: (sessionId) => perSession.get(sessionId) ?? [] };
}
/**
* Build the workflow-runs route bound to the plugin context. The tree walk
* reuses the host subagent runtime (`ctx.get('subagents')`); without it the
* route still folds the root session alone (a degraded but honest tree of
* one), matching the Subagent page's own fallback lineage.
* @param ctx - host plugin context.
*/
function buildWorkflowsApi(ctx) {
	const mirror = createWorkflowEventMirror(ctx);
	/** The tree's session ids: the root plus every descendant the catalog knows. */
	const treeSessionIds = async (rootSessionId) => {
		const subagents = ctx.get("subagents");
		if (subagents === void 0 || typeof subagents.listDescendants !== "function") return [rootSessionId];
		try {
			return [rootSessionId, ...(await subagents.listDescendants(rootSessionId)).map((entry) => entry.id)];
		} catch {
			return [rootSessionId];
		}
	};
	return { async list(payload) {
		const rootSessionId = requireString(payload, "rootSessionId");
		const runs = [];
		for (const sessionId of await treeSessionIds(rootSessionId)) try {
			const bySeq = /* @__PURE__ */ new Map();
			for (const event of ctx.sessions.get(sessionId)?.snapshotEvents() ?? []) if (event.type.startsWith("tool-workflow/")) bySeq.set(event.seq, event);
			for (const event of mirror.entries(sessionId)) bySeq.set(event.seq, event);
			if (bySeq.size === 0) continue;
			const ordered = [...bySeq.values()].sort((left, right) => left.seq - right.seq);
			runs.push(...foldWorkflowRuns(ordered, sessionId));
		} catch {}
		runs.sort((left, right) => left.startedSeq - right.startedSeq);
		return { runs };
	} };
}
//#endregion
//#region src/session-store.ts
/**
* Read one persisted session's header and full event log.
* @param persistence - the live `sessionPersistence` service.
* @param sessionId - the stored session to read.
* @returns the header and log; rejects when the session does not exist.
*/
async function readPersistedSession(persistence, sessionId) {
	const handle = await persistence.open(sessionId, "read");
	try {
		const { events } = await handle.read();
		return {
			header: handle.header,
			events,
			inheritedEventCount: handle.inheritedEventCount ?? 0
		};
	} finally {
		await handle.close();
	}
}
//#endregion
//#region src/sidechat-routes.ts
/**
* Side Chat routes of the /sidebar JSON API ('sidechat.start' /
* 'sidechat.prompt' / 'sidechat.cancel' / 'sidechat.dispose' /
* 'sidechat.info' / 'sidechat.events').
*
* A side thread is a child session the plugin creates ITSELF with a custom
* seed — the parent's full event log up to the click moment, honestly closed
* at an in-progress turn (see sidechat-core.ts). The child is marked
* `origin: 'subagent'` so the main session list hides it, and EVERY
* operation goes through these routes because the generic session RPCs are
* fenced away from subagent-origin identities (the api-remotes
* agent-lookup ownership fence). No DSH source is touched:
*
* - creation uses the public AgentRegistry.create seam (the same one
*   api-proxy's session.fork and the subagent fork provider use), with the
*   parent's preset composition and provider/model selection so the child's
*   first request shares the parent's token prefix (provider-side prefix
*   cache reuse);
* - the first prompt (boundary + question) and every follow-up are admitted
*   with the stock `agent.followup`;
* - a cold thread (DSH restart, or a closed thread) is resumed with
*   AgentRegistry.resume, composing the preset the child recorded.
*/
/** Timeout guarding the create call (the registry detaches it before the
*  handle becomes visible, so the child is never cancelled by it). */
const CREATE_TIMEOUT_MS = 15e3;
/** Head cap of one `sidechat.events` response (the ceiling the old
*  client-side walk could load: 40 pages × 200 events). A pathological
*  thread beyond it renders its tail window — the same degradation the
*  capped walk had, never a failed poll. */
const EVENTS_CAP = 8e3;
/** Per-activation disposers of created thread agents (the dispose route
*  releases them; the session and its history always stay persisted). */
const threadDisposers = /* @__PURE__ */ new Map();
/** The in-progress-turn snapshot captured at creation of an EMPTY thread,
*  waiting to ride the first prompt (lost on a host restart — the boundary
*  prompt is then delivered alone, a logged degradation). */
const pendingSnapshots = /* @__PURE__ */ new Map();
/** Resolve the parent's preset and build the child's composition setup
*  (mirror of api-proxy's composeAgent minus the model-selection install —
*  the child carries the parent's provider/model in agentOptions). */
async function composeChildSetup(ctx, presetId) {
	const presets = ctx.get("agentPresets");
	if (presets === void 0) return { setup: () => Promise.resolve() };
	const resolved = await presets.resolve(presetId);
	return {
		agentPreset: resolved.id,
		setup: async (agentCtx) => {
			await presets.mount(agentCtx, resolved.id);
		}
	};
}
/** Build the cold-resume setup from the thread's PERSISTED record (the
*  recorded preset wins, newest selection event first). */
async function composePersistedSetup(ctx, childId) {
	const persistence = ctx.get("sessionPersistence");
	if (persistence === void 0) return () => Promise.resolve();
	const inspected = await readPersistedSession(persistence, childId);
	const presetId = resolvePresetId(inspected.header, inspected.events);
	const presets = ctx.get("agentPresets");
	if (presets === void 0 || presetId === void 0) return () => Promise.resolve();
	const resolved = await presets.resolve(presetId);
	return async (agentCtx) => {
		await presets.mount(agentCtx, resolved.id);
	};
}
/** One text-block prompt (the thread boundary + question, or a follow-up). */
function textPrompt(text) {
	return [{
		type: "text",
		text
	}];
}
/** Admit one user message to a live agent through the stock followup path. */
function admitFollowup(agent, blocks) {
	const message = createUserMessage({
		content: blocks,
		source: { kind: "user" }
	});
	agent.followup(message);
}
/**
* Deliver the thread's FIRST contact as TWO log-separated messages: the
* boundary prompt (+ the parked in-progress snapshot) rides `agent.inject`
* — queued model-facing context that does NOT wake the driver and is
* claimed FIRST at the opening step (Inbox.claim drains next-step before
* next-turn) — and the user's question is the follow-up that wakes it. The
* log therefore records two user/message events (injection, then question)
* instead of one wrapped blob: the transcript shows the question as a user
* bubble and collapses the injection as a context row. The injection source
* carries the plugin's producer-owned kind (`plugin:dsh-better-sidebar` —
* session format v4 refuses the retired bare `kind: 'plugin'`) so recognition
* is structural; its text still opens with SIDE_BOUNDARY_PREFIX, keeping
* boundaryDelivered intact.
*/
function admitFirstContact(agent, injectionText, question) {
	agent.inject(createUserMessage({
		content: textPrompt(injectionText),
		source: { kind: SIDE_INJECTION_SOURCE_KIND }
	}));
	admitFollowup(agent, textPrompt(question));
}
/** The live thread agent, or undefined (cold — the caller resumes). */
function liveThreadAgent(ctx, childId) {
	return ctx.get("agents")?.get(childId);
}
/**
* The thread's event log (seed + its own events, already expanded): the live
* agent's in-memory log while the thread is attached — the freshest read,
* including events not yet flushed — else the persisted logical log. Both
* DSH generations expose these seams with the same shape (the 0.1.2
* persistence layer packs chunk rows on disk but expands them on inspect;
* the live log is `Session.snapshotEvents()`, the 0.1.2-alpha.4 rename of
* the `Session.events` property), which is why the transcript reads here
* instead of the client's session-history RPC: that face
* (`ctx.connection.api`) was removed in 0.1.2-alpha.1's Remote-gateway
* migration.
*/
async function threadLogEvents(ctx, childId) {
	const agent = liveThreadAgent(ctx, childId);
	if (agent !== void 0) return agent.session.snapshotEvents();
	const persistence = ctx.get("sessionPersistence");
	if (persistence === void 0) throw new SidebarError("sidechat-error", "the session persistence service is unavailable", 503);
	try {
		return (await readPersistedSession(persistence, childId)).events;
	} catch (error) {
		throw new SidebarError("not-found", `thread "${childId}" is not available: ${error instanceof Error ? error.message : String(error)}`, 404);
	}
}
/** Build the Side Chat routes (all optional services degrade to a wire
*  error the tab surfaces inline). The record keys are the FULL wire method
*  names the /sidebar/api dispatcher looks up (`api[method]`).
*  @param ctx - host plugin context.
*  @param live - the live assistant stream buffer; absent only in tests that
*    never exercise streaming (then every `live` response is empty). */
function buildSidechatApi(ctx, live) {
	return {
		"sidechat.start": async (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const rawQuestion = payload.question;
			const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
			const parent = liveThreadAgent(ctx, sessionId);
			if (parent === void 0) throw new SidebarError("sidechat-error", `parent session "${sessionId}" is not running`, 409);
			const parentSession = parent.session;
			const inheritance = buildSidechatInheritance(parentSession.snapshotEvents(), live?.chunksFor(sessionId) ?? []);
			const { agentPreset, setup } = await composeChildSetup(ctx, resolvePresetId(parentSession.header, parentSession.snapshotEvents()));
			const childId = `session-${randomUUID()}`;
			const label = question === "" ? SIDE_NEW_THREAD_TITLE : sideLabel(question);
			const descriptor = snapshotSubagentDescriptor({
				mode: "continuable",
				provider: "sidechat",
				label,
				...parent.options.provider === void 0 ? {} : { agentProvider: parent.options.provider },
				...parent.options.model === void 0 ? {} : { agentModel: parent.options.model }
			});
			const descriptorEvent = {
				type: "subagent/descriptor",
				seq: inheritance.seed.length,
				time: Date.now(),
				data: descriptor
			};
			const seed = [...inheritance.seed, descriptorEvent];
			const options = {
				sessionId: childId,
				meta: {
					...parentSession.header.cwd === void 0 ? {} : { cwd: parentSession.header.cwd },
					parentSession: parentSession.id,
					isSeeded: true,
					origin: "subagent",
					delegationDepth: (parentSession.header.delegationDepth ?? 0) + 1,
					...agentPreset === void 0 ? {} : { agentPreset }
				},
				seed,
				inheritedEventCount: SessionLogOffset(seed.length),
				agentOptions: { ...parent.options },
				setup,
				signal: AbortSignal.timeout(CREATE_TIMEOUT_MS)
			};
			const agents = ctx.get("agents");
			if (agents?.create === void 0) throw new SidebarError("sidechat-error", "the agents service is unavailable", 503);
			let handle;
			try {
				handle = await agents.create(options);
			} catch (error) {
				throw new SidebarError("sidechat-error", `thread creation failed: ${error instanceof Error ? error.message : String(error)}`, 500);
			}
			threadDisposers.set(childId, () => handle.dispose());
			const titles = ctx.get("sessionTitle");
			const pinTitle = (label) => {
				if (titles === void 0) return;
				try {
					titles.rename(handle.agent.session, label);
				} catch {}
			};
			if (question === "") {
				if (inheritance.snapshot !== null) pendingSnapshots.set(childId, inheritance.snapshot);
				pinTitle(SIDE_NEW_THREAD_TITLE);
			} else {
				const promptParts = [SIDE_BOUNDARY_PROMPT];
				if (inheritance.snapshot !== null) promptParts.push(inheritance.snapshot);
				admitFirstContact(handle.agent, promptParts.join("\n\n"), question);
				pinTitle(sideLabel(question));
			}
			return { childId };
		},
		"sidechat.prompt": async (payload) => {
			const childId = requireString(payload, "childId");
			const text = requireString(payload, "text").trim();
			if (text === "") throw new SidebarError("bad-request", "text is required");
			let agent = liveThreadAgent(ctx, childId);
			if (agent === void 0) {
				const agents = ctx.get("agents");
				if (agents?.resume === void 0) throw new SidebarError("sidechat-error", "the agents service is unavailable", 503);
				const setup = await composePersistedSetup(ctx, childId);
				try {
					const handle = await agents.resume({
						resumeSessionId: childId,
						setup
					});
					threadDisposers.set(childId, () => handle.dispose());
					agent = handle.agent;
				} catch (error) {
					throw new SidebarError("sidechat-error", `thread resume failed: ${error instanceof Error ? error.message : String(error)}`, 500);
				}
			}
			if (boundaryDelivered(agent.session.snapshotEvents())) admitFollowup(agent, textPrompt(text));
			else {
				const parts = [SIDE_BOUNDARY_PROMPT];
				const snapshot = pendingSnapshots.get(childId);
				pendingSnapshots.delete(childId);
				if (snapshot !== void 0) parts.push(snapshot);
				admitFirstContact(agent, parts.join("\n\n"), text);
				const titles = ctx.get("sessionTitle");
				if (titles !== void 0) try {
					titles.rename(agent.session, sideLabel(text));
				} catch {}
			}
			return { accepted: true };
		},
		"sidechat.cancel": async (payload) => {
			const agent = liveThreadAgent(ctx, requireString(payload, "childId"));
			if (agent !== void 0) agent.cancel({ kind: "user" }, { keepInbox: true });
			return { accepted: true };
		},
		"sidechat.dispose": async (payload) => {
			const childId = requireString(payload, "childId");
			pendingSnapshots.delete(childId);
			const dispose = threadDisposers.get(childId);
			if (dispose !== void 0) {
				threadDisposers.delete(childId);
				try {
					await dispose();
				} catch {}
			}
			return { accepted: true };
		},
		"sidechat.info": async (payload) => {
			const childId = requireString(payload, "childId");
			const agent = liveThreadAgent(ctx, childId);
			if (agent !== void 0) {
				const preset = agent.session.header.agentPreset;
				return {
					live: true,
					status: agent.status,
					...agent.options.provider === void 0 ? {} : { provider: agent.options.provider },
					...agent.options.model === void 0 ? {} : { model: agent.options.model },
					...preset === void 0 ? {} : { preset }
				};
			}
			const persistence = ctx.get("sessionPersistence");
			if (persistence !== void 0) try {
				const inspected = await readPersistedSession(persistence, childId);
				const preset = resolvePresetId(inspected.header, inspected.events);
				return {
					live: false,
					...preset === void 0 ? {} : { preset }
				};
			} catch {}
			return { live: false };
		},
		"sidechat.events": async (payload) => {
			const childId = requireString(payload, "childId");
			const rawAfter = payload.afterSeq;
			if (rawAfter !== void 0 && (typeof rawAfter !== "number" || !Number.isSafeInteger(rawAfter) || rawAfter < 0)) throw new SidebarError("bad-request", "afterSeq must be a non-negative integer");
			const own = threadOwnLogEvents(await threadLogEvents(ctx, childId));
			const fresh = rawAfter === void 0 ? own : own.filter((event) => event.seq > rawAfter);
			const tailSeq = own.at(-1)?.seq ?? -1;
			return {
				events: fresh.length > EVENTS_CAP ? fresh.slice(fresh.length - EVENTS_CAP) : fresh,
				live: liveEventsOf(live?.chunksFor(childId) ?? [], tailSeq)
			};
		}
	};
}
//#endregion
//#region src/assistant-live.ts
/** Per-attempt buffer ceiling; beyond it the oldest deltas are dropped. */
const LIVE_CHUNK_CAP = 4e3;
/** A frame's `chunk` payload must be a JSON record to be worth buffering. */
function chunkOf(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** A finite non-negative integer, or undefined. */
function countOf(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
/**
* Fold `agent/assistant-stream` frames into per-session live buffers.
*
* Frames arrive for every attached agent, so the buffer is keyed by the
* emitting session and ignores anything it cannot identify. An out-of-order
* or mismatched chunk drops the attempt rather than splicing a gap: a
* transcript with a hole is worse than one that settles at the next durable
* event.
* @param ctx - host plugin context (its `on` subscribes the session feed).
* @param cap - per-attempt chunk ceiling.
* @returns the read face and a disposer unbinding the listener.
*/
function createAssistantLiveBuffer(ctx, cap = LIVE_CHUNK_CAP) {
	const attempts = /* @__PURE__ */ new Map();
	const off = ctx.on("agent/assistant-stream", (payload) => {
		const record = payload;
		const frame = record?.frame;
		if (frame === void 0) return;
		const session = (record?.agent)?.session;
		const sessionId = typeof session?.id === "string" ? session.id : void 0;
		if (sessionId === void 0) return;
		const type = frame["type"];
		if (type === "end") {
			attempts.delete(sessionId);
			return;
		}
		const attemptId = typeof frame["attemptId"] === "string" ? frame.attemptId : void 0;
		if (attemptId === void 0) return;
		if (type === "start") {
			const turn = countOf(frame["turn"]);
			const step = countOf(frame["step"]);
			if (turn === void 0 || step === void 0) return;
			const known = attempts.has(sessionId);
			attempts.delete(sessionId);
			if (!known && attempts.size >= 64) {
				const oldest = attempts.keys().next().value;
				if (oldest !== void 0) attempts.delete(oldest);
			}
			attempts.set(sessionId, {
				attemptId,
				turn,
				step,
				chunks: [],
				nextIndex: 0
			});
			return;
		}
		if (type !== "chunk") return;
		const attempt = attempts.get(sessionId);
		if (attempt === void 0 || attempt.attemptId !== attemptId) return;
		const index = countOf(frame["index"]);
		const chunk = chunkOf(frame["chunk"]);
		if (index === void 0 || chunk === void 0 || index !== attempt.nextIndex) {
			attempts.delete(sessionId);
			return;
		}
		attempt.nextIndex = index + 1;
		const time = countOf(frame["time"]) ?? 0;
		attempt.chunks.push({
			attemptId,
			turn: attempt.turn,
			step: attempt.step,
			index,
			time,
			chunk
		});
		if (attempt.chunks.length > cap) attempt.chunks.splice(0, attempt.chunks.length - cap);
	});
	return {
		chunksFor: (sessionId) => attempts.get(sessionId)?.chunks ?? [],
		dispose: () => {
			off();
		}
	};
}
//#endregion
//#region src/index.ts
/**
* dsh-better-sidebar host half: the /sidebar JSON API (explorer listing, file
* read/write, git), the /sidebar/file media route (images), the /sidebar/html
* preview route, the /sidebar/bundle lazy-chunk route (client code splits),
* and the two WebSocket upgrades (sidebar_open pushes). Every route passes the same
* browser-trust fence as the /api gateway — Host-header loopback or the
* web runtime's `trustedHosts` (LAN IP literals sampled at boot plus
* `--trusted-host` authorities), read per request from the live service
* value so the fence tracks the same trust source the /api gateway derives
* its list from.
*
* All operations are conversation-scoped: requests carry a sessionId and the
* session's authoritative cwd comes from the session store.
*/
/** Plugin identity for cordis.yml rows. */
const name = "dsh-better-sidebar";
/** Row bound of one `fs.trees` batch request (a mount/refresh sends what it shows). */
const FS_TREES_MAX_PATHS = 64;
/** Services required before mounting: the webserver routes, the session store, the web runtime's trusted hosts, and the tool registry. */
const inject = [
	"webServer",
	"sessions",
	"webRuntime",
	"tools"
];
/** Content types for the media route, by extension. */
const MEDIA_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	".avif": "image/avif",
	".pdf": "application/pdf",
	".html": "text/html",
	".htm": "text/html"
};
/** Content type served by /sidebar/file (binary-safe fallback for unknowns). */
function mediaTypeForPath(path) {
	return MEDIA_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}
/**
* Resolve a session's authoritative working directory. The attached session
* header wins; while the session is still hydrating from persistence (the
* web client attaches the current conversation a moment after page load, so
* the very first sidebar requests can arrive detached) the caller's own
* list-summary cwd is used; the session-persistence index is queried as a
* last resort for cold (not-yet-attached) sessions so a detached first
* request still resolves the correct project instead of the host process
* cwd (which on Windows is the DSH source root after `dsh.cmd`'s `pushd`,
* causing every user-project path to be misclassified as "outside
* workspace"). The host process cwd is the FINAL fallback for deployments
* without persistence (tests / stripped-down hosts); production always
* provides persistence, so the bug-fix path (header → client → persistence)
* always resolves the real session cwd before reaching it.
*/
async function sessionCwdOf(ctx, sessionId, clientCwd) {
	const headerCwd = ctx.sessions.get(sessionId)?.header.cwd;
	if (headerCwd !== void 0 && headerCwd !== "") return headerCwd;
	if (clientCwd !== void 0 && clientCwd !== "") try {
		return requireAbsolute(clientCwd);
	} catch {
		throw new SidebarError("bad-request", `invalid working directory "${clientCwd}"`);
	}
	const persistence = ctx.get("sessionPersistence");
	if (persistence !== void 0) {
		const metaCwd = (await readPersistedSession(persistence, sessionId)).header.cwd;
		if (metaCwd !== void 0 && metaCwd !== "") try {
			return requireAbsolute(metaCwd);
		} catch {
			throw new SidebarError("bad-request", `invalid working directory "${metaCwd}"`);
		}
	}
	return process.cwd();
}
/** Optional repository selected by the Git panel when cwd is a container. */
function selectedRepoOf(payload) {
	if (payload.repoRoot === void 0) return void 0;
	return requireAbsolute(requireString(payload, "repoRoot"));
}
/**
* Resolve a path that a git command reported — `git status`/`git diff`
* print paths RELATIVE TO THE REPO TOP LEVEL, which may sit above the
* session cwd (a session inside a subdirectory of a repository). Absolute
* paths pass through; relative ones join the repo root (falling back to the
* cwd when the root cannot be resolved, e.g. a bare directory).
*/
async function resolveGitPath(cwd, raw, selected) {
	if (isAbsolute(raw)) return requireAbsolute(resolveSessionPath(cwd, raw));
	const sessionPath = requireAbsolute(join(cwd, raw));
	if (await stat(sessionPath).then(() => true).catch(() => false)) return sessionPath;
	const root = await repoRoot(cwd, selected).catch(() => cwd);
	return requireAbsolute(join(root, raw));
}
/** How many leading bytes a binary read returns for client-side detect sniffing. */
const READ_HEAD_LIMIT = 4096;
/** Text read of a file with the size cap; binary detection via NUL probe.
*  Binary reads also return the first {@link READ_HEAD_LIMIT} bytes (base64)
*  so the client can re-match viewers by content (`detect`). */
async function readText(path, readLimit) {
	const info = await stat(path).catch((error) => {
		throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
	});
	if (info.isDirectory()) throw new SidebarError("fs-error", `"${path}" is a directory`, 400);
	const size = info.size;
	const truncated = size > readLimit;
	const handle = await open(path, "r").catch((error) => {
		throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
	});
	try {
		const buffer = Buffer.alloc(Math.min(size, readLimit));
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const slice = buffer.subarray(0, bytesRead);
		const binary = slice.includes(0);
		const head = binary ? slice.subarray(0, Math.min(slice.length, READ_HEAD_LIMIT)).toString("base64") : void 0;
		return {
			content: binary ? "" : slice.toString("utf8"),
			truncated,
			binary,
			size,
			head
		};
	} finally {
		await handle.close();
	}
}
function buildApi(ctx, resolved, getSettings, assistantLive, archiveTasks) {
	const cwdOf = async (payload) => {
		const sessionId = requireString(payload, "sessionId");
		const record = payload;
		return {
			sessionId,
			cwd: await sessionCwdOf(ctx, sessionId, typeof record?.cwd === "string" && record.cwd !== "" ? record.cwd : void 0)
		};
	};
	/** Resolve the optional Git-panel checkout selector against the authoritative
	* session repository. Unlike `cwd`, `worktree` is never trusted directly. */
	const gitCwdOf = async (payload) => {
		const base = await cwdOf(payload);
		const record = payload;
		const requested = typeof record?.worktree === "string" && record.worktree !== "" ? record.worktree : void 0;
		return {
			sessionId: base.sessionId,
			cwd: await resolveWorktree(base.cwd, requested)
		};
	};
	const subagentLiveApi = buildSubagentLiveApi(ctx);
	const workflowsApi = buildWorkflowsApi(ctx);
	const teamsApi = buildTeamsApi(ctx);
	return {
		"session.cwd": async (payload) => {
			const { sessionId, cwd } = await cwdOf(payload);
			return {
				sessionId,
				cwd,
				root: rootLabel(cwd),
				parent: parentOf(cwd) ?? null
			};
		},
		"fs.tree": async (payload) => {
			const { cwd } = await cwdOf(payload);
			return listDirectory(payload.path === void 0 ? cwd : await ensureWorkspacePath(cwd, requireString(payload, "path")), resolved.listLimit);
		},
		"fs.trees": async (payload) => {
			const { cwd } = await cwdOf(payload);
			const record = payload;
			const paths = Array.isArray(record?.paths) ? record.paths.filter((value) => typeof value === "string" && value !== "") : [];
			if (paths.length === 0) throw new SidebarError("bad-request", "paths must be a non-empty array");
			if (paths.length > 64) throw new SidebarError("bad-request", `too many paths (max 64)`);
			return { levels: await Promise.all(paths.map(async (raw) => {
				const requested = isAbsolute(raw) ? raw : `${cwd}${sep}${raw}`;
				try {
					return await listDirectory(await ensureWorkspacePath(cwd, requested), resolved.listLimit);
				} catch (error) {
					return {
						path: requested,
						entries: [],
						truncated: false,
						error: messageOf(error)
					};
				}
			})) };
		},
		"fs.search": async (payload) => {
			const { cwd } = await cwdOf(payload);
			return searchFiles(cwd, requireString(payload, "query"));
		},
		"fs.read": async (payload) => {
			const { cwd } = await cwdOf(payload);
			const selected = selectedRepoOf(payload);
			const { content, truncated, binary, size, head } = await readText(await ensureWorkspacePath(cwd, await resolveGitPath(cwd, requireString(payload, "path"), selected)), resolved.readLimit);
			if (binary) return {
				kind: "binary",
				size,
				truncated,
				head
			};
			return {
				kind: "text",
				content,
				truncated
			};
		},
		"fs.write": async (payload) => {
			const { cwd } = await cwdOf(payload);
			const path = await ensureWorkspaceWritePath(cwd, requireString(payload, "path"));
			const content = requireString(payload, "content");
			const tmp = `${path}.dsh-sidebar-tmp-${process.pid}`;
			try {
				await mkdir(dirname(path), { recursive: true });
				await writeFile(tmp, content, "utf8");
				await rename(tmp, path);
			} catch (error) {
				await rm(tmp, { force: true }).catch(() => {});
				throw new SidebarError("fs-error", `cannot write "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
			}
			invalidateDirectoryCache(dirname(path));
			return { ok: true };
		},
		"fs.rename": async (payload) => {
			const { cwd } = await cwdOf(payload);
			return renameWorkspaceEntry({
				cwd,
				path: requireString(payload, "path"),
				name: requireString(payload, "name")
			});
		},
		"fs.mkdir": async (payload) => {
			const { cwd } = await cwdOf(payload);
			return mkdirWorkspaceEntry({
				cwd,
				path: requireString(payload, "path"),
				name: requireString(payload, "name")
			});
		},
		"fs.remove": async (payload) => {
			const { cwd } = await cwdOf(payload);
			return removeWorkspaceEntry({
				cwd,
				path: requireString(payload, "path")
			});
		},
		"git.worktrees": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			const selected = selectedRepoOf(payload);
			return worktrees(selected !== void 0 ? await repoRoot(cwd, selected).catch(() => cwd) : cwd);
		},
		"git.status": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			return status(cwd, selectedRepoOf(payload));
		},
		"git.diff": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			const record = payload;
			const repoRoot = selectedRepoOf(payload);
			return { diff: await diff(cwd, record.path === void 0 ? void 0 : await resolveGitPath(cwd, requireString(payload, "path"), repoRoot), record.staged === true, repoRoot) };
		},
		"git.stage": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			await stage(cwd, payload.path === void 0 ? void 0 : requireString(payload, "path"), selectedRepoOf(payload));
			return { ok: true };
		},
		"git.unstage": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			await unstage(cwd, payload.path === void 0 ? void 0 : requireString(payload, "path"), selectedRepoOf(payload));
			return { ok: true };
		},
		"git.commit": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			await commit(cwd, requireString(payload, "message"), selectedRepoOf(payload));
			return { ok: true };
		},
		"git.branch": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			return branches(cwd, selectedRepoOf(payload));
		},
		"git.checkout": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			await checkout(cwd, requireString(payload, "branch"), selectedRepoOf(payload));
			return { ok: true };
		},
		"git.log": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			const record = payload;
			return log(cwd, typeof record.count === "number" && Number.isInteger(record.count) && record.count > 0 ? record.count : void 0, typeof record.skip === "number" && Number.isInteger(record.skip) && record.skip >= 0 ? record.skip : void 0, selectedRepoOf(payload));
		},
		"git.commit-diff": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			return { diff: await commitDiff(cwd, requireString(payload, "hash"), selectedRepoOf(payload)) };
		},
		"git.discard": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			const repoRoot = selectedRepoOf(payload);
			await discard(cwd, await resolveGitPath(cwd, requireString(payload, "path"), repoRoot), repoRoot);
			return { ok: true };
		},
		"git.revert": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			await revert(cwd, requireString(payload, "hash"), selectedRepoOf(payload));
			return { ok: true };
		},
		"git.cherry-pick": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			await cherryPick(cwd, requireString(payload, "hash"), selectedRepoOf(payload));
			return { ok: true };
		},
		"git.show": async (payload) => {
			const { cwd } = await gitCwdOf(payload);
			const repoRoot = selectedRepoOf(payload);
			const path = requireString(payload, "path");
			return { content: await show(cwd, requireString(payload, "rev"), path, repoRoot) };
		},
		"changes.ops": async (payload) => {
			const sessionId = requireString(payload, "sessionId");
			const rawAfter = payload?.afterSeq;
			if (rawAfter !== void 0 && (typeof rawAfter !== "number" || !Number.isSafeInteger(rawAfter) || rawAfter < 0)) throw new SidebarError("bad-request", "afterSeq must be a non-negative integer");
			const afterSeq = rawAfter ?? -1;
			let events = ctx.sessions.get(sessionId)?.snapshotEvents();
			if (events === void 0) {
				const persistence = ctx.get("sessionPersistence");
				if (persistence !== void 0) try {
					events = (await readPersistedSession(persistence, sessionId)).events;
				} catch {}
			}
			if (events === void 0) return {
				events: [],
				lastSeq: Math.max(afterSeq, 0)
			};
			const CHANGES_EVENTS_CAP = 4e3;
			const filtered = events.filter((event) => (event.type === "tool/call" || event.type === "tool/result") && event.seq > afterSeq);
			const window = filtered.length > CHANGES_EVENTS_CAP ? filtered.slice(filtered.length - CHANGES_EVENTS_CAP) : filtered;
			return {
				events: window,
				lastSeq: window.at(-1)?.seq ?? afterSeq
			};
		},
		"subagents.live": (payload) => subagentLiveApi.live(payload),
		"workflows.list": (payload) => workflowsApi.list(payload),
		"teams.taskCreate": (payload) => teamsApi.taskCreate(payload),
		"teams.taskUpdate": (payload) => teamsApi.taskUpdate(payload),
		"settings.get": () => {
			const settings = getSettings();
			return settings === void 0 ? {
				value: void 0,
				revision: void 0,
				externalDisable: false
			} : {
				...settings.get(),
				externalDisable: settings.externalDisable()
			};
		},
		"settings.update": async (payload) => {
			const settings = getSettings();
			if (settings === void 0) throw new SidebarError("settings-rejected", "the settings service is not mounted in this deployment", 503);
			const record = payload;
			const patch = record?.patch;
			if (patch === null || typeof patch !== "object" || Array.isArray(patch)) throw new SidebarError("bad-request", "patch must be a plain object");
			const expectedRevision = typeof record?.expectedRevision === "number" ? record.expectedRevision : void 0;
			try {
				return await settings.update(patch, expectedRevision);
			} catch (error) {
				if (error instanceof SettingsConflictError) throw new SidebarError("settings-conflict", error.message, 409);
				throw new SidebarError("settings-rejected", error instanceof Error ? error.message : String(error), 400);
			}
		},
		"open.external": (payload) => {
			const action = payload?.action;
			if (action === "reveal") return launchExternal("reveal", requireString(payload, "path"));
			if (action === "url") return launchExternal("url", requireString(payload, "url"));
			throw new SidebarError("bad-request", "action must be \"reveal\" or \"url\"");
		},
		"archive.build": async (payload) => {
			const { sessionId, cwd } = await cwdOf(payload);
			const record = payload;
			const paths = Array.isArray(record?.paths) ? record.paths.filter((value) => typeof value === "string" && value !== "") : [];
			if (paths.length === 0) throw new SidebarError("bad-request", "paths must be a non-empty array");
			const name = archiveNameOf(typeof record?.name === "string" ? record.name : null);
			const selected = [];
			for (const raw of paths) selected.push(await ensureWorkspacePath(cwd, raw));
			const entries = [];
			const names = disambiguateArchiveNames(selected);
			for (const [index, absolute] of selected.entries()) await collectZipEntries(absolute, names[index], entries);
			return archiveTasks.start({
				sessionId,
				name,
				entries
			});
		},
		"archive.status": (payload) => archiveTasks.status(requireString(payload, "id"), requireString(payload, "sessionId")),
		...buildSidechatApi(ctx, assistantLive)
	};
}
/** The npm package name of this plugin, exactly as its Loader row declares it. */
const SIDEBAR_PACKAGE_NAME = "dsh-better-sidebar";
/**
* Profile entry id of the sibling `dsh-web-ui` right panel this sidebar yields
* to when it is the active provider. Kept as a literal: it is that plugin's
* own mount choice, not a contract this plugin can derive.
*/
const AIONUI_PANEL_ENTRY = "aionui-panel";
/** The file-backed settings document DSH 0.1.7 retired. */
const LEGACY_SETTINGS_FILE = "settings.yaml";
/**
* The Loader entry id of this plugin's own row.
*
* DSH 0.1.7 addresses settings forms by profile entry id, and that id is a
* mount choice rather than a package property: this bundle's patch uses
* `better-sidebar`, while an aggregate bundle mounts the same package under
* its own id. The row is therefore identified by the package name plus fiber
* identity, with an enabled same-name row as the fallback for the moment
* before the fiber is attached.
* @param ctx - the plugin's own context.
* @returns the row's configured id, or undefined when no row can be identified.
*/
function ownEntryId(ctx) {
	let fallback;
	try {
		for (const entry of ctx.loader.entries()) {
			const id = entry.options.id;
			if (entry.options.name !== SIDEBAR_PACKAGE_NAME || typeof id !== "string" || id === "") continue;
			if (entry.fiber === ctx.fiber) return id;
			if (entry.disabled !== true && fallback === void 0) fallback = id;
		}
	} catch {
		return;
	}
	return fallback;
}
/**
* Read this plugin's preference section out of the retired `settings.yaml`.
*
* Both names are tried: the settings service renames the document before it
* imports any section, so on a host that already booted once only the
* `.imported` copy is left, while a host migrated for the first time may still
* be mid-import.
* @param home - the harness home the retired document lives under.
* @returns the section's own fields, or undefined when no usable section exists.
*/
async function readLegacyPrefs(home) {
	const declared = new Set(Object.keys(Config.dict ?? {}));
	for (const name of [`${LEGACY_SETTINGS_FILE}.imported`, LEGACY_SETTINGS_FILE]) {
		let text;
		try {
			text = await readFile(join(home, name), "utf8");
		} catch {
			continue;
		}
		let document;
		try {
			document = parse(text);
		} catch {
			continue;
		}
		if (document === null || typeof document !== "object" || Array.isArray(document)) continue;
		const section = document[SIDEBAR_PREFS_NS];
		if (section === null || typeof section !== "object" || Array.isArray(section)) continue;
		const filtered = Object.fromEntries(Object.entries(section).filter(([key]) => declared.has(key)));
		if (Object.keys(filtered).length > 0) return filtered;
	}
}
/**
* One-time import of the Side card preferences a pre-0.1.7 release persisted.
*
* The 0.1.6 line stored them through the file-backed settings provider, in
* `$DSH_HOME/settings.yaml` under a `dsh-better-sidebar` section. This release
* deletes that provider; its migration renames the document to
* `settings.yaml.imported` and re-imports each section into the entry of the
* SAME id — and because a section key is the package name while the row id is
* a mount choice, DSH warns and leaves this section behind. Without this
* import every existing user would silently lose their preferences.
*
* The import runs only while the row's user layer is still empty, so it can
* never overwrite a value set after the upgrade, and re-running it is a no-op.
* @param ctx - host plugin context (profile home, logger).
* @param settings - the settings forms service.
* @param ns - this plugin row's entry id.
* @returns which outcome the import reached.
*/
async function importLegacyPrefs(ctx, settings, ns) {
	const home = ctx.profileContext?.home;
	if (home === void 0) return "no-profile-home";
	const row = settings.describe().find((candidate) => candidate.ns === ns);
	if (row === void 0) return "no-form";
	const user = row.user;
	if (user !== null && typeof user === "object" && Object.keys(user).length > 0) return "already-configured";
	const section = await readLegacyPrefs(home);
	if (section === void 0) return "no-legacy-section";
	await settings.update(ns, section);
	return "imported";
}
/**
* Plugin body: mount the fenced routes and the sidebar_open push socket.
* @param ctx - host plugin context (webServer, sessions, webRuntime).
* @param config - deployment-provided limits; the Loader validates against
* {@link Config} and fills defaults, direct callers get them from
* {@link resolveSidebarConfig}.
*/
function apply(ctx, config) {
	const resolved = resolveSidebarConfig(config);
	const fence = (req) => isTrustedApiRequest(req, ctx.webRuntime.trustedHosts);
	const agentOpenRegistry = new AgentOpenRegistry();
	let settingsFace;
	let openToolsDisposers = null;
	ctx.inject(["settings"], (sctx) => {
		const ns = ownEntryId(ctx);
		if (ns === void 0) {
			ctx.logger?.warn?.("dsh-better-sidebar: no loader row for this package; Side card preferences stay at defaults");
			return;
		}
		ctx.effect(() => sctx.settings.configure({ auto: false }, ctx.fiber), "dsh-better-sidebar: settings page policy");
		const viewOf = () => {
			const descriptor = sctx.settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === ns);
			return descriptor === void 0 ? {
				value: void 0,
				revision: void 0
			} : {
				value: descriptor.value,
				revision: descriptor.revision
			};
		};
		const externalDisable = () => {
			return (sctx.settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === AIONUI_PANEL_ENTRY)?.value)?.rightPanel === "aionui-panel";
		};
		const prefsOf = () => {
			const value = viewOf().value;
			return value !== null && typeof value === "object" ? value : SIDEBAR_PREFS_DEFAULTS;
		};
		const syncOpenToolsGate = () => {
			if (prefsOf().agentOpenTools === true) {
				if (openToolsDisposers === null) openToolsDisposers = registerOpenTool(ctx, agentOpenRegistry, (sessionId) => sessionCwdOf(ctx, sessionId), prefsOf);
			} else if (openToolsDisposers !== null) {
				openToolsDisposers();
				openToolsDisposers = null;
				agentOpenRegistry.drainAll();
			}
		};
		settingsFace = {
			get: () => {
				syncOpenToolsGate();
				return viewOf();
			},
			externalDisable,
			update: async (patch, expectedRevision) => {
				await sctx.settings.update(ns, patch, expectedRevision);
				return viewOf();
			}
		};
		syncOpenToolsGate();
		Promise.resolve(ctx.loader?.await?.()).then(() => importLegacyPrefs(ctx, sctx.settings, ns)).then((outcome) => {
			if (outcome === "no-profile-home" || outcome === "no-form") {
				ctx.logger.warn("dsh-better-sidebar: legacy preference import could not run (%s)", outcome);
				return;
			}
			ctx.logger.info("dsh-better-sidebar: legacy preference import: %s", outcome);
		}).catch((error) => {
			ctx.logger.warn("dsh-better-sidebar: legacy preference import was rejected");
			ctx.logger.warn(error);
		});
	});
	const assistantLive = createAssistantLiveBuffer(ctx);
	ctx.effect(() => () => {
		assistantLive.dispose();
	}, "dsh-better-sidebar: live assistant stream buffer");
	const archiveTasks = createArchiveTasks();
	const api = buildApi(ctx, resolved, () => settingsFace, assistantLive, archiveTasks);
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/sidebar/api",
		handler: async (req, res) => {
			if (!fence(req)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/sidebar/api/") ? pathname.slice(13) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new SidebarError("not-found", "unknown sidebar API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				const handler = api[method];
				if (handler === void 0) throw new SidebarError("not-found", `unknown sidebar API method "${method}"`, 404);
				writeOk(res, await handler(payload));
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-better-sidebar: /sidebar/api routes");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/sidebar/upload",
		handler: async (req, res) => {
			if (!fence(req)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			try {
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				const sessionId = url.searchParams.get("sessionId");
				const dir = url.searchParams.get("dir");
				const relativePath = url.searchParams.get("relativePath");
				if (sessionId === null || dir === null || relativePath === null || relativePath.trim() === "") throw new SidebarError("bad-request", "sessionId, dir, and relativePath are required");
				const { path, size } = await writeWorkspaceUpload({
					cwd: await sessionCwdOf(ctx, sessionId, url.searchParams.get("cwd") ?? void 0),
					dir,
					relativePath,
					chunks: req,
					limit: resolved.uploadLimit
				});
				writeOk(res, {
					path,
					size
				});
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-better-sidebar: /sidebar/upload route");
	ctx.effect(() => registerBundleRoute(ctx, fence), "dsh-better-sidebar: /sidebar/bundle chunk route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/sidebar/archive",
		handler: async (req, res) => {
			if (!fence(req)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (req.method !== "GET") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "method-error",
						message: "method not allowed"
					}
				});
				return;
			}
			try {
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				respondArchiveDownload(archiveTasks, {
					sessionId: url.searchParams.get("sessionId"),
					id: url.searchParams.get("id")
				}, res);
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-better-sidebar: /sidebar/archive route");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/sidebar/file",
		handler: async (req, res) => {
			if (!fence(req)) {
				res.writeHead(403);
				res.end("forbidden");
				return;
			}
			if (req.method !== "GET") {
				res.writeHead(405);
				res.end();
				return;
			}
			try {
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				const sessionId = url.searchParams.get("sessionId");
				const raw = url.searchParams.get("path");
				if (sessionId === null || raw === null) throw new SidebarError("bad-request", "sessionId and path are required");
				const path = await ensureWorkspacePath(await sessionCwdOf(ctx, sessionId, url.searchParams.get("cwd") ?? void 0), raw);
				const info = await stat(path);
				if (!info.isFile() || info.size > resolved.mediaLimit) throw new SidebarError("fs-error", "not a file or too large", 400);
				const type = mediaTypeForPath(path);
				const body = await readFile(path);
				const headers = {
					"content-type": type,
					"cache-control": "no-cache"
				};
				if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(basename(path))}`;
				res.writeHead(200, headers);
				res.end(body);
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-better-sidebar: /sidebar/file media route");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/sidebar/html",
		handler: async (req, res) => {
			if (!fence(req)) {
				res.writeHead(403);
				res.end("forbidden");
				return;
			}
			if (req.method !== "GET") {
				res.writeHead(405);
				res.end();
				return;
			}
			try {
				const decoded = decodeHtmlUrl(new URL(req.url ?? "/", "http://dsh.internal").pathname);
				if (!decoded.ok) {
					writeError(res, new SidebarError("bad-request", decoded.message, decoded.status));
					return;
				}
				const { sessionId, path } = decoded.ref;
				const absolute = await ensureWorkspacePath(await sessionCwdOf(ctx, sessionId), path);
				const info = await stat(absolute);
				if (!info.isFile() || info.size > resolved.mediaLimit) throw new SidebarError("fs-error", "not a file or too large", 400);
				const type = mediaTypeForPath(absolute);
				const body = await readFile(absolute);
				res.writeHead(200, {
					"content-type": type === "text/html" ? "text/html; charset=utf-8" : type,
					"cache-control": "no-cache",
					"x-content-type-options": "nosniff",
					"referrer-policy": "no-referrer",
					"content-security-policy": "sandbox allow-scripts allow-popups allow-downloads allow-modals; object-src 'none'"
				});
				res.end(body);
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-better-sidebar: /sidebar/html preview route");
	const agentOpenWss = new WebSocketServer({ noServer: true });
	ctx.effect(() => ctx.webServer.registerUpgrade({
		path: "/sidebar/ws/agent-opens",
		handler: (req, socket, head) => {
			if (!fence(req)) {
				socket.destroy();
				return;
			}
			agentOpenWss.handleUpgrade(req, socket, head, (ws) => {
				attachAgentOpen(agentOpenRegistry, ws, req);
			});
		}
	}), "dsh-better-sidebar: agent-opens push WebSocket");
	const fsWatchWss = new WebSocketServer({ noServer: true });
	ctx.effect(() => ctx.webServer.registerUpgrade({
		path: "/sidebar/ws/fs-watch",
		handler: (req, socket, head) => {
			if (!fence(req)) {
				socket.destroy();
				return;
			}
			fsWatchWss.handleUpgrade(req, socket, head, (ws) => {
				attachFsWatch(ctx, ws, req);
			});
		}
	}), "dsh-better-sidebar: file-tree watch WebSocket");
	ctx.effect(() => () => {
		openToolsDisposers?.();
		agentOpenRegistry.dispose();
		agentOpenWss.close();
		fsWatchWss.close();
	}, "dsh-better-sidebar: teardown");
}
/**
* Serve one session's directory-watch socket until it closes.
*
* Frames are `{ op: 'watch' | 'unwatch', path }`, where `path` is relative to
* the session's workspace exactly like `fs.tree`'s. A path that fails
* resolution, or a rejection past the watcher cap, is answered with
* `{ dir, ok: false }` so the client can stop asking rather than retry.
* @param ctx - host plugin context (session cwd).
* @param ws - the accepted socket.
* @param req - the upgrade request carrying `?sessionId=`.
*/
async function attachFsWatch(ctx, ws, req) {
	try {
		const sessionId = new URL(req.url ?? "/", "http://dsh.internal").searchParams.get("sessionId");
		if (sessionId === null) {
			ws.close(1008, "sessionId is required");
			return;
		}
		const watchers = createDirectoryWatchers((event) => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ dir: event.dir }));
		}, (dir, error) => {
			ctx.logger.warn("dsh-better-sidebar: cannot watch %s", dir);
			ctx.logger.warn(error);
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
				dir,
				ok: false
			}));
		});
		ws.on("close", () => {
			watchers.close();
		});
		ws.on("error", () => {
			watchers.close();
		});
		ws.on("message", (data) => {
			handleFsWatchFrame(ctx, ws, watchers, sessionId, data);
		});
	} catch (error) {
		ws.close(1011, error instanceof Error ? error.message : String(error));
	}
}
/**
* Apply one watch frame.
* @param ctx - host plugin context.
* @param ws - the owning socket.
* @param watchers - the socket's watcher set.
* @param sessionId - the session the socket was opened for.
* @param data - the raw frame text.
*/
async function handleFsWatchFrame(ctx, ws, watchers, sessionId, data) {
	let frame;
	try {
		frame = JSON.parse(typeof data === "string" ? data : String(data));
	} catch {
		return;
	}
	const path = typeof frame.path === "string" ? frame.path : void 0;
	if (path === void 0 || path === "") return;
	try {
		const dir = await ensureWorkspacePath(await sessionCwdOf(ctx, sessionId), path);
		if (frame.op === "unwatch") {
			watchers.remove(dir);
			return;
		}
		if (frame.op !== "watch") return;
		const ok = watchers.add(dir);
		if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
			dir,
			ok
		}));
	} catch (error) {
		if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
			dir: path,
			ok: false,
			reason: error instanceof Error ? error.message : String(error)
		}));
	}
}
/** Push queued `sidebar_open` requests for one session to a connected view. */
async function attachAgentOpen(registry, ws, req) {
	try {
		const sessionId = new URL(req.url ?? "/", "http://dsh.internal").searchParams.get("sessionId");
		if (sessionId === null) {
			ws.close(1008, "sessionId is required");
			return;
		}
		const send = (request) => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(request));
		};
		const unsubscribe = registry.attach(sessionId, send);
		ws.on("close", () => {
			unsubscribe();
		});
		ws.on("error", () => {
			unsubscribe();
		});
	} catch (error) {
		ws.close(1011, error instanceof Error ? error.message : String(error));
	}
}
//#endregion
export { Config, FS_TREES_MAX_PATHS, apply, archiveNameOf, collectZipEntries, contentDispositionOf, disambiguateArchiveNames, inject, mediaTypeForPath, name };
