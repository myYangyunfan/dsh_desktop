/**
 * Pure derivations for the Subagent page's background-job section. Kept
 * framework-free so the node test environment can unit-test them: the job
 * rows are collected from the per-session lists the client reads through the
 * plugin's `jobs.list` route (DSH 0.1.7 dropped the harness `session/jobs`
 * push mirror that used to feed `jobsBySession`, and the registry's access
 * fence admits a job only to its OWNER session — so the caller fans one read
 * out per tree session). Nothing here issues requests, and the row ordering /
 * status mapping mirror the official ui-jobs header list.
 */
import type { SidebarJobStatus, SidebarJobView } from '../context-types.ts';
import type { CopyKey } from './locales.ts';
import { treeSessionIds } from './subagent-lineage.ts';
/** One row of the jobs section: the job plus its owning session's title. */
export interface TreeJob {
    ownerSessionId: string;
    ownerTitle: string;
    job: SidebarJobView;
}
/** Whether the registry still holds the job open (its duration ticks). */
export declare function isJobLive(job: SidebarJobView): boolean;
export { treeSessionIds };
/**
 * Whether a NEW background job appeared for the current session between two
 * roster frames (a job id the previous frame lacked). Unlike the subagent
 * auto-open (0 → N only), ANY new job id triggers: the agent may start
 * several jobs over a session, and each new one should surface the Tasks page
 * that contains the background-jobs section.
 *
 * `since` (epoch ms) is the moment the caller STARTED watching the roster, and
 * it is what keeps a page load honest now that the roster arrives as a push
 * stream: the host's client jobs model drops a session's key when it sees no
 * jobs, so an empty first frame is indistinguishable from "not delivered yet".
 * A job that already existed when the watcher opened therefore looks brand new
 * to an id-set diff — comparing its start time against `since` filters it out,
 * while a job the agent starts afterwards still triggers.
 *
 * @param prev - the previous frame's rows.
 * @param next - the current frame's rows.
 * @param since - epoch ms the watch began; omitted skips the age test.
 * @returns whether genuinely new work appeared.
 */
export declare function detectNewJob(prev: readonly SidebarJobView[], next: readonly SidebarJobView[], since?: number): boolean;
/**
 * Live rows first in start order, then settled rows newest-first (mirror of
 * the official ui-jobs ordering); a tie falls back to start order so the
 * sort never depends on the host's map iteration.
 */
export declare function orderJobs(rows: readonly TreeJob[]): TreeJob[];
/** The sidebar's StateDot states for the five wire statuses. */
export type JobDotState = 'ongoing' | 'warning' | 'done' | 'error';
/**
 * Status marker semantics. `stopping` and `killed` share the attention
 * color: both mean the work ended (or is ending) on request rather than on
 * its own.
 */
export declare function jobDotState(status: SidebarJobStatus): JobDotState;
/** Human status word of one wire status (localized through the passed translator). */
export declare function jobStatusLabel(status: SidebarJobStatus, t: (key: CopyKey, params?: Record<string, string | number>) => string): string;
/**
 * Elapsed time in at most two adjacent units (mirror of the official
 * ui-jobs duration wording). A background job that outlives an hour is
 * already exceptional, so hours is the widest unit.
 */
export declare function formatJobDuration(elapsedMs: number, t: (key: CopyKey, params?: Record<string, string | number>) => string): string;
