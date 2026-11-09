import type { BufferSourceLike } from "./types.js";
/** Options that control how byte comparisons are performed. */
export interface EqualOptions {
    constantTime?: boolean;
}
/** Compares two buffer sources for byte equality. */
export declare function equal(a: BufferSourceLike, b: BufferSourceLike, options?: EqualOptions): boolean;
