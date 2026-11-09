import type { SafeLogger } from '../../logging.js';
import { CursorAcpClient, type CursorAcpOptions, type SpawnCursorAcp, type CursorAcpInboundHandler } from './cursor-process.js';
/** Host-local authentication; no interactive login or filesystem transcript reads.
 *
 * Also the standard-ACP client shape used by other pre-authenticated backends (Hermes):
 * one process per live session, a separate reader for history replay, and load-replay
 * suppression so a replayed transcript never mixes into a live turn's stream.
 */
export declare class ClaudeAcpClient extends CursorAcpClient {
    private readonly live;
    private readonly loads;
    private pendingNew;
    private historyStop?;
    private historyReading;
    private shuttingDown;
    private readonly makeClient;
    constructor(binary?: string, logger?: SafeLogger, spawnAcp?: SpawnCursorAcp, options?: Pick<CursorAcpOptions, 'args' | 'cwd'>, backend?: 'claude' | 'hermes');
    /** History events and model catalogs are labelled with the backend that produced them. */
    private readonly modelLabel;
    private get label();
    onInbound(handler: CursorAcpInboundHandler): () => void;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    private checkSessionLimit;
    private assertLoaded;
    /** One temporary process, separate from all live sessions (including active prompts). */
    history(sessionId: string, cwd: string): Promise<unknown[]>;
    close(): Promise<void>;
}
//# sourceMappingURL=claude-process.d.ts.map