import { z } from 'zod';
declare const credentialSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    serverUrl: z.ZodString;
    deviceId: z.ZodString;
    authorizationMethod: z.ZodEnum<{
        account: "account";
        host_registration_code: "host_registration_code";
        owned_device: "owned_device";
        device_pairing: "device_pairing";
    }>;
    accountKind: z.ZodOptional<z.ZodEnum<{
        standard: "standard";
        device_only: "device_only";
    }>>;
    pairingRestricted: z.ZodOptional<z.ZodBoolean>;
    inboundOnly: z.ZodOptional<z.ZodBoolean>;
    account: z.ZodOptional<z.ZodString>;
    accessToken: z.ZodString;
    accessTokenExpiresAt: z.ZodNumber;
    refreshToken: z.ZodString;
    refreshTokenExpiresAt: z.ZodNumber;
}, z.core.$strict>;
export interface ServerCredentials extends z.infer<typeof credentialSchema> {
}
export declare class ServerCredentialStore {
    private readonly path;
    constructor(directory: string);
    /** Serialize the complete read/refresh/write transaction across processes.
     * Never steal an old lock: a suspended owner may still consume a one-use token.
     * After a crash, stop all instances before removing the orphaned lock.
     */
    withRefreshLock<T>(operation: () => Promise<T>): Promise<T>;
    pairingHostOnly(): Promise<boolean>;
    restrictPairingHostOnly(): Promise<void>;
    load(serverUrl: string, deviceId: string): Promise<ServerCredentials | undefined>;
    save(credentials: Omit<ServerCredentials, 'schemaVersion'>): Promise<ServerCredentials>;
    clear(): Promise<void>;
}
export declare class ServerCredentialsInvalidError extends Error {
    readonly code = "SERVER_CREDENTIALS_INVALID";
}
export declare class ServerCredentialsBusyError extends Error {
    readonly code = "SERVER_CREDENTIALS_BUSY";
    constructor();
}
export declare function atomicWritePrivate(path: string, contents: string): Promise<void>;
export declare function readPrivateJson(path: string): Promise<unknown | undefined>;
export {};
//# sourceMappingURL=server-credentials.d.ts.map