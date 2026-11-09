export { ACP_TOOL_CALL_ENDPOINTS, ACP_TOOL_STREAM_ENDPOINTS } from '@dsh-remote/protocol';
import { z } from 'zod';
export declare const acpToolStreamSchema: z.ZodObject<{
    backend: z.ZodEnum<["cursor", "antigravity", "pi", "opencode"]>;
    endpoint: z.ZodEnum<["workspaceFiles/changes", "terminal/follow", "terminal/retain"]>;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    backend: "cursor" | "antigravity" | "pi" | "opencode";
    args: Record<string, unknown>;
    endpoint: "terminal/follow" | "workspaceFiles/changes" | "terminal/retain";
}, {
    backend: "cursor" | "antigravity" | "pi" | "opencode";
    args: Record<string, unknown>;
    endpoint: "terminal/follow" | "workspaceFiles/changes" | "terminal/retain";
}>;
declare const schemas: {
    readonly 'dsh/sessionArchive': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodLiteral<"opencode">;
    }, "strict", z.ZodTypeAny, {
        backend: "opencode";
        sessionId: string;
    }, {
        backend: "opencode";
        sessionId: string;
    }>;
    readonly 'dsh/toolCall': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodEnum<["cursor", "antigravity", "pi", "opencode"]>;
        endpoint: z.ZodEnum<["workspaceFiles/list", "workspaceFiles/stat", "workspaceFiles/read", "workspaceFiles/readBytes", "workspaceFiles/readAll", "terminal/environment", "terminal/shells", "terminal/list", "terminal/create", "terminal/write", "terminal/resize", "terminal/rename", "terminal/close"]>;
        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strict", z.ZodTypeAny, {
        backend: "cursor" | "antigravity" | "pi" | "opencode";
        sessionId: string;
        args: Record<string, unknown>;
        endpoint: "terminal/write" | "terminal/environment" | "workspaceFiles/readBytes" | "workspaceFiles/list" | "workspaceFiles/stat" | "workspaceFiles/read" | "workspaceFiles/readAll" | "terminal/shells" | "terminal/list" | "terminal/create" | "terminal/resize" | "terminal/rename" | "terminal/close";
    }, {
        backend: "cursor" | "antigravity" | "pi" | "opencode";
        sessionId: string;
        args: Record<string, unknown>;
        endpoint: "terminal/write" | "terminal/environment" | "workspaceFiles/readBytes" | "workspaceFiles/list" | "workspaceFiles/stat" | "workspaceFiles/read" | "workspaceFiles/readAll" | "terminal/shells" | "terminal/list" | "terminal/create" | "terminal/resize" | "terminal/rename" | "terminal/close";
    }>;
    readonly 'dsh/sessionModels': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodEnum<["cursor", "claude", "antigravity", "pi", "opencode"]>;
    }, "strict", z.ZodTypeAny, {
        backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude";
        sessionId: string;
    }, {
        backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude";
        sessionId: string;
    }>;
    readonly 'dsh/selectModel': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodEnum<["cursor", "claude", "antigravity", "pi", "opencode"]>;
        model: z.ZodString;
        reasoningEffort: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude";
        sessionId: string;
        model: string;
        reasoningEffort?: string | undefined;
    }, {
        backend: "cursor" | "antigravity" | "pi" | "opencode" | "claude";
        sessionId: string;
        model: string;
        reasoningEffort?: string | undefined;
    }>;
    readonly initialize: z.ZodObject<{
        protocolVersion: z.ZodOptional<z.ZodNumber>;
        backend: z.ZodOptional<z.ZodString>;
        clientInfo: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            version: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            name?: string | undefined;
            version?: string | undefined;
        }, {
            name?: string | undefined;
            version?: string | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        backend?: string | undefined;
        protocolVersion?: number | undefined;
        clientInfo?: {
            name?: string | undefined;
            version?: string | undefined;
        } | undefined;
    }, {
        backend?: string | undefined;
        protocolVersion?: number | undefined;
        clientInfo?: {
            name?: string | undefined;
            version?: string | undefined;
        } | undefined;
    }>;
    readonly 'session/new': z.ZodObject<{
        cwd: z.ZodString;
        backend: z.ZodOptional<z.ZodString>;
        mcpServers: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
        mode: z.ZodOptional<z.ZodEnum<["agent", "plan", "ask"]>>;
    }, "strict", z.ZodTypeAny, {
        cwd: string;
        backend?: string | undefined;
        mode?: "agent" | "plan" | "ask" | undefined;
        mcpServers?: unknown[] | undefined;
    }, {
        cwd: string;
        backend?: string | undefined;
        mode?: "agent" | "plan" | "ask" | undefined;
        mcpServers?: unknown[] | undefined;
    }>;
    readonly 'session/load': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        sessionId: string;
        backend?: string | undefined;
    }, {
        sessionId: string;
        backend?: string | undefined;
    }>;
    readonly 'session/prompt': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodOptional<z.ZodEnum<["cursor", "antigravity", "pi", "claude", "opencode"]>>;
        prompt: z.ZodEffects<z.ZodArray<z.ZodUnion<[z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            type: "text";
            text: string;
        }, {
            type: "text";
            text: string;
        }>, z.ZodEffects<z.ZodObject<{
            type: z.ZodLiteral<"image">;
            mimeType: z.ZodEnum<["image/png", "image/jpeg", "image/webp", "image/gif"]>;
            data: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }, {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }>, {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }, {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        }>]>, "many">, ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[], ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[]>;
    }, "strict", z.ZodTypeAny, {
        sessionId: string;
        prompt: ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[];
        backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude" | undefined;
    }, {
        sessionId: string;
        prompt: ({
            type: "text";
            text: string;
        } | {
            data: string;
            type: "image";
            mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        })[];
        backend?: "cursor" | "antigravity" | "pi" | "opencode" | "claude" | undefined;
    }>;
    readonly 'session/cancel': z.ZodObject<{
        sessionId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        sessionId: string;
    }, {
        sessionId: string;
    }>;
    readonly 'dsh/directoryList': z.ZodObject<{
        path: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        path: string;
    }, {
        path: string;
    }>;
    readonly 'dsh/workspaceList': z.ZodOptional<z.ZodObject<{
        backend: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        backend?: string | undefined;
    }, {
        backend?: string | undefined;
    }>>;
    readonly 'dsh/sessionList': z.ZodObject<{
        path: z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>;
        backend: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        prewarm: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        path: string;
        backend?: string | undefined;
        limit?: number | undefined;
        prewarm?: boolean | undefined;
    }, {
        path: string;
        backend?: string | undefined;
        limit?: number | undefined;
        prewarm?: boolean | undefined;
    }>;
    readonly 'dsh/sessionHistory': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        sessionId: string;
        backend?: string | undefined;
    }, {
        sessionId: string;
        backend?: string | undefined;
    }>;
};
export type AllowedAcpMethod = keyof typeof schemas;
export declare const ACP_METHOD_ALLOWLIST: readonly ("initialize" | "session/new" | "session/load" | "session/prompt" | "session/cancel" | "dsh/directoryList" | "dsh/sessionHistory" | "dsh/sessionArchive" | "dsh/toolCall" | "dsh/sessionModels" | "dsh/selectModel" | "dsh/workspaceList" | "dsh/sessionList")[];
export declare function parseAcpCall(method: string, params: unknown): {
    method: AllowedAcpMethod;
    params: Record<string, unknown>;
};
export declare function sessionIdFromParams(method: AllowedAcpMethod, params: Record<string, unknown>): string | undefined;
export declare function isSessionMutation(method: AllowedAcpMethod): boolean;
//# sourceMappingURL=method-policy.d.ts.map