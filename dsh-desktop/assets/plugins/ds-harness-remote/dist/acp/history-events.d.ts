import type { CursorAcpInbound } from './adapters/cursor-process.js';
/**
 * Convert replayed ACP `session/update` notifications into DSH history events.
 * pi-acp and `opencode acp` share this projection; upstream timestamps and
 * message IDs are not replayed, so IDs are deterministic and time stays unknown.
 */
export declare function acpHistoryEvents(messages: CursorAcpInbound[], sessionId: string, provider: 'pi' | 'opencode' | 'cursor'): unknown[];
//# sourceMappingURL=history-events.d.ts.map