import { NackHandlerBase } from "./nack";
declare const NackHandlerCallback_base: {
    new (...args: any[]): {
        cb?: ((o: import("./rtpCallback").RtpOutput) => void) | undefined;
        destructor?: (() => void) | undefined;
        pipe: (cb: (o: import("./rtpCallback").RtpOutput) => void, destructor?: (() => void) | undefined) => /*elided*/ any;
        input: (input: import("./rtpCallback").RtpOutput) => void;
        destroy: () => void;
        processInput: (input: import("./rtpCallback").RtpOutput) => import("./rtpCallback").RtpOutput[];
        toJSON(): Record<string, any>;
    };
} & typeof NackHandlerBase;
export declare class NackHandlerCallback extends NackHandlerCallback_base {
}
export {};
