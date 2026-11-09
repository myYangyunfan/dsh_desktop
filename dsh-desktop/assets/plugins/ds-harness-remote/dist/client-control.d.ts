import type { ControlResult } from './control-result.js';
import type { PluginRouteCallResult } from '@dsh-remote/protocol';
import type { AcpVirtualWorkspaceView } from './acp/virtual-harness.js';
import type { HarnessMode } from './harness-target.js';
import type { ConnectedRemote, HostAuthorizationControl, RemoteDeviceView, RemoteDirectoryListing, RemoteWorkspaceSelection, RemoteWorkspaceView } from './client-runtime-contract.js';
import type { CodexVirtualWorkspaceView } from './codex/virtual-harness.js';
import type { RemoteFileViewerEndpoint } from './file-viewer-contract.js';
import { LoopbackPreview } from './loopback-preview.js';
import type { OAuthProvider } from './server-api.js';
import { ClientServerApi } from './server-api.js';
/** Collaborates with one ClientModeRuntime; never creates a second session or connection state. */
export interface ClientControlContext {
    readonly detailedStatus: () => Promise<Record<string, unknown>>;
    readonly devices: () => Promise<RemoteDeviceView[]>;
    readonly server: ClientServerApi;
    readonly authorizeClientWithAccount: (email: string, password: string) => Promise<unknown>;
    readonly startClientOAuthQrLogin: (provider: OAuthProvider) => Promise<unknown>;
    readonly pollClientOAuthQrLogin: (qrId: string) => Promise<unknown>;
    readonly activeRemote: () => ConnectedRemote | undefined;
    preview: LoopbackPreview | undefined;
    readonly listRemoteDirectory: (targetDeviceId: string, path?: string, signal?: AbortSignal) => Promise<RemoteDirectoryListing>;
    readonly listRemoteWorkspaces: (targetDeviceId: string, signal?: AbortSignal) => Promise<RemoteWorkspaceView[]>;
    readonly listCodexWorkspaces: (targetDeviceId: string, signal?: AbortSignal) => Promise<CodexVirtualWorkspaceView[]>;
    readonly openRemoteWorkspace: (targetDeviceId: string, path: string, signal?: AbortSignal) => Promise<Record<string, unknown>>;
    readonly openCodexWorkspace: (targetDeviceId: string, workspaceId: string, signal?: AbortSignal) => Promise<Record<string, unknown>>;
    readonly createCodexWorkspace: (targetDeviceId: string, path: string, signal?: AbortSignal) => Promise<Record<string, unknown>>;
    readonly listCursorWorkspaces: (targetDeviceId: string, signal?: AbortSignal, backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude") => Promise<AcpVirtualWorkspaceView[]>;
    readonly openCursorWorkspace: (targetDeviceId: string, workspaceId: string, signal?: AbortSignal, backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude") => Promise<Record<string, unknown>>;
    readonly createCursorWorkspace: (targetDeviceId: string, path: string, signal?: AbortSignal, backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude") => Promise<Record<string, unknown>>;
    readonly consumeWorkspaceSelection: (selection: RemoteWorkspaceSelection) => Record<string, unknown>;
    readonly callRemoteFileViewer: (endpoint: RemoteFileViewerEndpoint, payload: unknown, signal?: AbortSignal) => Promise<unknown>;
    readonly activeCodexRemote: () => ConnectedRemote | undefined;
    readonly requireLocalCodex: () => Required<Pick<HostAuthorizationControl, "codexCall" | "codexRespond" | "codexOpenStream" | "codexCloseStream">>;
    readonly localCodexAvailable: () => boolean;
    readonly pluginRoute: (route: string, body: unknown, signal: AbortSignal) => Promise<PluginRouteCallResult>;
    readonly openCodexStream: (payload: unknown, signal?: AbortSignal) => Promise<unknown>;
    readonly nextCodexFrames: (payload: unknown, signal?: AbortSignal) => Promise<unknown>;
    readonly closeCodexStream: (payload: unknown) => Promise<unknown>;
    readonly host: HostAuthorizationControl | undefined;
    readonly setHostAuthorization: (enabled: boolean) => Promise<unknown>;
    readonly setMode: (mode: HarnessMode, targetDeviceId?: string, signal?: AbortSignal) => Promise<Record<string, unknown>>;
}
export declare class ClientControl {
    private readonly context;
    constructor(context: ClientControlContext);
    handleControl(endpoint: string, payload: unknown, signal: AbortSignal): Promise<ControlResult<unknown>>;
}
//# sourceMappingURL=client-control.d.ts.map