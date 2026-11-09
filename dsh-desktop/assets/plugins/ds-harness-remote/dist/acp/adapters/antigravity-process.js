import { readAgyModels, cachedAgyModels, agySelectionArgs } from './antigravity/models.js';
import { prepareAgyImageDirectory, stageAgyImages, agyImagePrompt } from './antigravity/image-store.js';
import { parseAcpImage } from '../image-content.js';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { TranscriptWatcher } from './antigravity/transcript-watcher.js';
const ACP_REQUEST_TIMEOUT_MS = 60_000;
const ACP_PROMPT_TIMEOUT_MS = 10 * 60_000;
const ACP_START_TIMEOUT_MS = 20_000;
const MAX_STDERR_CAPTURE_BYTES = 4 * 1024;
export class AntigravityAcpError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'AntigravityAcpError';
    }
}
export function resolveAntigravityBinary(preferred) {
    if (preferred && preferred.trim() !== '' && preferred !== 'agent' && preferred !== 'cursor') {
        return preferred.trim();
    }
    const defaultLocal = '/var/lib/dsh/.local/bin/agy';
    if (existsSync(defaultLocal)) {
        return defaultLocal;
    }
    return 'agy';
}
/**
 * Host-local stdio client for Google Antigravity CLI (`agy --input-format stream-json --output-format stream-json`).
 * Maps Antigravity's stream-json NDJSON events to the standard Agent ACP gateway protocol.
 */
export class AntigravityAcpClient {
    binary;
    logger;
    spawnAcp;
    process;
    inboundHandlers = new Set();
    unavailableHandlers = new Set();
    watcher;
    stdoutBuffer = Buffer.alloc(0);
    stderrBytes = 0;
    ready = false;
    closed = false;
    startPromise;
    activeConversationId;
    skipPermissions;
    sessionWorker;
    initialConversationClaimed = false;
    sessions = new Map();
    spare;
    spareCwd;
    args;
    cwd;
    readModels;
    brainDir;
    dispatchedThinkingSteps = new Set();
    selections = new Map();
    selecting = new Set();
    currentPromptPending;
    constructor(binary = 'agy', logger, spawnAcp = (bin, args, cwd) => spawn(bin, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: process.env,
    }), options = {}) {
        this.binary = binary;
        this.logger = logger;
        this.spawnAcp = spawnAcp;
        const loadModels = options.readModels ?? (() => readAgyModels(resolveAntigravityBinary(this.binary)));
        this.readModels = options.sessionWorker ? loadModels : cachedAgyModels(loadModels);
        this.args = options.args ?? ['--input-format', 'stream-json', '--output-format', 'stream-json'];
        this.cwd = options.cwd ?? process.cwd();
        this.brainDir = options.brainDir;
        this.sessionWorker = options.sessionWorker === true;
        this.initialConversationClaimed = options.conversationId !== undefined;
        this.skipPermissions = options.skipPermissions === true;
        this.activeConversationId = options.conversationId;
    }
    start() {
        if (this.closed)
            return Promise.reject(new AntigravityAcpError('ANTIGRAVITY_CLOSED', 'The Antigravity domain is closed.'));
        if (this.ready)
            return Promise.resolve();
        this.startPromise ??= this.startOnce().finally(() => { this.startPromise = undefined; });
        return this.startPromise;
    }
    isReady() { return this.ready; }
    prepareSession(conversationId, cwd = this.cwd, selectionArgs) {
        if (this.closed)
            return Promise.reject(new AntigravityAcpError('ANTIGRAVITY_CLOSED', 'The Antigravity domain is closed.'));
        const worker = new AntigravityAcpClient(this.binary, this.logger, this.spawnAcp, {
            args: selectionArgs ? [...withoutSelectionArgs(this.args), ...selectionArgs] : this.args,
            readModels: this.readModels,
            skipPermissions: this.skipPermissions,
            sessionWorker: true,
            cwd,
            brainDir: this.brainDir,
            ...(conversationId === undefined ? {} : { conversationId }),
        });
        worker.onInbound(frame => { for (const handler of this.inboundHandlers)
            handler(frame); });
        return worker.start().then(async () => {
            if (this.closed) {
                await worker.close();
                throw new AntigravityAcpError('ANTIGRAVITY_CLOSED', 'The Antigravity domain is closed.');
            }
            if (!worker.activeConversationId || (conversationId !== undefined && worker.activeConversationId !== conversationId)) {
                await worker.close();
                throw new AntigravityAcpError('SESSION_MISMATCH', 'Antigravity initialized the wrong conversation.');
            }
            return worker;
        }).catch(async (error) => { await worker.close(); throw error; });
    }
    warmNextSession(cwd = this.cwd) {
        if (this.sessionWorker || this.closed || this.spare !== undefined)
            return;
        const spare = this.prepareSession(undefined, cwd);
        this.spareCwd = cwd;
        this.spare = spare;
        // Observe startup failures even when nobody has requested the spare yet.
        void spare.catch(() => { if (this.spare === spare)
            this.spare = undefined; });
    }
    prewarmSession(cwd) {
        if (this.sessionWorker || this.closed || (this.spare !== undefined && this.spareCwd === cwd))
            return;
        const previous = this.spare;
        this.spare = undefined;
        if (previous !== undefined)
            void previous.then(worker => worker.close()).catch(() => undefined);
        this.warmNextSession(cwd);
    }
    async call(method, params, timeoutMs) {
        if (!this.ready) {
            if (this.startPromise) {
                await this.startPromise;
            }
            else if (!this.closed) {
                await this.start();
            }
        }
        if (!this.ready)
            throw new AntigravityAcpError('ANTIGRAVITY_UNAVAILABLE', 'Antigravity ACP is not ready.');
        if (method === 'initialize') {
            return {
                protocolVersion: 1,
                capabilities: {
                    loadSession: true,
                    promptTypes: ['text', 'image'],
                },
                agentInfo: {
                    name: 'antigravity',
                    version: '1.2.16',
                },
                backend: 'antigravity',
            };
        }
        if (method === 'session/new') {
            if (this.currentPromptPending)
                throw new AntigravityAcpError('PROMPT_IN_PROGRESS', 'A prompt is in progress.');
            const cwd = typeof params?.cwd === 'string' ? params.cwd : this.cwd;
            if (!this.initialConversationClaimed && this.activeConversationId !== undefined && cwd === this.cwd) {
                this.initialConversationClaimed = true;
                this.warmNextSession(cwd);
                return { sessionId: this.activeConversationId };
            }
            const cached = this.spare;
            const pending = cached !== undefined && this.spareCwd === cwd ? cached : this.prepareSession(undefined, cwd);
            if (cached !== undefined && this.spareCwd !== cwd)
                void cached.then(worker => worker.close()).catch(() => undefined);
            this.spare = undefined;
            const worker = await pending;
            const sessionId = worker.activeConversationId;
            if (sessionId === this.activeConversationId || this.sessions.has(sessionId)) {
                await worker.close();
                throw new AntigravityAcpError('SESSION_MISMATCH', 'Antigravity reused an existing conversation for session/new.');
            }
            this.sessions.set(sessionId, worker);
            this.warmNextSession(cwd);
            return { sessionId };
        }
        if (method === 'dsh/sessionModels') {
            const sessionId = String(params.sessionId);
            const catalog = await this.readModels();
            return { current: this.selections.get(sessionId) ?? { provider: 'antigravity', model: 'host-settings' },
                routable: true, groups: catalog.groups, failures: [] };
        }
        if (method === 'dsh/selectModel') {
            const p = params;
            if (this.selecting.has(p.sessionId))
                throw new AntigravityAcpError('PROMPT_IN_PROGRESS', 'A model change is already in progress.');
            const current = this.sessions.get(p.sessionId) ?? (p.sessionId === this.activeConversationId ? this : undefined);
            if (!current && !p.cwd)
                throw new AntigravityAcpError('SESSION_MISMATCH', 'Load the conversation before selecting its model.');
            if (current?.currentPromptPending)
                throw new AntigravityAcpError('PROMPT_IN_PROGRESS', 'Stop the reply before changing its model.');
            this.selecting.add(p.sessionId);
            try {
                const chosen = agySelectionArgs(await this.readModels(), p.model, p.reasoningEffort);
                const previous = this.selections.get(p.sessionId);
                if (current?.isReady() && previous?.model === chosen.selection.model
                    && previous.reasoningEffort === chosen.selection.reasoningEffort)
                    return { selected: previous };
                // Resume the same conversation with real CLI flags. Keep the old process usable on startup failure.
                const replacement = await this.prepareSession(p.sessionId, current?.cwd ?? p.cwd, chosen.args);
                if (current?.currentPromptPending) {
                    await replacement.close();
                    throw new AntigravityAcpError('PROMPT_IN_PROGRESS', 'A reply started during model selection.');
                }
                this.sessions.set(p.sessionId, replacement);
                this.selections.set(p.sessionId, chosen.selection);
                replacement.selections.set(p.sessionId, chosen.selection);
                if (current && current !== this)
                    await current.close();
                else if (current === this) {
                    this.watcher?.stop();
                    this.watcher = undefined;
                    const child = this.process;
                    this.process = undefined;
                    child?.stdout.removeAllListeners('data');
                    if (child && !child.killed)
                        child.kill('SIGTERM');
                }
                this.emitNotification('session/update', { sessionId: p.sessionId, update: { sessionUpdate: 'model_selection', selected: chosen.selection } });
                return { selected: chosen.selection };
            }
            finally {
                this.selecting.delete(p.sessionId);
            }
        }
        const sessionId = typeof params?.sessionId === 'string'
            ? params.sessionId : undefined;
        if (sessionId !== undefined && this.selecting.has(sessionId))
            throw new AntigravityAcpError('PROMPT_IN_PROGRESS', 'A model change is in progress.');
        if (!this.sessionWorker && sessionId !== undefined && (sessionId !== this.activeConversationId || this.sessions.has(sessionId))) {
            let worker = this.sessions.get(sessionId);
            if (worker === undefined) {
                worker = await this.prepareSession(sessionId, typeof params.cwd === 'string' ? params.cwd : this.cwd);
                this.sessions.set(sessionId, worker);
            }
            return worker.call(method, params, timeoutMs);
        }
        if (method === 'session/load') {
            if (sessionId !== this.activeConversationId)
                throw new AntigravityAcpError('SESSION_MISMATCH', 'The process is bound to another conversation.');
            return { sessionId };
        }
        if (method === 'session/cancel') {
            await this.cancelTurn();
            return { cancelled: true };
        }
        if (method === 'session/prompt') {
            const p = params;
            let promptText = p.prompt.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n');
            const images = p.prompt.filter(item => item.type === 'image').map(parseAcpImage);
            if (images.length > 0) {
                if (images.length > 4)
                    throw new AntigravityAcpError('INVALID_MESSAGE', 'Too many AGY image attachments.');
                if (this.currentPromptPending)
                    throw new AntigravityAcpError('PROMPT_IN_PROGRESS', 'Another prompt is already in progress.');
                const paths = await stageAgyImages(p.sessionId, images);
                promptText = agyImagePrompt(promptText, paths);
            }
            return this.sendPrompt(p.sessionId, promptText, timeoutMs ?? ACP_PROMPT_TIMEOUT_MS);
        }
        throw new AntigravityAcpError('METHOD_NOT_SUPPORTED', `Method ${method} is not supported by Antigravity ACP adapter.`);
    }
    async respond(_id, _result) {
        // Currently auto-approved or handled via session permissions
    }
    async respondError(_id, _code, _message) {
        // Currently auto-approved or handled via session permissions
    }
    onInbound(handler) {
        this.inboundHandlers.add(handler);
        return () => this.inboundHandlers.delete(handler);
    }
    onUnavailable(handler) {
        this.unavailableHandlers.add(handler);
        return () => this.unavailableHandlers.delete(handler);
    }
    async cancelTurn() {
        if (this.currentPromptPending) {
            clearTimeout(this.currentPromptPending.timer);
            const pending = this.currentPromptPending;
            this.currentPromptPending = undefined;
            pending.resolve({ stopReason: 'cancelled' });
        }
        if (this.watcher) {
            this.watcher.stop();
            this.watcher = undefined;
        }
        const child = this.process;
        this.process = undefined;
        this.ready = false;
        this.stdoutBuffer = Buffer.alloc(0);
        if (child !== undefined && child.exitCode === null && !child.killed) {
            child.stdout.removeAllListeners('data');
            child.stderr.removeAllListeners('data');
            child.kill('SIGINT');
            const timer = setTimeout(() => {
                if (child.exitCode === null && !child.killed)
                    child.kill('SIGKILL');
            }, 1_000);
            timer.unref?.();
        }
        if (this.activeConversationId && !this.closed) {
            void this.start().catch(err => {
                this.logger?.warn('Failed to restart Antigravity process after cancellation', { error: String(err) });
            });
        }
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        const spare = this.spare;
        this.spare = undefined;
        void spare?.then(worker => worker.close()).catch(() => undefined);
        await Promise.all([...this.sessions.values()].map(worker => worker.close()));
        this.sessions.clear();
        this.ready = false;
        if (this.watcher) {
            this.watcher.stop();
            this.watcher = undefined;
        }
        if (this.currentPromptPending) {
            clearTimeout(this.currentPromptPending.timer);
            this.currentPromptPending.reject(new AntigravityAcpError('ANTIGRAVITY_CLOSED', 'Antigravity ACP was closed.'));
            this.currentPromptPending = undefined;
        }
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
            throw new AntigravityAcpError('ANTIGRAVITY_STARTING', 'Antigravity ACP is already starting.');
        }
        const bin = resolveAntigravityBinary(this.binary);
        const imageDirectory = await prepareAgyImageDirectory();
        if (this.closed)
            throw new AntigravityAcpError('ANTIGRAVITY_CLOSED', 'The Antigravity domain is closed.');
        const args = [...this.args, '--add-dir', imageDirectory];
        if (this.activeConversationId) {
            args.push('--conversation', this.activeConversationId);
        }
        if (this.skipPermissions) {
            args.push('--dangerously-skip-permissions');
        }
        const child = this.spawnAcp(bin, args, this.cwd);
        this.process = child;
        this.stdoutBuffer = Buffer.alloc(0);
        this.stderrBytes = 0;
        let initResolved = false;
        let rejectInit;
        const initPromise = new Promise((resolve, reject) => {
            rejectInit = reject;
            const timer = setTimeout(() => {
                if (!initResolved) {
                    reject(new AntigravityAcpError('ANTIGRAVITY_INIT_TIMEOUT', 'Timed out waiting for Antigravity init event.'));
                }
            }, ACP_START_TIMEOUT_MS);
            timer.unref?.();
            const checkInit = (chunk) => {
                this.consumeStdout(chunk, (event) => {
                    if (event.event === 'init') {
                        initResolved = true;
                        clearTimeout(timer);
                        const conversationId = event.conversation_id;
                        if (typeof conversationId === 'string') {
                            this.activeConversationId = conversationId;
                            this.attachWatcher(conversationId);
                        }
                        resolve();
                    }
                });
            };
            child.stdout.on('data', chunk => {
                if (!initResolved) {
                    checkInit(Buffer.from(chunk));
                }
                else {
                    this.consumeStdout(Buffer.from(chunk));
                }
            });
        });
        child.stderr.on('data', chunk => {
            this.stderrBytes = Math.min(MAX_STDERR_CAPTURE_BYTES, this.stderrBytes + Buffer.byteLength(chunk));
        });
        child.on('error', error => {
            if (this.process !== child)
                return;
            this.ready = false;
            if (!initResolved) {
                rejectInit?.(new AntigravityAcpError('ANTIGRAVITY_BINARY_UNAVAILABLE', 'Failed to start the Antigravity CLI.', { cause: error }));
            }
            if (!this.closed) {
                this.logger?.warn('Antigravity binary error', { message: error.message });
                this.notifyUnavailable('ANTIGRAVITY_BINARY_UNAVAILABLE');
            }
        });
        child.on('exit', (code, signal) => {
            if (this.process !== child)
                return;
            this.process = undefined;
            this.ready = false;
            if (!initResolved) {
                rejectInit?.(new AntigravityAcpError('ANTIGRAVITY_EXITED', 'Antigravity exited before initialization.'));
            }
            if (this.currentPromptPending) {
                clearTimeout(this.currentPromptPending.timer);
                this.currentPromptPending.reject(new AntigravityAcpError('ANTIGRAVITY_EXITED', 'Antigravity exited unexpectedly.'));
                this.currentPromptPending = undefined;
            }
            if (!this.closed) {
                this.logger?.warn('Antigravity process exited', { code: code ?? 'none', signal: signal ?? 'none' });
                this.notifyUnavailable('ANTIGRAVITY_EXITED');
            }
        });
        try {
            await initPromise;
            this.ready = true;
            this.warmNextSession();
            this.logger?.info('Antigravity ACP ready', { conversationId: this.activeConversationId });
        }
        catch (err) {
            child.kill('SIGTERM');
            throw err;
        }
    }
    sendPrompt(sessionId, promptText, timeoutMs) {
        if (this.currentPromptPending) {
            throw new AntigravityAcpError('PROMPT_IN_PROGRESS', 'Another prompt is already in progress.');
        }
        const selected = this.selections.get(sessionId);
        if (selected)
            this.emitNotification('session/update', { sessionId, update: { sessionUpdate: 'model_selection', selected } });
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.currentPromptPending) {
                    this.currentPromptPending = undefined;
                    reject(new AntigravityAcpError('ANTIGRAVITY_REQUEST_TIMEOUT', 'Antigravity turn timed out.'));
                }
            }, timeoutMs);
            timer.unref?.();
            this.currentPromptPending = { sessionId, resolve, reject, timer };
            const payload = {
                event: 'user',
                message: { content: promptText },
            };
            const data = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
            this.process?.stdin.write(data);
        });
    }
    attachWatcher(conversationId) {
        if (this.watcher) {
            this.watcher.stop();
            this.watcher = undefined;
        }
        const watcher = new TranscriptWatcher(conversationId, this.brainDir);
        this.watcher = watcher;
        this.dispatchedThinkingSteps.clear();
        watcher.on('thinking', ({ stepIndex, thinking }) => {
            if (this.dispatchedThinkingSteps.has(stepIndex))
                return;
            this.dispatchedThinkingSteps.add(stepIndex);
            const trimmed = thinking?.trim();
            if (!trimmed)
                return;
            const sessionId = this.currentPromptPending?.sessionId ?? this.activeConversationId ?? 'default';
            this.emitNotification('session/update', {
                sessionId,
                update: {
                    sessionUpdate: 'agent_thought_chunk',
                    text: `${trimmed}\n\n`,
                },
            });
        });
        watcher.start();
    }
    consumeStdout(chunk, onRawEvent) {
        this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
        while (true) {
            const newlineIndex = this.stdoutBuffer.indexOf(0x0a);
            if (newlineIndex === -1)
                break;
            const line = this.stdoutBuffer.subarray(0, newlineIndex).toString('utf8').trim();
            this.stdoutBuffer = this.stdoutBuffer.subarray(newlineIndex + 1);
            if (line === '')
                continue;
            try {
                const parsed = JSON.parse(line);
                if (onRawEvent) {
                    onRawEvent(parsed);
                }
                this.handleAgyEvent(parsed);
                void this.watcher?.flush();
            }
            catch (err) {
                this.logger?.debug('Failed to parse agy stdout line', { code: 'INVALID_AGY_STREAM_EVENT' });
            }
        }
    }
    handleAgyEvent(event) {
        const eventName = event.event;
        const current = this.currentPromptPending;
        const sessionId = current?.sessionId ?? this.activeConversationId ?? 'default';
        if (eventName === 'step_update' && typeof event.step_update === 'object' && event.step_update !== null) {
            const step = event.step_update;
            const stepType = step.step_type;
            if (stepType === 'agent_response' && typeof step.text_delta === 'string') {
                this.emitNotification('session/update', {
                    sessionId,
                    update: {
                        sessionUpdate: 'agent_message_chunk',
                        text: step.text_delta,
                    },
                });
            }
            else if (stepType === 'thought' || stepType === 'reasoning') {
                const text = typeof step.text_delta === 'string'
                    ? step.text_delta
                    : typeof step.thought === 'string'
                        ? step.thought
                        : typeof step.reasoning === 'string'
                            ? step.reasoning
                            : undefined;
                if (text) {
                    if (typeof step.step_index === 'number') {
                        this.dispatchedThinkingSteps.add(step.step_index);
                    }
                    this.emitNotification('session/update', {
                        sessionId,
                        update: {
                            sessionUpdate: 'agent_thought_chunk',
                            text,
                        },
                    });
                }
            }
            else if (stepType === 'tool') {
                const toolInfo = step.tool_info ?? {};
                const toolName = typeof step.tool_name === 'string' ? step.tool_name : toolInfo.name ?? 'tool';
                const callId = String(step.step_index ?? Date.now());
                if (step.state === 'ACTIVE') {
                    this.emitNotification('session/update', {
                        sessionId,
                        update: {
                            sessionUpdate: 'tool_call',
                            callId,
                            name: toolName,
                            parameters: toolInfo.parameters ?? {},
                        },
                    });
                }
                else if (step.state === 'DONE') {
                    const status = step.status === 'ERROR' ? 'failed' : 'completed';
                    this.emitNotification('session/update', {
                        sessionId,
                        update: {
                            sessionUpdate: 'tool_call_update',
                            callId,
                            status,
                            output: typeof toolInfo.output === 'string' ? toolInfo.output : JSON.stringify(toolInfo.output ?? ''),
                        },
                    });
                }
            }
        }
        else if (eventName === 'result' && typeof event.result === 'object' && event.result !== null) {
            const result = event.result;
            if (current) {
                clearTimeout(current.timer);
                this.currentPromptPending = undefined;
                const finish = async () => {
                    try {
                        await this.watcher?.flush();
                    }
                    catch {
                        // ignore flush errors
                    }
                    if (result.status === 'ERROR') {
                        current.reject(new AntigravityAcpError('ANTIGRAVITY_TURN_FAILED', String(result.error ?? 'Execution error')));
                    }
                    else {
                        current.resolve({ stopReason: 'end_turn', response: result.response });
                    }
                };
                void finish();
            }
        }
    }
    emitNotification(method, params) {
        const notification = { kind: 'notification', method, params };
        for (const handler of this.inboundHandlers) {
            try {
                handler(notification);
            }
            catch (err) {
                this.logger?.warn('Error in inbound ACP handler', { error: String(err) });
            }
        }
    }
    notifyUnavailable(code) {
        for (const handler of this.unavailableHandlers) {
            try {
                handler(code);
            }
            catch (err) {
                this.logger?.warn('Error in unavailable ACP handler', { error: String(err) });
            }
        }
    }
}
function withoutSelectionArgs(args) {
    const filtered = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--model' || args[i] === '--effort') {
            i++;
            continue;
        }
        if (args[i].startsWith('--model=') || args[i].startsWith('--effort='))
            continue;
        filtered.push(args[i]);
    }
    return filtered;
}
//# sourceMappingURL=antigravity-process.js.map