/**
 * Serializable configuration and defaults for the sidebar host half. Loader
 * schema validation normally fills defaults; {@link resolveSidebarConfig}
 * applies the same defaults for direct callers that bypass the Loader.
 *
 * Schemastery comes from DSH, not from the public `schemastery` package, and
 * that is load-bearing rather than stylistic: only DSH's build WRAPS a
 * `meta.volatile` field in a cosmokit `Volatile` reference when it parses the
 * config. The Loader's volatile-commit path walks those references
 * (`volatileEntries` / `updateVolatile`), so a schema built with the public
 * package produces plain values, leaves the loader nothing to commit, and
 * **silently drops every live preference write** — the write reports success
 * and the effective value never changes.
 * @module dsh-better-sidebar/config
 */
import z from '@deepseek-ai/schemastery';
import { type SidebarPrefs } from './prefs-shared.ts';
export { SIDEBAR_PREFS_DEFAULTS, SIDEBAR_PREFS_NS, TITLE_BAR_STRIP_DEFAULT, TITLE_BAR_STRIP_MAX, TITLE_BAR_STRIP_MIN, type SidebarPrefs, } from './prefs-shared.ts';
/** Tunable sidebar host limits (every field optional; defaults fill in). */
export interface SidebarConfig {
    /** Read cap of one text file (bytes); larger files return truncated. */
    readLimit?: number;
    /** Media route cap (bytes); larger binaries are refused. */
    mediaLimit?: number;
    /** Upload route cap (bytes); larger files are refused without touching disk. */
    uploadLimit?: number;
    /** Explorer row bound of one level. */
    listLimit?: number;
}
/** Fully defaulted sidebar host settings. */
export interface ResolvedSidebarConfig {
    readLimit: number;
    mediaLimit: number;
    uploadLimit: number;
    listLimit: number;
}
/**
 * Apply direct-call defaults after Loader schema validation has normally run.
 *
 * @param config - Deployment-provided sidebar host settings.
 * @returns Complete settings consumed by the host half.
 */
export declare function resolveSidebarConfig(config: SidebarConfig | undefined): ResolvedSidebarConfig;
/**
 * Schemastery schema for the user-facing preferences (validated by the
 * settings service).
 *
 * Asserted as `z<SidebarPrefs>` (the interface lives in `prefs-shared.ts`; the
 * explicit annotation is also what keeps the emitted declaration portable).
 * Unknown keys are TOLERATED by this schema and pass through untouched, which
 * is what keeps a legacy `workspaceFence: true` in an old profile harmless.
 */
export declare const PrefsSchema: z<SidebarPrefs>;
/**
 * Config schema of this plugin's Loader row: deployment limits plus the live
 * user preferences.
 */
export declare const Config: z<SidebarConfig & SidebarPrefs>;
