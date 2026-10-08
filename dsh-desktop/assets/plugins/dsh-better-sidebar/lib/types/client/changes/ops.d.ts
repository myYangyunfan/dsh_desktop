/**
 * File-operation extraction for the changes tab's session lens: folds the
 * session's append-only event log (`tool/call` + `tool/result` pairs) into
 * one op per file-touching call — the same semantics as the standalone
 * dsh-file-trace plugin's Chat-view extraction, reading the authoritative
 * event log instead (the repo's stated preference for cross-feature session
 * data). Pure — no React, no DOM.
 */
import type { SidebarSessionEvent } from '../../context-types.ts';
/** The file-touching operation kinds the tracer distinguishes. */
export type FileOpKind = 'read' | 'write' | 'edit';
/** One extracted file operation. */
export interface FileOp {
    /** Stable identity: the originating tool-call id. */
    readonly callId: string;
    readonly kind: FileOpKind;
    /** Workspace-relative or absolute path exactly as the model spelled it. */
    readonly path: string;
    /** Unix epoch ms of the call; the result time when only that is known. */
    readonly time: number;
    /** True while the call has no result yet. */
    readonly running: boolean;
    /** True when the result reported an error. */
    readonly isError: boolean;
    /** The result's error text when isError; presented instead of the payload. */
    readonly errorText?: string;
    /** For 'edit': the model's exact replacement payload. */
    readonly edit?: {
        oldString: string;
        newString: string;
    };
    /** For 'write': the full new content. */
    readonly content?: string;
    /** For 'read': the file content returned by the tool result. */
    readonly read?: string;
}
/**
 * Fold a session event log into the file operations it contains, newest
 * first. A `tool/call` seeds a running op (payload from the model's
 * arguments); its `tool/result` settles it (read content, error text).
 * Calls dispatched through a host tool such as run_code appear as their own
 * `tool/call` rows in the log, so nested file calls fold in naturally.
 * @param events - the session's append-only event log (oldest → newest).
 * @returns the ordered operation list.
 */
export declare function extractFileOps(events: readonly SidebarSessionEvent[]): FileOp[];
/**
 * Group operations by path, newest op first per file, files ordered by their
 * most recent operation.
 */
export declare function groupByFile(ops: readonly FileOp[]): Map<string, FileOp[]>;
/**
 * The last content known for a path before the given operation, synthesized
 * from earlier ops: a write's payload is authoritative, an edit implies its
 * old side. Best effort — a write with no known prior content diffs against
 * nothing (all-added).
 */
export declare function knownContentBefore(ops: readonly FileOp[], path: string, before: FileOp): string | undefined;
/**
 * Strip the DSH read-tool response envelope down to the file's raw content,
 * PRESERVING blank lines (unlike {@link parseReadLines}, which drops them):
 * drops the <content> wrapper, the "(Showing lines ...)" note, and the
 * per-line "<n>: " prefixes. The markdown reading mode needs the blank lines
 * because markdown block structure depends on them.
 */
export declare function parseReadContent(raw: string): string;
/** One parsed read line: the file's own line number and its content text. */
export interface ReadLine {
    readonly line: number;
    readonly text: string;
}
/**
 * Parse a DSH read result into file lines with their real line numbers:
 * drops the <content> envelope and "(Showing lines ...)" note; recovers the
 * "<n>: " prefix as the line number, falling back to sequential counting.
 */
export declare function parseReadLines(raw: string): ReadLine[];
