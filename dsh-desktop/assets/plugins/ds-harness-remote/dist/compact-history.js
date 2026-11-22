import { compactBotRound } from './compact-bot-round.js';
/** Read-only history projection. Never removes records or changes cursor/identity/state. */
const LIMIT = 512;
const MARKER = '\n[Compact history: output omitted]';
/**
 * Total characters one projection may spend on preserved group rounds. The
 * compact snapshot is a single secure frame (4 MiB ceiling) and the Android
 * follow stream has no transfer fallback, so growth has to stay far below it.
 */
const ROUND_BUDGET = 128 * 1024;
const TOOL_EVENT_TYPES = new Set([
    'tool/call',
    'tool/result',
    'tool/ptc-dispatch',
    'tool/ptc-dispatch-start',
    'tool/code-dispatch',
    'tool/code-dispatch-start',
]);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Keep a recognised group round inside the document budget, else fall back. */
function preservedRound(text, budget) {
    if (budget.remaining < LIMIT)
        return undefined;
    const round = compactBotRound(text);
    if (round === undefined || round.length > budget.remaining)
        return undefined;
    budget.remaining -= round.length;
    return round;
}
function summary(value, budget) {
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    if (text.length <= LIMIT)
        return text;
    return preservedRound(text, budget) ?? text.slice(0, LIMIT) + MARKER;
}
function toolValue(value, budget) {
    if (Array.isArray(value))
        return value.map(item => toolValue(item, budget));
    if (!object(value))
        return value;
    const result = { ...value };
    for (const [key, child] of Object.entries(value)) {
        if (['input', 'arguments', 'output', 'result', 'rawInput', 'rawOutput', 'uiResultMeta', 'meta', 'argumentsDelta', 'code'].includes(key)) {
            result[key] = typeof child === 'string' ? summary(child, budget) : { summary: summary(child, budget) };
        }
        else if (key === 'content' && Array.isArray(child)) {
            let previews = 0;
            const blocks = child.flatMap(block => {
                // Keep every tool correlation block, even when several share a message.
                if (object(block) && (block.type === 'tool-call' || block.type === 'tool-result'))
                    return [toolValue(block, budget)];
                const preview = object(block) ? block.text ?? block : block;
                // A recognised group round is conversation content: keep it even when it
                // would fall outside the two-preview budget. Earlier previews already go
                // through summary(), which preserves the same shape.
                const round = typeof preview === 'string' && preview.length > LIMIT && previews >= 2
                    ? preservedRound(preview, budget) : undefined;
                if (round !== undefined)
                    return [{ type: 'text', text: round }];
                if (previews++ >= 2)
                    return [];
                return [{ type: 'text', text: summary(preview, budget) }];
            });
            // An omitted block must never turn a failed result into a success.
            if (child.some(block => object(block) && block.isError === true) && object(blocks[0]))
                blocks[0].isError = true;
            result[key] = blocks;
        }
        else if (key === 'text' && typeof child === 'string')
            result[key] = summary(child, budget);
        else
            result[key] = toolValue(child, budget);
    }
    return result;
}
function compactMessageSource(value, isInjectedUser) {
    if (!object(value))
        return value;
    let next = value;
    if ('replayState' in next) {
        const { replayState: _replayState, ...rest } = next;
        next = rest;
    }
    if (isInjectedUser) {
        const { entries: _entries, sections: _sections, changes: _changes, baselineIdentity: _baselineIdentity, ...rest } = next;
        next = rest;
    }
    return next;
}
/**
 * Usage carried by the last usage chunk of a V3 `assistant/message.data.stream`.
 * Mirrors the Android `nativeUsage()` fallback, so omitting `stream` from the
 * compact projection never hides Token usage that client could still derive.
 */
function streamUsage(stream) {
    if (!Array.isArray(stream))
        return undefined;
    for (let index = stream.length - 1; index >= 0; index--) {
        const row = stream[index];
        if (object(row) && row.type === 'chunk' && object(row.chunk) && row.chunk.type === 'usage') {
            return object(row.chunk.usage) ? row.chunk.usage : undefined;
        }
    }
    return undefined;
}
function messageValue(value, budget, isInjectedUser = false) {
    if (Array.isArray(value))
        return value.map(item => messageValue(item, budget, isInjectedUser));
    if (!object(value))
        return value;
    if (value.type === 'tool-call' || value.type === 'tool-result')
        return toolValue(value, budget);
    if (isInjectedUser && value.type === 'text' && typeof value.text === 'string' && value.text.length > LIMIT) {
        return { ...value, text: summary(value.text, budget) };
    }
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        if (key === 'stream')
            continue;
        if (key === 'source')
            out[key] = compactMessageSource(child, isInjectedUser);
        else
            out[key] = messageValue(child, budget, isInjectedUser);
    }
    // An explicit top-level usage keeps priority, exactly like the client fallback.
    if (value.usage === undefined || value.usage === null) {
        const usage = streamUsage(value.stream);
        if (usage !== undefined)
            out.usage = messageValue(usage, budget, isInjectedUser);
    }
    return out;
}
/**
 * Only non-human context injections carry an explicit `source.kind` other than
 * `'user'` (e.g. `'agent-instructions'`, `'skill-catalog'`, `'runtime-context'`).
 * Human prompts (`source.kind === 'user'` or legacy records without `source.kind`)
 * are never truncated, even when the person pasted `<system-reminder>` literals.
 */
function isInjectedUserEvent(event) {
    const data = object(event.data) ? event.data : undefined;
    const msg = data && object(data.message) ? data.message : data;
    const src = msg && object(msg.source) ? msg.source : undefined;
    return Boolean(src && typeof src.kind === 'string' && src.kind !== 'user');
}
function requestHeaderEvent(event) {
    if (!object(event.data) || !object(event.data.header))
        return event;
    const { tools: _tools, system: _system, ...restHeader } = event.data.header;
    return { ...event, data: { ...event.data, header: restHeader } };
}
function project(value, budget) {
    if (Array.isArray(value))
        return value.map(item => project(item, budget));
    if (!object(value))
        return value;
    // Only history containers and native events are projected. Other RPCs never use this helper.
    if (object(value.event)) {
        const eventType = String(value.event.type);
        if (TOOL_EVENT_TYPES.has(eventType)) {
            const { view, ...rest } = value;
            const event = toolValue(value.event, budget);
            const data = object(event.data) ? event.data : {};
            const title = object(view) && object(view.view) ? view.view.title : undefined;
            return { ...rest, event: { ...event, data: { ...data, ...(typeof title === 'string' && !data.name && !data.toolName ? { toolName: title } : {}) } } };
        }
        if (eventType === 'request/header')
            return { ...value, event: requestHeaderEvent(value.event) };
        if (eventType === 'assistant/message')
            return { ...value, event: messageValue(value.event, budget, false) };
        if (eventType === 'user/message')
            return { ...value, event: messageValue(value.event, budget, isInjectedUserEvent(value.event)) };
    }
    if (typeof value.type === 'string') {
        if (TOOL_EVENT_TYPES.has(value.type))
            return toolValue(value, budget);
        if (value.type === 'request/header')
            return requestHeaderEvent(value);
        if (value.type === 'assistant/message')
            return messageValue(value, budget, false);
        if (value.type === 'user/message')
            return messageValue(value, budget, isInjectedUserEvent(value));
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, project(child, budget)]));
}
export function compactHistory(value) {
    return project(value, { remaining: ROUND_BUDGET });
}
//# sourceMappingURL=compact-history.js.map