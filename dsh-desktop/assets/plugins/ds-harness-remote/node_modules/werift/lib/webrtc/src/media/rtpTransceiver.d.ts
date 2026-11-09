import { Event } from "../imports/common";
import type { RTCDtlsTransport } from "..";
import type { Kind } from "../types/domain";
import type { RTCRtpCodecParameters, RTCRtpHeaderExtensionParameters } from "./parameters";
import type { RTCRtpReceiver } from "./rtpReceiver";
import type { RTCRtpSender } from "./rtpSender";
import { type RTCStats } from "./stats";
import type { MediaStream, MediaStreamTrack } from "./track";
export declare class RTCRtpTransceiver {
    readonly kind: Kind;
    receiver: RTCRtpReceiver;
    sender: RTCRtpSender;
    /**RFC 8829 4.2.4.  direction the transceiver was initialized with */
    private _direction;
    readonly id: string;
    readonly onTrack: Event<[MediaStreamTrack, RTCRtpTransceiver]>;
    mid: string | null;
    mLineIndex?: number;
    /**should not be reused because it has been used for sending before. */
    usedForSender: boolean;
    private _currentDirection?;
    offerDirection: MediaDirection;
    _codecs: RTCRtpCodecParameters[];
    set codecs(codecs: RTCRtpCodecParameters[]);
    get codecs(): RTCRtpCodecParameters[];
    headerExtensions: RTCRtpHeaderExtensionParameters[];
    options: Partial<TransceiverOptions>;
    stopping: boolean;
    stopped: boolean;
    constructor(kind: Kind, dtlsTransport: RTCDtlsTransport | undefined, receiver: RTCRtpReceiver, sender: RTCRtpSender, 
    /**RFC 8829 4.2.4.  direction the transceiver was initialized with */
    _direction: MediaDirection);
    get dtlsTransport(): RTCDtlsTransport;
    /**RFC 8829 4.2.4. setDirectionに渡された最後の値を示します */
    get direction(): MediaDirection;
    set direction(direction: MediaDirection);
    setDirection(direction: MediaDirection): void;
    /**RFC 8829 4.2.5. last negotiated direction */
    get currentDirection(): CurrentDirection | null;
    setCurrentDirection(direction: CurrentDirection | undefined): void;
    setDtlsTransport(dtls: RTCDtlsTransport): void;
    get msid(): string;
    get msids(): string[];
    addTrack(track: MediaStreamTrack): void;
    stop(): void;
    forceStop(): void;
    getPayloadType(mimeType: string): number | undefined;
    getCodecStats(): RTCStats[];
    collectCodecStats(timestamp: number): RTCStats[];
}
export declare const Inactive = "inactive";
export declare const Sendonly = "sendonly";
export declare const Recvonly = "recvonly";
export declare const Sendrecv = "sendrecv";
export declare const Directions: readonly ["inactive", "sendonly", "recvonly", "sendrecv"];
export type MediaDirection = (typeof Directions)[number];
export type CurrentDirection = MediaDirection | "stopped";
type SimulcastDirection = "send" | "recv";
export interface RTCRtpEncodingParameters {
    active?: boolean;
}
export interface TransceiverOptions {
    direction: MediaDirection;
    sendEncodings: RTCRtpEncodingParameters[];
    simulcast: {
        direction: SimulcastDirection;
        rid: string;
    }[];
    streams: MediaStream[];
}
export {};
