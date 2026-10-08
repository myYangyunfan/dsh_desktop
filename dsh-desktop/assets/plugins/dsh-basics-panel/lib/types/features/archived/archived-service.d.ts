import type { FeatureContext } from '../registry.ts';
/** One archived-session row in the list. */
export interface ArchivedSessionRow {
    id: string;
    cwd?: string;
    createdAt?: number;
    sizeBytes?: number;
    eventCount?: number;
    /** The session object is loaded in this process's in-memory session store. */
    loaded: boolean;
    /** The session's Agent is draining turns right now (dsh-agent `status === 'running'`). */
    running: boolean;
    /** A durable artifact exists for the id (a dangling archive entry has none). */
    stored: boolean;
    /** Whether the panel may restore this row. */
    restorable: boolean;
    /** Whether the panel may delete this row. */
    deletable: boolean;
}
/** The archived-sessions list payload. */
export interface ArchivedList {
    rows: ArchivedSessionRow[];
    archivedIds: string[];
    totalBytes: number;
    /** Whether the archive set can be written in this deployment. */
    writable: boolean;
    /** Whether a workspace registry is mounted at all. */
    mounted: boolean;
    /** Whether the panel is in read-only mode. */
    readOnly: boolean;
    /** Whether delete is enabled by configuration. */
    deleteEnabled: boolean;
    /** Upper bound on the ids one restore/delete call may address. */
    maxBatchIds: number;
    /** Whether the durable session listing could be read. */
    listingFailed: boolean;
    /** Display form of the scanned sessions root. */
    sessionsRoot: string;
}
/** One skipped id with its reason (Chinese, shown as-is by the panel). */
export interface ArchivedSkip {
    id: string;
    reason: string;
}
/** The restore/delete result. */
export interface ArchivedMutation {
    ok: true;
    /** Ids the operation actually changed. */
    changed: string[];
    /** Ids the operation refused, with the reason. */
    skipped: ArchivedSkip[];
    /** The complete archive set after the operation. */
    archivedIds: string[];
    /** Bytes removed from disk (delete only). */
    freedBytes: number;
    /** Set when the durable write landed but the process snapshot could not be resynchronized. */
    staleSnapshot: boolean;
    /** Set when the filesystem work succeeded but a follow-up cleanup step failed. */
    warning?: string;
}
/** Build the archived feature API. */
export declare function registerArchived(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown>;
