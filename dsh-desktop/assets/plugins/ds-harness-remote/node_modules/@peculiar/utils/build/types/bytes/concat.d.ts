import type { ArrayBufferViewLike, BufferSourceLike, ViewConstructor } from "./types.js";
/** Concatenates buffer sources into a new Uint8Array. */
export declare function concatToUint8Array(buffers: Iterable<BufferSourceLike>): Uint8Array;
/** Concatenates buffer sources and returns either an ArrayBufferLike or a typed view. */
export declare function concat(...buffers: BufferSourceLike[]): ArrayBufferLike;
export declare function concat(buffers: Iterable<BufferSourceLike>): ArrayBufferLike;
export declare function concat<T extends ArrayBufferViewLike>(buffers: Iterable<BufferSourceLike>, type: ViewConstructor<T>): T;
