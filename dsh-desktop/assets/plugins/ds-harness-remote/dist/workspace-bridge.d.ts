import type { TypertRpcResult } from './typert-gateway-contract.js';
import { RemoteTerminalState } from './remote-terminal-controller.js';
import { type RemoteTerminalSpawner } from './remote-terminal-provider.js';
export * from './remote-terminal-provider.js';
export declare class WorkspaceBridgeState extends RemoteTerminalState {
}
export type WorkspaceCwdResolver = (nativeId: string, signal: AbortSignal) => Promise<string | undefined>;
/** Shared Host-owned workspace files and terminal implementation; authority comes from the backend resolver. */
export declare class WorkspaceBridge {
    private readonly resolveCwd;
    private readonly terminalEnabled;
    private readonly state;
    private readonly scope;
    private readonly terminal;
    private readonly ownedSubscribers;
    constructor(resolveCwd: WorkspaceCwdResolver, terminalEnabled: () => boolean, state: WorkspaceBridgeState | undefined, spawnTerminal: RemoteTerminalSpawner | undefined, scope: {
        parse(value: unknown): {
            sessionId: string;
            nativeId: string;
        } | undefined;
        domain: string;
        owns(value: unknown): boolean;
    });
    isScope(value: unknown): boolean;
    call(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult | undefined>;
    open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown> | undefined>;
    closeAll(): Promise<void>;
    private fileCall;
    private watchChanges;
    private scopeError;
    private rootFor;
    private safePath;
}
//# sourceMappingURL=workspace-bridge.d.ts.map