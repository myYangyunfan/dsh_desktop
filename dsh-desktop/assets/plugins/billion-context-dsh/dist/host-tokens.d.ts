/**
 * Host-vocabulary token pricing for the durable shadow-price protocol.
 *
 * The host token-meter prices every appended message with a fixed flat-4
 * heuristic (`estimateContent` / `estimateMessage` in `dsh-token-meter`) and
 * the producer contract requires every `compaction/summary`/`compaction/prune`
 * `shadowedTokenCount` claim to be derived from the SAME estimator. Writing
 * claims with the engine's CJK-aware `defaultCountTokens` overdraws the meter
 * on CJK-heavy sessions and permanently bricks them (live session
 * `session-3aa366c3`, issue #54; AGENTS.md rule 12 — `defaultCountTokens` is
 * display currency, NEVER event currency).
 *
 * This module prices claims in the host's vocabulary: it prefers the live
 * meter's own per-node FIXED-HEURISTIC prices (`ctx.tokenMeter.measure(session)`
 * nodes' `heuristicTokens` — the same basis the projection ledger accumulates
 * appends with, so the claim is exact by construction) and falls back to an
 * exact mirror of the host's estimator when the meter is unreachable.
 *
 * Two vocabularies share the meter's node since DSH 0.1.2: `tokens` carries
 * the measured route's request pressure (image occurrences re-priced with the
 * route's declared visual tokens) while `heuristicTokens` keeps the fixed
 * flat-4 heuristic the ledger prices appends with. The claim MUST read
 * `heuristicTokens`: a routed `tokens` claim overstates the replaced range
 * against its own ledger accumulation and folds `messageTokens` negative —
 * the same session-bricking schema rejection as #54, through the image-route
 * channel (issue #103). Older hosts (0.1.0/0.1.1 lines) expose a single
 * `tokens` field that IS the fixed heuristic, so the fallback reads it.
 */
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
/** The host's model-visible content block union (structural, mirror-side only). */
export type HostBlock = {
    type: 'text';
    text: string;
} | {
    type: 'reasoning';
    text: string;
} | {
    type: 'tool-call';
    name: string;
    arguments: string;
} | {
    type: 'tool-result';
    toolCallId: string;
    content: HostContent;
} | ({
    type?: string;
} & Record<string, unknown>);
/** A content block list, or a bare string (`tool-result` content may be either). */
export type HostContent = readonly HostBlock[] | string;
/**
 * Exact mirror of the host's `estimateContent`
 * (`@deepseek-ai/dsh-token-meter/lib/types/estimate.js`): text/reasoning
 * `ceil(len/4)+4`, tool-call `ceil(name/4)+ceil(arguments/4)+4`, tool-result
 * recursive over its content, unknown blocks `4+ceil(JSON.stringify/4)` over
 * the ORIGINAL block object. A string content is iterated as an iterable, so
 * every CHARACTER falls to the default branch (`4+ceil(JSON.stringify(char)/4)`
 * — 5 tokens for any single unescaped character).
 */
export declare function estimateHostContent(blocks: HostContent): number;
/** Exact mirror of the host's `estimateMessage` (content + role framing). */
export declare function estimateHostMessage(message: {
    content: HostContent;
}): number;
/**
 * Host price of ONE session event under the mirror: project it through the
 * host's `deriveEventMessage` (null for non-surface events and empty-content
 * assistant messages) and price the derived message; null derives to 0.
 */
export declare function hostPriceEvent(event: SessionEvent): number;
/** Mirror price of a set of surface seqs (the fallback claim computation). */
export declare function shadowedHostTokens(session: Session, seqs: readonly number[]): number;
/**
 * Fixed-heuristic price of the media blocks reachable in `blocks` (any nesting
 * depth, tool results included) — an exact mirror of the host's
 * `estimateStructuralBlock`
 * (`@deepseek-ai/dsh-token-meter/lib/types/estimate.js`), the arm the host's own
 * pricing takes for an image/file reference, "whose request price is route-owned
 * rather than fixed".
 *
 * Used as the media price whenever the meter reports no routed surcharge for the
 * seq — which is every host today — so a media-bearing span is never priced as
 * if the picture were free. It is a DISPLAY price only; it must never reach a
 * `shadowedTokenCount` claim (rule 12).
 *
 * UPSTREAM: drop this mirror the moment dsh-token-meter exports
 * `estimateStructuralBlock` (same tracker entry as `estimateContent`, see
 * docs/dsh-porting-verification.md).
 */
export declare function hostMediaStructuralPrice(blocks: unknown): number;
/**
 * Provider-anchored MEDIA price per surface seq, read from the host meter.
 *
 * An `image`/`file` block carries no characters, so every text-based estimator
 * prices it at zero while the provider still bills it. The only media signal the
 * meter's public node exposes is the gap between its two prices: `tokens` is the
 * route-priced request pressure — a media occurrence carries the adapter's
 * declared visual price when there is one, which is why the host itself reads
 * this field for range selection — and `heuristicTokens` is the route-independent
 * fixed heuristic. Their difference is exactly the routed surcharge the host
 * already charged the route.
 *
 * That difference is ZERO on every adapter that declares no visual price (all
 * production adapters today, and the pinned test meter), so callers ADD the
 * fixed-heuristic `hostMediaStructuralPrice` on top instead of reading an absent
 * surcharge as a free image. Without this pair a picture-heavy span looked free
 * in the compressible-range table and the model ranked it last (issue #117).
 *
 * Where this price may be used: USAGE accounting only (range-table tokens,
 * display). It must NEVER feed a `shadowedTokenCount` claim — the host's
 * projection folds those with its own fixed heuristic and a routed price
 * overstates the claim, folding the projection negative on image ranges
 * (issue #103, the image-route channel of the #54 brick; rule 12).
 *
 * Returns an empty map when the meter is absent, when a measurement throws
 * (step-less logs), or when the meter exposes no media fields (older line) —
 * which degrades to the previous text-only behaviour.
 */
export declare function mediaPriceViaMeter(session: Session, ctx?: {
    get?(name: string): unknown;
} | null): ReadonlyMap<number, number>;
/**
 * Claim price for `seqs` in the host's vocabulary. Prefers the live meter's
 * own per-node FIXED-HEURISTIC prices when `ctx.tokenMeter` is reachable and
 * covers every shadowed seq (exact by construction — the ledger's
 * `foldSurfaceProjection` accumulates appends with the same fixed heuristic,
 * so the claim and the ledger stay in agreement; follows host estimator
 * changes automatically). `node.heuristicTokens` is that basis since DSH 0.1.2;
 * `node.tokens` there is the measured route's REQUEST pressure (image
 * occurrences carry the route's visual price via `priceSurface`) and MUST NOT
 * be claimed — reading it overstates the claim and folds the host projection
 * negative on image-containing ranges (issue #103, the image-route channel of
 * the #54 brick). Older meters expose a single `tokens` field that IS the
 * fixed heuristic, so `heuristicTokens ?? tokens` covers both shapes. ANY
 * failure — meter absent, `measure` throwing (e.g. a step-less log), or a seq
 * missing from the measurement — falls back to the exact mirror. Never returns
 * a `defaultCountTokens` price (rule 12).
 */
export declare function shadowedTokensViaMeter(session: Session, seqs: readonly number[], ctx?: {
    get?(name: string): unknown;
} | null): number;
