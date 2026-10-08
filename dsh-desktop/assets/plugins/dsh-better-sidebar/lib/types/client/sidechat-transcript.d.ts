/**
 * Side Chat transcript mapping (browser half): turns a thread child's own
 * events (`sidechat.events` — the plugin route, which reads the log without
 * activating the child and cuts the inherited seed host-side) into compact
 * display rows.
 *
 * A thread child's log starts with the ENTIRE inherited parent log as its
 * fork seed. The route already cuts everything up to the LAST
 * `session/end-seed` marker; the mapping re-applies the same cut so any
 * seed event that somehow crosses the wire still never renders, and maps
 * context injections (the "Side conversation boundary" prompt,
 * plugin-sourced context) onto a collapsible injection row, so the view
 * shows only the thread's own conversation.
 *
 * Live streaming: `assistant/message` events only land when a step
 * completes, but the host's `assistant/live-chunk` rows stream token-level
 * text and reasoning deltas (DSH 0.1.5 publishes them outside the session
 * log — see assistant-live.ts). The mapping accumulates both per block and
 * supersedes them with the assembled message once it lands (settled rows).
 */
import type { DiffHunk, ReadBlockLine } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SidebarHistoryEntry } from '../context-types.ts';
/**
 * Structured render payload for a tool row that maps onto one of the host's
 * ui-primitives Blocks (the same atoms the main conversation renders). Derived
 * defensively from raw `tool/call` arguments and `tool/result` `meta` — the
 * producing tool owns the meta shape, so every field is narrowed and any
 * malformed input silently falls back to the generic text row.
 */
export type SidechatToolCard = {
    type: 'terminal';
    command: string;
    cwd?: string;
    output?: string;
    exitCode?: number;
    signal?: string;
} | {
    type: 'diff';
    diffs: DiffHunk[];
} | {
    type: 'read';
    label: string;
    lines: ReadBlockLine[];
    totalLines: number;
    lang?: string;
};
/** One compact transcript row rendered in the thread view. `seq` is the
 *  source event's log sequence — stable row identity for React keys across
 *  polls (streaming caches ride the key, so window slides must not re-key
 *  rows). */
export type SidechatTranscriptRow = {
    kind: 'user';
    seq: number;
    text: string;
}
/** A context injection (the side boundary prompt + the parked in-progress
 *  snapshot, or any plugin-sourced context): rendered as one collapsible
 *  row, never as a user bubble. */
 | {
    kind: 'injection';
    seq: number;
    text: string;
}
/** `settled` distinguishes an assembled message from a still-streaming
 *  chunk accumulation (streaming rows are superseded by the settle). */
 | {
    kind: 'assistant';
    seq: number;
    text: string;
    settled: boolean;
} | {
    kind: 'reasoning';
    seq: number;
    text: string;
    settled: boolean;
} | {
    kind: 'tool';
    seq: number;
    name: string;
    failed: boolean;
    /** Raw arguments JSON as the model produced it. */
    args?: string;
    /** Plain text of the paired result. */
    resultText?: string;
    /** True while the call's result has not landed yet. */
    executing?: boolean;
    /** Structured render payload (host Block atoms); absent = generic row. */
    card?: SidechatToolCard;
}
/** One turn's tail metrics, emitted at `turn/end`: the turn's token usage
 *  (aggregated from `assistant/message.usage`) and wall duration (envelope
 *  time delta from `turn/start`), whichever are computable. */
 | {
    kind: 'turnSummary';
    seq: number;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
};
/** Compact token count the way the main conversation prints usage
 *  (517 / 12.2K / 1.2M — the host's own formatter is not exported). */
export declare function formatTokens(n: number): string;
/** Compact duration the way the main conversation prints run times
 *  (45.2s / 2m42s — sub-minute keeps one decimal). */
export declare function formatDurationMs(ms: number): string;
/** Extract the visible text of a content-block list (`text` blocks verbatim,
 *  joined by blank lines); empty reads `…` so rows never render blank. */
export declare function blockText(content: readonly unknown[]): string;
/**
 * One-line summary of a tool call's raw arguments JSON for the collapsed
 * row: the first identifying string field when the JSON parses, else the
 * flattened raw text; empty when there is nothing worth showing.
 */
export declare function toolArgsSummary(args: string | undefined): string;
/**
 * Map a thread child's history rows onto compact transcript rows: the
 * inherited fork seed is cut at the last `session/end-seed`, context
 * injections map onto a collapsible injection row, `assistant/live-chunk`
 * deltas accumulate into streaming rows per (turn, step, block) and are
 * superseded by the assembled `assistant/message`, and tool invocations
 * render one expandable line each (arguments, paired result text, failure
 * marker; a still-executing call is marked until its result lands).
 * @param entries - history rows (event + host-computed view) in seq order,
 *   the live deltas of the in-flight attempt appended after the durable tail.
 * @returns display rows in log order.
 */
export declare function transcriptRows(entries: readonly SidebarHistoryEntry[], prev?: readonly SidechatTranscriptRow[]): SidechatTranscriptRow[];
