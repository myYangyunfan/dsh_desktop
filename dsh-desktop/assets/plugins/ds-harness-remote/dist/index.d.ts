import type { Context } from '@deepseek-ai/cordis';
import { ClientModeRuntime } from './client-runtime.js';
import { Config, type Config as ConfigShape, type ConfigInput, type EntryConfig } from './config.js';
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
/**
 * ≤0.1.6 settings registry seam (removed by DSH 0.1.7-rc.1, DSH-0.1.7-RC1-04).
 * Kept structural so the plugin can still activate on the registry generation
 * while `ctx.settings` types only describe the rc.1 `SettingsForms` face.
 */
interface LegacySettingsScopeLike {
    get(): ConfigInput;
    replace(section: Config): Promise<unknown>;
}
interface LegacySettingsProviderLike {
    register(ns: string, schema: unknown, options: {
        base?: ConfigInput;
        applies?: 'live' | 'restart';
        validate?: (value: ConfigInput) => void;
    }): LegacySettingsScopeLike;
    describe?(): Array<{
        ns: string;
        user?: unknown;
    }>;
}
export declare function apply(ctx: Context, entry?: EntryConfig | ConfigShape | undefined): void;
/**
 * Preserve existing installs after the package/settings namespace rename. The
 * old section remains untouched as a rollback source; only its raw user layer
 * is copied, once, when the current namespace has no user layer of its own.
 * Only reachable on the ≤0.1.6 registry generation.
 */
export declare function migrateLegacySettings(settings: LegacySettingsProviderLike, currentScope: LegacySettingsScopeLike): Promise<'migrated' | 'skipped' | 'failed'>;
export type { ResolvedConfig } from './config.js';
export { resolveConfig } from './config.js';
export { ConnectionController, ConnectionRejectedError } from './connection-controller.js';
export type { PeerConnectionContext, RpcRouterFactory } from './connection-controller.js';
export { fingerprint, IdentityInvalidError, IdentityStore } from './identity-store.js';
export { serverStorageDirectory } from './identity-store.js';
export type { HostIdentity, RemoteDeviceRole, TrustedPeer } from './identity-store.js';
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