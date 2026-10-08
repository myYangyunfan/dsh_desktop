import type { FeatureContext } from '../registry.ts';
/** One masked server view shipped to the client. */
export interface McpServerRow {
    rowId: string | null;
    serverName: string;
    transport: 'stdio' | 'streamable-http' | 'unknown';
    disabled: boolean;
    editable: boolean;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string>;
    toolCallTimeoutMs?: number;
    /**
     * Live status. `probe` says how trustworthy it is: `global` rows are
     * observed in this process's Loader tree and tool registry, `preset` rows
     * are read from their preset's composition inventory (the server itself
     * starts inside a session's scoped world, where its tools stay invisible to
     * the host registry), and `unknown` means no inventory answered.
     */
    runtime: {
        mounted: boolean;
        toolCount: number;
        probe: 'global' | 'preset' | 'unknown';
    };
}
/** One scope group in the list. */
export interface McpGroup {
    scope: 'profile' | 'preset';
    scopeLabel: string;
    /** Declaring file; empty for a preset declaration read from the Loader tree. */
    path: string;
    readOnly: boolean;
    servers: McpServerRow[];
}
/** Build the MCP feature API. */
export declare function registerMcp(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown>;
