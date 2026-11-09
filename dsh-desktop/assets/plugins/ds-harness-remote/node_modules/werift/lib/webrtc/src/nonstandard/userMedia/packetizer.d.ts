import { RtpPacket } from "../../imports/rtp";
import type { RTCRtpCodecParameters } from "../../media/parameters";
import type { EncodedPacket } from "mediabunny";
export declare const supportedSourceCodecs: readonly ["avc", "vp8", "vp9", "av1", "opus"];
export type SupportedSourceCodec = (typeof supportedSourceCodecs)[number];
type SupportedMimeType = "video/h264" | "video/vp8" | "video/vp9" | "video/av1x" | "audio/opus";
export interface Packetizer {
    packetize(packet: EncodedPacket, rtpTimestamp: number): RtpPacket[];
}
export declare function toSupportedMimeType(codec: SupportedSourceCodec): SupportedMimeType;
export declare function createPacketizer({ codec, sourceCodec, decoderDescription, }: {
    codec: RTCRtpCodecParameters;
    sourceCodec: SupportedSourceCodec;
    decoderDescription?: ArrayBuffer | ArrayBufferView | null;
}): Packetizer;
export {};
