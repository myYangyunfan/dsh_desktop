/**
 * Node RTC factory (webrtc-implementation-plan.md §6.2).
 *
 * Native libwebrtc is preferred when present because its ICE behavior matches
 * browser Remote Web. werift remains the pure-TypeScript fallback for systems
 * without a loadable native addon. Both backends are loaded lazily so DSH
 * startup remains unaffected when WebRTC is unused or `forceRelay` is enabled.
 */
import { type NetworkInterfaceInfo } from 'node:os';
import type { RtcIceCandidateInit, RtcIceServer, RtcPeerConnectionFactory, RtcStats } from '@dsh-remote/webrtc';
interface WeriftModule {
    RTCPeerConnection: new (config?: WeriftConfig) => WeriftPeerConnection;
}
interface WeriftConfig {
    iceServers?: Array<{
        urls: string | string[];
        username?: string;
        credential?: string;
    }>;
    iceAdditionalHostAddresses?: string[];
    iceFilterCandidatePair?: (pair: WeriftCandidatePair) => boolean;
    iceUseIpv4?: boolean;
    iceUseIpv6?: boolean;
    iceUseLinkLocalAddress?: boolean;
    iceInterfaceAddresses?: {
        udp4?: string;
        udp6?: string;
    };
}
interface WeriftCandidate {
    host?: string;
    type?: string;
    relatedAddress?: string;
}
interface WeriftCandidatePair {
    localCandidate?: WeriftCandidate;
}
interface WeriftPeerConnection {
    connectionState: string;
    iceConnectionState: string;
    iceGatheringState: string;
    signalingState: string;
    onconnectionstatechange: (() => void) | null;
    oniceconnectionstatechange: (() => void) | null;
    onicegatheringstatechange: (() => void) | null;
    onicecandidate: ((event: {
        candidate?: {
            toJSON(): RtcIceCandidateInit;
        };
    }) => void) | null;
    ondatachannel: ((event: {
        channel: WeriftDataChannel;
    }) => void) | null;
    createDataChannel(label: string, options: {
        ordered: boolean;
    }): WeriftDataChannel;
    createOffer(): Promise<{
        type: 'offer' | 'answer';
        sdp: string;
    }>;
    createAnswer(): Promise<{
        type: 'offer' | 'answer';
        sdp: string;
    }>;
    setLocalDescription(description?: {
        type: string;
        sdp?: string;
    }): Promise<unknown>;
    setRemoteDescription(description: {
        type: string;
        sdp?: string;
    }): Promise<void>;
    addIceCandidate(candidate?: RtcIceCandidateInit | null): Promise<void>;
    getStats(): Promise<RtcStats>;
    close(): Promise<void>;
}
interface WeriftDataChannel {
    readonly label: string;
    readonly ordered: boolean;
    readyState: string;
    bufferedAmount: number;
    onopen: (() => void) | null;
    onclose: (() => void) | null;
    onerror: (() => void) | null;
    onmessage: ((event: {
        data: string | Uint8Array;
    }) => void) | null;
    send(data: Buffer | string): void;
    close(): void;
}
/**
 * Node RTC factory used by the Plugin/VS Code clients and Host. Native
 * libwebrtc is preferred because its ICE behavior matches browser Remote Web;
 * werift remains the no-native fallback for environments that cannot load it.
 */
export declare function loadNodeRtcFactory(options?: WeriftFactoryOptions): Promise<RtcPeerConnectionFactory | undefined>;
/** Load (once) a werift-backed factory, or `undefined` when it cannot be loaded. */
export declare function loadWeriftFactory(options?: WeriftFactoryOptions): Promise<RtcPeerConnectionFactory | undefined>;
export interface WeriftFactoryOptions {
    interfaces?: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>;
    preferredHostIpv4Candidates?: readonly string[];
    routeTargets?: readonly string[];
    routeProbeTimeoutMs?: number;
}
/** Synchronous factory for tests and callers that already resolved werift. */
export declare function buildWeriftFactory(werift: WeriftModule, options?: WeriftFactoryOptions): RtcPeerConnectionFactory;
/**
 * Pick the safe IPv4 host addresses for ICE gathering.
 *
 * On macOS a host exposes many interfaces (WiFi `en0`, Thunderbolt `en1-4`,
 * `bridge*`, Apple Wireless Direct Link `awdl0`/`llw0`, and several VPN `utun*`
 * tunnels whose small MTUs drop large SCTP packets). Let werift/ICE compare
 * real physical interfaces, but filter virtual and link-local Host candidates
 * before they can become nominated paths.
 */
export declare function detectHostIpv4Candidates(interfaces: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>, preferredHostIpv4Candidates?: readonly string[]): string[];
export declare function detectRouteHostIpv4Candidates(targets: readonly string[], timeoutMs?: number): Promise<string[]>;
export declare function shouldAdvertiseCandidate(candidate: RtcIceCandidateInit, allowedHostIpv4: ReadonlySet<string>): boolean;
export declare function orderIceServersForWerift(iceServers: readonly RtcIceServer[]): RtcIceServer[];
export {};
//# sourceMappingURL=werift-rtc.d.ts.map