import { CONTROL_RPC_PREFIX } from './control-route.js';
/** Transport safety ceiling; the Host enforces its configured attachment limits. */
export const REMOTE_UPLOAD_MAX_BYTES = 192 * 1024 * 1024;
/** Official upload hook: shared by browser, Desktop and IDE upload runtimes. */
export function createRemoteUploadFetch(original, baseUrl) {
    let sequence = 0;
    const control = async (method, payload, signal) => {
        const rpcId = `remote-upload-${++sequence}`;
        const response = await original(new URL(`${CONTROL_RPC_PREFIX.slice(1)}/${method}`, baseUrl), {
            method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId, method, payload }), signal,
        });
        if (!response.ok)
            throw new Error(`Remote upload control failed (HTTP ${response.status}).`);
        const envelope = await response.json();
        if (envelope.type !== 'server-response' || envelope.rpcId !== rpcId || envelope.result?.ok !== true) {
            throw new Error(envelope.result?.error?.message ?? 'Remote upload requires an updated Host plugin.');
        }
        return envelope.result.value;
    };
    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), baseUrl);
        const target = new URL('api/session/uploadFileBinary', baseUrl);
        if (url.origin !== target.origin || url.pathname !== target.pathname)
            return original(input, init);
        const request = new Request(url, input instanceof Request ? new Request(input, init) : init);
        if (request.method !== 'POST')
            return original(input, init);
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
        const status = await control('status', {}, signal);
        if (status.mode === 'local')
            return original(input, init);
        if (status.mode !== 'remote' || !status.connected)
            throw new Error('Remote Host is disconnected. Reconnect before uploading a file.');
        if (status.backend !== undefined && status.backend !== 'harness' && status.backend !== 'codex')
            throw new Error('Remote attachment receipts require a Harness or CodeX session.');
        const sessionId = url.searchParams.get('sessionId');
        const mediaType = url.searchParams.get('mediaType');
        if (!sessionId || (mediaType !== null && !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType))) {
            throw new Error('A Session and a supported image media type, when provided, are required.');
        }
        // Read incrementally so even an unbounded stream cannot exhaust the client.
        const reader = request.body?.getReader();
        const abortRead = () => { void reader?.cancel(signal.reason).catch(() => { }); };
        signal.addEventListener('abort', abortRead, { once: true });
        const chunks = [];
        let size = 0;
        try {
            while (reader !== undefined) {
                signal.throwIfAborted();
                const next = await reader.read();
                if (next.done)
                    break;
                size += next.value.byteLength;
                if (size > REMOTE_UPLOAD_MAX_BYTES)
                    throw new Error('Remote upload exceeds the Remote transfer safety limit.');
                chunks.push(next.value);
            }
        }
        finally {
            signal.removeEventListener('abort', abortRead);
            await reader?.cancel().catch(() => { });
            reader?.releaseLock();
        }
        signal.throwIfAborted();
        let binary = '';
        for (const chunk of chunks)
            for (let i = 0; i < chunk.length; i += 0x8000)
                binary += String.fromCharCode(...chunk.subarray(i, i + 0x8000));
        const result = await control('plugin.route', { route: 'api/session/uploadFileBinary', targetDeviceId: status.target?.deviceId, body: {
                endpoint: mediaType === null ? 'file' : 'image', payload: { sessionId, ...(mediaType === null ? {} : { mediaType }), data: btoa(binary),
                    ...(url.searchParams.has('name') ? { name: url.searchParams.get('name') } : {}) },
            } }, signal);
        return new Response(JSON.stringify(result.json), { status: result.status, headers: { 'content-type': 'application/json' } });
    };
}
//# sourceMappingURL=remote-upload-client.js.map