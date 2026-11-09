import type { BufferSourceLike } from "../bytes/index.js";
import type { ParsedBytes } from "../converters/types.js";
/** Hex casing modes used by format-aware helpers. */
export type HexCase = "lower" | "upper";
/** Options that control hexadecimal decoding. */
export interface HexDecodeOptions {
    allowPrefix?: boolean;
    allowOddLength?: boolean;
    separators?: readonly string[] | "common" | "none";
    strict?: boolean;
}
/** Grouping information for formatted hexadecimal output. */
export interface HexGroupFormat {
    size: number;
    separator: string;
}
/** Line wrapping information for formatted hexadecimal output. */
export interface HexLineFormat {
    bytesPerLine: number;
    separator?: "\n" | "\r\n";
}
/** Options that control hexadecimal encoding. */
export interface HexEncodeOptions {
    case?: HexCase;
    prefix?: "" | "0x";
    group?: HexGroupFormat;
    line?: HexLineFormat;
}
/** Preserved formatting metadata for parsed hexadecimal text. */
export interface HexFormat {
    case: HexCase;
    prefix: "" | "0x";
    group?: HexGroupFormat;
    line?: {
        bytesPerLine: number;
        separator: "\n" | "\r\n";
    };
}
/** Removes separators and normalizes hexadecimal text. */
export declare function normalize(text: string, options?: HexDecodeOptions): string;
/** Checks whether a value is normalized hexadecimal text. */
export declare function is(text: unknown, options?: HexDecodeOptions): text is string;
/** Encodes buffer data as formatted hexadecimal text. */
export declare function encode(data: BufferSourceLike, options?: HexEncodeOptions): string;
/** Decodes hexadecimal text into bytes. */
export declare function decode(text: string, options?: HexDecodeOptions): Uint8Array;
/** Parses hexadecimal text into bytes plus detected formatting metadata. */
export declare function parse(text: string, options?: HexDecodeOptions): ParsedBytes<HexFormat>;
/** Formats bytes using preserved hexadecimal formatting metadata. */
export declare function format(data: BufferSourceLike, value: HexFormat): string;
/** Reusable hexadecimal formatting presets. */
export declare const formats: {
    readonly compact: Readonly<HexEncodeOptions>;
    readonly upper: Readonly<HexEncodeOptions>;
    readonly colon: Readonly<HexEncodeOptions>;
    readonly colonUpper: Readonly<HexEncodeOptions>;
    readonly groupsOf4: Readonly<HexEncodeOptions>;
    readonly prefixed: Readonly<HexEncodeOptions>;
};
/** Hexadecimal codec helpers. */
export declare const hex: {
    readonly encode: typeof encode;
    readonly decode: typeof decode;
    readonly format: typeof format;
    readonly formats: {
        readonly compact: Readonly<HexEncodeOptions>;
        readonly upper: Readonly<HexEncodeOptions>;
        readonly colon: Readonly<HexEncodeOptions>;
        readonly colonUpper: Readonly<HexEncodeOptions>;
        readonly groupsOf4: Readonly<HexEncodeOptions>;
        readonly prefixed: Readonly<HexEncodeOptions>;
    };
    readonly is: typeof is;
    readonly normalize: typeof normalize;
    readonly parse: typeof parse;
};
