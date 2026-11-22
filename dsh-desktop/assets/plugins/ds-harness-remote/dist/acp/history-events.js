import { acpImageContent, parseAcpImage } from './image-content.js';
import { piToolResult } from './pi-tool-result.js';
/**
 * Convert replayed ACP `session/update` notifications into DSH history events.
 * Upstream timestamps and message IDs are not replayed, so IDs are deterministic
 * and time stays unknown (0).
 */
export function acpHistoryEvents(messages, sessionId, provider) {
    const events = [];
    const tools = new Map();
    let turn = 0;
    let step = 1;
    let afterTools = false;
    let pending;
    const push = (type, data, surface = false) => events.push({
        type: 'event',
        event: {
            type,
            seq: events.length,
            time: 0,
            data,
            ...(surface ? { surfaceOp: 'append' } : {}),
        },
    });
    const id = () => `${provider}-history:${sessionId}:${events.length}`;
    const flushMessage = () => {
        if (!pending)
            return;
        const message = { id: id(), role: pending.role, content: pending.content };
        if (pending.role === 'user')
            push('user/message', { ...message, source: { kind: 'user' } }, true);
        else
            push('assistant/message', { turn, step, message: { ...message, source: { kind: 'model', provider, model: '' } }, stream: [] }, true);
        pending = undefined;
    };
    const result = (tool) => {
        if (tool.emitted || !tool.terminal)
            return;
        tool.emitted = true;
        push('tool/result', {
            turn,
            step,
            message: {
                id: id(),
                role: 'user',
                source: { kind: 'tool', callId: tool.id },
                content: [{
                        type: 'tool-result',
                        toolCallId: tool.id,
                        content: tool.output,
                        ...(tool.failed ? { isError: true } : {}),
                    }],
            },
        }, true);
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
            const content = update.content;
            const isText = content?.type === 'text' && typeof content.text === 'string';
            const isImage = kind === 'user_message_chunk' && content?.type === 'image' && typeof content.mimeType === 'string' && typeof content.data === 'string';
            if (!isText && !isImage)
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
            if (isImage) {
                try {
                    const parsed = parseAcpImage(content);
                    const ext = parsed.mimeType === 'image/jpeg' ? 'jpg' : parsed.mimeType.slice(6);
                    const attachmentId = `agy-image:history-${sessionId}-${events.length}-${pending.content.length}.${ext}`;
                    pending.content.push({
                        ...acpImageContent(parsed, attachmentId),
                        mimeType: parsed.mimeType,
                    });
                }
                catch {
                    pending.content.push({
                        type: 'image',
                        mimeType: content.mimeType,
                        mediaType: content.mimeType,
                        data: content.data,
                    });
                }
            }
            else {
                const type = kind === 'agent_thought_chunk' ? 'reasoning' : 'text';
                const previous = pending.content.at(-1);
                if (previous?.type === type && typeof previous.text === 'string')
                    previous.text += content.text;
                else
                    pending.content.push({ type, text: content.text });
            }
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
                tool = {
                    id: update.toolCallId,
                    name: typeof update.title === 'string' ? update.title : typeof update.name === 'string' ? update.name : 'tool',
                    input: update.rawInput ?? update.args,
                    output: [],
                    failed: false,
                    terminal: false,
                    emitted: false,
                };
                tools.set(tool.id, tool);
                push('tool/call', {
                    turn,
                    step,
                    callId: tool.id,
                    name: tool.name,
                    arguments: typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input ?? {}),
                });
            }
            const decoded = piToolResult(update);
            if (!decoded.content.length && update.rawOutput !== undefined) {
                decoded.content.push({
                    type: 'text',
                    text: typeof update.rawOutput === 'string' ? update.rawOutput : JSON.stringify(update.rawOutput),
                });
            }
            if (decoded.content.length)
                tool.output = decoded.content;
            tool.failed ||= decoded.isError || update.status === 'failed';
            tool.terminal ||= update.status === 'completed' || update.status === 'failed';
            // Emit once a tool_call_update completes, or let flushTools emit a completed tool_call.
            if (kind === 'tool_call_update' && tool.terminal)
                result(tool);
        }
    }
    endTurn();
    return events;
}
//# sourceMappingURL=history-events.js.map