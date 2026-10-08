/**
 * The ONE task window: view, edit and create all live here, and every task
 * surface (the board's rows, an agent node's task line, the node detail
 * popover) opens THIS component — pointer targets stay thin, the window owns
 * the behaviour.
 *
 * Shape: the plugin's shared {@link FloatingWindow} — a draggable, resizable,
 * body-portaled card with a title bar and a fixed action row, NOT a popover.
 * A task edit is a sustained interaction (a long markdown description), so it
 * gets the same lifecycle a watched job output gets: it survives clicking
 * elsewhere and only the close button or Escape ends it. Details render as
 * multi-line MARKDOWN; 编辑 switches the same window into multi-line editing,
 * and the footer keeps its actions while the body scrolls.
 * Actions: owner reassignment (Pills, CAS-immediate), edit/save, reopen or
 * complete, and a two-step delete.
 *
 * Host primitives everywhere (Button / Input / Pill / Tag / StateDot) plus the
 * plugin's own `MultilineField` (the host set ships no multi-line input) and
 * the shared `MarkdownText` renderer with the plugin's copy labels.
 */
import { type ReactNode } from 'react';
import type { SidebarTeamTaskView } from '../context-types.ts';
import type { TeamMemberRow } from './team-projection.ts';
/**
 * The plugin's own multi-line input: the host primitive set ships no
 * textarea, so this is OUR component (token-styled, drag-exempt) and every
 * multi-line edit in the page goes through it.
 */
export declare function MultilineField(props: {
    value: string;
    label: string;
    placeholder?: string;
    rows?: number;
    onChange?(next: string): void;
}): ReactNode;
export interface TaskWindowProps {
    rootId: string;
    /** The task under view/edit; undefined = create mode. */
    task: SidebarTeamTaskView | undefined;
    members: readonly TeamMemberRow[];
    /** Where the window first appears (the row that opened it). */
    anchor?: HTMLElement | null;
    /** Close the window (the caller's popover state). */
    onClose(): void;
}
/**
 * The ONE task window: the plugin's floating shell wrapping the view/edit body
 * and the action row, so reading, writing and the mutation state all stay in
 * one component.
 */
export declare function TaskWindow(props: TaskWindowProps): ReactNode;
