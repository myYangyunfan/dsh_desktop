import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { realpath } from 'node:fs/promises';
import { PLUGIN_VERSION } from '../../version.js';
import { acpHistoryEvents } from '../history-events.js';
import { AcpSessionModelState } from './session-models.js';
import { OpencodeNativeApi, opencodeHasNativeApi, opencodeLoopbackPort, opencodePrivateArgs } from './opencode-native-api.js';
const ACP_REQUEST_TIMEOUT_MS = 60_000;
/** Full agent turns (tools + streaming) routinely exceed the short RPC budget. */
const ACP_PROMPT_TIMEOUT_MS = 10 * 60_000;
const ACP_START_TIMEOUT_MS = 20_000;
const MAX_ACP_LINE_BYTES = 288 * 1024 * 1024;
const MAX_STDERR_CAPTURE_BYTES = 4 * 1024;
export class OpencodeAcpError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'OpencodeAcpError';
    }
}
/**
 * Host-local stdio client for one OpenCode CLI ACP process (`opencode acp`).
 * OpenCode natively supports standard Agent Client Protocol (ACP) over stdio.
 */
export class OpencodeAcpClient {
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
    historyBusy = false;
    historyStop;
    startupAbort = new AbortController();
    nativeApi;
    archivedSessions = new Set();
    archivingSessions = new Set();
    constructor(binary = 'opencode', logger, spawnAcp, options = {}) {
        this.binary = binary;
        this.logger = logger;
        this.spawnAcp = spawnAcp;
        this.options = options;
    }
    start() {
        if (this.closed)
            return Promise.reject(new OpencodeAcpError('OPENCODE_CLOSED', 'The OpenCode domain is closed.'));
        if (this.ready)
            return Promise.resolve();
        this.startPromise ??= this.startOnce().finally(() => { this.startPromise = undefined; });
        return this.startPromise;
    }
    isReady() { return this.ready; }
    async isSessionArchived(sessionId, cwd) {
        if (!this.nativeApi)
            return this.archivedSessions.has(sessionId);
        const archived = await this.nativeApi.isArchived(sessionId, cwd);
        if (archived)
            this.archivedSessions.add(sessionId);
        else
            this.archivedSessions.delete(sessionId);
        return archived;
    }
    async archiveSession(sessionId, cwd) {
        if (!this.ready || !this.nativeApi)
            throw new OpencodeAcpError('OPENCODE_ARCHIVE_UNAVAILABLE', 'The Host OpenCode native API is unavailable.');
        if (this.busy.has(sessionId) || this.loads.has(sessionId) || this.archivingSessions.has(sessionId))
            throw new OpencodeAcpError('PROMPT_IN_PROGRESS', 'Stop the OpenCode reply before archiving.');
        this.archivingSessions.add(sessionId);
        try {
            await this.nativeApi.archive(sessionId, cwd);
            this.archivedSessions.add(sessionId);
        }
        finally {
            this.archivingSessions.delete(sessionId);
        }
    }
    /**
     * Replay a saved session in one temporary ACP process so a history read never
     * interrupts a live turn. OpenCode emits the transcript as `session/update`
     * notifications before `session/load` resolves.
     */
    async history(sessionId, cwd) {
        if (this.closed)
            throw new OpencodeAcpError('OPENCODE_CLOSED', 'The OpenCode domain is closed.');
        if (this.historyBusy)
            throw new OpencodeAcpError('OPENCODE_HISTORY_BUSY', 'An OpenCode history read is already in progress.');
        this.historyBusy = true;
        const client = new OpencodeAcpClient(this.binary, this.logger, this.spawnAcp, { ...this.options, historyReader: true });
        let stopping;
        const stop = () => stopping ??= client.close();
        this.historyStop = stop;
        const updates = [];
        let bytes = 0;
        let count = 0;
        let overflow = false;
        const unsubscribe = client.onInbound(message => {
            // A history reader has no authority to run tools or wait for approval.
            if (message.kind === 'request') {
                void client.respondError(message.id, -32601, 'History reader does not support requests.').catch(() => undefined);
                return;
            }
            if (message.method !== 'session/update'
                || message.params?.sessionId !== sessionId
                || overflow)
                return;
            count++;
            bytes += Buffer.byteLength(JSON.stringify(message));
            if (bytes > 8 * 1024 * 1024 || count > 10_000) {
                overflow = true;
                void stop().catch(() => undefined);
            }
            else
                updates.push(message);
        });
        try {
            await client.start();
            if (this.closed)
                throw new OpencodeAcpError('OPENCODE_CLOSED', 'OpenCode ACP was closed.');
            await client.call('session/load', { sessionId, cwd, mcpServers: [] });
            if (this.closed)
                throw new OpencodeAcpError('OPENCODE_CLOSED', 'OpenCode ACP was closed.');
            if (overflow)
                throw new OpencodeAcpError('OPENCODE_HISTORY_TOO_LARGE', 'OpenCode history exceeds the transfer limit.');
            return acpHistoryEvents(updates, sessionId, 'opencode');
        }
        catch (error) {
            if (overflow)
                throw new OpencodeAcpError('OPENCODE_HISTORY_TOO_LARGE', 'OpenCode history exceeds the transfer limit.');
            throw error;
        }
        finally {
            unsubscribe();
            try {
                await stop();
            }
            finally {
                this.historyStop = undefined;
                this.historyBusy = false;
            }
        }
    }
    models = new Map();
    loads = new Map();
    busy = new Set();
    async call(method, params, timeoutMs) {
        if (!this.ready)
            throw new OpencodeAcpError('OPENCODE_UNAVAILABLE', 'OpenCode ACP is not ready.');
        const p = isRecord(params) ? params : {};
        const id = typeof p.sessionId === 'string' ? p.sessionId : undefined;
        if (id && this.archivingSessions.has(id))
            throw new OpencodeAcpError('ACP_SESSION_BUSY', 'The OpenCode session is being archived.');
        if (id && this.archivedSessions.has(id) && ['session/load', 'session/prompt', 'dsh/selectModel'].includes(method))
            throw new OpencodeAcpError('ACP_SESSION_ARCHIVED', 'This OpenCode session is archived.');
        const budget = timeoutMs ?? (method === 'session/prompt' ? ACP_PROMPT_TIMEOUT_MS : ACP_REQUEST_TIMEOUT_MS);
        if (method === 'session/load' && id) {
            // Re-reading models must never replay history into an active conversation.
            if (this.models.has(id))
                return { sessionId: id };
            const pending = this.loads.get(id);
            if (pending)
                return pending;
            const load = Promise.resolve().then(() => this.loadSession(method, params, budget, id));
            this.loads.set(id, load);
            try {
                return await load;
            }
            finally {
                this.loads.delete(id);
            }
        }
        if (method === 'session/new')
            return this.loadSession(method, params, budget);
        if (method === 'dsh/sessionModels' || method === 'dsh/selectModel') {
            const models = id ? this.models.get(id) : undefined;
            if (!models)
                throw new OpencodeAcpError('ACP_SESSION_NOT_LOADED', 'Load the OpenCode session before selecting its model.');
            if (method === 'dsh/sessionModels')
                return models.catalog();
            if (this.busy.has(id))
                throw new OpencodeAcpError('PROMPT_IN_PROGRESS', 'Stop the OpenCode reply before changing its model.');
            this.busy.add(id);
            try {
                const result = await models.select(id, p.model, p.reasoningEffort, (method, params) => this.request(method, params, budget));
                this.publish({ kind: 'notification', method: 'session/update', params: { sessionId: id,
                        update: { sessionUpdate: 'model_selection', selected: result.selected } } });
                return result;
            }
            finally {
                this.busy.delete(id);
            }
        }
        if (method === 'session/prompt' && id) {
            if (this.busy.has(id))
                throw new OpencodeAcpError('PROMPT_IN_PROGRESS', 'The OpenCode session is busy.');
            this.busy.add(id);
            try {
                return await this.request(method, params, budget);
            }
            finally {
                this.busy.delete(id);
            }
        }
        const result = await this.request(method, params, budget);
        const nativeApi = this.nativeApi;
        if (method === 'session/list' && nativeApi && isRecord(result) && Array.isArray(result.sessions)) {
            // ACP list may return archived native records, including after a restart.
            // Recheck every item against OpenCode; process-local caches are insufficient.
            if (result.sessions.length > 1000)
                throw new OpencodeAcpError('INVALID_MESSAGE', 'The OpenCode catalog page is too large.');
            const items = result.sessions;
            const archivedItems = new Map();
            let next = 0;
            await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
                for (;;) {
                    const index = next++;
                    if (index >= items.length)
                        return;
                    const item = items[index];
                    if (!isRecord(item) || typeof item.sessionId !== 'string' || typeof item.cwd !== 'string')
                        continue;
                    const cwd = await realpath(item.cwd).catch(() => undefined);
                    if (!cwd)
                        continue;
                    const archived = await nativeApi.isArchived(item.sessionId, cwd);
                    if (archived)
                        this.archivedSessions.add(item.sessionId);
                    else
                        this.archivedSessions.delete(item.sessionId);
                    archivedItems.set(index, archived);
                }
            }));
            // The gateway retains authority for archived history, but excludes these
            // entries from its public/default catalog.
            const sessions = items.flatMap((item, index) => archivedItems.has(index)
                ? [{ ...item, archived: archivedItems.get(index) }] : []);
            return { ...result, sessions };
        }
        return result;
    }
    async loadSession(method, params, budget, sessionId) {
        const result = await this.request(method, params, budget);
        const returnedId = isRecord(result) && typeof result.sessionId === 'string' ? result.sessionId : undefined;
        const id = sessionId ?? returnedId;
        if (!this.ready || !id || (sessionId && returnedId && returnedId !== sessionId)) {
            throw new OpencodeAcpError('ACP_INVALID_SESSION', 'OpenCode returned an invalid session.');
        }
        const models = new AcpSessionModelState('opencode');
        models.update(result);
        this.models.set(id, models);
        return result;
    }
    publish(message) {
        for (const handler of this.inboundHandlers)
            handler(message);
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
        this.startupAbort.abort();
        this.ready = false;
        this.models.clear();
        this.nativeApi?.close();
        this.failPending(new OpencodeAcpError('OPENCODE_CLOSED', 'OpenCode ACP was closed.'));
        const history = this.historyStop?.();
        const child = this.process;
        this.process = undefined;
        if (child === undefined || child.exitCode !== null || child.killed) {
            await history;
            return;
        }
        await Promise.all([history, new Promise(resolve => {
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
            })]);
    }
    async startOnce() {
        if (this.process !== undefined) {
            throw new OpencodeAcpError('OPENCODE_STARTING', 'OpenCode ACP is already starting.');
        }
        let child;
        if (this.spawnAcp)
            child = this.spawnAcp(this.binary);
        else {
            const args = this.options.args ?? ['acp'];
            const nativeApiSupported = await opencodeHasNativeApi(this.binary, args, this.options.cwd, this.startupAbort.signal);
            const port = nativeApiSupported ? await opencodeLoopbackPort() : undefined;
            if (this.closed)
                throw new OpencodeAcpError('OPENCODE_CLOSED', 'OpenCode ACP was closed.');
            if (port !== undefined)
                this.nativeApi = new OpencodeNativeApi(`http://127.0.0.1:${port}`);
            child = spawn(this.binary, opencodePrivateArgs(args, port), {
                cwd: this.options.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
                env: { ...process.env, ...(this.nativeApi ? { OPENCODE_SERVER_USERNAME: 'opencode', OPENCODE_SERVER_PASSWORD: this.nativeApi.password } : {}) },
            });
        }
        this.process = child;
        this.failureNotified = false;
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
                this.handleProcessFailure('OPENCODE_BINARY_UNAVAILABLE', error);
        });
        child.on('exit', (code, signal) => {
            if (this.process !== child)
                return;
            this.process = undefined;
            this.ready = false;
            this.nativeApi?.close();
            this.nativeApi = undefined;
            this.models.clear();
            void this.historyStop?.().catch(() => undefined);
            this.failPending(new OpencodeAcpError('OPENCODE_ACP_EXITED', 'OpenCode ACP exited unexpectedly.'));
            if (!this.closed) {
                this.logger?.warn('OpenCode ACP exited', {
                    code: code ?? 'none',
                    signal: signal ?? 'none',
                    stderrBytes: this.stderrBytes,
                });
                this.notifyUnavailable('OPENCODE_ACP_EXITED');
            }
        });
        try {
            await this.request('initialize', {
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
            if (this.closed || this.process !== child)
                throw new OpencodeAcpError('OPENCODE_CLOSED', 'OpenCode ACP was closed.');
            this.ready = true;
            this.logger?.info('OpenCode ACP ready');
        }
        catch (error) {
            child.kill('SIGTERM');
            if (error instanceof OpencodeAcpError)
                throw error;
            throw new OpencodeAcpError('OPENCODE_INITIALIZE_FAILED', 'OpenCode ACP initialization failed.', { cause: error });
        }
    }
    request(method, params, timeoutMs) {
        const id = this.nextId++;
        const result = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new OpencodeAcpError('OPENCODE_REQUEST_TIMEOUT', 'OpenCode ACP request timed out.'));
            }, timeoutMs);
            timer.unref?.();
            this.pending.set(id, { resolve, reject, timer });
        });
        try {
            this.write({ jsonrpc: '2.0', id, method, params });
        }
        catch (error) {
            const pending = this.takePending(id);
            pending?.reject(error instanceof Error ? error : new Error('OpenCode ACP write failed.'));
        }
        return result;
    }
    write(message) {
        const child = this.process;
        if (child === undefined || child.stdin.destroyed || !child.stdin.writable) {
            throw new OpencodeAcpError('OPENCODE_UNAVAILABLE', 'OpenCode ACP is not available.');
        }
        child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    consumeStdout(chunk) {
        this.stdoutBuffer = this.stdoutBuffer.length === 0 ? chunk : Buffer.concat([this.stdoutBuffer, chunk]);
        if (this.stdoutBuffer.length > MAX_ACP_LINE_BYTES) {
            this.handleProcessFailure('OPENCODE_RESPONSE_TOO_LARGE', new Error('OpenCode ACP emitted an oversized JSONL message.'));
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
            this.handleProcessFailure('OPENCODE_INVALID_RESPONSE', new Error('OpenCode ACP emitted invalid JSON.'));
            return;
        }
        if (!isRecord(value)) {
            this.handleProcessFailure('OPENCODE_INVALID_RESPONSE', new Error('OpenCode ACP emitted an invalid message.'));
            return;
        }
        if ((typeof value.id === 'number' || typeof value.id === 'string') && ('result' in value || 'error' in value)) {
            const pending = this.takePending(value.id);
            if (pending === undefined)
                return;
            if ('error' in value && value.error !== undefined) {
                pending.reject(new OpencodeAcpError('OPENCODE_UPSTREAM_ERROR', safeUpstreamError(value.error)));
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
        if (inbound.kind === 'request' && isRecord(params) && typeof params.sessionId === 'string' && this.loads.has(params.sessionId)) {
            void this.respondError(inbound.id, -32600, 'OpenCode session is not loaded.').catch(() => undefined);
            return;
        }
        if (inbound.kind === 'notification' && inbound.method === 'session/update' && isRecord(params) && typeof params.sessionId === 'string') {
            this.models.get(params.sessionId)?.update(params.update);
            // session/load replays belong to the separate history reader, not live UI.
            if (this.loads.has(params.sessionId) && !this.options.historyReader)
                return;
        }
        this.publish(inbound);
    }
    handleProcessFailure(code, cause) {
        void this.historyStop?.().catch(() => undefined);
        this.nativeApi?.close();
        this.nativeApi = undefined;
        this.ready = false;
        this.models.clear();
        this.failPending(new OpencodeAcpError(code, 'OpenCode ACP communication failed.', { cause }));
        const child = this.process;
        this.process = undefined;
        child?.kill('SIGTERM');
        this.logger?.warn('OpenCode ACP communication failed', { code });
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
function safeUpstreamError(value) {
    if (!isRecord(value) || typeof value.message !== 'string')
        return 'OpenCode ACP rejected the request.';
    const message = value.message.toLowerCase();
    if (message.includes('auth') || message.includes('login') || message.includes('api key')) {
        return 'OpenCode ACP authentication failed.';
    }
    if (message.includes('not initialized'))
        return 'OpenCode ACP is not initialized.';
    return 'OpenCode ACP rejected the request.';
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=opencode-process.js.map