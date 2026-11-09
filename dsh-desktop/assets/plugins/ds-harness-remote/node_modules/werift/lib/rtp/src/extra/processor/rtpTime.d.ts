import { type RtpPacket } from "../..";
import type { Processor } from "./interface";
export type RtpTimeInput = {
    rtp?: RtpPacket;
    eol?: boolean;
};
export interface RtpTimeOutput {
    rtp?: RtpPacket;
    /**ms */
    time?: number;
    eol?: boolean;
}
export declare class RtpTimeBase implements Processor<RtpTimeInput, RtpTimeOutput> {
    clockRate: number;
    baseTimestamp?: number;
    /**ms */
    elapsed: number;
    constructor(clockRate: number);
    toJSON(): Record<string, any>;
    processInput({ rtp, eol }: RtpTimeInput): RtpTimeOutput[];
    /**
     *
     * @param timestamp
     * @returns ms
     */
    private update;
}
