import { Event } from "../imports/common";
import { EventTarget } from "../helper";
import { type Extensions, type RtcpPacket, type RtpHeader, RtpPacket } from "../imports/rtp";
import type { Kind } from "../types/domain";
import type { RTCRtpCodecParameters } from "./parameters";
export declare class MediaStreamTrack extends EventTarget {
    readonly uuid: string;
    /**MediaStream ID*/
    streamId?: string;
    remote: boolean;
    label: string;
    kind: Kind;
    id?: string;
    /**mediaSsrc */
    ssrc?: number;
    rid?: string;
    header?: RtpHeader;
    codec?: RTCRtpCodecParameters;
    /**todo impl */
    enabled: boolean;
    readonly onReceiveRtp: Event<[RtpPacket, (Extensions | undefined)?]>;
    readonly onReceiveRtcp: Event<[RtcpPacket]>;
    readonly onSourceChanged: Event<[Pick<RtpHeader, "sequenceNumber" | "timestamp">]>;
    stopped: boolean;
    muted: boolean;
    constructor(props: Partial<MediaStreamTrack> & Pick<MediaStreamTrack, "kind">);
    stop: () => void;
    writeRtp: (rtp: RtpPacket | Buffer) => void;
}
export declare class MediaStream {
    id: string;
    tracks: MediaStreamTrack[];
    constructor(props?: Partial<MediaStream> | MediaStreamTrack[]);
    addTrack(track: MediaStreamTrack): void;
    removeTrack(track: MediaStreamTrack): void;
    getTracks(): MediaStreamTrack[];
    getAudioTracks(): MediaStreamTrack[];
    getVideoTracks(): MediaStreamTrack[];
}
