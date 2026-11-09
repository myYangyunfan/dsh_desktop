import { TransformStream } from "stream/web";
import type { DepacketizerCodec } from "../../codec";
import { DepacketizeBase, type DepacketizerInput, type DepacketizerOptions, type DepacketizerOutput } from "./depacketizer";
export declare const depacketizeTransformer: (codec: DepacketizerCodec, options?: DepacketizerOptions | undefined) => TransformStream<DepacketizerInput, DepacketizerOutput>;
declare class DepacketizeTransformer extends DepacketizeBase {
    transform: TransformStream<DepacketizerInput, DepacketizerOutput>;
    constructor(codec: DepacketizerCodec, options?: DepacketizerOptions);
}
export {};
