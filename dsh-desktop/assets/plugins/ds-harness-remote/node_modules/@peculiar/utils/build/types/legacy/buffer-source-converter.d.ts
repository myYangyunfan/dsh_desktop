import type { ArrayBufferViewConstructor, ArrayBufferViewLike, BufferSourceLike, ViewConstructor } from "../bytes/index.js";
/** Legacy static helpers for buffer source conversion.
 * @deprecated Use functions from `@peculiar/utils/bytes` instead.
 */
export declare class BufferSourceConverter {
    /** Checks whether a value is an ArrayBuffer. */
    static isArrayBuffer(data: unknown): data is ArrayBuffer;
    /** Converts buffer data to an ArrayBuffer. */
    static toArrayBuffer(data: BufferSourceLike): ArrayBuffer;
    /** Converts buffer data to a Uint8Array view. */
    static toUint8Array(data: BufferSourceLike): Uint8Array;
    /** Converts buffer data into the requested view type. */
    static toView<T extends ArrayBufferViewLike>(data: BufferSourceLike, type: ViewConstructor<T>): T;
    /** Checks whether a value can be treated as a buffer source. */
    static isBufferSource(data: unknown): data is BufferSourceLike;
    /** Checks whether a value is an ArrayBufferView. */
    static isArrayBufferView(data: unknown): data is ArrayBufferViewLike;
    /** Compares two buffer sources for byte equality. */
    static isEqual(a: BufferSourceLike, b: BufferSourceLike): boolean;
    /** Concatenates buffer sources into an ArrayBuffer or a typed view. */
    static concat(...buffers: BufferSourceLike[]): ArrayBufferLike;
    static concat(buffers: BufferSourceLike[]): ArrayBufferLike;
    static concat<T extends ArrayBufferViewLike>(buffers: BufferSourceLike[], type: ArrayBufferViewConstructor<T>): T;
}
