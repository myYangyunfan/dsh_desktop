/**
 * The workflow-graph mode of the Tasks page: layered agent / workflow nodes
 * over bezier edges on a dotted grid, drag-pan from the BACKGROUND only
 * (never from a node — capturing pointers on the container retargets the
 * derived click and silently swallows node clicks), wheel zoom to the cursor,
 * dashed phase frames, fold aggregate nodes, and the bottom-right horizontal
 * control cluster (view toggle / fold / zoom out / level / zoom in / fit)
 * that stays reachable in BOTH modes.
 *
 * Fitting: the canvas auto-fits while the reader has not touched the view,
 * re-running on container resize and layout growth (the sidebar mounts
 * hidden at zero size, so a one-shot fit on mount is not enough), centering
 * on both axes and scaling UP to {@link FIT_MAX_SCALE} so a small tree fills
 * the narrow panel instead of hugging the top-left corner.
 *
 * Cards: the node card recipe of tasks-graph.module.css with a TWO-line
 * clamped title (the card reserve in tasks-graph-layout.ts is sized for that
 * second line, plus one row per live / task line the card renders) and the
 * full name in the `title` attribute. While the root catalog hydrates, an
 * empty canvas shows the same hint as the tree (`loading`).
 */
import { type ReactNode } from 'react';
import type { TasksAgentNode, TasksNode, TasksWorkflowNode } from './tasks-model.ts';
export interface TasksGraphProps {
    nodes: readonly TasksNode[];
    folded: boolean;
    /** Re-fit trigger: the topology root id (a reroot re-centers). */
    rootId: string | undefined;
    onNodeInfo(node: TasksAgentNode, anchor: HTMLElement): void;
    onWorkflowInfo(node: TasksWorkflowNode, anchor: HTMLElement): void;
    /** Open the shared task window for one task id. */
    onOpenTask(taskId: string, anchor: HTMLElement): void;
    /** The control cluster's global fold switch (settled leaves). */
    onToggleFold(): void;
    /** The fold AGGREGATE's click: expand everything (global + manual folds). */
    onExpandFold(): void;
    /** Fold ONE settled node into its parent's aggregate (the bar's chevron). */
    onFoldNode(node: TasksAgentNode): void;
    mode: 'graph' | 'tree';
    onModeChange(mode: 'graph' | 'tree'): void;
    /** Fallback hint while the root catalog hydrates (the graph twin of
     *  TasksTree's loading row: the same copy key, the same "nothing to show
     *  yet" condition). */
    loading?: boolean;
}
/** The shared view-mode toggle (glyph + label) both modes render in their
 *  bottom-right control cluster. */
export declare function ViewModeToggle(props: {
    mode: 'graph' | 'tree';
    onModeChange(mode: 'graph' | 'tree'): void;
}): ReactNode;
/** The fold toggle (expand / re-collapse the settled aggregates). */
/**
 * The cluster's fold switch. Its glyph names the action it will take, not the
 * state it is in: while the settled nodes are folded the button offers to
 * EXPAND (chevron down), and while they are open it offers to FOLD (chevron
 * up, the same collapse direction the cards' own bar buttons wear). The old
 * single checklist glyph read identically in both states, which is what the
 * reader reported as "折叠按钮和展开一样".
 */
export declare function FoldToggleButton(props: {
    folded: boolean;
    onToggleFold(): void;
}): ReactNode;
export declare function TasksGraph(props: TasksGraphProps): ReactNode;
