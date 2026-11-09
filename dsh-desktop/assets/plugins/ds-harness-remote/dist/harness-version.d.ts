export type HarnessSessionGeneration = 'legacy' | 'v3';
export declare function normalizeHarnessVersion(value: unknown): string | undefined;
/**
 * Select the Typert Session wire generation used by supported DSH builds.
 * Unknown builds stay on the established v0.1.2 profile; package peer ranges
 * prevent them from being presented as supported installations.
 */
export declare function harnessSessionGeneration(version: string | undefined): HarnessSessionGeneration;
/**
 * Compatibility fallback for Harness builds whose host.describe still returns
 * the historical 0.0.1 placeholder.
 *
 * Both supported entrypoint layouts must be covered. A CLI/dsh-TUI entrypoint
 * sits below the @deepseek-ai/dsh package root, so only its ancestor chain is
 * worth walking. The 0.2.0 Desktop shell instead launches its own
 * `@deepseek-ai/dsh-desktop-host` entrypoint from inside `app.asar`, where the
 * ancestors carry only the desktop shell and runtime manifests while the
 * Harness CLI package is a sibling; resolve that package through the
 * entrypoint's module scope.
 */
export declare function readHarnessDistributionVersion(entrypoint?: string | undefined): Promise<string | undefined>;
//# sourceMappingURL=harness-version.d.ts.map