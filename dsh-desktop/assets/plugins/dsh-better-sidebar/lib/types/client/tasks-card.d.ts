/**
 * The two-segment node card of the Tasks graph: a TOP segment that says WHAT
 * the node is (kind badge, name, mono meta, optional task line) and a BOTTOM
 * bar that says WHAT IT IS DOING (state dot + state word + the merged process
 * activity, plus the fold chevron once the node has settled).
 *
 * Both modes share the model but NOT the card: the TREE keeps its compact
 * indent row (its own disclosure, its own keyboard recipe), so this module is
 * graph-only. Its two pieces are separate components because every node kind
 * (agent / workflow run / fold aggregate) composes them differently while the
 * geometry stays identical — the layout reserves the height of exactly these
 * rows (`tasks-graph-layout.ts`).
 *
 * Colour: the group colour of a node is its tree DEPTH, from the plugin's own
 * token-only ramp (`.depth0…3` in tasks-graph.module.css). The host ships no
 * chart palette and the skin contract forbids literal colours, so the ramp is
 * mixed from `--dsw-alias-state-business-primary`; a workflow member's PHASE
 * badge uses the ink family instead, so the two groupings never share a hue.
 */
import type { ReactNode } from 'react';
import type { TasksNodeState } from './tasks-model.ts';
/** The five kinds of card the graph draws. */
export type CardKind = 'main' | 'subagent' | 'teammate' | 'workflow' | 'fold';
/** Which aggregate a fold card is (`done` = finished/failed, `idle` = waiting). */
export type CardFoldKind = 'done' | 'idle';
/**
 * The kind badge's word: the SAME vocabulary the rest of the page uses (the
 * header already calls the root "主代理"), so no sixth word is invented for it.
 *
 * The two aggregates say different things, because they hold different work:
 * `done` keeps "✓ N 已完成" (finished and failed rows alike) while `idle` says
 * "N 个待命". One mixed row could only have hedged ("✓ 2 已完成 · 3 待命"),
 * which is exactly what splitting them removed.
 * @param kind - card kind.
 * @param count - folded member count (the fold aggregate's badge only).
 * @param foldKind - which aggregate (`done` unless stated).
 */
export declare function cardKindLabel(kind: CardKind, count?: number, foldKind?: CardFoldKind): string;
/**
 * The depth class of a node's group colour (levels past 3 share the last one).
 * Typed `string | undefined` because the CSS-module map is an open record: a
 * typo'd class name would otherwise pass `tsc` as a `string`.
 */
export declare function depthClass(depth: number): string | undefined;
/** The phase class of a workflow member's badge (phases past 3 share the last one). */
export declare function phaseClass(index: number): string | undefined;
/** The top segment: the node's identity. */
export declare function CardTop(props: {
    kind: CardKind;
    /** Folded member count, for the aggregate's badge. */
    count?: number;
    /** Which aggregate this card is, when `kind` is `fold`. */
    foldKind?: CardFoldKind;
    /** Tree depth → the group colour of the badge and the card's left edge. */
    depth: number;
    /** Workflow phase (a member's badge). */
    phase?: {
        index: number;
        title?: string;
    };
    /** The node's name (already resolved by the model). */
    name: string;
    /** The mono meta line under the name. */
    meta?: string;
    /** Extra class for the name (the aggregate recedes one rung). */
    extraClass?: string;
    /** Extra rows the caller appends (the team task line). */
    children?: ReactNode;
}): ReactNode;
/** The bottom bar: the node's state, its merged activity, and its fold chevron. */
export declare function CardBar(props: {
    state: TasksNodeState;
    /** The merged process activity line (running nodes and settled summaries). */
    activity?: string;
    /** Whether the node is executing (drives the sweep). */
    running?: boolean;
    /** Fold the node into its parent's completed aggregate (settled nodes only). */
    onFold?: (event: {
        stopPropagation(): void;
    }) => void;
    /** The chevron's accessible name (defaults to the per-node fold word). */
    foldLabel?: string;
    /** Render the state WORD next to the dot (off for the aggregate's action bar). */
    stateWord?: boolean;
    /** Replace the whole bar's content (the aggregate's action row). */
    children?: ReactNode;
}): ReactNode;
