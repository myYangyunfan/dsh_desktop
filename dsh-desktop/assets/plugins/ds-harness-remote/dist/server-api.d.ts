import type { PairingCredentials } from './pairing-contract.js';
import type { RtcIceServer } from '@dsh-remote/webrtc';
import type { HostIdentity } from './identity-store.js';
import { type ServerCredentialStore, type ServerCredentials } from './server-credentials.js';
export interface OAuthQrSession {
    qrId: string;
    scanUrl: string;
    expiresIn: number;
}
/** Server-owned opaque provider ID; new integrations need no plugin release. */
export type OAuthProvider = string;
export interface OAuthProviderInfo {
    id: OAuthProvider;
    displayName: string;
    startUrl: string;
    qrStartUrl?: string | null;
    devicePairing?: true;
}
export type OAuthQrPollResult = {
    status: 'pending' | 'expired';
} | {
    status: 'complete';
    authorization: DeviceAuthorization;
};
export interface DeviceAuthorization {
    method: 'account' | 'host_registration_code' | 'owned_device' | 'device_pairing';
    account?: string;
    expiresAt?: number;
    isAdmin?: boolean;
}
export type FetchImplementation = typeof fetch;
export interface ServerHostDevice {
    deviceId: string;
    name: string;
    platform: string;
    membershipId: string;
    online?: boolean;
    lastSeenAt?: number;
    clientVersion?: string;
    harnessVersion?: string;
}
export interface AuthorizedPeerDevice extends ServerHostDevice {
    role: 'host' | 'client';
    identityKey: string;
}
export declare class HostServerApi {
    private readonly store;
    private readonly fetchImplementation;
    private readonly role;
    readonly baseUrl: string;
    private hostOnly;
    private identity?;
    private credentials?;
    private credentialsPromise?;
    private harnessVersion?;
    private readonly lifetime;
    constructor(serverUrl: string, store: ServerCredentialStore, fetchImplementation?: FetchImplementation, role?: 'host' | 'client');
    bindIdentity(identity: HostIdentity): void;
    setHarnessVersion(version: string | undefined): void;
    /** End this runtime's HTTP requests, including authentication and response bodies. */
    close(): void;
    pairingHostOnly(): boolean;
    loadStoredPolicy(): Promise<void>;
    adoptPairing(result: PairingCredentials): Promise<void>;
    currentAuthorization(): DeviceAuthorization | undefined;
    /** Check the persisted device credential without issuing or refreshing one. */
    hasStoredAuthorization(): Promise<boolean>;
    clearAuthorization(): Promise<void>;
    revokeCurrentDevice(): Promise<void>;
    authorizeWithAccount(identity: HostIdentity, email: string, password: string, recoverIdentity?: () => Promise<HostIdentity>): Promise<DeviceAuthorization>;
    oauthProviders(): Promise<OAuthProviderInfo[]>;
    startOAuthQrLogin(provider?: OAuthProvider): Promise<OAuthQrSession>;
    pollOAuthQrLogin(identity: HostIdentity, qrId: string, recoverIdentity?: () => Promise<HostIdentity>): Promise<OAuthQrPollResult>;
    authorizeHostWithCode(identity: HostIdentity, code: string): Promise<DeviceAuthorization>;
    authorizeOwnedRole(identity: HostIdentity, authorizingAccessToken: string, account?: string): Promise<DeviceAuthorization>;
    authenticate(identity?: HostIdentity): Promise<ServerCredentials>;
    refreshCredentials(rejectedAccessToken?: string | undefined): Promise<ServerCredentials>;
    private withRefreshLock;
    private rotateCredentials;
    listDevices(signal?: AbortSignal): Promise<ServerHostDevice[]>;
    devicePages(signal?: AbortSignal): AsyncGenerator<ServerHostDevice[]>;
    deviceFor(peerDeviceId: string, signal?: AbortSignal): Promise<AuthorizedPeerDevice>;
    turnCredentials(connectionId: string): Promise<RtcIceServer[]>;
    presenceFor(deviceId: string, signal?: AbortSignal): Promise<{
        online: boolean;
        lastSeenAt?: number;
    }>;
    private loadOrIssue;
    private register;
    private deviceDescriptor;
    private saveTokens;
    private request;
    private publicRequest;
    private requireIdentity;
}
export declare class ClientServerApi extends HostServerApi {
    constructor(serverUrl: string, store: ServerCredentialStore, fetchImplementation?: FetchImplementation);
}
export declare class ServerApiError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly status?: number | undefined;
    readonly phase?: "credential_refresh" | undefined;
    readonly reason?: "http_error" | "invalid_json" | "invalid_error_envelope" | "timeout" | "network_error" | undefined;
    constructor(code: string, message: string, retryable: boolean, status?: number | undefined, phase?: "credential_refresh" | undefined, reason?: "http_error" | "invalid_json" | "invalid_error_envelope" | "timeout" | "network_error" | undefined);
}
//# sourceMappingURL=server-api.d.ts.map