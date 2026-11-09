import { RtpTimeBase, type RtpTimeInput, type RtpTimeOutput } from "./rtpTime";
declare const RtpTimeCallback_base: {
    new (...args: any[]): {
        cb?: ((o: RtpTimeOutput) => void) | undefined;
        destructor?: (() => void) | undefined;
        pipe: (cb: (o: RtpTimeOutput) => void, destructor?: (() => void) | undefined) => /*elided*/ any;
        input: (input: RtpTimeInput) => void;
        destroy: () => void;
        processInput: (input: RtpTimeInput) => RtpTimeOutput[];
        toJSON(): Record<string, any>;
    };
} & typeof RtpTimeBase;
export declare class RtpTimeCallback extends RtpTimeCallback_base {
}
export {};
