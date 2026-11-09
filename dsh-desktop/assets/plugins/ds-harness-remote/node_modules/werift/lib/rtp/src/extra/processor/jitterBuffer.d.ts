import type { Processor } from "./interface";
import type { RtpOutput } from "./rtpCallback";
export type JitterBufferInput = RtpOutput;
export interface JitterBufferOutput extends RtpOutput {
    isPacketLost?: {
        from: number;
        to: number;
    };
}
export declare class JitterBufferBase implements Processor<JitterBufferInput, JitterBufferOutput> {
    clockRate: number;
    private options;
    /**uint16 */
    private presentSeqNum?;
    private rtpBuffer;
    private get expectNextSeqNum();
    private internalStats;
    constructor(clockRate: number, options?: Partial<JitterBufferOptions>);
    toJSON(): {
        rtpBufferLength: number;
        presentSeqNum: number | undefined;
        expectNextSeqNum: number;
    };
    private stop;
    processInput(input: JitterBufferInput): JitterBufferOutput[];
    private processRtp;
    private pushRtpBuffer;
    private resolveBuffer;
    private sortAndClearBuffer;
    private disposeTimeoutPackets;
}
export interface JitterBufferOptions {
    /**milliseconds */
    latency: number;
    bufferSize: number;
}
