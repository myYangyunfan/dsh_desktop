import type { AcpAvailableCommand, AcpSessionModes } from '@dsh-remote/protocol';
import type { SafeLogger } from '../../logging.js';
import { CursorAcpClient, type CursorAcpOptions, type SpawnCursorAcp, type CursorAcpInboundHandler } from './cursor-process.js';
/** Host-local authentication; no interactive login or filesystem transcript reads.
 *
 * Also the standard-ACP client shape used by other pre-authenticated backends (Hermes,
 * native AGY ACP, and custom ACP backends): one process per live session, a separate
 * reader for history replay, and load-replay suppression so a replayed transcript
 * never mixes into a live turn's stream.
 */
export declare class ClaudeAcpClient extends CursorAcpClient {
    private readonly live;
    private readonly loads;
    private readonly claudeInboundHandlers;
    private readonly loadSuppressions;
    private loadGen;
    private pendingNew;
    private historyStop?;
    private historyReading;
    private shuttingDown;
    private readonly historyMetadata;
    private readonly makeClient;
    constructor(binary?: string, logger?: SafeLogger, spawnAcp?: SpawnCursorAcp, options?: Pick<CursorAcpOptions, 'args' | 'cwd'>, backend?: string);
    /** History events and model catalogs are labelled with the backend that produced them. */
    private readonly modelLabel;
    private get label();
    onInbound(handler: CursorAcpInboundHandler): () => void;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    private beginLoadSuppression;
    private armLoadTombstone;
    private clearLoadSuppression;
    private clearAllLoadSuppressions;
    private checkSessionLimit;
    private assertLoaded;
    lastHistoryMetadata(sessionId: string): {
        modes?: AcpSessionModes;
        commands?: AcpAvailableCommand[];
    } | undefined;
    /** One temporary process, separate from all live sessions (including active prompts). */
    history(sessionId: string, cwd: string): Promise<unknown[]>;
    close(): Promise<void>;
}
//# sourceMappingURL=claude-process.d.ts.map