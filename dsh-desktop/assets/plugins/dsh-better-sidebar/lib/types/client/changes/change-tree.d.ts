/**
 * The changes list's hierarchy.
 *
 * A `git status` answer is a flat list of repo-relative paths, and the Git
 * lens used to render exactly that: one row per file, with the file name and
 * its directory squeezed onto the same line. Nested work (a refactor touching
 * `src/client/changes/*`) then read as a wall of near-identical rows. This
 * module folds the list into the directory tree the lens renders — VS Code's
 * SCM tree, including its single-child directory compression — so the shape
 * of the change is legible at a glance.
 *
 * Pure — no React, no DOM. `buildChangeTree` runs once per group per fold;
 * the renderer only walks the result.
 */
import type { GitStatusEntry } from '../api.ts';
import { type GitFileStatus } from '../ui/index.ts';
/** One changed file (a leaf), carrying its porcelain status. */
export interface ChangeFile {
    kind: 'file';
    /** The file's own name (the last path segment). */
    name: string;
    /** The repo-relative path exactly as git reported it (the row's identity). */
    path: string;
    status: GitFileStatus;
}
/** One directory row: its children plus the number of changed files beneath. */
export interface ChangeDir {
    kind: 'dir';
    /** The display label: one segment, or the compressed chain ('src/client'). */
    name: string;
    /** The deepest directory this row stands for. */
    path: string;
    children: ChangeNode[];
    /** Changed files anywhere under this row (the row's count pill). */
    changes: number;
}
export type ChangeNode = ChangeDir | ChangeFile;
/**
 * Fold one group's changed files (unstaged or staged) into a directory tree.
 * Rows without a porcelain status (clean, ignored) are skipped, a repeated
 * path counts once, and an empty input yields an empty list.
 * @param entries - the group's `git status` entries.
 * @returns the tree's roots, ready to render in order.
 */
export declare function buildChangeTree(entries: readonly GitStatusEntry[]): ChangeNode[];
