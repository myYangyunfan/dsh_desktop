/**
 * The workflow-runs route of the /sidebar JSON API ('workflows.list'). DSH
 * keeps workflow runs holder-owned and process-local — there is NO service
 * registry, NO HTTP route, and NO persistence for them (`dsh-workflow`
 * README: "Runs are holder-owned, not service-tracked"). The one durable
 * observation surface is the session event log: `dsh-tool-workflow`'s
 * recorder appends four `tool-workflow/*` event types to the calling agent's
 * session (top-level runs only), which is exactly what the official
 * `dsh-client-ui-workflow-run` panel folds in the browser.
 *
 * This route folds the SAME events server-side for every session of the
 * current tree (the root plus its subagent descendants), so the Tasks page
 * can hang run nodes under the agent that started them. Like the job-output
 * replay it merges the store's event log with a live `session/event` mirror
 * (deduped by seq), because the store session can lag the live append feed
 * after a host restart. Zero DSH writes; the runs of a deployment that never
 * uses the workflow tool simply never produce events and the route returns
 * an empty list (no error — absence is the normal case, not a failure).
 */
import type { Context } from './context-types.ts';
import { type WorkflowRunView } from './workflow-runs.ts';
/** The workflow-runs route of the sidebar API. */
export interface SidebarWorkflowRoutes {
    /**
     * Fold the workflow runs of every session in one tree.
     * @param payload - `{ rootSessionId }`.
     * @returns `{ runs: WorkflowRunView[] }`, oldest run first; empty when the
     *   tree never ran a workflow (or the DSH version predates the recorder).
     */
    list(payload: unknown): Promise<{
        runs: WorkflowRunView[];
    }>;
}
/**
 * Build the workflow-runs route bound to the plugin context. The tree walk
 * reuses the host subagent runtime (`ctx.get('subagents')`); without it the
 * route still folds the root session alone (a degraded but honest tree of
 * one), matching the Subagent page's own fallback lineage.
 * @param ctx - host plugin context.
 */
export declare function buildWorkflowsApi(ctx: Context): SidebarWorkflowRoutes;
