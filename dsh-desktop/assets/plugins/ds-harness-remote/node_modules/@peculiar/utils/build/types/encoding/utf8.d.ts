import type { BufferSourceLike } from "../bytes/index.js";
/** Encodes UTF-8 text into bytes. */
export declare function encode(text: string): Uint8Array;
/** Decodes UTF-8 bytes into text. */
export declare function decode(data: BufferSourceLike): string;
/** UTF-8 codec helpers. */
export declare const utf8: {
    readonly encode: typeof encode;
    readonly decode: typeof decode;
};
