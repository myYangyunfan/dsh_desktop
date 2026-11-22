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
        if (['input', 'arguments', 'output', 'result', 'rawInput', 'rawOutput', 'uiResultMeta', 'meta', 'argumentsDelta'].includes(key)) {
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
function messageValue(value, budget) {
    if (Array.isArray(value))
        return value.map(item => messageValue(item, budget));
    if (!object(value))
        return value;
    if (value.type === 'tool-call' || value.type === 'tool-result')
        return toolValue(value, budget);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, messageValue(child, budget)]));
}
function project(value, budget) {
    if (Array.isArray(value))
        return value.map(item => project(item, budget));
    if (!object(value))
        return value;
    // Only history containers and native events are projected. Other RPCs never use this helper.
    if (object(value.event) && ['tool/call', 'tool/result'].includes(String(value.event.type))) {
        const { view, ...rest } = value;
        const event = toolValue(value.event, budget);
        const data = object(event.data) ? event.data : {};
        const title = object(view) && object(view.view) ? view.view.title : undefined;
        return { ...rest, event: { ...event, data: { ...data, ...(typeof title === 'string' && !data.name && !data.toolName ? { toolName: title } : {}) } } };
    }
    if (typeof value.type === 'string' && ['tool/call', 'tool/result'].includes(value.type))
        return toolValue(value, budget);
    if (typeof value.type === 'string' && ['user/message', 'assistant/message'].includes(value.type))
        return messageValue(value, budget);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, project(child, budget)]));
}
export function compactHistory(value) {
    return project(value, { remaining: ROUND_BUDGET });
}
//# sourceMappingURL=compact-history.js.map