import type { BufferSourceLike } from "../bytes/index.js";
import type { ParsedBytes } from "../converters/types.js";
/** Represents a decoded PEM block with label, data, and optional headers. */
export interface PemBlock {
    readonly label: string;
    readonly data: Uint8Array;
    readonly headers?: Readonly<Record<string, string>>;
}
/** Options that control PEM encoding. */
export interface PemEncodeOptions {
    lineLength?: number;
    newline?: "\n" | "\r\n";
    headers?: Readonly<Record<string, string>>;
}
/** Options that control PEM decoding. */
export interface PemDecodeOptions {
    label?: string;
    strict?: boolean;
}
/** Format metadata that can be reused to re-encode PEM text. */
export interface PemFormat extends PemEncodeOptions {
    readonly label: string;
}
/** Input block used by multi-block PEM encoding helpers. */
export interface PemEncodeBlock {
    readonly label: string;
    readonly data: BufferSourceLike;
    readonly headers?: Readonly<Record<string, string>>;
}
/** Encodes and decodes PEM blocks. */
export interface PemCodec {
    /** Encodes a buffer source into a PEM block. */
    encode(label: string, data: BufferSourceLike, options?: PemEncodeOptions): string;
    /** Encodes multiple PEM blocks into a single string. */
    encodeMany(blocks: readonly PemEncodeBlock[], options?: PemEncodeOptions): string;
    /** Decodes PEM text into blocks. */
    decode(text: string, options?: PemDecodeOptions): PemBlock[];
    /** Decodes the first matching PEM block. */
    decodeFirst(text: string, label?: string): Uint8Array;
    /** Finds the first PEM block with the requested label. */
    find(text: string, label: string): PemBlock | undefined;
    /** Finds all PEM blocks with the requested label. */
    findAll(text: string, label: string): PemBlock[];
    /** Parses the first matching PEM block and preserves the detected formatting. */
    parse(text: string, options?: PemDecodeOptions): ParsedBytes<PemFormat>;
    /** Formats bytes with previously detected PEM metadata. */
    format(data: BufferSourceLike, format: PemFormat): string;
}
