/**
 * The live-preview route of the Subagent page ('subagents.live'): one
 * request per refresh instead of N per-child `subagents.history` calls.
 *
 * The route takes the already-resolved topology root (`rootSessionId`),
 * enumerates the whole descendant tree ONCE through the host subagent
 * runtime (`ctx.get('subagents')` / `listDescendants`), and folds EVERY child
 * session's newest process range with {@link foldProcess} — the plugin's port
 * of the main agent's merged process summary (category counts + the one
 * running call + its detail). It never touches DSH source and never reads the
 * model's `job_output` cursor.
 *
 * Folding a settled child is cheap by construction: the default fold stops at
 * the first range boundary it can report, so a child that is idle between
 * turns costs a handful of event reads (`snapshotEvents()` itself returns the
 * session's cached frozen snapshot, not a per-call copy).
 *
 * Degradation contract:
 * - `ctx.get('subagents')` missing or `listDescendants` failure → 503 (the
 *   Subagent page has no topology to show in such deployments anyway).
 * - One child's events missing/corrupt → that child is still REPORTED (its
 *   `running` flag is the catalog's), just without a summary; the rest of the
 *   batch is unaffected.
 */
import type { Context, SidebarChildLiveView } from './context-types.ts';
/** The live-preview routes of the /sidebar JSON API. */
export interface SidebarSubagentLiveRoutes {
    /**
     * Fold one tree's subagent activity into a compact live map.
     * @param payload - `{ rootSessionId }`.
     * @returns `{ live: Record<sessionId, SidebarChildLiveView> }` over the
     *   whole descendant catalog plus the topology root.
     */
    live(payload: unknown): Promise<{
        live: Record<string, SidebarChildLiveView>;
    }>;
}
/**
 * Build the live-preview routes bound to the plugin context.
 * @param ctx - host plugin context.
 */
export declare function buildSubagentLiveApi(ctx: Context): SidebarSubagentLiveRoutes;
