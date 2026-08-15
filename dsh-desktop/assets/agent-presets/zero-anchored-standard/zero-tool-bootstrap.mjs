/**
 * Zero-tool bootstrap — keep the FIRST top-level model request on an EMPTY
 * tool surface, then expose the full preset catalog once the anchor turn has
 * produced its first durable assistant message.
 *
 * This is the extra test mode behind `zero-anchored-standard`: the anchor
 * plugin seeds a fixed user message and this filter strips the whole catalog,
 * so the first real request follows the zero-injection "we" trajectory. After
 * that assistant response is durable, every later request sees the full
 * Standard catalog.
 *
 * Robustness:
 *  - Promotion decisions are memoized per session id for this process; the
 *    durable event scan runs once per session per process, then O(1).
 *  - Subagents and non-top-level agents always see the full catalog: their
 *    first request must be able to call tools.
 *  - A filter failure degrades to the full catalog with a one-time warning,
 *    so a bug can never brick every request of a session.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'zero-tool-bootstrap'

/** Prompt assembly must exist before this request filter can register. */
export const inject = ['systemPrompt']

/** Register the per-session bootstrap filter. */
export function apply(ctx) {
  /** Sessions already promoted in this process. Promotion is append-only, so a Set is sound. */
  const promoted = new Set()
  let warned = false
  const warnOnce = (message) => {
    if (warned) return
    warned = true
    try {
      ctx.logger.warn(message)
    } catch {
      // Logger unavailable — the guard exists only to avoid spamming.
    }
  }

  /**
   * Whether the session has reached the promoted (full-catalog) phase.
   * @param agent - the assembly context's agent, or undefined outside an agent.
   */
  const isPromoted = (agent) => {
    if (agent === undefined) return true
    const session = agent.session
    if (session === undefined) return true
    // Subagents keep their full catalog from their very first request.
    if ((session.header.delegationDepth ?? 0) > 0) return true
    if (promoted.has(session.id)) return true
    const hit = session.events.some((event) => event.type === 'assistant/message')
    if (hit) promoted.add(session.id)
    return hit
  }

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    // Downstream errors propagate untouched; only this filter's own logic is guarded.
    const assembled = await next()
    try {
      if (isPromoted(context.agent)) return assembled
      return { ...assembled, tools: [] }
    } catch (error) {
      // A filter bug must never brick a session: degrade to the full catalog.
      warnOnce(`${name}: bootstrap filter failed, exposing the full catalog: ${String((error && error.message) || error)}`)
      return assembled
    }
  })
}
