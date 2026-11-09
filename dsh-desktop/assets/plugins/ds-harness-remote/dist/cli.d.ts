import { IdentityStore, type HostIdentity, type IdentityStoreOptions } from './identity-store.js';
import { type DeviceAuthorization, type OAuthProvider, type OAuthProviderInfo, type OAuthQrPollResult, type OAuthQrSession } from './server-api.js';
import { ServerCredentialStore, type ServerCredentials } from './server-credentials.js';
interface CliWriter {
    isTTY?: boolean;
    write(value: string): unknown;
}
interface CliHostApi {
    oauthProviders(): Promise<OAuthProviderInfo[]>;
    startOAuthQrLogin(provider: OAuthProvider): Promise<OAuthQrSession>;
    pollOAuthQrLogin(identity: HostIdentity, qrId: string, recoverIdentity?: () => Promise<HostIdentity>): Promise<OAuthQrPollResult>;
    bindIdentity(identity: HostIdentity): void;
    authenticate(identity?: HostIdentity): Promise<ServerCredentials>;
    revokeCurrentDevice(): Promise<void>;
    authorizeHostWithCode(identity: HostIdentity, code: string): Promise<DeviceAuthorization>;
}
export interface RemoteCliDependencies {
    env?: NodeJS.ProcessEnv;
    stdout?: CliWriter;
    stderr?: CliWriter;
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
    renderQr?: (url: string) => Promise<string>;
    createIdentityStore?: (options: IdentityStoreOptions) => IdentityStore;
    createHostApi?: (serverUrl: string, store: ServerCredentialStore) => CliHostApi;
}
/** TUI-friendly account bootstrap. Configuration remains owned by the DSH profile. */
export declare function runCli(args?: readonly string[], dependencies?: RemoteCliDependencies): Promise<number>;
export declare function renderTerminalQr(url: string): Promise<string>;
/** Square terminal modules at half the row count for fullscreen TUI scenes. */
export declare function renderCompactTerminalQr(url: string): Promise<string>;
export {};
//# sourceMappingURL=cli.d.ts.map