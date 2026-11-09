import { type RemoteMessage, type RemoteWorkspaceTypeDescription } from '@dsh-remote/protocol';
import type { LoopbackHost } from './loopback-host.js';
import type { RemoteFileViewerBridge } from './file-viewer-bridge.js';
import type { HarnessRemoteBridge } from './harness-remote-bridge.js';
import type { SafeLogger } from './logging.js';
import type { CodexPeerBridge } from './codex/peer-bridge.js';
import type { AcpPeerBridge } from './acp/peer-bridge.js';
import type { WorkspaceUploadHost } from './workspace-upload.js';
import type { PluginRouteBridge } from './plugin-route-bridge.js';
export { RpcError } from './safe-error.js';
export declare const HOST_CAPABILITIES: readonly ["harness.remote.v1", "harness.remote.transfer.v1", "fileviewer.read.v1", "workspace.upload.v1", "codex.appserver.v1", "codex.appserver.transfer.v1", "agent.acp.v1", "agent.acp.transfer.v1"];
export declare class RpcRouter {
    private readonly maxPending;
    private readonly logger?;
    private readonly fileViewer?;
    private readonly harnessRemote?;
    private readonly capabilities;
    private readonly codex?;
    private readonly acp?;
    private readonly loopback?;
    private readonly workspaceTypes?;
    private readonly pluginRoute?;
    private readonly workspaceUpload?;
    private active;
    constructor(maxPending?: number, logger?: SafeLogger | undefined, fileViewer?: RemoteFileViewerBridge | undefined, harnessRemote?: HarnessRemoteBridge | undefined, capabilities?: () => readonly string[], codex?: CodexPeerBridge | undefined, acp?: AcpPeerBridge | undefined, loopback?: LoopbackHost | undefined, workspaceTypes?: (() => readonly RemoteWorkspaceTypeDescription[]) | undefined, pluginRoute?: PluginRouteBridge | undefined, workspaceUpload?: WorkspaceUploadHost | undefined);
    closePeerStreams(): Promise<void>;
    handle(message: RemoteMessage): Promise<RemoteMessage>;
    private invoke;
    private requireRemoteGateway;
    private requireCodex;
    private requireAcp;
    private requirePluginRoute;
}
//# sourceMappingURL=rpc-router.d.ts.map