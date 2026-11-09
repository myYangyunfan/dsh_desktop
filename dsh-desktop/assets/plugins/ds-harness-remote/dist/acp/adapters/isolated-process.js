import { CursorAcpClient, CursorAcpError } from './cursor-process.js';
import { acpHistoryEvents } from '../history-events.js';
/** One process per session: Cursor shares model settings within a process; Pi also needs isolated wrappers. */
export class IsolatedAcpClient {
    binary;
    logger;
    options;
    factory;
    catalog;
    clients = new Map();
    starting = new Set();
    inbound = new Set();
    unavailable = new Set();
    closed = false;
    all = new Set();
    callbacks = new Map();
    nextCallback = 0;
    configurations = new Map();
    busy = new Set();
    loading = new Map();
    historyBusy = false;
    constructor(binary, logger, options = {}, factory = () => new CursorAcpClient(binary, logger, undefined, { ...options, args: options.args ?? (options.backend === 'cursor' ? ['acp'] : []), authenticationMethod: options.backend === 'cursor' ? 'cursor_login' : null })) {
        this.binary = binary;
        this.logger = logger;
        this.options = options;
        this.factory = factory;
    }
    get backend() { return this.options.backend ?? 'pi'; }
    get label() { return this.backend === 'cursor' ? 'Cursor' : 'Pi'; }
    async start() {
        this.catalog = await this.create();
        this.catalog.onUnavailable(code => { for (const handler of this.unavailable)
            handler(code); });
    }
    isReady() { return !this.closed && this.catalog?.isReady() === true; }
    async create(history = false) {
        if (this.closed)
            throw new CursorAcpError('ACP_CLOSED', `${this.label} ACP is closed.`);
        if (this.all.size >= (history ? 32 : 31))
            throw new CursorAcpError('ACP_PROCESS_LIMIT', `Too many ${this.label} ACP sessions are active.`);
        const client = this.factory();
        this.starting.add(client);
        this.all.add(client);
        try {
            await client.start();
            if (this.closed)
                throw new CursorAcpError('ACP_CLOSED', `${this.label} ACP is closed.`);
            return client;
        }
        catch (error) {
            await this.dispose(client);
            throw error;
        }
        finally {
            this.starting.delete(client);
        }
    }
    async call(method, params, timeoutMs) {
        const p = params;
        if (method === 'session/load' && typeof p.sessionId === 'string') {
            const previous = this.loading.get(p.sessionId);
            if (previous)
                return previous;
            const promise = this.callOnce(method, params, timeoutMs);
            this.loading.set(p.sessionId, promise);
            try {
                return await promise;
            }
            finally {
                this.loading.delete(p.sessionId);
            }
        }
        return this.callOnce(method, params, timeoutMs);
    }
    async callOnce(method, params, timeoutMs) {
        const p = params;
        if (method === 'session/list')
            return this.catalog.call(method, params, timeoutMs);
        if (method === 'session/new' || method === 'session/load') {
            const known = typeof p.sessionId === 'string' ? this.clients.get(p.sessionId) : undefined;
            // Loading a live session must not restart or cancel an in-flight turn.
            if (known)
                return { sessionId: p.sessionId };
            const client = await this.create();
            let boundId = typeof p.sessionId === 'string' ? p.sessionId : undefined;
            const queued = [];
            let replaying = method === 'session/load';
            const replayConfiguration = {};
            const receive = (message) => {
                // Initial load replays history, not a live turn. Keep only configuration
                // state and reject callbacks before this wrapper has a committed session.
                if (replaying) {
                    if (message.kind === 'request') {
                        void client.respondError(message.id, -32600, `${this.label} session is not loaded.`).catch(() => undefined);
                    }
                    else if (message.params?.sessionId === boundId) {
                        this.updateConfiguration(boundId, message, replayConfiguration);
                    }
                    return;
                }
                const incomingId = message.params?.sessionId;
                if (!boundId) {
                    if (queued.length < 200)
                        queued.push(message);
                    return;
                }
                if (incomingId !== boundId)
                    return;
                this.updateConfiguration(boundId, message);
                if (message.kind === 'request') {
                    const id = `${this.backend}-callback:${++this.nextCallback}`;
                    this.callbacks.set(id, { client, id: message.id });
                    message = { ...message, id };
                }
                for (const handler of this.inbound)
                    handler(message);
            };
            client.onInbound(receive);
            client.onUnavailable(() => {
                if (boundId && this.clients.get(boundId) === client) {
                    this.clients.delete(boundId);
                    this.configurations.delete(boundId);
                }
                void this.dispose(client).catch(() => undefined);
            });
            try {
                const result = await client.call(method, params, timeoutMs);
                const id = method === 'session/load' ? p.sessionId : result.sessionId;
                if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,240}$/.test(id) || this.clients.has(id) || this.closed
                    || (method === 'session/load' && typeof result.sessionId === 'string' && result.sessionId !== id))
                    throw new CursorAcpError('ACP_INVALID_SESSION', `${this.label} returned an invalid session.`);
                this.clients.set(id, client);
                const config = { ...result };
                this.updateConfiguration(id, { kind: 'notification', method: 'session/update', params: {
                        update: { sessionUpdate: 'config_option_update', configOptions: config.configOptions },
                    } }, config);
                for (const key of ['models', 'modes']) {
                    if (replayConfiguration[key])
                        config[key] = { ...config[key], ...replayConfiguration[key] };
                }
                this.configurations.set(id, config);
                boundId = id;
                replaying = false;
                for (const message of queued)
                    receive(message);
                return { ...result, sessionId: id };
            }
            catch (error) {
                await this.dispose(client);
                throw error;
            }
        }
        const client = this.clients.get(String(p.sessionId));
        if (!client)
            throw new CursorAcpError('ACP_SESSION_NOT_LOADED', `Load the ${this.label} session before using it.`);
        const id = String(p.sessionId);
        if (this.backend === 'cursor' && (method === 'dsh/sessionModels' || method === 'dsh/selectModel'))
            return client.call(method, params, timeoutMs);
        if (method === 'dsh/sessionModels')
            return this.models(id);
        if (method === 'dsh/selectModel') {
            if (this.busy.has(id))
                throw new CursorAcpError('PROMPT_IN_PROGRESS', `Stop the ${this.label} reply before changing its model.`);
            const config = this.configurations.get(id);
            if (!config?.models?.availableModels?.some((item) => item.modelId === p.model)
                || (p.reasoningEffort !== undefined && !config?.modes?.availableModes?.some((item) => item.id === p.reasoningEffort))) {
                throw new CursorAcpError('INVALID_MESSAGE', `The ${this.label} model or thinking level is not available.`);
            }
            this.busy.add(id);
            try {
                const modelResult = await client.call('session/set_config_option', { sessionId: id, configId: 'model', value: p.model });
                this.updateConfiguration(id, { kind: 'notification', method: 'session/update', params: { update: { sessionUpdate: 'config_option_update', configOptions: modelResult.configOptions } } });
                if (this.configurations.get(id)?.models?.currentModelId !== p.model)
                    throw new CursorAcpError('ACP_MODEL_NOT_CONFIRMED', `${this.label} did not confirm the model change.`);
                if (p.reasoningEffort !== undefined) {
                    if (!this.configurations.get(id)?.modes?.availableModes?.some((item) => item.id === p.reasoningEffort))
                        throw new CursorAcpError('INVALID_MESSAGE', 'The selected model does not support this thinking level.');
                    const thinkingResult = await client.call('session/set_config_option', { sessionId: id, configId: 'thought_level', value: p.reasoningEffort });
                    this.updateConfiguration(id, { kind: 'notification', method: 'session/update', params: { update: { sessionUpdate: 'config_option_update', configOptions: thinkingResult.configOptions } } });
                    if (this.configurations.get(id)?.modes?.currentModeId !== p.reasoningEffort)
                        throw new CursorAcpError('ACP_MODEL_NOT_CONFIRMED', `${this.label} did not confirm the thinking change.`);
                }
                return { selected: this.models(id).current };
            }
            finally {
                this.busy.delete(id);
            }
        }
        if (method === 'session/prompt') {
            if (this.busy.has(id))
                throw new CursorAcpError('PROMPT_IN_PROGRESS', `The ${this.label} session is busy.`);
            this.busy.add(id);
            try {
                return await client.call(method, params, timeoutMs);
            }
            finally {
                this.busy.delete(id);
            }
        }
        return client.call(method, params, timeoutMs);
    }
    updateConfiguration(id, message, initial) {
        if (message.method !== 'session/update')
            return;
        const update = message.params.update;
        const config = initial ?? this.configurations.get(id);
        if (!update || !config)
            return;
        if (update.sessionUpdate === 'current_mode_update' && typeof update.currentModeId === 'string')
            config.modes = { ...config.modes, currentModeId: update.currentModeId };
        if (update.sessionUpdate === 'config_option_update' && Array.isArray(update.configOptions)) {
            for (const option of update.configOptions) {
                if (option?.type !== 'select' || !Array.isArray(option.options))
                    continue;
                const options = option.options.flatMap((item) => Array.isArray(item?.options) ? item.options : [item])
                    .filter((item) => typeof item?.value === 'string' && typeof item?.name === 'string');
                if (option.id === 'model')
                    config.models = { currentModelId: option.currentValue,
                        availableModels: options.map((item) => ({ modelId: item.value, name: item.name })) };
                if (option.id === 'thought_level')
                    config.modes = { currentModeId: option.currentValue,
                        availableModes: options.map((item) => ({ id: item.value, name: item.name })) };
            }
        }
    }
    models(id) {
        const config = this.configurations.get(id);
        const modes = config?.modes;
        return { current: { provider: 'pi', model: config?.models?.currentModelId ?? '', reasoningEffort: modes?.currentModeId },
            routable: true, failures: [], groups: [{ id: 'pi', name: `${this.label}`, models: (config?.models?.availableModels ?? []).map((model) => ({
                        id: model.modelId, name: model.name, ...(modes?.availableModes?.length ? { reasoning: { efforts: modes.availableModes.map((mode) => ({ id: mode.id, name: mode.name })), defaultEffort: modes.currentModeId } } : {}),
                    })) }] };
    }
    /** A separate wrapper prevents history reads from interrupting active sessions. */
    async history(sessionId, cwd) {
        if (this.historyBusy)
            throw new CursorAcpError('ACP_PROCESS_LIMIT', `A ${this.label} history read is already in progress.`);
        this.historyBusy = true;
        let client;
        try {
            client = await this.create(true);
        }
        catch (error) {
            this.historyBusy = false;
            throw error;
        }
        const updates = [];
        let bytes = 0;
        let count = 0;
        client.onInbound(message => {
            if (message.kind !== 'notification' || message.method !== 'session/update' || message.params?.sessionId !== sessionId)
                return;
            count++;
            bytes += Buffer.byteLength(JSON.stringify(message));
            if (bytes <= 8 * 1024 * 1024 && count <= 10000)
                updates.push(message);
        });
        try {
            const result = await client.call('session/load', { sessionId, cwd, mcpServers: [] });
            const loadedId = result?.sessionId;
            if (loadedId !== undefined && loadedId !== sessionId)
                throw new CursorAcpError('ACP_INVALID_SESSION', `${this.label} returned an invalid history session.`);
            if (bytes > 8 * 1024 * 1024 || count > 10000)
                throw new CursorAcpError('ACP_HISTORY_TOO_LARGE', `${this.label} history exceeds the transfer limit.`);
            return acpHistoryEvents(updates, sessionId, this.backend);
        }
        finally {
            try {
                await this.dispose(client);
            }
            finally {
                this.historyBusy = false;
            }
        }
    }
    async respond(id, result) {
        const pending = this.callbacks.get(String(id));
        if (!pending)
            throw new CursorAcpError('ACP_CALLBACK_NOT_FOUND', `The ${this.label} callback is unavailable.`);
        this.callbacks.delete(String(id));
        await pending.client.respond(pending.id, result);
    }
    async respondError(id, code, message) {
        const pending = this.callbacks.get(String(id));
        if (!pending)
            return;
        this.callbacks.delete(String(id));
        await pending.client.respondError(pending.id, code, message);
    }
    onInbound(handler) { this.inbound.add(handler); return () => this.inbound.delete(handler); }
    onUnavailable(handler) { this.unavailable.add(handler); return () => this.unavailable.delete(handler); }
    async dispose(client) {
        await client.close();
        this.all.delete(client);
        for (const [key, pending] of this.callbacks)
            if (pending.client === client)
                this.callbacks.delete(key);
    }
    async close() {
        this.closed = true;
        const clients = this.all;
        await Promise.all([...clients].map(client => this.dispose(client)));
        this.clients.clear();
        this.all.clear();
        this.callbacks.clear();
    }
}
//# sourceMappingURL=isolated-process.js.map