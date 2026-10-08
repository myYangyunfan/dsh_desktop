/**
 * M2 — per-session ACP kernel state.
 *
 * The in-memory map holds the exact acp-kernel `CompressionState` while a
 * session is live. Durability does not rely on a sidecar file: every durable
 * compression writes a `compaction/summary` event whose shadowed range and
 * summary re-derive the block ledger (`rebuildBlockLedger` in region.ts), so a
 * restarted engine can answer decompress/search/status from the session log
 * alone — DSH's "log is the source of truth" model.
 *
 * Tier-2/3 distillation additionally requires the kernel state to KNOW the
 * blocks: `syncBlocks` deactivates a block whose consumed messages are absent
 * from the message array, and `resolveBoundaries` refuses to anchor a block
 * ref it cannot find — so on first access for a session that already has
 * durable blocks (e.g. after a server restart), the kernel blocks are
 * REHYDRATED from the ledger before use. Live updates continue through `set`.
 * @module billion-context-dsh/state
 */
import type { Session } from '@deepseek-ai/dsh-session';
import { type CompressionState } from 'acp-kernel';
export declare class AcpStateStore {
    /**
     * Live kernel states, capped by an LRU policy (issue #113): once the cap is
     * reached the coldest session's state is dropped, and its next access
     * rehydrates through stateFor's log-rebuild path below. Rehydration is
     * deterministic — bN ids are recorded in the durable event or synthesised
     * in ledger order, and run ids continue after the rehydrated max — so block
     * identity survives eviction exactly as it survives a restart. Kernel
     * fields that reset on eviction (tokenSnapshot, nudge cadence, stats
     * counters) all self-heal on the session's next turn.
     */
    private readonly states;
    constructor(limit?: number);
    /** Kernel state for one session, initialised on first access. */
    stateFor(session: Session): CompressionState;
    set(session: Session, state: CompressionState): void;
    delete(session: Session): void;
}
