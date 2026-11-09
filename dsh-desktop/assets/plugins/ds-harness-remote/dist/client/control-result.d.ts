import type { ControlResult } from './types.js';
/** Preserve domain errors across the loopback RPC envelope for auth recovery. */
export declare function unwrapControlResult<T>(result: ControlResult<T>, fallbackMessage: string): T;
//# sourceMappingURL=control-result.d.ts.map