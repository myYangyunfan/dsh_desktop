/**
 * Lazy chunk loader for the client bundle. The heavy preview libraries
 * (CodeMirror's editor stack, mermaid — several MB) live in separate
 * build-time bundles (`lib/client-<name>.js`) fetched only on first use of
 * the feature that needs them, so startup downloads/parses only the ~1MB
 * core bundle. (The office stack — Univer / docx-preview /
 * pptx-renderer — is no longer bundled here: Office previews moved to the
 * recommended office plugin, see plugins-viewers.ts.)
 *
 * How a chunk script works (see tsdown.config.ts chunkBundle):
 *
 *   globalThis.__dshChunks__ = globalThis.__dshChunks__ || {};
 *   globalThis.__dshChunks__["editor"] = (require) => { ...exports };
 *
 * The script registers its factory on a plugin-owned global registry (NOT
 * through window.__ModuleLoader__.load — the module loader's import() only
 * resolves seed words, shell-own modules, registered factories, and boot
 * graph rows; a chunk id is none of those, so resolution would be version-
 * dependent). Materialization is plugin-owned:
 *
 * 1. inject <script src="/sidebar/bundle/<name>.js"> (classic same-origin
 *    script; the official /plugins/<id>/client.js route cannot serve
 *    arbitrary file names, so the plugin's own host route serves the chunks),
 * 2. read the factory from the global registry,
 * 3. call it with a require that resolves the platform externals through
 *    the injected module system's `import(spec)` (the `ctx.modules` service)
 *    — the seed-word branch, the one part of the module system that is
 *    stable across versions.
 *
 * Caching contract (three layers, each with a failure path):
 * - In-memory: one in-flight promise per chunk, memoized until
 *   {@link resetChunks}; a failed load removes its entry so the next call
 *   retries from scratch. HMR re-activation keeps the resolved exports of
 *   unchanged chunks (ETag revalidation via
 *   {@link revalidateChunksOnReactivate}) — the next lazy open skips the
 *   re-inject / re-execute.
 * - Script execution: each re-execution overwrites the global registry slot
 *   (assignment, never registration) — no "duplicate factory registration"
 *   class of errors; a failed materialization clears the cache so the retry
 *   re-injects and re-executes.
 * - HTTP: the bundle route revalidates every request (`cache-control:
 *   no-cache` + ETag, 304 when unchanged), so page refreshes and HMR
 *   re-activations never re-download a multi-MB chunk that did not change.
 *
 * HMR: each plugin activation calls {@link revalidateChunksOnReactivate},
 * which HEADs every loaded chunk against the bundle route and keeps the
 * in-memory cache for the ones whose ETag is unchanged (a hot-reloaded core
 * bundle therefore does not re-execute multi-MB chunk scripts). Chunk-only
 * source edits still need a manual page refresh (the HMR poll watches only
 * client.js); an edit that does land while a core HMR happens is caught by
 * the ETag comparison on the next activation.
 */
export type ChunkName = 'editor' | 'mermaid' | 'locale';
/** The module exports a chunk factory provides (namespace-ish record). */
export type ChunkExports = Record<string, unknown>;
/**
 * The platform externals a chunk bundle may require (mirror of
 * CLIENT_EXTERNALS in tsdown.config.ts — the chunk builds keep these
 * external and the loader resolves them here). A superset is safe: the
 * require only answers what the chunk actually asks for. The shell's static
 * module table seeds React, Cordis, and the UI libraries (primitives/slots).
 * `@deepseek-ai/dsh-client-runtime` was removed upstream in DSH 0.1.2-alpha
 * (its seed row became bare-name `@deepseek-ai/dsh-client-store`) and no
 * chunk ever required it, so its row is gone; so are dsh-client-web-react /
 * dsh-client-schema-form, dropped back in DSH 0.1.0-rc.8.
 */
export declare const CHUNK_EXTERNALS: readonly string[];
/**
 * The client module system surface this loader needs to resolve externals.
 * DSH 0.1.0-rc.8 provides it as the `ctx.modules` service (no page global
 * anymore); the plugin injects it at activation via
 * {@link setChunkModuleSystem}.
 */
export interface ChunkModuleSystem {
    import(specifier: string): Promise<unknown>;
}
/**
 * Inject the client module system the chunk externals resolve through.
 * Called by the client half's apply() with `ctx.modules` (rc.8+); pass
 * undefined to clear (tests). Survives {@link resetChunks} — the module
 * system is shell state, not chunk state, and stays live across HMR.
 */
export declare function setChunkModuleSystem(system: ChunkModuleSystem | undefined): void;
/** Script-load hook; tests replace it with a stub (the default needs a real DOM + network). */
export type ChunkScriptLoader = (src: string) => Promise<void>;
/** Test hook: replace the chunk-script loader (pass null to restore the default). */
export declare function setChunkScriptLoaderForTests(loader: ChunkScriptLoader | null): void;
export declare function registerChunkForTests(name: ChunkName, loader: () => Promise<ChunkExports>): void;
/**
 * Load (once) and materialize a lazy chunk, returning its module exports.
 * Concurrent callers share one in-flight load; a failure clears the cache
 * entry so the next call retries (the script re-executes and overwrites its
 * global registry slot — assignments are idempotent).
 * @param name - the chunk to load.
 */
export declare function loadChunk(name: ChunkName): Promise<ChunkExports>;
/**
 * Drop all chunk state for a fresh plugin activation (HMR-safe): clear the
 * in-memory cache and any test-registry entries, so the next lazy open
 * re-fetches and re-executes the current chunk scripts (the registry slots
 * are overwritten by the re-execution — no cleanup needed). A pending
 * revalidation barrier is cleared too: it was only guarding the cache reads
 * of the state being dropped, so the next load must not wait on it (the
 * orphaned task still settles and its identity-guarded `finally` no-ops).
 */
export declare function resetChunks(): void;
/**
 * HMR-safe re-activation hook (index.tsx calls this instead of a full
 * reset): keep the resolved exports of every loaded chunk and drop only the
 * ones whose script changed on disk — the bundle route revalidates every
 * request (cache-control: no-cache + ETag), so an unchanged chunk keeps its
 * memory cache and the next lazy open skips the re-inject / re-execute.
 * Fail-open: an unreachable, ETag-less, or timed-out chunk is dropped
 * (re-fetch on next open). Test-registry entries are always cleared
 * (per-test fixtures).
 * A page refresh remains the authoritative reset (the HMR poll watches only
 * client.js; chunk-only edits surface here on the next core re-activation).
 *
 * The returned promise is also a BARRIER for {@link loadChunk}: while a
 * revalidation is pending, every chunk load awaits it before serving cache,
 * so a lazy tab opening mid-revalidation can never render stale exports
 * that the sweep is about to invalidate (CR #232 P1).
 */
export declare function revalidateChunksOnReactivate(): Promise<void>;
