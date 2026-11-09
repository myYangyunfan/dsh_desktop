export { ACP_TOOL_CALL_ENDPOINTS, ACP_TOOL_STREAM_ENDPOINTS } from '@dsh-remote/protocol';
import { z } from 'zod';
export declare const acpToolStreamSchema: z.ZodObject<{
    backend: z.ZodEnum<{
        cursor: "cursor";
        claude: "claude";
        opencode: "opencode";
        pi: "pi";
        hermes: "hermes";
        antigravity: "antigravity";
    }>;
    endpoint: z.ZodEnum<{
        "workspaceFiles/changes": "workspaceFiles/changes";
        "terminal/follow": "terminal/follow";
        "terminal/retain": "terminal/retain";
    }>;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strict>;
declare const schemas: {
    readonly 'dsh/sessionArchive': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodLiteral<"opencode">;
    }, z.core.$strict>;
    readonly 'dsh/toolCall': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodEnum<{
            cursor: "cursor";
            claude: "claude";
            opencode: "opencode";
            pi: "pi";
            hermes: "hermes";
            antigravity: "antigravity";
        }>;
        endpoint: z.ZodEnum<{
            "workspaceFiles/list": "workspaceFiles/list";
            "workspaceFiles/stat": "workspaceFiles/stat";
            "workspaceFiles/read": "workspaceFiles/read";
            "workspaceFiles/readBytes": "workspaceFiles/readBytes";
            "workspaceFiles/readAll": "workspaceFiles/readAll";
            "terminal/environment": "terminal/environment";
            "terminal/shells": "terminal/shells";
            "terminal/list": "terminal/list";
            "terminal/create": "terminal/create";
            "terminal/write": "terminal/write";
            "terminal/resize": "terminal/resize";
            "terminal/rename": "terminal/rename";
            "terminal/close": "terminal/close";
        }>;
        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strict>;
    readonly 'dsh/sessionModels': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodEnum<{
            cursor: "cursor";
            claude: "claude";
            opencode: "opencode";
            pi: "pi";
            hermes: "hermes";
            antigravity: "antigravity";
        }>;
    }, z.core.$strict>;
    readonly 'dsh/selectModel': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodEnum<{
            cursor: "cursor";
            claude: "claude";
            opencode: "opencode";
            pi: "pi";
            hermes: "hermes";
            antigravity: "antigravity";
        }>;
        model: z.ZodString;
        reasoningEffort: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    readonly 'dsh/selectPermission': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodOptional<z.ZodEnum<{
            cursor: "cursor";
            claude: "claude";
            opencode: "opencode";
            pi: "pi";
            hermes: "hermes";
            antigravity: "antigravity";
        }>>;
        preset: z.ZodEnum<{
            "workspace-write": "workspace-write";
            "danger-full-access": "danger-full-access";
        }>;
    }, z.core.$strict>;
    readonly initialize: z.ZodObject<{
        protocolVersion: z.ZodOptional<z.ZodNumber>;
        backend: z.ZodOptional<z.ZodString>;
        clientInfo: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            version: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    readonly 'session/new': z.ZodObject<{
        cwd: z.ZodString;
        backend: z.ZodOptional<z.ZodString>;
        mcpServers: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
        mode: z.ZodOptional<z.ZodEnum<{
            agent: "agent";
            plan: "plan";
            ask: "ask";
        }>>;
    }, z.core.$strict>;
    readonly 'session/load': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    readonly 'session/prompt': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodOptional<z.ZodEnum<{
            cursor: "cursor";
            claude: "claude";
            opencode: "opencode";
            pi: "pi";
            hermes: "hermes";
            antigravity: "antigravity";
        }>>;
        prompt: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
            type: z.ZodLiteral<"text">;
            text: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"image">;
            mimeType: z.ZodEnum<{
                "image/png": "image/png";
                "image/jpeg": "image/jpeg";
                "image/webp": "image/webp";
                "image/gif": "image/gif";
            }>;
            data: z.ZodString;
        }, z.core.$strict>]>>;
    }, z.core.$strict>;
    readonly 'session/cancel': z.ZodObject<{
        sessionId: z.ZodString;
    }, z.core.$strict>;
    readonly 'dsh/directoryList': z.ZodObject<{
        path: z.ZodString;
    }, z.core.$strict>;
    readonly 'dsh/workspaceList': z.ZodOptional<z.ZodObject<{
        backend: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    readonly 'dsh/sessionList': z.ZodObject<{
        path: z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>;
        backend: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        prewarm: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>;
    readonly 'dsh/sessionHistory': z.ZodObject<{
        sessionId: z.ZodString;
        backend: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
};
export type AllowedAcpMethod = keyof typeof schemas;
export declare const ACP_METHOD_ALLOWLIST: readonly ("initialize" | "session/new" | "session/load" | "session/prompt" | "session/cancel" | "dsh/directoryList" | "dsh/sessionHistory" | "dsh/workspaceList" | "dsh/sessionArchive" | "dsh/toolCall" | "dsh/sessionModels" | "dsh/selectModel" | "dsh/selectPermission" | "dsh/sessionList")[];
export declare function parseAcpCall(method: string, params: unknown): {
    method: AllowedAcpMethod;
    params: Record<string, unknown>;
};
export declare function sessionIdFromParams(method: AllowedAcpMethod, params: Record<string, unknown>): string | undefined;
export declare function isSessionMutation(method: AllowedAcpMethod): boolean;
//# sourceMappingURL=method-policy.d.ts.map