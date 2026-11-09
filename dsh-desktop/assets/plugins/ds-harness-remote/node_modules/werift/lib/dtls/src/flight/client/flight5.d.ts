import type { CipherContext } from "../../context/cipher";
import type { DtlsContext } from "../../context/dtls";
import { SrtpContext } from "../../context/srtp";
import type { TransportContext } from "../../context/transport";
import type { FragmentedHandshake } from "../../record/message/fragment";
import { Flight } from "../flight";
export declare class Flight5 extends Flight {
    private cipher;
    private srtp;
    constructor(udp: TransportContext, dtls: DtlsContext, cipher: CipherContext, srtp: SrtpContext);
    handleHandshake(handshake: FragmentedHandshake): void;
    exec(): Promise<void>;
    private sendCertificate;
    private sendClientKeyExchange;
    private sendCertificateVerify;
    private sendChangeCipherSpec;
    private sendFinished;
}
