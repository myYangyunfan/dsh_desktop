import type { RtcPeerConnectionFactory } from '@dsh-remote/webrtc';
import type { ConnectedRemote, ConnectionProgressState, TransportAttempt } from './client-runtime-contract.js';
import type { ResolvedConfig } from './config.js';
import type { HostIdentity, IdentityStore, TrustedPeer } from './identity-store.js';
import type { SafeLogger } from './logging.js';
import type { ServerHostDevice } from './server-api.js';
import { ClientServerApi } from './server-api.js';
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
    readonly identities: IdentityStore;
}
export declare class ClientConnection {
    private readonly context;
    constructor(context: ClientConnectionContext);
    connect(targetDeviceId: string, signal?: AbortSignal, options?: {
        background?: boolean;
    }): Promise<ConnectedRemote>;
    beginAttemptProgress(runId: number, attempt: TransportAttempt): () => void;
    updateConnectionProgress(runId: number, phase: ConnectionProgressState['phase'], activeTransports?: ConnectionProgressState['activeTransports']): void;
    clearConnectionProgress(runId: number): void;
    authorizeHostPeer(serverDevice: ServerHostDevice, signal?: AbortSignal): Promise<TrustedPeer>;
}
//# sourceMappingURL=client-connection.d.ts.map