import { compactHistory } from '../compact-history.js';
import { acpToolStreamSchema } from './method-policy.js';
import { Buffer } from 'node:buffer';
import { AGENT_ACP_TRANSFER_CHUNK_BYTES, MAX_AGENT_ACP_TRANSFER_BYTES, MAX_SECURE_MESSAGE_BYTES, } from '@dsh-remote/protocol';
import { z } from 'zod';
import { RpcError } from '../safe-error.js';
const streamOpenSchema = z.object({
    streamId: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(256),
    tool: acpToolStreamSchema.optional(),
}).strict();
const streamCloseSchema = z.object({ streamId: z.string().min(1).max(128) }).strict();
const transferOpenSchema = z.object({
    transferId: z.string().uuid(),
    totalBytes: z.number().int().positive().max(MAX_AGENT_ACP_TRANSFER_BYTES),
    totalChunks: z.number().int().positive(),
}).strict();
const transferChunkSchema = z.object({
    transferId: z.string().uuid(),
    index: z.number().int().nonnegative(),
    data: z.string().min(1).max(Math.ceil(AGENT_ACP_TRANSFER_CHUNK_BYTES / 3) * 4),
}).strict();
const transferIdSchema = z.object({ transferId: z.string().uuid() }).strict();
const transferReadSchema = z.object({ transferId: z.string().uuid(), index: z.number().int().nonnegative() }).strict();
const MAX_ACTIVE_STREAMS = 16;
const MAX_ACTIVE_TRANSFERS = 2;
const TRANSFER_IDLE_MS = 2 * 60_000;
const INLINE_TRANSFER_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Per-authenticated-connection state for the Cursor Remote domain. */
export class AcpPeerBridge {
    domain;
    context;
    publish;
    logger;
    compactHistoryEnabled = false;
    toolControllers = new Map();
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
    async publishArchived(data) {
        if (!this.closed)
            await this.publish('agent.acp.catalog.changed', data);
    }
    async callDomain(input, logFailure) {
        this.requireOpen();
        try {
            const result = await this.domain.call(this.context.connectionId, input);
            return this.compactHistoryEnabled && safeMethod(input) === 'dsh/sessionHistory' ? compactHistory(result) : result;
        }
        catch (error) {
            if (logFailure) {
                this.logger?.warn('Cursor call failed', {
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
            throw new RpcError('REQUEST_CONFLICT', 'The ACP stream id is already active.');
        if (this.streams.size >= MAX_ACTIVE_STREAMS) {
            throw new RpcError('RATE_LIMITED', 'Too many ACP streams are active for this connection.', undefined, true);
        }
        this.domain.assertStreamable(this.context.connectionId, params.sessionId);
        this.streams.set(params.streamId, params.sessionId);
        if (params.tool) {
            const controller = new AbortController();
            this.toolControllers.set(params.streamId, controller);
            try {
                const source = await this.domain.openToolStream(this.context.connectionId, params.sessionId, params.tool.backend, params.tool.endpoint, params.tool.args, controller.signal);
                if (controller.signal.aborted || this.closed) {
                    controller.abort();
                    return { opened: true, streamId: params.streamId, sessionId: params.sessionId };
                }
                void this.followTool(params.streamId, source, controller);
            }
            catch (error) {
                controller.abort();
                this.streams.delete(params.streamId);
                this.toolControllers.delete(params.streamId);
                throw error;
            }
        }
        else
            await this.domain.replayBufferedFrames(this.context.connectionId, params.sessionId);
        return { opened: true, streamId: params.streamId, sessionId: params.sessionId };
    }
    async followTool(streamId, source, controller) {
        let reason = 'completed';
        try {
            for await (const value of source) {
                if (controller.signal.aborted || this.closed)
                    break;
                const data = { streamId, frame: { method: 'dsh/workspaceTool', params: { value } } };
                if (Buffer.byteLength(JSON.stringify(data)) > MAX_SECURE_MESSAGE_BYTES)
                    throw new Error('Oversized workspace tool frame');
                await this.publish('agent.acp.frame', data);
            }
        }
        catch {
            reason = 'failed';
        }
        finally {
            this.streams.delete(streamId);
            this.toolControllers.delete(streamId);
            controller.abort();
            if (!this.closed)
                await this.publish('agent.acp.stream.closed', { streamId, reason }).catch(() => undefined);
        }
    }
    /** Whether this peer has at least one live stream observing the session. */
    hasStreamFor(sessionId) {
        for (const target of this.streams.values()) {
            if (target === sessionId)
                return true;
        }
        return false;
    }
    closeStream(input) {
        const params = streamCloseSchema.parse(input);
        this.streams.delete(params.streamId);
        this.toolControllers.get(params.streamId)?.abort();
        this.toolControllers.delete(params.streamId);
        return { closed: true, streamId: params.streamId };
    }
    openTransfer(input) {
        this.requireOpen();
        this.pruneTransfers();
        const params = transferOpenSchema.parse(input);
        if (params.totalChunks !== Math.ceil(params.totalBytes / AGENT_ACP_TRANSFER_CHUNK_BYTES)) {
            throw new RpcError('INVALID_MESSAGE', 'The ACP transfer chunk count is invalid.');
        }
        if (this.incomingTransfers.has(params.transferId) || this.outgoingTransfers.has(params.transferId)) {
            throw new RpcError('REQUEST_CONFLICT', 'The ACP transfer id is already active.');
        }
        if (this.incomingTransfers.size >= MAX_ACTIVE_TRANSFERS) {
            throw new RpcError('RATE_LIMITED', 'Too many ACP transfers are active.', undefined, true);
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
            throw new RpcError('TRANSFER_NOT_FOUND', 'The ACP transfer is not active.');
        if (params.index !== transfer.chunks.length || params.index >= transfer.totalChunks) {
            this.incomingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'ACP transfer chunks must arrive exactly once and in order.');
        }
        const chunk = decodeCanonicalBase64(params.data);
        const expectedBytes = Math.min(AGENT_ACP_TRANSFER_CHUNK_BYTES, transfer.totalBytes - params.index * AGENT_ACP_TRANSFER_CHUNK_BYTES);
        if (chunk.byteLength !== expectedBytes) {
            this.incomingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'The ACP transfer chunk size is invalid.');
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
            throw new RpcError('TRANSFER_NOT_FOUND', 'The ACP transfer is not active.');
        this.incomingTransfers.delete(params.transferId);
        if (transfer.chunks.length !== transfer.totalChunks || transfer.receivedBytes !== transfer.totalBytes) {
            throw new RpcError('INVALID_MESSAGE', 'The ACP transfer is incomplete.');
        }
        let request;
        try {
            request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(concatChunks(transfer.chunks, transfer.totalBytes)));
        }
        catch {
            throw new RpcError('INVALID_MESSAGE', 'The ACP transfer does not contain a valid request.');
        }
        let response;
        try {
            response = await this.callDomain(request, false);
        }
        catch (error) {
            this.logger?.warn('ACP transfer call failed', {
                method: safeMethod(request),
                code: safeErrorCode(error),
            });
            throw error;
        }
        this.requireOpen();
        const responseBytes = new TextEncoder().encode(JSON.stringify(response));
        if (responseBytes.byteLength <= INLINE_TRANSFER_RESPONSE_BYTES)
            return { kind: 'inline', response };
        if (responseBytes.byteLength > MAX_AGENT_ACP_TRANSFER_BYTES) {
            throw new RpcError('RESPONSE_TOO_LARGE', 'The Cursor response exceeds the bounded transfer limit.');
        }
        if (this.outgoingTransfers.size >= MAX_ACTIVE_TRANSFERS) {
            throw new RpcError('RATE_LIMITED', 'Too many Cursor response transfers are active.', undefined, true);
        }
        const totalChunks = Math.ceil(responseBytes.byteLength / AGENT_ACP_TRANSFER_CHUNK_BYTES);
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
            throw new RpcError('TRANSFER_NOT_FOUND', 'The Cursor response transfer is not active.');
        if (params.index !== transfer.nextIndex || params.index >= transfer.totalChunks) {
            this.outgoingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'Cursor response chunks must be read exactly once and in order.');
        }
        const start = params.index * AGENT_ACP_TRANSFER_CHUNK_BYTES;
        const end = Math.min(start + AGENT_ACP_TRANSFER_CHUNK_BYTES, transfer.bytes.byteLength);
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
    async publishInbound(sessionId, frame) {
        if (this.closed)
            throw new RpcError('ACP_CONNECTION_CLOSED', 'The ACP connection is closed.');
        const streamIds = [...this.streams.entries()]
            .filter(([id, targetSessionId]) => !this.toolControllers.has(id) && targetSessionId === sessionId)
            .map(([streamId]) => streamId);
        if (streamIds.length === 0) {
            this.logger?.warn('Publishing ACP frame without an open stream; using session-scoped delivery', {
                method: frame.method,
            });
        }
        // Always address live frames by session id. Explicit stream ids are still
        // tracked for interest/backpressure, but Clients match session-scoped
        // delivery after reconnects when stream ids diverge.
        const data = { streamId: `session:${sessionId}`, frame };
        if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_SECURE_MESSAGE_BYTES) {
            for (const streamId of streamIds) {
                this.streams.delete(streamId);
                await this.publish('agent.acp.stream.closed', { streamId, reason: 'failed' }).catch(() => undefined);
            }
            this.logger?.warn('ACP stream closed after oversized frame', { method: frame.method });
            throw new RpcError('RESPONSE_TOO_LARGE', 'The ACP frame exceeds the secure channel limit.');
        }
        try {
            await this.publish('agent.acp.frame', data);
        }
        catch (error) {
            this.logger?.warn('ACP frame publish failed', {
                method: frame.method,
                code: safeErrorCode(error),
            });
            throw error;
        }
    }
    async failStreams(reason = 'failed', sessions) {
        if (this.closed)
            return;
        const streamIds = [...this.streams].filter(([, sessionId]) => sessions === undefined || sessions.has(sessionId)).map(([id]) => id);
        for (const id of streamIds) {
            this.streams.delete(id);
            this.toolControllers.get(id)?.abort();
            this.toolControllers.delete(id);
        }
        this.incomingTransfers.clear();
        this.outgoingTransfers.clear();
        await Promise.all(streamIds.map(streamId => this.publish('agent.acp.stream.closed', {
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
        for (const controller of this.toolControllers.values())
            controller.abort();
        this.toolControllers.clear();
        this.incomingTransfers.clear();
        this.outgoingTransfers.clear();
        this.domain.dropPeer(this.context.connectionId);
        await Promise.all(streamIds.map(streamId => this.publish('agent.acp.stream.closed', {
            streamId,
            reason: 'peer-disconnected',
        }).catch(() => undefined)));
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
            throw new RpcError('ACP_CONNECTION_CLOSED', 'The ACP connection is closed.');
    }
}
function decodeCanonicalBase64(value) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw new RpcError('INVALID_MESSAGE', 'The ACP transfer chunk is not canonical base64.');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
        throw new RpcError('INVALID_MESSAGE', 'The ACP transfer chunk is not canonical base64.');
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