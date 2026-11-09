import type { SafeLogger } from '../../logging.js';
import { CursorAcpClient, type CursorAcpOptions, type SpawnCursorAcp, type CursorAcpInboundHandler } from './cursor-process.js';
/** Host-local authentication; no interactive login or filesystem transcript reads. */
export declare class ClaudeAcpClient extends CursorAcpClient {
    private readonly live;
    private readonly loads;
    private pendingNew;
    private historyStop?;
    private historyReading;
    private shuttingDown;
    private readonly makeClient;
    constructor(binary?: string, logger?: SafeLogger, spawnAcp?: SpawnCursorAcp, options?: Pick<CursorAcpOptions, 'args' | 'cwd'>);
    onInbound(handler: CursorAcpInboundHandler): () => void;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    private checkSessionLimit;
    private assertLoaded;
    /** One temporary process, separate from all live sessions (including active prompts). */
    history(sessionId: string, cwd: string): Promise<unknown[]>;
    close(): Promise<void>;
}
//# sourceMappingURL=claude-process.d.ts.map