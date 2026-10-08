/**
 * Structural types for the cordis services this plugin consumes, plus the
 * Context augmentation both halves share. A third-party plugin resolves
 * outside the DSH monorepo's single cordis instance, so the upstream
 * `declare module 'cordis'` augmentations do not reach this Context — and the
 * npm cordis package does not declare the DSH-vendored runtime members
 * (`ctx.effect`, service properties). The members below mirror the actual
 * runtime shapes this plugin touches:
 * - webServer: @deepseek-ai/dsh-host-webserver (the WebServer)
 * - sessions: host side @deepseek-ai/dsh-session (SessionStore), client side
 *   the runtime ISessions list feed
 * - webRuntime: @deepseek-ai/dsh-web-app (bind-derived trusted hosts)
 * - skills: @deepseek-ai/dsh-skill (the layered skill registry)
 * - tools: @deepseek-ai/dsh-tools (ToolRuntime; `schemas()` for MCP status)
 * - loader: @deepseek-ai/cordis-plugin-loader (mounted entry tree)
 * - agentPresets: @deepseek-ai/dsh-agent-preset-registry (optional roster; the
 *   package was renamed from `dsh-agent-presets`, the service name did not change)
 * - workspaceRegistry: @deepseek-ai/dsh-workspace (WorkspaceRegistry; the
 *   registry-global archived-session set and the Workspace rows)
 * - sessionPersistence: @deepseek-ai/dsh-session-persistence (stored-session
 *   listing; the archived feature reads headers, sizes, and event counts)
 * - storageDomain: @deepseek-ai/dsh-storage-domain (the `workspace` domain's
 *   global singleton, read for the archived feature's fallback writer)
 * - slots: the client runtime SlotRegistry
 * - locale: the client runtime locale service
 * Drift from upstream is contained to this file.
 *
 * Compatibility note (DSH 0.2.0): the startup pre-check in
 * `@deepseek-ai/dsh-app-boot` (`evaluatePluginCompatibility`) tests every
 * peer whose name is `@deepseek-ai/dsh` or starts with `@deepseek-ai/dsh-`
 * against the running runtime with
 * `semver.satisfies(runtime, range, { includePrerelease: true })` and refuses
 * the WHOLE plugin when one range misses. `includePrerelease` makes
 * prereleases compare normally, so `^0.1.2-rc.1` already covers the whole
 * 0.1.x line (0.1.5-rc.3 and 0.1.7-rc.2 included); what it cannot cover is
 * 0.2.x, because a 0.x caret stops below the next minor (`<0.1.3`). Hence
 * `@deepseek-ai/dsh-home-paths` is declared as
 * `^0.1.2-rc.1 || >=0.2.0-rc.1 <0.3.0`; the `resolveDshHome` and
 * `dshHomeDisplay` functions read from it are unchanged across both lines.
 * When a 0.3.x line appears, extend that tuple list in package.json too.
 *
 * This file must stay FREE of Node.js types (`node:http`, `node:stream`,
 * `Buffer`): it is part of the CLIENT-reachable declaration graph, so a Node
 * import here would leak into browser-only consumer builds.
 */
import type { Context } from 'cordis'

/** The request face route handlers see (structural subset of node's IncomingMessage). */
export interface BasicsHttpRequest {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>
}

/** The response face route handlers write to (structural subset of node's ServerResponse). */
export interface BasicsHttpResponse {
  statusCode: number
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string | Uint8Array): void
}

/** One named webserver route (mirror of the host-webserver WebRoute). */
export interface BasicsWebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: BasicsHttpRequest, res: BasicsHttpResponse) => void | Promise<void>
}

/** The webServer service face this plugin uses. */
export interface BasicsWebServer {
  register(route: BasicsWebRoute): () => void
}

/** The web runtime service face: the bind-derived trust list for the browser fence. */
export interface BasicsWebRuntime {
  trustedHosts: readonly string[]
}

/** A published session's header slice the host reads (authoritative cwd). */
export interface BasicsSessionHeader {
  cwd?: string
}

/** The host session store face (`ctx.sessions.get(id)` returns the live session). */
export interface BasicsSessionStore {
  get(id: string): { header: BasicsSessionHeader } | undefined
}

/** One skill's invocation policy (mirror of dsh-skill's resolved invocation). */
export interface SkillInvocation {
  modelInvocable: boolean
  userInvocable: boolean
}

/** A winning skill summary (mirror of dsh-skill's `toSummary`). */
export interface SkillSummary {
  name: string
  description: string
  whenToUse?: string
  invocation: SkillInvocation
  source: string
  provider: string
  resourceBase?: { kind: string; path?: string; url?: string; description?: string }
}

/** A full loaded skill (mirror of dsh-skill's definition). */
export interface SkillDefinition extends SkillSummary {
  content: string
  path?: string
  metadata?: Record<string, unknown>
}

/** The `ctx.skills` face this plugin uses. */
export interface BasicsSkillRegistry {
  snapshot(options?: { cwd?: string; scope?: ScopeKey }): Promise<{ skills: SkillSummary[]; complete: boolean }>
  get(name: string, options?: { cwd?: string; scope?: ScopeKey }): Promise<SkillDefinition | undefined>
}

/** One visible tool schema (mirror of dsh-tools' `schemas()` row). */
export interface VisibleToolSchema {
  name: string
  description?: string
}

/** The `ctx.tools` face this plugin uses. */
export interface BasicsToolRuntime {
  schemas(): VisibleToolSchema[]
}

/** One loader entry option slice (mirror of cordis-plugin-loader EntryOptions). */
export interface LoaderEntryOptions {
  id: string
  name: string
  config?: Record<string, unknown>
  disabled?: boolean | null
  inject?: unknown
  group?: boolean | null
}

/** One mounted loader entry (mirror of cordis-plugin-loader Entry). */
export interface LoaderEntry {
  id: string
  options: LoaderEntryOptions
  /** Effective disabled state (self or an owning parent entry). */
  disabled: boolean
}

/** The `ctx.loader` face this plugin uses (the mounted entry tree). */
export interface BasicsLoader {
  entries(): Iterable<LoaderEntry>
}

/**
 * One agent-preset roster row (mirror of the agent-preset registry's `list()`,
 * `@deepseek-ai/dsh-agent-preset-registry` in DSH ≥0.1.7 — the package was
 * renamed from `dsh-agent-presets`, the `agentPresets` service name did not
 * change).
 *
 * Directory presets (DSH ≤0.1.6) are never read through this face by the
 * plugin: `features/mcp/composition-scan.ts` only uses the service's presence
 * to decide whether the legacy `$DSH_HOME/.agent-presets/` directory scan is
 * still relevant, so the pre-0.1.6 fields below are kept as inert shape only.
 * The activation state that matters lives on {@link AgentPresetComposition},
 * where `isDefault` actually is.
 */
export interface AgentPresetRow {
  id: string
  /** Directory-based preset layout (DSH ≤0.1.6 only). */
  trust?: 'system' | 'user' | string
  /** Composition file of a directory-based preset (DSH ≤0.1.6 only). */
  path?: string
  name?: string
  description?: string
  /** Roster position (DSH ≥0.1.7). */
  order?: number
  /** Why this preset cannot compose a session (DSH ≥0.1.7). */
  broken?: string
}

/** One row of a preset's declaration or activated composition (mirror of the registry's inventory row). */
export interface AgentPresetCompositionRow {
  /** Entry id relative to the preset's Loader tree, or the declared id before activation. */
  entryId: string | null
  /** Module specifier the row names. */
  moduleName: string
  /** Effective enablement; `'conditional'` marks an unevaluated `!!js` expression. */
  enabled: boolean | 'conditional'
  /** The row's own `!!js` disabled expression, when it carries one. */
  condition?: string
  /**
   * The row's root cordis fiber state (the numeric `FiberState` enum: 0 PENDING,
   * 1 LOADING, 2 ACTIVE, 3 FAILED, 4 DISPOSED, 5 UNLOADING), present only when
   * the composition is live. A declared-but-unmounted row omits it entirely.
   */
  fiberState?: number
}

/** One preset's roster identity beside its flattened composition. */
export interface AgentPresetComposition {
  id: string
  name?: string
  isDefault: boolean
  /** Why this preset's rows cannot be read; absent when `rows` answers. */
  broken?: string
  rows: readonly AgentPresetCompositionRow[]
}

/** The optional `ctx.agentPresets` roster face. */
export interface BasicsAgentPresets {
  list(): Promise<AgentPresetRow[]>
  /** Declared or activated composition rows (DSH ≥0.1.7); absent on older hosts. */
  compositionInventory?(): Promise<AgentPresetComposition[]>
}

/** An opaque agent scope key (the live Agent object doubles as its scope key). */
export type ScopeKey = object

/**
 * The Agent slice this plugin reads (mirror of dsh-agent's `Agent`).
 * `idle` means no driver is active; `running` spans the pre-step processing and
 * the driver draining/closing/checkpointing turns. Disposal removes the Agent
 * from its registry, so there is no third observable status.
 */
export interface BasicsAgent extends ScopeKey {
  readonly status: 'idle' | 'running'
  /** Shared agent/session identity (reported when this Agent backs a scope fallback). */
  readonly id?: string
}

/**
 * The optional `ctx.agents` face: the live Agent registry. `get()` returns the
 * Agent — which doubles as the skill-scope key — or undefined when no Agent is
 * attached to that session in THIS process (a merely stored session has none).
 * `roots()`/`list()` back the scope fallback used when the client cannot name
 * the session it is rendering (see features/skills/skills-service.ts).
 */
export interface BasicsAgents {
  get(id: string): BasicsAgent | undefined
  /** Every live top-level Agent, in registration order. */
  roots?(): BasicsAgent[]
  /** Every live Agent, in registration order. */
  list?(): BasicsAgent[]
}

/** One Workspace's session account (subset of dsh-workspace's `Workspace`). */
export interface BasicsWorkspace {
  readonly id: string
  readonly sessionIds: readonly string[]
  /** Remove a session from this workspace's durable account (idempotent). */
  detachSession(sessionId: string): Promise<void>
}

/**
 * The `ctx.workspaceRegistry` face this plugin uses. `archivedSessionIds` is
 * the registry-global archive set (the durable display filter that hides a
 * session from every grouping surface); `unarchiveSession` only exists on DSH
 * builds that ship the upstream unarchive API, so callers must feature-detect
 * it and fall back to the domain write path otherwise.
 */
export interface BasicsWorkspaceRegistry {
  readonly archivedSessionIds: readonly string[]
  list(): BasicsWorkspace[]
  unarchiveSession?(sessionId: string): Promise<void>
}

/** One stored-session observation (mirror of dsh-session-persistence's snapshot). */
export interface BasicsStoredSession {
  readonly header: {
    readonly id: string
    readonly cwd?: string
    readonly createdAt?: number
    readonly parentSession?: string
    readonly origin?: string
    readonly delegationDepth?: number
  }
  /** Logical event count, when the backend reports it cheaply. */
  readonly eventCount?: number
  /** Physical artifact byte size, when the backend reports it cheaply. */
  readonly sizeBytes?: number
}

/** The `ctx.sessionPersistence` face this plugin uses. */
export interface BasicsSessionPersistence {
  list(options?: { signal?: AbortSignal }): Promise<readonly BasicsStoredSession[]>
}

/** A domain global-singleton handle (mirror of dsh-storage-domain's `DomainGlobal`). */
export interface BasicsDomainGlobal {
  get(): unknown
  set(value: unknown): Promise<void>
}

/** The `ctx.storageDomain` facility face: the diagnostic lookup of one open domain. */
export interface BasicsStorageDomain {
  get(name: string): { readonly global?: BasicsDomainGlobal } | undefined
}

/** Registration options the client passes to `ctx.slots.register` (subset). */
export interface BasicsSlotRegisterOptions {
  name: string
  id?: string
  order?: number
  label?: string | (() => string)
  inject?: (...args: any[]) => Record<string, unknown>
}

/** The client slots service face. */
export interface BasicsSlotsService {
  register(options: BasicsSlotRegisterOptions, component: unknown): () => void
  /** Run a callback for each declaration lifetime of a slot (no-op while undeclared). */
  inject(key: string, callback: () => () => void): () => void
}

/** One client session list row (cwd for skill scoping, retention for "current"). */
export interface BasicsSessionSummary {
  id: string
  cwd?: string
  displayTitle: string
  /**
   * Retention counters keyed by consumer source. The main conversation view
   * retains the session it shows under `mainView`, which is how DSH ≥0.1.7
   * spells "the current session"; older snapshots carried a `current` field
   * instead.
   */
  retainedBy?: Readonly<Record<string, number>>
}

/** The client session list snapshot. */
export interface BasicsSessionList {
  /** Current session id (DSH ≤0.1.6); absent from DSH ≥0.1.7 snapshots. */
  current?: string | undefined
  /** Host session order (DSH ≥0.1.7). */
  ids?: readonly string[]
  byId: Record<string, BasicsSessionSummary>
}

/** The client sessions service face (only the list feed is needed). */
export interface BasicsSessionsService {
  list: {
    getSnapshot(): BasicsSessionList
    subscribe(fn: () => void): () => void
  }
  /** Re-pull the host session-list baseline; present on the client sessions service. */
  refresh?(): Promise<void>
}

/** The client locale service face. */
export interface BasicsLocaleService {
  getSnapshot(): { active: string }
  subscribe(fn: () => void): () => void
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

declare module 'cordis' {
  interface Context {
    webServer: BasicsWebServer
    sessions: BasicsSessionStore & BasicsSessionsService
    webRuntime: BasicsWebRuntime
    skills: BasicsSkillRegistry
    tools: BasicsToolRuntime
    loader: BasicsLoader
    /** The agent-preset roster (host side); optional — presets degrade to a directory scan. */
    agentPresets?: BasicsAgentPresets
    /** The live agent registry (host side); resolves a session's Agent (scope key) for skill reads. */
    agents?: BasicsAgents
    /** The workspace registry (host side); the archived-sessions feature degrades without it. */
    workspaceRegistry?: BasicsWorkspaceRegistry
    /** Durable session storage (host side); the archived feature lists stored sessions from it. */
    sessionPersistence?: BasicsSessionPersistence
    /** The storage domain facility (host side); used to read the workspace domain state. */
    storageDomain?: BasicsStorageDomain
    /** The client slot registry (client side). */
    slots: BasicsSlotsService
    /** The client locale service (client side). */
    locale: BasicsLocaleService
    /** Register a lifecycle callback (DSH-vendored cordis). */
    effect(fn: () => void | (() => void), label?: string): void
  }
}

export type { Context }
