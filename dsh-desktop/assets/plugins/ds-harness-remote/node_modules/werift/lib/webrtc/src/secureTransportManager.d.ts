import { Event } from "./imports/common";
import type { RTCRtpTransceiver, TransceiverManager } from "./media";
import type { RTCStats } from "./media/stats";
import type { PeerConfig } from "./peerConnection";
import type { SctpTransportManager } from "./sctpManager";
import type { BundlePolicy, MediaDescription, SessionDescription } from "./sdp";
import { type DtlsKeys, RTCCertificate, RTCDtlsTransport } from "./transport/dtls";
import { IceCandidate, RTCIceTransport } from "./transport/ice";
import type { IceGathererState, RTCIceCandidate, RTCIceCandidateInit, RTCIceConnectionState } from "./transport/ice";
import type { RTCSctpTransport } from "./transport/sctp";
import type { ConnectionState } from "./types/domain";
export declare class SecureTransportManager {
    connectionState: ConnectionState;
    iceConnectionState: RTCIceConnectionState;
    iceGatheringState: IceGathererState;
    certificate?: RTCCertificate;
    readonly iceGatheringStateChange: Event<["complete" | "new" | "gathering"]>;
    readonly iceConnectionStateChange: Event<["closed" | "disconnected" | "completed" | "new" | "connected" | "failed" | "checking"]>;
    readonly onIceCandidate: Event<[IceCandidate | undefined]>;
    readonly connectionStateChange: Event<["closed" | "disconnected" | "new" | "connected" | "failed" | "connecting"]>;
    private config;
    private transceiverManager;
    private sctpManager;
    constructor({ config, transceiverManager, sctpManager, }: {
        config: PeerConfig;
        transceiverManager: TransceiverManager;
        sctpManager: SctpTransportManager;
    });
    get dtlsTransports(): RTCDtlsTransport[];
    get iceTransports(): RTCIceTransport[];
    setupCertificate(keys: DtlsKeys): void;
    createTransport(): RTCDtlsTransport;
    handleNewIceCandidate({ candidate, media, remoteIsBundled, transceiver, sctpTransport, bundlePolicy, }: {
        candidate: IceCandidate;
        media?: MediaDescription;
        remoteIsBundled: boolean;
        transceiver?: RTCRtpTransceiver;
        sctpTransport?: RTCSctpTransport;
        bundlePolicy?: BundlePolicy;
    }): IceCandidate;
    addIceCandidate(sdp: SessionDescription, candidateMessage: RTCIceCandidate | RTCIceCandidateInit | null): Promise<{
        kind: "end-of-candidates";
        mediaIndices: number[];
        candidate?: undefined;
    } | {
        kind: "candidate";
        candidate: IceCandidate;
        mediaIndices: number[];
    }>;
    private resolveCandidateMediaIndices;
    private getTransportByMid;
    private getTransportByMLineIndex;
    restartIce(): void;
    setLocalRole({ type, role, }: {
        type: "offer" | "answer";
        role: "auto" | "client" | "server" | undefined;
    }): void;
    private updateIceGatheringState;
    updateIceConnectionState(): void;
    gatherCandidates(remoteIsBundled: boolean): Promise<void>;
    setConnectionState(state: ConnectionState): void;
    getStats(timestamp?: number): Promise<RTCStats[]>;
    ensureCerts(): Promise<void>;
    close(): Promise<void>;
}
