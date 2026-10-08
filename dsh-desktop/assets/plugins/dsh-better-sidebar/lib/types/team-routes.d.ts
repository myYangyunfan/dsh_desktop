/**
 * The Agent Teams WRITE routes of the /sidebar JSON API ('teams.taskCreate' /
 * 'teams.taskUpdate').
 *
 * The READ path is deliberately absent. DSH 0.1.7 replaced the 0.1.6 Remote
 * trio (`remoteView` / `remoteCreateTask` / `remoteUpdateTask`, which this
 * plugin's `teams.view` route mirrored) with the Lead Session's `agentTeam`
 * Session projection: the browser already receives it in
 * `SessionListState.projectionsBySession`, so the Tasks page reads the board
 * straight off the shared snapshot (see ./client/team-projection.ts) and no
 * host route, poller or observation handshake is involved. That also removed
 * the only reason this file needed `tryMembership` for reads.
 *
 * What remains cannot be done in the browser: `createTask` / `updateTask`
 * demand the exact live Lead Agent as their authority credential, which only
 * the host holds. The experimental `dsh-experimental-agent-team` service
 * (`ctx.agentTeams`) exists only when the deployment opts in, so the routes
 * degrade structurally:
 *
 * - service absent (`ctx.get('agentTeams')` undefined) → 503 `team-error`
 *   (a mutation can never be accepted there; the page silently hides the
 *   whole Teams block because the projection is absent too, so this is the
 *   belt to that pair of braces);
 * - the tree's root agent is not live in this process (cold session / another
 *   harness) → 404 `team-error`; teams are live-led by definition;
 * - the root leads no team (`tryMembership` miss) → 404 `team-error`.
 *
 * Rejections are THROWN by 0.1.7 (0.1.6 returned a `TeamTaskMutationResult`
 * union), so the CAS conflict has to be translated back into a wire code the
 * client can route on: `TEAM_TASK_STALE_REVISION` → `team-conflict` (409),
 * every other `TeamError` → `team-error` (400). The message is never parsed.
 *
 * Teams are implicit (TeamId ≡ the lead's session id) and every service
 * method demands the live member Agent as its authority token, so the routes
 * re-derive the caller per request (`ctx.agents.get(rootSessionId)`) exactly
 * like the jobs.kill fence. Zero DSH source changes; the plugin never imports
 * the experimental package (structural mirrors only).
 */
import type { Context, SidebarTeamTaskMutationResult } from './context-types.ts';
/** The Agent Teams write routes of the sidebar API. */
export interface SidebarTeamsRoutes {
    /** Create one shared task (payload = `{ rootSessionId, ...request }`). */
    taskCreate(payload: unknown): Promise<SidebarTeamTaskMutationResult>;
    /** CAS-mutate one shared task (payload = `{ rootSessionId, ...request }`). */
    taskUpdate(payload: unknown): Promise<SidebarTeamTaskMutationResult>;
}
/**
 * Build the Agent Teams write routes bound to the plugin context.
 * @param ctx - host plugin context.
 */
export declare function buildTeamsApi(ctx: Context): SidebarTeamsRoutes;
