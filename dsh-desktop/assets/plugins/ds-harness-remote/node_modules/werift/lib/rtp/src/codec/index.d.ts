import type { RtpPacket } from "../rtp/rtp";
export * from "./av1";
export * from "./base";
export * from "./h264";
export * from "./opus";
export * from "./vp8";
export * from "./vp9";
export declare function dePacketizeRtpPackets(codec: DepacketizerCodec, packets: RtpPacket[], frameFragmentBuffer?: Buffer): {
    isKeyframe: boolean;
    data: Buffer;
    sequence: number;
    timestamp: number;
    frameFragmentBuffer?: Buffer;
};
export declare const depacketizerCodecs: readonly ["MPEG4/ISO/AVC", "VP8", "VP9", "OPUS", "AV1"];
export type DepacketizerCodec = (typeof depacketizerCodecs)[number] | Lowercase<(typeof depacketizerCodecs)[number]>;
