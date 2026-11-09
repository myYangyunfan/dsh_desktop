import type { BufferSourceLike } from "../bytes/index.js";
import type { DecodeOptionsFor, DetectOptions, EncodeOptionsFor, FormatDetection, FormatFor, OptionsArgument, ParsedBytes, TranscodeOptions, DecodeResult } from "./types.js";
/** Text encodings supported by the legacy converter facade. */
export type BufferEncoding = "utf8" | "utf-8" | "binary" | "latin1" | "base64" | "base64url" | "base64-url" | "hex" | "utf16" | "utf16be" | "utf16le" | string;
/** Public converter facade backed by the default registry. */
export interface ConvertFacade {
    /** Encodes bytes with a named converter. */
    encode<TName extends string>(name: TName, data: BufferSourceLike, ...args: OptionsArgument<EncodeOptionsFor<TName>>): string;
    /** Decodes text with a named converter. */
    decode<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): Uint8Array;
    /** Safely decodes text with a named converter. */
    tryDecode<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): DecodeResult;
    /** Normalizes text with a named converter. */
    normalize<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): string;
    /** Parses text while preserving formatting metadata. */
    parse<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): ParsedBytes<FormatFor<TName>>;
    /** Formats bytes using preserved formatting metadata. */
    format<TName extends string>(name: TName, data: BufferSourceLike, format: FormatFor<TName>): string;
    /** Converts text directly between registered formats. */
    transcode<TFrom extends string, TTo extends string>(text: string, options: TranscodeOptions<TFrom, TTo>): string;
    /** Detects likely formats for an input string. */
    detect<TName extends string = string>(text: string, options?: DetectOptions<TName>): FormatDetection[];
    /** @deprecated Use encode() instead. */
    to<TName extends string>(format: TName, data: BufferSourceLike, ...args: OptionsArgument<EncodeOptionsFor<TName>>): string;
    /** @deprecated Use decode() instead. */
    from<TName extends string>(format: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): Uint8Array;
    /** Converts buffer data to a string using a known encoding. */
    toString(data: BufferSourceLike, encoding?: BufferEncoding): string;
    /** Converts a string to bytes using a known encoding. */
    fromString(text: string, encoding?: BufferEncoding): ArrayBufferLike;
    /** Encodes bytes as Base64 text. */
    toBase64(data: BufferSourceLike): string;
    /** Decodes Base64 text into bytes. */
    fromBase64(text: string): ArrayBufferLike;
    /** Encodes bytes as Base64Url text. */
    toBase64Url(data: BufferSourceLike): string;
    /** Decodes Base64Url text into bytes. */
    fromBase64Url(text: string): ArrayBufferLike;
    /** Encodes bytes as hexadecimal text. */
    toHex(data: BufferSourceLike): string;
    /** Decodes hexadecimal text into bytes. */
    fromHex(text: string): ArrayBufferLike;
    /** Encodes bytes as binary text. */
    toBinary(data: BufferSourceLike): string;
    /** Decodes binary text into bytes. */
    fromBinary(text: string): ArrayBufferLike;
    /** Decodes UTF-8 bytes into text. */
    toUtf8String(data: BufferSourceLike): string;
    /** Encodes UTF-8 text into bytes. */
    fromUtf8String(text: string): ArrayBufferLike;
    /** Decodes UTF-16 bytes into text. */
    toUtf16String(data: BufferSourceLike, littleEndian?: boolean): string;
    /** Encodes UTF-16 text into bytes. */
    fromUtf16String(text: string, littleEndian?: boolean): ArrayBufferLike;
    /** Checks whether a value is hexadecimal text. */
    isHex(text: unknown): text is string;
    /** Checks whether a value is Base64 text. */
    isBase64(text: unknown): text is string;
    /** Checks whether a value is Base64Url text. */
    isBase64Url(text: unknown): text is string;
    /** Normalizes whitespace in a Base64-style string. */
    formatString(text: string): string;
}
/** Converter helpers for common text and binary encodings. */
export declare const convert: ConvertFacade;
