import { compactHistory } from './compact-history.js';
import { randomUUID } from 'node:crypto';
import { lstat, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
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
    'job/kill',
    'llm/discoverModels',
    'llm/listConfigurableProviders',
    'llm/listProviders',
    'messageFeedback/delete',
    'messageFeedback/list',
    'messageFeedback/put',
    'pluginInventory/list',
    'pluginManager/listBundles',
    'pluginManager/listPlugins',
    'pluginManager/listVersions',
    'pluginManager/readBundleDetail',
    'pluginManager/setBundleEnabled',
    'pluginManager/setPluginEnabled',
    'pluginManager/updateBundle',
    'permissionPresets/catalog',
    'schedule/list',
    'schedule/catalog',
    'schedule/history',
    'schedule/create',
    'schedule/update',
    'schedule/delete',
    'schedule/deleteInactive',
    'schedule/deliveryLimits',
    'schedule/edit',
    'schedule/run',
    'session/attachment',
    'session/cancel',
    'session/canOpenWorkspacePath',
    'session/control',
    'session/create',
    'session/follow',
    'session/fork',
    'session/list',
    'session/events',
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
    'toolResults/watch',
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
export const WORKSPACE_FILE_READ_ENDPOINTS = new Set([
    'workspaceFiles/read',
    'workspaceFiles/readBytes',
    'workspaceFiles/readAll',
    'workspaceFiles/stat',
]);
const MAX_READ_BYTES = 4 * 1024 * 1024;
/** Locale-independent "HH:mm" / "HH:mm:ss" / "HH:mm:ss.SSS". */
const LOCAL_TIME = /^\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/u;
const localTimeSchema = z.object({
    time: z.string().regex(LOCAL_TIME, 'expected HH:mm or HH:mm:ss'),
    time_zone: z.string().min(1).max(64),
}).strict();
const nonBlank = (max) => z.string().max(max).refine(value => value.trim().length > 0, 'must not be blank');
const scheduleCreateArgsSchema = z.object({
    sessionId: nonBlank(128),
    title: nonBlank(120),
    prompt: nonBlank(20_000),
    after_seconds: z.number().int().positive().max(31_536_000).optional(),
    at: z.union([
        z.string().min(1).max(64),
        z.object({ date: nonBlank(32), time: nonBlank(32), time_zone: nonBlank(64) }).strict(),
    ]).optional(),
    every_seconds: z.number().int().min(60).max(31_536_000).optional(),
    daily: localTimeSchema.optional(),
    weekly: z.object({
        time: z.string().regex(LOCAL_TIME, 'expected HH:mm or HH:mm:ss'),
        time_zone: z.string().min(1).max(64),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
            .refine(days => new Set(days).size === days.length, 'weekdays must be unique'),
    }).strict().optional(),
    cron: z.object({ expression: nonBlank(128), time_zone: z.string().min(1).max(64) }).strict().optional(),
}).strict();
/**
 * Refusals the reminder service publishes to clients. Anything else (fs errors,
 * storage faults, arbitrary thrown values) is reported as a generic failure so
 * internal detail never reaches the wire.
 */
const PUBLIC_SCHEDULE_ERRORS = {
    invalid_prompt: 'The reminder prompt was rejected.',
    invalid_selector: 'Exactly one reminder trigger is required.',
    invalid_rule: 'The reminder rule was rejected.',
    invalid_time_zone: 'The reminder time zone is not supported.',
    subagent_session: 'The target session is controlled by a delegated child.',
    session_not_found: 'The target session no longer exists.',
    schedule_limit: 'This session already has the maximum number of reminders.',
    schedule_ended: 'The reminder has already ended.',
    schedule_conflict: 'The reminder changed on the Host. Reload and retry.',
};
const allowedEndpoints = new Set(HARNESS_REMOTE_ALLOWLIST);
/** Host-side adapter from the encrypted peer channel to the official alpha Gateway carrier. */
export class HarnessRemoteBridge {
    gateway;
    publish;
    logger;
    harnessVersion;
    terminal;
    codexWorkspace;
    resolveWorkspaceRoot;
    schedule;
    compactHistoryEnabled = false;
    streams = new Map();
    incomingTransfers = new Map();
    outgoingTransfers = new Map();
    terminalCarrier;
    constructor(gateway, publish, logger, harnessVersion, terminal = new TerminalPolicy(() => false, "", new Map()), codexWorkspace, resolveWorkspaceRoot, schedule) {
        this.gateway = gateway;
        this.publish = publish;
        this.logger = logger;
        this.harnessVersion = harnessVersion;
        this.terminal = terminal;
        this.codexWorkspace = codexWorkspace;
        this.resolveWorkspaceRoot = resolveWorkspaceRoot;
        this.schedule = schedule;
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
        if (params.endpoint === 'schedule/create') {
            return this.createSchedule(params.payload);
        }
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
            let nativePayload = normalizeWorkspaceRequestPayload(params.endpoint, params.payload, this.harnessVersion);
            nativePayload = await normalizeSessionAttachmentPayload(params.endpoint, nativePayload, this.harnessVersion, this.gateway, signal);
            if (this.resolveWorkspaceRoot !== undefined && WORKSPACE_FILE_READ_ENDPOINTS.has(params.endpoint)) {
                nativePayload = await this.assertNativeWorkspaceFileCall(params.endpoint, nativePayload, signal);
            }
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
            const filteredResult = filterSessionListProjections(params.endpoint, result);
            const wireResult = normalizeWorkspaceBinaryResult(params.endpoint, this.compactHistoryEnabled && ['session/page', 'session/events', 'session/history', 'subagent/history'].includes(params.endpoint)
                ? compactHistory(filteredResult) : filteredResult);
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
    /** Validate one untrusted create request, then delegate to the Host schedule service. */
    async createSchedule(payload) {
        if (this.schedule === undefined) {
            return {
                ok: false,
                error: { code: 'FEATURE_NOT_SUPPORTED', message: 'This Host does not expose the schedule service.', details: {} },
            };
        }
        const args = requestArgs(payload);
        const selectors = ['after_seconds', 'at', 'every_seconds', 'daily', 'weekly', 'cron'].filter(key => args[key] !== undefined);
        if (selectors.length !== 1) {
            return {
                ok: false,
                error: { code: 'invalid_selector', message: 'Exactly one reminder selector is required.', details: {} },
            };
        }
        const parsed = scheduleCreateArgsSchema.safeParse(args);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return {
                ok: false,
                error: {
                    code: 'invalid_rule',
                    message: issue === undefined ? 'The reminder request is invalid.' : `${issue.path.join('.') || 'request'}: ${issue.message}`,
                    details: {},
                },
            };
        }
        const { sessionId, ...request } = parsed.data;
        try {
            // The service is expected to honour the signal; the timeout bounds how long
            // a stuck create can hold the bridge open, not the provider's own work.
            const record = await this.schedule.create(sessionId, request, AbortSignal.timeout(60_000));
            return { ok: true, value: record };
        }
        catch (error) {
            const published = isRecord(error) && typeof error.code === 'string' ? PUBLIC_SCHEDULE_ERRORS[error.code] : undefined;
            if (published === undefined) {
                return {
                    ok: false,
                    error: { code: 'FAILED', message: 'The Host could not create the reminder.', details: {} },
                };
            }
            const code = error.code;
            return { ok: false, error: { code, message: published, details: {} } };
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
        if (endpoint === 'pluginManager/updateBundle') {
            await this.checkRemoteBundleUpdate(payload);
            return;
        }
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
        if (remoteOwnedBundleRow(row, plugin)) {
            throw new RpcError('PERMISSION_DENIED', 'The Remote plugin can only be enabled or disabled locally on the Host.');
        }
    }
    /**
     * 0.2.2 adds official third-party bundle updates. Keep the mutation available
     * to trusted devices but never let a Remote user replace this plugin (or a
     * bundle owning it) from over the encrypted channel.
     */
    async checkRemoteBundleUpdate(payload) {
        const parsed = z.object({
            args: z.object({
                name: z.string().min(1).max(4096),
                version: z.string().min(1).max(256),
            }).strict(),
        }).strict().safeParse(payload);
        if (!parsed.success)
            throw new RpcError('INVALID_MESSAGE', 'Invalid plugin update request.');
        const result = await this.gateway.dispatch('pluginManager/listBundles', { args: {} }, AbortSignal.timeout(60_000));
        if (!result.ok || !Array.isArray(result.value))
            throw new RpcError('PERMISSION_DENIED', 'Cannot verify the Host plugin inventory.');
        const row = result.value.find(value => isRecord(value) && value.name === parsed.data.args.name);
        if (!isRecord(row) || row.readOnlyReason !== undefined || row.updatable !== true) {
            throw new RpcError('PERMISSION_DENIED', 'The Host plugin cannot be updated remotely.');
        }
        if (remoteOwnedBundleRow(row, false)) {
            throw new RpcError('PERMISSION_DENIED', 'The Remote plugin can only be updated locally on the Host.');
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
    async assertNativeWorkspaceFileCall(endpoint, payload, signal) {
        const rootPayload = isRecord(payload) ? payload : {};
        const args = requestArgs(payload);
        const sessionId = typeof args.workspaceFileScopeId === 'string'
            ? args.workspaceFileScopeId
            : typeof args.sessionId === 'string'
                ? args.sessionId
                : typeof args.agentId === 'string'
                    ? args.agentId
                    : undefined;
        if (sessionId === undefined) {
            throw new RpcError('WORKSPACE_UNAVAILABLE', 'The workspace identifier is missing.');
        }
        const sessionWorkspace = await this.resolveWorkspaceRootForSession(sessionId, signal);
        if (!sessionWorkspace) {
            throw new RpcError('WORKSPACE_UNAVAILABLE', 'The workspace is unavailable.');
        }
        const options = isRecord(args.options) ? args.options : undefined;
        const rawBaseFile = endpoint === 'workspaceFiles/readBytes'
            ? (typeof options?.baseFile === 'string' ? options.baseFile : (typeof args.baseFile === 'string' ? args.baseFile : undefined))
            : undefined;
        if (endpoint === 'workspaceFiles/readBytes') {
            if (options !== undefined && 'baseFile' in options && options.baseFile !== undefined && typeof options.baseFile !== 'string') {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
            if ('baseFile' in args && args.baseFile !== undefined && typeof args.baseFile !== 'string') {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
        }
        let safeRel;
        if (rawBaseFile !== undefined) {
            const path = typeof args.path === 'string' ? args.path : '';
            const relative = path.replaceAll('\\', '/');
            if (relative.length === 0 || relative.startsWith('/') || /^[a-z][a-z\d+.-]*:/iu.test(relative) || relative.includes('\x00')) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
            const baseSegments = process.platform === 'win32' ? rawBaseFile.replaceAll('\\', '/').split('/') : rawBaseFile.split('/');
            if (baseSegments.some(segment => segment === '..')) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
            const safeBaseRel = await this.verifyWorkspacePathContainment(sessionWorkspace.root, sessionWorkspace.cwd, rawBaseFile, endpoint);
            const baseCandidate = resolve(sessionWorkspace.root, safeBaseRel);
            const baseDir = dirname(baseCandidate);
            const targetCandidate = resolve(baseDir, path);
            safeRel = await this.verifyWorkspacePathContainment(sessionWorkspace.root, sessionWorkspace.cwd, targetCandidate, endpoint);
        }
        else {
            const path = typeof args.path === 'string' ? args.path : '.';
            const pathSegments = process.platform === 'win32' ? path.replaceAll('\\', '/').split('/') : path.split('/');
            if (pathSegments.some(segment => segment === '..')) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
            safeRel = await this.verifyWorkspacePathContainment(sessionWorkspace.root, sessionWorkspace.cwd, path, endpoint);
        }
        let finalArgs = isRecord(rootPayload.args)
            ? { ...rootPayload.args, path: safeRel }
            : { ...rootPayload, path: safeRel };
        if (isRecord(finalArgs.options)) {
            const { baseFile: _baseFile, ...restOptions } = finalArgs.options;
            finalArgs.options = restOptions;
        }
        delete finalArgs.baseFile;
        if (endpoint === 'workspaceFiles/readBytes') {
            const range = byteOrLineRange(finalArgs);
            const offset = typeof range.offset === 'number' && Number.isInteger(range.offset) && range.offset >= 0 ? range.offset : 0;
            const rawLength = typeof range.length === 'number' && Number.isInteger(range.length) && range.length > 0 ? range.length : MAX_READ_BYTES;
            const boundedLength = Math.min(rawLength, MAX_READ_BYTES);
            const normalizedRange = { offset, length: boundedLength };
            if (requiresWorkspaceChangePath(this.harnessVersion)) {
                finalArgs.options = { ...(isRecord(finalArgs.options) ? finalArgs.options : {}), range: normalizedRange };
                delete finalArgs.range;
            }
            else {
                finalArgs.range = normalizedRange;
                if (isRecord(finalArgs.options)) {
                    finalArgs.options = { ...finalArgs.options, range: normalizedRange };
                }
            }
            if ('offset' in finalArgs || 'length' in finalArgs) {
                finalArgs.offset = offset;
                finalArgs.length = boundedLength;
            }
        }
        return isRecord(rootPayload.args) ? { ...rootPayload, args: finalArgs } : finalArgs;
    }
    async resolveWorkspaceRootForSession(sessionId, signal) {
        signal.throwIfAborted();
        if (this.resolveWorkspaceRoot === undefined) {
            return undefined;
        }
        const cwd = await this.resolveWorkspaceRoot(sessionId, signal);
        if (!cwd) {
            throw new RpcError('WORKSPACE_UNAVAILABLE', 'The workspace is unavailable.');
        }
        try {
            const root = await realpath(cwd);
            const info = await stat(root);
            if (!info.isDirectory())
                throw new Error();
            return { root, cwd };
        }
        catch {
            throw new RpcError('WORKSPACE_UNAVAILABLE', 'The workspace is unavailable.');
        }
    }
    async verifyWorkspacePathContainment(root, cwd, path, endpoint) {
        const candidate = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
        if (process.platform === 'win32') {
            const rootDrive = parse(root).root.toLowerCase();
            const candDrive = parse(candidate).root.toLowerCase();
            if (rootDrive !== candDrive) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
        }
        const relCwd = relative(cwd, candidate);
        const relRoot = relative(root, candidate);
        if (isPathOutside(relCwd) && isPathOutside(relRoot)) {
            throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
        }
        try {
            const rootLstat = await lstat(root);
            if (rootLstat.isSymbolicLink() || !rootLstat.isDirectory()) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The workspace root is invalid or a symlink.');
            }
            const base = !isPathOutside(relCwd) ? cwd : root;
            const rel = relative(base, candidate);
            const parts = rel.split(sep).filter(p => p.length > 0 && p !== '.');
            let currentPath = base;
            for (let i = 0; i < parts.length - 1; i++) {
                currentPath = join(currentPath, parts[i]);
                const dirRel = relative(base, currentPath);
                if (isPathOutside(dirRel)) {
                    throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
                }
                const dirLstat = await lstat(currentPath);
                if (dirLstat.isSymbolicLink() || !dirLstat.isDirectory()) {
                    throw new RpcError('WORKSPACE_PATH_DENIED', 'An ancestor directory is invalid or a symlink.');
                }
            }
            const targetLstat = await lstat(candidate);
            if (targetLstat.isSymbolicLink()) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is not a regular file.');
            }
            const canonical = await realpath(candidate);
            if (process.platform === 'win32') {
                const rootDrive = parse(root).root.toLowerCase();
                const canonicalDrive = parse(canonical).root.toLowerCase();
                if (rootDrive !== canonicalDrive) {
                    throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
                }
            }
            const canonicalRel = relative(root, canonical);
            if (isPathOutside(canonicalRel)) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
            const info = await stat(canonical);
            if (endpoint !== 'workspaceFiles/stat' && !info.isFile()) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is not a regular file.');
            }
            if (endpoint === 'workspaceFiles/readAll' && Number(info.size) > MAX_READ_BYTES) {
                throw new RpcError('WORKSPACE_TOO_LARGE', 'The requested workspace file is too large.');
            }
            // On Windows normalize backslashes to slashes; on POSIX backslashes are valid filename characters and must not be mangled
            const safeRel = canonicalRel === '' ? '.' : (process.platform === 'win32' ? canonicalRel.replaceAll('\\', '/') : canonicalRel);
            // Validate the exact path passed to the gateway resolves within workspace
            const dispatchedCandidate = resolve(root, safeRel);
            const dispatchedCanonical = await realpath(dispatchedCandidate);
            const dispatchedRel = relative(root, dispatchedCanonical);
            if (isPathOutside(dispatchedRel)) {
                throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is outside the workspace.');
            }
            return safeRel;
        }
        catch (error) {
            if (error instanceof RpcError)
                throw error;
            throw new RpcError('WORKSPACE_PATH_DENIED', 'The requested workspace path is unavailable.');
        }
    }
}
function isPathOutside(rel) {
    if (rel === '..' || isAbsolute(rel))
        return true;
    if (process.platform === 'win32') {
        return rel.startsWith('..\\') || rel.startsWith('../');
    }
    return rel.startsWith('../');
}
function byteOrLineRange(args) {
    const options = isRecord(args.options) ? args.options : undefined;
    if (options !== undefined && isRecord(options.range))
        return options.range;
    return isRecord(args.range) ? args.range : args;
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
/**
 * 0.2.2 changed `session/attachment` from one durable id to the full
 * `ImageAttachmentRef` (the Host now verifies media type, byte length and
 * dimensions against the stored object). Older Hosts only understand the id,
 * and their strict codec rejects an unexpected `attachment` field, so reduce a
 * Remote client's reference to `{ sessionId, attachmentId }` before dispatch.
 *
 * On a 0.2.2+ Host, a legacy client that only persisted the durable id cannot
 * supply the verified reference. Recover it from the session's persisted events
 * (`session/events`, `session/page`, `session/history`) and fill
 * `request.attachment` so the Host can still verify and return the image.
 */
async function normalizeSessionAttachmentPayload(endpoint, payload, harnessVersion, gateway, signal) {
    if (endpoint !== 'session/attachment' || !isRecord(payload) || !isRecord(payload.args))
        return payload;
    const request = isRecord(payload.args.request) ? payload.args.request : undefined;
    if (request === undefined)
        return payload;
    const attachment = isRecord(request.attachment) ? request.attachment : undefined;
    const attachmentId = attachment !== undefined && typeof attachment.attachmentId === 'string'
        ? attachment.attachmentId
        : typeof request.attachmentId === 'string' ? request.attachmentId : undefined;
    if (attachmentId === undefined)
        return payload;
    if (!isDshV022OrNewer(harnessVersion)) {
        // Pre-0.2.2 strict codec only accepts the durable id.
        const sessionId = request.sessionId;
        return { ...payload, args: { ...payload.args, request: { sessionId, attachmentId } } };
    }
    // If the client already supplied a complete reference, keep it honest.
    if (attachment !== undefined && isCompleteImageReference(attachment))
        return payload;
    const reference = await findSessionAttachmentReference(gateway, request.sessionId, attachmentId, signal);
    if (reference === undefined)
        return payload;
    const mergedAttachment = attachment !== undefined ? { ...reference, ...attachment } : reference;
    return { ...payload, args: { ...payload.args, request: { ...request, attachment: mergedAttachment } } };
}
/** Best-effort recovery of the full `ImageAttachmentRef` a 0.2.2 Host verifies. */
async function findSessionAttachmentReference(gateway, sessionId, attachmentId, signal) {
    if (typeof sessionId !== 'string' || sessionId.length === 0)
        return undefined;
    // 1. Try session/events first (complete live stream if available)
    try {
        const result = await gateway.dispatch('session/events', { args: { request: { address: { kind: 'session', sessionId } } } }, signal);
        const reference = extractAttachmentReference(result, attachmentId);
        if (reference !== undefined)
            return reference;
    }
    catch {
        // Fall back to paginated session/page
    }
    // 2. Try paginating through session/page
    let beforeSeq = undefined;
    for (let page = 0; page < 10; page += 1) {
        try {
            const pageRequest = {
                address: { kind: 'session', sessionId },
                maxMessages: 200,
                ...(beforeSeq !== undefined ? { beforeSeq } : {}),
            };
            const result = await gateway.dispatch('session/page', { args: { request: pageRequest } }, signal);
            const reference = extractAttachmentReference(result, attachmentId);
            if (reference !== undefined)
                return reference;
            if (result.ok === true && isRecord(result.value)) {
                if (result.value.hasMore === true && typeof result.value.beforeSeq === 'number') {
                    beforeSeq = result.value.beforeSeq;
                    continue;
                }
            }
            break;
        }
        catch {
            break;
        }
    }
    // 3. Fallback to session/history for older 0.2.x shapes
    try {
        const result = await gateway.dispatch('session/history', { args: { request: { sessionId, maxMessages: 200 } } }, signal);
        const reference = extractAttachmentReference(result, attachmentId);
        if (reference !== undefined)
            return reference;
    }
    catch { }
    return undefined;
}
/** Locate a complete image reference inside an events/records response. */
function extractAttachmentReference(result, attachmentId) {
    if (result.ok !== true)
        return undefined;
    const value = result.value;
    let records;
    if (Array.isArray(value))
        records = value;
    else if (isRecord(value)) {
        if (Array.isArray(value.records))
            records = value.records;
        else if (Array.isArray(value.events))
            records = value.events;
    }
    if (records === undefined)
        return undefined;
    for (const record of records) {
        const found = findImageReference(record, attachmentId, 0);
        if (found !== undefined)
            return found;
    }
    return undefined;
}
/** Recursively find an image block carrying a complete reference for `attachmentId`. */
function findImageReference(value, attachmentId, depth) {
    if (depth > 12 || value === null || typeof value !== 'object')
        return undefined;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findImageReference(item, attachmentId, depth + 1);
            if (found !== undefined)
                return found;
        }
        return undefined;
    }
    const block = value;
    const candidate = isRecord(block.attachment) ? block.attachment : block;
    const candidateId = typeof candidate.attachmentId === 'string' ? candidate.attachmentId : undefined;
    if (candidateId === attachmentId && isCompleteImageReference(candidate)) {
        return {
            attachmentId,
            mediaType: candidate.mediaType,
            bytes: candidate.bytes,
            width: candidate.width,
            height: candidate.height,
            ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
        };
    }
    for (const nested of Object.values(block)) {
        if (nested === null || typeof nested !== 'object')
            continue;
        const found = findImageReference(nested, attachmentId, depth + 1);
        if (found !== undefined)
            return found;
    }
    return undefined;
}
function isCompleteImageReference(value) {
    return typeof value.mediaType === 'string'
        && typeof value.bytes === 'number'
        && typeof value.width === 'number'
        && typeof value.height === 'number';
}
/** Whether this Host reads the 0.2.2 attachment-reference request shape. */
function isDshV022OrNewer(version) {
    const match = /^(?:dsh-)?v?(\d+)\.(\d+)\.(\d+)(?:-|$)/u.exec(version?.trim() ?? '');
    if (match === null)
        return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    return major > 0 || (major === 0 && (minor > 2 || (minor === 2 && patch >= 2)));
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
const SESSION_PROJECTION_WHITELIST = new Set([
    'permissions',
    'remoteStatusKnown',
    'codexStatus',
    'inbox',
    'agentTeam',
    'turnOutline',
    'imageLimits',
    'turn',
    'turnState',
    'model',
    'status',
    'activeTurnId',
    'modelSelection',
    'userQuestions',
    'agentPreset',
    'sessionListMetadata',
    'title',
    'sessionTitle',
    'conversationTitle',
    'label',
    'name',
    'summary',
    'metadata',
    'session',
    'data',
    'view',
    'sessionStats',
    'tokenUsage',
]);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_WHITELIST_PROJECTION_BYTES = 64 * 1024;
const MAX_UNKNOWN_PROJECTION_BYTES = 4096;
function filterSessionProjections(session) {
    if (!isRecord(session) || !isRecord(session.projections) || !isRecord(session.projections.values)) {
        return session;
    }
    const originalValues = session.projections.values;
    const filteredValues = {};
    let changed = false;
    for (const [key, value] of Object.entries(originalValues)) {
        if (DANGEROUS_KEYS.has(key)) {
            changed = true;
            continue;
        }
        const isWhitelisted = SESSION_PROJECTION_WHITELIST.has(key);
        const limitBytes = isWhitelisted ? MAX_WHITELIST_PROJECTION_BYTES : MAX_UNKNOWN_PROJECTION_BYTES;
        try {
            const serialized = JSON.stringify(value);
            if (typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') <= limitBytes) {
                filteredValues[key] = value;
            }
            else {
                changed = true;
            }
        }
        catch {
            changed = true;
        }
    }
    if (!changed)
        return session;
    return {
        ...session,
        projections: {
            ...session.projections,
            values: filteredValues,
        },
    };
}
/**
 * A session catalogue above the client row bound cannot be listed at all: every
 * client validates the shared list against a fixed maximum (2 048 rows today)
 * before it filters by workspace, so one large account blanks the whole Remote
 * surface (measured 5 431 rows, 4 701 of them subagent Sessions). Degrade only
 * when the bound is actually exceeded, and degrade by dropping the rows that no
 * client lists as roots instead of failing the listing.
 */
const SESSION_LIST_ROW_BUDGET = 2_048;
function trimSessionCatalogRows(endpoint, items) {
    if (endpoint !== 'session/list' || items.length <= SESSION_LIST_ROW_BUDGET)
        return items;
    const roots = items.filter(isListableRemoteSession);
    const kept = roots.length > 0 ? roots : items;
    return kept.length <= SESSION_LIST_ROW_BUDGET
        ? kept
        : kept.slice().sort((left, right) => updatedAtOf(right) - updatedAtOf(left)).slice(0, SESSION_LIST_ROW_BUDGET);
}
function isListableRemoteSession(session) {
    return isRecord(session) && session.parentSessionId === undefined && session.origin !== 'subagent';
}
function updatedAtOf(session) {
    return isRecord(session) && typeof session.updatedAt === 'number' ? session.updatedAt : 0;
}
/**
 * Harness 0.2.2 dropped the top-level `title` from SessionSummary rows; the
 * durable title stays in the projection block, so Remote lists render blank
 * names unless the Host lifts it back onto the row.
 */
function withSessionRowTitle(session) {
    if (!isRecord(session) || (typeof session.title === 'string' && session.title !== ''))
        return session;
    const values = isRecord(session.projections) ? session.projections.values : undefined;
    const title = isRecord(values) ? values.title : undefined;
    return typeof title === 'string' && title !== '' ? { ...session, title } : session;
}
export function filterSessionListProjections(resultOrEndpoint, maybeResult) {
    const endpoint = typeof resultOrEndpoint === 'string' ? resultOrEndpoint : undefined;
    const result = endpoint === undefined ? resultOrEndpoint : maybeResult;
    if (endpoint !== undefined && endpoint !== 'session/list' && endpoint !== 'session/search')
        return result;
    if (!result || !result.ok)
        return result;
    const filterList = (items) => trimSessionCatalogRows(endpoint, items)
        .map(filterSessionProjections)
        .map(withSessionRowTitle);
    if (isRecord(result.value)) {
        let changed = false;
        const updated = { ...result.value };
        if (Array.isArray(result.value.items)) {
            updated.items = filterList(result.value.items);
            changed = true;
        }
        if (Array.isArray(result.value.sessions)) {
            updated.sessions = filterList(result.value.sessions);
            changed = true;
        }
        if (changed)
            return { ...result, value: updated };
    }
    if (Array.isArray(result.value)) {
        return {
            ...result,
            value: filterList(result.value),
        };
    }
    return result;
}
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
/** Whether one official plugin-manager row belongs to this Remote plugin or its bundle. */
function remoteOwnedBundleRow(row, plugin) {
    const remoteModule = (value) => typeof value === 'string'
        && /^(?:ds-harness-remote|dsh-remote)(?:\/|$)/.test(value);
    if (remoteModule(plugin ? row.moduleName : row.name))
        return true;
    return !plugin && (!Array.isArray(row.rows)
        || row.rows.some(value => !isRecord(value) || remoteModule(value.moduleName))
        || (Array.isArray(row.overrides)
            && row.overrides.some(value => remoteModule(value))));
}
//# sourceMappingURL=harness-remote-bridge.js.map