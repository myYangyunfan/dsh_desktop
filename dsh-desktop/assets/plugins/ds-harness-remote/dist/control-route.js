/** Namespaced loopback RPC prefix shared by the Host runtime and browser UI. */
export const CONTROL_RPC_PREFIX = '/ds-harness-remote';
/** Loopback control endpoint carrying the status event stream. */
export const STATUS_STREAM_ENDPOINT = 'status.events';
/** Full URL path of the loopback status event stream. */
export const STATUS_STREAM_PATH = `${CONTROL_RPC_PREFIX}/${STATUS_STREAM_ENDPOINT}`;
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
const INVALID_REQUEST_RPC_ID = 'invalid-request';
export function registerControlRoute(connection, handler, webServer, statusStream) {
    if (webServer !== undefined && connection.requestRejection !== undefined) {
        const dispose = webServer.register({
            kind: 'prefix',
            path: CONTROL_RPC_PREFIX,
            handler: (req, res) => handleControlRequest(connection, handler, req, res, statusStream),
        });
        return async () => {
            statusStream?.close();
            await dispose();
        };
    }
    // A plain RPC channel owns POST only, so the browser falls back to unary
    // status reads on hosts that do not expose the Web server route.
    return connection.rpc.handle(CONTROL_RPC_PREFIX, handler, {
        authority: 'loopback',
    });
}
async function handleControlRequest(connection, handler, req, res, statusStream) {
    const rejection = connection.requestRejection?.(req);
    if (rejection !== undefined) {
        res.writeHead(rejection);
        res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
    }
    const endpoint = endpointFromPath(CONTROL_RPC_PREFIX, new URL(req.url ?? '/', 'http://dsh.internal').pathname);
    if (req.method === 'GET' && endpoint === STATUS_STREAM_ENDPOINT && statusStream !== undefined) {
        await statusStream.handle(res);
        return;
    }
    if (req.method !== 'POST' || endpoint === undefined) {
        writeText(res, 404, 'not found');
        return;
    }
    if (contentType(req.headers) !== 'application/json') {
        writeText(res, 415, 'content type must be application/json');
        return;
    }
    let body;
    try {
        body = await readJsonBody(req);
    }
    catch {
        writeText(res, 400, 'body is not JSON');
        return;
    }
    const message = clientRequest(body);
    if (message === undefined) {
        writeJson(res, 200, errorResponse(rpcId(body), {
            code: 'gateway/bad-request',
            message: 'invalid client-request message',
            details: { issues: [] },
        }));
        return;
    }
    if (message.method !== endpoint) {
        writeJson(res, 200, errorResponse(message.rpcId, {
            code: 'gateway/bad-request',
            message: `method ${JSON.stringify(message.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
            details: { issues: [] },
        }));
        return;
    }
    try {
        const result = await handler(endpoint, message.payload, requestSignal(req));
        writeJson(res, 200, fullResponse(message.rpcId, result));
    }
    catch (error) {
        writeText(res, 500, `handler failure: ${String(error)}`);
    }
}
function endpointFromPath(channel, pathname) {
    if (!pathname.startsWith(`${channel}/`))
        return undefined;
    const endpoint = pathname.slice(channel.length + 1);
    if (endpoint.split('/').some(segment => segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
        return undefined;
    }
    return endpoint;
}
function contentType(headers) {
    const raw = headers['content-type'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.split(';', 1)[0]?.trim().toLowerCase();
}
async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function requestSignal(req) {
    const abort = new AbortController();
    req.on('close', () => {
        if (!req.complete)
            abort.abort();
    });
    return abort.signal;
}
function clientRequest(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const record = value;
    if (record.type !== 'client-request' || typeof record.rpcId !== 'string' || typeof record.method !== 'string')
        return undefined;
    return { type: 'client-request', rpcId: record.rpcId, method: record.method, payload: record.payload };
}
function rpcId(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return INVALID_REQUEST_RPC_ID;
    const record = value;
    return typeof record.rpcId === 'string' ? record.rpcId : INVALID_REQUEST_RPC_ID;
}
function errorResponse(rpcId, error) {
    return fullResponse(rpcId, { ok: false, error });
}
function fullResponse(rpcId, result) {
    return { type: 'server-response', rpcId, result };
}
function writeJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}
function writeText(res, status, body) {
    res.writeHead(status);
    res.end(body);
}
//# sourceMappingURL=control-route.js.map