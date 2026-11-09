import { CONTROL_RPC_PREFIX } from './control-route.js';
class PluginRouteFailure extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** Route authority is read before each plugin request, including the first page load. */
export function createPluginRouteFetch(original, baseUrl, options = {}) {
    const routeUrl = new URL('api/bot', baseUrl);
    let nextRpcId = 0;
    const control = async (method, payload, signal) => {
        const rpcId = `plugin-route-${++nextRpcId}`;
        const response = await original(new URL(`${CONTROL_RPC_PREFIX.slice(1)}/${method}`, baseUrl), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
            signal,
        });
        if (!response.ok)
            throw new PluginRouteFailure('remote-plugin/control-unavailable', `The local Remote control request failed (HTTP ${response.status}). Reload the Remote plugin.`);
        const envelope = await response.json();
        if (!isRecord(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
            || !isRecord(envelope.result)) {
            throw new PluginRouteFailure('remote-plugin/control-invalid', 'The local Remote control response is invalid. Reload the Remote plugin.');
        }
        if (envelope.result.ok !== true) {
            const error = isRecord(envelope.result.error) ? envelope.result.error : undefined;
            const details = isRecord(error?.details) ? error.details : undefined;
            const code = details?.remoteCode ?? error?.code;
            if (code === 'FEATURE_NOT_SUPPORTED' || code === 'METHOD_NOT_FOUND') {
                throw new PluginRouteFailure('remote-plugin/host-unsupported', 'The selected Host does not support plugin route forwarding. Update and reload Remote on the Host, then reconnect.');
            }
            if (code === 'REMOTE_NOT_CONNECTED' || code === 'TRANSPORT_CLOSED') {
                throw new PluginRouteFailure('remote-plugin/disconnected', 'The Remote Host is disconnected. Reconnect to load DS Bot.');
            }
            if (code === 'INVALID_MESSAGE') {
                throw new PluginRouteFailure('remote-plugin/operation-not-allowed', 'This DS Bot operation is not allowed over Remote. Use the Host locally.');
            }
            throw new PluginRouteFailure('remote-plugin/control-rejected', 'The Remote plugin route request was rejected by the control channel.');
        }
        return envelope.result.value;
    };
    return async (input, init) => {
        const requestUrl = new URL(input instanceof Request ? input.url : String(input), baseUrl);
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        if (method.toUpperCase() !== 'POST' || requestUrl.href !== routeUrl.href)
            return original(input, init);
        const signal = init?.signal !== undefined ? init.signal ?? undefined : input instanceof Request ? input.signal : undefined;
        const lifetime = signal ?? AbortSignal.timeout(45_000);
        try {
            lifetime.throwIfAborted();
            const status = await control('status', {}, AbortSignal.any([lifetime, AbortSignal.timeout(10_000)]));
            lifetime.throwIfAborted();
            if (!isRecord(status))
                throw new PluginRouteFailure('remote-plugin/authority-unavailable', 'The Remote plugin route authority is unavailable.');
            if (status.mode === 'local')
                return original(input, init);
            // Once Remote owns the page, never read the local plugin's roster on a
            // disconnect, missing capability, or virtual CodeX/ACP Session catalog.
            if (status.mode !== 'remote')
                throw new PluginRouteFailure('remote-plugin/authority-unavailable', 'The Remote plugin route authority is unavailable.');
            if (status.connected !== true)
                throw new PluginRouteFailure('remote-plugin/disconnected', 'The Remote Host is disconnected. Reconnect to load DS Bot.');
            if (!isRecord(status.remoteFeatures) || status.remoteFeatures.pluginRoute !== true)
                throw new PluginRouteFailure('remote-plugin/host-unsupported', 'The selected Host does not support plugin route forwarding. Update and reload Remote on the Host, then reconnect.');
            if (status.backend !== undefined && status.backend !== 'harness')
                throw new PluginRouteFailure('remote-plugin/backend-unsupported', 'DS Bot requires the Remote Harness catalog. Select a Harness workspace on this Host.');
            const request = input instanceof Request
                ? new Request(input, init)
                : new Request(requestUrl, init);
            const body = await request.clone().json();
            if (!isRecord(body))
                throw new Error('The plugin route body must be a JSON object.');
            const result = await control('plugin.route', { route: 'api/bot', body }, lifetime);
            if (!isRecord(result) || !Number.isInteger(result.status)
                || result.status < 200 || result.status > 599) {
                throw new Error('The plugin route response is invalid.');
            }
            const statusCode = result.status;
            if (statusCode === 404)
                throw new PluginRouteFailure('remote-plugin/bot-not-loaded', 'The Host has no DS Bot route. Enable ds-bot in the same DSH instance/profile as the connected Host.');
            if (statusCode === 503)
                throw new PluginRouteFailure('remote-plugin/host-carrier-unavailable', 'The Host plugin route carrier is unavailable. Update and reload Remote on the Host.');
            if (statusCode >= 200 && statusCode < 300 && options.beforeResponse !== undefined) {
                try {
                    await waitWithSignal(options.beforeResponse(status, body, result.json, lifetime), lifetime);
                }
                catch {
                    lifetime.throwIfAborted();
                    throw new PluginRouteFailure('remote-plugin/catalog-unavailable', 'The Remote Harness Session catalog is not ready. Reconnect before loading DS Bot.');
                }
            }
            lifetime.throwIfAborted();
            return new Response([204, 205, 304].includes(statusCode) ? null : JSON.stringify(result.json ?? null), {
                status: statusCode,
                headers: { 'content-type': 'application/json' },
            });
        }
        catch (error) {
            lifetime.throwIfAborted();
            // DS Bot reads its error envelope only for HTTP success. A synthetic 502
            // hides every refusal behind "HTTP 502" before it can read the reason.
            return new Response(JSON.stringify({
                ok: false,
                error: {
                    code: error instanceof PluginRouteFailure ? error.code : 'remote-plugin/unavailable',
                    message: error instanceof PluginRouteFailure ? error.message : 'The Remote plugin route is unavailable.',
                    details: {},
                },
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
    };
}
/** `ready` is monotone in Harness; prove membership instead of trusting refresh's void result. */
export function createPluginRouteCatalogGuard(readSessions) {
    return async (_status, body, json, signal) => {
        if (!isRecord(json) || json.ok !== true || !isRecord(json.value))
            return;
        const required = botSessionIds(body.endpoint, json.value);
        if (required.size === 0)
            return;
        const sessions = await readSessions();
        const containsSessions = () => {
            const snapshot = sessions.list.getSnapshot();
            const known = new Set(snapshot.ids);
            return snapshot.phase === 'ready' && [...required].every(id => known.has(id));
        };
        // A first refresh may join a pull that started before the Bot mutation.
        // One further pull lets that in-flight baseline finish without an unbounded retry loop.
        for (let attempt = 0; attempt < 2; attempt++) {
            signal.throwIfAborted();
            if (containsSessions())
                return;
            if (sessions.refresh === undefined)
                break;
            await sessions.refresh();
        }
        signal.throwIfAborted();
        if (!containsSessions())
            throw new Error('The Remote Session catalog does not contain the published Sessions.');
    };
}
function botSessionIds(endpoint, value) {
    const ids = new Set();
    const add = (id) => {
        if (id === undefined || id === null)
            return;
        if (typeof id !== 'string' || id.length === 0)
            throw new Error('Invalid Bot Session identity.');
        ids.add(id);
    };
    const addArray = (input) => {
        if (input === undefined)
            return;
        if (!Array.isArray(input))
            throw new Error('Invalid Bot Session identities.');
        input.forEach(add);
    };
    const bot = (input) => {
        if (!isRecord(input))
            throw new Error('Invalid Bot catalog entry.');
        add(input.id);
        add(input.sessionId);
        addArray(input.parts);
        if (Array.isArray(input.segments))
            input.segments.forEach(segment => {
                if (!isRecord(segment))
                    throw new Error('Invalid Bot Session segment.');
                add(segment.sessionId);
            });
    };
    const room = (input) => {
        if (!isRecord(input))
            throw new Error('Invalid Bot room entry.');
        add(input.id);
        addArray(input.parts);
        if (isRecord(input.sessions))
            Object.values(input.sessions).forEach(add);
    };
    const agent = (input) => {
        if (!isRecord(input))
            throw new Error('Invalid Bot agent entry.');
        // Agent IDs are roster identities, not Harness Session IDs.
        addArray(input.sessions);
    };
    const roster = () => {
        for (const [key, visit] of [['bots', bot], ['rooms', room], ['agents', agent]]) {
            if (value[key] === undefined)
                continue;
            if (!Array.isArray(value[key]))
                throw new Error('Invalid Bot roster.');
            value[key].forEach(visit);
        }
    };
    switch (endpoint) {
        case 'state':
        case 'delete-bot':
        case 'delete-room':
        case 'set-main':
        case 'remove-agent':
            roster();
            break;
        case 'create-bot':
        case 'duplicate-bot':
        case 'update-bot':
            bot(value);
            break;
        case 'create-room':
            room(value);
            break;
        case 'update-room':
            room(value.room);
            break;
        case 'add-agent':
            agent(value);
            break;
        case 'agent-session':
        case 'agent-adopt':
            add(value.sessionId);
            break;
        case 'set-flags':
            Array.isArray(value.sessions) ? agent(value) : Array.isArray(value.members) ? room(value) : bot(value);
            break;
    }
    return ids;
}
function waitWithSignal(pending, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted)
            onAbort();
        void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=plugin-route-client.js.map