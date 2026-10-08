/**
 * Host-side feature registry: the extension seam for future visualizations.
 * A feature contributes one id plus a bag of API methods; the shell merges
 * every feature's methods into the single /basics JSON API and fails loud on
 * a duplicate method name. Adding a new visualization means adding a
 * src/features/<id>/ directory and one line in the feature list, without
 * touching the route shell.
 */
import type { Context } from '../context-types.ts'
import type { ResolvedBasicsConfig } from '../config.ts'

/** Everything a feature backend needs to build its API methods. */
export interface FeatureContext {
  ctx: Context
  resolved: ResolvedBasicsConfig
  /** Resolve a session's authoritative cwd from a request payload. */
  sessionCwdOf: (payload: unknown) => string
}

/** One host feature backend. */
export interface HostFeature {
  id: string
  /** Build this feature's method-name → handler table. */
  register(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown>
}

/** Merge every feature's methods; throw on a duplicate method name. */
export function collectApi(features: HostFeature[], fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown> {
  const api: Record<string, (payload: unknown) => Promise<unknown> | unknown> = {}
  for (const feature of features) {
    const methods = feature.register(fc)
    for (const [method, handler] of Object.entries(methods)) {
      if (api[method] !== undefined) {
        throw new Error(`basics-panel: duplicate API method "${method}" (from feature "${feature.id}")`)
      }
      api[method] = handler
    }
  }
  return api
}
