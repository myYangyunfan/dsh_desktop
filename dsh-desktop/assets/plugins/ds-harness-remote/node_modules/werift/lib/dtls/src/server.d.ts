import { DtlsSocket, type Options } from "./socket";
export declare class DtlsServer extends DtlsSocket {
    constructor(options: Options);
    private flight6?;
    private handleHandshakes;
}
