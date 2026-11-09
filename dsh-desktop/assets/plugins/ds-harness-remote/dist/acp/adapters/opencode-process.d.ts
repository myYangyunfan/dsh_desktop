import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { SafeLogger } from '../../logging.js';
import type { CursorAcpInbound, CursorAcpLike } from './cursor-process.js';
export type OpencodeAcpNotification = CursorAcpNotification;
export type OpencodeAcpRequest = CursorAcpRequest;
export type OpencodeAcpInbound = CursorAcpInbound;
export type OpencodeAcpInboundHandler = (message: CursorAcpInbound) => void;
export type OpencodeAcpUnavailableHandler = (code: string) => void;
export type SpawnOpencodeAcp = (binary: string) => ChildProcessWithoutNullStreams;
export interface CursorAcpNotification {
    kind: 'notification';
    method: string;
    params: unknown;
}
export interface CursorAcpRequest {
    kind: 'request';
    id: string | number;
    method: string;
    params: unknown;
}
export type OpencodeAcpLike = CursorAcpLike;
export declare class OpencodeAcpError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: ErrorOptions);
}
/**
 * Host-local stdio client for one OpenCode CLI ACP process (`opencode acp`).
 * OpenCode natively supports standard Agent Client Protocol (ACP) over stdio.
 */
export declare class OpencodeAcpClient implements CursorAcpLike {
    private readonly binary;
    private readonly logger?;
    private readonly spawnAcp?;
    private readonly options;
    private process?;
    private nextId;
    private readonly pending;
    private readonly inboundHandlers;
    private readonly unavailableHandlers;
    private stdoutBuffer;
    private stderrBytes;
    private ready;
    private closed;
    private failureNotified;
    private startPromise?;
    private historyBusy;
    private historyStop?;
    private readonly startupAbort;
    private nativeApi?;
    private readonly archivedSessions;
    private readonly archivingSessions;
    constructor(binary?: string, logger?: SafeLogger | undefined, spawnAcp?: SpawnOpencodeAcp | undefined, options?: {
        args?: string[];
        cwd?: string;
        historyReader?: boolean;
    });
    start(): Promise<void>;
    isReady(): boolean;
    isSessionArchived(sessionId: string, cwd: string): Promise<boolean>;
    archiveSession(sessionId: string, cwd: string): Promise<void>;
    /**
     * Replay a saved session in one temporary ACP process so a history read never
     * interrupts a live turn. OpenCode emits the transcript as `session/update`
     * notifications before `session/load` resolves.
     */
    history(sessionId: string, cwd: string): Promise<unknown[]>;
    private readonly models;
    private readonly loads;
    private readonly busy;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    private loadSession;
    private publish;
    respond(id: string | number, result: unknown): Promise<void>;
    respondError(id: string | number, code: number, message: string): Promise<void>;
    onInbound(handler: OpencodeAcpInboundHandler): () => void;
    onUnavailable(handler: OpencodeAcpUnavailableHandler): () => void;
    close(): Promise<void>;
    private startOnce;
    private request;
    private write;
    private consumeStdout;
    private handleLine;
    private handleProcessFailure;
    private notifyUnavailable;
    private takePending;
    private failPending;
}
//# sourceMappingURL=opencode-process.d.ts.map