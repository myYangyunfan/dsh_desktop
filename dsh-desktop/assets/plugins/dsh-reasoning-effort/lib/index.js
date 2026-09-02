/**
 * Host half: read-only reasoning-effort guidance.
 *
 * The slider can only offer what the DSH model directory exposes, and the
 * request path validates every submitted effort against that same directory
 * (`UNSUPPORTED_REASONING_EFFORT` otherwise). This half therefore never
 * invents levels and never writes configuration: it diagnoses custom-provider
 * models the directory under-describes and returns copy-ready
 * `reasoningEfforts` declarations (exact when the knowledge base knows the
 * model, a filled template otherwise) for the user to paste into
 * `settings.yaml`. Built-in catalog models are trusted as-is and never
 * flagged.
 *
 * @module dsh-reasoning-effort
 */
import z from '@deepseek-ai/schemastery';
import { BUILTIN_ENTRIES, displayLevels, matchEntry } from './knowledge.js';
export const name = 'dsh-reasoning-effort';
/**
 * Hard dependencies: the loader waits for these services before calling
 * `apply`, so the row never races the boot order of the base bundle rows.
 * `connection` is deliberately absent — only Web profiles provide it, so the
 * RPC channel is mounted through `ctx.inject` instead of blocking this row.
 */
export const inject = ['settings', 'llm'];
/** Plugin-owned settings namespace (user-extensible knowledge base only). */
const STORE_NS = 'dsh-reasoning-effort';
/** The DSH namespace holding per-provider model declarations. */
const LLM_NS = 'llm-pi-ai';
/** Loopback RPC channel shared with the browser half. */
const RPC_CHANNEL = '/dsh-reasoning-effort';
const StoreSchema = z.object({
    entries: z.array(z.any()).default([]),
});
function okResult(value) {
    return { ok: true, value };
}
function failResult(code, message) {
    return { ok: false, error: { code, message } };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Accept only well-formed user entries so one typo cannot break matching. */
function isUsableEntry(value) {
    if (!isRecord(value))
        return false;
    if (typeof value.id !== 'string' || typeof value.provider !== 'string' || typeof value.model !== 'string')
        return false;
    if (typeof value.note !== 'string' || !isRecord(value.efforts))
        return false;
    for (const wire of Object.values(value.efforts)) {
        if (wire !== null && typeof wire !== 'string')
            return false;
    }
    return true;
}
/** The full ordered knowledge base: user entries first, built-ins after. */
function knowledgeOf(store) {
    const user = (store.entries ?? []).filter(isUsableEntry);
    return [...user, ...BUILTIN_ENTRIES];
}
function sameSet(a, b) {
    if (a.length !== b.length)
        return false;
    const set = new Set(b);
    return a.every((level) => set.has(level));
}
/**
 * Field block (10-space indent) carrying the declared levels and compat,
 * to be appended under a `models` list entry.
 */
function fieldBlock(entry) {
    const lines = ['          reasoningEfforts:'];
    for (const [level, wire] of Object.entries(entry.efforts)) {
        lines.push(`            ${level}: ${wire === null ? '' : JSON.stringify(wire)}`);
    }
    if (entry.compat !== undefined && Object.keys(entry.compat).length > 0) {
        lines.push('          compat:');
        if (entry.compat.thinkingFormat !== undefined)
            lines.push(`            thinkingFormat: ${JSON.stringify(entry.compat.thinkingFormat)}`);
        if (entry.compat.supportsReasoningEffort !== undefined) {
            lines.push(`            supportsReasoningEffort: ${String(entry.compat.supportsReasoningEffort)}`);
        }
    }
    return lines.join('\n');
}
/** Scalar fields a `models` entry may carry that this plugin round-trips. */
const ENTRY_SCALAR_KEYS = new Set(['id', 'name', 'contextWindow', 'maxTokens']);
/**
 * Serialize the existing entry's scalar fields (6-space `- id:` line, then
 * 10-space fields). `complete` is false when the entry carries fields this
 * plugin cannot round-trip — the caller then falls back to insert-below mode
 * so no user data is ever dropped.
 */
function entryHead(existing, model) {
    if (existing === undefined)
        return { lines: [`- id: ${model}`], complete: true };
    const extra = Object.keys(existing).filter((key) => !ENTRY_SCALAR_KEYS.has(key));
    const lines = [`- id: ${typeof existing.id === 'string' ? existing.id : model}`];
    if (typeof existing.name === 'string' && existing.name.length > 0)
        lines.push(`  name: ${JSON.stringify(existing.name)}`);
    if (typeof existing.contextWindow === 'number')
        lines.push(`  contextWindow: ${existing.contextWindow}`);
    if (typeof existing.maxTokens === 'number')
        lines.push(`  maxTokens: ${existing.maxTokens}`);
    return { lines, complete: extra.length === 0 };
}
export function apply(ctx) {
    const settings = ctx.get('settings');
    const llm = ctx.get('llm');
    if (settings === undefined || llm === undefined)
        return;
    // Aliased after the guard so closures below keep the narrowed types.
    const settingsService = settings;
    const llmService = llm;
    const store = settingsService.register(STORE_NS, StoreSchema);
    const readStore = () => {
        const value = store.get();
        return isRecord(value) ? value : {};
    };
    /** The settings.yaml path, memoized (the file provider names it once). */
    let settingsPathPromise;
    const settingsPath = () => {
        settingsPathPromise ??= settingsService.prepareDocument().catch(() => undefined);
        return settingsPathPromise;
    };
    /** Current directory levels for one model; [] when the model offers none. */
    async function currentLevels(provider, model) {
        try {
            const info = await llmService.resolveModelInfo(provider, model);
            return (info.reasoning?.efforts ?? []).map((effort) => effort.id);
        }
        catch {
            return [];
        }
    }
    /** Whether the model appears in the user's own llm-pi-ai models list. */
    function userDeclaredModel(provider, model) {
        const descriptor = settingsService.describe().find((row) => row.ns === LLM_NS);
        const providers = isRecord(descriptor?.user) && isRecord((descriptor?.user).providers)
            ? (descriptor?.user).providers
            : {};
        const route = isRecord(providers[provider]) ? providers[provider] : undefined;
        const models = route !== undefined && Array.isArray(route.models) ? route.models : undefined;
        const entry = models?.find((candidate) => isRecord(candidate) && candidate.id === model);
        return {
            declared: entry !== undefined,
            entryLine: entry === undefined
                ? `- id: ${model}`
                : `- id: ${model}${typeof entry.name === 'string' && entry.name.length > 0 ? `  # ${entry.name}` : ''}`,
            entry,
        };
    }
    /**
     * Caveat for gateways whose OpenAI-compatible endpoint rejects the
     * `developer` message role. DSH's pi-ai detection treats these base URLs
     * as standard OpenAI (developer role enabled) and settings.yaml cannot
     * override it, so agent requests with a system prompt fail with
     * `invalid_parameter_error`. The guidance must warn instead of pretending
     * the declaration alone makes the route usable.
     */
    function endpointWarning(provider) {
        try {
            const section = settingsService.get(LLM_NS);
            const route = isRecord(section) && isRecord(section.providers)
                ? section.providers[provider]
                : undefined;
            const baseURL = isRecord(route) && typeof route.baseURL === 'string' ? route.baseURL : '';
            if (baseURL.includes('maas.aliyuncs.com') || baseURL.includes('dashscope.aliyuncs.com')) {
                return 'aliyunDeveloperRole';
            }
            return null;
        }
        catch {
            return null;
        }
    }
    async function diagnose(provider, model) {
        const storeShape = readStore();
        const entry = matchEntry(knowledgeOf(storeShape), provider, model);
        const current = await currentLevels(provider, model);
        const expected = entry === undefined ? [] : displayLevels(entry);
        const { declared, entryLine, entry: userEntry } = userDeclaredModel(provider, model);
        const path = await settingsPath();
        let reason = 'none';
        if (current.length === 0) {
            reason = 'missing';
        }
        else if (entry !== undefined && !sameSet(current, expected)) {
            reason = 'mismatch';
        }
        // Guidance targets custom-provider declarations only; the built-in
        // catalog's data — including deliberately sparse level sets — is trusted.
        const needsGuide = declared && reason !== 'none';
        const block = entry === undefined ? null : fieldBlock(entry);
        // Replace mode carries the complete entry head and declared levels, so the
        // whole-entry replacement cannot drop user data.
        // Insert mode: the entry carries fields this plugin cannot round-trip,
        // so only the field block is offered, to paste under the existing line.
        const head = entryHead(userEntry, model);
        const mode = head.complete ? 'replace' : 'insert';
        const builtIn = entry !== undefined && BUILTIN_ENTRIES.includes(entry);
        const noteKey = builtIn ? entry.noteKey ?? null : null;
        const note = entry !== undefined && !builtIn ? entry.note ?? null : null;
        const warning = endpointWarning(provider);
        return {
            provider,
            model,
            userDeclared: declared,
            needsGuide,
            reason,
            current,
            expected,
            matched: entry !== undefined,
            mode,
            noteKey,
            note,
            warning,
            entryHead: head.complete ? head.lines.join('\n') : null,
            fieldBlock: block,
            entryLine,
            entryPath: `${LLM_NS}.providers.${provider}.models`,
            settingsPath: path ?? null,
        };
    }
    // Only Web profiles provide `connection`; mount the channel there without
    // ever blocking this row in terminal-only profiles.
    ctx.inject(['connection'], (connectionCtx) => {
        const connection = connectionCtx.connection;
        if (connection === undefined)
            return;
        connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
            switch (endpoint) {
                case 'diagnose': {
                    const request = isRecord(payload) ? payload : {};
                    const provider = typeof request.provider === 'string' ? request.provider : '';
                    const model = typeof request.model === 'string' ? request.model : '';
                    if (provider.length === 0 || model.length === 0) {
                        return failResult('invalid-request', 'provider and model are required');
                    }
                    try {
                        return okResult(await diagnose(provider, model));
                    }
                    catch (error) {
                        return failResult('diagnose-failed', `diagnose failed: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                case 'store':
                    return okResult({ entries: readStore().entries ?? [] });
                default:
                    return failResult('not-found', `unknown endpoint ${JSON.stringify(endpoint)}`);
            }
        }, { authority: 'loopback' });
    });
}
