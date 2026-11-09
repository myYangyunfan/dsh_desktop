import { RtpPacket } from "./rtp";
export declare function unwrapRtx(rtx: RtpPacket, payloadType: number, ssrc: number): RtpPacket;
export declare function wrapRtx(packet: RtpPacket, payloadType: number, sequenceNumber: number, ssrc: number): RtpPacket;
