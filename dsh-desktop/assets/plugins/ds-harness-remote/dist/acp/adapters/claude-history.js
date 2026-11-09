// ACP replay has no reliable timestamps. Deterministic projection IDs and epoch time
// avoid presenting the history read time as the conversation time.
export function claudeHistoryEvents(messages, sessionId) {
    const events = [];
    const tools = new Map();
    let turn = 0;
    let step = 1;
    let afterTools = false;
    let pending;
    const push = (type, data, surface = false) => events.push({ type: 'event', event: {
            type, seq: events.length, time: 0, data, ...(surface ? { surfaceOp: 'append' } : {}),
        } });
    const id = () => `claude-history:${sessionId}:${events.length}`;
    const flushMessage = () => {
        if (!pending)
            return;
        const message = { id: id(), role: pending.role, content: pending.content };
        if (pending.role === 'user')
            push('user/message', { ...message, source: { kind: 'user' } }, true);
        else
            push('assistant/message', { turn, step, message: { ...message, source: { kind: 'model', provider: 'claude', model: '' } }, stream: [] }, true);
        pending = undefined;
    };
    const result = (tool) => {
        if (tool.emitted || !tool.terminal)
            return;
        tool.emitted = true;
        push('tool/result', { turn, step, message: { id: id(), role: 'user', source: { kind: 'tool', callId: tool.id }, content: [{
                        type: 'tool-result', toolCallId: tool.id, content: tool.output, ...(tool.failed ? { isError: true } : {}),
                    }] } }, true);
    };
    const flushTools = () => { for (const tool of tools.values())
        result(tool); };
    const endTurn = () => {
        flushMessage();
        flushTools();
        if (turn) {
            push('step/end', { turn, step });
            push('turn/end', { turn, reason: { kind: 'completed' } });
        }
        tools.clear();
        afterTools = false;
    };
    for (const message of messages) {
        const params = message.params;
        if (message.kind !== 'notification' || message.method !== 'session/update' || params?.sessionId !== sessionId)
            continue;
        const update = params.update;
        if (!update)
            continue;
        const kind = update.sessionUpdate;
        if (kind === 'user_message_chunk' || kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
            if (update.content?.type !== 'text' || typeof update.content.text !== 'string')
                continue;
            const role = kind === 'user_message_chunk' ? 'user' : 'assistant';
            if (role === 'user' && pending?.role !== 'user') {
                endTurn();
                turn++;
                step = 1;
                push('turn/start', { turn });
                push('step/start', { turn, step });
            }
            else if (!turn) {
                turn++;
                push('turn/start', { turn });
                push('step/start', { turn, step });
            }
            if (pending && pending.role !== role)
                flushMessage();
            flushTools();
            if (role === 'assistant' && afterTools) {
                push('step/end', { turn, step });
                step++;
                push('step/start', { turn, step });
                afterTools = false;
            }
            pending ??= { role, content: [] };
            const type = kind === 'agent_thought_chunk' ? 'reasoning' : 'text';
            const previous = pending.content.at(-1);
            if (previous?.type === type)
                previous.text += update.content.text;
            else
                pending.content.push({ type, text: update.content.text });
        }
        else if ((kind === 'tool_call' || kind === 'tool_call_update') && typeof update.toolCallId === 'string') {
            flushMessage();
            afterTools = true;
            if (!turn) {
                turn++;
                push('turn/start', { turn });
                push('step/start', { turn, step });
            }
            let tool = tools.get(update.toolCallId);
            if (!tool) {
                tool = { id: update.toolCallId, name: typeof update.title === 'string' ? update.title : 'tool', input: update.rawInput,
                    output: [], failed: false, terminal: false, emitted: false };
                tools.set(tool.id, tool);
                push('tool/call', { turn, step, callId: tool.id, name: tool.name,
                    arguments: typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input ?? {}) });
            }
            const decoded = { content: Array.isArray(update.content) ? update.content.flatMap((item) => item?.type === 'content' && item.content?.type === 'text' && typeof item.content.text === 'string'
                    ? [{ type: 'text', text: item.content.text }] : []) : [],
                isError: update.status === 'failed' || update.rawOutput?.isError === true };
            if (!decoded.content.length && update.rawOutput !== undefined)
                decoded.content.push({ type: 'text',
                    text: typeof update.rawOutput === 'string' ? update.rawOutput : JSON.stringify(update.rawOutput) });
            if (decoded.content.length)
                tool.output = decoded.content;
            tool.failed ||= decoded.isError;
            tool.terminal ||= update.status === 'completed' || update.status === 'failed';
            if (kind === 'tool_call_update')
                result(tool);
        }
    }
    endTurn();
    return events;
}
//# sourceMappingURL=claude-history.js.map