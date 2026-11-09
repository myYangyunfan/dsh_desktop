/** Read-only history projection. Never removes records or changes cursor/identity/state. */
const LIMIT = 512;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const summary = (value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    return text.length > LIMIT ? text.slice(0, LIMIT) + '\n[Compact history: output omitted]' : text;
};
function toolValue(value) {
    if (Array.isArray(value))
        return value.map(toolValue);
    if (!object(value))
        return value;
    const result = { ...value };
    for (const [key, child] of Object.entries(value)) {
        if (['input', 'arguments', 'output', 'result', 'rawInput', 'rawOutput', 'uiResultMeta', 'meta', 'argumentsDelta'].includes(key)) {
            result[key] = typeof child === 'string' ? summary(child) : { summary: summary(child) };
        }
        else if (key === 'content' && Array.isArray(child)) {
            let previews = 0;
            const blocks = child.flatMap(block => {
                // Keep every tool correlation block, even when several share a message.
                if (object(block) && (block.type === 'tool-call' || block.type === 'tool-result'))
                    return [toolValue(block)];
                if (previews++ >= 2)
                    return [];
                return [{ type: 'text', text: summary(object(block) ? block.text ?? block : block) }];
            });
            // An omitted block must never turn a failed result into a success.
            if (child.some(block => object(block) && block.isError === true) && object(blocks[0]))
                blocks[0].isError = true;
            result[key] = blocks;
        }
        else if (key === 'text' && typeof child === 'string')
            result[key] = summary(child);
        else
            result[key] = toolValue(child);
    }
    return result;
}
function messageValue(value) {
    if (Array.isArray(value))
        return value.map(messageValue);
    if (!object(value))
        return value;
    if (value.type === 'tool-call' || value.type === 'tool-result')
        return toolValue(value);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, messageValue(child)]));
}
function project(value) {
    if (Array.isArray(value))
        return value.map(project);
    if (!object(value))
        return value;
    // Only history containers and native events are projected. Other RPCs never use this helper.
    if (object(value.event) && ['tool/call', 'tool/result'].includes(String(value.event.type))) {
        const { view, ...rest } = value;
        const event = toolValue(value.event);
        const data = object(event.data) ? event.data : {};
        const title = object(view) && object(view.view) ? view.view.title : undefined;
        return { ...rest, event: { ...event, data: { ...data, ...(typeof title === 'string' && !data.name && !data.toolName ? { toolName: title } : {}) } } };
    }
    if (typeof value.type === 'string' && ['tool/call', 'tool/result'].includes(value.type))
        return toolValue(value);
    if (typeof value.type === 'string' && ['user/message', 'assistant/message'].includes(value.type))
        return messageValue(value);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, project(child)]));
}
export function compactHistory(value) {
    return project(value);
}
//# sourceMappingURL=compact-history.js.map