import { projectCodexThread } from '@dsh-remote/client-core';
import { contentBlocks, toolOutputImageBlocks } from './codex-image-codec.js';
import { modelSelection } from './virtual-catalog.js';
import { array, CODEX_SESSION_PREFIX, hashString, integer, normalizeTime, record, string } from './virtual-values.js';
const MAX_LIVE_TOOL_OUTPUT = 128 * 1024;
const DEFAULT_HISTORY_MESSAGES = 50;
export function projectCodexNativeHistory(thread, sessionId, sessionGeneration = 'legacy') {
    const entries = [];
    let seq = 0;
    let turnNumber = 0;
    const active = activeTurnId(thread.turns);
    const append = (type, data, time = Date.now(), view, sourceEventSeqs) => {
        const eventSeq = seq++;
        entries.push({
            type: 'event',
            event: {
                type,
                seq: eventSeq,
                time,
                data: adaptEventData(type, data, sessionGeneration),
                ...(sourceEventSeqs === undefined ? {} : { sourceEventSeqs }),
                ...(isSurfaceEvent(type) ? { surfaceOp: 'append' } : {}),
            },
            ...(view === undefined ? {} : { view }),
        });
        return eventSeq;
    };
    for (const rawTurn of array(thread.turns)) {
        const turn = record(rawTurn);
        const turnItems = array(turn.items).map(record);
        const toolImages = turnItems.flatMap(toolOutputImageBlocks);
        let imageOwner = -1;
        for (let index = 0; index < turnItems.length; index += 1) {
            if (turnItems[index].type === 'agentMessage')
                imageOwner = index;
        }
        turnNumber += 1;
        const turnActive = isActiveCodexTurn(turn);
        const time = normalizeTime(turn.createdAt) || normalizeTime(turn.startedAt) || normalizeTime(thread.createdAt) || Date.now();
        append('turn/start', { turn: turnNumber }, time);
        append('step/start', { turn: turnNumber, step: 1 }, time);
        for (let itemIndex = 0; itemIndex < turnItems.length; itemIndex += 1) {
            const item = turnItems[itemIndex];
            let toolCallSeq;
            for (const event of itemEvents(item, turnNumber, 1, undefined, modelSelection(), sessionId, itemIndex === imageOwner ? toolImages : [])) {
                const eventSeq = append(event.type, event.data, normalizeTime(item.createdAt) || time, event.view, event.type === 'tool/result' && toolCallSeq !== undefined ? [toolCallSeq] : undefined);
                if (event.type === 'tool/call')
                    toolCallSeq = eventSeq;
            }
        }
        if (turnActive)
            continue;
        append('step/end', { turn: turnNumber, step: 1 }, normalizeTime(turn.updatedAt) || normalizeTime(turn.completedAt) || time);
        append('turn/end', {
            turn: turnNumber,
            reason: turn.status === 'failed' || turn.error !== undefined && turn.error !== null
                ? { kind: 'error', error: { message: 'CodeX turn failed.', code: 'codex-turn-failed' } }
                : { kind: 'completed' },
        }, normalizeTime(turn.updatedAt) || normalizeTime(turn.completedAt) || time);
    }
    const projected = projectCodexThread(thread);
    return {
        header: {
            version: sessionGeneration === 'v3' ? 3 : 1,
            id: sessionId,
            createdAt: projected?.createdAt ?? Date.now(),
            ...(projected?.cwd === undefined ? {} : { cwd: projected.cwd }),
            ...(sessionGeneration === 'v3' ? { isSeeded: false } : {}),
        },
        entries,
        lastSeq: seq - 1,
        nextTurn: turnNumber,
        ...(active === undefined ? {} : { activeTurnId: active }),
    };
}
export function paginateCodexNativeHistory(history, request) {
    const throughSeq = Math.min(request.throughSeq ?? history.lastSeq, history.lastSeq);
    const endSeq = Math.min(throughSeq, request.beforeSeq === undefined ? throughSeq : request.beforeSeq - 1);
    const window = endSeq < 0 ? [] : history.entries.filter(entry => entry.event.seq <= endSeq);
    const maxMessages = request.maxMessages ?? DEFAULT_HISTORY_MESSAGES;
    let messages = 0;
    let cut = 0;
    for (let index = window.length - 1; index >= 0; index -= 1) {
        const event = window[index].event;
        if (!isSurfaceEvent(event.type) || event.surfaceOp !== 'append')
            continue;
        messages += 1;
        if (messages >= maxMessages) {
            cut = Math.min(event.seq, ...(event.sourceEventSeqs ?? []));
            break;
        }
    }
    return {
        header: history.header,
        cursor: history.lastSeq,
        nextTurn: history.nextTurn,
        records: window.filter(entry => entry.event.seq >= cut),
        hasMore: window.some(entry => entry.event.seq < cut),
        ...(history.activeTurnId === undefined ? {} : { activeTurnId: history.activeTurnId }),
    };
}
export function adaptEventData(type, data, sessionGeneration) {
    if (sessionGeneration !== 'v3' || type !== 'assistant/message')
        return data;
    const value = record(data);
    return Array.isArray(value.stream) ? value : { ...value, stream: [] };
}
export function adaptCodexHistoryPage(value, sessionGeneration) {
    if (sessionGeneration !== 'v3')
        return value;
    const page = record(value);
    const sourceHeader = record(page.header);
    const { seedLength: _seedLength, ...header } = sourceHeader;
    const records = Array.isArray(page.records)
        ? page.records.map(raw => {
            const entry = record(raw);
            const sourceEvent = record(entry.event);
            const sourceSurfaceOp = record(sourceEvent.surfaceOp);
            const surfaceOp = sourceEvent.surfaceOp === 'append'
                ? 'append'
                : sourceSurfaceOp.op === 'replace'
                    && integer(sourceSurfaceOp.startSeq) !== undefined
                    && integer(sourceSurfaceOp.endSeq) !== undefined
                    ? sourceSurfaceOp
                    : sourceSurfaceOp.op === 'replace'
                        && integer(sourceSurfaceOp.start) !== undefined
                        && integer(sourceSurfaceOp.end) !== undefined
                        ? {
                            op: 'replace',
                            startSeq: sourceSurfaceOp.start,
                            endSeq: sourceSurfaceOp.end,
                        }
                        : sourceEvent.surfaceOp;
            return {
                ...entry,
                event: {
                    ...sourceEvent,
                    data: adaptEventData(string(sourceEvent.type) ?? '', sourceEvent.data, sessionGeneration),
                    ...(surfaceOp === undefined ? {} : { surfaceOp }),
                },
            };
        })
        : page.records;
    return {
        ...page,
        header: { ...header, version: 3, isSeeded: sourceHeader.isSeeded === true },
        records,
    };
}
export function itemEvents(item, turn, step, requestId, selection = modelSelection(), sessionId = CODEX_SESSION_PREFIX, supplementalImages = []) {
    const type = string(item.type);
    const id = string(item.id) ?? `${turn}:${step}:${hashString(JSON.stringify(item))}`;
    const text = itemText(item);
    if (type === 'userMessage')
        return [{
                type: 'user/message',
                data: {
                    id,
                    role: 'user',
                    content: messageContent(item, `${sessionId}:${id}`, 'text', text),
                    source: requestId === undefined || requestId === '' ? { kind: 'user' } : { kind: 'user', rpcId: requestId },
                },
            }];
    if (type === 'agentMessage' || type === 'reasoning' || type === 'plan')
        return [{
                type: 'assistant/message',
                data: {
                    turn,
                    step,
                    message: {
                        id,
                        role: 'assistant',
                        content: messageContent(item, `${sessionId}:${id}`, type === 'reasoning' ? 'reasoning' : 'text', text, type === 'agentMessage' ? supplementalImages : []),
                        source: { kind: 'model', provider: selection.provider, model: selection.model },
                    },
                },
            }];
    if (type !== undefined && isToolItemType(type)) {
        const name = toolEventName(type);
        const args = toolArguments(item);
        return [
            {
                type: 'tool/call',
                data: { turn, step, callId: id, name, arguments: JSON.stringify(args) },
                view: { for: 'call', view: toolCallView(item, type, args) },
            },
            toolResultEvent(item, turn, step, id, toolResultText(item, type, text)),
        ];
    }
    if (type === 'error')
        return [{
                type: 'assistant/message',
                data: {
                    turn,
                    step,
                    message: {
                        id,
                        role: 'assistant',
                        content: [{ type: 'text', text: text ?? 'CodeX reported an error.' }],
                        source: { kind: 'model', provider: selection.provider, model: selection.model },
                    },
                },
            }];
    return [];
}
function messageContent(item, attachmentSeed, fallbackType, fallbackText, supplementalImages = []) {
    const source = item.content ?? item.input;
    const blocks = contentBlocks(source, attachmentSeed);
    const images = contentBlocks(supplementalImages, `${attachmentSeed}:tool-output`);
    if (blocks.length > 0 || images.length > 0) {
        return [...(blocks.length > 0 ? blocks : [{ type: fallbackType, text: fallbackText ?? '' }]), ...images];
    }
    return [{ type: fallbackType, text: fallbackText ?? '' }];
}
export function toolResultEvent(item, turn, step, id, resultText) {
    const type = string(item.type) ?? 'unknown';
    return {
        type: 'tool/result',
        data: {
            turn,
            step,
            message: {
                id: `${id}:result`,
                role: 'user',
                content: [{
                        type: 'tool-result',
                        toolCallId: id,
                        content: [{ type: 'text', text: resultText }],
                        ...(item.status === 'failed' || item.success === false ? { isError: true } : {}),
                    }],
                source: { kind: 'tool', callId: id },
            },
        },
        view: { for: 'result', view: toolResultView(item, type, resultText) },
    };
}
export function toolResultContentReplacement(event) {
    const data = record(event.data);
    const message = record(data.message);
    const content = array(message.content);
    const result = record(content[0]);
    if (result.isError === undefined)
        return event;
    const { isError: _isError, ...stableResult } = result;
    return {
        ...event,
        data: {
            ...data,
            message: { ...message, content: [stableResult] },
        },
    };
}
export function isToolItemType(type) {
    return type === 'commandExecution'
        || type === 'mcpToolCall'
        || type === 'dynamicToolCall'
        || type === 'fileChange'
        || type === 'functionCallOutput'
        || type === 'hookPrompt'
        || type === 'collabAgentToolCall'
        || type === 'subAgentActivity'
        || type === 'webSearch'
        || type === 'imageView'
        || type === 'imageGeneration'
        || type === 'sleep'
        || type === 'enteredReviewMode'
        || type === 'exitedReviewMode'
        || type === 'contextCompaction';
}
function toolEventName(type) {
    if (type === 'fileChange')
        return 'codex.fileChange';
    if (type === 'commandExecution')
        return 'codex.command';
    if (type === 'webSearch')
        return 'codex.webSearch';
    if (type === 'collabAgentToolCall' || type === 'subAgentActivity')
        return 'codex.subagent';
    if (type === 'imageView' || type === 'imageGeneration')
        return 'codex.image';
    if (type === 'enteredReviewMode' || type === 'exitedReviewMode')
        return 'codex.reviewMode';
    if (type === 'contextCompaction')
        return 'codex.compaction';
    return `codex.${type}`;
}
function toolResultText(item, type, text) {
    if (type === 'fileChange')
        return fileChangeSummary(item);
    if (type === 'webSearch') {
        const count = array(item.results).length;
        return count === 0 ? 'Web search completed.' : `Web search returned ${count} result${count === 1 ? '' : 's'}.`;
    }
    if (type === 'imageView')
        return `Viewed image: ${string(item.path) ?? 'image'}`;
    if (type === 'imageGeneration') {
        const savedPath = string(item.savedPath);
        return savedPath === undefined ? `Image generation ${string(item.status) ?? 'completed'}.` : `Generated image: ${savedPath}`;
    }
    if (type === 'contextCompaction')
        return 'CodeX compacted the conversation context.';
    if (type === 'enteredReviewMode')
        return `Entered review mode${string(item.review) ? `: ${string(item.review)}` : '.'}`;
    if (type === 'exitedReviewMode')
        return `Exited review mode${string(item.review) ? `: ${string(item.review)}` : '.'}`;
    if (type === 'sleep')
        return `Waited ${integer(item.durationMs) ?? 0} ms.`;
    if (type === 'subAgentActivity') {
        return [string(record(item.kind).type) ?? string(item.kind) ?? 'Subagent activity', string(item.agentPath)]
            .filter((value) => value !== undefined).join(': ');
    }
    return text ?? itemText(record(item.result)) ?? itemText(record(item.output)) ?? string(item.status) ?? type;
}
export function isSurfaceEvent(type) {
    return type === 'user/message' || type === 'assistant/message' || type === 'tool/result';
}
function toolCallView(item, type, args) {
    if (type === 'commandExecution') {
        return {
            card: 'terminal',
            title: commandText(item.command) ?? 'CodeX command',
            ...(typeof item.cwd === 'string' ? { cwd: item.cwd } : {}),
        };
    }
    const locations = fileLocations(item);
    if (type === 'fileChange') {
        return {
            card: 'generic',
            title: locations.length === 0 ? 'CodeX file changes' : `Modify ${locations.length} file${locations.length === 1 ? '' : 's'}`,
            kind: 'edit',
            rawInput: args,
            ...(locations.length === 0 ? {} : { locations }),
        };
    }
    if (type === 'webSearch') {
        return {
            card: 'generic',
            title: string(item.query) ?? 'CodeX web search',
            kind: 'search',
            rawInput: args,
        };
    }
    if (type === 'imageView' || type === 'imageGeneration') {
        const path = string(item.path) ?? string(item.savedPath);
        return {
            card: 'generic',
            title: type === 'imageView' ? 'View image' : 'Generate image',
            kind: type === 'imageView' ? 'read' : 'other',
            ...(path === undefined ? {} : { locations: [{ path }] }),
        };
    }
    if (type === 'collabAgentToolCall' || type === 'subAgentActivity') {
        return {
            card: 'generic',
            title: type === 'collabAgentToolCall'
                ? `Subagent: ${string(item.tool) ?? 'collaboration'}`
                : `Subagent activity: ${string(item.agentPath) ?? string(item.agentThreadId) ?? 'agent'}`,
            kind: 'other',
            rawInput: args,
        };
    }
    if (type === 'contextCompaction')
        return { card: 'generic', title: 'Compact conversation context', kind: 'other' };
    if (type === 'enteredReviewMode')
        return { card: 'generic', title: 'Enter review mode', kind: 'other' };
    if (type === 'exitedReviewMode')
        return { card: 'generic', title: 'Exit review mode', kind: 'other' };
    return {
        card: 'generic',
        title: toolDisplayName(item, type),
        kind: 'other',
    };
}
function toolResultView(item, type, resultText) {
    if (type === 'commandExecution') {
        return {
            card: 'terminal',
            output: resultText,
            ...(typeof item.exitCode === 'number' && Number.isSafeInteger(item.exitCode) ? { exitCode: item.exitCode } : {}),
        };
    }
    return {
        card: 'generic',
        ...(type === 'fileChange' ? { title: item.status === 'inProgress' ? 'CodeX file changes' : 'CodeX file changes completed' } : {}),
        ...(type === 'mcpToolCall' && item.status === 'inProgress'
            ? { title: 'CodeX MCP tool in progress', content: [{ type: 'text', text: resultText }] }
            : {}),
    };
}
function toolDisplayName(item, type) {
    return string(item.name)
        ?? string(item.tool)
        ?? string(record(item.tool).name)
        ?? (type === 'mcpToolCall' ? 'CodeX MCP tool' : humanizeItemType(type));
}
function fileLocations(item) {
    return array(item.changes)
        .map(value => string(record(value).path))
        .filter((path) => path !== undefined && path.length > 0)
        .map(path => ({ path }));
}
export function itemText(value) {
    if (typeof value.text === 'string')
        return value.text;
    if (typeof value.content === 'string')
        return value.content;
    const content = Array.isArray(value.content)
        ? value.content
        : Array.isArray(value.input) ? value.input : undefined;
    if (content !== undefined) {
        const text = content.map(part => {
            if (typeof part === 'string')
                return part;
            const block = record(part);
            return string(block.text) ?? string(block.content) ?? '';
        }).filter(Boolean).join('\n');
        if (text !== '')
            return text;
    }
    if (Array.isArray(value.summary))
        return value.summary.filter(item => typeof item === 'string').join('\n');
    if (typeof value.output === 'string')
        return value.output;
    if (typeof value.aggregatedOutput === 'string')
        return value.aggregatedOutput;
    return undefined;
}
function toolArguments(item) {
    if (item.type === 'commandExecution')
        return { command: commandText(item.command) ?? item.command ?? '' };
    if (item.type === 'fileChange')
        return {
            changes: array(item.changes).map(value => {
                const change = record(value);
                const kind = typeof change.kind === 'string' ? change.kind : string(record(change.kind).type);
                return {
                    ...(typeof change.path === 'string' ? { path: change.path } : {}),
                    ...(kind === undefined ? {} : { kind }),
                };
            }),
        };
    if (item.type === 'webSearch')
        return { query: string(item.query) ?? '' };
    if (item.type === 'imageView')
        return { path: string(item.path) ?? '' };
    if (item.type === 'imageGeneration')
        return {
            ...(string(item.revisedPrompt) === undefined ? {} : { prompt: string(item.revisedPrompt) }),
            transparentBackground: item.transparentBackground === true,
        };
    if (item.type === 'collabAgentToolCall')
        return {
            tool: string(item.tool) ?? 'collaboration',
            receiverThreadIds: array(item.receiverThreadIds).filter(value => typeof value === 'string'),
            ...(string(item.model) === undefined ? {} : { model: string(item.model) }),
        };
    if (item.type === 'subAgentActivity')
        return {
            agentThreadId: string(item.agentThreadId) ?? '',
            agentPath: string(item.agentPath) ?? '',
            kind: string(record(item.kind).type) ?? string(item.kind) ?? 'activity',
        };
    if (item.type === 'sleep')
        return { durationMs: integer(item.durationMs) ?? 0 };
    if (item.type === 'enteredReviewMode' || item.type === 'exitedReviewMode')
        return {
            review: string(item.review) ?? '',
        };
    if (item.type === 'contextCompaction')
        return {};
    return { name: item.name ?? item.tool ?? item.type ?? 'tool', arguments: item.arguments ?? item.input ?? {} };
}
export function fileChangeSummary(item) {
    const changes = array(item.changes).map(value => {
        const change = record(value);
        const path = string(change.path);
        const kind = typeof change.kind === 'string' ? change.kind : string(record(change.kind).type);
        return [kind, path].filter((part) => part !== undefined && part.length > 0).join(' ');
    }).filter(Boolean);
    return changes.length === 0 ? 'File changes completed.' : changes.join('\n');
}
export function sanitizedFileChanges(value) {
    return array(value).flatMap(raw => {
        const change = record(raw);
        const path = string(change.path);
        if (path === undefined)
            return [];
        const kind = typeof change.kind === 'string' ? change.kind : string(record(change.kind).type);
        return [{ path, ...(kind === undefined ? {} : { kind }) }];
    });
}
export function appendBoundedText(current, delta) {
    const value = `${current}${delta}`;
    if (value.length <= MAX_LIVE_TOOL_OUTPUT)
        return value;
    return `… earlier output omitted …\n${value.slice(value.length - MAX_LIVE_TOOL_OUTPUT)}`;
}
function humanizeItemType(type) {
    const names = {
        functionCallOutput: 'CodeX function output',
        hookPrompt: 'CodeX hook prompt',
        dynamicToolCall: 'CodeX tool',
        collabAgentToolCall: 'CodeX subagent',
        subAgentActivity: 'CodeX subagent activity',
        webSearch: 'CodeX web search',
        imageView: 'CodeX image view',
        imageGeneration: 'CodeX image generation',
        sleep: 'CodeX wait',
        enteredReviewMode: 'CodeX review mode',
        exitedReviewMode: 'CodeX review mode',
        contextCompaction: 'CodeX context compaction',
    };
    return names[type] ?? 'CodeX tool';
}
export function commandText(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value))
        return value.filter(item => typeof item === 'string').join(' ');
    const source = record(value);
    return string(source.command) ?? string(source.text);
}
function activeTurnId(value) {
    if (!Array.isArray(value))
        return undefined;
    for (let index = value.length - 1; index >= 0; index -= 1) {
        const turn = record(value[index]);
        if (isActiveCodexTurn(turn) && typeof turn.id === 'string' && turn.id.length > 0)
            return turn.id;
    }
    return undefined;
}
function isActiveCodexTurn(turn) {
    return turn.status === 'inProgress' || turn.status === 'running';
}
export function isCodexNativeHistoryPage(value, sessionId) {
    const page = record(value);
    const header = record(page.header);
    return header.id === sessionId
        && integer(page.cursor) !== undefined
        && integer(page.nextTurn) !== undefined
        && Array.isArray(page.records)
        && typeof page.hasMore === 'boolean'
        && (page.activeTurnId === undefined || typeof page.activeTurnId === 'string');
}
//# sourceMappingURL=virtual-history.js.map