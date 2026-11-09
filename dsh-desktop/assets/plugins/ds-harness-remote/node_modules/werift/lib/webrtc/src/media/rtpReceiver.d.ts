import { Event } from "../imports/common";
import { type Extensions, type RtcpPacket, type RtpPacket } from "../imports/rtp";
import type { PeerConfig } from "../peerConnection";
import type { RTCDtlsTransport } from "../transport/dtls";
import type { Kind } from "../types/domain";
import type { RTCRtpReceiveParameters } from "./parameters";
import { ReceiverTWCC } from "./receiver/receiverTwcc";
import { type RTCStats, type RTCStatsReport } from "./stats";
import { MediaStreamTrack } from "./track";
export declare class RTCRtpReceiver {
    readonly config: PeerConfig;
    kind: Kind;
    rtcpSsrc: number;
    private readonly codecs;
    private readonly defaultTrack;
    private get codecArray();
    private readonly ssrcByRtx;
    private readonly nack;
    private readonly audioRedHandler;
    readonly type = "receiver";
    readonly uuid: string;
    readonly tracks: MediaStreamTrack[];
    readonly trackBySSRC: {
        [ssrc: string]: MediaStreamTrack;
    };
    readonly trackByRID: {
        [rid: string]: MediaStreamTrack;
    };
    /**last sender Report Timestamp
     * compactNtp
     */
    readonly lastSRtimestamp: {
        [ssrc: number]: number;
    };
    /**seconds */
    readonly receiveLastSRTimestamp: {
        [ssrc: number]: number;
    };
    readonly onPacketLost: Event<[import("../imports/rtp").GenericNack]>;
    readonly onRtcp: Event<[RtcpPacket]>;
    dtlsTransport: RTCDtlsTransport;
    sdesMid?: string;
    latestRid?: string;
    latestRepairedRid?: string;
    receiverTWCC?: ReceiverTWCC;
    stopped: boolean;
    remoteStreamId?: string;
    remoteStreamIds: string[];
    remoteTrackId?: string;
    rtcpRunning: boolean;
    private rtcpCancel;
    private remoteStreams;
    private senderReportsReceivedBySsrc;
    private remoteTimestampsBySsrc;
    private remotePacketCountBySsrc;
    private remoteOctetCountBySsrc;
    private nackCountBySsrc;
    private pliCountBySsrc;
    constructor(config: PeerConfig, kind: Kind, rtcpSsrc: number);
    get transport(): RTCDtlsTransport;
    setDtlsTransport(dtls: RTCDtlsTransport): void;
    get track(): MediaStreamTrack;
    get nackEnabled(): import("./parameters").RTCPFB | undefined;
    get twccEnabled(): import("./parameters").RTCPFB | undefined;
    get pliEnabled(): import("./parameters").RTCPFB | undefined;
    prepareReceive(params: RTCRtpReceiveParameters): void;
    /**
     * setup TWCC if supported
     */
    setupTWCC(mediaSourceSsrc: number): void;
    addTrack(track: MediaStreamTrack): boolean;
    stop(): void;
    runRtcp(): Promise<void>;
    private getInboundRtpStatsId;
    private getRemoteOutboundRtpStatsId;
    getStatsRootIds(selector?: MediaStreamTrack): string[];
    collectStats(timestamp: number): RTCStats[];
    getStats(): Promise<RTCStatsReport>;
    sendRtcpPLI(mediaSsrc: number): Promise<void>;
    handleRtcpPacket(packet: RtcpPacket): void;
    handleRtpBySsrc: (packet: RtpPacket, extensions: Extensions) => void;
    handleRtpByRid: (packet: RtpPacket, rid: string, extensions: Extensions) => void;
    private handleRTP;
}
