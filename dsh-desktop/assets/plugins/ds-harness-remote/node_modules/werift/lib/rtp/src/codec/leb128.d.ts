/**
 * Unsigned LEB128 encoder（package-private）。
 * `codec/index.ts` の public barrel からは re-export しない。decode は `av1.ts` 側の公開 API を維持する。
 */
export declare function leb128encode(value: number): Buffer;
