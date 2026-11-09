import { uploadRemoteFile } from './remote-file-upload.js';
import { basename, isAbsolute } from 'node:path';
import { downloadRemoteFile } from './remote-file-download.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { RemoteTypertGateway } from './remote-typert-gateway.js';
import { uuidV7 } from './ids.js';
const id = z.string().min(1).max(256);
const MAX_REMOTE_WORKSPACES = 512;
const MAX_REMOTE_SESSIONS = 2048;
const MAX_SESSIONS_PER_WORKSPACE = 2048;
const sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const workspace = z.object({ hostId: id, backend: z.literal('harness'), workspaceId: id }).strict();
const session = workspace.extend({ sessionId: id });
const operationId = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const cursor = z.object({ throughSeq: sequence, beforeSeq: sequence }).strict().refine(value => value.beforeSeq <= value.throughSeq);
export const sessionToolInputs = {
    remote_upload_file: session.extend({ operationId, localPath: z.string().min(1).max(4096).refine(value => isAbsolute(value) && !value.includes('\0')),
        name: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 220 && value !== '.' && value !== '..' && !/[\\/:\x00-\x1f\x7f]/u.test(value)).optional() }),
    remote_download_file: session.extend({ path: z.string().min(1).max(4096).refine(value => !value.includes("\0") && !value.startsWith("/") && !value.includes("\\") && !value.includes(":") && value.split("/").every(part => part !== ".." && part !== "")) }),
    remote_list_sessions: workspace.extend({ offset: sequence.max(100_000).default(0), limit: z.number().int().min(1).max(100).default(30) }),
    remote_read_session: session.extend({ cursor: cursor.optional(), maxMessages: z.number().int().min(1).max(50).default(20) }),
    remote_create_session: workspace.extend({ operationId }),
    remote_send_message: session.extend({ operationId, message: z.string().min(1).max(64 * 1024).refine(value => value.trim().length > 0) }),
    remote_interrupt_session: session.extend({ operationId }),
    remote_wait_sessions: z.object({ targets: z.array(session).min(1).max(8), timeoutMs: z.number().int().min(0).max(60_000).default(30_000) }).strict(),
    remote_get_operation: z.object({ operationId }).strict(),
};
const rowSchema = z.object({
    sessionId: id, title: z.string().optional(), running: z.boolean(), blank: z.boolean(), updatedAt: z.number(),
    parentSessionId: z.string().optional(), origin: z.string().optional(), projections: z.unknown().optional(),
});
const workspaceRow = z.object({ workspaceId: id, path: z.string(), title: z.string(), sessionIds: z.array(id).max(MAX_SESSIONS_PER_WORKSPACE) });
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
export class RemoteSessionToolError extends Error {
}
const fail = (code) => { throw new RemoteSessionToolError(code); };
/** Fixed native operations over the existing carrier. No alternate Harness wire API. */
export class RemoteSessionTools {
    connect;
    // Only hashes, target identifiers and receipts live here; never message bodies.
    // No eviction: dropping an old key would allow an uncertain mutation to replay.
    ledger = new Map();
    generation = 0;
    constructor(connect) {
        this.connect = connect;
    }
    invalidate() { this.generation++; this.ledger.clear(); }
    async run(operation, input, signal) {
        signal.throwIfAborted();
        const generation = this.generation;
        const result = await this.execute(operation, input, signal);
        if (generation !== this.generation)
            fail('REMOTE_AUTHORITY_CHANGED: Inspect the remote state; do not replay mutations.');
        return result;
    }
    async execute(operation, input, signal) {
        switch (operation) {
            case 'remote_upload_file': {
                const args = sessionToolInputs[operation].parse(input);
                const fingerprint = createHash('sha256').update(JSON.stringify([operation, args])).digest('hex');
                const old = this.ledger.get(args.operationId);
                if (old) {
                    if (old.fingerprint !== fingerprint)
                        fail('OPERATION_ID_CONFLICT');
                    return old.pending;
                }
                if (this.ledger.size >= 1024)
                    fail('OPERATION_LIMIT');
                const generation = this.generation;
                const receipt = { ...target(args), sessionId: args.sessionId, operationId: args.operationId, status: 'pending' };
                let uploaderEntered = false;
                const pending = Promise.resolve().then(() => this.connect(args.hostId, signal, async (remote, active) => {
                    const gateway = new RemoteTypertGateway(remote.client);
                    if (!remote.features.remoteGateway)
                        fail('HARNESS_SESSIONS_UNAVAILABLE');
                    await this.requireSession(gateway, args, active);
                    const name = args.name ?? basename(args.localPath);
                    sessionToolInputs.remote_upload_file.parse({ ...args, name });
                    uploaderEntered = true;
                    return uploadRemoteFile(remote.client, args.sessionId, args.localPath, name, active, () => {
                        if (generation !== this.generation)
                            fail('REMOTE_AUTHORITY_CHANGED');
                    });
                })).then(result => Object.assign(receipt, result), () => {
                    // Before the uploader is entered, no upload RPC can have been sent.
                    // Once entered, cleanup/transport failures may hide a publication.
                    receipt.status = uploaderEntered ? 'unknown' : 'rejected';
                    return receipt;
                });
                this.ledger.set(args.operationId, { fingerprint, receipt, pending });
                return pending;
            }
            case 'remote_download_file': {
                const args = sessionToolInputs[operation].parse(input);
                const generation = this.generation;
                return this.onHost(args, signal, async (gateway, active) => {
                    await this.requireSession(gateway, args, active);
                    return downloadRemoteFile(gateway, args.sessionId, args.path, active, () => {
                        if (generation !== this.generation)
                            fail('REMOTE_AUTHORITY_CHANGED');
                    });
                });
            }
            case 'remote_get_operation': {
                const args = sessionToolInputs[operation].parse(input);
                return this.ledger.get(args.operationId)?.receipt ?? { operationId: args.operationId, status: 'not_found',
                    warning: 'No receipt in this runtime. This does not prove the operation was not executed. Inspect the remote session before sending again.' };
            }
            case 'remote_list_sessions': {
                const args = sessionToolInputs[operation].parse(input);
                return this.onHost(args, signal, async (gateway, active) => {
                    const rows = await this.catalog(gateway, args, active);
                    const sorted = rows.sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId));
                    const items = sorted.slice(args.offset, args.offset + args.limit).map(summary);
                    return { ...target(args), sessions: items,
                        nextOffset: args.offset + items.length < sorted.length ? args.offset + items.length : null };
                });
            }
            case 'remote_read_session': {
                const args = sessionToolInputs[operation].parse(input);
                return this.onHost(args, signal, async (gateway, active) => {
                    const row = await this.requireSession(gateway, args, active);
                    const page = args.cursor === undefined
                        ? await first(gateway, 'session/follow', { request: { address: address(args.sessionId), maxMessages: args.maxMessages } }, active)
                        : record(await gateway.invoke({ namespace: 'session', method: 'page', args: { request: {
                                    address: address(args.sessionId), ...args.cursor, maxMessages: args.maxMessages,
                                } }, signal: active }));
                    const throughSeq = args.cursor?.throughSeq ?? page.cursor;
                    if (args.cursor === undefined && page.type !== 'snapshot')
                        fail('INVALID_SESSION_SNAPSHOT');
                    const records = historyRecords(page);
                    if (args.cursor && records.some(row => Number(record(row.event).seq) >= args.cursor.beforeSeq))
                        fail('INVALID_HISTORY_PAGE');
                    const state = new ObservedState(row);
                    if (args.cursor === undefined)
                        state.snapshot(page);
                    return { ...target(args), sessionId: args.sessionId, status: state.status,
                        ...boundedHistory(records, page.hasMore === true, throughSeq) };
                });
            }
            case 'remote_wait_sessions': return this.wait(sessionToolInputs[operation].parse(input), signal);
            case 'remote_create_session': return this.mutate(operation, sessionToolInputs[operation].parse(input), signal);
            case 'remote_send_message': return this.mutate(operation, sessionToolInputs[operation].parse(input), signal);
            case 'remote_interrupt_session': return this.mutate(operation, sessionToolInputs[operation].parse(input), signal);
        }
    }
    onHost(args, signal, query) {
        return this.connect(args.hostId, signal, (remote, active) => {
            if (!remote.features.remoteGateway)
                fail('HARNESS_SESSIONS_UNAVAILABLE');
            return query(new RemoteTypertGateway(remote.client), active);
        });
    }
    async requireWorkspace(gateway, args, signal) {
        const baseline = await first(gateway, 'workspace/follow', {}, signal);
        if (baseline.type !== 'baseline')
            fail('INVALID_WORKSPACE_BASELINE');
        const rows = z.array(workspaceRow).max(MAX_REMOTE_WORKSPACES).parse(record(baseline.value).items);
        const found = rows.find(row => row.workspaceId === args.workspaceId);
        if (!found)
            fail('WORKSPACE_NOT_FOUND');
        return found;
    }
    async catalog(gateway, args, signal) {
        const found = await this.requireWorkspace(gateway, args, signal);
        const response = record(await gateway.invoke({ namespace: 'session', method: 'list', args: { _request: {} }, signal }));
        // The Host catalogue covers the whole account while one workspace owns a
        // small slice of it, so the row bound must apply after workspace ownership
        // and the subagent filter: bound-then-filter rejects a large account
        // outright (measured 5 431 rows against a 2 048 bound) instead of listing
        // the handful of sessions this workspace actually owns.
        const rows = z.array(rowSchema).parse(response.items);
        const allowed = new Set(found.sessionIds);
        // Workspace ownership comes from the official catalog, never a guessed cwd.
        const owned = rows.filter(row => allowed.has(row.sessionId) && row.parentSessionId === undefined && row.origin !== 'subagent');
        return owned.length > MAX_REMOTE_SESSIONS ? owned.slice(0, MAX_REMOTE_SESSIONS) : owned;
    }
    async requireSession(gateway, args, signal) {
        const row = (await this.catalog(gateway, args, signal)).find(row => row.sessionId === args.sessionId);
        if (!row)
            fail('SESSION_NOT_IN_WORKSPACE');
        return row;
    }
    async mutate(operation, args, signal) {
        const fingerprint = createHash('sha256').update(JSON.stringify([operation, args.hostId, args.backend,
            args.workspaceId, args.sessionId ?? null, args.message ?? null])).digest('hex');
        const old = this.ledger.get(args.operationId);
        if (old) {
            if (old.fingerprint !== fingerprint)
                fail('OPERATION_ID_CONFLICT');
            return old.pending;
        }
        if (this.ledger.size >= 512)
            fail('OPERATION_RECEIPT_LIMIT');
        const receipt = { ...target(args), operationId: args.operationId, status: 'pending',
            ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
            ...(operation === 'remote_send_message' ? { requestId: uuidV7() } : {}) };
        let dispatched = false;
        // Defer preflight so the entry exists before any concurrent caller can enter.
        const entry = { fingerprint, receipt, pending: undefined };
        entry.pending = Promise.resolve().then(async () => {
            try {
                await this.onHost(args, signal, async (gateway, active) => {
                    if (operation === 'remote_create_session')
                        await this.requireWorkspace(gateway, args, active);
                    else
                        await this.requireSession(gateway, args, active);
                    active.throwIfAborted();
                    const endpoint = operation === 'remote_create_session' ? 'session/create'
                        : operation === 'remote_send_message' ? 'session/prompt' : 'session/cancel';
                    const request = operation === 'remote_create_session' ? { workspaceId: args.workspaceId }
                        : operation === 'remote_send_message' ? { sessionId: args.sessionId, requestId: receipt.requestId,
                            mode: 'queue', content: [{ type: 'text', text: args.message }] }
                            : { sessionId: args.sessionId };
                    dispatched = true;
                    const result = await gateway.dispatch(endpoint, { args: { request } }, active);
                    if (!result.ok) {
                        entry.receipt = { ...receipt, status: 'rejected' };
                        return;
                    }
                    const value = record(result.value);
                    if (operation === 'remote_create_session') {
                        const sessionId = id.parse(value.sessionId);
                        entry.receipt = { ...receipt, sessionId, status: 'accepted' };
                    }
                    else if (operation === 'remote_interrupt_session' && value.accepted !== true) {
                        entry.receipt = { ...receipt, status: 'unknown' };
                    }
                    else
                        entry.receipt = { ...receipt, status: 'accepted' };
                });
            }
            catch {
                if (!dispatched) {
                    // Safe to retry only when no mutation reached the carrier.
                    if (this.ledger.get(args.operationId) === entry)
                        this.ledger.delete(args.operationId);
                    fail('REMOTE_PREFLIGHT_FAILED: No mutation was dispatched. Check login and target identifiers.');
                }
                // Preserve a confirmed reply even if carrier cleanup fails afterwards.
                if (entry.receipt.status === 'pending')
                    entry.receipt = { ...receipt, status: 'unknown' };
            }
            return entry.receipt;
        });
        this.ledger.set(args.operationId, entry);
        return entry.pending;
    }
    async wait(args, signal) {
        const keys = args.targets.map(item => JSON.stringify(item));
        if (new Set(keys).size !== keys.length)
            fail('DUPLICATE_WAIT_TARGET');
        const stop = new AbortController();
        const active = AbortSignal.any([signal, stop.signal]);
        const states = args.targets.map(item => ({ ...item, status: 'unknown' }));
        let timedOut = false;
        // A zero timeout is an immediate snapshot, not a zero-budget connection attempt.
        let timer;
        if (args.timeoutMs > 0)
            timer = setTimeout(() => { timedOut = true; stop.abort(); }, args.timeoutMs);
        const workers = args.targets.map(async (item, index) => {
            try {
                await this.onHost(item, active, async (gateway, current) => {
                    const row = await this.requireSession(gateway, item, current);
                    const source = await gateway.open('session/follow', { args: { request: { address: address(item.sessionId), maxMessages: 20 } } }, current);
                    const iterator = source[Symbol.asyncIterator]();
                    try {
                        const observed = new ObservedState(row);
                        const snapshot = await iterator.next();
                        if (snapshot.done || record(snapshot.value).type !== 'snapshot')
                            fail('INVALID_SESSION_SNAPSHOT');
                        observed.snapshot(record(snapshot.value));
                        states[index].status = observed.status;
                        if (args.timeoutMs === 0 || observed.status !== 'running')
                            return;
                        while (!current.aborted) {
                            const next = await iterator.next();
                            if (next.done) {
                                current.throwIfAborted();
                                fail('SESSION_STREAM_CLOSED');
                            }
                            observed.frame(record(next.value));
                            states[index].status = observed.status;
                            if (observed.status !== 'running')
                                return;
                        }
                        current.throwIfAborted();
                    }
                    finally {
                        await iterator.return?.();
                    }
                });
            }
            catch {
                if (!active.aborted)
                    states[index].status = 'unavailable';
            }
        });
        try {
            if (args.timeoutMs === 0)
                await Promise.all(workers);
            else
                await Promise.race(workers);
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            stop.abort();
            await Promise.allSettled(workers);
        }
        signal.throwIfAborted();
        return { sessions: states, timedOut };
    }
}
function target(args) {
    return { hostId: args.hostId, backend: 'harness', workspaceId: args.workspaceId };
}
function address(sessionId) { return { kind: 'session', sessionId }; }
function summary(row) {
    return { sessionId: row.sessionId, title: (row.title ?? '').slice(0, 500), running: row.running, blank: row.blank, updatedAt: row.updatedAt };
}
async function first(gateway, endpoint, args, signal) {
    const stop = new AbortController();
    const source = await gateway.open(endpoint, { args }, AbortSignal.any([signal, stop.signal]));
    const iterator = source[Symbol.asyncIterator]();
    try {
        const next = await iterator.next();
        signal.throwIfAborted();
        if (next.done)
            fail('REMOTE_STREAM_CLOSED');
        return record(next.value);
    }
    finally {
        stop.abort();
        await iterator.return?.();
    }
}
function historyRecords(page) {
    if (!Array.isArray(page.records) || typeof page.hasMore !== 'boolean')
        fail('INVALID_HISTORY_PAGE');
    return page.records.map(value => {
        const row = record(value), event = record(row.event);
        if (!['event', 'chunks'].includes(String(row.type)) || !Number.isSafeInteger(event.seq)
            || Number(event.seq) < 0 || typeof event.type !== 'string')
            fail('INVALID_HISTORY_RECORD');
        return row;
    });
}
function boundedHistory(records, hasMore, throughSeq) {
    if (!Number.isSafeInteger(throughSeq) || Number(throughSeq) < -1)
        fail('INVALID_HISTORY_CURSOR');
    if (records.some(row => Number(record(row.event).seq) > Number(throughSeq)))
        fail('INVALID_HISTORY_CURSOR');
    const selected = [];
    let budget = 48_000;
    for (const row of [...records].reverse()) {
        const event = record(row.event), json = JSON.stringify(row);
        if (selected.length > 0 && json.length > budget)
            break;
        const text = json.slice(0, Math.min(budget, 16_000));
        selected.unshift({ seq: Number(event.seq), type: String(event.type), json: text, truncated: text.length < json.length });
        budget -= text.length;
        if (budget <= 0)
            break;
    }
    const more = hasMore || selected.length < records.length;
    if (more && selected.length === 0)
        fail('INVALID_HISTORY_PAGE');
    const beforeSeq = selected.length === 0 ? undefined : Math.min(...selected.map(row => row.seq));
    if (more && beforeSeq === 0)
        fail('INVALID_HISTORY_PAGE');
    return { records: selected, hasMore: more,
        nextCursor: more && beforeSeq !== undefined && beforeSeq > 0 ? { throughSeq, beforeSeq } : null };
}
/** Status is execution state, never a claim that the user's objective is complete. */
class ObservedState {
    status;
    running;
    queued = false;
    failed = false;
    approvals = new Set();
    questions = new Set();
    constructor(row) { this.running = row.running; this.status = row.running ? 'running' : 'idle'; this.projection('inbox', record(record(row.projections).values).inbox); }
    snapshot(value) {
        // The snapshot is newer than preflight catalog lookup. Its latest native
        // lifecycle event resolves a turn starting/ending between those requests.
        for (const row of historyRecords(value))
            this.event(record(row.event), true);
        const values = record(record(value.projections).values);
        if ('inbox' in values)
            this.projection('inbox', values.inbox);
        this.update();
    }
    frame(value) {
        if (value.type === 'event' || value.type === 'chunks')
            this.event(record(value.event), true);
        else if (value.type === 'projection' && typeof value.key === 'string')
            this.projection(value.key, value.value);
        this.update();
    }
    event(event, live) {
        const data = record(event.data), id = typeof data.id === 'string' ? data.id : undefined;
        if (event.type === 'turn/start') {
            this.failed = false;
            this.approvals.clear();
            this.questions.clear();
            if (live) {
                this.running = true;
                this.queued = false;
            }
        }
        if (event.type === 'turn/end') {
            this.failed = [data.reason, record(data.reason).kind].some(reason => reason === 'error' || reason === 'failed');
            this.approvals.clear();
            this.questions.clear();
            if (live)
                this.running = false;
        }
        if (event.type === 'approval/asked' && id)
            this.approvals.add(id);
        if (event.type === 'approval/decided' && id)
            this.approvals.delete(id);
        const callId = record(record(data.message).source).callId ?? data.callId ?? data.id;
        if (event.type === 'tool/call' && (data.name ?? data.toolName) === 'ask_user_question' && typeof callId === 'string')
            this.questions.add(callId);
        if (event.type === 'tool/result' && typeof callId === 'string')
            this.questions.delete(callId);
    }
    projection(key, value) {
        if (key === 'inbox')
            this.queued = Array.isArray(record(value)['next-turn']) && record(value)['next-turn'].length > 0;
        this.update();
    }
    update() {
        this.status = this.running && (this.approvals.size > 0 || this.questions.size > 0) ? 'needs_user_input'
            : this.running || this.queued ? 'running' : this.failed ? 'failed' : 'idle';
    }
}
//# sourceMappingURL=remote-session-tools.js.map