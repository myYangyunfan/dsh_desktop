import { z } from 'zod';
declare const schemas: {
    readonly 'account/read': z.ZodObject<{
        refreshToken: z.ZodOptional<z.ZodLiteral<false>>;
    }, "strict", z.ZodTypeAny, {
        refreshToken?: false | undefined;
    }, {
        refreshToken?: false | undefined;
    }>;
    readonly 'model/list': z.ZodObject<{
        cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        includeHidden: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        cursor?: string | null | undefined;
        limit?: number | undefined;
        includeHidden?: boolean | undefined;
    }, {
        cursor?: string | null | undefined;
        limit?: number | undefined;
        includeHidden?: boolean | undefined;
    }>;
    readonly 'project/list': z.ZodObject<{
        cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        cursor?: string | null | undefined;
        limit?: number | undefined;
    }, {
        cursor?: string | null | undefined;
        limit?: number | undefined;
    }>;
    readonly 'project/create': z.ZodObject<{
        name: z.ZodString;
        roots: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            path: string;
        }, {
            path: string;
        }>, "many">;
        idempotencyKey: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        name: string;
        roots: {
            path: string;
        }[];
        idempotencyKey: string;
    }, {
        name: string;
        roots: {
            path: string;
        }[];
        idempotencyKey: string;
    }>;
    readonly 'thread/list': z.ZodObject<{
        cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        sortKey: z.ZodOptional<z.ZodEnum<["created_at", "updated_at", "recency_at"]>>;
        sortDirection: z.ZodOptional<z.ZodEnum<["asc", "desc"]>>;
        modelProviders: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        sourceKinds: z.ZodOptional<z.ZodArray<z.ZodEnum<["cli", "vscode", "exec", "appServer", "unknown"]>, "many">>;
        archived: z.ZodOptional<z.ZodBoolean>;
        isPinned: z.ZodOptional<z.ZodBoolean>;
        cwd: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
        useStateDbOnly: z.ZodOptional<z.ZodBoolean>;
        searchTerm: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        cursor?: string | null | undefined;
        cwd?: string | string[] | undefined;
        limit?: number | undefined;
        archived?: boolean | undefined;
        sortKey?: "updated_at" | "created_at" | "recency_at" | undefined;
        sortDirection?: "desc" | "asc" | undefined;
        modelProviders?: string[] | null | undefined;
        sourceKinds?: ("unknown" | "cli" | "vscode" | "exec" | "appServer")[] | undefined;
        isPinned?: boolean | undefined;
        useStateDbOnly?: boolean | undefined;
        searchTerm?: string | undefined;
    }, {
        cursor?: string | null | undefined;
        cwd?: string | string[] | undefined;
        limit?: number | undefined;
        archived?: boolean | undefined;
        sortKey?: "updated_at" | "created_at" | "recency_at" | undefined;
        sortDirection?: "desc" | "asc" | undefined;
        modelProviders?: string[] | null | undefined;
        sourceKinds?: ("unknown" | "cli" | "vscode" | "exec" | "appServer")[] | undefined;
        isPinned?: boolean | undefined;
        useStateDbOnly?: boolean | undefined;
        searchTerm?: string | undefined;
    }>;
    readonly 'thread/read': z.ZodObject<{
        threadId: z.ZodString;
        includeTurns: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        includeTurns?: boolean | undefined;
    }, {
        threadId: string;
        includeTurns?: boolean | undefined;
    }>;
    readonly 'dsh/sessionHistory': z.ZodObject<{
        threadId: z.ZodString;
        beforeSeq: z.ZodOptional<z.ZodNumber>;
        throughSeq: z.ZodOptional<z.ZodNumber>;
        maxMessages: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        maxMessages?: number | undefined;
        beforeSeq?: number | undefined;
        throughSeq?: number | undefined;
    }, {
        threadId: string;
        maxMessages?: number | undefined;
        beforeSeq?: number | undefined;
        throughSeq?: number | undefined;
    }>;
    readonly 'dsh/sessionAttachment': z.ZodObject<{
        threadId: z.ZodString;
        attachmentId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        attachmentId: string;
    }, {
        threadId: string;
        attachmentId: string;
    }>;
    readonly 'dsh/directoryList': z.ZodObject<{
        path: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        path: string;
    }, {
        path: string;
    }>;
    readonly 'thread/start': z.ZodObject<{
        cwd: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        personality: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<["workspace-write", "danger-full-access"]>>;
    }, "strict", z.ZodTypeAny, {
        cwd: string;
        model?: string | undefined;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
        personality?: string | undefined;
    }, {
        cwd: string;
        model?: string | undefined;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
        personality?: string | undefined;
    }>;
    readonly 'thread/resume': z.ZodObject<{
        threadId: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<["workspace-write", "danger-full-access"]>>;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        model?: string | undefined;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
    }, {
        threadId: string;
        model?: string | undefined;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
    }>;
    readonly 'thread/fork': z.ZodObject<{
        threadId: z.ZodString;
        lastTurnId: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<["workspace-write", "danger-full-access"]>>;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
        lastTurnId?: string | undefined;
    }, {
        threadId: string;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
        lastTurnId?: string | undefined;
    }>;
    readonly 'thread/name/set': z.ZodObject<{
        threadId: z.ZodString;
        name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        name: string;
        threadId: string;
    }, {
        name: string;
        threadId: string;
    }>;
    readonly 'thread/archive': z.ZodObject<{
        threadId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
    }, {
        threadId: string;
    }>;
    readonly 'thread/unarchive': z.ZodObject<{
        threadId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
    }, {
        threadId: string;
    }>;
    readonly 'thread/unsubscribe': z.ZodObject<{
        threadId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
    }, {
        threadId: string;
    }>;
    readonly 'turn/start': z.ZodObject<{
        threadId: z.ZodString;
        input: z.ZodArray<z.ZodUnion<[z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            mediaType: z.ZodEnum<["image/png", "image/jpeg", "image/webp", "image/gif"]>;
            data: z.ZodEffects<z.ZodString, string, string>;
        }, "strict", z.ZodTypeAny, {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }, {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }>]>, "many">;
        model: z.ZodOptional<z.ZodString>;
        effort: z.ZodOptional<z.ZodEnum<["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]>>;
        summary: z.ZodOptional<z.ZodEnum<["auto", "concise", "detailed", "none"]>>;
        personality: z.ZodOptional<z.ZodString>;
        permissionPreset: z.ZodOptional<z.ZodEnum<["workspace-write", "danger-full-access"]>>;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        input: ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[];
        model?: string | undefined;
        effort?: "low" | "medium" | "high" | "none" | "minimal" | "xhigh" | "max" | "ultra" | undefined;
        summary?: "none" | "auto" | "concise" | "detailed" | undefined;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
        personality?: string | undefined;
    }, {
        threadId: string;
        input: ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[];
        model?: string | undefined;
        effort?: "low" | "medium" | "high" | "none" | "minimal" | "xhigh" | "max" | "ultra" | undefined;
        summary?: "none" | "auto" | "concise" | "detailed" | undefined;
        permissionPreset?: "workspace-write" | "danger-full-access" | undefined;
        personality?: string | undefined;
    }>;
    readonly 'turn/steer': z.ZodObject<{
        threadId: z.ZodString;
        input: z.ZodArray<z.ZodUnion<[z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            mediaType: z.ZodEnum<["image/png", "image/jpeg", "image/webp", "image/gif"]>;
            data: z.ZodEffects<z.ZodString, string, string>;
        }, "strict", z.ZodTypeAny, {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }, {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }>]>, "many">;
        expectedTurnId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        input: ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[];
        expectedTurnId: string;
    }, {
        threadId: string;
        input: ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[];
        expectedTurnId: string;
    }>;
    readonly 'turn/interrupt': z.ZodObject<{
        threadId: z.ZodString;
        turnId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        threadId: string;
        turnId: string;
    }, {
        threadId: string;
        turnId: string;
    }>;
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