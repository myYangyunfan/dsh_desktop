import type { Context } from '@deepseek-ai/cordis';
import type { ClientModeRuntime } from './client-runtime.js';
/** Structural official tools contract: no additional runtime dependency. */
export interface RemoteToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: {
        schema: Record<string, unknown>;
        render(args: unknown, value: unknown): Array<{
            type: 'text';
            text: string;
        }>;
    };
    execute(args: unknown, exec: {
        signal: AbortSignal;
    }): Promise<unknown>;
}
export type RemoteDiscoveryClient = Pick<ClientModeRuntime, 'devices' | 'discoverToolWorkspaces'>;
export declare function remoteDiscoveryTools(resolve: () => RemoteDiscoveryClient | undefined): RemoteToolDefinition[];
export declare function remoteSessionTools(resolve: () => Pick<ClientModeRuntime, 'runSessionTool'> | undefined): RemoteToolDefinition[];
export declare function installRemoteDiscoveryTools(ctx: Context, resolve: () => ClientModeRuntime | undefined): void;
//# sourceMappingURL=remote-tools.d.ts.map