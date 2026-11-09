/**
 * Node RTC factory (webrtc-implementation-plan.md §6.2).
 *
 * Native libwebrtc is preferred when present because its ICE behavior matches
 * browser Remote Web. werift remains the pure-TypeScript fallback for systems
 * without a loadable native addon. Both backends are loaded lazily so DSH
 * startup remains unaffected when WebRTC is unused or `forceRelay` is enabled.
 */
import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { summarizeAddress, summarizeIceCandidate } from '@dsh-remote/webrtc';
import { normalizeSdpMLineIndex } from '@dsh-remote/protocol';
import { loadExternalNativeRtcFactory } from './native-rtc-helper.js';
let cachedFactory;
let cachedWerift;
let cachedNativeFactory;
/**
 * Node RTC factory used by the Plugin/VS Code clients and Host. Native
 * libwebrtc is preferred because its ICE behavior matches browser Remote Web;
 * werift remains the no-native fallback for environments that cannot load it.
 */
export async function loadNodeRtcFactory(options = {}) {
    const nativeFactory = isElectronRuntime()
        ? await loadExternalNativeRtcFactory().catch(() => undefined)
        : await loadNativeRtcFactory().catch(() => undefined);
    return nativeFactory ?? await loadWeriftFactory(options);
}
/** Load (once) a werift-backed factory, or `undefined` when it cannot be loaded. */
export async function loadWeriftFactory(options = {}) {
    const cacheable = isCacheableFactoryOptions(options);
    if (cacheable && cachedFactory !== undefined)
        return cachedFactory;
    try {
        const werift = cachedWerift ?? (await import('werift'));
        cachedWerift = werift;
        const routeCandidates = options.preferredHostIpv4Candidates
            ?? await detectRouteHostIpv4Candidates(options.routeTargets ?? [], options.routeProbeTimeoutMs);
        const factory = buildWeriftFactory(werift, { ...options, preferredHostIpv4Candidates: routeCandidates });
        if (cacheable)
            cachedFactory = factory;
        return factory;
    }
    catch {
        return undefined;
    }
}
async function loadNativeRtcFactory() {
    if (cachedNativeFactory !== undefined)
        return cachedNativeFactory;
    try {
        const wrtc = (await import('@roamhq/wrtc'));
        const RTCPeerConnection = wrtc.RTCPeerConnection ?? wrtc.default?.RTCPeerConnection;
        if (RTCPeerConnection === undefined)
            return undefined;
        cachedNativeFactory = buildNativeRtcFactory(RTCPeerConnection);
        return cachedNativeFactory;
    }
    catch {
        return undefined;
    }
}
function isElectronRuntime() {
    const versions = process.versions;
    return typeof versions.electron === 'string' || process.env.ELECTRON_RUN_AS_NODE === '1';
}
function buildNativeRtcFactory(RTCPeerConnection) {
    return {
        create(configuration) {
            const raw = new RTCPeerConnection({ iceServers: configuration.iceServers });
            return {
                get connectionState() { return raw.connectionState; },
                get iceConnectionState() { return raw.iceConnectionState; },
                get iceGatheringState() { return raw.iceGatheringState; },
                get signalingState() { return raw.signalingState; },
                set onconnectionstatechange(value) { raw.onconnectionstatechange = value; },
                get onconnectionstatechange() { return raw.onconnectionstatechange; },
                set oniceconnectionstatechange(value) { raw.oniceconnectionstatechange = value; },
                get oniceconnectionstatechange() { return raw.oniceconnectionstatechange; },
                set onicegatheringstatechange(value) { raw.onicegatheringstatechange = value; },
                get onicegatheringstatechange() { return raw.onicegatheringstatechange; },
                set onicecandidate(value) {
                    raw.onicecandidate = value === null ? null : event => value({
                        candidate: event.candidate === null ? null : normalizeNativeCandidate(event.candidate),
                    });
                },
                get onicecandidate() { return raw.onicecandidate; },
                set ondatachannel(value) {
                    raw.ondatachannel = value === null ? null : event => value({ channel: adaptNativeDataChannel(event.channel) });
                },
                get ondatachannel() { return raw.ondatachannel; },
                createDataChannel(label, options) { return adaptNativeDataChannel(raw.createDataChannel(label, options)); },
                createOffer() { return raw.createOffer(); },
                createAnswer() { return raw.createAnswer(); },
                setLocalDescription(description) { return raw.setLocalDescription(description); },
                setRemoteDescription(description) { return raw.setRemoteDescription(description); },
                addIceCandidate(candidate) { return raw.addIceCandidate(candidate); },
                getStats() { return raw.getStats(); },
                close() { raw.close(); },
            };
        },
    };
}
/** Synchronous factory for tests and callers that already resolved werift. */
export function buildWeriftFactory(werift, options = {}) {
    return {
        create(configuration) {
            const hostIpv4Candidates = detectHostIpv4Candidates(options.interfaces ?? networkInterfaces(), options.preferredHostIpv4Candidates);
            const allowedHostIpv4 = new Set(hostIpv4Candidates);
            const raw = new werift.RTCPeerConnection({
                iceServers: orderIceServersForWerift(configuration.iceServers ?? []),
                iceUseIpv4: true,
                iceUseIpv6: false,
                iceUseLinkLocalAddress: false,
                ...(hostIpv4Candidates.length === 0
                    ? {}
                    : {
                        iceAdditionalHostAddresses: hostIpv4Candidates,
                        iceFilterCandidatePair: pair => {
                            const allowed = shouldUseCandidatePair(pair, allowedHostIpv4);
                            if (!allowed) {
                                configuration.onDiagnostic?.({
                                    type: 'candidate-pair-filtered',
                                    localCandidate: summarizeWeriftCandidate(localCandidate(pair)),
                                    reason: 'local-host-not-allowed',
                                });
                            }
                            return allowed;
                        },
                    }),
            });
            let onIceCandidate = null;
            let onDataChannel = null;
            raw.onicecandidate = event => {
                if (onIceCandidate === null)
                    return;
                const candidate = event.candidate === undefined ? null : event.candidate.toJSON();
                if (candidate !== null && !shouldAdvertiseCandidate(candidate, allowedHostIpv4)) {
                    configuration.onDiagnostic?.({
                        type: 'local-candidate-filtered',
                        candidate: summarizeIceCandidate(candidate),
                        reason: 'local-host-not-allowed',
                    });
                    return;
                }
                onIceCandidate({ candidate });
            };
            raw.ondatachannel = event => {
                if (onDataChannel === null)
                    return;
                onDataChannel({ channel: adaptDataChannel(event.channel) });
            };
            const pc = {
                get connectionState() { return raw.connectionState; },
                get iceConnectionState() { return raw.iceConnectionState; },
                get iceGatheringState() { return raw.iceGatheringState; },
                get signalingState() { return raw.signalingState; },
                set onconnectionstatechange(value) { raw.onconnectionstatechange = value; },
                get onconnectionstatechange() { return raw.onconnectionstatechange; },
                set oniceconnectionstatechange(value) { raw.oniceconnectionstatechange = value; },
                get oniceconnectionstatechange() { return raw.oniceconnectionstatechange; },
                set onicegatheringstatechange(value) { raw.onicegatheringstatechange = value; },
                get onicegatheringstatechange() { return raw.onicegatheringstatechange; },
                set onicecandidate(value) { onIceCandidate = value; },
                get onicecandidate() { return onIceCandidate; },
                set ondatachannel(value) { onDataChannel = value; },
                get ondatachannel() { return onDataChannel; },
                createDataChannel(label, options) {
                    return adaptDataChannel(raw.createDataChannel(label, { ordered: options?.ordered ?? true }));
                },
                createOffer() { return raw.createOffer(); },
                createAnswer() { return raw.createAnswer(); },
                setLocalDescription(description) { return raw.setLocalDescription(description).then(() => undefined); },
                setRemoteDescription(description) { return raw.setRemoteDescription(description); },
                addIceCandidate(candidate) { return raw.addIceCandidate(candidate); },
                getStats() { return raw.getStats(); },
                close() { void raw.close().catch(() => undefined); },
            };
            return pc;
        },
    };
}
function adaptDataChannel(raw) {
    return {
        get label() { return raw.label; },
        get ordered() { return raw.ordered; },
        get readyState() { return raw.readyState; },
        get bufferedAmount() { return raw.bufferedAmount; },
        binaryType: 'arraybuffer',
        set onopen(value) { raw.onopen = value; },
        get onopen() { return raw.onopen; },
        set onmessage(value) {
            raw.onmessage = value === null ? null : event => value({ data: toArrayBuffer(event.data) });
        },
        get onmessage() { return null; },
        set onclose(value) { raw.onclose = value; },
        get onclose() { return raw.onclose; },
        set onerror(value) { raw.onerror = value; },
        get onerror() { return raw.onerror; },
        onbufferedamountlow: null,
        send(data) {
            const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
            try {
                raw.send(typeof data === 'string' ? data : Buffer.from(data));
            }
            catch (error) {
                console.error('[werift-send-error] bytes=' + bytes, error instanceof Error ? error.message : error);
                throw error;
            }
        },
        close() { raw.close(); },
    };
}
function adaptNativeDataChannel(raw) {
    let onmessage = null;
    return {
        get label() { return raw.label; },
        get ordered() { return raw.ordered; },
        get readyState() { return raw.readyState; },
        get bufferedAmount() { return raw.bufferedAmount; },
        get binaryType() { return raw.binaryType; },
        set binaryType(value) { raw.binaryType = value; },
        set onopen(value) { raw.onopen = value; },
        get onopen() { return raw.onopen; },
        set onmessage(value) {
            onmessage = value;
            raw.onmessage = value === null ? null : event => value({ data: normalizeNativeMessageData(event.data) });
        },
        get onmessage() { return onmessage; },
        set onclose(value) { raw.onclose = value; },
        get onclose() { return raw.onclose; },
        set onerror(value) { raw.onerror = value; },
        get onerror() { return raw.onerror; },
        set onbufferedamountlow(value) { raw.onbufferedamountlow = value; },
        get onbufferedamountlow() { return raw.onbufferedamountlow; },
        send(data) {
            raw.send(typeof data === 'string' ? data : Buffer.from(data));
        },
        close() { raw.close(); },
    };
}
function toArrayBuffer(data) {
    if (typeof data === 'string')
        return data;
    // `Buffer.prototype.slice()` (unlike `Uint8Array.prototype.slice()`) returns a
    // *view* over the pooled 8 KiB receive buffer, so slicing the underlying
    // ArrayBuffer by byte offset/length is required to extract just the message.
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
function normalizeNativeCandidate(candidate) {
    const json = typeof candidate.toJSON === 'function'
        ? candidate.toJSON()
        : {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            usernameFragment: candidate.usernameFragment,
        };
    return {
        ...json,
        sdpMLineIndex: normalizeSdpMLineIndex(json.sdpMLineIndex),
    };
}
function normalizeNativeMessageData(data) {
    if (typeof data === 'string')
        return data;
    if (data instanceof ArrayBuffer)
        return data;
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    return new Uint8Array().buffer;
}
/**
 * Pick the safe IPv4 host addresses for ICE gathering.
 *
 * On macOS a host exposes many interfaces (WiFi `en0`, Thunderbolt `en1-4`,
 * `bridge*`, Apple Wireless Direct Link `awdl0`/`llw0`, and several VPN `utun*`
 * tunnels whose small MTUs drop large SCTP packets). Let werift/ICE compare
 * real physical interfaces, but filter virtual and link-local Host candidates
 * before they can become nominated paths.
 */
export function detectHostIpv4Candidates(interfaces, preferredHostIpv4Candidates = []) {
    const candidates = [];
    const routePreference = new Map(preferredHostIpv4Candidates.map((ip, index) => [ip, 10_000 - index]));
    for (const [name, addresses] of Object.entries(interfaces)) {
        const interfaceScore = physicalInterfaceScore(name);
        if (interfaceScore === undefined)
            continue;
        for (const address of addresses ?? []) {
            if (address.internal || !isIpv4Family(address.family))
                continue;
            const ip = address.address;
            if (!isUsableIpv4(ip))
                continue;
            candidates.push({
                name,
                ip,
                score: interfaceScore + (isPrivate(ip) ? 1_000 : 0) + (routePreference.get(ip) ?? 0),
            });
        }
    }
    candidates.sort((left, right) => {
        const score = right.score - left.score;
        if (score !== 0)
            return score;
        const name = left.name.localeCompare(right.name, 'en');
        return name === 0 ? left.ip.localeCompare(right.ip, 'en', { numeric: true }) : name;
    });
    return [...new Set(candidates.map(candidate => candidate.ip))];
}
export async function detectRouteHostIpv4Candidates(targets, timeoutMs = 500) {
    const detected = await Promise.all(targets.map(async (target) => {
        const routeTarget = parseRouteTarget(target);
        return routeTarget === undefined ? undefined : await detectRouteHostIpv4(routeTarget, timeoutMs).catch(() => undefined);
    }));
    return [...new Set(detected.filter((ip) => ip !== undefined && isUsableIpv4(ip)))];
}
function shouldUseCandidatePair(pair, allowedHostIpv4) {
    if (allowedHostIpv4.size === 0)
        return true;
    const candidate = localCandidate(pair);
    if (candidate === undefined)
        return true;
    return shouldUseLocalCandidate(candidate, allowedHostIpv4);
}
export function shouldAdvertiseCandidate(candidate, allowedHostIpv4) {
    if (allowedHostIpv4.size === 0)
        return true;
    const parsed = parseIceCandidate(candidate);
    if (parsed === undefined)
        return true;
    return shouldUseLocalCandidate(parsed, allowedHostIpv4);
}
function shouldUseLocalCandidate(candidate, allowedHostIpv4) {
    if (candidate.type === 'host')
        return candidate.host !== undefined && allowedHostIpv4.has(candidate.host);
    if (candidate.type === 'srflx' && candidate.relatedAddress !== undefined) {
        return allowedHostIpv4.has(candidate.relatedAddress);
    }
    return true;
}
function localCandidate(pair) {
    try {
        return pair.localCandidate;
    }
    catch {
        return undefined;
    }
}
function summarizeWeriftCandidate(candidate) {
    if (candidate === undefined)
        return undefined;
    const address = summarizeAddress(candidate.host);
    const related = summarizeAddress(candidate.relatedAddress);
    return {
        candidateType: candidate.type === 'host' || candidate.type === 'srflx' || candidate.type === 'prflx' || candidate.type === 'relay'
            ? candidate.type
            : 'unknown',
        ...address,
        ...(candidate.relatedAddress === undefined
            ? {}
            : { relatedAddressFamily: related.addressFamily, relatedAddressScope: related.addressScope }),
    };
}
export function orderIceServersForWerift(iceServers) {
    return iceServers.map(server => {
        const urls = Array.isArray(server.urls) ? [...server.urls] : [server.urls];
        urls.sort((left, right) => iceUrlScore(left) - iceUrlScore(right));
        return { ...server, urls: Array.isArray(server.urls) ? urls : urls[0] ?? server.urls };
    });
}
function iceUrlScore(url) {
    const value = url.trim().toLowerCase();
    if (value.startsWith('stun:') || value.startsWith('stuns:'))
        return 0;
    if (value.startsWith('turn:') && value.includes('transport=tcp'))
        return 10;
    if (value.startsWith('turns:') && value.includes('transport=tcp'))
        return 20;
    if (value.startsWith('turn:') && value.includes('transport=udp'))
        return 30;
    if (value.startsWith('turns:'))
        return 40;
    if (value.startsWith('turn:'))
        return 50;
    return 100;
}
function parseRouteTarget(value) {
    try {
        const url = new URL(value);
        const port = Number(url.port || (url.protocol === 'http:' ? '80' : '443'));
        if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535 || url.hostname.length === 0)
            return undefined;
        return { host: url.hostname, port };
    }
    catch {
        return undefined;
    }
}
async function detectRouteHostIpv4(target, timeoutMs) {
    const socket = createSocket('udp4');
    try {
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                resolve(undefined);
            }, timeoutMs);
            const cleanup = () => {
                clearTimeout(timer);
                socket.off('error', onError);
            };
            const onError = (error) => {
                cleanup();
                reject(error);
            };
            socket.once('error', onError);
            socket.connect(target.port, target.host, () => {
                cleanup();
                const address = socket.address();
                resolve(typeof address === 'string' ? undefined : address.address);
            });
        });
    }
    finally {
        socket.close();
    }
}
function isCacheableFactoryOptions(options) {
    return options.interfaces === undefined
        && options.preferredHostIpv4Candidates === undefined
        && options.routeTargets === undefined;
}
function parseIceCandidate(candidate) {
    const value = candidate.candidate?.trim();
    if (value === undefined || value.length === 0)
        return undefined;
    const parts = value.replace(/^candidate:/, '').split(/\s+/);
    const typeIndex = parts.indexOf('typ');
    if (typeIndex < 0)
        return undefined;
    const host = parts[4];
    const type = parts[typeIndex + 1];
    const relatedAddressIndex = parts.indexOf('raddr');
    return {
        ...(host === undefined ? {} : { host }),
        ...(type === undefined ? {} : { type }),
        ...(relatedAddressIndex < 0 || parts[relatedAddressIndex + 1] === undefined
            ? {}
            : { relatedAddress: parts[relatedAddressIndex + 1] }),
    };
}
function physicalInterfaceScore(name) {
    const value = name.toLowerCase();
    if (/^(utun|tun|tap|ppp|bridge|awdl|llw|gif|stf|anpi|ap\d|vmnet|veth|docker|br-|vboxnet|lo)/.test(value)) {
        return undefined;
    }
    if (/^(eth|eno|ens|enp)/.test(value))
        return 500;
    if (/^(en|wlan|wl|wifi|wi-fi)/.test(value))
        return 450;
    return 300;
}
function isIpv4Family(family) {
    return family === 'IPv4' || family === 4;
}
function isUsableIpv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
        return false;
    if (parts[0] === 0 || parts[0] === 127 || parts[0] >= 224)
        return false;
    if (parts[0] === 169 && parts[1] === 254)
        return false;
    return !isCgnat(ip);
}
function isCgnat(ip) {
    const parts = ip.split('.').map(Number);
    return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}
function isPrivate(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4)
        return false;
    if (parts[0] === 10)
        return true;
    if (parts[0] === 192 && parts[1] === 168)
        return true;
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}
//# sourceMappingURL=werift-rtc.js.map