import { NtpTimeBase, type NtpTimeInput, type NtpTimeOutput } from "./ntpTime";
declare const NtpTimeCallback_base: {
    new (...args: any[]): {
        cb?: ((o: NtpTimeOutput) => void) | undefined;
        destructor?: (() => void) | undefined;
        pipe: (cb: (o: NtpTimeOutput) => void, destructor?: (() => void) | undefined) => /*elided*/ any;
        input: (input: NtpTimeInput) => void;
        destroy: () => void;
        processInput: (input: NtpTimeInput) => NtpTimeOutput[];
        toJSON(): Record<string, any>;
    };
} & typeof NtpTimeBase;
export declare class NtpTimeCallback extends NtpTimeCallback_base {
}
export {};
