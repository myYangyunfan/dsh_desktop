import type { BufferSourceLike } from "../bytes/index.js";
import { type BufferEncoding } from "../converters/index.js";
import type { Utf16Options } from "../encoding/utf16.js";
/** Legacy text encodings accepted by the deprecated facade. */
export type TextEncoding = "ascii" | "utf8" | "utf16" | "utf16be" | "utf16le" | "usc2";
/**
 * Legacy converter facade that mirrors the historical API surface.
 * @deprecated Use the camelCase `convert` object or specific encoding modules instead.
 */
export declare class Convert {
    /** Default UTF-8 encoding used by the legacy facade. */
    static DEFAULT_UTF8_ENCODING: TextEncoding;
    /** Checks whether the input is hexadecimal text. */
    static isHex(data: unknown): data is string;
    /** Checks whether the input is Base64 text. */
    static isBase64(data: unknown): data is string;
    /** Checks whether the input is Base64Url text. */
    static isBase64Url(data: unknown): data is string;
    /** Converts buffer data to text. */
    static ToString(buffer: BufferSourceLike, enc?: BufferEncoding): string;
    /** Converts text to bytes. */
    static FromString(str: string, enc?: BufferEncoding): ArrayBufferLike;
    /** Encodes bytes as Base64 text. */
    static ToBase64(buffer: BufferSourceLike): string;
    /** Decodes Base64 text into bytes. */
    static FromBase64(base64: string): ArrayBufferLike;
    /** Decodes Base64Url text into bytes. */
    static FromBase64Url(base64url: string): ArrayBufferLike;
    /** Encodes bytes as Base64Url text. */
    static ToBase64Url(data: BufferSourceLike): string;
    /** Converts UTF-8 or UTF-16 text to bytes. */
    static FromUtf8String(text: string, encoding?: TextEncoding): ArrayBufferLike;
    /** Converts bytes to UTF-8 or UTF-16 text. */
    static ToUtf8String(buffer: BufferSourceLike, encoding?: TextEncoding): string;
    /** Decodes binary text into bytes. */
    static FromBinary(text: string): ArrayBufferLike;
    /** Encodes bytes as binary text. */
    static ToBinary(buffer: BufferSourceLike): string;
    /** Encodes bytes as hexadecimal text. */
    static ToHex(buffer: BufferSourceLike): string;
    /** Decodes hexadecimal text into bytes. */
    static FromHex(hexString: string): ArrayBufferLike;
    /** Converts UTF-16 bytes into text. */
    static ToUtf16String(buffer: BufferSourceLike, littleEndian?: boolean): string;
    /** Converts UTF-16 text into bytes. */
    static FromUtf16String(text: string, littleEndian?: boolean): ArrayBufferLike;
    protected static Base64Padding(base64: string): string;
    /** Normalizes whitespace in Base64-style text. */
    static formatString(data: string): string;
}
/** Legacy text encoding aliases re-exported for compatibility. */
export type { BufferEncoding, Utf16Options };
