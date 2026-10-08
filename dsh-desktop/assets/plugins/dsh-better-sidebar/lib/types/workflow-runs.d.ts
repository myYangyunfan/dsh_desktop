/**
 * Pure derivation of the workflow-run views shown on the Tasks page: fold one
 * session's event log into the `tool-workflow/*` runs that originated there.
 *
 * The recorder inside DSH's `dsh-tool-workflow` appends exactly four event
 * types to the CALLING agent's session (top-level runs only — nested runs
 * inside workflow agents are never recorded):
 *
 * - `tool-workflow/run-start`   `{ runId, name }`
 * - `tool-workflow/agent-start` `{ runId, seq, label, phase?, childId }`
 * - `tool-workflow/agent-end`   `{ runId, seq, outcome }`
 * - `tool-workflow/run-end`     `{ runId, stopReason }`
 *
 * (Evidence: `dsh-tool-workflow/lib/index.js:37-88`; the official
 * `dsh-client-ui-workflow-run` panel folds the identical four types in the
 * browser.) This module mirrors that fold framework-free so it is
 * unit-testable in the node environment; the host route merges the durable
 * log with the live mirror and the client receives ready-made views.
 */
import type { SidebarSessionEvent } from './context-types.ts';
/** Outcome of one workflow member agent (the domain's closed union). */
export type WorkflowAgentOutcome = 'completed' | 'failed' | 'cancelled';
/** Settled reason of one run (`error` maps to the `failed` display status). */
export type WorkflowStopReason = 'completed' | 'cancelled' | 'error';
/** One member agent of a workflow run (`agent-start` + optional `agent-end`). */
export interface WorkflowRunMemberView {
    /** Worker-side `agent()` call sequence number (pairs start/end). */
    seq: number;
    /** Model-supplied member label. */
    label: string;
    /** Phase grouping title supplied at start (absent = unphased). */
    phase?: string;
    /** The member's child session id — the jump target of the row. */
    childId: string;
    /** Set once `agent-end` lands; absent while the member runs. */
    outcome?: WorkflowAgentOutcome;
}
/** Members of one phase, in first-seen order (title undefined = unphased). */
export interface WorkflowRunPhaseView {
    title?: string;
    members: WorkflowRunMemberView[];
}
/** Display status of one run (the official panel's vocabulary). */
export type WorkflowRunStatus = 'running' | 'completed' | 'cancelled' | 'failed';
/** One folded workflow run as the Tasks page renders it. */
export interface WorkflowRunView {
    runId: string;
    name: string;
    /** The session the run was started from (the events' home session). */
    originSessionId: string;
    status: WorkflowRunStatus;
    /** Settled reason once `run-end` landed (`error` ⇔ status `failed`). */
    stopReason?: WorkflowStopReason;
    /** Phase-grouped members, phases in first-seen order. */
    phases: WorkflowRunPhaseView[];
    /** Seq of the run-start event (stable ordering across runs). */
    startedSeq: number;
    /** Epoch ms of the run-start event (durations and sorting). */
    startedAt: number;
    /** Epoch ms of the run-end event; absent while running. */
    finishedAt?: number;
}
/**
 * Fold one session's event log into its workflow runs, oldest first. Rows
 * referencing an unknown run (a log window that starts mid-run, or a corrupt
 * tail) are skipped — the official panel asserts a leading run-start instead,
 * but the route merges two sources where ordering is guaranteed anyway.
 * @param events - the session's append-only event log (oldest → newest).
 * @param originSessionId - the session the log belongs to.
 * @returns the session's runs in run-start order.
 */
export declare function foldWorkflowRuns(events: readonly SidebarSessionEvent[], originSessionId: string): WorkflowRunView[];
