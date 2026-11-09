/**
 * One package operation through dsh's `pluginManager` service, tracked as the
 * same `RunningInstall` the CLI executor produces: design
 * 2026-09-26-plugin-manager-delegation, section 6. It runs in the same
 * per-profile queue as CLI commands, so the two paths are never concurrent in
 * one profile.
 */
import { type RunningInstall } from './executor.ts';
import { type ManagerOutcome } from './plugin-manager.ts';
import type { Prefetcher } from './prefetch.ts';
/** The first line of every record this runner writes. The shop's log panel
 * shows it and the 0.1.7 e2e asserts it, so a silent fall back to the CLI
 * fails a case instead of passing it. */
export declare const MECHANISM_PREFIX = "via dsh's plugin manager:";
/** Routes the service's `plugin-manager/install-log` chunks to the record
 * whose request id they carry. A chunk for any other id is dropped. dsh
 * tags each chunk with the stream it came from; a non-string stream reads
 * as `stdout`, matching a harness that predates the tag. */
export declare class ManagerLogs {
    private readonly sinks;
    open(requestId: string, sink: (text: string, stream: string) => void): () => void;
    chunk(requestId: unknown, text: unknown, stream?: unknown): void;
}
export interface ManagerOperationOptions {
    profile: string;
    /** The record's id, handed to the service as its request id. */
    requestId: string;
    /** What the mechanism line says after the prefix, e.g. `install dsh-a@1.0.0`. */
    mechanism: string;
    logs: ManagerLogs;
    run: (requestId: string) => Promise<unknown>;
    cancel?: (requestId: string) => Promise<unknown>;
    outcome: (raw: unknown) => ManagerOutcome;
    alsoConfirm?: () => string | null;
    /** The download phase, as on the CLI path: `spec` is what it warms. */
    prefetcher?: Prefetcher;
    spec?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    /** The desktop profile, whose readers can run no `dsh plugin` command: a
     * message the service call throws is scrubbed as dsh's answer is. */
    desktop?: boolean;
    /** The CLI line that retries this operation by hand (design
     * 2026-11-02-market-borrowings §5, 2026-11-06 amendment), or undefined
     * where none can be offered. Attached to a failure only, as the CLI path's
     * own line is: on a success or while running it would read as an
     * instruction. An outcome marked `retry: false` withholds it too. */
    command?: string;
}
/** What a thrown value says about itself, and total: describing an error is
 * never itself the reason a settle fails. An `Error` gives its `message`,
 * anything else `String(value)`. A message that is not a string, or a
 * description that throws anywhere, reads as one fixed string: a Proxy whose
 * getPrototypeOf trap throws defeats `instanceof` itself, a `message` getter
 * can throw, and a null-prototype object has no conversion to a string. */
export declare const messageOf: (error: unknown) => string;
export declare function startManagerOperation(options: ManagerOperationOptions): RunningInstall;
/**
 * `first`, continued by the record `next` starts when `first` ends refused,
 * as one record under `first`'s id: design 2026-10-19-dsh-021-readiness,
 * section 2. dsh-plugin-manager 0.2.1-rc.2 refuses an update in place as
 * `already-installed`, and the gateway continues such an update through
 * dsh's CLI. One record, so the client keeps polling the id it was given,
 * and the restart gate and eviction, which read every tracked record, see
 * the command that runs.
 *
 * While `first` runs, this is `first`. Whether it continues is decided once,
 * when `first` ends: the first `status()` read or `first.finished` settling
 * that sees `first` terminal asks `refused`, and that answer is kept. So a
 * caller may set its flag while reading the answer that ends `first`, and a
 * flag flipped after that changes neither `status()` nor `finished`, which
 * answer from that one decision. Not refused, this stays `first`. Refused,
 * `next` runs, exactly once, at that same read or finish, so no read between
 * the refusal and the next command reports the refusal. From then on the
 * record is `next`'s, its state, detail and activation, with `first`'s log,
 * then `bridge`, then `next`'s log. That log joins two bounded logs and the
 * bridge, so a continued record can carry about twice `MAX_LOG_LINES` and
 * `MAX_LOG_BYTES`, where one record of `startManagerOperation` carries at most
 * one line over them.
 */
export declare function continueAfter(first: RunningInstall, refused: () => boolean, next: () => RunningInstall, bridge: string): RunningInstall;
