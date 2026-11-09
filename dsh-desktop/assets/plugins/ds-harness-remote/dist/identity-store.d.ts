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
    role?: RemoteDeviceRole;
}
export interface ResetIdentityOptions extends IdentityStoreOptions {
    createIdentityStore?: (options: IdentityStoreOptions) => IdentityStore;
}
export type RemoteDeviceRole = 'host' | 'client';
export type IdentityErrorCode = 'IDENTITY_INVALID' | 'IDENTITY_LOCKED' | 'STORAGE_CONFLICT';
export declare class IdentityInvalidError extends Error {
    readonly code: IdentityErrorCode;
    constructor(message: string, code?: IdentityErrorCode);
}
export declare class IdentityStore {
    private storageDirectory;
    get directory(): string;
    private identity?;
    private peers;
    private peerSaveChain;
    private readonly defaultOptions?;
    readonly role?: RemoteDeviceRole;
    constructor(options?: IdentityStoreOptions);
    loadOrCreate(deviceName: string): Promise<HostIdentity>;
    /**
     * Read and verify an existing identity without creating files, mutating
     * device metadata, or triggering client self-heal. Returns `undefined` when
     * neither identity file exists yet.
     */
    loadExisting(): Promise<HostIdentity | undefined>;
    private loadOrCreateLocked;
    private createAndReadIdentityLocked;
    private readIdentity;
    current(): HostIdentity;
    /**
     * Replace the identity. Runs in the same lock domain as creation, so a reset
     * can never interleave with another process's read-create-verify. The lock
     * file lives outside `removeIdentityRecords`, so resetting cannot delete a
     * lock another process holds — and cannot leave itself unprotected either.
     */
    reset(deviceName: string): Promise<HostIdentity>;
    listTrustedPeers(): TrustedPeer[];
    trustedPeer(deviceId: string): TrustedPeer | undefined;
    isTrusted(deviceId: string, publicKey: string): boolean;
    trustPeer(input: Omit<TrustedPeer, 'fingerprint' | 'trustedAt'>): Promise<TrustedPeer>;
    revokePeer(deviceId: string): Promise<boolean>;
    private loadPeers;
    private savePeers;
}
/** Resolve storage and migrate legacy data before startup or installation uses it.
 * Upgrade/restart must stop old instances: idle old processes do not hold file locks.
 */
export declare function prepareDefaultIdentityDirectory(options?: IdentityStoreOptions): Promise<string>;
/**
 * Reset the selected role identities and credentials in either an explicit
 * storage root or the default `$DSH_HOME` root. When legacy `<DSH_HOME>/remote`
 * could not be migrated only because one of its owned role identities was
 * corrupt, resetting that role repairs the legacy tree first and then completes
 * the standard migration without creating a conflicting second root.
 */
export declare function resetDefaultIdentityRoles(roles: readonly RemoteDeviceRole[], serverUrl: string | undefined, deviceName: string, options?: ResetIdentityOptions): Promise<string>;
/** Legacy storage has no owner marker. Require its complete known layout and
 * cryptographically consistent identities, rather than trusting the directory name.
 * Read-only: never repair, create peers, rename devices or refresh tokens here.
 */
export declare function assertOwnedRemoteStorage(root: string): Promise<void>;
export declare function serverStorageDirectory(root: string, serverUrl: string, role: RemoteDeviceRole): string;
export declare function fingerprint(publicKey: string): string;
//# sourceMappingURL=identity-store.d.ts.map