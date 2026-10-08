/**
 * Process-local live assistant stream buffer (DSH 0.1.5+).
 *
 * 0.1.2 appended a durable `assistant/chunk` session event for every model
 * delta, so the side-chat transcript and the inherited in-progress snapshot
 * could read streaming text straight out of the session log. 0.1.5 removed
 * that event: an in-flight attempt now publishes `agent/assistant-stream`
 * frames (start / chunk / end) that are NOT part of the log, and the durable
 * record lands only at settlement — `assistant/message` (with the exact
 * `stream` embedded) or `assistant/attempt` (a failed attempt that committed
 * no message, also with its `stream`).
 *
 * This module folds those frames into a bounded per-session buffer of
 * normalized chunks — the same information the old `assistant/chunk` events
 * carried — so the plugin keeps a live transcript and an honest in-progress
 * snapshot. The buffer is cleared when an attempt ends, so a settled step
 * never duplicates its durable message.
 */
import type { Context } from './context-types.ts';
/** One normalized live delta, keyed by its attempt and dense position. */
export interface AssistantLiveChunk {
    /** The attempt these chunks belong to (DSH `LlmAttemptId`). */
    readonly attemptId: string;
    /** The turn the attempt belongs to. */
    readonly turn: number;
    /** The step the attempt belongs to. */
    readonly step: number;
    /** Dense zero-based position within the attempt (DSH's own index). */
    readonly index: number;
    /** Safe-integer timestamp of the frame (reused by the durable stream). */
    readonly time: number;
    /** The raw model stream chunk (`text-delta` / `reasoning-delta` / …). */
    readonly chunk: Record<string, unknown>;
}
/** The plugin's read face over the live frames of every session. */
export interface AssistantLiveBuffer {
    /**
     * The live chunks of one session's active attempt, in index order.
     * @param sessionId - the session whose attempt is streaming.
     * @returns the chunks; empty when nothing is streaming for that session.
     */
    chunksFor(sessionId: string): readonly AssistantLiveChunk[];
    /** Stop observing the agent stream. */
    dispose(): void;
}
/** Per-attempt buffer ceiling; beyond it the oldest deltas are dropped. */
export declare const LIVE_CHUNK_CAP = 4000;
/** How many sessions may hold a live buffer at once (the oldest is dropped). */
export declare const LIVE_SESSION_CAP = 64;
/**
 * Fold `agent/assistant-stream` frames into per-session live buffers.
 *
 * Frames arrive for every attached agent, so the buffer is keyed by the
 * emitting session and ignores anything it cannot identify. An out-of-order
 * or mismatched chunk drops the attempt rather than splicing a gap: a
 * transcript with a hole is worse than one that settles at the next durable
 * event.
 * @param ctx - host plugin context (its `on` subscribes the session feed).
 * @param cap - per-attempt chunk ceiling.
 * @returns the read face and a disposer unbinding the listener.
 */
export declare function createAssistantLiveBuffer(ctx: Context, cap?: number): AssistantLiveBuffer;
