import { z } from 'zod';
declare const schemas: {
    readonly 'account/read': z.ZodObject<{
        refreshToken: z.ZodOptional<z.ZodLiteral<false>>;
    }, z.core.$strict>;
    readonly 'model/list': z.ZodObject<{
        cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        includeHidden: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>;
    readonly 'project/list': z.ZodObject<{
        cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    readonly 'project/create': z.ZodObject<{
        name: z.ZodString;
        roots: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
        }, z.core.$strict>>;
        idempotencyKey: z.ZodString;
    }, z.core.$strict>;
    readonly 'thread/list': z.ZodObject<{
        cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        sortKey: z.ZodOptional<z.ZodEnum<{
            updated_at: "updated_at";
            created_at: "created_at";
            recency_at: "recency_at";
        }>>;
        sortDirection: z.ZodOptional<z.ZodEnum<{
            desc: "desc";
            asc: "asc";
        }>>;
        modelProviders: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString>>>;
        sourceKinds: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            unknown: "unknown";
            cli: "cli";
            vscode: "vscode";
            exec: "exec";
            appServer: "appServer";
        }>>>;
        archived: z.ZodOptional<z.ZodBoolean>;
        isPinned: z.ZodOptional<z.ZodBoolean>;
        cwd: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
        useStateDbOnly: z.ZodOptional<z.ZodBoolean>;
        searchTerm: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    readonly 'thread/read': z.ZodObject<{
        threadId: z.ZodString;
        includeTurns: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>;
    readonly 'dsh/sessionHistory': z.ZodObject<{
        threadId: z.ZodString;
        beforeSeq: z.ZodOptional<z.ZodNumber>;
        throughSeq: z.ZodOptional<z.ZodNumber>;
        maxMessages: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    readonly 'dsh/sessionAttachment': z.ZodObject<{
        threadId: z.ZodString;
        attachmentId: z.ZodString;
    }, z.core.$strict>;
    readonly 'dsh/directoryList': z.ZodObject<{
        path: z.ZodString;
    }, z.core.$strict>;
    readonly 'thread/start': z.ZodObject<{
        cwd: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        personality: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<{
            "workspace-write": "workspace-write";
            "danger-full-access": "danger-full-access";
        }>>;
    }, z.core.$strict>;
    readonly 'thread/resume': z.ZodObject<{
        threadId: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<{
            "workspace-write": "workspace-write";
            "danger-full-access": "danger-full-access";
        }>>;
    }, z.core.$strict>;
    readonly 'thread/fork': z.ZodObject<{
        threadId: z.ZodString;
        lastTurnId: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<{
            "workspace-write": "workspace-write";
            "danger-full-access": "danger-full-access";
        }>>;
    }, z.core.$strict>;
    readonly 'thread/name/set': z.ZodObject<{
        threadId: z.ZodString;
        name: z.ZodString;
    }, z.core.$strict>;
    readonly 'thread/archive': z.ZodObject<{
        threadId: z.ZodString;
    }, z.core.$strict>;
    readonly 'thread/unarchive': z.ZodObject<{
        threadId: z.ZodString;
    }, z.core.$strict>;
    readonly 'thread/unsubscribe': z.ZodObject<{
        threadId: z.ZodString;
    }, z.core.$strict>;
    readonly 'turn/start': z.ZodObject<{
        threadId: z.ZodString;
        input: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            mediaType: z.ZodEnum<{
                "image/png": "image/png";
                "image/jpeg": "image/jpeg";
                "image/webp": "image/webp";
                "image/gif": "image/gif";
            }>;
            data: z.ZodString;
        }, z.core.$strict>]>>;
        model: z.ZodOptional<z.ZodString>;
        effort: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            none: "none";
            minimal: "minimal";
            xhigh: "xhigh";
            max: "max";
            ultra: "ultra";
        }>>;
        summary: z.ZodOptional<z.ZodEnum<{
            none: "none";
            auto: "auto";
            concise: "concise";
            detailed: "detailed";
        }>>;
        personality: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<{
            "workspace-write": "workspace-write";
            "danger-full-access": "danger-full-access";
        }>>;
    }, z.core.$strict>;
    readonly 'turn/steer': z.ZodObject<{
        threadId: z.ZodString;
        input: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            mediaType: z.ZodEnum<{
                "image/png": "image/png";
                "image/jpeg": "image/jpeg";
                "image/webp": "image/webp";
                "image/gif": "image/gif";
            }>;
            data: z.ZodString;
        }, z.core.$strict>]>>;
        expectedTurnId: z.ZodString;
    }, z.core.$strict>;
    readonly 'turn/interrupt': z.ZodObject<{
        threadId: z.ZodString;
        turnId: z.ZodString;
    }, z.core.$strict>;
};
export type AllowedCodexAppMethod = keyof typeof schemas;
export declare const CODEX_APP_ALLOWLIST: readonly ("turn/start" | "thread/list" | "project/list" | "model/list" | "thread/resume" | "dsh/directoryList" | "thread/archive" | "thread/start" | "thread/fork" | "turn/steer" | "thread/read" | "turn/interrupt" | "thread/name/set" | "dsh/sessionHistory" | "project/create" | "account/read" | "dsh/sessionAttachment" | "thread/unarchive" | "thread/unsubscribe")[];
export declare function parseCodexCall(method: string, params: unknown): {
    method: AllowedCodexAppMethod;
    params: Record<string, unknown>;
};
export declare function isThreadMutation(method: AllowedCodexAppMethod): boolean;
export declare function threadIdFromParams(params: Record<string, unknown>): string | undefined;
export {};
//# sourceMappingURL=method-policy.d.ts.map