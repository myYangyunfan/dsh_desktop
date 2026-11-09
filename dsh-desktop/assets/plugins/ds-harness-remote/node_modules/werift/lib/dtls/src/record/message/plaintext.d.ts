import { type DtlsPlaintextHeader } from "./header";
export declare class DtlsPlaintext {
    recordLayerHeader: DtlsPlaintextHeader;
    fragment: Buffer;
    constructor(recordLayerHeader: DtlsPlaintextHeader, fragment: Buffer);
    get summary(): {
        header: DtlsPlaintextHeader;
        fragment: string;
    };
    static createEmpty(): DtlsPlaintext;
    static deSerialize(buf: Buffer): DtlsPlaintext;
    serialize(): Buffer<ArrayBuffer>;
    computeMACHeader(): Buffer<ArrayBuffer>;
}
