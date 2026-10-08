/**
 * Resolve an existing path to one absolute, lexically-normalized target.
 *
 * @param cwd - Session workspace directory (the base of relative targets).
 * @param target - Client-supplied absolute or session-relative path.
 * @param _fence - IGNORED. Kept as a positional parameter so every call site
 *  (and the route tests) did not have to change shape in the same commit; the
 *  containment decision it used to carry is gone for good. New code should
 *  omit it.
 * @returns The absolute path used for the filesystem operation.
 * @deprecated The name is historical — this is now plain resolution. Use
 *  {@link resolveTarget} in new code.
 */
export declare function ensureWorkspacePath(cwd: string, target: string, _fence?: boolean): Promise<string>;
/**
 * Resolve a path for a WRITE destination (which may not exist yet).
 *
 * Lexical only, exactly like {@link ensureWorkspacePath}: a missing target is
 * returned as the caller composed it (its parent is created on demand), and an
 * existing symlink in the path is NOT resolved — the caller writes through it,
 * which is what "no containment policy" means.
 *
 * @param cwd - Session workspace directory (the base of relative targets).
 * @param target - Client-supplied absolute or session-relative path.
 * @param _fence - IGNORED (see {@link ensureWorkspacePath}).
 * @returns The absolute destination path.
 * @deprecated The name is historical — this is now plain resolution.
 */
export declare function ensureWorkspaceWritePath(cwd: string, target: string, _fence?: boolean): Promise<string>;
/**
 * The single resolution primitive: session-relative targets resolve under the
 * session cwd, absolute targets stay absolute, and the result is `resolve()`d
 * (lexical `..` collapse). Throws fs-error for a non-absolute result.
 */
export declare function resolveTarget(cwd: string, target: string): string;
