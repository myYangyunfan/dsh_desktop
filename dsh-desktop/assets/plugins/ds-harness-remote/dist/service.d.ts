import { type RemoteWorkspaceTypeDescription } from '@dsh-remote/protocol';
import { ConnectionController } from './connection-controller.js';
import type { ResolvedConfig } from './config.js';
import type { HostIdentity, IdentityStore } from './identity-store.js';
import type { SafeLogger } from './logging.js';
import { type FileViewerHostServiceLike } from './file-viewer-bridge.js';
import { type DeviceAuthorization, type OAuthProvider, type OAuthProviderInfo, type OAuthQrPollResult, type OAuthQrSession } from './server-api.js';
import type { PluginRouteDispatcher } from './plugin-route-bridge.js';
import type { LocalTypertGateway } from './typert-gateway-contract.js';
import type { AuthenticatedPeerChannel } from './types.js';
import { CodexRemoteDomain } from './codex/domain.js';
import type { PublishCodexFrame } from './codex/peer-bridge.js';
import { AcpRemoteGateway } from './acp/gateway.js';
import type { PublishAcpFrame } from './acp/peer-bridge.js';
import { type RemoteTerminalSpawner } from './codex-workspace-bridge.js';
export interface HostConnectedClient {
    deviceId: string;
    name: string;
    platform?: string;
    mode?: 'LAN' | 'P2P' | 'TURN' | 'Relay';
}
export interface HostRemoteStatus {
    deviceId?: string;
    configured: boolean;
    online: boolean;
    reconnecting: boolean;
    lastActiveAt?: number;
    error?: string;
    account?: string;
    authorized: boolean;
    accountRequired: boolean;
    connectedClients: HostConnectedClient[];
}
export declare class HostPluginRuntime {
    private readonly config;
    private readonly identities;
    private readonly logger;
    private readonly localGateway?;
    private readonly fileViewerHost?;
    /** PTY-backed terminal provider from the Host `subprocess` service, when present. */
    private readonly terminalSpawner?;
    private readonly pluginRoutes?;
    readonly connections: ConnectionController;
    private readonly terminalOwners;
    private readonly loopbackHosts;
    private terminalEnabled;
    private loopbackPorts;
    private identity?;
    private readonly serverApi?;
    private serverConnection?;
    private harnessVersion?;
    private closed;
    private readonly codex;
    private readonly acp;
    private readonly codexWorkspaceState;
    private localCodexPeer?;
    private localCodexPublish;
    private localAcpPeer?;
    private localAcpPublish;
    constructor(config: ResolvedConfig, identities: IdentityStore, logger: SafeLogger, localGateway?: LocalTypertGateway | undefined, fileViewerHost?: (() => FileViewerHostServiceLike | undefined) | undefined, 
    /** PTY-backed terminal provider from the Host `subprocess` service, when present. */
    terminalSpawner?: RemoteTerminalSpawner | undefined, pluginRoutes?: ((peer?: unknown) => PluginRouteDispatcher | undefined) | undefined);
    setTerminalEnabled(enabled: boolean): void;
    setLoopbackPorts(ports: readonly number[]): void;
    private backendUpdate;
    setAgentBackends(config: ResolvedConfig): Promise<void>;
    private createLoopbackHost;
    start(): Promise<void>;
    currentIdentity(): HostIdentity;
    acceptAuthenticatedPeer(channel: AuthenticatedPeerChannel): Promise<void>;
    hostStatus(): HostRemoteStatus;
    hasStoredAuthorization(): Promise<boolean>;
    private listConnectedClients;
    localHarnessVersion(): string | undefined;
    reconnectHost(): void;
    hostOAuthProviders(): Promise<OAuthProviderInfo[]>;
    startHostOAuthQrLogin(provider: OAuthProvider): Promise<OAuthQrSession>;
    pollHostOAuthQrLogin(qrId: string): Promise<OAuthQrPollResult>;
    clearHostAuthorization(): Promise<void>;
    authorizeHostAsOwned(accessToken: string, account?: string): Promise<DeviceAuthorization>;
    authorizeHostWithAccount(email: string, password: string): Promise<DeviceAuthorization>;
    authorizeHostWithCode(code: string): Promise<DeviceAuthorization>;
    revokePeer(deviceId: string): Promise<boolean>;
    codexStatus(): ReturnType<CodexRemoteDomain['status']>;
    codexCall(input: unknown): Promise<unknown>;
    codexRespond(input: unknown): Promise<{
        resolved: true;
    }>;
    codexOpenStream(input: unknown, publish: PublishCodexFrame): Promise<unknown>;
    codexCloseStream(input: unknown): Promise<unknown>;
    acpStatus(): ReturnType<AcpRemoteGateway['status']>;
    acpCall(input: unknown): Promise<unknown>;
    acpRespond(input: unknown): Promise<{
        resolved: true;
    }>;
    acpOpenStream(input: unknown, publish: PublishAcpFrame): Promise<unknown>;
    acpCloseStream(input: unknown): Promise<unknown>;
    close(): Promise<void>;
    diagnostics(): {
        loaded: boolean;
        deviceId: string | undefined;
        identityValid: boolean;
        serverConfigured: boolean;
        serverOnline: boolean;
        serverError: string | undefined;
        online: boolean;
        activeConnections: number;
        peerDeviceId: string | undefined;
        peerDeviceIds: string[];
        trustedPeers: number;
        capabilities: string[];
        workspaceTypes: RemoteWorkspaceTypeDescription[];
        codex: {
            enabled: boolean;
            available: boolean;
            state: "disabled" | "starting" | "ready" | "restarting" | "unavailable";
            restartAttempt: number;
            error?: string;
        };
        acp: {
            enabled: boolean;
            available: boolean;
            state: "disabled" | "starting" | "ready" | "restarting" | "unavailable";
            restartAttempt: number;
            error?: string;
            availableBackends?: string[];
        };
    };
    private createServerConnection;
    private readHarnessVersion;
    private hostCapabilities;
    private hostWorkspaceTypes;
    private acpAvailable;
    private requireLocalCodexPeer;
    private requireLocalAcpPeer;
}
//# sourceMappingURL=service.d.ts.map