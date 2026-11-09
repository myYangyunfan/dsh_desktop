import type { DtlsContext } from "../../context/dtls";
import type { TransportContext } from "../../context/transport";
import type { ServerHelloVerifyRequest } from "../../handshake/message/server/helloVerifyRequest";
import { Flight } from "../flight";
export declare class Flight3 extends Flight {
    constructor(udp: TransportContext, dtls: DtlsContext);
    exec(verifyReq: ServerHelloVerifyRequest): Promise<void>;
}
