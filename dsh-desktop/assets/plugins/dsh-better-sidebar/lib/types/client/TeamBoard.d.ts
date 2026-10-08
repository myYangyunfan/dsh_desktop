/**
 * The Agent Teams board — ALWAYS VISIBLE under the page header whenever the
 * tree's root leads a team. Every control is a host primitive (Menu / Pill /
 * Tag / Button / StateDot); the page ships no native form control of its own.
 *
 * Layout: the strip is full width because the native sidebar is narrow — a
 * member row of Pills (also the owner filter), then task rows (subject +
 * owner + status Tag + ONE overflow Menu).
 *
 * Readability: the four blocks (bar / filters / rows / footer) share one 12px
 * gutter and one 6px vertical beat, divided by the 1px l1 rules the stylesheet
 * draws; a row sits on the 28px rhythm and every line that can be ellipsised
 * (subject, owner) carries its full text as `title`.
 *
 * Behaviour: a row and EVERY entry of its menu open the shared task window,
 * which is the ONE surface owning view / edit / create and every CAS mutation
 * — the menu is that window's affordance list hoisted onto the row, not a
 * second mutation path. A conflict therefore still surfaces in the window and
 * re-syncs through the parent's poller.
 */
import { type ReactNode } from 'react';
import type { SidebarTeamTaskView } from '../context-types.ts';
import type { TeamMemberRow } from './team-projection.ts';
export interface TeamBoardProps {
    rootId: string;
    members: readonly TeamMemberRow[];
    tasks: readonly SidebarTeamTaskView[];
    /** Open the shared task window (undefined = create) anchored at the click. */
    onOpenTask(task: SidebarTeamTaskView | undefined, anchor: HTMLElement): void;
    /** The strip's own collapse state (the reader's choice, remembered while mounted). */
    collapsed: boolean;
    onToggleCollapsed(): void;
}
export declare function TeamBoard(props: TeamBoardProps): ReactNode;
