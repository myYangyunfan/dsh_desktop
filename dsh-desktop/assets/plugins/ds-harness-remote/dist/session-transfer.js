import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { z } from 'zod';
import { RpcError } from './safe-error.js';
const pack = promisify(gzip);
const unpack = promisify(gunzip);
const transferVersion = 1;
const maxBytes = 8 * 1024 * 1024;
const chunkBytes = 256 * 1024;
const lifetime = 5 * 60_000;
const id = z.string().min(1).max(128);
const requestId = id.regex(/^[A-Za-z0-9._:-]+$/);
const offset = z.number().int().min(0).max(maxBytes);
const scope = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('session'), sessionId: id }),
    z.strictObject({ kind: z.literal('workspace'), workspaceId: id }),
]);
const locator = { batchId: requestId, requestId };
const event = z.looseObject({ seq: z.number().int().nonnegative(), type: z.string(), time: z.number(), data: z.unknown() });
const history = z.strictObject({
    formatVersion: z.literal(transferVersion),
    version: z.number().int().positive(),
    createdAt: z.number().int().nonnegative(),
    inheritedEventCount: z.number().int().nonnegative(),
    events: z.array(event).min(1).max(50_000),
});
function fail(code, message) {
    throw new RpcError(code, message);
}
export class SessionTransferHost {
    services;
    commits = new Map();
    constructor(services) {
        this.services = services;
    }
    peer(deviceId) {
        return new SessionTransferPeer(this.services, this.commits, deviceId);
    }
}
export class SessionTransferPeer {
    services;
    commits;
    deviceId;
    outgoing;
    incoming;
    expiry;
    closed = false;
    busy = false;
    constructor(services, commits, deviceId) {
        this.services = services;
        this.commits = commits;
        this.deviceId = deviceId;
    }
    capabilities() {
        const { query, persistence, workspaces, sessions } = this.services();
        return [
            ...(query && workspaces ? ['session.transfer.export.v1'] : []),
            ...(persistence && workspaces && sessions ? ['session.transfer.import.v1'] : []),
        ];
    }
    close() {
        this.closed = true;
        this.reset();
    }
    reset() {
        clearTimeout(this.expiry);
        this.outgoing = undefined;
        this.incoming = undefined;
    }
    async call(method, params) {
        if (this.closed)
            fail('FEATURE_NOT_SUPPORTED', 'Session transfer is unavailable.');
        if (this.busy)
            fail('RATE_LIMITED', 'A session transfer request is already in progress.');
        this.busy = true;
        clearTimeout(this.expiry);
        try {
            return await this.invoke(method, params);
        }
        finally {
            this.busy = false;
            if (this.closed)
                this.reset();
            else if (this.outgoing || this.incoming)
                this.expiry = setTimeout(() => this.reset(), lifetime).unref();
        }
    }
    workspace(workspaceId) {
        return this.services().workspaces?.get(workspaceId)
            ?? fail('SESSION_TRANSFER_WORKSPACE_UNAVAILABLE', 'The workspace is unavailable.');
    }
    async snapshot(sessionId) {
        const query = this.services().query
            ?? fail('FEATURE_NOT_SUPPORTED', 'Session export is unavailable.');
        try {
            return await query.readSession(sessionId);
        }
        catch {
            return fail('SESSION_TRANSFER_READ_FAILED', 'The session history could not be read.');
        }
    }
    async invoke(method, params) {
        const handleParams = { handle: z.uuid() };
        switch (method) {
            case 'session.transfer.export.open': {
                if (this.outgoing)
                    fail('RATE_LIMITED', 'An export is already open.');
                const { scope: selection } = z.strictObject({ scope }).parse(params);
                const ids = selection.kind === 'session' ? [selection.sessionId] : [...this.workspace(selection.workspaceId).sessionIds];
                if (ids.length > 2048)
                    fail('SESSION_TRANSFER_LIMIT', 'Too many sessions in this export.');
                const sessions = new Map();
                for (const sessionId of ids) {
                    if (this.closed)
                        fail('SESSION_TRANSFER_CLOSED', 'The connection closed.');
                    const snapshot = await this.snapshot(sessionId);
                    if (snapshot.session.origin === 'subagent') {
                        if (selection.kind === 'session')
                            fail('FEATURE_NOT_SUPPORTED', 'Subagent export is unavailable.');
                        continue;
                    }
                    let throughSeq = snapshot.events.length - 1;
                    while (throughSeq >= 0 && snapshot.events[throughSeq]?.type !== 'turn/end')
                        throughSeq -= 1;
                    if (throughSeq >= 0 && snapshot.events[throughSeq + 1]?.type === 'session/end-seed')
                        throughSeq += 1;
                    while (throughSeq >= 0 && snapshot.events[throughSeq + 1]?.type === 'session/title')
                        throughSeq += 1;
                    if (throughSeq < 0 || snapshot.inheritedEventCount > throughSeq + 1) {
                        if (selection.kind === 'session')
                            fail('SESSION_TRANSFER_EMPTY', 'The session has no completed history to transfer.');
                        continue;
                    }
                    sessions.set(sessionId, { throughSeq, inheritedEventCount: snapshot.inheritedEventCount });
                }
                const handle = randomUUID();
                this.outgoing = { handle, sessions };
                return { handle, sessions: [...sessions].map(([sessionId, { throughSeq }]) => ({ sessionId, throughSeq })), chunkBytes };
            }
            case 'session.transfer.export.read': {
                const input = z.strictObject({ ...handleParams, sessionId: id, offset }).parse(params);
                const state = this.exportState(input.handle);
                const boundary = state.sessions.get(input.sessionId)
                    ?? fail('INVALID_PARAMS', 'The session is outside this export.');
                if (state.packed?.sessionId !== input.sessionId) {
                    if (input.offset !== 0)
                        fail('INVALID_PARAMS', 'Start reading each session at offset zero.');
                    const snapshot = await this.snapshot(input.sessionId);
                    const events = snapshot.events.slice(0, boundary.throughSeq + 1);
                    if (events.length !== boundary.throughSeq + 1 || events.length > 50_000) {
                        fail('SESSION_TRANSFER_LIMIT', 'The selected history is unavailable or too large.');
                    }
                    const json = Buffer.from(JSON.stringify({
                        formatVersion: transferVersion, version: snapshot.session.version, createdAt: snapshot.session.createdAt,
                        inheritedEventCount: boundary.inheritedEventCount, events,
                    }));
                    if (json.length > maxBytes)
                        fail('SESSION_TRANSFER_LIMIT', 'The session history is too large.');
                    const data = await pack(json);
                    if (data.length > maxBytes)
                        fail('SESSION_TRANSFER_LIMIT', 'The compressed history is too large.');
                    state.packed = { sessionId: input.sessionId, data, sha256: createHash('sha256').update(data).digest('hex') };
                }
                const { data, sha256 } = state.packed;
                if (input.offset >= data.length)
                    fail('INVALID_PARAMS', 'The offset is outside the session history.');
                const chunk = data.subarray(input.offset, input.offset + chunkBytes);
                return {
                    offset: input.offset, data: chunk.toString('base64'),
                    ...(input.offset + chunk.length === data.length ? { totalBytes: data.length, sha256 } : {}),
                };
            }
            case 'session.transfer.export.close': {
                this.exportState(z.strictObject(handleParams).parse(params).handle);
                this.outgoing = undefined;
                return {};
            }
            case 'session.transfer.import.open': {
                const input = z.strictObject({
                    workspaceId: id, batchId: requestId, sourceSessionId: id, formatVersion: z.literal(transferVersion),
                }).parse(params);
                if (!this.capabilities().includes('session.transfer.import.v1'))
                    fail('FEATURE_NOT_SUPPORTED', 'Session import is unavailable.');
                if (this.incoming)
                    fail('RATE_LIMITED', 'An import is already open.');
                this.workspace(input.workspaceId);
                const handle = randomUUID();
                this.incoming = { ...input, handle, received: 0, chunks: [] };
                return { handle, chunkBytes, maxBytes };
            }
            case 'session.transfer.import.chunk': {
                const input = z.strictObject({
                    ...handleParams, offset, data: z.string().min(4).max(Math.ceil(chunkBytes / 3) * 4),
                }).parse(params);
                const state = this.importState(input.handle);
                const chunk = Buffer.from(input.data, 'base64');
                if (input.offset !== state.received || chunk.length > chunkBytes || chunk.toString('base64') !== input.data) {
                    fail('INVALID_PARAMS', 'Invalid or out-of-order import chunk.');
                }
                if (state.received + chunk.length > maxBytes || state.chunks.length >= 128) {
                    fail('SESSION_TRANSFER_LIMIT', 'The session upload exceeds its limit.');
                }
                state.chunks.push(chunk);
                state.received += chunk.length;
                return { receivedBytes: state.received };
            }
            case 'session.transfer.import.commit': {
                const input = z.strictObject({
                    ...handleParams, requestId, totalBytes: offset.min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/),
                }).parse(params);
                const state = this.importState(input.handle);
                const data = Buffer.concat(state.chunks, state.received);
                if (state.received !== input.totalBytes || createHash('sha256').update(data).digest('hex') !== input.sha256) {
                    fail('INVALID_PARAMS', 'The imported data does not match its size or digest.');
                }
                const key = this.commitKey(state.batchId, input.requestId);
                const fingerprint = JSON.stringify([state.workspaceId, state.sourceSessionId, input.sha256]);
                for (const [entry, commit] of this.commits)
                    if (commit.expires <= Date.now())
                        this.commits.delete(entry);
                const previous = this.commits.get(key);
                if (previous) {
                    if (previous.fingerprint !== fingerprint)
                        fail('INVALID_PARAMS', 'The request ID was used for another import.');
                    this.incoming = undefined;
                    return previous.result;
                }
                if (this.commits.size >= 1024)
                    fail('RATE_LIMITED', 'Too many recent session imports.');
                this.incoming = undefined;
                const result = this.write(state.workspaceId, data);
                const commit = { fingerprint, result, expires: Infinity };
                this.commits.set(key, commit);
                try {
                    return await result;
                }
                finally {
                    commit.expires = Date.now() + lifetime;
                }
            }
            case 'session.transfer.import.status': {
                const input = z.strictObject(locator).parse(params);
                const commit = this.commits.get(this.commitKey(input.batchId, input.requestId));
                return !commit || commit.expires <= Date.now() ? { status: 'unknown' } : { status: 'completed', ...await commit.result };
            }
            case 'session.transfer.import.abort': {
                this.importState(z.strictObject(handleParams).parse(params).handle);
                this.incoming = undefined;
                return {};
            }
            default: return fail('METHOD_NOT_FOUND', 'The requested method does not exist.');
        }
    }
    exportState(handle) {
        if (this.outgoing?.handle !== handle)
            fail('INVALID_PARAMS', 'The export handle is unavailable.');
        return this.outgoing;
    }
    importState(handle) {
        if (this.incoming?.handle !== handle)
            fail('INVALID_PARAMS', 'The import handle is unavailable.');
        return this.incoming;
    }
    commitKey(batchId, request) {
        return JSON.stringify([this.deviceId, batchId, request]);
    }
    async write(workspaceId, data) {
        const { persistence, sessions } = this.services();
        if (!persistence || !sessions)
            fail('FEATURE_NOT_SUPPORTED', 'Session import is unavailable.');
        let source;
        try {
            const raw = await unpack(data, { maxOutputLength: maxBytes });
            source = history.parse(JSON.parse(raw.toString('utf8')));
            if (source.inheritedEventCount > source.events.length
                || !source.events.some(item => item.type === 'turn/end')
                || !['turn/end', 'session/end-seed', 'session/title'].includes(source.events.at(-1)?.type ?? '')
                || source.events.some((item, index) => item.seq !== index))
                throw new Error();
        }
        catch {
            return fail('SESSION_TRANSFER_INVALID_HISTORY', 'The session history is invalid or unsupported.');
        }
        const cwd = this.workspace(workspaceId).path;
        if (!(await stat(cwd).catch(() => undefined))?.isDirectory() || this.workspace(workspaceId).path !== cwd) {
            fail('SESSION_TRANSFER_WORKSPACE_UNAVAILABLE', 'The target workspace directory is unavailable.');
        }
        const sessionId = `session-${randomUUID()}`;
        const { inheritedEventCount } = source;
        const events = source.events.map(item => {
            // Harness replays directory changes over the header when restoring a session.
            if (item.type === 'working-directory/change')
                return { ...item, data: { cwd } };
            if (item.type === 'plugin:worktree/created' || item.type === 'plugin:client-ui-forge/worktree') {
                // Keep event references and the inherited prefix intact without transferring checkout ownership.
                return { seq: item.seq, time: item.time, type: 'plugin:ds-harness-remote/omitted-worktree', ignorable: true, data: {} };
            }
            return item;
        });
        let header;
        try {
            header = sessions.prepare(sessionId, {
                seed: events, inheritedEventCount,
                meta: { createdAt: source.createdAt, cwd, isSeeded: inheritedEventCount > 0 },
            }).header;
            if (header.version !== source.version)
                throw new Error();
        }
        catch {
            return fail('SESSION_TRANSFER_INVALID_HISTORY', 'Harness rejected the imported history.');
        }
        try {
            const handle = await persistence.create(header, { inheritedEventCount });
            try {
                await handle.append(events);
                await handle.flush();
            }
            finally {
                await handle.close();
            }
        }
        catch {
            return fail('SESSION_TRANSFER_WRITE_FAILED', 'The target could not persist the session.');
        }
        try {
            const workspace = this.workspace(workspaceId);
            if (workspace.path !== cwd)
                return { sessionId, workspaceAttached: false };
            await workspace.attachSession(sessionId);
            return { sessionId, workspaceAttached: true };
        }
        catch {
            return { sessionId, workspaceAttached: false };
        }
    }
}
//# sourceMappingURL=session-transfer.js.map