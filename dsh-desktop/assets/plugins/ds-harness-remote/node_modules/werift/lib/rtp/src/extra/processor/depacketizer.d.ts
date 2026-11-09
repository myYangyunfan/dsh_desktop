import { Event } from "../../imports/common";
import { type DepacketizerCodec, type RtpHeader, type RtpPacket } from "../..";
import type { Processor } from "./interface";
export type DepacketizerInput = {
    rtp?: RtpPacket;
    /**ms */
    time?: number;
    eol?: boolean;
};
export interface DepacketizerOutput {
    frame?: CodecFrame;
    eol?: boolean;
}
export interface CodecFrame {
    data: Buffer;
    isKeyframe: boolean;
    /**ms */
    time: number;
    [key: string]: any;
}
export interface DepacketizerOptions {
    isFinalPacketInSequence?: (header: RtpHeader) => boolean;
    waitForKeyframe?: boolean;
}
export declare class DepacketizeBase implements Processor<DepacketizerInput, DepacketizerOutput> {
    private codec;
    private options;
    private rtpBuffer;
    private frameFragmentBuffer?;
    private lastSeqNum?;
    private frameBroken;
    private keyframeReceived;
    private count;
    readonly onNeedKeyFrame: Event<any[]>;
    private internalStats;
    constructor(codec: DepacketizerCodec, options?: DepacketizerOptions);
    toJSON(): Record<string, any>;
    processInput(input: DepacketizerInput): DepacketizerOutput[];
    private stop;
    private clearBuffer;
    private checkFinalPacket;
}
