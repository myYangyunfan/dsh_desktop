import { DtlsSocket, type Options } from "./socket";
export declare class DtlsClient extends DtlsSocket {
    constructor(options: Options);
    connect(): Promise<void>;
    private flight5?;
    private handleHandshakes;
}
