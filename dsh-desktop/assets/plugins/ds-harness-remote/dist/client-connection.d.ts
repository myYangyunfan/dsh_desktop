import type { RtcPeerConnectionFactory } from '@dsh-remote/webrtc';
import type { ConnectedRemote, ConnectionProgressState, RemoteWorkspaceSelection, TransportAttempt } from './client-runtime-contract.js';
import type { ResolvedConfig } from './config.js';
import type { HostIdentity, IdentityStore, TrustedPeer } from './identity-store.js';
import type { SafeLogger } from './logging.js';
import type { ServerHostDevice } from './server-api.js';
import { ClientServerApi } from './server-api.js';
import { TypertGatewaySwitch } from './typert-gateway-switch.js';
import type { WeriftFactoryOptions } from './werift-rtc.js';
/** Collaborates with one ClientModeRuntime; never creates a second session or connection state. */
export interface ClientConnectionContext {
    connectionProgressRun: number;
    connectionProgress: ConnectionProgressState | undefined;
    readonly requireIdentity: () => HostIdentity;
    readonly server: ClientServerApi;
    readonly config: ResolvedConfig;
    readonly rtcFactoryProvider: (options?: WeriftFactoryOptions) => Promise<RtcPeerConnectionFactory | undefined>;
    readonly logger: SafeLogger;
    connected: ConnectedRemote | undefined;
    readonly closePreview: () => Promise<void>;
    pendingWorkspaceSelection: RemoteWorkspaceSelection | undefined;
    readonly closeCodexVirtual: (invalidatePending?: boolean) => Promise<void>;
    readonly closeCursorVirtual: () => Promise<void>;
    readonly gatewaySwitch: TypertGatewaySwitch;
    readonly identities: IdentityStore;
}
export declare class ClientConnection {
    private readonly context;
    constructor(context: ClientConnectionContext);
    connect(targetDeviceId: string, signal?: AbortSignal): Promise<ConnectedRemote>;
    beginAttemptProgress(runId: number, attempt: TransportAttempt): () => void;
    updateConnectionProgress(runId: number, phase: ConnectionProgressState['phase'], activeTransports?: ConnectionProgressState['activeTransports']): void;
    clearConnectionProgress(runId: number): void;
    authorizeHostPeer(serverDevice: ServerHostDevice): Promise<TrustedPeer>;
}
//# sourceMappingURL=client-connection.d.ts.map