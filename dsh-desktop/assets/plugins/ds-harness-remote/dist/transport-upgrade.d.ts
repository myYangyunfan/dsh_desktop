import { TRANSPORT_UPGRADE_CAPABILITY, unwrapUpgradedTransportFrame, wrapUpgradedTransportFrame, type RemoteMessage, type TransportTier } from '@dsh-remote/protocol';
import { RtcDataChannelTransport, type RtcIceServer, type RtcPeerConnectionFactory } from '@dsh-remote/webrtc';
import type { SafeLogger } from './logging.js';
export { TRANSPORT_UPGRADE_CAPABILITY, wrapUpgradedTransportFrame, unwrapUpgradedTransportFrame, type TransportTier };
export interface TransportUpgradeHostOptions {
    connectionId: string;
    peerDeviceId: string;
    currentMode: () => TransportTier | undefined;
    outboundCounter: () => number;
    loadRtcFactory: () => Promise<RtcPeerConnectionFactory | undefined>;
    fetchIceServers: (connectionId: string) => Promise<RtcIceServer[]>;
    onReceiveSequencedCiphertext: (counter: number, ciphertext: Uint8Array, source: RtcDataChannelTransport) => void;
    adoptRtc: (rtc: RtcDataChannelTransport, mode: 'LAN' | 'P2P' | 'TURN', attemptId: string) => Promise<number>;
    confirmPreviousLegDrain?: (attemptId: string, clientPreviousLegEndCounter: number) => void;
    publishEvent: (message: RemoteMessage) => Promise<void>;
    logger?: SafeLogger;
    attemptTtlMs?: number;
}
/**
 * Per-connection responder for in-band WebRTC transport upgrades
 * (`Relay -> TURN -> P2P -> LAN`).
 *
 * Path tier classification strictly trusts the Host's own verified ICE
 * candidate-pair stats (`rtc.connectionDetails()`); client hints can never
 * elevate a lower-tier path into `LAN` or `P2P`.
 */
export declare class TransportUpgradeHost {
    private readonly options;
    private candidate?;
    private closed;
    private offerEpoch;
    private activating;
    constructor(options: TransportUpgradeHostOptions);
    offer(rawParams: unknown): Promise<{
        attemptId: string;
        sdp: string;
    }>;
    addIce(rawParams: unknown): Promise<{
        ok: true;
    }>;
    activate(rawParams: unknown): Promise<{
        activated: boolean;
        mode: TransportTier;
        previousLegEndCounter?: number;
    }>;
    drain(rawParams: unknown): Promise<{
        ok: true;
    }>;
    abort(rawParams: unknown): Promise<{
        ok: true;
    }>;
    closeAll(): Promise<void>;
    private clearCandidate;
    private disposeAttempt;
}
//# sourceMappingURL=transport-upgrade.d.ts.map