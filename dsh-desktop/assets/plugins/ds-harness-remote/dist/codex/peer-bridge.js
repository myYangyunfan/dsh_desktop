import { compactHistory } from '../compact-history.js';
import { previewCall } from './history-preview.js';
import { Buffer } from 'node:buffer';
import { CODEX_APP_TRANSFER_CHUNK_BYTES, createEvent, encodeMessage, MAX_ACTIVE_TRANSFERS_PER_DIRECTION, MAX_ALPHA_STREAMS_PER_CONNECTION, MAX_CODEX_APP_TRANSFER_BYTES, MAX_SECURE_MESSAGE_BYTES, TRANSFER_IDLE_MS, } from '@dsh-remote/protocol';
import { z } from 'zod';
import { RpcError } from '../safe-error.js';
import { MAX_BUFFERED_CODEX_FRAMES } from './domain.js';
const streamOpenSchema = z.object({
    streamId: z.string().min(1).max(128),
    threadId: z.string().min(1).max(256),
}).strict();
const streamCloseSchema = z.object({ streamId: z.string().min(1).max(128) }).strict();
const transferOpenSchema = z.object({
    transferId: z.string().uuid(),
    totalBytes: z.number().int().positive().max(MAX_CODEX_APP_TRANSFER_BYTES),
    totalChunks: z.number().int().positive(),
}).strict();
const transferChunkSchema = z.object({
    transferId: z.string().uuid(),
    index: z.number().int().nonnegative(),
    data: z.string().min(1).max(Math.ceil(CODEX_APP_TRANSFER_CHUNK_BYTES / 3) * 4),
}).strict();
const transferIdSchema = z.object({ transferId: z.string().uuid() }).strict();
const transferReadSchema = z.object({ transferId: z.string().uuid(), index: z.number().int().nonnegative() }).strict();
const MAX_ACTIVE_STREAMS = MAX_ALPHA_STREAMS_PER_CONNECTION;
const MAX_ACTIVE_TRANSFERS = MAX_ACTIVE_TRANSFERS_PER_DIRECTION;
const INLINE_TRANSFER_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Per-authenticated-connection state for the Codex Remote domain. */
export class CodexPeerBridge {
    domain;
    context;
    publish;
    logger;
    compactHistoryEnabled = false;
    streams = new Map();
    openingStreams = new Map();
    pendingOpens = new Map();
    incomingTransfers = new Map();
    outgoingTransfers = new Map();
    closed = false;
    constructor(domain, context, publish, logger) {
        this.domain = domain;
        this.context = context;
        this.publish = publish;
        this.logger = logger;
    }
    async call(input) {
        return this.callDomain(input, true);
    }
    async callDomain(input, logFailure) {
        this.requireOpen();
        try {
            const result = await previewCall(this, input, value => this.domain.call(this.context.connectionId, value));
            return this.compactHistoryEnabled && safeMethod(input) === 'dsh/sessionHistory' ? compactHistory(result) : result;
        }
        catch (error) {
            if (logFailure) {
                this.logger?.warn('Codex call failed', {
                    method: safeMethod(input),
                    code: safeErrorCode(error),
                });
            }
            throw error;
        }
    }
    respond(input) {
        this.requireOpen();
        return this.domain.respond(this.context.connectionId, input);
    }
    async openStream(input) {
        this.requireOpen();
        const params = streamOpenSchema.parse(input);
        if (this.streams.has(params.streamId) || this.openingStreams.has(params.streamId) || this.pendingOpens.has(params.streamId)) {
            throw new RpcError('REQUEST_CONFLICT', 'The Codex stream id is already active.');
        }
        if (this.streams.size + this.openingStreams.size + this.pendingOpens.size >= MAX_ACTIVE_STREAMS) {
            throw new RpcError('RATE_LIMITED', 'Too many Codex streams are active for this connection.', undefined, true);
        }
        const pending = { threadId: params.threadId, cancelled: false };
        this.pendingOpens.set(params.streamId, pending);
        let replayTruncated = false;
        try {
            await this.domain.useThread(params.threadId, async () => {
                await this.domain.call(this.context.connectionId, {
                    method: 'thread/read',
                    params: { threadId: params.threadId, includeTurns: false },
                });
                this.requireOpen();
                if (pending.cancelled || this.pendingOpens.get(params.streamId) !== pending) {
                    throw new RpcError('CODEX_CONNECTION_CLOSED', 'The Codex stream was closed while opening.');
                }
                this.pendingOpens.delete(params.streamId);
                if (this.streams.has(params.streamId) || this.openingStreams.has(params.streamId)) {
                    throw new RpcError('REQUEST_CONFLICT', 'The Codex stream id is already active.');
                }
                if (this.streams.size + this.openingStreams.size + this.pendingOpens.size >= MAX_ACTIVE_STREAMS) {
                    throw new RpcError('RATE_LIMITED', 'Too many Codex streams are active for this connection.', undefined, true);
                }
                const opening = { threadId: params.threadId, queue: [], truncated: false };
                this.openingStreams.set(params.streamId, opening);
                try {
                    const replay = typeof this.domain.replayBufferedFrames === 'function'
                        ? await this.domain.replayBufferedFrames(this.context.connectionId, params.streamId, params.threadId)
                        : { replayed: 0, truncated: false };
                    replayTruncated = replay.truncated;
                    while (opening.queue.length > 0) {
                        this.requireOpen();
                        if (this.openingStreams.get(params.streamId) !== opening) {
                            throw new RpcError('CODEX_CONNECTION_CLOSED', 'The Codex stream was closed while opening.');
                        }
                        if (opening.truncated) {
                            replayTruncated = true;
                            opening.truncated = false;
                        }
                        const frame = opening.queue.shift();
                        try {
                            await this.publishReplayFrame(params.streamId, frame);
                        }
                        catch (error) {
                            if (isResponseTooLargeError(error)) {
                                this.logger?.warn('Skipped oversized staged Codex frame during stream open', {
                                    streamId: params.streamId,
                                    method: frame.method,
                                });
                                continue;
                            }
                            opening.queue.unshift(frame);
                            throw error;
                        }
                    }
                    this.requireOpen();
                    if (this.openingStreams.get(params.streamId) !== opening) {
                        throw new RpcError('CODEX_CONNECTION_CLOSED', 'The Codex stream was closed while opening.');
                    }
                    if (opening.truncated)
                        replayTruncated = true;
                    this.openingStreams.delete(params.streamId);
                    this.streams.set(params.streamId, params.threadId);
                }
                catch (error) {
                    if (this.openingStreams.get(params.streamId) === opening) {
                        this.openingStreams.delete(params.streamId);
                    }
                    if (opening.queue.length > 0 && typeof this.domain.rebufferOpeningFrames === 'function') {
                        this.domain.rebufferOpeningFrames(params.threadId, opening.queue, replayTruncated || opening.truncated);
                    }
                    throw error;
                }
            });
        }
        finally {
            if (this.pendingOpens.get(params.streamId) === pending) {
                this.pendingOpens.delete(params.streamId);
            }
        }
        return {
            opened: true,
            streamId: params.streamId,
            threadId: params.threadId,
            ...(replayTruncated ? { replayTruncated: true } : {}),
        };
    }
    async closeStream(input) {
        const params = streamCloseSchema.parse(input);
        const pending = this.pendingOpens.get(params.streamId);
        if (pending !== undefined) {
            pending.cancelled = true;
            this.pendingOpens.delete(params.streamId);
        }
        const threadId = this.streams.get(params.streamId) ?? this.openingStreams.get(params.streamId)?.threadId;
        this.streams.delete(params.streamId);
        this.openingStreams.delete(params.streamId);
        if (threadId !== undefined)
            await this.domain.releaseThread(threadId);
        return { closed: true, streamId: params.streamId };
    }
    openTransfer(input) {
        this.requireOpen();
        this.pruneTransfers();
        const params = transferOpenSchema.parse(input);
        if (params.totalChunks !== Math.ceil(params.totalBytes / CODEX_APP_TRANSFER_CHUNK_BYTES)) {
            throw new RpcError('INVALID_MESSAGE', 'The Codex transfer chunk count is invalid.');
        }
        if (this.incomingTransfers.has(params.transferId) || this.outgoingTransfers.has(params.transferId)) {
            throw new RpcError('REQUEST_CONFLICT', 'The Codex transfer id is already active.');
        }
        if (this.incomingTransfers.size >= MAX_ACTIVE_TRANSFERS) {
            throw new RpcError('RATE_LIMITED', 'Too many Codex transfers are active.', undefined, true);
        }
        this.incomingTransfers.set(params.transferId, {
            totalBytes: params.totalBytes,
            totalChunks: params.totalChunks,
            chunks: [],
            receivedBytes: 0,
            touchedAt: Date.now(),
        });
        return { opened: true, transferId: params.transferId };
    }
    appendTransfer(input) {
        this.requireOpen();
        this.pruneTransfers();
        const params = transferChunkSchema.parse(input);
        const transfer = this.incomingTransfers.get(params.transferId);
        if (transfer === undefined)
            throw new RpcError('TRANSFER_NOT_FOUND', 'The Codex transfer is not active.');
        if (params.index !== transfer.chunks.length || params.index >= transfer.totalChunks) {
            this.incomingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'Codex transfer chunks must arrive exactly once and in order.');
        }
        const chunk = decodeCanonicalBase64(params.data);
        const expectedBytes = Math.min(CODEX_APP_TRANSFER_CHUNK_BYTES, transfer.totalBytes - params.index * CODEX_APP_TRANSFER_CHUNK_BYTES);
        if (chunk.byteLength !== expectedBytes) {
            this.incomingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'The Codex transfer chunk size is invalid.');
        }
        transfer.chunks.push(chunk);
        transfer.receivedBytes += chunk.byteLength;
        transfer.touchedAt = Date.now();
        return { accepted: true, transferId: params.transferId, index: params.index };
    }
    async commitTransfer(input) {
        this.requireOpen();
        this.pruneTransfers();
        const params = transferIdSchema.parse(input);
        const transfer = this.incomingTransfers.get(params.transferId);
        if (transfer === undefined)
            throw new RpcError('TRANSFER_NOT_FOUND', 'The Codex transfer is not active.');
        this.incomingTransfers.delete(params.transferId);
        if (transfer.chunks.length !== transfer.totalChunks || transfer.receivedBytes !== transfer.totalBytes) {
            throw new RpcError('INVALID_MESSAGE', 'The Codex transfer is incomplete.');
        }
        let request;
        try {
            request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(concatChunks(transfer.chunks, transfer.totalBytes)));
        }
        catch {
            throw new RpcError('INVALID_MESSAGE', 'The Codex transfer does not contain a valid request.');
        }
        let response;
        try {
            response = await this.callDomain(request, false);
        }
        catch (error) {
            this.logger?.warn('Codex transfer call failed', {
                method: safeMethod(request),
                code: safeErrorCode(error),
            });
            throw error;
        }
        this.requireOpen();
        const responseBytes = new TextEncoder().encode(JSON.stringify(response));
        if (responseBytes.byteLength <= INLINE_TRANSFER_RESPONSE_BYTES)
            return { kind: 'inline', response };
        if (responseBytes.byteLength > MAX_CODEX_APP_TRANSFER_BYTES) {
            throw new RpcError('RESPONSE_TOO_LARGE', 'The Codex response exceeds the bounded transfer limit.');
        }
        if (this.outgoingTransfers.size >= MAX_ACTIVE_TRANSFERS) {
            throw new RpcError('RATE_LIMITED', 'Too many Codex response transfers are active.', undefined, true);
        }
        const totalChunks = Math.ceil(responseBytes.byteLength / CODEX_APP_TRANSFER_CHUNK_BYTES);
        this.outgoingTransfers.set(params.transferId, {
            bytes: responseBytes,
            totalChunks,
            nextIndex: 0,
            touchedAt: Date.now(),
        });
        return { kind: 'chunked', transferId: params.transferId, totalBytes: responseBytes.byteLength, totalChunks };
    }
    readTransfer(input) {
        this.requireOpen();
        this.pruneTransfers();
        const params = transferReadSchema.parse(input);
        const transfer = this.outgoingTransfers.get(params.transferId);
        if (transfer === undefined)
            throw new RpcError('TRANSFER_NOT_FOUND', 'The Codex response transfer is not active.');
        if (params.index !== transfer.nextIndex || params.index >= transfer.totalChunks) {
            this.outgoingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'Codex response chunks must be read exactly once and in order.');
        }
        const start = params.index * CODEX_APP_TRANSFER_CHUNK_BYTES;
        const end = Math.min(start + CODEX_APP_TRANSFER_CHUNK_BYTES, transfer.bytes.byteLength);
        transfer.nextIndex += 1;
        transfer.touchedAt = Date.now();
        if (transfer.nextIndex >= transfer.totalChunks) {
            this.outgoingTransfers.delete(params.transferId);
        }
        return {
            transferId: params.transferId,
            index: params.index,
            data: Buffer.from(transfer.bytes.subarray(start, end)).toString('base64'),
        };
    }
    closeTransfer(input) {
        const params = transferIdSchema.parse(input);
        const closed = this.incomingTransfers.delete(params.transferId) || this.outgoingTransfers.delete(params.transferId);
        return { closed, transferId: params.transferId };
    }
    hasThreadSubscription(threadId) {
        for (const target of this.streams.values())
            if (target === threadId)
                return true;
        for (const opening of this.openingStreams.values())
            if (opening.threadId === threadId)
                return true;
        return false;
    }
    removeThreadSubscriptions(threadId) {
        for (const [streamId, targetThreadId] of this.streams) {
            if (targetThreadId === threadId)
                this.streams.delete(streamId);
        }
        for (const [streamId, opening] of this.openingStreams) {
            if (opening.threadId === threadId)
                this.openingStreams.delete(streamId);
        }
        for (const [streamId, pending] of this.pendingOpens) {
            if (pending.threadId !== threadId)
                continue;
            pending.cancelled = true;
            this.pendingOpens.delete(streamId);
        }
    }
    async publishReplayFrame(streamId, frame) {
        this.requireOpen();
        const data = { streamId, frame };
        if (encodeMessage(createEvent('codex.app.frame', data)).byteLength > MAX_SECURE_MESSAGE_BYTES) {
            this.logger?.warn('Skipped oversized buffered Codex frame during replay', { streamId, method: frame.method });
            return;
        }
        await this.publish('codex.app.frame', data);
    }
    async publishInbound(threadId, frame) {
        if (this.closed)
            return;
        for (const [streamId, opening] of this.openingStreams) {
            if (opening.threadId !== threadId)
                continue;
            if (encodeMessage(createEvent('codex.app.frame', { streamId, frame })).byteLength > MAX_SECURE_MESSAGE_BYTES) {
                this.logger?.warn('Skipped oversized live Codex frame while stream is opening', { streamId, method: frame.method });
                continue;
            }
            opening.queue.push(frame);
            while (opening.queue.length > MAX_BUFFERED_CODEX_FRAMES) {
                opening.queue.shift();
                opening.truncated = true;
            }
        }
        const streamIds = [...this.streams.entries()]
            .filter(([, targetThreadId]) => targetThreadId === threadId)
            .map(([streamId]) => streamId);
        for (const streamId of streamIds) {
            const data = { streamId, frame };
            if (encodeMessage(createEvent('codex.app.frame', data)).byteLength > MAX_SECURE_MESSAGE_BYTES) {
                this.streams.delete(streamId);
                void this.domain.releaseThread(threadId).catch(() => undefined);
                await this.publish('codex.app.stream.closed', { streamId, reason: 'failed' }).catch(() => undefined);
                this.logger?.warn('Codex stream closed after oversized frame', { streamId });
                continue;
            }
            await this.publish('codex.app.frame', data);
        }
    }
    clearStreamState() {
        const streamIds = [...new Set([...this.streams.keys(), ...this.openingStreams.keys()])];
        for (const pending of this.pendingOpens.values())
            pending.cancelled = true;
        this.pendingOpens.clear();
        this.streams.clear();
        this.openingStreams.clear();
        this.incomingTransfers.clear();
        this.outgoingTransfers.clear();
        return streamIds;
    }
    async failStreams(reason = 'failed') {
        if (this.closed)
            return;
        const streamIds = this.clearStreamState();
        await Promise.all(streamIds.map(streamId => this.publish('codex.app.stream.closed', {
            streamId,
            reason,
        }).catch(() => undefined)));
    }
    async closeAll() {
        if (this.closed)
            return;
        this.closed = true;
        const streamIds = this.clearStreamState();
        const detach = this.domain.detachPeer(this.context.connectionId);
        await Promise.all([detach, ...streamIds.map(streamId => this.publish('codex.app.stream.closed', {
                streamId,
                reason: 'peer-disconnected',
            }).catch(() => undefined))]);
    }
    pruneTransfers() {
        const staleBefore = Date.now() - TRANSFER_IDLE_MS;
        for (const [id, transfer] of this.incomingTransfers) {
            if (transfer.touchedAt < staleBefore)
                this.incomingTransfers.delete(id);
        }
        for (const [id, transfer] of this.outgoingTransfers) {
            if (transfer.touchedAt < staleBefore)
                this.outgoingTransfers.delete(id);
        }
    }
    requireOpen() {
        if (this.closed)
            throw new RpcError('CODEX_CONNECTION_CLOSED', 'The Codex connection is closed.');
    }
}
function decodeCanonicalBase64(value) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw new RpcError('INVALID_MESSAGE', 'The Codex transfer chunk is not canonical base64.');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
        throw new RpcError('INVALID_MESSAGE', 'The Codex transfer chunk is not canonical base64.');
    }
    return decoded;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function safeErrorCode(error) {
    if (isRecord(error) && typeof error.code === 'string')
        return error.code;
    return 'UNKNOWN';
}
function isResponseTooLargeError(error) {
    return isRecord(error) && error.code === 'RESPONSE_TOO_LARGE';
}
function safeMethod(input) {
    return isRecord(input) && typeof input.method === 'string' ? input.method : 'invalid';
}
function concatChunks(chunks, totalBytes) {
    const output = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return output;
}
//# sourceMappingURL=peer-bridge.js.map