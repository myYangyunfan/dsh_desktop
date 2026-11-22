const MAX_CACHED_SESSIONS = 32;
const MAX_CACHED_RECORDS_PER_SESSION = 200;
const MAX_ACP_CACHED_EVENTS_PER_SESSION = 10_000;
const MAX_UNARY_PAGES_PER_SESSION = 8;
const MAX_INVALIDATION_KEYS = 256;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cloneStructured(value) {
    if (value === undefined || value === null || typeof value !== 'object')
        return value;
    try {
        return structuredClone(value);
    }
    catch {
        return JSON.parse(JSON.stringify(value));
    }
}
function touchLru(map, key, value, maxEntries) {
    map.delete(key);
    map.set(key, value);
    while (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined)
            break;
        map.delete(oldest);
    }
}
function attachSharedInFlight(entry, signal) {
    if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    }
    entry.waiters += 1;
    return new Promise((resolve, reject) => {
        let finished = false;
        const onAbort = () => {
            if (finished)
                return;
            finished = true;
            entry.waiters = Math.max(0, entry.waiters - 1);
            if (entry.waiters === 0 && !entry.settled) {
                entry.controller.abort(signal?.reason);
            }
            reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        entry.promise.then(value => {
            if (finished)
                return;
            finished = true;
            signal?.removeEventListener('abort', onAbort);
            resolve(cloneStructured(value));
        }, error => {
            if (finished)
                return;
            finished = true;
            signal?.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}
export function extractSessionIdFromGatewayPayload(payload) {
    if (!isRecord(payload))
        return undefined;
    const args = isRecord(payload.args) ? payload.args : payload;
    const request = isRecord(args.request)
        ? args.request
        : isRecord(args._request)
            ? args._request
            : args;
    if (typeof request.sessionId === 'string' && request.sessionId.length > 0)
        return request.sessionId;
    if (typeof request.agentId === 'string' && request.agentId.length > 0)
        return request.agentId;
    if (isRecord(request.address)) {
        const address = request.address;
        if (typeof address.sessionId === 'string' && address.sessionId.length > 0)
            return address.sessionId;
        if (typeof address.childSessionId === 'string' && address.childSessionId.length > 0)
            return address.childSessionId;
    }
    return undefined;
}
export function isSessionMutationEndpoint(endpoint) {
    return endpoint === 'session/prompt'
        || endpoint === 'session/cancel'
        || endpoint === 'session/rename'
        || endpoint === 'session/selectModel'
        || endpoint === 'session/selectPermission'
        || endpoint === 'session/fork'
        || endpoint === 'agentPresets/select'
        || endpoint === 'commands/execute'
        || endpoint === 'workspace/archiveSession';
}
export function canonicalUnaryHistoryKey(endpoint, payload) {
    if (!isRecord(payload))
        return endpoint;
    const args = isRecord(payload.args) ? payload.args : payload;
    const request = isRecord(args.request)
        ? args.request
        : isRecord(args._request)
            ? args._request
            : args;
    return JSON.stringify([
        endpoint,
        typeof request.beforeSeq === 'number' ? request.beforeSeq : null,
        typeof request.throughSeq === 'number' ? request.throughSeq : null,
        typeof request.maxMessages === 'number' ? request.maxMessages : typeof request.limit === 'number' ? request.limit : null,
        request.turnWindow ?? null,
    ]);
}
/**
 * Bounded LRU cache for Native Harness session follow snapshots and unary
 * history/page/projection reads across project and session switches.
 */
export class RemoteSessionHistoryCache {
    sessions = new Map();
    pendingUnary = new Map();
    invalidatedAt = new Map();
    epoch = 0;
    minValidEpoch = 0;
    beginReadEpoch() {
        return ++this.epoch;
    }
    isReadEpochValid(sessionId, readEpoch) {
        return readEpoch > this.minValidEpoch && readEpoch > (this.invalidatedAt.get(sessionId) ?? 0);
    }
    getFollowSnapshot(client, sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry?.snapshot === undefined)
            return undefined;
        touchLru(this.sessions, sessionId, entry, MAX_CACHED_SESSIONS);
        const snapshot = cloneStructured(entry.snapshot);
        const cursor = typeof snapshot.cursor === 'number' ? snapshot.cursor : -1;
        return {
            snapshot: {
                ...snapshot,
                ...(isRecord(snapshot.assistantStream) ? { assistantStream: { ...snapshot.assistantStream, revision: 0 } } : {}),
            },
            sameClient: entry.client === client,
            cursor,
        };
    }
    recordFollowSnapshot(client, sessionId, frame) {
        if (!isRecord(frame) || frame.type !== 'snapshot')
            return;
        const id = sessionId.length > 0
            ? sessionId
            : isRecord(frame.header) && typeof frame.header.id === 'string'
                ? frame.header.id
                : '';
        if (id.length === 0)
            return;
        const existing = this.sessions.get(id) ?? { unary: new Map() };
        const cloned = cloneStructured(frame);
        if (Array.isArray(cloned.records) && cloned.records.length > MAX_CACHED_RECORDS_PER_SESSION) {
            cloned.records = cloned.records.slice(cloned.records.length - MAX_CACHED_RECORDS_PER_SESSION);
            cloned.hasMore = true;
        }
        this.invalidateUnary(id, existing);
        existing.client = client;
        existing.snapshot = cloned;
        touchLru(this.sessions, id, existing, MAX_CACHED_SESSIONS);
    }
    prependBackfilledRecords(client, sessionId, backfilled) {
        const entry = this.sessions.get(sessionId);
        if (entry === undefined || entry.client !== client || entry.snapshot === undefined || !Array.isArray(entry.snapshot.records))
            return;
        const bySeq = new Map();
        for (const item of [...backfilled, ...entry.snapshot.records]) {
            if (isRecord(item) && isRecord(item.event) && typeof item.event.seq === 'number') {
                bySeq.set(item.event.seq, cloneStructured(item));
            }
        }
        const sortedEntries = [...bySeq.entries()].sort((a, b) => a[0] - b[0]);
        const merged = sortedEntries.map(([, item]) => item);
        if (merged.length > MAX_CACHED_RECORDS_PER_SESSION) {
            entry.snapshot.records = merged.slice(merged.length - MAX_CACHED_RECORDS_PER_SESSION);
            entry.snapshot.hasMore = true;
        }
        else {
            entry.snapshot.records = merged;
        }
        const highestSeq = sortedEntries.at(-1)?.[0];
        const currentCursor = typeof entry.snapshot.cursor === 'number' ? entry.snapshot.cursor : -1;
        if (highestSeq !== undefined && highestSeq > currentCursor) {
            entry.snapshot.cursor = highestSeq;
        }
        this.invalidateUnary(sessionId, entry);
    }
    recordFollowFrame(client, sessionId, frame) {
        if (sessionId.length === 0 || !isRecord(frame))
            return;
        const entry = this.sessions.get(sessionId);
        if (entry === undefined || entry.client !== client || entry.snapshot === undefined)
            return;
        if (frame.type === 'event' && isRecord(frame.event) && typeof frame.event.seq === 'number') {
            const seq = frame.event.seq;
            const currentCursor = typeof entry.snapshot.cursor === 'number' ? entry.snapshot.cursor : -1;
            if (seq <= currentCursor)
                return;
            if (seq === currentCursor + 1 && Array.isArray(entry.snapshot.records)) {
                const records = [...entry.snapshot.records, cloneStructured(frame)];
                if (records.length > MAX_CACHED_RECORDS_PER_SESSION) {
                    entry.snapshot.records = records.slice(records.length - MAX_CACHED_RECORDS_PER_SESSION);
                    entry.snapshot.hasMore = true;
                }
                else {
                    entry.snapshot.records = records;
                }
                entry.snapshot.cursor = seq;
                this.invalidateUnary(sessionId, entry);
                touchLru(this.sessions, sessionId, entry, MAX_CACHED_SESSIONS);
            }
            return;
        }
        if (frame.type === 'projection' && typeof frame.key === 'string') {
            const projections = isRecord(entry.snapshot.projections) ? entry.snapshot.projections : undefined;
            if (projections !== undefined && isRecord(projections.values)) {
                projections.values[frame.key] = cloneStructured(frame.value);
                if (typeof frame.seq === 'number' && typeof projections.asOfSeq === 'number' && frame.seq > projections.asOfSeq) {
                    projections.asOfSeq = frame.seq;
                }
            }
            this.invalidateUnary(sessionId, entry);
        }
    }
    invalidateUnary(sessionId, entry) {
        const invalidationEpoch = ++this.epoch;
        this.invalidatedAt.delete(sessionId);
        this.invalidatedAt.set(sessionId, invalidationEpoch);
        while (this.invalidatedAt.size > MAX_INVALIDATION_KEYS) {
            const oldestKey = this.invalidatedAt.keys().next().value;
            if (oldestKey === undefined)
                break;
            const oldestEpoch = this.invalidatedAt.get(oldestKey) ?? 0;
            this.minValidEpoch = Math.max(this.minValidEpoch, oldestEpoch);
            this.invalidatedAt.delete(oldestKey);
        }
        entry?.unary.clear();
        for (const [key, pending] of this.pendingUnary.entries()) {
            if (key.startsWith(`${sessionId}:`)) {
                pending.settled = true;
                this.pendingUnary.delete(key);
            }
        }
    }
    getUnary(client, sessionId, key) {
        const entry = this.sessions.get(sessionId);
        if (entry === undefined || entry.client !== client)
            return undefined;
        const cached = entry.unary.get(key);
        if (cached === undefined || cached.client !== client)
            return undefined;
        touchLru(entry.unary, key, cached, MAX_UNARY_PAGES_PER_SESSION);
        touchLru(this.sessions, sessionId, entry, MAX_CACHED_SESSIONS);
        return cloneStructured(cached.value);
    }
    setUnary(client, sessionId, key, value, readEpoch) {
        if (readEpoch !== undefined && !this.isReadEpochValid(sessionId, readEpoch))
            return;
        const existing = this.sessions.get(sessionId);
        const entry = existing ?? { unary: new Map() };
        if (entry.client !== undefined && entry.client !== client) {
            entry.unary.clear();
        }
        entry.client = client;
        touchLru(entry.unary, key, { client, value: cloneStructured(value) }, MAX_UNARY_PAGES_PER_SESSION);
        touchLru(this.sessions, sessionId, entry, MAX_CACHED_SESSIONS);
    }
    getFallbackUnary(sessionId, endpoint, key, payload) {
        const entry = this.sessions.get(sessionId);
        if (entry === undefined)
            return undefined;
        const exact = entry.unary.get(key);
        if (exact !== undefined)
            return cloneStructured(exact.value);
        if (entry.snapshot === undefined)
            return undefined;
        const snapshot = entry.snapshot;
        if (endpoint === 'session/projections') {
            return snapshot.projections !== undefined ? cloneStructured(snapshot.projections) : undefined;
        }
        if (endpoint === 'session/history' && Array.isArray(snapshot.records)) {
            return {
                records: cloneStructured(snapshot.records),
                hasMore: Boolean(snapshot.hasMore),
                ...(typeof snapshot.cursor === 'number' ? { throughSeq: snapshot.cursor, cursor: snapshot.cursor } : {}),
                ...(snapshot.projections === undefined ? {} : { projections: cloneStructured(snapshot.projections) }),
            };
        }
        if (endpoint === 'session/page') {
            return this.sliceSnapshotRecords(snapshot, payload);
        }
        return undefined;
    }
    slicePageFromSnapshot(client, sessionId, payload) {
        const entry = this.sessions.get(sessionId);
        if (entry === undefined || entry.client !== client || entry.snapshot === undefined)
            return undefined;
        if (entry.snapshot.hasMore === true)
            return undefined;
        return this.sliceSnapshotRecords(entry.snapshot, payload);
    }
    sliceSnapshotRecords(snapshot, payload) {
        if (!Array.isArray(snapshot.records))
            return undefined;
        const args = isRecord(payload) && isRecord(payload.args) ? payload.args : isRecord(payload) ? payload : {};
        const request = isRecord(args.request)
            ? args.request
            : isRecord(args._request)
                ? args._request
                : args;
        if (request.turnWindow !== undefined)
            return undefined;
        const snapshotCursor = typeof snapshot.cursor === 'number' ? snapshot.cursor : -1;
        const throughSeq = typeof request.throughSeq === 'number' ? request.throughSeq : snapshotCursor;
        if (throughSeq > snapshotCursor)
            return undefined;
        const beforeSeq = typeof request.beforeSeq === 'number' ? request.beforeSeq : undefined;
        const endSeq = beforeSeq === undefined ? throughSeq : Math.min(throughSeq, beforeSeq - 1);
        const window = endSeq < 0
            ? []
            : snapshot.records.filter(item => isRecord(item) && isRecord(item.event) && typeof item.event.seq === 'number' && item.event.seq <= endSeq);
        if (throughSeq >= 0 && beforeSeq === undefined && window.length > 0) {
            const tail = window.at(-1);
            if (!isRecord(tail) || !isRecord(tail.event) || tail.event.seq !== throughSeq)
                return undefined;
        }
        const maxMessages = typeof request.maxMessages === 'number' && request.maxMessages > 0
            ? request.maxMessages
            : typeof request.limit === 'number' && request.limit > 0
                ? request.limit
                : undefined;
        const records = maxMessages === undefined
            ? window
            : window.slice(Math.max(0, window.length - maxMessages));
        const hasMore = Boolean(snapshot.hasMore) || window.length > records.length;
        return cloneStructured({
            records,
            hasMore,
            ...(typeof snapshot.cursor === 'number' ? { cursor: snapshot.cursor } : {}),
        });
    }
    runSingleFlightUnary(client, sessionId, key, signal, factory) {
        if (signal.aborted) {
            return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
        }
        const composite = `${sessionId}:${key}`;
        const existing = this.pendingUnary.get(composite);
        if (existing !== undefined && existing.client === client && !existing.settled) {
            return attachSharedInFlight(existing, signal);
        }
        const controller = new AbortController();
        const entry = {
            client,
            controller,
            waiters: 0,
            settled: false,
            promise: Promise.resolve(),
        };
        entry.promise = factory(controller.signal).finally(() => {
            entry.settled = true;
            if (this.pendingUnary.get(composite) === entry) {
                this.pendingUnary.delete(composite);
            }
        });
        void entry.promise.catch(() => undefined);
        this.pendingUnary.set(composite, entry);
        return attachSharedInFlight(entry, signal);
    }
    invalidateSession(sessionId) {
        const invalidationEpoch = ++this.epoch;
        this.invalidatedAt.delete(sessionId);
        this.invalidatedAt.set(sessionId, invalidationEpoch);
        while (this.invalidatedAt.size > MAX_INVALIDATION_KEYS) {
            const oldestKey = this.invalidatedAt.keys().next().value;
            if (oldestKey === undefined)
                break;
            const oldestEpoch = this.invalidatedAt.get(oldestKey) ?? 0;
            this.minValidEpoch = Math.max(this.minValidEpoch, oldestEpoch);
            this.invalidatedAt.delete(oldestKey);
        }
        const entry = this.sessions.get(sessionId);
        if (entry !== undefined) {
            entry.unary.clear();
            entry.snapshot = undefined;
            this.sessions.delete(sessionId);
        }
        for (const [key, pending] of this.pendingUnary.entries()) {
            if (key.startsWith(`${sessionId}:`)) {
                pending.settled = true;
                this.pendingUnary.delete(key);
            }
        }
    }
    clear() {
        this.minValidEpoch = ++this.epoch;
        this.invalidatedAt.clear();
        this.sessions.clear();
        for (const pending of this.pendingUnary.values()) {
            pending.settled = true;
        }
        this.pendingUnary.clear();
    }
}
/**
 * Bounded LRU cache for Codex virtual session history pages across project
 * and session switches on the same remote Host.
 */
export class CodexSessionHistoryCache {
    threads = new Map();
    pendingPages = new Map();
    invalidatedAt = new Map();
    epoch = 0;
    minValidEpoch = 0;
    static pageKey(generation, page) {
        return JSON.stringify([
            generation,
            page.beforeSeq ?? null,
            page.throughSeq ?? null,
            page.maxMessages ?? null,
        ]);
    }
    beginReadEpoch() {
        return ++this.epoch;
    }
    isReadEpochValid(threadId, readEpoch) {
        return readEpoch > this.minValidEpoch && readEpoch > (this.invalidatedAt.get(threadId) ?? 0);
    }
    getFreshPage(threadId, generation, page, knownUpdatedAt) {
        const entry = this.threads.get(threadId);
        if (entry === undefined || entry.stale)
            return undefined;
        if (knownUpdatedAt !== undefined && entry.updatedAt !== undefined && knownUpdatedAt > entry.updatedAt) {
            entry.stale = true;
            return undefined;
        }
        const key = CodexSessionHistoryCache.pageKey(generation, page);
        const cached = entry.pages.get(key);
        if (cached === undefined)
            return undefined;
        touchLru(entry.pages, key, cached, MAX_UNARY_PAGES_PER_SESSION);
        touchLru(this.threads, threadId, entry, MAX_CACHED_SESSIONS);
        return cloneStructured(cached);
    }
    getFreshTailCursor(threadId, generation, knownUpdatedAt) {
        const entry = this.threads.get(threadId);
        if (entry === undefined || entry.stale || entry.tailPage === undefined)
            return undefined;
        if (knownUpdatedAt !== undefined && entry.updatedAt !== undefined && knownUpdatedAt > entry.updatedAt) {
            entry.stale = true;
            return undefined;
        }
        if ((entry.tailPage.header.version === 3 ? 'v3' : 'legacy') !== generation)
            return undefined;
        touchLru(this.threads, threadId, entry, MAX_CACHED_SESSIONS);
        return entry.tailPage.cursor;
    }
    getStalePage(threadId, generation, page) {
        const entry = this.threads.get(threadId);
        if (entry === undefined)
            return undefined;
        const key = CodexSessionHistoryCache.pageKey(generation, page);
        const cached = entry.pages.get(key);
        return cached === undefined ? undefined : cloneStructured(cached);
    }
    setPage(threadId, generation, page, value, knownUpdatedAt, readEpoch) {
        if (readEpoch !== undefined && !this.isReadEpochValid(threadId, readEpoch))
            return;
        const existing = this.threads.get(threadId);
        const entry = existing ?? { stale: false, pages: new Map() };
        if (entry.stale) {
            entry.pages.clear();
            entry.tailPage = undefined;
            entry.stale = false;
        }
        if (knownUpdatedAt !== undefined) {
            entry.updatedAt = knownUpdatedAt;
        }
        const cloned = cloneStructured(value);
        const key = CodexSessionHistoryCache.pageKey(generation, page);
        touchLru(entry.pages, key, cloned, MAX_UNARY_PAGES_PER_SESSION);
        if (page.beforeSeq === undefined && page.throughSeq === undefined) {
            entry.tailPage = cloned;
        }
        touchLru(this.threads, threadId, entry, MAX_CACHED_SESSIONS);
    }
    runSingleFlightPage(threadId, generation, page, signal, factory) {
        if (signal?.aborted) {
            return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
        }
        const composite = `${threadId}:${CodexSessionHistoryCache.pageKey(generation, page)}`;
        const existing = this.pendingPages.get(composite);
        if (existing !== undefined && !existing.settled) {
            return attachSharedInFlight(existing, signal);
        }
        const controller = new AbortController();
        const entry = {
            controller,
            waiters: 0,
            settled: false,
            promise: Promise.resolve(),
        };
        entry.promise = factory(controller.signal).finally(() => {
            entry.settled = true;
            if (this.pendingPages.get(composite) === entry) {
                this.pendingPages.delete(composite);
            }
        });
        void entry.promise.catch(() => undefined);
        this.pendingPages.set(composite, entry);
        return attachSharedInFlight(entry, signal);
    }
    invalidateThread(threadId) {
        const invalidationEpoch = ++this.epoch;
        this.invalidatedAt.delete(threadId);
        this.invalidatedAt.set(threadId, invalidationEpoch);
        while (this.invalidatedAt.size > MAX_INVALIDATION_KEYS) {
            const oldestKey = this.invalidatedAt.keys().next().value;
            if (oldestKey === undefined)
                break;
            const oldestEpoch = this.invalidatedAt.get(oldestKey) ?? 0;
            this.minValidEpoch = Math.max(this.minValidEpoch, oldestEpoch);
            this.invalidatedAt.delete(oldestKey);
        }
        const entry = this.threads.get(threadId);
        if (entry !== undefined) {
            entry.stale = true;
        }
        for (const [key, pending] of this.pendingPages.entries()) {
            if (key.startsWith(`${threadId}:`)) {
                pending.settled = true;
                this.pendingPages.delete(key);
            }
        }
    }
    removeThread(threadId) {
        this.invalidateThread(threadId);
        this.threads.delete(threadId);
    }
    clear() {
        this.minValidEpoch = ++this.epoch;
        this.invalidatedAt.clear();
        this.threads.clear();
        for (const pending of this.pendingPages.values()) {
            pending.settled = true;
        }
        this.pendingPages.clear();
    }
}
/**
 * Bounded LRU cache for ACP virtual session histories (Claude, Hermes,
 * OpenCode, Pi, Antigravity, Cursor) across project switches.
 */
export class AcpSessionHistoryCache {
    sessions = new Map();
    getFresh(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry === undefined || entry.stale || entry.truncated || !entry.hydrated || entry.events.length === 0)
            return undefined;
        touchLru(this.sessions, sessionId, entry, MAX_CACHED_SESSIONS);
        return cloneStructured(entry);
    }
    getStale(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry === undefined)
            return undefined;
        return cloneStructured(entry);
    }
    set(sessionId, value) {
        const cloned = cloneStructured(value);
        if (cloned.events.length > MAX_ACP_CACHED_EVENTS_PER_SESSION) {
            cloned.events = cloned.events.slice(cloned.events.length - MAX_ACP_CACHED_EVENTS_PER_SESSION);
            cloned.truncated = true;
        }
        touchLru(this.sessions, sessionId, cloned, MAX_CACHED_SESSIONS);
    }
    markStale(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry !== undefined) {
            entry.stale = true;
        }
    }
    delete(sessionId) {
        this.sessions.delete(sessionId);
    }
    clear() {
        this.sessions.clear();
    }
}
//# sourceMappingURL=session-history-cache.js.map