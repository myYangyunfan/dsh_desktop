import type { ArrayBufferViewLike, BufferSourceLike, ViewConstructor } from "./types.js";
/** Checks whether a value is an ArrayBuffer. */
export declare function isArrayBuffer(value: unknown): value is ArrayBuffer;
/** Checks whether a value is a SharedArrayBuffer. */
export declare function isSharedArrayBuffer(value: unknown): value is SharedArrayBuffer;
/** Checks whether a value is an ArrayBuffer-like object. */
export declare function isArrayBufferLike(value: unknown): value is ArrayBufferLike;
/** Checks whether a value is an ArrayBufferView. */
export declare function isArrayBufferView(value: unknown): value is ArrayBufferViewLike;
/** Checks whether a value can be treated as a buffer source. */
export declare function isBufferSource(value: unknown): value is BufferSourceLike;
/** Throws when a value is not a supported buffer source. */
export declare function assertBufferSource(value: unknown): asserts value is BufferSourceLike;
/** Returns a Uint8Array view over the input without copying. */
export declare function toUint8Array(data: BufferSourceLike): Uint8Array;
/** Returns a copied Uint8Array for the input buffer source. */
export declare function toUint8ArrayCopy(data: BufferSourceLike): Uint8Array;
/** Returns the underlying ArrayBuffer, copying when required. */
export declare function toArrayBuffer(data: BufferSourceLike): ArrayBuffer;
/** Returns an ArrayBuffer-like value, copying only when needed. */
export declare function toArrayBufferLike(data: BufferSourceLike): ArrayBufferLike;
/** Casts buffer data into the requested view type. */
export declare function toView<T extends ArrayBufferViewLike>(data: BufferSourceLike, type: ViewConstructor<T>): T;
/** Copies buffer data into the requested view type. */
export declare function toViewCopy<T extends ArrayBufferViewLike>(data: BufferSourceLike, type: ViewConstructor<T>): T;
