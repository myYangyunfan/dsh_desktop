import { WorkspaceBridge, WorkspaceBridgeState, type WorkspaceCwdResolver, type RemoteTerminalSpawner } from './workspace-bridge.js';
export * from './workspace-bridge.js';
export { WorkspaceBridgeState as CodexWorkspaceState };
export type CodexCwdResolver = WorkspaceCwdResolver;
/** CodeX supplies thread authority to the shared workspace implementation. */
export declare class CodexWorkspaceBridge extends WorkspaceBridge {
    constructor(resolveCwd: WorkspaceCwdResolver, terminalEnabled: () => boolean, state?: WorkspaceBridgeState, spawnTerminal?: RemoteTerminalSpawner);
    isCodeXScope(value: unknown): boolean;
}
//# sourceMappingURL=codex-workspace-bridge.d.ts.map