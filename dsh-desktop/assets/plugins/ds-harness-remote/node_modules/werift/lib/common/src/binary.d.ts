export declare function random16(): number;
export declare function random32(): number;
export declare function bufferXor(a: Buffer, b: Buffer): Buffer;
export declare function bufferArrayXor(arr: Buffer[]): Buffer;
export declare class BitWriter {
    private bitLength;
    value: number;
    constructor(bitLength: number);
    set(size: number, startIndex: number, value: number): this;
    get buffer(): Buffer<ArrayBuffer>;
}
export declare class BitWriter2 {
    /**Max 32bit */
    private bitLength;
    private _value;
    offset: bigint;
    /**
     * 各valueがオクテットを跨いではならない
     */
    constructor(
    /**Max 32bit */
    bitLength: number);
    set(value: number, size?: number): this;
    get value(): number;
    get buffer(): Buffer<ArrayBuffer>;
}
export declare function getBit(bits: number, startIndex: number, length?: number): number;
export declare function paddingByte(bits: number): string;
export declare function paddingBits(bits: number, expectLength: number): string;
export declare function bufferWriter(bytes: number[], values: (number | bigint)[]): Buffer<ArrayBuffer>;
export declare function createBufferWriter(bytes: number[], singleBuffer?: boolean): (values: (number | bigint)[]) => Buffer<ArrayBuffer>;
export declare function bufferWriterLE(bytes: number[], values: (number | bigint)[]): Buffer<ArrayBuffer>;
export declare function bufferReader(buf: Buffer, bytes: number[]): any[];
export declare class BufferChain {
    buffer: Buffer;
    constructor(size: number);
    writeInt16BE(value: number, offset?: number | undefined): this;
    writeUInt8(value: number, offset?: number | undefined): this;
}
export declare const dumpBuffer: (data: Buffer) => string;
export declare function buffer2ArrayBuffer(buf: Buffer): ArrayBuffer | SharedArrayBuffer;
export declare class BitStream {
    uint8Array: Buffer;
    private position;
    private bitsPending;
    constructor(uint8Array: Buffer);
    writeBits(bits: number, value: number): BitStream;
    readBits(bits: number): number;
    private _readBits;
    seekTo(bitPos: number): void;
}
