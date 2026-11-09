import { randomUUID } from 'node:crypto';
import { RpcError } from '../safe-error.js';
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
const details = new WeakMap();
const MAX_CACHE = 16 * 1024 * 1024;
const size = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');
/** Ephemeral read-only detail handles are bound to one authenticated peer, never written to disk. */
export async function previewCall(peer, input, invoke) {
    const call = object(input), params = object(call.params);
    if (call.method === 'dsh/historyDetail') {
        if (Object.keys(call).some(k => !['method', 'params'].includes(k)) || Object.keys(params).some(k => !['threadId', 'detailId'].includes(k))
            || typeof params.threadId !== 'string' || typeof params.detailId !== 'string')
            throw new RpcError('INVALID_MESSAGE', 'Invalid history detail request.');
        const detail = details.get(peer)?.get(params.detailId);
        if (!detail || detail.threadId !== params.threadId || detail.until < Date.now())
            throw new RpcError('HISTORY_DETAIL_EXPIRED', 'Tool details expired. Reopen the conversation and try again.');
        await invoke({ method: 'thread/read', params: { threadId: detail.threadId, includeTurns: false } });
        return detail.record;
    }
    if (call.previewHistory !== true)
        return invoke(input);
    if (call.method !== 'dsh/sessionHistory' || Object.keys(call).some(k => !['method', 'params', 'previewHistory'].includes(k)))
        throw new RpcError('INVALID_MESSAGE', 'History preview is read-only.');
    const result = object(await invoke({ method: call.method, params: call.params }));
    if (!Array.isArray(result.records) || typeof params.threadId !== 'string')
        return result;
    let cache = details.get(peer);
    if (!cache)
        details.set(peer, cache = new Map());
    for (const [id, value] of cache)
        if (value.until < Date.now())
            cache.delete(id);
    // Stage the whole page before evicting anything. Every returned handle must
    // fit together; otherwise let the client retry through bounded transfer.
    const pending = new Map();
    let pendingBytes = 0;
    const records = result.records.map(raw => {
        const record = object(raw), event = object(record.event), data = object(event.data);
        if (event.type !== 'tool/result' || size(record) < 4096)
            return raw;
        const bytes = size(record);
        if (bytes > MAX_CACHE)
            return raw;
        if (pending.size >= 64 || pendingBytes + bytes > MAX_CACHE) {
            throw new RpcError('RESPONSE_TOO_LARGE', 'History requires chunked transfer.');
        }
        const id = randomUUID();
        pending.set(id, { threadId: params.threadId, record: raw, bytes, until: Date.now() + 10 * 60_000 });
        pendingBytes += bytes;
        const message = object(data.message);
        return { ...record, view: undefined, event: { ...event, data: {
                    id: data.id, callId: data.callId, name: data.name, toolName: data.toolName, turn: data.turn, step: data.step,
                    message: { source: message.source, isError: message.isError === true || (Array.isArray(message.content) && message.content.some(v => object(v).isError === true)), content: [{ type: 'text', text: 'Expand to load tool output' }] },
                    isError: data.isError === true, failed: data.failed, error: data.error ? { message: 'Tool execution failed' } : undefined,
                    remoteDetail: { threadId: params.threadId, detailId: id },
                } } };
    });
    const preview = { ...result, records };
    if (size(preview) > 2 * 1024 * 1024)
        throw new RpcError('RESPONSE_TOO_LARGE', 'History requires chunked transfer.');
    let cachedBytes = [...cache.values()].reduce((n, value) => n + value.bytes, 0);
    while (cache.size + pending.size > 64 || cachedBytes + pendingBytes > MAX_CACHE) {
        const oldest = cache.keys().next().value;
        cachedBytes -= cache.get(oldest).bytes;
        cache.delete(oldest);
    }
    for (const [id, detail] of pending)
        cache.set(id, detail);
    return preview;
}
//# sourceMappingURL=history-preview.js.map