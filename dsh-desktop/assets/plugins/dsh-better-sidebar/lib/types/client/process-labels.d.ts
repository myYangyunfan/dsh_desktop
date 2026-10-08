/**
 * The two labels the Tasks page borrows from the main conversation's merged
 * activity display: the LIVE line ("正在运行命令 · npm run build") and the
 * DONE title for a settled range ("已读取文件、执行了命令").
 *
 * Both are ports of the host's own composition
 * (`dsh-client-ui-chat`'s `ProcessGroupHeader` + `step-process.js`
 * `processTitle`), reading the host's `chat` dictionary through
 * {@link chatT} so the wording — and every language the host ships — matches
 * what the main chat shows for the same work.
 *
 * The translator is injectable for tests; the default is the host bridge. When
 * a key does not resolve (a host that renamed it, or a deployment where the
 * chat target never mounted) the call answers undefined and the card falls
 * back to the tool detail it already has, never to a raw `message.…` key.
 */
import type { ProcessActivitySummary } from '../process-activity.ts';
/** A host-namespace translator; undefined means "this key is not available". */
export type ChatTranslate = (key: string, params?: Record<string, string | number>) => string | undefined;
/**
 * The live line of one stage: the running category's `…ing` wording plus the
 * running call's detail, or the "thinking" default while nothing is dispatched
 * (exactly the host's `ProcessGroupHeader` label rule).
 *
 * @param summary - the newest stage's summary (absent while the child has none).
 * @param t - host translator (defaults to the `chat` namespace bridge).
 * @returns the line, or undefined when there is nothing to say.
 */
export declare function liveActivityLabel(summary: ProcessActivitySummary | undefined, t?: ChatTranslate): string | undefined;
/**
 * The last-resort activity text: the ranked categories spelled out as
 * `kind ×count`. It keeps a card informative when the host's `chat` wording is
 * unavailable (renamed keys, or a deployment where the chat target never
 * mounted) without inventing a second vocabulary for the normal case — the
 * category names are the host's own, and they are language-neutral.
 *
 * @param summary - a stage's summary.
 * @returns the counts text, or undefined when the stage called nothing.
 */
export declare function activityCountsText(summary: ProcessActivitySummary | undefined): string | undefined;
/**
 * The settled range's title: the top three categories' `done.*` wording joined
 * the way the host joins it (two labels share the "已" prefix; more than three
 * append the "等" suffix). Counts are never printed.
 *
 * @param summary - a stage's summary.
 * @param t - host translator (defaults to the `chat` namespace bridge).
 * @returns the title, or undefined when the host wording is unavailable.
 */
export declare function doneActivityTitle(summary: ProcessActivitySummary | undefined, t?: ChatTranslate): string | undefined;
