/**
 * dsh-basics-panel host half: a single fenced /basics JSON API that merges
 * every feature backend's methods. The route passes the same browser-trust
 * fence as the /api gateway (loopback or `webRuntime.trustedHosts`), and each
 * feature re-resolves its own authorities (the skill registry for skill
 * paths, the composition scan for MCP files) so the panel never trusts a
 * client-supplied path alone.
 */
import { resolveBasicsConfig, Config, type ResolvedBasicsConfig } from './config.ts'
import { BasicsError, readJsonBody, writeOk, writeError } from './wire.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import { collectApi, type HostFeature } from './features/registry.ts'
import { registerSkills } from './features/skills/skills-service.ts'
import { registerMcp } from './features/mcp/mcp-service.ts'
import { registerRules } from './features/rules/rules-service.ts'
import { registerArchived } from './features/archived/archived-service.ts'
import type { Context, BasicsHttpRequest } from './context-types.ts'

export { Config }
export type { ResolvedBasicsConfig }
export type { Context }

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-basics-panel'

/** Services required before mounting. */
export const inject = ['webServer', 'webRuntime', 'sessions', 'skills', 'tools']

/**
 * Resolve a session's authoritative working directory. The session header
 * wins; the client summary cwd is the fallback while the session is still
 * hydrating; the process cwd is the last resort.
 */
function sessionCwdOf(ctx: Context, payload: unknown): string {
  const record = payload as Record<string, unknown> | null
  const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
  if (sessionId !== '') {
    const headerCwd = ctx.sessions.get(sessionId)?.header.cwd
    if (headerCwd !== undefined && headerCwd !== '') return headerCwd
  }
  const clientCwd = typeof record?.cwd === 'string' ? record.cwd : ''
  if (clientCwd !== '') return clientCwd
  return process.cwd()
}

/**
 * Plugin body: mount the fenced routes over the merged feature APIs.
 * @param ctx - host plugin context (webServer, webRuntime, sessions, skills, tools).
 * @param config - deployment limits; the Loader validates against {@link Config}.
 */
export function apply(ctx: Context, config?: Partial<ResolvedBasicsConfig>): void {
  const resolved = resolveBasicsConfig(config)
  const fc = { ctx, resolved, sessionCwdOf: (payload: unknown) => sessionCwdOf(ctx, payload) }
  const features: HostFeature[] = [
    { id: 'skills', register: registerSkills },
    { id: 'mcp', register: registerMcp },
    { id: 'rules', register: registerRules },
    { id: 'archived', register: registerArchived },
  ]
  const api = collectApi(features, fc)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/basics/api',
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)) {
        writeError(res, new BasicsError('forbidden', 'forbidden', 403))
        return
      }
      if (req.method !== 'POST') {
        writeError(res, new BasicsError('method-error', 'method not allowed', 405))
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/basics/api/') ? pathname.slice('/basics/api/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        writeError(res, new BasicsError('not-found', 'unknown basics API method', 404))
        return
      }
      try {
        const payload = await readJsonBody(req as BasicsHttpRequest, resolved.maxBodyBytes)
        const handler = api[method]
        if (handler === undefined) {
          throw new BasicsError('not-found', `unknown basics API method "${method}"`, 404)
        }
        writeOk(res, await handler(payload))
      } catch (error) {
        writeError(res, error)
      }
    },
  }), 'dsh-basics-panel: /basics/api routes')
}
