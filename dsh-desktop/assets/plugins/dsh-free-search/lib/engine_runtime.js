/**
 * Per-engine concurrency limit and in-process call statistics.
 *
 * Multi mode and overlapping user calls can hit the same engine at once; without
 * a gate a free HTML engine gets several requests in the same second and starts
 * serving captchas. The stats feed the doctor report ("why is this engine not
 * being used" plus how it has been behaving).
 */

export function createEngineRuntime({ now = () => Date.now() } = {}) {
  const active = new Map();
  const waiters = new Map();
  const stats = new Map();

  const ensure = (engine) => {
    if (!stats.has(engine)) stats.set(engine, { calls: 0, ok: 0, empty: 0, fail: 0, totalMs: 0, lastErrorClass: "" });
    return stats.get(engine);
  };
  const bucket = (engine) => {
    if (!active.has(engine)) active.set(engine, 0);
    if (!waiters.has(engine)) waiters.set(engine, []);
    return { waiters: waiters.get(engine), active };
  };

  function acquire(engine, limit, signal) {
    const state = bucket(engine);
    if ((active.get(engine) ?? 0) < limit) {
      active.set(engine, (active.get(engine) ?? 0) + 1);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const waiter = () => {
        cleanup();
        active.set(engine, (active.get(engine) ?? 0) + 1);
        resolve();
      };
      const onAbort = () => {
        cleanup();
        const list = state.waiters;
        const at = list.indexOf(waiter);
        if (at >= 0) list.splice(at, 1);
        reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
      };
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      if (signal) {
        if (signal.aborted) {
          reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
      state.waiters.push(waiter);
    });
  }

  function release(engine) {
    active.set(engine, Math.max(0, (active.get(engine) ?? 1) - 1));
    const list = waiters.get(engine) ?? [];
    const next = list.shift();
    if (next) next();
  }

  async function run(engine, limit, fn, { signal } = {}) {
    await acquire(engine, Math.max(1, limit), signal);
    try {
      return await fn();
    } finally {
      release(engine);
    }
  }

  function record(engine, { ms, sources = 0, error } = {}) {
    const entry = ensure(engine);
    entry.calls += 1;
    if (error) {
      entry.fail += 1;
      if (typeof error.class === "string") entry.lastErrorClass = error.class;
    } else if (sources > 0) {
      entry.ok += 1;
    } else {
      entry.empty += 1;
    }
    if (Number.isFinite(ms) && ms >= 0) entry.totalMs += ms;
  }

  function snapshot() {
    const out = {};
    for (const [engine, entry] of stats) {
      out[engine] = {
        calls: entry.calls,
        ok: entry.ok,
        empty: entry.empty,
        fail: entry.fail,
        avgMs: entry.calls > 0 ? Math.round(entry.totalMs / entry.calls) : 0,
        lastErrorClass: entry.lastErrorClass,
      };
    }
    return out;
  }

  return { run, record, snapshot, now };
}

/** Default limit per engine: scraped HTML pages are more fragile than APIs. */
export const ENGINE_CONCURRENCY_LIMIT = 2;
export const SERP_CONCURRENCY_LIMIT = 1;
