import { z } from 'zod';
export declare const pairingDeviceSchema: z.ZodObject<{
    deviceId: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<{
        host: "host";
        client: "client";
    }>;
    platform: z.ZodString;
    identityKey: z.ZodString;
    clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export declare const pairingCreatedSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    sessionId: z.ZodString;
    expiresAt: z.ZodNumber;
    serverPublicKey: z.ZodString;
    scanSecret: z.ZodString;
    host: z.ZodObject<{
        deviceId: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<{
            host: "host";
            client: "client";
        }>;
        platform: z.ZodString;
        identityKey: z.ZodString;
        clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const pairingCredentialsSchema: z.ZodObject<{
    account: z.ZodString;
    accountKind: z.ZodEnum<{
        standard: "standard";
        device_only: "device_only";
    }>;
    device: z.ZodObject<{
        deviceId: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<{
            host: "host";
            client: "client";
        }>;
        platform: z.ZodString;
        identityKey: z.ZodString;
        clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>;
    inboundOnly: z.ZodBoolean;
    pairingRestricted: z.ZodBoolean;
    tokens: z.ZodType<import("@dsh-remote/protocol").DeviceTokenPair, unknown, z.core.$ZodTypeInternals<import("@dsh-remote/protocol").DeviceTokenPair, unknown>>;
}, z.core.$strict>;
export declare const pairingStatusSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    sessionId: z.ZodString;
    state: z.ZodEnum<{
        created: "created";
        claimed: "claimed";
        approved: "approved";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
        expired: "expired";
    }>;
    expiresAt: z.ZodNumber;
    recoverUntil: z.ZodNumber;
    failureReason: z.ZodNullable<z.ZodString>;
    attemptConsumed: z.ZodBoolean;
    submissionId: z.ZodNullable<z.ZodString>;
    host: z.ZodObject<{
        deviceId: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<{
            host: "host";
            client: "client";
        }>;
        platform: z.ZodString;
        identityKey: z.ZodString;
        clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>;
    mobile: z.ZodNullable<z.ZodObject<{
        deviceId: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<{
            host: "host";
            client: "client";
        }>;
        platform: z.ZodString;
        identityKey: z.ZodString;
        clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>>;
    credentials: z.ZodNullable<z.ZodObject<{
        account: z.ZodString;
        accountKind: z.ZodEnum<{
            standard: "standard";
            device_only: "device_only";
        }>;
        device: z.ZodObject<{
            deviceId: z.ZodString;
            name: z.ZodString;
            role: z.ZodEnum<{
                host: "host";
                client: "client";
            }>;
            platform: z.ZodString;
            identityKey: z.ZodString;
            clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>;
        inboundOnly: z.ZodBoolean;
        pairingRestricted: z.ZodBoolean;
        tokens: z.ZodType<import("@dsh-remote/protocol").DeviceTokenPair, unknown, z.core.$ZodTypeInternals<import("@dsh-remote/protocol").DeviceTokenPair, unknown>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type PairingCredentials = z.infer<typeof pairingCredentialsSchema>;
export interface HostPairingView {
    sessionId: string;
    state: z.infer<typeof pairingStatusSchema>['state'];
    expiresAt: number;
    serverUrl: string;
    hostFingerprint: string;
    qrPayload?: string;
    mobile?: {
        deviceId: string;
        name: string;
        fingerprint: string;
    };
    failureReason?: string;
    canRetry: boolean;
    localSaved: boolean;
}
export declare const savedPairingSchema: z.ZodObject<{
    serverUrl: z.ZodString;
    deviceId: z.ZodString;
    session: z.ZodObject<{
        v: z.ZodLiteral<1>;
        sessionId: z.ZodString;
        expiresAt: z.ZodNumber;
        serverPublicKey: z.ZodString;
        scanSecret: z.ZodString;
        host: z.ZodObject<{
            deviceId: z.ZodString;
            name: z.ZodString;
            role: z.ZodEnum<{
                host: "host";
                client: "client";
            }>;
            platform: z.ZodString;
            identityKey: z.ZodString;
            clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    qrFormat: z.ZodOptional<z.ZodLiteral<"fragment-ticket-v1">>;
    state: z.ZodEnum<{
        created: "created";
        claimed: "claimed";
        approved: "approved";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
        expired: "expired";
    }>;
    mobile: z.ZodOptional<z.ZodObject<{
        deviceId: z.ZodString;
        name: z.ZodString;
        role: z.ZodEnum<{
            host: "host";
            client: "client";
        }>;
        platform: z.ZodString;
        identityKey: z.ZodString;
        clientVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        harnessVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strict>>;
    submission: z.ZodOptional<z.ZodString>;
    localSaved: z.ZodBoolean;
}, z.core.$strict>;
//# sourceMappingURL=pairing-contract.d.ts.map