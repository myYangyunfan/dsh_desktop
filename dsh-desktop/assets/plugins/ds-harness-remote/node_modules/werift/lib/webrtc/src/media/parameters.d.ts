import type { MediaDirection } from "./rtpTransceiver";
export interface RTCRtpParameters {
    codecs: RTCRtpCodecParameters[];
    headerExtensions: RTCRtpHeaderExtensionParameters[];
    muxId?: string;
    rtpStreamId?: string;
    repairedRtpStreamId?: string;
    rtcp?: RTCRtcpParameters;
}
export type RTCPFB = {
    type: string;
    parameter?: string;
};
export declare class RTCRtpCodecParameters {
    /**
     * When specifying a codec with a fixed payloadType such as PCMU,
     * it is necessary to set the correct PayloadType in RTCRtpCodecParameters in advance.
     */
    payloadType: number;
    mimeType: string;
    clockRate: number;
    channels?: number;
    rtcpFeedback: RTCPFB[];
    parameters?: string;
    direction: MediaDirection | "all";
    constructor(props: Pick<RTCRtpCodecParameters, "mimeType" | "clockRate"> & Partial<RTCRtpCodecParameters>);
    get name(): string;
    get contentType(): string;
    get str(): string;
}
export declare class RTCRtpHeaderExtensionParameters {
    id: number;
    uri: string;
    constructor(props: Partial<RTCRtpHeaderExtensionParameters> & Pick<RTCRtpHeaderExtensionParameters, "uri">);
}
export declare class RTCRtcpParameters {
    cname?: string;
    mux: boolean;
    ssrc?: number;
    constructor(props?: Partial<RTCRtcpParameters>);
}
export declare class RTCRtcpFeedback {
    type: string;
    parameter?: string;
    constructor(props?: Partial<RTCRtcpFeedback>);
}
export declare class RTCRtpRtxParameters {
    ssrc: number;
    constructor(props?: Partial<RTCRtpRtxParameters>);
}
export declare class RTCRtpCodingParameters {
    ssrc: number;
    payloadType: number;
    rtx?: RTCRtpRtxParameters;
    constructor(props: Partial<RTCRtpCodingParameters> & Pick<RTCRtpCodingParameters, "ssrc" | "payloadType">);
}
export interface RTCRtpReceiveParameters extends RTCRtpParameters {
    encodings: RTCRtpCodingParameters[];
}
export type RTCRtpSendParameters = RTCRtpParameters;
export declare class RTCRtpSimulcastParameters {
    rid: string;
    direction: "send" | "recv";
    constructor(props: RTCRtpSimulcastParameters);
}
