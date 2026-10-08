/**
 * The shared subagent-lineage walks over the sessions list feed (structural
 * mirror world — no runtime imports). Every public walk here answers a
 * topology question by following the DURABLE subagent-origin chain upward
 * (child → parent → …); one private generator ({@link subagentOriginChain})
 * is the single implementation of that walk, seen-set guarded so cycles fail
 * soft (the walk just stops; nothing throws).
 *
 * subagent-detect.ts and subagent-jobs.ts re-export these for their
 * established import sites — the auto-activation triggers and the Subagent
 * page both consume them through the original module paths.
 */
import type { SidebarSessionList, SidebarSessionSummary } from '../context-types.ts';
/**
 * Side Chat threads ride the subagent origin (main-list hiding + the RPC
 * ownership fence) but they are NOT subagent topology: they carry the
 * durable 'Side: ' label and live as sidebar tabs. Excluding them here
 * keeps the auto-open trigger and the Subagent page counts clean.
 */
export declare function isSideThreadSummary(summary: SidebarSessionSummary): boolean;
/**
 * The main agent of the current session's tree: walk the durable parent
 * chain upward until the first non-subagent session. The Subagent page shows
 * THIS root's full topology regardless of how deep the current selection is
 * (a session whose row is still hydrating, or a broken chain, degrades to
 * the session itself).
 */
export declare function rootAncestor(byId: SidebarSessionList['byId'], sessionId: string | undefined): string | undefined;
/** Descendant totals of one session through an uninterrupted subagent-origin chain. */
export interface SubagentDescendantTotals {
    count: number;
    runningCount: number;
}
/**
 * Index every subagent descendant under each ancestor it reaches through an
 * uninterrupted subagent-origin chain (same semantics as the official
 * `indexSubagentDescendants`; cycles fail soft).
 */
export declare function countSubagentDescendants(byId: SidebarSessionList['byId'], sessionId: string): SubagentDescendantTotals;
/**
 * Every session id of the topology tree rooted at `rootId` (the root plus
 * each session whose uninterrupted subagent-origin chain reaches it — same
 * lineage semantics as {@link countSubagentDescendants}; cycles fail soft).
 * Sessions outside the tree (orphans, other trees) are excluded, so the
 * jobs section never shows foreign work.
 */
export declare function treeSessionIds(byId: SidebarSessionList['byId'], rootId: string | undefined): Set<string>;
