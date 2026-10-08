/**
 * M5 — durable region transaction and the log-rebuilt block ledger.
 *
 * Modeled on `dsh-compaction-basic/src/region.ts` (which is package-internal
 * and not exported by the seam): validate the surface range and tool-call/result
 * pairing, take the durable `compaction/start` lock, record `compaction/summary`
 * as the shadow price, land the `user/message` surface replacement carrying the
 * summary under `compactCheckpointSource`, and release the lock with
 * `compaction/end`. The original events stay in the append-only log, so
 * decompress/search/status can rebuild everything from the log.
 * @module billion-context-dsh/region
 */
import type { Session, SessionEvent, SessionEventMap } from '@deepseek-ai/dsh-session';
import { type ContentBlock } from '@deepseek-ai/dsh-llm';
import { type AcpBlockLedgerPayload } from './block-ledger.ts';
/** One durable ACP block as rebuilt from the session log. */
export interface AcpBlockLedgerEntry {
    /** The compaction transaction id (stable block identity). */
    readonly blockId: string;
    readonly summary: string;
    /** The block's short label (kernel `CompressionBlock.topic`), when the compress request carried one. */
    readonly topic?: string;
    readonly shadowedSeqs: readonly number[];
    readonly shadowedTokenCount: number;
    readonly start: number;
    readonly end: number;
    /** Compression tier: 1 (message range), 2 (distills tier-1 blocks), 3 (distills tier-2 blocks). Legacy blocks default to 1. */
    readonly tier: 1 | 2 | 3;
    /** Compaction ids of the blocks this block distilled (parents). Empty for tier-1 blocks. */
    readonly parentBlockIds: readonly string[];
    /** The acp-kernel block id (`bN`) created for this transaction — absent for legacy blocks (synthesised by order). */
    readonly kernelBlockId?: string;
    /** The surface seq of this block's checkpoint summary node (derived from the log; null when the node is gone). */
    readonly summarySeq?: number;
    /** The kernel block's raw direct/effective message ids at creation (recorded since the tier feature; absent for legacy). */
    readonly directMessageIds?: readonly string[];
    readonly effectiveMessageIds?: readonly string[];
    /** B3: acceptance readings that were already green before compression (absent when the compress call carried none). */
    readonly verifiedReadings?: readonly string[];
    /** Unix epoch ms of the compaction/summary event. */
    readonly createdAt: number;
}
/** The open turn number, or null when the log ends between turns. */
export declare function findOpenTurn(events: readonly SessionEvent[]): number | null;
/**
 * Reject a second concurrent compaction for the same session.
 *
 * Compaction is synchronous and a session is single-writer, so a
 * `compaction/start` with NO matching `compaction/end` in the durable log can
 * only be a stale leftover from a prior run that died mid-write (a hard kill,
 * not a caught throw — every caught throw is paired with a compensating
 * `compaction/end` in runCompactionTransaction). Such a leftover must NOT
 * permanently block every later compress call: this treats it as stale,
 * surfaces it once, and lets a new compaction proceed. The old "already
 * active" throw only fired when a genuine concurrent compaction existed,
 * which the synchronous single-writer premise makes impossible.
 */
export declare function assertNoActiveCompaction(events: readonly SessionEvent[]): void;
/**
 * A requested range whose EVERY live message was already shadowed by one or
 * more blocks. The compress tool catches this and reports the range as already
 * compressed (with the covering block ids) instead of folding block summary
 * nodes as plain messages or erroring out. Distillation stays an explicit act:
 * target a LIVE checkpoint seq directly to distill (tier 2/3).
 */
export declare class AlreadyCompressedRangeError extends Error {
    readonly start: number;
    readonly end: number;
    readonly coveringBlockIds: readonly string[];
    constructor(start: number, end: number, coveringBlockIds: readonly string[]);
}
export interface ResolvedSurfaceRange {
    readonly start: number;
    readonly end: number;
    /**
     * True when the requested edges were not on the current surface and were
     * remapped to the still-live content of the requested span (an earlier
     * compression shadowed them). Callers surface this so the model sees what
     * was actually compressed instead of silently shadowing a different span.
     */
    readonly recovered?: boolean;
}
/**
 * Validate one inclusive surface span and adjust its edges to a
 * tool-pairing-balanced range whose boundaries anchor (bare-`${seq}` ref,
 * multi-call sub-id, or empty-result fallback — see anchorsRangeEdge,
 * issue #155). Reversed ranges throw. An edge that sits inside a
 * tool-call/result pair is first nudged inward to the nearest clean cut; if
 * that collapses the range (e.g. the model asked for a SINGLE tool result,
 * which can never be balanced alone), the range EXPANDS outward to the
 * enclosing clean pair instead — a lone tool message is almost always a
 * "consumed output" the model genuinely wants to compress. The returned range
 * is what a caller should actually shadow.
 *
 * Missing edges are NOT an immediate error: the seqs were probably shadowed by
 * an earlier compression (stale nudge table / old compress result). The span
 * is rebuilt from its still-live remainder via recoverStaleRange — a fully
 * shadowed span throws AlreadyCompressedRangeError, a genuinely unknown edge
 * throws the not-in-surface guidance error. The returned range is what a
 * caller should actually shadow.
 */
export declare function resolveSurfaceRange(session: Session, start: number, end: number): ResolvedSurfaceRange;
/** The surface seqs shadowed by the inclusive positional span. */
export declare function shadowedSeqsOf(session: Session, start: number, end: number): number[];
export interface CompactionTransactionInput {
    readonly start: number;
    readonly end: number;
    readonly shadowedSeqs: readonly number[];
    readonly summary: ContentBlock[];
    readonly shadowedTokenCount: number;
    readonly provider: string;
    readonly model: string;
    /** Short block label (kernel `CompressionBlock.topic`) — persisted so a restarted engine rehydrates it. */
    readonly topic?: string;
    /** Compression tier of this block (default 1). */
    readonly tier?: 1 | 2 | 3;
    /** The acp-kernel block id (`bN`) created by the kernel for this transaction. */
    readonly kernelBlockId?: string;
    /** Compaction ids of the blocks distilled into this one. */
    readonly parentBlockIds?: readonly string[];
    /** The kernel block's direct/effective message ids (raw CoreMessage ids) — recorded for faithful rehydration. */
    readonly directMessageIds?: readonly string[];
    readonly effectiveMessageIds?: readonly string[];
    /** B3：压缩前已绿的验收读数（结构化，压缩后仍可读）。 */
    readonly verifiedReadings?: readonly string[];
}
type CompactionSummaryData = SessionEventMap['compaction/summary'];
/**
 * Read a `compaction/summary` event's data. The six ACP tier/lineage fields are
 * no longer top-level members (issue #141): post-fix writers carry them in the
 * admitted optional `rawOutput` member (decode via {@link decodeAcpBlockLedger}),
 * while logs written by pre-fix engines still carry them as top-level members —
 * so the returned type also intersects with {@link AcpBlockLedgerPayload}, letting
 * readers fall back to the legacy shape. Never `any`.
 */
export declare function readCompactionSummary(event: SessionEvent): CompactionSummaryData & AcpBlockLedgerPayload;
/**
 * B3: read the structured verified readings a compress call recorded for this
 * block (acceptance checks that were already green before the range was
 * shadowed — e.g. "t0-fastpath 8/8"). Post-fix writers carry them inside the
 * admitted `rawOutput` member (AcpBlockLedgerPayload); legacy writers put them
 * top-level. Absent in either shape → empty array; never throws.
 */
export declare function verifiedReadingsOf(event: SessionEvent): string[];
/**
 * B1：给摘要块数组的第一个文本块加标源前缀（幂等——已带前缀不重复加）。
 * 只动文本块，工具/图片块原样保留。
 */
export declare function prefixSummaryBlocks(blocks: readonly ContentBlock[]): ContentBlock[];
/**
 * Run one durable compression transaction. Throws on invalid state; on success
 * the four events are in the log and the surface has one summary node.
 */
export declare function runCompactionTransaction(session: Session, input: CompactionTransactionInput): {
    compactionId: string;
    seqs: number[];
};
/** Rebuild the block ledger from the durable log (no kernel state needed). */
export declare function rebuildBlockLedger(events: readonly SessionEvent[]): AcpBlockLedgerEntry[];
/** One self-computed compressible span of the current surface. */
export interface SeqCompressibleRange {
    readonly start: number;
    readonly end: number;
    readonly count: number;
    readonly tokens: number;
    /** Share of messages that are tool messages (tool-call or tool-result), 0-100 — kernel `toolPct` parity. */
    readonly toolPct: number;
    /** Image blocks reachable inside the span (directly or through a tool result). */
    readonly images: number;
    /** File blocks reachable inside the span. */
    readonly files: number;
}
/**
 * Per-seq provider-anchored price for non-text blocks (see `mediaPriceViaMeter`
 * in host-tokens.ts). A callback, not a map, so a media-free session never pays
 * for a meter measurement: the range walk only asks about seqs it already knows
 * carry an image/file block.
 */
export type MediaPriceOf = (seq: number) => number;
/**
 * Durable model-free prune: append `compaction/prune` as the shadow price,
 * then replace the given surface seqs with a user message. dsh-session 0.1.5+
 * allows only user/message (and system/message) replacements to cite source
 * events — assistant/message FORBIDS `sourceEventSeqs` because it embeds its
 * own provider stream — so there is no invisible replacement node anymore:
 * every hidden span becomes a user message. Callers with meaningful text pass
 * it (compress call/result hiding keeps the tool outcome visible to the
 * model); callers without get the fixed prune note. The originals remain in
 * the append-only log.
 */
export declare const PRUNE_NOTE = "(removed by context management)";
/**
 * Hide one successful `compress` tool's call/result pair after its tool/result
 * has been logged. The durable compaction summary is inserted BEFORE the
 * current tool result (the compress tool runs mid-turn), so leaving the pair on
 * the surface would produce `assistant(tool_calls) → user(summary) →
 * tool(result)` — rejected by strict providers. Replacing both nodes with a
 * plain user message (the result text) removes the pair from the derived
 * surface without touching the compaction block.
 */
export declare function hideCompressToolPair(session: Session, callId: string, resultSeq?: number): boolean;
/**
 * Surface-level orphan cleanup: hide tool/result nodes with no matching call,
 * assistant tool-call nodes whose calls all lack results, and "broken pairs"
 * whose result is NOT adjacent to the call node on the surface (a
 * non-tool/result node — typically the compaction summary a buggy older
 * version inserted between a compress call and its result — sits between
 * them). A single orphan result corrupts the whole tool-pairing balance cache
 * (every range resolve throws), orphan calls fragment large ranges into tiny
 * uncompressed fragments, and a broken pair cannot serialize for strict
 * providers — the mechanisms behind issue #18's "only ~28 tokens visible".
 * Uses the same durable prune protocol as `hideSurfaceSeqs`, so the removed
 * nodes stay recoverable from the append-only log.
 */
export declare function stripOrphanedSurfaceToolMessages(session: Session, inFlightCallIds?: ReadonlySet<string>): number;
/**
 * All tool-call ids currently visible on the surface with no matching
 * tool/result yet — the in-flight calls of the current step. Sibling tools
 * called in the same assistant message as `compress` are in-flight too, so
 * `handleCompress` must protect the whole set (not just its own call id) or
 * the sibling call would be pruned as an orphan and its result would land
 * orphaned (HTTP 400 until the next cleanup).
 */
export declare function openToolCallIds(session: Session): Set<string>;
/**
 * Schedule `hideCompressToolPair` on the microtask queue. `session.append`
 * is NOT reentrant: running it synchronously inside a `session/event`
 * listener (while the outer append is still publishing) throws "session
 * append cannot reenter while another append is being published" on live,
 * store-attached sessions, and the dispatcher silently swallows the error —
 * so a synchronous hide is a silent no-op in production. A microtask drains
 * after the current append fully publishes and before the agent loop resumes,
 * so the pair is hidden before the next request is built.
 */
export declare function deferCompressPairHide(session: Session, callId: string, resultSeq: number, onError?: (error: unknown) => void): void;
/**
 * Newest AGENTS.md instruction row per scope (source file). The host
 * re-injects a file's instructions when its CURRENT copy is absent from the
 * surface (deepseek-harness packages/context/agent-instructions presence
 * gate, index.ts:137/:163 — presence+identity, not payload diff), so
 * compressing the newest row of a scope makes that file come straight back,
 * while compressing a STALE copy of the same file is silent. Live-audited
 * shape (session-f25e4fad): EVERY injection row — baseline and worktree —
 * carries `source.changes[].scope` = `"<dir>\u0000<file>"` (root
 * `.\u0000AGENTS.md`, worktree `worktrees/<name>\u0000AGENTS.md`), which is
 * stable across config tweaks unlike `baselineIdentity`. Tail-scan the log,
 * group by scope, keep the last seq of each group. O(events), mirrors
 * indexWatermarkOf. Rows without `changes[]` (legacy shapes) are SKIPPED
 * entirely: identity is what the host's presence gate needs in order to
 * re-inject a file, so a scope-less row can never come back and must not be
 * guarded (the earlier shape gave each its own group, which made every legacy
 * row a permanent hard-reject — issue #71 review S3).
 */
export declare function newestInstructionSeqsOf(session: Session): Set<number>;
/**
 * Surface seqs NO caller may compress: the CURRENT (newest) injected
 * agent-instructions row of every scope, restricted to rows still visible on
 * the surface (one definition of "current" — `newestInstructionSeqsOf`).
 * `buildCompressibleSeqRanges` never OFFERS them, and both compress entry
 * points (`handleCompress` in src/tools.ts, `/acp-prune compress` in
 * src/commands.ts) probe the RESOLVED span against this set and HARD-REJECT a
 * covering range before the kernel applies it, so nothing durable lands and no
 * phantom block can exist. This supersedes the earlier F7 draft (warn only):
 * folding a current copy reclaims nothing — the host re-injects it — so there
 * is no legitimate outcome to warn about. Deliberately NARROW (issue #71
 * review F4): only CURRENT agent-instructions rows — the audited loop driver.
 * Engine-authored metadata rows (nudge echo, compress-pair stub) stay
 * foldable like main, and STALE copies of the same file stay compressible —
 * removing them while the newest copy stays visible is the real cleanup.
 */
export declare function guardedSurfaceSeqsOf(session: Session): Set<number>;
/**
 * The kernel's own view of what can be compressed, as the engine hands it to
 * the range table: the geometry (`nudge.compressibleRanges`) plus the ref map
 * that turns a kernel ref back into a surface seq (`state.messageRefs`).
 *
 * Structural shapes only, so the engine passes the kernel's own objects
 * straight through and tests can hand-build a view.
 */
export interface KernelRangeView {
    /** Kernel `recommendedRanges`/`compressibleRanges` entries (oldest first). */
    readonly ranges: readonly {
        readonly startRef: string;
        readonly endRef: string;
    }[];
    /** Kernel ref map: `mNNNNN` → our message id (which IS the surface seq). */
    readonly refs: {
        readonly byRef: Readonly<Record<string, string>>;
    };
}
/**
 * Compressible spans in the DSH seq dialect, for the nudge range table.
 *
 * The GEOMETRY — which messages group into one compressible span — comes from
 * the kernel's own ranges (design decision 7: the kernel owns the algorithm).
 * The kernel splits a group when the next message is a user turn and the group
 * already holds 3+ messages, and after any protected or already-compressed
 * message, so a row reads as "roughly one stretch of work" rather than an
 * arbitrary slice. This function only does the two jobs the kernel cannot:
 *
 * 1. Translate refs into surface seqs — DSH has no `<acp>` ref tags; seq is our
 *    ref (design decision 2).
 * 2. Apply the host guards on top of the kernel's grouping: injected
 *    instruction rows split a span and the newest copy of every scope is never
 *    offered, checkpoints and the surface's system node are not compressible,
 *    and the recent tail plus the last REAL user turn stay protected (rule 16).
 *
 * History — why this used to compute the spans itself. A kernel range's edges
 * were derived by counting refs, and a surface replacement breaks that
 * arithmetic: the checkpoint node of a replace lands mid-array carrying a much
 * higher ref, so ref order and array order diverge and the spans came back
 * reversed (`end < start`) or lost large tool results entirely. The table was
 * therefore self-computed from the surface, labeled `UPSTREAM:` and tracked as
 * issue #38 (rule 11). The pinned kernel segments by ARRAY adjacency instead
 * (upstream #207) and the drift is gone — measured on a session whose
 * compressed span sits in the MIDDLE of the surface: every ref resolves to the
 * right seq, no span crosses the shadowed hole, and the compressed span is
 * excluded. Rules 3 and 11 are updated with it.
 */
export declare function buildCompressibleSeqRanges(session: Session, kernelView: KernelRangeView, opts?: {
    preserveRecent?: number;
    mediaPriceOf?: MediaPriceOf;
}): SeqCompressibleRange[];
/**
 * A compact human-readable description of the current surface for the model:
 * node count plus the first/last message seqs. Surface seqs are sparse (the
 * event log interleaves non-message events and expanded delta batches), so a
 * model that never saw the nudge range table — e.g. low-pressure sessions
 * where no nudge fires — cannot guess its own seq space. acp_status and the
 * nudge's range table both surface this so compress edges can be located
 * without blind probing.
 */
export declare function surfaceSummary(session: Session): string;
/** One block as seen by the tier machinery: durable id ↔ kernel ref (`bN`). */
export interface AcpBlockRegistryEntry {
    /** The durable compaction id. */
    readonly blockId: string;
    /** The acp-kernel block ref (`bN`); synthesised by log order for legacy blocks. */
    readonly kernelBlockId: string;
    readonly tier: 1 | 2 | 3;
    /** The surface seq of this block's checkpoint summary node (null when gone). */
    readonly summarySeq: number | null;
    /** True until a LATER block distills this one. Only active blocks are distillable. */
    readonly active: boolean;
    readonly parentBlockIds: readonly string[];
}
/**
 * Rebuild the compactionId ↔ kernel-block-ref registry from the durable log.
 * Legacy blocks (pre-tier, no recorded `kernelBlockId`) are synthesised as
 * `b1`, `b2`, … in log order; recorded ids are kept as-is. A block is active
 * until a later block lists it as a parent.
 */
export declare function blockRegistry(session: Session): AcpBlockRegistryEntry[];
/**
 * The kernel block ref (`bN`) for a surface seq, when that seq is the
 * checkpoint summary node of a block — the edge the model must use to
 * distill (T2/T3). Active blocks distill; a stale (already-distilled) node
 * still maps to its `bN` so the kernel reports "already compressed" instead
 * of silently folding the summary as a plain message. Returns null for
 * anything else (plain messages, non-checkpoint nodes).
 */
export declare function blockRefForSummarySeq(session: Session, seq: number): string | null;
/** The durable compaction ids distilled by the given kernel block refs (`bN`). */
export declare function compactionIdsOfKernelBlocks(session: Session, kernelBlockIds: readonly string[]): string[];
/**
 * Resolve a kernel block ref (`bN`) — as shown by the model tool `acp_status`
 * (kernel `buildStatusReport` renders `block.blockId`) — to the durable
 * compaction id the decompress/search tools accept. Returns null when `bN` is
 * not an exact registry key (unknown ref). Only matches the canonical `bN`
 * form (`/^b\d+$/`); anything else is not a kernel ref and returns null so the
 * caller falls back to its compaction-id prefix match.
 */
export declare function blockIdOfKernelRef(session: Session, kernelRef: string): string | null;
/** The checkpoint summary seq of an ACTIVE kernel block (`bN`), or null. */
export declare function summarySeqOfKernelBlock(session: Session, kernelBlockId: string): number | null;
/**
 * The shadowed seqs of a block, recursing into distilled parent blocks: a
 * tier-2 block shadows its parent's checkpoint node, so recovering its
 * originals requires expanding that node into the parent block's own shadowed
 * seqs. Cycle-safe (a block can never be its own ancestor).
 */
export declare function expandShadowedSeqs(session: Session, blockId: string): number[];
/**
 * Default decompress page size (#112): a block shadowing hundreds of
 * messages used to be returned whole in ONE tool result — big enough to
 * flood the context window or get silently trimmed by the host's
 * tool-result pruner before the model ever saw the tail. One page per call
 * keeps every recovery usable; `offset` walks the rest.
 *
 * A page is bounded by BOTH this message count and a rendered-character
 * budget ({@link DEFAULT_DECOMPRESS_PAGE_CHARS}). Count alone was not enough:
 * the host's `dsh-compaction-tool-result-pruner` (docs/dsh-porting-analysis.md)
 * trims by CHARACTERS (thresholdChars 8192), so a wide page of long messages
 * still crossed that line and had its middle dropped. The char bound keeps an
 * ordinary page under the pruner threshold so it comes back intact; the
 * message count doubles as a hard ceiling so a pathological `limit` can't
 * re-open the whole-block flooding half of #112.
 */
export declare const DEFAULT_DECOMPRESS_PAGE = 100;
/**
 * Rendered-character budget per decompress page (#112). Kept below the host's
 * tool-result pruner threshold (8192, docs/dsh-porting-analysis.md) with
 * headroom for the block header, the `[seq N]` prefixes, and the continue hint,
 * so a normal page survives intact instead of middle-trimmed. Deliberately NOT
 * tied to acp-kernel's `config.truncate.threshold`: that knob truncates a single
 * oversized tool output during compression, whereas the host pruner trims our
 * whole decompress result — different mechanisms, different thresholds.
 */
export declare const DEFAULT_DECOMPRESS_PAGE_CHARS = 7000;
export interface DecompressPage {
    /** Requested offset floored to >= 0; reported as-is when it lands past the end. */
    offset: number;
    /** Limit actually applied (clamped to [1, DEFAULT_DECOMPRESS_PAGE]). */
    limit: number;
    /** Total shadowed messages in the block (tier-expanded). */
    total: number;
    /** This page's shadowed seqs, in expansion order. */
    seqs: number[];
    /** True when no further page follows this one. */
    exhausted: boolean;
}
/**
 * Slice a block's expanded shadowed-seq list into one page. A page holds at most
 * `limit` messages AND at most `charBudget` rendered characters, where
 * `renderLen(seq)` reports each message's on-the-wire length (0 when it carries
 * no text). Seqs whose original carries no text still occupy a slot, so `offset`
 * stays a stable continuation index across calls while the log is frozen.
 * Out-of-range / negative / non-finite values clamp instead of failing (optional
 * convenience params, not semantic boundaries); non-numeric input falls back to
 * the default rather than leaking NaN into the result. The first message of the
 * page is always included even if it alone exceeds the budget, so a walk always
 * makes progress past a single giant message.
 */
export declare function sliceDecompressPage(expanded: number[], offset: number, limit: number, charBudget: number, renderLen: (seq: number) => number): DecompressPage;
export {};
