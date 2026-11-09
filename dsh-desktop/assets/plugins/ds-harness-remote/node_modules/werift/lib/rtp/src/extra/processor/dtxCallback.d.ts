import { DtxBase } from "./dtx";
declare const DtxCallback_base: {
    new (...args: any[]): {
        cb?: ((o: import("./depacketizer").DepacketizerOutput) => void) | undefined;
        destructor?: (() => void) | undefined;
        pipe: (cb: (o: import("./depacketizer").DepacketizerOutput) => void, destructor?: (() => void) | undefined) => /*elided*/ any;
        input: (input: import("./depacketizer").DepacketizerOutput) => void;
        destroy: () => void;
        processInput: (input: import("./depacketizer").DepacketizerOutput) => import("./depacketizer").DepacketizerOutput[];
        toJSON(): Record<string, any>;
    };
} & typeof DtxBase;
export declare class DtxCallback extends DtxCallback_base {
}
export {};
