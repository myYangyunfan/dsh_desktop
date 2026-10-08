/**
 * Plugin configuration: the deployment-facing limits and safety switches.
 * The Loader validates `Config` (standard-schema) and fills defaults; direct
 * callers (tests) get them from `resolveBasicsConfig`.
 */
import z from '@deepseek-ai/schemastery'

/** Default cap on one skill file read into the editor (bytes). */
export const DEFAULT_MAX_SKILL_BYTES = 512 * 1024
/** Default cap on one rule file read/written by the editor (bytes); mirrors DSH's maxSourceBytes default. */
export const DEFAULT_MAX_RULE_BYTES = 1024 * 1024
/** Default cap on one JSON request body (bytes). */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024
/** Default cap on the ids one archived-session batch may address. */
export const DEFAULT_MAX_BATCH_IDS = 200

/** The public config schema. */
export const Config = z.object({
  /** Upper bound on a single skill file the editor may load (bytes). */
  maxSkillBytes: z.number().min(1).default(DEFAULT_MAX_SKILL_BYTES),
  /** Upper bound on a single rule file the editor may load or write (bytes). */
  maxRuleBytes: z.number().min(1).default(DEFAULT_MAX_RULE_BYTES),
  /** Upper bound on a single JSON request body (bytes). */
  maxBodyBytes: z.number().min(1).default(DEFAULT_MAX_BODY_BYTES),
  /** Additional absolute composition-file paths the panel may edit (deployment-managed). */
  extraMcpFiles: z.array(z.string()).default([]),
  /** Force the whole panel read-only (no MCP toggle, no skill save, no rule edit, no archive restore/delete). */
  readOnly: z.boolean().default(false),
  /** Upper bound on the session ids one archived-session restore/delete call may address. */
  maxBatchIds: z.number().min(1).default(DEFAULT_MAX_BATCH_IDS),
  /** Allow deleting archived sessions (their durable artifacts) from the panel. */
  allowSessionDelete: z.boolean().default(true),
  /** Durable session-artifact root; empty resolves `$DSH_HOME/sessions` (the JSONL backend's default). */
  sessionsRoot: z.string().default(''),
})

/** The resolved config handed to `apply`. */
export interface ResolvedBasicsConfig {
  maxSkillBytes: number
  maxRuleBytes: number
  maxBodyBytes: number
  extraMcpFiles: string[]
  readOnly: boolean
  maxBatchIds: number
  allowSessionDelete: boolean
  sessionsRoot: string
}

/** Normalize raw config (for direct callers that bypass the Loader schema). */
export function resolveBasicsConfig(config?: Partial<ResolvedBasicsConfig>): ResolvedBasicsConfig {
  return {
    maxSkillBytes: config?.maxSkillBytes ?? DEFAULT_MAX_SKILL_BYTES,
    maxRuleBytes: config?.maxRuleBytes ?? DEFAULT_MAX_RULE_BYTES,
    maxBodyBytes: config?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    extraMcpFiles: config?.extraMcpFiles ?? [],
    readOnly: config?.readOnly ?? false,
    maxBatchIds: config?.maxBatchIds ?? DEFAULT_MAX_BATCH_IDS,
    allowSessionDelete: config?.allowSessionDelete ?? true,
    sessionsRoot: config?.sessionsRoot ?? '',
  }
}
