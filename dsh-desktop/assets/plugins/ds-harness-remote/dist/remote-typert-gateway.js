import { RemoteClientError } from '@dsh-remote/client-core';
import { HARNESS_API_TRANSFER_CHUNK_BYTES, MAX_HARNESS_API_TRANSFER_BYTES, } from '@dsh-remote/protocol';
import { uuidV7 } from './ids.js';
import { normalizeAssistantMessageStreamValue, normalizeLegacySessionGatewayValue, } from './session-format-compat.js';
const DIRECT_REMOTE_CALL_BYTES = 2 * 1024 * 1024;
const WELCOME_NOTICE_NAMESPACE = 'ui-settings-general';
const WELCOME_NOTICE_FIELD = 'welcomeNoticeVersion';
const WELCOME_NOTICE_VERSION = '2026-08-13.1';
/** Client-side alpha Gateway carrier over the authenticated Remote channel. */
export class RemoteTypertGateway {
    client;
    compatibility;
    harnessVersion;
    frameTransfers;
    constructor(client, compatibility, harnessVersion) {
        this.client = client;
        this.compatibility = compatibility;
        this.harnessVersion = harnessVersion;
    }
    async invoke(request) {
        const result = await this.dispatch(`${request.namespace}/${request.method}`, { args: request.args }, request.signal ?? new AbortController().signal);
        if (result.ok)
            return result.value;
        throw remoteFailure(result.error);
    }
    async dispatch(endpoint, payload, signal) {
        // The Remote Gateway contract requires a single plain-object `args` field.
        // Keep the payload unchanged here: converting it to positional arrays makes
        // current Hosts reject even empty calls such as `llm/listProviders`.
        const request = { endpoint, payload };
        const encoded = new TextEncoder().encode(JSON.stringify(request));
        let response;
        if (encoded.byteLength > DIRECT_REMOTE_CALL_BYTES) {
            response = await this.callTransferred(encoded, signal);
        }
        else {
            try {
                response = await this.client.rpc('harness.remote.call', request, signal);
            }
            catch (error) {
                if (!hasErrorCode(error, 'RESPONSE_TOO_LARGE'))
                    throw error;
                response = await this.callTransferred(encoded, signal);
            }
        }
        const result = normalizeThemeSettingsResult(endpoint, parseRpcResult(response));
        const settingsResult = this.normalizeLegacyWelcomeSettings(endpoint, payload, result);
        if (settingsResult !== undefined)
            return settingsResult;
        if (result.ok) {
            const value = this.compatibility === 'legacy-to-v3'
                ? normalizeLegacySessionGatewayValue(endpoint, result.value)
                : normalizeAssistantMessageStreamValue(endpoint, result.value);
            return { ...result, value: normalizeProjectionResult(endpoint, normalizeWorkspaceBinaryResult(endpoint, value)) };
        }
        return result;
    }
    legacyWelcomeAcknowledged = false;
    settingsDescribeValue;
    /** DSH <=0.1.6 cannot persist the 0.1.7 welcome acknowledgement remotely. */
    normalizeLegacyWelcomeSettings(endpoint, payload, result) {
        if (!isLegacyRemoteHost(this.harnessVersion))
            return undefined;
        if (endpoint === 'settings/describe' && result.ok && isRecord(result.value)) {
            this.settingsDescribeValue = result.value;
            return this.legacyWelcomeAcknowledged ? { ...result, value: patchWelcomeDescribe(result.value) } : undefined;
        }
        if (endpoint !== 'settings/mutate' || !isRecord(payload) || !isRecord(payload.args))
            return undefined;
        const args = payload.args;
        if (args.ns !== WELCOME_NOTICE_NAMESPACE || !isWelcomeNoticeOperation(args.ops))
            return undefined;
        // Older Hosts reject the 0.1.7 onboarding field before returning a usable
        // settings snapshot. Treat the acknowledgement as client-local in that
        // case; a later describe is patched when one becomes available.
        const value = patchWelcomeDescribe(this.settingsDescribeValue ?? { namespaces: [] });
        this.legacyWelcomeAcknowledged = true;
        return { ok: true, value };
    }
    async open(endpoint, payload, signal) {
        if (this.frameTransfers === undefined) {
            const description = await this.client.rpc('harness.transport.describe', {}, signal);
            this.frameTransfers = isRecord(description) && Array.isArray(description.capabilities)
                && description.capabilities.includes('harness.remote.stream.transfer.v1');
        }
        signal.throwIfAborted();
        const streamId = uuidV7();
        const queue = new AsyncValueQueue();
        const lifetime = new AbortController();
        const transferSignal = AbortSignal.any([signal, lifetime.signal]);
        const unsubscribe = this.client.onEvent(event => routeStreamEvent(event, streamId, queue));
        const unsubscribeClose = this.client.onClose(() => {
            lifetime.abort();
            queue.fail(new RemoteClientError('TRANSPORT_CLOSED', 'The remote Harness stream transport closed.'));
        });
        const onAbort = () => {
            lifetime.abort();
            queue.close();
            unsubscribe();
            unsubscribeClose();
            void this.client.rpc('harness.remote.stream.close', { streamId }, undefined, { timeoutMs: 5000 }).catch(() => undefined);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
            await this.client.rpc('harness.remote.stream.open', {
                streamId, endpoint, payload, ...(this.frameTransfers ? { transferFrames: true } : {}),
            }, signal);
        }
        catch (error) {
            signal.removeEventListener('abort', onAbort);
            unsubscribe();
            unsubscribeClose();
            lifetime.abort();
            void this.client.rpc('harness.remote.stream.close', { streamId }).catch(() => undefined);
            throw error;
        }
        return this.iterate(streamId, endpoint, queue, unsubscribe, unsubscribeClose, signal, onAbort, lifetime, transferSignal);
    }
    async *iterate(streamId, endpoint, queue, unsubscribe, unsubscribeClose, signal, onAbort, lifetime, transferSignal) {
        try {
            for await (const item of queue) {
                let frame = item;
                if (frame.transfer !== undefined) {
                    if (!this.frameTransfers || Object.hasOwn(frame, 'value'))
                        throw new Error('Unnegotiated or ambiguous Harness Remote stream transfer');
                    const descriptor = frame.transfer;
                    try {
                        const decoded = await this.readTransferred(descriptor, transferSignal);
                        if (!isRecord(decoded) || decoded.streamId !== streamId || decoded.hasValue !== true || Object.hasOwn(decoded, 'transfer')) {
                            throw new Error('Invalid Harness Remote transferred stream frame');
                        }
                        frame = decoded;
                    }
                    finally {
                        if (typeof descriptor.transferId === 'string') {
                            await this.client.rpc('harness.remote.transfer.close', { transferId: descriptor.transferId }, undefined, { timeoutMs: 5000 }).catch(() => undefined);
                        }
                    }
                }
                transferSignal.throwIfAborted();
                const value = frame.value;
                yield this.compatibility === 'legacy-to-v3'
                    ? normalizeLegacySessionGatewayValue(endpoint, value)
                    : normalizeAssistantMessageStreamValue(endpoint, value);
            }
        }
        finally {
            lifetime.abort();
            signal.removeEventListener('abort', onAbort);
            unsubscribe();
            unsubscribeClose();
            queue.close();
            await this.client.rpc('harness.remote.stream.close', { streamId }).catch(() => undefined);
        }
    }
    async callTransferred(encoded, signal) {
        if (encoded.byteLength > MAX_HARNESS_API_TRANSFER_BYTES) {
            throw new Error('The Harness Remote request exceeds the transfer limit.');
        }
        const transferId = uuidV7();
        const totalChunks = Math.ceil(encoded.byteLength / HARNESS_API_TRANSFER_CHUNK_BYTES);
        let opened = false;
        try {
            await this.client.rpc('harness.remote.transfer.open', {
                transferId,
                totalBytes: encoded.byteLength,
                totalChunks,
            }, signal);
            opened = true;
            for (let index = 0; index < totalChunks; index += 1) {
                const start = index * HARNESS_API_TRANSFER_CHUNK_BYTES;
                const chunk = encoded.subarray(start, Math.min(start + HARNESS_API_TRANSFER_CHUNK_BYTES, encoded.byteLength));
                await this.client.rpc('harness.remote.transfer.chunk', {
                    transferId,
                    index,
                    data: bytesToBase64(chunk),
                }, signal);
            }
            const committed = await this.client.rpc('harness.remote.transfer.commit', { transferId }, signal);
            if (committed.kind === 'inline')
                return committed.response;
            if (committed.transferId !== transferId) {
                throw new Error('The remote Host returned an invalid Harness Remote transfer descriptor.');
            }
            return await this.readTransferred(committed, signal);
        }
        finally {
            if (opened)
                await this.client.rpc('harness.remote.transfer.close', { transferId }).catch(() => undefined);
        }
    }
    async readTransferred(committed, signal) {
        if (committed.kind !== 'chunked' || typeof committed.transferId !== 'string'
            || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(committed.transferId)
            || !Number.isSafeInteger(committed.totalBytes) || committed.totalBytes <= 0
            || committed.totalBytes > MAX_HARNESS_API_TRANSFER_BYTES
            || committed.totalChunks !== Math.ceil(committed.totalBytes / HARNESS_API_TRANSFER_CHUNK_BYTES)) {
            throw new Error('The remote Host returned an invalid Harness Remote transfer descriptor.');
        }
        signal.throwIfAborted();
        const { transferId } = committed;
        const responseBytes = new Uint8Array(committed.totalBytes);
        let offset = 0;
        for (let index = 0; index < committed.totalChunks; index += 1) {
            const result = await this.client.rpc('harness.remote.transfer.read', { transferId, index }, signal);
            if (result.transferId !== transferId || result.index !== index) {
                throw new Error('The remote Host returned an out-of-order Harness Remote transfer chunk.');
            }
            const chunk = base64ToBytes(result.data);
            const expectedBytes = Math.min(HARNESS_API_TRANSFER_CHUNK_BYTES, committed.totalBytes - offset);
            if (chunk.byteLength !== expectedBytes) {
                throw new Error('The remote Host returned an invalid Harness Remote transfer chunk.');
            }
            responseBytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(responseBytes));
    }
}
class AsyncValueQueue {
    values = [];
    bytes = 0;
    waiters = [];
    closed = false;
    error;
    push(value) {
        if (this.closed)
            return;
        const waiter = this.waiters.shift();
        if (waiter !== undefined) {
            waiter({ done: false, value });
            return;
        }
        const bytes = new TextEncoder().encode(JSON.stringify(value) ?? '').byteLength;
        if (this.values.length >= 256 || this.bytes + bytes > 4 * 1024 * 1024) {
            this.values.length = 0;
            this.bytes = 0;
            this.fail(new RemoteClientError('TRANSPORT_CLOSED', 'Remote stream consumer is too slow; reconnect to recover.'));
            return;
        }
        this.bytes += bytes;
        this.values.push({ value, bytes });
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const waiter of this.waiters.splice(0))
            waiter({ done: true, value: undefined });
    }
    fail(error) {
        if (this.closed)
            return;
        this.error = error;
        this.close();
    }
    async *[Symbol.asyncIterator]() {
        while (true) {
            if (this.values.length > 0) {
                const entry = this.values.shift();
                this.bytes -= entry.bytes;
                yield entry.value;
                continue;
            }
            if (this.closed) {
                if (this.error !== undefined)
                    throw this.error;
                return;
            }
            const next = await new Promise(resolve => this.waiters.push(resolve));
            if (next.done) {
                if (this.error !== undefined)
                    throw this.error;
                return;
            }
            yield next.value;
        }
    }
}
function routeStreamEvent(event, streamId, queue) {
    if (event.event === 'harness.remote.frame') {
        const data = event.data;
        if (data.streamId === streamId && data.hasValue === true)
            queue.push(data);
        return;
    }
    if (event.event !== 'harness.remote.stream.closed')
        return;
    const data = event.data;
    if (data.streamId !== streamId)
        return;
    if (data.reason === 'failed') {
        const failure = data.failure;
        queue.fail(remoteFailure({
            code: typeof failure?.code === 'string' ? failure.code : 'internal',
            message: typeof failure?.message === 'string' ? failure.message : 'The remote Harness stream failed.',
            details: isRecord(failure?.details) ? failure.details : {},
        }));
    }
    else {
        queue.close();
    }
}
function parseRpcResult(value) {
    if (!isRecord(value))
        throw new Error('The remote Host returned an invalid Gateway result.');
    if (value.ok === true)
        return Object.hasOwn(value, 'value') ? { ok: true, value: value.value } : { ok: true };
    if (value.ok !== false || !isRecord(value.error)
        || typeof value.error.code !== 'string'
        || typeof value.error.message !== 'string'
        || !isRecord(value.error.details)) {
        throw new Error('The remote Host returned an invalid Gateway failure.');
    }
    return {
        ok: false,
        error: { code: value.error.code, message: value.error.message, details: value.error.details },
    };
}
function remoteFailure(failure) {
    // v0.1.2-alpha.2+ identifies RemoteError values structurally across bundles and
    // realms. Keep this carrier dependency-free so the same build still runs on
    // older Harness releases, while preserving current stream failures at the local mux.
    return Object.assign(new Error(failure.message), {
        isDSHRemoteError: true,
        code: failure.code,
        details: failure.details,
    });
}
function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.byteLength)));
    }
    return btoa(binary);
}
function base64ToBytes(value) {
    let binary;
    try {
        binary = atob(value);
    }
    catch {
        throw new Error('The remote Host returned malformed Harness Remote transfer data.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
    if (bytesToBase64(bytes) !== value)
        throw new Error('The remote Host returned non-canonical Harness Remote transfer data.');
    return bytes;
}
/** Restore binary fields after the JSON-only Remote carrier. */
function normalizeWorkspaceBinaryResult(endpoint, value) {
    if (endpoint !== 'workspaceFiles/readBytes' && endpoint !== 'officeToPdf/render')
        return value;
    if (!isRecord(value) || typeof value.data !== 'string')
        return value;
    return { ...value, data: base64ToBytes(value.data) };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasErrorCode(error, code) {
    return error instanceof Error && 'code' in error && error.code === code;
}
function isLegacyRemoteHost(version) {
    if (version === undefined)
        return false;
    const match = /^(?:dsh-)?v?(\d+)\.(\d+)\.(\d+)(?:-|$)/u.exec(version.trim());
    if (match === null)
        return false;
    return Number(match[1]) === 0 && Number(match[2]) === 1 && Number(match[3]) < 7;
}
function isWelcomeNoticeOperation(value) {
    return Array.isArray(value) && value.some(operation => (isRecord(operation)
        && operation.op === 'set'
        && Array.isArray(operation.path)
        && operation.path.length === 1
        && operation.path[0] === WELCOME_NOTICE_FIELD
        && operation.value === WELCOME_NOTICE_VERSION));
}
function patchWelcomeDescribe(value) {
    if (!Array.isArray(value.namespaces))
        return value;
    const namespaces = value.namespaces.map(namespace => {
        if (!isRecord(namespace) || namespace.ns !== WELCOME_NOTICE_NAMESPACE)
            return namespace;
        const current = isRecord(namespace.value) ? namespace.value : {};
        return { ...namespace, value: { ...current, [WELCOME_NOTICE_FIELD]: WELCOME_NOTICE_VERSION } };
    });
    return { ...value, namespaces };
}
/** Older Hosts return the exact projection cut without RC.1's discriminator. */
function normalizeProjectionResult(endpoint, value) {
    if (endpoint !== 'session/projections' || !isRecord(value) || value.kind !== undefined)
        return value;
    return Number.isSafeInteger(value.asOfSeq) && isRecord(value.values) ? { ...value, kind: 'sequenced' } : value;
}
/**
 * RC.1's ThemeRuntime reads the new font fields before providing `theme`.
 * A 0.2.0 Host's valid theme section lacks them and otherwise crashes web boot.
 * Supply only absent display defaults in the received view; keep the Host's
 * schema, revision, write results and persisted settings authoritative.
 */
function normalizeThemeSettingsResult(endpoint, result) {
    if (!result.ok || !isRecord(result.value))
        return result;
    const value = result.value;
    if (endpoint === 'settings/describe' && Array.isArray(value.namespaces)) {
        const original = value.namespaces;
        const namespaces = original.map(normalizeThemeNamespace);
        return namespaces.some((row, index) => row !== original[index])
            ? { ...result, value: { ...value, namespaces } }
            : result;
    }
    if (['settings/update', 'settings/replace', 'settings/mutate'].includes(endpoint) && value.ok === true) {
        const namespace = normalizeThemeNamespace(value.value);
        if (namespace !== value.value)
            return { ...result, value: { ...value, value: namespace } };
    }
    return result;
}
function normalizeThemeNamespace(namespace) {
    if (!isRecord(namespace) || namespace.ns !== 'ui-theme' || !isRecord(namespace.value))
        return namespace;
    const section = namespace.value;
    const defaults = {
        codeFontSize: 11,
        terminalFontSize: 13,
        textFontFamily: '',
        codeFontFamily: '',
        terminalFontFamily: '',
    };
    const missing = Object.entries(defaults).filter(([field]) => section[field] === undefined);
    return missing.length === 0 ? namespace : {
        ...namespace,
        value: { ...section, ...Object.fromEntries(missing) },
    };
}
//# sourceMappingURL=remote-typert-gateway.js.map