import type { Context } from '../../context-types.ts';
import type { ResolvedBasicsConfig } from '../../config.ts';
/** One `mcp-client` row found in a composition (raw config stays host-side). */
export interface McpRowFile {
    rowId: string | null;
    serverName: string;
    disabled: boolean;
    config: Record<string, unknown>;
    /** Preset that owns this row (declared inside its `config.plugins`), when any. */
    presetId?: string;
}
/** One composition source and its MCP rows. */
export interface McpSourceFile {
    scope: 'profile' | 'preset';
    scopeLabel: string;
    /** Declaring file (empty for a preset declaration read from the Loader tree). */
    path: string;
    readOnly: boolean;
    rows: McpRowFile[];
}
/** Whether a plugin module specifier names the MCP client bridge. */
export declare function isMcpClientName(name: unknown): boolean;
/** Whether a plugin module specifier names the agent-preset declaration. */
export declare function isAgentPresetName(name: unknown): boolean;
/** Every MCP row declared in one already-parsed composition value. */
export declare function collectMcpRowsFromValue(value: unknown): McpRowFile[];
/** Every MCP row declared in one already-parsed preset plugin list. */
export declare function collectPresetRows(presetId: string, plugins: unknown): McpRowFile[];
/**
 * Extract every `mcp-client` row from a composition document (a top-level YAML
 * array). Handles profile patch entries (`{insert: [...]}`), plain rows, preset
 * declarations (`{id, name, config: {plugins}}`) and entry groups alike.
 */
export declare function collectMcpRows(text: string): McpRowFile[];
/** Discover every composition source and its MCP rows. */
export declare function scanMcpSources(ctx: Context, resolved: ResolvedBasicsConfig): Promise<McpSourceFile[]>;
