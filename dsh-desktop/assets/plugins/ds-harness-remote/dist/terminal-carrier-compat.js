import { z } from 'zod';
import { RpcError } from './safe-error.js';
import { uuidV7 } from './ids.js';
const identity = z.string().regex(/^[A-Za-z0-9_:-]{1,256}$/);
const attachmentArgs = z.object({ agentId: identity, id: identity, attachmentId: identity }).strict();
const dimensions = { cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) };
const input = z.discriminatedUnion('type', [
    z.object({ type: z.literal('write'), sequence: z.number().int().positive().safe(), data: z.string().max(64 * 1024) }).strict(),
    z.object({ type: z.literal('resize'), sequence: z.number().int().positive().safe(), ...dimensions }).strict(),
]);
/** Fixed terminal API changed in 0.2.1-alpha.3; other streams remain read-only. */
export function usesDuplexTerminal(version) {
    const match = /^(?:dsh-)?v?0\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.*)?$/.exec(version ?? '');
    if (!match)
        return false;
    const minor = Number(match[1]), patch = Number(match[2]);
    if (minor > 2 || (minor === 2 && patch > 1))
        return true;
    if (minor !== 2 || patch !== 1)
        return false;
    return match[3] === undefined || !match[3].startsWith('alpha.') || Number(match[3].slice(6)) >= 3;
}
/** Bounded single-consumer queue. Closing discards inputs, never replays them. */
class Queue {
    maxBytes;
    maxItems;
    values = [];
    bytes = 0;
    wake;
    closed = false;
    error;
    constructor(maxBytes = 256 * 1024, maxItems = 64) {
        this.maxBytes = maxBytes;
        this.maxItems = maxItems;
    }
    push(value) {
        if (this.closed)
            throw new RpcError('TRANSPORT_CLOSED', 'The terminal attachment closed.');
        const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
        if (this.values.length >= this.maxItems || this.bytes + bytes > this.maxBytes)
            throw new RpcError('RATE_LIMITED', 'The terminal attachment buffer is full.');
        this.values.push({ value, bytes });
        this.bytes += bytes;
        this.wake?.();
    }
    close(error, discard = false) {
        if (this.closed)
            return;
        this.closed = true;
        this.error = error;
        if (discard) {
            this.values = [];
            this.bytes = 0;
        }
        this.wake?.();
    }
    async *[Symbol.asyncIterator]() {
        while (true) {
            const entry = this.values.shift();
            if (entry) {
                this.bytes -= entry.bytes;
                yield entry.value;
            }
            else if (this.closed)
                break;
            else
                await new Promise(resolve => { this.wake = resolve; });
        }
        if (this.error)
            throw this.error;
    }
}
/** Existing Remote follow/write/resize calls terminate at the official attach stream. */
export class TerminalCarrierCompat {
    gateway;
    attachments = new Map();
    constructor(gateway) {
        this.gateway = gateway;
    }
    async open(payload, signal) {
        signal.throwIfAborted();
        const args = attachmentArgs.parse(z.object({ args: z.unknown() }).strict().parse(payload).args);
        const key = `${args.agentId}/${args.id}`;
        this.attachments.get(key)?.control.abort();
        const control = new AbortController();
        const queue = new Queue();
        const entry = { args, control, queue, sequence: 0, writable: false, pending: new Map() };
        const lifetime = AbortSignal.any([signal, control.signal]);
        const close = () => {
            queue.close(undefined, true);
            for (const pending of entry.pending.values())
                pending.reject(new RpcError('TRANSPORT_CLOSED', 'The terminal attachment closed. Input will not be replayed.'));
            entry.pending.clear();
            if (this.attachments.get(key) === entry)
                this.attachments.delete(key);
        };
        lifetime.addEventListener('abort', close, { once: true });
        lifetime.throwIfAborted();
        this.attachments.set(key, entry);
        let source;
        try {
            source = await this.gateway.open('terminal/attach', { args: { agentId: args.agentId, id: args.id } }, lifetime, queue);
        }
        catch (error) {
            control.abort();
            throw error;
        }
        return (async function* () {
            try {
                for await (const value of source) {
                    if (lifetime.aborted)
                        break;
                    if (isRecord(value) && value.type === 'ack') {
                        const pending = entry.pending.get(Number(value.sequence));
                        if (!pending)
                            throw new RpcError('INVALID_MESSAGE', 'Unexpected terminal input acknowledgement.');
                        entry.pending.delete(Number(value.sequence));
                        if (value.refusal)
                            pending.reject(new RpcError('PERMISSION_DENIED', 'Terminal input was refused.'));
                        else
                            pending.resolve();
                    }
                    else if (isRecord(value) && (value.type === 'snapshot' || value.type === 'state') && isRecord(value.info)) {
                        entry.writable = value.writable === true;
                        yield { ...value, info: { ...value.info, ...(entry.writable ? { controllerId: args.attachmentId } : {}) } };
                    }
                    else
                        yield value;
                }
            }
            finally {
                control.abort();
                lifetime.removeEventListener('abort', close);
            }
        })();
    }
    async call(endpoint, payload, signal) {
        const fields = endpoint === 'terminal/write' ? { data: z.string().max(64 * 1024) } : dimensions;
        const args = attachmentArgs.extend(fields).parse(z.object({ args: z.unknown() }).strict().parse(payload).args);
        const entry = this.attachments.get(`${args.agentId}/${args.id}`);
        if (!entry || entry.args.attachmentId !== args.attachmentId || !entry.writable)
            throw new RpcError('PERMISSION_DENIED', 'This terminal input attachment is not writable.');
        if (entry.pending.size >= 32)
            throw new RpcError('RATE_LIMITED', 'Too many unacknowledged terminal inputs.');
        signal.throwIfAborted();
        const sequence = ++entry.sequence;
        const value = input.parse({ type: endpoint === 'terminal/write' ? 'write' : 'resize', sequence,
            ...('data' in args ? { data: args.data } : { cols: args.cols, rows: args.rows }) });
        const abort = () => entry.control.abort();
        signal.addEventListener('abort', abort, { once: true });
        try {
            await new Promise((resolve, reject) => {
                entry.pending.set(sequence, { resolve, reject });
                try {
                    entry.queue.push(value);
                }
                catch (error) {
                    entry.pending.delete(sequence);
                    entry.control.abort();
                    reject(error);
                }
            });
            return { ok: true };
        }
        finally {
            signal.removeEventListener('abort', abort);
        }
    }
}
/** Native RC.1 Client attach stream over the existing encrypted terminal subset. */
export async function openRemoteTerminal(target, payload, signal, uplink) {
    const args = z.object({ agentId: identity, id: identity }).strict().parse(z.object({ args: z.unknown() }).strict().parse(payload).args);
    const attachmentId = uuidV7();
    const control = new AbortController();
    const lifetime = AbortSignal.any([signal, control.signal]);
    const output = new Queue(4 * 1024 * 1024, 256);
    let writable = false;
    const iterator = uplink[Symbol.asyncIterator]();
    const abort = () => { output.close(); void iterator.return?.().catch(() => undefined); };
    lifetime.addEventListener('abort', abort, { once: true });
    lifetime.throwIfAborted();
    let source;
    try {
        source = await target.open('terminal/follow', { args: { ...args, attachmentId } }, lifetime);
    }
    catch (error) {
        control.abort();
        throw error;
    }
    let startInput;
    const ready = new Promise(resolve => { startInput = resolve; });
    lifetime.addEventListener('abort', startInput, { once: true });
    if (lifetime.aborted)
        startInput();
    void (async () => {
        try {
            for await (const value of source) {
                if (lifetime.aborted)
                    break;
                if (isRecord(value) && (value.type === 'snapshot' || value.type === 'state') && isRecord(value.info)) {
                    writable = value.info.controllerId === attachmentId;
                    output.push({ ...value, writable });
                    if (value.type === 'snapshot')
                        startInput();
                }
                else
                    output.push(value);
            }
        }
        catch (error) {
            output.close(error);
        }
        finally {
            control.abort();
        }
    })();
    void (async () => {
        let sequence = 0;
        try {
            await ready;
            while (!lifetime.aborted) {
                const next = await iterator.next();
                if (next.done || lifetime.aborted)
                    break;
                const value = input.parse(next.value);
                if (value.sequence !== ++sequence)
                    throw new RpcError('INVALID_MESSAGE', 'Terminal input sequence is invalid.');
                if (!writable) {
                    output.push({ type: 'ack', sequence, refusal: 'read-only' });
                    continue;
                }
                const result = await target.dispatch(`terminal/${value.type}`, { args: { ...args, attachmentId,
                        ...(value.type === 'write' ? { data: value.data } : { cols: value.cols, rows: value.rows }) } }, lifetime);
                if (!result.ok)
                    throw Object.assign(new Error(result.error.message), result.error);
                if (!lifetime.aborted)
                    output.push({ type: 'ack', sequence });
            }
        }
        catch (error) {
            output.close(error);
            control.abort();
        }
    })();
    return (async function* () {
        try {
            yield* output;
        }
        finally {
            control.abort();
            lifetime.removeEventListener('abort', abort);
            lifetime.removeEventListener('abort', startInput);
        }
    })();
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=terminal-carrier-compat.js.map