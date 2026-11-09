import type { BufferSourceLike } from "../bytes/index.js";
/**
 * Assigns own properties from source objects into the target object.
 * @deprecated Prefer object spread or Object.assign.
 */
export declare function assign<T extends object>(target: T, ...sources: (Partial<T> | undefined | null)[]): T;
/**
 * Concatenates buffer sources into a single ArrayBuffer.
 * @deprecated Use `concat` from `@peculiar/utils/bytes` instead.
 */
export declare function combine(...buf: BufferSourceLike[]): ArrayBufferLike;
/**
 * Compares two buffer sources for equality.
 * @deprecated Use `equal` from `@peculiar/utils/bytes` instead.
 */
export declare function isEqual(bytes1: BufferSourceLike, bytes2: BufferSourceLike): boolean;
