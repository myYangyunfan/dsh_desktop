import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { PLUGIN_VERSION } from '../version.js';
const APP_SERVER_REQUEST_TIMEOUT_MS = 60_000;
const APP_SERVER_START_TIMEOUT_MS = 15_000;
const MAX_APP_SERVER_LINE_BYTES = 288 * 1024 * 1024;
const MAX_STDERR_CAPTURE_BYTES = 4 * 1024;
export class CodexAppServerError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'CodexAppServerError';
    }
}
/**
 * Host-local stdio client for one Codex App Server process. This class knows
 * JSON-RPC correlation only; Remote authorization and method policy live in
 * the surrounding Codex domain.
 */
export class CodexAppServerClient {
    binary;
    logger;
    spawnAppServer;
    process;
    nextId = 1;
    pending = new Map();
    inboundHandlers = new Set();
    unavailableHandlers = new Set();
    stdoutBuffer = Buffer.alloc(0);
    stderrBytes = 0;
    ready = false;
    closed = false;
    failureNotified = false;
    startPromise;
    constructor(binary, logger, spawnAppServer = binary => spawn(binary, ['app-server'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    })) {
        this.binary = binary;
        this.logger = logger;
        this.spawnAppServer = spawnAppServer;
    }
    start() {
        if (this.closed)
            return Promise.reject(new CodexAppServerError('CODEX_CLOSED', 'The Codex domain is closed.'));
        if (this.ready)
            return Promise.resolve();
        this.startPromise ??= this.startOnce().finally(() => { this.startPromise = undefined; });
        return this.startPromise;
    }
    isReady() { return this.ready; }
    async call(method, params, timeoutMs = APP_SERVER_REQUEST_TIMEOUT_MS) {
        if (!this.ready)
            throw new CodexAppServerError('CODEX_UNAVAILABLE', 'Codex App Server is not ready.');
        return this.request(method, params, timeoutMs);
    }
    async respond(id, result) {
        this.write({ id, result });
    }
    async respondError(id, code, message) {
        this.write({ id, error: { code, message } });
    }
    onInbound(handler) {
        this.inboundHandlers.add(handler);
        return () => this.inboundHandlers.delete(handler);
    }
    onUnavailable(handler) {
        this.unavailableHandlers.add(handler);
        return () => this.unavailableHandlers.delete(handler);
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.ready = false;
        this.failPending(new CodexAppServerError('CODEX_CLOSED', 'Codex App Server was closed.'));
        const child = this.process;
        this.process = undefined;
        if (child === undefined || child.exitCode !== null || child.killed)
            return;
        await new Promise(resolve => {
            const timer = setTimeout(() => {
                child.kill('SIGKILL');
                resolve();
            }, 2_000);
            timer.unref?.();
            child.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
            child.kill('SIGTERM');
        });
    }
    async startOnce() {
        if (this.process !== undefined) {
            throw new CodexAppServerError('CODEX_STARTING', 'Codex App Server is already starting.');
        }
        const child = this.spawnAppServer(this.binary);
        this.process = child;
        this.failureNotified = false;
        this.stdoutBuffer = Buffer.alloc(0);
        this.stderrBytes = 0;
        child.stdout.on('data', chunk => this.consumeStdout(Buffer.from(chunk)));
        child.stderr.on('data', chunk => {
            // Always drain stderr, but never log Codex payloads or paths.
            this.stderrBytes = Math.min(MAX_STDERR_CAPTURE_BYTES, this.stderrBytes + Buffer.byteLength(chunk));
        });
        child.on('error', error => this.handleProcessFailure('CODEX_BINARY_UNAVAILABLE', error));
        child.on('exit', (code, signal) => {
            if (this.process !== child)
                return;
            this.process = undefined;
            this.ready = false;
            this.failPending(new CodexAppServerError('CODEX_APP_SERVER_EXITED', 'Codex App Server exited unexpectedly.'));
            if (!this.closed) {
                this.logger?.warn('Codex App Server exited', {
                    code: code ?? 'none',
                    signal: signal ?? 'none',
                    stderrBytes: this.stderrBytes,
                });
                this.notifyUnavailable('CODEX_APP_SERVER_EXITED');
            }
        });
        try {
            await this.request('initialize', {
                clientInfo: {
                    name: 'deepseek_harness_remote',
                    title: 'DeepSeek Harness Remote',
                    version: PLUGIN_VERSION,
                },
                capabilities: {
                    experimentalApi: true,
                    mcpServerOpenaiFormElicitation: false,
                },
            }, APP_SERVER_START_TIMEOUT_MS);
            this.write({ method: 'initialized', params: {} });
            this.ready = true;
            this.logger?.info('Codex App Server ready');
        }
        catch (error) {
            child.kill('SIGTERM');
            if (error instanceof CodexAppServerError)
                throw error;
            throw new CodexAppServerError('CODEX_INITIALIZE_FAILED', 'Codex App Server initialization failed.', { cause: error });
        }
    }
    request(method, params, timeoutMs) {
        const id = this.nextId++;
        const result = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new CodexAppServerError('CODEX_REQUEST_TIMEOUT', 'Codex App Server request timed out.'));
            }, timeoutMs);
            timer.unref?.();
            this.pending.set(id, { resolve, reject, timer });
        });
        try {
            this.write({ id, method, params });
        }
        catch (error) {
            const pending = this.takePending(id);
            pending?.reject(error instanceof Error ? error : new Error('Codex App Server write failed.'));
        }
        return result;
    }
    write(message) {
        const child = this.process;
        if (child === undefined || child.stdin.destroyed || !child.stdin.writable) {
            throw new CodexAppServerError('CODEX_UNAVAILABLE', 'Codex App Server is not available.');
        }
        child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    consumeStdout(chunk) {
        this.stdoutBuffer = this.stdoutBuffer.length === 0 ? chunk : Buffer.concat([this.stdoutBuffer, chunk]);
        if (this.stdoutBuffer.length > MAX_APP_SERVER_LINE_BYTES) {
            this.handleProcessFailure('CODEX_RESPONSE_TOO_LARGE', new Error('Codex App Server emitted an oversized JSONL message.'));
            return;
        }
        let newline = this.stdoutBuffer.indexOf(0x0a);
        while (newline >= 0) {
            const line = this.stdoutBuffer.subarray(0, newline);
            this.stdoutBuffer = this.stdoutBuffer.subarray(newline + 1);
            if (line.length > 0)
                this.handleLine(line);
            newline = this.stdoutBuffer.indexOf(0x0a);
        }
    }
    handleLine(line) {
        let value;
        try {
            value = JSON.parse(line.toString('utf8'));
        }
        catch {
            this.handleProcessFailure('CODEX_INVALID_RESPONSE', new Error('Codex App Server emitted invalid JSON.'));
            return;
        }
        if (!isRecord(value)) {
            this.handleProcessFailure('CODEX_INVALID_RESPONSE', new Error('Codex App Server emitted an invalid message.'));
            return;
        }
        if ((typeof value.id === 'number' || typeof value.id === 'string') && ('result' in value || 'error' in value)) {
            const pending = this.takePending(value.id);
            if (pending === undefined)
                return;
            if ('error' in value && value.error !== undefined) {
                pending.reject(safeUpstreamError(value.error));
            }
            else {
                pending.resolve(value.result);
            }
            return;
        }
        if (typeof value.method !== 'string' || value.method.length === 0 || value.method.length > 160)
            return;
        const params = value.params ?? {};
        const inbound = typeof value.id === 'string' || typeof value.id === 'number'
            ? { kind: 'request', id: value.id, method: value.method, params }
            : { kind: 'notification', method: value.method, params };
        for (const handler of this.inboundHandlers)
            handler(inbound);
    }
    handleProcessFailure(code, cause) {
        this.ready = false;
        this.failPending(new CodexAppServerError(code, 'Codex App Server communication failed.', { cause }));
        const child = this.process;
        this.process = undefined;
        child?.kill('SIGTERM');
        this.logger?.warn('Codex App Server communication failed', { code });
        if (!this.closed)
            this.notifyUnavailable(code);
    }
    notifyUnavailable(code) {
        if (this.failureNotified)
            return;
        this.failureNotified = true;
        for (const handler of this.unavailableHandlers)
            handler(code);
    }
    takePending(id) {
        const pending = this.pending.get(id);
        if (pending === undefined)
            return undefined;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        return pending;
    }
    failPending(error) {
        for (const id of [...this.pending.keys()])
            this.takePending(id)?.reject(error);
    }
}
/**
 * Dedicated error code for a Thread that exists but has no turns yet. Current
 * Codex App Server versions materialize a Thread on its first user message and
 * reject turn listing (and legacy `includeTurns` reads) before that. Callers
 * must project this as empty history, not as a failed read, and must classify
 * it by code rather than by the sanitized upstream message.
 */
export const CODEX_THREAD_UNMATERIALIZED = 'CODEX_THREAD_UNMATERIALIZED';
/** Safe Remote-facing message for an unmaterialized Thread. */
export const CODEX_UNMATERIALIZED_THREAD_MESSAGE = 'Codex thread has no turns yet.';
function safeUpstreamError(value) {
    if (!isRecord(value) || typeof value.message !== 'string') {
        return new CodexAppServerError('CODEX_UPSTREAM_ERROR', 'Codex App Server rejected the request.');
    }
    // Upstream messages may contain paths or prompt fragments. Only retain a
    // short generic category for the Remote boundary.
    const message = value.message.toLowerCase();
    if (message.includes('active writer')) {
        return new CodexAppServerError('CODEX_UPSTREAM_ERROR', 'Codex thread already has an active writer.');
    }
    if (message.includes('not materialized yet') || message.includes('before first user message')) {
        return new CodexAppServerError(CODEX_THREAD_UNMATERIALIZED, CODEX_UNMATERIALIZED_THREAD_MESSAGE);
    }
    if (message.includes('no rollout found')) {
        return new CodexAppServerError('CODEX_UPSTREAM_ERROR', 'Codex thread state is not persisted yet.');
    }
    return new CodexAppServerError('CODEX_UPSTREAM_ERROR', message.includes('not initialized') ? 'Codex App Server is not initialized.' : 'Codex App Server rejected the request.');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=app-server.js.map