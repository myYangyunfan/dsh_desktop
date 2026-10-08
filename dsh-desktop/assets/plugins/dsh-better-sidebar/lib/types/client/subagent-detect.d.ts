/**
 * Pure subagent-membership helpers over the sessions list feed (structural
 * mirror world — no runtime imports). Used by the sidebar's auto-activation
 * effect and the Subagent page:
 *
 * - {@link directSubagentCount}: direct durable children of one session,
 * - {@link detectNewDirectSubagent}: the 0 → N transition that means "a new
 *   subagent just spawned under the current session" (the auto-open trigger),
 * - {@link countSubagentDescendants}: uninterrupted subagent-origin lineage
 *   totals (mirror of the official `indexSubagentDescendants` over the
 *   plugin's own summary rows).
 *
 * The lineage walks themselves ({@link isSideThreadSummary}, {@link
 * rootAncestor}, {@link countSubagentDescendants}) live in
 * ./subagent-lineage.ts — the single shared walk implementation — and are
 * re-exported below for their established import sites.
 */
import type { SidebarSessionList } from '../context-types.ts';
import { countSubagentDescendants, isSideThreadSummary, rootAncestor } from './subagent-lineage.ts';
export { countSubagentDescendants, isSideThreadSummary, rootAncestor };
export type { SubagentDescendantTotals } from './subagent-lineage.ts';
/** Count the direct subagent children of one session (durable `origin` rows). */
export declare function directSubagentCount(byId: SidebarSessionList['byId'], sessionId: string): number;
/**
 * Whether a new direct subagent appeared under `sessionId` between two
 * consecutive list snapshots (the count crossed 0 → >0). Switching to a
 * session that already has subagents yields `false` (its baseline starts at
 * the current count), so the auto-open never fights an existing layout.
 */
export declare function detectNewDirectSubagent(prev: SidebarSessionList, next: SidebarSessionList, sessionId: string): boolean;
