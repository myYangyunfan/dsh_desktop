import type { BufferSourceLike } from "../bytes/index.js";
/** Options that control Base64 encoding. */
export interface Base64EncodeOptions {
    readonly __base64EncodeOptionsBrand?: never;
}
/** Options that control Base64 decoding. */
export interface Base64DecodeOptions {
    readonly __base64DecodeOptionsBrand?: never;
}
/** Removes whitespace from Base64 text. */
export declare function normalize(text: string): string;
/** Pads Base64 text to a multiple of four characters. */
export declare function pad(text: string): string;
/** Checks whether a value is valid Base64 text. */
export declare function is(text: unknown): text is string;
/** Encodes buffer data as Base64 text. */
export declare function encode(data: BufferSourceLike, _options?: Base64EncodeOptions): string;
/** Decodes Base64 text into bytes. */
export declare function decode(text: string, _options?: Base64DecodeOptions): Uint8Array;
/** Base64 codec helpers. */
export declare const base64: {
    readonly encode: typeof encode;
    readonly decode: typeof decode;
    readonly is: typeof is;
    readonly normalize: typeof normalize;
    readonly pad: typeof pad;
};
