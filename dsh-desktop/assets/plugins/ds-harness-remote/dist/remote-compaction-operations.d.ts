import type { RemoteCompactionStatusParams, RemoteCompactionStatusResult, RemoteCompactionSubmitParams, RemoteCompactionSubmitResult } from '@dsh-remote/protocol';
import type { SafeLogger } from './logging.js';
import type { TypertRpcResult } from './typert-gateway-contract.js';
/**
 * Host-side registry for asynchronous Remote compaction operations.
 *
 * Harness forwards `commands/execute` through `withAbort()`: once the caller's
 * signal aborts, the RPC stops waiting for the handler while the handler keeps
 * running. Therefore "the command call returned" does not prove the compaction
 * handler, its maintenance lock and its persistence work are finished. This
 * registry separates those facts:
 *
 * - `cancelling`: a stop was requested; the command call may not have settled.
 * - `unconfirmed`: the run committed, but cancellation/timing made the final
 *   persistence result unobservable.
 * - `cancelled`/`failed`/`succeeded`: the Host observed a trustworthy final
 *   result (command result, or `compaction/end` for the same command id).
 *
 * Terminal states come from the background Harness call. A `compaction/end`
 * event alone never fabricates success.
 */
export interface RemoteCompactionOwner {
    deviceId: string;
    connectionId: string;
}
/** Runs the Host's fixed `/compact` command for one operation. */
export type RemoteCompactionRunner = (sessionId: string, signal: AbortSignal) => Promise<TypertRpcResult>;
/** Outcome of inspecting the Session log for the compaction lifecycle. */
export type RemoteCompactionConfirmation = {
    kind: 'finished';
    error?: string;
} | {
    kind: 'not-yet';
    started?: boolean;
    commandRecorded?: boolean;
} | {
    kind: 'unknown';
};
/**
 * Confirms whether the compaction handler actually finished. Implementations
 * read the Session log (`command/run`, `compaction/start|end`) by command id.
 */
export type RemoteCompactionConfirmer = (sessionId: string, acceptedAt: number, commandId: string | undefined) => Promise<RemoteCompactionConfirmation>;
export interface RemoteCompactionOperationsOptions {
    confirm?: RemoteCompactionConfirmer;
    logger?: SafeLogger;
    now?: () => number;
    /**
     * Maximum time an abort-interrupted operation may remain `cancelling` after
     * the command call settles without `session/events` confirming completion.
     */
    cancellingGraceMs?: number;
}
export declare class RemoteCompactionOperations {
    private readonly runner;
    private readonly operations;
    private readonly requestIndex;
    private readonly confirm?;
    private readonly logger?;
    private readonly now;
    private readonly cancellingGraceMs;
    private closed;
    constructor(runner: RemoteCompactionRunner, options?: RemoteCompactionOperationsOptions);
    submit(params: RemoteCompactionSubmitParams, owner: RemoteCompactionOwner): RemoteCompactionSubmitResult;
    status(params: RemoteCompactionStatusParams, owner: RemoteCompactionOwner): Promise<RemoteCompactionStatusResult>;
    cancel(params: RemoteCompactionStatusParams, owner: RemoteCompactionOwner): Promise<RemoteCompactionStatusResult>;
    /** Host shutdown: stop work and report every unfinished operation as interrupted. */
    closeAll(): void;
    private createOperation;
    private run;
    /**
     * Inspect the compaction lifecycle for a settled command call. A confirmed
     * `compaction/end` with an error marks the run stopped; a confirmed end
     * without error means it committed, but the final persistence result is no
     * longer observable after the abort.
     */
    private reconcile;
    private reconcileOnce;
    private cancellingDeadlineOf;
    private scheduleCancellingGrace;
    private expireCancellingOperations;
    private cancellingGraceExpiredMessage;
    private unconfirmedFailureMessage;
    private commandFailureMessage;
    private settle;
    private find;
    private view;
    private interrupted;
    /** Drop settled operations past retention; unfinished ones are never pruned. */
    private prune;
}
/**
 * Read the tail of a `session/events` result and decide whether the compaction
 * behind `commandId` finished. Handles both the 0.2.2 `records[].event` shape
 * and the legacy `events[]` shape used by older bridges.
 */
export declare function readCompactionConfirmation(result: TypertRpcResult, acceptedAt: number, commandId: string | undefined): RemoteCompactionConfirmation;
//# sourceMappingURL=remote-compaction-operations.d.ts.map