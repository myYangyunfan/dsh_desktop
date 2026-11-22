import { execFile, execFileSync, spawn, } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { win32 } from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
/** Windows executable extensions accepted when resolving PATH or candidate binaries, in priority order. */
export const WINDOWS_EXECUTABLE_EXTENSIONS = ['.exe', '.cmd', '.bat', '.com'];
const EXTENSION_PRIORITY = Object.freeze({
    '.exe': 0,
    '.cmd': 1,
    '.bat': 2,
    '.com': 3,
});
const MAX_SHIM_BYTES = 64 * 1024;
const ALLOWED_SHIM_SET_VARS = new Set(['dp0', '_prog', 'pathext']);
const NPM_SHIM_INVOCATION_PATTERN = /(?:^|[&\s])(?:"(?:%_prog%|%~dp0\\+node\.exe|%dp0%\\+node\.exe)"|node)\s+"((?:%~dp0|%dp0%)[^"]+\.(?:[cm]?js))"\s+%\*\s*$/im;
/** Check whether a path ends with a supported Windows executable extension. */
export function isWindowsExecutablePath(filePath) {
    const ext = win32.extname(filePath.trim()).toLowerCase();
    return Object.prototype.hasOwnProperty.call(EXTENSION_PRIORITY, ext);
}
/** Return extension priority rank (`.exe` < `.cmd` < `.bat` < `.com`), or Infinity for non-executables. */
export function windowsExecutableRank(filePath) {
    const ext = win32.extname(filePath.trim()).toLowerCase();
    return EXTENSION_PRIORITY[ext] ?? Number.POSITIVE_INFINITY;
}
/** Check whether a path points to a Windows batch shim (`.cmd` or `.bat`). */
export function isWindowsBatchFile(filePath) {
    const ext = win32.extname(filePath.trim()).toLowerCase();
    return ext === '.cmd' || ext === '.bat';
}
/** Filter `where` output lines to valid Windows executables and prefer `.exe` over `.cmd`/`.bat`/`.com`. */
export function selectWindowsExecutable(lines, checkExecutable = defaultIsFile) {
    const matches = [];
    for (const rawLine of lines) {
        const candidate = rawLine.trim();
        if (!candidate || !isWindowsExecutablePath(candidate))
            continue;
        if (!checkExecutable(candidate))
            continue;
        matches.push(win32.resolve(candidate));
    }
    if (matches.length === 0)
        return undefined;
    matches.sort((left, right) => windowsExecutableRank(left) - windowsExecutableRank(right));
    return matches[0];
}
/** Probe PATH with `where` on Windows and pick the highest-priority valid executable. */
export function lookupWindowsPathExecutable(command, checkExecutable) {
    try {
        const output = execFileSync('where', [command], {
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
        });
        return selectWindowsExecutable(output.split(/\r?\n/), checkExecutable);
    }
    catch {
        return undefined;
    }
}
/** Reject control characters (`\r`, `\n`, `\0`) that cannot be safely passed through process/shell arguments. */
export function assertSafeCommandArgument(value) {
    if (/[\r\n\0]/.test(value)) {
        throw new Error('Command arguments must not contain CR, LF, or NUL characters.');
    }
}
/** Escape one argument for a `.cmd`/`.bat` invocation via `cmd.exe /d /s /c` with `windowsVerbatimArguments`. */
export function escapeCmdBatchArgument(arg) {
    assertSafeCommandArgument(arg);
    let quoted = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1');
    quoted = `"${quoted}"`;
    // Double-escape cmd.exe metacharacters: once for the outer `cmd.exe /c`, once for `%*` inside the batch file.
    quoted = quoted.replace(/([()%!^"<>&|])/g, '^$1');
    quoted = quoted.replace(/([()%!^"<>&|])/g, '^$1');
    return quoted;
}
/**
 * Parse a standard npm/pnpm `.cmd` shim and resolve its Node JS entry script so it can be spawned
 * directly via `process.execPath` without `cmd.exe`. Returns `undefined` for non-standard batch scripts.
 */
export function resolveNpmCmdShim(cmdPath, hooks = {}) {
    if (!isWindowsBatchFile(cmdPath))
        return undefined;
    const read = hooks.readFileSync ?? ((path, encoding) => readFileSync(path, encoding));
    const isFile = hooks.isFile ?? defaultIsFile;
    let content;
    try {
        content = read(cmdPath, 'utf8');
    }
    catch {
        return undefined;
    }
    if (!content || Buffer.byteLength(content, 'utf8') > MAX_SHIM_BYTES)
        return undefined;
    if (hasUnexpectedSetStatement(content))
        return undefined;
    const match = NPM_SHIM_INVOCATION_PATTERN.exec(content);
    if (!match?.[1])
        return undefined;
    const relativeTarget = match[1].replace(/^%~?dp0%?[\\/]?/i, '');
    // Abort direct Node launch if the script path still contains unexpanded `%VAR%` references.
    if (relativeTarget.includes('%'))
        return undefined;
    const resolvedScript = win32.resolve(win32.dirname(cmdPath), relativeTarget);
    if (!isFile(resolvedScript))
        return undefined;
    const isElectron = hooks.isElectron ?? Boolean(process.versions.electron);
    return {
        file: hooks.nodeExecPath ?? process.execPath,
        argsPrefix: [resolvedScript],
        ...(isElectron ? { envPatch: { ELECTRON_RUN_AS_NODE: '1' } } : {}),
    };
}
/**
 * Resolve command and arguments for safe execution on Windows (and pass-through with `windowsHide: true`
 * on POSIX). Resolves `.cmd`/`.bat` shims to direct `process.execPath` when possible and falls back to
 * `cmd.exe /d /s /c` with strict argument validation and escaping.
 */
export function resolveSpawnTarget(command, args, options, hooks = {}) {
    assertSafeCommandArgument(command);
    for (const arg of args)
        assertSafeCommandArgument(arg);
    const platform = hooks.platform ?? process.platform;
    const baseOptions = { ...options, windowsHide: true };
    if (platform !== 'win32') {
        return { file: command, args: [...args], options: baseOptions };
    }
    const isFile = hooks.isFile ?? defaultIsFile;
    const resolvedCommand = resolveWindowsCommand(command, isFile, hooks.lookupPath);
    if (!isWindowsBatchFile(resolvedCommand)) {
        return { file: resolvedCommand, args: [...args], options: baseOptions };
    }
    const shim = resolveNpmCmdShim(resolvedCommand, hooks);
    if (shim) {
        const env = shim.envPatch ? { ...(options.env ?? process.env), ...shim.envPatch } : options.env;
        return {
            file: shim.file,
            args: [...shim.argsPrefix, ...args],
            options: env ? { ...baseOptions, env } : baseOptions,
        };
    }
    if (resolvedCommand.includes('"') || resolvedCommand.includes('%')) {
        throw new Error('Batch executable path contains unsafe characters.');
    }
    const quotedCommand = `"${resolvedCommand}"`;
    const escapedArgs = args.map(escapeCmdBatchArgument);
    const innerCommand = escapedArgs.length > 0 ? `${quotedCommand} ${escapedArgs.join(' ')}` : quotedCommand;
    const comspec = hooks.comspec ?? options.env?.ComSpec ?? process.env.ComSpec ?? 'cmd.exe';
    return {
        file: comspec,
        args: ['/d', '/s', '/c', `"${innerCommand}"`],
        options: { ...baseOptions, windowsVerbatimArguments: true },
    };
}
/** Spawn a stdio child process safely across POSIX and Windows (`.cmd`/`.bat` aware, `windowsHide: true`). */
export function spawnCommand(command, args, options = {}) {
    const target = resolveSpawnTarget(command, args, options);
    return spawn(target.file, target.args, target.options);
}
/** Execute a one-shot CLI probe safely across POSIX and Windows (`.cmd`/`.bat` aware, `windowsHide: true`). */
export async function execFileCommand(command, args, options = {}) {
    const target = resolveSpawnTarget(command, args, options);
    const result = await execFileAsync(target.file, target.args, target.options);
    return {
        stdout: String(result.stdout ?? ''),
        stderr: String(result.stderr ?? ''),
    };
}
function resolveWindowsCommand(command, isFile, lookupPath) {
    if (isWindowsExecutablePath(command))
        return command;
    const hasPathSeparator = command.includes('\\') || command.includes('/');
    if (!hasPathSeparator) {
        const resolved = lookupPath
            ? lookupPath(command)
            : lookupWindowsPathExecutable(command, candidate => isFile(candidate));
        return resolved ?? command;
    }
    for (const ext of WINDOWS_EXECUTABLE_EXTENSIONS) {
        const candidate = `${command}${ext}`;
        if (isFile(candidate))
            return candidate;
    }
    return command;
}
function hasUnexpectedSetStatement(content) {
    for (const rawLine of content.split(/\r?\n/)) {
        const match = /^\s*@?SET\s+"?([A-Za-z_][A-Za-z0-9_]*)=/i.exec(rawLine);
        if (!match)
            continue;
        if (!ALLOWED_SHIM_SET_VARS.has(match[1].toLowerCase()))
            return true;
    }
    return false;
}
function defaultIsFile(candidate) {
    try {
        return statSync(candidate).isFile();
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=windows-spawn.js.map