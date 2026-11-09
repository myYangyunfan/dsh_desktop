import headless from '@xterm/headless';
import serialize from '@xterm/addon-serialize';
import { RpcError } from './safe-error.js';
import { discoverTerminalShells } from './remote-terminal-provider.js';
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_COLS = 240;
const MAX_ROWS = 100;
const MAX_TERMINALS = 256;
const MAX_SESSION_TERMINALS = 8;
const SCROLLBACK = 1000;
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const MAX_FOLLOWER_BYTES = 1024 * 1024;
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 30_000;
/** Slow followers fail; detaching never keeps an unbounded output journal. */
class TerminalFollower {
    detach;
    values = [];
    bytes = 0;
    wake;
    finished = false;
    closed = false;
    failure;
    constructor(detach) {
        this.detach = detach;
    }
    push(value) {
        if (this.closed || this.finished)
            return;
        const bytes = Buffer.byteLength(JSON.stringify(value));
        if (this.bytes + bytes > MAX_FOLLOWER_BYTES) {
            this.failure = new RpcError('TERMINAL_BUFFER_EXCEEDED', 'Terminal output fell behind. Reconnect to recover the screen.');
            this.close();
            return;
        }
        this.bytes += bytes;
        this.values.push({ value, bytes });
        this.wake?.();
    }
    finish() { this.finished = true; this.wake?.(); }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.values = [];
        this.bytes = 0;
        this.detach();
        this.wake?.();
    }
    async *[Symbol.asyncIterator]() {
        try {
            while (!this.closed) {
                const next = this.values.shift();
                if (next) {
                    this.bytes -= next.bytes;
                    yield next.value;
                }
                else if (this.finished)
                    break;
                else
                    await new Promise(resolve => { this.wake = resolve; });
            }
            if (this.failure)
                throw this.failure;
        }
        finally {
            this.close();
        }
    }
}
/** One Host-owned terminal. All screen/output/input transitions are serialized. */
class OwnedTerminal {
    sessionId;
    id;
    cwd;
    cols;
    rows;
    removed;
    allocation = new AbortController();
    screen;
    serializer = new serialize.SerializeAddon();
    followers = new Set();
    holders = new Set();
    pending;
    process;
    shell;
    title = '';
    controller;
    controllerId;
    sequence = 0;
    state = 'running';
    exitCode = null;
    error;
    closing = false;
    disposed = false;
    operations = Promise.resolve();
    cleanup;
    timer;
    idle;
    activityEpoch = 0;
    constructor(sessionId, id, cwd, cols, rows, removed) {
        this.sessionId = sessionId;
        this.id = id;
        this.cwd = cwd;
        this.cols = cols;
        this.rows = rows;
        this.removed = removed;
        this.screen = new headless.Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true });
        this.screen.loadAddon(this.serializer);
    }
    info() {
        return { id: this.id, title: this.title, shell: this.shell && { ...this.shell, args: [...this.shell.args] },
            cwd: this.cwd, cols: this.cols, rows: this.rows, state: this.state, exitCode: this.exitCode,
            ...(this.error === undefined ? {} : { error: this.error }),
            ...(this.controllerId === undefined ? {} : { controllerId: this.controllerId }) };
    }
    enqueue(operation) {
        const result = this.operations.then(operation);
        this.operations = result.then(() => undefined, () => undefined);
        return result;
    }
    emit(value) { for (const follower of this.followers)
        follower.push(value); }
    invalidate() { this.activityEpoch++; this.idle = undefined; }
    async pump() {
        const process = this.process;
        // Register the rejection handler immediately, even while output is still open.
        const outcome = process.completed.then(value => ({ value }), () => ({ value: undefined }));
        let failed = false;
        try {
            for await (const chunk of process.output) {
                // Bound each wire frame and preserve UTF-16 surrogate pairs across splits.
                for (let start = 0; start < chunk.length;) {
                    let end = Math.min(start + 16_384, chunk.length);
                    if (end < chunk.length && /[\uD800-\uDBFF]/u.test(chunk[end - 1]))
                        end--;
                    const data = chunk.slice(start, end);
                    start = end;
                    await this.enqueue(async () => {
                        if (this.disposed)
                            return;
                        await new Promise(resolve => this.screen.write(data, resolve));
                        this.sequence++;
                        this.emit({ type: 'output', sequence: this.sequence, data });
                    });
                }
            }
        }
        catch {
            failed = true;
        }
        if (failed) {
            await this.enqueue(() => {
                if (this.disposed)
                    return;
                this.state = 'failed';
                this.error = 'The terminal output stream failed.';
                this.emit({ type: 'state', info: this.info() });
            });
            await this.close().catch(() => undefined);
            return;
        }
        const ended = await outcome;
        await this.enqueue(() => {
            if (this.disposed)
                return;
            this.exitCode = ended.value?.exitCode ?? null;
            if (failed || ended.value === undefined) {
                this.state = 'failed';
                this.error = 'The terminal process or output stream failed.';
            }
            else
                this.state = 'exited';
            this.emit({ type: 'state', info: this.info() });
            for (const follower of this.followers)
                follower.finish();
        });
    }
    snapshot() {
        let lines = SCROLLBACK;
        let screen = this.serializer.serialize({ scrollback: lines });
        while (Buffer.byteLength(screen) > MAX_SNAPSHOT_BYTES && lines > 0) {
            lines = Math.floor(lines / 2);
            screen = this.serializer.serialize({ scrollback: lines });
        }
        if (Buffer.byteLength(screen) > MAX_SNAPSHOT_BYTES)
            throw new RpcError('TERMINAL_BUFFER_EXCEEDED', 'The terminal screen exceeds the recovery limit.');
        return screen;
    }
    monitor() {
        if (this.timer || this.disposed || (!this.closing && !this.process?.inspectActivity))
            return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.observe().finally(() => this.monitor());
        }, POLL_MS);
        this.timer.unref();
    }
    async observe() {
        if (this.closing) {
            await this.close().catch(() => undefined);
            return;
        }
        if (this.holders.size || this.followers.size) {
            this.invalidate();
            return;
        }
        const epoch = this.activityEpoch;
        try {
            const activity = await this.process.inspectActivity();
            if (this.disposed || epoch !== this.activityEpoch)
                return;
            if (activity.state !== 'idle') {
                this.idle = undefined;
                return;
            }
            const now = performance.now();
            if (this.idle?.revision !== activity.revision || now - this.idle.observedAt > POLL_MS * 2)
                this.idle = { since: now, revision: activity.revision, observedAt: now };
            else {
                this.idle.observedAt = now;
                if (now - this.idle.since >= IDLE_TIMEOUT_MS)
                    await this.close();
            }
        }
        catch {
            this.idle = undefined;
        }
    }
    /** Failed cleanup remains owned and closed to input, allowing a later retry. */
    close() {
        if (this.cleanup)
            return this.cleanup;
        this.closing = true;
        this.invalidate();
        this.allocation.abort();
        this.cleanup = (async () => {
            await this.pending?.catch(() => undefined);
            await this.process?.terminate();
            await this.enqueue(() => {
                if (this.disposed)
                    return;
                this.disposed = true;
                if (this.timer)
                    clearTimeout(this.timer);
                this.state = 'exited';
                this.emit({ type: 'state', info: this.info() });
                for (const follower of [...this.followers, ...this.holders])
                    follower.finish();
                this.screen.dispose();
                this.removed();
            });
        })().catch(() => {
            this.cleanup = undefined;
            this.state = 'failed';
            this.error = 'Terminal cleanup failed. Close the terminal again to retry.';
            this.emit({ type: 'state', info: this.info() });
            this.monitor();
            throw new RpcError('TERMINAL_CLEANUP_FAILED', 'The terminal process could not be fully stopped. Retry closing it.');
        });
        return this.cleanup;
    }
}
/** Shared across encrypted connections; backend disposal also fences pending creations. */
export class RemoteTerminalState {
    onRemoved;
    terminals = new Map();
    revision = 0;
    constructor(onRemoved = () => { }) {
        this.onRemoved = onRemoved;
    }
    async dispose(matches = () => true) {
        this.revision++;
        const results = await Promise.allSettled([...this.terminals.values()].filter(terminal => matches(terminal.sessionId)).map(terminal => terminal.close()));
        if (results.some(result => result.status === 'rejected'))
            throw new RpcError('TERMINAL_CLEANUP_FAILED', 'Some terminal processes could not be stopped. Retry cleanup.');
    }
}
/** Official terminal shapes over backend-owned IDs, without creating Harness Agents. */
export class RemoteTerminalController {
    shared;
    spawn;
    enabled;
    scopeError;
    subscriptions = new Set();
    constructor(shared, spawn, enabled, scopeError) {
        this.shared = shared;
        this.spawn = spawn;
        this.enabled = enabled;
        this.scopeError = scopeError;
    }
    async call(endpoint, sessionId, cwd, args, signal) {
        this.check(signal);
        if (endpoint === 'terminal/environment')
            return { ok: true, value: { cwd, maxInputBytes: MAX_INPUT_BYTES, maxCols: MAX_COLS, maxRows: MAX_ROWS, scrollback: SCROLLBACK } };
        if (endpoint === 'terminal/shells')
            return { ok: true, value: await this.shells(signal) };
        if (endpoint === 'terminal/list')
            return { ok: true, value: [...this.shared.terminals.values()].filter(item => item.sessionId === sessionId && item.shell && item.process).map(item => item.info()) };
        if (endpoint === 'terminal/create')
            return { ok: true, value: await this.create(sessionId, cwd, args, signal) };
        const id = identifier(args.id);
        if (endpoint === 'terminal/close') {
            await this.shared.terminals.get(`${sessionId}/${id}`)?.close();
            return { ok: true };
        }
        const terminal = this.requireTerminal(sessionId, id);
        await terminal.enqueue(async () => {
            this.check(signal);
            if (terminal.closing)
                throw this.scopeError('TERMINAL_NOT_FOUND', 'The terminal is closing.');
            if (endpoint === 'terminal/rename') {
                if (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 120)
                    throw new RpcError('INVALID_MESSAGE', 'The terminal title is invalid.');
                terminal.title = args.title.trim();
                terminal.emit({ type: 'state', info: terminal.info() });
                return;
            }
            if (endpoint !== 'terminal/write' && endpoint !== 'terminal/resize')
                throw new RpcError('METHOD_NOT_FOUND', 'The terminal method does not exist.');
            if (identifier(args.attachmentId) !== terminal.controllerId || !terminal.controller
                || !this.subscriptions.has(terminal.controller) || terminal.state !== 'running')
                throw new RpcError('PERMISSION_DENIED', 'This attachment does not own terminal input.');
            terminal.invalidate();
            if (endpoint === 'terminal/write') {
                if (typeof args.data !== 'string' || Buffer.byteLength(args.data) > MAX_INPUT_BYTES)
                    throw new RpcError('INVALID_MESSAGE', 'Terminal input is invalid or too large.');
                await terminal.process.write(args.data);
            }
            else {
                const cols = dimension(args.cols, MAX_COLS), rows = dimension(args.rows, MAX_ROWS);
                await terminal.process.resize(cols, rows);
                terminal.screen.resize(cols, rows);
                terminal.cols = cols;
                terminal.rows = rows;
                terminal.emit({ type: 'state', info: terminal.info() });
            }
        });
        return { ok: true };
    }
    async open(endpoint, sessionId, args, signal) {
        this.check(signal);
        const terminal = this.requireTerminal(sessionId, identifier(args.id));
        let follower;
        const abort = () => follower.close();
        follower = new TerminalFollower(() => {
            signal.removeEventListener('abort', abort);
            this.subscriptions.delete(follower);
            terminal.followers.delete(follower);
            terminal.holders.delete(follower);
            terminal.invalidate();
            if (terminal.controller === follower) {
                terminal.controller = undefined;
                terminal.controllerId = undefined;
                terminal.emit({ type: 'state', info: terminal.info() });
            }
        });
        // Register before awaiting the serialized snapshot, so disconnect can also
        // revoke a follower whose open request has not returned yet.
        this.subscriptions.add(follower);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
        try {
            if (endpoint === 'terminal/retain') {
                terminal.invalidate();
                terminal.holders.add(follower);
                follower.push({ type: 'retained' });
            }
            else if (endpoint === 'terminal/follow') {
                const attachmentId = identifier(args.attachmentId);
                await terminal.enqueue(() => {
                    this.check(signal);
                    if (!this.subscriptions.has(follower))
                        throw new RpcError('TRANSPORT_CLOSED', 'The terminal attachment was disconnected.');
                    if (terminal.closing)
                        throw this.scopeError('TERMINAL_NOT_FOUND', 'The terminal is closing.');
                    const screen = terminal.snapshot();
                    terminal.invalidate();
                    terminal.controller = follower;
                    terminal.controllerId = attachmentId;
                    terminal.emit({ type: 'state', info: terminal.info() });
                    follower.push({ type: 'snapshot', sequence: terminal.sequence, screen, info: terminal.info() });
                    terminal.followers.add(follower);
                    if (terminal.state !== 'running')
                        follower.finish();
                });
            }
            else
                throw new RpcError('METHOD_NOT_FOUND', 'The terminal stream does not exist.');
            this.check(signal);
            if (!this.subscriptions.has(follower))
                throw new RpcError('TRANSPORT_CLOSED', 'The terminal attachment was disconnected.');
            return follower;
        }
        catch (error) {
            follower.close();
            throw error;
        }
    }
    /** A connection only disposes its subscriptions; the Host still owns the shells. */
    closeAll() { for (const subscription of [...this.subscriptions])
        subscription.close(); }
    async shells(signal) {
        try {
            const result = await (this.spawn.shells?.(signal) ?? discoverTerminalShells(undefined, signal));
            this.check(signal);
            if (!result.length)
                throw new Error();
            return result;
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            if (error instanceof RpcError && error.code === 'TERMINAL_DISABLED')
                throw error;
            throw this.scopeError('TERMINAL_UNAVAILABLE', 'The Host terminal shells could not be discovered.');
        }
    }
    async create(sessionId, cwd, args, signal) {
        const request = typeof args.request === 'object' && args.request !== null ? args.request : {};
        const id = identifier(request.id), key = `${sessionId}/${id}`;
        const existing = this.shared.terminals.get(key);
        if (existing) {
            if (existing.closing)
                throw this.scopeError('TERMINAL_NOT_FOUND', 'The terminal is closing.');
            await existing.pending;
            this.check(signal);
            if (existing.closing)
                throw this.scopeError('TERMINAL_NOT_FOUND', 'The terminal is closing.');
            return existing.info();
        }
        if (this.shared.terminals.size >= MAX_TERMINALS || [...this.shared.terminals.values()].filter(item => item.sessionId === sessionId).length >= MAX_SESSION_TERMINALS)
            throw new RpcError('RATE_LIMITED', 'Too many remote terminals are active.');
        const terminal = new OwnedTerminal(sessionId, id, cwd, dimension(request.cols ?? 80, MAX_COLS), dimension(request.rows ?? 24, MAX_ROWS), () => {
            if (this.shared.terminals.get(key) === terminal) {
                this.shared.terminals.delete(key);
                this.shared.onRemoved(key);
            }
        });
        this.shared.terminals.set(key, terminal);
        const allocationSignal = AbortSignal.any([signal, terminal.allocation.signal]);
        terminal.pending = (async () => {
            const shells = await this.shells(allocationSignal);
            const shell = request.shellPath === undefined ? shells[0] : shells.find(shell => shell.path === request.shellPath);
            if (!shell)
                throw new RpcError('INVALID_MESSAGE', 'The requested shell is not available for this workspace.');
            terminal.shell = shell;
            terminal.title = shell.name;
            terminal.process = await this.spawn({ argv: [shell.path, ...shell.args], cwd,
                cols: terminal.cols, rows: terminal.rows, terminalType: 'xterm-256color', env: { DSH_SESSION_ID: sessionId }, signal: allocationSignal });
            this.check(allocationSignal);
            void terminal.pump();
            terminal.monitor();
        })();
        try {
            await terminal.pending;
            // pending resolves only after allocation has been checked and committed.
            // Returning failure for later request cancellation would also release
            // its device claim while the committed shell is still alive.
            if (terminal.closing)
                throw this.scopeError('TERMINAL_NOT_FOUND', 'The terminal is closing.');
            return terminal.info();
        }
        catch (error) {
            await terminal.close();
            if (error instanceof RpcError || signal.aborted)
                throw error;
            throw this.scopeError('TERMINAL_UNAVAILABLE', 'The Host terminal could not be started.');
        }
    }
    check(signal) {
        signal.throwIfAborted();
        if (!this.enabled())
            throw new RpcError('TERMINAL_DISABLED', 'Remote terminal is disabled on this Host.');
    }
    requireTerminal(sessionId, id) {
        const terminal = this.shared.terminals.get(`${sessionId}/${id}`);
        if (!terminal?.process || terminal.closing)
            throw this.scopeError('TERMINAL_NOT_FOUND', 'The terminal is no longer available.');
        return terminal;
    }
}
function identifier(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value))
        throw new RpcError('INVALID_MESSAGE', 'The terminal identifier is invalid.');
    return value;
}
function dimension(value, max) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max)
        throw new RpcError('INVALID_MESSAGE', 'Terminal dimensions exceed the allowed limits.');
    return value;
}
//# sourceMappingURL=remote-terminal-controller.js.map