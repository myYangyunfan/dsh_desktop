import { compactHistory } from './compact-history.js';
import { randomUUID } from 'node:crypto';
import { TerminalCarrierCompat, usesDuplexTerminal } from './terminal-carrier-compat.js';
import { createEvent, encodeMessage, HARNESS_API_TRANSFER_CHUNK_BYTES, MAX_ACTIVE_TRANSFERS_PER_DIRECTION, MAX_ALPHA_STREAMS_PER_CONNECTION, MAX_HARNESS_API_TRANSFER_BYTES, MAX_SECURE_MESSAGE_BYTES, TRANSFER_IDLE_MS, } from '@dsh-remote/protocol';
import { z } from 'zod';
import { TerminalPolicy, TERMINAL_CALLS, TERMINAL_STREAMS } from './terminal-policy.js';
import { harnessSessionGeneration } from './harness-version.js';
import { ensureHostWorkspaceDirectory, listRemoteDirectory } from './remote-directory-browser.js';
import { RpcError } from './rpc-router.js';
const endpointSchema = z.string().min(1).max(128).regex(/^(?:\$events(?:\/result)?|[A-Za-z0-9_$.-]+\/[A-Za-z0-9_$.-]+)$/);
const callSchema = z.object({ endpoint: endpointSchema, payload: z.unknown() }).strict();
const streamOpenSchema = z.object({
    streamId: z.string().min(1).max(128),
    endpoint: endpointSchema,
    payload: z.unknown(),
    transferFrames: z.boolean().optional(),
}).strict();
const streamCloseSchema = z.object({ streamId: z.string().min(1).max(128) }).strict();
const commandExecuteArgsSchema = z.object({
    agentId: z.string().min(1).max(128),
    line: z.string().min(1).max(2048),
    // dsh-commands <= 0.1.2 calls this field `images`; dsh-commands 0.1.5
    // renamed it to `submittedAttachments`. Only empty arrays are exposed by
    // the Remote bridge; command attachments are deliberately out of scope.
    images: z.array(z.never()).length(0).optional(),
    submittedAttachments: z.array(z.never()).length(0).optional(),
}).strict().superRefine((value, context) => {
    if (value.images !== undefined && value.submittedAttachments !== undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Use either images or submittedAttachments, not both.',
            path: ['submittedAttachments'],
        });
    }
});
const commandExecutePayloadSchema = z.object({ args: commandExecuteArgsSchema }).strict();
const transferOpenSchema = z.object({
    transferId: z.string().uuid(),
    totalBytes: z.number().int().positive().max(MAX_HARNESS_API_TRANSFER_BYTES),
    totalChunks: z.number().int().positive(),
}).strict();
const transferChunkSchema = z.object({
    transferId: z.string().uuid(),
    index: z.number().int().nonnegative(),
    data: z.string().min(1),
}).strict();
const transferIdSchema = z.object({ transferId: z.string().uuid() }).strict();
const transferReadSchema = z.object({
    transferId: z.string().uuid(),
    index: z.number().int().nonnegative(),
}).strict();
const directoryListSchema = z.object({
    path: z.string().min(1).max(4096).optional(),
}).strict();
const MAX_ACTIVE_STREAMS = MAX_ALPHA_STREAMS_PER_CONNECTION;
const MAX_ACTIVE_TRANSFERS = MAX_ACTIVE_TRANSFERS_PER_DIRECTION;
const INLINE_TRANSFER_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Fixed v0.1.2 Typert Remote subset exposed to authenticated peers. */
export const HARNESS_REMOTE_ALLOWLIST = [
    '$events',
    '$events/result',
    'agentPresets/list',
    'agentPresets/read',
    'agentPresets/select',
    'commands/execute',
    'commands/list',
    'credentials/describe',
    'credentials/set',
    'credentials/unset',
    'directoryPicker/list',
    'fileReferences/list',
    'goals/clear',
    'goals/complete',
    'goals/create',
    'goals/edit',
    'goals/pause',
    'goals/resume',
    'job/list',
    'job/follow',
    'llm/discoverModels',
    'llm/listConfigurableProviders',
    'llm/listProviders',
    'messageFeedback/delete',
    'messageFeedback/list',
    'messageFeedback/put',
    'pluginInventory/list',
    'pluginManager/listBundles',
    'pluginManager/listPlugins',
    'pluginManager/setBundleEnabled',
    'pluginManager/setPluginEnabled',
    'permissionPresets/catalog',
    'schedule/list',
    'schedule/catalog',
    'schedule/history',
    'schedule/update',
    'schedule/delete',
    'session/attachment',
    'session/cancel',
    'session/canOpenWorkspacePath',
    'session/control',
    'session/create',
    'session/follow',
    'session/fork',
    'session/list',
    'session/modelCatalog',
    'session/page',
    'session/prompt',
    'remoteAccess/follow',
    'session/projections',
    'session/initializeDefaultModel',
    'session/workspacePathApplications',
    'session/rename',
    'session/search',
    'session/selectModel',
    'session/updateQueue',
    'sessionReferenceResolver/candidates',
    'settings/describe',
    'settings/mutate',
    'settings/replace',
    'settings/update',
    'skills/list',
    'subagents/interruptByParent',
    'subagents/list',
    'subagents/prompt',
    'userQuestions/answer',
    'userQuestions/attachWait',
    'claudeCodeMods/watchBand',
    'claudeCodeMods/pressBand',
    'workspaceFiles/list',
    'workspaceFiles/stat',
    'workspaceFiles/read',
    'workspaceFiles/readBytes',
    'workspaceFiles/readAll',
    'workspaceFiles/readRelated',
    'workspaceFiles/changes',
    'officeToPdf/render',
    'officeToPdf/generation',
    'workspace/archiveSession',
    'workspace/create',
    'workspace/delete',
    'workspace/follow',
    'workspace/insertBefore',
    'workspace/insertSessionBefore',
    'workspace/rename',
    'workspace/unarchiveSession',
    'workspace/initializeDefault',
    'workspace/pinSession',
    'workspace/unpinSession',
];
const allowedEndpoints = new Set(HARNESS_REMOTE_ALLOWLIST);
/** Host-side adapter from the encrypted peer channel to the official alpha Gateway carrier. */
export class HarnessRemoteBridge {
    gateway;
    publish;
    logger;
    harnessVersion;
    terminal;
    codexWorkspace;
    compactHistoryEnabled = false;
    streams = new Map();
    incomingTransfers = new Map();
    outgoingTransfers = new Map();
    terminalCarrier;
    constructor(gateway, publish, logger, harnessVersion, terminal = new TerminalPolicy(() => false, "", new Map()), codexWorkspace) {
        this.gateway = gateway;
        this.publish = publish;
        this.logger = logger;
        this.harnessVersion = harnessVersion;
        this.terminal = terminal;
        this.codexWorkspace = codexWorkspace;
        this.terminalCarrier = usesDuplexTerminal(harnessVersion) ? new TerminalCarrierCompat(gateway) : undefined;
    }
    async call(input) {
        const params = callSchema.parse(input);
        this.assertAllowed(params.endpoint);
        if (TERMINAL_STREAMS.has(params.endpoint))
            throw new RpcError('METHOD_NOT_ALLOWED', 'Use a stream for this terminal endpoint.');
        if (['settings/update', 'settings/replace', 'settings/mutate'].includes(params.endpoint)) {
            const args = requestArgs(params.payload);
            if (args.ns === 'ds-harness-remote' || args.ns === 'dsh-remote') {
                throw new RpcError('PERMISSION_DENIED', 'Remote access settings can only be changed locally on the Host.');
            }
        }
        await this.checkPluginManagement(params.endpoint, params.payload);
        const reservation = params.endpoint.startsWith('terminal/') ? this.terminal.check(params.endpoint, params.payload) : undefined;
        let codexResult;
        if (this.codexWorkspace !== undefined) {
            try {
                codexResult = await this.codexWorkspace.call(params.endpoint, params.payload, AbortSignal.timeout(60_000));
            }
            catch (error) {
                // Release failed allocations only after their process cleanup succeeds.
                if (reservation !== undefined) {
                    this.terminal.result(params.endpoint, params.payload, { ok: false, error: { code: error instanceof RpcError ? error.code : 'FAILED', message: '', details: {} } }, reservation);
                }
                throw error;
            }
        }
        if (codexResult !== undefined)
            return reservation === undefined ? codexResult : this.terminal.result(params.endpoint, params.payload, codexResult, reservation);
        if (params.endpoint === 'session/canOpenWorkspacePath') {
            return { ok: true, value: true };
        }
        if (params.endpoint === 'workspace/create') {
            const request = requestArgs(params.payload);
            const folder = typeof request.path === 'string' ? request.path : '';
            await ensureHostWorkspaceDirectory(folder);
        }
        const startedAt = performance.now();
        const signal = AbortSignal.timeout(60_000);
        try {
            const nativePayload = normalizeWorkspaceRequestPayload(params.endpoint, params.payload, this.harnessVersion);
            const nativeResult = params.endpoint === 'commands/execute'
                ? await dispatchCommandForHost(this.gateway, params.payload, signal, this.harnessVersion)
                : this.terminalCarrier !== undefined && (params.endpoint === 'terminal/write' || params.endpoint === 'terminal/resize')
                    ? await this.terminalCarrier.call(params.endpoint, nativePayload, signal)
                    : await this.gateway.dispatch(params.endpoint, nativePayload, signal);
            const result = params.endpoint === 'directoryPicker/list' && needsDirectoryFallback(nativeResult)
                ? await this.directoryList(params.payload, signal)
                : filterRemotePluginInventory(params.endpoint, nativeResult);
            this.logger?.debug('harness remote call ok', {
                endpoint: params.endpoint,
                durationMs: Math.round(performance.now() - startedAt),
            });
            // The native 0.2.x workspace APIs return binary payloads as Uint8Array.
            // Remote calls cross a JSON-only encrypted frame, so keep the wire
            // contract stable by converting only the two bounded preview responses
            // to canonical base64. (Codex/ACP workspace bridges already return the
            // wire shape and are left unchanged.)
            const wireResult = normalizeWorkspaceBinaryResult(params.endpoint, this.compactHistoryEnabled && ['session/page', 'session/history', 'subagent/history'].includes(params.endpoint)
                ? compactHistory(result) : result);
            return reservation === undefined ? wireResult : this.terminal.result(params.endpoint, params.payload, wireResult, reservation);
        }
        catch (error) {
            if (reservation !== undefined)
                this.terminal.result(params.endpoint, params.payload, { ok: false, error: { code: 'FAILED', message: '', details: {} } }, reservation);
            if (params.endpoint === 'directoryPicker/list') {
                const result = await this.directoryList(params.payload, signal);
                this.logger?.debug('harness remote call ok', {
                    endpoint: params.endpoint,
                    durationMs: Math.round(performance.now() - startedAt),
                    fallback: 'directory-browser',
                });
                return result;
            }
            this.logger?.warn('harness remote call failed', {
                endpoint: params.endpoint,
                durationMs: Math.round(performance.now() - startedAt),
                code: this.gateway.failure(error).code,
            });
            throw error;
        }
    }
    async directoryList(payload, signal) {
        const args = requestArgs(payload);
        const params = directoryListSchema.parse(args);
        return { ok: true, value: await listRemoteDirectory(params.path, signal) };
    }
    openTransfer(input) {
        this.pruneTransfers();
        const params = transferOpenSchema.parse(input);
        if (params.totalChunks !== Math.ceil(params.totalBytes / HARNESS_API_TRANSFER_CHUNK_BYTES)) {
            throw new RpcError('INVALID_MESSAGE', 'The Harness Remote transfer chunk count is invalid.');
        }
        if (this.incomingTransfers.has(params.transferId) || this.outgoingTransfers.has(params.transferId)) {
            throw new RpcError('REQUEST_CONFLICT', 'The Harness Remote transfer id is already active.');
        }
        if (this.incomingTransfers.size >= MAX_ACTIVE_TRANSFERS) {
            throw new RpcError('RATE_LIMITED', 'Too many Harness Remote transfers are active.', undefined, true);
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
        this.pruneTransfers();
        const params = transferChunkSchema.parse(input);
        const transfer = this.incomingTransfers.get(params.transferId);
        if (transfer === undefined)
            throw new RpcError('TRANSFER_NOT_FOUND', 'The Harness Remote transfer is not active.');
        if (params.index !== transfer.chunks.length || params.index >= transfer.totalChunks) {
            this.incomingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'Harness Remote transfer chunks must arrive exactly once and in order.');
        }
        const chunk = decodeCanonicalBase64(params.data);
        const expectedBytes = Math.min(HARNESS_API_TRANSFER_CHUNK_BYTES, transfer.totalBytes - params.index * HARNESS_API_TRANSFER_CHUNK_BYTES);
        if (chunk.byteLength !== expectedBytes) {
            this.incomingTransfers.delete(params.transferId);
            throw new RpcError('INVALID_MESSAGE', 'The Harness Remote transfer chunk size is invalid.');
        }
        transfer.chunks.push(chunk);
        transfer.receivedBytes += chunk.byteLength;
        transfer.touchedAt = Date.now();
        return { accepted: true, transferId: params.transferId, index: params.index };
    }
    async commitTransfer(input) {
        this.pruneTransfers();
        const params = transferIdSchema.parse(input);
        const transfer = this.incomingTransfers.get(params.transferId);
        if (transfer === undefined)
            throw new RpcError('TRANSFER_NOT_FOUND', 'The Harness Remote transfer is not active.');
        this.incomingTransfers.delete(params.transferId);
        if (transfer.chunks.length !== transfer.totalChunks || transfer.receivedBytes !== transfer.totalBytes) {
            throw new RpcError('INVALID_MESSAGE', 'The Harness Remote transfer is incomplete.');
        }
        let request;
        try {
            request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(concatChunks(transfer.chunks, transfer.totalBytes)));
        }
        catch {
            throw new RpcError('INVALID_MESSAGE', 'The Harness Remote transfer does not contain a valid request.');
        }
        const response = await this.call(callSchema.parse(request));
        const responseBytes = new TextEncoder().encode(JSON.stringify(response));
        if (responseBytes.byteLength <= INLINE_TRANSFER_RESPONSE_BYTES)
            return { kind: 'inline', response };
        if (responseBytes.byteLength > MAX_HARNESS_API_TRANSFER_BYTES) {
            throw new RpcError('RESPONSE_TOO_LARGE', 'The Harness Remote response exceeds the bounded transfer limit.');
        }
        if (this.outgoingTransfers.size >= MAX_ACTIVE_TRANSFERS) {
            throw new RpcError('RATE_LIMITED', 'Too many Harness Remote response transfers are active.', undefined, true);
        }
        const totalChunks = Math.ceil(responseBytes.byteLength / HARNESS_API_TRANSFER_CHUNK_BYTES);
        this.outgoingTransfers.set(params.transferId, {
            bytes: responseBytes,
            totalChunks,
            nextIndex: 0,
            touchedAt: Date.now(),
        });
        return { kind: 'chunked', transferId: params.transferId, totalBytes: responseBytes.byteLength, totalChunks };
    }
    readTransfer(input) {
        this.pruneTransfers();
        const params = transferReadSchema.parse(input);
        const transfer = this.outgoingTransfers.get(params.transferId);
        if (transfer === undefined)
            throw new RpcError('TRANSFER_NOT_FOUND', 'The Harness Remote response transfer is not active.');
        if (params.index !== transfer.nextIndex || params.index >= transfer.totalChunks) {
            this.outgoingTransfers.delete(params.transferId);
            transfer.finish?.(new Error('Invalid Harness Remote stream transfer order'));
            throw new RpcError('INVALID_MESSAGE', 'Harness Remote response chunks must be read exactly once and in order.');
        }
        const start = params.index * HARNESS_API_TRANSFER_CHUNK_BYTES;
        const end = Math.min(start + HARNESS_API_TRANSFER_CHUNK_BYTES, transfer.bytes.byteLength);
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
        const transfer = this.outgoingTransfers.get(params.transferId);
        transfer?.finish?.(transfer.nextIndex === transfer.totalChunks ? undefined : new Error('Incomplete Harness Remote stream transfer'));
        const closed = this.incomingTransfers.delete(params.transferId) || this.outgoingTransfers.delete(params.transferId);
        return { closed, transferId: params.transferId };
    }
    async openStream(input) {
        const params = streamOpenSchema.parse(input);
        this.assertAllowed(params.endpoint);
        if (params.endpoint.startsWith('pluginManager/'))
            throw new RpcError('METHOD_NOT_ALLOWED', 'Plugin management endpoints are not streams.');
        if (params.endpoint.startsWith('settings/'))
            throw new RpcError('METHOD_NOT_ALLOWED', 'Settings endpoints are not streams.');
        if (TERMINAL_CALLS.has(params.endpoint))
            throw new RpcError('METHOD_NOT_ALLOWED', 'This terminal endpoint is not a stream.');
        if (TERMINAL_STREAMS.has(params.endpoint))
            this.terminal.check(params.endpoint, params.payload);
        if (this.streams.has(params.streamId))
            throw new RpcError('REQUEST_CONFLICT', 'The Harness Remote stream is already open.');
        if (this.streams.size >= MAX_ACTIVE_STREAMS) {
            throw new RpcError('RATE_LIMITED', 'Too many Harness Remote streams are open.', undefined, true);
        }
        const controller = new AbortController();
        this.streams.set(params.streamId, { controller });
        let source;
        try {
            source = (this.codexWorkspace === undefined ? undefined : await this.codexWorkspace.open(params.endpoint, params.payload, controller.signal))
                ?? await (params.endpoint === 'terminal/follow' && this.terminalCarrier !== undefined
                    ? this.terminalCarrier.open(params.payload, controller.signal)
                    : this.gateway.open(params.endpoint, normalizeWorkspaceChangesPayload(params.endpoint, params.payload, this.harnessVersion), controller.signal));
            controller.signal.throwIfAborted();
        }
        catch (error) {
            this.streams.delete(params.streamId);
            controller.abort();
            throw error;
        }
        void this.pump(params.streamId, source, controller.signal, params.endpoint === 'session/follow', params.transferFrames);
        return { opened: true, streamId: params.streamId };
    }
    closeStream(input) {
        const params = streamCloseSchema.parse(input);
        const active = this.streams.get(params.streamId);
        if (active !== undefined) {
            this.streams.delete(params.streamId);
            active.controller.abort('client-closed');
        }
        return { closed: active !== undefined, streamId: params.streamId };
    }
    async closeAll(reason = 'peer-disconnected') {
        const streams = [...this.streams.entries()];
        this.streams.clear();
        this.incomingTransfers.clear();
        this.outgoingTransfers.clear();
        for (const [, stream] of streams)
            stream.controller.abort(reason);
        await Promise.all([this.gateway.dispose?.(), this.codexWorkspace?.closeAll()]);
    }
    async checkPluginManagement(endpoint, payload) {
        if (endpoint !== 'pluginManager/setPluginEnabled' && endpoint !== 'pluginManager/setBundleEnabled')
            return;
        const plugin = endpoint === 'pluginManager/setPluginEnabled';
        const key = plugin ? 'id' : 'name';
        // Validate the actual Typert argument envelope; never authorize a nested alias
        // while forwarding different top-level arguments to the official Gateway.
        const parsed = z.object({ args: z.object({
                [key]: z.string().min(1).max(4096),
                enabled: z.boolean(),
            }).strict() }).strict().safeParse(payload);
        if (!parsed.success)
            throw new RpcError('INVALID_MESSAGE', 'Invalid plugin enablement request.');
        const args = parsed.data.args;
        const result = await this.gateway.dispatch(plugin ? 'pluginManager/listPlugins' : 'pluginManager/listBundles', { args: {} }, AbortSignal.timeout(60_000));
        if (!result.ok || !Array.isArray(result.value))
            throw new RpcError('PERMISSION_DENIED', 'Cannot verify the Host plugin inventory.');
        const row = result.value.find(value => isRecord(value) && value[plugin ? 'entryId' : 'name'] === args[key]);
        if (!isRecord(row) || row.readOnlyReason !== undefined)
            throw new RpcError('PERMISSION_DENIED', 'The Host plugin cannot be changed remotely.');
        const remoteModule = (value) => typeof value === 'string'
            && /^(?:ds-harness-remote|dsh-remote)(?:\/|$)/.test(value);
        if (remoteModule(plugin ? row.moduleName : row.name)
            || (!plugin && (!Array.isArray(row.rows) || row.rows.some(value => !isRecord(value) || remoteModule(value.moduleName))
                || (Array.isArray(row.overrides) && row.overrides.some(value => remoteModule(value) || value === 'ds-harness-remote-tui'))))) {
            throw new RpcError('PERMISSION_DENIED', 'The Remote plugin can only be enabled or disabled locally on the Host.');
        }
    }
    assertAllowed(endpoint) {
        if (!allowedEndpoints.has(endpoint) && !TERMINAL_CALLS.has(endpoint) && !TERMINAL_STREAMS.has(endpoint)) {
            throw new RpcError('METHOD_NOT_ALLOWED', 'The requested Harness Remote endpoint is not allowed.');
        }
        if (endpoint === '$events' && !this.gateway.supportsCarrier) {
            throw new RpcError('FEATURE_NOT_SUPPORTED', 'This Harness version does not support Remote event transport.');
        }
    }
    async pump(streamId, source, signal, historyFollow = false, transferFrames = false) {
        let reason = 'completed';
        let failure;
        try {
            for await (const value of source) {
                if (signal.aborted)
                    break;
                const frame = {
                    streamId,
                    hasValue: true,
                    ...(value === undefined ? {} : { value: historyFollow && this.compactHistoryEnabled && isCompactSnapshot(value) ? compactHistory(value) : value }),
                };
                if (encodeMessage(createEvent('harness.remote.frame', frame)).byteLength > MAX_SECURE_MESSAGE_BYTES) {
                    if (!transferFrames)
                        throw new Error('Oversized Harness Remote frame');
                    await this.transferStreamFrame(frame, signal);
                }
                else {
                    await this.publish('harness.remote.frame', frame);
                }
            }
            if (signal.aborted)
                reason = 'cancelled';
        }
        catch (error) {
            reason = signal.aborted ? 'cancelled' : 'failed';
            if (!signal.aborted)
                failure = this.gateway.failure(error);
        }
        finally {
            this.streams.delete(streamId);
            await this.publish('harness.remote.stream.closed', {
                streamId,
                reason,
                ...(failure === undefined ? {} : { failure }),
            }).catch(() => undefined);
        }
    }
    /** Keep the source paused until the Client reads and releases this exact item. */
    async transferStreamFrame(frame, signal) {
        signal.throwIfAborted();
        this.pruneTransfers();
        const bytes = new TextEncoder().encode(JSON.stringify(frame));
        if (bytes.byteLength > MAX_HARNESS_API_TRANSFER_BYTES)
            throw new Error('Harness Remote stream item exceeds the bounded transfer limit');
        if (this.outgoingTransfers.size >= MAX_ACTIVE_TRANSFERS)
            throw new Error('Too many Harness Remote response transfers are active');
        const transferId = randomUUID();
        const totalChunks = Math.ceil(bytes.byteLength / HARNESS_API_TRANSFER_CHUNK_BYTES);
        let finish;
        const completed = new Promise((resolve, reject) => { finish = error => error === undefined ? resolve() : reject(error); });
        // Attach a rejection handler before publishing; cancellation may race the write.
        void completed.catch(() => undefined);
        const transfer = { bytes, totalChunks, nextIndex: 0, touchedAt: Date.now(), finish };
        this.outgoingTransfers.set(transferId, transfer);
        const onAbort = () => finish(new Error('Harness Remote stream transfer cancelled'));
        signal.addEventListener('abort', onAbort, { once: true });
        const timer = setInterval(() => {
            if (Date.now() - transfer.touchedAt >= TRANSFER_IDLE_MS)
                finish(new Error('Harness Remote stream transfer timed out'));
        }, 1000);
        timer.unref();
        try {
            await this.publish('harness.remote.frame', {
                streamId: frame.streamId, hasValue: true,
                transfer: { kind: 'chunked', transferId, totalBytes: bytes.byteLength, totalChunks },
            });
            await completed;
        }
        finally {
            clearInterval(timer);
            signal.removeEventListener('abort', onAbort);
            this.outgoingTransfers.delete(transferId);
        }
    }
    pruneTransfers() {
        const cutoff = Date.now() - TRANSFER_IDLE_MS;
        for (const [id, transfer] of this.incomingTransfers)
            if (transfer.touchedAt < cutoff)
                this.incomingTransfers.delete(id);
        for (const [id, transfer] of this.outgoingTransfers)
            if (transfer.touchedAt < cutoff) {
                this.outgoingTransfers.delete(id);
                transfer.finish?.(new Error('Harness Remote stream transfer timed out'));
            }
    }
}
/**
 * DSH 0.1.7 changed workspaceFiles/changes from a Session-wide feed to a
 * target-scoped feed that requires `path`. Older Web/Client bundles still
 * open the Session-wide form. Keep that request working on a 0.1.7 Host by
 * watching the workspace root; the legacy client continues filtering frames
 * by the file it has opened. Do not add the field to older Hosts, whose
 * generated Typert schema rejects unknown arguments.
 */
function normalizeWorkspaceChangesPayload(endpoint, payload, harnessVersion) {
    if (endpoint !== 'workspaceFiles/changes' || !requiresWorkspaceChangePath(harnessVersion))
        return payload;
    if (!isRecord(payload) || !isRecord(payload.args) || Object.hasOwn(payload.args, 'path'))
        return payload;
    return { ...payload, args: { ...payload.args, path: '.' } };
}
/**
 * DSH 0.1.7 nests the byte range under `options`, while older clients send
 * it directly on the request args. Keep the translation Host-version gated:
 * older generated descriptors reject the new `options` field.
 */
function normalizeWorkspaceRequestPayload(endpoint, payload, harnessVersion) {
    if (!isRecord(payload) || !isRecord(payload.args))
        return payload;
    const args = payload.args;
    if (endpoint === 'workspaceFiles/readBytes' && requiresWorkspaceChangePath(harnessVersion)) {
        if (!Object.hasOwn(args, 'range') || Object.hasOwn(args, 'options'))
            return payload;
        const { range, ...rest } = args;
        return { ...payload, args: { ...rest, options: { range } } };
    }
    // DSH 0.2 removes the first-use naming request; accept a legacy client
    // payload while keeping the generated 0.2 endpoint's zero-argument shape.
    if (endpoint === 'workspace/initializeDefault' && isDshV02OrNewer(harnessVersion) && Object.hasOwn(args, 'request')) {
        const { request: _request, ...rest } = args;
        return { ...payload, args: rest };
    }
    return payload;
}
function isDshV02OrNewer(version) {
    const match = /^(?:dsh-)?v?(\d+)\.(\d+)\.(\d+)(?:-|$)/u.exec(version?.trim() ?? '');
    if (match === null)
        return false;
    return Number(match[1]) === 0 && Number(match[2]) >= 2;
}
function requiresWorkspaceChangePath(version) {
    const match = /^(?:dsh-)?v?(\d+)\.(\d+)\.(\d+)(?:-|$)/u.exec(version?.trim() ?? '');
    if (match === null)
        return false;
    return Number(match[1]) === 0
        && ((Number(match[2]) === 1 && Number(match[3]) >= 7) || Number(match[2]) === 2);
}
async function dispatchCommandForHost(gateway, payload, signal, harnessVersion) {
    const parsed = commandExecutePayloadSchema.parse(payload);
    const legacyPayload = {
        args: {
            agentId: parsed.args.agentId,
            line: parsed.args.line,
            images: parsed.args.images ?? [],
        },
    };
    const currentPayload = {
        args: {
            agentId: parsed.args.agentId,
            line: parsed.args.line,
            submittedAttachments: parsed.args.submittedAttachments ?? [],
        },
    };
    const args = harnessSessionGeneration(harnessVersion) === 'v3' ? currentPayload : legacyPayload;
    return gateway.dispatch('commands/execute', args, signal);
}
function decodeCanonicalBase64(value) {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value)
        throw new RpcError('INVALID_MESSAGE', 'The Harness Remote transfer chunk is invalid.');
    return bytes;
}
function normalizeWorkspaceBinaryResult(endpoint, result) {
    if (result.ok !== true || (endpoint !== 'workspaceFiles/readBytes' && endpoint !== 'officeToPdf/render'))
        return result;
    if (!isJsonRecord(result.value))
        return result;
    const directBytes = isBinary(result.value.data) ? result.value.data : undefined;
    const attachmentBytes = directBytes === undefined ? attachmentAt(result, ['data']) : undefined;
    if (directBytes === undefined && attachmentBytes === undefined)
        return result;
    const bytes = directBytes ?? attachmentBytes;
    return {
        ok: true,
        value: {
            ...result.value,
            data: Buffer.from(bytes).toString('base64'),
        },
    };
}
function attachmentAt(result, path) {
    const attachments = result.attachments;
    if (!Array.isArray(attachments))
        return undefined;
    const attachment = attachments.find(item => {
        if (!isJsonRecord(item) || !Array.isArray(item.path) || item.path.length !== path.length)
            return false;
        return item.path.every((part, index) => part === path[index]);
    });
    return isJsonRecord(attachment) && isBinary(attachment.bytes) ? attachment.bytes : undefined;
}
function isBinary(value) {
    return value instanceof Uint8Array;
}
function isJsonRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function concatChunks(chunks, totalBytes) {
    const result = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
function needsDirectoryFallback(result) {
    if (result.ok)
        return false;
    const code = result.error.code.toLocaleLowerCase();
    const message = result.error.message.toLocaleLowerCase();
    return code.includes('capability')
        || code === 'directory-picker/unavailable'
        || code === 'directory-picker-unavailable'
        || message.includes('browse capability')
        || message.includes('browser capability')
        || message.includes('brower capability')
        || message.includes('directory-picker-unavailable');
}
/** Hide this transport's own controls only in the remote inventory projection. */
function filterRemotePluginInventory(endpoint, result) {
    if (!result.ok)
        return result;
    const isRemote = (value) => typeof value === 'string'
        && /^(?:ds-harness-remote|dsh-remote)(?:\/|$)/.test(value);
    const filterEntries = (entries) => entries.filter(entry => !isRecord(entry) || !isRemote(entry.moduleName));
    if (endpoint === 'pluginManager/listPlugins' && Array.isArray(result.value)) {
        return { ...result, value: filterEntries(result.value) };
    }
    if (endpoint === 'pluginManager/listBundles' && Array.isArray(result.value)) {
        return { ...result, value: result.value
                .filter(bundle => !isRecord(bundle) || !isRemote(bundle.name))
                .map(bundle => isRecord(bundle) && Array.isArray(bundle.rows)
                ? { ...bundle, rows: filterEntries(bundle.rows) } : bundle) };
    }
    if (endpoint === 'pluginInventory/list' && isRecord(result.value) && Array.isArray(result.value.entries)) {
        return { ...result, value: { ...result.value, entries: filterEntries(result.value.entries) } };
    }
    return result;
}
function requestArgs(payload) {
    const root = record(payload);
    const args = isRecord(root.args) ? root.args : root;
    return record(args.request ?? args._request ?? args);
}
function record(value) {
    return isRecord(value) ? value : {};
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isCompactSnapshot(value) {
    return value !== null && typeof value === 'object' && value.type === 'snapshot';
}
//# sourceMappingURL=harness-remote-bridge.js.map