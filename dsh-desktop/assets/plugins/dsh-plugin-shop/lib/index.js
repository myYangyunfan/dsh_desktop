import { createRequire } from "node:module";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { loadOptionalPatches, readProfileManifest, resolveProfileDir } from "@deepseek-ai/dsh-app-boot";
import { lt, minVersion, parse, satisfies, valid, validRange } from "semver";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, delimiter, dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { gunzipSync } from "node:zlib";
import { spawn, spawnSync } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { JSON_SCHEMA, Type, dump, load } from "js-yaml";
import { isMap, isSeq, parseDocument } from "yaml";
//#region src/own-version.ts
/** The shop's own published version, read from the package.json that ships
* next to this package — the RUNNING version, not the manifest's range
* spec — and the identity of the process running it (`bootId`). This lives
* at the package root (not under src/host) on purpose:
* both the source tree (tests) and the bundled `lib/index.js` sit exactly
* one level below the package root, so the same relative URL resolves in
* both. */
function ownManifest$1() {
	return JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
}
/**
* Read a version once and keep it: the answer to "which code is this".
*
* The file cannot answer that question later. A profile installs hoisted, so
* a self-update rewrites package.json in the directory the RUNNING code was
* loaded from, and every read after it names the version that will run after
* the next restart — which the version row then printed as the one running
* (design §7.3, 2026-09-27 amendment).
*
* A first read that throws is not kept: the module import must not fail over
* a version string, so the answer falls back to reading on demand, which is
* what the row always did.
*/
function versionAtLoad(read) {
	let loaded;
	try {
		loaded = read();
	} catch {
		loaded = null;
	}
	return () => loaded ?? read();
}
/** The version of the code in this process, read when the module was first
* evaluated — at boot, before any self-update could rewrite the file. */
const runningVersion = versionAtLoad(() => ownManifest$1().version);
/**
* Which run of the code this is: drawn when the module is first evaluated,
* fixed for the life of the process, and different in the next one.
*
* The version cannot answer that. A restart that installed no new shop keeps
* it, and so does one that never happened — which is what a page reloaded
* into the process it asked to restart could not tell apart from success,
* and showed as a self-update that silently did not land (design §8,
* 2026-10-06 amendment).
*/
const bootId = randomUUID();
/**
* The peer ranges this build declares — the input to the load-time harness
* self-check. Read from the same shipped manifest as `runningVersion`, so the
* ranges checked are the ones this build was actually published with, never
* a second copy that can drift from them.
*
* A non-string range is dropped rather than repaired: only what we can
* compare against is worth a verdict.
*/
function ownPeerRanges() {
	const declared = ownManifest$1().peerDependencies;
	if (declared === null || typeof declared !== "object") return {};
	const ranges = {};
	for (const [spec, range] of Object.entries(declared)) if (typeof range === "string") ranges[spec] = range;
	return ranges;
}
//#endregion
//#region src/host/origin.ts
/** The transport seam under `loadCatalog` (design §3).
*
* An origin answers a cheap probe, then serves the pointer and the files the
* pointer names. HTTP and npm are interchangeable behind it, so every line of
* cache and validation logic in `catalog.ts` stays transport-blind. */
/** A failure of the link, not of the content: the wire threw, or answered
* non-2xx. This is the ONLY class `loadCatalog` retries on another origin.
* A bad schema, a sha mismatch, or a refused url is an interpretation
* failure and throws — masking a corrupt origin behind a healthy one is
* exactly the silent-wrongness this project refuses. */
var TransportError = class extends Error {
	constructor(message, options) {
		super(message, options);
		this.name = "TransportError";
	}
};
/** Resolve the pointer's data URL against the catalog base. An absolute URL —
* any scheme, or a protocol-relative `//host/...` — would hand the pointer a
* fetch primitive to arbitrary hosts, so it is refused loudly before any
* fetch (§9.2). The guard is the resolved origin, not the raw string: WHATWG
* normalization strips leading whitespace and accepts backslash spellings
* before the string could be inspected, so only comparing the resolved URL's
* origin to the base's closes every spelling class. */
function resolveDataUrl(baseUrl, url) {
	const resolved = new URL(url, baseUrl);
	if (resolved.origin !== new URL(baseUrl).origin) throw new Error("catalog data url must be relative to the catalog base");
	return resolved.href;
}
/** The largest catalog body this host reads into memory. */
const MAX_BODY_BYTES = 67108864;
/** Read a response body through a byte cap, converting transport failures. */
async function readCappedBytes(response, label, maxBytes = MAX_BODY_BYTES) {
	if (response.body === null) throw new TransportError(`${label} returned no body`);
	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) {
				try {
					await reader.cancel();
				} catch {}
				throw new TransportError(`${label} exceeded the ${maxBytes}-byte cap`);
			}
			chunks.push(Buffer.from(value));
		}
	} catch (error) {
		if (error instanceof TransportError) throw error;
		throw new TransportError(`${label} body read failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks);
}
/** Read a capped response body as UTF-8 text. */
async function readCappedText(response, label, maxBytes = MAX_BODY_BYTES) {
	return (await readCappedBytes(response, label, maxBytes)).toString("utf8");
}
/** The transport this project has always used: a static `v1/` tree. */
function httpOrigin(baseUrl, fetchImpl) {
	const id = `http:${baseUrl}`;
	return {
		id,
		async probe(signal) {
			let response;
			try {
				response = await fetchImpl(new URL("index.json", baseUrl).href, { signal });
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new TransportError(`catalog pointer fetch failed for ${id}: ${detail}`, { cause: error });
			}
			if (!response.ok) throw new TransportError(`catalog pointer returned ${response.status} for ${id}`);
			const pointerText = await readCappedText(response, `catalog pointer fetch for ${id}`);
			return {
				id,
				pointer: async () => pointerText,
				file: async (url, signal) => {
					const resolved = resolveDataUrl(baseUrl, url);
					let dataResponse;
					try {
						dataResponse = await fetchImpl(resolved, signal === void 0 ? void 0 : { signal });
					} catch (error) {
						const detail = error instanceof Error ? error.message : String(error);
						throw new TransportError(`catalog data fetch failed for ${id}: ${detail}`, { cause: error });
					}
					if (!dataResponse.ok) throw new TransportError(`catalog data returned ${dataResponse.status} for ${id}`);
					return readCappedText(dataResponse, `catalog data fetch for ${id}`);
				}
			};
		}
	};
}
//#endregion
//#region src/shared/tar.ts
/** A read-only ustar parser: the npm transport's only way into a tarball.
*
* Pure — bytes in, a path-to-bytes map out. It handles exactly what `npm
* pack` emits and refuses everything else loudly, because the alternative to
* a small strict reader is a fourth runtime dependency (design §4). */
/** Bytes up to the first NUL, one character for each byte. Tar pads its
* fixed-width text fields with NULs, so a plain toString would carry them into
* the path.
*
* `latin1`, not `ascii`: a name is bytes, and `ascii` drops the high bit of
* every one, so a name written in UTF-8 came back as a different string (`é`,
* C3 A9, as `C)`) that could be another file's name. One character for each
* byte is lossless and is the same string for a name that is ASCII, which is
* every name the npm transport reads. A caller that wants the characters of a
* UTF-8 name decodes `Buffer.from(name, 'latin1')`, or looks a name up as
* `Buffer.from(wanted, 'utf8').toString('latin1')`. */
function cstring(field) {
	const end = field.indexOf(0);
	return field.subarray(0, end === -1 ? field.length : end).toString("latin1");
}
/** Tar sizes are octal text, NUL- or space-terminated. An unparseable size
* would desynchronise every subsequent header, so it throws rather than
* guessing zero. */
function parseOctal(field) {
	const text = cstring(field).trim();
	if (text === "") return 0;
	const value = Number.parseInt(text, 8);
	if (!Number.isInteger(value) || value < 0) throw new Error(`tar: unparseable size field ${JSON.stringify(text)}`);
	return value;
}
/** `..` in any position, or a leading `/`, would let an archive write outside
* the directory it claims. Nothing we publish contains either, so a tarball
* that does is hostile or corrupt — refuse it rather than filter it. */
function assertContained(path) {
	if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`tar: ${JSON.stringify(path)} escapes the archive root`);
	return path;
}
/**
* Parse an uncompressed tar archive into path → bytes.
*
* Directory entries and the type flags that carry no file are skipped: npm
* packs regular files under `package/`, and a catalog tarball that needs
* anything else is not one we published. A pax (`x`) or GNU (`L`) header is not
* a file either, but it NAMES the next one: a path too long or too wide for a
* ustar header arrives this way, and skipping the header without reading it
* left its file under a truncated name, reported missing from an archive that
* ships it ({@link pathFromPax}).
* Each path is spelled by its bytes, one character each ({@link cstring}).
*/
function readTar(buffer) {
	const files = /* @__PURE__ */ new Map();
	let offset = 0;
	/** The name a pax or GNU header gives the header after it. */
	let extendedPath = null;
	while (offset + 512 <= buffer.length) {
		const header = buffer.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const name = cstring(header.subarray(0, 100));
		const prefix = cstring(header.subarray(345, 500));
		const size = parseOctal(header.subarray(124, 136));
		const typeflag = String.fromCharCode(header[156] ?? 0);
		const data = buffer.subarray(offset + 512, offset + 512 + size);
		offset += 512 + Math.ceil(size / 512) * 512;
		if (typeflag === "x") {
			extendedPath = pathFromPax(data) ?? extendedPath;
			continue;
		}
		if (typeflag === "L") {
			extendedPath = cstring(data);
			continue;
		}
		const path = extendedPath ?? (prefix === "" ? name : `${prefix}/${name}`);
		extendedPath = null;
		if (typeflag === "0" || typeflag === "\0") files.set(assertContained(path), data);
	}
	return files;
}
/**
* The `path` record of a pax extended header, in the reader's spelling, or null
* where the header names none.
*
* A pax record is `<length> <key>=<value>\n`, where `<length>` counts the whole
* record in bytes, its own digits included. The value is UTF-8 text, and the
* reader spells a name one character for each byte.
*/
function pathFromPax(data) {
	let at = 0;
	while (at < data.length) {
		const space = data.indexOf(32, at);
		if (space === -1) return null;
		const length = Number.parseInt(data.subarray(at, space).toString("latin1"), 10);
		if (!Number.isSafeInteger(length) || length <= 0 || at + length > data.length) return null;
		const record = data.subarray(at, at + length);
		const equals = record.indexOf(61, space - at);
		if (equals !== -1) {
			if (record.subarray(space - at + 1, equals).toString("utf8") === "path") {
				const end = record[record.length - 1] === 10 ? record.length - 1 : record.length;
				return record.subarray(equals + 1, end).toString("latin1");
			}
		}
		at += length;
	}
	return null;
}
//#endregion
//#region src/host/npm-origin.ts
/** The npm transport (design §2, §3): the catalog as a package.
*
* Shell — this and `origin.ts`'s fetch half are the only places the catalog
* loader touches the network. The payoff is measured, not assumed: the same
* bytes reach a China-side machine at 12.53 MB/s from npmmirror against
* 0.03 MB/s from GitHub Pages. */
/** The abbreviated `latest` manifest. Non-strict: a registry may add keys,
* and stripping them is what keeps an old host working against a new one. */
const latestSchema = z.object({
	version: z.string(),
	dist: z.object({
		tarball: z.string(),
		integrity: z.string()
	})
});
/** Where the published package keeps the catalog tree (design §2). */
const PACKAGE_ROOT = "package/v1/";
/** Maximum compressed package bytes read from a registry. */
const MAX_PACKAGE_BYTES = 33554432;
/** Maximum bytes allowed after gzip inflation. */
const MAX_INFLATED_BYTES = MAX_BODY_BYTES;
/** Verify tarball bytes against npm's own Subresource-Integrity string.
* `dist.integrity` may carry several space-separated digests; npm publishes
* one, and the first is the one we check. */
function verifyIntegrity(bytes, integrity, registryUrl) {
	const first = integrity.trim().split(/\s+/)[0] ?? "";
	const dash = first.indexOf("-");
	const algorithm = dash === -1 ? "" : first.slice(0, dash);
	const expected = dash === -1 ? "" : first.slice(dash + 1);
	if (algorithm !== "sha512" && algorithm !== "sha256") throw new TransportError(`npm origin ${registryUrl}: unsupported dist.integrity algorithm ${JSON.stringify(algorithm)}`);
	if (createHash(algorithm).update(bytes).digest("base64") !== expected) throw new TransportError(`npm origin ${registryUrl}: tarball failed dist.integrity check (${algorithm})`);
}
/** Normalise to a trailing slash so relative `URL` resolution against a
* registry that carries a path — every corporate registry, e.g.
* `https://artifactory.corp/api/npm/npm-repo` — keeps that path instead of
* eating its last segment; a host-root registry's trailing slash is already
* a no-op either way. Exported so `catalog.ts`'s dedupe compares against the
* same normalised form `npmOrigin` races on. */
function normalizeRegistryUrl(url) {
	return url.endsWith("/") ? url : `${url}/`;
}
/**
* An origin that reads the catalog out of `<registryUrl>`'s copy of
* `<packageName>`.
*
* The probe is the abbreviated `latest` manifest — 13.5 KB against the live
* registry — so the race is decided without downloading anything large. The
* tarball is fetched lazily on the first `pointer()` or `file()` and kept on
* the handle, so one origin download serves the whole load.
*/
function npmOrigin(rawRegistryUrl, packageName, fetchImpl) {
	const registryUrl = normalizeRegistryUrl(rawRegistryUrl);
	const id = `npm:${registryUrl}`;
	return {
		id,
		async probe(signal) {
			let url;
			try {
				url = new URL(`${encodeURIComponent(packageName)}/latest`, registryUrl).href;
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new TransportError(`npm origin ${registryUrl} is not a usable registry url: ${detail}`, { cause: error });
			}
			let response;
			try {
				response = await fetchImpl(url, { signal });
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new TransportError(`npm origin ${registryUrl} probe failed: ${detail}`, { cause: error });
			}
			if (!response.ok) throw new TransportError(`npm origin ${registryUrl} returned ${response.status}`);
			let manifest;
			try {
				manifest = latestSchema.parse(await response.json());
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new TransportError(`npm origin ${registryUrl} returned an unparsable manifest: ${detail}`, { cause: error });
			}
			let files = null;
			const load = async (loadSignal) => {
				if (files !== null) return files;
				let tarballUrl;
				try {
					tarballUrl = new URL(manifest.dist.tarball);
				} catch (error) {
					const detail = error instanceof Error ? error.message : String(error);
					throw new TransportError(`npm origin ${registryUrl}: dist.tarball is not a valid url: ${detail}`, { cause: error });
				}
				if (tarballUrl.origin !== new URL(registryUrl).origin) throw new TransportError(`npm origin ${registryUrl}: dist.tarball host ${tarballUrl.origin} is not the registry's`);
				let tarballResponse;
				try {
					tarballResponse = await fetchImpl(tarballUrl.href, loadSignal === void 0 ? void 0 : { signal: loadSignal });
				} catch (error) {
					const detail = error instanceof Error ? error.message : String(error);
					throw new TransportError(`npm origin ${registryUrl} tarball fetch failed: ${detail}`, { cause: error });
				}
				if (!tarballResponse.ok) throw new TransportError(`npm origin ${registryUrl} tarball returned ${tarballResponse.status}`);
				const declaredLength = Number(tarballResponse.headers.get("content-length"));
				if (Number.isFinite(declaredLength) && declaredLength > 33554432) throw new TransportError(`npm origin ${registryUrl} tarball exceeded the ${MAX_PACKAGE_BYTES}-byte cap`);
				const bytes = await readCappedBytes(tarballResponse, `npm origin ${registryUrl} tarball`, MAX_PACKAGE_BYTES);
				verifyIntegrity(bytes, manifest.dist.integrity, registryUrl);
				let parsed;
				try {
					parsed = readTar(gunzipSync(bytes, { maxOutputLength: MAX_INFLATED_BYTES }));
				} catch (error) {
					const detail = error instanceof Error ? error.message : String(error);
					if (error.code === "ERR_BUFFER_TOO_LARGE" || /larger than|too large/i.test(detail)) throw new TransportError(`npm origin ${registryUrl}: the tarball inflates past the ${MAX_INFLATED_BYTES}-byte cap; refusing to read it`, { cause: error });
					throw new TransportError(`npm origin ${registryUrl} served an unparsable tarball: ${detail}`, { cause: error });
				}
				files = parsed;
				return files;
			};
			const read = async (name, readSignal) => {
				const entry = (await load(readSignal)).get(`${PACKAGE_ROOT}${name}`);
				if (entry === void 0) throw new TransportError(`npm origin ${registryUrl}: ${name} is not in the catalog package`);
				return entry.toString("utf8");
			};
			return {
				id,
				pointer: async () => read("index.json"),
				file: async (url, fileSignal) => {
					if (url.includes("/") || url.startsWith(".")) throw new Error(`npm origin ${registryUrl}: ${JSON.stringify(url)} must be a plain file name`);
					return read(url, fileSignal);
				}
			};
		}
	};
}
//#endregion
//#region src/host/race.ts
/**
* Yield each promise's outcome as it settles, tagged with its argument index.
*
* Deliberately NOT an `async function*`. Two properties depend on that:
*
* 1. **Handlers attach synchronously, at call time.** An async generator's
*    body does not run until its first `next()`, so wiring the handlers
*    inside one would leave a rejection unhandled for as long as the caller
*    waits before iterating — which crashes the process under Node's default
*    unhandled-rejection policy.
* 2. **Order is recorded when each promise settles**, not when a consumer
*    asks. Re-racing the survivors on every turn tie-breaks on argument
*    order instead: `Promise.race` over promises that are ALREADY settled
*    resolves with the first in iteration order, not the first to have
*    settled — and a consumer doing any work between yields, which is
*    exactly this module's use case, is what lets two settle inside one turn.
*/
function inCompletionOrder(promises) {
	const settled = [];
	let wake = null;
	const record = (outcome) => {
		settled.push(outcome);
		const resume = wake;
		wake = null;
		resume?.();
	};
	for (const [index, promise] of promises.entries()) promise.then((value) => {
		record({
			index,
			value
		});
	}, (reason) => {
		record({
			index,
			reason
		});
	});
	return (async function* () {
		for (let delivered = 0; delivered < promises.length; delivered += 1) {
			if (settled.length === delivered) await new Promise((resolve) => {
				wake = resolve;
			});
			const outcome = settled[delivered];
			if (outcome === void 0) throw new Error("inCompletionOrder: woke with nothing settled");
			yield outcome;
		}
	})();
}
//#endregion
//#region src/shared/identity.ts
/**
* One entry's install identity, defined once for both halves of the package.
*
* `name` is not an identity. The registry's uniqueness rule is `npm:<name>`
* for an npm entry and `github:<repo>#<subdir>` for a repository entry, so
* two repositories publishing the same package name remain distinct.
*/
/** The registry's uniqueness rule, shared with the presentation layer. */
function identityKey(identity) {
	return identity.source === "npm" ? `npm:${identity.name}` : `github:${identity.repo ?? identity.name}#${identity.subdir ?? ""}`;
}
/** A GitHub commit pin. */
const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** A GitHub release tag accepted as the version/pin of a rescued entry. */
const RELEASE_TAG = /^[A-Za-z0-9][A-Za-z0-9._+/-]{0,127}$/;
/** `owner/slug` inside a GitHub reference. */
const REPO = "([\\w.-]+)\\/([\\w.-]+?)";
const GITHUB_SHORTHAND = new RegExp(`^github:${REPO}(?:[#&].*)?$`);
const GITHUB_URL = new RegExp(`^(?:git\\+)?https?:\\/\\/(?:www\\.)?github\\.com\\/${REPO}(?:\\.git)?(?:[\\/?#].*)?$`);
/**
* Attribute a profile dependency spec to where its package came from.
*
* The single parse: every other function here reads its answer rather than
* re-applying the regexes, so the grammar cannot be widened in one place and
* not the other.
*
* `null` means this spec is a form the grammar does not cover — `git+ssh://`,
* `git@github.com:`, a `file:`/`link:` checkout, `workspace:*`, an `npm:`
* alias to a different package, a non-GitHub URL. Attribution is POSITIVE on
* both arms and null is never guessed away: reading an unattributable spec as
* npm is what let an npm entry silently replace a git install, and what
* printed "already installed from the npm package X" about a local checkout.
*/
function parseSpec(spec) {
	if (spec.trim() === "") return null;
	const shorthand = GITHUB_SHORTHAND.exec(spec);
	if (shorthand?.[1] !== void 0 && shorthand[2] !== void 0) return {
		kind: "github",
		repo: `${shorthand[1]}/${shorthand[2]}`
	};
	const url = GITHUB_URL.exec(spec);
	if (url?.[1] !== void 0 && url[2] !== void 0) return {
		kind: "github",
		repo: `${url[1]}/${url[2]}`
	};
	return validRange(spec) !== null ? { kind: "npm" } : null;
}
/**
* Whether two identities of the SAME bundle name are the same install.
*
* Deliberately coarser than `identityKey`: a profile records a dependency
* spec, which carries the repository but not the subdirectory, so this is the
* finest distinction the installed state can actually support. It ignores
* `name` — every caller has already matched on it — and answers only "is the
* thing under that name this one, or a different one?".
*/
function sameInstall(a, b) {
	if (a.source !== b.source) return false;
	if (a.source === "npm") return true;
	return a.repo !== void 0 && a.repo.toLowerCase() === b.repo?.toLowerCase();
}
function specVerdict(entry, spec) {
	const origin = parseSpec(spec);
	if (origin === null) return "unknown";
	return sameInstall(entry, origin.kind === "npm" ? {
		source: "npm",
		name: entry.name
	} : {
		source: "github",
		name: entry.name,
		repo: origin.repo
	}) ? "same" : "different";
}
/**
* Whether an installed dependency spec may be shown as this catalog entry's
* row — the DISPLAY default of {@link specVerdict}.
*
* An unattributable spec still needs exactly one row to represent it, or the
* same dependency shows twice under two same-named entries and the uninstall
* control appears on both. The npm entry claims it: it is the shape with
* nothing else to distinguish it, and this is the tie-break the installed
* list has always used.
*/
function installedSpecMatches(entry, spec) {
	const verdict = specVerdict(entry, spec);
	return verdict === "unknown" ? entry.source === "npm" : verdict === "same";
}
/** How long a raw spec may be when it is quoted back to a reader as the thing
* holding a name. A profile manifest is not ours; a pathological value must
* not become a wall of text in a rejection detail or a card. */
const HOLDER_SPEC_CAP = 80;
/**
* The token naming whatever holds a bundle name, for someone deciding what to
* do about it.
*
* One function for both halves. The host's refusal and the card's badge wrap
* it in their own sentence — the host in English prose, the card in the
* reader's language — but the token itself is identical, so the two surfaces
* can never name one plugin two ways. It is language-neutral for that reason:
* a github holder is its repository (the only thing that tells it apart from
* the entry it blocks), an npm holder is `npm:<name>`, and a spec we cannot
* attribute is quoted verbatim, because saying which string is in the way is
* the only honest thing left to say about it.
*/
function holderLabel(spec, name) {
	const origin = parseSpec(spec);
	if (origin?.kind === "github") return origin.repo;
	if (origin?.kind === "npm") return `npm:${name}`;
	if (spec.trim() === "") return "\"\"";
	return spec.length > HOLDER_SPEC_CAP ? `${spec.slice(0, 79)}…` : spec;
}
//#endregion
//#region src/shared/npm-name.ts
/**
* The npm package-name grammar a catalogue row's `name` must satisfy.
*
* ONE definition, read in three places: the Host's entry schema
* (`host/catalog.ts`), the registry's gate (`registry/scripts/src/gate.ts`)
* and `emit`'s last-line invariant. The dependency can only point this way —
* the package's tsconfig pins `rootDir: "src"`, so the registry reaches in
* and nothing here can reach out (the same reason `shop-like.ts` lives here).
*
* Why it is narrower than npm's own rule: `validate-npm-package-name` accepts
* a scope beginning with `_` or `.` — `@_iluxury/dsh-routerai-price-watcher`
* is valid for a NEW publication — while this grammar requires the scope's
* first character to be a letter or digit. That was a deliberate argv-safety
* choice when the rule lived only in the client: the name becomes half of an
* install spec, and everything this excludes is shell punctuation. It stopped
* being merely a client rule the moment a catalogue shipped, because the
* clients parse the WHOLE data file as one zod object: a single name outside
* this grammar costs every listing, not one. On 2026-10-30
* `@_iluxury/dsh-routerai-price-watcher` did exactly that — valid on npm, no
* gate rule to catch it, and every 0.8.0+ shop answered 「暂时无法读取目录」
* for a 21,493-row catalogue. The gate now admits only what this parses.
*
* The narrow side is therefore the WIRE CONTRACT, frozen by the installed
* base: widening it in a client release also widens the gate, because this is
* one constant, and the catalogue would then carry names every older client
* still refuses. Do not widen it without a way to know which client versions
* are installed; npm's per-version download counts cannot answer that (the
* measurement is in `emit.ts`'s `peers` comment).
*
* @module shared/npm-name
*/
/**
* An optional `@scope/`, then a name starting with a letter or digit and
* continuing in lowercase letters, digits, `.`, `_` or `-`. No uppercase, no
* leading dot or underscore on either segment, and no shell punctuation.
*/
const CATALOG_NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
/** A cached catalog younger than this is served without touching the network. */
const FRESH_MS = 3e5;
/** How long a probe may take before the race gives up on that origin. Long
* enough for a slow but working link, short enough that a black-holed origin
* does not hold the shelf closed. */
const PROBE_TIMEOUT_MS = 1e4;
/** How long the committed origin has to produce its pointer. `httpOrigin`
* answers instantly — its probe already fetched the bytes — but `npmOrigin`
* downloads its tarball here, so this is a bulk-transfer budget, not a probe
* one. Without it a winner that stalls mid-body parks the race forever while
* healthy origins sit settled and unread, which is the exact failure the race
* exists to prevent. Generous against every measured npm origin (12.53 MB/s
* mirror -> 0.12 s for 1.5 MB; npmjs direct 1.99 MB/s -> 0.75 s). */
const COMMIT_TIMEOUT_MS = 3e4;
/** Run one committed-origin read under a deadline and abort it on expiry. */
async function withCommitBudget(id, what, start) {
	const controller = new AbortController();
	let timer;
	try {
		return await Promise.race([start(controller.signal), new Promise((_resolve, reject) => {
			timer = setTimeout(() => {
				const expired = new TransportError(`${id} did not ${what} within ${COMMIT_TIMEOUT_MS} ms`);
				controller.abort(expired);
				reject(expired);
			}, COMMIT_TIMEOUT_MS);
		})]);
	} finally {
		clearTimeout(timer);
	}
}
/** Canonical SemVer 2.0.0, including legal prerelease/build metadata. */
const NPM_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
/** The repository binding used to build a GitHub install spec. */
const REPO_FULL_NAME = /^[\w.-]+\/[\w.-]+$/;
/** Records when the loader itself wrote the cache; the pointer's `builtAt` is
* the catalog's build time, not the cache's fetch time. */
const META_FILE = "index.meta.json";
/**
* The grammar a pointer's file url must satisfy to name a cache file.
*
* `basename()` was the derivation and cannot be: the url is untrusted wire
* data, and on untrusted input `basename` is neither confining nor
* platform-independent.
*
*  - `basename('.')` is `.`, and `join(cacheDir, '.')` collapses to `cacheDir`
*    itself — so the data-file write landed on the cache DIRECTORY and
*    `writeFileSync` answered EISDIR. `resolveDataUrl` admits the url (`new
*    URL('.', base)` IS `base`, so the origin check passes), which is how a
*    pointer reached it.
*  - `win32.basename('a\\b.json')` is `b.json` while `posix.basename` of the
*    same string is the whole string, so the cache file one pointer names
*    differed per platform for a url the WHATWG parser normalises the same way
*    everywhere. Two hosts sharing a cacheDir disagreed about what was cached.
*
* So: a plain file name, tested rather than derived, and deliberately narrow —
* no separator in either spelling, no leading dot (which excludes `.` and
* `..`), no colon, no percent. Every catalog this project publishes names
* `plugins.<sha256>.json` and `stars.<sha256>.json`, and `npmOrigin.file()`
* has always refused anything else outright. This is the http transport
* adopting the npm transport's rule, not a new one — before it the two
* disagreed about the same pointer, which design §2 ("one build, two
* transports, one snapshot") does not allow.
*/
const POINTER_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** The cache file a pointer url names — one derivation for all four sites, so
* the path a load WRITES and the path the next boot READS cannot drift apart.
* Throws on a url outside the grammar; the caller decides whether that is
* loud (the plugins url, which is pointer interpretation) or advisory (the
* stars sidecar, spec §5). */
function cachePath(cacheDir, url, what) {
	if (!POINTER_FILE_NAME.test(url)) throw new Error(`catalog ${what} url ${JSON.stringify(url)} must be a plain file name`);
	return join(cacheDir, url);
}
const entrySchema = z.object({
	name: z.string().min(1).max(214).regex(/^[^\u0000-\u001f\u007f]+$/, "entry name carries a control character"),
	version: z.string().min(1).max(256),
	integrity: z.string().nullable(),
	publishedAt: z.string().nullable(),
	repository: z.string().nullable(),
	license: z.string().nullable(),
	tier: z.enum([
		"verified",
		"verified-stale",
		"community"
	]),
	metadata: z.enum(["declared", "derived"]),
	review: z.object({
		reviewedVersion: z.string().optional(),
		reviewedCommit: z.string().optional(),
		reviewedSha256: z.string().optional(),
		repo: z.string().optional(),
		reviewer: z.string(),
		reviewCommit: z.string(),
		notes: z.string()
	}).optional(),
	catalog: z.object({
		category: z.enum([
			"tool",
			"provider",
			"ui",
			"workflow",
			"integration",
			"theme",
			"other"
		]),
		summary: z.object({
			en: z.string(),
			zh: z.string().optional()
		}),
		capabilities: z.array(z.string())
	}).optional(),
	source: z.enum(["npm", "github"]).default("npm"),
	repo: z.string().regex(REPO_FULL_NAME, "repo must be owner/slug").optional(),
	subdir: z.string().regex(/^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/).optional(),
	added: z.string().optional(),
	tarball: z.object({
		url: z.string(),
		sha256: z.string().regex(/^[0-9a-f]{64}$/)
	}).optional(),
	publisher: z.string().optional(),
	peers: z.array(z.string()).optional(),
	compatibility: z.object({
		dsh: z.string().optional(),
		profiles: z.array(z.string()).optional()
	}).optional(),
	dshPeers: z.record(z.string(), z.string()).optional(),
	manifestVersion: z.string().optional(),
	engines: z.string().optional(),
	dependencies: z.number().int().nonnegative().optional(),
	bin: z.array(z.string()).optional(),
	installScripts: z.boolean().optional(),
	unpackedSize: z.number().int().nonnegative().optional(),
	installSize: z.number().int().nonnegative().optional(),
	archived: z.boolean().optional(),
	forked: z.boolean().optional(),
	icon: z.string().regex(/^[0-9a-f]{64}$/).optional()
}).superRefine((entry, ctx) => {
	if (entry.source === "npm") {
		if (!CATALOG_NPM_NAME.test(entry.name)) ctx.addIssue({
			code: "custom",
			path: ["name"],
			message: `npm entry name ${JSON.stringify(entry.name)} is outside npm package-name grammar`
		});
		if (!NPM_VERSION.test(entry.version)) ctx.addIssue({
			code: "custom",
			path: ["version"],
			message: `npm entry version ${JSON.stringify(entry.version)} is not a plain semver version`
		});
		return;
	}
	if (entry.repo === void 0) ctx.addIssue({
		code: "custom",
		path: ["repo"],
		message: "a github entry must carry its repo — it is the entry's identity and the spec is built from it"
	});
	if (entry.unpackedSize !== void 0) ctx.addIssue({
		code: "custom",
		path: ["unpackedSize"],
		message: "a github entry carries no unpacked size — GitHub measures the repository, not the install"
	});
	if (!COMMIT_SHA.test(entry.version) && !RELEASE_TAG.test(entry.version)) ctx.addIssue({
		code: "custom",
		path: ["version"],
		message: `github entry version ${JSON.stringify(entry.version)} is neither a 40-character commit sha nor a release tag`
	});
}).transform((entry) => entry.installSize === void 0 && entry.unpackedSize !== void 0 ? {
	...entry,
	installSize: entry.unpackedSize
} : entry);
const dataSchema = z.object({
	schemaVersion: z.number(),
	plugins: z.array(entrySchema),
	denied: z.array(z.object({
		name: z.string(),
		detail: z.string(),
		replacement: z.string().optional()
	})).default([]),
	/** Names the client's shop-like NAME filter must NOT hide: entries whose
	* name reads like a competing plugin market but which are not one
	* (registry/not-a-shop.yml). Defaulted, so a catalog built before this key
	* existed still parses — the data file is non-strict for the same reason
	* the pointer is. */
	notAShop: z.array(z.string()).default([])
});
/** The tarball URL must be the entry's own GitHub release — path segments
* `/<owner>/<repo>/releases/...` matching the entry's `repo` (case-
* insensitive). A catalog row that names a trusted repo but installs an
* archive from somewhere else is refused loudly, never installed
* (dsh-market's release-binding rule, their sources.ts:16-49). */
function validateEntryCoherence(entries) {
	for (const entry of entries) {
		if (entry.tarball === void 0) continue;
		if (entry.source !== "github" || entry.repo === void 0) throw new Error(`catalog entry ${entry.name}: tarball requires a github entry with a repo`);
		let parsed;
		try {
			parsed = new URL(entry.tarball.url);
		} catch {
			throw new Error(`catalog entry ${entry.name}: tarball url is unparseable`);
		}
		if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") throw new Error(`catalog entry ${entry.name}: tarball url must be https on github.com`);
		if (parsed.search !== "" || parsed.hash !== "") throw new Error(`catalog entry ${entry.name}: tarball url must carry no query or fragment`);
		const segments = parsed.pathname.split("/").filter((s) => s !== "");
		if (`${segments[0] ?? ""}/${segments[1] ?? ""}`.toLowerCase() !== entry.repo.toLowerCase() || segments[2] !== "releases") throw new Error(`catalog entry ${entry.name}: tarball url is not a release of ${entry.repo}`);
	}
}
const pointerSchema = z.object({
	schemaVersion: z.number(),
	builtAt: z.string(),
	count: z.number(),
	plugins: z.object({
		url: z.string(),
		sha256: z.string()
	}),
	stars: z.object({
		url: z.string(),
		sha256: z.string()
	}).optional(),
	icons: z.object({
		url: z.string(),
		sha256: z.string()
	}).optional()
});
const nodeFs$1 = {
	exists: (path) => existsSync(path),
	read: (path) => readFileSync(path, "utf8"),
	write: (path, data) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, data);
	}
};
/** Read and verify a cached/fetched stars sidecar; ANY irregularity degrades
* to an empty map — stars are advisory (spec §5). */
function parseStarsText(text) {
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed.stars !== "object" || parsed.stars === null) return {};
		const out = Object.create(null);
		for (const [key, value] of Object.entries(parsed.stars)) if (typeof value === "number") out[key] = value;
		return out;
	} catch {
		return {};
	}
}
/** The longest a data URL holding MAX_CATALOG_ICON_BYTES can be: the base64
* alphabet is 4 characters per 3 bytes, and the prefix is the longest of the
* four media types' spellings. */
const MAX_ICON_DATA_URL_LENGTH = 26 + Math.ceil(32768 / 3) * 4;
/** The four types a catalogue icon can have (design §6.1); nothing else
* reaches an `img.src`. */
const ICON_DATA_URL = /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/**
* Read and verify an icons sidecar; ANY irregularity degrades to no icons —
* icons are presentation, and they never cost the reader the catalog (§7).
* The checks are the grammar the build writes: a 64-hex sha256 keying a
* `data:` URL of the four types, each within the per-icon bound.
*/
function parseIconsText(text) {
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed.icons !== "object" || parsed.icons === null || Array.isArray(parsed.icons)) return {};
		const out = Object.create(null);
		for (const [key, value] of Object.entries(parsed.icons)) {
			if (!/^[0-9a-f]{64}$/.test(key)) return {};
			if (typeof value !== "string" || value.length > MAX_ICON_DATA_URL_LENGTH || !ICON_DATA_URL.test(value)) return {};
			out[key] = value;
		}
		return out;
	} catch {
		return {};
	}
}
/**
* Load the catalog snapshot: fetch the pointer, verify the data file's sha256
* against it, cache both on disk, and serve the cached copy with `stale: true`
* only when the transport itself failed — the fetch threw or returned a
* non-2xx (§10). A schemaVersion higher than this build supports, a malformed
* pointer or data file, an absolute data URL, or a sha256 mismatch — fresh or
* cached — throws even when a cache exists; never silently degraded. The stars
* sidecar is the sole exception: any irregularity there, a refused url
* included, degrades to no stars (spec §5).
*/
async function loadCatalog(options) {
	const { cacheDir, refresh = false, fetchImpl = fetch, now = () => /* @__PURE__ */ new Date(), fsImpl = nodeFs$1 } = options;
	if (options.baseUrl === void 0 === (options.origins === void 0)) throw new Error("loadCatalog: exactly one of baseUrl or origins is required");
	const originList = options.origins ?? [httpOrigin(options.baseUrl, fetchImpl)];
	if (originList.length === 0) throw new Error("loadCatalog: no origins");
	const indexPath = join(cacheDir, "index.json");
	const metaPath = join(cacheDir, META_FILE);
	/** The timestamp freshness is measured from: the sidecar's fetch time when
	* it exists and parses, else the pointer's builtAt when that parses, else
	* null ("no usable freshness fact"). */
	const freshnessTimeOf = (builtAt) => {
		if (fsImpl.exists(metaPath)) try {
			const fetchedAt = Date.parse(JSON.parse(fsImpl.read(metaPath)).fetchedAt);
			if (!Number.isNaN(fetchedAt)) return fetchedAt;
		} catch {}
		const built = Date.parse(builtAt);
		return Number.isNaN(built) ? null : built;
	};
	const readCached = () => {
		let pointer;
		let data;
		try {
			pointer = pointerSchema.parse(JSON.parse(fsImpl.read(indexPath)));
			if (pointer.schemaVersion > 6) throw new Error(`catalog schemaVersion ${pointer.schemaVersion} is newer than this build supports (6)`);
			const dataPath = cachePath(cacheDir, pointer.plugins.url, "data");
			const dataText = fsImpl.read(dataPath);
			const actual = createHash("sha256").update(dataText).digest("hex");
			if (actual !== pointer.plugins.sha256) throw new Error(`cached catalog data failed integrity check: expected ${pointer.plugins.sha256}, got ${actual}`);
			data = dataSchema.parse(JSON.parse(dataText));
			if (data.schemaVersion > 6) throw new Error(`catalog schemaVersion ${data.schemaVersion} is newer than this build supports (6)`);
		} catch {
			return null;
		}
		validateEntryCoherence(data.plugins);
		let stars = {};
		if (pointer.stars !== void 0) try {
			const starsText = fsImpl.read(cachePath(cacheDir, pointer.stars.url, "stars"));
			if (createHash("sha256").update(starsText).digest("hex") === pointer.stars.sha256) stars = parseStarsText(starsText);
		} catch {}
		let icons = {};
		if (pointer.icons !== void 0) try {
			const iconsText = fsImpl.read(cachePath(cacheDir, pointer.icons.url, "icons"));
			if (createHash("sha256").update(iconsText).digest("hex") === pointer.icons.sha256) icons = parseIconsText(iconsText);
		} catch {}
		return {
			schemaVersion: pointer.schemaVersion,
			builtAt: pointer.builtAt,
			entries: data.plugins,
			denied: data.denied,
			notAShop: data.notAShop,
			stars,
			icons
		};
	};
	if (!refresh && fsImpl.exists(indexPath)) {
		const cached = readCached();
		if (cached !== null) {
			const fetchedAt = freshnessTimeOf(cached.builtAt);
			if (fetchedAt !== null && now().getTime() - fetchedAt < FRESH_MS) return {
				snapshot: cached,
				stale: false
			};
		}
	}
	const cachedOrThrow = (error) => {
		const cached = readCached();
		if (cached !== null) return {
			snapshot: cached,
			stale: true
		};
		throw error;
	};
	let handle = null;
	let pointerText = "";
	let lastTransportError = new TransportError("no catalog origin was reachable");
	for await (const settled of inCompletionOrder(originList.map((origin) => origin.probe(AbortSignal.timeout(PROBE_TIMEOUT_MS))))) {
		if (!("value" in settled)) {
			if (!(settled.reason instanceof TransportError)) throw settled.reason;
			lastTransportError = settled.reason;
			continue;
		}
		try {
			pointerText = await withCommitBudget(settled.value.id, "produce a pointer", () => settled.value.pointer());
			handle = settled.value;
			break;
		} catch (error) {
			if (!(error instanceof TransportError)) throw error;
			lastTransportError = error;
		}
	}
	if (handle === null) return cachedOrThrow(lastTransportError);
	const pointer = pointerSchema.parse(JSON.parse(pointerText));
	if (pointer.schemaVersion > 6) throw new Error(`catalog schemaVersion ${pointer.schemaVersion} is newer than this build supports (6)`);
	const dataCachePath = cachePath(cacheDir, pointer.plugins.url, "data");
	let dataText;
	try {
		dataText = await withCommitBudget(handle.id, `serve ${pointer.plugins.url}`, (signal) => handle.file(pointer.plugins.url, signal));
	} catch (error) {
		if (!(error instanceof TransportError)) throw error;
		return cachedOrThrow(error);
	}
	const actual = createHash("sha256").update(dataText).digest("hex");
	if (actual !== pointer.plugins.sha256) throw new Error(`catalog data failed integrity check: expected ${pointer.plugins.sha256}, got ${actual}`);
	const data = dataSchema.parse(JSON.parse(dataText));
	if (data.schemaVersion > 6) throw new Error(`catalog schemaVersion ${data.schemaVersion} is newer than this build supports (6)`);
	validateEntryCoherence(data.plugins);
	let stars = {};
	if (pointer.stars !== void 0) {
		const sidecar = pointer.stars;
		try {
			const starsCachePath = cachePath(cacheDir, sidecar.url, "stars");
			const starsText = await withCommitBudget(handle.id, `serve ${sidecar.url}`, (signal) => handle.file(sidecar.url, signal));
			if (createHash("sha256").update(starsText).digest("hex") === sidecar.sha256) {
				stars = parseStarsText(starsText);
				fsImpl.write(starsCachePath, starsText);
			}
		} catch {}
	}
	let icons = {};
	if (pointer.icons !== void 0) {
		const sidecar = pointer.icons;
		try {
			const iconsCachePath = cachePath(cacheDir, sidecar.url, "icons");
			const iconsText = await withCommitBudget(handle.id, `serve ${sidecar.url}`, (signal) => handle.file(sidecar.url, signal));
			if (createHash("sha256").update(iconsText).digest("hex") === sidecar.sha256) {
				icons = parseIconsText(iconsText);
				fsImpl.write(iconsCachePath, iconsText);
			}
		} catch {}
	}
	const snapshot = {
		schemaVersion: pointer.schemaVersion,
		builtAt: pointer.builtAt,
		entries: data.plugins,
		denied: data.denied,
		notAShop: data.notAShop,
		stars,
		icons
	};
	try {
		fsImpl.write(dataCachePath, dataText);
		fsImpl.write(indexPath, JSON.stringify(pointer));
		fsImpl.write(metaPath, JSON.stringify({ fetchedAt: now().toISOString() }));
	} catch {}
	return {
		snapshot,
		stale: false
	};
}
/** The npm package carrying the same `v1/` tree (design §2). */
const CATALOG_PACKAGE = "dsh-plugin-shop-catalog";
/** Registries raced by default: the domestic mirror first for legibility —
* the race, not the order, decides the winner. */
const DEFAULT_REGISTRIES = ["https://registry.npmmirror.com/", "https://registry.npmjs.org/"];
/**
* The origins to race for this installation (design §3).
*
* @param catalogUrl - the row's configured base.
* @param npmRegistry - the user's own registry from `~/.npmrc`, or null.
*/
function catalogOrigins(catalogUrl, fetchImpl, npmRegistry) {
	if (catalogUrl !== "https://LivXue.github.io/dsh-plugin-shop/v1/") return [httpOrigin(catalogUrl, fetchImpl)];
	const registries = [...DEFAULT_REGISTRIES];
	const normalizedNpmRegistry = npmRegistry === null ? null : normalizeRegistryUrl(npmRegistry);
	if (normalizedNpmRegistry !== null && !registries.includes(normalizedNpmRegistry)) registries.unshift(normalizedNpmRegistry);
	return [...registries.map((registry) => npmOrigin(registry, CATALOG_PACKAGE, fetchImpl)), httpOrigin(catalogUrl, fetchImpl)];
}
//#endregion
//#region src/host/npmrc.ts
/** The user's configured npm registry, if they have one (design §3).
*
* Pure: the caller injects the read. This is a deliberately partial reading
* of npm's config resolution — only the user-level `registry=` line — and
* that is safe precisely because the origin list is raced: a registry we
* guess wrong about loses a 400-byte request and nothing else.
*
* That property only holds for a value that is actually a URL, which is why
* the value is VALIDATED here rather than left to the caller. `npmOrigin`
* addresses its probe with `new URL(<pkg>/latest, registryUrl)`, which
* throws a raw `TypeError` — not a `TransportError` — for anything that is
* not an absolute URL, and `catalog.ts`'s race loop rethrows everything that
* is not a `TransportError`. An unvalidated `registry=` line would therefore
* fail the WHOLE load with npmmirror, npmjs and Pages all healthy and no
* cache fallback: the opposite of the stated property. Not a hypothetical
* shape either — `registry=${NPM_REGISTRY}/` is npm's own documented config
* expansion, it works perfectly for npm, and a reader that does not expand
* it captures the literal. */
/** The value, if it is an absolute `http:`/`https:` URL; otherwise null.
*
* Both halves earn their place. The parse rejects a bare host, a relative
* path, and an unexpanded `${VAR}`. The scheme check then rejects what
* `new URL` happily accepts but the raced origins cannot fetch from —
* `file:` and `ftp:` parse fine and are not registries a `fetch` can read.
* The raw string is returned rather than the parsed href, so the value the
* user wrote is what reaches `normalizeRegistryUrl` and the origin id. */
function asRegistryUrl(value) {
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		return null;
	}
	return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
}
/**
* @param readFile - returns the file's text, or null when it does not exist.
* @param home - the user's home directory.
*/
function npmrcRegistry(readFile, home) {
	const text = readFile(join(home, ".npmrc"));
	if (text === null) return null;
	for (const line of text.split("\n")) {
		const value = /^\s*registry\s*=\s*(\S+)\s*$/.exec(line)?.[1];
		if (value === void 0) continue;
		const url = asRegistryUrl(value);
		if (url !== null) return url;
	}
	return null;
}
//#endregion
//#region src/host/install.ts
/**
* Decide whether an install request may proceed and return the resolved row.
*
* `installedSpec` is the profile manifest's dependency for `args.name`, when
* it has one.
*
* What this refuses is REPLACEMENT, and the mechanism is the manifest key: a
* profile holds one dependency per name, the shop writes `dependencies[name]`,
* so installing a second plugin of that name overwrites the first and a plugin
* the user chose is gone with no notice.
*
* 177 of the catalog's names are claimed by more than one entry, over 461
* entries, `dsh-skill-manager` alone by 14 (2026-09-06). This comment is the
* ONE place that figure is kept, because three copies of it had already
* drifted apart — the design doc said 172/451 and present.ts said 151/243.
* It tracks the ecosystem, so re-derive rather than trust it: group
* `registry/snapshots/manifest.lock` by bundle name, which is field 0 on an
* npm row (`<name> <version> sha512-…`) and field 1 on every github one
* (`<owner/slug> <bundle name> <commit|tag>`) — reading field 1 for all of
* them undercounts by the 176 release-rescued rows.
*
* That is the whole of what the name buys. It is NOT the same rule as the
* loader's, and the two must not be confused — an earlier version of this
* comment and of the published detail said "they declare the same loader entry
* id", which is false for a measurable share of the pairs refused here:
* `Anyway-one/dsh-balance` declares `id: balance` while `ZHIZHU4410/deepseek-
* balance`, also bundle-named `dsh-balance`, declares `id: dsh-balance`. Those
* two would load side by side happily if a profile could hold both.
*
* The loader's own rule cuts the other way and this gate does not reach it:
* two DIFFERENTLY-named bundles declaring one entry id make dsh refuse the
* whole tree —
*
*   Error: dsh: plugin tree failed to load: failed to apply loader entry
*   include (cordis:include): duplicate loader entry id: plugin-manager
*
* — and the profile does not boot at all. `2768651338/dsh-plugin-manager` and
* `Dingpenghui-good/dsh-plugin-manager` carry different bundle names and both
* declare `id: plugin-manager`, so this gate passes them. A candidate's entry
* ids are not knowable before its files are on disk, which is why the check
* for that lives after the install lands rather than here (see
* `collidingEntryId` in index.ts).
*
* Passing the spec in rather than reading the manifest here keeps the whole
* gate a pure function driven by fixtures.
*/
function validateInstall(snapshot, args, installedSpec) {
	const denied = snapshot.denied.find((d) => d.name === args.name);
	if (denied !== void 0) return {
		ok: false,
		code: "denied",
		detail: `dsh-plugin-shop: installation of ${args.name} is blocked: ${denied.detail}`
	};
	let entry;
	if (args.source === void 0) {
		const named = snapshot.entries.filter((e) => e.name === args.name);
		if (named.length > 1) return {
			ok: false,
			code: "ambiguous-identity",
			detail: `dsh-plugin-shop: the catalog has ${named.length} plugins named ${args.name}. Refresh the shop and select the one you want to install.`
		};
		entry = named[0];
	} else {
		const wanted = identityKey({
			source: args.source,
			name: args.name,
			repo: args.repo,
			subdir: args.subdir
		});
		entry = snapshot.entries.find((candidate) => identityKey(candidate) === wanted);
		if (entry === void 0) return {
			ok: false,
			code: "not-in-catalog",
			detail: `dsh-plugin-shop: ${wanted} is not in the catalog`
		};
	}
	if (entry === void 0) return {
		ok: false,
		code: "not-in-catalog",
		detail: `dsh-plugin-shop: ${args.name} is not in the catalog`
	};
	if (entry.version !== args.version) return {
		ok: false,
		code: "version-mismatch",
		detail: `dsh-plugin-shop: you requested ${args.name}@${args.version}, but the catalog lists ${entry.version}. Refresh the shop and try again.`
	};
	if (installedSpec !== void 0) {
		const verdict = specVerdict(entry, installedSpec);
		if (verdict !== "same") {
			const holder = holderLabel(installedSpec, args.name);
			return {
				ok: false,
				code: "name-taken",
				detail: `${verdict === "unknown" ? `dsh-plugin-shop: ${args.name} is already installed from ${holder}. The shop could not match it to a catalog entry.` : `dsh-plugin-shop: ${args.name} is already installed from ${holder}.`} Installing this plugin would replace it, since a profile can hold only one plugin of each name. To switch, uninstall the existing plugin first.`
			};
		}
	}
	if (entry.tier !== "verified" && !args.acknowledged) return {
		ok: false,
		code: "needs-acknowledgement",
		detail: entry.tier === "verified-stale" ? `dsh-plugin-shop: a different version of ${args.name} was reviewed. The current version has not been reviewed. Confirm the installation to continue.` : `dsh-plugin-shop: ${args.name} is a community plugin and has not been reviewed. Confirm the installation to continue.`
	};
	return {
		ok: true,
		entry
	};
}
//#endregion
//#region src/host/dsh-cli.ts
/**
* How to start the dsh CLI as a child process.
*
* On POSIX this is `spawn('dsh', …)` and there is nothing to decide. On
* Windows there is no form of that call which can work: npm installs a CLI as
* `dsh`, `dsh.cmd` and `dsh.ps1` shims with no `.exe`, libuv resolves a bare
* name against `.com` and `.exe` only, and node has refused to spawn a `.cmd`
* without a shell since the 2024 batfile argument-injection fix. Measured on
* Windows 11 with dsh 0.1.1-rc.2 (2026-09-02): the bare name gives ENOENT,
* the resolved `.cmd` shim throws EINVAL *synchronously* out of `spawn()`.
*
* `shell: true` — what the shim exists for, and what dsh's own pnpm spawn
* uses — is not available to us. node hands cmd.exe a joined, UNQUOTED
* command string, and our argv carries catalog data: a `github:` entry's spec
* is `github:owner/slug#<sha>&path:<subdir>`, `&` is a cmd command separator,
* and `subdir` comes from npm. That is a command-injection surface on
* untrusted input, so the shop resolves the CLI's JS entry and runs it through
* node instead — no shell, and node escapes the argv itself.
*
* Pure core, impure shell: `dshCommand` decides, `resolveDshScript` takes the
* process snapshot and a filesystem seam as parameters (the same shape as
* `detectSupervisor(env, proc)` and `RepoPinFs`).
*/
/** The npm package the dsh CLI is published as. */
const DSH_PACKAGE = "@deepseek-ai/dsh";
/** The bin name that package declares (`bin: { dsh: 'lib/bin.js' }`), which is
* also the unscoped name its plain-string `bin` form would take. */
const DSH_BIN_NAME = "dsh";
/**
* Whether dsh's CLI refuses this profile outright: `desktop`, in any letter
* case, "is managed exclusively by the Electron application" — refused for a
* launch and for `dsh plugin` alike (`rejectElectronProfile` in the CLI's
* `lib/bin.js`, the same in 0.1.5-rc.3 and 0.1.7-rc.2). Every command the
* shop spawns names a profile, so none of them can run for this one.
*/
function isDesktopProfile(profile) {
	return profile.toLowerCase() === "desktop";
}
/**
* A `dshBin` that names a JavaScript entry rather than a program.
*
* Such a file cannot be spawned anywhere: Windows needs a PE image, and POSIX
* needs a shebang plus the exec bit that an entry shipped inside a package
* does not reliably carry. The npm-installed CLI's real entry IS one of these
* — `bin: { dsh: 'lib/bin.js' }` — so a caller pinning a specific dsh
* installation has no other file to name, and {@link resolveDshScript} hands
* back exactly this shape for the branch below to run through node.
*
* Platform-independent on purpose. The `dsh` branch is a Windows workaround
* for PATH lookup; this is not a workaround at all but the only correct way
* to start a JS entry, and gating it on Windows would leave a POSIX caller
* with an ENOEXEC naming a file that is perfectly valid.
*
* The one thing it gives up is a `.js` entry whose shebang names some other
* interpreter. `dshBin` names the dsh CLI, which is a node program, so the
* trade is one hypothetical against a shape the CLI actually ships.
*/
const JS_ENTRY = /\.[cm]?js$/;
/**
* The command that starts `bin` through `execPath` when `bin` names a
* JavaScript entry, or `null` when `bin` is a program to spawn as given.
*
* Extracted from {@link dshCommand} so `prefetch.ts` can reach the same
* decision for pnpm without a second copy of {@link JS_ENTRY}: both need it
* for the same two reasons — a packaged JS entry is what a caller pinning an
* installation can name, and a `.mjs` test fixture is the only fake CLI that
* can be spawned on Windows at all.
*/
function jsEntryCommand(bin, args, execPath) {
	if (!JS_ENTRY.test(bin)) return null;
	return {
		command: execPath,
		args: [bin, ...args]
	};
}
/**
* The command that starts the dsh CLI with `args`.
*
* For the bare name the node route replaces exactly one thing: looking `dsh`
* up on PATH, which on Windows can never succeed. A `dshBin` naming a
* specific file is the caller's explicit choice and is spawned as given —
* honoring it and reporting the real failure beats silently running something
* else — with one exception, {@link JS_ENTRY}, where "as given" is not a
* runnable command on any platform and node is what the caller must have
* meant.
*/
function dshCommand(options) {
	const { dshBin, args, platform, execPath, script } = options;
	if (dshBin === DSH_BIN_NAME) {
		if (platform === "win32" && script !== null) return {
			command: execPath,
			args: [script, ...args]
		};
		return {
			command: dshBin,
			args: [...args]
		};
	}
	return jsEntryCommand(dshBin, args, execPath) ?? {
		command: dshBin,
		args: [...args]
	};
}
/** The dsh entry a package manifest declares, or null when this manifest is
* not the dsh CLI. Everything read here is outside our control, so a manifest
* that will not parse is simply not a match. */
function declaredEntry(fs, manifestPath) {
	let parsed;
	try {
		parsed = JSON.parse(fs.read(manifestPath));
	} catch {
		return null;
	}
	const { name, bin } = parsed;
	if (name !== "@deepseek-ai/dsh") return null;
	const declared = typeof bin === "string" ? bin : bin?.[DSH_BIN_NAME];
	if (typeof declared !== "string") return null;
	const entry = join(dirname(manifestPath), declared);
	return fs.exists(entry) ? entry : null;
}
/** The dsh entry declared by the package that OWNS `script` — the nearest
* `package.json` at or above it, and only that one. A script whose owner is
* some other package is not dsh's, so the search stops rather than walking up
* into an unrelated workspace root. */
function owningEntry(fs, script) {
	let dir = dirname(resolve(script));
	for (;;) {
		const manifestPath = join(dir, "package.json");
		if (fs.exists(manifestPath)) return declaredEntry(fs, manifestPath);
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}
/**
* Locate the dsh CLI's JS entry, or null when it cannot be found.
*
* `argv1` first: the shop is loaded BY dsh, so the running script is dsh's own
* entry, and reusing it guarantees the child is the same dsh that is serving
* the shop rather than whichever one PATH happens to name. The owner check is
* what makes this safe to try — under a test runner `argv1` belongs to the
* runner, and accepting it would spawn the wrong program.
*
* Then the shims on PATH: npm installs the package into `node_modules` beside
* them, so the manifest is one join away. This is the branch a test harness
* takes, which is why the real-installation test exercises it.
*/
function resolveDshScript(fs, options) {
	if (options.argv1 !== void 0) {
		const owned = owningEntry(fs, options.argv1);
		if (owned !== null) return owned;
	}
	for (const dir of (options.path ?? "").split(delimiter)) {
		if (dir === "") continue;
		const manifestPath = join(dir, "node_modules", ...DSH_PACKAGE.split("/"), "package.json");
		if (!fs.exists(manifestPath)) continue;
		const entry = declaredEntry(fs, manifestPath);
		if (entry !== null) return entry;
	}
	return null;
}
//#endregion
//#region src/host/compatibility.ts
/** Harness compatibility as the AUTHOR states it: which `dsh.compatibility`
* declarations the running installation does not meet (design
* 2026-09-01-harness-compatibility §8.2, as amended §9.9). The presence check
* in `peers.ts` infers from what a plugin imports; this reads what its author
* wrote down. And, from dsh 0.1.7 on, what dsh ITSELF refuses: the harness
* peers its installer rejects an install on (`peerVerdictsOf`, design
* 2026-09-26-dsh-017-readiness, B1).
*
* Pure: the running version, the running profile, the harness's own
* template table and its peer check arrive as arguments, so fixtures drive
* every verdict and the reads of the installation stay outside — the running
* dsh, its template table and its peer check in `harness.ts`, the running
* profile's bundles and exemptions in the gateway. */
/**
* Normalize the harness's OWN `PROFILE_TEMPLATES` into template name → bundle
* names, or an empty record for a shape this build does not know.
*
* Two shapes exist and both are live: 0.1.5-rc.3 maps a name to
* `{ bundles, patchReload }` (five templates), while the version this package
* pins as a devDependency maps it to a bare array (two). A name whose value is
* neither, or whose bundle list holds a non-string, is dropped rather than
* guessed at — an unreadable table means no profile verdict, never a wrong
* one. Copied from nowhere: the caller passes the harness's exported object.
*
* The record has NO PROTOTYPE, empty answer included. It is indexed by the
* profile names a catalog entry declares, which are hostile input, and a
* record built on `{}` answered `constructor`, `__proto__`, `toString`,
* `hasOwnProperty` and `valueOf` from `Object.prototype`: a value that passed
* the `undefined` guard and threw out of `compatibilityMap`, so one entry
* declaring `profiles: ["constructor"]` rejected every `catalog()` call for
* every user. Without a prototype there is also no `__proto__` setter, so a
* template exported under that name stays an own key instead of replacing
* the record's prototype. `unmetProfile` takes own keys only as well — the
* type is exported, and a caller may hand in a plain object.
*/
function profileTemplatesOf(exported) {
	const templates = Object.create(null);
	if (exported === null || typeof exported !== "object" || Array.isArray(exported)) return templates;
	for (const [name, value] of Object.entries(exported)) {
		const bundles = Array.isArray(value) ? value : value !== null && typeof value === "object" ? value.bundles : void 0;
		if (!Array.isArray(bundles)) continue;
		if (!bundles.every((bundle) => typeof bundle === "string")) continue;
		templates[name] = bundles;
	}
	return templates;
}
/**
* Install identity → the half or halves of an entry's declaration this
* installation does not meet. A key is present only when something was
* declared AND is unmet, so an absent key means "runs here, or we could not
* tell" — the rule `incompatibilityMap` follows, and for the same reason: one
* false warning teaches a reader to ignore every warning.
*
* The halves are judged apart, and an unknown on either side silences only its
* own half:
*
* - `dsh` needs a range semver can parse and a running version that is semver,
*   and is then `satisfies` with `includePrerelease`. That option is
*   load-bearing: the harness ships nothing but prereleases, and strict semver
*   refuses a prerelease against any range whose comparators carry none —
*   `0.1.5-rc.3` fails `>=0.1.0`, and even `*` — so every author who wrote a
*   plain range would be told they exclude a harness their range includes.
*
*   What the option does NOT do is read a range the way its author probably
*   meant it. Under it a prerelease is compared like any other version, and a
*   prerelease sorts BELOW its own release (measured with semver 7.8.5; the
*   rows are pinned in compatibility.test.ts):
*   - An upper bound written without `-0` admits the next line's
*     prereleases: `<0.2.0` and `>=0.1.0 <0.2.0` both admit `0.2.0-rc.1`.
*     Only a bound that desugars to `<0.2.0-0` refuses it — `^0.1.0`,
*     `~0.1.0` and `0.1.x` do, as does `<0.2.0-0` written out.
*   - A floor written without `-0` refuses its own prereleases: `>=0.1.5`,
*     `^0.1.5` and `0.1.5` all refuse `0.1.5-rc.3`, because `0.1.5` sorts
*     above it. `>=0.1.5-0` admits every `0.1.5-rc.N`.
*   So `>=0.1.5-0` and `<0.2.0-0` are the spellings that say what an author
*   usually means. The comparison stays semver's own and is never rewritten
*   here: a verdict that coerced prereleases would answer differently from
*   semver, which is what an author checks a range against. An exact list of
*   other versions — `@xmanrui/dsh-im`'s declaration — is refused, as it
*   should be.
* - `profile` is met when the running profile's NAME is one of the declared
*   names, or when it composes every bundle of a declared template.
*
*   The name is trusted for the names dsh ships, because for those it is not
*   the reader's choice. On 0.1.5-rc.3 both paths that create a missing
*   profile build one of a shipped name from that name's template
*   (dsh-app-boot's `loadProfile`, and `dsh plugin`), and dsh refuses a
*   shipped name as the target of `--from-default-profile`, so a profile
*   carrying one was built from that template. That is all the name
*   guarantees: which template the profile was built from, not what it
*   composes now. Nothing holds the bundle list to the template afterwards:
*   `dsh plugin`'s reconcile, not app-boot, appends each bundle it installs,
*   and app-boot's `normalizeShippedProfile` rewrites only a list that is
*   exactly a retired tuple or the current one. Bundles alone could not
*   decide there: a profile keeps the bundle list it was created with, so the
*   first harness release that added a bundle to `web` would badge every
*   `profiles: ["web"]` plugin (`@xmanrui/dsh-im`) on every existing `web`
*   profile, with copy saying it supports web and this dsh was launched with
*   web.
*
*   Any other name is the reader's choice — `dsh --profile rescue
*   --from-default-profile web` builds a profile called `rescue` from the web
*   bundles, and dsh records nothing about which template it came from — so a
*   running name no declaration matches is judged by what the profile IS:
*   each declared name is read as one of the harness's own templates, met
*   when every bundle of that template is in the running profile's bundles. A
*   declared name that is no template — an own key of the table, never an
*   inherited one — cannot be judged, and a list with such a name and no met
*   template gives no verdict. The half is unmet only when the running name is
*   not declared and every declared name is a template this profile does not
*   compose — see the amendment for the whole rule.
*
*   The residual, knowingly kept: a custom-named profile is still judged by
*   bundles, so a template that later gained a bundle would badge the custom
*   profiles created before the change. No PUBLISHED
*   `@deepseek-ai/dsh-app-boot` had changed a template's bundle list as of
*   2026-09-25: all 28 versions, read that day, give every template they
*   share the same list. One list was retired before the first publish:
*   every published app-boot, from the first, carries a retired `headless`
*   tuple (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`,
*   `@deepseek-ai/dsh-headless`) in `INSTALLATION_OWNED_PROFILE_TUPLES`, and
*   `normalizeShippedProfile` rewrites a `headless` profile carrying exactly
*   that list to the current template when it loads.
*/
function compatibilityMap(entries, runtime, templates) {
	const running = runtime.dshVersion !== null && valid(runtime.dshVersion) !== null ? runtime.dshVersion : null;
	const out = {};
	for (const entry of entries) {
		const declared = entry.compatibility;
		if (declared === void 0) continue;
		const verdict = {};
		const range = declared.dsh;
		if (range !== void 0 && running !== null && validRange(range) !== null && !satisfies(running, range, { includePrerelease: true })) verdict.dsh = {
			range,
			running
		};
		const unmet = unmetProfile(declared.profiles, runtime.profile, templates);
		if (unmet !== null) verdict.profile = {
			declared: [...unmet],
			running: runtime.profile.name
		};
		if (verdict.dsh !== void 0 || verdict.profile !== void 0) out[identityKey(entry)] = verdict;
	}
	return out;
}
/**
* The declared profile list to report, or null when nothing is owed: met,
* unjudgeable, or nothing declared. See `compatibilityMap` for the rule, why
* a matching name is enough, and why bundles decide for any other name.
*/
function unmetProfile(declared, running, templates) {
	if (declared === void 0 || declared.length === 0) return null;
	if (declared.includes(running.name)) return null;
	if (running.bundles === null) return null;
	const composed = new Set(running.bundles);
	let unjudged = false;
	for (const name of declared) {
		const bundles = Object.hasOwn(templates, name) ? templates[name] : void 0;
		if (bundles === void 0) {
			unjudged = true;
			continue;
		}
		if (bundles.every((bundle) => composed.has(bundle))) return null;
	}
	return unjudged ? null : declared;
}
/**
* Install identity → the refusal the running dsh will make, for each entry
* whose harness peers it refuses and the profile has not exempted. A key is
* present only for a refusal, so an absent key means "dsh installs it, or we
* could not tell".
*
* The rule is dsh's own (`check`, from the running app-boot), handed the
* manifest dsh's installer judges (`ownManifest`): the name and version dsh
* keys an exemption by, with the catalog's `dshPeers` for the peers. Those
* are the only peers the rule reads, verbatim. Both channels are judged, each
* by the manifest dsh reads for it:
*
* - An npm entry by its catalog `version`. dsh reads that manifest before it
*   installs a registry spec: `pnpm view <spec> name version
*   peerDependencies`, measured in dsh-plugin-manager 0.1.7-rc.2.
* - A github entry by `manifestVersion`, the version of the manifest dsh
*   installs: at the pinned commit (a subpackage's own), or in the release
*   asset a rescued entry installs from. dsh skips a git or tarball spec
*   before pnpm and judges the installed manifest after it, rolling the
*   install back on a refusal (the same dsh-plugin-manager). The entry's
*   catalog `version` is a commit or a tag, so without `manifestVersion` it
*   is not judged at all: judged by its commit instead, it would miss an
*   exemption the profile holds under its real `name@version`, disabling an
*   install dsh accepts, and could offer no command, since `allow-version`
*   records no commit (design 2026-09-28-bundle-components-and-github-peers,
*   sections 6.1 and 7.3).
*
* dsh's key names no channel: an exemption recorded for one `name@version`
* clears every entry whose manifest carries it, npm or github, here as in
* dsh.
*
* What this cannot see errs toward silence, never toward a refusal dsh would
* not make: a malformed peer range elsewhere in the manifest, which dsh
* rejects only after installing, and the plugins a bundle's patch rows name,
* which it checks then too. Those reach the reader as the install's own
* failure (`installFailureDetail`).
*
* A throw from the check forms no verdict for that entry, as a resolver's
* throw does in `incompatibilityMap`.
*/
function peerVerdictsOf(entries, check, exemptions, profile) {
	const out = {};
	for (const entry of entries) {
		const manifest = ownManifest(entry);
		if (manifest === null) continue;
		let issue;
		try {
			issue = check.evaluate(manifest, exemptions);
		} catch {
			continue;
		}
		if (issue === void 0 || issue.exempted) continue;
		out[identityKey(entry)] = {
			refused: { ...issue.peers },
			running: issue.runtimeVersion,
			allowCommand: allowVersionCommand(profile, issue)
		};
	}
	return out;
}
/**
* The manifest dsh judges an entry's install by, as `peerVerdictsOf` hands it
* to the rule, or null when none can be formed: the entry declares neither
* harness peers nor an `engines.dsh` range, or it is a github entry with no
* `manifestVersion`. An npm entry's catalog `version` is its manifest's; a
* github entry's is a commit or a tag, so its manifest's own version is the one
* recorded beside its declarations, and the key is read on github entries
* only.
*
* Both declarations are handed over together, because dsh's own rule applies
* its own precedence: `unmetRequirements` returns on `engines.dsh` and never
* reads `peerDependencies` when it is present (design
* 2026-11-02-market-borrowings §1). Judging the peers without it — what this
* function did before the catalog carried `engines` — answered a question dsh
* does not ask. An entry with engines and no peers still forms a manifest: the
* empty peer map is what dsh would see in that manifest anyway.
*/
function ownManifest(entry) {
	if (entry.dshPeers === void 0 && entry.engines === void 0) return null;
	const version = entry.source === "npm" ? entry.version : entry.manifestVersion;
	if (version === void 0) return null;
	return {
		name: entry.name,
		version,
		peerDependencies: entry.dshPeers ?? {},
		...entry.engines !== void 0 ? { engines: { dsh: entry.engines } } : {}
	};
}
/** npm's package-name grammar as dsh's exemption records accept it, verbatim
* from app-boot 0.1.7-rc.2 (`PACKAGE_NAME` in profile-compatibility). */
const EXEMPTION_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
/** A version exactly as dsh's exemption records spell one: canonical semver,
* build metadata included (app-boot's `isExactPluginVersion`). */
function isExactVersion(value) {
	const parsed = parse(value);
	return parsed !== null && value === `${parsed.version}${parsed.build.length === 0 ? "" : `+${parsed.build.join(".")}`}`;
}
/**
* The command that records dsh's exact-version exemption for one refused
* install, spelled as dsh's own CLI prints it after a refusal — or null when
* `dsh plugin allow-version` would refuse the package or either version,
* which it checks against the grammar above. The name and version come from
* the catalog, which is hostile input bound for a terminal, and the two
* grammars admit no whitespace, quote, `$`, backtick, `;`, `|`, `&`,
* redirection or bracket, so no catalog value can add a command to the line
* it is pasted into.
*
* The profile is written as it is, as dsh prints it: it is the reader's own
* choice of name, never catalog input. The desktop profile gets none: dsh's
* CLI refuses it in any letter case, so the exemption could never be recorded
* from a terminal, and since the desktop app's harness is identified (design
* 2026-09-01-harness-compatibility, 2026-11-06 amendment) the card reaches
* this verdict there.
*/
function allowVersionCommand(profile, issue) {
	if (isDesktopProfile(profile)) return null;
	if (!EXEMPTION_PACKAGE_NAME.test(issue.name) || !isExactVersion(issue.version) || !isExactVersion(issue.runtimeVersion)) return null;
	return `dsh plugin --profile ${profile} allow-version ${issue.name}@${issue.version} --dsh-version ${issue.runtimeVersion} --accept-risk`;
}
//#endregion
//#region src/host/child-env.ts
/**
* The environment an install command is spawned with (design
* 2026-11-04-borrowings-round-4 §1).
*
* One function so the two spawns that run package-manager work — the CLI
* install in `executor.ts` and the download lane in `prefetch.ts` — cannot
* drift: a setting that reaches one and not the other would fix a hang on one
* path and leave it on the other.
*/
/**
* `env` with the settings a headless spawn needs.
*
* - `GIT_TERMINAL_PROMPT=0`: a dependency fetched from a private git remote
*   would otherwise stop at a username prompt. The child has no console to
*   answer it, so the install hangs until `INSTALL_TIMEOUT_MS` and reports a
*   timeout — the wrong cause, and fifteen minutes of a reader's time. dsh's
*   own spawn does not set this; measured on the competitor's own bug (their
*   #1094, a visible terminal window from a detached child), the class is
*   real on Windows.
* - `GCM_INTERACTIVE=never`: Git for Windows ships Git Credential Manager as
*   the default helper, and it ignores `GIT_TERMINAL_PROMPT` — on a cache miss
*   it opens its own GUI window and waits. `never` still resolves a stored
*   credential and fails fast instead of prompting. An inherited `GIT_ASKPASS`
*   is the same residual, rarer, and deliberately not overridden: a profile
*   that sets one has asked its git to run that program.
* - `CI=1` is deliberately NOT set here: pnpm's behaviour under `CI` differs
*   (no prompts, a different reporter), and dsh's plugin manager already
*   computes what it wants for its own children. This function adds only the
*   variable that turns a hang into an error.
*
* An explicit `env` wins: a caller that narrowed the environment has said
* what the child may see, and this only fills in what the spawn needs to
* fail fast. Both variables are therefore overridden even when the caller
* set them — a prompt cannot be answered on this path either way.
*/
function installEnv(env) {
	return {
		...env ?? process.env,
		GIT_TERMINAL_PROMPT: "0",
		GCM_INTERACTIVE: "never"
	};
}
//#endregion
//#region src/shared/install-state.ts
/** Whether the host is done with this record: it will not change again, and a
* poller may stop. */
function isTerminalInstallState(state) {
	return state === "done" || state === "failed";
}
//#endregion
//#region src/host/executor.ts
/** Plugin-command executor: spawn the dsh CLI, stream its output, serialize
* per profile. One implementation drives both `dsh plugin add` (install) and
* `dsh plugin remove` (uninstall); the only differences are the verb and the
* post-exit manifest confirmation. */
const MAX_LOG_LINES = 200;
const MAX_LOG_BYTES = 65536;
/** Bound one dsh command so a stalled install cannot hold the profile queue
* forever. Tests can pass a shorter value; production stays generous. */
const INSTALL_TIMEOUT_MS = Number(process.env.DSH_SHOP_INSTALL_TIMEOUT_MS) || 9e5;
/** Grace period for output already buffered after the child exits. */
const PIPE_DRAIN_MS = 500;
const profileQueues = /* @__PURE__ */ new Map();
/** How many commands are queued or running per profile.
*
* `profileQueues` cannot answer this: its entries are only ever set, never
* deleted, so `has(profile)` is true forever after a profile's first install
* and would call every later lone install queued — earning it a pointless
* prefetch and a `Downloading…` label that is simply false. Promise state is
* not observable, so a counter is the only honest signal available.
*/
const profileDepth = /* @__PURE__ */ new Map();
function enterQueue(profile) {
	const ahead = profileDepth.get(profile) ?? 0;
	profileDepth.set(profile, ahead + 1);
	return ahead;
}
function leaveQueue(profile) {
	profileDepth.set(profile, Math.max(0, (profileDepth.get(profile) ?? 1) - 1));
}
function chain(profile, task) {
	const next = (profileQueues.get(profile) ?? Promise.resolve()).then(task, task);
	profileQueues.set(profile, next.catch(() => {}));
	return next;
}
/** Run `task` in `profile`'s queue, after every command already in it: the
* queue `spawnPluginCli` uses, shared with the plugin manager's runner so the
* two paths are never concurrent in one profile. `ahead` is how many commands
* were queued or running when the slot was taken. */
function inProfileQueue(profile, task) {
	return {
		ahead: enterQueue(profile),
		finished: chain(profile, task).finally(() => {
			leaveQueue(profile);
		})
	};
}
/** An install record's log: the newest lines within MAX_LOG_LINES and
* MAX_LOG_BYTES, never dropping the newest one. */
function createBoundedLog() {
	const lines = [];
	let bytes = 0;
	return {
		push(line) {
			lines.push(line);
			bytes += Buffer.byteLength(line);
			while ((lines.length > MAX_LOG_LINES || bytes > MAX_LOG_BYTES) && lines.length > 1) {
				const oldest = lines.shift();
				if (oldest !== void 0) bytes -= Buffer.byteLength(oldest);
			}
		},
		lines: () => [...lines]
	};
}
/**
* Why a zero-exit install left `dsh.profile.bundles` without the entry.
*
* This reports EVIDENCE, never a cause. "the catalog may be stale; refresh
* it" used to be the whole message on every branch, and on the failure that
* prompted the rewrite it was flatly wrong — the catalog had been fetched
* minutes earlier and was correct. The first attempt at a replacement
* inferred the opposite cause instead, reading "the entry has a `subdir` and
* its name is absent" as "the spec's `&path:` was eaten". That predicate does
* not entail that cause: `install()` builds three spec forms and only one
* carries `&path:` at all, so a tarball-rescued or npm entry could be told
* its path had been eaten from a spec that never had one. A guess in the
* confident direction is still a guess.
*
* So: the profile manifest is read before and after, and only the difference
* is reported.
*   - the name IS an own dependency, but not a bundle — a fact, stated
*     without a claim about why dsh did not list it;
*   - the name is absent and something else was added — name what was added.
*     That is the culprit, and naming it is what lets a user clean up; the
*     package that lands here is by construction NOT a catalog entry, so the
*     shop's own uninstall cannot reach it and a CLI line is the only usable
*     instruction;
*   - the name is absent and nothing was added — nothing installed under
*     this name, and a catalog behind the registry IS a real candidate here.
*
* `before` is `null` when the manifest existed but could not be read, and
* the diff branches are then withheld. Collapsing that into an empty map is
* not a smaller lie than the inferred cause it replaced: every pre-existing
* dependency reads as newly added, so the second branch names an innocent
* package and puts it in a `dsh plugin remove` line. An ABSENT manifest is
* still `{}` — nothing WAS installed, which is the truth for a first install
* into a fresh profile, and the branch that names what landed has to keep
* working there. Same rule the harvest applies to `no-manifest` versus
* `fetch-failed`: "could not read it" is never "it was not there".
*
* `Object.hasOwn` throughout, never an index read: these records are parsed
* from the profile manifest and carry Object.prototype, so `deps.constructor`
* answers with a function for a package that is not installed — and
* `constructor` is a legal npm name (`[a-z0-9][a-z0-9._-]*`).
*
* Pure: every input is a value, so each branch is driven by a fixture.
*/
function activationFailureDetail(args) {
	const { expectedName, profile, before, after } = args;
	if (Object.hasOwn(after, expectedName)) return `${expectedName} is installed as a profile dependency, but is not listed in dsh.profile.bundles. dsh has not enabled it as a plugin, so the shop cannot load it.`;
	if (before === null) return `${expectedName} is missing from both dsh.profile.bundles and the profile dependencies. The shop could not read the profile before installation, so it cannot tell what changed. Check the profile's package.json before trying again.`;
	const added = Object.keys(after).filter((name) => !Object.hasOwn(before, name)).sort();
	if (added.length > 0) return `${expectedName} is not in the profile dependencies. The install added ${added.join(", ")} instead. To remove ${added[0]}, run: dsh plugin --profile ${profile} remove ${added[0]}`;
	return `${expectedName} is missing from both dsh.profile.bundles and the profile dependencies. Nothing was added. If this plugin was recently published, the catalog may be out of date. Refresh it and try again.`;
}
/** The §7.2 step-6 confirm: after a zero exit, re-read the profile manifest and
* verify the bundle actually landed in `dsh.profile.bundles`. Exit 0 alone is
* not success — a library-that-looked-like-a-plugin, a subpackage entry whose
* path was eaten, or a stale catalog all exit 0 while changing nothing (§10).
* The shop cannot force a client refresh in P1, so the detail carries the
* signal — see `activationFailureDetail` for which signal. A manifest that
* cannot be read or parsed names the file instead: the install's result is
* then unknown, and a bare `done` would be plausible-but-wrong. `home` is
* the DSH_HOME the child was spawned with — the parent's own DSH_HOME may
* differ when `env` pinned it.
*/
function confirmBundleActivation(profile, home, expectedName, before) {
	const profileDir = resolveProfileDir(profile, home);
	try {
		const manifest = readProfileManifest("dsh-plugin-shop", profileDir);
		const after = manifest.dependencies ?? {};
		const bundles = manifest.dsh?.profile?.bundles;
		if (Array.isArray(bundles) && bundles.includes(expectedName) && Object.hasOwn(after, expectedName)) return null;
		return activationFailureDetail({
			expectedName,
			profile,
			before,
			after
		});
	} catch {
		return `Could not confirm the installation because the profile manifest could not be read (${join(profileDir, "package.json")}). Check that file before trying again.`;
	}
}
/** The uninstall mirror of §7.2 step 6: after a zero exit, re-read the profile
* manifest and verify the bundle actually left `dsh.profile.bundles`. A zero
* exit that changed nothing must not read as success. */
function confirmBundleRemoval(profile, home, expectedName) {
	const profileDir = resolveProfileDir(profile, home);
	try {
		if (!readProfileManifest("dsh-plugin-shop", profileDir).dsh?.profile?.bundles?.includes(expectedName)) return null;
		return "The uninstall command finished, but the plugin is still listed in dsh.profile.bundles. Try uninstalling it again.";
	} catch {
		return `Could not confirm the uninstall because the profile manifest could not be read (${join(profileDir, "package.json")}). Check that file and try again.`;
	}
}
/** Lines a failed install's log tends to END on, none of which tell the user
* anything they can act on: dsh's own wrapper around the pnpm exit, node's
* version footer, pnpm's progress and update banner, and the frames and
* carets of a stack trace. */
const FAILURE_LOG_NOISE = [
	/^dsh: pnpm failed in profile directory/,
	/^Node\.js v/,
	/^(?:Progress|Packages):/,
	/^\++$/,
	/^[╭│╰]/,
	/^\^+$/,
	/^\s*$/,
	/^\s+at /,
	/^<anonymous(?:_script)?>/
];
/** The line dsh 0.1.7 opens a refused install with (dsh-plugin-manager's
* `rejected`), and the exemption command its CLI prints after it, one per
* refused package (`runPlugin`). The opener is exported for the plugin
* manager's answer, whose output carries the same block. */
const REFUSAL_OPENER = "dsh: installation rejected: ";
const REFUSAL_COMMAND = /^dsh: to accept the risk, run: dsh plugin --profile .+ allow-version (.+)@([^@\s]+) --dsh-version (\S+) --accept-risk$/;
const REFUSAL_FAILED = "dsh: plugin command failed";
/** Where dsh's warning turns from the refused peers to its risk statement
* and remedy (app-boot's `pluginCompatibilityWarning`); the detail states
* the risk once and gives the command instead. */
const REFUSAL_WARNING_TAIL = " Running it may cause crashes or data loss.";
/**
* dsh's own refusal of an install (0.1.7 on) as one detail, or null when the
* log holds none. The install was dsh's to refuse, not pnpm's to fail: it
* refuses before pnpm runs, when it can read the manifest — a registry spec —
* and after pnpm succeeded otherwise, restoring the profile. The catalog's
* peer verdict predicts the first, and the second only for a github entry's
* own peers, judged by the manifest version the catalog records
* (`peerVerdictsOf`). It predicts no refusal of a bundle's components, and
* none of a github entry that carries no usable manifest version: dsh makes
* those after pnpm all the same. Reading any refusal as a pnpm failure sent
* the reader to `dsh plugin install`, which repairs nothing.
*
* The detail is what dsh refused, what it restored, and the command that
* records its exact-version exemption, rebuilt from what dsh printed through
* `allowVersionCommand` rather than repeated: dsh prints the INSTALLED
* manifest's own name into it, which a tarball or git package chooses
* itself, so only a name and versions dsh's exemption grammar accepts reach
* a line meant for a terminal. The profile is the one this install ran in.
* Anything dsh prints after `plugin command failed` — the diagnostics path,
* and a hint about git build scripts dsh prints after every failed git
* install — says nothing about this refusal.
*/
function refusalDetail(profile, usable) {
	const start = usable.findIndex((line) => line.startsWith(REFUSAL_OPENER));
	if (start === -1) return null;
	const refusedAt = usable.slice(start);
	const failedAt = refusedAt.findIndex((line) => line.startsWith(REFUSAL_FAILED));
	const block = failedAt === -1 ? refusedAt : refusedAt.slice(0, failedAt);
	const warnings = [];
	const commands = [];
	let restoration;
	for (const [index, line] of block.entries()) {
		const command = REFUSAL_COMMAND.exec(line);
		if (command !== null) {
			const [, name = "", version = "", runtimeVersion = ""] = command;
			const rebuilt = allowVersionCommand(profile, {
				name,
				version,
				runtimeVersion
			});
			if (rebuilt !== null) commands.push(rebuilt);
		} else if (index === 0) warnings.push(line.slice(28));
		else if (line.startsWith("dsh: ")) restoration ??= line.slice(5);
		else if (restoration === void 0) warnings.push(line);
	}
	const parts = [`dsh refused the install: ${warnings.map((warning) => {
		const tail = warning.indexOf(REFUSAL_WARNING_TAIL);
		return tail === -1 ? warning : warning.slice(0, tail);
	}).join(" ")}`];
	if (restoration !== void 0) parts.push(`${restoration.charAt(0).toUpperCase()}${restoration.slice(1)}`);
	if (commands.length > 0) parts.push(`To accept the risk of crashes or data loss for ${commands.length === 1 ? "this exact version" : "these exact versions"}, run: ${commands.join("; ")} — then install again.`);
	return parts.join(" ");
}
/** What Rust's allocator prints before it aborts, which is how pnpm 12's
* native binary dies when it cannot get the memory it asked for. Anchored at
* both ends: node's own heap exhaustion ("Allocation failed - JavaScript heap
* out of memory") is a different crash, from pnpm 11 or dsh itself, and the
* pnpm 12 remedy below would be wrong for it. */
const NATIVE_ALLOCATION_ABORT = /^memory allocation of \d+ bytes failed$/;
/**
* pnpm 12 aborting out of memory as one detail, or null when the log holds no
* such abort.
*
* The known cause is pnpm/pnpm#15362, fixed in pnpm 12.7.0: the native peer
* check intersected the ranges of a missing peer, doubling the intersection
* for every package that wanted it. dsh writes `autoInstallPeers: false` into
* every profile, so every `@deepseek-ai/dsh*` peer stays missing and plugins
* that share one trip it. Reported on Windows with 8 GB, reproduced on Linux
* through the real CLI of dsh 0.1.5-rc.3 and 0.1.7-rc.2 (2026-09-27). The
* install aborted, so running it again on the same profile aborts again:
* the detail names the way out instead of the usual recovery hint.
*
* Not every such abort is that bug (pnpm/pnpm#15867 is another one, with the
* same words), so the detail says what to do if the reader's pnpm already has
* the fix.
*/
function nativeAllocationAbortDetail(usable) {
	const abort = usable.find((line) => NATIVE_ALLOCATION_ABORT.test(line.trim()));
	if (abort === void 0) return null;
	return `pnpm ran out of memory (${abort.trim()}). pnpm 12 versions before 12.7.0 have a known memory bug with shared missing peer dependencies (pnpm/pnpm#15362). Upgrade pnpm to 12.7.0 or later, or use pnpm 11, then install again. If your pnpm is already 12.7.0 or later, report the line above to pnpm.`;
}
/**
* The one log line worth putting in front of the user, plus the recovery hint.
*
* The last line is the wrong choice, which is what this replaces. Measured on
* two real failures against the live catalog (dsh 0.1.1-rc.2, 2026-09-02),
* the last line was `dsh: pnpm failed in profile directory <a path the user
* did not choose>` and `Node.js v26.6.0` — while the line that explained the
* failure sat a few lines above, in the log the client already receives. A
* user seeing either of those cannot tell a blocked build script from a
* crash, which is exactly the report this fixes.
*
* Scanning from the end: a pnpm error code first, then any thrown error, then
* the last line that is not noise.
*/
function installFailureDetail(profile, log, hint = `pnpm failed in the profile. Run: dsh plugin --profile ${profile} install`) {
	const usable = log.map((line) => line.replace(/\r+$/, "")).filter((line) => !FAILURE_LOG_NOISE.some((rx) => rx.test(line)));
	const refusal = refusalDetail(profile, usable);
	if (refusal !== null) return refusal;
	const abort = nativeAllocationAbortDetail(usable);
	if (abort !== null) return abort;
	const reversed = [...usable].reverse();
	const pick = reversed.find((line) => /ERR_[A-Z][A-Z_]*/.test(line)) ?? reversed.find((line) => /(?:^|\s)\w*Error:/.test(line)) ?? usable[usable.length - 1];
	if (pick === void 0) return `${hint}.`;
	const cause = reversed.map((line) => /^\s*╰─▶\s*(\S.*)$/.exec(line)?.[1]).find((text) => text !== void 0);
	return `${hint} — ${pick}${cause !== void 0 && !pick.includes(cause) ? `: ${cause}` : ""}${/ERR_PNPM_IGNORED_BUILDS/.test(pick) ? " A dependency wants to run a build script, which pnpm blocks by default: run `pnpm approve-builds` in the profile directory to allow it, then retry." : ""}`;
}
/**
* Why a spawn of the dsh CLI never started.
*
* On Windows a bare name and a shim path fail differently and neither means
* what the POSIX advice says. npm installs the CLI as `dsh`, `dsh.cmd` and
* `dsh.ps1` with no `.exe`; libuv resolves a bare name against `.com` and
* `.exe` only (ENOENT), and node has refused to spawn a `.cmd` without a
* shell since the 2024 batfile argument-injection fix (EINVAL). `dsh-cli.ts`
* gets past that by running the CLI's own JS entry through node, so reaching
* here on Windows means that entry could not be located — telling the user to
* install a dsh they already have would still be wrong. Reported from Windows
* 2026-09-02 as "Update failed / dsh not found on PATH" on a working install.
*/
function spawnFailureDetail(code, message, dshBin, platform) {
	if (platform === "win32" && (code === "ENOENT" || code === "EINVAL")) return `The shop could not find the dsh CLI entry file (${DSH_PACKAGE}, command: ${dshBin}). On Windows, the shop needs this file because it cannot run the .cmd launcher directly. Check that \`dsh --version\` works in a terminal, then reinstall the CLI if it does not.`;
	if (code === "ENOENT") return "dsh was not found on PATH. Install the dsh CLI or add it to PATH, then try again.";
	return `Could not start dsh: ${message}`;
}
/** The failure detail for a command stopped by the shop's deadline. */
function installTimeoutDetail(profile, timeoutMs) {
	return `dsh-plugin-shop: the command did not finish within ${Math.max(1, Math.round(timeoutMs / 1e3))}s and was stopped. To check the error and retry, run: dsh plugin --profile ${profile} install`;
}
/** The real kill. Exported for the tests that inject a RECORDING `KillFns`:
* a recorder that only records asserts that a kill was requested and leaves
* the child running, which for a `detached` fixture is an immortal node
* process per run — see `prefetch.test.ts`'s delegating recorder. */
const nodeKills = {
	killGroup: (pid) => process.kill(-pid, "SIGKILL"),
	killPid: (pid) => process.kill(pid, "SIGKILL"),
	taskkill: (pid) => {
		spawnSync("taskkill", [
			"/PID",
			String(pid),
			"/T",
			"/F"
		], {
			stdio: "ignore",
			windowsHide: true
		});
	}
};
/** Kill a child and its descendants (process group on POSIX, taskkill tree on Windows). */
function killTree(pid, platform, kills = nodeKills) {
	if (pid === void 0) return;
	if (platform === "win32") {
		kills.taskkill(pid);
		return;
	}
	try {
		kills.killGroup(pid);
	} catch {
		try {
			kills.killPid(pid);
		} catch {}
	}
}
function lineSink(emit) {
	const decoder = new StringDecoder("utf8");
	let pending = "";
	return {
		write(chunk) {
			pending += decoder.write(chunk);
			const parts = pending.split(/\r?\n/);
			pending = parts.pop() ?? "";
			for (const line of parts) if (line !== "") emit(line);
		},
		flush() {
			pending += decoder.end();
			if (pending !== "") emit(pending);
			pending = "";
		}
	};
}
/** Read-only filesystem seam for the CLI lookup; the same shape as `pinFs`. */
const nodeFs = {
	exists: (path) => existsSync(path),
	read: (path) => readFileSync(path, "utf8")
};
let cachedScript;
/** The dsh CLI's JS entry, resolved once per process and only where it is
* needed. On POSIX `spawn('dsh')` works and the lookup is skipped entirely,
* so no platform but Windows pays for it. */
function dshScript() {
	if (process.platform !== "win32") return null;
	if (cachedScript === void 0) cachedScript = resolveDshScript(nodeFs, {
		argv1: process.argv[1],
		path: process.env.PATH
	});
	return cachedScript;
}
/** Shell punctuation that must never reach the downstream CLI as an operand.
* The downstream dsh invokes pnpm with shell mode on Windows, where these
* characters alter the command line. `&` is intentionally allowed here: the
* legitimate monorepo spec uses it as `&path:<subdir>`, and catalog.ts
* validates each component before it reaches this layer. `"` is NOT allowed,
* and `shellSafeTarget` below leans on that: the only quote that can appear in
* the spawned command line is the one we add ourselves, after this gate. */
const UNSAFE_TARGET = /[\s"'`|<>^$();\\{}]|[\u0000-\u001f\u007f]/;
/**
* The operand gate, one function for every caller: it refuses, by throwing,
* an operand the dsh CLI would parse as a flag, and one carrying the shell
* punctuation `UNSAFE_TARGET` names. A legitimate operand (a catalog name for
* a removal; a `name@version`, `github:` or tarball spec for an install)
* never begins with `-`, so the first refusal cannot reject a real install or
* uninstall, and failing loudly beats letting the CLI reinterpret an operand
* as an option. `spawnPluginCli` runs it before it spawns anything or takes a
* queue slot; the gateway's plugin manager path runs it before a spec reaches
* `installBundle` or the download phase, whose pump relies on it (see
* `requestDownloadPhase`). Returns the operand, known to be present.
*/
function gateOperand(target) {
	if (target === void 0 || target.startsWith("-")) throw new Error(`dsh-plugin-shop: refusing to spawn with a flag-like operand: ${target ?? "(none)"}`);
	if (UNSAFE_TARGET.test(target)) throw new Error(`dsh-plugin-shop: refusing to spawn with an unsafe operand: ${JSON.stringify(target)}`);
	return target;
}
/**
* The operand as the downstream dsh must receive it for pnpm to see it whole.
*
* dsh spawns pnpm with `shell: process.platform === 'win32'`
* (`apps/cli/src/plugin.ts:137` at tag `dsh-v0.1.3-alpha.1`), and Node does
* not escape under `shell: true` — it concatenates argv into one string for
* cmd.exe. `&` is a cmd command separator, so a subpackage spec
* `github:owner/repo#<sha>&path:<subdir>` is cut in half before pnpm sees it:
* pnpm installs the repository ROOT and the tail runs as its own command. It
* is silent because `path` happens to be a cmd builtin that succeeds and
* prints nothing, so the chain still exits 0 and the install reports success
* over a foreign package.
*
* Measured 2026-09-06, Windows 11, dsh 0.1.2-rc.1, pnpm 11.25.0, against
* `nexu-io/open-design#c5ae629&path:packages/dsh-runtime`:
*
*   bare    -> `+ open-design github:nexu-io/open-design#c5ae629` (the ROOT), exit 0
*   `^&`    -> the ROOT again; cmd consumes the caret before it re-parses
*   `"..."` -> `+ @open-design/dsh-runtime ...&path:packages/dsh-runtime`, exit 0,
*              and the name lands in dsh.profile.bundles
*
* So the quotes go on. Two constraints on doing it here:
*
*  - AFTER the `UNSAFE_TARGET` gate, never before. That gate refuses `"` in
*    the operand, so every quote in the spawned command line is provably ours
*    and catalog data cannot close one and append a command of its own.
*  - Windows only, and only when the spec actually contains `&`. Off Windows
*    dsh spawns pnpm with no shell, where a quote would be a literal character
*    in the spec and would break an install that works today. Scoping to `&`
*    holds the blast radius to exactly the specs that are broken now — and if
*    dsh stops shelling its argv, those specs fail loudly at pnpm rather than
*    silently installing a repository root. Reported upstream as
*    deepseek-ai/deepseek-harness discussion #5815.
*/
function shellSafeTarget(target, platform) {
	if (platform !== "win32" || !target.includes("&")) return target;
	return `"${target}"`;
}
/** A profile name safe to put in a line a person pastes: no whitespace, no
* quote, no shell punctuation. A profile outside this gets no line at all —
* it is the reader's own name, and refusing to guess beats publishing a
* command that would split at the first space. */
const SAFE_PROFILE = /^[A-Za-z0-9._:-]+$/;
/**
* The command that would retry this operation by hand, or undefined when no
* shell can carry it (design 2026-11-02-market-borrowings §5).
*
* POSIX: single-quoted. `&` is a control operator there too, so
* `github:owner/slug#sha&path:dir` unquoted would run `path:dir` as its own
* command; `gateOperand` refuses `'`, so the quoting cannot be broken out of.
*
* Windows: offered only for an operand with no `&`. The quotes a reader types
* are consumed by cmd and never reach dsh, which then joins argv UNQUOTED
* into its own shell (the defect `shellSafeTarget` exists for on our own
* spawn) — so a quoted `&path:` still splits, and the measured outcome is an
* install of the repository ROOT that exits 0. A line that installs
* something else is worse than no line, so that case reports none.
*
* The desktop profile: none on either platform. dsh's CLI refuses it in any
* letter case (`isDesktopProfile`), so the line would fail at once, and a
* desktop reader is never handed a `dsh plugin` command. The CLI path never
* runs there; the plugin-manager path asks for a line on every profile
* (2026-11-06), which is why the refusal lives in this one builder.
*/
function retryCommand(platform, profile, verb, target) {
	if (verb === void 0 || !SAFE_PROFILE.test(profile) || isDesktopProfile(profile)) return void 0;
	if (platform === "win32") return target.includes("&") ? void 0 : `dsh plugin --profile ${profile} ${verb} ${target}`;
	if (target.includes("'")) return void 0;
	return `dsh plugin --profile '${profile}' ${verb} '${target}'`;
}
const DOWNLOAD_PHASE_FAILED_PREFIX = "dsh-plugin-shop: the download phase could not start — ";
const DOWNLOAD_PHASE_NO_PNPM = "dsh-plugin-shop: no download phase — pnpm not found on PATH";
const DOWNLOAD_PHASE_UNSUPPORTED = "dsh-plugin-shop: no download phase for this spec form; the install fetches it directly";
/**
* Ask the pump to warm `spec` while an operation waits its turn, and say in
* that operation's log why there is no download phase when there is none.
* Shared by the CLI executor and the plugin manager runner.
*/
function requestDownloadPhase(options) {
	const { prefetcher, profile, spec, env, log } = options;
	let prefetch;
	try {
		prefetch = prefetcher.request({
			profile,
			spec,
			cwd: resolveProfileDir(profile, env?.DSH_HOME),
			env,
			log
		});
	} catch (error) {
		log(`${DOWNLOAD_PHASE_FAILED_PREFIX}${error.message}`);
		return null;
	}
	if (!prefetch.started) log(prefetch.reason === "no-pnpm" ? DOWNLOAD_PHASE_NO_PNPM : DOWNLOAD_PHASE_UNSUPPORTED);
	return prefetch;
}
/** Run one `dsh plugin --profile <profile> <verb> <target>` and track it.
* Never rolls back; a failure surfaces stderr verbatim plus the recovery hint
* (§10). The shop never passes build-script flags: `allowBuilds` stays the
* user's explicit decision in the CLI (§7.2).
* The child inherits the current environment unless `env` is given — the
* real-install test pins DSH_HOME to a temporary directory this way.
* When `confirm` is given, a zero exit is checked against the profile
* manifest before the command reports `done` (§7.2 step 6 and its uninstall
* mirror). When `afterDone` is given, a zero exit that passes `confirm`
* withholds the terminal `done` until the callback — typically the hot-mount
* attempt — settles; its result sets `activation` (default `restart`) and
* `restartReason`. The client stops polling at `done`, so the hot outcome
* must settle before it. A throwing callback never fails the install — the
* package IS installed; it reports `done` with the restart fallback. */
function spawnPluginCli(options) {
	const { profile, argv, dshBin, env, platform = process.platform, beforeSpawn, prefetcher, confirm, confirmLanded, afterDone, onStatus, timeoutMs = INSTALL_TIMEOUT_MS } = options;
	const target = gateOperand(argv[1]);
	const command = retryCommand(platform, profile, argv[0], target);
	const spawnArgv = [...argv];
	spawnArgv[1] = shellSafeTarget(target, platform);
	const installId = randomUUID();
	const log = createBoundedLog();
	const ahead = enterQueue(profile);
	let state = "running";
	let activationOnDone = "restart";
	let restartReason;
	let detail;
	/** The record failed on `confirmLanded`: its package is on disk. */
	let landedFailure = false;
	const status = () => ({
		state,
		log: log.lines(),
		...state === "done" ? {
			activation: activationOnDone,
			...restartReason !== void 0 ? { restartReason } : {}
		} : {},
		...detail !== void 0 ? { detail } : {},
		...state === "failed" && command !== void 0 && !landedFailure ? { command } : {}
	});
	const append = (line) => {
		if (isTerminalInstallState(state)) return;
		log.push(line);
		onStatus?.(status());
	};
	const failToStart = (error) => {
		state = "failed";
		detail = spawnFailureDetail(error.code, error.message, dshBin, platform);
		onStatus?.(status());
		return status();
	};
	let prefetch = null;
	if (ahead > 0 && prefetcher !== void 0) prefetch = requestDownloadPhase({
		prefetcher,
		profile,
		spec: target,
		env,
		log: append
	});
	if (prefetch?.started === true) state = "downloading";
	const finished = chain(profile, () => new Promise((resolve) => {
		state = "running";
		onStatus?.(status());
		beforeSpawn?.(env?.DSH_HOME);
		const { command, args } = dshCommand({
			dshBin,
			args: [
				"plugin",
				"--profile",
				profile,
				...spawnArgv
			],
			platform,
			execPath: process.execPath,
			script: dshScript()
		});
		let child;
		try {
			child = spawn(command, args, {
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				],
				env: installEnv(env),
				detached: platform !== "win32",
				windowsHide: true
			});
		} catch (error) {
			resolve(failToStart(error));
			return;
		}
		let exited = false;
		let closed = false;
		let exitCode = null;
		let timedOut = false;
		let drainTimer;
		let deadlineTimer;
		const outLines = lineSink(append);
		const errLines = lineSink(append);
		const settle = async () => {
			if (state !== "running") return;
			clearTimeout(drainTimer);
			clearTimeout(deadlineTimer);
			outLines.flush();
			errLines.flush();
			child.stdout.destroy();
			child.stderr.destroy();
			if (timedOut) {
				state = "failed";
				detail = installTimeoutDetail(profile, timeoutMs);
			} else if (exitCode === 0) {
				const confirmDetail = confirm?.(env?.DSH_HOME);
				const landedDetail = confirmDetail == null ? confirmLanded?.(env?.DSH_HOME) : null;
				if (confirmDetail != null) {
					state = "failed";
					detail = confirmDetail;
				} else if (landedDetail != null) {
					state = "failed";
					detail = landedDetail;
					landedFailure = true;
				} else if (afterDone !== void 0) {
					try {
						const outcome = await afterDone(env?.DSH_HOME);
						activationOnDone = outcome?.activation ?? "restart";
						restartReason = outcome?.restartReason;
					} catch {
						activationOnDone = "restart";
						restartReason = "mount-failed";
					}
					state = "done";
				} else state = "done";
			} else {
				state = "failed";
				detail = installFailureDetail(profile, log.lines());
			}
			onStatus?.(status());
			resolve(status());
		};
		const drainThenSettle = () => {
			clearTimeout(drainTimer);
			drainTimer = setTimeout(() => {
				settle();
			}, PIPE_DRAIN_MS);
		};
		child.stdout.on("data", (chunk) => {
			outLines.write(chunk);
		});
		child.stderr.on("data", (chunk) => {
			errLines.write(chunk);
		});
		child.on("error", (error) => {
			if (state !== "running") return;
			clearTimeout(drainTimer);
			clearTimeout(deadlineTimer);
			resolve(failToStart(error));
		});
		child.on("exit", (code) => {
			exited = true;
			exitCode = code;
			if (closed) settle();
			else drainThenSettle();
		});
		child.on("close", () => {
			closed = true;
			if (exited) settle();
		});
		deadlineTimer = setTimeout(() => {
			if (state !== "running") return;
			timedOut = true;
			killTree(child.pid, platform);
			drainThenSettle();
		}, timeoutMs);
	})).finally(() => {
		leaveQueue(profile);
		prefetcher?.release(profile, target);
	});
	finished.catch(() => {});
	return {
		installId,
		status,
		finished
	};
}
/**
* Run one `dsh plugin --profile <profile> add <spec>` and track it.
* When `expectedName` is given, a zero exit is confirmed against the profile
* manifest (§7.2 step 6) before the install reports `done`.
* The confirm compares the profile's dependencies before and after the spawn,
* so a miss can name what actually landed instead of guessing at a cause; the
* executor takes both snapshots itself. `alsoConfirm` adds a second post-exit
* check, run only once that one has passed.
* When `afterDone` is given, the terminal `done` waits for it to settle
* (§D hot mount).
*/
function startInstall(options) {
	const { profile, spec, dshBin = "dsh", env, platform, expectedName, prefetcher, alsoConfirm, afterDone, onStatus, timeoutMs } = options;
	let before = null;
	return spawnPluginCli({
		profile,
		argv: ["add", spec],
		dshBin,
		env,
		platform,
		beforeSpawn: expectedName !== void 0 ? (home) => {
			before = readProfileDependencies(profile, home);
		} : void 0,
		prefetcher,
		confirm: expectedName !== void 0 ? (home) => confirmBundleActivation(profile, home, expectedName, before) : void 0,
		confirmLanded: alsoConfirm,
		afterDone,
		onStatus,
		timeoutMs
	});
}
/** The profile's dependency map as it stood before the spawn: `{}` when the
* manifest is absent — the profile-not-initialized case, which `dsh plugin`
* resolves by creating it — and `null` when it exists but could not be read
* or parsed. Neither is worth failing the spawn over; they differ only in
* what the confirm may then say.
*
* `activationFailureDetail` withholds both of its diff branches on `null`,
* because an unreadable manifest read as empty makes every pre-existing
* dependency look newly added — and the detail then tells the reader to
* remove one of their own working plugins.
*
* The existence check is what separates the two: `readProfileManifest` wraps
* its read error in a plain `Error`, so ENOENT arrives with no `code` to
* branch on. Both directions of the race between the check and the read are
* safe — a file that appears is read normally, and one that disappears
* throws and reports the state as unknown, which it is. */
function readProfileDependencies(profile, home) {
	const profileDir = resolveProfileDir(profile, home);
	if (!existsSync(join(profileDir, "package.json"))) return {};
	try {
		return readProfileManifest("dsh-plugin-shop", profileDir).dependencies ?? {};
	} catch {
		return null;
	}
}
/**
* Run one `dsh plugin --profile <profile> remove <name>` and track it.
* When `expectedName` is given, a zero exit is confirmed against the profile
* manifest — the bundle must actually have LEFT `dsh.profile.bundles` — before
* the uninstall reports `done`. When `afterDone` is given, the terminal `done`
* waits for it to settle (§D hot mount).
*/
function startUninstall(options) {
	const { profile, name, dshBin = "dsh", env, expectedName, afterDone, onStatus, timeoutMs } = options;
	return spawnPluginCli({
		profile,
		argv: ["remove", name],
		dshBin,
		env,
		confirm: expectedName !== void 0 ? (home) => confirmBundleRemoval(profile, home, expectedName) : void 0,
		afterDone,
		onStatus,
		timeoutMs
	});
}
//#endregion
//#region src/host/bundle-patch.ts
/**
* The patch files a bundle declares, read the way dsh reads them (design
* 2026-09-26-dsh-017-readiness, B4).
*
* dsh 0.1.7's app-boot (`bundlePatchFiles`) accepts `dsh.bundle.patch` as one
* package-relative file or as a list of them, applied in order, and throws on
* anything else. dsh 0.1.5 reads only the string form: it joins the
* declaration onto the package directory, so a list makes the profile fail to
* start. What the RUNNING dsh accepts is `RunningHarness.patchLists`; this
* reads the declaration itself, for the shop's own readers of a package's
* patch — the entries it owns, the rows a hot mount replicates.
*/
/**
* The declared patch files in application order: one for a string, the
* listed ones for a list of strings. Null for a declaration dsh refuses —
* neither a path nor a list of paths — which is distinct from an absent one:
* only absence means the conventional `cordis.patch.yml`, and a caller that
* fell back to it for a refused declaration would act on a patch dsh never
* applies. Pure, and the list is a copy.
*/
function bundlePatchFiles(declared) {
	if (typeof declared === "string") return [declared];
	if (Array.isArray(declared) && declared.every((file) => typeof file === "string")) return [...declared];
	return null;
}
/**
* Whether an installed package's `dsh.bundle.patch` would stop the profile
* from starting at the next boot, given whether the running dsh reads a list
* (`RunningHarness.patchLists`). An absent declaration is no hazard: dsh adds
* a package to the profile's bundles only when it declares a patch, so
* nothing reads the field. An unknown harness (null) forms no verdict on a
* list — the rule for every harness read — but a malformed declaration is
* refused by every dsh, so it is named whatever is known. Pure.
*/
function patchDeclarationHazard(declared, patchLists) {
	if (declared === void 0) return null;
	if (bundlePatchFiles(declared) === null) return "malformed";
	return Array.isArray(declared) && patchLists === false ? "list-unsupported" : null;
}
//#endregion
//#region src/host/hot.ts
/**
* Restart-free installs: mount a freshly installed plugin into the running
* composition through a shop-owned Include subtree (design 2026-08-31
* market-borrowings §4, mechanism ported from dsh-market's hot.ts).
*
* Durable state stays with the profile's `dsh.profile.bundles`, so the next
* boot loads the plugin through the normal bundle layer. The subtree exists
* only for this process: its input files live under `<profile>/.dsh-shop/`
* and are wiped on every boot, so a crash can never leave a file that
* collides with the bundle layer (inserting an id the bundle layer also
* inserts is a hard boot failure). Rows are prefixed `mkt-` for the same
* reason: within this session the hot entry must never share an id with a
* boot-layer entry, including a disabled one left behind by an update swap.
*
* The Include subclass suppresses `write()` — the loader otherwise persists
* tree changes back to the file it read (dsh-market hot.ts; the in-tree
* precedent is dsh's agent-presets PresetTree).
*
* Reasons are CODES, never copy: the host has no idea which language the
* person reading it set in dsh, so it names what happened and the client
* renders it through dsh's own locale service.
*
* Deliberate non-port: dsh-market's client-only shim (`mountClientOnlyDeps`
* and `shimNames`, which hot-mounted a package with no server-side entry by
* inserting a shim loader entry) is omitted. Our catalog never lists a
* package without `dsh.bundle`, so the shim branch is unreachable here
* (YAGNI). `hotMount` still distinguishes "no patch file / not
* hot-mountable" from "restart will fix it" through the `reason` code.
*/
/** The loader's YAML dialect: `!!js` scalars round-trip as expression nodes
* rather than throwing, so a patch carrying one is refused for its SHAPE
* (below) instead of being indistinguishable from malformed YAML. Nothing is
* evaluated here — the loader evaluates at entry activation. */
const PATCH_SCHEMA = JSON_SCHEMA.extend(new Type("tag:yaml.org,2002:js", {
	kind: "scalar",
	resolve: () => true,
	construct: (data) => ({ __jsExpr: data })
}));
const nodeHotFs = {
	read: (path) => readFileSync(path, "utf8"),
	write: (path, data) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, data);
	},
	list: (path) => readdirSync(path)
};
/** This session's mounts, keyed by package name — the same key `hotUnmount`
* and the gateway's flows use. The subtree unwinds with the shop's own
* fiber; the map exists so a name can be disposed on demand. */
const hotHandles = /* @__PURE__ */ new Map();
/** The shop's own namespace for ephemeral mount inputs. */
const HOT_DIR = ".dsh-shop";
/** `hot-<n>.yml` files: the only things `cleanHotDir` wipes and the only
* files `hotMount` writes. */
const HOT_FILE_RE = /^hot-(\d+)\.yml$/;
/**
* Parse a bundle patch into the plain insert rows a hot tree can replicate.
*
* Only an `insert` list of plain `id`/`name` entries parses. A bare id-keyed
* row is a TARGETING patch — the loader looks the id up in the already
* composed tree and skips it when absent (applyEntryPatches), so it creates
* nothing and there is nothing to replicate. A row carrying config, a group,
* or an `!!js` expression name returns null too, and every null sends the
* caller to restart activation. Parsed as YAML in the loader's own dialect,
* so line endings and comments are the parser's problem, not ours, and
* nothing in the patch is evaluated. Pure: string in, rows out.
*/
function parseSimplePatch(patchText) {
	let parsed;
	try {
		parsed = load(patchText, { schema: PATCH_SCHEMA });
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;
	const rows = [];
	for (const patch of parsed) {
		if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return null;
		const keys = Object.keys(patch);
		if (keys.length !== 1 || keys[0] !== "insert") return null;
		const inserted = patch.insert;
		if (!Array.isArray(inserted)) return null;
		for (const item of inserted) {
			if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
			const { id, name } = item;
			if (typeof id !== "string" || typeof name !== "string") return null;
			if (Object.keys(item).some((key) => key !== "id" && key !== "name")) return null;
			rows.push({
				id,
				name
			});
		}
	}
	return rows.length > 0 ? rows : null;
}
/** Render the accepted rows with prefixed ids — the exact input file the
* Include tree mounts. Only values the line scan accepted are emitted, and
* the output is itself a simple patch (round-trips through
* parseSimplePatch). */
function renderRows(rows, prefix) {
	return dump(rows.map((row) => ({
		id: `${prefix}${row.id}`,
		name: row.name
	})), {
		noRefs: true,
		lineWidth: -1
	});
}
/** The next free `hot-<n>` number: one past the highest existing file, or 1
* when the directory does not exist yet (the write recreates it). */
function nextHotNumber(fs, dir) {
	let names;
	try {
		names = fs.list(dir);
	} catch {
		return 1;
	}
	let max = 0;
	for (const name of names) {
		const match = HOT_FILE_RE.exec(name);
		if (match !== null && match[1] !== void 0) max = Math.max(max, Number(match[1]));
	}
	return max + 1;
}
/** The installed package's own `dsh.bundle.patch`, exactly as declared (the
* Include input), or undefined when the package, its manifest or the field
* is absent. */
function declaredPatch(fs, packageDir) {
	try {
		return JSON.parse(fs.read(join(packageDir, "package.json"))).dsh?.bundle?.patch;
	} catch {
		return;
	}
}
/** Load the Include class through a computed dynamic import, or null when
* the optional peer is missing (an older harness — every path then falls
* back to restart activation). */
async function loadHotTreeClass() {
	const specifier = "@deepseek-ai/cordis-plugin-include";
	try {
		return (await import(specifier)).default;
	} catch {
		return null;
	}
}
/** Wrap a tree class in a subclass that suppresses `write()` — the loader
* otherwise persists tree changes back to the file it read. The hot file is
* written once with the mkt- ids and must never be rewritten from live tree
* state. */
function suppressWrite(treeClass) {
	const Base = treeClass;
	return class HotTree extends Base {
		write() {}
	};
}
/**
* Mount one installed package into the running composition through an
* Include subtree: read its bundle patch, replicate the simple rows under
* `mkt-` ids into `<profile>/.dsh-shop/hot-<n>.yml`, register the tree, and
* race its activation against `timeoutMs`. Success returns `ok: true` with
* no reason; any fallback returns `ok: false` with a reason code
* distinguishing "restart will fix it" (timeout, activation failure,
* unavailable include) from "this package can never hot-mount" (no patch
* file, or rows the hot tree cannot replicate). The plugin is installed in
* the bundle layer either way, so a restart always activates it.
*/
async function hotMount(ctx, profileDir, packageName, deps = {}) {
	const { fs = nodeHotFs, dir = join(profileDir, HOT_DIR), timeoutMs = Number(process.env.DSH_SHOP_HOT_MOUNT_TIMEOUT_MS) || 1e4, now = Date.now } = deps;
	const packageDir = join(profileDir, "node_modules", packageName);
	const declared = declaredPatch(fs, packageDir);
	const files = declared === void 0 ? ["cordis.patch.yml"] : bundlePatchFiles(declared);
	if (files === null || files.length === 0) {
		ctx.logger?.warn(`hot-mount ${packageName}: the bundle patch is declared as neither a file path nor a list of them — restart will activate it`);
		return {
			ok: false,
			reason: "no-patch"
		};
	}
	const rows = [];
	for (const file of files) {
		const patchFile = resolve(packageDir, file);
		const inside = relative(packageDir, patchFile);
		if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
			ctx.logger?.warn(`hot-mount ${packageName}: the declared bundle patch is outside the package directory — restart will activate it`);
			return {
				ok: false,
				reason: "no-patch"
			};
		}
		let patchText;
		try {
			patchText = fs.read(patchFile);
		} catch {
			ctx.logger?.warn(`hot-mount ${packageName}: no patch file to mount — restart will activate it`);
			return {
				ok: false,
				reason: "no-patch"
			};
		}
		const parsed = parseSimplePatch(patchText);
		if (parsed === null) {
			ctx.logger?.warn(`hot-mount ${packageName}: patch has rows that cannot be hot-mounted — restart will activate it`);
			return {
				ok: false,
				reason: "not-simple"
			};
		}
		rows.push(...parsed);
	}
	let treeClass = deps.hotTreeClass;
	if (treeClass === void 0) treeClass = await loadHotTreeClass();
	if (treeClass === null) {
		ctx.logger?.warn(`hot-mount ${packageName}: the include plugin is unavailable in this harness — restart will activate it`);
		return {
			ok: false,
			reason: "host-unsupported"
		};
	}
	const file = join(dir, `hot-${nextHotNumber(fs, dir)}.yml`);
	fs.write(file, renderRows(rows, "mkt-"));
	let handle;
	try {
		const HotTree = suppressWrite(treeClass);
		handle = ctx.plugin(HotTree, { path: pathToFileURL(file).href });
	} catch (error) {
		ctx.logger?.warn(`hot-mount ${packageName}: mounting the include tree failed — restart will activate it (${String(error)})`);
		return {
			ok: false,
			reason: "mount-failed"
		};
	}
	const previous = hotHandles.get(packageName);
	if (previous !== void 0) {
		try {
			await previous.dispose();
		} catch (error) {
			ctx.logger?.warn(`hot-mount ${packageName}: the previous hot mount refused to dispose (${String(error)})`);
		}
		hotHandles.delete(packageName);
	}
	const outcome = await withTimeout(handle.await(), timeoutMs, now);
	if (outcome === "settled") {
		hotHandles.set(packageName, handle);
		ctx.logger?.info(`hot-mounted ${packageName} (${file})`);
		return {
			ok: true,
			reason: null
		};
	}
	try {
		await handle.dispose();
	} catch (error) {
		ctx.logger?.warn(`hot-mount ${packageName}: dispose after a failed mount also failed — a restart cleans up (${String(error)})`);
	}
	return {
		ok: false,
		reason: outcome === "timeout" ? "timeout" : "mount-failed"
	};
}
/** Race the fiber's activation against the deadline. The remaining time is
* measured on the injectable clock so tests can drive the timeout
* deterministically; the timer is cleared when the activation wins. */
function withTimeout(activation, timeoutMs, now) {
	const deadline = now() + timeoutMs;
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve("timeout"), Math.max(0, deadline - now()));
	});
	return Promise.race([activation.then(() => "settled", () => "failed"), timeout]).finally(() => {
		if (timer !== void 0) clearTimeout(timer);
	});
}
/**
* Dispose a package's hot mount. Returns false (without touching anything)
* when the name is not mounted; the handle leaves the map before the
* dispose so a mount can never be disposed twice, and a throwing dispose
* propagates — the plugin may still be live in this session.
*/
async function hotUnmount(packageName) {
	const handle = hotHandles.get(packageName);
	if (handle === void 0) return false;
	hotHandles.delete(packageName);
	await handle.dispose();
	return true;
}
/** Wipe the session's mount inputs at host start: `hot-<n>.yml` files under
* `<profile>/.dsh-shop/` only — anything else in the namespace directory is
* left alone, and a missing directory is a no-op. */
function cleanHotDir(profileDir) {
	const dir = join(profileDir, HOT_DIR);
	let names;
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of names) if (HOT_FILE_RE.test(name)) rmSync(join(dir, name), { force: true });
}
//#endregion
//#region src/host/state.ts
/**
* The shop's own per-profile state: the plugins a reader starred, and the
* version each installed plugin was updated from (design
* 2026-11-02-market-borrowings §6–§7).
*
* One file, `<profile>/.dsh-shop/state.json`, beside the hot-mount inputs but
* not among them: `cleanHotDir` wipes `hot-<n>.yml` only, so this survives a
* boot. It is deliberately NOT part of the profile manifest: favorites are a
* reading aid, and a `dsh plugin add` that rewrote `package.json` must never
* be able to take them down.
*
* Every read is forgiving and every write is atomic. Losing this file costs a
* reader their stars and one rollback offer; taking the page down over it
* would be the worse bug, so a malformed file reads as empty state rather
* than throwing. The next write replaces it with a valid one.
*/
/**
* How many times a rename is retried when Windows refuses it, and how long
* between tries.
*
* Measured 2026-11-02 on Windows 11: `renameSync` over a target another
* handle holds open throws `EPERM`, and so does one over a read-only target —
* an antivirus scan, a backup agent or a second dsh on the same profile is
* enough. Five tries at 20 ms covers a scanner's open/close window without
* making a click wait on a wedged file.
*/
const RENAME_TRIES = 5;
const RENAME_RETRY_MS = 20;
function nodeShopStateIo() {
	return {
		read: (path) => readFileSync(path, "utf8"),
		mkdir: (path) => {
			mkdirSync(path, { recursive: true });
		},
		writeFile: (path, data) => {
			writeFileSync(path, data);
		},
		rename: (from, to) => {
			renameSync(from, to);
		},
		remove: (path) => {
			rmSync(path, { force: true });
		},
		wait: (ms) => {
			const until = Date.now() + ms;
			while (Date.now() < until);
		},
		processId: process.pid
	};
}
/**
* A writer over `io`, temp-then-rename.
*
* The temp name carries the process id and a per-write counter: a fixed
* `.tmp` gave two dsh processes on one profile the same scratch file.
*
* `rename` is retried on `EPERM`/`EBUSY`, which is what Windows reports when
* another handle (an antivirus scan, a backup agent, a second dsh) holds the
* target; measured 2026-11-02, a read-only target throws it too. Any other
* code, or the last try, removes the scratch file and rethrows.
*/
function shopStateFsFor(io) {
	let counter = 0;
	return {
		read: io.read,
		write: (path, data) => {
			io.mkdir(dirname(path));
			counter += 1;
			const tmp = `${path}.${io.processId}.${counter}.tmp`;
			io.writeFile(tmp, data);
			for (let attempt = 1;; attempt += 1) try {
				io.rename(tmp, path);
				return;
			} catch (error) {
				const code = error.code;
				if (!(code === "EPERM" || code === "EBUSY") || attempt >= RENAME_TRIES) {
					try {
						io.remove(tmp);
					} catch {}
					throw error;
				}
				io.wait(RENAME_RETRY_MS);
			}
		}
	};
}
const nodeShopStateFs = shopStateFsFor(nodeShopStateIo());
/**
* A fresh empty state.
*
* A function, never a shared constant: both writers mutate what
* `readShopState` returns, so handing every missing file the same object made
* one profile's failed save visible to the next caller — and a test that
* compared against the constant could not see it.
*/
function emptyShopState() {
	return {
		favorites: [],
		previous: {}
	};
}
/** A path walk cannot climb out of: identities and names are catalog or
* manifest text, and the record is only ever used to build a spec. */
const KEY_MAX_LENGTH = 300;
/** The longest version this file keeps. An npm version is bounded by 256
* everywhere else in this codebase; a commit is 40. */
const VERSION_MAX_LENGTH = 256;
const REPO_SHAPE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
/** Most favorites one file may hold. Far past any real shelf, and a bound
* nonetheless: the file is the reader's, and a hand-edited one must not turn
* every card render into a set lookup over a million rows. */
const FAVORITES_MAX = 5e3;
function statePath(profileDir) {
	return join(profileDir, ".dsh-shop", "state.json");
}
/** One install identity this file will store. */
function isKey(value) {
	return typeof value === "string" && value.length > 0 && value.length <= KEY_MAX_LENGTH;
}
function isRollbackRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const record = value;
	if (record.source !== "npm" && record.source !== "github") return false;
	if (typeof record.name !== "string" || record.name.length === 0 || record.name.length > KEY_MAX_LENGTH) return false;
	if (typeof record.version !== "string" || record.version.length === 0 || record.version.length > VERSION_MAX_LENGTH) return false;
	if (record.repo !== void 0 && (typeof record.repo !== "string" || !REPO_SHAPE.test(record.repo))) return false;
	if (record.subdir !== void 0 && typeof record.subdir !== "string") return false;
	if (record.source === "github" && record.repo === void 0) return false;
	return true;
}
/**
* The state file's contents, or empty state when it is missing, unreadable or
* malformed.
*
* Each half is validated on its own, so a corrupt `previous` map never costs
* the reader their favorites: the parts that parse are kept, the parts that
* do not are dropped. That is the opposite of the catalog's rule — a catalog
* this code did not write is a five-alarm fire, while this file is a reading
* aid whose loss is measured in stars.
*/
function readShopState(fs, profileDir) {
	let text;
	try {
		text = fs.read(statePath(profileDir));
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		return emptyShopState();
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return emptyShopState();
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return emptyShopState();
	const document = parsed;
	const favorites = [];
	if (Array.isArray(document.favorites)) {
		const seen = /* @__PURE__ */ new Set();
		for (const value of document.favorites) {
			if (!isKey(value) || seen.has(value)) continue;
			seen.add(value);
			favorites.push(value);
			if (favorites.length === 5e3) break;
		}
	}
	const previous = {};
	if (typeof document.previous === "object" && document.previous !== null && !Array.isArray(document.previous)) {
		let kept = 0;
		for (const [key, value] of Object.entries(document.previous)) {
			if (kept === 2e3) break;
			if (!isKey(key) || !isRollbackRecord(value)) continue;
			previous[key] = value;
			kept += 1;
		}
	}
	return {
		favorites,
		previous
	};
}
/** Write one state document, bounded and normalized. Throws on a write
* failure: the caller decides what a lost favorite costs, and swallowing here
* would report a save that did not happen. */
function writeShopState(fs, profileDir, state) {
	const favorites = state.favorites.filter(isKey).slice(0, FAVORITES_MAX);
	const previous = {};
	let kept = 0;
	for (const [key, record] of Object.entries(state.previous)) {
		if (kept === 2e3) break;
		if (!isKey(key) || !isRollbackRecord(record)) continue;
		previous[key] = record;
		kept += 1;
	}
	fs.write(statePath(profileDir), `${JSON.stringify({
		favorites,
		previous
	}, null, 2)}\n`);
}
/**
* The spec a rollback re-installs, built from a record this host wrote.
*
* Never from client input: the RPC takes only the identity, and everything
* here comes from the file above. `undefined` for a record whose version is
* not the shape its channel can install — a hand-edited record, or one
* written by a future rule — because a spec the shop cannot spell is not
* offered as a button.
*/
function rollbackSpec(record) {
	if (record.source === "npm") {
		if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(record.version)) return void 0;
		return `${record.name}@${record.version}`;
	}
	if (!/^[0-9a-f]{40}$/.test(record.version)) return void 0;
	const subdir = record.subdir === void 0 ? "" : `&path:${record.subdir}`;
	return `github:${record.repo}#${record.version}${subdir}`;
}
//#endregion
//#region src/host/activation.ts
/**
* Decide what the reader must do.
*
* @param input.hostLive - whether the plugin's host half is in its intended
* post-change state in this process right now: the hot-mount outcome for an
* install or update, whether the fiber actually went away for an uninstall,
* and true for a toggle (the user layer is hot-reloaded).
* @param input.hasClientHalf - whether the package declares `dsh.client`. An
* unreadable manifest reports `true`; see `client-half.ts` for why.
* @param input.clientLive - whether THIS change's browser half is in the
* graph the webserver hands a reloading tab.
*
* `clientLive` is the difference between the two routes a change can take,
* and it is measured rather than assumed:
*
* - A change to the BOOT COMPOSITION — a toggle, an uninstall — moves an
*   entry the registry already enumerates, and the served graph follows it
*   within seconds (§2, measured 2026-09-11). `true`.
* - A HOT MOUNT — an install — adds entries under the shop's own loader
*   entry, which the registry enumerates like any other: across a reload
*   following the mount the served graph gains the package and the page runs
*   its browser half (measured 2026-09-26 on 0.1.5-rc.3 and 0.1.7-rc.2, in
*   `web-full-flow.e2e.ts`). `true`.
*
* The asymmetry that decides every unknown still runs the same way: offering
* a step that was not needed costs the reader one action, withholding one
* that was needed is the defect this module exists to fix. Which step a hot
* mount needs has been measured twice. On 2026-09-14 the graph came back
* byte-identical across the reload, and installs moved to `restart` — but the
* shop then registered the tree from whichever context made the RPC call, the
* typert gateway's, and the registry never composed a tree hung there. Once
* the tree hung off the shop's own entry (2026-09-26), the same measurement
* found the package in the graph, and installs moved back to `reload`.
*/
function activationOf(input) {
	if (!input.hostLive) return "restart";
	if (!input.hasClientHalf) return "live";
	return input.clientLive ? "reload" : "restart";
}
//#endregion
//#region src/host/client-half.ts
/**
* Does an installed package have a browser half? (design
* 2026-09-11-activation-model §3.)
*
* The harness's `ClientModuleRegistry` scans the loader's entries for
* packages declaring `dsh.client` and composes `window.__DSH_BOOT__` from
* them. That declaration is therefore the whole question: a package that
* declares it puts something in a browser tab, and a tab opened before the
* change is showing the state from before it.
*
* The read goes through `HotFs`, the same injected seam `hot.ts` uses to
* read the same file for `dsh.bundle.patch`, so tests never touch disk and
* exactly one production call site does.
*/
/**
* Whether `packageName`, as installed in `profileDir`, declares `dsh.client`.
*
* **An unreadable manifest answers `true`.** Offering a reload that was not
* needed costs the reader one keystroke; withholding one that was needed is
* the defect this module exists to fix, so the fallback is the safe side of
* a lopsided asymmetry rather than a guess.
*
* The VALUE of `dsh.client` is not inspected — an empty object is a
* declaration. Only a non-object (the manifest saying something else
* entirely) reads as no declaration.
*/
function hasClientHalf(fs, profileDir, packageName) {
	let text;
	try {
		text = fs.read(join(profileDir, "node_modules", packageName, "package.json"));
	} catch {
		return true;
	}
	let manifest;
	try {
		manifest = JSON.parse(text);
	} catch {
		return true;
	}
	const client = manifest?.dsh?.client;
	return typeof client === "object" && client !== null && !Array.isArray(client);
}
//#endregion
//#region src/host/restart.ts
/** Restart executor: hand the port to a new dsh instance, two-phase.
*
* The old process cannot wait for the new one: the new one must bind the
* port the old one still holds, and two live processes cannot bind it at
* once — the first implementation spawned the child and waited for its URL,
* and the child crashed in boot with EADDRINUSE every time. The handoff is
* therefore inverted: the parent commits and exits FIRST, and a detached
* helper waits for the parent's pid to disappear before exec'ing the same
* dsh command line. The browser monitors the origin and refreshes once the
* new server answers; a boot that fails is diagnosed from the log file,
* since nobody is attached to the child's pipes. */
/** Spawn the two-phase handoff. The helper is a POSIX shell wrapper that
* polls the parent pid until it is gone, then replaces itself with the dsh
* command — `exec "$@"` keeps the argv verbatim, so no argument quoting is
* involved. The child's stdout/stderr go to `logFile`, opened here in
* append mode; opening throws on failure, and the caller treats a throw as
* a refusal (the restart is never committed without its log).
*
* The pid-poll has the usual tiny reuse race — if the parent's pid is
* recycled within the 0.2s polling gap the helper waits for the unrelated
* process too. Harmless: it only delays the boot.
*
* POSIX only: `sh`, `kill -0` and `sleep` are all Unix, and `exec "$@"` has
* no Windows equivalent. The spawn would fail ASYNCHRONOUSLY, after this
* function has already returned and the caller has committed — so the gateway
* refuses on Windows before reaching here rather than exiting into nothing
* (index.ts `restartPlatformSupported`). */
/**
* Resolve the command line that re-runs this process.
*
* A bare `dsh` from PATH is not necessarily the process serving the current
* port: a dsh launched through `node`, `npx`, or `pnpm dlx` carries its own
* script and `execArgv`. Reconstructing that exact node invocation preserves
* the entry point and runtime flags. An explicitly named binary remains an
* explicit choice and is passed through unchanged.
*/
function restartCommand(options) {
	const { dshBin, argv, execPath, execArgv, script } = options;
	if (dshBin === "dsh" && script !== void 0) return {
		command: execPath,
		args: [
			...execArgv,
			script,
			...argv
		]
	};
	return {
		command: dshBin,
		args: [...argv]
	};
}
/** One line of the handoff's own in the log, stamped in UTC ISO 8601 so a
* reader can line it up against the new process's output and the browser's
* clock. The helper stamps its line with `date -u` to the same shape, to the
* second. */
function stamped(text) {
	return `${(/* @__PURE__ */ new Date()).toISOString()} dsh-plugin-shop: ${text}\n`;
}
function startRestart(options) {
	const { command, args, parentPid, logFile, env } = options;
	const logFd = openSync(logFile, "a");
	try {
		writeSync(logFd, stamped(`restart committed; the new dsh starts once pid ${parentPid} exits: ${[command, ...args].join(" ")}`));
		let helper;
		try {
			helper = spawn("sh", [
				"-c",
				"while kill -0 \"$1\" 2>/dev/null; do sleep 0.2; done; echo \"$(date -u +%Y-%m-%dT%H:%M:%SZ) dsh-plugin-shop: pid $1 exited; starting the new dsh\"; shift; exec \"$@\"",
				"sh",
				String(parentPid),
				command,
				...args
			], {
				stdio: [
					"ignore",
					logFd,
					logFd
				],
				env: env ?? process.env,
				detached: true
			});
		} catch (error) {
			writeSync(logFd, stamped(`the restart helper could not start: ${error.message}`));
			throw error;
		}
		helper.on("error", (error) => {
			try {
				appendFileSync(logFile, stamped(`the restart helper could not start: ${error.message}`));
			} catch {}
		});
		helper.unref();
	} finally {
		closeSync(logFd);
	}
}
//#endregion
//#region src/host/self-update.ts
/** Self-update version check: the shop's latest published version, from the
* npm packument. Advisory by design — like the stars sidecar, a failed
* check degrades to `null` and never throws, never blocks a publish. The
* catalog cannot serve here: the shop is bootstrap-installed and is not
* harvested into its own catalog. */
/** The npm package the shop itself is published as. */
const SHOP_PACKAGE = "dsh-plugin-shop";
/** The registry that always gets asked, last. */
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
/** How long one registry gets to answer. `shop/version` is warmed at every
* web boot, so a silent socket must not hold the boot indefinitely. */
const VERSION_CHECK_TIMEOUT_MS = 5e3;
/** Ask one registry. Any failure — network, non-2xx, unexpected payload,
* deadline — is the same outcome: no answer from this registry. */
async function askRegistry(fetchFn, registry, timeoutMs) {
	const url = `${registry}${SHOP_PACKAGE}`;
	const signal = AbortSignal.timeout(timeoutMs);
	try {
		const response = await Promise.race([fetchFn(url, { signal }), new Promise((_resolve, reject) => {
			signal.addEventListener("abort", () => {
				reject(/* @__PURE__ */ new Error(`the version check did not answer within ${timeoutMs} ms`));
			}, { once: true });
		})]);
		if (!response.ok) return null;
		const latest = (await response.json())["dist-tags"]?.latest;
		return typeof latest === "string" ? latest : null;
	} catch {
		return null;
	}
}
/**
* Fetch the shop's `latest` dist-tag, or `null` when no registry can answer.
* The user's own registry is tried first when known; npmjs is always the
* fallback so a mirror that lags cannot hide a release.
*/
async function fetchLatestVersion(fetchFn = fetch, options = {}) {
	const { registry = null, timeoutMs = VERSION_CHECK_TIMEOUT_MS } = options;
	const asked = /* @__PURE__ */ new Set();
	const registries = registry === null ? [DEFAULT_REGISTRY] : [registry, DEFAULT_REGISTRY];
	for (const base of registries) {
		const normalized = base.endsWith("/") ? base : `${base}/`;
		if (asked.has(normalized)) continue;
		asked.add(normalized);
		const latest = await askRegistry(fetchFn, normalized, timeoutMs);
		if (latest !== null) return latest;
	}
	return null;
}
//#endregion
//#region src/host/supervisor.ts
function detectSupervisor(env, proc) {
	return (env.INVOCATION_ID !== void 0 || env.JOURNAL_STREAM !== void 0) && proc.ppid === 1 ? "systemd" : null;
}
//#endregion
//#region src/host/repo-pins.ts
/**
* The Host's memory of which commit it installed for each github entry.
*
* pnpm writes the manifest dependency as `github:owner/slug` — no commit —
* and the resolved commit lives only in the lockfile. The shop records the
* commit it pinned at install time in its own cache so `installed()` can
* report `outdated` honestly without parsing pnpm's lockfile. The profile
* manifest remains the source of truth for *presence*: a pin whose bundle
* is not a manifest dependency is a leftover from a failed install and is
* never reported.
*/
/** Read the pins file; any irregularity degrades to an empty record. */
function readRepoPins(fs, path) {
	if (!fs.exists(path)) return {};
	try {
		const parsed = JSON.parse(fs.read(path));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		const out = Object.create(null);
		for (const [name, pin] of Object.entries(parsed)) if (typeof pin === "string" && (COMMIT_SHA.test(pin) || RELEASE_TAG.test(pin))) out[name] = pin;
		return out;
	} catch {
		return {};
	}
}
/** Write the pins file atomically enough for its purpose (a cache). */
function writeRepoPins(fs, path, pins) {
	fs.write(path, `${JSON.stringify(pins, null, 2)}\n`);
}
//#endregion
//#region src/host/profile.ts
/** Profile directory discovery and user-layer writes (§8: hot enable/disable). */
/** The loader's `!!js` expression scalar, for the document edit: read as its
* source text and written back under its own tag, never evaluated — the
* loader evaluates it at entry activation. The same declaration the harness's
* own writer of this file uses (`@deepseek-ai/dsh-plugin-manager` 0.1.7). */
const USER_LAYER_TAGS = [{
	tag: "tag:yaml.org,2002:js",
	resolve: (source) => source
}];
/**
* Find the profile directory that owns `startPath`.
*
* `baseDir` is the boot-provided profile directory (the Loader root's own
* directory, `ctx.baseUrl`) and is authoritative when it is a profile. The
* walk-up from `startPath` covers the case where the package is materialized
* inside the profile's node_modules — but a `link:` install keeps the package
* at its source location, so no ancestor of the module path is a profile at
* all. In that case only `baseDir` can answer.
*/
function discoverProfile(startPath, baseDir) {
	if (baseDir !== void 0 && isProfileDir(baseDir)) return {
		name: basename(baseDir),
		dir: baseDir
	};
	let dir = realpathNearestExisting(startPath);
	for (;;) {
		if (isProfileDir(dir)) return {
			name: basename(dir),
			dir
		};
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(`dsh-plugin-shop: no profile directory found above ${startPath}`);
}
/** A directory is a profile when it holds the Loader root next to the bundle
* manifest the shop's own package.json declares itself part of. */
function isProfileDir(dir) {
	if (!existsSync(join(dir, "cordis.yml"))) return false;
	try {
		const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		return Array.isArray(manifest.dsh?.profile?.bundles);
	} catch {}
	return false;
}
/** Resolve symlinks through the deepest ancestor of `startPath` that exists.
* The leaf — the shop's own module file — need not be present yet for
* discovery to know where it lives. */
function realpathNearestExisting(startPath) {
	let current = startPath;
	for (;;) try {
		return realpathSync(current);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		const parent = dirname(current);
		if (parent === current) return current;
		current = parent;
	}
}
/**
* Write every user-layer row of one package in a single pass.
*
* A package owns as many loader entries as its bundle patch inserts (see
* {@link ownedEntryIds}), and they toggle together: writing them one at a
* time would read-modify-write the file once per entry, so a crash between
* two writes would leave the package half disabled.
*
* The edit changes one key and nothing else (design
* 2026-09-26-market-borrowings §2). The layer is validated by the harness's
* own parser first, so one it cannot load still throws and is never
* rewritten; it is then edited as a YAML document, which keeps every comment,
* every other row, every other key and every `!!js` scalar as the user wrote
* them. The whole-file rewrite this replaced dropped each toggled id's row —
* and with it a `config:` override the user had put there — and dumped the
* list back through a library that models no comments, so the first toggle
* erased the header dsh writes into every new profile.
*
* For each entry the row written is the LAST one carrying its id, when the
* harness is sure to apply it: applyEntryPatches applies rows in order and
* each key replaces the entry's value, so the last row that sets `disabled`
* decides it. A row with `insert` is an insertion into a group, never an
* override; a row naming another module is skipped by the harness; a named
* row whose module the caller did not say cannot be judged. In each of those
* cases a row is appended instead, which the harness applies last whatever
* came before it — so appending is never wrong, only less tidy.
*
* An enable writes `disabled: false` rather than deleting the row, which is
* what lost a user's row or the comment above it; it is also the harness's
* own convention for this file from 0.1.7. The file keeps its permission bits
* across the rename (a new one is created owner-only, as the harness's writer
* does), because a config override can hold a credential.
*/
function setUserLayerRows(options) {
	const file = join(options.profileDir, "cordis.patch.yml");
	loadOptionalPatches("dsh-plugin-shop", file);
	let text = "[]\n";
	let mode = 384;
	if (existsSync(file)) {
		text = readFileSync(file, "utf8");
		mode = statSync(file).mode & 511;
	}
	const document = parseDocument(text, { customTags: USER_LAYER_TAGS });
	const parseError = document.errors[0];
	if (parseError !== void 0) throw parseError;
	const list = document.contents;
	if (!isSeq(list)) throw new Error(`dsh-plugin-shop: ${file} is not a YAML list of patch rows`);
	for (const row of options.rows) {
		const target = lastRowFor(list.items, row.id);
		if (target !== null && appliesTo(target, row.name)) {
			target.set("disabled", row.disabled);
			continue;
		}
		if (list.items.length === 0) list.flow = false;
		document.add({
			id: row.id,
			disabled: row.disabled
		});
	}
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, document.toString({ lineWidth: 0 }), { mode });
	chmodSync(tmp, mode);
	renameSync(tmp, file);
}
/** The last override row carrying `id`, or null when there is none. A row
* with `insert` is an insertion into group `id`, not an override of it. */
function lastRowFor(items, id) {
	for (let index = items.length - 1; index >= 0; index--) {
		const item = items[index];
		if (isMap(item) && !item.has("insert") && item.get("id") === id) return item;
	}
	return null;
}
/** Whether the harness is sure to apply `row` to the entry mounting
* `moduleName`: a row with no `name`, or one naming that very module. */
function appliesTo(row, moduleName) {
	if (!row.has("name")) return true;
	return moduleName !== void 0 && row.get("name") === moduleName;
}
/**
* The loader entry ids one installed package contributes to the tree.
*
* This — not the entry's module name — is what identifies a package's rows.
* A package declares a bundle patch whose `insert` list may add zero, one, or
* many entries, and an inserted entry's `name` is the MODULE it mounts, which
* need not be the package at all: `@tt-a1i/archify-dsh` inserts a configured
* instance of `@deepseek-ai/dsh-skill-filesystem` and registers no module of
* its own. Matching a package to its rows by module name therefore finds
* nothing for such a package, which is why the toggle reported it as not
* installed. The ids the package's own patch inserts are the only honest
* answer, and the inventory's `entryId` is exactly that id verbatim.
*
* Ids the patch merely TARGETS (a bare id-keyed row overriding config) are
* not owned: those rows belong to whoever inserted them, and claiming them
* would let one package disable another's entries.
*
* A package with no bundle patch, or one absent from the profile, owns
* nothing and yields `[]` — a distinct fact from "the entry is not live",
* which only the inventory can answer.
*/
function ownedEntryIds(options) {
	return ownedEntries(options).map((entry) => entry.id);
}
/**
* {@link ownedEntryIds} with the module each entry mounts beside its id. The
* name is what the harness judges a NAMED user-layer row by — a row naming a
* different module is skipped (applyEntryPatches) — so it is what lets the
* toggle write a user's own named row rather than append one beside it. It is
* read through the harness's parser, so a relative name arrives anchored to a
* file URL exactly as the composed entry carries it; an `!!js` name has no
* plain value and reads as undefined. Throws where `ownedEntryIds` does.
*/
function ownedEntries(options) {
	const packageDir = join(options.profileDir, "node_modules", ...options.packageName.split("/"));
	const manifestPath = join(packageDir, "package.json");
	if (!existsSync(manifestPath)) return [];
	let declared;
	try {
		declared = JSON.parse(readFileSync(manifestPath, "utf8")).dsh?.bundle?.patch;
	} catch (error) {
		throw new Error(`dsh-plugin-shop: failed to read ${manifestPath}: ${String(error)}`);
	}
	const files = bundlePatchFiles(declared);
	if (files === null) return [];
	const entries = [];
	for (const file of files) {
		const patchFile = resolve(packageDir, file);
		const inside = relative(packageDir, patchFile);
		if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) throw new Error(`dsh-plugin-shop: ${options.packageName} declares a bundle patch outside its own directory: ${file}`);
		collectInsertedEntries(loadOptionalPatches("dsh-plugin-shop", patchFile) ?? [], entries);
	}
	const seen = /* @__PURE__ */ new Set();
	return entries.filter((entry) => !seen.has(entry.id) && seen.add(entry.id) !== void 0);
}
/**
* An installed package's own `dsh.bundle.patch`, exactly as declared, or
* undefined when the package, its manifest or the field is absent — or the
* manifest cannot be read, which no post-install check can judge either.
*/
function declaredBundlePatch(options) {
	const manifestPath = join(options.profileDir, "node_modules", ...options.packageName.split("/"), "package.json");
	try {
		return JSON.parse(readFileSync(manifestPath, "utf8")).dsh?.bundle?.patch;
	} catch {
		return;
	}
}
/** Walk a patch list, appending every INSERTED entry. A patch row without
* `insert` targets an entry someone else composed — the loader's
* applyEntryPatches looks it up and skips it when absent, so it creates
* nothing and owns nothing. An inserted GROUP owns its children, which the
* loader reads from the group's own `config` array. */
function collectInsertedEntries(rows, into) {
	for (const row of rows) {
		if (row === null || typeof row !== "object") continue;
		const inserted = row.insert;
		if (Array.isArray(inserted)) collectEntries(inserted, into);
	}
}
function collectEntries(entries, into) {
	for (const entry of entries) {
		if (entry === null || typeof entry !== "object") continue;
		const { id, name, group, config } = entry;
		if (typeof id === "string") into.push({
			id,
			name: typeof name === "string" ? name : void 0
		});
		if (group === true && Array.isArray(config)) collectEntries(config, into);
	}
}
/**
* Does a live loader entry id belong to the package that owns `owned`?
*
* `owned` holds CONFIG ids — the ids a bundle patch's `insert` declares. A
* LIVE id is that id under the namespace of every tree composed above it,
* colon-joined, so the last segment is the declared id and the segments
* before it name the trees:
*
* - `foo` — no tree above the entry at all (a harness that composes the
*   entry list directly).
* - `include:foo` — what a REAL dsh boot produces: app-boot mounts the whole
*   profile as one root Include entry (`id: include`), so EVERY entry any
*   bundle patch inserted is namespaced by it. Matching only the bare
*   spelling found no row for any installed package, and the toggle answered
*   "not in the running plugin tree" for all of them.
* - `include:<tree>:mkt-foo` — the shop's own hot subtree, which prefixes its
*   rows `mkt-` so a plugin installed this session cannot collide with a
*   boot-layer id. The same plugin, one restart earlier.
*
* The last segment is therefore the answer, with `mkt-` stripped when a tree
* namespace is present.
*/
function ownsEntryId(owned, entryId) {
	if (owned.has(entryId)) return true;
	const colon = entryId.lastIndexOf(":");
	if (colon === -1) return false;
	const tail = entryId.slice(colon + 1);
	if (owned.has(tail)) return true;
	return tail.startsWith("mkt-") && owned.has(tail.slice(4));
}
/**
* The loader entry id `packageName` shares with another installed package, or
* null when it collides with nothing.
*
* The collision a bundle-name check cannot see. A bundle name and a loader
* entry id are independent: two DIFFERENTLY-named bundles may both declare
* `id: plugin-manager` — measured on `2768651338/dsh-plugin-manager` and
* `Dingpenghui-good/dsh-plugin-manager` — and dsh then refuses to load the
* whole tree ("duplicate loader entry id"), so the profile does not boot.
* Conversely two SAME-named plugins often declare different ids and would
* coexist fine, which is why the name gate is about overwriting a manifest
* key and this is about the loader.
*
* Best-effort per package, the same rule the installed list uses: an
* unreadable patch in some OTHER package owns nothing here rather than
* failing the caller. A package declaring no ids collides with nothing.
*/
function collidingEntryId(options) {
	const idsOrNone = (packageName) => {
		try {
			return ownedEntryIds({
				profileDir: options.profileDir,
				packageName
			});
		} catch {
			return [];
		}
	};
	const mine = new Set(idsOrNone(options.packageName));
	if (mine.size === 0) return null;
	for (const holder of options.dependencies) {
		if (holder === options.packageName) continue;
		for (const id of idsOrNone(holder)) if (mine.has(id)) return {
			id,
			holder
		};
	}
	return null;
}
//#endregion
//#region src/host/prefetch.ts
/**
* The download phase that runs in front of the per-profile install mutex.
*
* `dsh plugin add` is one opaque call: it resolves, fetches, links and writes
* in a single pnpm invocation, so the shop cannot split it. What it can do is
* warm pnpm's content store first, from outside the mutex, so the serialized
* install is a store hit. Measured 2026-09-10: an npm or github spec warmed
* this way installs with `downloaded 0`. Design doc §3.
*
* Best-effort by construction. Every failure here — pnpm absent, a non-zero
* batch, a timeout, a store guessed wrong — leaves `dsh plugin add` to fetch
* what the store lacks, exactly as it does today. Nothing about whether an
* install SUCCEEDS may depend on this module.
*/
/** How long one batch may run before it is killed. Far below
* `INSTALL_TIMEOUT_MS`: a batch still running after this is no longer hiding
* any latency, and the install behind it simply proceeds cold. */
const BATCH_TIMEOUT_MS = Number(process.env.DSH_SHOP_PREFETCH_TIMEOUT_MS) || 9e4;
/**
* Whether warming the store for `spec` can save the install any work.
*
* A raw https tarball URL cannot, measured twice on 2026-09-10: pnpm
* re-fetches such a URL on EVERY install even when the store already holds
* that exact tarball — it must read the `package.json` inside it and that
* read does not go through the store — and `pnpm store add` on a URL resolves
* no dependency closure. So a prefetch of that form is one extra full
* download for no measured saving. The three spec forms are indistinguishable
* at the `store add` boundary (all exit 0, all print `+ <spec>`), which is why
* this exclusion is recorded rather than left to look like an oversight.
* Design doc §3.
*/
function isPrefetchableSpec(spec) {
	return !/^https?:\/\//i.test(spec);
}
/**
* `cmd.exe`'s exit code for a command line it could not resolve — the Windows
* answer to the ENOENT node never sends there.
*
* On the one platform where this module passes `shell: true`, the child node
* starts is `cmd.exe`, which EXISTS: the spawn succeeds, its "not recognized
* as an internal or external command" complaint goes to a stderr this module
* discards, and no `error` event ever arrives. The ENOENT latch below is
* therefore dead on Windows by construction. Measured 2026-09-14 on this
* Linux box, whose shell answers 127 instead of 9009 but is otherwise the same
* shape: `spawn('definitely-not-here', argv, { shell: true })` emits only
* `exit`, while the identical spawn without the shell emits `error: ENOENT`.
* PR #45's `windows` job is the half that cannot run here — it is where the
* missing latch showed up, as the case "reports pnpm absent to the install it
* was serving, and refuses the next by name" sitting red for the full 10s of
* its `vi.waitFor` because the line it filters for was never announced.
*
* **That arm did not turn the leg green, and this is why.** A temporary
* diagnostic, gated on `shell` so only the Windows runner printed it, came
* back with four exits, in test-file order:
*
*   exit code=1     bin="…\dsh-prefetch-*\definitely-not-here"
*   exit code=9009  bin="pnpm"
*   exit code=1     bin="pnpm"
*   exit code=0     bin="pnpm"
*
* The first line is the failing case's own bin, and it is the whole finding:
* that case passes a PATH, `cmd.exe` answers **1** for a path it cannot find,
* and 1 is also what a command that RAN and failed answers. The two things
* this latch must tell apart are the same number, so no value of this
* constant could have made the arm fire — it was gated on a signal that case
* does not produce. (The 9009 line is not evidence for the constant either.
* It is the second shell-gated exit the suite emits, and the only real
* `cmd.exe` child started before it is the one above: the cases that pass a
* bare `pnpm` inject a scripted child that emits its own code — this file's
* `scriptedSpawn` — so 9009 there is a fixture value echoed back, not a
* measurement of the shell.)
*
* Absence is therefore asked BEFORE the spawn now, by {@link resolvesBin},
* which is the primary mechanism. This arm stays as the one thing resolving
* cannot cover: a name that IS found and still cannot be run. Its number is
* `cmd.exe`'s long-standing answer for an unresolvable name and is unverified
* by this repo's own runs — nothing reaches it without `platform === 'win32'`,
* and nothing on the Windows runner has produced one. Should it be wrong the
* behaviour is what Windows had before the arm existed: the latch does not set
* and the generic exit line stands. A false positive is bounded by this
* module's own contract — the worst a stray 9009 can do is refuse the rest of
* the process's prefetches, a lost optimization and never a failed, slower or
* altered install.
*/
const SHELL_COMMAND_NOT_FOUND = 9009;
/** What a bare name may be resolved AS on Windows, on top of the name itself.
*
* `cmd.exe` resolves a bare command through `PATHEXT`, and these are the two
* shapes an executor actually arrives in: `.cmd` is what npm's pnpm shim is,
* which is the reason this module passes `shell: true` there at all, and
* `.exe` is what a native install (a packed binary, a Node SEA) puts on PATH.
* The bare name is tried as well, which makes this a superset of what the
* shell resolves. That asymmetry is deliberate, because the two mistakes do
* not cost the same: a false PRESENT spends one doomed child, which
* {@link SHELL_COMMAND_NOT_FOUND} or `error` then latches a moment later,
* while a false ABSENT both disables the optimization for the rest of the
* process and tells the user pnpm is missing from a machine that has it. */
const WIN32_SUFFIXES = [
	"",
	".cmd",
	".exe"
];
/**
* Every plausible reading of a PATH string, as the directories it could hold.
*
* Three readings, because the two ends of that string disagree about who
* decides the separator. `platform` says what the SHELL is — this module takes
* it as an argument, and the tests drive the win32 branch from a Linux runner
* with it — while the string itself was produced by the HOST that built the
* batch's environment. So whichever separator `platform` names, the string may
* have been joined with the other one, and BOTH mismatches are reachable; only
* one of them was guarded.
*
* The one that bit: a single-entry PATH whose entry is a Windows absolute path
* — `C:\Users\…\dsh-prefetch-X`, which is exactly what a test's temp directory
* is on the Windows runner — read with `platform: 'linux'` splits on ':' into
* `C` and `\Users\…`. Neither is the directory, so the pnpm that was right
* there was reported absent, and the latch that follows means it stays absent
* for the rest of the process. The string's own reading comes first for that
* shape: it IS one directory, and that is the most direct true answer there
* is. (A real PATH yields its real entries under one of the two splits; this
* reading costs a stat on a string that is not a directory, which is what a
* multi-entry PATH always is.)
*
* Trying all three costs an `existsSync` or two on a string none of them
* resolves, and it is the safe direction to err in — see `WIN32_SUFFIXES`: a
* false PRESENT spends one doomed child, while a false ABSENT both disables
* the optimization for the rest of the process and tells the user pnpm is
* missing from a machine that has it. The price is that a directory named
* exactly like a PATH string — legal, if perverse — is read as the entry it
* spells, and that lands on the cheap side of the same asymmetry.
*
* Order decides only how much work a MISS costs: a hit in any reading is
* present, so the list is a set and not a preference.
*/
const pathReadings = (path) => {
	const raw = path ?? "";
	return [
		raw,
		...raw.split(posix.delimiter),
		...raw.split(win32.delimiter)
	];
};
/**
* Whether `bin` names something a batch could actually start — asked of the
* filesystem before the spawn, because on Windows the failure cannot answer it
* (see {@link SHELL_COMMAND_NOT_FOUND}: a path that is not there and a command
* that ran and failed both exit 1).
*
* Pure path arithmetic over `existsSync`, which is what makes it testable on
* the Linux runners — the exit-code route was not, and that is why the Windows
* leg was the only place the defect could appear. No process is started to ask
* the question, so a bin that is not there is never spawned.
*
* `path` is the batch's OWN PATH, not the shop's: an install may carry a
* narrowed environment, the batch inherits exactly that, and the name has to
* resolve where the child will look for it. An absent `PATH` falls back to the
* process's, the same way the child's environment would. The string is read
* into entries by {@link pathReadings}, which tries every separator rather
* than betting on the one `platform` names.
*
* An empty PATH entry is skipped, as `dsh-cli.ts` skips it: it means "the
* current directory", which is not where a bare `pnpm` lives, and a relative
* `existsSync` here would be answering about the shop's cwd instead.
*
* A RELATIVE bin is looked up against the process's own cwd rather than the
* batch's, which is the one thing this questions less precisely than the OS
* will. No caller produces one today — production passes the bare name, and
* the fixtures pass absolute paths — and the backstop covers it if one ever
* does, since the child then simply fails where this said it would start.
*/
const resolvesBin = (bin, platform, path) => {
	if (bin.includes("/") || bin.includes("\\")) return existsSync(bin);
	const suffixes = platform === "win32" ? WIN32_SUFFIXES : [""];
	for (const dir of pathReadings(path)) {
		if (dir === "") continue;
		for (const suffix of suffixes) if (existsSync(join(dir, bin + suffix))) return true;
	}
	return false;
};
function createPrefetcher(options = {}) {
	const { pnpmBin = "pnpm", spawn: spawn$1 = spawn, platform = process.platform, execPath = process.execPath, timeoutMs = BATCH_TIMEOUT_MS, kills } = options;
	const lanes = /* @__PURE__ */ new Map();
	let pnpmAbsent = false;
	const lane = (profile, cwd, env) => {
		const existing = lanes.get(profile);
		if (existing !== void 0) {
			existing.cwd = cwd;
			existing.env = env;
			return existing;
		}
		const created = {
			pending: /* @__PURE__ */ new Map(),
			inFlight: /* @__PURE__ */ new Map(),
			child: null,
			timer: null,
			cwd,
			env
		};
		lanes.set(profile, created);
		return created;
	};
	/** Tell every install the running batch served. */
	const announce = (current, line) => {
		for (const log of current.inFlight.values()) log(line);
	};
	/** pnpm is not on PATH: stop prefetching for the rest of this process, and
	* tell the installs the running batch served why.
	*
	* Three ways absence arrives land here — {@link resolvesBin}, which is the
	* primary one and the only one that asks before spawning; node's ENOENT for
	* a binary it could not start; and cmd.exe's {@link SHELL_COMMAND_NOT_FOUND}
	* for a name it could not resolve — so the latch and the line a user reads
	* cannot drift apart between them. */
	const latchAbsent = (current) => {
		pnpmAbsent = true;
		announce(current, "dsh-plugin-shop: no download phase — pnpm not found on PATH");
	};
	const finish = (profile, current) => {
		if (current.timer !== null) clearTimeout(current.timer);
		current.timer = null;
		current.child = null;
		current.inFlight.clear();
		if (current.pending.size > 0 && !pnpmAbsent) start(profile, current);
	};
	const start = (profile, current) => {
		const specs = [...current.pending.keys()];
		for (const [spec, log] of current.pending) current.inFlight.set(spec, log);
		current.pending.clear();
		if (!resolvesBin(pnpmBin, platform, current.env?.PATH ?? process.env.PATH)) {
			latchAbsent(current);
			finish(profile, current);
			return;
		}
		const argv = [
			"store",
			"add",
			...specs
		];
		const routed = jsEntryCommand(pnpmBin, argv, execPath);
		const shell = routed === null && platform === "win32";
		const args = shell ? argv.map((arg) => shellSafeTarget(arg, platform)) : routed?.args ?? argv;
		let child;
		try {
			child = spawn$1(routed?.command ?? pnpmBin, args, {
				cwd: current.cwd,
				env: installEnv(current.env),
				stdio: "ignore",
				detached: platform !== "win32",
				windowsHide: true,
				shell
			});
		} catch (error) {
			announce(current, `dsh-plugin-shop: the download phase could not start — ${error.message}`);
			finish(profile, current);
			return;
		}
		current.child = child;
		const isCurrent = () => current.child === child;
		child.on("error", (error) => {
			if (!isCurrent()) return;
			if (error.code === "ENOENT") latchAbsent(current);
			else announce(current, `dsh-plugin-shop: the download phase could not start — ${error.message}`);
			finish(profile, current);
		});
		child.on("exit", (code) => {
			if (!isCurrent()) return;
			if (shell && code === SHELL_COMMAND_NOT_FOUND) latchAbsent(current);
			else if (code === 0) announce(current, "dsh-plugin-shop: packages fetched ahead of the install");
			else if (code !== null) announce(current, `dsh-plugin-shop: the download phase exit ${code}; the install will fetch what is missing`);
			finish(profile, current);
		});
		current.timer = setTimeout(() => {
			if (!isCurrent()) return;
			announce(current, "dsh-plugin-shop: the download phase exceeded its bound; the install will fetch what is missing");
			killTree(child.pid, platform, kills);
			finish(profile, current);
		}, timeoutMs);
	};
	return {
		request: ({ profile, spec, cwd, env, log = () => {} }) => {
			if (!isPrefetchableSpec(spec)) return {
				started: false,
				reason: "unsupported-spec"
			};
			if (pnpmAbsent) return {
				started: false,
				reason: "no-pnpm"
			};
			const current = lane(profile, cwd, env);
			current.pending.set(spec, log);
			if (current.child === null) queueMicrotask(() => {
				if (current.child === null && current.pending.size > 0 && !pnpmAbsent) start(profile, current);
			});
			return { started: true };
		},
		release: (profile, spec) => {
			const current = lanes.get(profile);
			if (current === void 0) return;
			current.pending.delete(spec);
			current.inFlight.delete(spec);
			if (current.child !== null && current.inFlight.size === 0 && current.pending.size === 0) killTree(current.child.pid, platform, kills);
		}
	};
}
//#endregion
//#region src/host/peers.ts
/** Harness compatibility: which declared peers the running installation does
* not provide (design 2026-09-01-harness-compatibility), and — for the
* shop's OWN declared peers — which ones it provides at a version outside
* the declared range. */
const NODE_LOOKUP_FS = {
	stat: (path) => statSync(path),
	readFile: (path) => readFileSync(path, "utf8")
};
/**
* One segment of a bare package name, about to be spliced into a path.
*
* A leading `.` refuses the segment whole: `.` and `..` would walk the path
* out of `node_modules`, and `.bin` or `.pnpm` are directories an install
* carries that no package can be. The ESM resolver agrees as far as it goes:
* it refuses an unscoped name that starts with `.`, and any name holding `%`
* or `\`, with ERR_INVALID_MODULE_SPECIFIER (measured on Node 26.6.0 with
* `.bin`, `a%2e`, `a\b`). `\` is also a separator on Windows, `:` names a
* drive, an NTFS stream or a URL scheme (`node:fs`, `file:`), and NUL is a
* byte no path may carry.
*/
function isNameSegment(segment) {
	return segment.length > 0 && !segment.startsWith(".") && !/[\\:%\0]/.test(segment);
}
/**
* Whether `spec` is a bare package name — `name`, or `@scope/name` — and so
* safe to look up. Peer names are catalog input, and hostile; this check is
* what keeps one from becoming a path. The lookup this replaced resolved
* `'../x/package.json'` relative to the profile and an absolute name as
* itself, so a peer name could point it at any path on the reader's disk.
*/
function isBarePackageName(spec) {
	const segments = spec.split("/");
	const [first, second] = segments;
	if (first === void 0) return false;
	if (!first.startsWith("@")) return segments.length === 1 && isNameSegment(first);
	return segments.length === 2 && second !== void 0 && isNameSegment(first.slice(1)) && isNameSegment(second);
}
/** Whether `path` stats as a directory. Every stat failure answers false —
* see `findPackageDir` for why that is Node's rule and not a shortcut. */
function isDirectoryAt(fs, path) {
	try {
		return fs.stat(path).isDirectory();
	} catch {
		return false;
	}
}
/** Whether `path` stats as a regular file. Every stat failure answers false,
* for the reason `isDirectoryAt` gives. */
function isFileAt(fs, path) {
	try {
		return fs.stat(path).isFile();
	} catch {
		return false;
	}
}
/**
* The directory the ESM resolver MATCHES for `spec` from `fromDir`, or null
* when the walk reaches the filesystem root without one: for each ancestor
* `dir`, the candidate `dir/node_modules/<spec>`, and the first that stats as
* a DIRECTORY is the match. A candidate that is anything else — absent, a
* file, or a path whose stat fails for ANY reason — is "not here", and the
* walk moves on to the next ancestor.
*
* That is Node's own rule, copied from its reader rather than from the spec
* prose. Node 26.6.0 `internal/modules/package_json_reader.js`
* (`getPackageJSONURL`) does
* `const stat = internalModuleStat(...); if (stat !== 1) { ...; continue }`:
* 1 is "directory", and a failed stat is a negative errno, so EACCES and
* ELOOP keep walking exactly like ENOENT. Measured on 26.6.0: a self-link
* (ELOOP) at `node_modules/<name>` in front of an ancestor's real copy makes
* the import load the ancestor's copy. This walk used to throw on every
* failure but ENOENT and ENOTDIR, and `incompatibilityMap` turned the throw
* into no verdict — so a missing peer, whose walk runs all the way to the
* root, met any unsearchable or looping `node_modules` on the way (a
* `~/node_modules` made by `sudo npm i` under umask 027, say), and every
* missing-peer badge in the catalog went silent while those plugins still
* failed to import.
*
* The walk stops at the first match whatever it finds inside: the loader
* imports from that directory or fails there, and never falls through to an
* ancestor (measured on 26.6.0: an empty `node_modules/<name>` in front of an
* ancestor's working copy fails the import with ERR_MODULE_NOT_FOUND).
* Whether the match is a PACKAGE is `packageDirectory`'s question.
*
* Throws only for a `spec` that is not a bare package name. No state of the
* filesystem can make it throw.
*/
function findPackageDir(fromDir, spec, fs) {
	if (!isBarePackageName(spec)) throw new TypeError(`not a bare package name: ${JSON.stringify(spec)}`);
	const segments = spec.split("/");
	for (let dir = fromDir;;) {
		const candidate = join(dir, "node_modules", ...segments);
		if (isDirectoryAt(fs, candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}
/**
* The directory `spec` is installed at as seen from `fromDir`, or null when
* it is not installed there: the walk's match (`findPackageDir`), and only
* when that directory holds a `package.json` that stats as a FILE. Anything
* else is ABSENT — a match with no manifest, a manifest that is not a file,
* one whose stat fails — because the loader matches that directory and the
* import fails there. The case this exists for: an uninstall that stops
* part-way (on Windows a locked file is enough) can leave
* `<profile>/node_modules/L/` holding nothing but a nested `node_modules/`,
* and a plugin declaring L then fails with ERR_MODULE_NOT_FOUND; while any
* directory counted as present, the badge naming L disappeared. The lookup
* before that one, `require.resolve('<spec>/package.json')`, required the
* manifest too.
*
* The manifest is stat-ed and never read here: presence is the file, and
* what it says is the version resolver's question. So a manifest that exists
* but cannot be read or parsed is a present package with no readable version.
*
* One edge is knowingly given up: a directory holding `index.js` and no
* manifest DOES import — Node's legacy main resolution tries `index.js` in a
* match without a manifest — but reads absent here. No package manager
* installs that shape.
*
* Throws only for a `spec` that is not a bare package name. This one lookup
* is behind the presence resolver, the version resolver, and the running
* harness's own `@deepseek-ai/dsh-app-boot` (`harness.ts`).
*/
function packageDirectory(fromDir, spec, fs = NODE_LOOKUP_FS) {
	const match = findPackageDir(fromDir, spec, fs);
	return match !== null && isFileAt(fs, join(match, "package.json")) ? match : null;
}
/**
* The directory the walk starts from. `createRequire` took a file URL or an
* absolute path and so does this — the production anchor is
* `<profile>/cordis.yml` as a file URL — and, like `createRequire`, a
* trailing separator names the directory itself rather than a file in its
* parent. Anything else throws here, at construction, which the gateway's
* call sites already treat as "no anchor, no verdict".
*/
function anchorDirectory(baseUrl) {
	const path = isAbsolute(baseUrl) ? baseUrl : fileURLToPath(baseUrl);
	return path.endsWith("/") || path.endsWith(sep) ? path : dirname(path);
}
/** `nodeResolver` over an injected filesystem, walking up from `fromDir` —
* the seam fixtures drive the lookup through. */
function packageResolver(fromDir, fs) {
	return (spec) => packageDirectory(fromDir, spec, fs) !== null;
}
/**
* The production resolver, anchored at the profile. A peer is present when
* the first ancestor `node_modules/<spec>` that is a directory holds a
* `package.json` file — the directory the ESM resolver that loads plugins'
* host halves matches for a bare package, and a manifest in it
* (`findPackageDir`, `packageDirectory`). From `<profile>/cordis.yml` the
* walk reads `<profile>/node_modules`, then `$DSH_HOME/profiles/node_modules`
* — the link farm dsh-app-boot's `healProfilesModuleFallback` keeps, pointing
* into the global dsh install, on 0.1.5; 0.1.7 keeps none, and on a harness
* that serves its packages another way `harnessPackageResolver` asks it in
* front of this walk — and so on up to the root, past any candidate
* it cannot stat, as Node's reader walks past one (measured on Node 26.6.0
* with a looping link in front of a real copy: the import loads the copy).
* The one shape where this and the loader knowingly disagree is a directory
* holding `index.js` and no manifest, which imports and reads absent here;
* no package manager installs it (`packageDirectory`).
*
* It used to ask `require.resolve('<spec>/package.json')`, a question that
* answered wrongly twice:
*
*  - Under a packaged dsh executable (`process.pkg`) the link farm holds ESM
*    proxy packages instead of symlinks, and a proxy's `exports` leaves
*    `./package.json` out on purpose, so resolving it threw
*    ERR_PACKAGE_PATH_NOT_EXPORTED for every proxied peer. Presence read that
*    as present; the version resolver below could read nothing. Reproduced:
*    a proxy at `0.2.0-rc.1` against a declared `^0.1.1-rc.2` gave presence
*    true, version null, mismatches `[]` — the load-time self-check could
*    never fire under a packaged dsh.
*  - Node caches a SUCCESSFUL CJS resolution for the life of the process
*    (`Module._pathCache`, keyed on request + lookup paths) and hands the
*    cached filename back without looking at the disk; a failure is not
*    cached. Measured on Node 26.6.0 in one process: absent → false,
*    installed → true, uninstalled → STILL true. A peer the reader removed
*    left every plugin declaring it unflagged until dsh restarted.
*
* So nothing is cached and `exports` is never consulted: every call stats
* afresh, and a package with a manifest is present whatever its `exports`
* says. `stat` follows symlinks, so a link to nothing reads absent — which
* matters, because the link farm adds links and never prunes them: 29 of its
* 511 dangled on the machine this was measured on, after upgrades.
*
* The global folders — `NODE_PATH`, `~/.node_modules`, `~/.node_libraries`,
* `$PREFIX/lib/node` — are deliberately not searched: the ESM resolver that
* loads plugin host code does not search them either. That is not academic.
* pnpm's bin shims export `NODE_PATH` (this repo's own `node_modules/.bin/
* vitest` points it into the virtual store), and under one the old lookup
* found harness packages from any anchor at all, a temp directory included.
*
* It throws only for a `spec` that is not a bare package name, and
* `incompatibilityMap` turns the throw into no verdict: a hostile name is not
* a fact about this installation, and false is an accusation. Nothing on the
* filesystem makes it throw. It used to throw on a stat failure other than
* ENOENT or ENOTDIR as well, reasoning that such a candidate "may hold the
* package" — but the loader never asks what a candidate it cannot stat holds;
* it walks on (`findPackageDir`), so the throw silenced true badges and
* established nothing.
*/
function nodeResolver(baseUrl) {
	return packageResolver(anchorDirectory(baseUrl), NODE_LOOKUP_FS);
}
/**
* The manifest of the package the harness reaches for `spec` from
* `parentURL`, or null when it reaches none, or one whose manifest no longer
* stats as a file. The stat is fresh on every call for the reason §9.4 gives:
* the service remembers a package it once found, and an uninstalled peer
* must stop reading as present. Throws what the service throws, and a
* TypeError for a name that is not a bare package name — which never reaches
* the service, because peer names are catalog text.
*/
function harnessManifest(lookup, spec, parentURL, fs) {
	if (!isBarePackageName(spec)) throw new TypeError(`not a bare package name: ${JSON.stringify(spec)}`);
	const manifestPath = lookup.packageOf(spec, parentURL)?.manifestPath;
	return typeof manifestPath === "string" && isFileAt(fs, manifestPath) ? manifestPath : null;
}
/**
* Presence on a harness that serves its packages through its runtime
* resolution (`HarnessPackageLookup`): present when the harness reaches a
* package for `spec` from `parentURL`, the profile anchor, and otherwise
* whatever `walk` answers — `nodeResolver` over the same anchor, in
* production. Asking the harness first asks the loader's own question, since
* a plugin's import goes through the same resolution. The walk stays behind
* it because either answer can only clear a badge, never raise one, and a
* false badge is the failure this module exists to avoid.
*
* Throws, which `incompatibilityMap` turns into no verdict for the entries
* declaring `spec`, for a name that is not a bare package name and for
* anything the service throws. A harness that cannot answer is silence:
* falling back to the walk alone would read every package it serves as
* missing.
*/
function harnessPackageResolver(walk, lookup, parentURL, fs = NODE_LOOKUP_FS) {
	return (spec) => harnessManifest(lookup, spec, parentURL, fs) !== null || walk(spec);
}
/**
* Package name → the peer names that did not resolve. A key is present only
* when at least one peer is missing, so an absent key means "runs here, or we
* could not tell" — the client renders nothing for either.
*
* A resolver that throws yields NO verdict at all: an unavailable fact must
* never read as an accusation, because one false warning teaches a reader to
* ignore every warning.
*/
function incompatibilityMap(entries, resolve) {
	const known = /* @__PURE__ */ new Map();
	const out = {};
	for (const entry of entries) {
		if (entry.peers === void 0 || entry.peers.length === 0) continue;
		const missing = [];
		let usable = true;
		for (const spec of entry.peers) {
			let present = known.get(spec);
			if (present === void 0) try {
				present = resolve(spec);
				known.set(spec, present);
			} catch {
				known.set(spec, null);
				usable = false;
				break;
			}
			else if (present === null) {
				usable = false;
				break;
			}
			if (!present) missing.push(spec);
		}
		if (usable && missing.length > 0) out[identityKey(entry)] = missing;
	}
	return out;
}
/** `nodeVersionResolver` over an injected filesystem, walking up from
* `fromDir` — the seam fixtures drive the lookup through. */
function packageVersionResolver(fromDir, fs) {
	return (spec) => {
		let dir;
		try {
			dir = packageDirectory(fromDir, spec, fs);
		} catch {
			return null;
		}
		return dir === null ? null : manifestVersion(fs, join(dir, "package.json"));
	};
}
/** The non-empty `version` string of the manifest at `manifestPath`, or null
* for anything else. */
function manifestVersion(fs, manifestPath) {
	let manifest;
	try {
		manifest = JSON.parse(fs.readFile(manifestPath));
	} catch {
		return null;
	}
	const version = typeof manifest === "object" && manifest !== null ? manifest.version : void 0;
	return typeof version === "string" && version.length > 0 ? version : null;
}
/**
* The production version resolver: `nodeResolver`'s lookup, then the matched
* directory's own `package.json`, read directly. Reading it directly is the
* fix, not a shortcut: resolving `<spec>/package.json` is what an exports map
* can refuse, and a packaged dsh's module proxy refuses it by construction
* while carrying the proxied package's version in exactly that file (see
* `nodeResolver`).
*
* The directory is the one the presence resolver finds present — the walk's
* first directory match, holding a `package.json` file (`packageDirectory`;
* `findPackageDir` cites Node's reader) — so the two never disagree about
* which copy is installed: a candidate nobody can stat is walked past to the
* copy further up, whose version is then the answer, exactly as the loader
* imports that copy (measured on Node 26.6.0 with a looping link in front of
* it); a match without a manifest is absent, and shadows every copy above
* it. An `index.js`-only directory, which the loader would import, has no
* manifest to read a version from either way.
*
* Anything that leaves no version to read answers null: a spec that is not a
* bare package name, a peer that is absent, a manifest that is unreadable or
* malformed, a `version` that is not a non-empty string. Absence is
* deliberately NOT reported as a version violation: `incompatibilityMap` is
* what covers a missing peer.
*/
function nodeVersionResolver(baseUrl) {
	return packageVersionResolver(anchorDirectory(baseUrl), NODE_LOOKUP_FS);
}
/**
* `harnessPackageResolver`'s twin for versions: read afresh from the manifest
* of the package the harness reaches for `spec` — the copy a plugin's import
* loads, which the walk cannot see on dsh 0.1.7 — and `walk`'s answer only
* when the harness reaches none. A manifest the harness names but nobody can
* read or parse answers null, never the walk's version: the walk may match
* another copy, and the version must describe the copy presence found (see
* `nodeVersionResolver`).
*
* Null for a name that is not a bare package name and for a service that
* throws, as null is already this resolver's no-verdict signal.
*/
function harnessPackageVersionResolver(walk, lookup, parentURL, fs = NODE_LOOKUP_FS) {
	return (spec) => {
		let manifestPath;
		try {
			manifestPath = harnessManifest(lookup, spec, parentURL, fs);
		} catch {
			return null;
		}
		return manifestPath === null ? walk(spec) : manifestVersion(fs, manifestPath);
	};
}
/**
* The declared peers whose provided version is outside the declared range,
* ordered by peer name. Pure: the module graph arrives through `resolve`.
*
* `includePrerelease` is load-bearing, not a convenience. The harness ships
* nothing but `-rc` versions, so under strict semver `^0.1.1-rc.2` excludes
* every later rc on the same 0.1 line — including whichever one is installed
* and working, named as a property because that version moves and a comment
* naming it goes stale in place — and every future rc bump would raise a
* false alarm. With it on, the range still excludes an older prerelease
* (`0.1.1-rc.1`) and a minor- or major-line move
* (`0.2.0-rc.1`, `1.0.0`), which are the moves that actually break a plugin
* path. Discrimination on both sides is the whole point: one false warning
* teaches a reader to ignore every warning.
*
* Anything unreadable yields NO verdict for that peer and never a violation:
* a resolver that answers null or throws, a found version that is not
* semver, a declared range semver cannot parse. The other peers are still
* judged.
*/
function peerVersionMismatches(ranges, resolve) {
	const mismatches = [];
	for (const spec of Object.keys(ranges).sort()) {
		const range = ranges[spec];
		if (range === void 0 || validRange(range) === null) continue;
		let found;
		try {
			found = resolve(spec);
		} catch {
			continue;
		}
		if (found === null || valid(found) === null) continue;
		if (satisfies(found, range, { includePrerelease: true })) continue;
		mismatches.push({
			spec,
			range,
			found
		});
	}
	return mismatches;
}
/**
* The load-time message for a set of mismatches, or null when there is
* nothing to say. Every mismatch is named with its declared range and the
* version found, in ONE message: the reader needs the whole picture in the
* line they will scroll past, and the message says the shop still loads
* because refusing to load would cost them the shop over a diagnostic.
*/
function peerVersionWarning(mismatches) {
	if (mismatches.length === 0) return null;
	return `dsh-plugin-shop: the harness does not provide the peer versions this shop declares — ${mismatches.map(({ spec, range, found }) => `${spec} ${range}, found ${found}`).join("; ")}. The shop still loads; if a path misbehaves, check this first.`;
}
/**
* A self-check that warns AT MOST ONCE, however many times it is called.
* The guard is what keeps a diagnostic a diagnostic: a message repeated per
* call is noise a reader learns to skip, and the shop's load path is not the
* only place that could reasonably ask this question.
*
* It never throws. A check that could fail a load would be worse than the
* mismatch it reports — the user would lose the whole shop over a warning.
*/
function createPeerVersionCheck(deps) {
	let spoken = false;
	return () => {
		if (spoken) return;
		spoken = true;
		try {
			const message = peerVersionWarning(peerVersionMismatches(deps.ranges, deps.resolve));
			if (message !== null) deps.warn(message);
		} catch {}
	};
}
//#endregion
//#region src/host/harness.ts
/**
* The harness this process runs: which `@deepseek-ai/dsh` it is, and that
* dsh's own profile-template table — the running side of the
* `dsh.compatibility` verdict (design 2026-09-01-harness-compatibility §9.9).
*
* Both used to be read from somewhere that is not the running harness, and
* both were wrong there:
*
* - The version was the first `node_modules/@deepseek-ai/dsh` found walking up
*   from the profile: what the profile can IMPORT, not what RUNS. A plugin
*   that depends on the dsh package gets its copy hoisted into
*   `<profile>/node_modules` — the listed `dsh-claude-tui@0.1.6` pulls
*   0.1.2-rc.1 — a second install sharing DSH_HOME re-points the link farm,
*   and under a packaged dsh the bin-only package gets no link-farm proxy at
*   all, so the read was dead or stale. The first was reproduced with real
*   installs on 2026-09-25 (the design's section 9.9 amendment): every
*   verdict said "running 0.1.2-rc.1" while 0.1.5-rc.3 ran.
* - The templates came from the shop's own `import * as appBoot`, which
*   resolves from the SHOP's real path: under a `link:` install that is this
*   repository's devDependency, 0.1.1-rc.2 with two templates, while
*   0.1.5-rc.3 with five runs — and in production a copy hoisted from some
*   plugin's dependencies can shadow it the same way.
*
* Both now come from the one thing that names the running harness: the script
* this process was started with. Resolved through symlinks, the package that
* owns it IS the dsh CLI that is running, if it is one at all; its manifest
* says its version, and the app-boot it imports says its templates.
*/
/** The package whose `PROFILE_TEMPLATES` the running dsh composes profiles
* from. */
const APP_BOOT = "@deepseek-ai/dsh-app-boot";
/** What is known when nothing says which harness runs. */
function noHarness() {
	return {
		dshVersion: null,
		templates: profileTemplatesOf(void 0),
		patchLists: null,
		peerCheck: null
	};
}
/** Whether `path` stats as a regular file. */
function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}
/**
* The package that owns `start`: the FIRST directory at or above it holding a
* `package.json` file, and its parsed manifest — or null when there is none
* up to the root, or when that manifest cannot be read or parsed. The walk
* stops at the first manifest whatever it names, the rule `owningEntry` in
* `dsh-cli.ts` follows: a script owned by some other package is not dsh's,
* and climbing on would find an unrelated ancestor — a workspace root, or dsh
* itself above a package vendored inside it.
*/
function owningPackage(start) {
	for (let dir = start;;) {
		const manifestPath = join(dir, "package.json");
		if (isFile(manifestPath)) try {
			return {
				dir,
				manifest: JSON.parse(readFileSync(manifestPath, "utf8"))
			};
		} catch {
			return null;
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}
/**
* What the app-boot the dsh at `dshDir` imports says about that dsh: its
* template table, and whether it reads a list-valued bundle patch. Null when
* no app-boot is on the resolution path.
*
* Found with the node_modules walk the peer check uses (`packageDirectory`)
* from the dsh package directory — the copy nested under dsh first, then one
* beside it, as dsh's own import finds it — and never through `NODE_PATH`:
* pnpm's bin shims export one, and a bare CJS lookup finds a package through
* it from any directory at all. Only the ABSOLUTE directory then reaches
* Node's CJS resolver, which reads its `main` (an `exports` map applies to
* bare specifiers only), and the entry is imported by file URL, which Windows
* requires of an absolute path. Under the dsh that runs, that URL is the one
* dsh itself loaded — the CJS resolver realpaths as the ESM loader does, and
* app-boot's `main` and `exports` name the same file — so the import is a
* cache hit, not a second instance. Measured against a global npm install of
* 0.1.5-rc.3: this chain and the ESM resolution from dsh's own `lib/bin.js`
* give the same URL, and the reader, handed `<prefix>/bin/dsh`, answers
* 0.1.5-rc.3 with all five templates.
*
* Throws for whatever that chain cannot do; `readRunningHarness` turns any
* throw into an empty table, an unknown `patchLists` and no peer check.
*/
async function appBootFacts(dshDir) {
	const appBootDir = packageDirectory(dshDir, APP_BOOT);
	if (appBootDir === null) return null;
	const entry = createRequire(import.meta.url).resolve(appBootDir);
	const exported = await import(pathToFileURL(entry).href);
	return {
		templates: profileTemplatesOf(await profileTemplatesExport(appBootDir, exported)),
		patchLists: typeof exported.bundlePatchFiles === "function",
		peerCheck: peerCheckOf(exported, appBootDir)
	};
}
/**
* The template table the running dsh composes profiles from, wherever this
* dsh keeps it (measured 2026-11-06).
*
* Through 0.2.1-rc.5 `dsh-app-boot` exported `PROFILE_TEMPLATES` itself. From
* 0.2.2-rc.1 it only imports it, from `@deepseek-ai/dsh-official-bundles`,
* and exports nothing by that name — so reading app-boot alone left the table
* empty and the shop's whole `dsh.compatibility.profiles` verdict silent: no
* badge for a plugin declaring a profile this harness does not have, which is
* the failure the 0.2.2-rc.1 e2e caught. The bundles package is resolved with
* the same walk, from app-boot's own directory, so the copy dsh loads is the
* one read; a dsh that has neither still answers undefined, which
* `profileTemplatesOf` reads as "no table", never a wrong one.
*/
async function profileTemplatesExport(appBootDir, appBoot) {
	if (appBoot.PROFILE_TEMPLATES !== void 0) return appBoot.PROFILE_TEMPLATES;
	const bundlesDir = packageDirectory(appBootDir, "@deepseek-ai/dsh-official-bundles");
	if (bundlesDir === null) return void 0;
	const entry = createRequire(import.meta.url).resolve(bundlesDir);
	return (await import(pathToFileURL(entry).href)).PROFILE_TEMPLATES;
}
/** `value` when it is a non-null object, else null. */
const objectOrNull = (value) => typeof value === "object" && value !== null ? value : null;
/**
* The list a refusal names, read off one answer of dsh's compatibility check
* or of its plugin manager, under whichever name the dsh that gave the answer
* uses: `requirements` from 0.2.1, `peers` from 0.1.7 to 0.2.0. app-boot's
* `evaluatePluginCompatibility` and dsh-plugin-manager's `IncompatiblePlugin`
* were renamed together (design 2026-10-19-dsh-021-readiness, section 4, read
* off 0.2.1-rc.2's own types and code on 2026-10-19). A key is a dsh peer's
* package name or the literal `engines.dsh`; a value is the range the package
* declared.
*
* `requirements` is read first, and only when it holds an object: an answer
* whose `requirements` is anything else is not in the newer shape, so its
* `peers` is tried. Only the entries whose range is a string are kept, as
* `incompatibleList` always kept them, so one malformed range costs its own
* entry and not the rest of the list. An answer naming neither reads as an
* empty list, never as a throw.
*/
function refusedRequirements(answer) {
	const list = objectOrNull(answer.requirements) ?? objectOrNull(answer.peers);
	if (list === null) return {};
	return Object.fromEntries(Object.entries(list).filter((pair) => typeof pair[1] === "string"));
}
/**
* The peer check an app-boot exports, bound to its own version (see
* `PeerCheck.evaluate`), or null when it exports only part of one — a rule
* without the exemptions would refuse what a profile has already allowed —
* or when its manifest carries no version, which is the one `evaluate`
* judges by. Never throws, so a check that cannot be formed costs the
* templates and the patch-list answer nothing.
*
* What `evaluate` hands back is app-boot's answer with the shop's own `peers`
* filled from whichever name the list came under (`refusedRequirements`), so
* a dsh that renames it again costs this function and nothing past it.
*/
function peerCheckOf(exported, appBootDir) {
	const { evaluatePluginCompatibility: evaluate, readProfileVersionExemptions: exemptions } = exported;
	if (typeof evaluate !== "function" || typeof exemptions !== "function") return null;
	let version;
	try {
		version = JSON.parse(readFileSync(join(appBootDir, "package.json"), "utf8")).version;
	} catch {
		return null;
	}
	if (typeof version !== "string" || version.length === 0) return null;
	const runtime = version;
	const judge = evaluate;
	return {
		evaluate: (manifest, profileExemptions) => {
			const answer = judge(manifest, profileExemptions, runtime);
			if (answer === void 0 || answer === null) return void 0;
			return {
				...answer,
				peers: refusedRequirements(answer)
			};
		},
		exemptions
	};
}
/**
* The harness this process runs, identified from `script` — the gateway's
* `restartScript`, `process.argv[1]` in production — or, when that names no
* dsh, from the harness's own package lookup (`locate`, see
* `HarnessLocator`). Never a guess:
*
* 1. `script` is resolved through symlinks, because `argv[1]` is the path the
*    shell ran — `<prefix>/bin/dsh`, a link — and only its target lies inside
*    the dsh package. No script, or one that does not resolve: the next
*    source decides.
*    An empty path is no script either: `realpathSync('')` answers the
*    working directory, which says where dsh was started, not what it is.
* 2. The package that owns it (`owningPackage`) must be `@deepseek-ai/dsh`.
*    A test runner, or another host embedding the shop, names no harness
*    this way; the desktop app is that case, and there `locate` answers with
*    the dsh package its own `pluginPackages` service serves. Without a
*    locator, both halves of the verdict stay silent.
* 3. `dshVersion` is that manifest's `version` when it is a non-empty string.
* 4. `templates`, `patchLists` and `peerCheck` come from that dsh's own
*    app-boot (`appBootFacts`). Any failure there costs all three and keeps
*    the version.
*
* Never throws and never rejects: a harness nobody could identify forms no
* verdict, and must never be the reason the catalog fails to load.
*/
async function readRunningHarness(script, locate) {
	const owner = scriptOwner(script);
	if (owner !== null) return harnessFactsOf(owner.dir, owner.manifest);
	const located = locate === void 0 ? null : locatedHarness(locate);
	if (located !== null) return harnessFactsOf(located.dir, located.manifest);
	return noHarness();
}
/** The package that owns `script`, when that package is the running dsh.
* Null — never a throw — for a missing script, one `realpathSync` cannot
* resolve, or one owned by anything else. */
function scriptOwner(script) {
	if (script === void 0 || script === "") return null;
	try {
		const owner = owningPackage(dirname(realpathSync(script)));
		return owner !== null && isHarnessManifest(owner.manifest) ? owner : null;
	} catch {
		return null;
	}
}
/** The dsh package `locate` resolves, with its manifest read from the path
* the service answers. Null when the service resolves nothing, the answer
* carries no manifest path, or that file cannot be read or parsed as a dsh
* manifest — each of which forms no verdict rather than a wrong one. */
function locatedHarness(locate) {
	let manifestPath;
	try {
		manifestPath = locate.packages.packageOf(DSH_PACKAGE, locate.parentURL)?.manifestPath;
	} catch {
		return null;
	}
	if (typeof manifestPath !== "string") return null;
	try {
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		return isHarnessManifest(manifest) ? {
			dir: dirname(manifestPath),
			manifest
		} : null;
	} catch {
		return null;
	}
}
/** Whether `manifest` is `@deepseek-ai/dsh`'s. */
function isHarnessManifest(manifest) {
	return typeof manifest === "object" && manifest !== null && manifest.name === "@deepseek-ai/dsh";
}
/** The verdict for one dsh package directory and its manifest. */
async function harnessFactsOf(dir, manifest) {
	const { version } = manifest;
	const dshVersion = typeof version === "string" && version.length > 0 ? version : null;
	let facts;
	try {
		facts = await appBootFacts(dir);
	} catch {
		facts = null;
	}
	return {
		dshVersion,
		templates: facts?.templates ?? profileTemplatesOf(void 0),
		patchLists: facts?.patchLists ?? null,
		peerCheck: facts?.peerCheck ?? null
	};
}
//#endregion
//#region src/host/plugin-manager.ts
/**
* dsh's `pluginManager` service (0.1.7 on), as far as this shop calls it:
* design 2026-09-26-plugin-manager-delegation. Structural throughout: the
* build compiles against the 0.1.1-rc.2 harness floor, where
* `@deepseek-ai/dsh-plugin-manager` does not exist.
*/
const REQUIRED = [
	"installBundle",
	"removeBundle",
	"setPluginEnabled",
	"setBundleEnabled"
];
/** The service, when `service` offers every required operation; else null.
* All or nothing: half a service would take an install and fail its
* uninstall. */
function asPluginManager(service) {
	if (typeof service !== "object" || service === null) return null;
	const candidate = service;
	if (!REQUIRED.every((method) => typeof candidate[method] === "function")) return null;
	if (candidate.cancelInstall !== void 0 && typeof candidate.cancelInstall !== "function") return null;
	return service;
}
const text = (value) => typeof value === "string" ? value : null;
const record = (value) => typeof value === "object" && value !== null ? value : {};
function incompatibleList(value) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const entry = record(item);
		const name = text(entry.name);
		const version = text(entry.version);
		const runtimeVersion = text(entry.runtimeVersion);
		if (name === null || version === null || runtimeVersion === null) return [];
		return [{
			name,
			version,
			runtimeVersion,
			peers: refusedRequirements(entry)
		}];
	});
}
/** Read one `ChangeResult`. Every field is optional: one a later harness
* drops reads as absent, never as a crash. */
function readChange(raw) {
	const result = record(raw);
	const error = record(result.error);
	const run = record(result.packageResult);
	const fromError = incompatibleList(error.incompatible);
	return {
		application: text(result.application),
		stage: text(result.stage),
		errorCode: text(error.code),
		diagnostic: text(error.diagnostic),
		incompatible: fromError.length > 0 ? fromError : incompatibleList(run.incompatible),
		kind: text(run.kind),
		output: text(run.output) ?? "",
		pendingBuilds: Array.isArray(result.pendingBuilds) ? result.pendingBuilds.filter((name) => typeof name === "string") : [],
		failedAt: text(result.failedAt),
		changed: typeof result.changed === "boolean" ? result.changed : null,
		truncated: run.truncated === true
	};
}
function readUpdate(raw) {
	const answer = record(raw);
	return {
		from: text(answer.from),
		to: text(answer.to),
		step: text(answer.step),
		result: answer.result ?? null,
		restore: answer.restore ?? null
	};
}
/** True when `sentence` names a `dsh plugin` command. */
function namesCliCommand(sentence) {
	return sentence.includes("dsh plugin");
}
const isTerminal = (character) => character === "." || character === "!" || character === "?";
const isSpace = (character) => /\s/.test(character);
/** Splits `line` into sentences, each still carrying whatever whitespace
* followed its `.`, `!` or `?`, so joining every piece back together
* reproduces `line` exactly. A sentence ends after a run of terminal
* punctuation that whitespace or the end of the line follows; the text after
* the last such run is one more piece, so a line with no terminal
* punctuation at all is one sentence spanning the whole line, and an empty
* line gives none. One pass from left to right: the regex this replaced
* backtracked quadratically on a long run of punctuation with no whitespace
* after it, and dsh's output holds up to 16 KB of whatever pnpm printed. */
function sentencesIn(line) {
	const pieces = [];
	let start = 0;
	let index = 0;
	while (index < line.length) {
		if (!isTerminal(line.charAt(index))) {
			index += 1;
			continue;
		}
		let runEnd = index;
		while (runEnd < line.length && isTerminal(line.charAt(runEnd))) runEnd += 1;
		if (runEnd < line.length && !isSpace(line.charAt(runEnd))) {
			index = runEnd;
			continue;
		}
		let end = runEnd;
		while (end < line.length && isSpace(line.charAt(end))) end += 1;
		pieces.push(line.slice(start, end));
		start = end;
		index = end;
	}
	if (start < line.length) pieces.push(line.slice(start));
	return pieces;
}
/** Where `sentence`'s terminator starts: its closing punctuation and the
* whitespace after it. Scanned back from the end, so no run in dsh's output
* can make it slow. */
function terminatorStart(sentence) {
	let end = sentence.length;
	while (end > 0 && /\s/.test(sentence.charAt(end - 1))) end -= 1;
	while (end > 0 && ".!?".includes(sentence.charAt(end - 1))) end -= 1;
	return end;
}
/** `sentence`, with every clause that names a `dsh plugin` command removed.
* A clause is a run between `; ` separators, and what is kept keeps the
* sentence's terminator. A sentence with nothing to remove is returned
* unchanged; one that loses every clause is dropped (null). */
function scrubSentence(sentence) {
	if (!namesCliCommand(sentence)) return sentence;
	const end = terminatorStart(sentence);
	const kept = sentence.slice(0, end).split("; ").filter((clause) => !namesCliCommand(clause));
	return kept.length === 0 ? null : `${kept.join("; ")}${sentence.slice(end)}`;
}
/** `line`, with every clause that names a `dsh plugin` command removed (see
* `scrubSentence`). A line with nothing to remove is returned unchanged (so
* it stays exactly what it was); one that loses every sentence is dropped
* (null). */
function scrubLine(line) {
	const sentences = sentencesIn(line);
	if (sentences.length === 0) return line;
	const kept = sentences.map(scrubSentence).filter((sentence) => sentence !== null);
	return kept.length === 0 ? null : kept.join("");
}
function scrubText(value) {
	return value.split("\n").map(scrubLine).filter((line) => line !== null).join("\n");
}
/** `change`, with every clause naming a `dsh plugin` command removed from
* `diagnostic` and `output`: dsh's CLI refuses every `plugin` subcommand for
* the desktop profile, so a step dsh wrote assuming that command exists must
* not reach a reader there. Two dsh texts this exists for: dsh-app-boot's
* `pluginCompatibilityWarning` ("... with `dsh plugin allow-version` or the
* plugin manager ..."), whose sentence goes whole, and the restoration line
* after a failed repair ("..., but node_modules could not be reinstalled;
* run 'dsh plugin install'"), which keeps what it says dsh restored. A
* clause is a run between `; ` separators within a sentence; a sentence left
* with no clause is dropped, and so is a line left with no sentence. Every
* other line stays untouched, and a diagnostic left empty afterward reads as
* absent, the same way `codeReason` already treats one. */
function forDesktopReader(change) {
	return {
		...change,
		diagnostic: change.diagnostic === null ? null : scrubText(change.diagnostic),
		output: scrubText(change.output)
	};
}
/** The end of a detail that passes on what a service call threw: `: ` and
* the message, scrubbed for a desktop reader as `forDesktopReader` scrubs
* dsh's answer, since a thrown message is dsh's text as well. A message left
* with nothing to say ends the detail with a period instead. */
function thrownTail(message, desktop) {
	const said = desktop ? scrubText(message) : message;
	return said.trim() === "" ? "." : `: ${said}`;
}
/** What each management code means, in dsh 0.1.7-rc.2's own terms (the
* implementation plan of 2026-09-27, Task 2, records where each is raised). */
const CODE_SENTENCE = {
	"unknown-plugin": "dsh could not find a plugin with that ID",
	"invalid-spec": "dsh could not read the package name or install source",
	"ambiguous-install": "dsh could not identify the installed package",
	"not-bundle": "the package is not a dsh bundle",
	"not-removable": "dsh does not allow removing this bundle",
	"stop-profile": "this bundle is still running; stop dsh for this profile before removing it",
	"bundle-in-use": "the bundle was switched off, but some of its plugins are still running",
	"stale-approval": "the build approval refers to a package that pnpm no longer lists",
	"management-required": "the plugin belongs to dsh itself",
	unaddressable: "the plugin is not defined in this profile's configuration, so dsh cannot change it here",
	"operation-error": "dsh encountered an unexpected error",
	"already-installed": "this version of dsh cannot update an installed package directly; uninstall it, then install it again"
};
/** What each classified pnpm failure was, as dsh classifies it. */
const KIND_SENTENCE = {
	"pnpm-missing": "pnpm could not be started",
	timeout: "pnpm took too long to finish",
	"not-found": "the package could not be found",
	"no-matching-version": "the requested version could not be found",
	network: "the network request failed",
	"disk-full": "the disk is full",
	permission: "permission was denied",
	integrity: "the downloaded package failed its integrity check"
};
const WHERE = {
	registry: " at the registry",
	"spec-host": " while connecting to the package source"
};
/** An own-property read of one of the three tables above. They are object
* literals, so a bare index read answers for Object.prototype, and a code of
* `toString` would publish a function's source as dsh's reason (R43). */
const lookup = (table, key) => Object.hasOwn(table, key) ? table[key] : void 0;
/** The pnpm-failure hint a desktop reader gets: it names no command, which
* the CLI would refuse for that profile. */
const DESKTOP_FAILURE_HINT = "pnpm failed in the profile";
/** What dsh says it restored after refusing, from its own restoration line:
* the first `dsh: ` line after the one opening the refusal
* (dsh-plugin-manager's `rejected`), read as the CLI path's `refusalDetail`
* reads it, capitalized and ending in dsh's own period. Null when the output
* holds no such line, being empty or cut short. */
function restorationSentence(output) {
	const lines = output.split(/\r?\n/);
	const start = lines.findIndex((line) => line.startsWith(REFUSAL_OPENER));
	if (start === -1) return null;
	const said = lines.slice(start + 1).find((later) => later.startsWith("dsh: "))?.slice(5).trim() ?? "";
	return said === "" ? null : `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
}
/** The refusal of a package the running dsh rejects on its peers, for the
* operation dsh refused: an install, an update, or an uninstall whose pnpm
* run touched an incompatible sibling. What dsh restored is dsh's to say,
* so its restoration line is passed on. Without one, an install or update
* says what dsh's own pre-check says, and an uninstall says nothing of it. */
function versionRefusalDetail(context, change) {
	const refused = change.incompatible.map((issue) => `${issue.name}@${issue.version} requires ${Object.entries(issue.peers).map(([peer, range]) => `${peer} ${range}`).join(", ")}, which dsh ${issue.runtimeVersion} does not satisfy`);
	const restored = restorationSentence(change.output) ?? (context.operation === "uninstall" || change.truncated ? null : "Nothing was installed.");
	const base = `dsh-plugin-shop: dsh refused the ${context.operation}: ${refused.join("; ")}.${restored === null ? "" : ` ${restored}`}`;
	if (context.desktop) return `${base} Version exemptions are not available here: the dsh CLI cannot manage desktop profiles, and the shop cannot grant them.`;
	const commands = change.incompatible.map((issue) => allowVersionCommand(context.profile, issue)).filter((command) => command !== null);
	if (commands.length === 0) return base;
	return `${base} To accept the risk of crashes or data loss for ${commands.length === 1 ? "this exact version" : "these exact versions"}, run: ${commands.join("; ")} - then ${context.operation} again.`;
}
/** The sentence a management code gets, plus dsh's own diagnostic. The
* diagnostic is trimmed and stripped of one trailing period so one that
* already ends in a period is not doubled; empty after that reads as
* absent. Exported: Task 7 builds the same tail for a non-terminal notice. */
function codeReason(change, code) {
	const sentence = lookup(CODE_SENTENCE, code);
	const diagnostic = change.diagnostic !== null ? change.diagnostic.trim().replace(/\.$/, "") : "";
	const said = diagnostic !== "" ? ` dsh reported: ${diagnostic}.` : "";
	return `${sentence !== void 0 ? `: ${sentence}` : ""}.${said}`;
}
/** A desktop reader's detail for build scripts pnpm held. The app bundles
* its own package manager, so `pnpm approve-builds` is no step for this
* reader, and the shop never allows build scripts itself. dsh's own Plugins
* page offers "Allow these scripts and retry" on the failed screen of an
* install it runs, listing the held packages (dsh-client-ui-plugin-manager
* 0.1.7-rc.2: `installApproveAndRetry` in lib/client.js, and its README), so
* that is named, but only for an install whose held builds dsh listed. Its
* Add plugin dialog refuses a name the profile already holds, so it cannot
* rerun an update, and with no name listed it offers no such button. */
function desktopBuildsDetail(context, change, held) {
	const base = `dsh-plugin-shop: pnpm blocked build scripts for ${held}. These scripts need approval, which the shop cannot grant.`;
	if (context.operation !== "install" || change.pendingBuilds.length === 0) return base;
	return `${base} Try installing from dsh's Plugins page. If these scripts block the install there, use "Allow these scripts and retry" to approve them.`;
}
/** What a `cancelled` answer means, for every reader: the shop's deadline
* asked dsh to stop the operation, and dsh answers `cancelled` only once its
* repository check or pnpm has exited and package.json and pnpm-lock.yaml
* are back as they were (dsh-plugin-manager 0.1.7-rc.2: cancelInstall, and
* InstallCancelledError, thrown after the files are restored). Nothing was
* installed, so the detail names no command: the CLI's `install`, which the
* CLI path's own timeout detail names, would no longer involve the package.
* Only installBundle can be cancelled, so the operation is an install or an
* update. */
function cancelledDetail(context) {
	const seconds = Math.max(1, Math.round(context.timeoutMs / 1e3));
	return `dsh-plugin-shop: the ${context.operation} did not finish within ${seconds}s, so the shop cancelled it. dsh restored the profile's package.json and pnpm-lock.yaml. Nothing was installed. Try the ${context.operation} again from the shop.`;
}
/** A `ChangeResult` as the shop's terminal install record: design
* 2026-09-26-plugin-manager-delegation, section 5, read by the first rule
* that matches. A removal that failed after dsh changed the profile says,
* after whichever rule read it, that the package is still installed and
* switched off. */
function managerOutcome(raw, context) {
	const change = context.desktop ? forDesktopReader(readChange(raw)) : readChange(raw);
	const outcome = outcomeByRule(change, context);
	if (context.operation === "uninstall" && outcome.state === "failed" && change.changed === true) {
		const switchedOff = `${context.name} is still installed, but dsh has switched it off.`;
		if (outcome.detail === void 0) return {
			...outcome,
			detail: switchedOff
		};
		const needsPeriod = !/[.!?]$/.test(outcome.detail);
		return {
			...outcome,
			detail: `${outcome.detail}${needsPeriod ? "." : ""} ${switchedOff}`
		};
	}
	if (outcome.state === "failed" && change.changed === true) return {
		...outcome,
		retry: false
	};
	return outcome;
}
/** The section 5 rules, in order; the first that matches wins. */
function outcomeByRule(change, context) {
	if (change.errorCode === "incompatible-version" || change.errorCode === "operation-error" && change.incompatible.length > 0) return {
		state: "failed",
		detail: versionRefusalDetail(context, change)
	};
	if (change.application === "failed" && change.stage === "enable") {
		const code = change.errorCode ?? "failed";
		return {
			state: "failed",
			detail: `dsh-plugin-shop: ${context.name} is installed, but dsh could not enable it (${code})${codeReason(change, code)} Uninstall it from the shop to undo the install.`
		};
	}
	if (change.application === "failed" && change.kind !== null && (change.errorCode === null || change.errorCode === "operation-error")) {
		if (change.kind === "build-blocked") {
			const held = change.pendingBuilds.length > 0 ? change.pendingBuilds.join(", ") : "a dependency";
			if (context.desktop) return {
				state: "failed",
				detail: desktopBuildsDetail(context, change, held)
			};
			return {
				state: "failed",
				detail: `dsh-plugin-shop: pnpm blocked build scripts for ${held}. To review and allow them, run \`pnpm approve-builds\` in the profile directory, then ${context.operation} again.`
			};
		}
		if (change.kind === "timeout" && change.failedAt === "spec-host") return {
			state: "failed",
			detail: `dsh-plugin-shop: the ${context.operation} stopped because the GitHub connection check timed out (5 s by default). pnpm has not run. Check your connection to GitHub and try again.`
		};
		const sentence = lookup(KIND_SENTENCE, change.kind);
		if (sentence !== void 0) {
			const where = change.failedAt === null ? "" : lookup(WHERE, change.failedAt) ?? "";
			return {
				state: "failed",
				detail: `dsh-plugin-shop: the ${context.operation} failed${where}: ${sentence}.`
			};
		}
		const lines = change.output.split(/\r?\n/).filter((line) => line !== "");
		return {
			state: "failed",
			detail: context.desktop ? installFailureDetail(context.profile, lines, DESKTOP_FAILURE_HINT) : installFailureDetail(context.profile, lines)
		};
	}
	if (change.errorCode !== null) return {
		state: "failed",
		detail: `dsh-plugin-shop: dsh ${change.errorCode === "operation-error" ? `could not ${context.operation} ${context.name}` : `refused the ${context.operation} of ${context.name}`} (${change.errorCode})${codeReason(change, change.errorCode)}`,
		...change.errorCode === "already-installed" ? { retry: false } : {}
	};
	if (change.application === "cancelled") return {
		state: "failed",
		detail: cancelledDetail(context)
	};
	if (change.application === "restart-required") return context.operation === "update" ? {
		state: "done",
		activation: "restart",
		restartReason: "already-loaded"
	} : {
		state: "done",
		activation: "restart"
	};
	if (change.application === "applied" || change.application === "overridden") {
		const note = change.application === "overridden" ? { detail: "Saved, but a home or startup configuration overrides this setting and controls whether the plugin runs." } : {};
		if (context.operation !== "uninstall" && context.alreadyImported && !(change.application === "applied" && context.reconcilesRunningPlugins)) return {
			state: "done",
			activation: "restart",
			restartReason: "already-loaded",
			...note
		};
		return {
			state: "done",
			activation: activationOf({
				hostLive: true,
				clientLive: true,
				hasClientHalf: context.hasClientHalf
			}),
			...note
		};
	}
	return {
		state: "failed",
		detail: `dsh-plugin-shop: could not confirm the ${context.operation}. dsh returned an unrecognized status: "${change.application ?? "nothing"}".`
	};
}
//#endregion
//#region src/host/manager-runner.ts
/**
* One package operation through dsh's `pluginManager` service, tracked as the
* same `RunningInstall` the CLI executor produces: design
* 2026-09-26-plugin-manager-delegation, section 6. It runs in the same
* per-profile queue as CLI commands, so the two paths are never concurrent in
* one profile.
*/
/** The first line of every record this runner writes. The shop's log panel
* shows it and the 0.1.7 e2e asserts it, so a silent fall back to the CLI
* fails a case instead of passing it. */
const MECHANISM_PREFIX = "via dsh's plugin manager:";
/** Routes the service's `plugin-manager/install-log` chunks to the record
* whose request id they carry. A chunk for any other id is dropped. dsh
* tags each chunk with the stream it came from; a non-string stream reads
* as `stdout`, matching a harness that predates the tag. */
var ManagerLogs = class {
	sinks = /* @__PURE__ */ new Map();
	open(requestId, sink) {
		this.sinks.set(requestId, sink);
		return () => {
			this.sinks.delete(requestId);
		};
	}
	chunk(requestId, text, stream) {
		if (typeof requestId !== "string" || typeof text !== "string") return;
		this.sinks.get(requestId)?.(text, typeof stream === "string" ? stream : "stdout");
	}
};
/** What every value this cannot describe reads as. */
const UNREADABLE = "an error with no readable message";
/** What a thrown value says about itself, and total: describing an error is
* never itself the reason a settle fails. An `Error` gives its `message`,
* anything else `String(value)`. A message that is not a string, or a
* description that throws anywhere, reads as one fixed string: a Proxy whose
* getPrototypeOf trap throws defeats `instanceof` itself, a `message` getter
* can throw, and a null-prototype object has no conversion to a string. */
const messageOf = (error) => {
	try {
		const said = error instanceof Error ? error.message : String(error);
		if (typeof said === "string") return said;
	} catch {}
	return UNREADABLE;
};
function startManagerOperation(options) {
	const { profile, requestId, mechanism, logs, run, cancel, outcome, alsoConfirm, prefetcher, spec, env, desktop = false, command } = options;
	const timeoutMs = options.timeoutMs ?? INSTALL_TIMEOUT_MS;
	const mechanismLine = `${MECHANISM_PREFIX} ${mechanism}`;
	const log = createBoundedLog();
	let state = "running";
	let settled = null;
	let streamed = false;
	const status = () => ({
		state,
		log: [mechanismLine, ...log.lines()],
		...settled?.state === "done" && settled.activation !== void 0 ? { activation: settled.activation } : {},
		...settled?.state === "done" && settled.restartReason !== void 0 ? { restartReason: settled.restartReason } : {},
		...settled?.detail !== void 0 ? { detail: settled.detail } : {},
		...state === "failed" && command !== void 0 && settled?.retry !== false ? { command } : {}
	});
	const append = (line) => {
		if (isTerminalInstallState(state)) return;
		log.push(line);
	};
	const streams = /* @__PURE__ */ new Map();
	const streamFor = (stream) => {
		let sink = streams.get(stream);
		if (sink === void 0) {
			sink = lineSink(append);
			streams.set(stream, sink);
		}
		return sink;
	};
	const flushStreams = () => {
		for (const sink of streams.values()) sink.flush();
	};
	const close = logs.open(requestId, (text, stream) => {
		streamed = true;
		streamFor(stream).write(Buffer.from(text, "utf8"));
	});
	const queued = inProfileQueue(profile, async () => {
		state = "running";
		let deadline;
		if (cancel !== void 0) deadline = setTimeout(() => {
			Promise.resolve().then(() => cancel(requestId)).catch(() => {});
		}, timeoutMs);
		let raw;
		try {
			raw = await run(requestId);
		} catch (error) {
			flushStreams();
			settled = {
				state: "failed",
				detail: `dsh-plugin-shop: dsh's plugin manager failed${thrownTail(messageOf(error), desktop)}`
			};
			state = "failed";
			return status();
		} finally {
			clearTimeout(deadline);
		}
		let result;
		try {
			flushStreams();
			if (!streamed) {
				for (const line of readChange(raw).output.split(/\r?\n/)) if (line !== "") append(line);
			}
			result = outcome(raw);
		} catch (error) {
			settled = {
				state: "failed",
				detail: `dsh-plugin-shop: could not read the result from dsh: ${messageOf(error)}`
			};
			state = "failed";
			return status();
		}
		if (result.state === "done" && alsoConfirm !== void 0) try {
			const objection = alsoConfirm();
			if (objection !== null) result = {
				state: "failed",
				detail: objection,
				retry: false
			};
		} catch (error) {
			result = {
				state: "failed",
				detail: `dsh-plugin-shop: could not verify the installed plugin: ${messageOf(error)}`,
				retry: false
			};
		}
		settled = result;
		state = result.state;
		return status();
	});
	if ((queued.ahead > 0 && prefetcher !== void 0 && spec !== void 0 ? requestDownloadPhase({
		prefetcher,
		profile,
		spec,
		env,
		log: append
	}) : null)?.started === true && !isTerminalInstallState(state)) state = "downloading";
	const finished = queued.finished.finally(() => {
		close();
		if (prefetcher !== void 0 && spec !== void 0) prefetcher.release(profile, spec);
	});
	finished.catch(() => {});
	return {
		installId: requestId,
		status,
		finished
	};
}
/**
* `first`, continued by the record `next` starts when `first` ends refused,
* as one record under `first`'s id: design 2026-10-19-dsh-021-readiness,
* section 2. dsh-plugin-manager 0.2.1-rc.2 refuses an update in place as
* `already-installed`, and the gateway continues such an update through
* dsh's CLI. One record, so the client keeps polling the id it was given,
* and the restart gate and eviction, which read every tracked record, see
* the command that runs.
*
* While `first` runs, this is `first`. Whether it continues is decided once,
* when `first` ends: the first `status()` read or `first.finished` settling
* that sees `first` terminal asks `refused`, and that answer is kept. So a
* caller may set its flag while reading the answer that ends `first`, and a
* flag flipped after that changes neither `status()` nor `finished`, which
* answer from that one decision. Not refused, this stays `first`. Refused,
* `next` runs, exactly once, at that same read or finish, so no read between
* the refusal and the next command reports the refusal. From then on the
* record is `next`'s, its state, detail and activation, with `first`'s log,
* then `bridge`, then `next`'s log. That log joins two bounded logs and the
* bridge, so a continued record can carry about twice `MAX_LOG_LINES` and
* `MAX_LOG_BYTES`, where one record of `startManagerOperation` carries at most
* one line over them.
*/
function continueAfter(first, refused, next, bridge) {
	let begun = false;
	/** Whether `first` ended refused: `refused`'s answer, asked once, by the
	* first read or finish that sees `first` terminal. */
	let refusal;
	/** The log `first` ended on, and the record carrying on from it: what
	* `next` returned, or the failure it threw. */
	let continued;
	const behind = (head, tail) => ({
		...tail,
		log: [
			...head,
			bridge,
			...tail.log
		]
	});
	const status = () => {
		if (continued !== void 0) return behind(continued.head, continued.running.status());
		if (begun) return {
			state: "running",
			log: [...first.status().log, bridge]
		};
		const own = first.status();
		if (!isTerminalInstallState(own.state)) return own;
		refusal ??= refused();
		if (!refusal) return own;
		begun = true;
		let running;
		try {
			running = next();
		} catch (error) {
			const failed = {
				state: "failed",
				log: [],
				detail: `dsh-plugin-shop: ${messageOf(error)}`
			};
			running = {
				installId: first.installId,
				status: () => failed,
				finished: Promise.resolve(failed)
			};
		}
		continued = {
			head: own.log,
			running
		};
		return behind(own.log, running.status());
	};
	const finished = first.finished.then(async (own) => {
		status();
		const now = continued;
		if (now === void 0) return own;
		return behind(now.head, await now.running.finished);
	});
	finished.catch(() => {});
	return {
		installId: first.installId,
		status,
		finished
	};
}
//#endregion
//#region src/host/index.ts
/** ShopGateway: the Host half of dsh-plugin-shop (§5.1). */
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
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Each blocked reason's author-readable refusal, written once.
*
* `restart()` returns these as its `detail` and `version()` returns the bare
* reason for the client to localize, so the two can no longer disagree about
* WHY a restart is impossible. They did: `version()` reported a boolean that
* covered two of the refusals, the client had one string for that boolean, and
* that string named systemd — so a Windows user was told to restart a systemd
* service and to set an override that the platform check, being checked ahead
* of the systemd one, could never reach. */
const RESTART_BLOCKED_DETAIL = {
	desktop: "dsh-plugin-shop: this profile is managed by the DeepSeek Harness desktop app. Restart the app to apply the change.",
	"from-default-profile": "dsh-plugin-shop: dsh was started with --from-default-profile. In dsh 0.2.1 and later, restarting with this flag recreates the profile from its template and deletes all installed plugins, including the shop. Restart dsh manually without this flag.",
	windows: "dsh-plugin-shop: restarting from the shop is not supported on Windows yet. Quit dsh and start it again to apply the change.",
	systemd: "dsh-plugin-shop: dsh is managed by systemd. Restart the service manually; restarting from the shop could stop the service without bringing it back. To allow restarts from the shop, set allowRestart: true in the shop configuration.",
	"port-zero": "dsh-plugin-shop: dsh was started with --port 0. Its port will change after a restart. Restart dsh manually and open the new address."
};
/** Why the shop changes nothing in the desktop profile, for every mutation
* that spawns dsh's CLI: install, uninstall and self-update. dsh refuses
* the profile before any of them would run (`isDesktopProfile`), and the
* failure that surfaced instead read "pnpm failed in the profile". */
const DESKTOP_PROFILE_DETAIL = "dsh-plugin-shop: this profile is managed by the DeepSeek Harness desktop app. The shop cannot change it through the command line. Add or remove plugins from the app.";
/** Why the shop's own update cannot run in the desktop profile, and where it
* can (2026-11-06 amendment). dsh's plugin manager refuses an in-place
* update of an installed package (`already-installed`), and the CLI
* continuation every other profile takes cannot run here: dsh's launcher
* refuses `--profile desktop` outright. dsh's own Plugins page has the
* operation the shop lacks — check, remove, install, restore on failure —
* so that page is the path, and the client's version row offers it there. */
const DESKTOP_SELF_UPDATE_DETAIL = "dsh-plugin-shop: this profile is managed by the DeepSeek Harness desktop app, where the shop cannot replace itself while it is running. Update it from dsh's Plugins page (插件): select dsh-plugin-shop, then update it there; dsh removes and reinstalls it, restoring the old version if that fails.";
/** Why a switch through dsh's `pluginManager` waits for an operation this
* gateway started: dsh holds its profile lock for a whole install or removal
* (`change()` wraps pnpm) and makes any other change wait for it up to its
* `lockWaitMs`, 120 s, so a switch clicked mid-install would spin for two
* minutes and then fail on the lock. The check is F-5's, `hasRunningCommand`.
* The shop's own row writer takes no dsh lock, so what it writes alone (the
* CLI path's switch, and switching a deselected package off) is not
* refused. */
const switchWhileBusyDetail = (name) => `dsh-plugin-shop: an install, update or uninstall is still running in this profile. Wait for it to finish before changing the enabled state of ${name}.`;
/** The line a record gains when dsh's plugin manager refuses an update in
* place and the shop continues it through dsh's CLI (design
* 2026-10-19-dsh-021-readiness §2): what dsh refused, and the command that
* runs instead. It names a `dsh plugin` command, so it never reaches a
* desktop reader: the continuation does not run in that profile. */
function cliFallbackLine(profile, spec) {
	return `dsh-plugin-shop: dsh's plugin manager cannot update this package directly (already-installed). Continuing with: \`dsh plugin --profile ${profile} add ${spec}\``;
}
/** Whether one install identity survives `state.ts`'s bounds (`KEY_MAX_LENGTH`
* there). The RPC and the file must agree, or a star is answered saved and
* then filtered away. */
function isStorableKey(key) {
	return key.length > 0 && key.length <= 300;
}
/** How many bytes a release tarball may be at the integrity check. The
* registry already refuses to publish a tarball over 32 MiB, so 64 MiB is
* headroom, not a gate of its own. */
const MAX_TARBALL_BYTES = 67108864;
/**
* Fetch a release tarball and verify its sha256 against the catalog record
* (market borrowings §3.1). Returns a rejection detail, or null when the
* bytes match. The read streams through the byte cap, so an oversized or
* hostile body is refused without ever being buffered. Every failure — fetch
* throw, non-2xx, unreadable body, over-cap, hash mismatch — carries the same
* `tarball-integrity` code with a detail naming what happened, so the plugin
* author can read the cause.
*/
async function verifyTarballSha256(fetchTarball, url, recordedSha256, maxBytes = MAX_TARBALL_BYTES) {
	let response;
	try {
		response = await fetchTarball(url);
	} catch (error) {
		return `dsh-plugin-shop: could not download the release archive. Installation stopped. Network error: ${error.message}`;
	}
	if (!response.ok) return `dsh-plugin-shop: could not download the release archive (HTTP ${response.status}). Installation stopped.`;
	if (response.body === null) return "dsh-plugin-shop: the release archive response was empty or unreadable. Installation stopped.";
	const hash = createHash("sha256");
	let bytes = 0;
	const reader = response.body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) {
				try {
					await reader.cancel();
				} catch {}
				return `dsh-plugin-shop: the release archive exceeds the size limit (${maxBytes} bytes). Installation stopped.`;
			}
			hash.update(value);
		}
	} catch (error) {
		return `dsh-plugin-shop: the release archive download failed. Installation stopped. Error: ${error.message}`;
	}
	if (hash.digest("hex") !== recordedSha256) return "dsh-plugin-shop: the release archive does not match the catalog checksum (SHA-256). Installation stopped.";
	return null;
}
/** An own-property read of a dependency map parsed from the profile manifest.
* A bare index read answers for `Object.prototype`, and `constructor` is a
* legal npm name (`[a-z0-9][a-z0-9._-]*`), so `dependencies['constructor']`
* hands back a function for a package that is not installed. The
* `spec === undefined` guard then passes, and `installedSpecMatches` returns
* TRUE for an npm entry — `parseRepoSpec` coerces the function to a string
* that matches no `github:` shorthand and answers `null`, which is exactly
* what an npm entry expects. So the entry reads as installed when it is not.
* `Object.hasOwn` is the same fix already applied at the two membership
* checks above; these two sites need the VALUE, hence a helper. */
function ownDependencySpec(dependencies, name) {
	return Object.hasOwn(dependencies, name) ? dependencies[name] : void 0;
}
/**
* Package names whose module this PROCESS may already hold in Node's module
* cache (design 2026-09-26-market-borrowings §1.2).
*
* A hot mount can only deliver code the process has not imported yet. The hot
* tree imports through the loader's `internal.import`, which is Node's own ESM
* loader and caches a module by its URL, and an install rewrites a package's
* files at the URL it already had (`nodeLinker: hoisted`). Once a name is in
* here, a mount of it would re-run the cached module under whatever version is
* now on disk.
*
* Module scope rather than a gateway field, because the cache it models is the
* process's: a gateway rebuilt inside a running dsh — a restarted shop fiber —
* must not forget what the process imported before it existed. Every gateway
* seeds it with the profile's dependencies at construction (the boot
* composition) and extends it with every name the hot path mounts. It extends
* it again with every name one of its own installs through dsh's
* `pluginManager` brought to the enable stage, and with the profile's
* dependencies whenever that service reports an install: dsh's own Plugins
* page installs through it, and the report names no package. Nothing is ever
* removed: an uninstall disposes the fiber, not the module record.
*/
const importedThisProcess = /* @__PURE__ */ new Set();
/** Remote-only service exposing the shop Remote methods of §7.3.
*
* @typert service shop */
let ShopGateway = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _setEnabled_decorators;
	let _catalog_decorators;
	let _install_decorators;
	let _installStatus_decorators;
	let _installedSpecs_decorators;
	let _shopState_decorators;
	let _setFavorite_decorators;
	let _rollbackStart_decorators;
	let _installed_decorators;
	let _uninstall_decorators;
	let _restart_decorators;
	let _version_decorators;
	let _updateStart_decorators;
	return class ShopGateway extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_setEnabled_decorators = [Remote("setEnabled")];
			_catalog_decorators = [Remote("catalog")];
			_install_decorators = [Remote("installStart")];
			_installStatus_decorators = [Remote("installStatus")];
			_installedSpecs_decorators = [Remote("installedSpecs")];
			_shopState_decorators = [Remote("state")];
			_setFavorite_decorators = [Remote("setFavorite")];
			_rollbackStart_decorators = [Remote("rollbackStart")];
			_installed_decorators = [Remote("installed")];
			_uninstall_decorators = [Remote("uninstallStart")];
			_restart_decorators = [Remote("restart")];
			_version_decorators = [Remote("version")];
			_updateStart_decorators = [Remote("updateStart")];
			__esDecorate(this, null, _setEnabled_decorators, {
				kind: "method",
				name: "setEnabled",
				static: false,
				private: false,
				access: {
					has: (obj) => "setEnabled" in obj,
					get: (obj) => obj.setEnabled
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _catalog_decorators, {
				kind: "method",
				name: "catalog",
				static: false,
				private: false,
				access: {
					has: (obj) => "catalog" in obj,
					get: (obj) => obj.catalog
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _install_decorators, {
				kind: "method",
				name: "install",
				static: false,
				private: false,
				access: {
					has: (obj) => "install" in obj,
					get: (obj) => obj.install
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _installStatus_decorators, {
				kind: "method",
				name: "installStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "installStatus" in obj,
					get: (obj) => obj.installStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _installedSpecs_decorators, {
				kind: "method",
				name: "installedSpecs",
				static: false,
				private: false,
				access: {
					has: (obj) => "installedSpecs" in obj,
					get: (obj) => obj.installedSpecs
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _shopState_decorators, {
				kind: "method",
				name: "shopState",
				static: false,
				private: false,
				access: {
					has: (obj) => "shopState" in obj,
					get: (obj) => obj.shopState
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setFavorite_decorators, {
				kind: "method",
				name: "setFavorite",
				static: false,
				private: false,
				access: {
					has: (obj) => "setFavorite" in obj,
					get: (obj) => obj.setFavorite
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _rollbackStart_decorators, {
				kind: "method",
				name: "rollbackStart",
				static: false,
				private: false,
				access: {
					has: (obj) => "rollbackStart" in obj,
					get: (obj) => obj.rollbackStart
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _installed_decorators, {
				kind: "method",
				name: "installed",
				static: false,
				private: false,
				access: {
					has: (obj) => "installed" in obj,
					get: (obj) => obj.installed
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _uninstall_decorators, {
				kind: "method",
				name: "uninstall",
				static: false,
				private: false,
				access: {
					has: (obj) => "uninstall" in obj,
					get: (obj) => obj.uninstall
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _restart_decorators, {
				kind: "method",
				name: "restart",
				static: false,
				private: false,
				access: {
					has: (obj) => "restart" in obj,
					get: (obj) => obj.restart
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _version_decorators, {
				kind: "method",
				name: "version",
				static: false,
				private: false,
				access: {
					has: (obj) => "version" in obj,
					get: (obj) => obj.version
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _updateStart_decorators, {
				kind: "method",
				name: "updateStart",
				static: false,
				private: false,
				access: {
					has: (obj) => "updateStart" in obj,
					get: (obj) => obj.updateStart
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		options = __runInitializers(this, _instanceExtraInitializers);
		/** The context this gateway was built with: the shop's own fiber. Inside an
		* RPC method `this.ctx` is NOT that — cordis hands a service out with `ctx`
		* rebound to the context that looked it up, so a call arriving over the
		* wire sees the caller's, the typert gateway's (measured on 0.1.5-rc.3 and
		* 0.1.7-rc.2). Anything whose PARENT matters is registered from here. The
		* hot tree above all: registered from the gateway's context it was owned by
		* the gateway's fiber rather than the shop's, was listed under the gateway's
		* loader entry, and — the part a reader saw — sat where dsh's client
		* registry never composed it, so a hot-installed browser half needed a
		* restart that a reload now does (design 2026-09-26-dsh-017-readiness). */
		home;
		/** The profile dsh installs into; discovered from this module's own
		* location when the caller does not supply one. */
		profile;
		profileDir;
		inventory;
		hot;
		hotFs;
		loaderEntriesInjected;
		dshBin;
		/** The argv `shop/restart` re-spawns: the real process argv minus node and
		* the CLI script path, or a test-provided substitute. */
		restartArgv;
		/** The script the restart re-runs — this process's own entry. */
		restartScript;
		/** The exit the restart calls once the response is out; `process.exit` in
		* production, a spy in tests. */
		exit;
		restartExitDelayMs;
		restartParentPid;
		/** The restart this process committed, once it has: every later
		* `shop/restart` answers with it. A page that lost the first answer to an
		* HMR swap asks again (client/restart-monitor.ts), and inside the exit
		* delay that ask reaches this same process. */
		committedRestart = null;
		latestVersion;
		pinFs;
		/** Favorites and rollback records (`state.ts`), read and written through
		* this seam so tests never touch the real profile. */
		stateFs;
		allowRestart;
		env;
		/** The platform the restart gate reads, and the one the plugin-manager
		* path quotes its retry line for; production defaults to process.platform.
		* The two-phase handoff is POSIX-only (restart.ts). */
		platform;
		/** The parent pid `detectSupervisor` inspects; production defaults to
		* process.ppid (a systemd unit's main process has ppid 1). */
		ppid;
		/** The release-tarball fetch for the install-time integrity check; global
		* fetch in production, a fixture response in tests. */
		fetchTarball;
		/** One pump for the whole gateway: batching is per profile and lives inside
		* it, so a second instance would race the first for the same store. */
		prefetcher;
		/** What this process may already have imported (see `importedThisProcess`). */
		imported;
		/** Routes the output dsh's `pluginManager` streams to the record whose
		* request id it carries (see the constructor). */
		managerLogs;
		/** The install gate runs against the last loaded snapshot, never a fresh
		* fetch per request (§7.2: the Host's cached snapshot is the truth). */
		/** Finished install records retained, so a poll sees the true terminal
		* state (§8: done / activation / failure detail). Oldest evicted on add. */
		static MAX_FINISHED_INSTALLS = 32;
		/** How long the gateway waits after a successful restart response before
		* exiting the old process — the browser must receive the URL first. */
		static RESTART_EXIT_DELAY_MS = 2e3;
		/** The install gate runs against the last loaded snapshot, never a fresh
		* fetch per request (§7.2: the Host's cached snapshot is the truth). */
		lastSnapshot = null;
		/** A cold-cache catalog load shared by concurrent RPC calls. */
		inFlightLoad = null;
		/** The origin list built for the last-seen `catalogUrl`, memoised so the
		* user's npmrc is read at most once per gateway (see `originsFor`). */
		originCache = null;
		/** The user's own `registry=` from `~/.npmrc`, read at most once per
		* gateway. A wrapper distinguishes a genuine `null` from an unread value. */
		npmRegistryCache = null;
		/** The harness this process runs, read at most once per gateway: which dsh
		* is running cannot change while it runs, and the read imports a module. A
		* promise, so concurrent first calls share one read; `readRunningHarness`
		* never rejects, so there is no failure to retry. */
		harnessRead = null;
		/** Install records, running and finished, from the CLI and from dsh's
		* `pluginManager` alike; a poll finds one here or reports not found. */
		installs = /* @__PURE__ */ new Map();
		/** Every install id in insertion order, oldest first; finished-record eviction walks this from the front. */
		installOrder = [];
		constructor(ctx, options = {}) {
			super(ctx, "shop");
			this.home = ctx;
			this.options = options;
			this.profile = options.profile ?? discoverProfile(fileURLToPath(import.meta.url), this.bootBaseDir()).name;
			this.profileDir = options.profileDir;
			this.inventory = options.inventory;
			this.hot = options.hot;
			this.hotFs = options.hotFs;
			this.loaderEntriesInjected = options.loaderEntries;
			this.dshBin = options.dshBin ?? "dsh";
			this.restartArgv = options.restartArgv ?? process.argv.slice(2);
			this.restartScript = options.restartScript ?? process.argv[1];
			this.exit = options.exit ?? ((code) => process.exit(code));
			this.restartExitDelayMs = options.restartExitDelayMs ?? ShopGateway.RESTART_EXIT_DELAY_MS;
			this.restartParentPid = options.restartParentPid ?? process.pid;
			this.latestVersion = options.fetchLatestVersion ?? (() => fetchLatestVersion(fetch, { registry: this.npmRegistry() }));
			this.pinFs = options.pinFs ?? {
				exists: (path) => existsSync(path),
				read: (path) => readFileSync(path, "utf8"),
				write: (path, data) => {
					mkdirSync(dirname(path), { recursive: true });
					writeFileSync(path, data);
				}
			};
			this.allowRestart = options.allowRestart;
			this.stateFs = options.stateFs ?? nodeShopStateFs;
			this.env = options.env ?? process.env;
			this.platform = options.platform ?? process.platform;
			this.ppid = options.ppid ?? process.ppid;
			this.fetchTarball = options.fetchTarball ?? ((url) => fetch(url));
			this.prefetcher = options.prefetcher ?? createPrefetcher();
			this.imported = options.importedModules ?? importedThisProcess;
			this.recordDependenciesImported();
			this.managerLogs = new ManagerLogs();
			const on = this.ctx.on;
			on?.call(this.ctx, "plugin-manager/install-log", (payload) => {
				const chunk = payload;
				this.managerLogs.chunk(chunk?.requestId, chunk?.text, chunk?.stream);
			});
			on?.call(this.ctx, "plugin-manager/changed", (payload) => {
				if (payload?.reason === "install") this.recordDependenciesImported();
			});
			try {
				cleanHotDir(this.profileDirResolved());
			} catch {}
			this.checkPeerVersions();
		}
		/**
		* Warn once, at load, about any declared peer the harness provides outside
		* its declared range. Advisory by construction: it cannot throw, and it
		* never refuses the load — losing the whole shop is a worse outcome than
		* running against a harness that moved.
		*/
		checkPeerVersions() {
			try {
				createPeerVersionCheck({
					ranges: this.options.peerRanges ?? ownPeerRanges(),
					resolve: this.options.resolvePeerVersion ?? this.peerVersionResolver(this.profileAnchor()),
					warn: (message) => {
						const logger = this.ctx.logger;
						if (logger === void 0) console.warn(message);
						else logger.warn(message);
					}
				})();
			} catch {}
		}
		/** The pins file lives in the shop's own cache, next to the catalog cache. */
		pinsPath() {
			return join(this.rowConfig().cacheDir, "github-pins.json");
		}
		/** The boot's Loader root directory (the active profile's `cordis.yml`
		* directory, carried on `ctx.baseUrl`), when present. A `link:` install
		* keeps this package at its source location, so the walk-up from
		* `import.meta.url` finds the repo rather than a profile; `ctx.baseUrl`
		* is the boot-provided authoritative answer. */
		bootBaseDir() {
			const baseUrl = this.ctx.baseUrl;
			if (typeof baseUrl !== "string" || !baseUrl.startsWith("file:")) return void 0;
			try {
				return fileURLToPath(baseUrl);
			} catch {}
		}
		/** The profile directory the user layer lives in — the discovered default
		* stays lazy so `setEnabled` works in tests via the `profileDir` option
		* without requiring a real profile above this module. */
		profileDirResolved() {
			if (this.profileDir !== void 0) return this.profileDir;
			return discoverProfile(fileURLToPath(import.meta.url), this.bootBaseDir()).dir;
		}
		/** Where every "what can this installation's plugins import?" question
		* resolves from: the profile's own Loader root, which is where the harness
		* resolves plugins from. One definition for the peer presence check and the
		* load-time self-check, so neither can drift onto a different notion of
		* "the installation". NOT where the running harness is read from: a copy
		* of `@deepseek-ai/dsh` a plugin's dependencies hoist into the profile is
		* importable from here and is not what runs (`harness.ts`). Throws when no
		* profile directory can be discovered and none is given. */
		profileAnchor(profileDir = this.profileDirResolved()) {
			return pathToFileURL(join(profileDir, "cordis.yml")).href;
		}
		/** dsh's `pluginPackages` service, when the running harness provides one
		* (0.1.7 and later), else null. Read on each use, like `pluginInventory`.
		* It is how such a harness serves its own packages to plugins, which no
		* walk of the profile's disk can see (design
		* 2026-09-01-harness-compatibility §11). */
		harnessPackages() {
			const service = this.ctx.get?.("pluginPackages");
			return typeof service?.packageOf === "function" ? service : null;
		}
		/** dsh's `pluginManager` service, when the running harness provides all of
		* it (0.1.7 and later), else null. Never cached across calls, like
		* `pluginPackages`, but read once per RPC, at its start, and passed down:
		* read again after an await, a service disposed in between would let a
		* desktop mutation past the desktop gate and onto the CLI path, which dsh
		* refuses for that profile. Design 2026-09-26-plugin-manager-delegation,
		* section 3.1. */
		pluginManager() {
			return asPluginManager(this.ctx.get?.("pluginManager"));
		}
		/** Whether the running harness's profile reconcile replaces a running
		* plugin whose files changed on disk: dsh-hmr 0.2.1's `reconcileProfile`,
		* absent on 0.1.7 and 0.2.0 (whose hmr has only
		* `reconcileProfilePatches`) and on 0.1.5 (no hmr service). Read for what
		* `managerOutcome` makes of an `applied` answer on a name this process
		* imported (design 2026-10-19-dsh-021-readiness §2). A harness that offers
		* no service, or one without the method, answers false and keeps the
		* restart. */
		reconcilesRunningPlugins() {
			return typeof (this.ctx.get?.("hmr"))?.reconcileProfile === "function";
		}
		/** "Does this installation provide `spec`?", asked from `anchor`: the
		* harness's own resolution in front of the walk where the harness has one,
		* the walk alone where it has not. */
		peerResolver(anchor) {
			const walk = nodeResolver(anchor);
			const packages = this.harnessPackages();
			return packages === null ? walk : harnessPackageResolver(walk, packages, anchor);
		}
		/** `peerResolver`'s twin for the versions the load-time self-check reads. */
		peerVersionResolver(anchor) {
			const walk = nodeVersionResolver(anchor);
			const packages = this.harnessPackages();
			return packages === null ? walk : harnessPackageVersionResolver(walk, packages, anchor);
		}
		/** `profileDirResolved`, or null when no profile directory can be
		* discovered — for the reads that answer "cannot tell" rather than fail. */
		profileDirOrNone() {
			try {
				return this.profileDirResolved();
			} catch {
				return null;
			}
		}
		/** The harness this process runs, read once (see `harnessRead`). */
		runningHarness() {
			this.harnessRead ??= this.options.readHarness === void 0 ? readRunningHarness(this.restartScript, this.harnessLocator()) : this.options.readHarness(this.restartScript);
			return this.harnessRead;
		}
		/** Where to ask for the running dsh when the script this process started
		* with does not name it: the desktop app boots the profile through
		* `@deepseek-ai/dsh-desktop-host`, whose entry owns no dsh, so
		* `process.argv[1]` names the host rather than the harness. dsh serves its
		* own packages through `pluginPackages` (0.1.7 on), and the profile's
		* `cordis.yml` is the anchor the peer resolver already walks from, so the
		* service answers with this installation's dsh (design
		* 2026-09-01-harness-compatibility, 2026-11-06 amendment). Null when the
		* harness offers no such service (0.1.5) or no profile was found — the
		* script read alone then decides, as before. */
		harnessLocator() {
			const packages = this.harnessPackages();
			if (packages === null) return void 0;
			const profileDir = this.profileDirOrNone();
			if (profileDir === null) return void 0;
			return {
				packages,
				parentURL: this.profileAnchor(profileDir)
			};
		}
		/** The inventory, through the wire remote: an envelope `{ ok, value }` or
		* `{ ok: false, error }`. Each row is re-validated before trust (same
		* discipline as the rowConfig cast). */
		async listInventory() {
			const remote = this.inventory ?? this.ctx.get?.("pluginInventory");
			if (remote === void 0) throw new Error("dsh-plugin-shop: pluginInventory service is not mounted");
			const result = await remote.list();
			const list = Array.isArray(result) ? result : result.entries;
			if (!Array.isArray(list)) return [];
			const entries = [];
			for (const item of list) if (item !== null && typeof item === "object" && typeof item.entryId === "string" && typeof item.moduleName === "string" && typeof item.enabled === "boolean") entries.push(item);
			return entries;
		}
		/** The Loader's boot-layer entries; a harness without the loader answers
		* with an empty list (there is then nothing to live-disable). */
		loaderEntries() {
			if (this.loaderEntriesInjected !== void 0) return this.loaderEntriesInjected();
			const loader = this.ctx.loader;
			return loader === void 0 ? [] : [...loader.entries()];
		}
		/** Live-disable one boot-layer entry, retrying until its fiber is actually
		* down. A disable can land while the entry's init is still in flight: the
		* options flip but the finishing init brings the fiber up anyway, and a
		* plain re-update no-ops on the empty diff (dsh-market themes.ts:74-93).
		* The uninstall path is the one caller: an update used to swap its running
		* instance for a hot mount through here, and no longer mounts at all
		* (design 2026-09-26-market-borrowings §1). */
		/** The package's owned entry ids, or none when its bundle patch cannot be
		* read. For the paths where a live disable is an optimization and the
		* operation must succeed regardless; `setEnabled` reports the failure
		* instead, because there the patch IS the answer being asked for. */
		/**
		* The profile manifest's dependencies, or undefined when it cannot be read.
		*
		* `readProfileManifest` throws on an unreadable file and lets `JSON.parse`
		* throw on a malformed one, and `profileDirResolved` can throw out of
		* `discoverProfile`. An escaped exception crosses the RPC as a bare
		* transport failure and the client can only render "please retry" (the same
		* hazard `setEnabled` catches), so a profile caught mid-write would turn
		* every published rejection detail on the install path — denied,
		* not-in-catalog, version-mismatch — into that one line.
		*
		* Undefined is "cannot say", which the caller must not read as "nothing is
		* installed": it means the install proceeds ungated rather than being
		* refused over a read that did not happen.
		*/
		profileDependenciesOrNone() {
			try {
				return readProfileManifest("dsh-plugin-shop", this.profileDirResolved()).dependencies ?? {};
			} catch {
				return;
			}
		}
		/**
		* The profile manifest's spec for one name, or undefined when the manifest
		* holds no such name — or could not be read at all.
		*
		* Through `ownDependencySpec` for the reason spelled out there: a bare index
		* read answers for `Object.prototype`, and `constructor` is a legal npm
		* name. The cost on this path is behavioural twice over — the gate would
		* weigh a function as the installed spec, and a phantom `isUpdate` would
		* refuse a hot mount to a package this process never imported.
		*/
		installedSpecOf(name) {
			const dependencies = this.profileDependenciesOrNone();
			return dependencies === void 0 ? void 0 : ownDependencySpec(dependencies, name);
		}
		/** Add every dependency the profile manifest holds to the `imported`
		* record (see `importedThisProcess`): each is a package dsh's loader may
		* have loaded in this process, at boot or by an install since. An
		* unreadable manifest adds nothing. */
		recordDependenciesImported() {
			for (const name of Object.keys(this.profileDependenciesOrNone() ?? {})) this.imported.add(name);
		}
		ownedEntryIdsOrNone(packageName) {
			try {
				return ownedEntryIds({
					profileDir: this.profileDirResolved(),
					packageName
				});
			} catch {
				return [];
			}
		}
		/** Whether an installed package declares `dsh.client`. Reads through the
		* `hotFs` option — `HotFs` is `hot.ts`'s type, but this gateway forwards
		* the option only HERE, never into `hotMount`, which takes its own `fs`
		* from `HotDeps`. A fixture therefore drives this read alone, which is the
		* point: it is the only way to state what a package declared BEFORE an
		* update overwrote its manifest. */
		packageHasClientHalf(packageName) {
			return hasClientHalf(this.hotFs ?? nodeHotFs, this.profileDirResolved(), packageName);
		}
		/**
		* Bring every live entry the package owns down, best effort, and report
		* whether its host half is DOWN when this returns.
		*
		* "Nothing matched" is down: a package with no live entry is not running,
		* which is the ordinary case for removing a plugin that never loaded this
		* session. Only a matched entry whose fiber outlives the retries — or
		* whose `update` throws — leaves the plugin UP, and that is the one case
		* an uninstall must not describe as stopped.
		*
		* The old spelling answered "did any update succeed", which is a different
		* question: `update` resolving says the row was accepted, not that the
		* instance went away. The retry loop below exists precisely because those
		* two come apart, so reading the first as the second threw away the answer
		* the loop was computing.
		*/
		async liveEntriesDown(ids) {
			if (ids.length === 0) return true;
			const owned = new Set(ids);
			let allDown = true;
			for (const entry of this.loaderEntries()) {
				if (entry.id === void 0 || !ownsEntryId(owned, entry.id)) continue;
				let down = false;
				for (let attempt = 0; attempt < 3; attempt++) {
					try {
						await entry.update({ disabled: true }, false, true);
					} catch {
						break;
					}
					if (entry.fiber === void 0) {
						down = true;
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
				if (!down) allDown = false;
			}
			return allDown;
		}
		/** Enable or disable one installed plugin, hot (§8): the write sets the
		* `disabled` key of each owned entry's row in the user layer and changes
		* nothing else there (design 2026-09-26-market-borrowings §2) — the CLI's
		* watchUserPatches applies it through HMR. The shop's own row and the
		* framework's bundles are never toggleable: disabling the host chain would
		* break HMR itself. */
		async setEnabled(args) {
			if (args.name === "dsh-plugin-shop" || args.name.startsWith("@deepseek-ai/")) return {
				ok: false,
				detail: `dsh-plugin-shop: ${args.name} is part of dsh itself and cannot be enabled or disabled from the shop.`
			};
			const manager = this.pluginManager();
			const profileDir = this.profileDirResolved();
			const manifest = readProfileManifest("dsh-plugin-shop", profileDir);
			if (!Object.hasOwn(manifest.dependencies ?? {}, args.name)) return {
				ok: false,
				detail: `dsh-plugin-shop: ${args.name} is not installed`
			};
			let owned;
			try {
				owned = ownedEntries({
					profileDir,
					packageName: args.name
				});
			} catch (error) {
				return {
					ok: false,
					detail: `dsh-plugin-shop: could not read the plugin configuration for ${args.name}: ${String(error)}`
				};
			}
			if (owned.length === 0) return {
				ok: false,
				detail: `dsh-plugin-shop: ${args.name} has no plugin entries to enable or disable.`
			};
			const selected = this.runningProfileBundles(profileDir);
			if (selected !== null && !selected.includes(args.name)) return this.setDeselectedEnabled(args.name, args.enabled, profileDir, owned, manager);
			const ownedSet = new Set(owned.map((entry) => entry.id));
			const live = (await this.listInventory()).filter((entry) => ownsEntryId(ownedSet, entry.entryId));
			if (live.length === 0) return {
				ok: false,
				detail: `dsh-plugin-shop: ${args.name} is installed but has not been loaded. Restart dsh to load it.`
			};
			if (manager !== null) {
				if (this.hasRunningCommand()) return {
					ok: false,
					detail: switchWhileBusyDetail(args.name)
				};
				let restart = false;
				let switched = 0;
				const failed = (detail) => {
					if (switched === 0) return {
						ok: false,
						detail
					};
					return {
						ok: false,
						detail: `${/[.!?]$/.test(detail) ? detail : `${detail}.`} ${switched} of its ${live.length} plugins had already switched ${args.enabled ? "on" : "off"}.`
					};
				};
				for (const entry of live) {
					let raw;
					try {
						raw = await manager.setPluginEnabled(entry.entryId, args.enabled);
					} catch (error) {
						return failed(`dsh-plugin-shop: dsh could not switch ${args.name}${thrownTail(messageOf(error), isDesktopProfile(this.profile))}`);
					}
					const { change, failure } = this.readManagerAnswer(raw, {
						act: `switch ${args.name}`,
						request: `the switch for ${args.name}`,
						stays: args.enabled ? "off" : "on"
					});
					if (failure !== null) return failed(failure);
					switched += 1;
					if (change.application === "restart-required") restart = true;
				}
				if (restart) return {
					ok: true,
					activation: "restart"
				};
				return {
					ok: true,
					activation: activationOf({
						hostLive: true,
						clientLive: true,
						hasClientHalf: this.packageHasClientHalf(args.name)
					})
				};
			}
			setUserLayerRows({
				profileDir,
				rows: owned.map(({ id, name }) => ({
					id,
					disabled: !args.enabled,
					...name !== void 0 ? { name } : {}
				}))
			});
			return {
				ok: true,
				activation: activationOf({
					hostLive: true,
					clientLive: true,
					hasClientHalf: this.packageHasClientHalf(args.name)
				})
			};
		}
		/**
		* `setEnabled` for an installed package whose bundle the profile does not
		* select.
		*
		* Switching it off writes the plugin-level rows and nothing else: none of
		* it runs, and the rows keep it off if dsh selects the bundle again.
		* Switching it on selects the bundle through dsh's own `pluginManager`, the
		* writer behind the switch that deselected it, and then clears the
		* plugin-level rows as an ordinary enable does. A harness without that
		* service gets the way back in words instead. `dsh plugin add <name>` is
		* not printed: it selects the bundle again only on 0.1.5, and it lets pnpm
		* float a registry package to `latest`.
		*/
		async setDeselectedEnabled(name, enabled, profileDir, owned, manager) {
			const rows = owned.map(({ id, name: moduleName }) => ({
				id,
				disabled: !enabled,
				...moduleName !== void 0 ? { name: moduleName } : {}
			}));
			if (!enabled) {
				setUserLayerRows({
					profileDir,
					rows
				});
				return {
					ok: true,
					activation: "live"
				};
			}
			if (manager === null) return {
				ok: false,
				detail: `dsh-plugin-shop: ${name} is installed but disabled. It is missing from dsh.profile.bundles in ${join(profileDir, "package.json")}, so restarting alone will not enable it. This version of dsh cannot enable the bundle from the shop. Add "${name}" back to that list and restart dsh, or uninstall it and install it again from the shop.`
			};
			if (this.hasRunningCommand()) return {
				ok: false,
				detail: switchWhileBusyDetail(name)
			};
			let raw;
			try {
				raw = await manager.setBundleEnabled(name, true);
			} catch (error) {
				return {
					ok: false,
					detail: `dsh-plugin-shop: dsh could not enable ${name} again${thrownTail(messageOf(error), isDesktopProfile(this.profile))}`
				};
			}
			const { change, failure } = this.readManagerAnswer(raw, {
				act: `select ${name} again`,
				request: `the selection of ${name}`,
				stays: "off"
			});
			if (failure !== null) return {
				ok: false,
				detail: failure
			};
			setUserLayerRows({
				profileDir,
				rows
			});
			if (change.application === "restart-required") return {
				ok: true,
				activation: "restart"
			};
			return {
				ok: true,
				activation: activationOf({
					hostLive: true,
					clientLive: true,
					hasClientHalf: this.packageHasClientHalf(name)
				})
			};
		}
		/**
		* dsh's answer to a switch or a bundle selection, read the one way both
		* callers need it (R32): the change, scrubbed for a desktop reader, and the
		* detail that fails the request, or null when dsh applied it. `act` is what
		* was asked, as "switch <name>", `request` names the request itself, as
		* "the switch for <name>", and `stays` is the state the plugin keeps when
		* the request does not take effect. An application this shop does not know
		* fails rather than reading as applied: a later harness may answer
		* something new.
		*
		* `overridden` fails too (R39). dsh answers it when, after it wrote the row
		* and reloaded, the live entry still differs from the request
		* (dsh-plugin-manager 0.1.7-rc.2, setPluginEnabled), and its README names
		* what outranks the profile's own patch: home and invocation patches keep
		* their higher priority. The change is saved and the plugin runs as it
		* did, so a success would flip the client's switch over a plugin that did
		* not change, and that switch never re-reads the live state.
		* setBundleEnabled never answers it; a selection reads it the same way.
		*/
		readManagerAnswer(raw, words) {
			const change = isDesktopProfile(this.profile) ? forDesktopReader(readChange(raw)) : readChange(raw);
			if (change.application === "failed" || change.application === "cancelled" || change.errorCode !== null) {
				const code = change.errorCode ?? change.application ?? "failed";
				return {
					change,
					failure: `dsh-plugin-shop: dsh ${code === "operation-error" ? "could not" : "refused to"} ${words.act} (${code})${codeReason(change, code)}`
				};
			}
			if (change.application === "overridden") return {
				change,
				failure: `dsh-plugin-shop: dsh saved ${words.request}, but a home or startup configuration overrides it. The plugin remains ${words.stays}.`
			};
			if (change.application === "applied" || change.application === "restart-required") return {
				change,
				failure: null
			};
			return {
				change,
				failure: `dsh-plugin-shop: could not confirm ${words.request}. dsh returned an unrecognized status: "${change.application ?? "nothing"}".`
			};
		}
		rowConfig() {
			if (this.options.catalogUrl !== void 0 && this.options.cacheDir !== void 0) return {
				catalogUrl: this.options.catalogUrl,
				cacheDir: this.options.cacheDir
			};
			const config = (this.ctx.loader?.entries().find((entry) => entry.options.name === "dsh-plugin-shop"))?.options.config;
			const catalogUrl = config?.catalogUrl;
			const cacheDir = config?.cacheDir;
			if (typeof catalogUrl !== "string" || typeof cacheDir !== "string") throw new Error("dsh-plugin-shop: the shop row is missing catalogUrl or cacheDir config");
			return {
				catalogUrl,
				cacheDir
			};
		}
		/** The user's own registry, read once. The self-update check and catalog
		* race share this preference so neither path repeatedly touches ~/.npmrc. */
		npmRegistry() {
			const cached = this.npmRegistryCache;
			if (cached !== null) return cached.value;
			const value = npmrcRegistry((path) => {
				try {
					return readFileSync(path, "utf8");
				} catch {
					return null;
				}
			}, homedir());
			this.npmRegistryCache = { value };
			return value;
		}
		/** The origins to race for this row's catalog. Read once per gateway: the
		* user's npmrc does not change under a running dsh, and re-reading it on
		* every catalog call would put a filesystem read on the hot path. */
		originsFor(catalogUrl) {
			if (this.originCache?.catalogUrl === catalogUrl) return this.originCache.origins;
			const origins = catalogOrigins(catalogUrl, fetch, this.npmRegistry());
			this.originCache = {
				catalogUrl,
				origins
			};
			return origins;
		}
		/** Join an in-flight load; refresh requests always start a new load. */
		loadCatalogOnce(refresh) {
			const existing = this.inFlightLoad;
			if (!refresh && existing !== null) return existing;
			const { catalogUrl, cacheDir } = this.rowConfig();
			const started = (this.options.loadCatalog ?? loadCatalog)({
				origins: this.originsFor(catalogUrl),
				cacheDir,
				refresh
			}).then((result) => {
				this.lastSnapshot = result.snapshot;
				return result;
			});
			this.inFlightLoad = started;
			const forget = () => {
				if (this.inFlightLoad === started) this.inFlightLoad = null;
			};
			started.then(forget, forget);
			return started;
		}
		/** Return the current snapshot, loading it once when needed. */
		async snapshotNow() {
			if (this.lastSnapshot !== null) return this.lastSnapshot;
			const { snapshot } = await this.loadCatalogOnce(false);
			return snapshot;
		}
		/** The explicit restart override. Only the row's `config:` sub-object is
		* passed to a plugin — a top-level `allowRestart:` beside `name:` would be
		* silently ignored by the loader (dsh-market README, #227). */
		/** Whether the two-phase handoff can run at all here. `restart.ts` drives
		* it through `sh`, `kill -0` and `sleep`, none of which Windows has. */
		restartPlatformSupported() {
			return this.platform !== "win32";
		}
		/** Why a restart would be refused for this process, or null when nothing
		* static does. One ordered list, read by `restart()` before it commits and
		* by `version()` so the client can say the same thing up front.
		*
		* The order is load-bearing for the copy a reader sees. The desktop
		* profile first: dsh itself refuses to launch it, so no platform,
		* supervisor or port could make a restart possible there, and the remedy
		* is the app. Then `from-default-profile` and Windows, both ahead of
		* systemd, because neither has an override and reporting the systemd one
		* there sends the reader to set `allowRestart: true`, which this gate would
		* still refuse. And `from-default-profile` ahead of Windows, because every
		* remedy after `desktop` is "restart dsh manually", which a reader launched
		* with the flag would do with the flag, and on 0.2.1 that recreates the
		* profile: its copy is the one that says "without that flag", and a
		* Windows, systemd or `--port 0` reader needs it as much as any other.
		*
		* - `desktop`: dsh's CLI refuses `--profile desktop` ("managed exclusively
		*   by the Electron application"), so the relaunch would exit at once and
		*   leave nothing on the port; the app restarts it.
		* - `from-default-profile`: from dsh 0.2.1, `--from-default-profile <name>`
		*   replaces an existing custom profile with a fresh copy of the shipped
		*   template on every launch, and the relaunch re-runs this argv verbatim,
		*   so it would delete every plugin in the profile, this shop included.
		*   Measured 2026-10-19 in throwaway homes: 0.2.1-rc.2 booted a relaunched
		*   profile that had held the shop with no dependencies, while 0.2.0-rc.2
		*   refused to boot an existing profile at all, so there the restarted dsh
		*   failed to come back. Both spellings are the flag:
		*   `--from-default-profile <name>` and `--from-default-profile=<name>`. It
		*   is left in the argv rather than stripped: the restarted process would no
		*   longer run the command the reader chose, and their next launch with the
		*   flag recreates the profile anyway. No override (design
		*   2026-10-19-dsh-021-readiness §3).
		* - `windows`: the handoff helper is a POSIX shell one-liner (restart.ts)
		*   and there is no `sh` on Windows. That spawn fails ASYNCHRONOUSLY, so
		*   committing would answer `ok: true`, exit this process, and leave nothing
		*   to take the port — dsh would simply be gone.
		* - `systemd`: under a unit the two-phase handoff kills itself, because the
		*   main process exiting also kills the unit's cgroup and takes the detached
		*   helper with it; the service never comes back. Overridable, and the only
		*   one that is.
		* - `port-zero`: the OS hands the NEW process a fresh port the browser
		*   cannot know, so a restart would strand the client on a dead origin. */
		staticRestartBlock() {
			if (isDesktopProfile(this.profile)) return "desktop";
			if (this.restartArgv.some((arg) => arg === "--from-default-profile" || arg.startsWith("--from-default-profile="))) return "from-default-profile";
			if (!this.restartPlatformSupported()) return "windows";
			if (detectSupervisor(this.env, { ppid: this.ppid }) === "systemd" && !this.allowRestartConfigured()) return "systemd";
			const portIndex = this.restartArgv.indexOf("--port");
			if (portIndex !== -1 && this.restartArgv[portIndex + 1] === "0") return "port-zero";
			return null;
		}
		allowRestartConfigured() {
			if (this.allowRestart !== void 0) return this.allowRestart;
			return ((this.ctx.loader?.entries().find((entry) => entry.options.name === "dsh-plugin-shop"))?.options.config)?.allowRestart === true;
		}
		/** Browse the catalog (§7.3): cached snapshot, refreshed on demand. */
		async catalog(args) {
			const { snapshot, stale } = await this.loadCatalogOnce(args?.refresh ?? false);
			const harness = await this.runningHarness();
			const profileDir = this.profileDirOrNone();
			let incompatible = {};
			if (profileDir !== null) try {
				const resolve = this.options.resolvePeer ?? this.peerResolver(this.profileAnchor(profileDir));
				incompatible = incompatibilityMap(snapshot.entries, resolve);
			} catch {
				incompatible = {};
			}
			let incompatibleHarness;
			try {
				incompatibleHarness = compatibilityMap(snapshot.entries, {
					dshVersion: harness.dshVersion,
					profile: {
						name: this.profile,
						bundles: profileDir === null ? null : this.runningProfileBundles(profileDir)
					}
				}, harness.templates);
			} catch {
				incompatibleHarness = {};
			}
			for (const [key, peers] of Object.entries(this.refusedByHarness(snapshot.entries, harness, profileDir))) incompatibleHarness[key] = {
				...incompatibleHarness[key],
				peers
			};
			return {
				schemaVersion: snapshot.schemaVersion,
				builtAt: snapshot.builtAt,
				stale,
				plugins: snapshot.entries,
				denied: snapshot.denied,
				notAShop: snapshot.notAShop ?? [],
				stars: snapshot.stars,
				icons: snapshot.icons ?? {},
				incompatible,
				incompatibleHarness
			};
		}
		/**
		* The installs the running dsh will refuse on their harness peers
		* (`peerVerdictsOf`), judged against the exemptions this profile holds —
		* read on every call like the other verdicts, because recording one is
		* exactly the event that must clear a card: the reader runs the command
		* the card shows, presses Refresh, and the install is allowed. Empty when
		* the running dsh has no such check (before 0.1.7) or no profile was
		* found, and when either read throws: a refusal nobody could establish is
		* never shown, least of all as a disabled button.
		*/
		refusedByHarness(entries, harness, profileDir) {
			if (harness.peerCheck === null || profileDir === null) return {};
			try {
				return peerVerdictsOf(entries, harness.peerCheck, harness.peerCheck.exemptions(profileDir), this.profile);
			} catch {
				return {};
			}
		}
		/**
		* The bundles the profile at `profileDir` composes, or null when its
		* manifest cannot be read — which is no verdict on the profile half rather
		* than an accusation. `dsh.profile.bundles` is the same list
		* `discoverProfile` uses to recognize a profile directory, read through the
		* harness's own parser so a profile this shop was booted inside is read the
		* way dsh reads it.
		*/
		runningProfileBundles(profileDir) {
			try {
				const bundles = readProfileManifest("dsh-plugin-shop", profileDir).dsh?.profile?.bundles;
				if (!Array.isArray(bundles) || !bundles.every((bundle) => typeof bundle === "string")) return null;
				return bundles;
			} catch {
				return null;
			}
		}
		/**
		* Install one cataloged version into the profile (§7.2). The rejection
		* paths run against this Host's snapshot before anything is spawned; only a
		* passing request reaches the executor.
		*/
		async install(args) {
			const manager = this.pluginManager();
			if (isDesktopProfile(this.profile) && manager === null) return {
				ok: false,
				code: "desktop-profile",
				detail: DESKTOP_PROFILE_DETAIL
			};
			const snapshot = await this.snapshotNow();
			const installedSpec = this.installedSpecOf(args.name);
			const verdict = validateInstall(snapshot, args, installedSpec);
			if (!verdict.ok) return {
				ok: false,
				code: verdict.code,
				detail: verdict.detail
			};
			const entry = verdict.entry;
			let spec;
			if (entry.source === "github" && entry.tarball !== void 0) {
				const integrity = await verifyTarballSha256(this.fetchTarball, entry.tarball.url, entry.tarball.sha256);
				if (integrity !== null) return {
					ok: false,
					code: "tarball-integrity",
					detail: integrity
				};
				spec = entry.tarball.url;
			} else if (entry.source === "github") {
				if (entry.repo === void 0 || !/^[0-9a-f]{40}$/.test(args.version)) return {
					ok: false,
					code: "version-mismatch",
					detail: `dsh-plugin-shop: ${args.name} has no installable commit`
				};
				spec = `github:${entry.repo}#${args.version}${entry.subdir !== void 0 ? `&path:${entry.subdir}` : ""}`;
			} else spec = `${args.name}@${args.version}`;
			const isUpdate = installedSpec !== void 0;
			const alreadyImported = isUpdate || this.imported.has(args.name);
			const previous = isUpdate ? this.installedVersionOf(entry) : void 0;
			const replaced = previous !== void 0 && previous !== entry.version ? previous : void 0;
			const harness = await this.runningHarness();
			if (manager !== null) {
				const updateInPlace = isUpdate && entry.source === "npm" && isDesktopProfile(this.profile) ? manager.updateBundle?.bind(manager) : void 0;
				if (updateInPlace !== void 0) {
					const running = this.startManagerUpdate(updateInPlace, manager, entry.name, entry.version, `update ${spec}`, (raw) => this.updateOutcome(raw, this.outcomeContext(args.name, "update", alreadyImported, this.packageHasClientHalf(args.name))), () => this.postInstallHazard(args.name, harness, " It is on disk: uninstall it from the shop to undo this install."));
					this.track(running);
					this.recordGithubPin(entry);
					this.rememberOnDone(running, entry, args.name, replaced);
					return {
						ok: true,
						installId: running.installId,
						state: running.status().state
					};
				}
				const continues = isUpdate && !isDesktopProfile(this.profile);
				let refusedInPlace = false;
				const running = continueAfter(this.startManagerInstall(manager, spec, `install ${spec}`, (raw) => {
					const change = readChange(raw);
					if (!isUpdate && change.stage === "enable") this.imported.add(args.name);
					if (continues && change.errorCode === "already-installed") refusedInPlace = true;
					return managerOutcome(raw, this.outcomeContext(args.name, isUpdate ? "update" : "install", alreadyImported, this.packageHasClientHalf(args.name)));
				}, () => this.postInstallHazard(args.name, harness, " It is on disk: uninstall it from the shop to undo this install.")), () => refusedInPlace, () => this.startCliInstall(args.name, spec, harness, true), cliFallbackLine(this.profile, spec));
				this.track(running);
				this.recordGithubPin(entry);
				this.rememberOnDone(running, entry, args.name, replaced);
				return {
					ok: true,
					installId: running.installId,
					state: running.status().state
				};
			}
			const running = this.startCliInstall(args.name, spec, harness, alreadyImported);
			this.recordGithubPin(entry);
			this.track(running);
			this.rememberOnDone(running, entry, args.name, replaced);
			return {
				ok: true,
				installId: running.installId,
				state: running.status().state
			};
		}
		/**
		* One install of `name` through dsh's CLI, `dsh plugin --profile <p> add
		* <spec>` (§7.2): the path every install takes when dsh offers no plugin
		* manager, and the one that continues an update the manager refuses in
		* place (design 2026-10-19-dsh-021-readiness §2). `alreadyImported` is
		* whether this process may already hold the package's module, which rules
		* out a hot mount. The caller tracks the record and records any pin, once.
		*/
		startCliInstall(name, spec, harness, alreadyImported) {
			return startInstall({
				profile: this.profile,
				spec,
				dshBin: this.dshBin,
				expectedName: name,
				prefetcher: this.prefetcher,
				alsoConfirm: () => this.postInstallHazard(name, harness, ` It is on disk: run \`dsh plugin --profile ${this.profile} remove ${name}\` to undo this install.`),
				afterDone: async () => {
					if (alreadyImported) return {
						activation: "restart",
						restartReason: "already-loaded"
					};
					const hot = this.hot ?? {
						mount: hotMount,
						unmount: hotUnmount
					};
					this.imported.add(name);
					const result = await hot.mount({ plugin: (plugin, config) => this.home.plugin(plugin, config) }, this.profileDirResolved(), name);
					if (!result.ok) return {
						activation: "restart",
						...result.reason !== null ? { restartReason: result.reason } : {}
					};
					return { activation: activationOf({
						hostLive: true,
						clientLive: true,
						hasClientHalf: this.packageHasClientHalf(name)
					}) };
				}
			});
		}
		/**
		* What would stop the profile from starting now that `name`'s files are on
		* disk, or null: an entry id another installed package already declares,
		* or a bundle patch declaration this dsh cannot read. Neither is knowable
		* before the files land. The package stays on disk either way, so each
		* detail ends with `undo`, the sentence that says how to take the install
		* back on the path that made it.
		*/
		postInstallHazard(name, harness, undo) {
			const clash = collidingEntryId({
				profileDir: this.profileDirResolved(),
				packageName: name,
				dependencies: Object.keys(this.profileDependenciesOrNone() ?? {})
			});
			if (clash !== null) return `dsh-plugin-shop: ${name} and ${clash.holder} use the same plugin entry ID, "${clash.id}". dsh cannot start this profile while both plugins are installed.` + undo;
			switch (patchDeclarationHazard(declaredBundlePatch({
				profileDir: this.profileDirResolved(),
				packageName: name
			}), harness.patchLists)) {
				case null: return null;
				case "list-unsupported": return `dsh-plugin-shop: ${name} uses multiple configuration files, which require dsh 0.1.7 or later. Your dsh${harness.dshVersion === null ? "" : ` (${harness.dshVersion})`} only supports one file and cannot start with this plugin installed.` + undo;
				case "malformed": return `dsh-plugin-shop: ${name} has an invalid bundle patch declaration; it must be a file path or a list of paths. dsh cannot start this profile with the plugin installed.` + undo;
			}
		}
		/** Remember a github entry's pinned commit: the manifest records only
		* `github:owner/slug`, so the pins file is how `installed()` reports
		* outdated honestly. A failed install leaves a pin behind, but the
		* manifest presence gate keeps it invisible. */
		recordGithubPin(entry) {
			if (entry.source !== "github") return;
			const pins = readRepoPins(this.pinFs, this.pinsPath());
			writeRepoPins(this.pinFs, this.pinsPath(), {
				...pins,
				[identityKey(entry)]: entry.version
			});
		}
		/** Forget an uninstalled package's pins: its own, and its identity pin when
		* a catalog row matched the installed spec. Both uninstall paths call this
		* once their operation has started, so a stale pin never outlives the
		* uninstall in the shop's cache either way. The plugin manager path tracks
		* its record first, so a write here that throws cannot hide an operation
		* already queued. */
		forgetPins(name, installedEntry) {
			const pins = readRepoPins(this.pinFs, this.pinsPath());
			const stalePins = [name, ...installedEntry === void 0 ? [] : [identityKey(installedEntry)]];
			let forgot = false;
			for (const key of stalePins) {
				if (pins[key] === void 0) continue;
				delete pins[key];
				forgot = true;
			}
			if (forgot) writeRepoPins(this.pinFs, this.pinsPath(), pins);
		}
		/** What `managerOutcome` reads dsh's answer against. The gateway's own
		* facts are set here once, for every operation through the service: the
		* profile, whether it is the desktop one, and the deadline a timeout
		* detail names. */
		outcomeContext(name, operation, alreadyImported, hasClientHalf) {
			return {
				profile: this.profile,
				name,
				operation,
				alreadyImported,
				hasClientHalf,
				reconcilesRunningPlugins: this.reconcilesRunningPlugins(),
				desktop: isDesktopProfile(this.profile),
				timeoutMs: INSTALL_TIMEOUT_MS
			};
		}
		/**
		* One install-shaped operation through dsh's `pluginManager` (design
		* 2026-09-26-plugin-manager-delegation, section 6): `installBundle(spec)`
		* under the record's own id as its request id, so the output dsh streams
		* for it reaches this record, in the profile's queue with the download
		* phase the CLI path has. At the shop's deadline dsh is asked to cancel it;
		* a service that offers no `cancelInstall` gets no deadline, and its record
		* settles when dsh answers. `install` and `updateStart` differ only in the
		* mechanism line and in how they read the answer.
		*/
		startManagerInstall(manager, spec, mechanism, outcome, alsoConfirm) {
			gateOperand(spec);
			const command = retryCommand(this.platform, this.profile, "add", spec);
			const cancel = manager.cancelInstall?.bind(manager);
			return startManagerOperation({
				profile: this.profile,
				requestId: randomUUID(),
				mechanism,
				logs: this.managerLogs,
				run: (requestId) => manager.installBundle(spec, { requestId }),
				...cancel !== void 0 ? { cancel } : {},
				outcome,
				...alsoConfirm !== void 0 ? { alsoConfirm } : {},
				prefetcher: this.prefetcher,
				spec,
				desktop: isDesktopProfile(this.profile),
				...command !== void 0 ? { command } : {}
			});
		}
		/**
		* One update through dsh's `updateBundle` (0.2.2 on): the operation dsh's
		* own Plugins page runs, remove → install → restore. The desktop profile
		* needs it because dsh's CLI cannot manage that profile, so the CLI
		* continuation an update takes everywhere else is unavailable there; with
		* neither, every desktop update ended on dsh's `already-installed`
		* refusal (measured 2026-11-06, design 2026-11-06-desktop-updates).
		*
		* `spec` is the same `name@version` the install path builds, and only
		* warms the download phase and spells the mechanism line; the service is
		* handed the name and version `updateBundle` takes.
		*/
		startManagerUpdate(updateBundle, manager, name, version, mechanism, outcome, alsoConfirm) {
			const spec = `${name}@${version}`;
			gateOperand(spec);
			const cancel = manager.cancelInstall?.bind(manager);
			return startManagerOperation({
				profile: this.profile,
				requestId: randomUUID(),
				mechanism,
				logs: this.managerLogs,
				run: (requestId) => updateBundle(name, version, { requestId }),
				...cancel !== void 0 ? { cancel } : {},
				outcome,
				...alsoConfirm !== void 0 ? { alsoConfirm } : {},
				prefetcher: this.prefetcher,
				spec,
				desktop: isDesktopProfile(this.profile)
			});
		}
		/**
		* What one `updateBundle` answer means to the reader: the nested change is
		* fed to `managerOutcome` exactly as an `installBundle` answer is, and
		* dsh's own restore attempt is named when the install failed after a
		* removal. Saying nothing about it would leave a reader on the failure
		* detail alone, unable to tell whether the old version is still there —
		* dsh reinstalls it, and the answer records whether that worked.
		*/
		updateOutcome(raw, context) {
			const update = readUpdate(raw);
			const outcome = managerOutcome(update.result ?? raw, context);
			if (outcome.state !== "failed" || update.restore === null) return outcome;
			const restore = readChange(update.restore);
			const sentence = restore.application !== "failed" && restore.application !== "cancelled" ? `The previously installed version${update.from === null ? "" : ` (${update.from})`} was restored.` : "Restoring the previously installed version also failed.";
			if (outcome.detail === void 0) return {
				...outcome,
				detail: `dsh-plugin-shop: ${sentence}`
			};
			const needsPeriod = !/[.!?]$/.test(outcome.detail);
			return {
				...outcome,
				detail: `${outcome.detail}${needsPeriod ? "." : ""} ${sentence}`
			};
		}
		/** Keep a started record where `installStatus`, the restart gate and
		* eviction find it, then bound the finished ones. */
		track(running) {
			this.installs.set(running.installId, running);
			this.installOrder.push(running.installId);
			this.evictFinishedInstalls();
		}
		/** Bound retained finished records at MAX_FINISHED_INSTALLS, evicting the
		* oldest finished ones (insertion order, oldest first). Live records —
		* running AND queued — are never evicted; an id absent from the map reports
		* `found: false`. */
		evictFinishedInstalls() {
			const finishedIds = [];
			for (const id of this.installOrder) {
				const record = this.installs.get(id);
				if (record !== void 0 && isTerminalInstallState(record.status().state)) finishedIds.push(id);
			}
			const excess = Math.max(0, finishedIds.length - ShopGateway.MAX_FINISHED_INSTALLS);
			for (const id of finishedIds.slice(0, excess)) this.installs.delete(id);
		}
		/**
		* Write the rollback record once `running` reports done.
		*
		* The version was captured before the spawn by the caller; this only
		* decides WHEN it lands. A failed update therefore leaves the previous
		* record alone — it used to replace it with the version still installed,
		* silently losing the older rollback point (design
		* 2026-11-02-market-borrowings §6.1 says "after the flow reports success").
		*
		* Every failure here is swallowed. A rollback point is a convenience; an
		* install that would succeed must not fail because the profile directory
		* could not take a bookmark.
		*/
		rememberOnDone(running, entry, name, version) {
			if (version === void 0) return;
			running.finished.then((status) => {
				if (status.state !== "done") return;
				try {
					const state = readShopState(this.stateFs, this.profileDirResolved());
					state.previous[identityKey(entry)] = {
						source: entry.source,
						name,
						...entry.repo !== void 0 ? { repo: entry.repo } : {},
						...entry.subdir !== void 0 ? { subdir: entry.subdir } : {},
						version
					};
					writeShopState(this.stateFs, this.profileDirResolved(), state);
				} catch {}
			}).catch(() => {});
		}
		/**
		* The version of `entry` currently on disk, or undefined when it cannot be
		* read.
		*
		* npm reads the installed package's own manifest rather than the profile's
		* dependency spec: a profile may hold a RANGE (`^1.2.3`), and recording
		* that as "the previous version" would roll a reader forward to whatever
		* the registry serves on the day they click. github reads the pin the shop
		* wrote at install time, which is the commit that actually runs.
		*/
		installedVersionOf(entry) {
			if (entry.source === "github") try {
				const pins = readRepoPins(this.pinFs, this.pinsPath());
				return pins[identityKey(entry)] ?? pins[entry.name];
			} catch {
				return;
			}
			try {
				const manifest = JSON.parse(this.pinFs.read(join(this.profileDirResolved(), "node_modules", entry.name, "package.json")));
				return typeof manifest.version === "string" && manifest.version.trim() !== "" ? manifest.version : void 0;
			} catch {
				return;
			}
		}
		/** Whether any command this gateway started is still running — or still
		* waiting its turn. */
		hasRunningCommand() {
			for (const record of this.installs.values()) if (!isTerminalInstallState(record.status().state)) return true;
			return false;
		}
		/** Poll one install's progress (§7.2); unknown ids report `found: false`. */
		installStatus(args) {
			const running = this.installs.get(args.installId);
			if (running === void 0) return {
				found: false,
				state: "failed",
				log: [],
				detail: `The installation record (${args.installId}) is no longer available. Refresh the shop to check whether the plugin was installed.`
			};
			return {
				found: true,
				...running.status()
			};
		}
		/**
		* The profile manifest's dependency spec for every name it holds — exactly
		* what the install gate reads, unfiltered.
		*
		* The client cannot derive this from `installed()`. That list drops any
		* dependency no catalog entry matches, so a fork, a hand `dsh plugin add`,
		* or an entry the catalog has since dropped is invisible to it — while the
		* gate, which reads the raw manifest, still refuses over it. That gap is
		* what made the card show a plain Install button for a name the host was
		* about to refuse. Shipping the gate's own input is what makes the badge
		* and the refusal one rule rather than two implementations that agree
		* until they do not.
		*
		* `null` is "cannot say" — an unreadable manifest — and is deliberately
		* distinct from `{}`, "nothing is installed": the client must not read a
		* failed read as a clean bill of health.
		*/
		async installedSpecs() {
			return this.profileDependenciesOrNone() ?? null;
		}
		/**
		* What the shop remembers between visits: the reader's favorites and, per
		* install identity, the version an update replaced (design
		* 2026-11-02-market-borrowings §6–§7).
		*
		* `rollback` carries a VERSION rather than a spec: the client renders it as
		* the offer ("roll back to 1.2.3"), and the spec that installs it is built
		* by the host from the same record. A malformed or missing file reads as
		* empty state — losing stars must never take the page down.
		*/
		async shopState() {
			let state;
			try {
				state = readShopState(this.stateFs, this.profileDirResolved());
			} catch {
				return {
					favorites: [],
					rollback: {}
				};
			}
			const rollback = {};
			for (const [key, record] of isDesktopProfile(this.profile) ? [] : Object.entries(state.previous)) if (rollbackSpec(record) !== void 0) rollback[key] = record.version;
			return {
				favorites: state.favorites,
				rollback
			};
		}
		/**
		* Star or unstar one install identity (§7).
		*
		* A write failure is reported rather than swallowed: the client flips its
		* star optimistically and would otherwise show a favorite that is gone on
		* the next visit. The key is stored verbatim — it is the identity the
		* catalog itself uses, and an unknown one is harmless until it matches.
		*/
		async setFavorite(args) {
			if (!isStorableKey(args.key)) return {
				ok: false,
				detail: "dsh-plugin-shop: that plugin cannot be starred in this profile."
			};
			let state;
			try {
				state = readShopState(this.stateFs, this.profileDirResolved());
			} catch {
				return {
					ok: false,
					detail: "dsh-plugin-shop: the favorites file could not be read, so nothing was saved."
				};
			}
			const has = state.favorites.includes(args.key);
			if (args.favorite && !has && state.favorites.length >= 5e3) return {
				ok: false,
				detail: "dsh-plugin-shop: this profile holds the maximum number of favorites."
			};
			if (args.favorite && !has) state.favorites.push(args.key);
			if (!args.favorite && has) state.favorites = state.favorites.filter((key) => key !== args.key);
			try {
				writeShopState(this.stateFs, this.profileDirResolved(), state);
				return { ok: true };
			} catch (error) {
				return {
					ok: false,
					detail: `The favorite could not be saved: ${error.message}`
				};
			}
		}
		/**
		* Re-install the version an entry was updated from (§6).
		*
		* Takes only the install identity. The spec is built by `rollbackSpec` from
		* this host's own record, so a client cannot name a version or a spec the
		* shop never wrote — the same invariant `installStart` holds by building
		* its spec from the snapshot. The install then runs through the ordinary
		* CLI path, with the same records, activation verdict and notices an
		* update gets.
		*/
		async rollbackStart(args) {
			if (isDesktopProfile(this.profile)) return {
				ok: false,
				code: "desktop-profile",
				detail: DESKTOP_PROFILE_DETAIL
			};
			let record;
			try {
				const state = readShopState(this.stateFs, this.profileDirResolved());
				record = Object.hasOwn(state.previous, args.key) ? state.previous[args.key] : void 0;
			} catch {
				return {
					ok: false,
					code: "not-in-catalog",
					detail: "dsh-plugin-shop: the profile's rollback records could not be read, so there is nothing to roll back to."
				};
			}
			if (record === void 0) return {
				ok: false,
				code: "not-in-catalog",
				detail: "dsh-plugin-shop: there is no earlier version recorded for this plugin."
			};
			const spec = rollbackSpec(record);
			if (spec === void 0) return {
				ok: false,
				code: "version-mismatch",
				detail: `dsh-plugin-shop: the recorded earlier version of ${record.name} cannot be installed.`
			};
			const current = (await this.snapshotNow()).entries.find((entry) => identityKey(entry) === args.key);
			if (current === void 0) return {
				ok: false,
				code: "not-in-catalog",
				detail: `dsh-plugin-shop: ${record.name} is no longer listed, so its earlier version cannot be restored.`
			};
			const holder = this.installedSpecOf(record.name);
			if (holder !== void 0 && !installedSpecMatches(current, holder)) return {
				ok: false,
				code: "name-taken",
				detail: `dsh-plugin-shop: ${record.name} is now installed from a different source, so rolling back would replace it.`
			};
			const harness = await this.runningHarness();
			const running = this.startCliInstall(record.name, spec, harness, true);
			this.track(running);
			running.finished.then((status) => {
				if (status.state !== "done") return;
				try {
					if (record.source === "github" && record.repo !== void 0) {
						const pins = readRepoPins(this.pinFs, this.pinsPath());
						const key = identityKey({
							source: "github",
							name: record.name,
							repo: record.repo,
							subdir: record.subdir
						});
						writeRepoPins(this.pinFs, this.pinsPath(), {
							...pins,
							[key]: record.version
						});
					}
					const state = readShopState(this.stateFs, this.profileDirResolved());
					if (Object.hasOwn(state.previous, args.key)) {
						delete state.previous[args.key];
						writeShopState(this.stateFs, this.profileDirResolved(), state);
					}
				} catch {}
			}).catch(() => {});
			return {
				ok: true,
				installId: running.installId,
				state: running.status().state
			};
		}
		/** Installed catalog plugins (§7.3): every entry of the snapshot the profile
		* manifest declares as a dependency, with the Host's `outdated` verdict
		* attached. The tab's shelf cards and its Updatable section both derive
		* from this one list. */
		async installed() {
			const snapshot = await this.snapshotNow();
			const dependencies = readProfileManifest("dsh-plugin-shop", this.profileDirResolved()).dependencies ?? {};
			const pins = readRepoPins(this.pinFs, this.pinsPath());
			const live = /* @__PURE__ */ new Map();
			let haveInventory = false;
			try {
				for (const entry of await this.listInventory()) live.set(entry.entryId, entry.enabled);
				haveInventory = true;
			} catch {}
			const selected = this.runningProfileBundles(this.profileDirResolved());
			/** A package is enabled when the profile selects its bundle and every
			* entry it owns and that is live is enabled. Keyed by entry id, never by
			* module name: the entry a package inserts may mount a different
			* package's module (see ownedEntryIds). */
			const enabledOf = (name) => {
				if (selected !== null && !selected.includes(name)) return false;
				if (!haveInventory) return true;
				let owned;
				try {
					owned = ownedEntryIds({
						profileDir: this.profileDirResolved(),
						packageName: name
					});
				} catch {
					return true;
				}
				const ownedSet = new Set(owned);
				const present = [...live].filter(([entryId]) => ownsEntryId(ownedSet, entryId));
				return present.length === 0 || present.every(([, enabled]) => enabled);
			};
			const installed = [];
			const claimed = /* @__PURE__ */ new Set();
			for (const entry of snapshot.entries) {
				const spec = ownDependencySpec(dependencies, entry.name);
				if (spec === void 0) continue;
				if (!installedSpecMatches(entry, spec)) continue;
				claimed.add(entry.name);
				const identity = {
					source: entry.source,
					repo: entry.repo,
					subdir: entry.subdir
				};
				if (entry.source === "github") {
					const pin = pins[identityKey(entry)] ?? pins[entry.name];
					installed.push({
						name: entry.name,
						...identity,
						installed: pin ?? spec,
						latest: entry.version,
						outdated: pin !== void 0 && pin !== entry.version,
						enabled: enabledOf(entry.name)
					});
				} else installed.push({
					name: entry.name,
					...identity,
					installed: spec,
					latest: entry.version,
					outdated: this.isBehind(spec, entry.version),
					enabled: enabledOf(entry.name)
				});
			}
			for (const name of Object.keys(dependencies)) {
				if (claimed.has(name)) continue;
				const spec = ownDependencySpec(dependencies, name);
				if (spec === void 0) continue;
				const origin = parseSpec(spec);
				if (origin?.kind !== "github") continue;
				const pinPrefix = `github:${origin.repo}#`;
				const pinKey = pins[pinPrefix] !== void 0 ? pinPrefix : Object.keys(pins).find((key) => key.startsWith(pinPrefix));
				installed.push({
					name,
					source: "github",
					repo: origin.repo,
					installed: (pinKey === void 0 ? void 0 : pins[pinKey]) ?? pins[name] ?? spec,
					latest: null,
					outdated: false,
					enabled: enabledOf(name),
					shadowed: true
				});
			}
			return installed;
		}
		/** Whether an installed dependency spec sits behind the catalog's version.
		* A spec identical to the catalog version is current by definition; a
		* pnpm-written non-semver spec like `workspace:*` is not reportable and
		* reads as current rather than killing the RPC. */
		isBehind(spec, latest) {
			if (spec === latest) return false;
			let floor;
			try {
				floor = minVersion(spec)?.version ?? null;
			} catch {
				floor = null;
			}
			return floor !== null && lt(floor, latest);
		}
		/** Uninstall one installed catalog plugin from the profile (§7.3 follow-up
		* amendment). Removing revokes privilege rather than granting it, so there
		* is no acknowledgement gate. The name must be a catalog entry the profile
		* manifest declares as a dependency — the RPC cannot remove profile
		* dependencies the shop does not manage (the base bundle, the shop
		* itself). The same install records/polling serve the client. */
		async uninstall(args) {
			const manager = this.pluginManager();
			if (isDesktopProfile(this.profile) && manager === null) return {
				ok: false,
				detail: DESKTOP_PROFILE_DETAIL
			};
			const named = (await this.snapshotNow()).entries.filter((entry) => entry.name === args.name);
			const spec = ownDependencySpec(readProfileManifest("dsh-plugin-shop", this.profileDirResolved()).dependencies ?? {}, args.name);
			if (named.length === 0) {
				if (spec === void 0) return {
					ok: false,
					detail: `dsh-plugin-shop: ${args.name} is not in the catalog`
				};
				if (parseSpec(spec)?.kind !== "github") return {
					ok: false,
					detail: `dsh-plugin-shop: ${args.name} is not in the catalog`
				};
			}
			if (spec === void 0) return {
				ok: false,
				detail: `dsh-plugin-shop: ${args.name} is not installed`
			};
			const installedEntry = named.find((entry) => installedSpecMatches(entry, spec));
			const priorEntryIds = this.ownedEntryIdsOrNone(args.name);
			const hadClientHalf = this.packageHasClientHalf(args.name);
			if (manager !== null) {
				const running = startManagerOperation({
					profile: this.profile,
					requestId: randomUUID(),
					mechanism: `remove ${args.name}`,
					logs: this.managerLogs,
					run: () => manager.removeBundle(args.name),
					outcome: (raw) => managerOutcome(raw, this.outcomeContext(args.name, "uninstall", false, hadClientHalf)),
					desktop: isDesktopProfile(this.profile)
				});
				this.track(running);
				this.forgetPins(args.name, installedEntry);
				return {
					ok: true,
					installId: running.installId
				};
			}
			const running = startUninstall({
				profile: this.profile,
				name: args.name,
				dshBin: this.dshBin,
				expectedName: args.name,
				afterDone: async () => {
					return { activation: activationOf({
						hostLive: await (this.hot ?? {
							mount: hotMount,
							unmount: hotUnmount
						}).unmount(args.name) || await this.liveEntriesDown(priorEntryIds),
						clientLive: true,
						hasClientHalf: hadClientHalf
					}) };
				}
			});
			this.forgetPins(args.name, installedEntry);
			this.track(running);
			return {
				ok: true,
				installId: running.installId
			};
		}
		/** Restart the dsh process the shop runs in (§8 amendment, 2026-08-27):
		* commit a two-phase handoff — a detached helper waits for this pid to
		* exit, then re-runs this process's own command line — and exit once the
		* response is out. The browser monitors the origin and refreshes when the
		* new server answers. Refusals are issued before anything is torn down. */
		async restart() {
			if (this.committedRestart !== null) return this.committedRestart;
			if (this.hasRunningCommand()) return {
				ok: false,
				detail: "dsh-plugin-shop: an install is still running in this profile. Wait for it to finish before restarting so the configuration can be saved completely."
			};
			const blocked = this.staticRestartBlock();
			if (blocked !== null) return {
				ok: false,
				detail: RESTART_BLOCKED_DETAIL[blocked]
			};
			let logFile;
			try {
				const { cacheDir } = this.rowConfig();
				const { command, args } = restartCommand({
					dshBin: this.dshBin,
					argv: this.restartArgv,
					execPath: process.execPath,
					execArgv: process.execArgv,
					script: this.restartScript
				});
				logFile = join(cacheDir, "restart.log");
				startRestart({
					command,
					args,
					parentPid: this.restartParentPid,
					logFile,
					env: process.env
				});
			} catch (error) {
				return {
					ok: false,
					detail: `dsh-plugin-shop: could not start the restart process: ${error.message}`
				};
			}
			this.committedRestart = {
				ok: true,
				logFile,
				bootId,
				pid: this.restartParentPid
			};
			setTimeout(() => this.exit(0), this.restartExitDelayMs);
			return this.committedRestart;
		}
		/** The shop's own version and whether npm has a newer one (§7.3). The
		* check is advisory: a registry that cannot answer leaves `latest` null
		* and the client shows the version alone. `installed` is the RUNNING
		* version (own-version.ts), not the manifest's range spec. */
		async version() {
			const installed = this.options.runningVersion ?? runningVersion();
			const latest = await this.latestVersion();
			return {
				installed,
				latest,
				outdated: latest !== null && lt(installed, latest),
				restartBlocked: this.staticRestartBlock(),
				pendingVersion: this.pendingVersion(installed),
				bootId,
				selfUpdate: isDesktopProfile(this.profile) ? "dsh-page" : null
			};
		}
		/**
		* The version of the shop the profile has installed, when it is not the
		* one this process runs; null when they match or the copy cannot be read.
		*
		* Read from the profile's own copy — the directory `dsh plugin add` writes
		* and the next boot loads — rather than from the file beside this module.
		* For the hoisted install those are one directory, but a `link:` install
		* runs from its link target, which an update replaces in the profile and
		* never touches at the target, so reading beside the module would never see
		* the update land.
		*
		* Unreadable is null, never a throw: the version check is advisory, and a
		* missing field would tell the client this host predates it.
		*/
		pendingVersion(running) {
			try {
				const manifest = JSON.parse(readFileSync(join(this.profileDirResolved(), "node_modules", "dsh-plugin-shop", "package.json"), "utf8"));
				return typeof manifest.version === "string" && manifest.version !== running ? manifest.version : null;
			} catch {
				return null;
			}
		}
		/** Update the shop itself to a published version (§7.3): the explicit pin
		* is the only install form that bypasses pnpm's release cooldown. The
		* version is re-validated as plain semver at the boundary — the spec
		* `dsh-plugin-shop@<version>` is built here, never from the wire. */
		async updateStart(args) {
			const manager = this.pluginManager();
			if (isDesktopProfile(this.profile) && manager === null) return {
				ok: false,
				detail: DESKTOP_PROFILE_DETAIL
			};
			if (valid(args.version) === null) return {
				ok: false,
				detail: `dsh-plugin-shop: ${args.version} is not a valid version`
			};
			if (isDesktopProfile(this.profile)) return {
				ok: false,
				code: "desktop-manual",
				detail: DESKTOP_SELF_UPDATE_DETAIL
			};
			const spec = `dsh-plugin-shop@${args.version}`;
			if (manager !== null) {
				let refusedInPlace = false;
				const running = continueAfter(this.startManagerInstall(manager, spec, `update ${spec}`, (raw) => {
					if (readChange(raw).errorCode === "already-installed") refusedInPlace = true;
					return managerOutcome(raw, this.outcomeContext("dsh-plugin-shop", "update", true, true));
				}), () => refusedInPlace, () => this.startCliSelfUpdate(spec), cliFallbackLine(this.profile, spec));
				this.track(running);
				return {
					ok: true,
					installId: running.installId,
					state: running.status().state
				};
			}
			const running = this.startCliSelfUpdate(spec);
			this.track(running);
			return {
				ok: true,
				installId: running.installId,
				state: running.status().state
			};
		}
		/** The shop's own update through dsh's CLI: the path when dsh offers no
		* plugin manager, and the one that continues a self-update the manager
		* refuses in place (design 2026-10-19-dsh-021-readiness §2). It passes no
		* `afterDone`, so it reports a restart: a host half cannot swap itself live
		* (§8). The caller tracks the record. */
		startCliSelfUpdate(spec) {
			return startInstall({
				profile: this.profile,
				spec,
				dshBin: this.dshBin,
				expectedName: "dsh-plugin-shop",
				prefetcher: this.prefetcher
			});
		}
	};
})();
//#endregion
export { ShopGateway, ShopGateway as default };
