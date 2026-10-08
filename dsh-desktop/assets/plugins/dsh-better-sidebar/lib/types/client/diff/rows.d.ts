/**
 * The one diff engine every file-change surface shares (the changes tab's
 * git and session lenses, the diff tab): a unified DiffRow model fed by two
 * producers — a line LCS over known contents (session file ops) and git's
 * own unified-diff text (worktree/commit diffs, via `parseUnifiedDiff` +
 * `unifiedSegments`) — collapsed into hunk/fold segments for the shared
 * renderer. Pure functions only — no React, no DOM.
 */
/** One rendered diff row. */
export interface DiffRow {
    /** Change class: 'context' shared, 'del' removed, 'add' added, 'mod'
     *  rewritten (paired del+add), 'meta' an attached marker row. */
    readonly kind: 'context' | 'del' | 'add' | 'mod' | 'meta';
    /** Old-side 1-based line number; absent on pure additions. */
    readonly oldLine?: number;
    /** New-side 1-based line number; absent on pure deletions. */
    readonly newLine?: number;
    /** The line's text without its terminator. */
    readonly text: string;
}
/**
 * Pair each del-run with the add-run that follows it: the overlapping
 * `min(len)` rows on both sides become 'mod' so rewrites tint distinctly and
 * receive intra-line highlighting. Pure — returns a new array when anything
 * changed. Shared by the LCS walk and the unified-diff converter so git
 * hunks rewrite-pair exactly like session ops do.
 */
export declare function pairMods(rows: readonly DiffRow[]): DiffRow[];
/**
 * Line diff by LCS walk with rewrite pairing: the raw walk emits context/del/
 * add rows; `pairMods` marks rewritten pairs as 'mod'.
 * @param oldText - the previous content; empty string diffs against nothing.
 * @param newText - the next content.
 * @returns ordered diff rows, old-side deletions before new-side additions.
 */
export declare function diffLines(oldText: string, newText: string): DiffRow[];
/** One rendered hunk: change rows plus the surrounding context window. */
export interface HunkSegment {
    readonly kind: 'hunk';
    readonly rows: readonly DiffRow[];
}
/** One collapsed run of unchanged rows (the "… n 行" fold). */
export interface FoldSegment {
    readonly kind: 'fold';
    /** The rows this fold hides, when the producer knows them (session diffs
     *  re-derive them from full contents; git gaps never emitted the text, so
     *  those folds carry only their line ranges and cannot expand). */
    readonly rows?: readonly DiffRow[];
    /** How many rows the fold hides. */
    readonly count: number;
    readonly oldStart: number;
    readonly oldEnd: number;
    readonly newStart: number;
    readonly newEnd: number;
}
export type DiffSegment = HunkSegment | FoldSegment;
/** Context window (rows around a change) kept visible in a hunk. */
export declare const HUNK_CONTEXT = 3;
/** Folded context runs shorter than this are shown directly, not collapsed. */
export declare const MIN_FOLD = 3;
/**
 * Group a line diff into hunks and folded context runs. Consecutive changes
 * whose gap fits within the context window merge into one hunk; unchanged
 * regions between hunks (and any surrounding the whole diff) become fold
 * segments that default collapsed. This yields the file-hunk presentation
 * familiar from terminal diffs (Claude Code / git hunk headers).
 * @param rows - the flat diff rows.
 * @param context - how many unchanged rows around a change stay visible.
 * @returns ordered segments (hunks and folds).
 */
export declare function buildDiffSegments(rows: readonly DiffRow[], context?: number): DiffSegment[];
/** One intra-line segment: a run of chars with a changed flag. */
export interface InlineSegment {
    readonly text: string;
    readonly changed: boolean;
}
/** Each side's intra-line segments. */
export interface InlineDiff {
    readonly old: readonly InlineSegment[];
    readonly next: readonly InlineSegment[];
}
/**
 * Intra-line diff by common prefix/suffix: the shared leading and trailing
 * characters stay unchanged, and only the differing middle is marked changed
 * on both sides. This never highlights identical characters and keeps a small
 * edit inside a long line immediately visible. Pure, no React/DOM.
 * @param oldText - the old line.
 * @param newText - the new line.
 * @returns per-side segments marking changed runs.
 */
export declare function diffInline(oldText: string, newText: string): InlineDiff;
/**
 * Merge adjacent inline segments sharing the same changed flag, so rendering
 * wraps each run — not each character — in one span.
 * @param segments - the raw per-character-heavy inline segments.
 * @returns coalesced segments; identical text joined into runs.
 */
export declare function coalesceInline(segments: readonly InlineSegment[]): InlineSegment[];
/** Human byte count for the panel meta row. */
export declare function formatBytes(bytes: number): string;
/** One parsed diff line of a unified diff (git's own hunk structure). */
export interface DiffLine {
    kind: 'ctx' | 'del' | 'add' | 'meta';
    /** The line content without its diff marker ('' for the no-newline marker). */
    text: string;
    /** Old-side line number (null for pure additions / metadata). */
    oldNum: number | null;
    /** New-side line number (null for pure deletions / metadata). */
    newNum: number | null;
}
/** One parsed hunk. */
export interface DiffHunk {
    /** The old-side start line (`-a[,b]`). */
    oldStart: number;
    /** The new-side start line (`+c[,d]`). */
    newStart: number;
    /** The section text after the trailing `@@` (may be empty). */
    header: string;
    lines: DiffLine[];
}
/** One parsed file section of a unified diff. */
export interface DiffFile {
    /** The `---` path verbatim ('/dev/null' for a new file). */
    oldPath: string;
    /** The `+++` path verbatim ('/dev/null' for a deleted file). */
    newPath: string;
    /** The file changed with binary content: no hunks to draw. */
    binary: boolean;
    hunks: DiffHunk[];
}
/** The parsed unified diff. */
export interface ParsedDiff {
    files: DiffFile[];
}
/**
 * Parse `git diff --no-color` output into file sections and hunks. Rows
 * outside a file section (leading noise) and metadata rows between the
 * `diff --git`/`---`/`+++` headers and the first hunk (index lines, mode
 * changes, rename/similarity lines) are skipped; a section that never
 * reaches a hunk (a mode/rename-only change) stays hunkless so the caller
 * can still draw its path.
 */
export declare function parseUnifiedDiff(text: string): ParsedDiff;
/**
 * Convert one parsed unified-diff file into renderer segments: each hunk's
 * lines become a paired-mod hunk segment, and the unemitted context gaps
 * between hunks (git already trimmed them) become non-expandable folds that
 * still carry their old/new line ranges. The rewrite pairing applies within
 * each hunk, exactly like session-op diffs.
 */
export declare function unifiedSegments(file: DiffFile): DiffSegment[];
/** Build the untracked-file shape: one file, one hunk of pure additions. */
export declare function untrackedFile(path: string, content: string): DiffFile;
/**
 * Materialize a git gap fold's hidden rows from the two sides' full file
 * contents, by the fold's known line ranges: the old side drives context
 * rows (each mapped onto the new side through the fold's offset — a gap is
 * an unchanged run, so the sides align), and new-side lines the old range
 * never reaches become pure additions. Line numbers clip to the actual
 * content (a no-newline file's ranges can overrun by one); `\r` endings
 * survive verbatim, like git's own context lines.
 */
export declare function foldRowsFromContents(fold: FoldSegment, oldContent: string, newContent: string): DiffRow[];
/** Strip the `a/` / `b/` prefix git puts on diff paths (not on /dev/null). */
export declare function displayPath(path: string): string;
/** The diff's add/del/mod row counts (the "+n −m" header chips). */
export declare function diffStats(segments: readonly DiffSegment[]): {
    added: number;
    deleted: number;
};
