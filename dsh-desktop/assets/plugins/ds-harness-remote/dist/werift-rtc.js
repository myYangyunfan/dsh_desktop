/**
 * Node RTC factory (webrtc-implementation-plan.md §6.2).
 *
 * Native libwebrtc is preferred when present because its ICE behavior matches
 * browser Remote Web. werift remains the pure-TypeScript fallback for systems
 * without a loadable native addon. Both backends are loaded lazily so DSH
 * startup remains unaffected when WebRTC is unused or `forceRelay` is enabled.
 */
import { createSocket } from 'node:dgram';
import { isIPv6 } from 'node:net';
import { networkInterfaces } from 'node:os';
import { isTailscaleInterface, summarizeAddress, summarizeIceCandidate } from '@dsh-remote/webrtc';
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
    const nativeFactory = process.env.DSH_REMOTE_WEBRTC_BACKEND === 'werift'
        ? undefined
        : isElectronRuntime()
            ? await loadExternalNativeRtcFactory().catch(() => undefined)
            : await loadNativeRtcFactory().catch(() => undefined);
    const factory = nativeFactory ?? await loadWeriftFactory(options);
    return factory === undefined ? undefined : wrapLocalCandidateFilterFactory(factory, options);
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
            const raw = new RTCPeerConnection({ iceServers: configuration.iceServers, iceTransportPolicy: configuration.iceTransportPolicy });
            return {
                get connectionState() { return raw.connectionState; },
                get iceConnectionState() { return raw.iceConnectionState; },
                get iceGatheringState() { return raw.iceGatheringState; },
                get signalingState() { return raw.signalingState; },
                get localDescription() { return raw.localDescription; },
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
            const interfaces = options.interfaces ?? networkInterfaces();
            const hostIpv4Candidates = detectHostIpv4Candidates(interfaces, options.preferredHostIpv4Candidates);
            const hostIpv6Candidates = detectHostIpv6Candidates(interfaces);
            const allowedHostAddresses = new Set([...hostIpv4Candidates, ...hostIpv6Candidates]);
            const raw = new werift.RTCPeerConnection({
                iceServers: orderIceServersForWerift(configuration.iceServers ?? []),
                iceTransportPolicy: configuration.iceTransportPolicy,
                iceUseIpv4: true,
                iceUseIpv6: hostIpv6Candidates.length > 0,
                iceUseLinkLocalAddress: false,
                ...(allowedHostAddresses.size === 0
                    ? {}
                    : {
                        iceAdditionalHostAddresses: [...allowedHostAddresses],
                        iceFilterCandidatePair: pair => {
                            const allowed = shouldUseCandidatePair(pair, allowedHostAddresses);
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
                if (candidate !== null && !shouldAdvertiseCandidate(candidate, allowedHostAddresses)) {
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
 * physical interfaces and recognized Tailscale paths while filtering other
 * virtual and link-local Host candidates.
 */
export function detectHostIpv4Candidates(interfaces, preferredHostIpv4Candidates = []) {
    const candidates = [];
    const routePreference = new Map(preferredHostIpv4Candidates.map((ip, index) => [ip, 10_000 - index]));
    for (const [name, addresses = []] of Object.entries(interfaces)) {
        const tailscale = isTailscaleInterface(name, addresses);
        const interfaceScore = tailscale ? 0 : physicalInterfaceScore(name);
        if (interfaceScore === undefined)
            continue;
        for (const address of addresses) {
            if (address.internal || !isIpv4Family(address.family))
                continue;
            const ip = address.address;
            if (!isUsableIpv4(ip))
                continue;
            if (tailscale ? !isCgnat(ip) : isCgnat(ip))
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
function detectHostIpv6Candidates(interfaces) {
    const candidates = [];
    for (const [name, addresses = []] of Object.entries(interfaces)) {
        if (physicalInterfaceScore(name) === undefined)
            continue;
        for (const { address, internal } of addresses) {
            if (internal)
                continue;
            // Only global unicast candidates. Keep ULA and scoped addresses out of ICE.
            if (/^[23][0-9a-f]{3}:/i.test(address) && !address.includes('%') && isIPv6(address)) {
                candidates.push(address);
            }
        }
    }
    return candidates;
}
function shouldUseCandidatePair(pair, allowedHostAddresses) {
    const candidate = localCandidate(pair);
    if (candidate === undefined)
        return true;
    return shouldUseLocalCandidate(candidate, allowedHostAddresses);
}
export function shouldAdvertiseCandidate(candidate, allowedHostAddresses) {
    if (allowedHostAddresses.size === 0)
        return true;
    const parsed = parseIceCandidate(candidate);
    if (parsed === undefined)
        return true;
    return shouldUseLocalCandidate(parsed, allowedHostAddresses);
}
function shouldUseLocalCandidate(candidate, allowedHostAddresses) {
    if (candidate.type === 'host')
        return candidate.host !== undefined && allowedHostAddresses.has(candidate.host);
    if (candidate.type === 'srflx' && candidate.relatedAddress !== undefined) {
        return allowedHostAddresses.has(candidate.relatedAddress);
    }
    return true;
}
/**
 * Wrap any RtcPeerConnectionFactory with a backend-agnostic local ICE candidate
 * filter covering both SDP `a=candidate:` lines and trickle `onicecandidate`.
 */
export function wrapLocalCandidateFilterFactory(factory, options = {}) {
    return {
        create(configuration) {
            const blockedHostAddresses = detectBlockedHostAddresses(options.interfaces ?? networkInterfaces());
            const raw = factory.create(configuration);
            let onIceCandidate = null;
            const shouldAllow = (candidate) => {
                if (shouldAdvertiseFilteredLocalCandidate(candidate, blockedHostAddresses))
                    return true;
                configuration.onDiagnostic?.({
                    type: 'local-candidate-filtered',
                    candidate: summarizeIceCandidate(candidate),
                    reason: 'local-host-not-allowed',
                });
                return false;
            };
            const filterDescription = (description, emitDiagnostic) => {
                if (description.sdp === undefined || description.sdp.length === 0)
                    return description;
                const lineEnding = description.sdp.includes('\r\n') ? '\r\n' : '\n';
                const lines = description.sdp.split(/\r?\n/);
                let changed = false;
                const keptLines = [];
                for (const line of lines) {
                    if (/^a=candidate:/i.test(line)) {
                        const candidate = { candidate: line.slice(2) };
                        const allowed = emitDiagnostic
                            ? shouldAllow(candidate)
                            : shouldAdvertiseFilteredLocalCandidate(candidate, blockedHostAddresses);
                        if (!allowed) {
                            changed = true;
                            continue;
                        }
                    }
                    keptLines.push(line);
                }
                return changed ? { type: description.type, sdp: keptLines.join(lineEnding) } : description;
            };
            raw.onicecandidate = event => {
                if (onIceCandidate === null)
                    return;
                if (event.candidate !== null && !shouldAllow(event.candidate))
                    return;
                onIceCandidate(event);
            };
            const rawWithLocalDescription = raw;
            return {
                get connectionState() { return raw.connectionState; },
                get iceConnectionState() { return raw.iceConnectionState; },
                get iceGatheringState() { return raw.iceGatheringState; },
                get signalingState() { return raw.signalingState; },
                get localDescription() {
                    const current = rawWithLocalDescription.localDescription;
                    return current === undefined || current === null ? current : filterDescription(current, false);
                },
                set onconnectionstatechange(value) { raw.onconnectionstatechange = value; },
                get onconnectionstatechange() { return raw.onconnectionstatechange; },
                set oniceconnectionstatechange(value) { raw.oniceconnectionstatechange = value; },
                get oniceconnectionstatechange() { return raw.oniceconnectionstatechange; },
                set onicegatheringstatechange(value) { raw.onicegatheringstatechange = value; },
                get onicegatheringstatechange() { return raw.onicegatheringstatechange; },
                set onicecandidate(value) { onIceCandidate = value; },
                get onicecandidate() { return onIceCandidate; },
                set ondatachannel(value) { raw.ondatachannel = value; },
                get ondatachannel() { return raw.ondatachannel; },
                createDataChannel(label, init) { return raw.createDataChannel(label, init); },
                async createOffer() { return filterDescription(await raw.createOffer(), true); },
                async createAnswer() { return filterDescription(await raw.createAnswer(), true); },
                setLocalDescription(description) {
                    return raw.setLocalDescription(description === undefined ? undefined : filterDescription(description, false));
                },
                setRemoteDescription(description) { return raw.setRemoteDescription(description); },
                addIceCandidate(candidate) { return raw.addIceCandidate(candidate); },
                getStats() { return raw.getStats(); },
                close() { raw.close(); },
            };
        },
    };
}
export function detectBlockedHostAddresses(interfaces) {
    const allowed = new Set();
    const blocked = new Set();
    for (const [name, addresses = []] of Object.entries(interfaces)) {
        const tailscale = isTailscaleInterface(name, addresses);
        const physical = physicalInterfaceScore(name) !== undefined;
        for (const { address, internal } of addresses) {
            if (internal)
                continue;
            const normalized = normalizeHostAddress(address);
            if (normalized.length === 0)
                continue;
            if (tailscale) {
                if ((isCgnat(normalized) || isTailscaleIpv6Address(normalized)) && !isBenchmarkHostAddress(normalized)) {
                    allowed.add(normalized);
                }
                else {
                    blocked.add(normalized);
                }
                continue;
            }
            if (physical) {
                if (!isBenchmarkHostAddress(normalized))
                    allowed.add(normalized);
                continue;
            }
            blocked.add(normalized);
        }
    }
    for (const address of allowed)
        blocked.delete(address);
    return blocked;
}
export function shouldAdvertiseFilteredLocalCandidate(candidate, blockedHostAddresses) {
    const parsed = parseIceCandidate(candidate);
    if (parsed === undefined || parsed.type !== 'host' || parsed.host === undefined)
        return true;
    const rawHost = parsed.host.trim().toLowerCase();
    if (isBenchmarkHostAddress(rawHost))
        return false;
    if (rawHost.startsWith('::ffff:') && blockedHostAddresses.has(rawHost.slice('::ffff:'.length))) {
        return false;
    }
    return !blockedHostAddresses.has(normalizeHostAddress(rawHost));
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
    if (/^(utun|tun|tap|ppp|bridge|awdl|llw|gif|stf|anpi|ap\d|vmnet|veth|docker|br-|vboxnet|lo|flclash|mihomo|clash|meta|sing-?box|tailscale|zerotier|zt[0-9a-f]|wg\d|wintun|proton|surge)/.test(value)) {
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
function parseIpv4Parts(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
        return undefined;
    return parts;
}
function isBenchmarkIpv4Parts(parts) {
    // Benchmark addresses (RFC 2544: 198.18.0.0/15) are commonly assigned to proxy TUN interfaces.
    return parts[0] === 198 && (parts[1] === 18 || parts[1] === 19);
}
function isBenchmarkHostAddress(host) {
    const normalized = host.trim().toLowerCase();
    const ipv4Parts = parseIpv4Parts(normalized);
    if (ipv4Parts !== undefined)
        return isBenchmarkIpv4Parts(ipv4Parts);
    if (normalized.startsWith('::ffff:')) {
        const mappedParts = parseIpv4Parts(normalized.slice('::ffff:'.length));
        if (mappedParts !== undefined)
            return isBenchmarkIpv4Parts(mappedParts);
        const canonical = normalizeHostAddress(normalized);
        if (canonical.startsWith('::ffff:c612:') || canonical.startsWith('::ffff:c613:'))
            return true;
    }
    return false;
}
function normalizeHostAddress(address) {
    const trimmed = address.trim().toLowerCase();
    const zoneIndex = trimmed.indexOf('%');
    const withoutZone = zoneIndex < 0 ? trimmed : trimmed.slice(0, zoneIndex);
    if (!withoutZone.includes(':'))
        return withoutZone;
    try {
        const hostname = new URL(`http://[${withoutZone}]/`).hostname;
        return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    }
    catch {
        return withoutZone;
    }
}
function isTailscaleIpv6Address(address) {
    return address.startsWith('fd7a:115c:a1e0:');
}
function isUsableIpv4(ip) {
    const parts = parseIpv4Parts(ip);
    if (parts === undefined)
        return false;
    if (parts[0] === 0 || parts[0] === 127 || parts[0] >= 224)
        return false;
    if (parts[0] === 169 && parts[1] === 254)
        return false;
    if (isBenchmarkIpv4Parts(parts))
        return false;
    return true;
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