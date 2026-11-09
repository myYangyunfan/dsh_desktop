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
/** Status sampling period used to detect a change without any client request. */
export const STATUS_STREAM_SAMPLE_INTERVAL_MS = 1_500;
/** Comment-frame period that keeps an idle connection observable to both ends. */
export const STATUS_STREAM_HEARTBEAT_INTERVAL_MS = 15_000;
/** Reconnect delay advertised to the browser through the SSE `retry` field. */
export const STATUS_STREAM_RETRY_MS = 3_000;
const KEEP_ALIVE_FRAME = ': keep-alive\n\n';
/**
 * Owns the loopback status event stream: subscribers, change-detecting sampler,
 * and keep-alive frames. Sampling runs only while at least one subscriber is
 * attached and stops with the last disconnect.
 */
export class ControlStatusStream {
    readStatus;
    subscribers = new Set();
    sampleIntervalMs;
    heartbeatIntervalMs;
    retryMs;
    timer;
    sampling = false;
    payload;
    writtenAt = 0;
    closed = false;
    /**
     * @param readStatus - reads the current status value, the same value the unary control endpoint returns.
     * @param options - sampling, keep-alive, and reconnect periods.
     */
    constructor(readStatus, options = {}) {
        this.readStatus = readStatus;
        this.sampleIntervalMs = options.sampleIntervalMs ?? STATUS_STREAM_SAMPLE_INTERVAL_MS;
        this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? STATUS_STREAM_HEARTBEAT_INTERVAL_MS;
        this.retryMs = options.retryMs ?? STATUS_STREAM_RETRY_MS;
    }
    /**
     * Write the SSE response head, the current status as its first frame, and keep
     * pushing until the client disconnects or {@link close} runs.
     * @param response - the loopback route response, owned for the connection lifetime.
     */
    async handle(response) {
        if (this.closed) {
            response.writeHead(503);
            response.end();
            return;
        }
        response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-store',
            connection: 'keep-alive',
        });
        try {
            response.write(`retry: ${String(this.retryMs)}\n\n`);
        }
        catch {
            // A client that vanished before its first frame leaves no stream to own.
            return;
        }
        const subscriber = { response, payload: undefined };
        this.subscribers.add(subscriber);
        const detach = () => { this.detach(subscriber); };
        response.on('close', detach);
        response.on('error', detach);
        this.startSampling();
        // The first frame is the current status: a fresh page paints from one pushed
        // value, and a reconnecting page recovers the latest state immediately. A
        // failed read leaves the reader on the last known frame instead of opening
        // with nothing.
        this.write((await this.readSnapshot()) ?? this.payload);
    }
    /** End every open stream and stop sampling. */
    close() {
        this.closed = true;
        this.stopSampling();
        for (const subscriber of [...this.subscribers]) {
            try {
                subscriber.response.end();
            }
            catch {
                // A client that vanished mid-close has no stream left to end.
            }
        }
        this.subscribers.clear();
        this.payload = undefined;
    }
    /** Forget one subscriber; the last one to leave also stops the sampler. */
    detach(subscriber) {
        this.subscribers.delete(subscriber);
        if (this.subscribers.size === 0)
            this.stopSampling();
    }
    startSampling() {
        if (this.closed || this.timer !== undefined)
            return;
        this.timer = setInterval(() => { void this.sample(); }, this.sampleIntervalMs);
    }
    stopSampling() {
        if (this.timer === undefined)
            return;
        clearInterval(this.timer);
        this.timer = undefined;
    }
    async sample() {
        if (this.sampling || this.closed)
            return;
        this.sampling = true;
        try {
            const snapshot = await this.readSnapshot();
            if (snapshot !== undefined && !this.closed)
                this.write(snapshot);
        }
        finally {
            this.sampling = false;
        }
    }
    async readSnapshot() {
        try {
            const value = await this.readStatus();
            return value === undefined ? undefined : JSON.stringify(value) ?? undefined;
        }
        catch {
            // An unreadable status keeps the last frame; the unary control endpoint
            // reports the same failure to its own caller.
            return undefined;
        }
    }
    /**
     * Write the payload to every subscriber that has not seen it, or one
     * keep-alive comment when the whole connection set is idle.
     */
    write(snapshot) {
        if (snapshot === undefined || this.subscribers.size === 0)
            return;
        const now = Date.now();
        const fresh = [...this.subscribers].filter(subscriber => subscriber.payload !== snapshot);
        if (fresh.length > 0) {
            const frame = `data: ${snapshot}\n\n`;
            for (const subscriber of fresh) {
                if (this.writeChunk(subscriber, frame))
                    subscriber.payload = snapshot;
                else
                    this.detach(subscriber);
            }
            this.payload = snapshot;
            this.writtenAt = now;
            return;
        }
        if (now - this.writtenAt < this.heartbeatIntervalMs)
            return;
        for (const subscriber of [...this.subscribers]) {
            if (!this.writeChunk(subscriber, KEEP_ALIVE_FRAME))
                this.detach(subscriber);
        }
        this.writtenAt = now;
    }
    /** @returns true when the chunk reached a live response. */
    writeChunk(subscriber, chunk) {
        if (subscriber.response.destroyed || subscriber.response.writableEnded)
            return false;
        try {
            subscriber.response.write(chunk);
            return true;
        }
        catch {
            // A socket error surfaces through the response `error` listener, which
            // detaches the subscriber.
            return false;
        }
    }
}
//# sourceMappingURL=control-stream.js.map