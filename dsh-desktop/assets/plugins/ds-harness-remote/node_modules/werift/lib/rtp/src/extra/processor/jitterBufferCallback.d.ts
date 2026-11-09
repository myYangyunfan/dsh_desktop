import { JitterBufferBase, type JitterBufferOutput } from "./jitterBuffer";
declare const JitterBufferCallback_base: {
    new (...args: any[]): {
        cb?: ((o: JitterBufferOutput) => void) | undefined;
        destructor?: (() => void) | undefined;
        pipe: (cb: (o: JitterBufferOutput) => void, destructor?: (() => void) | undefined) => /*elided*/ any;
        input: (input: import("./rtpCallback").RtpOutput) => void;
        destroy: () => void;
        processInput: (input: import("./rtpCallback").RtpOutput) => JitterBufferOutput[];
        toJSON(): Record<string, any>;
    };
} & typeof JitterBufferBase;
export declare class JitterBufferCallback extends JitterBufferCallback_base {
}
export {};
