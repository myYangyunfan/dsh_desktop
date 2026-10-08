/** A parsed `git status --porcelain=v1 -z` entry. */
export interface GitStatusEntry {
    path: string;
    /** Two-letter index/worktree status (X Y), e.g. 'M ', ' M', 'A ', '??'. */
    xy: string;
}
/** The source-control panel snapshot. */
export interface GitStatusResult {
    isRepo: boolean;
    branch?: string;
    entries: GitStatusEntry[];
    /** True when the working tree had more rows than `GIT_STATUS_LIMIT`; the
     *  panel shows a truncation notice instead of freezing on a huge untracked
     *  set (issue #369). */
    truncated?: boolean;
    /** Selected repository root, or the discovered roots when the cwd is a container. */
    root?: string;
    repositories?: string[];
}
/** One linked checkout returned by `git worktree list --porcelain`. */
export interface GitWorktree {
    /** Absolute checkout root. */
    path: string;
    /** Branch name without `refs/heads/`, or `HEAD` when detached. */
    branch: string;
    /** Whether this checkout contains the session cwd. */
    current: boolean;
    /** Number of staged + unstaged status rows (a file changed on both sides counts once). */
    changes: number;
}
/** One `git log` row. */
export interface GitLogEntry {
    /** Short hash (7+ chars, display). */
    hash: string;
    /** Full 40-char hash (advanced operations: revert / cherry-pick). */
    hashFull: string;
    subject: string;
    author: string;
    /** ISO 8601 author date (`%ai`), e.g. `2024-01-01 10:00:00 +0800`. */
    date: string;
    /** Ref decorations (`%D` with --decorate=short), e.g. `HEAD -> main, origin/main`; '' when none. */
    refs: string;
}
/** One git failure (stderr text as the message). */
export declare class GitCommandError extends Error {
    readonly code: string;
    readonly command: string;
    constructor(message: string, code: string | undefined, command: string);
}
/** Parse porcelain v1 -z output into entries (rename/copy pairs collapse to one row). */
export declare function parsePorcelainZ(output: string): GitStatusEntry[];
/** One raw porcelain worktree record. Prunable checkouts are retained by
 * Git's administrative metadata after their directory disappears and must not
 * become selectable command targets. Locked checkouts remain usable. */
export interface GitWorktreeRecord {
    path: string;
    branch: string;
    locked: boolean;
    prunable: boolean;
}
/** Parse `git worktree list --porcelain` records. Production requests use
 * `-z` so even newlines and non-ASCII bytes in checkout paths stay lossless;
 * newline framing remains accepted for small fixtures and older Git output. */
export declare function parseWorktreeList(output: string): GitWorktreeRecord[];
/** Parse `git log --pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D` rows. */
export declare function parseLogLines(output: string): GitLogEntry[];
/** Whether the directory is inside a git work tree (exit-0 `git rev-parse`).
 *  Probe timeout is short: a cwd on a stalled mount must not hold the panel
 *  hostage for the full command budget (issue #369). */
export declare function isGitRepo(cwd: string): Promise<boolean>;
/** Discover the current repository or direct child repositories. Results are
 *  cached per cwd and concurrent callers share one in-flight scan, so opening
 *  the panel (three parallel git.* requests) costs a single discovery pass. */
export declare function repoRoots(cwd: string): Promise<string[]>;
/** Resolve the selected repository, defaulting to the first discovered root. */
export declare function repoRoot(cwd: string, selected?: string): Promise<string>;
/** The current branch name (`git rev-parse --abbrev-ref HEAD`; 'HEAD' when detached). */
export declare function currentBranch(cwd: string): Promise<string>;
/**
 * Working-tree status (untracked included). `--untracked-files=all` lists
 * the contents of new directories as individual entries, while preserving
 * repository discovery and explicit repository selection for workspace roots.
 */
export declare function status(cwd: string, selected?: string): Promise<GitStatusResult>;
/** All linked checkouts of the repository containing `cwd`, enriched with a
 * live change count. The current checkout is first so a single-worktree repo
 * preserves the old UI ordering. */
export declare function worktrees(cwd: string): Promise<GitWorktree[]>;
/** Resolve an optional client-selected linked checkout. A caller may never use
 * this seam to point Git operations at an unrelated repository: the target
 * must occur in the authoritative session repository's worktree list. */
export declare function resolveWorktree(cwd: string, requested?: string): Promise<string>;
/** Diff text of the worktree (unstaged) or the index (staged). */
export declare function diff(cwd: string, path: string | undefined, staged: boolean, selected?: string): Promise<string>;
/** Stage paths (all when path is undefined). */
export declare function stage(cwd: string, path: string | undefined, selected?: string): Promise<void>;
/** Unstage paths (all when path is undefined). */
export declare function unstage(cwd: string, path: string | undefined, selected?: string): Promise<void>;
/** Commit the staged changes with a message (global identity untouched). */
export declare function commit(cwd: string, message: string, selected?: string): Promise<void>;
/** Branch names (current first). */
export declare function branches(cwd: string, selected?: string): Promise<{
    current: string;
    names: string[];
}>;
/** Switch to an existing branch. */
export declare function checkout(cwd: string, branch: string, selected?: string): Promise<void>;
/** Recent commit history (newest first), lazily pageable via skip/count. */
export declare function log(cwd: string, count?: number, skip?: number, selected?: string): Promise<GitLogEntry[]>;
/**
 * Content of a file at a revision (`git show <rev>:<path>`), or null when the
 * revision has no such path (a new/untracked file has no HEAD side).
 */
export declare function show(cwd: string, rev: string, path: string, selected?: string): Promise<string | null>;
/** Full patch text of one commit (`git show` with the commit header suppressed).
 *  Merge commits show their diff against the first parent (`-m --first-parent`
 *  is a no-op for regular commits), so a history click always has content. */
export declare function commitDiff(cwd: string, hash: string, selected?: string): Promise<string>;
/** Discard the worktree changes of one path (`git checkout -- <path>`; the index is untouched). */
export declare function discard(cwd: string, path: string, selected?: string): Promise<void>;
/** Revert one commit onto the current branch with an auto-generated message. */
export declare function revert(cwd: string, hash: string, selected?: string): Promise<void>;
/** Cherry-pick one commit onto the current branch. */
export declare function cherryPick(cwd: string, hash: string, selected?: string): Promise<void>;
