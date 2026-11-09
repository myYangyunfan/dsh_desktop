import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { SafeLogger } from '../../logging.js';
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
export type CursorAcpInbound = CursorAcpNotification | CursorAcpRequest;
export type CursorAcpInboundHandler = (message: CursorAcpInbound) => void;
export type CursorAcpUnavailableHandler = (code: string) => void;
export type SpawnCursorAcp = (binary: string) => ChildProcessWithoutNullStreams;
export interface CursorAcpOptions {
    modelBackend?: 'cursor' | 'claude';
    args?: string[];
    cwd?: string;
    /** null uses Host-local pre-authentication; undefined preserves Cursor login. */
    authenticationMethod?: string | null;
}
export interface CursorAcpLike {
    start(): Promise<void>;
    isReady(): boolean;
    /** Optional Host-local preparation; never a Cursor ACP wire method. */
    prewarmSession?(cwd: string): void;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    respond(id: string | number, result: unknown): Promise<void>;
    respondError(id: string | number, code: number, message: string): Promise<void>;
    onInbound(handler: CursorAcpInboundHandler): () => void;
    onUnavailable(handler: CursorAcpUnavailableHandler): () => void;
    close(): Promise<void>;
}
export declare class CursorAcpError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: ErrorOptions);
}
/**
 * Host-local stdio client for one Cursor CLI ACP process (`agent acp`).
 * Authorization and method policy live in the surrounding Cursor domain.
 */
export declare class CursorAcpClient implements CursorAcpLike {
    private readonly binary;
    private readonly logger?;
    private readonly spawnAcp;
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
    private readonly modelStates;
    private readonly modelBusy;
    constructor(binary: string, logger?: SafeLogger | undefined, spawnAcp?: SpawnCursorAcp, options?: CursorAcpOptions);
    start(): Promise<void>;
    isReady(): boolean;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    respond(id: string | number, result: unknown): Promise<void>;
    respondError(id: string | number, code: number, message: string): Promise<void>;
    onInbound(handler: CursorAcpInboundHandler): () => void;
    onUnavailable(handler: CursorAcpUnavailableHandler): () => void;
    close(): Promise<void>;
    private startOnce;
    private assertStarting;
    private request;
    private write;
    private consumeStdout;
    private handleLine;
    private handleProcessFailure;
    private notifyUnavailable;
    private takePending;
    private failPending;
}
//# sourceMappingURL=cursor-process.d.ts.map