import type { CipherContext } from "../../context/cipher";
import type { DtlsContext } from "../../context/dtls";
import type { TransportContext } from "../../context/transport";
import type { FragmentedHandshake } from "../../record/message/fragment";
import { Flight } from "../flight";
export declare class Flight6 extends Flight {
    private cipher;
    constructor(udp: TransportContext, dtls: DtlsContext, cipher: CipherContext);
    handleHandshake(handshake: FragmentedHandshake): void;
    exec(): Promise<void>;
    private sendChangeCipherSpec;
    private sendFinished;
}
