import type { CipherContext } from "../../context/cipher";
import type { DtlsContext } from "../../context/dtls";
import type { SrtpContext } from "../../context/srtp";
import type { TransportContext } from "../../context/transport";
import type { FragmentedHandshake } from "../../record/message/fragment";
import { Flight } from "../flight";
export declare class Flight4 extends Flight {
    private cipher;
    private srtp;
    constructor(udp: TransportContext, dtls: DtlsContext, cipher: CipherContext, srtp: SrtpContext);
    exec(clientHello: FragmentedHandshake, certificateRequest?: boolean): Promise<void>;
    private sendServerHello;
    private sendCertificate;
    private sendServerKeyExchange;
    private sendCertificateRequest;
    private sendServerHelloDone;
}
