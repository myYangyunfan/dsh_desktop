import type { RtpHeader } from "../rtp/rtp";
import type { DePacketizerBase } from "./base";
export declare class Vp9RtpPayload implements DePacketizerBase {
    /**Picture ID (PID) present */
    iBit: number;
    /**Inter-picture predicted frame */
    pBit: number;
    /**Layer indices present */
    lBit: number;
    /**Flexible mode */
    fBit: number;
    /**Start of a frame */
    bBit: number;
    /**End of a frame */
    eBit: number;
    /**Scalability structure */
    vBit: number;
    zBit: number;
    m?: number;
    pictureId?: number;
    tid?: number;
    u?: number;
    sid?: number;
    /**inter_layer_predicted */
    d?: number;
    tl0PicIdx?: number;
    pDiff: number[];
    n_s?: number;
    y?: number;
    g?: number;
    width: number[];
    height: number[];
    n_g: number;
    pgT: number[];
    pgU: number[];
    pgP_Diff: number[][];
    payload: Buffer;
    static deSerialize(buf: Buffer): Vp9RtpPayload;
    static parseRtpPayload(buf: Buffer): {
        offset: number;
        p: Vp9RtpPayload;
    };
    static isDetectedFinalPacketInSequence(header: RtpHeader): boolean;
    get isKeyframe(): boolean;
    get isPartitionHead(): boolean | 0;
}
