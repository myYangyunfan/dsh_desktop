/**
 * Insert text into the current session's composer draft through the
 * conversation service — the shared path behind the explorer's @-reference
 * button and the viewer selection popup. The service is resolved lazily
 * through `ctx.get` (the inject-free read the app's own plugins use); a
 * missing service or scope degrades to a logged no-op, never a crash.
 *
 * File references additionally use DSH's own structured insert event
 * (`slash/input-insert-reference`, see `insertFileReference`) instead of
 * plain draft text: the native `@file` picker emits this event, and the
 * conversation input machine mints one occurrence whose chip covers the
 * whole reference. Plain text `@folder/file.ts` only ever gets DSH's
 * folder-ref decoration (`@folder/`) — the file name stays undecorated — so
 * plain append is the fallback, not the primary path, for files.
 *
 * Insert position (fixes upstream issue #425): the draft store only exposes
 * the whole string (`getSnapshot().draft` + `setDraft(text)`) — there is no
 * caret API on the conversation service. The composer's `<textarea>` keeps
 * its last selection even while unfocused, so the live caret is probed from
 * the DOM (guarded by a value-sync check), and the text is spliced at that
 * position, replacing any live selection — with whitespace-aware joins, an
 * insert into the middle of a sentence keeps single-space separation like
 * the append path. An unknown/stale caret falls back to appending at the
 * end (the pre-fix behavior).
 *
 * The caret is also *restored* after the insert: committing a programmatic
 * draft change resets the controlled textarea's caret (observed landing at
 * the start of the value), which would make every later insert probe the
 * reset position and drift the stack (A|B + C + D ended up as |DACB). The
 * placement (`placeComposerCaretAfterInsert`) puts the caret right after the
 * inserted text once the value commit lands — the index accounts for the
 * separating space on the left, so stacked inserts stay at their running
 * position (A|B + C + D → ACD|B).
 */
import type { Context } from '../context-types.ts';
/** A resolved composer caret/selection in draft coordinates. */
export interface DraftCaret {
    start: number;
    end: number;
}
/**
 * The spliced draft string (see {@link spliceInsert}); pure string math —
 * unit-tested directly.
 */
export declare function insertAtCaret(draft: string, text: string, caret: DraftCaret | null): string;
/**
 * Resolve the composer's live caret from its DOM `<textarea>`. The draft
 * store has no caret API, so the sidebar reads the composed input's selection
 * directly; the value-sync check (`el.value === draft`) discards stale or
 * wrong-composer reads — a caret must never be applied against a draft it
 * was not measured on.
 *
 * Returns null when the composer is missing, disabled/read-only, out of
 * sync with the store draft, or has no measurable selection (jsdom/odd
 * hosts report null selectionStart/End).
 */
export declare function probeComposerCaret(draft: string): DraftCaret | null;
/**
 * Restore the composer caret to `caretIndex` after a programmatic
 * `setDraft` commit. A controlled textarea update resets the caret (React
 * commits the value asynchronously and the browser moves the caret to the
 * start/end), so the placement is scheduled and retried across at most two
 * animation frames (setTimeout fallback for jsdom), and only applied when
 * the textarea still matches `expectedDraft` — a newer edit or a different
 * composer wins the race untouched. The caret is clamped into the value
 * bounds, mirroring how browsers clamp type-in positions.
 */
export declare function placeComposerCaretAfterInsert(expectedDraft: string, caretIndex: number): void;
/**
 * Insert `text` into the session's composer draft at the composer's live
 * caret (see {@link probeComposerCaret}), falling back to appending at the
 * end when the caret cannot be resolved. Returns false — and logs — when the
 * conversation service or the session scope is unavailable.
 */
export declare function appendToDraft(ctx: Context, sessionId: string, text: string): boolean;
/**
 * The DSH `@file` spelling for one relative path, mirroring the host grammar
 * (`formatFileMention` in `@deepseek-ai/dsh-file-reference`): plain when
 * there is no whitespace, quoted when there is, and `undefined` when the
 * path contains a control character or an embedded quote the editor grammar
 * cannot represent.
 */
export declare function fileMention(relativePath: string): {
    mention: string;
    label: string;
} | undefined;
/**
 * Insert one FILE reference as a structured chip (like DSH's own `@` picker).
 * The chip displays `@<basename>` but serializes to `@<relative path>` on
 * send, so the reference stays a single link from trigger to basename.
 *
 * Directories are NOT handled here: DSH's folder grammar wants the trailing
 * slash as plain text (`@dir/`) so completion can descend, which
 * `appendToDraft` already covers.
 */
export declare function insertFileReference(ctx: Context, sessionId: string, relativePath: string): boolean;
