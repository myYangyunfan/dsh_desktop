import { z } from 'zod';
import { deviceTokenPairSchema } from '@dsh-remote/protocol';
export const pairingDeviceSchema = z.object({
    deviceId: z.string().min(1).max(128), name: z.string().max(128), role: z.enum(['host', 'client']),
    platform: z.string().max(32), identityKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    clientVersion: z.string().nullable().optional(), harnessVersion: z.string().nullable().optional(),
}).strict();
export const pairingCreatedSchema = z.object({ v: z.literal(1), sessionId: z.string().uuid(), expiresAt: z.number().int().positive(),
    serverPublicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/), scanSecret: z.string().regex(/^[A-Za-z0-9_-]{43}$/), host: pairingDeviceSchema }).strict();
export const pairingCredentialsSchema = z.object({ account: z.string().min(1).max(254), accountKind: z.enum(['standard', 'device_only']),
    device: pairingDeviceSchema, inboundOnly: z.boolean(), pairingRestricted: z.boolean(), tokens: deviceTokenPairSchema }).strict();
export const pairingStatusSchema = z.object({ v: z.literal(1), sessionId: z.string().uuid(),
    state: z.enum(['created', 'claimed', 'approved', 'completed', 'failed', 'cancelled', 'expired']),
    expiresAt: z.number().int().positive(), recoverUntil: z.number().int().positive(), failureReason: z.string().nullable(),
    attemptConsumed: z.boolean(), submissionId: z.string().nullable(), host: pairingDeviceSchema,
    mobile: pairingDeviceSchema.nullable(), credentials: pairingCredentialsSchema.nullable() }).strict();
export const savedPairingSchema = z.object({ serverUrl: z.string().url(), deviceId: z.string(), session: pairingCreatedSchema, qrFormat: z.literal('fragment-ticket-v1').optional(),
    state: pairingStatusSchema.shape.state, mobile: pairingDeviceSchema.optional(), submission: z.string().optional(), localSaved: z.boolean() }).strict();
//# sourceMappingURL=pairing-contract.js.map