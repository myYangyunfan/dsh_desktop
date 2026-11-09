import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';
import type { HostPluginRuntime } from './service.js';
export interface TuiRemoteTarget {
    runtime: HostPluginRuntime;
    config: ResolvedConfig;
}
export interface TuiRemoteBinding {
    target?: TuiRemoteTarget;
}
/** Soft TUI integration: Desktop profiles never wait for terminal-only services. */
export declare function installTuiRemoteCommand(ctx: Context, resolveTarget: () => TuiRemoteTarget | undefined): void;
//# sourceMappingURL=tui-command.d.ts.map