/**
 * ds-bot group rounds are conversation content, not tool diagnostics: one
 * `JSON.stringify({ replies, passed, failed? })` tool result carries every
 * Bot's spoken reply for the round. The generic compact projection would cut
 * that at 512 characters, which loses whole replies — the client can only
 * recover entries that close before the cut, so one long reply hides the
 * entire round and the conversation collapses into tool activity.
 *
 * Keeping the recognised shape as a bounded structural projection preserves the
 * reply contract while the frame stays small. This module is shape-only on
 * purpose: it whitelists primitive fields and never interprets `kind`, so the
 * client remains the semantic authority for reply presentation.
 */
const HEADER = '{"replies"';
const LIMITS = Object.freeze({
    /** How far into the detail the payload header may appear. */
    scan: 4096,
    /** Never attempt structural work on an absurdly large detail. */
    source: 1024 * 1024,
    /** Replies kept per round, in their original order. */
    entries: 32,
    /** Spoken text kept per reply. */
    text: 2048,
    /** Identifier/label fields kept per reply. */
    label: 256,
    /** Serialized projection ceiling for one round. */
    payload: 8 * 1024,
});
export const COMPACT_BOT_ROUND_LIMITS = LIMITS;
/** Fields a reply entry may carry; `time` is the only numeric one. */
const REPLY_FIELDS = ['botId', 'name', 'text', 'kind', 'via', 'code', 'status', 'time'];
const LABEL_FIELDS = new Set(['botId', 'name', 'kind', 'via', 'code', 'status']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/**
 * Project one tool detail to a bounded group-round payload, or `undefined` when
 * the text does not carry the ds-bot round contract (the caller keeps its own
 * ordinary truncation). Never throws: compact history is a read-only projection,
 * so a malformed detail must stay on the generic path.
 */
export function compactBotRound(text) {
    if (typeof text !== 'string' || text.length === 0 || text.length > LIMITS.source)
        return undefined;
    const start = text.indexOf(HEADER);
    if (start < 0 || start > LIMITS.scan)
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(text.slice(start));
    }
    catch {
        return undefined;
    }
    if (!object(parsed) || !Array.isArray(parsed.replies))
        return undefined;
    const source = parsed.replies;
    if (source.length === 0)
        return undefined;
    const replies = [];
    let truncated = parsed.truncated === true;
    for (const entry of source) {
        if (replies.length >= LIMITS.entries) {
            truncated = true;
            break;
        }
        if (!object(entry))
            continue;
        const reply = {};
        for (const field of REPLY_FIELDS) {
            const value = entry[field];
            if (field === 'time') {
                if (typeof value === 'number')
                    reply.time = value;
            }
            else if (typeof value === 'string') {
                const limit = LABEL_FIELDS.has(field) ? LIMITS.label : LIMITS.text;
                if (value.length > limit) {
                    reply[field] = value.slice(0, limit);
                    truncated = true;
                }
                else
                    reply[field] = value;
            }
        }
        // Entries without spoken text or a status kind cannot render; the client
        // drops them too, so they must not consume the payload budget.
        if (reply.text === undefined && reply.kind === undefined)
            continue;
        replies.push(reply);
    }
    if (replies.length === 0)
        return undefined;
    const envelope = { replies };
    if (typeof parsed.passed === 'number')
        envelope.passed = parsed.passed;
    if (typeof parsed.failed === 'number')
        envelope.failed = parsed.failed;
    const serialize = (cut) => JSON.stringify(cut ? { ...envelope, truncated: true } : envelope);
    let json = serialize(truncated);
    // One reply is always below the payload ceiling because every string field is
    // capped above, so dropping trailing replies terminates on its own.
    while (json.length > LIMITS.payload && replies.length > 1) {
        replies.pop();
        truncated = true;
        json = serialize(true);
    }
    return json.length > LIMITS.payload ? undefined : json;
}
//# sourceMappingURL=compact-bot-round.js.map