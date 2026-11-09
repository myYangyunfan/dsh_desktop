/**
 * Loopback status event stream. One `text/event-stream` response per browser
 * control client, fed by an in-process sampler that writes a frame only when the
 * serialized Host status changes, so an idle Local-mode page receives nothing
 * but keep-alive comments.
 *
 * The stream is a push carrier for the same value the unary `status` control
 * endpoint returns; a reconnecting browser therefore receives the complete
 * current status as its first frame instead of waiting for the next change.
 */
import type { ServerResponse } from 'node:http';
/** Status sampling period used to detect a change without any client request. */
export declare const STATUS_STREAM_SAMPLE_INTERVAL_MS = 1500;
/** Comment-frame period that keeps an idle connection observable to both ends. */
export declare const STATUS_STREAM_HEARTBEAT_INTERVAL_MS = 15000;
/** Reconnect delay advertised to the browser through the SSE `retry` field. */
export declare const STATUS_STREAM_RETRY_MS = 3000;
/** Sampling and keep-alive periods of {@link ControlStatusStream}. */
export interface ControlStatusStreamOptions {
    sampleIntervalMs?: number;
    heartbeatIntervalMs?: number;
    retryMs?: number;
}
/**
 * Owns the loopback status event stream: subscribers, change-detecting sampler,
 * and keep-alive frames. Sampling runs only while at least one subscriber is
 * attached and stops with the last disconnect.
 */
export declare class ControlStatusStream {
    private readonly readStatus;
    private readonly subscribers;
    private readonly sampleIntervalMs;
    private readonly heartbeatIntervalMs;
    private readonly retryMs;
    private timer;
    private sampling;
    private payload;
    private writtenAt;
    private closed;
    /**
     * @param readStatus - reads the current status value, the same value the unary control endpoint returns.
     * @param options - sampling, keep-alive, and reconnect periods.
     */
    constructor(readStatus: () => Promise<unknown>, options?: ControlStatusStreamOptions);
    /**
     * Write the SSE response head, the current status as its first frame, and keep
     * pushing until the client disconnects or {@link close} runs.
     * @param response - the loopback route response, owned for the connection lifetime.
     */
    handle(response: ServerResponse): Promise<void>;
    /** End every open stream and stop sampling. */
    close(): void;
    /** Forget one subscriber; the last one to leave also stops the sampler. */
    private detach;
    private startSampling;
    private stopSampling;
    private sample;
    private readSnapshot;
    /**
     * Write the payload to every subscriber that has not seen it, or one
     * keep-alive comment when the whole connection set is idle.
     */
    private write;
    /** @returns true when the chunk reached a live response. */
    private writeChunk;
}
//# sourceMappingURL=control-stream.d.ts.map