import { mkdir, readdir, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename, dirname, isAbsolute, parse, resolve } from 'node:path';
import { RpcError } from './safe-error.js';
const MAX_ENTRIES = 500;
/**
 * Native Harness `workspace/create` realpath's the folder and fails with ENOENT
 * when parent directories are missing. Create them on the Host before forwarding.
 * Only absolute, non-root paths are accepted.
 */
export async function ensureHostWorkspaceDirectory(path) {
    if (typeof path !== 'string' || path.trim() === '' || path.includes('\0') || !isAbsolute(path)
        || resolve(path) === parse(path).root) {
        throw new RpcError('INVALID_MESSAGE', 'Workspace path must be an absolute, non-root directory path.');
    }
    // Preserve the exact path forwarded to Harness, including whitespace and
    // symlink/.. traversal semantics; resolve() here could create a different folder.
    await mkdir(path, { recursive: true });
}
/** Read-only fallback used only over an authenticated Host channel when Harness has a native-only picker. */
export async function listRemoteDirectory(path, signal) {
    signal?.throwIfAborted();
    const home = resolve(homedir());
    const target = path === undefined || path.trim() === '' ? home : resolve(path);
    if (!isAbsolute(target))
        throw new Error('The remote directory path must be absolute.');
    const rows = await readdir(target, { withFileTypes: true });
    const directories = [];
    for (const row of rows) {
        signal?.throwIfAborted();
        const child = resolve(target, row.name);
        let directory = row.isDirectory();
        if (!directory && row.isSymbolicLink())
            directory = await stat(child).then(value => value.isDirectory()).catch(() => false);
        if (!directory)
            continue;
        directories.push({ name: row.name, path: child, hidden: platform() !== 'win32' && row.name.startsWith('.') });
    }
    directories.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    return {
        path: target,
        home,
        crumbs: crumbs(target),
        entries: directories.slice(0, MAX_ENTRIES),
        truncated: directories.length > MAX_ENTRIES,
    };
}
function crumbs(path) {
    const root = parse(path).root;
    const result = [{ name: root, path: root, hidden: false }];
    const segments = [];
    let current = path;
    while (current !== root) {
        segments.unshift(basename(current));
        current = dirname(current);
    }
    for (const segment of segments) {
        current = resolve(current, segment);
        result.push({ name: segment, path: current, hidden: false });
    }
    return result;
}
//# sourceMappingURL=remote-directory-browser.js.map