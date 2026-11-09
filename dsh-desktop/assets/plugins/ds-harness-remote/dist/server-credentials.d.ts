import { z } from 'zod';
declare const credentialSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    serverUrl: z.ZodString;
    deviceId: z.ZodString;
    authorizationMethod: z.ZodEnum<["account", "host_registration_code", "owned_device"]>;
    account: z.ZodOptional<z.ZodString>;
    accessToken: z.ZodString;
    accessTokenExpiresAt: z.ZodNumber;
    refreshToken: z.ZodString;
    refreshTokenExpiresAt: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    serverUrl: string;
    schemaVersion: 1;
    deviceId: string;
    authorizationMethod: "account" | "host_registration_code" | "owned_device";
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
    account?: string | undefined;
}, {
    serverUrl: string;
    schemaVersion: 1;
    deviceId: string;
    authorizationMethod: "account" | "host_registration_code" | "owned_device";
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
    account?: string | undefined;
}>;
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
export {};
//# sourceMappingURL=server-credentials.d.ts.map