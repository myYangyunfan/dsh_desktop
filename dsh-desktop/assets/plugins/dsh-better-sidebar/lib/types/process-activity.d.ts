/**
 * The plugin's port of the MAIN AGENT's merged "process" display: the compact
 * activity summary DSH's chat shows for a range of tool calls.
 *
 * The host computes that summary over materialized Chat nodes inside
 * `@deepseek-ai/dsh-client-ui-chat` (`conversation-nodes/process-activity.js`
 * → `activity()` / `liveToolDetail()` / `processActivity()`, rendered by
 * `ProcessGroupHeader`). None of it is exported — the client bundle's only
 * runtime exports are `apply`/`inject`/`isRunningTool`/`isSettledTool` — so a
 * surface that has only a SESSION EVENT LOG (a subagent's, which the chat view
 * never materializes) must reproduce the algorithm. This module is that
 * reproduction, kept framework-free so the host route and the node test
 * environment share one implementation.
 *
 * Faithful points, all deliberate:
 *
 * - the tool NAME → category map is copied verbatim (including the
 *   `terminal_` prefix rule and the `*_inspect` suffix rule);
 * - `counts` ranks by distinct-call count descending, ties broken by first
 *   appearance (the host relies on `Array.sort` stability + Map insertion
 *   order);
 * - the running tool is the LAST unsettled call, and a "preparing" call (one
 *   the model announced but never dispatched) counts and can be the running
 *   one, exactly like the host's `PreparingToolCall` branch;
 * - `runningDetail` walks the host's key list in order and truncates the same
 *   way;
 * - the range is cut where the host's process GROUPS are cut: at a
 *   `user/message` and at every assistant message that carries text
 *   (`TurnGroups.rebuild`'s `INDEPENDENT` set plus its `reply(node)` flush).
 *
 * Deliberate deviations, all forced by the input:
 *
 * - the host's `runningDetail` falls back to the last REASONING paragraph of a
 *   running assistant step; a durable log carries no partial step, so the
 *   fallback is omitted (the label then reads as the "thinking" default);
 * - the host reads `arguments` only for a dispatched call; a durable
 *   `assistant/message` already carries the announced block's `arguments`, but
 *   the preparing detail still follows the host (no detail at all) so both
 *   sides read the same;
 * - an unsettled call at the tail of a SETTLED session is reported as not
 *   running ({@link foldProcess}'s `live: false`), mirroring the host's
 *   `closed` groups (`summary = { counts, running: undefined, runningDetail: '' }`);
 * - when the NEWEST range holds no call at all (the child just replied), the
 *   fold reports the previous range instead — a card whose bar read "已完成分析"
 *   because the last thing that happened was a sentence would tell the reader
 *   nothing. The fallback range is never reported as running.
 *
 * This module deliberately does NOT build a per-STAGE list: the Tasks page
 * marks workflow phases with a badge + colour instead (see tasks-model.ts), so
 * only the current range's summary is derived here.
 */
import type { SidebarSessionEvent } from './context-types.ts';
/** The host's `ProcessActivity` union, verbatim. */
export type ProcessActivity = 'read' | 'readImage' | 'search' | 'write' | 'edit' | 'commands' | 'code' | 'webSearch' | 'webFetch' | 'subagents' | 'plan' | 'questions' | 'tools';
/**
 * The host's `ProcessActivitySummary` shape: the ranked work of one range plus
 * the live task detail. `preparing` exists only while the selected live
 * activity has not reached its `tool/call` event.
 */
export interface ProcessActivitySummary {
    counts: {
        kind: ProcessActivity;
        count: number;
    }[];
    running?: ProcessActivity;
    runningDetail: string;
    preparing?: true;
}
/** One fold result: the newest range's summary plus the newest text line. */
export interface ProcessFold {
    /** What a node card's status bar shows. */
    current: ProcessActivitySummary;
    /** The newest assembled assistant text in the window (the card's detail line). */
    text?: string;
    /** Epoch ms of the newest event in the window. */
    lastEventTime?: number;
}
/** How many events one fold may scan backwards (bounds the cost per child). */
export declare const PROCESS_WINDOW_EVENTS = 400;
/** Detail cap, mirroring the host's `LIVE_TOOL_DETAIL_MAX_CHARS`. */
export declare const PROCESS_DETAIL_MAX_CHARS = 160;
/** Cap of the detail text line sent to the client. */
export declare const PROCESS_TEXT_MAX_CHARS = 400;
/**
 * The host's category map, verbatim (the arms are mutually exclusive, so the
 * order only mirrors the host's for review).
 * @param name - durable tool-call name.
 * @returns the category the main agent's process group counts it under.
 */
export declare function activityOf(name: string): ProcessActivity;
/**
 * The host's `liveToolDetail`: parse the raw arguments and take the first
 * present key of {@link LIVE_TOOL_DETAIL_KEYS}, falling back to the tool name.
 * @param name - tool-call name.
 * @param argsRaw - the call's raw `arguments` JSON string.
 */
export declare function liveToolDetail(name: string, argsRaw: string): string;
/**
 * Extract the concatenated plain text of a content-block list (the durable
 * `ContentBlock[]` shape, structurally: blocks with `type: 'text'` carry
 * `text`; anything else — a tool call, an image, … — contributes nothing).
 * @param content - the raw `content` field of a message event.
 * @returns the joined text, or undefined when the message carries no text.
 */
export declare function contentText(content: unknown): string | undefined;
/**
 * Fold a session event log into the host's merged activity view: the newest
 * range's summary and the newest text line. Scans BACKWARD from the end and
 * stops at the range it reports, so a long history costs only its recent tail.
 *
 * @param events - the session's append-only event log (oldest → newest).
 * @param options - `live` (whether the session is executing; a settled one
 *   reports no running tool, like the host's closed groups) and `maxEvents`.
 * @returns the current summary plus the optional detail fields.
 */
export declare function foldProcess(events: readonly SidebarSessionEvent[], options: {
    live: boolean;
    maxEvents?: number;
}): ProcessFold;
