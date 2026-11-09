import type { RTCDataChannel } from "./dataChannel";
import { EventTarget } from "./helper";
import { type Address, Event, type InterfaceAddresses, type TlsConnectionOptions } from "./imports/common";
import type { CandidatePair, Message, Protocol } from "./imports/ice";
import { type MediaStream, type MediaStreamTrack, type RTCRtpCodecParameters, type RTCRtpHeaderExtensionParameters, type RTCRtpReceiver, type RTCRtpSender, type RTCRtpTransceiver, type TransceiverOptions } from "./media";
import { type RTCStatsReport } from "./media/stats";
import { type BundlePolicy, type RTCSessionDescription, SessionDescription } from "./sdp";
import { type RTCSessionDescriptionInit } from "./sdpManager";
import type { DtlsKeys, RTCCertificate, RTCDtlsTransport } from "./transport/dtls";
import type { RTCIceCandidate, RTCIceCandidateInit, RTCIceTransport } from "./transport/ice";
import { type RTCSctpTransport } from "./transport/sctp";
import type { Kind, RTCSignalingState } from "./types/domain";
import type { Callback, CallbackWithValue } from "./types/util";
/**
 * W3C compatibility notes kept near the public RTCPeerConnection surface so the
 * reviewable diff does not depend on external PR text.
 *
 * - `current/pending*Description`, `canTrickleIceCandidates`, `sctp`,
 *   `addIceCandidate(null)`, and `RTCConfiguration` round-trip behavior are
 *   implemented here and covered by `tests/wpt/peerConnectionApiCompatibility.test.ts`.
 * - `addIceCandidate()` also validates `sdpMid` / `sdpMLineIndex` /
 *   `usernameFragment` against the applied remote description and appends
 *   candidates or end-of-candidates markers to the corresponding m-section.
 *   The public API keeps werift's historical pre-SRD buffering behavior, while
 *   the WPT runner wraps the class to exercise strict spec rejection.
 * - `bundlePolicy: "balanced"` is accepted for input compatibility but is
 *   normalized to werift's `"max-compat"` behavior, so `getConfiguration()`
 *   returns the normalized value.
 * - `setLocalDescription()` keeps the historical `SessionDescription` return
 *   value for non-rollback calls, while `{ type: "rollback" }` resolves `void`
 *   to match the actual behavior without pretending to return a description.
 * - API reference markdown is regenerated with `cd packages/webrtc && npm run doc`.
 *   The generated output lives under `packages/webrtc/doc/`; compatibility
 *   notes remain here and in the package README so review context is visible
 *   even when generated docs are not committed in the same change.
 */
export declare class RTCPeerConnection extends EventTarget {
    readonly id: string;
    readonly cname: string;
    config: Required<PeerConfig>;
    signalingState: RTCSignalingState;
    negotiationneeded: boolean;
    needRestart: boolean;
    private readonly router;
    private readonly sdpManager;
    private readonly transceiverManager;
    private readonly sctpManager;
    private readonly secureManager;
    private isClosed;
    private shouldNegotiationneeded;
    private lastCreatedAnswer?;
    private lastCreatedOffer?;
    private readonly pendingRemoteCandidates;
    readonly iceGatheringStateChange: Event<["complete" | "new" | "gathering"]>;
    readonly iceConnectionStateChange: Event<["closed" | "disconnected" | "completed" | "new" | "connected" | "failed" | "checking"]>;
    readonly signalingStateChange: Event<["closed" | "stable" | "have-local-offer" | "have-remote-offer" | "have-local-pranswer" | "have-remote-pranswer"]>;
    readonly connectionStateChange: Event<["closed" | "disconnected" | "new" | "connected" | "failed" | "connecting"]>;
    readonly onDataChannel: Event<[RTCDataChannel]>;
    readonly onRemoteTransceiverAdded: Event<[RTCRtpTransceiver]>;
    readonly onTransceiverAdded: Event<[RTCRtpTransceiver]>;
    readonly onIceCandidate: Event<[RTCIceCandidate | undefined]>;
    readonly onNegotiationneeded: Event<[]>;
    readonly onTrack: Event<[MediaStreamTrack]>;
    private readonly eventHandlers;
    get ondatachannel(): CallbackWithValue<RTCDataChannelEvent> | null;
    set ondatachannel(value: CallbackWithValue<RTCDataChannelEvent> | null);
    get onicecandidate(): CallbackWithValue<RTCPeerConnectionIceEvent> | null;
    set onicecandidate(value: CallbackWithValue<RTCPeerConnectionIceEvent> | null);
    get onicecandidateerror(): CallbackWithValue<any> | null;
    set onicecandidateerror(value: CallbackWithValue<any> | null);
    get onicegatheringstatechange(): CallbackWithValue<any> | null;
    set onicegatheringstatechange(value: CallbackWithValue<any> | null);
    get onnegotiationneeded(): CallbackWithValue<any> | null;
    set onnegotiationneeded(value: CallbackWithValue<any> | null);
    get onsignalingstatechange(): CallbackWithValue<any> | null;
    set onsignalingstatechange(value: CallbackWithValue<any> | null);
    get ontrack(): CallbackWithValue<RTCTrackEvent> | null;
    set ontrack(value: CallbackWithValue<RTCTrackEvent> | null);
    get onconnectionstatechange(): Callback | null;
    set onconnectionstatechange(value: Callback | null);
    get oniceconnectionstatechange(): Callback | null;
    set oniceconnectionstatechange(value: Callback | null);
    constructor(config?: RTCPeerConnectionConfig);
    get connectionState(): "closed" | "disconnected" | "new" | "connected" | "failed" | "connecting";
    get iceConnectionState(): "closed" | "disconnected" | "completed" | "new" | "connected" | "failed" | "checking";
    get iceGathererState(): "complete" | "new" | "gathering";
    get iceGatheringState(): "complete" | "new" | "gathering";
    get dtlsTransports(): RTCDtlsTransport[];
    get sctpTransport(): RTCSctpTransport | undefined;
    get sctp(): RTCSctpTransport | null;
    get sctpRemotePort(): number | undefined;
    get iceTransports(): RTCIceTransport[];
    get extIdUriMap(): {
        [id: number]: string;
    };
    get iceGeneration(): number;
    get localDescription(): RTCSessionDescription | null;
    get currentLocalDescription(): RTCSessionDescription | null;
    get pendingLocalDescription(): RTCSessionDescription | null;
    get remoteDescription(): RTCSessionDescription | null;
    get currentRemoteDescription(): RTCSessionDescription | null;
    get pendingRemoteDescription(): RTCSessionDescription | null;
    get canTrickleIceCandidates(): boolean | null;
    get remoteIsBundled(): import("./sdp").GroupDescription | undefined;
    /**@private */
    get _localDescription(): SessionDescription | undefined;
    /**@private */
    get _remoteDescription(): SessionDescription | undefined;
    getTransceivers(): RTCRtpTransceiver[];
    getSenders(): RTCRtpSender[];
    getReceivers(): RTCRtpReceiver[];
    setConfiguration(config: RTCPeerConnectionConfig): void;
    getConfiguration(): {
        codecs: {
            audio: RTCRtpCodecParameters[] | undefined;
            video: RTCRtpCodecParameters[] | undefined;
        };
        headerExtensions: {
            audio: RTCRtpHeaderExtensionParameters[] | undefined;
            video: RTCRtpHeaderExtensionParameters[] | undefined;
        };
        iceServers: {
            urls: string | string[];
            username?: string;
            credential?: string;
        }[];
        icePortRange: [number, number] | undefined;
        iceAdditionalHostAddresses: string[] | undefined;
        dtls: {
            keys?: DtlsKeys | undefined;
        };
        certificates: RTCCertificate[];
        debug: {
            inboundPacketLoss?: number | undefined;
            outboundPacketLoss?: number | undefined;
            receiverReportDelay?: number | undefined;
            disableSendNack?: boolean | undefined;
            disableRecvRetransmit?: boolean | undefined;
        };
        iceTransportPolicy: "all" | "relay";
        /** Advertise local ICE lite and operate in the controlled role. */
        iceLite: boolean;
        iceInterfaceAddresses: InterfaceAddresses | undefined;
        iceUseIpv4: boolean;
        iceUseIpv6: boolean;
        iceUseTcp: boolean;
        turnTransport: "udp" | "tcp" | "tls" | undefined;
        turnTlsOptions: TlsConnectionOptions | undefined;
        /** @deprecated Prefer turn URL transport parameters or turnTransport. */
        forceTurnTCP: boolean;
        /** such as google cloud run */
        iceUseLinkLocalAddress: boolean | undefined;
        /** If provided, is called on each STUN request.
         * Return `true` if a STUN response should be sent, false if it should be skipped. */
        iceFilterStunResponse: ((message: Message, addr: Address, protocol: Protocol) => boolean) | undefined;
        iceFilterCandidatePair: ((pair: CandidatePair) => boolean) | undefined;
        icePasswordPrefix: string | undefined;
        bundlePolicy: BundlePolicy;
        rtcpMuxPolicy: "require";
        iceCandidatePoolSize: number;
        midSuffix: boolean;
        /** Advertised local SCTP max-message-size in SDP. Use 0 for unlimited. */
        maxMessageSize: number;
    };
    createOffer({ iceRestart }?: {
        iceRestart?: boolean;
    }): Promise<RTCSessionDescription>;
    private createSctpTransport;
    createDataChannel(label: string, options?: Partial<{
        maxPacketLifeTime?: number;
        protocol: string;
        maxRetransmits?: number;
        ordered: boolean;
        negotiated: boolean;
        id?: number;
    }>): RTCDataChannel;
    removeTrack(sender: RTCRtpSender): void;
    private needNegotiation;
    private invalidateLastCreatedDescriptions;
    private waitForPendingDescriptionTask;
    private findOrCreateTransport;
    setLocalDescription(sessionDescription: {
        type: "rollback";
    }): Promise<void>;
    setLocalDescription(sessionDescription?: RTCLocalSessionDescriptionInit): Promise<SessionDescription>;
    private gatherCandidates;
    addIceCandidate(candidateMessage?: RTCIceCandidate | RTCIceCandidateInit | null): Promise<void>;
    private applyRemoteIceCandidate;
    private flushPendingRemoteCandidates;
    private connect;
    restartIce(): void;
    setRemoteDescription(sessionDescription: RTCSessionDescriptionInit): Promise<void>;
    addTransceiver(trackOrKind: Kind | MediaStreamTrack, options?: Partial<TransceiverOptions>): RTCRtpTransceiver;
    addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender;
    createAnswer(): Promise<RTCSessionDescription>;
    private assertNotClosed;
    private setSignalingState;
    private createPeerConnectionStats;
    getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport>;
    close(): Promise<void>;
    private completePeerEvents;
}
export type DebugConfig = Partial<{
    /**% */
    inboundPacketLoss: number;
    /**% */
    outboundPacketLoss: number;
    /**ms */
    receiverReportDelay: number;
    disableSendNack: boolean;
    disableRecvRetransmit: boolean;
}>;
export interface PeerConfig {
    codecs: Partial<{
        /**
         * When specifying a codec with a fixed payloadType such as PCMU,
         * it is necessary to set the correct PayloadType in RTCRtpCodecParameters in advance.
         */
        audio: RTCRtpCodecParameters[];
        video: RTCRtpCodecParameters[];
    }>;
    headerExtensions: Partial<{
        audio: RTCRtpHeaderExtensionParameters[];
        video: RTCRtpHeaderExtensionParameters[];
    }>;
    iceTransportPolicy: "all" | "relay";
    /** Advertise local ICE lite and operate in the controlled role. */
    iceLite: boolean;
    iceServers: RTCIceServer[];
    /**Minimum port and Maximum port must not be the same value */
    icePortRange: [number, number] | undefined;
    iceInterfaceAddresses: InterfaceAddresses | undefined;
    /** Add additional host (local) addresses to use for candidate gathering.
     * Notably, you can include hosts that are normally excluded, such as loopback, tun interfaces, etc.
     */
    iceAdditionalHostAddresses: string[] | undefined;
    iceUseIpv4: boolean;
    iceUseIpv6: boolean;
    iceUseTcp: boolean;
    turnTransport: "udp" | "tcp" | "tls" | undefined;
    turnTlsOptions: TlsConnectionOptions | undefined;
    /** @deprecated Prefer turn URL transport parameters or turnTransport. */
    forceTurnTCP: boolean;
    /** such as google cloud run */
    iceUseLinkLocalAddress: boolean | undefined;
    /** If provided, is called on each STUN request.
     * Return `true` if a STUN response should be sent, false if it should be skipped. */
    iceFilterStunResponse: ((message: Message, addr: Address, protocol: Protocol) => boolean) | undefined;
    iceFilterCandidatePair: ((pair: CandidatePair) => boolean) | undefined;
    dtls: Partial<{
        keys: DtlsKeys;
    }>;
    icePasswordPrefix: string | undefined;
    bundlePolicy: BundlePolicy;
    rtcpMuxPolicy: "require";
    iceCandidatePoolSize: number;
    certificates: RTCCertificate[];
    debug: DebugConfig;
    midSuffix: boolean;
    /** Advertised local SCTP max-message-size in SDP. Use 0 for unlimited. */
    maxMessageSize: number;
}
export declare const findCodecByMimeType: (codecs: RTCRtpCodecParameters[], target: RTCRtpCodecParameters) => RTCRtpCodecParameters | undefined;
export type RTCIceServer = {
    urls: string | string[];
    username?: string;
    credential?: string;
};
export type RTCBundlePolicy = "balanced" | "max-compat" | "max-bundle";
export type RTCRtcpMuxPolicy = "require";
export interface RTCConfiguration {
    iceServers?: RTCIceServer[];
    iceTransportPolicy?: PeerConfig["iceTransportPolicy"];
    bundlePolicy?: RTCBundlePolicy;
    rtcpMuxPolicy?: RTCRtcpMuxPolicy;
    iceCandidatePoolSize?: number;
    certificates?: RTCCertificate[];
}
export interface RTCLocalSessionDescriptionInit extends RTCSessionDescriptionInit {
    type?: Exclude<RTCSessionDescriptionInit["type"], "rollback"> | "rollback";
}
type RTCPeerConnectionRTCConfiguration = Omit<RTCConfiguration, "bundlePolicy"> & {
    bundlePolicy?: PeerConfig["bundlePolicy"] | RTCBundlePolicy;
};
export type RTCPeerConnectionConfig = Partial<Omit<PeerConfig, "bundlePolicy" | "rtcpMuxPolicy" | "iceCandidatePoolSize" | "certificates">> & RTCPeerConnectionRTCConfiguration;
export declare const defaultPeerConfig: PeerConfig;
export declare class RTCTrackEvent {
    readonly type = "track";
    readonly track: MediaStreamTrack;
    readonly streams: MediaStream[];
    readonly transceiver: RTCRtpTransceiver;
    readonly receiver: RTCRtpReceiver;
    constructor(init: {
        track: MediaStreamTrack;
        streams: MediaStream[];
        transceiver: RTCRtpTransceiver;
        receiver: RTCRtpReceiver;
    });
}
export interface RTCDataChannelEvent {
    type?: "datachannel";
    channel: RTCDataChannel;
}
export interface RTCPeerConnectionIceEvent {
    type?: "icecandidate";
    candidate?: RTCIceCandidate;
}
export {};
