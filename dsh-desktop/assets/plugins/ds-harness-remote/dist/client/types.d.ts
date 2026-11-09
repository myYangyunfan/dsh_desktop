import type { LocaleKey } from '../client-locale.js';
import type { RemoteFileContentProvider } from '../remote-file-content-provider.js';
export interface ControlResult<T = unknown> {
    ok: boolean;
    value?: T;
    error?: {
        message?: string;
    };
}
export interface FileViewerClientServiceLike {
    registerContentProvider(provider: RemoteFileContentProvider): () => void;
}
export type RemoteTransportPreference = 'lan' | 'p2p' | 'turn' | 'relay';
export interface RemoteStatus {
    mode: 'local' | 'remote';
    backend?: 'harness' | 'codex' | 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude';
    target?: {
        deviceId: string;
        name: string;
    };
    workspaceSelection?: RemoteWorkspaceSelection;
    available: boolean;
    controlUnavailable?: boolean;
    deviceName?: string;
    deviceId?: string;
    serverUrl?: string;
    connected?: boolean;
    connectedTargetDeviceId?: string;
    transport?: 'LAN' | 'P2P' | 'TURN' | 'Relay' | 'Disconnected';
    preferredTransports?: RemoteTransportPreference[];
    connectionProgress?: {
        targetDeviceId: string;
        phase: 'checking-host' | 'authorizing-peer' | 'probing' | 'connected';
        activeTransports?: RemoteTransportPreference[];
    };
    remoteFeatures?: {
        commandList: boolean;
        fileViewer: boolean;
        terminal?: boolean;
        pluginRoute?: boolean;
        codex?: boolean;
        cursor?: boolean;
        antigravity?: boolean;
        pi?: boolean;
        opencode?: boolean;
        claude?: boolean;
        workspaceTypes?: ReadonlyArray<{
            id: string;
            name: string;
            capability: string;
            available: boolean;
        }>;
    };
    network?: RemoteNetworkDetails;
    hostAuthorizationAvailable: boolean;
    host?: {
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
}
interface RemoteNetworkDetails {
    connectionId?: string;
    connectedAt?: number;
    controlChannelUrl: string;
    controlChannelState: 'connecting' | 'open' | 'closing' | 'closed';
    preferredTransports: RemoteTransportPreference[];
    local: {
        deviceId: string;
        name: string;
        platform: string;
    };
    remote: {
        deviceId: string;
        name: string;
        platform: string;
    };
    webRtc?: {
        mode?: 'LAN' | 'P2P' | 'TURN';
        connectionState: string;
        iceConnectionState: string;
        dataChannelState?: string;
        localCandidateType?: string;
        remoteCandidateType?: string;
        localAddress?: string;
        remoteAddress?: string;
        protocol?: string;
        relayProtocol?: string;
        currentRoundTripTimeMs?: number;
        availableOutgoingBitrate?: number;
        bytesSent?: number;
        bytesReceived?: number;
    };
}
export interface RemoteDevice {
    deviceId: string;
    name: string;
    platform: string;
    online: boolean;
    clientVersion?: string;
    harnessVersion?: string;
}
export interface OAuthQrSession {
    qrId: string;
    scanUrl: string;
    expiresIn: number;
}
export type OAuthProvider = string;
export type LoginMethod = `oauth:${string}` | 'password';
export interface OAuthQrPollResult {
    status: 'pending' | 'expired' | 'complete';
}
interface RemoteDirectoryEntry {
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
export interface CodexWorkspaceView extends RemoteWorkspaceView {
    sessionCount: number;
}
export interface CursorWorkspaceView extends RemoteWorkspaceView {
    sessionCount: number;
}
export interface RemoteWorkspaceSelection {
    targetDeviceId: string;
    workspaceId: string;
    backend?: 'harness' | 'codex' | 'cursor' | 'antigravity' | 'pi' | 'opencode' | 'claude';
    sessionId?: string;
}
export interface WorkspacesClientServiceLike {
    list: {
        getSnapshot(): {
            items: ReadonlyArray<{
                workspaceId: string;
            }>;
            baselinesReady?: boolean;
            phase?: string;
        };
        subscribe(listener: () => void): () => void;
    };
    connectWorkspace(workspaceId: string): Promise<string>;
    /** Harness 0.2 owns the main Session retain/release lifecycle here. */
    openSession?(sessionId: string): void;
}
export interface SessionsClientServiceLike {
    list: {
        getSnapshot(): {
            ids: ReadonlyArray<string>;
            phase: string;
        };
        subscribe(listener: () => void): () => void;
    };
    refresh?(): Promise<void>;
    open?(sessionId: string): void;
    retain?(target: string, options: {
        source: string;
    }): {
        sessionId: string;
        ready?: Promise<unknown>;
        release(): void;
    };
}
export interface UiWorkspaceClientServiceLike {
    connectWorkspace(workspaceId: string): Promise<string>;
    openSession(sessionId: string): void;
}
interface PluginSettings {
    enabled?: boolean;
    role?: 'host' | 'client' | 'both';
    serverUrl?: string;
    terminal?: {
        enabled?: boolean;
    };
    hostControl?: {
        enabled?: boolean;
    };
    loopback?: {
        ports?: number[];
    };
    forceRelay?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    reconnect?: boolean | {
        enabled?: boolean;
        initialDelayMs?: number;
        maxDelayMs?: number;
        jitter?: number;
    };
    codex?: {
        enabled?: boolean;
        binary?: string;
    };
    cursor?: {
        enabled?: boolean;
        binary?: string;
    };
    acp?: {
        enabled?: boolean;
        backends?: Array<{
            id: string;
            enabled?: boolean;
            command?: string;
            args?: string[];
            cwd?: string;
        }>;
    };
}
export interface PluginSettingsView {
    config: PluginSettings;
    deviceName: string;
    writable: boolean;
    applies: 'live' | 'restart';
    association?: PluginAssociation;
    associations?: Partial<Record<'host' | 'client', PluginAssociation>>;
    acpAvailability?: Record<string, boolean>;
}
export interface PluginAssociation {
    method: 'account' | 'host_registration_code' | 'owned_device';
    account?: string;
}
export interface RemoteConnectionProgress {
    label: LocaleKey;
    detail: LocaleKey;
    percent: number;
    transports?: RemoteTransportPreference[];
    activeTransports?: RemoteTransportPreference[];
    routeVerb?: 'trying' | 'using';
}
/** React is supplied by Harness ModuleLoader, never bundled as a second runtime. */
export type ClientReact = {
    Fragment: unknown;
    createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
    useEffect(effect: () => void | (() => void), deps: unknown[]): void;
    useCallback<T>(callback: T, deps: unknown[]): T;
    useMemo<T>(factory: () => T, deps: unknown[]): T;
    useRef<T>(initial: T): {
        current: T;
    };
    useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
    useSyncExternalStore<T>(subscribe: (onStoreChange: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
};
export {};
//# sourceMappingURL=types.d.ts.map