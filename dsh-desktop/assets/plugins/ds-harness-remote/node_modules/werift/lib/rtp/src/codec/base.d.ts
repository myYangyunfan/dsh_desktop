import type { RtpHeader } from "../rtp/rtp";
export declare abstract class DePacketizerBase {
    payload: Buffer;
    fragment?: Buffer;
    static deSerialize(buf: Buffer, fragment?: Buffer): DePacketizerBase;
    static isDetectedFinalPacketInSequence(header: RtpHeader): boolean;
    get isKeyframe(): boolean;
}
