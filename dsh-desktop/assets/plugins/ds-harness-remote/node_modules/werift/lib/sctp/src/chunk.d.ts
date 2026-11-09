export declare class Chunk {
    flags: number;
    private _body;
    get body(): Buffer | undefined;
    set body(value: Buffer | undefined);
    static type: number;
    constructor(flags?: number, _body?: Buffer | undefined);
    get type(): number;
    get bytes(): Buffer<ArrayBuffer>;
}
export declare class BaseInitChunk extends Chunk {
    flags: number;
    initiateTag: number;
    advertisedRwnd: number;
    outboundStreams: number;
    inboundStreams: number;
    initialTsn: number;
    params: [number, Buffer][];
    constructor(flags?: number, body?: Buffer);
    get body(): Buffer<ArrayBuffer>;
}
export declare class InitChunk extends BaseInitChunk {
    static type: 1;
    get type(): 1;
}
export declare class InitAckChunk extends BaseInitChunk {
    static type: 2;
    get type(): 2;
}
export declare class ReConfigChunk extends BaseInitChunk {
    static type: 130;
    get type(): 130;
}
export declare class ForwardTsnChunk extends Chunk {
    flags: number;
    static type: 192;
    streams: [number, number][];
    cumulativeTsn: number;
    constructor(flags: number | undefined, body: Buffer | undefined);
    get type(): 192;
    set body(_: Buffer);
    get body(): Buffer;
}
export declare class DataChunk extends Chunk {
    flags: number;
    static type: 0;
    get type(): 0;
    tsn: number;
    streamId: number;
    streamSeqNum: number;
    protocol: number;
    userData: Buffer;
    abandoned: boolean;
    acked: boolean;
    misses: number;
    retransmit: boolean;
    sentCount: number;
    bookSize: number;
    expiry?: number;
    maxRetransmits?: number;
    sentTime?: number;
    constructor(flags: number | undefined, body: Buffer | undefined);
    get bytes(): Buffer<ArrayBuffer>;
}
export declare class CookieEchoChunk extends Chunk {
    static type: 10;
    get type(): 10;
}
export declare class CookieAckChunk extends Chunk {
    static type: 11;
    get type(): 11;
}
export declare class BaseParamsChunk extends Chunk {
    flags: number;
    params: [number, Buffer][];
    constructor(flags?: number, body?: Buffer | undefined);
    get body(): Buffer<ArrayBuffer>;
}
export declare class AbortChunk extends BaseParamsChunk {
    static type: 6;
    get type(): 6;
}
export declare class ErrorChunk extends BaseParamsChunk {
    static type: 9;
    static readonly CODE: {
        readonly InvalidStreamIdentifier: 1;
        readonly MissingMandatoryParameter: 2;
        readonly StaleCookieError: 3;
        readonly OutofResource: 4;
        readonly UnresolvableAddress: 5;
        readonly UnrecognizedChunkType: 6;
        readonly InvalidMandatoryParameter: 7;
        readonly UnrecognizedParameters: 8;
        readonly NoUserData: 9;
        readonly CookieReceivedWhileShuttingDown: 10;
        readonly RestartofanAssociationwithNewAddresses: 11;
        readonly UserInitiatedAbort: 12;
        readonly ProtocolViolation: 13;
    };
    get type(): 9;
    get descriptions(): {
        name: string | undefined;
        body: Buffer<ArrayBufferLike>;
    }[];
}
export declare class HeartbeatChunk extends BaseParamsChunk {
    static type: 4;
    get type(): 4;
}
export declare class HeartbeatAckChunk extends BaseParamsChunk {
    static type: 5;
    get type(): 5;
}
export declare class ReconfigChunk extends BaseParamsChunk {
    static type: 130;
    get type(): 130;
}
export declare class SackChunk extends Chunk {
    flags: number;
    static type: number;
    get type(): number;
    gaps: [number, number][];
    duplicates: number[];
    cumulativeTsn: number;
    advertisedRwnd: number;
    constructor(flags: number | undefined, body: Buffer | undefined);
    get bytes(): Buffer<ArrayBuffer>;
}
export declare class ShutdownChunk extends Chunk {
    flags: number;
    static type: number;
    get type(): number;
    cumulativeTsn: number;
    constructor(flags: number | undefined, body: Buffer | undefined);
    get body(): Buffer<ArrayBuffer>;
}
export declare class ShutdownAckChunk extends Chunk {
    static type: number;
    get type(): number;
}
export declare class ShutdownCompleteChunk extends Chunk {
    static type: number;
    get type(): number;
}
export declare const CHUNK_BY_TYPE: {
    [key: string]: typeof Chunk;
};
export declare function decodeParams(body: Buffer): [number, Buffer][];
export declare function parsePacket(data: Buffer): [number, number, number, Chunk[]];
export declare function serializePacket(sourcePort: number, destinationPort: number, verificationTag: number, chunk: Chunk): Buffer<ArrayBuffer>;
