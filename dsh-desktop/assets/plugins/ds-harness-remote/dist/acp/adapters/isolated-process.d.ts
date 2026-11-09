import { type CursorAcpLike, type CursorAcpInboundHandler, type CursorAcpUnavailableHandler } from './cursor-process.js';
import type { SafeLogger } from '../../logging.js';
/** One process per session: Cursor shares model settings within a process; Pi also needs isolated wrappers. */
export declare class IsolatedAcpClient implements CursorAcpLike {
    private readonly binary;
    private readonly logger?;
    private readonly options;
    private readonly factory;
    private catalog?;
    private readonly clients;
    private readonly starting;
    private readonly inbound;
    private readonly unavailable;
    private closed;
    private readonly all;
    private readonly callbacks;
    private nextCallback;
    private readonly configurations;
    private readonly busy;
    private readonly loading;
    private historyBusy;
    constructor(binary: string, logger?: SafeLogger | undefined, options?: {
        args?: string[];
        cwd?: string;
        backend?: 'pi' | 'cursor';
    }, factory?: () => CursorAcpLike);
    private get backend();
    private get label();
    start(): Promise<void>;
    isReady(): boolean;
    private create;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    private callOnce;
    private updateConfiguration;
    private models;
    /** A separate wrapper prevents history reads from interrupting active sessions. */
    history(sessionId: string, cwd: string): Promise<unknown[]>;
    respond(id: string | number, result: unknown): Promise<void>;
    respondError(id: string | number, code: number, message: string): Promise<void>;
    onInbound(handler: CursorAcpInboundHandler): () => void;
    onUnavailable(handler: CursorAcpUnavailableHandler): () => void;
    private dispose;
    close(): Promise<void>;
}
//# sourceMappingURL=isolated-process.d.ts.map