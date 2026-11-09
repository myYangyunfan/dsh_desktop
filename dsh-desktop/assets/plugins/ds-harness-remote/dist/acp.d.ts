import type { AcpBackend, AcpInitializeParams, AcpInitializeResult, AcpPromptParams, AcpSessionParams, AcpPermissionResponseParams, AcpCancelParams, AcpSetModeParams, AcpSessionUpdate } from '@dsh-remote/protocol';
/** Backend-neutral ACP adapter. Implementations must keep state scoped to a connection. */
export interface AcpBackendAdapter {
    readonly backend: AcpBackend;
    initialize(params: AcpInitializeParams): Promise<AcpInitializeResult>;
    sessionNew(params: AcpSessionParams): Promise<{
        sessionId: string;
    }>;
    sessionLoad?(params: AcpSessionParams): Promise<{
        sessionId: string;
    }>;
    prompt(params: AcpPromptParams, emit: (update: AcpSessionUpdate) => Promise<void>): Promise<void>;
    respondPermission?(params: AcpPermissionResponseParams): Promise<void>;
    cancel?(params: AcpCancelParams): Promise<void>;
    setMode?(params: AcpSetModeParams): Promise<void>;
    close?(): Promise<void>;
}
export declare class AcpGateway {
    private readonly adapters;
    constructor(adapters: AcpBackendAdapter | Iterable<AcpBackendAdapter>);
    private get;
    initialize(p: AcpInitializeParams): Promise<AcpInitializeResult>;
    sessionNew(p: AcpSessionParams & {
        backend?: AcpBackend;
    }): Promise<{
        sessionId: string;
    }>;
    sessionLoad(p: AcpSessionParams & {
        backend?: AcpBackend;
    }): Promise<{
        sessionId: string;
    }>;
    prompt(p: AcpPromptParams & {
        backend?: AcpBackend;
    }, emit: (u: AcpSessionUpdate) => Promise<void>): Promise<void>;
    respondPermission(p: AcpPermissionResponseParams & {
        backend?: AcpBackend;
    }): Promise<void>;
    cancel(p: AcpCancelParams & {
        backend?: AcpBackend;
    }): Promise<void>;
    setMode(p: AcpSetModeParams & {
        backend?: AcpBackend;
    }): Promise<void>;
}
export interface AcpIdeConfig {
    id: string;
    command: string;
    args?: string[];
    cwd?: string;
}
export declare const DEFAULT_ACP_IDES: readonly AcpIdeConfig[];
/** JSON-RPC stdio bridge for ACP agents (Cursor/Kimi/CodeX). */
export declare class StdioAcpAdapter {
    private readonly config;
    readonly backend: AcpBackend;
    private child?;
    private nextId;
    constructor(config: AcpIdeConfig);
    private ensure;
    initialize(params: AcpInitializeParams): Promise<AcpInitializeResult>;
    sessionNew(params: AcpSessionParams): Promise<{
        sessionId: string;
    }>;
    sessionLoad(params: AcpSessionParams): Promise<{
        sessionId: string;
    }>;
    prompt(params: AcpPromptParams, emit: (u: AcpSessionUpdate) => Promise<void>): Promise<void>;
    cancel(p: AcpCancelParams): Promise<void>;
    setMode(p: AcpSetModeParams): Promise<void>;
    respondPermission(p: AcpPermissionResponseParams): Promise<void>;
    close(): Promise<void>;
    private call;
}
//# sourceMappingURL=acp.d.ts.map