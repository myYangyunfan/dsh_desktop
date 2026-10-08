/**
 * Kernel configuration assembly — the DSH counterpart of billion-context-pi's
 * `resolveConfig`: build acp-kernel's `Config` from adapter-level knobs.
 *
 * Defaults are deliberately the acp-kernel `defaultConfig` values (the same
 * defaults billion-context-pi ships: nudge window 45%–75%, emergency 95%,
 * growth ratio 5%, protected last messages 5). Every knob is optional — an
 * omitted value keeps the kernel default, so the behavior matches the Pi
 * adapter exactly unless a deployment opts out.
 *
 * NOTE: `AcpCompactionEngine` (src/index.ts) ships its own engine-level
 * defaults 0.70/0.85 for the two nudge thresholds on top of this layer, so an
 * engine with no explicit config lands on 0.70/0.85, not 0.75/0.95.
 * @module billion-context-dsh/config
 */
import { type Config } from 'acp-kernel';
/** The kernel-facing knobs shared by the nudge path and the compress tool. */
export interface KernelConfigInput {
    readonly modelContextLimit: number;
    /** Nudge window lower bound (usage fraction; validation only — the growth-driven trigger has no percentage floor). Kernel default: 0.45. */
    readonly nudgeMinContextLimitPct?: number;
    /** Nudge window upper bound — over-limit guarantee line. Kernel default: 0.75. */
    readonly nudgeMaxContextLimitPct?: number;
    /** Emergency nudge threshold (bypasses per-turn dedup; capped at 3 injections per user turn — issue #108). Kernel default: 0.95. */
    readonly nudgeEmergencyThresholdPct?: number;
    /** Any other acp-kernel Config override (the billion-context-pi escape hatch). */
    readonly coreOverrides?: Partial<Config>;
}
/**
 * Assemble the kernel config: `defaultConfig(limit)` merged with the optional
 * nudge thresholds (merged into the defaults, never replacing them wholesale)
 * and any additional `coreOverrides`.
 */
export declare function kernelConfigFor(input: KernelConfigInput): Config;
