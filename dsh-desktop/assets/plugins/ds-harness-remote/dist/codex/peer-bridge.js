import { compactHistory } from '../compact-history.js';
import { previewCall } from './history-preview.js';
import { Buffer } from 'node:buffer';
import { CODEX_APP_TRANSFER_CHUNK_BYTES, MAX_ACTIVE_TRANSFERS_PER_DIRECTION, MAX_ALPHA_STREAMS_PER_CONNECTION, MAX_CODEX_APP_TRANSFER_BYTES, MAX_SECURE_MESSAGE_BYTES, TRANSFER_IDLE_MS, } from '@dsh-remote/protocol';
import { z } from 'zod';
import { RpcError } from '../safe-error.js';
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
        if (this.streams.has(params.streamId))
            throw new RpcError('REQUEST_CONFLICT', 'The Codex stream id is already active.');
        if (this.streams.size >= MAX_ACTIVE_STREAMS) {
            throw new RpcError('RATE_LIMITED', 'Too many Codex streams are active for this connection.', undefined, true);
        }
        // A bounded summary call proves this connection may observe the thread.
        await this.domain.call(this.context.connectionId, {
            method: 'thread/read',
            params: { threadId: params.threadId, includeTurns: false },
        });
        this.requireOpen();
        this.streams.set(params.streamId, params.threadId);
        return { opened: true, streamId: params.streamId, threadId: params.threadId };
    }
    closeStream(input) {
        const params = streamCloseSchema.parse(input);
        this.streams.delete(params.streamId);
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
        return [...this.streams.values()].includes(threadId);
    }
    removeThreadSubscriptions(threadId) {
        for (const [streamId, targetThreadId] of this.streams) {
            if (targetThreadId === threadId)
                this.streams.delete(streamId);
        }
    }
    async publishInbound(threadId, frame) {
        if (this.closed)
            return;
        const streamIds = [...this.streams.entries()]
            .filter(([, targetThreadId]) => targetThreadId === threadId)
            .map(([streamId]) => streamId);
        for (const streamId of streamIds) {
            const data = { streamId, frame };
            if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_SECURE_MESSAGE_BYTES) {
                this.streams.delete(streamId);
                await this.publish('codex.app.stream.closed', { streamId, reason: 'failed' });
                this.logger?.warn('Codex stream closed after oversized frame', { streamId });
                continue;
            }
            await this.publish('codex.app.frame', data);
        }
    }
    async failStreams(reason = 'failed') {
        if (this.closed)
            return;
        const streamIds = [...this.streams.keys()];
        this.streams.clear();
        this.incomingTransfers.clear();
        this.outgoingTransfers.clear();
        await Promise.all(streamIds.map(streamId => this.publish('codex.app.stream.closed', {
            streamId,
            reason,
        }).catch(() => undefined)));
    }
    async closeAll() {
        if (this.closed)
            return;
        this.closed = true;
        const streamIds = [...this.streams.keys()];
        this.streams.clear();
        this.incomingTransfers.clear();
        this.outgoingTransfers.clear();
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