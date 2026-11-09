import { realpath, lstat, readdir, open, stat, watch } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { RpcError } from './safe-error.js';
import { RemoteTerminalController, RemoteTerminalState } from './remote-terminal-controller.js';
import { pipeTerminalSpawner } from './remote-terminal-provider.js';
export * from './remote-terminal-provider.js';
const MAX_READ_BYTES = 4 * 1024 * 1024;
export class WorkspaceBridgeState extends RemoteTerminalState {
}
class AsyncQueue {
    values = [];
    waiters = [];
    ended = false;
    push(value) {
        if (this.ended)
            return;
        const waiter = this.waiters.shift();
        if (waiter)
            waiter({ done: false, value });
        else
            this.values.push(value);
    }
    end() {
        this.ended = true;
        while (this.waiters.length)
            this.waiters.shift()({ done: true, value: undefined });
    }
    next() {
        const value = this.values.shift();
        if (value !== undefined)
            return Promise.resolve({ done: false, value });
        if (this.ended)
            return Promise.resolve({ done: true, value: undefined });
        return new Promise(resolve => this.waiters.push(resolve));
    }
    [Symbol.asyncIterator]() { return this; }
}
/** Shared Host-owned workspace files and terminal implementation; authority comes from the backend resolver. */
export class WorkspaceBridge {
    resolveCwd;
    terminalEnabled;
    state;
    scope;
    terminal;
    ownedSubscribers = new Set();
    constructor(resolveCwd, terminalEnabled, state = new WorkspaceBridgeState(), spawnTerminal = pipeTerminalSpawner(), scope) {
        this.resolveCwd = resolveCwd;
        this.terminalEnabled = terminalEnabled;
        this.state = state;
        this.scope = scope;
        this.terminal = new RemoteTerminalController(state, spawnTerminal, terminalEnabled, (code, message) => this.scopeError(code, message));
    }
    isScope(value) {
        return this.scope.parse(value) !== undefined;
    }
    async call(endpoint, payload, signal) {
        const args = argsOf(payload);
        const raw = toolScope(endpoint, args);
        const session = this.scope.parse(raw);
        if (session === undefined) {
            if (this.scope.owns(raw))
                throw this.scopeError('SESSION_INVALID', 'The CodeX session identifier is invalid.');
            return undefined;
        }
        if (endpoint.startsWith('workspaceFiles/'))
            return this.fileCall(endpoint, session.sessionId, args, signal);
        if (endpoint.startsWith('terminal/')) {
            if (!this.terminalEnabled())
                throw new RpcError('TERMINAL_DISABLED', 'Remote terminal is disabled on this Host.');
            const revision = this.state.revision;
            const cwd = await this.rootFor(session.sessionId, signal);
            if (revision !== this.state.revision)
                throw this.scopeError('TERMINAL_UNAVAILABLE', 'The terminal backend changed. Retry the request.');
            return this.terminal.call(endpoint, session.sessionId, cwd, args, signal);
        }
        return undefined;
    }
    async open(endpoint, payload, signal) {
        const args = argsOf(payload);
        const raw = toolScope(endpoint, args);
        const session = this.scope.parse(raw);
        if (session === undefined) {
            if (this.scope.owns(raw))
                throw this.scopeError('SESSION_INVALID', 'The CodeX session identifier is invalid.');
            return undefined;
        }
        if (endpoint === 'workspaceFiles/changes')
            return this.watchChanges(session.sessionId, args, signal);
        if (endpoint === 'terminal/retain' || endpoint === 'terminal/follow') {
            if (!this.terminalEnabled())
                throw new RpcError('TERMINAL_DISABLED', 'Remote terminal is disabled on this Host.');
            await this.rootFor(session.sessionId, signal);
            return this.terminal.open(endpoint, session.sessionId, args, signal);
        }
        return undefined;
    }
    async closeAll() {
        // A transport disconnect closes subscriptions but retains Host-owned terminal
        // processes so a reconnect can use terminal/retain, matching Harness policy.
        this.terminal.closeAll();
        for (const queue of this.ownedSubscribers)
            queue.end();
        this.ownedSubscribers.clear();
    }
    async fileCall(endpoint, sessionId, args, signal) {
        const root = await this.rootFor(sessionId, signal);
        const path = typeof args.path === 'string' ? args.path : '.';
        signal.throwIfAborted();
        const target = await this.safePath(root, path, endpoint === 'workspaceFiles/list');
        try {
            if (endpoint === 'workspaceFiles/list') {
                const entries = await readdir(target, { withFileTypes: true });
                const result = [];
                for (const entry of entries.slice(0, 500)) {
                    const item = join(target, entry.name);
                    const info = await lstat(item);
                    if (info.isSymbolicLink())
                        continue;
                    result.push({ name: entry.name, type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', ...(info.isFile() ? { size: info.size } : {}) });
                }
                return { ok: true, value: { path, entries: result, truncated: entries.length > 500 } };
            }
            const info = await stat(target);
            const absolutePath = target;
            const version = `${info.mtimeMs}:${info.size}`;
            if (endpoint === 'workspaceFiles/stat') {
                return { ok: true, value: { absolutePath, version, bytes: info.size } };
            }
            if (!info.isFile())
                throw this.scopeError('WORKSPACE_INVALID_PATH', 'The requested workspace path is not a file.');
            if (info.size > MAX_READ_BYTES)
                throw this.scopeError('WORKSPACE_TOO_LARGE', 'The requested workspace file is too large.');
            const offset = readOffset(args);
            const limit = readLimit(args);
            const file = await open(target, 'r');
            let bytes;
            try {
                // Bound allocation even if the file grows after stat. One extra byte
                // detects growth instead of silently returning a truncated snapshot.
                const buffer = Buffer.allocUnsafe(info.size + 1);
                let length = 0;
                while (length < buffer.length) {
                    signal.throwIfAborted();
                    const read = await file.read(buffer, length, buffer.length - length, length);
                    if (read.bytesRead === 0)
                        break;
                    length += read.bytesRead;
                }
                if (length > MAX_READ_BYTES)
                    throw this.scopeError('WORKSPACE_TOO_LARGE', 'The requested workspace file is too large.');
                if (length !== info.size)
                    throw this.scopeError('WORKSPACE_CHANGED', 'The workspace file changed while reading it. Retry the request.');
                bytes = buffer.subarray(0, length);
            }
            finally {
                await file.close();
            }
            if (endpoint === 'workspaceFiles/readBytes') {
                const slice = bytes.subarray(offset, Math.min(offset + limit, bytes.length));
                return {
                    ok: true,
                    value: {
                        absolutePath,
                        version,
                        bytes: bytes.length,
                        offset,
                        data: slice.toString('base64'),
                        eof: offset + slice.length >= bytes.length,
                    },
                };
            }
            const text = bytes.toString('utf8');
            const slice = text.slice(offset, offset + limit);
            return { ok: true, value: { absolutePath: target, version: `${info.mtimeMs}:${info.size}`, text: slice, offset, lines: slice.split('\n').length, eof: offset + slice.length >= text.length } };
        }
        catch (error) {
            if (error instanceof RpcError)
                throw error;
            throw this.scopeError('WORKSPACE_UNAVAILABLE', 'The CodeX workspace file is unavailable.');
        }
    }
    async watchChanges(sessionId, args, signal) {
        const root = await this.rootFor(sessionId, signal);
        const target = await this.safePath(root, typeof args.path === 'string' ? args.path : '.', true);
        const queue = new AsyncQueue();
        signal.throwIfAborted();
        const watcher = watch(target, { recursive: false });
        const abort = () => { watcher.return?.(); queue.end(); };
        signal.addEventListener('abort', abort, { once: true });
        void (async () => {
            try {
                for await (const event of watcher)
                    queue.push({ kind: 'change', type: event.eventType, path: event.filename ?? '' });
            }
            catch { /* stream close is reported by the gateway */ }
            finally {
                signal.removeEventListener('abort', abort);
                queue.end();
            }
        })();
        return queue;
    }
    scopeError(code, message) {
        return new RpcError(`${this.scope.domain}_${code}`, message.replaceAll('CodeX', this.scope.domain === 'CODEX' ? 'CodeX' : this.scope.domain));
    }
    async rootFor(sessionId, signal) {
        const parsed = this.scope.parse(sessionId);
        if (!parsed)
            throw this.scopeError('SESSION_INVALID', 'The CodeX session identifier is invalid.');
        const cwd = await this.resolveCwd(parsed.nativeId, signal);
        if (!cwd)
            throw this.scopeError('WORKSPACE_UNAVAILABLE', 'The CodeX thread has no available workspace.');
        try {
            const root = await realpath(cwd);
            const info = await stat(root);
            if (!info.isDirectory())
                throw new Error();
            return root;
        }
        catch {
            throw this.scopeError('WORKSPACE_UNAVAILABLE', 'The CodeX workspace is unavailable.');
        }
    }
    async safePath(root, path, directory) {
        // Native clients may pass the displayed absolute workspace path (not only
        // a relative child). Accept it only when lexical and canonical containment
        // still prove that it belongs to this authenticated workspace root.
        const candidate = isAbsolute(path) ? resolve(path) : resolve(root, path);
        const rel = relative(root, candidate);
        if (rel.startsWith('..') || isAbsolute(rel))
            throw this.scopeError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the CodeX workspace.');
        try {
            const info = await lstat(candidate);
            if (info.isSymbolicLink())
                throw new Error();
            const canonical = await realpath(candidate);
            const canonicalRel = relative(root, canonical);
            if (canonicalRel.startsWith('..') || isAbsolute(canonicalRel))
                throw new Error();
            if (directory && !info.isDirectory())
                throw new Error();
            return canonical;
        }
        catch {
            throw this.scopeError('WORKSPACE_PATH_DENIED', 'The requested workspace path is unavailable.');
        }
    }
}
function argsOf(payload) { const value = isRecord(payload) ? payload : {}; return isRecord(value.args) ? value.args : value; }
function toolScope(endpoint, args) {
    const session = args.agentId ?? args.sessionId;
    if (!endpoint.startsWith('terminal/'))
        return args.workspaceFileScopeId ?? session;
    // Policy and process dispatch must authorize the same scope; a file scope
    // cannot redirect a terminal call after a different session passed policy.
    if ([args.agentId, args.sessionId, args.workspaceFileScopeId].some(value => value !== undefined && value !== session)) {
        throw new RpcError('PERMISSION_DENIED', 'The terminal scope does not match its session.');
    }
    return session;
}
function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function byteOrLineRange(args) {
    const options = isRecord(args.options) ? args.options : undefined;
    if (options !== undefined && isRecord(options.range))
        return options.range;
    return isRecord(args.range) ? args.range : args;
}
function readOffset(args) {
    const range = byteOrLineRange(args);
    return typeof range.offset === 'number' && Number.isInteger(range.offset) && range.offset >= 0 ? range.offset : 0;
}
function readLimit(args) {
    const range = byteOrLineRange(args);
    const value = typeof range.length === 'number' ? range.length : range.limit;
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, MAX_READ_BYTES) : MAX_READ_BYTES;
}
//# sourceMappingURL=workspace-bridge.js.map