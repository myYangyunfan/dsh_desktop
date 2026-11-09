/**
 * Injectable process facts. Production callers use the real `process`, while
 * tests supply a controlled working directory / executable / global roots so
 * version discovery can be verified without depending on the host's npm setup.
 */
export interface HarnessVersionLookupContext {
    cwd?: string;
    execPath?: string;
    /** Extra directory roots that may hold `node_modules/@deepseek-ai/dsh`. */
    globalRoots?: string[];
    env?: NodeJS.ProcessEnv;
}
export type HarnessSessionGeneration = 'legacy' | 'v3';
export declare function normalizeHarnessVersion(value: unknown): string | undefined;
/**
 * Select the Typert Session wire generation used by supported DSH builds.
 * Unknown builds stay on the established v0.1.2 profile; package peer ranges
 * prevent them from being presented as supported installations.
 */
export declare function harnessSessionGeneration(version: string | undefined): HarnessSessionGeneration;
/**
 * Read the installed Harness CLI version from its package manifest.
 *
 * A CLI entrypoint sits below the `@deepseek-ai/dsh` package root, so only its
 * ancestor chain is worth walking; global bin symlinks are resolved first. The
 * 0.2.0 Desktop shell launches its own `@deepseek-ai/dsh-desktop-host`
 * entrypoint from inside `app.asar`, where the Harness CLI is a sibling and is
 * reachable through the entrypoint's module scope instead.
 *
 * Electron desktop Hosts may launch with an empty or non-absolute
 * `process.argv[1]`. In that case recover the version from the working
 * directory, the running executable's ancestors, `createRequire(...)` module
 * scope, and the usual global npm roots instead of returning `undefined`.
 */
export declare function readHarnessDistributionVersion(entrypoint?: string | undefined, context?: HarnessVersionLookupContext): Promise<string | undefined>;
//# sourceMappingURL=harness-version.d.ts.map