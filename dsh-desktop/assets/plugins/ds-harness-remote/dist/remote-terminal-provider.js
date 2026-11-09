import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { userInfo } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { RpcError } from './safe-error.js';
/** Match official shell profiles: ordinary shells are explicitly interactive. */
function profile(path) {
    const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
    const kind = name.toLowerCase().replace(/\.exe$/u, '');
    return { path, name, args: kind === 'cmd' ? [] : ['pwsh', 'powershell'].includes(kind) ? ['-NoLogo'] : ['-i'] };
}
async function localExecutable(file, _env, signal) {
    signal?.throwIfAborted();
    const extensions = process.platform === 'win32' && !/\.[^\\/]+$/.test(file)
        ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
    const paths = isAbsolute(file) ? [file] : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(dir => join(dir, file));
    for (const path of paths)
        for (const extension of extensions) {
            try {
                await access(path + extension, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
                signal?.throwIfAborted();
                return path + extension;
            }
            catch (error) {
                if (signal?.aborted)
                    throw error;
            }
        }
    throw new RpcError('TERMINAL_SHELL_UNAVAILABLE', 'The terminal shell is unavailable.');
}
export async function discoverTerminalShells(provider, signal = new AbortController().signal) {
    signal.throwIfAborted();
    if (provider?.terminalEnvironment && !provider.resolveExecutable)
        throw new RpcError('TERMINAL_SHELL_UNAVAILABLE', 'The terminal provider cannot verify its shells.');
    // Older providers lack discovery. Only that compatibility path uses Host-local facts.
    const environment = provider?.terminalEnvironment === undefined
        ? { platform: process.platform === 'win32' ? 'windows' : 'posix',
            defaultShell: process.platform === 'win32' ? process.env.ComSpec : process.env.SHELL || userInfo().shell || undefined }
        : await provider.terminalEnvironment(signal);
    const resolve = provider?.resolveExecutable?.bind(provider) ?? localExecutable;
    const preferred = profile(environment.defaultShell || (environment.platform === 'windows' ? 'cmd.exe' : '/bin/sh'));
    preferred.path = await resolve(preferred.path, undefined, signal);
    // Legacy providers do not distinguish missing candidates from transport
    // failures. Verify their default, without guessing which errors to swallow.
    if (provider && !provider.terminalEnvironment)
        return [preferred];
    const candidates = ['zsh', 'bash', 'fish', 'pwsh', 'powershell', 'cmd'];
    const found = await Promise.all(candidates.map(async (file) => {
        try {
            return { ...profile(file), path: await resolve(file, undefined, signal) };
        }
        catch (error) {
            if (error instanceof RpcError && error.code === 'TERMINAL_SHELL_UNAVAILABLE'
                || error instanceof Error && error.name === 'SubprocessExecutableNotFoundError')
                return undefined;
            throw error;
        }
    }));
    signal.throwIfAborted();
    const shells = new Map();
    for (const shell of [preferred, ...found])
        if (shell) {
            const kind = shell.name.toLowerCase().replace(/\.exe$/u, '');
            if (!shells.has(kind))
                shells.set(kind, shell);
        }
    return [...shells.values()];
}
/** Compatibility fallback only: pipes cannot provide PTY resize or job control. */
export function pipeTerminalSpawner() {
    return Object.assign(async (spec) => {
        spec.signal.throwIfAborted();
        const child = spawn(spec.argv[0], spec.argv.slice(1), {
            cwd: spec.cwd, stdio: 'pipe', windowsHide: true,
            env: { ...process.env, ...spec.env, TERM: spec.terminalType },
        });
        const output = new PassThrough();
        output.setEncoding('utf8');
        child.stdout.pipe(output, { end: false });
        child.stderr.pipe(output, { end: false });
        const completed = new Promise((resolve, reject) => {
            child.once('error', error => { output.destroy(); reject(error); });
            child.once('close', exitCode => { output.end(); resolve({ exitCode }); });
        });
        void completed.catch(() => undefined);
        const abort = () => { child.kill(); };
        spec.signal.addEventListener('abort', abort, { once: true });
        try {
            await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
            spec.signal.throwIfAborted();
        }
        catch (error) {
            child.kill();
            throw error;
        }
        finally {
            spec.signal.removeEventListener('abort', abort);
        }
        return {
            output: output,
            write: data => { child.stdin.write(data); }, resize: () => undefined,
            terminate: async () => {
                child.kill();
                const timer = setTimeout(() => { child.kill('SIGKILL'); }, 1000);
                timer.unref();
                try {
                    await completed;
                }
                finally {
                    clearTimeout(timer);
                }
            },
            completed,
        };
    }, { shells: (signal) => discoverTerminalShells(undefined, signal) });
}
/** Reuse official PTY, shell activity integration and process-range termination. */
export function subprocessTerminalSpawner(subprocess) {
    return Object.assign(async (spec) => {
        spec.signal.throwIfAborted();
        const allocation = new AbortController();
        const abort = () => allocation.abort(spec.signal.reason);
        spec.signal.addEventListener('abort', abort, { once: true });
        let handle;
        try {
            handle = await subprocess.spawnTerminal({ ...spec, signal: allocation.signal, argv: [...spec.argv], shellActivity: true, graceMs: 1000 });
        }
        finally {
            // A completed allocation belongs to the Host, not the request timeout or
            // the physical connection, including on older subprocess providers.
            spec.signal.removeEventListener('abort', abort);
        }
        handle.output.setEncoding?.('utf8');
        const completed = handle.done.then(outcome => ({ exitCode: typeof outcome?.exitCode === 'number' ? outcome.exitCode : null }));
        void completed.catch(() => { handle.output.destroy(); });
        return {
            output: handle.output,
            write: data => handle.write(data), resize: (cols, rows) => handle.resize(cols, rows),
            terminate: () => handle.terminate(),
            completed,
            ...(handle.inspectActivity === undefined ? {} : { inspectActivity: () => handle.inspectActivity() }),
        };
    }, { shells: (signal) => discoverTerminalShells(subprocess, signal) });
}
//# sourceMappingURL=remote-terminal-provider.js.map