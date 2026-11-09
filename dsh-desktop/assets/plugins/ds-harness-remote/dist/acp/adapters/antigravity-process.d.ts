import { type AgyCatalog } from './antigravity/models.js';
import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { SafeLogger } from '../../logging.js';
import type { CursorAcpInboundHandler, CursorAcpLike, CursorAcpUnavailableHandler } from './cursor-process.js';
export type SpawnAntigravityAcp = (binary: string, args: string[], cwd?: string) => ChildProcessWithoutNullStreams;
export declare class AntigravityAcpError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: ErrorOptions);
}
export declare function resolveAntigravityBinary(preferred?: string): string;
export interface AntigravityAcpClientOptions {
    skipPermissions?: boolean;
    conversationId?: string;
    /** Internal process bound to one conversation. */
    sessionWorker?: boolean;
    cwd?: string;
    args?: string[];
    readModels?: () => Promise<AgyCatalog>;
    brainDir?: string;
}
/**
 * Host-local stdio client for Google Antigravity CLI (`agy --input-format stream-json --output-format stream-json`).
 * Maps Antigravity's stream-json NDJSON events to the standard Agent ACP gateway protocol.
 */
export declare class AntigravityAcpClient implements CursorAcpLike {
    private readonly binary;
    private readonly logger?;
    private readonly spawnAcp;
    private process?;
    private readonly inboundHandlers;
    private readonly unavailableHandlers;
    private watcher?;
    private stdoutBuffer;
    private stderrBytes;
    private ready;
    private closed;
    private startPromise?;
    private activeConversationId?;
    private readonly skipPermissions;
    private readonly sessionWorker;
    private initialConversationClaimed;
    private readonly sessions;
    private spare?;
    private spareCwd?;
    private readonly args;
    private readonly cwd;
    private readonly readModels;
    private readonly brainDir?;
    private readonly dispatchedThinkingSteps;
    private readonly selections;
    private readonly selecting;
    private currentPromptPending?;
    constructor(binary?: string, logger?: SafeLogger | undefined, spawnAcp?: SpawnAntigravityAcp, options?: AntigravityAcpClientOptions);
    start(): Promise<void>;
    isReady(): boolean;
    private prepareSession;
    private warmNextSession;
    prewarmSession(cwd: string): void;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    respond(_id: string | number, _result: unknown): Promise<void>;
    respondError(_id: string | number, _code: number, _message: string): Promise<void>;
    onInbound(handler: CursorAcpInboundHandler): () => void;
    onUnavailable(handler: CursorAcpUnavailableHandler): () => void;
    cancelTurn(): Promise<void>;
    close(): Promise<void>;
    private startOnce;
    private sendPrompt;
    private attachWatcher;
    private consumeStdout;
    private handleAgyEvent;
    private emitNotification;
    private notifyUnavailable;
}
//# sourceMappingURL=antigravity-process.d.ts.map