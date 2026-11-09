import type { BufferSourceLike } from "../bytes/index.js";
import type { Base64DecodeOptions, Base64EncodeOptions } from "../encoding/base64.js";
import type { Base64UrlDecodeOptions, Base64UrlEncodeOptions } from "../encoding/base64url.js";
import type { HexDecodeOptions, HexEncodeOptions, HexFormat } from "../encoding/hex.js";
import type { PemDecodeOptions, PemEncodeOptions, PemFormat } from "../pem/types.js";
/** Converts buffer data into text using encoder-specific options. */
export type ByteEncoder<TOptions = any> = (data: BufferSourceLike, options?: TOptions) => string;
/** Converts text back into bytes using decoder-specific options. */
export type ByteDecoder<TOptions = any> = (text: string, options?: TOptions) => Uint8Array;
/** Parsed text that preserves both decoded bytes and the detected format metadata. */
export interface ParsedBytes<TFormat = unknown> {
    /** Decoded bytes. */
    readonly bytes: Uint8Array;
    /** Detected formatting metadata. */
    readonly format: TFormat;
    /** Canonical normalized text representation. */
    readonly normalized: string;
}
/** Result of a safe decode operation that does not throw. */
export type DecodeResult = {
    ok: true;
    bytes: Uint8Array;
} | {
    ok: false;
    error: Error;
};
/** Ranked format detection candidate. */
export interface FormatDetection {
    /** Registered converter name. */
    readonly format: string;
    /** Confidence score in the range from 0 to 1. */
    readonly confidence: number;
}
/** Open interface that standard and user converters can augment with typed options. */
export interface ConverterOptionsMap {
    base64: {
        decode: Base64DecodeOptions;
        encode: Base64EncodeOptions;
    };
    base64url: {
        decode: Base64UrlDecodeOptions;
        encode: Base64UrlEncodeOptions;
    };
    hex: {
        decode: HexDecodeOptions;
        encode: HexEncodeOptions;
        format: HexFormat;
    };
    pem: {
        decode: PemDecodeOptions;
        encode: PemEncodeOptions & {
            label: string;
        };
        format: PemFormat;
    };
}
type KnownConverterName = Extract<keyof ConverterOptionsMap, string>;
type EmptyObject = Record<never, never>;
type RequiredKeys<T extends object> = {
    [TKey in keyof T]-?: EmptyObject extends Pick<T, TKey> ? never : TKey;
}[keyof T];
type NonUndefined<T> = Exclude<T, undefined>;
type CapabilityOptions<TName extends string, TCapability extends "encode" | "decode" | "format"> = TName extends KnownConverterName ? ConverterOptionsMap[TName] extends Record<TCapability, infer TOptions> ? TOptions : unknown : unknown;
/** Resolves typed encode options for a known converter name. */
export type EncodeOptionsFor<TName extends string> = CapabilityOptions<TName, "encode">;
/** Resolves typed decode options for a known converter name. */
export type DecodeOptionsFor<TName extends string> = CapabilityOptions<TName, "decode">;
/** Resolves typed format metadata for a known converter name. */
export type FormatFor<TName extends string> = CapabilityOptions<TName, "format">;
/** Builds an optional or required options tuple depending on the options type. */
export type OptionsArgument<TOptions> = [TOptions] extends [never] ? [] : unknown extends TOptions ? [options?: TOptions] : [NonUndefined<TOptions>] extends [object] ? RequiredKeys<NonUndefined<TOptions>> extends never ? [options?: TOptions] : [options: TOptions] : [options: TOptions];
/** Options for direct format-to-format transcoding. */
export interface TranscodeOptions<TFrom extends string = string, TTo extends string = string> {
    /** Source format name. */
    readonly from: TFrom;
    /** Source decoder options. */
    readonly fromOptions?: DecodeOptionsFor<TFrom>;
    /** Destination format name. */
    readonly to: TTo;
    /** Destination encoder options. */
    readonly toOptions?: EncodeOptionsFor<TTo>;
}
/** Options for ranked format detection. */
export interface DetectOptions<TName extends string = string> {
    /** Formats to check. Defaults to the registered non-generic codecs. */
    readonly formats?: readonly TName[];
}
/** Describes a named text converter with optional aliases and validation. */
export interface Converter<TEncodeOptions = any, TDecodeOptions = any, TFormat = any> {
    /** The primary converter name. */
    readonly name: string;
    /** Additional names that resolve to the same converter. */
    readonly aliases?: readonly string[];
    /** Encodes buffer data into text. */
    readonly encode: ByteEncoder<TEncodeOptions>;
    /** Decodes text into bytes. */
    readonly decode: ByteDecoder<TDecodeOptions>;
    /** Normalizes input text into the canonical representation accepted by the converter. */
    readonly normalize?: (text: string, options?: TDecodeOptions) => string;
    /** Parses text into bytes while preserving formatting metadata. */
    readonly parse?: (text: string, options?: TDecodeOptions) => ParsedBytes<TFormat>;
    /** Formats bytes using previously detected formatting metadata. */
    readonly format?: (data: BufferSourceLike, format: TFormat) => string;
    /** Checks whether a text value is accepted by the converter. */
    readonly is?: (text: unknown) => text is string;
}
/** Options that control how a converter is registered. */
export interface RegisterOptions {
    /** Replaces an existing converter with the same name or alias. */
    override?: boolean;
}
/** Registry API for looking up, registering, and using converters. */
export interface ConverterRegistry {
    /** Registers a converter. */
    register(converter: Converter, options?: RegisterOptions): this;
    /** Removes a converter by name or alias. */
    unregister(name: string): boolean;
    /** Checks whether a converter is registered. */
    has(name: string): boolean;
    /** Returns a registered converter. */
    get(name: string): Converter;
    /** Returns the list of primary registered converters. */
    list(): readonly Converter[];
    /** Encodes buffer data with a named converter. */
    encode<TName extends string>(name: TName, data: BufferSourceLike, ...args: OptionsArgument<EncodeOptionsFor<TName>>): string;
    /** Decodes text with a named converter. */
    decode<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): Uint8Array;
    /** Safely decodes text with a named converter without throwing. */
    tryDecode<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): DecodeResult;
    /** Normalizes text with a named converter. */
    normalize<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): string;
    /** Parses text with a named converter. */
    parse<TName extends string>(name: TName, text: string, ...args: OptionsArgument<DecodeOptionsFor<TName>>): ParsedBytes<FormatFor<TName>>;
    /** Formats bytes with a named converter using preserved formatting metadata. */
    format<TName extends string>(name: TName, data: BufferSourceLike, format: FormatFor<TName>): string;
    /** Converts text directly from one registered format to another. */
    transcode<TFrom extends string, TTo extends string>(text: string, options: TranscodeOptions<TFrom, TTo>): string;
    /** Detects likely formats for the provided text. */
    detect<TName extends string = string>(text: string, options?: DetectOptions<TName>): FormatDetection[];
}
export {};
