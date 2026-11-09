import type { ControlResult } from './control-result.js';
import type { RtcPeerConnectionFactory } from '@dsh-remote/webrtc';
import type { AcpVirtualWorkspaceView } from './acp/virtual-harness.js';
import type { HarnessMode } from './harness-target.js';
import type { HostAuthorizationControl, HostConnectionHandle, RemoteDeviceView, RemoteDirectoryListing, RemoteWorkspaceView } from './client-runtime-contract.js';
import type { CodexVirtualWorkspaceView } from './codex/virtual-harness.js';
import type { ResolvedConfig } from './config.js';
import type { HostWebServerLike } from './control-route.js';
import type { IdentityStore } from './identity-store.js';
import type { SafeLogger } from './logging.js';
import type { OAuthProvider } from './server-api.js';
import { ClientServerApi } from './server-api.js';
import type { TypertGatewayLike } from './typert-gateway-contract.js';
import type { WeriftFactoryOptions } from './werift-rtc.js';
export declare class ClientModeRuntime {
    private readonly config;
    private readonly identities;
    private readonly server;
    private readonly logger;
    private readonly host?;
    private readonly rtcFactoryProvider;
    private connect;
    handleControl(endpoint: string, payload: unknown, signal: AbortSignal): Promise<ControlResult<unknown>>;
    private readonly connection;
    private readonly control;
    private readonly codexStreamBridge;
    private preview?;
    private identity?;
    private connected?;
    private pendingWorkspaceSelection?;
    private codexVirtual?;
    private codexVirtualSelection?;
    private readonly codexOpenedSessions;
    private codexOpenGeneration;
    private cursorVirtual?;
    private acpVirtualBackend;
    private readonly gatewaySwitch;
    private readonly codexStreams;
    private connectionProgress?;
    private connectionProgressRun;
    private closed;
    private remoteLifetime;
    constructor(config: ResolvedConfig, identities: IdentityStore, server: ClientServerApi, typertGateway: TypertGatewayLike, logger: SafeLogger, host?: HostAuthorizationControl | undefined, rtcFactoryProvider?: (options?: WeriftFactoryOptions) => Promise<RtcPeerConnectionFactory | undefined>);
    start(): Promise<void>;
    authorizeHostByDefault(): Promise<void>;
    registerControl(connection: HostConnectionHandle, webServer?: HostWebServerLike): () => Promise<void>;
    status(): Record<string, unknown>;
    private closePreview;
    private detailedStatus;
    devices(): Promise<RemoteDeviceView[]>;
    /**
     * Device discovery is exposed through the local app control route. When this
     * installation also runs a Host, keep that route closed after the Host's
     * Server credential has become terminally invalid. The Client credential can
     * remain usable for a short time after a revoke, so checking only
     * `ClientServerApi.listDevices()` would otherwise leak the device directory
     * from a Host that the user has already been told to re-authorize.
     */
    private assertHostAuthorizationForDeviceDiscovery;
    authorizeClientWithAccount(email: string, password: string): Promise<unknown>;
    startClientOAuthQrLogin(provider: OAuthProvider): Promise<unknown>;
    pollClientOAuthQrLogin(qrId: string): Promise<unknown>;
    clearClientAuthorization(): Promise<void>;
    setHostAuthorization(enabled: boolean): Promise<unknown>;
    setMode(mode: HarnessMode, targetDeviceId?: string, signal?: AbortSignal): Promise<Record<string, unknown>>;
    listRemoteDirectory(targetDeviceId: string, path?: string, signal?: AbortSignal): Promise<RemoteDirectoryListing>;
    listRemoteWorkspaces(targetDeviceId: string, signal?: AbortSignal): Promise<RemoteWorkspaceView[]>;
    openRemoteWorkspace(targetDeviceId: string, path: string, signal?: AbortSignal): Promise<Record<string, unknown>>;
    listCodexWorkspaces(targetDeviceId: string, signal?: AbortSignal): Promise<CodexVirtualWorkspaceView[]>;
    openCodexWorkspace(targetDeviceId: string, workspaceId: string, signal?: AbortSignal): Promise<Record<string, unknown>>;
    createCodexWorkspace(targetDeviceId: string, path: string, signal?: AbortSignal): Promise<Record<string, unknown>>;
    listCursorWorkspaces(targetDeviceId: string, signal?: AbortSignal, backend?: 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude'): Promise<AcpVirtualWorkspaceView[]>;
    openCursorWorkspace(targetDeviceId: string, workspaceId: string, signal?: AbortSignal, backend?: 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude'): Promise<Record<string, unknown>>;
    createCursorWorkspace(targetDeviceId: string, path: string, signal?: AbortSignal, backend?: 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude'): Promise<Record<string, unknown>>;
    private consumeWorkspaceSelection;
    close(): Promise<void>;
    private leaveRemote;
    private callRemoteFileViewer;
    private pluginRoute;
    private activeRemote;
    private selectRemoteTarget;
    private remoteTypertGateway;
    private selectCodexTarget;
    private closeCodexVirtual;
    private closeCursorVirtual;
    private selectCursorTarget;
    private assertRemoteCompatible;
    private assertLocalHarnessCarrierAvailable;
    private ensureConnected;
    private assertRemoteCurrent;
    private requireIdentity;
}
export { probeRemoteHostFeatures, remoteHostFeatures } from './client-capabilities.js';
export { ClientModeError } from './client-runtime-contract.js';
export type { HostAuthorizationControl, HostConnectionHandle, HostConnectionRpc, RemoteDeviceView, RemoteDirectoryEntry, RemoteDirectoryListing, RemoteHostFeatures, RemoteWorkspaceView } from './client-runtime-contract.js';
//# sourceMappingURL=client-runtime.d.ts.map