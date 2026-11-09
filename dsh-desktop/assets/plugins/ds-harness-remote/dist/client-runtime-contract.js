import { stunOnlyIceServers } from '@dsh-remote/webrtc';
export const DIRECT_WEBRTC_NEGOTIATE_TIMEOUT_MS = 12_000;
export const DIRECT_LAN_PROGRESS_DISPLAY_MS = 1_400;
export const HOST_AUTHORIZATION_ERRORS = new Set([
    'ACCOUNT_AUTH_REQUIRED',
    'AUTH_INVALID',
    'DEVICE_OWNERSHIP_REQUIRED',
    'DEVICE_REVOKED',
    'TOKEN_EXPIRED',
]);
export class ClientModeError extends Error {
    code;
    retryable;
    constructor(code, message, retryable = false) {
        super(message);
        this.code = code;
        this.retryable = retryable;
    }
}
export function assertAuthorizedHost(listed, descriptor) {
    if (descriptor.role !== 'host' || descriptor.deviceId !== listed.deviceId
        || descriptor.membershipId !== listed.membershipId) {
        throw new ClientModeError('PEER_IDENTITY_MISMATCH', 'Server Host details do not match the authorized device list.');
    }
}
export function websocketUrl(baseUrl) {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws/v1/connect`;
    return url.toString();
}
export function webrtcDiagnosticsLogFields(diagnostics) {
    if (diagnostics === undefined)
        return {};
    return {
        rtcConnectionState: diagnostics.connectionState,
        rtcIceConnectionState: diagnostics.iceConnectionState,
        rtcIceGatheringState: diagnostics.iceGatheringState,
        rtcLocalCandidates: diagnostics.localCandidates,
        rtcRemoteCandidates: diagnostics.remoteCandidates,
        rtcCandidatePairs: diagnostics.candidatePairs,
        rtcFilteredLocalCandidates: diagnostics.filteredLocalCandidates,
        rtcFilteredCandidatePairs: diagnostics.filteredCandidatePairs,
        ...(diagnostics.selectedPath === undefined ? {} : { rtcSelectedPath: diagnostics.selectedPath }),
    };
}
export function record(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ClientModeError('INVALID_MESSAGE', 'The control request payload is invalid.');
    }
    return value;
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function ok(value) { return { ok: true, value }; }
export function fail(error) {
    const source = error instanceof Error ? error : undefined;
    const remoteCode = source !== undefined && 'code' in source && typeof source.code === 'string'
        ? source.code
        : source instanceof ClientModeError ? source.code : undefined;
    const retryable = source !== undefined && 'retryable' in source && typeof source.retryable === 'boolean'
        ? source.retryable
        : source instanceof ClientModeError ? source.retryable : false;
    return {
        ok: false,
        error: {
            code: 'internal',
            message: source?.message ?? 'The remote-mode operation failed.',
            details: remoteCode === undefined ? {} : { remoteCode, retryable },
        },
    };
}
export function shortId(value) { return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`; }
export async function waitForCodexFrames(stream, signal) {
    if (signal?.aborted)
        throw new ClientModeError('RPC_ABORTED', 'The Codex event poll was cancelled.');
    await new Promise((resolve, reject) => {
        const previousWake = stream.wake;
        const timer = setTimeout(done, 25_000);
        const onAbort = () => {
            cleanup();
            reject(new ClientModeError('RPC_ABORTED', 'The Codex event poll was cancelled.'));
        };
        function cleanup() {
            clearTimeout(timer);
            stream.wake = previousWake;
            signal?.removeEventListener('abort', onAbort);
        }
        function done() {
            cleanup();
            resolve();
        }
        stream.wake = () => {
            previousWake();
            done();
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
export function diagnosticReason(error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    const message = error.message.replace(/[\r\n\t]+/g, ' ').slice(0, 240);
    return code === undefined ? message : `${code}: ${message}`;
}
export function preferredTransportsForAttempt(attempt) {
    if (attempt === 'direct')
        return ['lan', 'p2p', 'relay'];
    if (attempt === 'turn')
        return ['turn', 'relay'];
    return ['relay'];
}
export function transportPreferenceForMode(mode) {
    if (mode === 'LAN')
        return 'lan';
    if (mode === 'P2P')
        return 'p2p';
    if (mode === 'TURN')
        return 'turn';
    if (mode === 'Relay')
        return 'relay';
    return undefined;
}
export function iceServersForAttempt(attempt, iceServers) {
    return attempt === 'direct' ? stunOnlyIceServers(iceServers) : iceServers;
}
//# sourceMappingURL=client-runtime-contract.js.map