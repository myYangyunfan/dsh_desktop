export function normalizeLegacySessionGatewayValue(endpoint, value) {
    if (endpoint === 'session/page')
        return normalizePage(value);
    if (endpoint === 'session/follow')
        return normalizeFollowFrame(value);
    return value;
}
export function normalizeAssistantMessageStreamValue(endpoint, value) {
    if (endpoint === 'session/page' && isRecord(value))
        return { ...value, records: normalizeRecords(value.records) };
    if (endpoint === 'session/follow' && isRecord(value) && value.type === 'snapshot') {
        return { ...value, records: normalizeRecords(value.records) };
    }
    if (endpoint === 'session/follow')
        return normalizeEntry(value);
    return value;
}
function normalizeFollowFrame(value) {
    if (!isRecord(value))
        return value;
    if (value.type === 'snapshot') {
        return {
            ...value,
            header: normalizeHeader(value.header),
            records: normalizeRecords(value.records),
            ...(value.assistantStream === undefined ? { assistantStream: { revision: 0 } } : {}),
        };
    }
    return normalizeEntry(value);
}
function normalizePage(value) {
    if (!isRecord(value))
        return value;
    return { ...value, records: normalizeRecords(value.records) };
}
function normalizeRecords(value) {
    if (!Array.isArray(value))
        return value;
    const records = [];
    let previousSeq;
    for (const record of value) {
        if (!isEventEntry(record))
            continue;
        const seq = entrySeq(record);
        if (previousSeq !== undefined && seq !== undefined && seq > previousSeq + 1) {
            for (let fillerSeq = previousSeq + 1; fillerSeq < seq; fillerSeq += 1) {
                records.push(createLegacyGapRecord(fillerSeq, record));
            }
        }
        records.push(normalizeEntry(record));
        if (seq !== undefined)
            previousSeq = seq;
    }
    return records;
}
function normalizeEntry(value) {
    if (!isEventEntry(value))
        return value;
    return { ...value, event: normalizeEvent(value.event) };
}
function entrySeq(value) {
    if (!isEventEntry(value))
        return undefined;
    return isEventSeq(value.event.seq) ? value.event.seq : undefined;
}
function createLegacyGapRecord(seq, nextRecord) {
    return {
        type: 'event',
        event: {
            type: 'legacy/session-gap',
            seq,
            time: eventTime(nextRecord),
            ignorable: true,
            data: {},
        },
    };
}
function eventTime(value) {
    if (!isEventEntry(value))
        return 0;
    return typeof value.event.time === 'number' && Number.isSafeInteger(value.event.time)
        ? value.event.time
        : 0;
}
function isEventEntry(value) {
    return isRecord(value) && value.type === 'event' && isRecord(value.event);
}
function normalizeHeader(value) {
    if (!isRecord(value))
        return value;
    const next = {
        ...value,
        version: 3,
        ...(value.delegationDepth === undefined ? { delegationDepth: 0 } : {}),
    };
    return next.agentPreset === 'code' ? { ...next, agentPreset: 'ptc' } : next;
}
function normalizeEvent(value) {
    if (!isRecord(value))
        return value;
    let next = value;
    const type = normalizeEventType(value.type);
    if (type !== value.type)
        next = { ...next, type };
    if (type === 'assistant/message' && Object.hasOwn(next, 'sourceEventSeqs')) {
        const { sourceEventSeqs: _sourceEventSeqs, ...rest } = next;
        next = rest;
    }
    const data = normalizeEventData(type, next.data);
    if (data !== next.data)
        next = { ...next, data };
    const surfaceOp = normalizeSurfaceOp(next.surfaceOp);
    if (surfaceOp !== next.surfaceOp)
        next = { ...next, surfaceOp };
    return next;
}
function normalizeEventType(value) {
    if (value === 'tool/code-dispatch-start')
        return 'tool/ptc-dispatch-start';
    if (value === 'tool/code-dispatch')
        return 'tool/ptc-dispatch';
    return value;
}
function normalizeEventData(type, value) {
    if (!isRecord(value))
        return value;
    if (type === 'assistant/message' && Object.hasOwn(value, 'stream') && !Array.isArray(value.stream)) {
        const { stream: _stream, ...rest } = value;
        return rest;
    }
    if (type === 'request/header')
        return normalizeRequestHeaderData(value);
    if (type === 'agent-preset/selected' && value.agentPreset === 'code')
        return { ...value, agentPreset: 'ptc' };
    if (type === 'user/message')
        return normalizeMessage(value);
    if (type === 'agent/inbox/spliced' && Array.isArray(value.inserted)) {
        return { ...value, inserted: value.inserted.map(item => normalizeMessage(item)) };
    }
    if (type === 'session/title-llm-request' && Array.isArray(value.messages)) {
        return { ...value, messages: value.messages.map(item => normalizeMessage(item)) };
    }
    return value;
}
function normalizeRequestHeaderData(value) {
    if (!isRecord(value.header))
        return value;
    const header = normalizeRequestHeader(value.header);
    return header === value.header ? value : { ...value, header };
}
function normalizeRequestHeader(value) {
    let changed = false;
    const next = {};
    for (const [key, field] of Object.entries(value)) {
        if (key === 'system') {
            changed = true;
            continue;
        }
        if (key === 'tools' && Array.isArray(field) && field.length === 0) {
            changed = true;
            continue;
        }
        if (key === 'adapterDefaults' && isRecord(field) && Object.keys(field).length === 0) {
            changed = true;
            continue;
        }
        next[key] = field;
    }
    return changed ? next : value;
}
function normalizeMessage(value) {
    if (!isRecord(value) || !isRecord(value.source))
        return value;
    if (value.source.kind !== 'plugin' || value.source.plugin !== 'tools-code-mode')
        return value;
    return { ...value, source: { ...value.source, plugin: 'tools-ptc' } };
}
function normalizeSurfaceOp(value) {
    if (!isRecord(value) || value.op !== 'replace')
        return value;
    const { start, end, ...rest } = value;
    if (start === undefined && end === undefined)
        return value;
    return {
        ...rest,
        op: 'replace',
        ...(start === undefined ? {} : { startSeq: start }),
        ...(end === undefined ? {} : { endSeq: end }),
    };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isEventSeq(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
//# sourceMappingURL=session-format-compat.js.map