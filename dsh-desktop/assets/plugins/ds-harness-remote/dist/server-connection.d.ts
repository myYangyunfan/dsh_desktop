import { ControlLease } from '@dsh-remote/webrtc';
import { NoiseIkSession } from '@dsh-remote/crypto';
import { type ConnectIncomingPayload, type RemoteMessage, type SameLinkIpv6Pair, type SecureHandshakePayload, type SelectedTransport, type SignalIcePayload } from '@dsh-remote/protocol';
import { RtcDataChannelTransport, type RtcPeerConnectionFactory } from '@dsh-remote/webrtc';
import type { ConnectionController } from './connection-controller.js';
import type { ResolvedConfig } from './config.js';
import type { HostIdentity, IdentityStore, TrustedPeer } from './identity-store.js';
import type { SafeLogger } from './logging.js';
import type { HostServerApi } from './server-api.js';
import type { AuthenticatedPeerChannel } from './types.js';
interface WebSocketLike {
    readonly readyState: number;
    binaryType?: string;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: {
        data: unknown;
    }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onclose: ((event: {
        code: number;
        reason: string;
    }) => void) | null;
    send(data: string): void;
    close(code?: number, reason?: string): void;
}
type RelayAssignment = Pick<ConnectIncomingPayload, 'relayEndpoint' | 'relayTicket' | 'relayNodeId' | 'relayEpoch'>;
export type WebSocketFactory = (url: string) => WebSocketLike;
interface PendingTunnel {
    recoveryTicket?: string;
    relayRecoveryTicket?: string;
    lease?: ControlLease;
    connectionId: string;
    membershipId: string;
    peer: TrustedPeer;
    preferredTransports: ConnectIncomingPayload['preferredTransports'];
    noise: NoiseIkSession;
    transport: 'negotiating' | SelectedTransport;
    transportMode?: 'LAN' | 'P2P' | 'TURN';
    rtc?: RtcDataChannelTransport;
    drainingRtcs?: Set<RtcDataChannelTransport>;
    channel?: ServerNoiseChannel;
    pendingHandshake?: SecureHandshakePayload;
    /** ICE candidates that arrived while the offer handler was still preparing the RTC backend. */
    pendingIce?: SignalIcePayload['candidate'][];
    relayAssignment?: RelayAssignment;
    dataSocket?: WebSocketLike;
    dataReady?: boolean;
    dataSocketOpening?: Promise<void>;
    abortDataSocketOpen?: () => void;
}
export declare function resolveWebRtcNegotiateTimeoutMs(hint: unknown): number;
export declare class HostServerConnection {
    private readonly config;
    private readonly identity;
    private readonly identities;
    private readonly api;
    private readonly connections;
    private readonly logger;
    private readonly createWebSocket;
    private readonly rtcFactoryProvider?;
    private readonly hostCapabilities;
    private readonly harnessVersion?;
    private socket?;
    private forceCloseSocket?;
    private running?;
    private stopped;
    private online;
    private retryWake?;
    private readonly tunnels;
    private terminalError?;
    private lastActiveAt?;
    private reconnectRequested;
    private resumeQueued;
    private authRecoveryAttempted;
    private rtcFactory?;
    private negotiatedCapabilities;
    private controlFrameLimits;
    private heartbeatIntervalMs;
    private webRtcNegotiateTimeoutMs;
    constructor(config: ResolvedConfig, identity: HostIdentity, identities: IdentityStore, api: HostServerApi, connections: ConnectionController, logger: SafeLogger, createWebSocket?: WebSocketFactory, rtcFactoryProvider?: (() => Promise<RtcPeerConnectionFactory | undefined>) | undefined, hostCapabilities?: () => readonly string[], harnessVersion?: string | undefined);
    start(): void;
    resume(): void;
    stop(): Promise<void>;
    isOnline(): boolean;
    recoveryExpiresAt(): number | undefined;
    lastError(): string | undefined;
    lastActivity(): number | undefined;
    isReconnecting(): boolean;
    reconnect(): void;
    private run;
    private connectOnce;
    private handleFrame;
    private handleConnectIncoming;
    private handleHandshake;
    private completeHandshake;
    private resumePendingHandshake;
    private handleRelay;
    private handleSignalOffer;
    private handleSignalIce;
    private handleTransportSelected;
    private canUseWebRtc;
    private sendRtcSignal;
    private handleRtcOpened;
    private handleRtcFailed;
    private attachRelayDataSocket;
    private retireDataSocket;
    private sendTransportSelected;
    private sendRelay;
    private openDataSocket;
    private handleDataSocketFrame;
    private sendControl;
    private notifyTunnelClosed;
    private dropTunnels;
    private dropTunnel;
    private waitBeforeRetry;
}
export declare class ServerNoiseChannel implements AuthenticatedPeerChannel {
    private readonly tunnel;
    private readonly transmit;
    private readonly onClose;
    private readonly sends;
    readonly security: {
        protocol: "Noise_IK_25519_ChaChaPoly_SHA256";
        connectionId: string;
        membershipId: string;
    };
    readonly peerDeviceId: string;
    readonly peerIdentityKey: string;
    mode: 'LAN' | 'P2P' | 'TURN' | 'Relay';
    readonly createTransportUpgradeHost?: AuthenticatedPeerChannel['createTransportUpgradeHost'];
    private transmitSequenced?;
    private readonly reorderBuffer;
    private readonly drainingLegs;
    private readonly handlers;
    private readonly incoming;
    private readonly outgoing;
    private closed;
    /** Noise + SecureMessageCodec counters are not re-entrant; serialize sends. */
    private sendTail;
    constructor(tunnel: PendingTunnel, transmit: (ciphertext: Uint8Array) => Promise<void>, onClose: () => Promise<void>, mode: 'LAN' | 'P2P' | 'TURN' | 'Relay', createTransportUpgradeHost?: AuthenticatedPeerChannel['createTransportUpgradeHost'], reorderOptions?: {
        maxFrames?: number;
        maxBytes?: number;
        gapTimeoutMs?: number;
    });
    sameLinkIpv6Endpoints(pair?: SameLinkIpv6Pair): Promise<string[]>;
    lanWebAddress(pair?: SameLinkIpv6Pair): Promise<string | undefined>;
    get outboundCounter(): number;
    upgradeTransport<T extends object = RtcDataChannelTransport>(nextMode: 'LAN' | 'P2P' | 'TURN', nextTransmit: (counter: number, ciphertext: Uint8Array) => Promise<void>, previousLeg?: T, attemptId?: string, disposePreviousLeg?: (leg: T) => void): Promise<number>;
    confirmPreviousLegDrain(attemptId: string, clientPreviousLegEndCounter: number): void;
    send(message: RemoteMessage): Promise<void>;
    private sendNow;
    onMessage(handler: (message: RemoteMessage) => void): () => void;
    private deliverDecrypted;
    receive(counter: number | undefined, ciphertext: Uint8Array, _source?: RtcDataChannelTransport): void;
    close(_code?: string): Promise<void>;
}
export {};
//# sourceMappingURL=server-connection.d.ts.map