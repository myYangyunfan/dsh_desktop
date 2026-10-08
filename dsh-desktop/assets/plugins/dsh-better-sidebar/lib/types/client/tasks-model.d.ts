/**
 * The unified view model of the Tasks page: one ordered node list the graph
 * canvas AND the tree mode both render (same data, same fold state). Pure
 * derivation over the sessions list feed (byId lineage + the host's
 * per-session `subagentCatalog` projection views), the live activity map, the
 * folded workflow runs, and the optional team view — kept framework-free for
 * node-environment unit tests.
 *
 * Shape rules:
 * - agent rows walk the per-parent catalog views in pre-order (the same
 *   recursion the classic tree used); Side Chat threads never become nodes;
 * - a workflow run hangs under its ORIGIN agent; member agents that already
 *   exist as the origin's catalog children are RE-PARENTED under the run
 *   node, members without a catalog row are synthesized from the run's own
 *   member data (so a finished run still shows its members);
 * - team members enrich matching agent nodes in place (role/phase/status);
 *   the lead's roster row lands on the root node;
 * - fold: per parent, settled agent LEAVES (state done/error, never the
 *   current session, never a workflow member's run node) collapse into one
 *   trailing `fold` node carrying the member ids and label previews.
 */
import type { SidebarSessionSummary, SidebarSubagentAddress, SidebarSubagentCatalogEntry, SidebarTeamMemberProjection, SidebarTeamTaskView } from '../context-types.ts';
import type { SidebarChildLiveView } from '../context-types.ts';
import type { WorkflowRunView } from '../workflow-runs.ts';
import { type SubagentCatalogView } from './subagent-catalog.ts';
import type { TeamMemberRow } from './team-projection.ts';
/** Display state of one agent node (drives the dot + fold candidacy). */
export type TasksNodeState = 'running' | 'idle' | 'done' | 'error';
/** One shared task as a node shows it (the board owns the full editing). */
export interface TasksNodeTask {
    id: string;
    subject: string;
    status: 'pending' | 'in_progress' | 'completed';
    /** Not ready = blocked by another task. */
    ready: boolean;
}
/** One agent node (root, subagent, teammate, or synthesized workflow member). */
export interface TasksAgentNode {
    kind: 'agent';
    id: string;
    parentId?: string;
    /** Card line 1: durable label, else summary title, else the id. */
    label: string;
    /** The summary's display title when it differs from the label. */
    title?: string;
    /** The catalog row's mode; `unknown` claims neither and renders nothing. */
    mode?: SidebarSubagentCatalogEntry['mode'];
    state: TasksNodeState;
    /** The catalog's raw activity word (the secondary line localizes it). */
    activity: 'running' | 'inactive';
    /** The on-screen session (the "you are here" marker). */
    current: boolean;
    /** Live tail of a running child (the merged activity + newest text). */
    live?: SidebarChildLiveView;
    /** Team enrichment (roster row matched by session id). */
    team?: {
        role: 'lead' | 'teammate';
        name: string;
        /** Durable lifecycle of the roster row (`provisioning | active | failed`). */
        phase: SidebarTeamMemberProjection['phase'];
        /** The member's derived display status (see ./team-projection.ts). */
        status: TeamMemberRow['status'];
        diagnostics: string[];
    };
    /**
     * Tree depth (the root is 0). Drives the card's GROUP COLOUR: every node of
     * one level wears the same left edge, so a wide graph still reads as bands.
     */
    depth: number;
    /** Workflow phase this node is a member of (workflow runs only). */
    phase?: {
        key: string;
        index: number;
        title?: string;
    };
    /** The catalog's durable children signal (fold candidacy's leaf test). */
    hasChildren?: boolean;
    /** Shared tasks owned by this agent (team boards only; empty otherwise). */
    tasks?: TasksNodeTask[];
    /** Synthesized from a workflow run's member row (no catalog entry). */
    synthesized?: boolean;
    /** Jump target of the row (absent on the root node). */
    childAddress?: SidebarSubagentAddress;
}
/** One workflow run node (its members hang below as agent children). */
export interface TasksWorkflowNode {
    kind: 'workflow';
    id: string;
    parentId: string;
    /** Tree depth (see {@link TasksAgentNode.depth}). */
    depth: number;
    run: WorkflowRunView;
}
/**
 * Which kind of state one fold aggregate holds. The two are SEPARATE rows:
 * mixing them meant the aggregate had to explain itself with a tally and its
 * badge had to hedge ("✓ N 已完成 · N 待命"), and a reader who wanted to sweep
 * the waiting teammates away had to take the finished work with them.
 */
export type TasksFoldKind = 'done' | 'idle';
/** One fold aggregate node (the settled or the waiting children of one parent). */
export interface TasksFoldNode {
    kind: 'fold';
    /** Which group this row is: finished work, or members waiting for a turn. */
    foldKind: TasksFoldKind;
    id: string;
    parentId: string;
    /** Tree depth (see {@link TasksAgentNode.depth}). */
    depth: number;
    count: number;
    /** How many of {@link count} are done (the badge's own count). */
    doneCount: number;
    /** How many are waiting for a turn (待命 idle members, never executing). */
    idleCount: number;
    /** How many ended in a failure (出错); they belong to the `done` group. */
    errorCount: number;
    /** The folded session ids, in original order (expansion restores them). */
    memberIds: string[];
    /** Up to two label previews for the collapsed subtitle. */
    previews: string[];
}
export type TasksNode = TasksAgentNode | TasksWorkflowNode | TasksFoldNode;
/** Inputs of the model build (all already-resolved client mirrors). */
export interface TasksModelInput {
    byId: Readonly<Record<string, SidebarSessionSummary>>;
    /** Per-parent catalog views (DSH 0.1.7 projectors, see {@link subagentCatalogs}). */
    catalogs: Readonly<Record<string, SubagentCatalogView | undefined>>;
    rootId: string;
    currentSessionId: string;
    live: Readonly<Record<string, SidebarChildLiveView | undefined>>;
    runs: readonly WorkflowRunView[];
    teamMembers: readonly TeamMemberRow[];
    /** The team's shared tasks; each lands on its OWNER's node. */
    teamTasks?: readonly SidebarTeamTaskView[];
    /** Whether settled leaves collapse into fold nodes. */
    folded: boolean;
    /**
     * Nodes the READER folded by hand (a settled card's bar chevron). This is a
     * PER-NODE trigger, not a second copy of the global rule, so it only has to
     * satisfy the guards that protect the reader from hiding live work: never a
     * running node, never the current session, never a branching one. It is
     * deliberately NOT subject to {@link isAutoFoldable} — the chevron is drawn
     * on every settled card, and a trigger that cannot fire is a dead control.
     */
    foldedIds?: ReadonlySet<string>;
}
/**
 * How many IDLE team members one parent needs before the page-level rule
 * sweeps them into the aggregate too.
 *
 * A teammate that has finished its turn is `idle`: it is not executing, has
 * nothing in flight, and can be resumed later — the same fact a plain
 * subagent reports as `done`. It used to stay out of the aggregate entirely,
 * so a wide team kept a card per member forever. The count is kept at three
 * on purpose: one or two idle members are the team's working set (and their
 * cards are where a task line shows up), while three or more is a roster the
 * reader is scanning rather than watching. Nothing is lost either way — the
 * aggregate row names the counts and expands on one click.
 */
export declare const FOLD_IDLE_MIN = 3;
/**
 * Build the ordered (pre-order) node list of the Tasks page. The result is
 * stable for a stable input set: catalog order is preserved, runs follow
 * their origin's agent children in startedSeq order, and each fold node
 * trails its parent's remaining children.
 */
export declare function buildTasksModel(input: TasksModelInput): TasksNode[];
/** The parent→child edges of a model (derived, kept out of the build). */
export interface TasksEdge {
    from: string;
    to: string;
    /** Visual class: teammate links and workflow relations get the accent. */
    kind: 'agent' | 'team' | 'workflow';
}
/** Derive the edge list of a built model (pre-order preserved). */
export declare function tasksEdges(nodes: readonly TasksNode[]): TasksEdge[];
