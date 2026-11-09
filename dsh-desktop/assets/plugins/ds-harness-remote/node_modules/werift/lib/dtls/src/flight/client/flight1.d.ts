import type { CipherContext } from "../../context/cipher";
import type { DtlsContext } from "../../context/dtls";
import type { TransportContext } from "../../context/transport";
import type { Extension } from "../../typings/domain";
import { Flight } from "../flight";
export declare class Flight1 extends Flight {
    private cipher;
    constructor(udp: TransportContext, dtls: DtlsContext, cipher: CipherContext);
    exec(extensions: Extension[]): Promise<void>;
}
