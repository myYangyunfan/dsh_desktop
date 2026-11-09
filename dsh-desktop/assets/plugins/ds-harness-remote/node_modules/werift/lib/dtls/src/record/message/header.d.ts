export interface DtlsPlaintextHeader {
    contentType: number;
    protocolVersion: {
        major: number;
        minor: number;
    };
    epoch: number;
    sequenceNumber: number;
    contentLen: number;
}
export declare class MACHeader {
    epoch: number;
    sequenceNumber: number;
    contentType: number;
    protocolVersion: {
        major: number;
        minor: number;
    };
    contentLen: number;
    static readonly spec: {
        epoch: number;
        sequenceNumber: number;
        contentType: number;
        protocolVersion: {
            major: number;
            minor: number;
        };
        contentLen: number;
    };
    constructor(epoch: number, sequenceNumber: number, contentType: number, protocolVersion: {
        major: number;
        minor: number;
    }, contentLen: number);
    static createEmpty(): MACHeader;
    static deSerialize(buf: Buffer): MACHeader;
    serialize(): Buffer<ArrayBuffer>;
}
