import { type ChildProcessWithoutNullStreams, type ExecFileOptions, type SpawnOptionsWithoutStdio } from 'node:child_process';
/** Windows executable extensions accepted when resolving PATH or candidate binaries, in priority order. */
export declare const WINDOWS_EXECUTABLE_EXTENSIONS: readonly [".exe", ".cmd", ".bat", ".com"];
export interface NpmCmdShimResolution {
    file: string;
    argsPrefix: string[];
    envPatch?: NodeJS.ProcessEnv;
}
export interface WindowsResolveHooks {
    platform?: NodeJS.Platform;
    readFileSync?: (path: string, encoding: 'utf8') => string;
    isFile?: (path: string) => boolean;
    lookupPath?: (command: string) => string | undefined;
    nodeExecPath?: string;
    isElectron?: boolean;
    comspec?: string;
}
export interface ResolvedSpawnTarget<TOptions> {
    file: string;
    args: string[];
    options: Omit<TOptions, 'env'> & {
        env?: NodeJS.ProcessEnv;
        windowsHide: true;
        windowsVerbatimArguments?: boolean;
    };
}
/** Check whether a path ends with a supported Windows executable extension. */
export declare function isWindowsExecutablePath(filePath: string): boolean;
/** Return extension priority rank (`.exe` < `.cmd` < `.bat` < `.com`), or Infinity for non-executables. */
export declare function windowsExecutableRank(filePath: string): number;
/** Check whether a path points to a Windows batch shim (`.cmd` or `.bat`). */
export declare function isWindowsBatchFile(filePath: string): boolean;
/** Filter `where` output lines to valid Windows executables and prefer `.exe` over `.cmd`/`.bat`/`.com`. */
export declare function selectWindowsExecutable(lines: readonly string[], checkExecutable?: (candidate: string) => boolean): string | undefined;
/** Probe PATH with `where` on Windows and pick the highest-priority valid executable. */
export declare function lookupWindowsPathExecutable(command: string, checkExecutable?: (candidate: string) => boolean): string | undefined;
/** Reject control characters (`\r`, `\n`, `\0`) that cannot be safely passed through process/shell arguments. */
export declare function assertSafeCommandArgument(value: string): void;
/** Escape one argument for a `.cmd`/`.bat` invocation via `cmd.exe /d /s /c` with `windowsVerbatimArguments`. */
export declare function escapeCmdBatchArgument(arg: string): string;
/**
 * Parse a standard npm/pnpm `.cmd` shim and resolve its Node JS entry script so it can be spawned
 * directly via `process.execPath` without `cmd.exe`. Returns `undefined` for non-standard batch scripts.
 */
export declare function resolveNpmCmdShim(cmdPath: string, hooks?: Pick<WindowsResolveHooks, 'readFileSync' | 'isFile' | 'nodeExecPath' | 'isElectron'>): NpmCmdShimResolution | undefined;
/**
 * Resolve command and arguments for safe execution on Windows (and pass-through with `windowsHide: true`
 * on POSIX). Resolves `.cmd`/`.bat` shims to direct `process.execPath` when possible and falls back to
 * `cmd.exe /d /s /c` with strict argument validation and escaping.
 */
export declare function resolveSpawnTarget<TOptions extends {
    env?: NodeJS.ProcessEnv;
}>(command: string, args: readonly string[], options: TOptions, hooks?: WindowsResolveHooks): ResolvedSpawnTarget<TOptions>;
/** Spawn a stdio child process safely across POSIX and Windows (`.cmd`/`.bat` aware, `windowsHide: true`). */
export declare function spawnCommand(command: string, args: readonly string[], options?: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
/** Execute a one-shot CLI probe safely across POSIX and Windows (`.cmd`/`.bat` aware, `windowsHide: true`). */
export declare function execFileCommand(command: string, args: readonly string[], options?: ExecFileOptions): Promise<{
    stdout: string;
    stderr: string;
}>;
//# sourceMappingURL=windows-spawn.d.ts.map