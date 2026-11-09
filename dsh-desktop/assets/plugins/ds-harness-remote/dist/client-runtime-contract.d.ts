import type { ControlResult } from './control-result.js';
import { RemoteClientCore } from '@dsh-remote/client-core';
import type { CodexAppFrameData, CodexAppStreamClosedData, RemoteWorkspaceTypeDescription } from '@dsh-remote/protocol';
import type { RtcConnectionDiagnostics, RtcIceServer } from '@dsh-remote/webrtc';
import { AdaptiveTransport } from '@dsh-remote/webrtc';
import type { ResolvedConfig } from './config.js';
import type { TrustedPeer } from './identity-store.js';
import type { AuthorizedPeerDevice, ServerHostDevice } from './server-api.js';
export interface ConnectedRemote {
    client: RemoteClientCore;
    target: TrustedPeer;
    transport: AdaptiveTransport;
    features: RemoteHostFeatures;
    progressRunId: number;
    clientVersion?: string;
    harnessVersion?: string;
}
export interface RemoteHostFeatures {
    commandList: boolean;
    fileViewer: boolean;
    terminal: boolean;
    remoteGateway: boolean;
    sessionFormat?: 3;
    codex: boolean;
    cursor: boolean;
    antigravity: boolean;
    pi?: boolean;
    opencode: boolean;
    claude?: boolean;
    acpModelLoadsSession?: boolean;
    workspaceTypes?: readonly RemoteWorkspaceTypeDescription[];
    pluginRoute: boolean;
}
export interface CodexLoopbackStream {
    target: {
        kind: 'remote';
        client: RemoteClientCore;
    } | {
        kind: 'local';
    };
    frames: Array<{
        method: string;
        params: unknown;
    }>;
    closed?: string;
    unsubscribe: () => void;
    close: () => Promise<void>;
    wake: () => void;
}
export declare const DIRECT_WEBRTC_NEGOTIATE_TIMEOUT_MS = 12000;
export declare const DIRECT_LAN_PROGRESS_DISPLAY_MS = 1400;
export declare const HOST_AUTHORIZATION_ERRORS: Set<string>;
export type TransportAttempt = 'direct' | 'turn' | 'relay';
export interface ConnectionProgressState {
    runId: number;
    targetDeviceId: string;
    phase: 'checking-host' | 'authorizing-peer' | 'probing' | 'connected';
    activeTransports?: Array<'lan' | 'p2p' | 'turn' | 'relay'>;
}
export interface RemoteDirectoryEntry {
    name: string;
    path: string;
    hidden: boolean;
}
export interface RemoteDirectoryListing {
    path: string;
    home: string;
    crumbs: RemoteDirectoryEntry[];
    entries: RemoteDirectoryEntry[];
    truncated: boolean;
}
export interface RemoteWorkspaceView {
    workspaceId: string;
    path: string;
    title: string;
}
export interface RemoteWorkspaceSelection {
    targetDeviceId: string;
    workspaceId: string;
    backend?: 'harness' | 'codex' | 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude';
    sessionId?: string;
}
export interface RemoteDeviceView {
    deviceId: string;
    name: string;
    platform: string;
    membershipId: string;
    online: boolean;
    lastSeenAt?: number;
    clientVersion?: string;
    harnessVersion?: string;
}
export interface HostConnectionRpc {
    handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ControlResult<unknown>>, options: {
        authority: 'loopback' | 'trusted-host';
    }): () => Promise<void>;
}
export interface HostConnectionHandle {
    requestRejection?(request: {
        headers: Record<string, string | string[] | undefined>;
    }): number | undefined;
    rpc: HostConnectionRpc;
}
export interface HostAuthorizationControl {
    setAgentBackends?(config: ResolvedConfig): Promise<void>;
    setTerminalEnabled?(enabled: boolean): void;
    setLoopbackPorts?(ports: readonly number[]): void;
    hostStatus(): {
        deviceId?: string;
        configured: boolean;
        online: boolean;
        reconnecting: boolean;
        lastActiveAt?: number;
        error?: string;
        account?: string;
        authorized: boolean;
        accountRequired: boolean;
        connectedClients?: Array<{
            deviceId: string;
            name: string;
            platform?: string;
            mode?: 'LAN' | 'P2P' | 'TURN' | 'Relay';
        }>;
    };
    hasStoredAuthorization?(): Promise<boolean>;
    reconnectHost(): void;
    clearHostAuthorization(): Promise<void>;
    localHarnessVersion?(): string | undefined;
    authorizeHostAsOwned(accessToken: string, account?: string): Promise<unknown>;
    authorizeHostWithAccount(email: string, password: string): Promise<unknown>;
    authorizeHostWithCode(code: string): Promise<unknown>;
    codexStatus?(): {
        available: boolean;
    };
    codexCall?(input: unknown, signal?: AbortSignal): Promise<unknown>;
    codexRespond?(input: unknown, signal?: AbortSignal): Promise<{
        resolved: true;
    }>;
    codexOpenStream?(input: unknown, publish: (event: 'codex.app.frame' | 'codex.app.stream.closed', data: CodexAppFrameData | CodexAppStreamClosedData) => Promise<void>, signal?: AbortSignal): Promise<unknown>;
    codexCloseStream?(input: unknown): Promise<unknown>;
}
export declare class ClientModeError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(code: string, message: string, retryable?: boolean);
}
export declare function assertAuthorizedHost(listed: ServerHostDevice, descriptor: AuthorizedPeerDevice): void;
export declare function websocketUrl(baseUrl: string): string;
export declare function webrtcDiagnosticsLogFields(diagnostics: RtcConnectionDiagnostics | undefined): Record<string, unknown>;
export declare function record(value: unknown): Record<string, unknown>;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function ok(value: unknown): ControlResult<unknown>;
export declare function fail(error: unknown): ControlResult<unknown>;
export declare function shortId(value: string): string;
export declare function waitForCodexFrames(stream: CodexLoopbackStream, signal?: AbortSignal): Promise<void>;
export declare function diagnosticReason(error: Error): string;
export declare function preferredTransportsForAttempt(attempt: TransportAttempt): Array<'lan' | 'p2p' | 'turn' | 'relay'>;
export declare function transportPreferenceForMode(mode: 'LAN' | 'P2P' | 'TURN' | 'Relay' | 'Disconnected'): 'lan' | 'p2p' | 'turn' | 'relay' | undefined;
export declare function iceServersForAttempt(attempt: TransportAttempt, iceServers: RtcIceServer[]): RtcIceServer[];
//# sourceMappingURL=client-runtime-contract.d.ts.map