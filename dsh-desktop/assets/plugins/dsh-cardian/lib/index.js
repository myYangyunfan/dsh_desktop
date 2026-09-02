import { promises, watch } from "node:fs";
import path, { basename } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/schema.js
let Schema = null;
try {
	const cordis = await import("@deepseek-ai/cordis");
	if (cordis && cordis.Schema) Schema = cordis.Schema;
} catch {}
if (!Schema) {
	const ISSUE = (message, path) => ({
		message,
		path: path || []
	});
	const validateAny = (schema, input, path = []) => {
		if (input === void 0) {
			if (schema.requiredValue) return { issues: [ISSUE("Value is required.", path)] };
			if (schema.defaultValue !== void 0) return { value: schema.defaultValue };
			return { value: void 0 };
		}
		switch (schema.kind) {
			case "string":
				if (typeof input !== "string") return { issues: [ISSUE("Expected a string.", path)] };
				return { value: input };
			case "number":
				if (typeof input !== "number" || Number.isNaN(input)) return { issues: [ISSUE("Expected a number.", path)] };
				return { value: input };
			case "boolean":
				if (typeof input !== "boolean") return { issues: [ISSUE("Expected a boolean.", path)] };
				return { value: input };
			case "const":
				if (!Object.is(input, schema.constValue)) return { issues: [ISSUE(`Expected ${JSON.stringify(schema.constValue)}.`, path)] };
				return { value: input };
			case "array": {
				if (!Array.isArray(input)) return { issues: [ISSUE("Expected an array.", path)] };
				const value = [];
				const issues = [];
				for (let i = 0; i < input.length; i++) {
					const res = validateAny(schema.children, input[i], [...path, i]);
					if (res.issues) issues.push(...res.issues);
					else value.push(res.value);
				}
				return issues.length ? { issues } : { value };
			}
			case "dict": {
				if (input === null || typeof input !== "object" || Array.isArray(input)) return { issues: [ISSUE("Expected a dict.", path)] };
				const value = {};
				const issues = [];
				for (const [key, raw] of Object.entries(input)) {
					const res = validateAny(schema.children, raw, [...path, key]);
					if (res.issues) issues.push(...res.issues);
					else value[key] = res.value;
				}
				return issues.length ? { issues } : { value };
			}
			case "union": {
				const candidates = schema.children ?? [];
				for (const candidate of candidates) {
					const res = validateAny(candidate, input, path);
					if (!res.issues) return res;
				}
				return { issues: [ISSUE("No union branch matched.", path)] };
			}
			case "object": {
				if (input === null || typeof input !== "object" || Array.isArray(input)) return { issues: [ISSUE("Expected an object.", path)] };
				const value = {};
				const issues = [];
				for (const [key, child] of Object.entries(schema.children ?? {})) {
					const raw = input[key];
					const res = validateAny(child, raw, [...path, key]);
					if (res.issues) issues.push(...res.issues);
					else if (res.value !== void 0) value[key] = res.value;
				}
				for (const key of Object.keys(input)) if (!(key in value)) value[key] = input[key];
				if (issues.length) return { issues };
				return { value };
			}
			default: return { value: input };
		}
	};
	const node = (kind, opts = {}) => {
		const schema = {
			kind,
			desc: opts.description ?? null,
			constValue: opts.const,
			defaultValue: void 0,
			requiredValue: false,
			children: opts.children ?? null
		};
		schema.description = (text) => {
			schema.desc = text;
			return schema;
		};
		schema.default = (value) => {
			schema.defaultValue = value;
			return schema;
		};
		schema.required = (value = true) => {
			schema.requiredValue = value;
			return schema;
		};
		schema["~standard"] = {
			version: 1,
			vendor: "dsh-cardian",
			validate: (input) => validateAny(schema, input)
		};
		return schema;
	};
	Schema = {
		string: (opts) => node("string", opts),
		number: (opts) => node("number", opts),
		boolean: (opts) => node("boolean", opts),
		array: (item, opts) => node("array", {
			...opts,
			children: item
		}),
		dict: (item, opts) => node("dict", {
			...opts,
			children: item
		}),
		union: (items, opts) => node("union", {
			...opts,
			children: items
		}),
		object: (fields, opts) => node("object", {
			...opts,
			children: fields
		}),
		const: (value, opts) => node("const", {
			...opts,
			const: value
		})
	};
}
//#endregion
//#region core/frontmatter.js
const BLOCK_LITERAL = "|";
const BLOCK_FOLDED = ">";
function isPlainString(value) {
	if (value === "") return false;
	if (typeof value !== "string") return false;
	if (/^(true|false|null|~)$/i.test(value)) return false;
	if (/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(value.trim())) return false;
	if (/^[\s\-?:,\[\]{}#&*!|>'"%@`]/.test(value)) return false;
	if (/[,\[\]"'#\\]/.test(value)) return false;
	return !/[:#](\s|$)/.test(value) && !/[\n\r]/.test(value);
}
function quote(value) {
	return JSON.stringify(value);
}
function scalar(value) {
	if (value === null || value === void 0) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
	if (typeof value === "string") {
		if (value === "") return "\"\"";
		if (/[\n\r]/.test(value)) return null;
		return isPlainString(value) ? value : quote(value);
	}
	return quote(String(value));
}
function isArray(value) {
	return Array.isArray(value);
}
function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function stringifyNode(value, depth) {
	if (isArray(value)) {
		if (value.length === 0) return "[]";
		const indent = "  ".repeat(depth);
		return "\n" + value.map((v) => indent + "- " + scalarValueInline(v)).join("\n");
	}
	if (isObject(value)) return Object.entries(value).map(([k, v]) => `${k}: ${scalarValueInline(v)}`).join("\n");
	return scalar(value);
}
function scalarValueInline(v) {
	if (isArray(v)) return "[" + v.map(scalar).join(", ") + "]";
	if (isObject(v)) return stringifyNode(v, 0);
	return scalar(v);
}
function keyValueLine(key, value) {
	if (typeof value === "string" && /[\n\r]/.test(value)) {
		const lines = value.replace(/\r\n/g, "\n").split("\n");
		const content = lines[lines.length - 1] === "" ? lines.slice(0, -1).join("\n") : lines.join("\n");
		return `${key}: ${BLOCK_LITERAL}\n${content.split("\n").map((l) => "  " + l).join("\n")}`;
	}
	if (isArray(value)) {
		if (value.length === 0) return `${key}: []`;
		if (value.every((v) => typeof v !== "object" || v === null)) return `${key}: [${value.map(scalar).join(", ")}]`;
		return `${key}:\n` + value.map((v) => `  - ${scalarValueInline(v)}`).join("\n");
	}
	if (isObject(value)) {
		const inner = Object.entries(value).map(([k, v]) => `${k}: ${scalarValueInline(v)}`).join("\n");
		return `${key}:\n` + inner.split("\n").map((l) => "  " + l).join("\n");
	}
	return `${key}: ${scalar(value)}`;
}
function stringifyFrontmatter(data) {
	if (!data || Object.keys(data).length === 0) return "---\n---\n";
	return `---\n${Object.entries(data).map(([k, v]) => keyValueLine(k, v)).join("\n")}\n---\n`;
}
function unquote(value) {
	const s = value.trim();
	if (s.length >= 2) {
		if (s[0] === "\"" && s[s.length - 1] === "\"" || s[0] === "'" && s[s.length - 1] === "'") try {
			return JSON.parse(s);
		} catch {
			return s.slice(1, -1);
		}
	}
	return s;
}
function parseScalar(value) {
	const s = value.trim();
	if (s === "" || s === "~" || s === "null") return null;
	if (s === "true") return true;
	if (s === "false") return false;
	if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
	if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
	return unquote(s);
}
function parseInlineArray(s) {
	const inner = s.slice(1, -1);
	if (inner.trim() === "") return [];
	return splitFlow(inner).map(parseScalar);
}
function splitFlow(s) {
	const parts = [];
	let cur = "";
	let inDouble = false;
	let inSingle = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inDouble && c === "\\") {
			cur += c;
			if (i + 1 < s.length) {
				cur += s[i + 1];
				i++;
			}
			continue;
		}
		if (c === "\"" && !inSingle) {
			inDouble = !inDouble;
			cur += c;
		} else if (c === "'" && !inDouble) {
			inSingle = !inSingle;
			cur += c;
		} else if (c === "," && !inDouble && !inSingle) {
			parts.push(cur.trim());
			cur = "";
		} else cur += c;
	}
	if (cur.trim() !== "") parts.push(cur.trim());
	return parts;
}
function parseFrontmatter(text) {
	const normalized = text.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---")) return {
		frontmatter: {},
		body: normalized,
		hasFrontmatter: false
	};
	const lines = normalized.split("\n");
	const end = lines.indexOf("---", 1);
	if (end === -1) return {
		frontmatter: {},
		body: normalized,
		hasFrontmatter: false
	};
	const fmLines = lines.slice(1, end);
	if (!fmLines.some((l) => {
		const t = l.trim();
		return t !== "" && !t.startsWith("#") && /^[^:#][^:]*:/.test(t);
	}) && fmLines.length > 0) return {
		frontmatter: {},
		body: normalized,
		hasFrontmatter: false
	};
	const body = lines.slice(end + 1).join("\n");
	return {
		frontmatter: normalizeFrontmatter(parseLines(fmLines)),
		body,
		hasFrontmatter: true
	};
}
function normalizeFrontmatter(fm) {
	if (fm.title !== void 0 && fm.title !== null) fm.title = String(fm.title);
	for (const key of [
		"tags",
		"aliases",
		"facts"
	]) if (Array.isArray(fm[key])) fm[key] = fm[key].map((v) => String(v));
	return fm;
}
function parseLines(lines) {
	const result = {};
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) {
			i++;
			continue;
		}
		const m = /^([^:]+):(.*)$/.exec(line);
		if (!m) {
			i++;
			continue;
		}
		const key = m[1].trim();
		const rest = m[2].trim();
		if (rest === "" || rest === BLOCK_LITERAL || rest === BLOCK_FOLDED) {
			const block = rest === BLOCK_LITERAL || rest === BLOCK_FOLDED;
			const list = [];
			let j = i + 1;
			if (block) {
				while (j < lines.length && (lines[j].startsWith("  ") || lines[j].trim() === "")) {
					list.push(lines[j].startsWith("  ") ? lines[j].slice(2) : lines[j]);
					j++;
				}
				result[key] = list.join("\n");
				i = j;
				continue;
			}
			while (j < lines.length && /^\s+-\s?/.test(lines[j])) {
				list.push(parseScalar(lines[j].replace(/^\s+-\s?/, "")));
				j++;
			}
			result[key] = list.length ? list : null;
			i = j;
			continue;
		}
		if (rest.startsWith("[") && rest.endsWith("]")) result[key] = parseInlineArray(rest);
		else result[key] = parseScalar(rest);
		i++;
	}
	return result;
}
//#endregion
//#region core/errors.js
var CardianError = class extends Error {
	constructor(message, opts = {}) {
		super(message);
		this.name = this.constructor.name;
		this.code = opts.code ?? "CARDian";
		this.details = opts.details;
		this.suggestion = opts.suggestion ?? null;
		if (opts.cause) this.cause = opts.cause;
	}
	toJSON() {
		return {
			code: this.code,
			message: this.message,
			...this.suggestion ? { suggestion: this.suggestion } : {},
			...this.details !== void 0 ? { details: this.details } : {}
		};
	}
};
var ValidationError = class extends CardianError {
	constructor(message, opts = {}) {
		super(message, {
			code: "VALIDATION",
			...opts
		});
	}
};
var NotFoundError = class extends CardianError {
	constructor(message, opts = {}) {
		super(message, {
			code: "NOT_FOUND",
			...opts
		});
	}
};
var ConfigError = class extends CardianError {
	constructor(message, opts = {}) {
		super(message, {
			code: "CONFIG",
			...opts
		});
	}
};
var PathError = class extends CardianError {
	constructor(message, opts = {}) {
		super(message, {
			code: "PATH",
			...opts
		});
	}
};
var StoreError = class extends CardianError {
	constructor(message, opts = {}) {
		super(message, {
			code: "STORE",
			...opts
		});
	}
};
function toErrorPayload(err) {
	if (err instanceof CardianError) return {
		ok: false,
		error: err.toJSON()
	};
	return {
		ok: false,
		error: {
			code: "INTERNAL",
			message: err?.message ?? String(err)
		}
	};
}
//#endregion
//#region core/store.js
const SECTIONS = {
	wiki: "Repos",
	card: "Cards",
	memory: "Memory"
};
var VaultStore = class {
	constructor(rootPath, opts = {}) {
		this.root = path.resolve(rootPath);
		this.realRoot = null;
		this.logger = opts.logger ?? null;
		this.version = 0;
		this._queue = Promise.resolve();
	}
	abs(relPath) {
		const target = path.resolve(this.root, relPath);
		if (target !== this.root && !target.startsWith(this.root + path.sep)) throw new PathError(`路径越界: ${relPath}`, { suggestion: "路径必须位于 vault 内" });
		return target;
	}
	rel(absPath) {
		return path.relative(this.root, absPath).split(path.sep).join("/");
	}
	async init() {
		await promises.mkdir(this.root, { recursive: true });
		this.realRoot = await promises.realpath(this.root);
		await Promise.all(Object.values(SECTIONS).map((dir) => promises.mkdir(this.abs(dir), { recursive: true })));
	}
	_enqueue(fn) {
		const run = this._queue.then(() => fn());
		this._queue = run.catch(() => {});
		return run;
	}
	transact(fn) {
		return this._enqueue(fn);
	}
	async _guard(absPath) {
		if (!this.realRoot) try {
			this.realRoot = await promises.realpath(this.root);
		} catch {
			return;
		}
		let dir = path.dirname(absPath);
		let real;
		while (true) try {
			real = await promises.realpath(dir);
			break;
		} catch {
			const parent = path.dirname(dir);
			if (parent === dir) return;
			dir = parent;
		}
		if (real !== this.realRoot && !real.startsWith(this.realRoot + path.sep)) throw new PathError(`路径经符号链接逃逸 vault: ${absPath}`, { suggestion: "移除指向 vault 外部的符号链接" });
	}
	async _write(relPath, note) {
		const absPath = this.abs(relPath);
		await promises.mkdir(path.dirname(absPath), { recursive: true });
		await this._guard(absPath);
		const text = stringifyFrontmatter(note.frontmatter) + (note.body ?? "");
		const tmp = `${absPath}.${randomBytes(6).toString("hex")}.tmp`;
		await promises.writeFile(tmp, text, "utf8");
		await promises.rename(tmp, absPath);
		this.version++;
		return absPath;
	}
	write(relPath, note) {
		return this._enqueue(() => this._write(relPath, note));
	}
	async _remove(relPath) {
		await promises.rm(this.abs(relPath), { force: true });
		this.version++;
	}
	remove(relPath) {
		return this._enqueue(() => this._remove(relPath));
	}
	async read(relPath) {
		const absPath = this.abs(relPath);
		try {
			return parseFrontmatter(await promises.readFile(absPath, "utf8"));
		} catch (err) {
			if (err.code === "ENOENT") return null;
			throw err;
		}
	}
	async exists(relPath) {
		try {
			await promises.access(this.abs(relPath));
			return true;
		} catch {
			return false;
		}
	}
	async list(dirRel) {
		const dirAbs = this.abs(dirRel);
		const out = [];
		let entries;
		try {
			entries = await promises.readdir(dirAbs, { withFileTypes: true });
		} catch (err) {
			if (err.code === "ENOENT") return out;
			throw err;
		}
		for (const entry of entries) {
			const rel = this.rel(path.join(dirAbs, entry.name));
			if (entry.isDirectory()) out.push(...await this.list(rel));
			else if (entry.isFile() && entry.name.endsWith(".md")) {
				if (!(isIndexName(entry.name) && rel.split("/").length === 2)) out.push(rel);
			}
		}
		return out;
	}
	async freshness() {
		let mtime = 0;
		for (const dir of Object.values(SECTIONS)) try {
			const st = await promises.stat(this.abs(dir));
			mtime = Math.max(mtime, st.mtimeMs);
		} catch {}
		return mtime;
	}
	async fileStats() {
		const out = [];
		for (const dir of Object.values(SECTIONS)) for (const rel of await this.list(dir)) try {
			const st = await promises.stat(this.abs(rel));
			out.push({
				rel,
				mtimeMs: st.mtimeMs
			});
		} catch {}
		return out;
	}
	async snapshot() {
		const notes = [];
		for (const dir of Object.values(SECTIONS)) for (const rel of await this.list(dir)) {
			const note = await this.read(rel);
			if (note) notes.push({
				rel,
				frontmatter: note.frontmatter,
				body: note.body
			});
		}
		return notes;
	}
	async tmpFiles() {
		const out = [];
		const walk = async (dirAbs) => {
			let entries;
			try {
				entries = await promises.readdir(dirAbs, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				const p = path.join(dirAbs, e.name);
				if (e.isDirectory()) await walk(p);
				else if (e.isFile() && e.name.endsWith(".tmp")) out.push(this.rel(p));
			}
		};
		for (const dir of Object.values(SECTIONS)) await walk(this.abs(dir));
		return out;
	}
};
function isIndexName(name) {
	const stem = name.replace(/\.md$/i, "");
	return /^(README|_index|index|MOC|moc)$/i.test(stem);
}
//#endregion
//#region core/slug.js
function slugify(input) {
	return String(input ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "note";
}
function createId(prefix, seed, extra = "") {
	return `${prefix}-${seed ? slugify(seed) : "note"}-${createHash("sha1").update(`${prefix}:${seed}:${extra}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12)}`;
}
function shortHash(str) {
	return createHash("sha1").update(String(str)).digest("hex").slice(0, 6);
}
function nowIso() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
//#endregion
//#region core/moc.js
function asTag(t) {
	const cleaned = String(t).trim().replace(/[\s[\]|#]+/g, "-");
	return cleaned ? cleaned : null;
}
function linkAlias(value) {
	return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[\[\]|]/g, " ").replace(/\s+/g, " ").trim();
}
async function rebuildMoc(store, sectionDir, opts) {
	const { title, description = "", groupBy, frontmatter: extra = {} } = opts;
	const files = await store.list(sectionDir);
	const entries = [];
	for (const rel of files) {
		const note = await store.read(rel);
		if (note) entries.push({
			rel,
			frontmatter: note.frontmatter
		});
	}
	const groups = /* @__PURE__ */ new Map();
	for (const entry of entries) {
		const group = groupBy ? groupBy(entry.frontmatter) : "全部";
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group).push(entry);
	}
	const lines = [`# ${title}`];
	if (description) lines.push("", description);
	lines.push("", `> 共 ${entries.length} 条，由 cardian 自动维护。`);
	for (const [group, list] of [...groups.entries()].sort()) {
		lines.push("", `## ${group}`, "");
		for (const entry of list) {
			const stem = entry.rel.split("/").pop().replace(/\.md$/, "");
			const title2 = linkAlias(entry.frontmatter.title) || stem;
			const tags = (entry.frontmatter.tags ?? []).map(asTag).filter(Boolean).map((t) => `#${t}`).join(" ");
			lines.push(`- [[${stem}|${title2}]]${tags ? "  " + tags : ""}`);
		}
	}
	await store.write(`${sectionDir}/README.md`, {
		frontmatter: {
			title,
			type: "moc",
			updated: (/* @__PURE__ */ new Date()).toISOString(),
			...extra
		},
		body: lines.join("\n") + "\n"
	});
}
//#endregion
//#region core/notes.js
function normalizeTags(tags) {
	if (!Array.isArray(tags)) return [];
	return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}
function compact(obj) {
	return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== void 0 && v !== null && v !== ""));
}
async function allocateRel(store, dir, baseStem, seed, ignoreId = null) {
	const occupiedIsSelf = (note) => ignoreId && note?.frontmatter.id === ignoreId;
	let stem = baseStem;
	let rel = `${dir}/${stem}.md`;
	let occupied = await store.read(rel);
	let i = 0;
	while (occupied && !occupiedIsSelf(occupied)) {
		i++;
		stem = `${baseStem}-${shortHash(`${seed}#${i}`)}`;
		rel = `${dir}/${stem}.md`;
		occupied = await store.read(rel);
	}
	return {
		stem,
		rel
	};
}
var NoteService = class {
	constructor(store, opts) {
		this.store = store;
		this.opts = opts;
		this.indexer = opts.indexer ?? null;
		this.opts.limits = opts.limits ?? null;
	}
	plan(args) {
		throw new Error("plan() must be implemented by the subclass");
	}
	async resolveExisting(plan) {
		const entries = await this.entries();
		if (plan.id) {
			const byId = entries.find((e) => e.frontmatter.id === plan.id);
			if (byId) return byId;
		}
		return entries.find((e) => e.frontmatter.title === plan.title) ?? null;
	}
	async writeNote(plan) {
		const lim = this.opts.limits || {};
		return this.store.transact(async () => {
			if (lim.maxNoteChars && String(plan.body ?? "").length > lim.maxNoteChars) throw new ValidationError(`笔记超出字节上限 ${lim.maxNoteChars}（当前 ${String(plan.body).length}）`);
			if (lim.maxNotesPerSection) {
				const sectionFiles = await this.store.list(this.opts.section);
				if (!await this.resolveExisting(plan) && sectionFiles.length >= lim.maxNotesPerSection) throw new ValidationError(`分区已达条目配额 ${lim.maxNotesPerSection}`);
			}
			const existing = await this.resolveExisting(plan);
			const group = slugify(plan.group ?? existing?.group ?? this.opts.defaultGroup);
			const dir = `${this.opts.section}/${group}`;
			let stem = plan.stem;
			let rel = existing ? existing.rel : `${dir}/${stem}.md`;
			if (!existing) ({stem, rel} = await allocateRel(this.store, dir, plan.stem, plan.title));
			else if (existing.group !== group) ({stem, rel} = await allocateRel(this.store, dir, existing.stem, plan.title, existing.frontmatter.id));
			const prevFm = (existing ?? await this.store.read(rel))?.frontmatter ?? {};
			const now = nowIso();
			const id = prevFm.id ?? createId(this.opts.idPrefix, stem);
			const created = prevFm.created ?? now;
			const baseKeys = /* @__PURE__ */ new Set([
				"id",
				"type",
				"title",
				"tags",
				this.opts.groupField,
				"created",
				"updated"
			]);
			const preserved = {};
			for (const [key, value] of Object.entries(prevFm)) if (!baseKeys.has(key)) preserved[key] = value;
			const tags = plan.tags === void 0 ? prevFm.tags ?? [] : normalizeTags(plan.tags);
			const extra = compact(plan.extra ?? {});
			const frontmatter = {
				id,
				type: this.opts.type,
				title: plan.title,
				tags,
				[this.opts.groupField]: group,
				status: extra.status ?? prevFm.status ?? "published",
				created,
				updated: now,
				...preserved,
				...extra
			};
			const finalFrontmatter = this.decorate ? this.decorate(frontmatter, prevFm, plan) : frontmatter;
			const body = this.finalizeBody ? this.finalizeBody(plan.body, finalFrontmatter) : plan.body;
			await this.store._write(rel, {
				frontmatter: finalFrontmatter,
				body
			});
			if (existing && existing.rel !== rel) await this.store._remove(existing.rel);
			return {
				rel,
				id,
				title: plan.title,
				group,
				updated: now,
				created
			};
		});
	}
	decorate(frontmatter) {
		return frontmatter;
	}
	async upsert(args) {
		const result = await this.writeNote(this.plan(args));
		await this.refreshMoc();
		return result;
	}
	async entries() {
		const files = await this.store.list(this.opts.section);
		const out = [];
		for (const rel of files) {
			const note = await this.store.read(rel);
			if (!note) continue;
			const parts = rel.split("/");
			out.push({
				rel,
				stem: parts[parts.length - 1].replace(/\.md$/, ""),
				group: parts.length > 2 ? parts[1] : null,
				frontmatter: note.frontmatter,
				body: note.body
			});
		}
		return out;
	}
	async find(ref, group = null) {
		const entries = await this.entries();
		const needle = String(ref ?? "").trim();
		const needleSlug = slugify(needle);
		const groupSlug = group ? slugify(group) : null;
		for (const entry of entries) {
			if (groupSlug && entry.group !== groupSlug) continue;
			const { frontmatter, stem } = entry;
			const aliases = frontmatter.aliases ?? [];
			if (frontmatter.id === needle || frontmatter.title === needle || stem === needleSlug || slugify(frontmatter.title) === needleSlug || aliases.some((a) => String(a) === needle || slugify(String(a)) === needleSlug)) return entry;
		}
		return null;
	}
	async get(ref, group = null) {
		const entry = await this.find(ref, group);
		if (!entry) return null;
		return {
			...entry.frontmatter,
			body: entry.body,
			rel: entry.rel
		};
	}
	async list({ group = null, tag = null, status = null } = {}) {
		const entries = await this.entries();
		const wantedTag = tag ? String(tag) : null;
		const groupSlug = group ? slugify(group) : null;
		const wantedStatus = status ? String(status) : null;
		return entries.filter((e) => (!groupSlug || e.group === groupSlug) && (!wantedTag || (e.frontmatter.tags ?? []).includes(wantedTag)) && (!wantedStatus || (e.frontmatter.status ?? "published") === wantedStatus)).map((e) => summary$1(e));
	}
	async search(query, opts = {}) {
		if (!this.indexer) {
			const q = String(query ?? "").toLowerCase();
			if (!q) return [];
			return (await this.entries()).filter((e) => [
				e.rel,
				e.body,
				e.frontmatter.title,
				(e.frontmatter.tags ?? []).join(" ")
			].filter(Boolean).join("\n").toLowerCase().includes(q)).map((e) => summary$1(e));
		}
		return this.indexer.search(query, {
			...opts,
			type: this.opts.type
		});
	}
	async remove(ref, group = null) {
		const removed = await this.store.transact(async () => {
			const entry = await this.find(ref, group);
			if (!entry) return false;
			await this.store._remove(entry.rel);
			return true;
		});
		if (removed) await this.refreshMoc();
		return removed;
	}
	async annotate(ref, kind = "correction", text = "") {
		return this.store.transact(async () => {
			const entry = await this.find(ref);
			if (!entry) throw new NotFoundError(`条目不存在: ${ref}`);
			const fm = entry.frontmatter;
			const corrections = Array.isArray(fm.corrections) ? fm.corrections.slice(-19) : [];
			corrections.push(`${(/* @__PURE__ */ new Date()).toISOString()} [${kind}] ${String(text).trim()}`.trim());
			let confidence = fm.confidence == null ? 1 : Number(fm.confidence);
			if (!Number.isFinite(confidence)) confidence = 1;
			if (kind === "correction") confidence = Math.max(0, confidence - .2);
			else if (kind === "confirm") confidence = Math.min(1, confidence + .1);
			const nextFm = {
				...fm,
				corrections,
				confidence: Math.round(confidence * 100) / 100
			};
			await this.store._write(entry.rel, {
				frontmatter: nextFm,
				body: entry.body
			});
			return {
				rel: entry.rel,
				kind,
				corrections: corrections.length,
				confidence: nextFm.confidence
			};
		});
	}
	async refreshMoc() {
		const { groupField, mocTitle, mocDescription } = this.opts;
		await rebuildMoc(this.store, this.opts.section, {
			title: mocTitle,
			description: mocDescription,
			groupBy: (fm) => fm[groupField] ?? this.opts.defaultGroup
		});
	}
};
function summary$1(entry) {
	return {
		rel: entry.rel,
		id: entry.frontmatter.id,
		title: entry.frontmatter.title,
		group: entry.group,
		tags: entry.frontmatter.tags ?? [],
		status: entry.frontmatter.status ?? "published",
		cardType: entry.frontmatter.cardType ?? null,
		updated: entry.frontmatter.updated,
		path: entry.frontmatter.path ?? null,
		level: entry.frontmatter.level ?? null,
		parent: entry.frontmatter.parent ?? null,
		analysisLevel: entry.frontmatter.analysisLevel ?? null
	};
}
//#endregion
//#region core/cards.js
function cardTypeOf(v) {
	if (v === void 0 || v === null || v === "") return null;
	return String(v).trim().toLowerCase() || null;
}
var CardsService = class extends NoteService {
	constructor(store, deps = {}) {
		super(store, {
			limits: deps.limits,
			section: SECTIONS.card,
			type: "card",
			groupField: "category",
			defaultGroup: "general",
			idPrefix: "card",
			mocTitle: "知识卡片",
			mocDescription: "原子化知识卡片，按分类归组。",
			indexer: deps.indexer
		});
	}
	plan(args) {
		const title = String(args.title ?? "").trim();
		const content = String(args.content ?? args.body ?? "").trim();
		if (!title) throw new ValidationError("知识卡片需要 title");
		if (!content) throw new ValidationError("知识卡片需要 content");
		const category = args.category ? String(args.category).trim() : null;
		return {
			id: args.id ? String(args.id) : null,
			group: category || void 0,
			stem: slugify(title),
			title,
			tags: args.tags,
			body: content.endsWith("\n") ? content : content + "\n",
			extra: {
				source: args.source ?? null,
				aliases: args.aliases ?? null,
				status: args.status ?? null,
				confidence: clampConfidence(args.confidence),
				summary: args.summary ?? null,
				relations: args.relations ?? null,
				as_of: validDate(args.as_of),
				expires: validDate(args.expires),
				cardType: cardTypeOf(args.cardType),
				front: args.front ?? null,
				back: args.back ?? null,
				deck: args.deck ?? null
			}
		};
	}
	async list(opts = {}) {
		const all = await super.list(opts);
		const want = opts && opts.cardType ? String(opts.cardType).toLowerCase() : null;
		if (!want) return all;
		return all.filter((e) => String(e.cardType ?? "untyped").toLowerCase() === want);
	}
	async review(ref, grade = 2) {
		return this.store.transact(async () => {
			const entry = await this.find(ref);
			if (!entry) throw new NotFoundError(`卡片不存在: ${ref}`);
			const fm = entry.frontmatter;
			if (!fm.front) throw new ValidationError("该卡片没有 front，不是闪卡");
			const g = Math.max(0, Math.min(3, Number.isFinite(Number(grade)) ? Math.round(Number(grade)) : 0));
			const ease = Number(fm.ease) || 2.5;
			let reps = Number(fm.reps) || 0;
			let interval = Number(fm.interval) || 0;
			let newEase = ease;
			if (g < 2) {
				reps = 0;
				interval = 0;
				newEase = Math.max(1.3, ease - .2);
			} else {
				reps += 1;
				if (reps === 1) interval = 1;
				else if (reps === 2) interval = 6;
				else interval = Math.max(1, Math.round(interval * ease));
				newEase = Math.max(1.3, ease + (.1 - (3 - g) * (.08 + (3 - g) * .02)));
			}
			const due = new Date(Date.now() + interval * 864e5).toISOString();
			const nextFm = {
				...fm,
				reps,
				interval,
				ease: Math.round(newEase * 100) / 100,
				due,
				reviewed: (/* @__PURE__ */ new Date()).toISOString()
			};
			await this.store._write(entry.rel, {
				frontmatter: nextFm,
				body: entry.body
			});
			return {
				rel: entry.rel,
				title: fm.title,
				grade: g,
				interval,
				due,
				ease: nextFm.ease
			};
		});
	}
	async due({ deck = null } = {}) {
		const now = Date.now();
		return (await this.entries()).filter((e) => e.frontmatter.front).filter((e) => !deck || e.frontmatter.deck === deck).filter((e) => !e.frontmatter.due || Date.parse(String(e.frontmatter.due)) <= now).map((e) => ({
			rel: e.rel,
			title: e.frontmatter.title,
			front: e.frontmatter.front,
			back: e.frontmatter.back ?? null,
			deck: e.frontmatter.deck ?? null,
			due: e.frontmatter.due ?? null,
			interval: e.frontmatter.interval ?? 0,
			reps: e.frontmatter.reps ?? 0
		}));
	}
};
function clampConfidence(value) {
	if (value === void 0 || value === null || value === "") return null;
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	return Math.min(1, Math.max(0, n));
}
function validDate(value) {
	if (value === void 0 || value === null || value === "") return null;
	const s = String(value);
	if (Number.isNaN(Date.parse(s))) throw new ValidationError(`无效日期: ${value}`);
	return s;
}
//#endregion
//#region core/memory.js
const KINDS = /* @__PURE__ */ new Set([
	"semantic",
	"episodic",
	"procedural"
]);
var MemoryService = class extends NoteService {
	constructor(store, deps = {}) {
		super(store, {
			limits: deps.limits,
			section: SECTIONS.memory,
			type: "memory",
			groupField: "scope",
			defaultGroup: "global",
			idPrefix: "mem",
			mocTitle: "记忆",
			mocDescription: "跨会话持久记忆，按 scope 归组。",
			indexer: deps.indexer
		});
	}
	plan(args) {
		const title = String(args.title ?? "").trim();
		const content = String(args.content ?? args.body ?? "").trim();
		if (!title) throw new ValidationError("记忆需要 title");
		if (!content) throw new ValidationError("记忆需要 content");
		const scope = args.scope ? String(args.scope).trim() : null;
		const facts = Array.isArray(args.facts) ? normalizeTags(args.facts) : null;
		const importance = args.importance !== void 0 && args.importance !== null ? Math.min(5, Math.max(1, Math.round(Number(args.importance)))) : null;
		const kind = args.kind ? String(args.kind).trim().toLowerCase() : null;
		if (kind && !KINDS.has(kind)) throw new ValidationError(`kind 必须是 ${[...KINDS].join(" | ")}`);
		return {
			id: args.id ? String(args.id) : null,
			group: scope || void 0,
			stem: slugify(title),
			title,
			tags: args.tags,
			body: content.endsWith("\n") ? content : content + "\n",
			extra: {
				facts,
				importance,
				kind: kind ?? null,
				aliases: args.aliases ?? null,
				status: args.status ?? null,
				confidence: clampConfidence(args.confidence),
				summary: args.summary ?? null,
				relations: args.relations ?? null,
				as_of: validDate(args.as_of),
				expires: validDate(args.expires)
			}
		};
	}
	decorate(frontmatter, prevFm) {
		if (!prevFm?.id) return frontmatter;
		const history = Array.isArray(prevFm.history) ? prevFm.history.slice(-19) : [];
		history.push(`${frontmatter.updated} ${prevFm.title ?? frontmatter.title}`);
		return {
			...frontmatter,
			history
		};
	}
	async promote(ref, { target = "shared" } = {}) {
		const note = await this.get(ref);
		if (!note) throw new NotFoundError(`条目不存在: ${ref}`);
		const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
		const head = String(note.summary ?? "").trim();
		Array.isArray(note.facts) && note.facts.length;
		const section = [
			"",
			`## ${today} · 晋升自记忆库：${note.title}`,
			head ? head : String(note.body ?? "").split("\n").find(Boolean)?.replace(/^#+\s*/, "") ?? "",
			""
		].join("\n");
		const destFile = target === "local" ? "PERSONAL.md" : "PROJECT.md";
		const prev = await this.store.read(destFile);
		const body = (prev && prev.body || "# 项目说明（由知识树维护的记忆晋升区）\n") + section;
		await this.store.write(destFile, {
			frontmatter: {
				title: target === "local" ? "个人说明" : "项目说明",
				type: "promoted"
			},
			body
		});
		return {
			file: destFile,
			promoted: note.title,
			scope: note.scope,
			target
		};
	}
	finalizeBody(body, frontmatter) {
		const facts = frontmatter.facts ?? [];
		if (!facts.length) return body;
		return body.trimEnd() + `\n\n## Facts\n\n${facts.map((f) => `- ${f}`).join("\n")}\n`;
	}
};
//#endregion
//#region core/repowiki.js
const SKIP_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"coverage",
	".obsidian",
	"__pycache__",
	".venv",
	"venv",
	"vendor",
	".next",
	".nuxt",
	"target"
]);
const TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
	".md",
	".markdown",
	".txt",
	".js",
	".mjs",
	".cjs",
	".ts",
	".tsx",
	".jsx",
	".py",
	".java",
	".go",
	".rs",
	".c",
	".h",
	".cc",
	".cpp",
	".hpp",
	".cs",
	".rb",
	".php",
	".swift",
	".kt",
	".kts",
	".scala",
	".sh",
	".bash",
	".zsh",
	".json",
	".yaml",
	".yml",
	".toml",
	".xml",
	".css",
	".scss",
	".less",
	".html",
	".sql",
	".graphql",
	".proto",
	".vue",
	".svelte"
]);
const CONFIG_NAMES = /* @__PURE__ */ new Set([
	"Dockerfile",
	"Makefile",
	"CMakeLists.txt",
	".gitignore",
	".dockerignore",
	".editorconfig",
	".env.example",
	"Justfile",
	"Cargo.toml"
]);
const LANG_BY_EXT = {
	".js": "javascript",
	".mjs": "javascript",
	".cjs": "javascript",
	".ts": "typescript",
	".tsx": "typescript",
	".jsx": "javascript",
	".py": "python",
	".java": "java",
	".go": "go",
	".rs": "rust",
	".c": "c",
	".h": "c",
	".cc": "cpp",
	".cpp": "cpp",
	".hpp": "cpp",
	".cs": "csharp",
	".rb": "ruby",
	".php": "php",
	".swift": "swift",
	".kt": "kotlin",
	".kts": "kotlin",
	".scala": "scala",
	".sh": "shell",
	".bash": "shell",
	".zsh": "shell",
	".json": "json",
	".yaml": "yaml",
	".yml": "yaml",
	".toml": "toml",
	".xml": "xml",
	".css": "css",
	".scss": "scss",
	".less": "less",
	".html": "html",
	".sql": "sql",
	".graphql": "graphql",
	".proto": "protobuf",
	".vue": "vue",
	".svelte": "svelte",
	".md": "markdown",
	".markdown": "markdown",
	".txt": "text"
};
var RepoWikiService = class extends NoteService {
	constructor(store, deps = {}) {
		super(store, {
			section: SECTIONS.wiki,
			type: "wiki",
			groupField: "repo",
			defaultGroup: "default",
			idPrefix: "wiki",
			mocTitle: "RepoWiki",
			mocDescription: "代码仓库的自动 Wiki，按仓库归组。",
			indexer: deps.indexer
		});
		this.excludes = Array.isArray(deps.excludes) ? deps.excludes.map(String) : [];
		this.allowedRoots = Array.isArray(deps.allowedRoots) ? deps.allowedRoots.map((r) => path.resolve(String(r))) : [];
	}
	assertAllowedRoot(absRoot) {
		if (this.allowedRoots.length === 0) return;
		if (!this.allowedRoots.some((root) => absRoot === root || absRoot.startsWith(root + path.sep))) throw new PathError(`仓库路径不在 allowedRoots 白名单内：${absRoot}`, { suggestion: "在 cardian 配置的 allowedRoots 中加入该目录，或移除限制" });
	}
	plan(args) {
		const repo = slugify(args.repo ?? args.repoName ?? "");
		const relPath = String(args.path ?? "").trim().replace(/^[/\\]+/, "");
		if (!repo) throw new ValidationError("wiki 需要 repo 名称");
		if (!relPath) throw new ValidationError("wiki 需要 path");
		const content = String(args.content ?? args.body ?? "").trim();
		if (!content) throw new ValidationError("wiki 需要 content");
		const title = String(args.title ?? "").trim() || relPath;
		return {
			group: repo,
			stem: flattenPath(relPath),
			title,
			tags: args.tags,
			body: content.endsWith("\n") ? content : content + "\n",
			extra: {
				path: relPath,
				language: args.language ?? null,
				summary: args.summary ?? null,
				status: args.status ?? null,
				confidence: clampConfidence(args.confidence),
				aliases: args.aliases ?? null,
				analysisLevel: args.analysisLevel ?? "manual",
				relations: args.relations ?? null,
				as_of: validDate(args.as_of),
				expires: validDate(args.expires),
				level: normalizeLevel(args.level),
				parent: args.parent ? String(args.parent) : null
			}
		};
	}
	async resolveExisting(plan) {
		const repoSlug = slugify(plan.group ?? plan.repo ?? "");
		const wanted = String(plan.extra?.path ?? "").replace(/^[/\\]+/, "");
		return (await this.entries()).find((e) => e.group === repoSlug && e.frontmatter.path === wanted) ?? null;
	}
	async listRepos() {
		const entries = await this.entries();
		return [...new Set(entries.map((e) => e.group).filter(Boolean))].sort();
	}
	async getByPath(repo, relPath) {
		const repoSlug = slugify(repo);
		const wanted = String(relPath ?? "").replace(/^[/\\]+/, "");
		const entry = (await this.entries()).find((e) => e.group === repoSlug && e.frontmatter.path === wanted);
		return entry ? {
			...entry.frontmatter,
			body: entry.body,
			rel: entry.rel
		} : null;
	}
	async removeByPath(repo, relPath) {
		const repoSlug = slugify(repo);
		const wanted = String(relPath ?? "").replace(/^[/\\]+/, "");
		const entry = (await this.entries()).find((e) => e.group === repoSlug && e.frontmatter.path === wanted);
		if (!entry) return false;
		await this.store.remove(entry.rel);
		await this.refreshMoc();
		return true;
	}
	async ingest(repoPath, opts = {}) {
		const absRoot = path.resolve(String(repoPath ?? ""));
		this.assertAllowedRoot(absRoot);
		const repoName = String(opts.repoName ?? path.basename(absRoot) ?? "repo");
		const rawMax = opts.maxFiles == null ? 50 : Number(opts.maxFiles);
		const maxFiles = Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 50;
		const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
		const filtered = (await scanFiles(absRoot, maxFiles)).filter((f) => !pathExcluded(path.relative(absRoot, f), this.excludes));
		let declared = null;
		try {
			const planRaw = JSON.parse(await promises.readFile(path.join(absRoot, "wiki.plan.json"), "utf8"));
			if (Array.isArray(planRaw.pages)) declared = new Map(planRaw.pages.map((pg) => [String(pg.path || "").replace(/^\/+/, ""), pg]));
		} catch {}
		const files = declared ? filtered.filter((f) => declared.has(path.relative(absRoot, f).split(path.sep).join("/"))) : filtered;
		const hints = /* @__PURE__ */ new Map();
		if (declared) for (const f of files) {
			const rp = path.relative(absRoot, f).split(path.sep).join("/");
			const pg = declared.get(rp);
			if (pg?.title || pg?.summary) hints.set(rp, {
				title: pg.title,
				summary: pg.summary
			});
		}
		const total = files.length;
		if (onProgress) onProgress({
			done: 0,
			total,
			current: "开始写入…"
		});
		const repo = slugify(repoName);
		const written = [];
		const skipped = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const relPath = path.relative(absRoot, file).split(path.sep).join("/");
			if (onProgress) onProgress({
				done: i,
				total,
				current: relPath
			});
			const existing = await this.getByPath(repo, relPath);
			let fresh = "";
			try {
				fresh = await promises.readFile(file, "utf8");
			} catch {}
			const unchanged = existing && (existing.contentHash === hashText(fresh) || !existing.contentHash && isUnenrichedBody(existing.frontmatter, existing.body));
			if (existing && unchanged) {
				skipped.push({
					path: relPath,
					rel: existing.rel
				});
				continue;
			}
			const result = await this._writeSkeleton(absRoot, file, relPath, {
				repo,
				repoName
			}, hints.get(relPath));
			written.push({
				path: relPath,
				note: result.rel,
				language: result.language,
				error: result.error,
				imports: result.imports
			});
		}
		if (onProgress) onProgress({
			done: files.length,
			total,
			current: "刷新索引…"
		});
		await this.refreshMoc();
		if (onProgress) onProgress({
			done: files.length,
			total,
			current: "完成"
		});
		return {
			repo,
			repoName,
			count: written.length,
			skipped: skipped.length,
			reserved: skipped.map((s) => s.path),
			files: written
		};
	}
	async _writeSkeleton(absRoot, file, relPath, { repo, repoName }, hint = null) {
		const prior = await this.getByPath(repo, relPath);
		try {
			const fresh = await promises.readFile(file, "utf8");
			const isSkeleton = (body) => String(body || "").includes("## 待补充");
			if (prior && (prior.frontmatter.contentHash === hashText(fresh) || !prior.frontmatter.contentHash && isSkeleton(prior.body))) return {
				rel: prior.rel,
				skippedUnchanged: true,
				language: prior.frontmatter.language,
				error: null,
				imports: prior.frontmatter.imports ?? [],
				symbols: prior.frontmatter.symbols ?? [],
				contentHash: prior.frontmatter.contentHash
			};
		} catch {}
		const excerpt = await excerptOf(file, 30);
		const stat = await promises.stat(file).catch(() => null);
		const language = languageOf(relPath);
		const codeBlock = excerpt.error ? `> ⚠️ 读取失败：${excerpt.error}` : "```" + (language === "text" ? "" : language) + "\n" + excerpt.text + "\n```";
		const imports = extractImports(excerpt.text, language);
		const symbols = extractSymbols(excerpt.full, language);
		const depsSection = imports.length ? `\n## 依赖\n\n${imports.map((d) => `- \`${d}\``).join("\n")}\n` : "";
		const symSection = symbols.length ? `\n## 符号\n\n${symbols.map((s) => `- \`${s}\``).join("\n")}\n` : "";
		const body = [
			`## 概览`,
			"",
			`- **路径**：\`${relPath}\``,
			`- **语言**：${language}`,
			`- **行数**：${excerpt.lines}`,
			`- **大小**：${stat?.size ?? 0} 字节`,
			"",
			`## 代码摘录`,
			"",
			codeBlock,
			depsSection,
			symSection,
			`## 待补充`,
			"",
			`> 该页面由 \`cardian.wiki.ingest\` 自动生成。请用 \`cardian.wiki.upsert\` 补充该模块的职责、关键函数与依赖关系。`,
			""
		].join("\n");
		return {
			...await this.writeNote({
				group: repo,
				stem: flattenPath(relPath),
				title: hint?.title || relPath,
				tags: hint?.title ? [
					repoName,
					language,
					"declared"
				] : [repoName, language],
				body,
				extra: {
					path: relPath,
					language,
					summary: hint?.summary || `${excerpt.lines} 行 · ${language}`,
					analysisLevel: "static",
					imports,
					symbols,
					contentHash: excerpt.hash,
					level: normalizeLevel(hint?.level) ?? "file",
					parent: hint?.parent ? String(hint.parent) : null
				}
			}),
			language,
			error: excerpt.error,
			imports,
			symbols,
			contentHash: excerpt.hash
		};
	}
	async skeletonForFile(repoPath, file, relPath, ctx = {}, hint = null) {
		const absRoot = path.resolve(String(repoPath ?? ""));
		this.assertAllowedRoot(absRoot);
		const repo = slugify(ctx.repo ?? ctx.repoName ?? "");
		if (!repo) throw new ValidationError("wiki.skeletonForFile 需要 repo 名称");
		return this._writeSkeleton(absRoot, file, relPath, {
			repo,
			repoName: ctx.repoName ?? repo
		}, hint);
	}
	async sync(repoPath, opts = {}) {
		const absRoot = path.resolve(String(repoPath ?? ""));
		this.assertAllowedRoot(absRoot);
		const repoName = String(opts.repoName ?? path.basename(absRoot) ?? "repo");
		const repo = slugify(repoName);
		const pruneOrphans = opts.pruneOrphans !== false;
		const rawMax = opts.maxFiles == null ? 100 : Number(opts.maxFiles);
		const maxFiles = Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 100;
		const rawList = await scanFiles(absRoot, maxFiles);
		const files = rawList.filter((f) => !pathExcluded(path.relative(absRoot, f), this.excludes));
		const disk = /* @__PURE__ */ new Map();
		for (const file of files) {
			const relPath = path.relative(absRoot, file).split(path.sep).join("/");
			disk.set(relPath, file);
		}
		const pages = (await this.entries()).filter((e) => e.group === repo);
		const pageByPath = new Map(pages.map((p) => [p.frontmatter.path, p]));
		const report = {
			repo,
			repoName,
			added: [],
			changed: [],
			pruned: [],
			preserved: [],
			unchanged: 0
		};
		for (const [relPath, file] of disk) {
			const page = pageByPath.get(relPath);
			if (!page) {
				await this._writeSkeleton(absRoot, file, relPath, {
					repo,
					repoName
				});
				report.added.push(relPath);
				continue;
			}
			const full = await promises.readFile(file, "utf8").catch(() => "");
			if (page.frontmatter.contentHash === hashText(full) || !page.frontmatter.contentHash && isUnenrichedBody(page.frontmatter, page.body)) {
				report.unchanged++;
				continue;
			}
			if (isUnenrichedBody(page.frontmatter, page.body)) {
				await this._writeSkeleton(absRoot, file, relPath, {
					repo,
					repoName
				});
				report.changed.push(relPath);
			} else {
				await this.store._write(page.rel, {
					frontmatter: {
						...page.frontmatter,
						contentHash: hashText(full),
						lastSyncAt: (/* @__PURE__ */ new Date()).toISOString(),
						staleSynced: true
					},
					body: page.body
				});
				report.preserved.push(relPath);
			}
		}
		if (pruneOrphans) {
			if (rawList.length >= maxFiles) report.pruneSkipped = "maxFiles 触顶，跳过孤儿剪枝以免误删";
			else for (const page of pages) {
				const ppath = page.frontmatter.path;
				if (ppath === "__OVERVIEW__" || page.frontmatter.overview) continue;
				if (!isDiskFileCard(page.frontmatter)) continue;
				if (!disk.has(ppath)) {
					await this.store._remove(page.rel);
					report.pruned.push(ppath);
				}
			}
		}
		if (report.added.length || report.changed.length || report.pruned.length || report.preserved.length) await this.refreshMoc();
		return report;
	}
	async overview(repoName) {
		const repo = slugify(repoName);
		if (!repo) throw new ValidationError("wiki.overview 需要 repo 名称");
		const pages = (await this.entries()).filter((e) => e.group === repo && e.frontmatter.path !== "__OVERVIEW__");
		if (!pages.length) throw new NotFoundError("该仓库暂无 Wiki 页，请先 ingest/sync");
		const g = await this.graph(repo);
		const topCalled = Object.entries(g.callers || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
		const dirs = [...new Set(pages.map((p) => String(p.frontmatter.path || "").split("/").slice(0, -1).join("/") || "(根)"))].sort();
		const langs = {};
		for (const p of pages) {
			const l = p.frontmatter.language;
			if (l) langs[l] = (langs[l] || 0) + 1;
		}
		const langTxt = Object.entries(langs).map(([l, n]) => `${l}×${n}`).join(" · ") || "未知";
		const dirTxt = dirs.length <= 12 ? dirs.join(" / ") : dirs.slice(0, 12).join(" / ") + " …";
		const callTxt = topCalled.length ? topCalled.map(([p2, c]) => "- `" + p2 + "` — 被 " + c + " 处引用").join("\n") : "- 暂无跨文件依赖边（可运行 graph 查看 imports 是否解析）";
		const links = pages.map((p) => {
			return `- [[${p.rel.split("/").pop().replace(/\.md$/, "")}|${p.frontmatter.path}]]`;
		}).join("\n");
		const body = [
			"# 项目概览",
			"",
			"> 人读向导航层：先看这里，再按需进入具体模块页。",
			"",
			"## 体量",
			"",
			`- 页面：${pages.length}`,
			`- 语言分布：${langTxt}`,
			`- 目录：${dirTxt}`,
			"",
			"## 核心模块（被引最多）",
			"",
			callTxt,
			"",
			"## 页面清单",
			"",
			links,
			""
		].join("\n");
		return {
			...await this.writeNote({
				group: repo,
				stem: "project-overview",
				title: `${repo} · 项目概览`,
				tags: [repo, "overview"],
				body,
				extra: {
					path: "__OVERVIEW__",
					language: null,
					summary: `人读概览：${pages.length} 页`,
					overview: true
				}
			}),
			pages: pages.length,
			topCalled
		};
	}
	async graph(repoName) {
		const repo = slugify(repoName ?? "");
		if (!repo) throw new ValidationError("wiki.graph 需要 repo 名称");
		const pages = (await this.entries()).filter((e) => e.group === repo);
		const byPath = new Map(pages.filter((p) => p.frontmatter.path).map((p) => [p.frontmatter.path, p]));
		const resolveSpec = (spec) => {
			let s = String(spec).replace(/^[@~]\//, "").replace(/^\.\//, "");
			const tail = s.split("/").pop() ?? "";
			const tailBase = tail.replace(/\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs)$/, "");
			const direct = byPath.get(s.endsWith(tail) ? `${s}${guessExt(s)}` : s);
			if (direct) return direct;
			return [...byPath.values()].find((p) => {
				const base = path.basename(p.frontmatter.path).replace(/\.[^.]+$/, "");
				return base === tailBase || base === spec.split("/").pop()?.replace(/\.[^.]+$/, "");
			}) ?? null;
		};
		const nodes = pages.map((p) => ({
			path: p.frontmatter.path,
			title: p.frontmatter.title,
			symbols: p.frontmatter.symbols ?? [],
			imports: p.frontmatter.imports ?? []
		}));
		const edges = [];
		const inDegree = /* @__PURE__ */ new Map();
		for (const node of nodes) for (const spec of node.imports) {
			const target = resolveSpec(spec);
			if (!target || target.frontmatter.path === node.path) continue;
			edges.push({
				from: node.path,
				to: target.frontmatter.path,
				via: spec
			});
			inDegree.set(target.frontmatter.path, (inDegree.get(target.frontmatter.path) ?? 0) + 1);
		}
		return {
			repo,
			nodes,
			edges,
			callers: Object.fromEntries([...inDegree.entries()].sort())
		};
	}
	async enumerateFiles(repoPath, opts = {}) {
		const absRoot = path.resolve(String(repoPath ?? ""));
		this.assertAllowedRoot(absRoot);
		const repoName = String(opts.repoName ?? path.basename(absRoot) ?? "repo");
		const repo = slugify(repoName);
		const rawMax = opts.maxFiles == null ? 50 : Number(opts.maxFiles);
		const maxFiles = Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 50;
		const excerptLines = Number.isFinite(Number(opts.excerptLines)) && Number(opts.excerptLines) >= 1 ? Math.floor(Number(opts.excerptLines)) : 40;
		const rawList = await scanFiles(absRoot, maxFiles);
		const files = rawList.filter((f) => !pathExcluded(path.relative(absRoot, f), this.excludes));
		const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
		const out = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const relPath = path.relative(absRoot, file).split(path.sep).join("/");
			if (onProgress) onProgress({
				done: i,
				total: files.length,
				current: `发现：${relPath}`
			});
			const language = languageOf(relPath);
			const excerpt = await excerptOf(file, excerptLines);
			const stat = await promises.stat(file).catch(() => null);
			out.push({
				relPath,
				absPath: file,
				language,
				lines: excerpt.lines,
				size: stat?.size ?? 0,
				contentHash: excerpt.hash,
				excerpt: excerpt.text,
				imports: extractImports(excerpt.text, language),
				symbols: extractSymbols(excerpt.full, language),
				error: excerpt.error ?? null
			});
		}
		if (onProgress) onProgress({
			done: files.length,
			total: files.length,
			current: `清单完成：${files.length} 个文件`
		});
		return {
			repo,
			repoName,
			repoPath: absRoot,
			maxFiles,
			truncated: rawList.length >= maxFiles,
			files: out
		};
	}
	async applyHierarchy(repoInput, hierarchy = {}) {
		const repo = slugify(String(repoInput ?? ""));
		if (!repo) throw new ValidationError("wiki.applyHierarchy 需要 repo 名称");
		const overview = hierarchy.overview && typeof hierarchy.overview === "object" ? hierarchy.overview : {};
		const rawModules = Array.isArray(hierarchy.modules) ? hierarchy.modules : [];
		const modules = [];
		const seenSlug = /* @__PURE__ */ new Set();
		for (const m of rawModules) {
			if (!m || typeof m !== "object") continue;
			const title = String(m.title ?? m.id ?? "").trim();
			if (!title) continue;
			let slug = slugify(String(m.id ?? "") || title) || `module-${modules.length + 1}`;
			while (seenSlug.has(slug)) slug = `${slug}-2`;
			seenSlug.add(slug);
			const paths = (Array.isArray(m.paths) ? m.paths : []).map((p) => String(p ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "")).filter((p) => p && p !== ".");
			modules.push({
				slug,
				title,
				summary: String(m.summary ?? "").trim(),
				paths
			});
		}
		const overviewTitle = String(overview.title ?? "").trim() || `${repo} · 项目总览`;
		const overviewSummary = String(overview.summary ?? "").trim();
		const ovBody = [
			`# ${overviewTitle}`,
			"",
			overviewSummary ? `${overviewSummary}\n` : `> 由 cardian AI 扫盘生成的项目总览。\n`,
			"## 模块",
			"",
			...modules.length ? modules.map((m) => `- [[${wikiLinkTarget(m.title)}]]${m.summary ? ` — ${m.summary}` : ""}`) : ["- （本次未识别出明确模块）"],
			"",
			"> 阅读顺序：总览 → 模块 → 文件。层级由 AI 依据目录与依赖关系生成。",
			""
		].join("\n");
		const ov = await this.writeNote({
			group: repo,
			stem: "project-overview",
			title: overviewTitle,
			tags: [
				repo,
				"overview",
				"ai-scan"
			],
			body: ovBody,
			extra: {
				path: "__OVERVIEW__",
				language: null,
				summary: overviewSummary || `AI 扫盘总览：${modules.length} 个模块`,
				level: "project",
				overview: true,
				analysisLevel: "ai"
			}
		});
		const assignments = [];
		const written = [];
		for (const m of modules) {
			const modBody = [
				`# ${m.title}`,
				"",
				m.summary || "> 该模块由 cardian AI 扫盘识别。",
				"",
				"## 负责路径",
				"",
				...m.paths.length ? m.paths.map((p) => `- \`${p}\``) : ["- （未声明具体路径）"],
				""
			].join("\n");
			const res = await this.writeNote({
				group: repo,
				stem: `module-${m.slug}`,
				title: m.title,
				tags: [
					repo,
					"module",
					"ai-scan"
				],
				body: modBody,
				extra: {
					path: `__MODULE__/${m.slug}`,
					language: null,
					summary: m.summary || `模块：${m.title}`,
					level: "module",
					parent: ov.id,
					module: true,
					modulePaths: m.paths.length ? m.paths : null,
					analysisLevel: "ai"
				}
			});
			written.push({
				id: res.id,
				title: m.title,
				slug: m.slug,
				paths: m.paths,
				rel: res.rel
			});
		}
		for (const m of written) for (const p of m.paths) assignments.push({
			pattern: p,
			moduleId: m.id,
			moduleTitle: m.title
		});
		assignments.sort((a, b) => b.pattern.length - a.pattern.length);
		await this.refreshMoc();
		return {
			repo,
			overview: {
				id: ov.id,
				title: overviewTitle,
				rel: ov.rel
			},
			modules: written,
			assignments
		};
	}
	static moduleOwnerOf(assignments, relPath) {
		const p = String(relPath ?? "").replace(/^\/+/, "");
		for (const a of assignments ?? []) {
			const pat = String(a.pattern ?? "");
			if (!pat) continue;
			if (p === pat || p.startsWith(pat + "/")) return a;
		}
		return null;
	}
	async changedSince(repoPath, opts = {}) {
		const listed = await this.enumerateFiles(repoPath, opts);
		const { repo, files, truncated } = listed;
		const pages = (await this.entries()).filter((e) => e.group === repo && isDiskFileCard(e.frontmatter));
		const cardByPath = new Map(pages.map((p) => [p.frontmatter.path, p]));
		const added = [];
		const changed = [];
		const unchanged = [];
		const targets = [];
		for (const f of files) {
			const card = cardByPath.get(f.relPath);
			if (!card) {
				added.push(f.relPath);
				targets.push(f);
				continue;
			}
			const enriched = !isUnenrichedBody(card.frontmatter, card.body);
			if (card.frontmatter.contentHash === f.contentHash) {
				unchanged.push({
					path: f.relPath,
					enriched
				});
				continue;
			}
			changed.push({
				path: f.relPath,
				enriched,
				contentHash: f.contentHash
			});
			targets.push(f);
		}
		const onDisk = new Set(files.map((f) => f.relPath));
		const removed = [...cardByPath.keys()].filter((p) => !onDisk.has(p));
		if (typeof opts.onProgress === "function") opts.onProgress({
			done: files.length,
			total: files.length,
			current: `比对完成：新增 ${added.length} / 变更 ${changed.length} / 删除 ${removed.length}`
		});
		return {
			repo,
			repoName: listed.repoName,
			added,
			changed,
			removed,
			unchanged,
			targets,
			truncated,
			pruneSafe: !truncated
		};
	}
};
const WIKI_LEVELS = /* @__PURE__ */ new Set([
	"project",
	"module",
	"file"
]);
function normalizeLevel(level) {
	const l = String(level ?? "").trim().toLowerCase();
	return WIKI_LEVELS.has(l) ? l : null;
}
function isDiskFileCard(frontmatter) {
	const fm = frontmatter ?? {};
	const p = String(fm.path ?? "");
	if (!p || p === "__OVERVIEW__") return false;
	if (fm.overview === true || fm.module === true) return false;
	if (fm.level === "project" || fm.level === "module") return false;
	return !p.startsWith("__MODULE__");
}
function wikiLinkTarget(title) {
	return String(title ?? "").replace(/\[\[|\]\]/g, "").replace(/[\]\n|]/g, " ").trim();
}
function isUnenrichedBody(frontmatter, body) {
	const fm = frontmatter ?? {};
	if (fm.analysisLevel === "ai" || fm.analysisLevel === "manual") return false;
	return String(body ?? "").includes("## 待补充") || fm.analysisLevel === "static" || fm.ingest === true;
}
function flattenPath(relPath) {
	return relPath.replace(/\.[^.\\/]+$/, "").split(/[/\\]/).filter(Boolean).map(slugify).join("-") || "root";
}
function languageOf(relPath) {
	const base = path.basename(relPath);
	if (CONFIG_NAMES.has(base)) return base === "Dockerfile" ? "dockerfile" : "text";
	return LANG_BY_EXT[path.extname(relPath).toLowerCase()] ?? "text";
}
function stripComments(text) {
	return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").split("\n").map((line) => {
		const t = line.trim();
		const isDirective = /^#\s*(include|define|if|ifdef|ifndef|endif|pragma|import|error|warning|undef|elif|else)\b/.test(t);
		return t.startsWith("#") && !isDirective ? "" : line;
	}).join("\n");
}
function extractImports(text, language) {
	const source = stripComments(text);
	const out = /* @__PURE__ */ new Set();
	const add = (spec) => {
		const s = String(spec ?? "").trim();
		if (s) out.add(s);
	};
	if (language === "go") {
		for (const m of source.matchAll(/\bimport\s+"([^"]+)"/g)) add(m[1]);
		for (const m of source.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) for (const q of m[1].matchAll(/"([^"]+)"/g)) add(q[1]);
	}
	const patterns = [];
	if (language === "python") patterns.push(/\bfrom\s+([\w.]+)\s+import\b/g, /\bimport\s+([\w.]+)/g);
	else if (language === "rust") patterns.push(/\buse\s+([\w:]+(?:::\w+)*)/g);
	else if (language === "java") patterns.push(/\bimport\s+([\w.]+)\s*;/g);
	else if (language === "csharp") patterns.push(/\busing\s+([\w.]+)\s*;/g);
	else if (language === "ruby") patterns.push(/\brequire_relative\s+['"]([^'"]+)['"]/g, /\brequire\s+['"]([^'"]+)['"]/g);
	else if (language === "c" || language === "cpp") patterns.push(/#include\s*[<"]([^>"]+)[>"]/g);
	patterns.push(/(?:from\s*|import\s*|require\s*\(\s*)['"]([^'"]+)['"]/g);
	for (const re of patterns) for (const m of source.matchAll(re)) add(m[1]);
	return [...out];
}
function pathExcluded(rel, excludes) {
	return Array.isArray(excludes) && excludes.some((x) => rel.includes(x));
}
async function scanFiles(dir, maxFiles, excludes) {
	const out = [];
	async function walk(current) {
		if (out.length >= maxFiles) return;
		const entries = await promises.readdir(current, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (out.length >= maxFiles) return;
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
				await walk(path.join(current, entry.name));
			} else if (entry.isFile() && isTextFile(entry.name)) out.push(path.join(current, entry.name));
		}
	}
	await walk(dir);
	return out;
}
function isTextFile(name) {
	return CONFIG_NAMES.has(name) || TEXT_EXTENSIONS.has(path.extname(name).toLowerCase()) || /^readme/i.test(name);
}
async function excerptOf(file, maxLines) {
	try {
		const text = await promises.readFile(file, "utf8");
		const lines = text.split(/\r?\n/);
		return {
			lines: lines.length,
			text: lines.slice(0, maxLines).join("\n"),
			error: null,
			full: text,
			hash: hashText(text)
		};
	} catch (err) {
		return {
			lines: 0,
			text: "",
			error: err?.message ?? String(err),
			full: "",
			hash: hashText("")
		};
	}
}
function hashText(text) {
	return createHash("sha1").update(String(text ?? "")).digest("hex").slice(0, 12);
}
function guessExt(spec) {
	return /\.[a-z]+$/.test(spec) ? "" : ".js";
}
function extractSymbols(text, language = "text") {
	const src = stripComments(text);
	const out = /* @__PURE__ */ new Set();
	const cap = (m) => m && m[1] && out.size < 12 && out.add(m[1]);
	const rules = language === "python" ? [/\bdef\s+([A-Za-z_]\w*)/g, /\bclass\s+([A-Za-z_]\w*)/g] : language === "rust" ? [/\bfn\s+([A-Za-z_]\w*)/g, /\b(?:struct|enum|trait)\s+([A-Za-z_]\w*)/g] : language === "go" ? [/\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/g, /\btype\s+([A-Za-z_]\w*)\s+struct/g] : [
		/\bexport\s+(?:default\s+)?(?:async\s+)?function\s+\*?\s*([A-Za-z_$][\w$]*)/g,
		/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
		/\bexport\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
		/\bexports\.([A-Za-z_$][\w$]*)\s*=/g
	];
	for (const re of rules) {
		let m;
		while (m = re.exec(src)) cap(m);
	}
	return [...out];
}
//#endregion
//#region core/indexer.js
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const K1 = 1.2;
const B = .75;
const NL = String.fromCharCode(10);
function tokenize(text) {
	const tokens = [];
	const s = String(text ?? "").toLowerCase();
	const re = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+|[a-z0-9]+/g;
	let m;
	while (m = re.exec(s)) {
		const seg = m[0];
		if (CJK.test(seg)) {
			if (seg.length === 1) tokens.push(seg);
			for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
			for (const ch of seg) tokens.push(ch);
		} else tokens.push(seg);
	}
	return tokens;
}
function groupOf(rel) {
	const parts = rel.split("/");
	return parts.length > 2 ? parts[1] : null;
}
function parseTime(v) {
	if (v == null) return null;
	const t = Date.parse(String(v));
	return Number.isNaN(t) ? null : t;
}
var Indexer = class {
	constructor(store) {
		this.store = store;
		this.inverted = /* @__PURE__ */ new Map();
		this.docs = /* @__PURE__ */ new Map();
		this.mtimes = /* @__PURE__ */ new Map();
		this.avgLen = 1;
		this.totalLen = 0;
		this.version = -1;
		this._built = false;
	}
	async ensureFresh() {
		const version = this.store.version;
		if (!this._built || this.version !== version) {
			await this.rebuild();
			this.version = this.store.version;
			await this._syncMtimes();
			return;
		}
		await this._catchExternalEdits();
	}
	async rebuild() {
		this.inverted.clear();
		this.docs.clear();
		let totalLen = 0;
		for (const { rel, frontmatter, body } of await this.store.snapshot()) {
			const haystack = [
				frontmatter.title,
				frontmatter.tags?.join(" "),
				body
			].filter(Boolean).join("\n");
			const tf = /* @__PURE__ */ new Map();
			for (const token of tokenize(haystack)) {
				tf.set(token, (tf.get(token) ?? 0) + 1);
				if (!this.inverted.has(token)) this.inverted.set(token, /* @__PURE__ */ new Map());
				this.inverted.get(token).set(rel, (this.inverted.get(token).get(rel) ?? 0) + 1);
			}
			const len = [...tf.values()].reduce((n, c) => n + c, 0);
			totalLen += len;
			this.docs.set(rel, {
				frontmatter,
				haystack,
				len,
				tf
			});
		}
		this.totalLen = totalLen;
		this.avgLen = Math.max(1, totalLen / Math.max(this.docs.size, 1));
		this._built = true;
		return this.docs.size;
	}
	async _catchExternalEdits() {
		const stats = await this.store.fileStats();
		const seen = /* @__PURE__ */ new Set();
		let changed = false;
		for (const { rel, mtimeMs } of stats) {
			seen.add(rel);
			if (this.mtimes.get(rel) === mtimeMs) continue;
			const note = await this.store.read(rel);
			if (!note) continue;
			await this._addDoc(rel, note.frontmatter, note.body, mtimeMs);
			changed = true;
		}
		for (const rel of [...this.docs.keys()]) {
			if (seen.has(rel)) continue;
			this._purge(rel);
			changed = true;
		}
		if (changed) this._recomputeAvgLen();
	}
	async _syncMtimes() {
		this.mtimes.clear();
		for (const { rel, mtimeMs } of await this.store.fileStats()) this.mtimes.set(rel, mtimeMs);
	}
	async _addDoc(rel, frontmatter, body, mtimeMs) {
		this._purge(rel);
		const haystack = this._haystack(frontmatter, body);
		const tf = /* @__PURE__ */ new Map();
		for (const token of tokenize(haystack)) {
			tf.set(token, (tf.get(token) ?? 0) + 1);
			if (!this.inverted.has(token)) this.inverted.set(token, /* @__PURE__ */ new Map());
			this.inverted.get(token).set(rel, (this.inverted.get(token).get(rel) ?? 0) + 1);
		}
		const len = [...tf.values()].reduce((n, c) => n + c, 0);
		this.totalLen += len;
		this.docs.set(rel, {
			frontmatter,
			haystack,
			len,
			tf
		});
		if (mtimeMs != null) this.mtimes.set(rel, mtimeMs);
	}
	_purge(rel) {
		this.mtimes.delete(rel);
		const doc = this.docs.get(rel);
		if (!doc) return;
		if (doc.tf) {
			for (const token of doc.tf.keys()) {
				const postings = this.inverted.get(token);
				if (!postings) continue;
				postings.delete(rel);
				if (postings.size === 0) this.inverted.delete(token);
			}
			this.totalLen -= doc.len ?? 0;
		}
		this.docs.delete(rel);
	}
	_haystack(frontmatter, body) {
		return [
			frontmatter.title,
			frontmatter.tags?.join(" "),
			body
		].filter(Boolean).join(NL);
	}
	_recomputeAvgLen() {
		this.avgLen = Math.max(1, this.totalLen / Math.max(this.docs.size, 1));
	}
	async search(query, opts = {}) {
		await this.ensureFresh();
		const { type = null, group = null, tag = null, topK = 20, newerThan = null, olderThan = null, sortBy = "relevance" } = opts;
		const qTokens = tokenize(query);
		if (qTokens.length === 0) return [];
		const N = Math.max(this.docs.size, 1);
		const scores = /* @__PURE__ */ new Map();
		for (const token of new Set(qTokens)) {
			const postings = this.inverted.get(token);
			if (!postings) continue;
			const idf = Math.log(1 + (N - postings.size + .5) / (postings.size + .5));
			for (const [rel, tf] of postings) {
				const doc = this.docs.get(rel);
				if (!doc) continue;
				if (type && doc.frontmatter.type !== type) continue;
				if (group && groupOf(rel) !== group) continue;
				if (tag && !(doc.frontmatter.tags ?? []).includes(tag)) continue;
				let boost = 1;
				const titleLower = String(doc.frontmatter.title ?? "").toLowerCase();
				const tagsLower = (doc.frontmatter.tags ?? []).map((t) => String(t).toLowerCase());
				if (titleLower.includes(token)) boost = 3;
				else if (tagsLower.some((t) => t === token)) boost = 2;
				const norm = tf * 2.2 / (tf + K1 * (.25 + B * (doc.len / this.avgLen)));
				scores.set(rel, (scores.get(rel) ?? 0) + idf * norm * boost);
			}
		}
		if (scores.size === 0 && !CJK.test(query)) {
			const q = String(query).toLowerCase();
			for (const [rel, doc] of this.docs) {
				if (type && doc.frontmatter.type !== type) continue;
				if (group && groupOf(rel) !== group) continue;
				if (tag && !(doc.frontmatter.tags ?? []).includes(tag)) continue;
				if (doc.haystack.toLowerCase().includes(q)) scores.set(rel, 1);
			}
		}
		const newerT = parseTime(newerThan);
		const olderT = parseTime(olderThan);
		let results = [];
		for (const [rel, score] of scores.entries()) {
			const doc = this.docs.get(rel);
			if (!doc) continue;
			const updated = parseTime(doc.frontmatter.updated);
			if (newerT != null && (updated == null || updated < newerT)) continue;
			if (olderT != null && (updated == null || updated > olderT)) continue;
			results.push(summary(doc, rel, score));
		}
		if (sortBy === "freshness") results.sort((a, b) => (parseTime(b.updated) ?? 0) - (parseTime(a.updated) ?? 0) || b.score - a.score);
		else results.sort((a, b) => b.score - a.score);
		return results.slice(0, topK);
	}
	async tagCloud(opts = {}) {
		await this.ensureFresh();
		const counts = /* @__PURE__ */ new Map();
		for (const [rel, doc] of this.docs) {
			if (opts.type && doc.frontmatter.type !== opts.type) continue;
			if (opts.group && groupOf(rel) !== opts.group) continue;
			for (const tag of doc.frontmatter.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
		return [...counts.entries()].map(([tag, count]) => ({
			tag,
			count
		})).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
	}
};
function summary(doc, rel, score) {
	const fm = doc.frontmatter;
	return {
		path: rel,
		id: fm.id,
		title: fm.title,
		type: fm.type,
		group: groupOf(rel),
		tags: fm.tags ?? [],
		updated: fm.updated,
		score: Math.round(score * 1e3) / 1e3
	};
}
//#endregion
//#region core/embedder.js
function fnv1a(str) {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function charNgrams(text, n) {
	const s = String(text ?? "").toLowerCase().replace(/\s+/g, " ");
	const out = [];
	for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n));
	return out;
}
function l2normalize(vec) {
	let sum = 0;
	for (const x of vec) sum += x * x;
	const len = Math.sqrt(sum) || 1;
	const out = new Float32Array(vec.length);
	for (let i = 0; i < vec.length; i++) out[i] = vec[i] / len;
	return out;
}
function cosine(a, b) {
	const n = Math.min(a.length, b.length);
	let dot = 0;
	for (let i = 0; i < n; i++) dot += a[i] * b[i];
	return dot;
}
var HashEmbedder = class {
	constructor(opts = {}) {
		this.dim = opts.dim ?? 256;
		this.ngrams = opts.ngrams ?? [
			1,
			2,
			3
		];
	}
	embed(text) {
		const vec = new Float32Array(this.dim);
		for (const n of this.ngrams) for (const gram of charNgrams(text, n)) vec[fnv1a(gram) % this.dim] += 1;
		return l2normalize(vec);
	}
	similarity(a, b) {
		return cosine(a, b);
	}
};
//#endregion
//#region core/links.js
function stripCode(text) {
	return String(text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}
function extractWikilinks(body) {
	const out = [];
	const re = /\[\[([^\]\n]+)\]\]/g;
	let m;
	while (m = re.exec(stripCode(body))) {
		const target = m[1].split("|")[0].split("#")[0].trim();
		if (target) out.push(target);
	}
	return [...new Set(out)];
}
var LinkIndex = class {
	constructor(store) {
		this.store = store;
	}
	async outgoing(rel) {
		const note = await this.store.read(rel);
		return note ? extractWikilinks(note.body) : [];
	}
	async _resolveTarget(target) {
		const want = slugify(target);
		return (await this.store.snapshot()).find((n) => {
			return slugify(n.rel.split("/").pop().replace(/\.md$/, "")) === want || slugify(n.frontmatter.title) === want || (n.frontmatter.aliases ?? []).some((a) => slugify(String(a)) === want);
		}) ?? null;
	}
	async backlinks(rel) {
		const notes = await this.store.snapshot();
		const parts = rel.split("/");
		const stem = parts[parts.length - 1].replace(/\.md$/, "");
		const target = notes.find((n) => n.rel === rel);
		const want = /* @__PURE__ */ new Set([slugify(stem)]);
		if (target?.frontmatter.title) want.add(slugify(target.frontmatter.title));
		for (const alias of target?.frontmatter.aliases ?? []) want.add(slugify(String(alias)));
		const hits = [];
		for (const note of notes) {
			if (note.rel === rel) continue;
			if (extractWikilinks(note.body).some((t) => want.has(slugify(t)))) hits.push({
				path: note.rel,
				title: note.frontmatter.title ?? note.rel,
				type: note.frontmatter.type
			});
		}
		return hits;
	}
	async related(rel, { max = 10 } = {}) {
		const note = await this.store.read(rel);
		if (!note) return [];
		const out = [];
		for (const raw of note.frontmatter.relations ?? []) {
			const text = String(raw);
			const verb = text.replace(/\[\[[^\]]*\]\]/g, "").trim() || "related";
			for (const target of extractWikilinks(text)) {
				const resolved = await this._resolveTarget(target);
				if (resolved && resolved.rel !== rel && !out.some((o) => o.path === resolved.rel)) out.push({
					path: resolved.rel,
					title: resolved.frontmatter.title ?? resolved.rel,
					type: resolved.frontmatter.type,
					relation: verb
				});
			}
		}
		if (out.length < max) {
			const tags = new Set(note.frontmatter.tags ?? []);
			if (tags.size > 0) {
				const notes = await this.store.snapshot();
				const scored = [];
				for (const other of notes) {
					if (other.rel === rel) continue;
					const overlap = (other.frontmatter.tags ?? []).filter((t) => tags.has(t)).length;
					if (overlap > 0) scored.push({
						path: other.rel,
						title: other.frontmatter.title ?? other.rel,
						type: other.frontmatter.type,
						sharedTags: overlap
					});
				}
				scored.sort((a, b) => b.sharedTags - a.sharedTags);
				for (const s of scored) {
					if (out.length >= max) break;
					if (!out.some((o) => o.path === s.path)) out.push({
						...s,
						relation: "shared-tag"
					});
				}
			}
		}
		return out.slice(0, max);
	}
};
//#endregion
//#region core/sync.js
var Sync = class {
	constructor({ store, cards, memory, wiki }) {
		this.store = store;
		this.cards = cards;
		this.memory = memory;
		this.wiki = wiki;
	}
	async exportJson() {
		const notes = await this.store.snapshot();
		return {
			format: "cardian-vault",
			version: 1,
			exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
			count: notes.length,
			notes: notes.map(({ rel, frontmatter, body }) => ({
				rel,
				frontmatter,
				body
			}))
		};
	}
	async importJson(data) {
		const notes = Array.isArray(data?.notes) ? data.notes : null;
		if (!notes) throw new ValidationError("无效的导出：缺少 notes 数组");
		const sectionPrefixes = Object.values(SECTIONS).map((d) => `${d}/`);
		for (const item of notes) {
			if (!item?.rel || typeof item.rel !== "string") throw new ValidationError("导入条目缺少 rel");
			if (item.rel.includes("..") || item.rel.includes("\\") || item.rel.startsWith("/")) throw new ValidationError(`非法的 rel 路径: ${item.rel}`);
			if (!sectionPrefixes.some((p) => item.rel.startsWith(p))) throw new ValidationError(`rel 不在已知分区内: ${item.rel}`);
			if (!item.frontmatter || typeof item.frontmatter !== "object") throw new ValidationError(`导入条目缺少 frontmatter: ${item.rel}`);
		}
		let imported = 0;
		for (const item of notes) {
			await this.store.write(item.rel, {
				frontmatter: item.frontmatter,
				body: item.body ?? ""
			});
			imported++;
		}
		await this.refresh();
		return { imported };
	}
	async importMarkdownFolder(dir, opts = {}) {
		const category = String(opts.category ?? "imported");
		const absDir = path.resolve(String(dir ?? ""));
		this._assertImportRoot(absDir);
		const files = await collectMarkdown(absDir);
		const imported = [];
		for (const file of files) {
			const { frontmatter, body } = parseFrontmatter(await promises.readFile(file, "utf8"));
			if (!body.trim()) continue;
			const title = frontmatter.title || path.basename(file, path.extname(file));
			if (frontmatter.type === "memory") imported.push(await this.memory.upsert({
				title,
				content: body.trim() || frontmatter.content || "",
				tags: frontmatter.tags,
				scope: frontmatter.scope,
				facts: frontmatter.facts,
				importance: frontmatter.importance
			}));
			else if (frontmatter.type === "wiki") imported.push(await this.wiki.upsert({
				repo: frontmatter.repo ?? opts.repo ?? "imported",
				path: frontmatter.path ?? path.basename(file, path.extname(file)),
				content: body.trim() || "",
				tags: frontmatter.tags,
				summary: frontmatter.summary,
				language: frontmatter.language
			}));
			else imported.push(await this.cards.upsert({
				title,
				content: body.trim() || "",
				tags: frontmatter.tags,
				category: frontmatter.category ?? category,
				source: frontmatter.source
			}));
		}
		return {
			count: imported.length,
			imported
		};
	}
	_assertImportRoot(absDir) {
		const roots = this.wiki?.allowedRoots ?? [];
		if (roots.length === 0) return;
		if (!roots.some((root) => absDir === root || absDir.startsWith(root + path.sep))) throw new ValidationError(`导入目录不在 allowedRoots 白名单内：${absDir}`, { suggestion: "在 cardian 配置的 allowedRoots 中加入该目录，或移除限制" });
	}
	async refresh() {
		await Promise.all([
			this.cards.refreshMoc(),
			this.memory.refreshMoc(),
			this.wiki.refreshMoc()
		]);
	}
};
async function collectMarkdown(dir, out = []) {
	let entries;
	try {
		entries = await promises.readdir(dir, { withFileTypes: true });
	} catch (err) {
		if (err.code === "ENOENT") return out;
		throw err;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) await collectMarkdown(p, out);
		else if (entry.name.endsWith(".md")) out.push(p);
	}
	return out;
}
//#endregion
//#region core/config.js
function coerceBool(value, fallback, name) {
	if (value === void 0 || value === null) return fallback;
	if (typeof value === "boolean") return value;
	if (value === "true" || value === 1) return true;
	if (value === "false" || value === 0) return false;
	throw new ConfigError(`${name} 必须是布尔值`);
}
function resolveConfig(raw = {}) {
	const vaultPath = raw.vaultPath ?? "./cardian-vault";
	if (typeof vaultPath !== "string" || !vaultPath.trim()) throw new ConfigError("vaultPath 必须是非空字符串");
	const autoInit = coerceBool(raw.autoInit, true, "autoInit");
	const semanticSearch = coerceBool(raw.semanticSearch, true, "semanticSearch");
	const watchVault = coerceBool(raw.watchVault, true, "watchVault");
	let searchAlpha = raw.searchAlpha === void 0 ? .5 : Number(raw.searchAlpha);
	if (!Number.isFinite(searchAlpha)) throw new ConfigError("searchAlpha 必须是数字");
	searchAlpha = Math.min(1, Math.max(0, searchAlpha));
	let embedderDim = raw.embedderDim === void 0 ? 256 : Number(raw.embedderDim);
	if (!Number.isInteger(embedderDim) || embedderDim <= 0) throw new ConfigError("embedderDim 必须是正整数");
	const _ar = Array.isArray(raw.allowedRoots) ? raw.allowedRoots.map((r) => String(r)).filter(Boolean) : [];
	const trackUsage = coerceBool(raw.trackUsage, true, "trackUsage");
	const rawExcludes = Array.isArray(raw.excludes) ? raw.excludes.map((r) => String(r)).filter(Boolean) : [];
	const maxNoteChars = Number.isFinite(Number(raw.limits?.maxNoteChars)) ? Math.max(0, Math.floor(Number(raw.limits.maxNoteChars))) : 0;
	const maxNotesPerSection = Number.isFinite(Number(raw.limits?.maxNotesPerSection)) ? Math.max(0, Math.floor(Number(raw.limits.maxNotesPerSection))) : 0;
	const rawTimeout = Number(raw.backfillTimeoutMs);
	return {
		vaultPath,
		autoInit,
		semanticSearch,
		watchVault,
		searchAlpha,
		embedderDim,
		allowedRoots: _ar,
		trackUsage,
		excludes: rawExcludes,
		backfillTimeoutMs: Number.isFinite(rawTimeout) && rawTimeout >= 1e4 ? Math.floor(rawTimeout) : 3e5,
		excludes: rawExcludes,
		limits: {
			maxNoteChars,
			maxNotesPerSection
		}
	};
}
//#endregion
//#region core/log.js
const LEVELS = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
	silent: 99
};
function createLogger(opts = {}) {
	const threshold = LEVELS[opts.level ?? "info"] ?? LEVELS.info;
	const stream = opts.stream ?? process.stderr;
	const format = opts.format ?? "text";
	function emit(level, message, extra) {
		if (LEVELS[level] < threshold) return;
		if (format === "json") stream.write(JSON.stringify({
			level,
			time: (/* @__PURE__ */ new Date()).toISOString(),
			msg: message,
			...extra ?? {}
		}) + "\n");
		else stream.write(`[cardian:${level}] ${message}\n`);
	}
	return {
		debug: (m, e) => emit("debug", m, e),
		info: (m, e) => emit("info", m, e),
		warn: (m, e) => emit("warn", m, e),
		error: (m, e) => emit("error", m, e)
	};
}
createLogger({ level: "silent" });
//#endregion
//#region core/index.js
function createCardian(options = {}) {
	const config = resolveConfig(options);
	const logger = options.logger ?? createLogger({ level: process.env.CARDian_LOG_LEVEL });
	const store = new VaultStore(config.vaultPath, { logger });
	const indexer = new Indexer(store);
	const embedder = options.embedder ?? new HashEmbedder({ dim: config.embedderDim });
	const cards = new CardsService(store, {
		indexer,
		limits: config.limits
	});
	const memory = new MemoryService(store, {
		indexer,
		limits: config.limits
	});
	const wiki = new RepoWikiService(store, {
		indexer,
		allowedRoots: config.allowedRoots,
		excludes: config.excludes
	});
	const links = new LinkIndex(store);
	const sync = new Sync({
		store,
		cards,
		memory,
		wiki
	});
	const searchDefaults = {
		semantic: config.semanticSearch,
		alpha: config.searchAlpha,
		topK: 20,
		...options.search ?? {}
	};
	const sectionRoutes = {
		cards: {
			title: "知识卡片",
			service: () => cards
		},
		memory: {
			title: "记忆",
			service: () => memory
		},
		wiki: {
			title: "RepoWiki",
			service: () => wiki
		}
	};
	function sectionRoute(key) {
		const route = sectionRoutes[String(key ?? "").toLowerCase()];
		if (!route) throw new ValidationError(`未知分区: ${key}（可选: cards / memory / wiki）`);
		return route;
	}
	function sectionEntry(e) {
		if (!e || typeof e !== "object") return null;
		const fm = e.frontmatter ?? {};
		return {
			rel: e.rel ?? e.path ?? null,
			id: e.id ?? fm.id ?? null,
			title: e.title ?? fm.title ?? "(无标题)",
			group: e.group ?? fm.group ?? fm.scope ?? fm.category ?? fm.repo ?? null,
			tags: e.tags ?? fm.tags ?? [],
			status: e.status ?? fm.status ?? "published",
			type: e.type ?? fm.type ?? null,
			updated: e.updated ?? fm.updated ?? null,
			path: fm.path ?? e.path ?? null,
			level: e.level ?? fm.level ?? null,
			parent: e.parent ?? fm.parent ?? null,
			analysisLevel: e.analysisLevel ?? fm.analysisLevel ?? null,
			...e.score != null ? { score: e.score } : {}
		};
	}
	return {
		name: "cardian",
		config,
		logger,
		store,
		indexer,
		embedder,
		cards,
		memory,
		wiki,
		links,
		sync,
		async init() {
			await store.init();
			await this.refreshAll();
		},
		async refreshAll() {
			await Promise.all([
				cards.refreshMoc(),
				memory.refreshMoc(),
				wiki.refreshMoc()
			]);
		},
		async search(query, opts = {}) {
			const type = opts.type ?? null;
			const group = opts.group ? slugify(opts.group) : null;
			const tag = opts.tag ?? null;
			const topK = opts.topK ?? searchDefaults.topK;
			const semantic = opts.semantic ?? searchDefaults.semantic;
			const alpha = opts.alpha ?? searchDefaults.alpha;
			const kw = await indexer.search(query, {
				type,
				group,
				tag,
				topK: Math.max(topK * 3, 20)
			});
			if (!semantic || kw.length === 0) return (await this._expandWikiGraph(kw, topK, opts.graphExpand !== false)).sort((a, b) => b.score - a.score).slice(0, topK);
			const qv = embedder.embed(query);
			const maxKw = Math.max(...kw.map((r) => r.score), 1);
			const merged = kw.map((r) => {
				const doc = indexer.docs.get(r.path);
				const sim = cosine(qv, embedder.embed(doc?.haystack ?? ""));
				const kwNorm = r.score / maxKw;
				return {
					...r,
					keyword: Math.round(kwNorm * 1e3) / 1e3,
					semantic: Math.round(sim * 1e3) / 1e3,
					score: Math.round((alpha * kwNorm + (1 - alpha) * sim) * 1e3) / 1e3
				};
			});
			return (await this._expandWikiGraph(merged, topK, opts.graphExpand !== false)).sort((a, b) => b.score - a.score).slice(0, topK);
		},
		async _expandWikiGraph(list, limit, enabled) {
			if (enabled === false || !Array.isArray(list)) return list;
			try {
				const allWiki = (await wiki.entries()).filter((e) => String(e.frontmatter.path || "") !== "");
				const wPages = allWiki.filter((e) => Array.isArray(e.frontmatter.imports) && e.frontmatter.imports.length);
				if (!wPages.length) return list;
				const byBase = /* @__PURE__ */ new Map();
				for (const p of allWiki) {
					const base = String(p.frontmatter.path || "").split("/").pop().replace(/\.[^.]+$/, "");
					byBase.set(base, p);
				}
				const seen = new Set(list.map((m) => m.path));
				const extras = [];
				for (const row of list) {
					if (row.type !== "wiki") continue;
					const src = wPages.find((p) => p.rel === row.path);
					if (!src) continue;
					for (const spec of src.frontmatter.imports) {
						const base = String(spec).split("/").pop().replace(/\.[^.]+$/, "");
						const tgt = byBase.get(base);
						if (tgt && !seen.has(tgt.rel)) {
							seen.add(tgt.rel);
							extras.push({
								path: tgt.rel,
								title: tgt.frontmatter.title,
								type: "wiki",
								group: tgt.group,
								tags: tgt.frontmatter.tags || [],
								updated: tgt.frontmatter.updated,
								score: row.score * .25,
								viaGraph: spec
							});
						}
					}
				}
				for (const cand of allWiki) {
					if (seen.has(cand.rel)) continue;
					const base = String(cand.frontmatter.path || "").split("/").pop().replace(/\.[^.]+$/, "");
					if ((cand.frontmatter.imports || []).some((spc) => String(spc).includes(base))) {
						seen.add(cand.rel);
						extras.push({
							path: cand.rel,
							title: cand.frontmatter.title,
							type: "wiki",
							group: cand.group,
							tags: cand.frontmatter.tags || [],
							updated: cand.frontmatter.updated,
							score: (list[0]?.score ?? 1) * .2,
							viaGraph: `${cand.frontmatter.path} -> ${base}`
						});
					}
				}
				return [...list, ...extras.slice(0, limit)];
			} catch {}
			return list;
		},
		async recall(query, opts = {}) {
			const { scope = null, type = null, topK = 4, minConfidence = null } = opts;
			const results = await this.search(query, {
				type,
				topK: Math.max(topK * 4, 20),
				semantic: opts.semantic ?? searchDefaults.semantic,
				alpha: opts.alpha ?? searchDefaults.alpha
			});
			const now = Date.now();
			const maxRaw = Math.max(...results.map((r) => r.score), 1);
			const scored = [];
			for (const r of results) {
				const fm = this.indexer.docs.get(r.path)?.frontmatter ?? {};
				if (scope && r.type === "memory" && slugify(fm.scope) !== slugify(scope)) continue;
				const confidence = fm.confidence != null ? Number(fm.confidence) : null;
				if (minConfidence != null && (confidence == null || confidence < minConfidence)) continue;
				const importance = Number(fm.importance) || 0;
				const confidenceNum = confidence != null ? Number(confidence) : 0;
				let boost = importance * .1 + confidenceNum * .1 + Math.min(.1, (Number(fm.hits) || 0) * .01);
				if (fm.updated) {
					const ageDays = (now - Date.parse(fm.updated)) / 864e5;
					if (Number.isFinite(ageDays)) boost += Math.max(0, 1 - ageDays / 90) * .1;
				}
				const rawNorm = r.score / maxRaw;
				let excerptText = "";
				try {
					const d = this.indexer.docs.get(r.path);
					const hs = String(d?.haystack ?? "");
					const i = hs.toLowerCase().indexOf(String(query).toLowerCase());
					excerptText = i >= 0 ? hs.slice(Math.max(0, i - 60), i + 200) : hs.slice(0, 180);
				} catch {}
				scored.push({
					...r,
					importance,
					confidence,
					excerpt: excerptText,
					score: Math.round((rawNorm + boost) * 1e3) / 1e3
				});
			}
			scored.sort((a, b) => b.score - a.score);
			const results2 = scored.slice(0, topK);
			const pending = [];
			for (const r of results2) {
				if (this.config.trackUsage === false) continue;
				pending.push(store.read(r.path).then((note) => {
					if (!note) return;
					const fm = note.frontmatter ?? {};
					return this.store._write(r.path, {
						frontmatter: {
							...fm,
							hits: (Number(fm.hits) || 0) + 1,
							lastRecalledAt: (/* @__PURE__ */ new Date()).toISOString()
						},
						body: note.body
					});
				}).catch(() => {}));
			}
			this._usageWrites = (this._usageWrites ?? []).concat(pending);
			return {
				query,
				count: results2.length,
				results: results2
			};
		},
		async flushUsage() {
			await Promise.allSettled(this._usageWrites ?? []);
			this._usageWrites = [];
		},
		async tagCloud(opts = {}) {
			return indexer.tagCloud(opts);
		},
		async resolveRef(ref) {
			const needle = String(ref ?? "").trim();
			if (!needle) return null;
			const needleSlug = slugify(needle);
			return (await store.snapshot()).find((n) => {
				const stem = n.rel.split("/").pop().replace(/\.md$/, "");
				const aliases = n.frontmatter.aliases ?? [];
				return n.frontmatter.id === needle || n.frontmatter.title === needle || slugify(stem) === needleSlug || slugify(n.frontmatter.title) === needleSlug || aliases.some((a) => String(a) === needle || slugify(String(a)) === needleSlug);
			}) ?? null;
		},
		async backlinks(ref) {
			const note = await this.resolveRef(ref);
			if (!note) return [];
			return links.backlinks(note.rel);
		},
		async related(ref, opts = {}) {
			const note = await this.resolveRef(ref);
			if (!note) return [];
			return links.related(note.rel, opts);
		},
		async status() {
			const repos = await wiki.listRepos();
			const now = Date.now();
			let stale = 0;
			for (const n of await store.snapshot()) if (n.frontmatter.expires && Date.parse(n.frontmatter.expires) < now) stale++;
			return {
				vaultPath: store.root,
				sections: {
					wiki: (await wiki.list()).length,
					cards: (await cards.list()).length,
					memory: (await memory.list()).length
				},
				repos,
				stale
			};
		},
		async reindex() {
			await indexer.rebuild();
			return { indexed: indexer.docs.size };
		},
		async doctor() {
			const problems = [];
			for (const dir of Object.values(SECTIONS)) if (!await store.exists(`${dir}/README.md`)) problems.push({
				level: "error",
				path: `${dir}/README.md`,
				issue: "缺少 MOC 索引"
			});
			for (const rel of await store.tmpFiles()) problems.push({
				level: "error",
				path: rel,
				issue: "孤儿临时文件（崩溃残留）"
			});
			const now = Date.now();
			for (const n of await store.snapshot()) {
				const fm = n.frontmatter;
				if (!fm.id) problems.push({
					level: "error",
					path: n.rel,
					issue: "缺少 id"
				});
				if (!fm.type) problems.push({
					level: "error",
					path: n.rel,
					issue: "缺少 type"
				});
				if (!fm.title) problems.push({
					level: "warn",
					path: n.rel,
					issue: "缺少 title"
				});
				if (fm.expires) {
					const t = Date.parse(String(fm.expires));
					if (Number.isNaN(t)) problems.push({
						level: "warn",
						path: n.rel,
						issue: "expires 不是有效日期"
					});
					else if (t < now) problems.push({
						level: "info",
						path: n.rel,
						issue: "已过期"
					});
				}
			}
			const seenTitle = /* @__PURE__ */ new Map();
			for (const n of await store.snapshot()) {
				const key = `${slugify(n.frontmatter.title)}|${n.rel.split("/")[1]}`;
				seenTitle.set(key, (seenTitle.get(key) ?? 0) + 1);
			}
			for (const [k, c] of seenTitle) if (c > 1) {
				const t2g = k.split("|");
				problems.push({
					level: "warn",
					issue: `疑似重复条目：${t2g[0]} 在同分区出现 ${c} 次（建议合并或区分命名）`
				});
			}
			const errors = problems.filter((p) => p.level === "error").length;
			return {
				healthy: errors === 0,
				errors,
				problemCount: problems.length,
				problems
			};
		},
		async schema() {
			const notes = await store.snapshot();
			const fields = /* @__PURE__ */ new Map();
			for (const n of notes) for (const key of Object.keys(n.frontmatter)) {
				if (!fields.has(key)) fields.set(key, /* @__PURE__ */ new Set());
				const v = n.frontmatter[key];
				fields.get(key).add(v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
			}
			return [...fields.entries()].map(([field, types]) => ({
				field,
				types: [...types].sort()
			})).sort((a, b) => a.field.localeCompare(b.field));
		},
		async feedback(ref, kind = "correction", text = "") {
			for (const svc of [
				cards,
				memory,
				wiki
			]) if (await svc.find(ref)) return {
				...await svc.annotate(ref, kind, text),
				section: svc.opts.type
			};
			return null;
		},
		async exportSkill({ name = "skill", description = "", refs = [], section = null, group = null, limit = 20 } = {}) {
			const picked = [];
			for (const ref of refs) {
				const n = await this.resolveRef(ref);
				if (n && !picked.some((p2) => p2.rel === n.rel)) picked.push(n);
			}
			if (!picked.length) {
				const pools = [
					["cards", cards],
					["memory", memory],
					["wiki", wiki]
				];
				for (const [key, svc] of pools) {
					if (section && key !== section) continue;
					for (const e of await svc.list({ group })) {
						if (picked.length >= limit) break;
						const note = await store.read(e.rel);
						if (note) picked.push({
							rel: e.rel,
							frontmatter: note.frontmatter,
							body: note.body
						});
					}
					if (picked.length >= limit) break;
				}
			}
			if (!picked.length) throw new ValidationError("没有可圈定的知识条目");
			const slug = slugify(name);
			const dir = `Skills/${slug}`;
			const links = [];
			let i = 0;
			for (const n of picked) {
				const stem = (slugify(n.frontmatter.title) || "note") + "-" + ++i;
				const fm = Object.fromEntries(Object.entries(n.frontmatter).filter(([k]) => k !== "corrections" && k !== "history"));
				await store.write(`${dir}/notes/${stem}.md`, {
					frontmatter: fm,
					body: n.body
				});
				links.push(`- [${n.frontmatter.title}](./notes/${stem}.md)`);
			}
			const desc = String(description || `包含 ${links.length} 条知识的复用单元`);
			const body = [
				"---",
				`name: ${slug}`,
				`description: ${desc}`,
				"source: cardian-knowledge-tree",
				"---",
				"",
				`# ${name}`,
				"",
				`从知识树圈定 ${links.length} 条笔记，作为可复用的工作流单元。`,
				"",
				...links,
				""
			].join("\n");
			await store.write(`${dir}/SKILL.md`, {
				frontmatter: {},
				body
			});
			return {
				skill: dir,
				entries: links.length
			};
		},
		async describe() {
			const [cardsList, memList, wikiList, repos] = await Promise.all([
				cards.list(),
				memory.list(),
				wiki.list(),
				wiki.listRepos()
			]);
			return {
				vaultPath: store.root,
				sections: [
					{
						key: "cards",
						title: "知识卡片",
						count: cardsList.length,
						entries: cardsList
					},
					{
						key: "memory",
						title: "记忆",
						count: memList.length,
						entries: memList
					},
					{
						key: "wiki",
						title: "RepoWiki",
						count: wikiList.length,
						repos,
						entries: wikiList
					}
				]
			};
		},
		async sectionList(params = {}) {
			const route = sectionRoute(params.key);
			const svc = route.service();
			const query = String(params.query ?? "").trim();
			const opts = {
				group: params.group ? String(params.group) : null,
				tag: params.tag ? String(params.tag) : null,
				status: params.status ? String(params.status) : null,
				topK: params.topK ?? 200
			};
			const items = query ? await svc.search(query, opts) : await svc.list(opts);
			const out = {
				key: params.key,
				title: route.title,
				count: items.length,
				entries: items.map(sectionEntry).filter(Boolean)
			};
			if (params.key === "wiki") out.repos = await wiki.listRepos();
			return out;
		},
		async sectionGet(params = {}) {
			const route = sectionRoute(params.key);
			const note = await route.service().get(params.ref, params.group ?? null);
			if (!note) throw new NotFoundError(`${route.title}不存在: ${params.ref}`);
			return {
				...note,
				section: params.key
			};
		},
		async sectionUpsert(params = {}) {
			return sectionRoute(params.key).service().upsert(params.args ?? {});
		},
		async sectionRemove(params = {}) {
			return sectionRoute(params.key).service().remove(params.ref, params.group ?? null);
		},
		async exportJson() {
			return sync.exportJson();
		},
		async importJson(data) {
			return sync.importJson(data);
		},
		async importMarkdownFolder(dir, opts = {}) {
			return sync.importMarkdownFolder(dir, opts);
		}
	};
}
//#endregion
//#region src/tools.js
const str = (description) => ({
	type: "string",
	description,
	required: true
});
const strOpt = (description) => ({
	type: "string",
	description,
	required: false
});
const arrOpt = (description) => ({
	type: "array",
	items: { type: "string" },
	description,
	required: false
});
const numOpt = (description) => ({
	type: "number",
	description,
	required: false
});
const boolOpt = (description) => ({
	type: "boolean",
	description,
	required: false
});
function params(props, required = []) {
	const properties = {};
	for (const [key, value] of Object.entries(props)) properties[key] = value;
	return {
		type: "object",
		properties,
		required
	};
}
function register(ctx, key, def) {
	if (!ctx.tools || typeof ctx.tools.register !== "function") return;
	const { behavior, execute, ...rest } = def;
	const wrapped = async (rawArgs) => {
		try {
			const args = rawArgs ?? {};
			const missing = (def.parameters?.required ?? []).filter((r) => args[r] === void 0 || args[r] === null || args[r] === "");
			if (missing.length) throw new ValidationError(`缺少必填参数: ${missing.join(", ")}`);
			return await execute(args);
		} catch (err) {
			return toErrorPayload(err);
		}
	};
	ctx.tools.register({
		...rest,
		name: key,
		behavior,
		readOnly: behavior === "read",
		idempotent: behavior === "read" || behavior === "idempotent" || behavior === "destroy",
		destructive: behavior === "destroy",
		output: {
			schema: {},
			render: (_args, value) => [{
				type: "text",
				text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
			}]
		},
		execute: wrapped
	});
}
const SECTION_TYPE = {
	wiki: "wiki",
	cards: "card",
	memory: "memory"
};
function registerTools(ctx, cardian) {
	const { cards, memory, wiki } = cardian;
	register(ctx, "cardian.status", {
		name: "cardian.status",
		description: "查看知识中心(cardian)状态：Obsidian 仓库路径、三大功能(RepoWiki/知识卡片/记忆)的条目数与仓库列表、过期笔记数。",
		behavior: "read",
		parameters: params({}),
		async execute() {
			return cardian.status();
		}
	});
	register(ctx, "cardian.reindex", {
		name: "cardian.reindex",
		description: "强制重建检索索引（在 Obsidian 里手工编辑笔记后调用以刷新搜索结果）。",
		behavior: "idempotent",
		parameters: params({}),
		async execute() {
			return cardian.reindex();
		}
	});
	register(ctx, "cardian.wiki.overview", {
		name: "cardian.wiki.overview",
		description: "为人读者生成/刷新某仓库的项目级概览页（体量、目录、语言分布、核心模块被引排行、页面清单）。",
		behavior: "idempotent",
		parameters: params({ repo: str("仓库名称") }, ["repo"]),
		async execute(args) {
			return wiki.overview(args.repo);
		}
	});
	register(ctx, "cardian.memory.promote", {
		name: "cardian.memory.promote",
		description: "把一条长期记忆晋升到仓库根 PROJECT.md 本地说明文件（评审式记忆治理）。",
		behavior: "idempotent",
		parameters: params({
			ref: str("记忆 id / 标题 / slug"),
			target: strOpt("shared | local")
		}, ["ref"]),
		async execute(args) {
			return memory.promote(args.ref, { target: args.target ?? "shared" });
		}
	});
	register(ctx, "cardian.wiki.sync", {
		name: "cardian.wiki.sync",
		description: "以磁盘为准双向同步指定仓库的 RepoWiki：新增生成骨架、变更重建骨架（语义回填卡只刷指纹并标 staleSynced）、剪除孤儿页。",
		behavior: "idempotent",
		parameters: params({
			repoPath: str("本地仓库绝对/相对路径"),
			repoName: strOpt("仓库名称（默认取目录名）"),
			pruneOrphans: boolOpt("是否剪除孤儿页（默认 true）"),
			maxFiles: numOpt("最多扫描文件数（默认 100）")
		}, ["repoPath"]),
		async execute(args) {
			return wiki.sync(args.repoPath, {
				repoName: args.repoName,
				pruneOrphans: args.pruneOrphans !== false,
				maxFiles: args.maxFiles
			});
		}
	});
	register(ctx, "cardian.wiki.graph", {
		name: "cardian.wiki.graph",
		description: "返回某仓库的代码图谱：节点（页面+导出符号）与依赖边（import 关系），含每个模块的被引计数。",
		behavior: "read",
		parameters: params({ repo: str("仓库名称") }, ["repo"]),
		async execute(args) {
			return wiki.graph(args.repo);
		}
	});
	register(ctx, "cardian.feedback", {
		name: "cardian.feedback",
		description: "人类反馈闭环：对某条知识的修正（置信度下调）或确认（上调）记回笔记本身，供召回加权。",
		behavior: "idempotent",
		parameters: params({
			ref: str("条目 id / 标题 / slug"),
			kind: strOpt("correction | confirm"),
			note: strOpt("反馈说明")
		}, ["ref"]),
		async execute(args) {
			return cardian.feedback(args.ref, args.kind ?? "correction", args.note ?? "");
		}
	});
	register(ctx, "cardian.skill.export", {
		name: "cardian.skill.export",
		description: "把一批知识圈定为可复用的技能单元：生成 Skills/<name>/SKILL.md 与 notes/ 副本。",
		behavior: "idempotent",
		parameters: params({
			name: str("技能名称"),
			description: strOpt("一句话描述"),
			refs: arrOpt("条目引用列表（优先）"),
			section: strOpt("限定分区 cards | memory | wiki"),
			group: strOpt("限定分组（分类/作用域/仓库）")
		}, ["name"]),
		async execute(args) {
			return cardian.exportSkill(args);
		}
	});
	register(ctx, "cardian.doctor", {
		name: "cardian.doctor",
		description: "健康检查：MOC 索引、孤儿临时文件、缺少必填字段、过期笔记。",
		behavior: "read",
		parameters: params({}),
		async execute() {
			return cardian.doctor();
		}
	});
	register(ctx, "cardian.schema", {
		name: "cardian.schema",
		description: "列出当前仓库里实际使用的 frontmatter 字段及其值类型。",
		behavior: "read",
		parameters: params({}),
		async execute() {
			return cardian.schema();
		}
	});
	register(ctx, "cardian.search", {
		name: "cardian.search",
		description: "知识中心混合检索（关键词 + 语义），覆盖 RepoWiki/知识卡片/记忆，返回按相关度排序的条目。",
		behavior: "read",
		parameters: params({
			query: str("搜索关键词"),
			section: strOpt("限定分区：wiki | cards | memory"),
			tag: strOpt("限定标签"),
			topK: numOpt("返回条数（默认 20）"),
			semantic: boolOpt("是否启用语义检索（默认 true）")
		}, ["query"]),
		async execute(args) {
			return cardian.search(args.query, {
				type: SECTION_TYPE[args.section] ?? null,
				tag: args.tag,
				topK: args.topK,
				semantic: args.semantic
			});
		}
	});
	register(ctx, "cardian.recall", {
		name: "cardian.recall",
		description: "精简召回：返回少量高信号上下文（按重要度/新鲜度/置信度重排），供 agent 快速了解“关于此事我知道什么”。",
		behavior: "read",
		parameters: params({
			query: str("召回关键词"),
			section: strOpt("限定分区：wiki | cards | memory"),
			scope: strOpt("记忆作用域（仅对 memory 生效）"),
			topK: numOpt("返回条数（默认 4）"),
			minConfidence: numOpt("最低置信度 0-1")
		}, ["query"]),
		async execute(args) {
			return cardian.recall(args.query, {
				type: SECTION_TYPE[args.section] ?? null,
				scope: args.scope,
				topK: args.topK,
				minConfidence: args.minConfidence
			});
		}
	});
	register(ctx, "cardian.tagCloud", {
		name: "cardian.tagCloud",
		description: "返回标签云（标签及其出现次数），可按分区过滤。",
		behavior: "read",
		parameters: params({ section: strOpt("限定分区：wiki | cards | memory") }),
		async execute(args) {
			return cardian.tagCloud({ type: SECTION_TYPE[args.section] ?? null });
		}
	});
	register(ctx, "cardian.backlinks", {
		name: "cardian.backlinks",
		description: "查询某个条目（按 id/标题/slug/别名）被哪些其它条目 [[wikilink]] 引用。",
		behavior: "read",
		parameters: params({ ref: str("条目 id / 标题 / slug / 别名") }, ["ref"]),
		async execute(args) {
			return cardian.backlinks(args.ref);
		}
	});
	register(ctx, "cardian.related", {
		name: "cardian.related",
		description: "按共享标签查找与某条目相关的其它条目。",
		behavior: "read",
		parameters: params({ ref: str("条目 id / 标题 / slug / 别名") }, ["ref"]),
		async execute(args) {
			return cardian.related(args.ref);
		}
	});
	register(ctx, "cardian.export", {
		name: "cardian.export",
		description: "导出整个知识中心为 JSON（含全部 frontmatter 与正文），用于备份或迁移。",
		behavior: "read",
		parameters: params({}),
		async execute() {
			return cardian.exportJson();
		}
	});
	register(ctx, "cardian.import", {
		name: "cardian.import",
		description: "从 cardian.export 的 JSON 快照导入并还原知识中心。",
		behavior: "idempotent",
		parameters: params({ data: {
			type: "object",
			description: "export 返回的快照对象",
			required: true
		} }, ["data"]),
		async execute(args) {
			return cardian.importJson(args.data);
		}
	});
	register(ctx, "cardian.importMarkdown", {
		name: "cardian.importMarkdown",
		description: "扫描一个文件夹里的 Markdown 笔记导入为知识卡片（带 type 的 frontmatter 会路由到记忆/RepoWiki）。",
		behavior: "idempotent",
		parameters: params({
			dir: str("本地文件夹路径"),
			category: strOpt("默认分类（默认 imported）")
		}, ["dir"]),
		async execute(args) {
			return cardian.importMarkdownFolder(args.dir, { category: args.category });
		}
	});
	register(ctx, "cardian.wiki.ingest", {
		name: "cardian.wiki.ingest",
		description: "扫描本地代码仓库目录，为每个源文件生成一张 Wiki 骨架卡片（路径、语言、行数、代码摘录）。生成后用 cardian.wiki.upsert 回填语义描述。",
		behavior: "idempotent",
		parameters: params({
			repoPath: str("本地仓库绝对/相对路径"),
			repoName: strOpt("仓库名称（默认取目录名）"),
			maxFiles: numOpt("最多扫描的文件数（默认 50）")
		}, ["repoPath"]),
		async execute(args) {
			return wiki.ingest(args.repoPath, {
				repoName: args.repoName,
				maxFiles: args.maxFiles
			});
		}
	});
	register(ctx, "cardian.wiki.upsert", {
		name: "cardian.wiki.upsert",
		description: "创建或更新一张 RepoWiki 卡片，描述仓库中某个文件/模块的职责与结构。",
		behavior: "idempotent",
		parameters: params({
			repo: str("仓库名称（slug）"),
			path: str("文件/模块在仓库内的相对路径，如 src/lib/store.js"),
			content: str("Wiki 卡片正文（Markdown）"),
			title: strOpt("卡片标题（默认等于 path）"),
			tags: arrOpt("标签"),
			language: strOpt("语言"),
			summary: strOpt("一句话摘要"),
			status: strOpt("draft | published"),
			confidence: numOpt("置信度 0-1"),
			aliases: arrOpt("别名"),
			relations: arrOpt("类型化关系，如 \"depends_on [[目标]]\""),
			as_of: strOpt("事实截止日期（ISO）"),
			expires: strOpt("过期日期（ISO）")
		}, [
			"repo",
			"path",
			"content"
		]),
		async execute(args) {
			return wiki.upsert(args);
		}
	});
	register(ctx, "cardian.wiki.get", {
		name: "cardian.wiki.get",
		description: "读取某仓库中指定路径的 Wiki 卡片。",
		behavior: "read",
		parameters: params({
			repo: str("仓库名称"),
			path: str("文件相对路径")
		}, ["repo", "path"]),
		async execute(args) {
			return wiki.getByPath(args.repo, args.path);
		}
	});
	register(ctx, "cardian.wiki.list", {
		name: "cardian.wiki.list",
		description: "列出 RepoWiki 卡片；不传 repo 时列出所有已扫描仓库。",
		behavior: "read",
		parameters: params({ repo: strOpt("仓库名称（可选）") }),
		async execute(args) {
			if (!args.repo) return {
				repos: await wiki.listRepos(),
				entries: await wiki.list()
			};
			return wiki.list({ group: args.repo });
		}
	});
	register(ctx, "cardian.wiki.delete", {
		name: "cardian.wiki.delete",
		description: "删除某仓库中指定路径的 Wiki 卡片。",
		behavior: "destroy",
		parameters: params({
			repo: str("仓库名称"),
			path: str("文件相对路径")
		}, ["repo", "path"]),
		async execute(args) {
			return { deleted: await wiki.removeByPath(args.repo, args.path) };
		}
	});
	register(ctx, "cardian.card.upsert", {
		name: "cardian.card.upsert",
		description: "创建或更新一张知识卡片（原子化知识单元），同标题幂等更新。",
		behavior: "idempotent",
		parameters: params({
			title: str("卡片标题"),
			content: str("卡片正文（Markdown）"),
			tags: arrOpt("标签"),
			category: strOpt("分类（默认 general）"),
			cardType: strOpt("卡片类型：overview | tech stack | convention | setup & commands"),
			source: strOpt("知识来源"),
			status: strOpt("draft | published"),
			confidence: numOpt("置信度 0-1"),
			summary: strOpt("一句话摘要"),
			relations: arrOpt("类型化关系，如 \"relates_to [[目标]]\""),
			as_of: strOpt("事实截止日期（ISO）"),
			expires: strOpt("过期日期（ISO）"),
			front: strOpt("闪卡正面（问题/术语）"),
			back: strOpt("闪卡背面（答案/定义）"),
			deck: strOpt("闪卡牌组")
		}, ["title", "content"]),
		async execute(args) {
			return cards.upsert(args);
		}
	});
	register(ctx, "cardian.card.review", {
		name: "cardian.card.review",
		description: "复习一张闪卡并按 SM-2 算法重新排期（grade: 0=again, 1=hard, 2=good, 3=easy）。",
		behavior: "idempotent",
		parameters: params({
			ref: str("卡片 id / 标题 / slug / 别名"),
			grade: numOpt("评分 0-3（默认 2）")
		}, ["ref"]),
		async execute(args) {
			return cards.review(args.ref, args.grade);
		}
	});
	register(ctx, "cardian.card.due", {
		name: "cardian.card.due",
		description: "列出到期需要复习的闪卡，可按牌组过滤。",
		behavior: "read",
		parameters: params({ deck: strOpt("牌组（可选）") }),
		async execute(args) {
			return cards.due({ deck: args.deck });
		}
	});
	register(ctx, "cardian.card.get", {
		name: "cardian.card.get",
		description: "按 id、标题、slug 或别名读取一张知识卡片。",
		behavior: "read",
		parameters: params({ ref: str("卡片 id / 标题 / slug / 别名") }, ["ref"]),
		async execute(args) {
			return cards.get(args.ref);
		}
	});
	register(ctx, "cardian.card.list", {
		name: "cardian.card.list",
		description: "列出知识卡片，可按分类、标签或状态过滤。",
		behavior: "read",
		parameters: params({
			category: strOpt("分类"),
			tag: strOpt("标签"),
			status: strOpt("状态")
		}),
		async execute(args) {
			return cards.list({
				group: args.category,
				tag: args.tag,
				status: args.status,
				cardType: args.cardType
			});
		}
	});
	register(ctx, "cardian.card.search", {
		name: "cardian.card.search",
		description: "在知识卡片中检索（关键词 + 语义）。",
		behavior: "read",
		parameters: params({
			query: str("关键词"),
			topK: numOpt("返回条数")
		}, ["query"]),
		async execute(args) {
			return cardian.search(args.query, {
				type: "card",
				topK: args.topK ?? 20
			});
		}
	});
	register(ctx, "cardian.card.delete", {
		name: "cardian.card.delete",
		description: "删除一张知识卡片。",
		behavior: "destroy",
		parameters: params({ ref: str("卡片 id / 标题 / slug / 别名") }, ["ref"]),
		async execute(args) {
			return { deleted: await cards.remove(args.ref) };
		}
	});
	register(ctx, "cardian.memory.commit", {
		name: "cardian.memory.commit",
		description: "提交一条持久记忆（跨会话可检索），可选 scope、facts、importance、kind。",
		behavior: "idempotent",
		parameters: params({
			title: str("记忆标题"),
			content: str("记忆内容（Markdown）"),
			tags: arrOpt("标签"),
			scope: strOpt("作用域（默认 global）"),
			facts: arrOpt("关键事实列表"),
			importance: numOpt("重要度 1-5（默认 3）"),
			kind: strOpt("semantic | episodic | procedural"),
			status: strOpt("draft | published"),
			confidence: numOpt("置信度 0-1"),
			summary: strOpt("一句话摘要"),
			relations: arrOpt("类型化关系，如 \"relates_to [[目标]]\""),
			as_of: strOpt("事实截止日期（ISO）"),
			expires: strOpt("过期日期（ISO）")
		}, ["title", "content"]),
		async execute(args) {
			return memory.upsert(args);
		}
	});
	register(ctx, "cardian.memory.get", {
		name: "cardian.memory.get",
		description: "按 id、标题、slug 或别名读取一条记忆。",
		behavior: "read",
		parameters: params({ ref: str("记忆 id / 标题 / slug / 别名") }, ["ref"]),
		async execute(args) {
			return memory.get(args.ref);
		}
	});
	register(ctx, "cardian.memory.history", {
		name: "cardian.memory.history",
		description: "查看某条记忆的修订历史（追加式变更记录）。",
		behavior: "read",
		parameters: params({ ref: str("记忆 id / 标题 / slug / 别名") }, ["ref"]),
		async execute(args) {
			const note = await memory.get(args.ref);
			if (!note) return { history: [] };
			return {
				title: note.title,
				history: note.history ?? []
			};
		}
	});
	register(ctx, "cardian.memory.list", {
		name: "cardian.memory.list",
		description: "列出记忆，可按 scope、标签或状态过滤。",
		behavior: "read",
		parameters: params({
			scope: strOpt("作用域"),
			tag: strOpt("标签"),
			status: strOpt("状态")
		}),
		async execute(args) {
			return memory.list({
				group: args.scope,
				tag: args.tag,
				status: args.status
			});
		}
	});
	register(ctx, "cardian.memory.search", {
		name: "cardian.memory.search",
		description: "在记忆中检索（关键词 + 语义）。",
		behavior: "read",
		parameters: params({
			query: str("关键词"),
			topK: numOpt("返回条数")
		}, ["query"]),
		async execute(args) {
			return cardian.search(args.query, {
				type: "memory",
				topK: args.topK ?? 20
			});
		}
	});
	register(ctx, "cardian.memory.delete", {
		name: "cardian.memory.delete",
		description: "删除一条记忆。",
		behavior: "destroy",
		parameters: params({ ref: str("记忆 id / 标题 / slug / 别名") }, ["ref"]),
		async execute(args) {
			return { deleted: await memory.remove(args.ref) };
		}
	});
}
//#endregion
//#region src/index.js
const name = "cardian";
const inject = ["tools"];
const Config = Schema.object({
	vaultPath: Schema.string().description("Obsidian 仓库（vault）路径，知识卡片/记忆/RepoWiki 都写入该目录").default("./cardian-vault"),
	autoInit: Schema.boolean().description("启动时自动创建仓库目录与三个分区的索引（Map of Content）").default(true),
	aiCondense: Schema.boolean().description("（保留兼容位）AI 扫盘的语义回填现由网关逐文件直调宿主 llm 完成，是否真正回填取决于扫描向导里是否选了模型").default(true),
	semanticSearch: Schema.boolean().description("启用语义检索（与关键词检索混合）").default(true),
	searchAlpha: Schema.number().description("混合检索中关键词与语义的权重（0=纯语义，1=纯关键词）").default(.5),
	embedderDim: Schema.number().description("本地向量维度（内置 HashEmbedder）").default(256),
	watchVault: Schema.boolean().description("监听 vault 文件变更：在 Obsidian 手工编辑笔记后自动刷新检索索引与三区 MOC，无需手动 reindex").default(true)
});
const GATEWAY_METHODS = [
	"describe",
	"sectionList",
	"sectionGet",
	"sectionUpsert",
	"sectionRemove",
	"ingestProject",
	"ingestStatus",
	"listModels",
	"pauseIngest",
	"resumeIngest",
	"cancelIngest",
	"rescanDiff",
	"status",
	"tagCloud",
	"backlinks",
	"related",
	"graph",
	"doctor",
	"schema",
	"search",
	"recall",
	"promote",
	"due",
	"exportJson",
	"exportSkill"
];
var CardianGateway = class CardianGateway extends TypertRemoteService {
	constructor(ctx, cardian) {
		super(ctx, "cardianRemote", { namespace: "cardian" });
		this.cardian = cardian;
		this.jobs = /* @__PURE__ */ new Map();
		this.backfillTimeoutMs = cardian?.config?.backfillTimeoutMs ?? 3e5;
		this._jobSeq = 0;
		this._aborters = /* @__PURE__ */ new Map();
		for (const method of GATEWAY_METHODS) Remote(method)(CardianGateway.prototype[method], {
			name: method,
			private: false,
			static: false,
			addInitializer: (initializer) => initializer.call(this)
		});
	}
	describe() {
		return this.cardian.describe();
	}
	sectionList(params = {}) {
		return this.cardian.sectionList(params);
	}
	sectionGet(params = {}) {
		return this.cardian.sectionGet(params);
	}
	sectionUpsert(params = {}) {
		return this.cardian.sectionUpsert(params);
	}
	sectionRemove(params = {}) {
		return this.cardian.sectionRemove(params);
	}
	status() {
		return this.cardian.status();
	}
	tagCloud(params = {}) {
		return this.cardian.tagCloud(params);
	}
	backlinks(params = {}) {
		return this.cardian.backlinks(params.ref);
	}
	related(params = {}) {
		return this.cardian.related(params.ref);
	}
	graph(params = {}) {
		return this.cardian.wiki.graph(params.repo);
	}
	doctor() {
		return this.cardian.doctor();
	}
	schema() {
		return this.cardian.schema();
	}
	search(params = {}) {
		return this.cardian.search(params.query ?? "", params);
	}
	recall(params = {}) {
		return this.cardian.recall(params.query ?? "", params);
	}
	promote(params = {}) {
		return this.cardian.memory.promote(params.ref, { target: params.target ?? "shared" });
	}
	due(params = {}) {
		return this.cardian.cards.due({ deck: params.deck ?? null });
	}
	exportJson() {
		return this.cardian.exportJson();
	}
	exportSkill(params = {}) {
		return this.cardian.exportSkill(params);
	}
	/** 取宿主 llm 服务；缺席（测试 mock ctx / 未装 dsh-llm）时返回 null。 */
	_llmService() {
		try {
			const llm = typeof this.ctx?.get === "function" ? this.ctx.get("llm") : null;
			return llm && typeof llm.stream === "function" ? llm : null;
		} catch {
			return null;
		}
	}
	/** 读宿主默认模型选择（dsh-agent-default-model）；拿不到返回 null。 */
	_defaultModel() {
		const grabs = [() => typeof this.ctx?.get === "function" ? this.ctx.get("agentDefaultModel") : null, () => this.ctx?.agentDefaultModel];
		for (const grab of grabs) try {
			const svc = grab();
			const sel = typeof svc?.currentSelection === "function" ? svc.currentSelection() : null;
			if (sel && typeof sel.provider === "string" && typeof sel.model === "string") return {
				provider: sel.provider,
				model: sel.model
			};
		} catch {}
		return null;
	}
	async listModels() {
		const llm = this._llmService();
		const def = this._defaultModel();
		if (!llm) return {
			available: false,
			models: [],
			default: def
		};
		const out = [];
		let providers = [];
		try {
			providers = typeof llm.listProviders === "function" ? llm.listProviders() ?? [] : [];
		} catch {
			providers = [];
		}
		for (const p of providers) {
			const pid = String(p?.id ?? p?.provider ?? "").trim();
			if (!pid) continue;
			let models = [];
			try {
				models = typeof llm.listModels === "function" ? await llm.listModels(pid) ?? [] : [];
			} catch {
				models = [];
			}
			for (const m of models) {
				const mid = String(m?.id ?? "").trim();
				if (!mid) continue;
				out.push({
					provider: pid,
					model: mid,
					title: String(m?.name ?? mid),
					description: m?.description ? String(m.description) : null
				});
			}
		}
		if (!out.length && def) out.push({
			provider: def.provider,
			model: def.model,
			title: def.model,
			description: "宿主默认模型"
		});
		return {
			available: true,
			models: out,
			default: def
		};
	}
	/**
	* 一次完整的模型调用：喂 messages、收集 text-delta、透出 finish 错误。
	* `signal` 来自任务的 AbortController —— 「暂停 / 停止」就是 abort 这个信号；
	* 收到 aborted 收尾时返回已积聚的部分文本（不抛），交由编排层决定去留。
	* 另加单次调用超时（默认 90s）：宿主 llm 挂死时 abort 本地控制器并抛错，
	* 由调用方按「这个文件回填失败」处理，不至于让整条流水线永远卡在一张卡上。
	*/
	async _llmComplete(llm, model, prompt, opts = {}) {
		const { signal, system, maxTokens } = opts;
		const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 9e4;
		const local = new AbortController();
		let timedOut = false;
		const relay = () => local.abort();
		if (signal) {
			if (signal.aborted) local.abort();
			else signal.addEventListener?.("abort", relay);
		}
		const timer = setTimeout(() => {
			timedOut = true;
			local.abort();
		}, timeoutMs);
		const messages = [{
			id: typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `cardian-${Date.now()}`,
			role: "user",
			source: { kind: "user" },
			content: [{
				type: "text",
				text: String(prompt ?? "")
			}]
		}];
		const options = {
			provider: model.provider,
			model: model.model,
			messages
		};
		if (system) options.system = String(system);
		if (maxTokens) options.maxTokens = Number(maxTokens);
		options.signal = local.signal;
		let text = "";
		let failure = null;
		try {
			for await (const chunk of llm.stream(options)) {
				if (!chunk || typeof chunk !== "object") continue;
				if (chunk.type === "text-delta") text += String(chunk.text ?? "");
				else if (chunk.type === "finish") {
					const kind = chunk.reason?.kind;
					if (kind === "error") failure = chunk.reason?.failure?.message ?? "模型调用失败";
					else if (kind === "aborted") return text;
				}
			}
		} finally {
			clearTimeout(timer);
			if (signal) signal.removeEventListener?.("abort", relay);
		}
		if (timedOut && !signal?.aborted) throw new Error(`模型调用超时（${Math.round(timeoutMs / 1e3)}s 无响应）`);
		if (failure) throw new Error(failure);
		return text;
	}
	/** 从模型回复里提一段 JSON：剥 ```fence，再退化到「首个配对的 {…} / […] 切片」。 */
	_extractJson(text) {
		const raw = String(text ?? "").trim();
		if (!raw) return null;
		const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
		const candidates = [];
		if (fenced) candidates.push(String(fenced[1]).trim());
		candidates.push(raw);
		for (const body of candidates) {
			if (!body) continue;
			try {
				return JSON.parse(body);
			} catch {}
			const sliced = sliceBalanced(body);
			if (sliced) try {
				return JSON.parse(sliced);
			} catch {}
		}
		return null;
	}
	/** job → 可 JSON 序列化的面板快照（白名单，新增内部字段不会漏过 wire）。 */
	_jobSnapshot(job) {
		if (!job) return null;
		const list = (arr) => Array.isArray(arr) ? arr.slice(0, 60) : [];
		const diff = job.diff ? {
			repo: job.diff.repo ?? null,
			added: list(job.diff.added),
			changed: list(job.diff.changed).map((c) => typeof c === "string" ? c : c?.path).filter(Boolean),
			removed: list(job.diff.removed),
			addedCount: (job.diff.added ?? []).length,
			changedCount: (job.diff.changed ?? []).length,
			removedCount: (job.diff.removed ?? []).length,
			unchangedCount: (job.diff.unchanged ?? []).length,
			unenrichedCount: (job.diff.unchanged ?? []).filter((u) => !u.enriched).length,
			truncated: !!job.diff.truncated,
			pruneSafe: !!job.diff.pruneSafe
		} : null;
		return {
			jobId: job.jobId,
			kind: job.kind,
			dir: job.dir,
			repo: job.repo ?? null,
			repoName: job.repoName,
			maxFiles: job.maxFiles,
			depth: job.depth,
			model: job.model ?? null,
			status: job.status,
			phase: job.phase,
			paused: !!job.paused,
			cancelled: !!job.cancelled,
			pct: job.pct,
			done: job.done,
			total: job.total,
			current: job.current,
			error: job.error,
			summary: job.summary,
			aiStatus: job.aiStatus,
			aiMessage: job.aiMessage,
			overviewCount: job.overviewCount,
			moduleCount: job.moduleCount,
			enrichedCount: job.enrichedCount,
			skippedCount: job.skippedCount,
			failedCount: job.failedCount,
			diff,
			startedAt: job.startedAt,
			finishedAt: job.finishedAt
		};
	}
	/** 建 job 记录 + 挂 AbortController（暂停 / 停止据此中断在途 LLM 调用）。 */
	_startJob(fields) {
		const jobId = `job-${Date.now()}-${this._jobSeq++}`;
		const record = {
			jobId,
			kind: "full",
			dir: "",
			repo: null,
			repoName: "",
			maxFiles: 50,
			depth: 2,
			model: null,
			status: "running",
			phase: "scan",
			paused: false,
			cancelled: false,
			scanned: false,
			planned: false,
			pct: 0,
			done: 0,
			total: 0,
			current: "准备扫描…",
			error: null,
			summary: null,
			aiStatus: "none",
			aiMessage: null,
			aiStartedAt: null,
			aiDeadlineAt: null,
			overviewCount: 0,
			moduleCount: 0,
			enrichedCount: 0,
			skippedCount: 0,
			failedCount: 0,
			diff: null,
			files: null,
			assignments: null,
			overviewId: null,
			startedAt: Date.now(),
			finishedAt: null,
			...fields
		};
		this.jobs.set(jobId, record);
		this._aborters.set(jobId, new AbortController());
		return record;
	}
	/** 暂停 / 停止检查点：返回 false 表示本轮流水线应当立刻停下。 */
	_gate(job) {
		if (!job) return false;
		if (job.cancelled) {
			this._finishJob(job, "cancelled");
			return false;
		}
		if (job.paused) {
			if (job.status === "running") {
				job.status = "paused";
				job.current = `已暂停 · 已完成 ${job.done}/${job.total}`;
			}
			return false;
		}
		return true;
	}
	_finishJob(job, status, err) {
		if (!job) return;
		if (job.finishedAt && job.status === status) return;
		job.status = status;
		job.paused = false;
		job.cancelled = status === "cancelled";
		if (status === "done") {
			job.pct = 100;
			job.done = job.total || job.done;
			if (job.aiStatus === "running") job.aiStatus = "done";
			job.current = ingestHeadline(job);
		} else if (status === "cancelled") {
			if (job.aiStatus === "running") job.aiStatus = "none";
			job.current = `已停止 · 完成 ${job.done}/${job.total}，已落盘 ${job.enrichedCount + job.skippedCount} 张`;
		} else if (status === "error") {
			job.error = err?.message ?? String(err);
			job.current = "失败";
			job.aiStatus = "error";
			job.aiMessage = job.error;
		}
		job.finishedAt = Date.now();
		this._aborters.delete(job.jobId);
	}
	/** 全量：scan → plan → enrich；diff：scan(diff) → enrich；暂停后「继续」只补剩余项。 */
	async _runIngest(jobId) {
		const job = this.jobs.get(jobId);
		if (!job) return;
		try {
			if (!job.scanned) {
				if (!await this._phaseScan(job)) return;
			}
			if (job.kind === "full" && !job.planned) {
				await this._phasePlan(job);
				if (!this._gate(job)) return;
			} else if (job.kind === "diff" && !job.planned) job.planned = true;
			if (!await this._phaseEnrich(job)) return;
			this._finishJob(job, "done");
		} catch (err) {
			this.cardian.logger?.warn?.("[cardian] 扫盘任务异常:", err);
			this._finishJob(job, "error", err);
		} finally {
			if (job.status !== "paused") this._aborters.delete(jobId);
		}
	}
	async _phaseScan(job) {
		const wiki = this.cardian.wiki;
		job.phase = "scan";
		job.status = "running";
		job.current = "枚举文件…";
		const report = (p) => {
			job.done = p.done;
			job.total = p.total;
			job.current = p.current;
			job.pct = job.total > 0 ? Math.min(99, Math.round(job.done / job.total * 100)) : 0;
		};
		if (job.kind === "diff") {
			const diff = await wiki.changedSince(job.dir, {
				repoName: job.repoName,
				maxFiles: job.maxFiles,
				onProgress: report
			});
			job.repo = diff.repo;
			job.diff = diff;
			job.files = diff.targets ?? [];
			job.total = job.files.length;
			job.done = 0;
			if (diff.pruneSafe && (diff.removed ?? []).length) {
				job.current = `清理已删除文件 ${diff.removed.length} 张…`;
				for (const p of diff.removed) {
					if (!this._gate(job)) return false;
					try {
						await wiki.removeByPath(diff.repo, p);
					} catch (err) {
						this.cardian.logger?.warn?.("[cardian] 剪除孤儿卡失败:", p, err);
					}
				}
				await wiki.refreshMoc().catch(() => {});
			}
			job.assignments = await this._assignmentsFromVault(diff.repo);
			job.overviewId = await this._overviewIdOf(diff.repo);
		} else {
			const listed = await wiki.enumerateFiles(job.dir, {
				repoName: job.repoName,
				maxFiles: job.maxFiles,
				onProgress: report
			});
			job.repo = listed.repo;
			job.repoName = listed.repoName;
			job.files = listed.files;
			job.total = listed.files.length;
			job.done = 0;
			if (listed.truncated) job.aiMessage = `文件数达上限 ${listed.maxFiles}，本次为部分扫描（可提高上限后重扫）`;
			job.assignments = await this._assignmentsFromVault(listed.repo);
			job.overviewId = await this._overviewIdOf(listed.repo);
		}
		job.scanned = true;
		if (!this._gate(job)) return false;
		if (!job.files.length) {
			job.summary = {
				repo: job.repo,
				count: 0,
				skipped: 0,
				message: "未找到可分析的文件（目录为空 / 全被排除 / 与上次一致）"
			};
			if (job.kind === "diff") {
				job.status = "done";
				job.current = "没有变更需要重建";
				return false;
			}
		}
		return true;
	}
	async _phasePlan(job) {
		job.planned = true;
		const llm = this._llmService();
		if (job.ai === false) {
			await this._writeSkeletons(job);
			return;
		}
		if (!llm || !job.model) {
			job.aiStatus = "unavailable";
			job.aiMessage = !llm ? "宿主无 llm 服务：本次仅生成静态骨架卡（可在对话中让 AI 回填）" : "未选择可用模型：本次仅生成静态骨架卡（请在扫描向导里选择模型）";
			await this._writeSkeletons(job);
			return;
		}
		job.phase = "plan";
		job.current = "AI 规划项目结构（总览 / 模块）…";
		job.aiStatus = "running";
		job.aiStartedAt = Date.now();
		job.aiDeadlineAt = job.aiStartedAt + this.backfillTimeoutMs;
		const controller = this._aborters.get(job.jobId);
		let hierarchy = null;
		try {
			const text = await this._llmComplete(llm, job.model, buildPlanPrompt(job), {
				signal: controller?.signal,
				system: PLAN_SYSTEM,
				maxTokens: 2400
			});
			if (!this._gate(job)) return;
			hierarchy = this._extractJson(text);
		} catch (err) {
			if (!this._gate(job)) return;
			this.cardian.logger?.warn?.("[cardian] 层级规划失败，退回目录归属:", err);
			job.aiMessage = `层级规划失败（${err?.message ?? err}），已退回逐文件回填`;
		}
		if (hierarchy && (hierarchy.overview || Array.isArray(hierarchy.modules))) try {
			const applied = await this.cardian.wiki.applyHierarchy(job.repo, hierarchy);
			job.assignments = applied.assignments;
			job.overviewId = applied.overview?.id ?? null;
			job.overviewCount = applied.overview?.id ? 1 : 0;
			job.moduleCount = (applied.modules ?? []).length;
		} catch (err) {
			if (!this._gate(job)) return;
			this.cardian.logger?.warn?.("[cardian] 层级卡写入失败:", err);
			job.aiMessage = `层级卡写入失败（${err?.message ?? err}），文件卡将平铺`;
		}
	}
	async _phaseEnrich(job) {
		const wiki = this.cardian.wiki;
		const files = job.files ?? [];
		if (job.aiStatus === "unavailable" || job.ai === false) {
			job.phase = "enrich";
			job.done = job.total;
			return this._gate(job);
		}
		const llm = this._llmService();
		if (!llm || !job.model) return this._gate(job);
		job.phase = "enrich";
		job.status = "running";
		const total = files.length;
		job.total = total;
		const controller = this._aborters.get(job.jobId);
		for (let i = 0; i < total; i++) {
			if (!this._gate(job)) return false;
			const f = files[i];
			job.current = f.relPath;
			job.pct = total > 0 ? Math.min(99, Math.round((i + 1) / total * 100)) : 0;
			const prior = await wiki.getByPath(job.repo, f.relPath).catch(() => null);
			const priorFm = prior?.frontmatter ?? prior ?? {};
			const level = String(priorFm.analysisLevel ?? "");
			if ((level === "ai" || level === "manual") && priorFm.contentHash === f.contentHash) {
				job.skippedCount++;
				job.done = i + 1;
				continue;
			}
			if (level === "manual") {
				job.skippedCount++;
				job.done = i + 1;
				continue;
			}
			const owner = RepoWikiService.moduleOwnerOf(job.assignments ?? [], f.relPath);
			let parsed = null;
			try {
				const text = await this._llmComplete(llm, job.model, buildFilePrompt(job, f, owner), {
					signal: controller?.signal,
					system: FILE_SYSTEM,
					maxTokens: 1500,
					timeoutMs: 18e4
				});
				if (!this._gate(job)) return false;
				parsed = this._extractJson(text) ?? { body: String(text ?? "").trim() };
			} catch (err) {
				if (!this._gate(job)) return false;
				job.failedCount++;
				this.cardian.logger?.warn?.(`[cardian] ${f.relPath} 回填失败:`, err);
				parsed = null;
			}
			const body = parsed ? enrichBody(parsed, f, owner) : "";
			if (body) {
				await wiki.writeNote(this._filePlan(job, f, owner, parsed, body));
				job.enrichedCount++;
			} else await this._writeOneSkeleton(job, f, owner);
			job.done = i + 1;
			job.aiDeadlineAt = Date.now() + this.backfillTimeoutMs;
		}
		if (!this._gate(job)) return false;
		await wiki.refreshMoc().catch(() => {});
		job.summary = {
			repo: job.repo,
			count: job.enrichedCount,
			skipped: job.skippedCount,
			failed: job.failedCount,
			overview: job.overviewCount,
			modules: job.moduleCount
		};
		return true;
	}
	/** 文件卡 upsert 计划：plan() 造骨架，再补 contentHash / 层级字段。 */
	_filePlan(job, f, owner, parsed, body) {
		const plan = this.cardian.wiki.plan({
			repo: job.repo,
			path: f.relPath,
			title: String(parsed.title ?? "").trim() || f.relPath,
			summary: String(parsed.summary ?? "").trim() || `${f.lines} 行 · ${f.language}`,
			content: body,
			analysisLevel: "ai",
			status: "published",
			level: "file",
			parent: owner?.moduleId ?? job.overviewId ?? null,
			tags: [
				job.repoName,
				f.language,
				"ai-scan"
			].filter(Boolean)
		});
		plan.extra.contentHash = f.contentHash;
		plan.extra.imports = f.imports?.length ? f.imports : null;
		plan.extra.symbols = f.symbols?.length ? f.symbols : null;
		plan.extra.lines = f.lines ?? null;
		return plan;
	}
	/** 无 AI（或 AI 整体不可用）时的降级路径：逐文件写静态骨架卡。 */
	async _writeSkeletons(job) {
		const wiki = this.cardian.wiki;
		const files = job.files ?? [];
		job.phase = "enrich";
		job.total = files.length;
		for (let i = 0; i < files.length; i++) {
			if (!this._gate(job)) return false;
			const f = files[i];
			job.current = `骨架：${f.relPath}`;
			job.pct = files.length > 0 ? Math.min(99, Math.round((i + 1) / files.length * 100)) : 0;
			const owner = RepoWikiService.moduleOwnerOf(job.assignments ?? [], f.relPath);
			if (await this._writeOneSkeleton(job, f, owner)) job.skippedCount++;
			job.done = i + 1;
		}
		if (!this._gate(job)) return false;
		await wiki.refreshMoc().catch(() => {});
		job.summary = {
			repo: job.repo,
			count: job.skippedCount,
			skipped: 0,
			skeleton: true
		};
		return true;
	}
	async _writeOneSkeleton(job, f, owner) {
		const wiki = this.cardian.wiki;
		try {
			return await wiki.skeletonForFile(job.dir, f.absPath, f.relPath, {
				repo: job.repo,
				repoName: job.repoName
			}, {
				level: "file",
				parent: owner?.moduleId ?? job.overviewId ?? null
			});
		} catch (err) {
			this.cardian.logger?.warn?.(`[cardian] 骨架卡写入失败 ${f.relPath}:`, err);
			return null;
		}
	}
	/** 已存模块卡 → assignments（diff 任务不重排层级，沿用既有归属）。 */
	async _assignmentsFromVault(repo) {
		if (!repo) return [];
		let entries = [];
		try {
			entries = await this.cardian.wiki.entries();
		} catch {
			return [];
		}
		const out = [];
		for (const e of entries) {
			if (e.group !== repo || !e.frontmatter?.module) continue;
			for (const p of e.frontmatter.modulePaths ?? []) {
				const pattern = String(p ?? "").replace(/^\/+/, "");
				if (pattern) out.push({
					pattern,
					moduleId: e.frontmatter.id,
					moduleTitle: e.frontmatter.title
				});
			}
		}
		out.sort((a, b) => b.pattern.length - a.pattern.length);
		return out;
	}
	async _overviewIdOf(repo) {
		if (!repo) return null;
		try {
			const ov = await this.cardian.wiki.getByPath(repo, "__OVERVIEW__");
			return ov?.frontmatter?.id ?? ov?.id ?? null;
		} catch {
			return null;
		}
	}
	/** 归一化 params.model：接受 {provider,model} / 'provider/model' / 空。 */
	_resolveModel(raw) {
		const pick = (v) => {
			if (!v) return null;
			if (typeof v === "object") {
				const provider = String(v.provider ?? "").trim();
				const model = String(v.model ?? "").trim();
				return provider && model ? {
					provider,
					model
				} : null;
			}
			const s = String(v).trim();
			if (!s) return null;
			const i = s.indexOf("/");
			if (i > 0 && i < s.length - 1) return {
				provider: s.slice(0, i),
				model: s.slice(i + 1)
			};
			return null;
		};
		return pick(raw) || pick(this._defaultModel());
	}
	ingestProject(params = {}) {
		const dir = String(params.dir ?? "").trim();
		if (!dir) throw new Error("缺少项目文件夹路径（dir）");
		const job = this._startJob({
			kind: "full",
			dir,
			repoName: String(params.repoName ?? "").trim() || basename(dir),
			maxFiles: clampPosInt(params.maxFiles, 50),
			depth: clampPosInt(params.depth, 2),
			model: this._resolveModel(params.model),
			ai: params.ai !== false
		});
		this._runIngest(job.jobId);
		return this._jobSnapshot(job);
	}
	rescanDiff(params = {}) {
		const dir = String(params.dir ?? "").trim();
		if (!dir) throw new Error("缺少项目文件夹路径（dir）");
		const job = this._startJob({
			kind: "diff",
			dir,
			repoName: String(params.repoName ?? "").trim() || basename(dir),
			maxFiles: clampPosInt(params.maxFiles, 200),
			depth: clampPosInt(params.depth, 2),
			model: this._resolveModel(params.model),
			ai: params.ai !== false,
			current: "比对磁盘变更…"
		});
		this._runIngest(job.jobId);
		return this._jobSnapshot(job);
	}
	/** 暂停：置位 + abort 在途调用；已完成卡片保留（即时落盘过）。 */
	pauseIngest(params = {}) {
		const job = this.jobs.get(String(params.jobId ?? ""));
		if (!job) throw new Error("任务不存在（可能已结束或面板刷新过）");
		if (!applyIngestControl(job, "pause")) return this._jobSnapshot(job);
		try {
			this._aborters.get(job.jobId)?.abort?.();
		} catch {}
		return this._jobSnapshot(job);
	}
	/** 继续：清 paused，换新 AbortController，只跑剩余未回填项（幂等）。 */
	resumeIngest(params = {}) {
		const job = this.jobs.get(String(params.jobId ?? ""));
		if (!job) throw new Error("任务不存在（可能已结束或面板刷新过）");
		if (!applyIngestControl(job, "resume")) return this._jobSnapshot(job);
		this._aborters.set(job.jobId, new AbortController());
		this._runIngest(job.jobId);
		return this._jobSnapshot(job);
	}
	/** 停止：不再处理剩余项，已落盘卡片保留（不可再「继续」，重扫即可）。 */
	cancelIngest(params = {}) {
		const job = this.jobs.get(String(params.jobId ?? ""));
		if (!job) throw new Error("任务不存在（可能已结束或面板刷新过）");
		if (!applyIngestControl(job, "cancel")) return this._jobSnapshot(job);
		try {
			this._aborters.get(job.jobId)?.abort?.();
		} catch {}
		this._finishJob(job, "cancelled");
		return this._jobSnapshot(job);
	}
	_evaluateAiTimeouts(now = Date.now()) {
		for (const j of this.jobs.values()) {
			if (j.aiStatus !== "running") continue;
			if (j.status === "paused") {
				j.aiDeadlineAt = Math.max(j.aiDeadlineAt ?? 0, now + this.backfillTimeoutMs);
				continue;
			}
			if (!j.aiDeadlineAt) j.aiDeadlineAt = (j.aiStartedAt ?? Date.now()) + this.backfillTimeoutMs;
			if (now > j.aiDeadlineAt) {
				j.aiStatus = "error";
				j.aiMessage = "AI 回填超时未完成（常见原因：该模型无响应或凭据失效）。" + (j.total ? `已回填 ${j.enrichedCount ?? 0}/${j.total} 张；` : "") + "可点「暂停」后重试，或改选其它模型再扫。";
			}
		}
	}
	ingestStatus() {
		try {
			this._evaluateAiTimeouts();
		} catch {}
		return { jobs: [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 50).map((j) => this._jobSnapshot(j)) };
	}
};
/**
* 控制指令 → job 状态翻转。返回 true 表示指令生效，调用方再补 abort /
* 重启流水线；对不匹配当前状态的指令（已暂停再 pause、已结束再 cancel、
* 已 cancelled 再 resume）一律返回 false，保证面板重复点按钮幂等不会把
* 已结束任务拉回 running。
*/
function applyIngestControl(job, op) {
	if (!job) return false;
	if (op === "pause") {
		if (job.status !== "running") return false;
		job.cancelled = false;
		job.paused = true;
		job.status = "paused";
		job.current = `已暂停 · 已完成 ${job.done}/${job.total}`;
		return true;
	}
	if (op === "resume") {
		if (job.status !== "paused" || job.cancelled) return false;
		job.paused = false;
		job.status = "running";
		job.current = `继续 · 已完成 ${job.done}/${job.total}`;
		return true;
	}
	if (op === "cancel") {
		if (job.cancelled || job.status === "done" || job.status === "error" || job.status === "cancelled") return false;
		job.cancelled = true;
		job.paused = false;
		return true;
	}
	return false;
}
const PLAN_SYSTEM = "你是资深软件架构师，擅长把代码仓库梳理成有层级的项目文档。只输出 JSON，不要任何解释性文字。";
const FILE_SYSTEM = "你是资深工程师，为团队内部代码知识库撰写文件级说明。只输出 JSON，不要任何解释性文字。";
/** 层级规划提示：喂文件树（路径 / 语言 / 行数 / 主要符号），要总览 + 模块 JSON。 */
function buildPlanPrompt(job) {
	const files = job.files ?? [];
	const listed = files.slice(0, 400).map((f) => {
		const sym = (f.symbols ?? []).slice(0, 6).join(", ");
		return `- ${f.relPath} (${f.language}, ${f.lines} 行)${sym ? ` — 主要符号: ${sym}` : ""}`;
	});
	if (files.length > listed.length) listed.push(`- …（另有 ${files.length - listed.length} 个文件未列出）`);
	const depth = Math.max(1, Number(job.depth) || 2);
	return [
		`项目名：${job.repoName}`,
		`文件总数：${files.length}`,
		"",
		`请把该项目梳理成「项目总览 + 模块」两级结构，模块按目录前缀归并（以使用前 ${depth} 层目录为粒度），尽量覆盖清单里的文件。`,
		"",
		"文件清单：",
		...listed,
		"",
		"只输出如下 JSON（不要输出任何 JSON 之外的文字）：",
		"{\"overview\":{\"title\":\"<项目名> · 项目总览\",\"summary\":\"2-4 句：这个项目做什么、整体架构思路、关键技术栈\"},",
		"\"modules\":[{\"id\":\"<英文短横线 slug>\",\"title\":\"<中文模块名>\",\"summary\":\"1-2 句职责\",\"paths\":[\"<清单里出现过的目录前缀，不带前导斜杠>\"]}]}",
		"",
		"要求：modules 3~8 个；paths 必须是上面清单里真实存在的路径前缀；无法归类的文件留在总览层即可，不要强行编造。"
	].join("\n");
}
/** 单文件语义回填提示：喂静态抽取结果 + 源码摘录，要 title / summary / 四段正文。 */
function buildFilePrompt(job, f, owner = null) {
	const excerpt = String(f.excerpt ?? "").split("\n").slice(0, 60).join("\n");
	return [
		`项目：${job.repoName}`,
		owner?.moduleTitle ? `所属模块：${owner.moduleTitle}` : null,
		`文件：${f.relPath}`,
		`语言：${f.language}　行数：${f.lines}`,
		f.imports?.length ? `静态依赖：${f.imports.slice(0, 20).join(", ")}` : null,
		f.symbols?.length ? `静态符号：${f.symbols.slice(0, 20).join(", ")}` : null,
		"",
		"源码摘录（可能被截断）：",
		"```" + (f.language === "text" ? "" : f.language),
		excerpt,
		"```",
		"",
		"请说明这个文件在该项目里实际承担什么工作。只输出 JSON：",
		"{\"title\":\"人类可读标题（例如「定位引擎（LocationEngine）」）\",\"summary\":\"一句话职责，不超过 40 字\",\"body\":\"Markdown 正文\"}",
		"",
		"body 必须按顺序包含四个二级小节：## 职责、## 关键实现、## 依赖、## 注意点。",
		"每节 1-4 句或项目符号，总计 200-600 字；不要大段转贴源码；摘录里没有依据的写「未在摘录中体现」，不要编造。"
	].filter((line) => line !== null).join("\n");
}
/** 模型产出 → 卡片正文（补齐标题头 / 兜底缺小节 / 去掉整段 ```fence）。 */
function enrichBody(parsed, f, owner = null) {
	let body = String(parsed?.body ?? parsed?.content ?? "").trim();
	const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i.exec(body);
	if (fenced) body = String(fenced[1]).trim();
	if (!body) return "";
	if (!/^##\s/m.test(body)) body = `## 职责\n\n${body}`;
	let out = `${`# ${String(parsed?.title ?? "").trim() || f.relPath}\n\n> \`${f.relPath}\` · ${f.language} · ${f.lines} 行${owner?.moduleTitle ? ` · 模块：${owner.moduleTitle}` : ""}\n`}\n${body}\n`;
	if (f.imports?.length && !/^##\s*依赖/m.test(out)) out += `\n## 依赖\n\n${f.imports.map((d) => `- \`${d}\``).join("\n")}\n`;
	return out;
}
/** 任务收尾语（面板进度条右侧一行说明）。 */
function ingestHeadline(job) {
	const bits = [`${Number(job.enrichedCount ?? 0) + Number(job.skippedCount ?? 0)} 张卡片`];
	if (job.overviewCount || job.moduleCount) bits.unshift(`总览 ${job.overviewCount} / 模块 ${job.moduleCount}`);
	if (Number(job.failedCount)) bits.push(`${job.failedCount} 张回退骨架`);
	if (job.kind === "diff" && job.diff) bits.push(`新增 ${(job.diff.added ?? []).length} / 变更 ${(job.diff.changed ?? []).length} / 删除 ${(job.diff.removed ?? []).length}`);
	return `完成 · ${bits.join(" · ")}`;
}
function clampPosInt(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
/** 从一段混排文字里切出第一个配对完整的 {…} / […]（容忍尾部多余解释）。 */
function sliceBalanced(text) {
	const src = String(text ?? "");
	const start = src.search(/[{[]/);
	if (start < 0) return null;
	const open = src[start];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < src.length; i++) {
		const ch = src[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (ch === "\"") inString = true;
		else if (ch === open) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) return src.slice(start, i + 1);
		}
	}
	return null;
}
function installConversationHook(ctx, cardian) {
	if (typeof ctx.on !== "function") return;
	const handle = (session, event) => {
		try {
			if (!event || event.type !== "user/message") return;
			if (!session || typeof cardian.ready?.then !== "function") return;
			const cwd = session?.header?.cwd ?? session?.cwd;
			if (typeof cwd !== "string" || !cwd) return;
			const projectSlug = slugify(cwd.split(/[\\/]/).filter(Boolean).pop() ?? "");
			if (!projectSlug) return;
			cardian.ready.then(async () => {
				try {
					if (!(await cardian.wiki.listRepos()).includes(projectSlug)) return;
					const snippet = String(event.data?.message?.content?.[0]?.text ?? "").replace(/\s+/g, " ").slice(0, 120);
					const now = (/* @__PURE__ */ new Date()).toISOString();
					await cardian.memory.upsert({
						title: `最近对话 · ${projectSlug}`,
						content: `项目 ${projectSlug} 的最近一次对话活动（${now}）。\n\n` + (snippet ? `> ${snippet}\n` : "") + `\n该记忆由 cardian 对话活动钩子自动维护，每次有新对话都会刷新（scope=${projectSlug}）。\n`,
						scope: projectSlug,
						kind: "episodic",
						importance: 2,
						tags: [projectSlug, "conversation-activity"],
						summary: `最近对话活动 @ ${now}`,
						facts: [
							`最近活动：${now}`,
							projectSlug,
							"conversation-activity"
						]
					});
					await cardian.refreshAll();
				} catch (err) {
					cardian.logger?.warn?.("[cardian] 对话活动刷新失败:", err);
				}
			});
		} catch (err) {
			cardian.logger?.warn?.("[cardian] 对话活动钩子异常:", err);
		}
	};
	try {
		ctx.on("session/event", handle, { global: true });
	} catch (err) {
		cardian.logger?.warn?.("[cardian] 注册会话事件监听失败:", err);
	}
}
const SLASH_GUIDE = [
	"\n[cardian 斜杠命令] 用户消息以 `/cardian` 开头时视为知识中心命令：直接调用对应 cardian.* 工具执行，用紧凑列表或表格汇报结果，不要寒暄，不要整段复述长正文。",
	"- `/cardian`（无参或 help）→ 列出本命令清单",
	"- `/cardian status` → cardian.status",
	"- `/cardian search <关键词>` → cardian.search（可注明 section: wiki|cards|memory）",
	"- `/cardian recall <关键词>` → cardian.recall",
	"- `/cardian tag [分区]` → cardian.tagCloud",
	"- `/cardian doctor` 与 `/cardian reindex` → cardian.doctor / cardian.reindex",
	"- `/cardian wiki list` | `/cardian wiki graph <repo>` | `/cardian wiki get <repo> <路径>` | `/cardian wiki sync <本地路径>` → 对应 cardian.wiki.*",
	"- `/cardian card get <ref>` | `/cardian card due` | `/cardian card add <标题> | <正文>` → 对应 cardian.card.*",
	"- `/cardian memory list` | `/cardian memory commit <标题> | <内容>` → 对应 cardian.memory.*",
	""
].join("\n");
const MOC_STEM = /^(README|_index|index|MOC|moc)$/i;
function installVaultWatcher(ctx, cardian) {
	const vaultPath = cardian?.config?.vaultPath;
	if (!vaultPath || typeof watch !== "function") return null;
	const stats = {
		events: 0,
		ignored: 0,
		rebuilds: 0,
		lastChange: null,
		error: null
	};
	const pending = /* @__PURE__ */ new Set();
	let queuedPaths = null;
	let draining = false;
	let timer = null;
	let watcher = null;
	const flush = async (paths) => {
		queuedPaths = paths;
		if (draining) return;
		draining = true;
		try {
			while (queuedPaths) {
				const batch = queuedPaths;
				queuedPaths = null;
				try {
					await cardian.reindex();
					await cardian.refreshAll();
					stats.rebuilds++;
					stats.lastChange = batch[0] ?? null;
					ctx.logger?.info?.(`[cardian] vault 变更（${batch.join("、")}）→ 检索索引与 MOC 已自动刷新`);
				} catch (err) {
					ctx.logger?.warn?.("[cardian] vault 自动刷新失败:", err);
				}
			}
		} finally {
			draining = false;
		}
	};
	const schedule = (rel) => {
		pending.add(rel);
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			const paths = [...pending];
			pending.clear();
			flush(paths);
		}, 1200);
		if (typeof timer.unref === "function") timer.unref();
	};
	try {
		watcher = watch(vaultPath, { recursive: true }, (_event, fileName) => {
			try {
				stats.events++;
				const rel = String(fileName ?? "");
				if (!/\.md$/i.test(rel)) return;
				const parts = rel.split(/[\\/]/);
				if (parts.some((p) => p.startsWith("."))) return;
				if (MOC_STEM.test(parts[parts.length - 1].replace(/\.md$/i, ""))) {
					stats.ignored++;
					return;
				}
				schedule(rel);
			} catch {}
		});
		watcher.on?.("error", (err) => {
			stats.error = err?.message ?? String(err);
			ctx.logger?.warn?.("[cardian] vault 监听中断（自动刷新停用）:", err);
		});
		try {
			watcher.unref?.();
		} catch {}
	} catch (err) {
		ctx.logger?.warn?.("[cardian] vault 监听不可用（自动刷新停用）:", err);
		return null;
	}
	return {
		stats,
		close() {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			try {
				watcher?.close?.();
			} catch {}
		}
	};
}
const JSON_CODEC = () => ({
	mode: "strict",
	typeSymbol: "dsh-cardian/types#Json",
	schema: { parse: (value) => value }
});
const ZERO_WIRE_METHODS = /* @__PURE__ */ new Set([
	"describe",
	"status",
	"doctor",
	"schema"
]);
const TYPERT_MANIFEST = {
	package: "dsh-cardian",
	face: "host",
	schemas: [],
	invocations: GATEWAY_METHODS.map((method) => {
		const params = ZERO_WIRE_METHODS.has(method) ? [] : ["params"];
		return {
			id: `dsh-cardian#cardianRemote/${method}`,
			service: "cardianRemote",
			namespace: "cardian",
			method,
			invocation: { kind: "direct" },
			parameters: params.map((name) => ({
				name,
				wire: name,
				source: "json",
				codec: JSON_CODEC()
			})),
			result: JSON_CODEC()
		};
	}),
	model: {
		services: [],
		events: [],
		objects: []
	}
};
/** 手动注册 host 端 Typert 清单（loader 对注入 entry 静默跳过，见上文）。返回可撤销函数。 */
function registerTypertHost(ctx) {
	try {
		const typert = typeof ctx.get === "function" ? ctx.get("typert") : null;
		if (!typert || typeof typert.register !== "function") {
			ctx.logger?.warn?.("[cardian] typert 服务不可用，跳过远端清单注册");
			return null;
		}
		if (typeof typert.getPackage === "function" && typert.getPackage("dsh-cardian", "host")) return null;
		return typert.register(TYPERT_MANIFEST);
	} catch (err) {
		ctx.logger?.warn?.("[cardian] typert 清单注册失败（面板远端调用将不可用）:", err);
		return null;
	}
}
/** 纯函数版超时评估（单测用）：翻转则返回 true。 */
function evaluateAiTimeouts(jobList, now, timeoutMs = 3e5) {
	let changed = false;
	for (const j of jobList) {
		if (j.aiStatus !== "running") continue;
		if (now > (j.aiDeadlineAt ?? (j.aiStartedAt ?? 0) + timeoutMs)) {
			j.aiStatus = "error";
			changed = true;
		}
	}
	return changed;
}
function apply(ctx, config = {}) {
	const resolved = resolveConfig(config);
	const cardian = createCardian({
		...resolved,
		logger: ctx.logger
	});
	if (typeof ctx.provide === "function") ctx.provide("cardian", cardian);
	else ctx.cardian = cardian;
	registerTools(ctx, cardian);
	try {
		new CardianGateway(ctx, cardian);
	} catch (err) {
		ctx.logger?.warn?.("[cardian] Typert 网关不可用（宿主 ctx.reflect 缺失？）:", err);
	}
	try {
		if (typeof ctx.systemPrompt?.section === "function") ctx.systemPrompt.section(async () => {
			try {
				await cardian.ready?.then?.(() => {}) ?? cardian.ready;
				const s = await cardian.status();
				const secs = s.sections ?? {};
				const reposTxt = (s.repos ?? []).join("、") || "无";
				let txt = `[知识树上下文 · cardian]
- 体量：RepoWiki ${secs.wiki ?? 0} / 知识卡片 ${secs.cards ?? 0} / 记忆 ${secs.memory ?? 0}${reposTxt !== "无" ? `；已沉淀仓库：${reposTxt}` : ""}\n`;
				try {
					const top = (await cardian.memory.entries()).filter((m) => (m.frontmatter.status ?? "published") !== "draft").sort((a, b) => (Number(b.frontmatter.importance) || 0) - (Number(a.frontmatter.importance) || 0)).slice(0, 3);
					if (top.length) {
						txt += "- 重要记忆：\n";
						for (const m of top) {
							const imp = Number(m.frontmatter.importance) || 3;
							const fm = m.frontmatter;
							const firstFact = Array.isArray(fm.facts) && fm.facts.length ? String(fm.facts[0]) : "";
							txt += `  - [${imp}] ${fm.title}${firstFact ? ` — ${firstFact}` : ""}\n`;
						}
					}
					if ((s.stale ?? 0) > 0) txt += `- 注意：有 ${s.stale} 条笔记已过 expires，引用前请核实\n`;
				} catch {}
				txt += "- 以上摘要与条目是本项目的既有约定/决策，规划与生成代码时应作为行为约束优先遵守\n";
				txt += "\n需要细节时优先调用 cardian.search / cardian.recall 工具。\n";
				txt += SLASH_GUIDE;
				return txt;
			} catch {
				return "";
			}
		});
	} catch (err) {
		ctx.logger?.warn?.("[cardian] 系统提示段注册不可用:", err);
	}
	installConversationHook(ctx, cardian);
	let disposed = false;
	let vaultWatcher = null;
	if (resolved.watchVault) (cardian.ready ?? Promise.resolve()).then(() => {
		if (disposed) return;
		vaultWatcher = installVaultWatcher(ctx, cardian);
		if (vaultWatcher) cardian.watcher = vaultWatcher;
	}).catch(() => {});
	let disposeTypert = null;
	try {
		disposeTypert = registerTypertHost(ctx);
	} catch (err) {
		ctx.logger?.warn?.("[cardian] typert 清单注册异常:", err);
	}
	if (resolved.autoInit) cardian.ready = cardian.init().catch((err) => {
		(ctx.logger?.error ?? console.error)("[cardian] 初始化失败:", err);
	});
	else cardian.ready = Promise.resolve();
	return () => {
		disposed = true;
		if (vaultWatcher && typeof vaultWatcher.close === "function") try {
			vaultWatcher.close();
		} catch {}
		if (typeof disposeTypert === "function") try {
			disposeTypert();
		} catch (err) {
			ctx.logger?.warn?.("[cardian] 撤销 typert 注册失败:", err);
		}
		if (typeof ctx.provide !== "function") delete ctx.cardian;
	};
}
//#endregion
export { CardianError, CardianGateway, Config, ConfigError, GATEWAY_METHODS, NotFoundError, PathError, SLASH_GUIDE, StoreError, TYPERT_MANIFEST, ValidationError, ZERO_WIRE_METHODS, apply, applyIngestControl, buildFilePrompt, buildPlanPrompt, createCardian, enrichBody, evaluateAiTimeouts, inject, installVaultWatcher, name, resolveConfig };

//# sourceMappingURL=index.js.map