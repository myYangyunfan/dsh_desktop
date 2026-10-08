/**
 * Tasks page (task management): the FULL agent topology of the current
 * tree's main session, rendered in the user-approved postmodern style as a
 * workflow GRAPH canvas (default) or the classic indentation TREE — one
 * unified model (tasks-model.ts) feeds both, so the fold state and the
 * bottom-right view toggle never diverge.
 *
 * Beyond the topology this page now folds in:
 * - WORKFLOW RUNS: the host folds `tool-workflow/*` session events of the
 *   whole tree (workflows.list); a run hangs under its origin agent with its
 *   member agents re-parented below it and phase frames behind them;
 * - AGENT TEAMS (experimental host layer): when the root leads a team, its
 *   `agentTeam` Session projection feeds the always-visible team strip and
 *   enriches the matching nodes; the projection is absent without the layer,
 *   so the whole surface hides itself with no banner and no polling;
 * - BACKGROUND JOBS: a bottom drawer replaces the old in-page section and
 *   auto-collapses once the tree has many agents; job output opens as a
 *   persistent floating window (the host's own client jobs service — never
 *   the model's cursor).
 *
 * Node click jumps straight into the transcript (root → main session); the
 * ⓘ button opens the detail popover. Completed leaf agents fold into one
 * aggregate node per parent (click it or the control-cluster toggle to
 * expand/collapse).
 *
 * The shell itself is the page's own module stylesheet plus host primitives:
 * the header's refresh and the failure banner's retry are host `Button`s, the
 * descendant count is mono micro-type, and the canvas / tree / board / drawer
 * own their own chrome.
 */
import { type ReactNode } from 'react';
import type { Context, SidebarSubagentAddress } from '../context-types.ts';
import type { SidebarStore } from './state.ts';
/**
 * The sidebar's Tasks page.
 * @param props - current session id, visibility, the client context, the
 *   shared store (the prefs drive the default view mode), and the optional
 *   jump-notify hook fired right before `openSubagent`.
 */
export declare function SubagentView(props: {
    sessionId: string;
    active: boolean;
    ctx: Context;
    store?: SidebarStore;
    onOpenChild?: (address: SidebarSubagentAddress) => void;
}): ReactNode;
