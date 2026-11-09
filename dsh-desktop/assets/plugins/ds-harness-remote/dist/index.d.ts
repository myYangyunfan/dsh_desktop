import type { Context } from '@deepseek-ai/cordis';
import { ClientModeRuntime } from './client-runtime.js';
import { Config, type Config as ConfigShape, type EntryConfig } from './config.js';
import { HostPluginRuntime } from './service.js';
import type { TypertGatewayLike } from './typert-gateway-contract.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        dshRemote: HostPluginRuntime;
        dshRemoteClient: ClientModeRuntime;
        typertGateway: TypertGatewayLike;
    }
}
export declare const name = "ds-harness-remote";
export { Config };
export declare function apply(ctx: Context, entry?: EntryConfig | ConfigShape | undefined): void;
export type { ResolvedConfig } from './config.js';
export { resolveConfig } from './config.js';
export { ConnectionController, ConnectionRejectedError } from './connection-controller.js';
export type { PeerConnectionContext, RpcRouterFactory } from './connection-controller.js';
export { fingerprint, IdentityInvalidError, IdentityStore, prepareDefaultIdentityDirectory, resetDefaultIdentityRoles, } from './identity-store.js';
export { serverStorageDirectory } from './identity-store.js';
export type { HostIdentity, IdentityErrorCode, RemoteDeviceRole, ResetIdentityOptions, TrustedPeer } from './identity-store.js';
export { ClientServerApi, HostServerApi, ServerApiError } from './server-api.js';
export { HostServerConnection } from './server-connection.js';
export type { WebSocketFactory } from './server-connection.js';
export { ServerCredentialStore, ServerCredentialsInvalidError } from './server-credentials.js';
export type { ServerCredentials } from './server-credentials.js';
export { HOST_CAPABILITIES, RpcError, RpcRouter } from './rpc-router.js';
export { HostPluginRuntime } from './service.js';
export { ClientModeError, ClientModeRuntime } from './client-runtime.js';
export { PluginControlRuntime } from './control-runtime.js';
export { ClientSecureTransport } from './client-secure-transport.js';
export { HARNESS_REMOTE_ALLOWLIST, HarnessRemoteBridge } from './harness-remote-bridge.js';
export { RemoteTypertGateway } from './remote-typert-gateway.js';
export { RemoteFileViewerBridge } from './file-viewer-bridge.js';
export { CodexRemoteDomain } from './codex/domain.js';
export { CodexPeerBridge } from './codex/peer-bridge.js';
export { CodexAppServerClient, CodexAppServerError } from './codex/app-server.js';
export { CODEX_APP_ALLOWLIST } from './codex/method-policy.js';
export { AcpRemoteGateway } from './acp/gateway.js';
export { AcpPeerBridge } from './acp/peer-bridge.js';
export { CursorAcpClient, CursorAcpError } from './acp/adapters/cursor-process.js';
export { ACP_METHOD_ALLOWLIST } from './acp/method-policy.js';
export { createRemoteFileContentProvider } from './remote-file-content-provider.js';
export { TypertGatewaySwitch } from './typert-gateway-switch.js';
export { runCli } from './cli.js';
export type { RemoteCliDependencies } from './cli.js';
export type { LocalTypertGateway, RemoteTypertGatewayTarget, TypertGatewayLike, TypertGatewayRequest, TypertGatewayWireStreamLike, TypertRpcResult, } from './typert-gateway-contract.js';
export type { AuthenticatedPeerChannel } from './types.js';
export { AcpGateway } from './acp.js';
export type { AcpBackendAdapter } from './acp.js';
//# sourceMappingURL=index.d.ts.map