import type { BufferSourceLike } from "../bytes/index.js";
import type { ParsedBytes, Converter } from "../converters/types.js";
import type { PemBlock, PemDecodeOptions, PemEncodeBlock, PemEncodeOptions, PemFormat } from "./types.js";
/** Encodes buffer data into a PEM block. */
export declare function encode(label: string, data: BufferSourceLike, options?: PemEncodeOptions): string;
/** Encodes multiple PEM blocks into one PEM bundle. */
export declare function encodeMany(blocks: readonly PemEncodeBlock[], options?: PemEncodeOptions): string;
/** Decodes PEM text into the contained blocks. */
export declare function decode(text: string, options?: PemDecodeOptions): PemBlock[];
/** Finds the first PEM block with the requested label. */
export declare function find(text: string, label: string): PemBlock | undefined;
/** Finds all PEM blocks with the requested label. */
export declare function findAll(text: string, label: string): PemBlock[];
/** Decodes the first matching PEM block. */
export declare function decodeFirst(text: string, label?: string): Uint8Array;
/** Parses the first matching PEM block and preserves its formatting metadata. */
export declare function parse(text: string, options?: PemDecodeOptions): ParsedBytes<PemFormat>;
/** Formats bytes with preserved PEM metadata. */
export declare function format(data: BufferSourceLike, value: PemFormat): string;
/** PEM codec helpers. */
export declare const pem: {
    readonly decode: typeof decode;
    readonly decodeFirst: typeof decodeFirst;
    readonly encode: typeof encode;
    readonly encodeMany: typeof encodeMany;
    readonly find: typeof find;
    readonly findAll: typeof findAll;
    readonly format: typeof format;
    readonly parse: typeof parse;
};
/** Converter wrapper for PEM text. */
export declare const pemConverter: Converter<PemEncodeOptions & {
    label: string;
}, PemDecodeOptions, PemFormat>;
