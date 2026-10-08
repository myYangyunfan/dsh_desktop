/**
 * Reinterpret an already-absolute path in the namespace of one session.
 *
 * Windows treats `/foo` as rooted on the current drive, so `path.resolve()`
 * turns it into e.g. `C:\\foo`. That is wrong for a session whose cwd is a
 * WSL UNC path: in that namespace `/foo` means the distro's Linux `/foo`.
 * Project only that unambiguous combination onto the matching distro root;
 * drive paths, UNC paths, ordinary Windows sessions and non-Windows hosts
 * keep their existing semantics.
 *
 * Workspace containment is intentionally NOT handled here. A projected path
 * such as `/tmp/x` can still be rejected later for lying outside the session
 * workspace; the important part is that it is checked as WSL `/tmp/x`, not
 * silently redirected to `C:\\tmp\\x`.
 */
export declare function resolveSessionPath(cwd: string, target: string, platform?: NodeJS.Platform): string;
