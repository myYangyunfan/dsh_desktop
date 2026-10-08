/**
 * Named presets for the nudge thresholds — how eagerly the model is asked to
 * compress, in one word instead of three hand-tuned percentages (issue #105).
 *
 * A preset is a bundle of the three first-class nudge-threshold knobs
 * (`nudgeMinContextLimitPct` / `nudgeMaxContextLimitPct` /
 * `nudgeEmergencyThresholdPct`). It does NOT touch any other knob: `modelContextLimit`,
 * `autoNudge`, prompts, and the `coreOverrides` escape hatch all stay exactly as
 * configured. The individual thresholds remain fully available and win over the
 * preset when both are set — precedence is explicit value > preset > engine
 * default (applied in `resolveAcpConfig`, src/index.ts), so a partial override
 * on top of a preset is honored.
 *
 * The five tiers form a monotonic spectrum from least to most aggressive
 * compression. `balanced` reproduces the current out-of-the-box engine defaults
 * exactly (min 0.45 = kernel default, max 0.70, emergency 0.85), so choosing it
 * changes nothing relative to today's behavior.
 *
 * Presets are set at composition time (`config: { preset: 'efficient' }`).
 * Runtime hot-reload of the underlying keys rides on issue #75 Phase 1
 * (`settings.yaml` + `/acp-prune config`); surfacing the `preset` alias through that
 * same channel is the small follow-up once Phase 1 lands. The two knobs named in
 * the original request that are NOT first-class engine knobs today — `growthRatio`
 * (exists in acp-kernel as `nudge.growthRatio`, reachable via `coreOverrides`) and
 * `protectedLastMessages` (≈ kernel `preserveRecentMessages`) — are deliberately
 * out of scope here; adopting them as named knobs is an owner decision, not a
 * preset detail.
 * @module billion-context-dsh/presets
 */
/** The five preset tier names. */
export type PresetName = 'preserve' | 'relaxed' | 'balanced' | 'efficient' | 'aggressive';
/** The preset tiers ordered least → most aggressive (for help text / display). */
export declare const PRESET_NAMES: readonly PresetName[];
/** One preset tier: a human label plus the three nudge-threshold values it sets. */
export interface NudgePreset {
    /** Plain-language one-liner describing the tier's trade-off. */
    readonly label: string;
    /** Nudge window lower bound (usage fraction; the threshold gate floor). */
    readonly nudgeMinContextLimitPct: number;
    /** Over-limit guarantee line — above this the nudge fires regardless of growth. */
    readonly nudgeMaxContextLimitPct: number;
    /** Emergency nudge threshold (bypasses the per-turn dedup). */
    readonly nudgeEmergencyThresholdPct: number;
}
/**
 * The five tiers. Every row satisfies the kernel invariant
 * `min ≤ max ≤ emergency` (the kernel only WARNS on the reverse — it never rejects
 * the config, so `resolveAcpConfig` rejects an inverted merged triple itself), and
 * all three values move monotonically toward "compress sooner" as you go down
 * the list. Values are fractions of the context window, not token counts.
 */
export declare const PRESETS: Readonly<Record<PresetName, NudgePreset>>;
/** Type guard: true when `value` is one of the five preset names. */
export declare function isPresetName(value: unknown): value is PresetName;
/**
 * Resolve a preset name to its tier. Throws on an unknown name so a typo in the
 * composition config fails engine construction loudly (the same fail-fast
 * contract as prompt-template validation) rather than silently falling back to
 * the engine defaults.
 */
export declare function resolvePreset(name: string): NudgePreset;
