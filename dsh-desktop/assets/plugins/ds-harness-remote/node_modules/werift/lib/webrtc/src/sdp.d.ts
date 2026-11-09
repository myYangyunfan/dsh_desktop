import { type RTCRtpParameters, RTCRtpSimulcastParameters } from "./media/parameters";
import type { MediaDirection } from "./media/rtpTransceiver";
import { type DtlsRole, RTCDtlsFingerprint, RTCDtlsParameters } from "./transport/dtls";
import { type IceCandidate, RTCIceParameters } from "./transport/ice";
import { RTCSctpCapabilities } from "./transport/sctp";
import type { Kind } from "./types/domain";
export declare class SessionDescription {
    version: number;
    origin?: string;
    name: string;
    time: string;
    host?: string;
    group: GroupDescription[];
    extMapAllowMixed: boolean;
    msidSemantic: GroupDescription[];
    media: MediaDescription[];
    type: "offer" | "answer" | "pranswer";
    dtlsRole: DtlsRole;
    iceOptions: string;
    iceLite: boolean;
    icePassword: string;
    iceUsernameFragment: string;
    dtlsFingerprints: RTCDtlsFingerprint[];
    private cachedJson?;
    static parse(sdp: string): SessionDescription;
    webrtcTrackId(media: MediaDescription): string | undefined;
    get string(): string;
    toJSON(): RTCSessionDescription;
    toSdp(): {
        type: "offer" | "answer" | "pranswer";
        sdp: string;
    };
}
export declare class MediaDescription {
    kind: Kind;
    port: number;
    profile: string;
    fmt: string[] | number[];
    host?: string;
    direction?: MediaDirection;
    msids: string[];
    rtcpPort?: number;
    rtcpHost?: string;
    rtcpMux: boolean;
    ssrc: SsrcDescription[];
    ssrcGroup: GroupDescription[];
    rtp: RTCRtpParameters;
    sctpCapabilities?: RTCSctpCapabilities;
    sctpMap: {
        [key: number]: string;
    };
    sctpPort?: number;
    dtlsParams?: RTCDtlsParameters;
    iceParams?: RTCIceParameters;
    iceCandidates: IceCandidate[];
    iceCandidatesComplete: boolean;
    iceOptions?: string;
    simulcastParameters: RTCRtpSimulcastParameters[];
    constructor(kind: Kind, port: number, profile: string, fmt: string[] | number[]);
    get msid(): string | undefined;
    set msid(value: string | undefined);
    toString(): string;
}
export declare class GroupDescription {
    semantic: string;
    items: string[];
    constructor(semantic: string, items: string[]);
    get str(): string;
}
export declare function candidateToSdp(c: IceCandidate): string;
export declare function parseGroup(dest: GroupDescription[], value: string, type?: (v: string) => any): void;
export declare function candidateFromSdp(sdp: string): IceCandidate;
export declare class RTCSessionDescription {
    readonly sdp: string;
    readonly type: "offer" | "answer" | "pranswer";
    constructor(sdp: string, type: "offer" | "answer" | "pranswer");
    static isThis(o: any): true | undefined;
    toSdp(): {
        sdp: string;
        type: "offer" | "answer" | "pranswer";
    };
}
export declare function addSDPHeader(type: "offer" | "answer", description: SessionDescription): void;
export declare function codecParametersFromString(str: string): any;
export declare function codecParametersToString(parameters: {
    [key: string]: string | number;
}, joint?: string): string | undefined;
export declare class SsrcDescription {
    ssrc: number;
    cname?: string;
    msid?: string;
    msLabel?: string;
    label?: string;
    constructor(props: Partial<SsrcDescription>);
}
export type BundlePolicy = "max-compat" | "max-bundle" | "disable";
