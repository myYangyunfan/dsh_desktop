export { pemConverter } from "../pem/index.js";
import type { Converter } from "./types.js";
/** Converter for binary text where each character maps to one byte. */
export declare const binaryConverter: Converter;
/** Converter for hexadecimal text. */
export declare const hexConverter: Converter;
/** Converter for standard Base64 text. */
export declare const base64Converter: Converter;
/** Converter for URL-safe Base64 text. */
export declare const base64urlConverter: Converter;
/** Converter for UTF-8 text. */
export declare const utf8Converter: Converter;
/** Converter for big-endian UTF-16 text. */
export declare const utf16beConverter: Converter;
/** Converter for little-endian UTF-16 text. */
export declare const utf16leConverter: Converter;
/** The built-in converter set shipped with the package. */
export declare const defaultConverters: readonly [Converter<any, any, any>, Converter<any, any, any>, Converter<any, any, any>, Converter<any, any, any>, Converter<any, any, any>, Converter<any, any, any>, Converter<any, any, any>, Converter<import("../index.js").PemEncodeOptions & {
    label: string;
}, import("../index.js").PemDecodeOptions, import("../index.js").PemFormat>];
/** The default registry preloaded with the built-in converters. */
export declare const defaultConverterRegistry: import("./types.js").ConverterRegistry;
