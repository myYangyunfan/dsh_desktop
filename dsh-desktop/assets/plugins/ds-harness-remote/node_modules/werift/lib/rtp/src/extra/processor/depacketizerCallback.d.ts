import { DepacketizeBase, type DepacketizerInput, type DepacketizerOutput } from "./depacketizer";
declare const DepacketizeCallback_base: {
    new (...args: any[]): {
        cb?: ((o: DepacketizerOutput) => void) | undefined;
        destructor?: (() => void) | undefined;
        pipe: (cb: (o: DepacketizerOutput) => void, destructor?: (() => void) | undefined) => /*elided*/ any;
        input: (input: DepacketizerInput) => void;
        destroy: () => void;
        processInput: (input: DepacketizerInput) => DepacketizerOutput[];
        toJSON(): Record<string, any>;
    };
} & typeof DepacketizeBase;
export declare class DepacketizeCallback extends DepacketizeCallback_base {
}
export {};
