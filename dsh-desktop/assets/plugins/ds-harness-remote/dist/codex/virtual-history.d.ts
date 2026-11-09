import type { CodexPermissionSnapshot } from '@dsh-remote/protocol';
import type { HarnessSessionGeneration } from '../harness-version.js';
import type { CodexModelSelection } from './virtual-catalog.js';
import type { JsonRecord } from './virtual-values.js';
export interface NativeEvent {
    type: string;
    seq: number;
    time: number;
    data: unknown;
    sourceEventSeqs?: number[];
    surfaceOp?: 'append' | {
        op: 'replace';
        start: number;
        end: number;
    } | {
        op: 'replace';
        startSeq: number;
        endSeq: number;
    };
}
export interface CodexNativeHistory {
    header: {
        version: number;
        id: string;
        createdAt: number;
        cwd?: string;
        isSeeded?: boolean;
    };
    entries: Array<{
        type: 'event';
        event: NativeEvent;
        view?: ToolEventView;
    }>;
    lastSeq: number;
    nextTurn: number;
    activeTurnId?: string;
}
export interface CodexNativeHistoryPage extends CodexPermissionSnapshot {
    header: CodexNativeHistory['header'];
    cursor: number;
    nextTurn: number;
    records: CodexNativeHistory['entries'];
    hasMore: boolean;
    activeTurnId?: string;
}
export interface ToolEventView {
    for: 'call' | 'result';
    view: JsonRecord;
}
export interface ProjectedNativeEvent {
    type: string;
    data: unknown;
    view?: ToolEventView;
}
export declare function projectCodexNativeHistory(thread: JsonRecord, sessionId: string, sessionGeneration?: HarnessSessionGeneration): CodexNativeHistory;
export declare function paginateCodexNativeHistory(history: CodexNativeHistory, request: {
    beforeSeq?: number;
    throughSeq?: number;
    maxMessages?: number;
}): CodexNativeHistoryPage;
export declare function adaptEventData(type: string, data: unknown, sessionGeneration: HarnessSessionGeneration): unknown;
export declare function adaptCodexHistoryPage(value: unknown, sessionGeneration: HarnessSessionGeneration): unknown;
export declare function itemEvents(item: JsonRecord, turn: number, step: number, requestId?: string, selection?: CodexModelSelection, sessionId?: string, supplementalImages?: JsonRecord[]): ProjectedNativeEvent[];
export declare function toolResultEvent(item: JsonRecord, turn: number, step: number, id: string, resultText: string): ProjectedNativeEvent;
export declare function toolResultContentReplacement(event: ProjectedNativeEvent): ProjectedNativeEvent;
export declare function isToolItemType(type: string | undefined): boolean;
export declare function isSurfaceEvent(type: string): boolean;
export declare function itemText(value: JsonRecord): string | undefined;
export declare function fileChangeSummary(item: JsonRecord): string;
export declare function sanitizedFileChanges(value: unknown): JsonRecord[];
export declare function appendBoundedText(current: string, delta: string): string;
export declare function commandText(value: unknown): string | undefined;
export declare function isCodexNativeHistoryPage(value: unknown, sessionId: string): value is CodexNativeHistoryPage;
//# sourceMappingURL=virtual-history.d.ts.map