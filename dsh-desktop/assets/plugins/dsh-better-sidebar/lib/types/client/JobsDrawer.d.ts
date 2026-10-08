/**
 * The background-jobs bottom drawer of the Tasks page and its output popover.
 *
 * Drawer: the tree's jobs (owner-labeled, fed by the HOST's client jobs
 * service — see jobs-client.ts) collapse into a bottom bar that AUTO-COLLAPSES
 * once the tree has many agents — the manual toggle always wins afterwards.
 *
 * Window: clicking a row opens a PERSISTENT floating window (FloatingWindow —
 * draggable, resizable, closed only by its own button or Escape), because a
 * job's output is something the reader watches for minutes: the popover it
 * used to open was dismissed by any click elsewhere and had no height bound,
 * so a chatty job ran off the bottom of the screen. The window's BODY is the
 * scroll container, so the output stays readable whatever its length. It shows
 * what the host streams for an OBSERVER (never the model's consuming cursor),
 * with a copy action in the title bar, a follow-latest switch and the
 * two-click kill in the footer, and a terminal-style tail while the job runs.
 *
 * Every control is a host primitive (Button / Tag / Switch / StateDot /
 * TerminalBlock).
 */
import { type ReactNode } from 'react';
import type { SidebarClientJobsService, SidebarJobView, SidebarObservedJob } from '../context-types.ts';
import { type TreeJob } from './subagent-jobs.ts';
/** The agent count at which the drawer starts collapsed. */
export declare const JOBS_DRAWER_COLLAPSE_AT = 8;
export interface JobsDrawerProps {
    rows: readonly TreeJob[];
    /** The host client jobs service; absent → no kill control is offered. */
    jobs: SidebarClientJobsService | undefined;
    /** The observed output of the job whose panel is open (host stream). */
    observed: SidebarObservedJob | undefined;
    /** Agent count of the tree (root included) — the auto-collapse signal. */
    agentCount: number;
    /** Open the output popover of one row (anchor = the row's main button). */
    onOpenOutput(row: TreeJob, anchor: HTMLElement): void;
    /** The job whose output popover is currently open (row highlight). */
    openJobId?: string;
}
export declare function JobsDrawer(props: JobsDrawerProps): ReactNode;
/**
 * The output WINDOW of one job: what the host streams for an observer of this
 * job, inside the plugin's persistent floating window. The window owns the
 * frame, the geometry and the dismissal contract; this component owns the
 * content (status header rows, the terminal tail) and the footer controls
 * (follow-latest, two-click kill).
 */
export declare function JobOutputWindow(props: {
    /** The host client jobs service (absent → the panel only reports that). */
    jobs: SidebarClientJobsService | undefined;
    job: SidebarJobView;
    /** The owner session the roster carried the job under (kill + observation). */
    ownerSessionId: string;
    /** The host's streamed observation of THIS job (undefined until it arrives). */
    observed: SidebarObservedJob | undefined;
    /** The row's main button — where the window first appears. */
    anchor?: HTMLElement | null;
    /** Close the window (the close button, or Escape). */
    onClose(): void;
}): ReactNode;
