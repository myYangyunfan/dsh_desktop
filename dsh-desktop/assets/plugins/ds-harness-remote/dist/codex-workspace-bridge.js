import { parseCodexSessionId } from './codex/session-id.js';
import { WorkspaceBridge, WorkspaceBridgeState, pipeTerminalSpawner } from './workspace-bridge.js';
export * from './workspace-bridge.js';
export { WorkspaceBridgeState as CodexWorkspaceState };
/** CodeX supplies thread authority to the shared workspace implementation. */
export class CodexWorkspaceBridge extends WorkspaceBridge {
    constructor(resolveCwd, terminalEnabled, state = new WorkspaceBridgeState(), spawnTerminal = pipeTerminalSpawner()) {
        super(resolveCwd, terminalEnabled, state, spawnTerminal, {
            parse: value => { const parsed = parseCodexSessionId(value); return parsed ? { sessionId: parsed.sessionId, nativeId: parsed.threadId } : undefined; }, domain: 'CODEX', owns: value => typeof value === 'string' && value.startsWith('codex:'),
        });
    }
    isCodeXScope(value) { return this.isScope(value); }
}
//# sourceMappingURL=codex-workspace-bridge.js.map