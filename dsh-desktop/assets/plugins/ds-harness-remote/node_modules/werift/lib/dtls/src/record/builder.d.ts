import type { DtlsContext } from "../context/dtls";
import type { Handshake } from "../typings/domain";
import { DtlsPlaintext } from "./message/plaintext";
export type Message = {
    type: number;
    fragment: Buffer;
};
export declare const createFragments: (dtls: DtlsContext) => (handshakes: Handshake[]) => import("./message/fragment").FragmentedHandshake[];
export declare const createPlaintext: (dtls: DtlsContext) => (fragments: Message[], recordSequenceNumber: number) => DtlsPlaintext[];
