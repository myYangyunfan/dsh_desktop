import { Buffer } from 'node:buffer';
import { CursorAcpClient, CursorAcpError } from './cursor-process.js';
import { claudeHistoryEvents } from './claude-history.js';
/** Host-local authentication; no interactive login or filesystem transcript reads.
 *
 * Also the standard-ACP client shape used by other pre-authenticated backends (Hermes):
 * one process per live session, a separate reader for history replay, and load-replay
 * suppression so a replayed transcript never mixes into a live turn's stream.
 */
export class ClaudeAcpClient extends CursorAcpClient {
    live = new Map();
    loads = new Map();
    pendingNew = 0;
    historyStop;
    historyReading = false;
    shuttingDown = false;
    makeClient;
    constructor(binary = 'claude-agent-acp', logger, spawnAcp, options = {}, backend = 'claude') {
        const config = { ...options, args: options.args ?? [], authenticationMethod: null, modelBackend: backend };
        super(binary, logger, spawnAcp, config);
        this.makeClient = () => new CursorAcpClient(binary, logger, spawnAcp, config);
        this.modelLabel = backend;
        super.onUnavailable(() => this.live.clear());
    }
    /** History events and model catalogs are labelled with the backend that produced them. */
    modelLabel;
    get label() { return this.modelLabel === 'hermes' ? 'Hermes' : 'Claude'; }
    onInbound(handler) {
        return super.onInbound(message => {
            const id = message.params?.sessionId;
            // First load also replays: history belongs exclusively to history(), never live streams.
            if (message.kind === 'notification' && message.method === 'session/update' && id && this.loads.has(id))
                return;
            handler(message);
        });
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
            // Defer the actual call until the suppression/deduplication guard is installed.
            const load = Promise.resolve().then(() => super.call(method, params, timeoutMs)).then(result => {
                this.assertLoaded(result, id);
                this.live.set(id, result);
                return result;
            });
            this.loads.set(id, load);
            try {
                return await load;
            }
            finally {
                this.loads.delete(id);
            }
        }
        if (method === 'session/new') {
            this.checkSessionLimit();
            this.pendingNew++;
            try {
                const result = await super.call(method, params, timeoutMs);
                const newId = result?.sessionId;
                if (typeof newId !== 'string' || this.shuttingDown)
                    throw new CursorAcpError('ACP_INVALID_SESSION', `${this.label} returned an invalid session.`);
                this.live.set(newId, result);
                return result;
            }
            finally {
                this.pendingNew--;
            }
        }
        return super.call(method, params, timeoutMs);
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
            return claudeHistoryEvents(updates, sessionId, this.modelLabel);
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
        await Promise.all([super.close(), this.historyStop?.()]);
        this.live.clear();
    }
}
//# sourceMappingURL=claude-process.js.map