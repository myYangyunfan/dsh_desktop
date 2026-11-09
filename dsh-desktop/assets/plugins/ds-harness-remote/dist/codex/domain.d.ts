import type { CodexAppFrameData, CodexAppStreamClosedData } from '@dsh-remote/protocol';
import type { ResolvedCodexConfig } from '../config.js';
import type { PeerConnectionContext } from '../connection-controller.js';
import type { SafeLogger } from '../logging.js';
import { type CodexAppServerLike } from './app-server.js';
import { CodexPeerBridge, type PublishCodexFrame } from './peer-bridge.js';
type AppServerFactory = (binary: string, logger: SafeLogger) => CodexAppServerLike;
/**
 * Optional Codex business domain inside the existing Remote Plugin. It shares
 * Remote identity/transport with Harness, but owns its App Server process,
 * method policy, subscriptions, leases, and approval handles.
 */
export declare class CodexRemoteDomain {
    config: ResolvedCodexConfig;
    private readonly logger;
    private readonly createAppServer;
    private readonly restartDelaysMs;
    private appServer?;
    private unsubscribeInbound?;
    private unsubscribeUnavailable?;
    private readonly peers;
    private readonly peerDeviceIds;
    private readonly turnOwners;
    private readonly approvals;
    private readonly permissionPresets;
    private approvalExpiryTimer?;
    private restartTimer?;
    private restartAttempt;
    private available;
    private closed;
    /**
     * Workspace authority is intentionally not cached after a request finishes:
     * project roots can change outside this process and must stay fail-closed.
     * Concurrent calls during one catalog/history refresh do share this promise,
     * though, so they do not each page the same project list independently.
     */
    private workspaceAuthorityPromise?;
    /**
     * Authorization checks are intentionally not retained after they settle:
     * workspace roots can change outside this process and every new request must
     * still revalidate them.  Calls that overlap one another may share the same
     * bounded thread/read, though, which avoids duplicate first-open checks when
     * a session history and its first prompt arrive together.
     */
    private readonly knownThreadPromises;
    private state;
    private unavailableCode?;
    constructor(config: ResolvedCodexConfig, logger: SafeLogger, createAppServer?: AppServerFactory, restartDelaysMs?: readonly number[]);
    private startPromise?;
    start(): Promise<void>;
    private startOnce;
    isAvailable(): boolean;
    status(): {
        enabled: boolean;
        available: boolean;
        state: 'disabled' | 'starting' | 'ready' | 'restarting' | 'unavailable';
        restartAttempt: number;
        error?: string;
    };
    /** Resolve a thread cwd for Host-owned workspace/terminal carriers. */
    resolveThreadWorkspace(connectionId: string, threadId: string): Promise<string | undefined>;
    createPeer(context: PeerConnectionContext, publish: PublishCodexFrame): CodexPeerBridge | undefined;
    call(connectionId: string, input: unknown): Promise<unknown>;
    private captureCallScope;
    private callInternal;
    respond(connectionId: string, input: unknown): Promise<{
        resolved: true;
    }>;
    detachPeer(connectionId: string): Promise<void>;
    reconfigure(config: ResolvedCodexConfig): Promise<void>;
    close(): Promise<void>;
    private launchAppServer;
    private launchAppServerCandidate;
    private handleAppServerUnavailable;
    private scheduleRestart;
    private restartAfterFailure;
    private disposeAppServer;
    private handleInbound;
    private rememberPermission;
    private changeThreadPermission;
    private publishPermission;
    private handleServerRequest;
    private readKnownThread;
    private readKnownThreadUncached;
    private readThreadForHistory;
    private readThreadTurns;
    private readThreadItems;
    private logHistoryFallback;
    private logEmptyUnmaterializedHistory;
    private assertResultThreadAllowed;
    private claimTurn;
    private rememberTurnId;
    private hasSubscriber;
    private resolveUpstreamApproval;
    private expireApprovals;
    private scheduleApprovalExpiry;
    private requireAppServer;
    private callUpstream;
    private readWorkspaceAuthority;
    private readWorkspaceAuthorityUncached;
    private findKnownThreadInList;
    private requireCodexWorkspacePath;
    private requireNewCodexProjectPath;
    private listCodexDirectory;
    private resolveCodexDirectory;
    private listCodexWorkspacePaths;
}
export type CodexDomainFrame = CodexAppFrameData | CodexAppStreamClosedData;
/**
 * Prefer Codex bundled with the current ChatGPT desktop app on macOS when the
 * user kept the default command. Explicit binary configuration is never
 * rewritten or supplemented.
 */
export declare function codexBinaryCandidates(configured: string, hostPlatform?: NodeJS.Platform, userHome?: string): string[];
export {};
//# sourceMappingURL=domain.d.ts.map