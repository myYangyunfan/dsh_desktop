import type { RtpHeader } from "../rtp/rtp";
import type { DePacketizerBase } from "./base";
export declare class Vp8RtpPayload implements DePacketizerBase {
    xBit: number;
    nBit: number;
    sBit: number;
    pid: number;
    iBit?: number;
    lBit?: number;
    tBit?: number;
    kBit?: number;
    mBit?: number;
    pictureId?: number;
    payload: Buffer;
    size0: number;
    hBit?: number;
    ver?: number;
    pBit?: number;
    size1: number;
    size2: number;
    static deSerialize(buf: Buffer): Vp8RtpPayload;
    static isDetectedFinalPacketInSequence(header: RtpHeader): boolean;
    get isKeyframe(): boolean;
    get isPartitionHead(): boolean;
    get payloadHeaderExist(): boolean;
    get size(): number;
}
