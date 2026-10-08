/**
 * Archive-set access (host): read the registry-global archived-session set and
 * drop ids from it durably.
 *
 * DSH keeps the set in the `workspace` domain's global singleton, owned by
 * `ctx.workspaceRegistry`. Restoring a session means removing its id from that
 * set — the session's own log and its Workspace accounting slot are never
 * touched, so a restore puts the row back exactly where it was.
 *
 * Write path selection (the upstream set is one-way on older builds):
 * 1. `registry.unarchiveSession(id)` — the public API on DSH builds that ship
 *    it (upstream added it after 0.1.5-rc.3); used whenever present.
 * 2. Otherwise the same durable write the registry itself performs: build the
 *    next state from the domain's authoritative value and commit it through
 *    `registry.setState` on the registry's own operation chain, so the durable
 *    medium, the registry's in-memory snapshot, and the `domain/changed` event
 *    every Workspace surface follows all move together.
 * 3. A deployment whose registry exposes neither is refused with a clear
 *    message instead of writing state another writer cannot observe.
 */
import type { Context } from '../../context-types.ts';
/** The result of dropping ids from the archive set. */
export interface ArchiveDropResult {
    /** The complete archive set after the write. */
    archivedIds: string[];
    /** Requested ids that were not archived (nothing to do). */
    absent: string[];
    /** Set when the durable write landed but the process snapshot could not be resynchronized. */
    staleSnapshot: boolean;
}
/** The archive-set face the archived-sessions feature consumes. */
export interface ArchiveStore {
    /** Whether a workspace registry is mounted here at all. */
    readonly mounted: boolean;
    /** Current archived ids (registry order). */
    ids(): string[];
    /** Whether this deployment can write the archive set. */
    writable(): boolean;
    /** Drop ids from the archive set durably (idempotent per id). */
    drop(ids: readonly string[]): Promise<ArchiveDropResult>;
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
export declare function createArchiveStore(ctx: Context): ArchiveStore;
