import type { JsonRecord } from './virtual-values.js';
/**
 * Map an upstream CodeX turn into the virtual Harness `turn/end` reason.
 * Preserve provider failure text and `codex_error_info` so Remote clients can
 * show usage limits / rate limits instead of a generic "CodeX turn failed."
 */
export declare function turnEndReason(turn: JsonRecord): JsonRecord;
export declare function projectTurnError(error: unknown): JsonRecord;
//# sourceMappingURL=turn-end-reason.d.ts.map