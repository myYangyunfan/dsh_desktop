import { type ZipEntry } from './zip.ts';
/** Maximum archive-name length (keeps the Content-Disposition header sane). */
export declare const ARCHIVE_NAME_MAX = 120;
/**
 * Sanitize the archive's download name: one flat file name, never a path.
 * Separators, control characters, quotes and leading dots are stripped (a
 * name cannot look like a traversal or hide as a dotfile); an empty result
 * falls back to `archive.zip`, and a `.zip` suffix is applied once.
 */
export declare function archiveNameOf(raw: string | null): string;
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
export declare function contentDispositionOf(name: string): string;
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
export declare function disambiguateArchiveNames(selections: readonly string[]): string[];
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
export declare function collectZipEntries(absolute: string, name: string, out: ZipEntry[], maxEntries?: number): Promise<void>;
/** How many archives one host may build at the same time. */
export declare const ARCHIVE_MAX_BUILDING = 4;
/** How long a finished (or failed) archive stays downloadable. */
export declare const ARCHIVE_TTL_MS: number;
/** One archive build: the state the client polls, plus the finished bytes. */
interface ArchiveTask {
    id: string;
    sessionId: string;
    name: string;
    state: 'building' | 'ready' | 'error';
    done: number;
    total: number;
    bytes: number;
    error?: string;
    zip?: Buffer;
    /** When the task stops being downloadable (set when it settles). */
    expiresAt: number;
}
/** The status shape the client reads (never carries the bytes). */
export interface ArchiveStatus {
    state: 'building' | 'ready' | 'error';
    done: number;
    total: number;
    bytes: number;
    error?: string;
}
/** Why a download/status read could not be served. */
export type ArchiveLookup = {
    ok: true;
    task: ArchiveTask;
} | {
    ok: false;
    reason: 'missing' | 'forbidden' | 'building' | 'expired' | 'error';
    message: string;
};
/** A resolved download: the bytes plus the sanitized name they were built for. */
export interface ArchiveDownload {
    name: string;
    zip: Buffer;
}
/** The response face {@link respondArchiveDownload} writes through. */
export interface ArchiveDownloadResponse {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(chunk?: Buffer | string): void;
}
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
export declare function respondArchiveDownload(tasks: ArchiveTasks, query: {
    sessionId: string | null;
    id: string | null;
}, res: ArchiveDownloadResponse): void;
/**
 * The host-side archive task table.
 *
 * A selection is collected up front (cheap: names + sizes) and then zipped in
 * the BACKGROUND, so the client can show progress instead of staring at a
 * spinner: `start` returns an id immediately, `status` reports
 * `building → ready | error`, and `download` hands over the bytes exactly once.
 * The table is bounded twice — {@link ARCHIVE_MAX_BUILDING} concurrent builds
 * and {@link ARCHIVE_TTL_MS} since a finished one — and every read is
 * session-scoped, so one session can never fetch another's archive.
 */
export interface ArchiveTasks {
    /** Start a build; rejects with bad-request when the concurrency cap is hit. */
    start(input: {
        sessionId: string;
        name: string;
        entries: readonly ZipEntry[];
    }): {
        id: string;
        entries: number;
    };
    /** Poll one task (a settled task past its TTL reads as missing). */
    status(id: string, sessionId: string): ArchiveStatus;
    /** Look one task up for a download; `sessionId` must match the builder's. */
    lookup(id: string, sessionId: string): ArchiveLookup;
    /** Release a task (called after its bytes were served). */
    release(id: string): void;
    /** Number of live tasks (tests / diagnostics). */
    size(): number;
}
/** Create one archive task table (one per plugin mount). */
export declare function createArchiveTasks(): ArchiveTasks;
export {};
