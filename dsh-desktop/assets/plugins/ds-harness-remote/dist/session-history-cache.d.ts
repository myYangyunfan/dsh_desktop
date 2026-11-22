import type { AcpModelSelection } from './acp/virtual-catalog.js';
import type { AcpPermissionPreset, NativeEvent as AcpNativeEvent } from './acp/virtual-contract.js';
import type { CodexNativeHistoryPage } from './codex/virtual-history.js';
import type { HarnessSessionGeneration } from './harness-version.js';
import type { VirtualHistoryTurnWindow } from './virtual-history-pagination.js';
type JsonRecord = Record<string, unknown>;
export declare function extractSessionIdFromGatewayPayload(payload: unknown): string | undefined;
export declare function isSessionMutationEndpoint(endpoint: string): boolean;
export declare function canonicalUnaryHistoryKey(endpoint: string, payload: unknown): string;
/**
 * Bounded LRU cache for Native Harness session follow snapshots and unary
 * history/page/projection reads across project and session switches.
 */
export declare class RemoteSessionHistoryCache {
    private readonly sessions;
    private readonly pendingUnary;
    private readonly invalidatedAt;
    private epoch;
    private minValidEpoch;
    beginReadEpoch(): number;
    isReadEpochValid(sessionId: string, readEpoch: number): boolean;
    getFollowSnapshot(client: object, sessionId: string): {
        snapshot: JsonRecord;
        sameClient: boolean;
        cursor: number;
    } | undefined;
    recordFollowSnapshot(client: object, sessionId: string, frame: unknown): void;
    prependBackfilledRecords(client: object, sessionId: string, backfilled: unknown[]): void;
    recordFollowFrame(client: object, sessionId: string, frame: unknown): void;
    private invalidateUnary;
    getUnary(client: object, sessionId: string, key: string): unknown | undefined;
    setUnary(client: object, sessionId: string, key: string, value: unknown, readEpoch?: number): void;
    getFallbackUnary(sessionId: string, endpoint: string, key: string, payload: unknown): unknown | undefined;
    slicePageFromSnapshot(client: object, sessionId: string, payload: unknown): unknown | undefined;
    private sliceSnapshotRecords;
    runSingleFlightUnary<T>(client: object, sessionId: string, key: string, signal: AbortSignal, factory: (sharedSignal: AbortSignal) => Promise<T>): Promise<T>;
    invalidateSession(sessionId: string): void;
    clear(): void;
}
/**
 * Bounded LRU cache for Codex virtual session history pages across project
 * and session switches on the same remote Host.
 */
export declare class CodexSessionHistoryCache {
    private readonly threads;
    private readonly pendingPages;
    private readonly invalidatedAt;
    private epoch;
    private minValidEpoch;
    static pageKey(generation: HarnessSessionGeneration, page: {
        beforeSeq?: number;
        throughSeq?: number;
        maxMessages?: number;
        turnWindow?: VirtualHistoryTurnWindow;
    }): string;
    beginReadEpoch(): number;
    isReadEpochValid(threadId: string, readEpoch: number): boolean;
    getFreshPage(threadId: string, generation: HarnessSessionGeneration, page: {
        beforeSeq?: number;
        throughSeq?: number;
        maxMessages?: number;
        turnWindow?: VirtualHistoryTurnWindow;
    }, knownUpdatedAt?: number): CodexNativeHistoryPage | undefined;
    getFreshTailCursor(threadId: string, generation: HarnessSessionGeneration, knownUpdatedAt?: number): number | undefined;
    getStalePage(threadId: string, generation: HarnessSessionGeneration, page: {
        beforeSeq?: number;
        throughSeq?: number;
        maxMessages?: number;
        turnWindow?: VirtualHistoryTurnWindow;
    }): CodexNativeHistoryPage | undefined;
    setPage(threadId: string, generation: HarnessSessionGeneration, page: {
        beforeSeq?: number;
        throughSeq?: number;
        maxMessages?: number;
        turnWindow?: VirtualHistoryTurnWindow;
    }, value: CodexNativeHistoryPage, knownUpdatedAt?: number, readEpoch?: number): void;
    runSingleFlightPage(threadId: string, generation: HarnessSessionGeneration, page: {
        beforeSeq?: number;
        throughSeq?: number;
        maxMessages?: number;
        turnWindow?: VirtualHistoryTurnWindow;
    }, signal: AbortSignal | undefined, factory: (sharedSignal: AbortSignal) => Promise<CodexNativeHistoryPage>): Promise<CodexNativeHistoryPage>;
    invalidateThread(threadId: string): void;
    removeThread(threadId: string): void;
    clear(): void;
}
export interface CachedAcpSessionHistory {
    events: Array<{
        type: 'event';
        event: AcpNativeEvent;
    }>;
    blank: boolean;
    hydrated: boolean;
    stale?: boolean;
    truncated?: boolean;
    title?: string;
    titleOverridden?: boolean;
    titleFromPrompt?: boolean;
    hostUpdatedAt: number;
    selectedModel?: AcpModelSelection;
    permissionPreset?: AcpPermissionPreset;
}
/**
 * Bounded LRU cache for ACP virtual session histories (Claude, Hermes,
 * OpenCode, Pi, Antigravity, Cursor) across project switches.
 */
export declare class AcpSessionHistoryCache {
    private readonly sessions;
    getFresh(sessionId: string): CachedAcpSessionHistory | undefined;
    getStale(sessionId: string): CachedAcpSessionHistory | undefined;
    set(sessionId: string, value: CachedAcpSessionHistory): void;
    markStale(sessionId: string): void;
    delete(sessionId: string): void;
    clear(): void;
}
export {};
//# sourceMappingURL=session-history-cache.d.ts.map