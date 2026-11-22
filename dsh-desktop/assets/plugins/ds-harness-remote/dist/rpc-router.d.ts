import type { DshWebLanPeer } from './dsh-web-lan.js';
import type { DshWebPeer } from './dsh-web-host.js';
import type { LanUploadHost } from './lan-upload.js';
import { type TransportUpgradeHost } from './transport-upgrade.js';
import { type RemoteMessage, type RemoteWorkspaceTypeDescription } from '@dsh-remote/protocol';
import type { LoopbackHost } from './loopback-host.js';
import type { RemoteFileViewerBridge } from './file-viewer-bridge.js';
import type { HarnessRemoteBridge } from './harness-remote-bridge.js';
import type { SafeLogger } from './logging.js';
import type { AuthenticatedPeerChannel } from './types.js';
import type { CodexPeerBridge } from './codex/peer-bridge.js';
import type { AcpPeerBridge } from './acp/peer-bridge.js';
import type { WorkspaceUploadHost } from './workspace-upload.js';
import type { PluginRouteBridge } from './plugin-route-bridge.js';
import type { RemoteCompactionOperations, RemoteCompactionOwner } from './remote-compaction-operations.js';
import type { SessionTransferPeer } from './session-transfer.js';
export { RpcError } from './safe-error.js';
export declare const HOST_CAPABILITIES: readonly ["harness.remote.v1", "harness.remote.transfer.v1", "fileviewer.read.v1", "workspace.upload.v1", "codex.appserver.v1", "codex.appserver.transfer.v1", "agent.acp.v1", "agent.acp.transfer.v1"];
/** Per-connection view of the Host-wide async compaction registry. */
export interface RemoteCompactionRoute {
    operations: RemoteCompactionOperations;
    owner: RemoteCompactionOwner;
}
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
    private readonly compaction?;
    private readonly lanUpload?;
    private readonly transportUpgrade?;
    private readonly sessionTransfer?;
    private readonly dshWeb?;
    private readonly lanWeb?;
    private readonly sameLinkIpv6Endpoints?;
    private active;
    constructor(maxPending?: number, logger?: SafeLogger | undefined, fileViewer?: RemoteFileViewerBridge | undefined, harnessRemote?: HarnessRemoteBridge | undefined, capabilities?: () => readonly string[] | Promise<readonly string[]>, codex?: CodexPeerBridge | undefined, acp?: AcpPeerBridge | undefined, loopback?: LoopbackHost | undefined, workspaceTypes?: (() => readonly RemoteWorkspaceTypeDescription[]) | undefined, pluginRoute?: PluginRouteBridge | undefined, workspaceUpload?: WorkspaceUploadHost | undefined, compaction?: RemoteCompactionRoute | undefined, lanUpload?: LanUploadHost | undefined, transportUpgrade?: TransportUpgradeHost | undefined, sessionTransfer?: SessionTransferPeer | undefined, dshWeb?: DshWebPeer | undefined, lanWeb?: DshWebLanPeer | undefined, sameLinkIpv6Endpoints?: AuthenticatedPeerChannel['sameLinkIpv6Endpoints']);
    closePeerStreams(): Promise<void>;
    handle(message: RemoteMessage): Promise<RemoteMessage>;
    private invoke;
    private requireCompaction;
    private requireRemoteGateway;
    private requireCodex;
    private requireAcp;
    private requirePluginRoute;
    private requireTransportUpgrade;
}
//# sourceMappingURL=rpc-router.d.ts.map