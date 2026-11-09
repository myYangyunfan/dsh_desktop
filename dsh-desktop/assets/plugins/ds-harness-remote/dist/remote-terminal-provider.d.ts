export interface TerminalShell {
    path: string;
    args: string[];
    name: string;
}
export interface TerminalActivity {
    state: 'idle' | 'busy' | 'unknown';
    revision: number;
}
export interface RemoteTerminalSpec {
    argv: readonly string[];
    cwd: string;
    cols: number;
    rows: number;
    terminalType: string;
    env: Record<string, string>;
    signal: AbortSignal;
}
export interface RemoteTerminalProcess {
    output: AsyncIterable<string>;
    write(data: string): void | Promise<void>;
    resize(cols: number, rows: number): void | Promise<void>;
    terminate(): void | Promise<void>;
    completed: Promise<{
        exitCode: number | null;
    }>;
    inspectActivity?(): Promise<TerminalActivity>;
}
/** Injectable process seam; shell discovery stays in the same execution environment. */
export type RemoteTerminalSpawner = ((spec: RemoteTerminalSpec) => Promise<RemoteTerminalProcess>) & {
    shells?(signal: AbortSignal): Promise<TerminalShell[]>;
};
export interface HostSubprocessLike {
    spawnTerminal(spec: Record<string, unknown>): Promise<unknown>;
    terminalEnvironment?(signal?: AbortSignal): Promise<{
        platform: 'posix' | 'windows';
        defaultShell?: string;
    }>;
    resolveExecutable?(file: string, env?: Record<string, string>, signal?: AbortSignal): Promise<string>;
}
export declare function discoverTerminalShells(provider?: HostSubprocessLike, signal?: AbortSignal): Promise<TerminalShell[]>;
/** Compatibility fallback only: pipes cannot provide PTY resize or job control. */
export declare function pipeTerminalSpawner(): RemoteTerminalSpawner;
/** Reuse official PTY, shell activity integration and process-range termination. */
export declare function subprocessTerminalSpawner(subprocess: HostSubprocessLike): RemoteTerminalSpawner;
//# sourceMappingURL=remote-terminal-provider.d.ts.map