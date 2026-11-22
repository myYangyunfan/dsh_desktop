import { buildAuthDiagnosticFromMetadata, detectUpstreamAuthFailure, parseAvailableCommands, parseInitializeMetadata, } from './auth-diagnostics.js';
import { AcpSessionModelState } from './session-models.js';
import { spawnCommand } from '../windows-spawn.js';
import { Buffer } from 'node:buffer';
import { PLUGIN_VERSION } from '../../version.js';
const ACP_REQUEST_TIMEOUT_MS = 60_000;
/** Full agent turns (tools + streaming) routinely exceed the short RPC budget. */
const ACP_PROMPT_TIMEOUT_MS = 10 * 60_000;
const ACP_START_TIMEOUT_MS = 20_000;
const MAX_ACP_LINE_BYTES = 288 * 1024 * 1024;
const MAX_STDERR_CAPTURE_BYTES = 4 * 1024;
const ADAPTER_LABELS = Object.freeze({
    cursor: 'Cursor',
    pi: 'Pi',
    claude: 'Claude',
    hermes: 'Hermes',
    antigravity: 'Antigravity',
});
export class CursorAcpError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'CursorAcpError';
        this.authDiagnostic = options?.authDiagnostic;
    }
    authDiagnostic;
}
/**
 * Host-local stdio client for one Cursor CLI ACP process (`agent acp`).
 * Authorization and method policy live in the surrounding Cursor domain.
 */
export class CursorAcpClient {
    binary;
    logger;
    spawnAcp;
    options;
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
    modelStates = new Map();
    modelBusy = new Set();
    sessionCommands = new Map();
    initMetadata;
    lastAuthDiagnostic;
    /** Backend that owns this process: failure codes and log lines must name it. */
    get backend() { return this.options.backend ?? 'cursor'; }
    get adapterLabel() { return ADAPTER_LABELS[this.backend] ?? this.backend; }
    code(suffix) { return `${this.backend.toUpperCase()}_${suffix}`; }
    diagnostics() {
        return buildAuthDiagnosticFromMetadata(this.backend, this.initMetadata, this.lastAuthDiagnostic, this.ready);
    }
    capabilities() {
        return this.initMetadata?.agentCapabilities ?? {};
    }
    authMethods() {
        return this.initMetadata?.authMethods ?? [];
    }
    constructor(binary, logger, spawnAcp = binary => spawnCommand(binary, options.args ?? ['acp'], {
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: process.env,
    }), options = {}) {
        this.binary = binary;
        this.logger = logger;
        this.spawnAcp = spawnAcp;
        this.options = options;
    }
    start() {
        if (this.closed)
            return Promise.reject(new CursorAcpError(this.code('CLOSED'), `The ${this.adapterLabel} domain is closed.`));
        if (this.ready)
            return Promise.resolve();
        this.startPromise ??= this.startOnce().finally(() => { this.startPromise = undefined; });
        return this.startPromise;
    }
    isReady() { return this.ready; }
    async call(method, params, timeoutMs) {
        if (!this.ready)
            throw new CursorAcpError(this.code('UNAVAILABLE'), `${this.adapterLabel} ACP is not ready.`);
        const backend = this.options.modelBackend ?? this.backend;
        const id = isRecord(params) && typeof params.sessionId === 'string' ? params.sessionId : undefined;
        if (method === 'dsh/sessionCommands') {
            return { commands: id ? [...(this.sessionCommands.get(id) ?? [])] : [] };
        }
        if (backend && (method === 'dsh/sessionModels' || method === 'dsh/selectModel')) {
            const state = id ? this.modelStates.get(id) : undefined;
            if (!state || !id)
                throw new CursorAcpError('ACP_SESSION_NOT_LOADED', 'Load the ACP session before selecting a model.');
            if (method === 'dsh/sessionModels')
                return state.catalog();
            if (this.modelBusy.has(id))
                throw new CursorAcpError('PROMPT_IN_PROGRESS', 'Stop the reply before changing its model.');
            const selection = params;
            this.modelBusy.add(id);
            try {
                const result = await state.select(id, selection.model, selection.reasoningEffort, (method, params) => this.request(method, params, timeoutMs ?? ACP_REQUEST_TIMEOUT_MS));
                for (const handler of this.inboundHandlers)
                    handler({ kind: 'notification', method: 'session/update',
                        params: { sessionId: id, update: { sessionUpdate: 'model_selection', selected: result.selected } } });
                return result;
            }
            finally {
                this.modelBusy.delete(id);
            }
        }
        if (backend && (method === 'dsh/sessionModes' || method === 'session/set_mode')) {
            const state = id ? this.modelStates.get(id) : undefined;
            if (!state || !id)
                throw new CursorAcpError('ACP_SESSION_NOT_LOADED', 'Load the ACP session before changing its mode.');
            if (method === 'dsh/sessionModes')
                return state.modesCatalog();
            if (this.modelBusy.has(id))
                throw new CursorAcpError('PROMPT_IN_PROGRESS', 'Stop the reply before changing its mode.');
            const modeId = isRecord(params) ? params.modeId : undefined;
            this.modelBusy.add(id);
            try {
                const result = await state.setMode(id, modeId, (method, params) => this.request(method, params, timeoutMs ?? ACP_REQUEST_TIMEOUT_MS));
                for (const handler of this.inboundHandlers)
                    handler({
                        kind: 'notification',
                        method: 'session/update',
                        params: { sessionId: id, update: { sessionUpdate: 'current_mode_update', currentModeId: result.currentModeId } },
                    });
                return result;
            }
            finally {
                this.modelBusy.delete(id);
            }
        }
        if (backend && method === 'session/prompt' && id) {
            if (this.modelBusy.has(id))
                throw new CursorAcpError('PROMPT_IN_PROGRESS', 'The ACP session is busy.');
            this.modelBusy.add(id);
            try {
                return await this.request(method, params, timeoutMs ?? ACP_PROMPT_TIMEOUT_MS);
            }
            finally {
                this.modelBusy.delete(id);
            }
        }
        if (method === 'session/cancel') {
            this.write({ jsonrpc: '2.0', method, params });
            return {};
        }
        const budget = timeoutMs
            ?? (method === 'session/prompt' ? ACP_PROMPT_TIMEOUT_MS : ACP_REQUEST_TIMEOUT_MS);
        const provisionalLoad = Boolean(backend && method === 'session/load' && id && !this.modelStates.has(id));
        if (provisionalLoad && backend && id) {
            this.modelStates.set(id, new AcpSessionModelState(backend));
        }
        let result;
        try {
            result = await this.request(method, params, budget);
        }
        catch (error) {
            if (provisionalLoad && id)
                this.modelStates.delete(id);
            throw error;
        }
        if (backend && (method === 'session/new' || method === 'session/load' || method === 'session/fork')) {
            const returnedId = isRecord(result) && typeof result.sessionId === 'string' ? result.sessionId : undefined;
            const sessionId = method === 'session/load' ? id : returnedId;
            if (!this.ready || !sessionId || (returnedId && returnedId !== sessionId)) {
                if (provisionalLoad && id)
                    this.modelStates.delete(id);
                throw new CursorAcpError('ACP_INVALID_SESSION', 'ACP returned an invalid session.');
            }
            const state = (method === 'session/load' ? this.modelStates.get(sessionId) : undefined) ?? new AcpSessionModelState(backend);
            state.update(result);
            this.modelStates.set(sessionId, state);
        }
        return result;
    }
    async respond(id, result) {
        this.write({ jsonrpc: '2.0', id, result });
    }
    async respondError(id, code, message) {
        this.write({ jsonrpc: '2.0', id, error: { code, message } });
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
        this.modelStates.clear();
        this.failPending(new CursorAcpError(this.code('CLOSED'), `${this.adapterLabel} ACP was closed.`));
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
            throw new CursorAcpError(this.code('STARTING'), `${this.adapterLabel} ACP is already starting.`);
        }
        this.failureNotified = false;
        let child;
        try {
            child = this.spawnAcp(this.binary);
        }
        catch (error) {
            const cause = error instanceof Error ? error : new Error(String(error));
            this.handleProcessFailure(this.code('BINARY_UNAVAILABLE'), cause);
            throw new CursorAcpError(this.code('BINARY_UNAVAILABLE'), `${this.adapterLabel} ACP communication failed.`, { cause });
        }
        this.process = child;
        this.stdoutBuffer = Buffer.alloc(0);
        this.stderrBytes = 0;
        child.stdout.on('data', chunk => {
            if (this.process === child)
                this.consumeStdout(Buffer.from(chunk));
        });
        child.stderr.on('data', chunk => {
            if (this.process !== child)
                return;
            this.stderrBytes = Math.min(MAX_STDERR_CAPTURE_BYTES, this.stderrBytes + Buffer.byteLength(chunk));
        });
        child.on('error', error => {
            if (this.process === child)
                this.handleProcessFailure(this.code('BINARY_UNAVAILABLE'), error);
        });
        child.on('exit', (code, signal) => {
            if (this.process !== child)
                return;
            this.process = undefined;
            this.ready = false;
            this.modelStates.clear();
            this.failPending(new CursorAcpError(this.code('ACP_EXITED'), `${this.adapterLabel} ACP exited unexpectedly.`));
            if (!this.closed) {
                this.logger?.warn(`${this.adapterLabel} ACP exited`, {
                    code: code ?? 'none',
                    signal: signal ?? 'none',
                    stderrBytes: this.stderrBytes,
                });
                this.notifyUnavailable(this.code('ACP_EXITED'));
            }
        });
        try {
            const initResult = await this.request('initialize', {
                protocolVersion: 1,
                clientCapabilities: {
                    fs: { readTextFile: false, writeTextFile: false },
                    terminal: false,
                },
                clientInfo: {
                    name: 'deepseek_harness_remote',
                    version: PLUGIN_VERSION,
                },
            }, ACP_START_TIMEOUT_MS);
            this.initMetadata = parseInitializeMetadata(initResult);
            this.assertStarting(child);
            if (this.options.authenticationMethod !== null) {
                await this.request('authenticate', { methodId: this.options.authenticationMethod ?? 'cursor_login' }, ACP_START_TIMEOUT_MS);
            }
            this.assertStarting(child);
            this.lastAuthDiagnostic = undefined;
            this.ready = true;
            this.logger?.info(`${this.adapterLabel} ACP ready`);
        }
        catch (error) {
            this.ready = false;
            this.modelStates.clear();
            if (this.process === child)
                this.process = undefined;
            child.kill('SIGTERM');
            if (error instanceof CursorAcpError)
                throw error;
            throw new CursorAcpError(this.code('INITIALIZE_FAILED'), `${this.adapterLabel} ACP initialization failed.`, { cause: error });
        }
    }
    assertStarting(child) {
        if (this.closed)
            throw new CursorAcpError(this.code('CLOSED'), `${this.adapterLabel} ACP was closed.`);
        if (this.process !== child || child.exitCode !== null || child.killed) {
            throw new CursorAcpError(this.code('UNAVAILABLE'), `${this.adapterLabel} ACP is not available.`);
        }
    }
    request(method, params, timeoutMs) {
        const id = this.nextId++;
        const result = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new CursorAcpError(this.code('REQUEST_TIMEOUT'), `${this.adapterLabel} ACP request timed out.`));
            }, timeoutMs);
            timer.unref?.();
            this.pending.set(id, { resolve, reject, timer });
        });
        try {
            this.write({ jsonrpc: '2.0', id, method, params });
        }
        catch (error) {
            const pending = this.takePending(id);
            pending?.reject(error instanceof Error ? error : new Error('Cursor ACP write failed.'));
        }
        return result;
    }
    write(message) {
        const child = this.process;
        if (child === undefined || child.stdin.destroyed || !child.stdin.writable) {
            throw new CursorAcpError(this.code('UNAVAILABLE'), `${this.adapterLabel} ACP is not available.`);
        }
        child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    consumeStdout(chunk) {
        this.stdoutBuffer = this.stdoutBuffer.length === 0 ? chunk : Buffer.concat([this.stdoutBuffer, chunk]);
        if (this.stdoutBuffer.length > MAX_ACP_LINE_BYTES) {
            this.handleProcessFailure(this.code('RESPONSE_TOO_LARGE'), new Error(`${this.adapterLabel} ACP emitted an oversized JSONL message.`));
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
            this.handleProcessFailure(this.code('INVALID_RESPONSE'), new Error(`${this.adapterLabel} ACP emitted invalid JSON.`));
            return;
        }
        if (!isRecord(value)) {
            this.handleProcessFailure(this.code('INVALID_RESPONSE'), new Error(`${this.adapterLabel} ACP emitted an invalid message.`));
            return;
        }
        if ((typeof value.id === 'number' || typeof value.id === 'string') && ('result' in value || 'error' in value)) {
            const pending = this.takePending(value.id);
            if (pending === undefined)
                return;
            if ('error' in value && value.error !== undefined) {
                const authDiagnostic = detectUpstreamAuthFailure(this.backend, value.error, this.initMetadata?.authMethods);
                if (authDiagnostic)
                    this.lastAuthDiagnostic = authDiagnostic;
                pending.reject(new CursorAcpError(this.code('UPSTREAM_ERROR'), authDiagnostic?.guidance ?? safeUpstreamError(value.error, this.adapterLabel), authDiagnostic ? { authDiagnostic } : undefined));
            }
            else {
                pending.resolve(value.result);
            }
            return;
        }
        if (typeof value.method !== 'string' || value.method.length === 0 || value.method.length > 160)
            return;
        const params = value.params ?? {};
        // session/update is always a live notification; never treat it as an approval request.
        const inbound = value.method !== 'session/update'
            && (typeof value.id === 'string' || typeof value.id === 'number')
            ? { kind: 'request', id: value.id, method: value.method, params }
            : { kind: 'notification', method: value.method, params };
        if (inbound.kind === 'notification' && inbound.method === 'session/update' && isRecord(params) && typeof params.sessionId === 'string') {
            this.modelStates.get(params.sessionId)?.update(params.update);
            if (isRecord(params.update) && params.update.sessionUpdate === 'available_commands_update') {
                this.sessionCommands.set(params.sessionId, parseAvailableCommands(params.update));
            }
        }
        for (const handler of this.inboundHandlers)
            handler(inbound);
    }
    handleProcessFailure(code, cause) {
        this.ready = false;
        this.modelStates.clear();
        this.failPending(new CursorAcpError(code, `${this.adapterLabel} ACP communication failed.`, { cause }));
        const child = this.process;
        this.process = undefined;
        child?.kill('SIGTERM');
        this.logger?.warn(`${this.adapterLabel} ACP communication failed`, { code });
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
function safeUpstreamError(value, label = 'Cursor') {
    if (!isRecord(value) || typeof value.message !== 'string')
        return `${label} ACP rejected the request.`;
    const message = value.message.toLowerCase();
    if (message.includes('auth') || message.includes('login') || message.includes('api key')) {
        return `${label} ACP authentication failed.`;
    }
    if (message.includes('not initialized'))
        return `${label} ACP is not initialized.`;
    return `${label} ACP rejected the request.`;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=cursor-process.js.map