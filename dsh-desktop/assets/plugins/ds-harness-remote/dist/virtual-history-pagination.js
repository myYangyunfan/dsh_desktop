import { MAX_SECURE_MESSAGE_BYTES } from '@dsh-remote/protocol';
export const VIRTUAL_HISTORY_DEFAULT_MAX_MESSAGES = 50;
export const VIRTUAL_HISTORY_MAX_MESSAGES = 200;
export const VIRTUAL_HISTORY_MAX_BYTES = 256 * 1024;
export const VIRTUAL_HISTORY_RPC_ENVELOPE_RESERVE_BYTES = 256 * 1024;
export const VIRTUAL_HISTORY_HARD_MAX_BYTES = MAX_SECURE_MESSAGE_BYTES - VIRTUAL_HISTORY_RPC_ENVELOPE_RESERVE_BYTES;
const STAGE_B_STRING_BYTE_LIMITS = [64 * 1024, 8 * 1024, 1024, 256];
const MAX_COMPACT_ARRAY_ITEMS = 32;
const MAX_COMPACT_DEPTH = 32;
const MAX_STUB_ATTACHMENTS = 16;
const TRUNCATED_STRING_MARKER = '\n[History record truncated to fit transport limit]';
const OMITTED_RECORD_TEXT = '[History record omitted: exceeds transport size limit]';
const OMITTED_NESTED_VALUE_TEXT = '[History nested value omitted: exceeds depth limit]';
const PRESERVED_DATA_KEYS = new Set([
    'id',
    'role',
    'source',
    'turn',
    'step',
    'toolCallId',
    'callId',
    'name',
    'status',
    'isError',
    'title',
    'kind',
    'phase',
    'attachment',
    'type',
]);
const SCALAR_IDENTITY_KEYS = [
    'id',
    'role',
    'turn',
    'step',
    'toolCallId',
    'callId',
    'name',
    'status',
    'isError',
    'title',
    'kind',
    'phase',
];
export class VirtualHistoryResponseTooLargeError extends Error {
    actualBytes;
    maxBytes;
    code = 'RESPONSE_TOO_LARGE';
    retryable = false;
    constructor(actualBytes, maxBytes, message = `Virtual history response (${actualBytes} bytes) exceeds transport limit (${maxBytes} bytes).`) {
        super(message);
        this.actualBytes = actualBytes;
        this.maxBytes = maxBytes;
        this.name = 'VirtualHistoryResponseTooLargeError';
    }
}
const utf8Encoder = new TextEncoder();
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSafeScalar(value) {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null;
}
function utf8ByteLength(value) {
    return utf8Encoder.encode(value).byteLength;
}
function sliceUtf8BytesSafe(value, maxBytes) {
    if (maxBytes <= 0 || value.length === 0)
        return '';
    let bytes = 0;
    let index = 0;
    while (index < value.length) {
        const codePoint = value.codePointAt(index);
        const charBytes = codePoint <= 0x7f
            ? 1
            : codePoint <= 0x7ff
                ? 2
                : codePoint <= 0xffff
                    ? 3
                    : 4;
        if (bytes + charBytes > maxBytes)
            break;
        bytes += charBytes;
        index += codePoint > 0xffff ? 2 : 1;
    }
    return value.slice(0, index);
}
function truncateStringUtf8(value, maxBytes) {
    if (value.length <= Math.floor(maxBytes / 3)) {
        return { text: value, truncated: false };
    }
    if (value.length <= maxBytes && utf8ByteLength(value) <= maxBytes) {
        return { text: value, truncated: false };
    }
    const markerBytes = utf8ByteLength(TRUNCATED_STRING_MARKER);
    const prefixBudget = Math.max(0, maxBytes - markerBytes);
    return {
        text: `${sliceUtf8BytesSafe(value, prefixBudget)}${TRUNCATED_STRING_MARKER}`,
        truncated: true,
    };
}
function containsErrorFlag(value, depth = 0) {
    if (depth > 4)
        return false;
    if (Array.isArray(value)) {
        return value.some(item => containsErrorFlag(item, depth + 1));
    }
    if (!isPlainRecord(value))
        return false;
    if (value.isError === true)
        return true;
    for (const child of Object.values(value)) {
        if (containsErrorFlag(child, depth + 1))
            return true;
    }
    return false;
}
function setSafeProperty(target, key, value) {
    if (key === '__proto__')
        return;
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
    });
}
function stripInlineImagePayloads(value, state, depth = 0, seen = new WeakSet()) {
    if (typeof value !== 'object' || value === null)
        return value;
    if (depth > MAX_COMPACT_DEPTH || seen.has(value)) {
        state.changed = true;
        return OMITTED_NESTED_VALUE_TEXT;
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map(item => stripInlineImagePayloads(item, state, depth + 1, seen));
        }
        if (!isPlainRecord(value))
            return value;
        if ((value.type === 'image' || value.type === 'input_image')
            && ('data' in value || 'url' in value || 'image_url' in value)) {
            state.changed = true;
            const next = {};
            for (const [key, child] of Object.entries(value)) {
                if (key === 'data' || key === 'url' || key === 'image_url')
                    continue;
                setSafeProperty(next, key, child);
            }
            next.truncated = true;
            return next;
        }
        const next = {};
        for (const [key, child] of Object.entries(value)) {
            if (key === '__proto__') {
                state.changed = true;
                continue;
            }
            setSafeProperty(next, key, stripInlineImagePayloads(child, state, depth + 1, seen));
        }
        return next;
    }
    finally {
        seen.delete(value);
    }
}
function compactValueForBudget(value, maxStringBytes, state, depth = 0, seen = new WeakSet()) {
    if (typeof value === 'string') {
        const truncated = truncateStringUtf8(value, maxStringBytes);
        if (truncated.truncated)
            state.changed = true;
        return truncated.text;
    }
    if (typeof value !== 'object' || value === null)
        return value;
    if (depth > MAX_COMPACT_DEPTH || seen.has(value)) {
        state.changed = true;
        return OMITTED_NESTED_VALUE_TEXT;
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            if (value.length <= MAX_COMPACT_ARRAY_ITEMS) {
                return value.map(item => compactValueForBudget(item, maxStringBytes, state, depth + 1, seen));
            }
            state.changed = true;
            const kept = value
                .slice(0, MAX_COMPACT_ARRAY_ITEMS)
                .map(item => compactValueForBudget(item, maxStringBytes, state, depth + 1, seen));
            const omitted = value.slice(MAX_COMPACT_ARRAY_ITEMS);
            const omittedCount = omitted.length;
            const omittedHadError = containsErrorFlag(omitted);
            kept.push({
                type: 'text',
                text: `[${omittedCount} history item${omittedCount === 1 ? '' : 's'} omitted to fit transport limit]`,
                truncated: true,
                ...(omittedHadError ? { isError: true } : {}),
            });
            return kept;
        }
        if (!isPlainRecord(value))
            return value;
        const next = {};
        for (const [key, child] of Object.entries(value)) {
            if (key === '__proto__') {
                state.changed = true;
                continue;
            }
            if (PRESERVED_DATA_KEYS.has(key)) {
                setSafeProperty(next, key, child);
                continue;
            }
            setSafeProperty(next, key, compactValueForBudget(child, maxStringBytes, state, depth + 1, seen));
        }
        return next;
    }
    finally {
        seen.delete(value);
    }
}
function pickSafeScalars(source) {
    const out = {};
    for (const [key, child] of Object.entries(source)) {
        if (isSafeScalar(child))
            setSafeProperty(out, key, child);
    }
    return out;
}
function pickSafeScalarIdentity(source) {
    const out = {};
    for (const key of SCALAR_IDENTITY_KEYS) {
        const child = source[key];
        if (isSafeScalar(child))
            setSafeProperty(out, key, child);
    }
    if (isPlainRecord(source.source)) {
        const safeSource = pickSafeScalars(source.source);
        if (Object.keys(safeSource).length > 0)
            out.source = safeSource;
    }
    if (isPlainRecord(source.attachment)) {
        const safeAttachment = pickSafeScalars(source.attachment);
        if (Object.keys(safeAttachment).length > 0)
            out.attachment = safeAttachment;
    }
    return out;
}
function collectAttachmentStubs(value, out, depth = 0) {
    if (depth > 6 || out.length >= MAX_STUB_ATTACHMENTS)
        return;
    if (Array.isArray(value)) {
        for (const item of value) {
            if (out.length >= MAX_STUB_ATTACHMENTS)
                break;
            collectAttachmentStubs(item, out, depth + 1);
        }
        return;
    }
    if (!isPlainRecord(value))
        return;
    if ((value.type === 'image' || value.type === 'input_image') && isPlainRecord(value.attachment)) {
        const safeAttachment = pickSafeScalars(value.attachment);
        if (Object.keys(safeAttachment).length > 0) {
            out.push({
                type: value.type,
                attachment: safeAttachment,
                ...(typeof value.mediaType === 'string' ? { mediaType: value.mediaType } : {}),
                truncated: true,
            });
        }
        return;
    }
    for (const child of Object.values(value)) {
        if (out.length >= MAX_STUB_ATTACHMENTS)
            break;
        collectAttachmentStubs(child, out, depth + 1);
    }
}
function buildMinimalTransportableStub(entry, attachmentStubs) {
    const origData = entry.event.data;
    let stubData;
    if (isPlainRecord(origData)) {
        const base = pickSafeScalarIdentity(origData);
        const hadError = containsErrorFlag(origData);
        if (isPlainRecord(origData.message)) {
            const msgBase = pickSafeScalarIdentity(origData.message);
            const message = {
                ...msgBase,
                ...(Array.isArray(origData.message.content)
                    ? {
                        content: [
                            { type: 'text', text: OMITTED_RECORD_TEXT },
                            ...attachmentStubs,
                        ],
                    }
                    : { text: OMITTED_RECORD_TEXT }),
            };
            stubData = {
                ...base,
                message,
                ...(Array.isArray(origData.stream) ? { stream: [] } : {}),
                ...(hadError && base.isError === undefined ? { isError: true } : {}),
                truncated: true,
            };
        }
        else if (Array.isArray(origData.content)) {
            stubData = {
                ...base,
                content: [
                    { type: 'text', text: OMITTED_RECORD_TEXT },
                    ...attachmentStubs,
                ],
                ...(hadError && base.isError === undefined ? { isError: true } : {}),
                truncated: true,
            };
        }
        else {
            stubData = {
                ...base,
                text: OMITTED_RECORD_TEXT,
                ...(hadError && base.isError === undefined ? { isError: true } : {}),
                truncated: true,
            };
        }
    }
    else {
        stubData = {
            text: OMITTED_RECORD_TEXT,
            truncated: true,
        };
    }
    const stubEvent = {
        type: entry.event.type,
        seq: entry.event.seq,
        ...(entry.event.time !== undefined ? { time: entry.event.time } : {}),
        data: stubData,
        ...(entry.event.surfaceOp !== undefined ? { surfaceOp: entry.event.surfaceOp } : {}),
        ...(entry.event.sourceEventSeqs !== undefined ? { sourceEventSeqs: [...entry.event.sourceEventSeqs] } : {}),
    };
    return {
        ...(entry.type !== undefined ? { type: entry.type } : {}),
        event: stubEvent,
    };
}
function withCompactedEventFields(entry, nextData, nextView, markTruncated) {
    const data = markTruncated && isPlainRecord(nextData)
        ? { ...nextData, truncated: true }
        : nextData;
    return {
        ...entry,
        event: {
            ...entry.event,
            data,
        },
        ...(entry.view !== undefined ? { view: nextView } : {}),
    };
}
function compactOversizedVirtualHistoryEntry(entry, availableRecordBytes, measureRecordBytes) {
    if (availableRecordBytes <= 0)
        return undefined;
    // Stage A: strip inline image payloads while retaining attachment metadata.
    const stageAState = { changed: false };
    const stageAData = stripInlineImagePayloads(entry.event.data, stageAState);
    const stageAView = entry.view === undefined ? undefined : stripInlineImagePayloads(entry.view, stageAState);
    const stageACandidate = stageAState.changed
        ? withCompactedEventFields(entry, stageAData, stageAView, true)
        : entry;
    if (stageAState.changed && measureRecordBytes(stageACandidate) <= availableRecordBytes) {
        return stageACandidate;
    }
    // Stage B: recursively cap payload strings and oversized arrays in event.data/view.
    for (const maxStringBytes of STAGE_B_STRING_BYTE_LIMITS) {
        const stageBState = { changed: false };
        const stageBData = compactValueForBudget(stageAData, maxStringBytes, stageBState);
        const stageBView = stageAView === undefined
            ? undefined
            : compactValueForBudget(stageAView, maxStringBytes, stageBState);
        if (!stageAState.changed && !stageBState.changed)
            continue;
        const candidate = withCompactedEventFields(entry, stageBData, stageBView, true);
        if (measureRecordBytes(candidate) <= availableRecordBytes) {
            return candidate;
        }
    }
    // Stage C: minimal transportable stub preserving identity/state and attachment summaries if they fit.
    const attachmentStubs = [];
    collectAttachmentStubs(entry.event.data, attachmentStubs);
    if (attachmentStubs.length > 0) {
        const stubWithAttachments = buildMinimalTransportableStub(entry, attachmentStubs);
        if (measureRecordBytes(stubWithAttachments) <= availableRecordBytes) {
            return stubWithAttachments;
        }
    }
    const minimalStub = buildMinimalTransportableStub(entry, []);
    if (measureRecordBytes(minimalStub) <= availableRecordBytes) {
        return minimalStub;
    }
    return undefined;
}
function positiveSafeInt(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
        ? value
        : undefined;
}
function isSurfaceAppendEvent(entry) {
    const { type, surfaceOp } = entry.event;
    return surfaceOp === 'append'
        && (type === 'user/message' || type === 'assistant/message' || type === 'tool/result');
}
export function utf8JsonByteLength(value) {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 0 : utf8Encoder.encode(serialized).byteLength;
}
export function normalizeVirtualHistoryTurnWindow(value) {
    if (value === undefined || value === null)
        return undefined;
    const direct = positiveSafeInt(value);
    if (direct !== undefined)
        return Math.min(direct, VIRTUAL_HISTORY_MAX_MESSAGES);
    if (!isPlainRecord(value))
        return undefined;
    const rawMinMessages = positiveSafeInt(value.minMessages);
    const rawMinTurns = positiveSafeInt(value.minTurns);
    const minMessages = rawMinMessages === undefined ? undefined : Math.min(rawMinMessages, VIRTUAL_HISTORY_MAX_MESSAGES);
    const minTurns = rawMinTurns === undefined ? undefined : Math.min(rawMinTurns, VIRTUAL_HISTORY_MAX_MESSAGES);
    if (minMessages === undefined && minTurns === undefined)
        return undefined;
    return {
        ...(minMessages === undefined ? {} : { minMessages }),
        ...(minTurns === undefined ? {} : { minTurns }),
    };
}
export function boundedVirtualHistoryMaxMessages(value, hasTurnWindow = false) {
    if (value !== undefined) {
        const clamped = Math.max(1, Math.floor(value));
        return Math.min(clamped, VIRTUAL_HISTORY_MAX_MESSAGES);
    }
    return hasTurnWindow ? VIRTUAL_HISTORY_MAX_MESSAGES : VIRTUAL_HISTORY_DEFAULT_MAX_MESSAGES;
}
function findTurnStartIndices(window, hasLeadingHistory) {
    const turnStarts = [];
    let hasExplicitTurnStart = false;
    for (let index = 0; index < window.length; index += 1) {
        if (window[index].event.type === 'turn/start') {
            hasExplicitTurnStart = true;
            turnStarts.push(index);
        }
    }
    if (hasExplicitTurnStart || hasLeadingHistory)
        return turnStarts;
    for (let index = 0; index < window.length; index += 1) {
        if (window[index].event.type === 'user/message') {
            turnStarts.push(index);
        }
    }
    return turnStarts;
}
function selectMessageLimitCutIndex(window, maxMessages, countSurfaceMessages) {
    if (!countSurfaceMessages) {
        return Math.max(0, window.length - maxMessages);
    }
    let messages = 0;
    let cutSeq = -Infinity;
    for (let index = window.length - 1; index >= 0; index -= 1) {
        const entry = window[index];
        if (!isSurfaceAppendEvent(entry))
            continue;
        messages += 1;
        if (messages >= maxMessages) {
            cutSeq = Math.min(entry.event.seq, ...(entry.event.sourceEventSeqs ?? []));
            break;
        }
    }
    if (cutSeq === -Infinity)
        return 0;
    for (let index = 0; index < window.length; index += 1) {
        if (window[index].event.seq >= cutSeq)
            return index;
    }
    return window.length;
}
function buildSuffixUnitCounts(window, countSurfaceMessages) {
    const suffix = new Int32Array(window.length + 1);
    for (let index = window.length - 1; index >= 0; index -= 1) {
        const weight = countSurfaceMessages ? (isSurfaceAppendEvent(window[index]) ? 1 : 0) : 1;
        suffix[index] = suffix[index + 1] + weight;
    }
    return suffix;
}
function selectTurnWindowCutIndex(window, turnStarts, turnWindow, maxMessages, countSurfaceMessages, hasLeadingHistory) {
    if (turnStarts.length === 0) {
        return selectMessageLimitCutIndex(window, maxMessages, countSurfaceMessages);
    }
    const targetMinTurns = typeof turnWindow === 'number'
        ? turnWindow
        : (turnWindow.minTurns ?? 1);
    const targetMinMessages = typeof turnWindow === 'number'
        ? 0
        : (turnWindow.minMessages ?? 0);
    const suffixUnits = buildSuffixUnitCounts(window, countSurfaceMessages);
    let turnsIncluded = 0;
    let cutIndex = window.length;
    for (let turnIndex = turnStarts.length - 1; turnIndex >= 0; turnIndex -= 1) {
        const candidateStart = turnStarts[turnIndex];
        const candidateUnits = suffixUnits[candidateStart];
        if (candidateUnits > maxMessages) {
            if (turnsIncluded === 0) {
                return selectMessageLimitCutIndex(window, maxMessages, countSurfaceMessages);
            }
            break;
        }
        cutIndex = candidateStart;
        turnsIncluded += 1;
        if (turnsIncluded >= targetMinTurns && candidateUnits >= targetMinMessages) {
            break;
        }
    }
    if (!hasLeadingHistory && cutIndex === turnStarts[0] && cutIndex > 0 && suffixUnits[0] <= maxMessages) {
        return 0;
    }
    return cutIndex;
}
export function selectVirtualHistorySlice(window, options = {}) {
    const maxBytes = options.maxBytes ?? VIRTUAL_HISTORY_MAX_BYTES;
    const hardMaxBytes = options.hardMaxBytes ?? Math.max(maxBytes, VIRTUAL_HISTORY_HARD_MAX_BYTES);
    const envelopeBytes = options.envelopeBytes ?? 0;
    if (window.length === 0) {
        if (envelopeBytes > hardMaxBytes) {
            throw new VirtualHistoryResponseTooLargeError(envelopeBytes, hardMaxBytes);
        }
        return { records: [], hasMore: false, cutIndex: 0 };
    }
    const turnWindow = normalizeVirtualHistoryTurnWindow(options.turnWindow);
    const countSurfaceMessages = options.countSurfaceMessages === true;
    const hasLeadingHistory = options.hasLeadingHistory === true;
    const maxMessages = boundedVirtualHistoryMaxMessages(options.maxMessages, turnWindow !== undefined);
    const turnStarts = turnWindow === undefined ? [] : findTurnStartIndices(window, hasLeadingHistory);
    let cutIndex = turnWindow === undefined
        ? selectMessageLimitCutIndex(window, maxMessages, countSurfaceMessages)
        : selectTurnWindowCutIndex(window, turnStarts, turnWindow, maxMessages, countSurfaceMessages, hasLeadingHistory);
    const measureRecordBytes = options.measureRecordBytes ?? (entry => utf8JsonByteLength(entry));
    let totalBytes = envelopeBytes;
    let byteCutIndex = window.length;
    let trimmedByBytes = false;
    for (let index = window.length - 1; index >= cutIndex; index -= 1) {
        const entry = window[index];
        const entryBytes = measureRecordBytes(entry) + (byteCutIndex < window.length ? 1 : 0);
        if (byteCutIndex < window.length && totalBytes + entryBytes > maxBytes) {
            trimmedByBytes = true;
            break;
        }
        if (byteCutIndex === window.length && totalBytes + entryBytes > hardMaxBytes) {
            const availableRecordBytes = hardMaxBytes - totalBytes;
            const compacted = availableRecordBytes > 0
                ? compactOversizedVirtualHistoryEntry(entry, availableRecordBytes, measureRecordBytes)
                : undefined;
            if (compacted === undefined) {
                throw new VirtualHistoryResponseTooLargeError(totalBytes + entryBytes, hardMaxBytes);
            }
            return {
                records: [compacted],
                hasMore: index > 0,
                cutIndex: index,
            };
        }
        totalBytes += entryBytes;
        byteCutIndex = index;
    }
    if (trimmedByBytes) {
        cutIndex = byteCutIndex;
        if (turnWindow !== undefined && turnStarts.length > 0 && !turnStarts.includes(cutIndex)) {
            const nextTurnStart = turnStarts.find(start => start > cutIndex && start < window.length);
            if (nextTurnStart !== undefined) {
                cutIndex = nextTurnStart;
            }
        }
    }
    return {
        records: window.slice(cutIndex),
        hasMore: cutIndex > 0,
        cutIndex,
    };
}
//# sourceMappingURL=virtual-history-pagination.js.map