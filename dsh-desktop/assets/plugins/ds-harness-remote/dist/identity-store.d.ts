export interface HostIdentity {
    schemaVersion: 1;
    deviceId: string;
    name: string;
    publicKey: string;
    privateKey: string;
    fingerprint: string;
}
export interface TrustedPeer {
    deviceId: string;
    name: string;
    platform: string;
    publicKey: string;
    fingerprint: string;
    trustedAt: number;
    membershipId?: string;
}
export interface IdentityStoreOptions {
    directory?: string;
    env?: NodeJS.ProcessEnv;
    homeDirectory?: string;
}
export type RemoteDeviceRole = 'host' | 'client';
export declare class IdentityInvalidError extends Error {
    readonly code = "IDENTITY_INVALID";
}
export declare class IdentityStore {
    readonly directory: string;
    private identity?;
    private peers;
    constructor(options?: IdentityStoreOptions);
    loadOrCreate(deviceName: string): Promise<HostIdentity>;
    current(): HostIdentity;
    reset(deviceName: string): Promise<HostIdentity>;
    listTrustedPeers(): TrustedPeer[];
    trustedPeer(deviceId: string): TrustedPeer | undefined;
    isTrusted(deviceId: string, publicKey: string): boolean;
    trustPeer(input: Omit<TrustedPeer, 'fingerprint' | 'trustedAt'>): Promise<TrustedPeer>;
    revokePeer(deviceId: string): Promise<boolean>;
    private loadPeers;
    private savePeers;
}
export declare function serverStorageDirectory(root: string, serverUrl: string, role: RemoteDeviceRole): string;
export declare function fingerprint(publicKey: string): string;
//# sourceMappingURL=identity-store.d.ts.map