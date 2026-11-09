import type { BufferSourceLike } from "../bytes/index.js";
/** Options that control Base64Url encoding. */
export interface Base64UrlEncodeOptions {
    readonly __base64UrlEncodeOptionsBrand?: never;
}
/** Options that control Base64Url decoding. */
export interface Base64UrlDecodeOptions {
    readonly __base64UrlDecodeOptionsBrand?: never;
}
/** Removes whitespace from Base64Url text. */
export declare function normalize(text: string): string;
/** Checks whether a value is valid Base64Url text. */
export declare function is(text: unknown): text is string;
/** Encodes buffer data as Base64Url text. */
export declare function encode(data: BufferSourceLike, _options?: Base64UrlEncodeOptions): string;
/** Decodes Base64Url text into bytes. */
export declare function decode(text: string, _options?: Base64UrlDecodeOptions): Uint8Array;
/** Base64Url codec helpers. */
export declare const base64url: {
    readonly encode: typeof encode;
    readonly decode: typeof decode;
    readonly is: typeof is;
    readonly normalize: typeof normalize;
};
