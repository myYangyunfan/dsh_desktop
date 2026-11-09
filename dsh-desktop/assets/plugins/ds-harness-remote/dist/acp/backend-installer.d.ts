export type BuiltinAcpBackend = 'codex' | 'cursor' | 'antigravity' | 'pi' | 'claude' | 'opencode' | 'hermes';
export interface BackendInstallSpec {
    id: BuiltinAcpBackend;
    name: string;
    kind: 'desktop_cli' | 'npm_package';
    npmPackage?: string;
    downloadUrl?: string;
}
export declare const BUILTIN_ACP_SPECS: Readonly<Record<BuiltinAcpBackend, Readonly<BackendInstallSpec>>>;
export declare function isBuiltinAcpBackend(id: string): id is BuiltinAcpBackend;
export interface CandidateScanOptions {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homedir?: string;
    npmPrefix?: string;
    checkExecutable?: (path: string) => boolean;
}
/** Check that a path exists, is a regular file, and has execute permissions on POSIX. */
export declare function defaultCheckExecutable(candidate: string, platform?: NodeJS.Platform): boolean;
/** Safely discover the global npm prefix once without shell, using node + npm-cli.js. */
export declare function discoverSystemNpmPrefix(platform?: NodeJS.Platform): string | undefined;
/** Resolves candidate paths for an ACP backend on Windows / macOS / Linux. */
export declare function candidateBinaryPaths(id: string, options?: CandidateScanOptions): string[];
/** Check PATH using where (Win) or which (Unix) with timeout and return full path if found. */
export declare function lookupSystemPath(command: string, platform?: NodeJS.Platform): string | undefined;
/** Scan for an existing executable binary on the system. */
export declare function findExistingBinary(id: string, options?: CandidateScanOptions): string | undefined;
/** Find the Node-bundled npm-cli.js to execute npm directly with Node without invoking any shell. */
export declare function findNodeNpmCli(nodeExecPath?: string): string | undefined;
export interface InstallAcpOptions extends CandidateScanOptions {
    timeoutMs?: number;
    npmCliPath?: string;
    execFileImpl?: (file: string, args: string[], options: {
        timeout?: number;
        encoding?: string;
        stdio?: unknown;
        env?: NodeJS.ProcessEnv;
    }) => Promise<{
        stdout: string;
        stderr: string;
    }>;
}
export interface InstallOrConfigureOutcome {
    action: 'configured' | 'installed' | 'download_required';
    detectedCommand?: string;
    downloadUrl?: string;
}
/**
 * High-level workflow:
 * 1. Search existing local paths for the backend. If found, return 'configured'.
 * 2. If not found and it is a desktop app (Cursor, AGY, Hermes), return 'download_required' with URL.
 * 3. If not found and it is an npm package (Claude, Pi, CodeX, OpenCode), execute silent npm install and return 'installed'.
 */
export declare function installOrConfigureBackend(backendId: string, options?: InstallAcpOptions): Promise<InstallOrConfigureOutcome>;
//# sourceMappingURL=backend-installer.d.ts.map