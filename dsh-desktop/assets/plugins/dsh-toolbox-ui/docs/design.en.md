# Design and Limitations

[中文](design.md) | **English**


This document answers "why is it designed this way, and where are the boundaries". For everyday use, see [README](../README.en.md), [Installation and Upgrade](installation.en.md), and [JSON Import](json-import.en.md).

- [The shared connection model for Project MCP](#the-shared-connection-model-for-project-mcp)
- [Connection state semantics](#connection-state-semantics)
- [Entry display preference](#entry-display-preference-why-you-cannot-turn-off-both)
- [Update notice](#update-notice-why-what-changed-this-time-is-written-locally)
- [Known limitations](#known-limitations)
- [Compatibility and dependency details](#compatibility-and-dependency-details)
- [The boundary of workspace copy and export](#the-boundary-of-workspace-copy-and-export)
- [Design constraints](#design-constraints)
- [Package structure](#package-structure)

## The shared connection model for Project MCP

Multiple sessions of the same project **share one** project MCP connection:

- Each `(project directory, serverName)` starts exactly **one** `mcp-client` instance across the entire `dsh web` process, so `serverName` is registered only once and **concurrent sessions do not collide on names** (concurrent connection setup and release/rebuild are both serialized: the connection promise enters the table first, and release keeps a placeholder until the connection is fully destroyed).
- The tools that this connection registers are projected into **the tool layer of each session belonging to that project**, so every such session can see and call them; sessions of other projects cannot (isolation is preserved — invisible by default, explicitly projected, not dependent on "blocking after the fact").
- Reference counting manages the lifecycle: the project's first session establishes the connection, and it is released after the last session ends; both session destruction and plugin unload wait for the connection to actually close.
- **Reference ownership is handed entirely to cordis**: each reference is held uniquely by one `agentCtx.effect()`. Consequently, neither boundary case needs this plugin to build its own liveness determination: when a session is destroyed while the connection is being established (`dsh-agent-loop`'s `raceAbort` discards the setup but does not cancel it), `effect()`'s `assertActive()` throws on the spot and the reference is returned on the spot; when a session ends normally, cordis runs the disposer, and because it is an async disposer it is awaited by `Fiber._unload`. Plugin HMR unload is a different fiber's fact (plugin generation), judged by its own token, and it does not share the same table as session liveness.
- **Why sharing is mandatory**: `serverName` is simultaneously the process-wide unique registration name and the prefix of the model-visible tool name `mcp__<serverName>__*`. "One instance per session" would both collide on names and cannot be worked around by "a different name per session" — renaming is renaming the tools, and historical tool calls and prompt caches at session resume would all be invalidated.

### Relationship to the MCP spec (stated clearly by version)

- The **2026-07-28** revision of the spec added a Statelessness section: servers **MUST NOT** rely on prior requests on the same connection for context, **SHOULD** be prepared to handle requests from multiple tasks/threads/sessions, and clients **SHOULD NOT** treat a single task/session as the lifecycle boundary of a stdio process. Under this version, shared connections plus concurrent multiplexing are exactly the encouraged shape, while "one subprocess per session" is discouraged.
- However, the `@modelcontextprotocol/sdk` distributed with DSH currently negotiates **2025-11-25**, and that version **has no** Statelessness section; instead it has Lifecycle Management (including session control). That is to say: **a server implemented against 2025-11-25 may perfectly reasonably maintain connection-level session state**, and that is not a defect on its part.
- Concurrency safety at the transport layer is guaranteed: a single `Client` instance's request ids are monotonically unique (the SDK's `_requestMessageId++`), responses are routed by id, and stdio writes whole frames in one `write`, so multiple sessions interleaving calls on the same connection do not cross wires. DSH is single-process, multi-session, so it does not need the shim/broker/socket and request-id remapping of the proxy solutions in the ecosystem.

### Servers that are unsuitable for sharing (important: this plugin offers only the shared tier)

Servers that implicitly bind session identity to the connection/process (browser automation, SSH sessions, editor buffers, per-connection indexing, and so on) will cross state when shared across multiple sessions.

Proxy solutions in the ecosystem usually offer a three-tier switch of `shared / isolated / session-aware` (such as [mcp-mux](https://github.com/thebtf/mcp-mux), [jasonwarta/mcp-mux](https://github.com/jasonwarta/mcp-mux), [punt-labs/mcp-proxy](https://github.com/punt-labs/mcp-proxy)). **This plugin currently offers only the `shared` tier** (one shared connection per `(project, serverName)`).

Regarding `isolated`: on DSH `0.1.0-rc.7`/`rc.8` it genuinely could not be done — at that time `serverName` was process-wide unique, so per-session isolation required a per-session rename, and renaming would in turn rename the model-visible tools. But **the underlying support has existed since DSH 0.1.5**: `mcp-client` deduplicates by registration scope, and the same `serverName` can be mounted once per session scope without conflicting (this plugin's project-level shared scope is exactly what consumes that capability). So to add the `isolated` tier, all that is missing is the plugin's tier switch and UI — it is no longer a Host limitation. Until then, treat such servers as **unsupported** and use the following approaches instead:

- Such servers **are not supported under project scope**. Moving them to global scope does not help either (that only turns "shared by all sessions of this project" into "shared by all sessions of all projects", which is worse isolation); spinning up another `serverName` inside the project is equally ineffective (`serverName` distinguishes servers, not sessions).
- Workable approaches: make the server use `streamable-http` and partition state by request parameters itself, or use an external proxy (the projects above) to do the isolation outside DSH.
- The spec's correct answer is `session-aware`: state that spans requests is referenced by an explicit identifier the request carries (2026-07-28's "State that needs to span multiple requests MUST be referenced by an explicit identifier the client passes on each request"; in practice this means carrying a session id in `_meta`, which is exactly what mcp-mux's `_meta.muxSessionId` does). The current `dsh-mcp-client` does not inject any per-request `_meta`, so a shared connection is **anonymous** as far as the server is concerned; this tier can only be added once upstream supports injecting a session identifier per call.

Comparable problems and same-direction practice in the ecosystem: the memory pressure caused by Claude Code starting a process per session ([claude-code#28860](https://github.com/anthropics/claude-code/issues/28860), Anthropic's shared-daemon proposal, closed as duplicate), and Serena's duplicate instances and concurrent-write problems when multiple clients open the same project ([serena#1235](https://github.com/oraios/serena/issues/1235); Serena's own advice for multi-agent scenarios is to switch to HTTP/SSE). DSH is single-process, multi-session, so it can share directly inside the process without a daemon or proxy.

## Connection state semantics

`@deepseek-ai/dsh-mcp-client` does not expose connection success/failure events. The panel therefore pieces the state together from two official facts: **the number of registered tools** and **the cordis fiber state code**. Logs are used only to fill in the wording of the failure reason; they do not participate in the determination.

- **connected**: determined to be connected only when that server's tools are registered (`mcp__<server>__*` count > 0). The plugin fiber being ACTIVE only means mcp-client is running; it does not prove the handshake succeeded — with `failOnStartupError: false` (the default), a failed connection also leaves the fiber ACTIVE.
- **failed**: the fiber is already ACTIVE (mcp-client's `apply` only lets the fiber become ACTIVE after the first connection and `tools/list` have finished) yet there are no tools at all, or the fiber itself is in a failed state. The specific reason is taken from mcp-client's most recent logs (subscribed via `ctx.logger.exporter` and filtered by `mcp-client(<serverName>)`), for example `connection attempt failed: ECONNREFUSED`, `giving up after 10 consecutive failed reconnect attempts`; when no logs are available it honestly says "no tools registered".
- **loading**: the fiber is not yet ACTIVE (apply is still running). Neither success nor failure is guessed.
- **stopped**: there is no fiber. In the global context this means the entry is not loaded; in the project context it means "this shared connection has not been established yet" (it is created when a new session mounts), and the panel displays it as "connection not yet established (auto-mounted by a new session)".

Global and project rows use the **same determination function** (`mcp-observability.deriveMcpPhase`) and the same value domain; only the wording differs. **Project rows deliberately state two independent things separately** instead of fusing them into one state:

- **Whether the connection exists** — given by the determination above: `Connected` / `Connecting…` / `Connection failed` / `Connection not yet established (auto-mounted by a new session)`. Connections are retained according to the idle policy (see "Effective-time semantics table"), so "no session is using it right now" is not displayed as "not connected".
- **How many sessions are using it** — `refs`: `Connected · N sessions using it · M tools` / `Connected · no session currently using it (connection retained, ready for next use)`.

Earlier wording compressed the two into a single sentence, "awaiting session mount", which users read as "not connected yet / queued", when the truth was often "the connection is there, there is just no session using it right now" — that is precisely why it was changed (the wording derivation is now the module-scope pure function `wsSub`, directly asserted by `test/client-behavior.test.mjs`). **Three kinds** of failure are reported separately, not lumped together:

- **Mount failure** (`mountFailed`): this plugin fails to mount at the **session mount stage** (the serial `agent/created` listener) (a `${VAR}` in the config evaluates to empty, startup fails under `failOnStartupError: true`, `serverName` is occupied, tool registration is rejected, and so on). There is only one accounting rule: **when the official fiber rejects, its original error is carried verbatim** (`recordWorkspaceMountError` is the only place this text is formed); the panel banner gives the first reason, and the row and detail view give the full text of each — our own wording is used only as a fallback for "the reason really is unavailable".
- **Connection failure** (`status === 'failed'`): mcp-client's business. The Host marks the two separately, so the client no longer reverse-infers a mount failure from "lastError exists".
- **`serverName` occupied** has only one source within mount failures, and it is **already blocked structurally**: the official deduplication key is `scopeOf(ctx) ?? ctx.root` (`mcp-client`'s serverName effect), and the scope label is a **module-internal Symbol** — as soon as `@deepseek-ai/dsh-scope` has two instances in the dependency tree, the labels no longer recognize each other, the owner degrades to the whole app's root, `serverName` therefore becomes process-wide unique, and same-named entries of two projects occupy each other (the first project works as usual, the second project's whole batch fails to start). This plugin therefore, in addition to the isolated scope, also makes this **fallback key** unique per connection (`createSharedConnection`: `scoped.ctx.extend({ root: scoped.ctx })`): when the label is recognizable, `??` short-circuits and it is never read at all (behavior is verbatim identical to before the fix); when the label is not recognizable, what the official code receives is still an owner belonging only to this connection. On real hardware (replacing dsh-scope with a second instance to simulate that installation): before the fix the second project's whole batch "failed to mount to the session", after the fix both connections are ACTIVE. The remaining case that genuinely reaches this error text is a host that does not deduplicate by registration scope at all (older mcp-client hung the registry on the whole process) — in that case the text is completed with "which name it collides with" (a global entry / another project's path) and this root cause; the same shape is pinned by cases in both `test/real-host-integration.test.mjs` (real host) and `test/workspace-runtime.test.mjs` (stand-in injection rejects).
- **Scope failure** (`scopeFailed`): the connection is fine, but the tools are not in the shared scope layer — the tools landed in the global layer, which means `@deepseek-ai/dsh-scope` resolved into two module instances between the Host and the plugin (the scope label is a module-internal Symbol). This is the most insidious failure shape: when `tools.schemas(scopeKey)` does not recognize the label, it **falls back to the global layer**, so the panel shows "N tools connected" while the tools are in fact visible to all sessions and all projects. The determination therefore directly compares against the global view (tools with the same name prefix appearing in the global view ⇒ they do not belong to this scope), and writes the reason on the `scopeFailed` row and on `mcpManager/projectConnections`'s `scopeError`. The determination is deliberately conservative: it only asserts when "there is no same-named global entry and no other project using the same name", otherwise it cannot be distinguished from "the tools of someone else's same-named instance"; each connection is judged only once (the conclusion is cached on the connection, not recomputed on every poll, to avoid repeated overhead).

A project MCP's tools are registered in its own shared scope layer, which the global tool view does not see, so the panel enumerates by that scope (it does not go through the global `tools.schemas()`).

## Effective-time semantics table

When each kind of change to a project config takes effect follows a single rule: **takes effect on write** (`reconcileWorkspaceConnections` is the only synchronization point for "config → connection set → session projection").

| Change | Effective time | Mechanism |
|---|---|---|
| Add a server | **Immediately** (including running sessions) | After the write, reconcile → acquire the connection for live sessions and project the tools |
| Remove a server | **Immediately** (including running sessions) | The connection is retired immediately, and sessions pointing at it have their whole projection withdrawn (no zombie tools left behind) |
| Change an existing server's config | **Immediately**, reloaded in place | If the fingerprint changed, the old connection is destroyed and rebuilt from the new config, and all sessions' slots are repointed to the new connection |
| Block / unblock (`exclude`) | Immediately | Recompute `restrict` and write it into the session scope |
| Hand-editing `.dsh/mcp.json` | At the next session mount | The mount path performs the same alignment itself (there is no file watcher, so it is not "immediately") |

"Changing config reloads in place" is not a tradeoff of our own invention but the host's existing semantics for config entries (`dsh-mcp-client` README: *"Editing the configuration entry reloads the server connection in place, and unchanged names stay unchanged"*), and it is safe: **the tool name is a pure function of `(serverName, rawName)`**, so names do not change after a reload, and session history and permission rules are unaffected. The old implementation chose "reuse the old connection + mark the panel `config pending` + wait for all sessions to end", at the cost that users changed the config and saw no change — that path has been deleted.

**The connection's lifecycle follows the config, not the session**: the last session ending only returns the reference and starts an idle timer (`idleTimeoutMs`, default 5 minutes, `0` = never reclaimed), while the connection and the stdio subprocess stay alive and are reused directly by the next session. This both matches the MCP spec's timing for closing a session ("no longer needed (e.g., the user is leaving the client application)") and avoids repeatedly starting and stopping processes (the community's "each reconnect leaks a process" class of problem). Real destruction happens only on: config deletion/change, the panel's "Reconnect", plugin unload, or idle timeout.

### Project-level proprietary fields (writable per server in `.dsh/mcp.json`)

These two keys are **this plugin's policy** and do not belong to mcp-client's config schema (`toMcpClientConfig` does not pass them down; passing them down would be rejected as unknown fields). They are numbers in milliseconds, and `0` is a meaningful value rather than "unset":

| Field | Default | Semantics | Boundary |
|---|---|---|---|
| `idleTimeoutMs` | `300000` (5 minutes) | How long the connection is retained after the last session ends; it is really destroyed only when the timer fires | `0` = never reclaimed automatically (resident). Upper bound `2147483647` (same convention as the host's other timers) |
| `readyTimeoutMs` | `5000` | The **shared total budget** for waiting for this connection to be ready at mount time; if it becomes ready within the budget, the tools make it into the declaration before the first turn | `0` = do not wait for readiness (back to purely asynchronous, tools are filled in by `tools/change`). A single mount takes only the maximum of the per-server upper bounds, not their sum |

Both are carried back verbatim by the panel's edit form (the form rebuilds the spec, so fields it does not render must be preserved explicitly), and both go through the same validation in `normalizeEntry` (non-negative safe integer, not above the upper bound). `idleTimeoutMs` in particular **must not** enter `MANAGED_CONFIG_FIELDS` — that set decides which fields get written into the global profile patch, and this one is a project-level policy.

### Read-only diagnostic interface (for troubleshooting)

Each panel row can only answer "what is wrong with this server of this project". Process-level questions (how many shared connections there are in total, whether any reference is stuck and never drops to zero) are answered by a read-only RPC:

```
mcpManager/projectConnections → { connections: [{ wsPath, serverName, state, refs, sessions, toolCount, fiberState, configStale, configError, duplicateOwners, scopeError }] }
```

- `state`: `ready` (ready) / `connecting` (connecting, no connection state readable yet) / `disposing` (releasing, placeholder not yet cleared). Being stuck in one of the latter two states is the shape that most needs troubleshooting, so they appear faithfully in the list too.
- `refs` and `sessions` are **two independent facts**: the former is the reference count, the latter is the number of live sessions that actually hold it. When healthy the two are equal; `refs > sessions` means a leaked reference (the session was destroyed but the reference was not returned), whose consequence is that the connection is never released and the config can never be refreshed. The interface does not fuse the two into a single "healthy" boolean; interpretation is left to the user.
- `configStale` being `null` means it cannot be determined (the connection is not established yet, or the server is no longer in the config); it does not fabricate `false`. When reading the config fails, the reason is in `configError`.
- A non-empty `scopeError` means the scope view is unavailable (the tools landed in the global layer, see the scope failure above): this is the only visible evidence of "the tools are visible to all sessions while the panel looks perfectly normal".
- Read-only throughout: it does not change reference counts, does not touch fibers, and does not trigger connection setup or release. The panel does not wire it up at present; it is an interface kept for troubleshooting.

## Entry display preference (why you cannot turn off both)

The panel has only two entries: the floating button in the bottom-right corner (`shell.overlay`) and "MCP" at the bottom of the left sidebar (`sidebar.footer.action`, declared since 0.1.5). Both can be turned off individually, but **they cannot be turned off at the same time** — if both really were off, the panel could never be opened again (you would have to hand-edit localStorage to get it back).

This is guaranteed not by UI disabling logic but by the **data model**: the preference stores a three-valued enum (`both` / `fab` / `sidebar`), not one boolean per entry. The combination "both off" does not exist in the type, so there is no need for a guard, a greyed-out button, or a "keep at least one" hint; `test/client-entry.test.mjs` asserts directly against that visibility table that "at least one entry is visible for each item", so a future new entry goes red there first instead of waiting for a user to lock themselves out.

Two implementation points are worth writing down, because both were pitfalls actually stepped on:

- **The panel's mount point and the floating button are the same slot registration** (`shell.overlay`), so "turn off the floating button" can only mean not rendering that button — the registration must stay. The sidebar entry only changes `panelVisibility`; it is this component that actually renders the panel. Gating the whole component behind the preference too = the sidebar entry does nothing when clicked and the user is simply locked out. The render decision was extracted into the pure function `overlaySeats()` precisely so that this can be tested without React (the component cannot render in node, and the test stand-in's hooks are empty implementations).
- **Hiding the sidebar entry uses "render null", not unregistering**: the host's list-type slot renders each entry's component directly into the sidebar's `.footerActions` (`display:flex`, no gap/padding), and the outer outlet anchor is `display:contents`, so an empty subtree occupies no layout and leaves no blank row (confirmed against 0.1.5-rc.2's `dsh-client-ui-renderer`). Unregistering would mean managing one more lifecycle, and buys no observable difference.

The preference is stored in localStorage (`dsh-mcp-manager-ui/entry`), the same route as the floating button position (`dsh-mcp-manager-ui/fab-pos`). It does not go into the profile config: this plugin has no Config surface, and the client half cannot get plugin config either, so adding a host→client delivery for one display preference is not worth it, and changing the config would still wait on host hot reload. localStorage is external input (written by older versions, hand-edited, keys on the prototype chain), so it is always normalized back to the default; when storage is disabled it still takes effect for the current session, it just is not remembered across sessions.

## Update notice: why "what changed this time" is written locally

The first time the panel is opened after an upgrade, a card pops up listing what changed and pointing the way (for example, that the "Entry" switch is in the panel's top-right corner). The reason it exists is straightforward: if new capabilities are only written in the README and the release notes, users will not go looking for them — that is exactly how the previous version's "Entry" switch got ignored.

**The trigger is "opening the panel", not "page load"**: what is being announced is precisely the things added inside the panel, and the user only needs them inside the panel; hanging it inside the panel also means it mounts with the panel, so loading does not block the app with a modal (it used to trigger on page load, and measurement showed that blocks startup while not being any more useful).

Four tradeoffs; read them before changing it:

1. **The source of truth for the content is `lib/whats-new.js`, not GitHub Releases**. Fetching remotely would let the network, rate limiting, and being offline decide whether this notice appears at all; and the existing `updateHint` (the "a new version is available" bar) has already established the design of "purely additive information, silent on failure", so a notice the user specifically asked for should not be pushed onto the same link. A local constant also incidentally guarantees that the same version shows exactly the same content on any machine.
2. **The version in `package.json` must be the last entry here** (pinned by `test/whats-new.test.mjs`). This is governance of the root cause: if you bump the version but do not write "what changed and where to find it", it goes red locally and cannot be released.
3. **"The last acknowledged version" is stored on the client** (localStorage, the same idiom as `updateHint.dismissed`). It is a fact belonging to each browser, and the host has no such view; so the host only supplies the source of truth and the current version, and the determination lives in the client-side pure function `whatsNewFor`.
4. **When "a fresh install" and "upgraded from a version that predates this notice" cannot be distinguished, lean toward saying it once.** Neither is recorded in localStorage, and the latter is exactly the population to be covered; so with no record it reports only the current entry (no screen-filling history dump, and no missing this update's changes), at the cost only that fresh-install users see one note about the current update. Conversely, if the previous version is recognizable, it reports everything after it, so cross-version upgrades miss nothing.

The persist timing is **acknowledged close**, not display: persisting on display would swallow a notice the user never saw, whereas acknowledgment means it was seen. And "Got it", clicking the overlay, and Esc all count as acknowledgment, and while the notice blocks the panel **every route out of it acknowledges it** (the only way not to acknowledge is to close the tab outright), so the actual experience is "one popup per version".

It is a **blocking** modal (the overlay covers the panel), and that is intentional: "cannot be ignored" requires weight, at the cost of a brief obstruction the first time the panel is opened after an upgrade. Also, because it is not opened by the user, keyboard accessibility is its own responsibility — it focuses "Got it" on open, closes on Esc, and uses a `focusin` guard to trap focus inside the modal. "Delay a bit then focus" is not an option here: the host app will steal focus to its own input box (measured at about 300ms after the modal appears), so delaying amounts to betting on the other side's timing; for the same reason, on close it can only make a **best effort** to return focus to the node the app originally wanted to focus (if the node has been rebuilt by the app, so be it — no selector guessing).

## Known limitations

- **First-turn readiness**: at mount time it waits for the connection to become ready within the **shared readiness budget** (`readyTimeoutMs`, default 5s, `0` = do not wait), so tools are present in the first turn's request — this is the host's own contract (`dsh-mcp-client` README: *"The server's tools appear before the harness starts its first turn"*). Timing out **is not a failure and does not block the session**: when the budget runs out it just starts up, and once ready the projection is filled in by `tools/change`; the connection state is reported faithfully by the fiber state and the tool count. The budget is the total budget for "this session creation" (the maximum of the per-server upper bounds), not one budget per server — otherwise 5 unreachable servers would add 5x the wait to every session creation. If a server is configured with `failOnStartupError: true`, then per the official semantics it waits for that server to reach a conclusion (this wait is explicitly chosen by the user and is not constrained by the budget).
- **Blocking does not release the global instance**: "Blocking" a global MCP only hides its tools; the global instance of that serverName keeps running (occupying its own scope). Since DSH 0.1.5 a project can connect independently with a same-named server, without first disabling the global one; older hosts deduplicated process-wide, and a same name would fail to start there.
- **Same names are isolated by registration scope (since 0.1.5)**: `mcp-client` determines `serverName` uniqueness by **registration scope** (`scopeOf(ctx) ?? ctx.root`), and this plugin gives each `(project, serverName)` its own scope, so same names across projects and between global and project are all legal configurations, each connecting independently and each registering its own tools (measured: a duplicate name within the same scope is still rejected). **This invariant is guaranteed structurally and does not depend on whether the dependency tree is clean**: when the scope label is not recognizable (`@deepseek-ai/dsh-scope` has two instances), the deduplication fallback key is `ctx.root`, and this plugin makes that unique per connection too (see "`serverName` occupied" above). The other face of the same root cause is tools leaking into the global layer — that one is still reported faithfully (`scope isolation failed`).
- **Shared connections reload in place per config**: see "Effective-time semantics table" above — changing the config immediately reloads the connection and repoints the session slots; the connection is no longer destroyed when a session ends (retained while idle).
- **Once a connection enters a terminal state, someone has to pull it back**: mcp-client's reconnection has an attempt limit, and after exhausting it the client unregisters the tools and stops, recoverable only by reloading the config or restarting the host (its README says so explicitly). A project MCP is not a resident service (a VS restart or a script finishing makes it disappear), so this terminal state is almost inevitable: the mount path tears down and rebuilds the dead connection the next time someone needs it, and the panel's "Reconnect" button provides an immediate exit.
- **Per-session isolation is not supported**: see "Servers that are unsuitable for sharing" above.
- **After a session ends there is no longer any need to "wait for the old connection to be destroyed"**: connections are not destroyed when a session ends (retained while idle), so "close the last session and immediately reopen" does not hit a release window — it reuses the same connection directly. Only a real rebuild (config change, clicking Reconnect, rebuild after idle reclamation) needs to wait for the old connection to tear down, and that wait depends on how fast the MCP server exits. **The upper bound is about 9 seconds**: the MCP SDK's stdio close itself waits at most 2s (stdin closed) + 2s (SIGTERM) before SIGKILL, and mcp-client has another 5-second upper bound for close confirmation. Multiple servers in the same session are released in parallel, so these do not add up. Measured on normal servers this is far below that upper bound (Windows, SDK 1.30.0): `transport.close()` took 35ms for `@modelcontextprotocol/server-memory`, 43ms for `mcp-deepwiki`, 34ms for `fast-context-mcp`, 167ms for `serena`; the whole `dsh web` process's graceful exit (tearing down 4 stdio + 2 HTTP connections at once) took about 0.5s. The premise for slowness is a server that ignores stdin EOF, see the next item.
- **Windows: stdio servers that ignore stdin EOF leak grandchild processes**. On Windows a stdio server is usually a process chain (`npx` resolves to `npx.cmd`, so `dsh → cmd.exe → node`), and the MCP SDK's `StdioClientTransport.close()` only sends SIGTERM/SIGKILL to its **direct child** (`sdk/dist/esm/client/stdio.js`'s `close()`), with no job object, so grandchildren are out of range. Measurement shows the common servers (memory, deepwiki, fast-context, serena, chrome-devtools) all exit on their own on stdin EOF, so neither a normal DSH exit nor a forced kill **leaves processes behind**; but that cleanliness comes from server behavior, not from a transport guarantee — a server that deliberately ignores stdin EOF will make `close()` consume the full 4 seconds (2s + 2s) and leave an orphaned grandchild. When you hit such a server, have it handle its own exit, or switch it to `streamable-http`.
- **DSH's exit grace period is 5 seconds**: after SIGINT/SIGTERM the official launcher gives the whole plugin tree only 5 seconds (`dsh/lib/profile-boot-*.js`'s `PROCESS_SHUTDOWN_TIMEOUT_MS`), and on timeout it calls `process.exit()`. In normal cases this is more than enough (measured ~0.5s), but if several "slow to exit" servers are present at once, the exit may be cut off before teardown completes.
- **Source import only takes user-level `mcpServers`**: `projects[*].mcpServers` in `~/.claude.json` is not expanded (that would lay out every historical project); import project-level config from the project tab as `.mcp.json`. A source file larger than 8 MB is skipped.
- **Plugin hot reload clears the project tools of running sessions**: HMR/unload withdraws all projections and releases connections (otherwise zombie tools pointing at a destroyed connection would be left behind). Sessions already running must be reopened to regain their project MCP tools.
- **Three honest boundaries of the English variant**: panel copy, MCP market copy, and docs all have English versions, but — ① the **category names** in the skill market come from the `api.skillhub.cn` upstream, which is Chinese-only, so that row stays Chinese in the English UI; ② the security-scan conclusion (`statusText`, e.g. "safe, no risk") is likewise Chinese-only upstream, with no English field; ③ the "what changed this time" popup content lives in `lib/whats-new.js` and is Chinese-only for now. All three choose to **show Chinese rather than nothing** — an empty label is worse than Chinese.

## Compatibility and dependency details

The DSH host API is declared through `peerDependencies` and `engines.dsh` as `>=0.2.1-rc.5 <0.3.0`. Current release admission starts at 0.2.1-rc.5; older hosts remain historical regression targets, not current release support.

**Why the current floor is 0.2.1-rc.5**: the plugin depends on the ToolSearch and lifecycle contracts verified on that host, while the 0.2.2 executor path is tested as a matched host set —

1. **`mcp-client` determines `serverName` uniqueness by registration scope** (`scopeOf(ctx) ?? ctx.root`; earlier versions hung the registry on `ctx.root`, process-wide unique). Project-level MCP's "same name across projects / between global and project" rests on this.
2. **`setup` passes the agent to the plugin as a second argument** (`setup?.(prepared.agent.ctx, prepared.agent)`; earlier versions passed only ctx). Mounting project MCP needs the agent's `session.header.cwd`; reading agent off ctx is rejected by cordis's service guard (`cannot get property "agent" without inject`), and a throwing setup would make the session's creation and resume fail outright.

Older versions are no longer compatible, and no degraded branch is kept for them.

### How the version range is chosen (and what it does not cover)

Three tradeoff rules; read them before changing the range:

1. **The lower bound is a hard requirement; the upper bound is a hard gate enforced by the host**. The current release floor is `0.2.1-rc.5`; `0.2.0` remains a historical regression target rather than release admission. The upper bound `0.3.0` only means anything if the host really does break backwards — DSH calls itself a "developer preview … breaking compatibility changes will appear in the future", and a plugin is inevitably one step behind a host upgrade, so a **coarse** upper bound is kept: its job is to turn "you are running on a major version we have not validated" into an explicit rejection by the host, rather than a silent install followed by strange problems.

   **This gate is enforced by DSH itself, not by pnpm/npm** — the installer's peer warnings (such as pnpm's `[WARN] Issues with peer dependencies found`) are neither the basis for the determination nor consistent with it. `dsh-app-boot`'s `evaluatePluginCompatibility` compares the actual version from `dsh --version` against this plugin's `peerDependencies`: an incompatible bundle is skipped and prints `skipping profile bundle …`, and the plugin simply does not load (on the `preflight` path through the profile manifest it is `disabling profile plugin …`). Users who do not want to upgrade can grant an **exact version** exemption and keep using it: `dsh plugin --profile <profile> allow-version <name>@<version> --dsh-version <exact> --accept-risk` (exemptions are accounted per `name@version` × exact host version, in the profile directory's `compatibility.json`). **The lower bound never blocks any new version; only the upper bound can "lock you out", so a coarse upper bound is better than a fine one.**
2. **Prereleases need no special treatment**. The host compatibility check uses `includePrerelease: true`, so releases after the verified floor within the 0.2.x line participate in comparison; `0.3.0-rc.1` crosses the upper bound. The current window is an admission boundary, not a promise that every future 0.2.x prerelease has been behaviorally verified.

   Note that this **only holds for the host's own gate**: anyone re-checking the current range must use the host's `evaluatePluginCompatibility`, not `semver.satisfies(range)` or pnpm's peer check. The package contract pins the manifest and `engines.dsh` to the current admission window; it does not simulate semver.
3. **The range cannot answer "is it still correct once installed", and CI can only cover half of it**. `0.1.6-alpha.2` switching the typert strict codec from `schema:` (a zod v4 instance) to `create()` (a lazy factory in the in-process realm, with the registry materializing via `record.value ??= record.create()`) is exactly such a case: it falls inside `>=0.1.5-rc.1 <0.2.0`, the plugin's compatibility declaration cannot catch it by nature, and the drift job on 2026-09-21 therefore went red (the only failure among 130 items that time was the load-time contract one). The real protection has two layers: **(a) the runtime contract** is exercised by [`.github/workflows/upstream-drift.yml`](../.github/workflows/upstream-drift.yml), which swaps the whole host to the `latest` / `next` / `alpha` channels every week and runs the contract cases (`test/*.test.mjs` minus `package-contract`, because that one asserts the pin itself); **(b) the host-side load-time contract** (the shape of `lib/typert.js` is validated by the host loader, not by us) is covered by `test/typert-manifest.test.mjs`: it calls the host's own `validateTypertManifest` to validate this artifact and goes red the moment the shape changes; the same file also has a shape assertion **independent of the loader version**, pinning "the strict codec carries both `schema` and `create()`" (the next reason) — the local devDependency loader is the development baseline and cannot see the alpha's requirements, so relying only on the former would take a week to find out. This layer was originally a gap — the existing cases only guaranteed that the two artifacts `lib/typert.js` and `lib/client.js` were consistent with each other (`client-lifecycle.test.mjs`), and would not go red if the host changed its requirements, with the consequence that the whole panel becomes unusable after users upgrade DSH. It is also why `@deepseek-ai/dsh-typert-loader` goes only into `devDependencies` and not into peer: validation happens inside the host process, and the plugin does not import it at runtime.

**Why both keys are written for the strict codec** (one copy in `lib/typert.js` and one in `lib/client.js`, with `client-lifecycle.test.mjs` pinning the two consistent): the host checks **different keys** on the two channels, and each ignores the other's key — `0.1.5-rc.x` (= the `latest` / `next` of that time, i.e. what `npx` installs by default) checks that `codec.schema.parse` must be a zod v4 instance; from `0.1.6-alpha.2` onward it checks `typeof codec.create === 'function'`. Omitting `schema` means rejection on load on the newest RC; omitting `create` means rejection on load on the alpha; `mode: 'src-json'` is not a way out (the loader forces the invocation's codec to be strict). Running our own artifact through three versions of the loader:

| codec shape | loader `0.1.5-rc.2` | loader `0.1.6-alpha.1` | loader `0.1.6-alpha.2` |
|---|---|---|---|
| only `schema` | PASS | PASS | reject: `has no create() factory` |
| only `create()` | reject: `is not backed by a zod v4 schema` | reject | PASS |
| **both** | PASS | PASS | PASS |
| `mode: 'src-json'` | reject | reject | reject |

Historical evidence: the loader of `0.2.0-rc.2` measures the same as the `0.1.6-alpha.2` column: only `create()` passes, and only `schema` is rejected. Both codec keys remain because historical hosts checked different keys; this is not a current release-support promise. Current admission is tested as the matched `0.2.1-rc.5` (Loader 1.0.6) and `0.2.2-rc.1` (Loader 1.1.0) combinations, with the shape pinned by `test/typert-manifest.test.mjs` and host contract tests.

The browser half (`@deepseek-ai/dsh-typert-registry`'s `lib/client.js`) performs the same validation, so the codec in `lib/client.js` must be changed in step — changing only the host copy produces "the panel loads, and blows up on the first call".

How to read a red drift job:

- **A contract case (including real-hardware integration) fails** → the upstream contract really changed; fix the plugin at the failure point and ship a patch (that is how the 2026-09-21 run went red).
- **The pin / lockfile assertions of `package-contract.test.mjs` fail in a local `npm test`** → the host is usable, go sync the pin: devDeps in `package.json`, `DEV_BASELINE`, and the "verified up to" in README / README.en / installation, then `pnpm install && npm test` to confirm everything is green.

  This one is **not** reported by the drift job: its `files` is `grep -v 'package-contract'`, so the pin assertions by definition do not participate in drift determination. So "the drift job is green" does not mean the pin is current — between 2026-09-10 and 09-24 the pin sat at `0.1.5-rc.2` while `latest` was already `0.1.5-rc.3` and `next` was `0.1.7-rc.1`, unnoticed for two weeks; that is this gap. Syncing the pin has only two triggers: a human notices a new RC, or someone runs the full suite locally.

  When updating the baseline, keep `COMPAT_WINDOW`, `engines.dsh`, and the manifest aligned; the current release window is `>=0.2.1-rc.5 <0.3.0`. Update only `DEV_BASELINE` in `package-contract.test.mjs`, the lockfile, and the verified-version documentation, then rerun the matched host contracts.

Measured (2026-09-24, drift job [run 35943153431](https://github.com/Imzl-zl/dsh-mcp-manager-ui/actions/runs/35943153431), 190 items per channel all green, 0 skipped):

| Channel | Host | Result |
|---|---|---|
| `latest` | `0.1.5-rc.3` | 190/190 |
| `next` | `0.1.7-rc.1` | 190/190 |
| `alpha` | `0.1.7-alpha.2` | 190/190 |

On 2026-09-29 the baseline was advanced to `0.2.0-rc.2` (run locally, 234 items): 232/234 passed, and the 2 failures were the pin assertions themselves (`DEV_BASELINE` and the lockfile version still said the old baseline); after syncing, 233/234, the last one being the documentation's "verified up to" — which is derived from `DEV_BASELINE_VERSION` and likewise belongs to the pin; after updating the docs, all green. That is, **not a single contract case fails on 0.2.0-rc.2**, including the real-hardware integration group (real cordis + real dsh-tools + real dsh-scope + real dsh-mcp-client + real stdio subprocess). `0.2.0-rc.2` falling inside the peer window is also inevitable: `includePrerelease` makes prereleases compare by numeric value, and only the `0.2.0` stable release falls outside (see item 2 above).

Earlier: contract cases were all green on `0.1.6-alpha.1`; on `0.1.6-alpha.2` the only pre-fix failure was the `typert-manifest` one, and after writing both keys it was 137/137 green per the drift job's file list (to reproduce: swap the whole host to alpha.2 and run that list).

On 2026-10-24 the same method was re-run against `0.2.1-rc.3` with its own `cordis 4.0.5` / `cordis-plugin-loader 1.0.6`: **785/785** green (repo 1.8.3, so the suite has grown since the runs above). The one red in the first pass was environmental rather than a host difference: `real-host-loader`'s env-expression case reads `process.env.HOME`, and a PowerShell session only defines `USERPROFILE`; the same case fails identically on the `0.2.0-rc.2` baseline when `HOME` is absent. On 2026-10-30 the method was re-run against `0.2.1-rc.5` with the same `cordis 4.0.5` / `cordis-plugin-loader 1.0.6` pair: **812/812** green (repo 1.9.0), with that same `HOME` case as the only first-pass red.

**All green on alpha does not mean it entered "verified"**: it was green this time because our changes happened to be purely additive (writing both codec keys + structurally probing cordis private fields), not because it is stable. So the compatibility table lists only `0.2.0-rc.2` — that is a promise; alpha is left to the weekly drift job to probe, and is not promised. This is the same tradeoff as item 2 above (prereleases need no special treatment).

**What this evidence does not cover**: the client side is stand-in testing (the component cannot render in node), so the table above proves that the **slot registration contract** holds, not that the slots **render** correctly on a 0.2.0-rc.2 host. And the release notes for `0.1.6-alpha.2` mention "client Session support for multiple coexisting instances, with related APIs and slots changed". The symptom of that class of failure is a blank panel, which does not turn any test case red, so it belongs to the manual pre-release check (its trigger condition is "Every release" in [Installation and Upgrade](installation.en.md#every-release)) and does not go into CI. On this occasion of advancing the baseline to `0.2.0-rc.2`, the real-hardware re-check was done per that checklist: the panel opens, 7 scope tabs and 16 global MCP entries render correctly.

The development baseline (`devDependencies`) follows the newest verified RC and, per official convention, **mirrors every peer dependency** (including `@deepseek-ai/cordis`); the one exception is `@deepseek-ai/dsh-typert-loader`, which is for testing only (see item 3 above) and is not a runtime host contract. This mirroring is not redundancy: `dsh plugin ... add <local directory>` is a `link:` install, and Node resolves upward from the plugin's own path, so a plugin that only declares peers without a local copy cannot even find its own host dependencies; conversely, if one transitive dependency of the local copy is missing (for example an old config that omitted `@deepseek-ai/cordis`), the whole plugin tree fails to load at startup. After upgrading DSH, verify with `pnpm install && npm test`.

Two dependencies that are not in the `@deepseek-ai/dsh-*` contract surface but sit in the host's module layer in a real installation deserve to be named:

- `@deepseek-ai/cordis-plugin-loader` (current peer `>=1.0.6 <1.2.0`, verified on 1.0.6 / 1.1.0): `reveal` uses its `interpolate` to evaluate `!!js` config nodes. It is a vendor package, obtained through the profile's module fallback resolution (the same path as `@deepseek-ai/cordis`).
- `@deepseek-ai/cordis`'s private fields: the disposer returned by `LoggerService.exporter()` deletes "the largest ID at that moment" rather than the ID at registration time (`lib/index.js`'s `return () => this.exporters.delete(this._snExporter)`), so a hot reload erroneously deletes other plugins' exporters. This plugin therefore reads and writes the private field pair `logger.exporters` / `logger._snExporter` directly, and restricts the peer to the verified `>=4.0.5 <4.2.0` (4.0.5 / 4.1.0); if the field shape changes it falls back to the `exporter()` channel and warns explicitly.

How peers are resolved also matters: the official profile's `pnpm-workspace.yaml` carries `nodeLinker: hoisted` + **`autoInstallPeers: false`** (written by `initProfile`, with a comment stating the reason: let missing peers go through the `profiles/node_modules` install fallback layer, "so every plugin shares the installation's single cordis instance instead of a duplicate"). Consequently this plugin's 9 peers are **not** installed by pnpm into the profile's `node_modules`, but share the same package instances as the host — this is a hard requirement for `@deepseek-ai/dsh-scope`: the scope label is a module-internal `Symbol`, and two instances would make tool projection silently fail (see the scope failure in "Connection state semantics"). If the panel reports "scope isolation failed", first confirm this configuration has not been changed.

## The read boundary for importing from local clients

Source import is the Host's only place that reads "paths the user has not specified through this plugin" (other clients' own config files). The boundary is pinned in three places; read this before changing it:

1. **File names are fixed by the source table; directories come only from existing scope parameters**: global locations are derived from `HOME` and each client's own environment variables (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME`, …), and project locations only append fixed file names to `wsPath`. The browser sends `sourceId` + `scope` (project scope additionally carries the existing `wsPath`); there is no "which file to read" parameter, so the interface surface does not become a general-purpose file reader.
2. **Values do not leave the Host**: what the scan returns to the browser is three kinds of projection — names, transports, and masked field names; `maskedSourceFields` reuses the list projection's masking rules and reports only field names, not values. At import time the Host re-reads the file to obtain the true values, otherwise secrets in the user's home directory would enter the browser session.
3. **Content fingerprint**: the preview returns the sha256 of the file contents, and the import must send it back and it must match — without it, "the preview was A while the import was B" is only one file change away.

No new write paths were added: importing a global source reuses `applyManagedImport`, and importing a project source reuses `applyWorkspaceImport`, the same functions as pasting JSON.

An imported environment variable reference must be a **total-value expression** (`!!js (process.env.X ?? "")`): a bare reference evaluates to `undefined` when the variable is missing, and mcp-client's Config accepts only strings, which would make the host fail to load the entire tree at startup. This boundary applies to any newly added import path.

The same place must also guarantee **`serverName` uniqueness within the same scope**: the official mcp-client reserves `serverName` per registration scope, and a duplicate name in the same scope makes the plugin load throw outright (`mcp-client: serverName "x" is already in use`, the whole tree fails to start), while at the project level a duplicate is silently overwritten by the `mcpServers` object key and the entry is lost. The approach is to **keep the first occurrence and skip the rest**, and write the skipped names into the preview and the import result: one duplicate in a batch should not prevent all the other entries from importing. A name occupied by a bundle / Agent preset (an external layer) is the same class of problem and takes the same tradeoff — skip and report, rather than failing the whole batch. **When reading a project config file it is the opposite**: if the file contradicts itself, reject the whole thing; silently dropping one entry is worse.

This rule lives in `admitImportedServers` in `lib/import-admission.js`, and is called once (idempotently) by each of the two write entry points (`applyManagedImport` / `applyWorkspaceImport`): the write gate does not depend on the caller remembering to do it, so future importers cannot miss it either. `normalizeMcpImport` is responsible only for normalization and for **detecting** duplicate names (`duplicateServerNames`), not for policy — policy belongs to the boundary that knows the stakes.

**But "the write gate must not create duplicates" is not the same as "no duplicates can exist at load time"**: a bundle's own patch, an Agent preset, or a `cordis.yml` soiled by an older bug (the `Include.write()` case in row L2 above) can all put same-named entries into the loader past every write gate. So "can I change this server" and "are there same-named entries" must stay **two separate judgements**:

- **Can I change it**: only whether `entry.options.id` equals the id of that server's line in the profile patch (`resolveManagedEntry`). The name is used solely to locate our own line in our own layer; it is not part of identity. This used to additionally require "exactly one same-named entry in the whole tree", which meant somebody else's same-named entry locked down ours — on real hardware that showed up as "one row, two entries, edit/disable/remove all grey".
- **How many are same-named**: `conflict` and `duplicates: [{ id, phase, disabled }]` on the row from `summarize()`, informational only. The row must name the other entry's id and state, because `mcp-client` deduplicates per registration scope at apply time and only one of the same-named entries can connect — when the user sees "connection failed", they have to be able to tell which one failed and whose the other one is.

Two accompanying honesty requirements: if removal leaves a same-named entry from another layer behind, the note must say who is left and that it only retries after a host restart (otherwise the user still sees failure logs and concludes removal did nothing); and the **import** path keeps the skip semantics above — that question is "should I write another line", which would create a third entry of the same kind, not "should I edit my own".

The `!!js` syntax is implemented only in `lib/env-expression.js` (generation / validation / variable-name extraction / template reversal / evaluation). **Do not write another parser in other files**: an acceptance surface one notch wider than the production surface is enough to let bare references through and drag the host down with them.

## The boundary of workspace copy and export

"Copy to another workspace" and "Export JSON" look like the same thing (both get the config somewhere else), but their **disclosure surfaces differ**, so their boundaries are defined separately:

- **Copy**: the source config is read inside the Host and written directly to the target; the browser sends only `{from, to, names, overwrite}` and gets back a list of names and counts (`added` / `updated` / `skipped` / `targetCount` / `changed`; the write that actually happens also adds a `note`). Config values never leave the Host. The value projection discipline matches the list projection, so same-machine transfer needs no new trust assumptions.
- **Export**: this is the **only** path that lets the full config (including literal credentials) pass through the browser, and that is intentional — backup, cross-machine migration, and sharing with colleagues all require getting the complete file, and handing over a redacted copy would make none of those uses possible. The cost is written in the UI ("literally hard-coded credentials will appear here as-is") and documented, rather than avoided by not mentioning it. It is read-only and writes no files; **"project scope only" is a property of the entry point, not something the Host enforces** (`exportWorkspaceJson` accepts canonical paths just like the existing read-only RPCs; the UI simply only offers this entry on the project tab). To see the **effective runtime values** you still go through `reveal` (that path is per-field, on demand, and closed only for servers outside the current Web profile's management).

**The write path is stricter than the read path**: reading a directory's config only requires a canonical path (`getWorkspaceView` has always been that way), but writing `<directory>/.dsh/mcp.json` requires that directory to be a **registered** workspace on this machine. Writing by canonical path alone would expose an interface for "writing files into arbitrary directories" to the browser — a capability of an entirely different order from "reading arbitrary files". This invariant is expressed exactly once, in `withRegisteredWorkspaceWrite(ctx, wsPath, operation)`, and **all** Remotes that write project config go through it (there is no longer any write path in `lib/index.js` that calls `withWorkspaceWrite` directly), so a newly added write path cannot "forget the gate" — `test/package-contract.test.mjs` pins this as a structural assertion. Registry access likewise has a single place (`workspaceRegistryOf` is the low-level accessor, `registeredWorkspacePaths` is its throwing projection).

**Duplicate-name handling is deliberately different from import**: copy **skips** by default (keeping the target's existing entry), and only an explicit `overwrite` overwrites; whereas import's "merge" is a **same-name update** (incoming wins). The two different defaults are intentional, each fitting its own intent:

- Import's "merge" says "change this project according to this JSON" — the copy in the user's hand is the desired state, so a same name updates;
- Copy says "take these entries over as well" — the same-named entry in the target project is the **target's own** config, so why should it be overwritten by the source; therefore "modifying the target's existing config" must be explicitly chosen once by the user.

"Which names count as added / updated / removed" has a single rule (`classifyMerge`), used by both the **determination** and the **materialization** forms. There is only one determination: `mergePreview` degenerates into pure formatting (assembling warnings/conflicts) and no longer counts names itself — so "the result text does not match the file contents" is not avoided by convention, it is simply not a second possibility. There are **two** materializations, because the persisted objects differ: the whole-config form (project `<workspace>/.dsh/mcp.json`) goes through `planMerge(existing, incoming, { replaceAll, onExisting })`, serving project import and cross-workspace copy; the profile patch form (a YAML increment with entry ids) goes through `updateManagedMcpPatch`, serving global import and single-entry add/remove/change. Policy is supplied by the call site (import's merge passes `onExisting: 'replace'`, copy passes `'skip'`/`'replace'` depending on the switch; `replaceAll` governs only the persisted result, not the list), and duplicate names on the incoming side are reduced to a single rule by `firstByName` (the same tradeoff as `import-admission`). **Preview and write also share a single resolution** (`resolveWorkspaceCopy`): what the panel shows the user as "what will be added / overwritten / skipped this time" is exactly the plan the write will execute, so "the preview says skip but it actually overwrites" is impossible. The client side does not let that time gap through either: the preview result is bound to the inputs that produced it (target / checked / skip-overwrite) (`copyPlanKey` / `copyPlanReady` in `lib/client.js`), so changing a selection invalidates the old result immediately and the confirm button is disabled until recomputation finishes — same-origin on the host side cannot stop the window of "clicking confirm against a stale preview". The only remaining time gap is the target being changed by another session between preview and write — the write re-resolves once inside the write lock, taking the newest config as authoritative. When changing duplicate-name semantics: determination changes in one place (`classifyMerge`), materialization changes once per form (`planMerge` / `updateManagedMcpPatch`) — do not infer one path's treatment from the other implementation. The target project's `exclude` is not part of the transfer: it is that project's visibility decision about global MCP, not config data.

**When everything is skipped, no file is written**: a copy where nothing changed should not refresh the target config's mtime (that would in turn invalidate the config cache and run connection reconciliation for nothing). The post-write reconciliation still happens outside the write lock as before, and failures are only logged — the same discipline as the two import paths. **The boundary must be stated clearly**: this shortcut only holds when "everything was skipped"; when "Overwrite" is chosen, the file is rewritten as usual even if the target is field-for-field identical to the source (`changed` only looks at whether a same name was hit, it does not compare contents) — the user explicitly asked to overwrite, and rewriting is the honest response.

## Design constraints

`dsh-toolbox-ui` is a single-instance Web Host plugin. The fixed Remote namespace and UI slot ids are intentional; loading it twice is a configuration error, and the plugin fails explicitly rather than silently ignoring it. Multiple MCP servers, on the other hand, are managed by different `serverName` instances of `@deepseek-ai/dsh-mcp-client`.

## Panel styling: why there are no self-chosen colors

DSH's `ui-theme` owns all colors, geometry, and fonts, and the plugin only consumes semantic tokens. This is a hard contract, not a stylistic preference; the normative text is in `docs/web-styling.md`:

> Use `--dsw-alias-*` semantic tokens in feature components. **Do not copy static palette values or write literal colors there.**
> Keep theme selectors out of feature component CSS. **Light/dark overrides belong to the theme owner.**

So there is no `@media (prefers-color-scheme: dark)` in the panel, and not a single hex value.

> A citation boundary: the same sentence appears in `packages/extensions/cordis-client-runner`'s `CLIENT_NOTES`, but that package serves **dynamic packages** (code the user evaluates on the spot in the panel, via `styles.insert`), not prebuilt plugins. The contract for prebuilt plugins is `docs/web-styling.md` plus `docs/ui-radius.md`; do not cite the dynamic package sandbox's notes as a general normative reference.

The implementation approach is a layer of aliases at the top of `MCP_CSS`: the tokens to be used are collected once into `--mcp-*`, and the thousand-plus lines of rules below reference only aliases. Switching themes or adjusting the scale changes only that one place.

### How the CSS gets into the page: staying consistent with the official builder

Styles for prebuilt plugins are turned into injection code by the official builder's `styleInjectionModule()` in `packages/client/tsdown.client.ts`, shaped like:

```js
const tag = document.createElement('style')
tag.dataset.plugin = id          // the credential the module loader claims/cleans up by
tag.dataset.pluginCss = tagId    // the plugin's own deduplication key
tag.textContent = css
document.head.appendChild(tag)
```

This plugin is a hand-written bundle (it does not go through the tsdown preset), so `__injectCss` implements the same thing itself, and **both attributes must be set**:

- `data-plugin` is the basis on which the loader claims styles. `removeOwnedStyles()` in `entry-lifecycle.ts` **deletes only tags with `data-plugin === plugin id`**; `claimStyles()` in `system.ts` has exactly one fallback — claiming "unmarked style tags that newly appeared during materialize".
- Therefore, when only `data-plugin-css` is set, the normal path still gets cleaned up via the fallback (which is why it stayed hidden for so long), but **tags inserted outside the claim window become orphans**, leaking cumulatively across repeated HMR replacements.

`test/client-lifecycle.test.mjs` pins these two attributes, and it was mutation-verified (removing `data-plugin` makes that test go red immediately).

### Why the alias layer hangs on `body`

Two constraints must hold simultaneously for it to be safe, and **both directions were stepped on once**:

1. **It must be a common ancestor of all three slot subtrees.** The plugin renders into `shell.overlay` (the floating button), `sidebar.footer.action` (the sidebar entry), and the panel itself, and these have no common ancestor. The alias originally hung on `.dsh-mcp-wrap` — after moving the corner radii to `--mcp-r-*`, the floating button's radius and shadow failed to resolve on the spot.
2. **It must be on the same level as the theme tokens.** `ui-theme` defines `--dsw-alias-*` on **`body`** (`design-platform.css`'s `body{}` and `body[data-ds-dark-theme]{}`; `ui-layout` likewise does `body.setAttribute('data-ds-dark-theme','')`). Custom properties are substituted at the point of declaration and do not participate in "lookup upward", so hanging it on `:root` (an ancestor of `body`) would resolve to empty values — the entire set of color aliases fails, and the card and panel backgrounds all become transparent.

`test/theme-contract.test.mjs` pins this: `aliasHost()` requires the alias host to be `body` (asserting `=== 'body'` on the real stylesheet, and asserting that `:root` is reported faithfully on a violating sample), and `subtreesMissingLabelColor()` additionally requires that each of the three slot subtrees can resolve `--dsw-alias-label-primary`.

### Four rules aligned with the official spec

The criteria align directly with DSH's own spec (`packages/client/ui-theme/tests/`), one-to-one in semantics, so upstream tightening can be compared directly:

| Rule | Criterion | Consequence of violation |
|---|---|---|
| Full-round pairing | `50%`/`100%`/`≥99px` must be paired with `corner-shape: round` in the same rule | `corner-shape.css` applies `superellipse(1.5)` to the whole document in `@supports` using the universal selector `*`; unpaired circles get squashed square and pills get their ends flattened |
| Radii use the scale | No literal values; reference only `--dsw-radius-*` | The official spec rules "literal radii >4px and <99px" as violations (≤4px counts as drawing detail); the scale is `xs:4 / sm:8 / md:12 / lg:16 / xl:20 / panel:28` |
| Raised surfaces use shadow, not border | `border: 0` + `--dsw-elevation-prominent` | Using a neutral border together with an elevation shadow draws the outline twice, and the border width shifts layout |
| Monospace uses `--ds-font-family-code` | With a fallback, no literal stack | This one is really defined by `ui-theme` (`base.css`'s `:root`; used in 51 places officially). The similarly named `--dsw-font-mono` is defined nowhere in the repo (`dsh-market` misuses its alias form `--dsw-alias-font-mono`), so referencing it means always hitting the fallback, and monospace glyphs would not match the host's code blocks |

The `corner-shape` rule only shows up on engines that support the feature (measured in Chromium: `CSS.supports('corner-shape','superellipse(1.5)') === true`), and jsdom cannot render it, so it can only be checked by scanning stylesheet text — which is also what upstream ui-theme does.

`scripts/theme-spec.mjs` is the sole implementation of these criteria, and `test/theme-contract.test.mjs` asserts with it. The tests are deliberately written on both sides; neither is dispensable:

- **"Catches errors"** — every scanner has a set of violating samples it must hit. Otherwise, when a scanner degenerates into "always passing", the other side is all empty.
- **"No false positives"** — the count must be zero on the real stylesheet. Otherwise a scanner that floods the screen with false positives gets turned off as noise.

When these criteria were written they were checked with mutation testing: eight classes of error were deliberately introduced into the real CSS (removing one `corner-shape`, changing a radius to `14px`, adding a neutral border to a raised surface, hard-coding a color in the alias layer, hard-coding a monospace stack, pointing an alias at a nonexistent token, changing the host back to `:root`, deleting a subtree's label color), and initially only 6/8 were caught — both misses were **the most common shapes in this repository**: rules writing the alias `var(--mcp-line)` instead of `--dsw-alias-border-*`, and hard-coded colors going unnoticed once the alias layer was excluded wholesale. Both were added to the criteria.

### Token existence: why a snapshot is needed

"Is the token an alias points at actually defined?" is the easiest item in this set of criteria to make vacuous — the first version did exactly that: it checked the list only for `--dsw-radius-*`, and for all other `--dsw-*` it **checked the prefix only**. So a name like `--mcp-accent:var(--dsw-alias-brand-typo)` was silently allowed through, and one of the eight mutation classes above happened to be "an alias points at a nonexistent token", which in fact was **not** genuinely caught at the time (that mutation round mistakenly recorded it as caught). A wrong name with a legal prefix is exactly the most dangerous shape: `--dsw-alias-font-mono` looks entirely real, yet `var()` resolves to an empty value, the panel loses its colors on the spot, and jsdom cannot render it.

Existence must be checked against a list, so the repository carries a generated artifact:

- `scripts/sync-theme-tokens.mjs` extracts all `--dsw-*` / `--ds-*` definitions from the ui-theme stylesheets in the **host source tree** and writes `scripts/dsh-theme-tokens.mjs` (408 tokens). When the host updates, replay it by hand once, and the diff shows directly which tokens upstream added or removed.
- The snapshot counts every place a token is **defined**, under whatever selector — a real-machine global scan sees only 407, and the missing one is `--dsw-focus-ring-color` (defined on `:focus-visible`, visible only on a focused element). The existence check cares about "is this name defined by anyone", so being broader is correct; narrowing would start producing false positives.
- It does not cover `--dsh-*`: those are each package's own runtime variables, scattered across the repo with no single owner, and are not part of the theme contract. If they are ever really needed, first extend the generator's collection range, and **do not fall back to allowing prefixes**.

`test/theme-contract.test.mjs` pins both ends: violating samples must be caught, and the snapshot itself must have scale and key members (otherwise, if the list degenerates into an empty table, the existence check would invert into "no token exists" and make the other side's assertions meaningless).

## The skill ability pane: why it sits alongside the MCP pane instead of merging with it

The panel has **two ability panes** (MCP / Skills), switched by an ability-layer enum at the top, sharing the same floating window and sidebar entry. They must be two independent host services:

- **`skills` cannot go into the MCP gateway's `static inject`**. Cordis's `inject` is a **dependency declaration** — when the service is missing, the fiber simply stays inactive and waits, **without raising an error**. But the host's built-in plugin `dsh-skill` can be disabled by the user, and once `skills` is added to the existing gateway's inject, those profiles would have the **MCP panel fail silently along with it**. So `SkillsManagerGateway` is a separate sub-plugin with its own `inject = ["skills"]`; when unmet, only the skill surface is affected.
- **The two services must be mounted within the same patch entry**: `cordis.patch.yml` has only one, and `package-contract` asserts that its id and name each appear exactly once, so the sub-plugin is mounted by the existing plugin's constructor via `ctx.plugin()`.
- **The contracts must be merged into the same `MCP_CONTRIBUTION`**: `typert.remotes.register()` deduplicates by `contribution.package`, and a second `$mount` throws `Remote package "…" is already registered`, making the plugin fail to activate at the mount stage and the **panel disappear entirely**. Descriptors are deduplicated only by endpoint (namespace/method) and id, and a single contribution naturally supports multiple namespaces. Likewise, `SKILLS_CSS` must be **merged into a single** `__injectCss` call together with `MCP_CSS` (that function's id is hard-coded, and a second call overwrites the same `<style>`).

### Where a skill's "location" comes from (root + on-disk entry)

`ctx.skills` **does not expose `roots()`** (the public surface is only list/get/snapshot/collect/register), yet enabling/disabling and deletion must be precise down to **a single file**. So the location is reverse-derived from the summary's `resourceBase` and `path` — but it must be split into two things:

- **Root**: for a directory bundle, take `dirname(resourceBase.path)`; for a flat skill, take `resourceBase.path` itself.
  This is the **display path** the host provides, and it is exactly the one needed for writing.
- **On-disk entry**: for a directory bundle, take the last segment of `resourceBase.path` (the host constructs `directory = <root>/<entry>` fixedly, so the last segment is the on-disk directory name); for a flat skill, **scan once under the root and match the host-reported `path` by realpath** to find that name.

⚠️ **The skill name (the frontmatter `name`) does not participate in locating.** The host allows the on-disk entry name to differ from it, and building a path from the name would make every operation on such a skill fail in the panel. The **conventions of the two path fields also differ** (`resourceBase.path` is a display path, `path` is a realpath), and they necessarily diverge under links, so they cannot be used to compare paths against each other.
If the location cannot be derived, **leave it empty** — guessing wrong would make enable/disable or delete act on the wrong directory, which is the most dangerous failure mode in this layer.

### Why enabling/disabling writes the frontmatter instead of renaming

DSH skills have no `disabled` field (MCP has one, skills do not). But the host's two native **invocation-surface fields** combine into "disabled", and this is exactly the tier the VS Code / Copilot official documentation calls "Disabled skills":

```
disable-model-invocation: true   # the model does not call it automatically
user-invocable: false            # you cannot call it manually either
```

So "disable" = write these two fields, and "enable" = both return to their defaults. The benefit is **structural**:

- The skill stays on disk where it was, and the host **still reports it** (`list` is invocation-independent) → the panel does not have to scan the disk itself
  → there is no second source of truth, and therefore none of those defects like "the same identity appearing on two rows" or "linked directories not being scanned";
- It no longer produces the `SKILL.md.disabled` shape, which **no spec recognizes**. Users' skills often live in `~/.agents/skills` — the Agent Skills standard's shared location, scanned by both VS Code and Codex; renaming it there amounts to breaking the user's skill **in other tools** for the sake of one switch in this panel.

⚠️ The cost (written here so it is not mistaken for a bug next time): **"enable" restores both invocation surfaces to invocable**. If the user had manually set `disable-model-invocation: true` (wanting only the "manually invocable only" tier), one "disable → enable" round trip resets it. So the detail page makes the two surfaces **each** an independent writable switch (`setModelInvocable` / `setUserInvocable`, sharing one implementation in `setSkillInvocationFace`) — even if reset, it can be toggled back in the panel without editing files. "Disable" is just a shortcut action for the single combination "turn both off".

⚠️ 1.6.x used the home-grown mechanism of "renaming to `SKILL.md.disabled`". `scanDisabledSkills` is retained as a **one-off migration read**: it lists the leftovers (that we ourselves wrote) on the user's disk and allows restoring them, and it can be deleted wholesale in the next major version — it is not a second source of truth.

### Why the license gate was judged per skill (retired 2026-10-10)

This section is a decision record: **the per-skill license gate was retired together with the built-in curated catalog**, and this section preserves the reasoning of the time.

What was judged back then was this plugin's self-maintained built-in curated catalog. The same repository contained both Apache-2.0 skills and proprietary-licensed skills forbidding "retaining a copy outside the service" (the documentation skills from `anthropics/skills` are the latter). Aggregating by repository is wrong in both directions: either you kill what could be installed, or you let in what cannot be. So the catalog recorded **facts** (what the license is, which file holds the evidence), and "can it be installed" was computed by `classifyLicense()` at catalog generation time — the gate had exactly one implementation.

Retired on 2026-10-10, for two reasons:

- **There was no longer anything to judge**: the catalog is no longer self-maintained and the generated artifact was deleted, so the things along the determination chain went away with it;
- **Upstream does not provide license information**: the only source today (skillhub.cn) has **no license field** in its entries, so there is nothing to verify, and we would not invent one.

So today's safety boundary is not that hard gate, but "no license determination for external sources + disclosure + one explicit confirmation". The reasoning "per skill rather than aggregated by repository" itself still holds — any future scheme that introduces a third-party catalog will have to face it.

### Why connect directly to the skillhub.cn upstream instead of reusing a third-party plugin's routes

DSH already has a third-party plugin that connects to skillhub (`@cocofhu/skillhub`), which exposes its own registered same-origin route `/skillhub`. We did not reuse it, for two reasons:

- It is that plugin's **private protocol**, not a host contract: if it changes version or is uninstalled, this route breaks; and that plugin also holds the authority to install/restart DSH plugins, so treating it as a data source amounts to tying the marketplace to it.
- The upstream itself is **public and unauthenticated**: `GET /api/skills` (search/list), `/api/v1/skills/<slug>` (detail), `/api/v1/download?slug=` (302 to a zip), `/api/v1/categories`; the base address can be pointed at a mirror via `DSH_SKILLHUB_BASE`. Connecting directly also buys a substantive benefit: **the destination is chosen by the panel** (reusing the same "install to" = global/project × `.dsh`/`.agents`), instead of the upstream deciding for the user.

Requests are all issued **on the host side**, and the panel itself does not go online — this both avoids browser CORS (which is very likely why the third-party plugin needs a server-side proxy) and keeps the constraint "the panel opens no new network dependencies" intact.

Upstream entries **have no license field**, so external sources only get disclosure + explicit confirmation (the publisher's enterprise certification, Tencent keen/sanbu scan conclusions, whether an API Key is required). The confirmation is validated by the **server**: `acknowledged` must go on the wire, and the UI checkbox is merely its interface. The download only lands as a temporary zip, and installation is still handed to the existing `importSkill` — so an external source and "import from this machine" therefore go through the **same write path**, and guards like the size limit, zip slip, and symlinks have only one implementation.

An easy mistake: when a new panel runs on an **old host process**, the `skillHubSearch` endpoint simply does not exist (wire 404). Displaying that as "failed to connect to skillhub.cn" is a false report — the upstream was never accessed even once. So the panel says different things for the two cases: the host process is old → prompt to restart the host; the upstream is really down → show a warning and retry in the result area.

## Persisted and running: one path

When the user clicks "save", the panel has to state two things: **was it written to the configuration**
and **did the running connection actually start from it**. Both used to share one "updated" message,
which produced two classes of silent errors:

- a higher configuration layer (home patch / CLI overlay) overrides the same entry: disk changed,
  runtime did not, and the user is told "success";
- the loader entries the plugin assembled itself were not the same source of truth as the rows in the
  patch: the panel read one place, the runtime walked another.

There is now exactly one path (`lib/profile-composition.js`):

1. **read** the complete ordered composition of the current profile (bundle → profile → home → CLI
   overlay → telemetry) through the official `readProfilePatches`;
2. **edit** the matching row in the profile patch file (atomic write plus version check; still the only
   writer);
3. **judge** whether that row counts in the **final effective configuration** via the official
   `composeEntries` — being overridden or disabled fails right here;
4. **apply** the whole composition through the official
   `reconcileProfilePatches(root, patches, name, requiredIds)`; the host mounts, removes and restarts
   the entries itself and the plugin no longer calls `loader.create` / `entry.update` / `parent.remove`;
5. **verify** the running entries (count, enabled state, target tool present); on failure the previous
   file content is written back and applied again, and both failure reasons are reported together.

Every mutating RPC therefore returns the same shape: `persisted` (`applied` / `unchanged` /
`rolled-back`), `live` (`applied` / `unchanged` / `skipped` / `failed`) and `diagnostics`. A deployment
without a profile launcher (no `profileContext` or no official composition API) honestly reports
`live: 'skipped'` with the reason instead of pretending the change is live.

### Two details you must know

- **The root context**: the official composition API only recognizes the root `ctx` the launcher used
  to mount the include (an internal `WeakMap<Context, Entry>`); a plugin's derived ctx cannot reach it.
  This layer always uses `ctx.root`.
- **Mark rows `disabled` before removing them**: `cordis-plugin-loader@1.0.6` (the 0.2.1 host) calls
  `fiber.entry.parent.tree.write()` when a plugin unloads, which for an include-subtree entry is
  `Include.write()` — and that writes the **applied tree** (base plus patch rows), so "remove one
  server" can bake the sibling rows into `cordis.yml`. The unload hook's only early-exit test is
  `fiber.entry.disabled`, so the row is flagged before reconcile. The 0.2.2 include uses a journal
  (routing changes back to their owning layer), where this is unnecessary but harmless.

### Contract and artifacts: one definition

The four RPC faces (host `@Remote`, `lib/typert.js`, the client descriptors in `lib/client.js`, and the
gateway prototype) may only have one definition: `lib/rpc-contract.js`. `scripts/rpc-contract.mjs`
**generates** the middle two, **checks** the order of the first, and the fourth is compared by tests; CI
runs `npm run contract:check`, so hand-editing a generated file or adding a method without regenerating
fails immediately. The client is split into parts by capability, and `lib/client.js` stays a single-file
artifact produced and verified by `scripts/build-client.mjs` (`--check`).

## Tool search policy

**One job only: decide, per tool, whether it can be searched.**

- "Tool search" lists DSH built-in and third-party tools; each is **Resident** or **Searchable**,
  resident by default. There is no global switch and no "recommended / everything resident" mode —
  the list itself is the switch.
- MCP servers are not controlled twice: enable/disable and Deferred/Resident stay on the MCP list,
  one switch per server.
- A searchable tool stays out of the model's context; the model must find it via `tool_search`
  and only then can call it. The search entry and PTC's `run_code` can never be hidden.

Configuration lives in `toolLoading.tools` (tool name → `resident` / `deferred`); a project
writes it into its own `.dsh/mcp.json`. Anything not listed is resident.

Why resident by default: the host exposes no tool provenance API, so the plugin cannot tell
built-in from third-party; hiding anything by default could hide a user's everyday tool.
**No search entry point when there is nothing to search**: with an empty deferred set (no deferred MCP at all, or everything already discovered), `tool_search` disappears from the model-visible tools together with the catalog section. It stays registered in the host, but "searching would find nothing right now" only invites a wasted round (issue #9). This does not conflict with "the search entry point cannot be hidden by user policy": the former is "there is nothing to search", the latter is "the user cannot turn it off".
Server-level stays tri-state: `defer: true` = deferred, `defer: false` = explicitly resident,
absent = follow the rest — so the Deferred/Resident chip always decides.

## Package structure

- `package.json`: declares `dsh.bundle` and the Web `dsh.client`
- `cordis.patch.yml`: inserts the single Host plugin instance
- `lib/index.js`: the `mcpManager` Host Remote
- `lib/mcp-registry.js`: enumeration of MCP entries in the loader and inference of tool ownership
- `lib/workspace-runtime.js`: project config read/write state, the shared mcp-client connections reference-counted by `(project, serverName)`, and the projection of their tools into each session scope
- `lib/workspace-config.js`: reading, writing, and conversion of project-level `.dsh/mcp.json`
- `lib/mcp-config.js`: JSON normalization and structured read/write of YAML patches
- `lib/own-property.js`: the single assignment primitive for building maps from user-controlled names (`setOwn` / `hasOwn`), zero dependencies
- `lib/mcp-import-sources.js`: the source table for other clients on this machine (locations + format conversion) and entry-tolerant normalization
- `lib/env-expression.js`: the sole implementation of restricted `!!js` expressions (generation / validation / extraction / reversal / evaluation)
- `lib/import-admission.js`: pre-write admission of import results (unique `serverName` within a scope, environment variable references normalized to the total-value form)
- `lib/mcp-observability.js`: connection state determination and mcp-client log formatting
- `lib/skills-registry.js`: projection of the host's `ctx.skills` (source / scope / root + on-disk entry derivation), the install-target capability table, physical-location deduplication
- `lib/skills-file-ops.js`: skill file actions (enable/disable = writing the two invocation-surface frontmatter fields, deletion, import, migration read of leftovers from the old mechanism), precisely located by `(root, on-disk entry)`, erroring out rather than falling back when not found
- `lib/skills-archive.js`: safe extraction of archives (zip slip protection, symlink rejection, limits enforced by **actually extracted bytes**)
- `lib/skills-frontmatter.js`: frontmatter validation and per-entry diagnostics (the criteria are copied verbatim from the host, which only warns+skips, invisible to the user)
- `lib/client.js`: reactive Web UI, Remote client, and lifecycle cleanup (assembled from the parts under `lib/client/`, see `scripts/build-client.mjs`)
- `lib/profile-composition.js`: the only entry point for "write and apply" (adapter over the official profile composition API, including rollback and structured results)
- `lib/rpc-contract.js`: the single definition of the RPC contract (the other three faces are generated from it or checked against it)
- `lib/typert.js`: Remote contract description (generated: `npm run contract:write`)
- `scripts/theme-spec.mjs`: the panel styling criteria against the DSH theme contract (full-round pairing, radius scale, raised surfaces, literal color values, monospace fonts, alias host, alias token existence), asserted by `test/theme-contract.test.mjs`
- `scripts/dsh-theme-tokens.mjs`: the DSH theme token list (generated artifact), the data source for the existence criteria
- `scripts/sync-theme-tokens.mjs`: replays that list from the host source tree

Neither `scripts/` nor `test/` goes into the published package (`package.json`'s `files` collects only `lib`, `docs/*.md`, and a few root files); they are development-time contract gates.

`lib/` is a prebuilt artifact; GitHub, tarball, and npm installations do not need to run a build script.
