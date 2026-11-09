import { type RemoteTerminalSpawner } from '../workspace-bridge.js';
import type { ResolvedAcpConfig, ResolvedAcpBackendConfig } from '../config.js';
import type { PeerConnectionContext } from '../connection-controller.js';
import type { SafeLogger } from '../logging.js';
import { type CursorAcpLike } from './adapters/cursor-process.js';
import { AcpPeerBridge, type PublishAcpFrame } from './peer-bridge.js';
type AcpFactory = (binary: string, logger: SafeLogger, backend: ResolvedAcpBackendConfig) => CursorAcpLike;
/**
 * Host-side Agent ACP gateway (#65). Reuses the authenticated Remote channel and
 * delegates to independently configured Cursor/Antigravity adapters. Owns method policy,
 * session ownership, subscriptions, and permission handles per connection.
 */
export declare class AcpRemoteGateway {
    config: ResolvedAcpConfig;
    private readonly logger;
    private readonly createAcp;
    private readonly restartDelaysMs;
    private readonly terminalEnabled;
    private readonly terminalSpawner?;
    private readonly backendInstances;
    private readonly sessionCwds;
    private readonly workspaceState;
    private readonly terminalOwners;
    private readonly workspaceTools;
    private readonly peers;
    private readonly sessionOwners;
    private readonly sessionBackends;
    private readonly approvals;
    private approvalExpiryTimer?;
    private restartTimer?;
    private restartAttempt;
    private available;
    private closed;
    private state;
    private unavailableCode?;
    /** Keep ACP → Client fanout ordered; concurrent publish races Noise sends. */
    private inboundChain;
    /** Catch-up buffer for turns that finish while the Client is reconnecting. */
    private readonly recentFrames;
    /** Per-prompt live updates; attached to prompt_completed when streaming was lossy. */
    private readonly promptsInProgress;
    private readonly cancelledSessions;
    /** Identity fences asynchronous Pi preparation from a later retry of the same session. */
    private readonly preparingPrompts;
    private readonly turnCatchUp;
    private startPromise?;
    private readonly startingClients;
    /** Desired configuration is saved immediately; unfinished cleanup must remain retryable. */
    private readonly pendingReconfiguration;
    private readonly archivingSessions;
    private readonly opencodeOperations;
    constructor(config: ResolvedAcpConfig, logger: SafeLogger, createAcp?: AcpFactory, restartDelaysMs?: readonly number[], terminalEnabled?: () => boolean, terminalSpawner?: RemoteTerminalSpawner | undefined);
    /** Only implemented adapters are advertised; registry entries never select an adapter by executable name. */
    enabledBackends(): string[];
    start(): Promise<void>;
    private startOnce;
    isAvailable(): boolean;
    availableBackends(): string[];
    defaultBackend(): string;
    status(): {
        enabled: boolean;
        available: boolean;
        state: 'disabled' | 'starting' | 'ready' | 'restarting' | 'unavailable';
        restartAttempt: number;
        error?: string;
        availableBackends?: string[];
    };
    createPeer(context: PeerConnectionContext, publish: PublishAcpFrame): AcpPeerBridge | undefined;
    call(connectionId: string, input: unknown): Promise<unknown>;
    private captureCallScope;
    private callInternal;
    private runPromptInBackground;
    respond(connectionId: string, input: unknown): Promise<{
        resolved: true;
    }>;
    dropPeer(connectionId: string): void;
    private tools;
    /** Trusted, connection-scoped authority for the dedicated workspace uploader. */
    resolveUploadWorkspace(connectionId: string, publicId: string): string;
    openToolStream(connectionId: string, sessionId: string, backend: string, endpoint: string, args: Record<string, unknown>, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    /** Used by peer stream open to prove this connection may observe the session. */
    assertStreamable(connectionId: string, sessionId: string): void;
    /**
     * After a Client reconnect, session ownership may have been cleared with the
     * old peer. Reclaim the in-memory ACP session for the new connection so
     * stream open / prompt can resume and buffered frames can replay.
     */
    private claimSession;
    /** Replay frames buffered while no healthy peer could receive them. */
    replayBufferedFrames(connectionId: string, sessionId: string): Promise<void>;
    reconfigure(config: ResolvedAcpConfig): Promise<void>;
    close(): Promise<void>;
    private launchAcp;
    private backendCurrent;
    private launchBackendCandidate;
    private handleInbound;
    private publishToSession;
    private recordTurnCatchUp;
    private bufferFrame;
    private pruneFrameBuffer;
    private handleUnavailable;
    private scheduleRestart;
    private scheduleApprovalExpiry;
    private requireAcp;
    private initializeResult;
    private callUpstream;
    private requireSessionAccess;
    private requireSessionOwner;
    private captureCatalogClient;
    private listCatalogSessions;
    private catalogSessionCwd;
    private requireExistingDirectory;
    private listDirectory;
    private disposeInstance;
    private disposeAllInstances;
}
export type { PublishAcpFrame };
/**
 * Prefer `~/.local/bin/agent` when the user kept the default command. Explicit
 * binary configuration is never rewritten.
 */
export declare function cursorBinaryCandidates(configured: string): string[];
//# sourceMappingURL=gateway.d.ts.map