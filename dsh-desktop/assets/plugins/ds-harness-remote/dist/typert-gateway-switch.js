import { openRemoteTerminal } from './terminal-carrier-compat.js';
const REMOTE_COMMAND_METHODS = ['execute', 'list'];
const LOCAL_ONLY_NAMESPACES = new Set(['dynamicCordisRunner']);
const ALL_REMOTE_COMMANDS = { execute: true, list: true };
/** Keeps the official Gateway object stable while its selected Host changes. */
export class TypertGatewaySwitch {
    runtime;
    originalInvoke;
    localInvoke;
    originalStream;
    localStream;
    originalDispatch;
    localDispatch;
    originalOpen;
    localOpen;
    remoteInvoke;
    remoteTarget;
    remoteSupport = { execute: false, list: false };
    target;
    installed = false;
    constructor(gateway) {
        this.runtime = gateway;
        this.originalInvoke = gateway.invoke;
        this.localInvoke = this.originalInvoke.bind(gateway);
        this.originalStream = gateway.stream;
        this.localStream = gateway.stream?.bind(gateway);
        this.originalDispatch = this.runtime.dispatchRpc;
        this.localDispatch = this.runtime.dispatchRpc?.bind(gateway);
        this.originalOpen = this.runtime.openWireStream;
        this.localOpen = createLocalOpen(gateway, this.runtime);
    }
    /** Original local dispatcher, used by the Host bridge without switch recursion. */
    local(peer) {
        const invoke = request => this.localInvoke({ ...request, ...(peer === undefined ? {} : { peer }) });
        const dispatch = this.localDispatch === undefined ? (async (endpoint, payload, signal) => {
            try {
                const request = requestFromCarrier(endpoint, payload, signal);
                return { ok: true, value: await invoke(request) };
            }
            catch (error) {
                return { ok: false, error: this.failure(error) };
            }
        }) : (endpoint, payload, signal) => this.localDispatch(endpoint, payload, signal, peer);
        const open = this.localOpen === undefined ? (async (endpoint, payload, signal) => {
            if (this.localStream === undefined)
                throw new Error('The local Harness Gateway does not support Remote streams.');
            return this.localStream({ ...requestFromCarrier(endpoint, payload, signal), ...(peer === undefined ? {} : { peer }) });
        }) : (endpoint, payload, signal, uplink) => this.localOpen(endpoint, payload, signal, uplink, peer);
        return {
            invoke,
            peer,
            ...(this.localStream === undefined ? {} : { stream: (request) => this.localStream({ ...request, ...(peer === undefined ? {} : { peer }) }) }),
            dispatch,
            open,
            failure: error => this.failure(error),
            supportsCarrier: this.localDispatch !== undefined && this.localOpen !== undefined,
        };
    }
    supportsCarrier() {
        return this.localDispatch !== undefined && this.localOpen !== undefined;
    }
    status() {
        return this.remoteInvoke === undefined
            ? { mode: 'local' }
            : { mode: 'remote', ...(this.target === undefined ? {} : { target: { ...this.target } }) };
    }
    install() {
        if (this.installed)
            return;
        this.runtime.invoke = request => this.selectInvoke(request);
        if (this.originalStream !== undefined) {
            this.runtime.stream = request => this.remoteTarget === undefined || isLocalOnlyEndpoint(endpointOf(request))
                ? this.localStream(request)
                : this.openRemote(endpointOf(request), { args: request.args }, request.signal ?? new AbortController().signal, request.uplink);
        }
        if (this.originalDispatch !== undefined) {
            this.runtime.dispatchRpc = (...args) => {
                const [endpoint, payload, signal] = args;
                // The local Gateway owns the caller's Peer and its lifetime. Preserve
                // every carrier argument; Peer objects never cross the Remote tunnel.
                return this.remoteTarget === undefined || isLocalOnlyEndpoint(endpoint)
                    ? this.localDispatch(...args)
                    : this.remoteTarget.dispatch(endpoint, payload, signal).then(result => workspaceConnectionResult(endpoint, result), error => ({ ok: false, error: this.failure(error) }));
            };
        }
        if (this.originalOpen !== undefined) {
            const open = this.originalOpen;
            const rc1 = usesRc1Arity(open);
            this.runtime.openWireStream = (...callArgs) => {
                const endpoint = callArgs[0];
                if (this.remoteTarget === undefined || isLocalOnlyEndpoint(endpoint)) {
                    return rc1
                        ? Reflect.apply(open, this.runtime, callArgs)
                        : open.call(this.runtime, endpoint, callArgs[1], callArgs[2]);
                }
                const signal = (rc1 ? callArgs[4] : callArgs[2]);
                return this.openRemote(endpoint, callArgs[1], signal ?? new AbortController().signal, rc1 ? callArgs[2] : undefined);
            };
        }
        this.installed = true;
    }
    selectRemote(remote, support = ALL_REMOTE_COMMANDS, target) {
        if (!this.installed)
            throw new Error('The Typert gateway switch is not installed.');
        this.remoteInvoke = typeof remote === 'function' ? remote : request => remote.invoke(request);
        this.remoteTarget = typeof remote === 'function' ? undefined : remote;
        this.remoteSupport = { ...support };
        this.target = target === undefined ? undefined : { ...target };
    }
    selectLocal() {
        this.remoteInvoke = undefined;
        this.remoteTarget = undefined;
        this.remoteSupport = { execute: false, list: false };
        this.target = undefined;
    }
    /** Keep the selected authority after transport loss; only explicit exit returns local. */
    disconnectRemote() {
        if (this.remoteInvoke === undefined)
            return;
        const error = () => Object.assign(new Error('The Remote connection was lost. Reconnect to continue.'), {
            isDSHRemoteError: true,
            code: 'remote/disconnected',
            details: {},
        });
        this.remoteTarget = {
            invoke: async () => { throw error(); },
            dispatch: async () => ({ ok: false, error: { code: 'remote/disconnected', message: error().message, details: {} } }),
            open: async () => { throw error(); },
        };
        this.remoteInvoke = this.remoteTarget.invoke;
    }
    restore() {
        if (!this.installed)
            return;
        this.selectLocal();
        this.runtime.invoke = this.originalInvoke;
        if (this.originalStream !== undefined)
            this.runtime.stream = this.originalStream;
        if (this.originalDispatch !== undefined)
            this.runtime.dispatchRpc = this.originalDispatch;
        if (this.originalOpen !== undefined)
            this.runtime.openWireStream = this.originalOpen;
        this.installed = false;
    }
    openRemote(endpoint, payload, signal, uplink) {
        return endpoint === 'terminal/attach'
            ? openRemoteTerminal(this.remoteTarget, payload, signal, uplink ?? endedUplink())
            : this.remoteTarget.open(endpoint, payload, signal);
    }
    selectInvoke(request) {
        if (isLocalOnlyEndpoint(endpointOf(request)))
            return this.localInvoke(request);
        if (this.remoteTarget !== undefined)
            return this.remoteTarget.invoke(request).then(value => normalizeTerminalEnvironment(endpointOf(request), value));
        if (request.namespace !== 'commands' || !isRemoteCommandMethod(request.method) || this.remoteInvoke === undefined) {
            return this.localInvoke(request);
        }
        if (this.remoteSupport[request.method])
            return this.remoteInvoke(request);
        if (request.method === 'list')
            return Promise.resolve([]);
        return this.localInvoke(request);
    }
    failure(error) {
        const normalized = this.runtime.wireStream?.failure(error);
        if (normalized !== undefined)
            return normalized;
        const source = error instanceof Error ? error : new Error('The Harness Gateway rejected the request.');
        const code = 'code' in source && typeof source.code === 'string' ? source.code : 'internal';
        const details = 'details' in source && isRecord(source.details) ? source.details : {};
        return { code, message: source.message, details };
    }
}
/** The local Connection HTTP hop needs the same binary envelope as the native Gateway. */
function workspaceConnectionResult(endpoint, result) {
    if (endpoint === 'terminal/environment' && result.ok)
        return { ...result, value: normalizeTerminalEnvironment(endpoint, result.value) };
    if (endpoint !== 'workspaceFiles/readBytes' && endpoint !== 'officeToPdf/render')
        return result;
    if (!result.ok || !isRecord(result.value) || !(result.value.data instanceof Uint8Array))
        return result;
    return {
        ...result,
        value: { ...result.value, data: null },
        attachments: [
            ...(result.attachments ?? []).filter(attachment => attachment.path.length !== 1 || attachment.path[0] !== 'data'),
            { path: ['data'], bytes: result.value.data },
        ],
    };
}
/**
 * dsh 0.1.7-rc.1 moved the cancellation signal from the third parameter to the
 * fifth; legacy releases keep `(endpoint, payload, signal)`.
 * @param open - carrier opener captured from the running release.
 * @returns whether the opener follows the rc.1 argument order.
 */
function usesRc1Arity(open) {
    return open.length >= 5;
}
/** An uplink nobody sends on, so a read-only stream opens without buffering. */
function endedUplink() {
    return {
        [Symbol.asyncIterator]() {
            return { next: () => Promise.resolve({ done: true, value: undefined }) };
        },
    };
}
/** Controller aborted with the logical stream so the rc.1 carrier owns one lifetime. */
function linkControl(signal) {
    const control = new AbortController();
    if (signal.aborted)
        control.abort(signal.reason);
    else
        signal.addEventListener('abort', () => control.abort(signal.reason), { once: true });
    return control;
}
/**
 * Adapt the running release's carrier opener to the plugin's 3-argument
 * `(endpoint, payload, signal)` seam without leaking the argument displacement.
 * @param gateway - official Gateway whose public `wireStream` is the fallback.
 * @param runtime - Gateway object owning the private `openWireStream` dispatcher.
 * @returns a local opener that carries the signal to the release's signal slot.
 */
function createLocalOpen(gateway, runtime) {
    const open = runtime.openWireStream;
    if (open !== undefined) {
        return usesRc1Arity(open)
            ? (endpoint, payload, signal, uplink, peer) => open
                .call(runtime, endpoint, payload, uplink ?? endedUplink(), peer, signal, linkControl(signal))
            : (endpoint, payload, signal) => open.call(runtime, endpoint, payload, signal);
    }
    const wire = gateway.wireStream;
    if (wire === undefined)
        return undefined;
    const wireOpen = wire.open;
    if (usesRc1Arity(wireOpen)) {
        const rc1 = wireOpen;
        return (endpoint, payload, signal, uplink, peer) => rc1.call(wire, endpoint, payload, uplink ?? endedUplink(), peer, signal);
    }
    const legacy = wireOpen;
    return (endpoint, payload, signal) => legacy.call(wire, endpoint, payload, signal);
}
function requestFromCarrier(endpoint, payload, signal) {
    const segments = endpoint.split('/');
    if (segments.length !== 2 || segments.some(segment => segment.length === 0)) {
        throw new Error('The Harness Gateway endpoint is invalid.');
    }
    if (!isRecord(payload) || !isRecord(payload.args)) {
        throw new Error('The Harness Gateway payload is invalid.');
    }
    return { namespace: segments[0], method: segments[1], args: payload.args, signal };
}
function endpointOf(request) {
    return `${request.namespace}/${request.method}`;
}
function isLocalOnlyEndpoint(endpoint) {
    const separator = endpoint.indexOf('/');
    return separator > 0 && LOCAL_ONLY_NAMESPACES.has(endpoint.slice(0, separator));
}
function isRemoteCommandMethod(method) {
    return REMOTE_COMMAND_METHODS.includes(method);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** RC.1 input flow control also applies to older Hosts and CodeX/ACP projections. */
function normalizeTerminalEnvironment(endpoint, value) {
    if (endpoint !== 'terminal/environment' || !isRecord(value) || value.maxBufferedBytes !== undefined)
        return value;
    return { ...value, maxBufferedBytes: 256 * 1024 };
}
//# sourceMappingURL=typert-gateway-switch.js.map