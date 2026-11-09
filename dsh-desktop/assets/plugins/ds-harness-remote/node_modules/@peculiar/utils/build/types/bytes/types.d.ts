/** Describes a buffer-backed view with offset and length metadata. */
export interface ArrayBufferViewLike<TBuffer extends ArrayBufferLike = ArrayBufferLike> {
    readonly buffer: TBuffer;
    readonly byteOffset: number;
    readonly byteLength: number;
}
/** A buffer source backed by either an ArrayBuffer-like value or a view. */
export type BufferSourceLike = ArrayBufferLike | ArrayBufferViewLike;
/** Historical BufferSource alias preserved for compatibility. */
export type BufferSource = BufferSourceLike;
/** A strict buffer source limited to ArrayBuffer and ArrayBuffer-backed views. */
export type StrictBufferSource = ArrayBuffer | ArrayBufferViewLike<ArrayBuffer>;
/** Constructor shape for typed array-like views. */
export interface ArrayBufferViewConstructor<T extends ArrayBufferViewLike = ArrayBufferViewLike> {
    readonly prototype: T;
    readonly BYTES_PER_ELEMENT?: number;
    readonly name: string;
    new (length: number): T;
    new (array: ArrayLike<number>): T;
    new (buffer: ArrayBufferLike, byteOffset?: number, length?: number): T;
}
/** Constructor shape for DataView-like views. */
export interface DataViewConstructorLike<T extends ArrayBufferViewLike = ArrayBufferViewLike> {
    readonly prototype: T;
    readonly name: string;
    new (buffer: ArrayBufferLike, byteOffset?: number, byteLength?: number): T;
}
/** A constructor that can create a typed view over buffer data. */
export type ViewConstructor<T extends ArrayBufferViewLike = ArrayBufferViewLike> = ArrayBufferViewConstructor<T> | DataViewConstructorLike<T>;
