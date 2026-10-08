/** Inputs of one upload: the session scope plus the request body stream. */
export interface WorkspaceUploadInput {
    /** The session workspace root (the base of session-relative targets). */
    cwd: string;
    /** Absolute upload directory chosen by the client. */
    dir: string;
    /** Relative path below `dir` (absolute paths, '.', '..' and empty segments refused). */
    relativePath: string;
    /** The request body stream (raw bytes). */
    chunks: AsyncIterable<string | Uint8Array>;
    /** Byte cap; an oversized upload is refused without touching the target. */
    limit: number;
    /** @deprecated IGNORED — containment was removed. Do not pass it. */
    fence?: boolean;
}
/**
 * Stream `chunks` into `dir/relativePath` atomically: a uniquely named temp
 * sibling receives the bytes, then is renamed over the target. The parent
 * directory is created on demand (recursive), so folder uploads work before
 * any level exists. The unique temp name keeps concurrent uploads to the same
 * target independent (each writes and renames its own file; the last rename
 * wins) and never blocks later uploads after a crashed process.
 *
 * @throws SidebarError with a wire code for shape and size failures; the temp
 * file is always removed on failure.
 */
export declare function writeWorkspaceUpload(input: WorkspaceUploadInput): Promise<{
    path: string;
    size: number;
}>;
/** Inputs of one tree-row rename. */
export interface WorkspaceRenameInput {
    /** The session workspace root (the base of session-relative targets). */
    cwd: string;
    /** Absolute path of the row as the tree displays it (may be a symlink). */
    path: string;
    /** The new base name (single segment — rename never moves across directories). */
    name: string;
    /** @deprecated IGNORED — containment was removed. Do not pass it. */
    fence?: boolean;
}
/**
 * Rename one tree row within its directory: `path` → `<parent>/<name>`.
 * The new name must be a single path segment (this is rename, not move);
 * an existing destination is refused (POSIX rename would clobber it
 * silently); the workspace root itself is never renamable; a symlink row
 * renames the link, not its target. A no-op rename (same name) succeeds
 * without touching the filesystem.
 *
 * @throws SidebarError with a wire code for shape, existence and root
 * failures.
 */
export declare function renameWorkspaceEntry(input: WorkspaceRenameInput): Promise<{
    path: string;
}>;
/** Inputs of one new directory row. */
export interface WorkspaceMkdirInput {
    /** The session workspace root (the base of session-relative targets). */
    cwd: string;
    /** Absolute path of the PARENT row as the tree displays it (a directory). */
    path: string;
    /** The new directory's base name (single segment — mkdir never nests). */
    name: string;
    /** @deprecated IGNORED — containment was removed. Do not pass it. */
    fence?: boolean;
}
/**
 * Create one directory inside an existing tree row: `<path>/<name>`.
 * The name must be a single path segment; an existing destination is refused
 * (mkdir would otherwise fail with EEXIST anyway, but the explicit check
 * yields the same "already exists" sentence rename uses); the parent row may
 * be any directory the host user can write.
 *
 * @throws SidebarError with a wire code for shape and existence failures.
 */
export declare function mkdirWorkspaceEntry(input: WorkspaceMkdirInput): Promise<{
    path: string;
}>;
/** Inputs of one tree-row delete. */
export interface WorkspaceRemoveInput {
    /** The session workspace root (the base of session-relative targets). */
    cwd: string;
    /** Absolute path of the row as the tree displays it (may be a symlink). */
    path: string;
    /** @deprecated IGNORED — containment was removed. Do not pass it. */
    fence?: boolean;
}
/**
 * Delete one tree row permanently (there is no trash on the host): files are
 * unlinked, directories removed recursively, a symlink row unlinks the LINK
 * only (lstat decides, so a link to a directory does not recurse into its
 * target). The workspace root itself is never removable.
 *
 * @throws SidebarError with a wire code for existence and root failures.
 */
export declare function removeWorkspaceEntry(input: WorkspaceRemoveInput): Promise<{
    path: string;
}>;
