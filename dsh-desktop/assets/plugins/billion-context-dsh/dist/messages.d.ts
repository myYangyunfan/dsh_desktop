/**
 * M1 — session-log projection: DSH surface events → acp-kernel CoreMessage.
 *
 * The ACP kernel is message-array based; DSH is event-log based. This module
 * is the bridge in the direction the engine needs (projectEvent /
 * eventsToCoreMessages). The reverse direction (CoreMessage[] → session
 * appends) is the M5 region transaction's job.
 * Mirrors billion-context-pi's `projectMessage`/`entriesToCoreMessages`
 * against DSH event shapes (see V-verification: SurfaceEventType =
 * 'user/message' | 'assistant/message' | 'tool/result').
 * @module billion-context-pi-dsh/messages
 */
import type { CoreMessage } from 'acp-kernel';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        acpNudge: {
            kind: 'plugin:acp-nudge';
        };
        acpPrune: {
            kind: 'plugin:billion-context-dsh';
        };
        compactCheckpoint: {
            kind: 'compact-checkpoint';
            compactionId: string;
            sourceCommandId?: string;
        };
    }
}
/**
 * Extract plain text from a DSH content block array or string.
 *
 * Recursive: a real DSH `tool-result` block is `{ type: 'tool-result',
 * toolCallId, content: ContentBlock[] }` — the inner `content` array holds
 * the actual `text` blocks, so a top-level-only walk would drop every tool
 * result from the projection (and with it the seq's ref assignment, breaking
 * compress boundary resolution). Nested arrays are flattened depth-first.
 *
 * That nesting is the PRE-0.2.0 shape. On the 0.2.0 seam line a tool result is
 * a first-class ToolResultMessage whose content blocks are plain
 * text/image/file blocks — nothing to unwrap — so the recursive branch simply
 * finds the text one level up. It stays because this engine supports every
 * line in its declared peer range, and a top-level-only walk would silently
 * drop text on the older ones.
 *
 * Non-text blocks that the provider still bills for render as a deterministic
 * one-line placeholder instead of vanishing (issue #117). An `image`/`file`
 * block used to contribute nothing, which silently made a picture-only user
 * message — or a tool result carrying a screenshot — invisible to the engine:
 * no ref (so no compress boundary), `anchorsRangeEdge` false (so the range
 * solver shrank past it and swallowed neighbours), invisible to the kernel's
 * recent/last-user protection (so the last real user turn could be compressed
 * away), priced at zero tokens, and absent from search/decompress output. The
 * host itself projects non-text references to deterministic handle text for
 * files ("request assembly projects every occurrence to deterministic handle
 * text", dsh-llm/lib/types/types.d.ts), and this is the same idea one layer
 * down. Only durable attachment metadata is used, so the placeholder is stable
 * across turns (cache prefix, summary text, search hits).
 */
export declare function extractText(content: unknown): string;
interface ToolCallBlock {
    type: 'tool-call';
    id?: string;
    name?: string;
    arguments?: unknown;
}
/**
 * The tool-call blocks of one assistant content array, in CONTENT order.
 * Shared with the range-edge layer (src/region.ts `anchorsRangeEdge`,
 * src/tools.ts `edgeRefForSeq`): projection order IS this order (projectEvent
 * maps the calls in sequence), so "the node's first/last sub-message id" is
 * derivable from it without re-implementing the filter anywhere else.
 */
export declare function toolCallsOf(content: unknown): ToolCallBlock[];
/**
 * The tool-call id of one tool/result surface message, or null.
 *
 * Three durable locations, in priority order (hard-won rule 10): the
 * MESSAGE-level `toolCallId` field (written by dsh-llm's createToolResultMessage
 * on the 0.1.7+ lines), the nested `{ type: 'tool-result', toolCallId }`
 * content block, then `message.source.callId` (present on every line). A real
 * event carries at least two of the three; the order only matters for
 * fixtures that set a subset. Shared with `src/region.ts`'s call/result
 * pairing — one implementation, never a copy.
 */
export declare function toolCallIdOfResultEvent(event: SessionEvent): string | null;
/**
 * Index of assistant tool-call `id` → tool `name`, used to attribute
 * tool/result messages to their tool. Real DSH tool-results carry no
 * `message.toolName` (rule 10), so the projection backfills it from the
 * matching assistant tool-call. Scans ALL events up front (order-independent:
 * a result may precede its call in the array) and covers shadowed calls too.
 */
export declare function buildToolCallIndex(events: readonly SessionEvent[]): ReadonlyMap<string, string>;
/**
 * Project one surface message event into CoreMessage(s).
 *  - user/message      → user text (verbatim content)
 *  - assistant/message → assistant text, or one CoreMessage per tool-call
 *  - tool/result       → tool result (role 'tool'); toolName/toolCallId are
 *                        backfilled from `toolNames` (assistant tool-call
 *                        index) — real DSH events do not carry them at the
 *                        message level. Without an index the result stays
 *                        untagged (`toolName: ''`), never "text".
 * Non-surface events project to nothing.
 */
/**
 * B1 summary source framing. A compaction summary is MODEL-WRITTEN text, not
 * user words — injected as a user/message with the same standing as real input,
 * which let obligation sentences inside summaries read as user directives and
 * the model's own guesses read as user commitments. The frame says both things
 * up front. It is applied at creation (src/region.ts writes the framed blocks
 * to BOTH durable writes) and again at projection (below) as an idempotent
 * safety net for legacy blocks written before the feature.
 */
export declare const SUMMARY_FRAME_PREFIX = "[Model-written summary \u2014 not user words; re-verify any obligations before relying on them]";
export declare function withSummaryFramePrefix(text: string): string;
/**
 * The lead-in of a summary the ENGINE writes itself — today only the
 * context-overflow emergency marker (src/index.ts `compactForOverflow`).
 * Recognition is by content, not by caller: the writer and both framing sites
 * share this ONE literal.
 */
export declare const ENGINE_SUMMARY_LEAD = "[engine-written summary \u2014 context-overflow emergency compaction";
export declare function isEngineWrittenSummary(text: string): boolean;
/**
 * The block summary the automatic overflow recovery writes. It is the engine's
 * own note — not model-written text, not user words — saying which range was
 * hidden to get the request under the window and where the originals still
 * live (the append-only log: search_context/decompress rebuild from it).
 */
export declare function overflowMarkerSummary(hiddenCount: number): string;
/**
 * Kernel block id per compaction id, read from the durable block ledger.
 *
 * The kernel needs the block id on every host-carried checkpoint message:
 * `CoreMessage.summaryOfBlockId` tells it that this message is the host's own
 * rendering of a compression block, so a PLAIN message-ref range does not
 * supersede that block — the kernel keeps the carrier visible and says so in
 * its warning list (upstream #335, adopted with the 0.0.101 pin). A carrier of
 * an inactive or unknown block folds normally, so an absent/legacy id degrades
 * to the pre-#335 behavior instead of over-protecting.
 *
 * The join key (the `compaction/summary` `compactionId`) and the two accepted
 * field locations (rawOutput-embedded payload, then the legacy top-level
 * member) mirror `rebuildBlockLedger` in src/region.ts. That twin cannot be
 * called from here: the region layer imports this module, so the dependency
 * would cycle. `tests/checkpoint-span.test.ts` pins the two in lockstep.
 */
export declare function kernelBlockIdByCompactionId(events: readonly SessionEvent[]): ReadonlyMap<string, string>;
export declare function projectEvent(event: SessionEvent, toolNames?: ReadonlyMap<string, string>, kernelBlockIds?: ReadonlyMap<string, string>): CoreMessage[];
/** Project a session's message events into CoreMessage[] in log order. */
export declare function eventsToCoreMessages(events: readonly SessionEvent[], toolNames?: ReadonlyMap<string, string>): CoreMessage[];
/** The surface-visible message events of a session, in model-visible order. */
export declare function surfaceEventsOf(session: Session): SessionEvent[];
/**
 * ALL message-type events in log order — the visible surface PLUS everything
 * shadowed by compression. The ACP kernel deactivates any block whose consumed
 * message ids are absent from the array it is given (syncBlocks), and refuses
 * to anchor a block boundary that cannot find its messages, so T2/T3
 * distillation requires the full log, not just the visible surface.
 */
export declare function allLogMessages(session: import('@deepseek-ai/dsh-session').Session): CoreMessage[];
/** Extract the model-facing text of any surface message event. */
export declare function extractEventText(event: SessionEvent): string;
/** Count image/file blocks reachable from a content payload (same walk as extractText). */
export declare function countAttachmentBlocks(content: unknown): {
    images: number;
    files: number;
};
/**
 * Attachments carried by one surface event, walked exactly like
 * `extractEventText`. Used in two places: the compressible-range rows mark
 * media-bearing spans, and the callers that already own a token meter price
 * those spans with the provider-anchored media price instead of the text-only
 * estimate (issue #117).
 */
export declare function attachmentsOfEvent(event: SessionEvent): {
    images: number;
    files: number;
};
/**
 * The image/file blocks themselves (not just their counts), in document order.
 * The compressible-range rows price these with the fixed-heuristic media price
 * when the meter reports no routed surcharge, so a media-bearing span is never
 * shown as free (issue #117).
 */
export declare function mediaBlocksOfEvent(event: SessionEvent): readonly unknown[];
/**
 * Whether a surface user message is a compaction checkpoint node (already
 * compressed). Defined here (not in region.ts) so the classifier below and
 * region.ts share ONE implementation.
 *
 * Recognizes BOTH host shapes (issue #168): the ≤0.1.6 wrapper
 * `{ kind: 'plugin', plugin: 'compact', compactionId }` and the 0.1.7+
 * producer-owned kind `{ kind: 'compact-checkpoint', compactionId }` written
 * by dsh-compaction's `compactCheckpointSource()` (verified against the
 * published 0.1.7-alpha.1 artifact: the marker object is exactly
 * `{ kind: 'compact-checkpoint' }` plus `compactionId` and an optional
 * `sourceCommandId`). The 0.1.7 V3→V4 migration rewrites pre-0.1.7 sessions
 * to the new shape, so both shapes coexist on one surface and both must be
 * recognized — a row that misses this predicate classifies as `real`, which
 * double-counts its summary text in acp_status, can steal the protected-tail
 * window, and hides it from every distillation entry point below.
 */
export declare function isCheckpointNode(event: SessionEvent): boolean;
/**
 * The durable compaction id stamped on a checkpoint summary node, reading BOTH
 * host shapes (see {@link isCheckpointNode}). Returns null when the event is
 * not a checkpoint node or carries no id — a malformed row still CLASSIFIES
 * as a checkpoint (it must never read as real content) but has no block to
 * link to. Single shared extractor for the ledger index (`summarySeqIndex`),
 * the distill-edge resolver (`blockRefForSummarySeq`) and the decompress
 * recursion (`checkpointBlockIdOf`) — those sites must not re-derive the shape
 * check themselves (issue #168).
 */
export declare function checkpointCompactionIdOf(event: SessionEvent): string | null;
/**
 * Injection/authoring classification of one surface event — the ONE shared
 * classifier for range scanning and the protected-tail scan (never ad-hoc
 * predicates that drift apart).
 *
 * - `real` — genuine conversation content (user turns without an injected
 *   source, assistant prose/tool-calls, tool results, sub-agent relay rows,
 *   and host content channels in BOTH spellings: legacy plugin names and the
 *   DSH >= 0.1.7 direct-kind renames, issue #169). EXCEPTION: skill-catalog
 *   rows carrying the `<available_skills>` marker stay `instruction` even
 *   when their source shape is unusable (issue #185) — folding one loses
 *   skill discovery permanently. This is the only class that may win "last
 *   real user message" protection (minus all non-user rows, see
 *   `isRealUserTurn`).
 * - `metadata` — the engine's own ephemeral rows: nudge echoes and
 *   compress-pair replacement stubs. Their content is derived from
 *   already-visible messages, so folding them into an adjacent real segment
 *   is zero-loss — this preserves main's behavior for engine-authored rows.
 * - `checkpoint` — compaction summary nodes (both host shapes, see
 *   `isCheckpointNode`: legacy `plugin: 'compact'` and 0.1.7+
 *   `kind: 'compact-checkpoint'`, issue #168).
 *   Distillation is an explicit act; never folded into any segment.
 * - `instruction` — host-authored policy/instructions: AGENTS.md injections
 *   (both host shapes), skill catalogs, host compaction summary rows
 *   (`compact-basic`, issue #169), and ANY unknown `kind:'plugin'` row or
 *   unaudited direct kind. Folding these is unsafe (the model would lose
 *   live policy text, and the host re-injects the current AGENTS.md copy
 *   when it disappears — the compress → re-inject loop this PR fixes).
 *   Unknown channel names fall here deliberately in BOTH namespaces: a
 *   future host injection must never silently become compressible content.
 */
export type SurfaceEventClass = 'real' | 'metadata' | 'checkpoint' | 'instruction';
/** Plugin names the engine itself authors — safe to fold into real segments. */
export declare const METADATA_PLUGINS: ReadonlySet<string>;
/**
 * Resolve the owning plugin name from either durable source shape: the legacy
 * V3 wrapper `{ kind: 'plugin', plugin: '<name>' }` or the V4 producer kind
 * `'plugin:<name>'`. DSH 0.1.7's V3→V4 migration rewrites every unregistered
 * plugin row into the latter on file open, so both shapes coexist on a live
 * surface until a session has been fully rewritten (issue #163). Returns
 * undefined when neither shape is present, or when the name is missing,
 * non-string, or empty — callers then keep their conservative fallback.
 */
export declare function sourcePluginOf(source: {
    kind?: unknown;
    plugin?: unknown;
} | undefined): string | undefined;
/**
 * True for AGENTS.md instruction rows in ALL host shapes: the hook shape
 * (`kind:'agent-instructions'`, form 'instructions'), the legacy V3 wrapper
 * (`kind:'plugin'` + plugin 'agent-instructions'), and the V4 producer kind
 * (`kind:'plugin:agent-instructions'`) that DSH 0.1.7's migration rewrites
 * legacy rows into on file open (issue #163) — a migrated session must keep
 * its newest-row pin, or the current copy becomes foldable and the
 * compress → re-inject loop returns. Shared by the newest-row scan and the
 * range scanner so protection and folding always agree on what counts as an
 * AGENTS.md row.
 */
export declare function isAgentInstructionsRow(event: SessionEvent): boolean;
/**
 * True for skill-catalog rows (issue #185) — the `<available_skills>` list the
 * harness injects (dsh-tool-skill's `agent/pre-step`) so the model knows which
 * skills are installed. Recognized in every known host shape:
 *
 * - the direct kind `{ kind: 'skill-catalog', form: 'catalog' }` (audited;
 *   already in HOST_INSTRUCTION_KINDS);
 * - the plugin shapes, legacy wrapper `{ kind: 'plugin', plugin:
 *   'dsh-tool-skill' }` and V4 producer kind `plugin:dsh-tool-skill`
 *   (unknown plugin names already fall to instruction — naming the channel
 *   explicitly pins it there so a future REAL_CONTENT_PLUGINS entry can never
 *   silently re-admit the catalog as foldable content);
 * - CONTENT FALLBACK: any user row whose text carries the `<available_skills>`
 *   marker, whatever its source shape. Hosts that inject the catalog through a
 *   plain user message with NO usable source marker (the wild shape behind
 *   issue #185) would otherwise classify as `real`, get offered in the nudge
 *   range table, and be folded away. Folding the visible catalog is NOT
 *   recoverable by the host: dsh-tool-skill's resend gate is the catalog
 *   DIGEST, and shadowing the visible row changes nothing about it, so the
 *   model loses skill discovery until the catalog actually changes. The
 *   marker is the stable contract between harness and model; a user who pastes
 *   it into a chat turn becomes a barrier for that one row (harmless), while
 *   folding a real catalog is a permanent capability loss (not harmless) —
 *   the asymmetry decides.
 */
export declare function isSkillCatalogRow(event: SessionEvent): boolean;
export declare function classifySurfaceEvent(event: SessionEvent): SurfaceEventClass;
/**
 * Whether an event is a real user turn — the protected-tail criterion. An
 * injected row (AGENTS.md, skill catalog, nudge echo, tool notice) is real
 * *content* at most but is never the user speaking: the latest real user
 * message must keep its protection window even when an injected row lands
 * after it. The scan this replaces protected "the last non-checkpoint
 * user/message", which on live sessions is frequently an AGENTS.md injection
 * row (the host appends it in the same enter batch) — the actual last user
 * message was left compressible while synthetic output sat safe.
 */
export declare function isRealUserTurn(event: SessionEvent): boolean;
export {};
