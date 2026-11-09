import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { SafeLogger } from '../logging.js';
export interface CodexAppServerNotification {
    kind: 'notification';
    method: string;
    params: unknown;
}
export interface CodexAppServerRequest {
    kind: 'request';
    id: string | number;
    method: string;
    params: unknown;
}
export type CodexAppServerInbound = CodexAppServerNotification | CodexAppServerRequest;
export type CodexAppServerInboundHandler = (message: CodexAppServerInbound) => void;
export type CodexAppServerUnavailableHandler = (code: string) => void;
export type SpawnCodexAppServer = (binary: string) => ChildProcessWithoutNullStreams;
export interface CodexAppServerLike {
    start(): Promise<void>;
    isReady(): boolean;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    respond(id: string | number, result: unknown): Promise<void>;
    respondError(id: string | number, code: number, message: string): Promise<void>;
    onInbound(handler: CodexAppServerInboundHandler): () => void;
    onUnavailable(handler: CodexAppServerUnavailableHandler): () => void;
    close(): Promise<void>;
}
export declare class CodexAppServerError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: ErrorOptions);
}
/**
 * Host-local stdio client for one Codex App Server process. This class knows
 * JSON-RPC correlation only; Remote authorization and method policy live in
 * the surrounding Codex domain.
 */
export declare class CodexAppServerClient implements CodexAppServerLike {
    private readonly binary;
    private readonly logger?;
    private readonly spawnAppServer;
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
    constructor(binary: string, logger?: SafeLogger | undefined, spawnAppServer?: SpawnCodexAppServer);
    start(): Promise<void>;
    isReady(): boolean;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    respond(id: string | number, result: unknown): Promise<void>;
    respondError(id: string | number, code: number, message: string): Promise<void>;
    onInbound(handler: CodexAppServerInboundHandler): () => void;
    onUnavailable(handler: CodexAppServerUnavailableHandler): () => void;
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
/**
 * Dedicated error code for a Thread that exists but has no turns yet. Current
 * Codex App Server versions materialize a Thread on its first user message and
 * reject turn listing (and legacy `includeTurns` reads) before that. Callers
 * must project this as empty history, not as a failed read, and must classify
 * it by code rather than by the sanitized upstream message.
 */
export declare const CODEX_THREAD_UNMATERIALIZED = "CODEX_THREAD_UNMATERIALIZED";
/** Safe Remote-facing message for an unmaterialized Thread. */
export declare const CODEX_UNMATERIALIZED_THREAD_MESSAGE = "Codex thread has no turns yet.";
//# sourceMappingURL=app-server.d.ts.map