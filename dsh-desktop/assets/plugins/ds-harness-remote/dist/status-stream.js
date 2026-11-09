/**
 * Browser-side status feed. One EventSource subscription replaces the fixed
 * interval of unary `status` control calls, and degrades to that interval when
 * the Host exposes no event stream — an older Host, or a carrier whose control
 * channel serves POST only.
 */
/** Fallback poll period: the interval the unary status polling used. */
export const STATUS_STREAM_POLL_INTERVAL_MS = 1_500;
/** How long a stream may deliver nothing before the fallback replaces it. */
export const STATUS_STREAM_OPEN_TIMEOUT_MS = 4_000;
/** EventSource readyState after a permanent failure, where the browser never retries. */
const SOURCE_CLOSED = 2;
/** Parse one SSE payload; a missing or non-object frame keeps the last status. */
function parseStatus(data) {
    if (typeof data !== 'string')
        return undefined;
    try {
        const parsed = JSON.parse(data);
        return parsed === null || typeof parsed !== 'object' ? undefined : parsed;
    }
    catch {
        return undefined;
    }
}
/**
 * Create the status feed.
 * @param options - stream URL, fallback reader, and timing overrides.
 * @returns feed with a stable snapshot accessor and a ref-counted subscription.
 */
export function createStatusFeed(options) {
    const listeners = new Set();
    const pollIntervalMs = options.pollIntervalMs ?? STATUS_STREAM_POLL_INTERVAL_MS;
    const openTimeoutMs = options.openTimeoutMs ?? STATUS_STREAM_OPEN_TIMEOUT_MS;
    const createSource = options.createSource
        ?? ((url) => new EventSource(url));
    let status;
    let source;
    let openTimer;
    let pollTimer;
    const publish = (next) => {
        status = next;
        for (const listener of [...listeners])
            listener(next);
    };
    const teardown = () => {
        if (openTimer !== undefined) {
            clearTimeout(openTimer);
            openTimer = undefined;
        }
        if (pollTimer !== undefined) {
            clearInterval(pollTimer);
            pollTimer = undefined;
        }
        source?.close();
        source = undefined;
    };
    const poll = () => {
        void options.readStatus().then(next => {
            // A read that lands after teardown must not resurrect the subscription.
            if (pollTimer !== undefined)
                publish(next);
        }).catch(() => undefined);
    };
    const fallbackToPolling = (reason) => {
        if (pollTimer !== undefined || listeners.size === 0)
            return;
        if (openTimer !== undefined) {
            clearTimeout(openTimer);
            openTimer = undefined;
        }
        source?.close();
        source = undefined;
        options.onFallback?.(reason);
        poll();
        pollTimer = setInterval(poll, pollIntervalMs);
    };
    const openStream = () => {
        let opened;
        try {
            opened = createSource(options.url);
        }
        catch {
            // A carrier without EventSource support reports the same degradation as a
            // Host without the stream route.
            fallbackToPolling('unsupported');
            return;
        }
        source = opened;
        let received = false;
        openTimer = setTimeout(() => {
            if (!received)
                fallbackToPolling('silent');
        }, openTimeoutMs);
        opened.onmessage = event => {
            received = true;
            if (openTimer !== undefined) {
                clearTimeout(openTimer);
                openTimer = undefined;
            }
            const next = parseStatus(event.data);
            if (next !== undefined)
                publish(next);
        };
        opened.onerror = () => {
            // A permanent failure (a non-2xx response or a non-event-stream content
            // type) closes the source and never retries; a transient one stays
            // CONNECTING, and the browser's own reconnect delivers the current status
            // as the next first frame.
            if (opened.readyState === SOURCE_CLOSED)
                fallbackToPolling('unavailable');
        };
    };
    return {
        getSnapshot: () => status,
        subscribe: listener => {
            listeners.add(listener);
            if (status !== undefined)
                listener(status);
            if (listeners.size === 1)
                openStream();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0)
                    teardown();
            };
        },
        close: () => {
            listeners.clear();
            teardown();
        },
    };
}
//# sourceMappingURL=status-stream.js.map