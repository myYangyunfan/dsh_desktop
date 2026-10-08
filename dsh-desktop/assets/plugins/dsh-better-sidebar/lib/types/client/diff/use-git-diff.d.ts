import type { SessionScope } from '../api.ts';
import type { SidebarDiffRef } from '../state.ts';
import { type DiffFile, type DiffRow, type FoldSegment } from './rows.ts';
/** The loaded state of one git diff target. */
export interface GitDiffTarget {
    /** A fetch is in flight (true only while nothing has loaded yet, or after a refresh drops the data). */
    loading: boolean;
    error: string | null;
    /** The patch text; `''` = the file genuinely has no text change. */
    diffText: string | null;
    /** Untracked-file content rendered as a full addition (undefined otherwise). */
    untracked: string | undefined;
    /** Re-read the diff (and drop the fold cache) with the next tick. */
    refresh(): void;
    /** The on-demand fold loader `DiffFiles` forwards to its rows (undefined without a ref). */
    resolveFold: ((file: DiffFile, segment: FoldSegment) => Promise<readonly DiffRow[]>) | undefined;
}
/**
 * Load one git diff target (worktree change or commit patch) and expose its
 * on-demand fold expansion. `ref === null` keeps every value inert.
 */
export declare function useGitDiffTarget(ref: SidebarDiffRef | null, scope: SessionScope): GitDiffTarget;
