/**
 * The layered top-down layout of the Tasks graph canvas: a tidy-tree pass
 * with a NARROW-PANEL rule — a parent's children wrap into bands of at most
 * {@link LayoutOptions.maxBandCols} columns, stacking extra rows below it.
 * Without wrapping a five-child level is ~770px wide and the whole graph
 * shrinks to ~40% inside the 360px native sidebar, which is unreadable; with
 * wrapping the canvas keeps a ~1:1 scale and the reader pans far less.
 *
 * Pure and dependency-free (the bundle-purity rule forbids a graph library in
 * the core bundle; <100-node trees need no virtualisation).
 */
import type { TasksNode } from './tasks-model.ts';
/** Geometry constants of the canvas (px, pre-scale). The design target is the
 *  NARROW native right sidebar (~360px): a 190px card fits two per row plus
 *  the gutter, and the card's own rows stay readable at the fit's floor. */
export declare const GRAPH_NODE_W = 190;
/** Badges + TWO title lines + the mono meta line + the state bar: long agent
 *  names are clamped to two lines instead of ellipsizing to a couple of
 *  characters (see `.cardName` in tasks-graph.module.css), so the reserve
 *  covers that second line. */
export declare const GRAPH_NODE_H: number;
/** Extra height of an agent node carrying a shared-task line (team members). */
export declare const GRAPH_TASK_H: number;
/**
 * The readability floor the fit honours: the canvas may shrink to this scale
 * before the layout starts wrapping (TasksGraph's fit and {@link bandColsFor}'s
 * column budget must agree, so the constant lives here, next to the geometry).
 */
export declare const GRAPH_FIT_MIN_SCALE = 0.78;
export declare const GRAPH_GAP_X = 28;
export declare const GRAPH_GAP_Y = 53;
export declare const GRAPH_PAD = 16;
/** The row stride (one row of cards plus the vertical gutter). Every card
 *  shape must fit inside it — see {@link nodeHeight} for the tallest one. */
export declare const GRAPH_ROW_STRIDE: number;
/** One laid-out node. */
export interface GraphBox {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}
/** The layout result: one box per node plus the canvas extent. */
export interface GraphLayout {
    boxes: ReadonlyMap<string, GraphBox>;
    width: number;
    height: number;
}
/** Layout knobs. */
export interface LayoutOptions {
    /** Columns per sibling band before it wraps to the next row (default 4). */
    maxBandCols?: number;
}
/**
 * Lay out the model top-down, wrapping wide sibling bands.
 * @param nodes - the model's pre-order node list (roots = parentless rows).
 * @param options - see {@link LayoutOptions}.
 */
export declare function layoutTasksGraph(nodes: readonly TasksNode[], options?: LayoutOptions): GraphLayout;
/**
 * How many sibling columns fit the given container width at ~1:1 scale. The
 * canvas keeps its readability floor instead of shrinking: at 360px two cards
 * per row, at 720px four.
 */
export declare function bandColsFor(containerWidth: number, minScale?: number): number;
/**
 * The layout for one container width: the WIDEST sibling arrangement whose
 * canvas still fits `containerWidth / minScale` — i.e. the least-tall layout
 * the reader can see without zooming below the readability floor. Wrapping
 * more than needed turns the graph into a ladder; wrapping too little forces
 * an unreadable scale, so the loop tries the widest first and narrows.
 *
 * @param nodes - the model's node list.
 * @param containerWidth - the canvas viewport width in px.
 * @param minScale - the readability floor the fit honours (default 0.78).
 */
export declare function layoutTasksGraphForWidth(nodes: readonly TasksNode[], containerWidth: number, minScale?: number): GraphLayout;
