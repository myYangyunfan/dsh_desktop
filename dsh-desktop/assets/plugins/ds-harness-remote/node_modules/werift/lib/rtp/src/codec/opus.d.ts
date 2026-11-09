import type { RtpHeader } from "../rtp/rtp";
import type { DePacketizerBase } from "./base";
export declare class OpusRtpPayload implements DePacketizerBase {
    payload: Buffer;
    static deSerialize(buf: Buffer): OpusRtpPayload;
    static isDetectedFinalPacketInSequence(header: RtpHeader): boolean;
    get isKeyframe(): boolean;
    static createCodecPrivate(samplingFrequency?: number): Buffer<ArrayBuffer>;
}
