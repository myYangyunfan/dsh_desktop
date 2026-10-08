/**
 * Chunk availability probes + the auto-retry loop for lazy chunk loads.
 *
 * Split out of chunk-loader.ts as PURE functions and an injectable loop
 * (scheduler / probe / load all replaceable) so the retry policy is unit
 * testable without a DOM, network, or the kernel client runtime
 * (dsh-desktop/scripts/test/unit-better-sidebar-chunk-retry.test.js runs
 * this against the //#region src/client/chunk-availability.ts section of
 * the shipped lib/client.js, with node --test + vm).
 *
 * Background (0.5.0 user report): while the kernel process dies/restarts,
 * `window.__DSH_MODULES__` is briefly missing, so a lazy chunk load threw
 * `chunk "editor": client module system unavailable` and the view stayed
 * on its manual-retry error state forever — to a user the sidebar looked
 * bricked. The loop here keeps probing with exponential backoff (2s/4s/
 * 8s/… capped at 30s, unlimited rounds) and wakes subscribed views the
 * moment the module system and chunk come back, so recovery is automatic.
 */

/** First auto-retry delay (ms) after the initial load failure. */
export const CHUNK_RETRY_BASE_DELAY_MS = 2000
/** Backoff ceiling (ms) for chunk auto-retry. */
export const CHUNK_RETRY_MAX_DELAY_MS = 30000

/**
 * Delay before the next auto-retry attempt: base * 2^(failedAttempts-1),
 * capped at max. `failedAttempts` counts loads that already failed
 * (1 = right after the first failure → base). Non-positive/non-finite
 * input is treated as 1 (never 0 / NaN / Infinity delay).
 */
export function nextDelayMs(
  failedAttempts: number,
  base: number = CHUNK_RETRY_BASE_DELAY_MS,
  max: number = CHUNK_RETRY_MAX_DELAY_MS,
): number {
  const n = Number.isFinite(failedAttempts) && failedAttempts >= 1 ? Math.floor(failedAttempts) : 1
  const b = Number.isFinite(base) && base > 0 ? base : CHUNK_RETRY_BASE_DELAY_MS
  const m = Number.isFinite(max) && max > 0 ? max : CHUNK_RETRY_MAX_DELAY_MS
  return Math.min(b * 2 ** (n - 1), Math.max(b, m))
}

/** The client module system surface chunks resolve externals through. */
interface ModuleSystemLike { import?: unknown }

/** Anything global-shaped with the DSH module globals on it. */
export interface GlobalLike {
  __DSH_MODULES__?: ModuleSystemLike | undefined
  /** Plugin-owned page global carrying the injected module system on rc.8+ hosts (see chunk-loader.ts setChunkModuleSystem). */
  __dshSidebarModuleSystem__?: ModuleSystemLike | undefined
  __dshChunks__?: Record<string, unknown> | undefined
}

/**
 * Whether the client module system is present with a callable import —
 * the cheap probe every retry round runs first; while it is down the
 * chunk script is not even fetched. On DSH 0.1.0-rc.8 the shell no longer
 * exposes `window.__DSH_MODULES__`; it injects the system through
 * `ctx.modules`, which the client half mirrors onto the plugin-owned
 * `__dshSidebarModuleSystem__` page global. The legacy `__DSH_MODULES__`
 * global stays a fallback for rc.7-era hosts and the test harness.
 */
export function isModuleSystemAvailable(globalLike: unknown = globalThis): boolean {
  if (globalLike === null || typeof globalLike !== 'object') return false
  const g = globalLike as GlobalLike
  const modules = g.__DSH_MODULES__ ?? g.__dshSidebarModuleSystem__
  return typeof modules === 'object' && modules !== null
    && typeof (modules as ModuleSystemLike).import === 'function'
}

/** Shared error copy for the unavailable case (load + tests assert this). */
export function moduleSystemUnavailableMessage(chunk: string): string {
  return `[dsh-better-sidebar] chunk "${chunk}": client module system unavailable`
}

/** Event a retry loop emits to its subscribers (the mounted lazy views). */
export interface ChunkRetryEvent {
  /** 1-based count of load attempts failed so far (initial failure included). */
  attempt: number
  /** true: the chunk became ready — subscribers re-load and recover. */
  ready: boolean
}

/** Injectable dependencies of {@link createChunkRetryLoop}. */
export interface ChunkRetryLoopOptions {
  /** Probe whether the module system is back (default: the global check). */
  isAvailable?: () => boolean
  /** Attempt the load; resolves when the chunk is ready, rejects on failure. */
  attemptLoad: () => Promise<void>
  /**
   * Scheduler (default: setTimeout). Must return a cancel function.
   * Tests drive the loop deterministically with a manual scheduler.
   */
  schedule?: (fn: () => void, delayMs: number) => () => void
}

/** A running auto-retry loop for one chunk (see chunk-loader.ts for use). */
export interface ChunkRetryLoop {
  /** Subscribe to retry events; the returned function unsubscribes. */
  subscribe(onEvent: (event: ChunkRetryEvent) => void): () => void
  /** Whether the loop is still live (subscribers remain, not done/disposed). */
  readonly active: boolean
  /** Probe immediately (cancel the pending timer); used on page re-focus. */
  poke(): void
  /** Terminal cleanup: cancel the pending timer and drop all subscribers. */
  dispose(): void
}

/**
 * One shared auto-retry loop per chunk: exponential backoff, unlimited
 * rounds, exactly one pending timer however many views subscribe. The
 * loop self-disposes when its last subscriber unsubscribes (a view
 * unmounting can never leak a timer), on success (ready event), or via
 * {@link ChunkRetryLoop.dispose} (plugin HMR reset).
 *
 * Subscriber callbacks are isolated: a throwing view breaks nothing.
 */
export function createChunkRetryLoop(name: string, options: ChunkRetryLoopOptions): ChunkRetryLoop {
  const { isAvailable = () => isModuleSystemAvailable(globalThis), attemptLoad, schedule } = options
  const timer: (fn: () => void, delayMs: number) => () => void = schedule
    ?? ((fn, delayMs) => { const id = setTimeout(fn, delayMs); return () => { clearTimeout(id) } })
  // Starts at 1: the caller's initial load already failed once.
  let fails = 1
  let pending: (() => void) | undefined
  let inFlight = false
  let done = false
  const subscribers = new Set<(event: ChunkRetryEvent) => void>()

  const emit = (event: ChunkRetryEvent): void => {
    for (const onEvent of [...subscribers]) {
      try {
        onEvent(event)
      } catch (error) {
        // A crashing subscriber (a view already torn down mid-render) must
        // not kill the loop for the remaining views.
        console.error(`[dsh-better-sidebar] chunk "${name}" retry subscriber error:`, error)
      }
    }
  }

  const cancelPending = (): void => {
    if (pending !== undefined) {
      pending()
      pending = undefined
    }
  }

  const scheduleProbe = (): void => {
    cancelPending()
    pending = timer(() => { void probe() }, nextDelayMs(fails))
  }

  const finish = (): void => {
    done = true
    cancelPending()
  }

  const probe = async (): Promise<void> => {
    pending = undefined
    if (done) return
    if (!isAvailable()) {
      // Module system still down: count the round, keep the views' waiting
      // copy fresh, back off again. No script fetch is attempted yet.
      fails += 1
      emit({ attempt: fails, ready: false })
      scheduleProbe()
      return
    }
    inFlight = true
    try {
      await attemptLoad()
    } catch {
      inFlight = false
      if (done) return
      fails += 1
      emit({ attempt: fails, ready: false })
      scheduleProbe()
      return
    }
    inFlight = false
    // Success: the chunk is materialized (loadChunk memoizes it), wake every
    // view — they re-run their load effect and render without user action.
    finish()
    emit({ attempt: fails, ready: true })
  }

  return {
    subscribe(onEvent) {
      if (done) throw new Error(`[dsh-better-sidebar] chunk "${name}" retry loop already finished`)
      subscribers.add(onEvent)
      // First subscriber (or first after a manual-retry reset) arms the loop.
      if (pending === undefined && !inFlight) scheduleProbe()
      let subscribed = true
      return () => {
        if (!subscribed) return
        subscribed = false
        subscribers.delete(onEvent)
        // Last view gone → terminal: no timer survives an unmounted view.
        if (subscribers.size === 0) finish()
      }
    },
    get active() {
      return !done
    },
    poke() {
      if (done || inFlight) return
      // Drop the pending backoff timer and probe right now (page became
      // visible again / shell reloaded — browsers throttle hidden-tab
      // timers, so the scheduled tick may still be far away).
      cancelPending()
      void probe()
    },
    dispose() {
      subscribers.clear()
      finish()
    },
  }
}
