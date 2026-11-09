import { TransformStream } from "stream/web";
import { JitterBufferBase, type JitterBufferInput, type JitterBufferOptions, type JitterBufferOutput } from "./jitterBuffer";
export declare const jitterBufferTransformer: (clockRate: number, options?: Partial<JitterBufferOptions> | undefined) => TransformStream<import("./rtpCallback").RtpOutput, JitterBufferOutput>;
export declare class JitterBufferTransformer extends JitterBufferBase {
    clockRate: number;
    transform: TransformStream<JitterBufferInput, JitterBufferOutput>;
    constructor(clockRate: number, options?: Partial<JitterBufferOptions>);
}
