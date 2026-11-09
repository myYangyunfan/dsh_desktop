import type { BufferSourceLike } from "../bytes/index.js";
/** Encodes bytes as a one-byte-per-character string. */
export declare function encode(data: BufferSourceLike): string;
/** Decodes a one-byte-per-character string into bytes. */
export declare function decode(text: string): Uint8Array;
/** Checks whether a value is a string suitable for binary text handling. */
export declare function is(text: unknown): text is string;
/** Binary codec helpers. */
export declare const binary: {
    readonly encode: typeof encode;
    readonly decode: typeof decode;
    readonly is: typeof is;
};
