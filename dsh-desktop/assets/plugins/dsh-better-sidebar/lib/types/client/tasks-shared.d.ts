/**
 * Shared presentation bits of the Tasks page's two modes (graph + tree):
 * the state dot, the agent/workflow/task GLYPHS (host primitive icons — the
 * page draws no glyphs of its own), the short mono meta line, the node task
 * line, and the iconified live activity row ("tool icon + tool + args").
 *
 * Card content contract (the page's answer to "everything is ellipsized"):
 *   line 1  state dot + agent icon + name   (11px semibold, one line)
 *   line 2  mode/model · activity           (9px mono, one line)
 *   line 3  live tool line                  (running nodes only)
 *   line 4  owned shared task               (team members only)
 * Everything else lives in the popovers.
 */
import type { ReactNode } from 'react';
import { type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SidebarChildLiveView } from '../context-types.ts';
import type { TasksAgentNode, TasksFoldNode, TasksNodeState, TasksNodeTask, TasksWorkflowNode } from './tasks-model.ts';
import { type CopyKey } from './locales.ts';
/** The host StateDot semantic of a node display state. */
export declare function nodeDotState(state: TasksNodeState): StateDotState;
/** The short state word of a node (the meta line's second token). */
export declare function stateLabel(state: TasksNodeState): string;
/**
 * The two facts every task display rule reads. Deliberately NARROWER than
 * either carrier (`TasksNodeTask` on the graph, `SidebarTeamTaskView` in the
 * board and the task window) so one rule serves all of them — the window sees
 * a `deleted` status the graph never draws, and only the shared rule needs to
 * know that a deleted task is not "blocked".
 */
export interface TaskStatusFacts {
    status: 'pending' | 'in_progress' | 'completed' | 'deleted';
    ready: boolean;
}
/** The task status label key. */
export declare function taskStatusKey(status: TaskStatusFacts['status']): CopyKey;
/**
 * Whether a shared task is HELD UP by its blockers.
 *
 * The service's `ready` flag means exactly one thing: "a pending task whose
 * every blocker completed, so it can be CLAIMED". It is therefore false for
 * every task that is not queued — which makes `!ready` the wrong test for
 * "blocked": a claimed task (in_progress) and a finished one both report
 * `ready: false`, and reading the flag alone labelled a task that is actively
 * being worked on as 阻塞 (reproduced on the real board: claiming a task made
 * its Tag flip from 待办 to 阻塞).
 */
export declare function taskBlocked(task: TaskStatusFacts): boolean;
/** The status word of a task row: its own status, or 阻塞 when held up. */
export declare function taskStatusLabel(task: TaskStatusFacts): string;
/** The tone of a task's status Tag (or dot) — the same three-way rule. */
export declare function taskTone(task: TaskStatusFacts): 'success' | 'info' | 'warning';
/** The host StateDot semantic of a task row/line. */
export declare function taskDotState(task: TaskStatusFacts): StateDotState;
/** First `limit` characters with an ellipsis when truncated. */
export declare function preview(text: string, limit?: number): string;
/** Collapse whitespace for single-line previews. */
export declare function flatten(text: string): string;
/** The host icon of one agent node (the lead and plain children share one). */
export declare function AgentGlyph(props: {
    node: TasksAgentNode;
    size?: number;
}): ReactNode;
/** The workflow-run glyph. */
export declare function WorkflowGlyph(props: {
    size?: number;
}): ReactNode;
/** The fold aggregate glyph. */
export declare function FoldGlyph(props: {
    size?: number;
}): ReactNode;
/**
 * The mode word of one catalog row, or undefined when it names no mode. DSH
 * 0.1.7 added `unknown` (a child the host's catalog fold kept without a
 * readable descriptor): it claims NEITHER mode, so the segment is omitted
 * rather than mislabelled.
 */
export declare function modeLabel(mode: TasksAgentNode['mode']): string | undefined;
/**
 * The mono meta line of an agent card — at most two short tokens:
 * - the topology root: 主代理 · 状态
 * - any other agent: 模式 · 状态 (a teammate without a catalog mode falls back
 *   to its team role, the one durable identity the roster still carries — the
 *   `agentTeam` projection has no model field to print, see team-projection.ts)
 */
export declare function agentMeta(node: TasksAgentNode): string;
/**
 * The CARD's mono meta line: WHO the node is, never its state.
 *
 * The state belongs to the card's bottom bar (the state word sits next to the
 * state dot there), so repeating it here would print "已完成" twice inside one
 * 190px card — the densest complaint the readability pass had to fix. The
 * accessible name keeps {@link agentMeta} (state included), because a screen
 * reader never sees the bar's dot.
 */
export declare function agentIdentity(node: TasksAgentNode): string;
/** The mono meta line of a workflow run card: status · member tally. */
export declare function workflowMeta(node: TasksWorkflowNode): string;
/** The workflow run status label key. */
export declare function workflowStatusKey(status: TasksWorkflowNode['run']['status']): CopyKey;
/** The task a node surfaces first: in-progress, else pending, else the last. */
export declare function primaryTask(tasks: readonly TasksNodeTask[]): TasksNodeTask | undefined;
/**
 * The node's shared-task line: an icon, the primary task's subject, its
 * status word, and a `+N` tail when the agent owns more. Renders nothing
 * without tasks, so non-team nodes keep the three-line shape.
 */
export declare function TaskLine(props: {
    tasks: readonly TasksNodeTask[] | undefined;
    onOpenTask(taskId: string, anchor: HTMLElement): void;
}): ReactNode;
/**
 * The live activity row of a RUNNING agent: the merged process summary the
 * main conversation would show for the child's newest range (category wording
 * + the running call's detail), plus the flattened last text line underneath.
 * A running node with neither reads as thinking.
 */
export declare function LiveLine(props: {
    live: SidebarChildLiveView | undefined;
}): ReactNode;
/**
 * The fold aggregate's name line: two label previews, plus `+N` when the group
 * holds more.
 *
 * A roster aggregate can swallow dozens of members, and the card has one line
 * for them. Naming two and saying how many are left over is what keeps that
 * line honest at any size — the exact `+N` the team task line already uses,
 * not a second convention. The group's total is also on the badge and the bar,
 * so `+N` is a tail, never the only count.
 *
 * @param previews - member labels, in page order (see {@link TasksFoldNode.previews}).
 * @param count - how many members the group holds in total.
 */
export declare function foldPreviews(previews: readonly string[], count: number): string;
/**
 * The fold aggregate's bar text.
 *
 * The two groups read differently on purpose. The `done` row counts its
 * finished members and calls out failures beside them (`✓ 4 已完成 · 出错 1`
 * — a row of nothing but failures is `出错 N`), because "✓ N 已完成" alone
 * would quietly include them. The `idle` row says what the members are doing
 * now: nothing (`N 待命`), which is why they were swept away.
 */
export declare function foldTally(node: TasksFoldNode): string;
