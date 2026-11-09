import type { BufferSourceLike } from "./types.js";
/** String or byte pattern accepted by the byte search helpers. */
export type BytePattern = BufferSourceLike | string;
/** Options shared by the stateless byte search helpers. */
export interface ByteSearchOptions {
    /**
     * Start offset for forward search.
     * For reverse search this is the upper bound / starting point.
     */
    start?: number;
    /**
     * End offset, exclusive.
     * For reverse search this is the lower bound.
     */
    end?: number;
    /**
     * Encoding used when pattern is a string.
     * Defaults to ASCII for marker-style byte searches.
     */
    encoding?: "ascii" | "utf8";
}
/**
 * Searches for the first occurrence of a byte pattern within the requested range.
 * Returns the absolute byte offset or `-1` when the pattern is not found.
 */
export declare function indexOf(data: BufferSourceLike, pattern: BytePattern, options?: ByteSearchOptions): number;
/**
 * Searches backwards for the last occurrence of a byte pattern within the requested range.
 * Returns the absolute byte offset or `-1` when the pattern is not found.
 */
export declare function lastIndexOf(data: BufferSourceLike, pattern: BytePattern, options?: ByteSearchOptions): number;
/** Returns `true` when the pattern exists anywhere in the requested range. */
export declare function includes(data: BufferSourceLike, pattern: BytePattern, options?: ByteSearchOptions): boolean;
/** Returns `true` when the byte sequence starts with the requested pattern. */
export declare function startsWith(data: BufferSourceLike, pattern: BytePattern, options?: Pick<ByteSearchOptions, "encoding">): boolean;
/** Returns `true` when the byte sequence ends with the requested pattern. */
export declare function endsWith(data: BufferSourceLike, pattern: BytePattern, options?: Pick<ByteSearchOptions, "encoding">): boolean;
/**
 * Returns a Uint8Array view over the requested byte range.
 * Negative indexes follow `Array.prototype.slice` semantics.
 */
export declare function slice(data: BufferSourceLike, start?: number, end?: number): Uint8Array;
/** Returns the last `length` bytes of the input as a Uint8Array view. */
export declare function tail(data: BufferSourceLike, length: number): Uint8Array;
/** Returns a new Uint8Array copy that never shares memory with the input. */
export declare function copy(data: BufferSourceLike): Uint8Array;
/** Compares two byte sequences lexicographically. */
export declare function compare(a: BufferSourceLike, b: BufferSourceLike): -1 | 0 | 1;
