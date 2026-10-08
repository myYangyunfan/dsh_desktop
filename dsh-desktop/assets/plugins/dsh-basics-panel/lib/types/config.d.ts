/**
 * Plugin configuration: the deployment-facing limits and safety switches.
 * The Loader validates `Config` (standard-schema) and fills defaults; direct
 * callers (tests) get them from `resolveBasicsConfig`.
 */
import z from '@deepseek-ai/schemastery';
/** Default cap on one skill file read into the editor (bytes). */
export declare const DEFAULT_MAX_SKILL_BYTES: number;
/** Default cap on one rule file read/written by the editor (bytes); mirrors DSH's maxSourceBytes default. */
export declare const DEFAULT_MAX_RULE_BYTES: number;
/** Default cap on one JSON request body (bytes). */
export declare const DEFAULT_MAX_BODY_BYTES: number;
/** Default cap on the ids one archived-session batch may address. */
export declare const DEFAULT_MAX_BATCH_IDS = 200;
/** The public config schema. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Upper bound on a single skill file the editor may load (bytes). */
    maxSkillBytes: z<number, number, "defined">;
    /** Upper bound on a single rule file the editor may load or write (bytes). */
    maxRuleBytes: z<number, number, "defined">;
    /** Upper bound on a single JSON request body (bytes). */
    maxBodyBytes: z<number, number, "defined">;
    /** Additional absolute composition-file paths the panel may edit (deployment-managed). */
    extraMcpFiles: z<string[], string[], "defined">;
    /** Force the whole panel read-only (no MCP toggle, no skill save, no rule edit, no archive restore/delete). */
    readOnly: z<boolean, boolean, "defined">;
    /** Upper bound on the session ids one archived-session restore/delete call may address. */
    maxBatchIds: z<number, number, "defined">;
    /** Allow deleting archived sessions (their durable artifacts) from the panel. */
    allowSessionDelete: z<boolean, boolean, "defined">;
    /** Durable session-artifact root; empty resolves `$DSH_HOME/sessions` (the JSONL backend's default). */
    sessionsRoot: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Upper bound on a single skill file the editor may load (bytes). */
    maxSkillBytes: z<number, number, "defined">;
    /** Upper bound on a single rule file the editor may load or write (bytes). */
    maxRuleBytes: z<number, number, "defined">;
    /** Upper bound on a single JSON request body (bytes). */
    maxBodyBytes: z<number, number, "defined">;
    /** Additional absolute composition-file paths the panel may edit (deployment-managed). */
    extraMcpFiles: z<string[], string[], "defined">;
    /** Force the whole panel read-only (no MCP toggle, no skill save, no rule edit, no archive restore/delete). */
    readOnly: z<boolean, boolean, "defined">;
    /** Upper bound on the session ids one archived-session restore/delete call may address. */
    maxBatchIds: z<number, number, "defined">;
    /** Allow deleting archived sessions (their durable artifacts) from the panel. */
    allowSessionDelete: z<boolean, boolean, "defined">;
    /** Durable session-artifact root; empty resolves `$DSH_HOME/sessions` (the JSONL backend's default). */
    sessionsRoot: z<string, string, "defined">;
}>>, "plain">;
/** The resolved config handed to `apply`. */
export interface ResolvedBasicsConfig {
    maxSkillBytes: number;
    maxRuleBytes: number;
    maxBodyBytes: number;
    extraMcpFiles: string[];
    readOnly: boolean;
    maxBatchIds: number;
    allowSessionDelete: boolean;
    sessionsRoot: string;
}
/** Normalize raw config (for direct callers that bypass the Loader schema). */
export declare function resolveBasicsConfig(config?: Partial<ResolvedBasicsConfig>): ResolvedBasicsConfig;
