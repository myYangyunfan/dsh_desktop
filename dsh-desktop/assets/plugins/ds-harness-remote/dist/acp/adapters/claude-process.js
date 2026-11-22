import { Buffer } from 'node:buffer';
import { CursorAcpClient, CursorAcpError } from './cursor-process.js';
import { acpHistoryEvents } from '../history-events.js';
const DEFAULT_LOAD_TOMBSTONE_TTL_MS = 60_000;
const MAX_LOAD_TOMBSTONE_TTL_MS = 5 * 60_000;
const MAX_LOAD_TOMBSTONES = 256;
const MAX_HISTORY_METADATA = 64;
/** Host-local authentication; no interactive login or filesystem transcript reads.
 *
 * Also the standard-ACP client shape used by other pre-authenticated backends (Hermes,
 * native AGY ACP, and custom ACP backends): one process per live session, a separate
 * reader for history replay, and load-replay suppression so a replayed transcript
 * never mixes into a live turn's stream.
 */
export class ClaudeAcpClient extends CursorAcpClient {
    live = new Map();
    loads = new Map();
    claudeInboundHandlers = new Set();
    loadSuppressions = new Map();
    loadGen = 0;
    pendingNew = 0;
    historyStop;
    historyReading = false;
    shuttingDown = false;
    historyMetadata = new Map();
    makeClient;
    constructor(binary = 'claude-agent-acp', logger, spawnAcp, options = {}, backend = 'claude') {
        const config = { ...options, args: options.args ?? [], authenticationMethod: null, modelBackend: backend, backend };
        super(binary, logger, spawnAcp, config);
        this.makeClient = () => new CursorAcpClient(binary, logger, spawnAcp, config);
        this.modelLabel = backend;
        super.onUnavailable(() => {
            this.live.clear();
            this.clearAllLoadSuppressions();
        });
        super.onInbound(message => {
            const id = isRecord(message.params) && typeof message.params.sessionId === 'string'
                ? message.params.sessionId
                : undefined;
            // First load (or a timed-out/aborted load whose late replay frames are still arriving)
            // belongs exclusively to history(), never live streams or interactive approvals.
            if (id && this.loadSuppressions.has(id)) {
                if (message.kind === 'request') {
                    void (message.method === 'session/request_permission'
                        ? this.respond(message.id, { outcome: { outcome: 'cancelled' } })
                        : this.respondError(message.id, -32600, `${this.label} session is not loaded.`)).catch(() => undefined);
                }
                return;
            }
            for (const handler of this.claudeInboundHandlers)
                handler(message);
        });
    }
    /** History events and model catalogs are labelled with the backend that produced them. */
    modelLabel;
    get label() {
        return this.modelLabel === 'hermes' ? 'Hermes' : this.modelLabel === 'antigravity' ? 'Antigravity' : this.modelLabel === 'claude' ? 'Claude' : this.modelLabel;
    }
    onInbound(handler) {
        this.claudeInboundHandlers.add(handler);
        return () => this.claudeInboundHandlers.delete(handler);
    }
    async call(method, params, timeoutMs) {
        if (this.shuttingDown)
            throw new CursorAcpError('ACP_CLOSED', `${this.label} ACP is closed.`);
        const id = params?.sessionId;
        if (method === 'session/load' && typeof id === 'string') {
            // Upstream reloads even an already live session, replaying into active listeners.
            if (this.live.has(id))
                return this.live.get(id);
            const pending = this.loads.get(id);
            if (pending)
                return pending;
            this.checkSessionLimit();
            const gen = this.beginLoadSuppression(id);
            let responded = false;
            // Defer the actual call until the suppression/deduplication guard is installed.
            const load = Promise.resolve().then(() => super.call(method, params, timeoutMs)).then(result => {
                responded = true;
                this.assertLoaded(result, id);
                this.live.set(id, result);
                this.clearLoadSuppression(id, gen);
                return result;
            });
            this.loads.set(id, load);
            try {
                return await load;
            }
            catch (error) {
                if (responded || this.shuttingDown || !this.isReady()) {
                    this.clearLoadSuppression(id, gen);
                }
                else {
                    this.armLoadTombstone(id, gen, timeoutMs);
                }
                throw error;
            }
            finally {
                this.loads.delete(id);
            }
        }
        if (method === 'session/new' || method === 'session/fork') {
            this.checkSessionLimit();
            this.pendingNew++;
            try {
                const result = await super.call(method, params, timeoutMs);
                const newId = result?.sessionId;
                if (typeof newId !== 'string' || this.shuttingDown)
                    throw new CursorAcpError('ACP_INVALID_SESSION', `${this.label} returned an invalid session.`);
                this.live.set(newId, result);
                this.clearLoadSuppression(newId);
                return result;
            }
            finally {
                this.pendingNew--;
            }
        }
        return super.call(method, params, timeoutMs);
    }
    beginLoadSuppression(sessionId) {
        this.clearLoadSuppression(sessionId);
        const gen = ++this.loadGen;
        this.loadSuppressions.set(sessionId, { gen });
        return gen;
    }
    armLoadTombstone(sessionId, gen, timeoutMs) {
        const current = this.loadSuppressions.get(sessionId);
        if (!current || current.gen !== gen)
            return;
        if (current.timer !== undefined)
            clearTimeout(current.timer);
        while (this.loadSuppressions.size > MAX_LOAD_TOMBSTONES) {
            let evictKey;
            for (const [key, entry] of this.loadSuppressions) {
                if (key !== sessionId && entry.timer !== undefined) {
                    evictKey = key;
                    break;
                }
            }
            if (evictKey === undefined) {
                for (const key of this.loadSuppressions.keys()) {
                    if (key !== sessionId) {
                        evictKey = key;
                        break;
                    }
                }
            }
            if (evictKey === undefined)
                break;
            this.clearLoadSuppression(evictKey);
        }
        const ttl = Math.min(Math.max(timeoutMs ?? DEFAULT_LOAD_TOMBSTONE_TTL_MS, DEFAULT_LOAD_TOMBSTONE_TTL_MS), MAX_LOAD_TOMBSTONE_TTL_MS);
        const timer = setTimeout(() => {
            this.clearLoadSuppression(sessionId, gen);
        }, ttl);
        timer.unref?.();
        this.loadSuppressions.set(sessionId, { gen, timer });
    }
    clearLoadSuppression(sessionId, expectedGen) {
        const entry = this.loadSuppressions.get(sessionId);
        if (!entry)
            return;
        if (expectedGen !== undefined && entry.gen !== expectedGen)
            return;
        if (entry.timer !== undefined)
            clearTimeout(entry.timer);
        this.loadSuppressions.delete(sessionId);
    }
    clearAllLoadSuppressions() {
        for (const entry of this.loadSuppressions.values()) {
            if (entry.timer !== undefined)
                clearTimeout(entry.timer);
        }
        this.loadSuppressions.clear();
    }
    checkSessionLimit() {
        if (this.live.size + this.loads.size + this.pendingNew >= 30)
            throw new CursorAcpError('ACP_PROCESS_LIMIT', `Too many ${this.label} sessions are active.`);
    }
    assertLoaded(result, sessionId) {
        const id = result?.sessionId;
        if (this.shuttingDown)
            throw new CursorAcpError('ACP_CLOSED', `${this.label} ACP is closed.`);
        if (id !== undefined && id !== sessionId)
            throw new CursorAcpError('ACP_INVALID_SESSION', `${this.label} returned an invalid history session.`);
    }
    lastHistoryMetadata(sessionId) {
        return this.historyMetadata.get(sessionId);
    }
    /** One temporary process, separate from all live sessions (including active prompts). */
    async history(sessionId, cwd) {
        if (this.shuttingDown)
            throw new CursorAcpError('ACP_CLOSED', `${this.label} ACP is closed.`);
        if (this.historyReading)
            throw new CursorAcpError('ACP_PROCESS_LIMIT', `A ${this.label} history read is already in progress.`);
        this.historyReading = true;
        const client = this.makeClient();
        let stopping;
        const stop = () => stopping ??= client.close();
        this.historyStop = stop;
        const updates = [];
        let bytes = 0;
        let count = 0;
        let overflow = false;
        client.onInbound(message => {
            // A history reader has no authority to run tools or wait for user approval.
            if (message.kind === 'request') {
                void (message.method === 'session/request_permission'
                    ? client.respond(message.id, { outcome: { outcome: 'cancelled' } })
                    : client.respondError(message.id, -32601, 'History reader does not support requests.')).catch(() => undefined);
                return;
            }
            if (message.method !== 'session/update' || message.params?.sessionId !== sessionId || overflow)
                return;
            bytes += Buffer.byteLength(JSON.stringify(message));
            count++;
            if (bytes > 8 * 1024 * 1024 || count > 10000) {
                overflow = true;
                void stop().catch(() => undefined);
            }
            else
                updates.push(message);
        });
        try {
            await client.start();
            if (this.shuttingDown)
                throw new CursorAcpError('ACP_CLOSED', `${this.label} ACP is closed.`);
            const result = await client.call('session/load', { sessionId, cwd, mcpServers: [] });
            this.assertLoaded(result, sessionId);
            if (overflow)
                throw new CursorAcpError('ACP_HISTORY_TOO_LARGE', `${this.label} history exceeds the transfer limit.`);
            const [modesRaw, commandsRaw] = await Promise.all([
                client.call('dsh/sessionModes', { sessionId }).catch(() => undefined),
                client.call('dsh/sessionCommands', { sessionId }).catch(() => undefined),
            ]);
            const modes = isRecord(modesRaw) && Array.isArray(modesRaw.availableModes) && modesRaw.availableModes.length > 0
                ? modesRaw
                : undefined;
            const commands = isRecord(commandsRaw) && Array.isArray(commandsRaw.commands) && commandsRaw.commands.length > 0
                ? commandsRaw.commands
                : undefined;
            if (modes !== undefined || commands !== undefined) {
                this.historyMetadata.delete(sessionId);
                this.historyMetadata.set(sessionId, { ...(modes ? { modes } : {}), ...(commands ? { commands } : {}) });
                while (this.historyMetadata.size > MAX_HISTORY_METADATA) {
                    const oldest = this.historyMetadata.keys().next().value;
                    if (oldest === undefined)
                        break;
                    this.historyMetadata.delete(oldest);
                }
            }
            return acpHistoryEvents(updates, sessionId, this.modelLabel);
        }
        catch (error) {
            if (overflow)
                throw new CursorAcpError('ACP_HISTORY_TOO_LARGE', `${this.label} history exceeds the transfer limit.`);
            throw error;
        }
        finally {
            try {
                await stop();
            }
            finally {
                this.historyStop = undefined;
                this.historyReading = false;
            }
        }
    }
    async close() {
        this.shuttingDown = true;
        this.clearAllLoadSuppressions();
        this.historyMetadata.clear();
        await Promise.all([super.close(), this.historyStop?.()]);
        this.live.clear();
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=claude-process.js.map