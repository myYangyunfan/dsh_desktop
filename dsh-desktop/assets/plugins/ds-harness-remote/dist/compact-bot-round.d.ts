export declare const COMPACT_BOT_ROUND_LIMITS: Readonly<{
    /** How far into the detail the payload header may appear. */
    scan: 4096;
    /** Never attempt structural work on an absurdly large detail. */
    source: number;
    /** Replies kept per round, in their original order. */
    entries: 32;
    /** Spoken text kept per reply. */
    text: 2048;
    /** Identifier/label fields kept per reply. */
    label: 256;
    /** Serialized projection ceiling for one round. */
    payload: number;
}>;
/**
 * Project one tool detail to a bounded group-round payload, or `undefined` when
 * the text does not carry the ds-bot round contract (the caller keeps its own
 * ordinary truncation). Never throws: compact history is a read-only projection,
 * so a malformed detail must stay on the generic path.
 */
export declare function compactBotRound(text: string): string | undefined;
//# sourceMappingURL=compact-bot-round.d.ts.map