import type { CursorAcpInbound } from './adapters/cursor-process.js';
/**
 * Convert replayed ACP `session/update` notifications into DSH history events.
 * Upstream timestamps and message IDs are not replayed, so IDs are deterministic
 * and time stays unknown (0).
 */
export declare function acpHistoryEvents(messages: CursorAcpInbound[], sessionId: string, provider: string): unknown[];
//# sourceMappingURL=history-events.d.ts.map