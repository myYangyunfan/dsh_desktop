import type { SidebarSessionList } from '../context-types.ts';
import type { Context, SidebarClientJobsService, SidebarJobsSnapshot } from '../context-types.ts';
import { type TreeJob } from './subagent-jobs.ts';
/**
 * The client jobs service, when this deployment mounts the host jobs UI.
 * @param ctx - the client context.
 */
export declare function clientJobs(ctx: Context): SidebarClientJobsService | undefined;
/**
 * Subscribe to the jobs snapshot (roster + observations).
 * @param jobs - the client jobs service (absent → an empty snapshot forever).
 */
export declare function useJobsSnapshot(jobs: SidebarClientJobsService | undefined): SidebarJobsSnapshot;
/**
 * Watch (and release) one roster per session, while the page is on screen. The
 * host shares a single stream between watchers of one session, so this is
 * cheap; the key is the joined id list so a re-render with the same tree does
 * not re-subscribe.
 * @param jobs - the client jobs service.
 * @param sessionIds - the tree's sessions (the root included).
 * @param active - whether the page is visible at all.
 */
export declare function useJobWatchers(jobs: SidebarClientJobsService | undefined, sessionIds: readonly string[], active: boolean): void;
/**
 * Observe ONE job's output while its panel is open; the release runs on close.
 * @param jobs - the client jobs service.
 * @param ownerSessionId - the session the roster carried the job under.
 * @param jobId - the observed job (undefined closes the observation).
 */
export declare function useJobObservation(jobs: SidebarClientJobsService | undefined, ownerSessionId: string | undefined, jobId: string | undefined): void;
/**
 * One job's rows as the drawer renders them, deduped across the tree.
 *
 * An UNOWNED job is visible to every watched session, so the union of rosters
 * repeats it: rows are keyed by job id and attributed to the watched session
 * whose roster carried them (which is also the session the observation and the
 * kill go through). Jobs owned by a session outside the tree are dropped.
 *
 * @param snapshot - the client service snapshot.
 * @param byId - the session mirror (owner labels).
 * @param treeIds - the tree's session ids (root included).
 */
export declare function collectRows(snapshot: SidebarJobsSnapshot, byId: SidebarSessionList['byId'], treeIds: ReadonlySet<string>): TreeJob[];
