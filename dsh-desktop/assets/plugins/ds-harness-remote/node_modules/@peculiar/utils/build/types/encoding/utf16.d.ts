import type { BufferSourceLike } from "../bytes/index.js";
/** Options that control UTF-16 endianness. */
export interface Utf16Options {
    littleEndian?: boolean;
}
/** Encodes UTF-16 text into bytes. */
export declare function encode(text: string, options?: Utf16Options): Uint8Array;
/** Decodes UTF-16 bytes into text. */
export declare function decode(data: BufferSourceLike, options?: Utf16Options): string;
/** UTF-16 codec helpers. */
export declare const utf16: {
    readonly encode: typeof encode;
    readonly decode: typeof decode;
};
