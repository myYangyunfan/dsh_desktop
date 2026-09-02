/**
 * Built-in model knowledge base for reasoning-effort guidance.
 *
 * Each entry names the display levels (`efforts` keys, the DSH level
 * universe) a model really offers and the wire value the endpoint accepts
 * (`efforts` values). Levels not named are pinned unsupported by
 * `dsh-llm-pi-ai`'s resolution, so an entry with `{ low, high }` offers
 * exactly those two and never a guessed third.
 *
 * The Host half uses these entries ONLY to generate copy-ready YAML for
 * custom-provider models the directory does not describe. It never writes
 * settings itself and never overrides catalog-declared levels.
 *
 * `compat` is only meaningful for `openai-completions` routes; the snippet
 * generator carries it onto those routes and drops it elsewhere.
 *
 * @module dsh-reasoning-effort/knowledge
 */
/** Built-in entries; user entries (settings.yaml) take precedence. */
export const BUILTIN_ENTRIES = [
    {
        id: 'glm-5.2',
        provider: '*',
        model: 'glm-5.2',
        noteKey: 'glm52',
        efforts: {
            minimal: 'minimal',
            low: 'low',
            medium: 'medium',
            high: 'high',
        },
        compat: { thinkingFormat: 'openai', supportsReasoningEffort: true },
    },
    {
        id: 'kimi-k3',
        provider: '*',
        model: 'kimi/kimi-k3',
        noteKey: 'kimiK3',
        efforts: {
            low: 'low',
            high: 'high',
            max: 'max',
        },
        compat: { thinkingFormat: 'openai', supportsReasoningEffort: true },
    },
    {
        id: 'kimi-k3-plain',
        provider: '*',
        model: 'kimi-k3',
        noteKey: 'kimiK3',
        efforts: {
            low: 'low',
            high: 'high',
            max: 'max',
        },
        compat: { thinkingFormat: 'openai', supportsReasoningEffort: true },
    },
];
/** Compile a knowledge-base pattern (`*` wildcard) to an anchored RegExp. */
function patternRegExp(pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*');
    return new RegExp(`^${escaped}$`, 'u');
}
/**
 * Find the most specific entry matching a provider/model pair.
 * Exact (non-wildcard) matches beat wildcard ones on each axis; user
 * entries are searched before built-in entries, so user overrides win.
 */
export function matchEntry(entries, provider, model) {
    let best;
    let bestScore = -1;
    for (const entry of entries) {
        if (!patternRegExp(entry.provider).test(provider))
            continue;
        if (!patternRegExp(entry.model).test(model))
            continue;
        const score = (entry.provider.includes('*') ? 0 : 1) + (entry.model.includes('*') ? 0 : 1);
        if (score > bestScore) {
            bestScore = score;
            best = entry;
        }
    }
    return best;
}
/** Display levels (non-null) an entry offers, in declaration order. */
export function displayLevels(entry) {
    return Object.entries(entry.efforts)
        .filter(([, wire]) => wire !== null)
        .map(([level]) => level);
}
