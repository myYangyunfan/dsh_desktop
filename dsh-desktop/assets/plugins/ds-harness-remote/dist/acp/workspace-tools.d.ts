import { WorkspaceBridge } from '../workspace-bridge.js';
import { TerminalPolicy } from '../terminal-policy.js';
/** ACP supplies session authority; shared tools enforce containment and ownership. */
export declare class AcpWorkspaceTools {
    private readonly bridge;
    private readonly terminal;
    constructor(bridge: WorkspaceBridge, terminal: TerminalPolicy);
    private payload;
    call(sessionId: string, backend: string, endpoint: string, args: Record<string, unknown>): Promise<unknown>;
    open(sessionId: string, backend: string, endpoint: string, args: Record<string, unknown>, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
    close(): Promise<void>;
}
//# sourceMappingURL=workspace-tools.d.ts.map