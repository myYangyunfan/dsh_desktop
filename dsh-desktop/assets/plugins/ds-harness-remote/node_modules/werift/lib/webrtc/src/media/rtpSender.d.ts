/**
   [10 Nov 1995 11:33:25.125 UTC]       [10 Nov 1995 11:33:36.5 UTC]
   n                 SR(n)              A=b710:8000 (46864.500 s)
   ---------------------------------------------------------------->
                      v                 ^
   ntp_sec =0xb44db705 v               ^ dlsr=0x0005:4000 (    5.250s)
   ntp_frac=0x20000000  v             ^  lsr =0xb705:2000 (46853.125s)
     (3024992005.125 s)  v           ^
   r                      v         ^ RR(n)
   ---------------------------------------------------------------->
                          |<-DLSR->|
                           (5.250 s)
        
   A     0xb710:8000 (46864.500 s)
   DLSR -0x0005:4000 (    5.250 s)
   LSR  -0xb705:2000 (46853.125 s)
   -------------------------------
   delay 0x0006:2000 (    6.125 s)
        
Figure 2: Example for round-trip time computation
 */
import { Event } from "../imports/common";
import { GenericNack, RedEncoder, type RtcpPacket, type RtpHeader, RtpPacket } from "../imports/rtp";
import type { RTCDtlsTransport } from "../transport/dtls";
import type { Kind } from "../types/domain";
import type { RTCRtpCodecParameters, RTCRtpSendParameters } from "./parameters";
import { SenderBandwidthEstimator } from "./sender/senderBWE";
import { type RTCStats, type RTCStatsReport } from "./stats";
import type { MediaStream, MediaStreamTrack } from "./track";
export declare class RTCRtpSender {
    trackOrKind: Kind | MediaStreamTrack;
    readonly type = "sender";
    readonly kind: Kind;
    readonly ssrc: number;
    readonly rtxSsrc: number;
    readonly trackId: string;
    readonly onReady: Event<any[]>;
    readonly onRtcp: Event<[RtcpPacket]>;
    readonly onPictureLossIndication: Event<[]>;
    readonly onGenericNack: Event<[GenericNack]>;
    readonly senderBWE: SenderBandwidthEstimator;
    private cname?;
    private mid?;
    private rtpStreamId?;
    private repairedRtpStreamId?;
    private rtxPayloadType?;
    private rtxSequenceNumber;
    redRedundantPayloadType?: number;
    private _redDistance;
    redEncoder: RedEncoder;
    private headerExtensions;
    private disposeTrack?;
    private sendEncodings;
    private lastSRtimestamp?;
    private lastSentSRTimestamp?;
    private ntpTimestamp;
    private rtpTimestamp;
    private octetCount;
    private packetCount;
    private headerBytesSent;
    private rtt?;
    private totalRoundTripTime;
    private roundTripTimeMeasurements;
    private retransmittedPacketsSent;
    private retransmittedBytesSent;
    private nackCount;
    private pliCount;
    private firCount;
    private remotePacketsLost?;
    private remoteFractionLost?;
    receiverEstimatedMaxBitrate: bigint;
    private sequenceNumber?;
    private timestamp?;
    private timestampOffset;
    private seqOffset;
    private rtpCache;
    codec?: RTCRtpCodecParameters;
    dtlsTransport: RTCDtlsTransport;
    private dtlsDisposer;
    track: MediaStreamTrack | null;
    streamIds: string[];
    stopped: boolean;
    rtcpRunning: boolean;
    private rtcpCancel;
    constructor(trackOrKind: Kind | MediaStreamTrack);
    get transport(): RTCDtlsTransport;
    get streamId(): string | undefined;
    set streamId(value: string | undefined);
    setDtlsTransport(dtlsTransport: RTCDtlsTransport): void;
    get redDistance(): number;
    set redDistance(n: number);
    prepareSend(params: RTCRtpSendParameters): void;
    registerTrack(track: MediaStreamTrack): void;
    setStreams(streams?: MediaStream[]): void;
    setSendEncodings(encodings?: Array<Record<string, unknown>>): void;
    replaceTrack(track: MediaStreamTrack | null): Promise<void>;
    stop(): void;
    runRtcp(): Promise<void>;
    replaceRTP({ sequenceNumber, timestamp, }: Pick<RtpHeader, "sequenceNumber" | "timestamp">, discontinuity?: boolean): void;
    sendRtp(rtp: Buffer | RtpPacket): Promise<void>;
    handleRtcpPacket(rtcpPacket: RtcpPacket): void;
    getParameters(): {
        encodings: {
            [x: string]: unknown;
        }[];
    };
    setParameters(params: {
        encodings?: Array<Record<string, unknown>>;
    }): void;
    private get outboundRtpStatsId();
    private get mediaSourceStatsId();
    private get remoteInboundRtpStatsId();
    getStatsRootIds(): string[];
    collectStats(timestamp: number): RTCStats[];
    getStats(): Promise<RTCStatsReport>;
}
