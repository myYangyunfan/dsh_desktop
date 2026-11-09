/**
 * Serialize settings writes and leave DSH's HMR AsyncLocalStorage context
 * before invoking configEditor. Otherwise a callback reached from a reload is
 * treated as a nested transaction. The pump is kept on globalThis so a hot
 * reload reuses the same queue.
 */
const PUMP_KEY = Symbol.for('ds-harness-remote.hmr-safe-settings-pump');
function createPump() {
    const queue = [];
    let wake;
    let sleeping = new Promise(resolve => { wake = resolve; });
    // Do not await this from plugin activation. Its continuation is deliberately
    // left at module initialization, outside the HMR transaction that may reload
    // the plugin later.
    void (async () => {
        for (;;) {
            if (queue.length === 0) {
                await sleeping;
                sleeping = new Promise(resolve => { wake = resolve; });
            }
            const job = queue.shift();
            if (job === undefined)
                continue;
            try {
                job.resolve(await job.run());
            }
            catch (error) {
                job.reject(error);
            }
        }
    })();
    return {
        enqueue(run) {
            return new Promise((resolve, reject) => {
                queue.push({ run, resolve: resolve, reject });
                wake();
            });
        },
    };
}
const globalState = globalThis;
const pump = globalState[PUMP_KEY] ?? (globalState[PUMP_KEY] = createPump());
export function runHmrSafe(run, hmr) {
    return pump.enqueue(() => {
        const executing = hmr?.executing;
        return typeof executing?.exit === 'function' ? executing.exit(run) : run();
    });
}
//# sourceMappingURL=hmr-safe-settings.js.map