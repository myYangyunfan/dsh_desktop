import type { RtpHeader } from "../rtp/rtp";
import type { DePacketizerBase } from "./base";
export declare class H264RtpPayload implements DePacketizerBase {
    /**forbidden_zero_bit */
    f: number;
    /**nal_ref_idc */
    nri: number;
    /**nal_unit_types */
    nalUnitType: number;
    /**start of a fragmented NAL unit */
    s: number;
    /**end of a fragmented NAL unit */
    e: number;
    r: number;
    nalUnitPayloadType: number;
    payload: Buffer;
    fragment?: Buffer;
    static deSerialize(buf: Buffer, fragment?: Buffer): H264RtpPayload;
    private static packaging;
    static isDetectedFinalPacketInSequence(header: RtpHeader): boolean;
    get isKeyframe(): boolean;
    get isPartitionHead(): boolean;
}
export declare const NalUnitType: {
    readonly idrSlice: 5;
    readonly stap_a: 24;
    readonly stap_b: 25;
    readonly mtap16: 26;
    readonly mtap24: 27;
    readonly fu_a: 28;
    readonly fu_b: 29;
};
