# billion-context Configuration Reference

[English](./CONFIGURATION.md) | [中文](./CONFIGURATION.zh-CN.md)

`billion-context` is an HTTP proxy that injects [ACP](https://github.com/ranxianglei/acp-kernel) (Active Context Pruning) context compression into LLM API streams. Every option below lives in a single JSON config file (or an equivalent environment variable / CLI flag).

---

## Config File Locations

| Scope | Path | Notes |
|-------|------|-------|
| **Config file (Linux)** | `~/.config/billion-context/billion-context.json` | XDG Base Directory — the canonical, user-editable config |
| **Config file (override)** | value of `XDG_CONFIG_HOME` | relocates the whole config dir |
| **Config file (explicit)** | value of `BILI_CONFIG_FILE` | points directly at any JSON file |
| **CLI flag** | `--config <FILE>` | same as `BILI_CONFIG_FILE`; highest precedence for the file path |
| **Session data** | `~/.local/share/billion-context/sessions/` | persisted compression state, grows over time |

On first run, `billion-context` seeds an empty template (`{ "providers": {} }`) at the config path so you have something to edit. It never overwrites an existing file.

The config file is a pure override layer — every field is optional. Anything unset falls through to the built-in default.

---

## Quick Start

```jsonc
// ~/.config/billion-context/billion-context.json
{
  // Server
  "port": 8787,
  "host": "127.0.0.1",

  // Route two providers
  "providers": {
    "https://api.anthropic.com": {
      "models": {
        "claude-sonnet-4-5": { "context": 200000, "output": 8192 }
      }
    },
    "https://generativelanguage.googleapis.com": {
      "models": {
        "gemini-2.5-pro": { "context": 1000000 }
      }
    }
  },

  // Global compression tuning (applies to every request)
  "compress": {
    "maxContextLimit": "75%",
    "emergencyThresholdPercent": "95%"
  }
}
```

---

## Parameter Reference

Status legend: **ACTIVE** = currently used | **DEPRECATED** = accepted but no effect | **EXPERIMENTAL** = may change

<!-- bili:gen param-ref -->
This index is generated from `website/config-reference/*.yaml` — edit the seed, then run `node tools/gen-config-docs.mjs generate`; do not hand-edit this block.

**Server & core**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `port` | number | 8787 | ACP_PORT, PORT | TCP port the proxy listens on (user zone; lane-spawned proxies use BILI_ZONE_PORT instead). |
| `host` | string | 127.0.0.1 | ACP_HOST | Bind address. 127.0.0.1 = loopback only; :: = dual-stack; 0.0.0.0 exposes outward (no auth — trusted networks only). |
| `sessionHeader` | string | x-acp-session | ACP_SESSION_HEADER | HTTP header carrying the conversation id; same value shares compression state. |
| `log` | boolean | true | ACP_LOG | Per-request logging master switch. |
| `logFile` | string | XDG state path (off disables the file, keeps stderr) | ACP_LOG_FILE | Explicit path for bili.log; auto-rotates at 10 MB. |
| `debug` | boolean | false | ACP_DEBUG | Verbose per-request logging. |
| `dumpSse` | string | unset (directory) | ACP_DUMP_SSE | Directory to dump raw SSE frames for debugging, including loop-originated responses. |
| `passthrough` | boolean | false | ACP_PASSTHROUGH | Global raw-relay switch: forward every request without compression, tool injection, or nudging. |

**Upstream & billing**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `upstream` | string | https://api.anthropic.com | ACP_UPSTREAM | Fallback upstream base URL when a request matches no provider route. |
| `proxy` | string | unset (direct) | BILI_UPSTREAM_PROXY | Global outbound proxy for the proxy's own egress. Resolution: per-route → BILI_UPSTREAM_PROXY → Web UI → this value → HTTP(S)_PROXY → Windows system proxy → direct. Empty string = explicitly direct; SOCKS5 rejected. |
| `upstreamProxy` | string | unset | — | Web-UI manual proxy tier (written by the dashboard's proxy editor); sits below BILI_UPSTREAM_PROXY in resolution order. |
| `upstreamProxyMode` | "auto" \| "manual" \| "direct" | auto (unset behaves as direct) | BILI_UPSTREAM_PROXY_MODE | How the global proxy is sourced: auto (env/system discovery), manual (Web-UI value only), direct (never use a proxy). |
| `providers` | record url-prefix → route entry | {} | — | Route table: URL-prefix keys to per-provider entries (models, compress, compat, …). See the Providers section. |
| `modelContextLimit` | number | 200000 | ACP_MODEL_CONTEXT_LIMIT | Legacy global window ceiling (highest-priority window source and usage denominator); prefer compress.modelContextLimit. |
| `imageBilling` | "auto" \| "pixels" \| "bytes" | auto (resolves to pixels) | BILI_IMAGE_BILLING | Global image-token estimation basis; live-read per request, beats every per-provider setting. |
| `imageTokenCap` | number | unset (uncapped) | BILI_IMAGE_TOKEN_CAP | Global per-image token ceiling applied on top of the resolved billing mode; live-read per request. |
| `imageRescale` | boolean | true | BILI_IMAGE_RESCALE | Egress image downscale master switch (#3295/#3400): large outbound images are sent shrunken while originals stay untouched in session storage. Live-read per request. |
| `billing` | object | {} | — | Per-model billing prices (#4899): billing.prices[model] = { input, output?, cacheRead?, cacheWrite? } in USD per million tokens; overrides the models.dev snapshot for the panel's USD spend ledger and saved-dollar estimate. Unpriced models show tokens only. |

**Behavior toggles**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `rollout` | object | {} | — | Feature rollout (canary) block: per-feature overrides of the version's baked-in rollout plan; features roll out by percent of installs, bucketed on a stable per-machine id. |
| `rollout.installId` | string | auto-generated UUID persisted at ~/.local/state/billion-context/rollout-id.json | — | Pins the bucketing identity instead of the auto-generated state-dir UUID (support/testing: pick or compute an id whose bucket lands inside a cohort). |
| `rollout.features` | record feature name → { enabled?, percent?, salt?, base? } \| boolean \| number | {} | — | Per-feature overrides, keyed by the feature names the running version has under rollout. enabled (boolean) overrides any percentage; percent (0–100) re-scales the cohort; salt re-randomizes it; base re-scopes the nesting. Shorthands: "x": true/false forces on/off, "x": 20 sets percent. Wrong-typed fields (e.g. enabled as a string) are ignored and named by the startup warning — never silently widening a cohort. |
| `rollout.features.enabled` | boolean | unset (bucket math decides) | BILI_ROLLOUT_<FEATURE> | Force a gated feature on/off regardless of percentage. Env tier BILI_ROLLOUT_<FEATURE> (UPPER_SNAKE feature name; 0/false = off, any other value = on) wins over everything, including this field. |
| `rollout.features.percent` | number | the version's baked-in plan | — | Percent of installs (0–100, fractional allowed) that see the feature. Monotonic: raising the percent never drops an already-enabled install; the bucket is prefix-stable per install. |
| `rollout.features.salt` | string | the feature name | — | Hash salt for bucketing. Changing it re-randomizes the whole cohort (the only way to reshuffle; raising percent alone never reshuffles). |
| `rollout.features.base` | string | unset (roll out over everyone) | — | Nested rollout: evaluate this feature only inside the named feature's enabled cohort, so the percent is relative to that population (roll B out to A's users; chains allowed, cycles fail closed). |
| `rollout.features.identityChannelHarvest` | boolean \| number | 0 (off) | BILI_ROLLOUT_IDENTITY_CHANNEL_HARVEST | Identity-channel harvest cohort gate (#5825): allows the loopback-only transcript/sqlite harvest (src/identity-harvest.ts: claude-code / codebuddy / mcode / goose / qwen lanes) without any per-install env switch, when neither the per-install switch (BILI_IDENTITY_HARVEST) nor this key is set nothing ever reads client storage. Owner ruling 2026-11-07: this cohort key is deliberately separate from rollout.features.pluginLaneServerHistory (which governs row PINNING of admitted ids) — either enabler may activate harvesting. Default 0%; raise after small-cohort observation of the degrade warn-once rate. See docs/identity-channels.md. |
| `rollout.features.pluginLaneServerHistory` | boolean \| number | 0 (off) | BILI_ROLLOUT_PLUGIN_LANE_SERVER_HISTORY | Plugin-lane server-owned history (#4491): for enabled installs, (a) plugin-lane requests may carry an internal `biliMsgIds` array parallel to `messages` that pins message identity to client-supplied ids (always stripped before upstream forwarding; malformed arrays are ignored with a warning, id-poisoning shapes hard-fail on the incremental lane); (b) the loopback-only `POST /__bili/plugin/render` endpoint serves the outbound prefix rendered from the unified transcript (folded regions collapse to summary anchors; any desync degrades to a non-2xx so the shim falls back to its local history); (c) the incremental-lane probe advertises `serverHistory`. Default 0% — no behavior change until rolled out. |
| `rollout.features.pluginFullResendWatermark` | boolean \| number | 5 (experimental grey) | BILI_ROLLOUT_PLUGIN_FULL_RESEND_WATERMARK | Full-resend watermark fastpath (#5403/#5418): plugin-lane chat-completions turns whose previous response carried an x-bili-pf-seq stamp assert the resent prefix via the echoed count (structural scan, no full parse); on a hit the pipeline consumes stashed canonical prefix cores plus only the new tail window (byte-identical outbound provenance; ANY doubt falls back to the untouched full-parse path per turn and re-stamps, five credited misses hold the lane for one hour). Requires the client to echo the stamp back as x-bili-pf-count (dsh/pi/opencode/omp do; unadapted lanes never hit). EXPERIMENTAL grey rollout — ON by default for roughly 5% of installs (owner ruling 2026-11-02: small cohort before GA; one-time intro notice in the web UI for every install, tri-state switch in quick config). Force it with `true`, turn off with `false` (or a percent) / env = 0. See TECHNICAL-NOTES.md “Full-resend watermark fastpath”. |
| `maskHosts` | boolean | true | BILI_LOG_MASK_HOSTS | Mask non-public target hosts in logs as <private-host>; credential headers are always masked regardless. |
| `security.adminRelay` | boolean | false | — | Let an embedding host (dsh web today) relay the ENTIRE /__bili/ admin surface through its own entry origin so a remote browser can open the panel (#3373). Fail-closed, file-only. The relayed hop reaches the proxy as a local non-browser client (loopback source + loopback Host, no Origin), so the admin gate stays unchanged; enabling it exposes config editing and credential writes to whoever can reach the host web entry — protect that entry (auth / reverse proxy) first. |
| `subagentSplit` | boolean | true | BILI_SUBAGENT_SPLIT | Claude Code subagents get their own session namespace (<session>\|sub:<agent-id>) instead of queueing behind the main session. Anthropic-wire only — on the Responses wire this switch is a no-op (see the `subagentSplit` / BOTH-mechanisms scope note). |
| `personaSplit` | boolean | true | BILI_PERSONA_SPLIT | Split the Responses-wire lane keyed by the instructions fingerprint (Claude Code over /v1/responses; Codex root threads / older builds) when the instructions text changes AND the incoming history does not continue the tracked chain (default on). Opt out with env BILI_PERSONA_SPLIT=0 or personaSplit: false (env wins). |
| `forkAdoption` | boolean | false | BILI_FORK_ADOPTION | Anonymous forks inherit the parent's compression blocks whose source content is fully present in the forked request. |
| `autoModeForge.enabled` | boolean | true | BILI_AUTO_MODE_FORGE | Answer Claude Code auto-mode safety-classifier calls locally with a forged allow verdict instead of forwarding them upstream (#2740): zero egress, zero billing for that lane; every forged verdict is audit-logged and the session carries a notice badge. false / env 0 restores pure passthrough for users who pay for real verdicts. |
| `affinitySimhash` | boolean | true | BILI_AFFINITY_SIMHASH | Simhash chain-alignment adoption for anonymous clients (#2265): a client-side pervasive decorative rewrite (e.g. Trae re-stamping model tags on every assistant message) re-attaches the existing session with its compression state instead of minting fresh and re-folding from zero. |
| `resumeInheritance` | boolean | true | BILI_RESUME_INHERITANCE | Identified clients resuming under a new session id inherit the parent's ref assignments and fully-present compression blocks. |
| `chainContentDetection` | boolean | false | BILI_CHAIN_CONTENT | Body-content detection of bili→bili chains (off: body scanning can false-positive on CCR/model-echoed text); by default only x-bili-hop drives chain recognition. |
| `chainEgressStamp` | boolean | false | BILI_CHAIN_STAMP | Emit the model-visible <bili-chain/> checkpoint carrier on egress (off: models treat it as phantom input and burn tokens). |
| `stableSystemAnchor` | boolean | false | BILI_STABLE_SYSTEM_ANCHOR | Best-effort wire-layer prefix-cache anchor: re-sends the first-seen head system bytes even when the client changes them (plain-proxy lanes only). |
| `compat` | { roles?, dropFields?, streamErrorShape?, noCacheControl?, keepResponseId? } | {} (disabled) | — | Global wire-compat block: role remaps, strict-schema field drops, stream error shape, cache-control handling. |
| `compat.roles` | record role → role | {} | — | Map message roles to the names your upstream accepts (e.g. developer→system); exact-match roles only, per-provider entries win per key. |
| `compat.dropFields` | string[] (dot paths) | [] | — | Dot-path fields stripped from every forwarded body for strict-schema gateways that 400 on unknown fields; global + per-provider lists union additively. |
| `compat.streamErrorShape` | "protocol" \| "completion" | protocol | BILI_STREAM_ERROR_SHAPE | How upstream stream failures are presented after the 200 is committed: protocol-native error frames (default) or the legacy synthesized-completion shape. |
| `compat.noCacheControl` | boolean | false | BILI_NO_CACHE_CONTROL | Stop stamping Anthropic-lane cache_control breakpoints entirely (escape hatch for upstreams/relays with their own breakpoint policy). |
| `compat.keepResponseId` | boolean | false | ACP_KEEP_RESPONSE_ID | Preserve previous_response_id on kernel-rebuilt Responses requests (default strips it so rebuilt bodies never reference ids the upstream never issued). |
| `dsh` | object | {} | BILI_ALLOW_DSH_COMPACTION | Section recognized but its former escape hatch is gone (#3666, superseding #2028): the allowDshCompaction key and the BILI_ALLOW_DSH_COMPACTION env var no longer exist — dsh native compaction is refused unconditionally by the wire guard on every lane. Leftover dsh.allowDshCompaction values are ignored with a one-time deprecation warning; apply host-side suppression instead (#3354/#2474). The live keys — dsh.authoredCompaction, dsh.contextTab, dsh.contextTabLabel — are documented in the following entries. |
| `dsh.authoredCompaction` | boolean | true (on, #3901 flip) | BILI_DSH_AUTHORED_COMPACTION | bili answers dsh compaction summarize calls locally with the folded snapshot instead of refusing (#3723/#3733). ON by default since the 0.1.203 dogfood window held; false (or env BILI_DSH_AUTHORED_COMPACTION=0) restores the #1729 refusal path. |
| `dsh.contextTab` | boolean | true | BILI_DSH_CONTEXT_TAB | Registers the DSH top-bar 「上下文」/「Context」 conversation tab at all (#3862/#4237): false removes ONLY that tab — compression, the settings section and every other surface keep working. Hiding never disables compression; the ledger stays reachable via the settings section (会话 subpage), the plugin bundle config face, the Web UI and the /acp command. Takes effect on the next page load / dsh restart (slot registration happens at page load); default true = today's behavior unchanged. |
| `dsh.contextTabLabel` | string | unset (built-in 「上下文」/「Context」) | — | Custom display name for the DSH top-bar Context tab (#4237), e.g. "压缩账本" when another plugin (dsh-context) owns the name 「上下文」. Trimmed non-empty string wins over the built-in label; blank or absent falls back to the built-in. File-only tier (display preference, no env knob per #2030). Default unset = built-in label unchanged. |
| `resign` | scheme → { enabled?, passthrough?, credentialRef? } | {} (armed; built-in scheme sdk-hmac-sha256) | BILI_RESIGN, BILI_RESIGN_PASSTHROUGH, BILI_CODEARTS_REF, BILI_RESIGN_BENEFIT | Re-sign arm keyed by Authorization scheme: signed model requests tunnel with every egress body re-signed; unresignable requests are refused locally 403 unless passthrough opts that scheme into verbatim forwarding. |
| `promptCache.routing` | "auto" \| "enabled" \| "disabled" | disabled | ACP_PROMPT_CACHE_ROUTING | Posture of bili's own `prompt_cache_key` emission (both wires); client-supplied keys always forward verbatim. |
| `cacheKeepalive.enabled` | boolean | false | BILI_CACHE_KEEPALIVE | Master switch for idle prompt-cache keepalive on the Anthropic wire (#3376): while a session goes idle, bili replays the last forwarded body with max_tokens=1 on a TTL-derived cadence so the upstream prefix cache stays warm; hits are verified via usage.cache_read_input_tokens; stops on miss/429/error-streak/duration cap. Also settable per provider route and per model. |
| `cacheKeepalive.ttlFactor` | number | 0.9 | BILI_CACHE_KEEPALIVE_TTL_FACTOR | Cadence factor applied to the detected/assumed cache TTL tier (ping interval = tier x factor; 0.9 gives roughly one ping per 4.5 min on the 5-min tier and per 54 min on the 1-hour tier). Must be in (0, 1]. |
| `cacheKeepalive.maxDurationMs` | number | 86400000 | BILI_CACHE_KEEPALIVE_MAX_DURATION_MS | Per-session keepalive lifetime cap, measured from the session's last real request (default 24 h); past it, keepalive disarms even while still hitting. |
| `cacheKeepalive.maxConcurrentPings` | number | 4 | BILI_CACHE_KEEPALIVE_MAX_PINGS | Cap on simultaneously armed sessions; when exceeded, the longest-idle armed session is evicted first. |
| `cacheKeepalive.assumeTtl` | "5m" \| "1h" | null (detect from body breakpoints) | BILI_CACHE_KEEPALIVE_ASSUME_TTL | Skip body breakpoint detection and derive the cadence from this tier directly - for relays that inject or rewrite cache_control TTL downstream of bili, leaving the forwarded body breakpoint-less or mis-tiered. |
| `cacheKeepalive.armWithoutBreakpoints` | boolean | false | BILI_CACHE_KEEPALIVE_ARM_WITHOUT_BREAKPOINTS | Arm keepalive even when the forwarded body carries no cache_control breakpoint at all (off by default - without breakpoints there is no explicit break-pointed content to refresh; pair with assumeTtl/intervalMs when your relay manages breakpoints itself). |
| `cacheKeepalive.intervalMs` | number | null (derive from TTL tier) | BILI_CACHE_KEEPALIVE_INTERVAL_MS | Absolute ping interval in milliseconds; wins over ttlFactor, assumeTtl and the detected tier. For fixed cadences that do not follow the upstream TTL policy. |
| `native.attachExternal` | boolean | false | BILI_NATIVE_ATTACH_EXTERNAL | Let launcher-less native plugins attach to an external (lane'd, unarmed) daemon instead of spawning their own. |
| `native.attachLanePriority` | string[] | [] (own lane → user zone → spawn) | — | Ordered list of FOREIGN lane names a lane may ride when no own-lane instance exists (#2905). Own lane always wins first; the user zone (manual bili start, the 8787 global) is ALWAYS last; unlisted lanes stay non-attachable. File-only, no env var. |
| `native.attachPolicy` | "own-lane" \| "global-fallback" | own-lane | BILI_NATIVE_ATTACH_POLICY | Lane affinity for native-hook attach, and the gate on whether any cross-lane riding happens (#2877). own-lane (default): a LANEd hook rides ONLY a same-lane daemon and, with none available, spawns its own instead of falling back onto a lane-less / manually-started bili start daemon or another lane's daemon (that convergence pinned every agent to one daemon's version and double-wrote sessions); an armed lane-less daemon (a managed shared proxy, #1225) stays shareable under either policy. global-fallback restores the pre-#2877 behavior: same-lane first, then a compatible lane-less/user-zone daemon, and (with attachLanePriority) the listed foreign lanes. |
| `native.attachUrl` | string | unset (discover per lane) | BILI_MCP_PROXY | Explicit target origin for native-hook attach (any URL). When set, a hook attaches ONLY to that exact origin instead of auto-discovering, and spawns its own if it is not live; it must still be code-compatible and pass the lifecycle gate. The BILI_MCP_PROXY env var (also set by CLI --origin) takes precedence over this file value; empty/whitespace means unset. |
| `claude.nativePort` | number | unset (lane sticky zone port) | BILI_CLAUDE_NATIVE_PORT | Exact port pin for the claude native lane's hook-spawned proxy (strict-port: squatters are refused loudly). |
| `pi.subagents` | object \| boolean | {} (acp_delegate enabled with package defaults) | PI_ACP_DELEGATE_FORCE_ENABLE, PI_ACP_DELEGATE_MAX_DEPTH, PI_ACP_DELEGATE_SYNC_TIMEOUT_MINUTES, PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES, PI_ACP_DELEGATE_ASYNC_TIMEOUT_MINUTES, PI_ACP_DELEGATE_MAX_CONCURRENT | Built-in pi-lane sub-agents (acp_delegate) surface, #2230 config-home. The pi.subagents section of billion-context.json owns the delegate config; the four acp.json keys (delegate/delegatePrompt/displayUsage/debug) are a deprecated fallback read only while the section is absent. prompt replaces delegatePrompt; debug is scoped to the sub-agent subsystem. Boolean shorthand subagents: false disables the whole surface. Full field table: the pi section in CONFIGURATION.md. |
| `pi.inline` | boolean | true (unset env+file runs inline) | BILI_PI_INLINE | Pi inline lane (#3278; DEFAULT-ON since #5428, superseding the #4687 opt-in rule): the pi extension's compression runs IN-PROCESS — no spawned proxy, no ephemeral port; model traffic and the /__bili//__acp tool surface are served by an in-process engine through a pseudo-origin, the codex Responses WebSocket lane by a loopback-only WS bridge, and the Web UI by a loopback-only web listener booted with the engine. Unset env+file now runs INLINE; an ANNOUNCED attach target (launcher-set BILLION_CONTEXT_PROXY/ATTACH) still beats the default, so `bili pi` keeps its launcher proxy. Opt OUT with BILI_PI_INLINE=0/false/no/off or this key set false — restores the old attach/spawn posture. Resolved env > file > default; an explicit inline choice always beats an announced attach target. Human surface: `bili -i/--inline pi` (≡ the one-command lane) and `bili -s/--server pi` (pin the proxy posture, beats an inherited inline env). |
| `opencode.inline` | boolean | false | BILI_OPENCODE_INLINE | OpenCode inline lane (#3278 port; OPT-IN — the default stays the spawned proxy, per owner decision on #4687): the opencode plugin's compression runs IN-PROCESS — no spawned proxy, no ephemeral port, no MITM certs; model traffic and the /__bili/ tool surface are served by an in-process engine through a pseudo-origin (verified on the Bun host). Set true (or BILI_OPENCODE_INLINE=1) to enable. Resolved env > file; an explicit inline choice always beats an announced attach target, an absent choice falls back to attach/spawn as before. `bili opencode-inline` is the one-command lane. |

**MITM lane**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `providersPath` | string | unset | ACP_PROVIDERS | Path to an external providers.json (legacy/shared routes file); beats both inline providers and the config-file location. |
| `mitm.enabled` | boolean | true | BILI_MITM | HTTPS interception switch for login clients that hard-code their upstream; domains are whitelisted on first sight. |
| `mitm.domains` | string[] | [] | BILI_MITM_DOMAINS | Explicit MITM whitelist domains (unioned with first-sight auto-whitelisting). |
| `mitm.handshakeTimeoutMs` | number | 10000 | BILI_MITM_HANDSHAKE_TIMEOUT_MS | TLS handshake timeout for intercepted connections. |

**Process & persistence**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `network` | object | {} (all defaults) | — | Transport timeouts, watchdogs and replay policy for upstream calls. |
| `network.upstreamTimeoutMs` | number | 720000 | BILI_UPSTREAM_TIMEOUT_MS | Hard ceiling on a single upstream call (12 min covers slow deep-thinking models). |
| `network.requestWatchdogMs` | number | 2× upstreamTimeoutMs | BILI_REQUEST_WATCHDOG_MS | Absolute watchdog that force-aborts a stuck upstream socket even when the per-call timer was never armed. |
| `network.keepAliveTimeoutMs` | number | 5000 | BILI_KEEP_ALIVE_TIMEOUT_MS | Idle keep-alive timeout for pooled upstream sockets. |
| `network.clientErrorBackstopMs` | number | 30000 | BILI_CLIENT_ERROR_BACKSTOP_MS | Backstop that aborts a client connection that stops reading a committed response. |
| `network.exposureLogIntervalMs` | number | 3600000 (0 disables the log) | BILI_EXPOSURE_LOG_INTERVAL_MS | How often bound-address exposure warnings repeat in the log; 0 disables them entirely. |
| `network.streamKeepAliveMs` | number | 15000 (0 disables) | BILI_STREAM_KEEPALIVE_MS | Downstream stream keep-alive ping interval between model chunks; 0 disables pinging. |
| `network.preflightHoldMs` | number | 30000 | BILI_PREFLIGHT_HOLD_MS | How long a failed preflight holds before the request is allowed through unreconciled. |
| `network.preflightDeadEndCooldownMs` | number | 300000 | BILI_PREFLIGHT_DEAD_END_COOLDOWN_MS | Cooldown after a dead-end preflight before retrying reconciliation for the same session. |
| `network.replayRetryMax` | number | 3 (1 disables replays) | BILI_REPLAY_RETRY_MAX | Maximum transport-failure replays of an identical request before surfacing the error. |
| `network.replayRetryBaseMs` | number | 1500 (0 disables the delay) | BILI_REPLAY_RETRY_BASE_MS | Base backoff delay between replays (exponential). |
| `network.throttle429Enabled` | boolean | true | BILI_THROTTLE_429 | Egress-side 429 governor (#4204): repeated upstream 429s are answered locally instead of forwarded. Account limits and unrecognized/malformed responses hold origin+credential; only KeyRing's exact `keyring_model_temporarily_unavailable` code with a matching request model holds origin+credential+model, leaving other models eligible. A mismatch or missing model remains account-wide; false restores the legacy always-forward behavior. |
| `network.throttle429MaxConsecutive` | number | 5 | BILI_THROTTLE_429_MAX_CONSECUTIVE | Consecutive upstream 429s before the hold turns terminal (local 424 outside every known SDK retry set); one probe per backoff window keeps checking until any non-429 response clears an account hold, or the matching model's non-429 response clears its model hold. |
| `network.throttle429BaseDelayMs` | number | 2000 | BILI_THROTTLE_429_BASE_DELAY_MS | Base backoff for the 429 hold (doubles per consecutive 429, jittered into [0.5×, 1×], capped by throttle429MaxDelayMs; an upstream Retry-After wins when larger). |
| `network.throttle429MaxDelayMs` | number | 30000 | BILI_THROTTLE_429_MAX_DELAY_MS | Ceiling for the 429 hold backoff and for the terminal-phase probe interval. |
| `network.throttle429Scope` | string | credential | BILI_THROTTLE_429_SCOPE | Hold granularity for marker-less upstream 429s (#5199). `credential` (default) keeps #5696's conservative semantics — any 429 without a recognized model marker (`keyring_model_temporarily_unavailable`, or a bili relay's `bili_throttle_hold` scope=model) holds the whole origin+credential, so every model behind that credential waits out the backoff. `model` keys the hold by the send's request model instead, for gateways that front many independently-limited models behind one credential (LiteLLM/one-api/opencode.ai-style relays where one model's RPM exhaustion must not freeze its siblings); requests whose model cannot be identified remain credential-wide, and recognized markers keep their own semantics in both modes. |
| `network.maxShrinkPerCompress` | number | unset | BILI_MAX_SHRINK_PER_COMPRESS | Cap on how much one compression may shrink history (anti-collapse guard). |
| `network.proxyKeepAliveMaxMs` | number | 55000 (0 = one-shot connections) | BILI_PROXY_KEEPALIVE_MAX_MS | Max lifetime of a connection through an outbound egress proxy before forcing reconnection (avoids stale NAT mappings). |
| `network.postResponseLingerMs` | number | 5000 | BILI_POST_RESPONSE_LINGER_MS | Graceful-close budget for proxy-initiated closes after the response completed: the socket is held waiting for the peer's FIN/TLS close_notify and destroyed at the deadline (reason=linger-backstop). |
| `network.allowPrivateHttpProviders` | boolean | false | BILI_ALLOW_PRIVATE_HTTP_PROVIDERS | Opt-in (#2984): admit plain-HTTP providers on private networks (RFC1918, 127/8, link-local, ULA, *.local/.lan/.internal) into the agent-registry intake and summary-endpoint guards. Off by default — plaintext stays loopback-only; public IPs/domains and CGNAT (100.64/10) stay refused regardless. 1/true enables. |
| `network.receiveBodyBytes` | number | 5368709120 | BILI_RECEIVE_BODY_BYTES | Max inbound wire bytes read into memory per request before a 413 at the receive stage. Raised from a hardcoded 100 MiB to 5 GiB (#3128 owner decision) so multi-gigabyte single requests are accepted instead of the socket being reset. Also the threshold above which a decoded request consumes one of two shared large-decode admission slots. WebSocket lanes keep the fixed 100 MiB surface. |
| `network.decodedBodyBytes` | number | 10737418240 | BILI_DECODED_BODY_BYTES | Max DECODED bytes after content-encoding expansion (gzip/deflate/br/zstd), checked incrementally during decode (decode-stage 413). Default is 2x the receive budget, mirroring the legacy decode=2x-wire relationship; guards against decompression bombs. |
| `network.outboundBodyBytes` | number | 5368709120 | BILI_OUTBOUND_BODY_BYTES | Max rebuilt request bytes forwarded upstream (forward-stage 413), counted as UTF-8 bytes of the final body string. Checked before the fetch so an over-budget rebuild never reaches the upstream watchdog allocation. |
| `network.wsOutboundBytes` | number | 10485760 | BILI_WS_OUTBOUND_BYTES | Soft byte budget for the WebSocket lane only (#3701): when the final serialized Responses WS frame exceeds it, older images are shed from the OUTBOUND COPY first (archived as placeholder notes — originals stay in session storage, recoverable via read_original_image / decompress on tool-armed lanes — codex-style lanes that reject injected tools keep the size-only annotation), then whatever remains is boundedly downscaled through the jimp maxDim ladder. If the frame still does not fit and the upstream closes with 1009 before any event, one strictly smaller resend is attempted within the same request. Set 0 to disable shedding (previous send-as-is behavior). HTTP lanes are unaffected — the hard refusal cap stays network.outboundBodyBytes. |
| `network.httpOutboundBytes` | number | 10485760 | BILI_HTTP_OUTBOUND_BYTES | Soft byte budget for the plain/proxy/pi-native HTTP relay lane (#3909): when the final serialized request exceeds it, older images are shed from the OUTBOUND COPY first (archived as placeholder notes — originals stay in session storage, recoverable via read_original_image / decompress on tool-armed lanes — codex-style lanes that reject injected tools keep the size-only annotation), then whatever remains is boundedly downscaled through the jimp maxDim ladder. Closes the gap image-dense sessions leave open: token-space folding decides in tokens while the upstream rejects in bytes / pixel-decode CPU (Cloudflare Worker 503), so a ~48 MiB request 503s forever with every retry resending the same pixels. Applies only when no managed transport is installed (the spawned relay); the WS lane uses network.wsOutboundBytes and managed HTTP transports (inline-engine / dsh-inline) are never shed here (#3701 Finding 1). Set 0 to disable (previous send-as-is); the hard refusal cap stays network.outboundBodyBytes. |
| `network.caFile` | string | unset | BILI_CA_FILE | Path to a PEM file with extra root CAs trusted by bili's OWN upstream fetches (#3776). Merged with Node's built-in roots and any NODE_EXTRA_CA_CERTS entries — never replaces them. For security software doing HTTPS/encrypted-connection scanning (Kaspersky, enterprise DLP) or a corporate MITM proxy that re-signs the upstream: export that root CA to PEM and point this at it. Unset = default trust, byte-identical behavior. |
| `guardrails` | object | {} (all defaults) | — | Guardrails: tool-output guardrails for the pi/omp plugin bundles (#3066) plus the proxy-side text-run stream guard (#3406). |
| `guardrails.bashTimeout` | number | 60 | BILI_GUARDRAIL_BASH_TIMEOUT | Seconds injected as the bash tool's timeout when the model omits it (#3066 owner intent, re-affirmed #3366: an unsupervised bash call could hang a pi session for a whole day — the host schema provides no default). Set N to tune, 0 to disable injection (pi-native no-default). |
| `guardrails.maxOutputBytes` | number | 50000 | BILI_GUARDRAIL_MAX_OUTPUT_BYTES | Combined text-output byte cap per tool result in the pi/omp plugin (0 disables the cap). Over-cap output is truncated head-first with a notice pointing at the host-saved full output. |
| `guardrails.repetition` | boolean \| object | true | BILI_GUARDRAIL_REPETITION | Identical-call loop-breaker for the pi/omp plugin: warns from the 3rd consecutive identical call issued in quick succession (arguments compare key-order-insensitively; a previous identical call that actually executed for >=5s counts as long polling and restarts the run), issues ONE final refusal (that call is refused but the turn stays alive) at the 5th so a legitimate wait/poll can still switch to a longer wait, and aborts the turn only if the identical call is repeated again after that refusal (#5225). The object form additionally accepts `enabled` (default true, gate), `warn` (default 3, warning threshold), `abort` (default 5, final-refuse threshold), and `recovery` (default false, opt-in graceful-termination mode: calls 6–(abort+4) are refused with a stuck-report while the turn stays alive, and the turn is forcibly terminated only when the identical call reaches abort+5 in a row (#5505)). false / env 0 disables it. Object sub-fields are file-only (not exposed via env var). |
| `guardrails.repetition.enabled` | boolean | true | — (file-only) | Gates the identical-call loop-breaker when used with the object form. true (default) enables it; false disables it. Use `repetition: false` (boolean form) for the simpler opt-out. |
| `guardrails.repetition.warn` | number | 3 | — (file-only) | First warning threshold. Identical calls from this count onward get a WARNING notice appended to results (#3066). Must be less than `abort`. |
| `guardrails.repetition.abort` | number | 5 | — (file-only) | Final-refuse threshold. The next identical call after this count is blocked and refused without execution, followed by a FINAL WARNING (#5225). Must be greater than `warn`. |
| `guardrails.repetition.recovery` | boolean | false | — (file-only) | Opt-in graceful-termination mode (#5505). When true, calls after the final refusal (abort) are refused with a stuck-report while the turn stays alive (soft-stop). The turn is forcibly terminated only when the identical call reaches abort+5 (hard backstop, default 10). false (default) = original behavior: ctx.abort() at call 6. |
| `guardrails.textRunThreshold` | number | 200 | BILI_GUARDRAIL_TEXT_RUN_THRESHOLD | Single-codepoint repetition breaker over decoded model text on the response stream (#3260; kill switch added by #3406 item 1 after the #3331 review). Trips at N consecutive identical codepoints - legit prose/code stays far below the 200 default, a symbol-loop model does not. Set N to tune, 0 (or negative) to disable: legit long same-char output (code comment separators, ASCII rules) is then never cut mid-stream. The thinking/reasoning channels sit inside this lane too. |
| `persist` | object | {} (all defaults) | — | Session persistence to disk under the XDG state dir. |
| `persist.enabled` | boolean | true | BILI_PERSIST | Master switch for writing session records to disk (0/false turns it off). |
| `persist.zstd` | boolean | false | BILI_PERSIST_ZSTD | Zstd-compress persisted session files (1/true enables). |
| `persist.debounceMs` | number | 500 | BILI_PERSIST_DEBOUNCE_MS | Write debounce window for session files. |
| `persist.tailTokens` | number | 16384 (0 disables message persistence) | BILI_PERSIST_TAIL_TOKENS | Token-size tail of recent messages kept as raw text for export fidelity. |
| `persist.epermAlertThreshold` | number | 5 | BILI_PERSIST_EPERM_ALERT_THRESHOLD | Consecutive EPERM write failures before alerting in the log. |
| `persist.epermAlertRepeatMs` | number | 0 (no repeats) | BILI_PERSIST_EPERM_ALERT_REPEAT_MS | Repeat interval for the EPERM alert; 0 logs it once. |
| `storage` | object | {} (all defaults) | — | Unified SQLite storage sidecar settings (#2671). |
| `storage.unified` | legacy\|shadow\|full | unset (full) | BILI_STORAGE_UNIFIED | Tiered storage-migration switch (#2671): shadow = unified SQLite double-write dry-run with digest reconciliation; full = drop-in read path (unified-first loads with organic import, legacy fallback). Absent everywhere now defaults to FULL (#3818 flip - the shadow dry-run reconciled cleanly since #2815, so the index is the load path; JSON envelopes keep being written, and legacy remains the one-line escape hatch). File tier is strict legacy/shadow/full; the env tier also accepts 1/true (=shadow) and unified (=full) and wins over the file. Resolved once per lane boot - hot edits need a restart. Encryption (BILI_ENCRYPTION_KEY) hard-blocks the sidecar. |
| `storage.backend` | sqlite\|mysql | unset (sqlite) | BILI_STORAGE_BACKEND | Storage backend selection (#3388 / #3931): the unified store consumes an operation-level async StorageBackend contract. sqlite is the default (the existing UnifiedStore behind a Promise-wrapped adapter). mysql is FULLY WIRED (steps 2+3): openBackend("mysql", dsn) opens the real MysqlBackend against MySQL 8.0 — the full contract surface (ingest with CAS refcounts, reads, session_ext, reap journal, archive/restore/gc, checkpoints, conversations), with mysql2 bundled as a regular dependency and loaded lazily (boots that never select mysql never load it). The proxy hot path is wired through the async shadow facade: saves enqueue onto a serial backend queue (watermark deltas, orphan/reap journal, digest sampling — sqlite keeps its zero-await sync fast path unchanged), SYNC reads ride the JSON envelope (the sidecar attaches asynchronously via ready(); viewFor/importRecord sync facades miss by design), replicas/ext/GC/export/fork speak the async twins (#4911: the fork lane awaits lastLiveSeq + the row clone through them; the sync window reads for fold-anchor backfill / snapshot render stay envelope-served by design). writerOff stays sqlite-only (the envelope is the mysql sync read path). Unknown names fall back to sqlite with a notice. Resolved once per lane boot. |
| `storage.mysql.dsn` | string | unset | BILI_MYSQL_DSN | MySQL DSN for storage.backend="mysql" (#3388 step 2, #3931): mysql://user:pass@host:3306/db. Consumed by the StorageBackend contract paths (hot path included — the async shadow queue). env BILI_MYSQL_DSN wins over the file key. Empty/unset = the mysql backend cannot open — the documented error names both knobs and the working default. |
| `storage.sqliteAutoDownload` | boolean | true | BILI_SQLITE_AUTO_DOWNLOAD | Gate for the one-time SQLite engine self-download (#2833): when no engine is available in-process (no built-in node:sqlite, no host-installed better-sqlite3) and the unified sidecar is wanted on this platform, bili downloads the pinned better-sqlite3 prebuilt tarball from the npm registry once (~11 MB, sha512-verified) into the cache dir and reuses it on every later start. Engine resolution order: built-in node:sqlite (Node >= 22.5) -> host-provided better-sqlite3 -> cached self-download -> self-download (gated by this switch) -> none (legacy-only, the #2825 degrade contract). The switch gates only the network fetch - a cached copy is used even when it is false; unsupported platforms never download. The tarball download walks a builtin mirror list (#3338): the configured registry (BILI_UPDATE_REGISTRY / update.registry) is tried first, then https://registry.npmjs.org, then https://registry.npmmirror.com - the first mirror that yields a sha512-verified tarball wins; a Node < 22.5 with no engine gets an explicit Node upgrade hint in the degrade reason (#3385). Engine artifacts are pinned PER RUNTIME, because a binding cannot be loaded outside the range its package declares: Node >= 22 with N-API >= 10 uses better-sqlite3 v13 (one tarball that carries its own prebuilds), while Node 20 and the Node 22.0-22.12 band - which passes v13's major floor but only ships N-API 9 - use v12.9.0 (a JS-only tarball plus its ABI-keyed prebuild, fetched from the binary mirror and bound through nativeBinding). That keeps a low Node on the unified lane instead of degrading to legacy. A runtime no pinned artifact serves (below every floor, or an ABI no prebuild targets) is refused before any load, with neither the download nor a cached copy registered, since loading such a binding crashes the process instead of failing gracefully (#3341, #3894). A failed download arms a 6-hour retry cooldown persisted as a marker file under the cache dir (billion-context/sqlite/.bootstrap-failed.json); the storage diagnostics blob shows the marker's absolute expiry time and path - delete that file and restart bili to force an immediate retry instead of waiting out the whole window (#3788). |
| `storage.jsonWriter` | on\|off | on | BILI_STORAGE_JSON_WRITER | Phase 3 envelope switch (#2960): off stops writing the legacy JSON session envelope while storage.unified is full - the SQLite index becomes the only persistent copy (reads are already unified-first; boot enumerates the index union, so index-only sessions load normally). Only honored in effective-full mode: under shadow/legacy (or with encryption active) the request is ignored with a one-time warning because the JSON file remains the sole source of truth. Env tier 0/false/off = off and 1/true/on = on wins over the strict file spellings. Fail-safe: if the sidecar disables itself mid-run, envelope writes resume on the next save. Rollback: unset the knob - writing resumes, index-only sessions keep loading via the boot union, and replicas/restore re-materialize portable JSON envelopes. Downgrading the binary (or losing the SQLite engine) makes index-only sessions invisible to v0.1.196 and older until a >=v0.1.197 binary runs again - the data stays intact in index.db, it is just not read by the older code. The per-session content-store sidecar keeps being written either way. A jsonWriter=off lane must be the SOLE writer of its sessions directory: an off lane reads unified-first and never falls back to the file, so any peer instance running legacy/shadow against the same directory diverges silently (its JSON copy stops receiving updates, and the off lane never sees the peer's writes). |
| `storage.walJournalSizeLimitBytes` | number | 8388608 | BILI_STORAGE_WAL_JOURNAL_SIZE_LIMIT_BYTES | WAL reclamation cap for index.db-wal (#3250), in bytes: every completed checkpoint truncates the WAL file back to this size, bounding disk use and crash-recovery replay in long-lived processes. NOT a per-session data quota - data lands in index.db as it is written and the WAL only stages frames between checkpoints, so session count/size does not scale this; a large burst can overshoot temporarily until the next completed checkpoint truncates back. Higher = rarer truncate IO but more steady disk use and a longer crash-replay tail. Env tier (positive integer) wins over the file tier; a garbage or non-positive env value falls through to the file/default tier instead of failing boot. Applied when the store opens at lane boot - hot edits need a restart. The effective value appears on the unified-enable log line and in the storage diagnostics blob. |
| `storage.archiveAfterDays` | integer | 365 | BILI_STORAGE_ARCHIVE_AFTER_DAYS | GC age sweep window in days (#3463, #3901): sessions idle longer than this are archived - one JSON line appended to a single archive log (archive/archive.jsonl under the sessions directory — no per-session file spray), a tombstone row keeps the label and identity, content/media refs are released, and restore is one POST away. 0 disables the age sweep; POST /__bili/storage/gc always runs and takes ?vacuum=full to shrink an existing index.db (auto_vacuum=INCREMENTAL is always on for new writes). The same operations have a CLI layer (#3928): bili storage gc [--days N] [--vacuum full\|incremental] [--dry-run], plus bili sessions ls/rm/archive/restore <id> (README 'Storage maintenance CLI' section). Env wins over the file tier. |
| `sessions` | object | {} (all defaults) | — | Session-table size cap and opt-in garbage collection. |
| `sessions.max` | number | 256 | BILI_MAX_SESSIONS | In-memory session table cap (LRU eviction of idle sessions). |
| `sessions.warmMax` | number | 0 | BILI_SESSION_WARM_MAX | Bounded startup (#2803/#3050): max most-recently-saved sessions hydrated at boot before listening; older state reloads on demand. Default 0 (no eager warm set — first touch pays one on-demand load; set 8 to restore the eager behavior). Capped by sessions.max. |
| `sessions.warmMaxBytes` | number | 67108864 | BILI_SESSION_WARM_MAX_BYTES | Decoded-byte budget for the boot warm set (#2803). Counts decoded size, not compressed on-disk bytes, so zstd archives cannot sneak past the RAM bound. A single file over the budget is never warmed. |
| `sessions.residentMaxBytes` | number | 4294967296 | BILI_SESSION_RESIDENT_MAX_BYTES | Soft target for estimated resident session bytes (#2803; raised from 512 MiB to 4 GiB in #5779 — single sessions routinely exceed half a GiB and ping-ponged against the smaller budget forever). Active/in-flight state stays pinned above it; when over target, idle state discharges back to disk as requests complete. Lower it if your machine has little RAM. |
| `sessions.hardMaxBytes` | number | (same as `sessions.residentMaxBytes`) | BILI_SESSION_RESIDENT_HARD_MAX_BYTES | Per-SESSION hard cap on estimated resident bytes (#4788, decision #4792 D1-A). Unlike the pool soft cap — which can only evict OTHER cold sessions and never touches a sole-active session — this bounds ONE session: over the cap at a request-end boundary, its droppable fields (folded-block originals, metadata ledger, the raw tail beyond the bounded view) are forced back to disk even for a pool-exempt session, and the next turn transparently re-reads what it needs via narrow disk reads. Safe drops run at every request boundary as long as the last save has provably landed; the cap adds the per-session call-out (warn, throttled to 60 s). `0` disables the cap check. |
| `sessions.contentStorePin` | boolean | false | BILI_SESSION_CONTENT_STORE_PIN | Escape hatch for the #4788 phase-2 resident drop: keep each session's content store pinned in memory (nothing ever folded away). Default off: after every proven-landed save, idle sessions' content stores are dropped between requests and re-read on demand from the unified index mirror or the sidecar file; sessions whose store has no provably-landed copy (e.g. fresh fork children) stay resident automatically. Set this if you need zero re-read latency at the cost of RAM. |
| `sessions.gc.enabled` | boolean | false | BILI_SESSION_GC | Opt-in garbage collection of stale persisted sessions (user data is never pruned silently without this flag). |
| `sessions.gc.maxAgeDays` | number | 7 | BILI_SESSION_GC_MAX_AGE_DAYS | GC age threshold in days. |
| `sessions.gc.maxTokens` | number | 1000000 | BILI_SESSION_GC_MAX_TOKENS | GC token-size threshold per session record. |
| `sessions.gc.intervalMs` | number | 3600000 | BILI_SESSION_GC_INTERVAL_MS | GC sweep interval. |
| `plugin.snapshotCapBytes` | number | 104857600 (0 disables snapshots) | BILI_PUBLIC_SNAPSHOT_CAP_BYTES | Size cap for fork-API public snapshots served to native plugins. |
| `snapshot.shadow` | boolean | true (on) | — | Snapshot-render shadow observability (#3756 follow-up): with the render lane still rollout-gated, every armed turn computes the would-be snapshot view, classifies the diff against the legacy outbound, and records per-session counters (web panel rows + /__bili/status snapshotShadow aggregate + the snapshot-shadow diagnostics topic). Default ON - it is the fleet-wide dry run whose error rate gates the rollout flip. Env BILI_SNAPSHOT_SHADOW wins. Turn off with false/0/off if you do not want the extra per-turn computation. |

**Updates & advisories**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `autoUpdate` | boolean | true | ACP_AUTO_UPDATE | Automatic npm version checks (every ~3 min); disable via ACP_AUTO_UPDATE=0 or --no-auto-update. |
| `autoRestartOnUpdate` | boolean | false | ACP_AUTO_RESTART_ON_UPDATE | Restart the daemon automatically once a newer version has been installed. |
| `updateTag` | string | latest | ACP_UPDATE_TAG | npm dist-tag channel for self-updates: latest (default), dev, or pr. |
| `update` | object | {} (all defaults) | — | Self-update channel settings. |
| `update.registry` | string | "npmjs" (registry.npmjs.org) | BILI_UPDATE_REGISTRY | Custom npm registry base URL for self-updates (private mirrors). |
| `update.checkIntervalMs` | number | 180000 | BILI_UPDATE_CHECK_INTERVAL_MS | Interval between npm registry version checks. |
| `update.staggerMinDelayMs` | number \| string | 900000 (built-in 15 min) | BILI_UPDATE_STAGGER_MIN_MS | #3619 staggered rollout: lower bound of this machine's base upgrade-delay window; ms number or duration string (15m / 2d / 1d12h); 0 disables the delay (legacy immediate). The remote policy's default window and per-version overrides stack on top. |
| `update.staggerMaxDelayMs` | number \| string | 172800000 (built-in 48 h) | BILI_UPDATE_STAGGER_MAX_MS | #3619 staggered rollout: upper bound of this machine's base upgrade-delay window; ms number or duration string (48h / 2d); together with min 0 restores legacy immediate upgrades. |
| `update.policyUrl` | string | official repo raw URL | BILI_UPDATE_POLICY_URL | Override URL for the remote auto-update policy file (test seam — production stays pinned to the official repo). |
| `advisoryCheck` | boolean | true | BILI_ADVISORY_CHECK | Critical-defect advisory watcher; force-installs the recommended fix when the running version is affected. |
| `advisoryUrl` | string | unset (built-in feed) | BILI_ADVISORY_URL | Override URL for the advisory feed. |
| `remoteAnnouncementsUrl` | string | unset (official feed: GitHub master announcements/remote.json) | BILI_ANNOUNCEMENTS_URL | Override URL for the remote announcement feed (#5548): JSON document {v: 1, entries: [...]} — same record schema as local announcement files, fetched every ~3 min like the other watchers, cached snapshot survives restarts/outages. Firewall installs point this at a relay mirror; bad pushes are rejected and the last good copy keeps showing. Local files in <config dir>/announcements/*.json always shadow same-id remote/builtin notices. |
| `releaseNotesCheck` | boolean | true | BILI_RELEASE_NOTES_CHECK | Release-notes feed for the web panel (fetch + cache only; never installs anything). |
| `releaseNotesUrl` | string | unset (built-in feed) | BILI_RELEASE_NOTES_URL | Override URL for the release-notes feed. |

**Diagnostics & tuning**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `diagnostics` | object | {} (all defaults) | — | Local troubleshooting knobs (dumps, render/injection toggles, count-tokens passthrough). |
| `diagnostics.dumpBody` | boolean | false | ACP_DUMP_BODY | Dump full request/response bodies to the log for troubleshooting. Dumps are PLAINTEXT and may contain credentials — scrub before sharing (#4482). |
| `diagnostics.dumpReq` | boolean | true | ACP_DUMP_REQ | Log outgoing upstream request metadata per call; with dumpBody on, also gates the plaintext body dumps (scrub before sharing, #4482). |
| `diagnostics.rawDumpDir` | string | <state dir>/raw | ACP_RAW_DUMP_DIR | Directory for raw wire dumps. |
| `diagnostics.dump4xx` | boolean | false | BILI_DUMP_4XX | Persist upstream 4xx responses to disk for post-mortem inspection. Bodies are PLAINTEXT and may contain credentials — scrub before sharing (#4482). |
| `diagnostics.dump4xxMaxBytes` | number | 2097152 (floor 1024) | BILI_DUMP_4XX_MAX_BYTES | Size cap for a single 4xx dump file. |
| `diagnostics.maxTotalBytes` | number | unset (off) | BILI_DUMP_MAX_TOTAL_BYTES | Total-size cap for debug dump dirs (dumps/, raw/, SSE dump dir); oldest files deleted first when exceeded (floor 1 MiB). Dumps have no rotation by default and can grow tens of GB/day under active capture (#2412). |
| `diagnostics.maxAgeDays` | number | unset (off) | BILI_DUMP_MAX_AGE_DAYS | Age cap in days for debug dump dirs; files older than this are deleted (floor 1 h). Off by default. |
| `diagnostics.renderNone` | boolean | false | ACP_RENDER_NONE | Disable all ACP tag rendering (raw wire study mode). |
| `diagnostics.invariantJudge` | boolean | true | BILI_INVARIANT_JUDGE | Keep the I1/I2 outbound-invariant judge armed as an L1 advisory (#3938): every request's outbound bytes are reconciled against the client's inbound history; violations log at warn, clean verdicts at debug, traffic is never blocked. Set false or BILI_INVARIANT_JUDGE=0 to silence it. |
| `diagnostics.noInjectTool` | boolean | false | ACP_NO_INJECT_TOOL | Stop injecting the acp_compress tool definition into requests. |
| `diagnostics.noCompressPrompt` | boolean | false | ACP_NO_COMPRESS_PROMPT | Stop appending the compression doctrine to system prompts. |
| `diagnostics.countTokensPassthrough` | boolean | false | ACP_COUNT_TOKENS_PASSTHROUGH | Forward /v1/messages/count_tokens to the upstream instead of answering locally. |
| `diagnostics.compressProtocol` | "tools" \| "marker" | "tools" | ACP_COMPRESS_PROTOCOL | ACP injection surface for compression: native tools (default) or legacy prompt markers. |
| `fakeCompletion` | object | {} (all defaults) | — | Retry loop that re-requests when a final chunk arrives truncated. |
| `fakeCompletion.retries` | number | 0 (opt-in) | BILI_FAKE_COMPLETION_RETRIES | How many times a truncated final completion may be re-requested; 0 disables the loop. |
| `fakeCompletion.bufCapBytes` | number | 16777216 | BILI_FAKE_BUF_CAP | Buffer size cap for the retry loop's accumulated stream. |
| `codexCompact` | "intercept" \| "pass" | "intercept" | BILI_CODEX_COMPACT | Handle Codex's compaction requests inside bili (intercept, default) or forward them upstream (pass): the explicit forms (compaction_trigger + /responses/compact) and the inline auto-compact that transits as an ordinary turn, detected by its SUMMARIZATION_PROMPT template (#3008) — a user-overridden compact_prompt falls out of detection and transits verbatim; a compaction bili only observed (pass/gate) is rebased post-hoc (#2372). |
| `ccrRetrievalTtlMs` | number | 600000 (0 disables retrieval) | BILI_CCR_RETRIEVAL_TTL_MS | Lifetime of CCR retrieval pointers before originals stop being fetchable via acp_retrieve. |
| `decompressTmpCap` | number | 50 | BILI_DECOMPRESS_TMP_CAP | Size cap (blocks) for temporary decompressed content held in-session. |

**Compression (global level)**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `compress.modelContextLimit` | number \| "N%" | native window (model-declared) | — | Effective context window (tokens or N%): denominator of the usage ratio and a hard preflight wall; highest-priority window source. |
| `compress.maxContextLimit` | number \| "N%" | "75%" | — | Forced-compression nudge threshold: once history passes this share of the window the nudge fires immediately, bypassing growth gates. Not a hard cap. |
| `compress.emergencyThresholdPercent` | number \| % | "95%" | — | Emergency truncation of oversized tool outputs when history passes this share of the window (must be >= maxContextLimit). |
| `compress.outputHeadroomMaxPct` | number \| % | 0.25 | — | Cap on the share of the window reserved for output via max_tokens. |
| `compress.nudgeGrowthTokens` | number | 50000 (kernel flat cadence) | — | Growth gate: nudges fire only when a foldable range exceeds baseline growth by this many tokens (flat by design, independent of window size). |
| `compress.tierNudgeTokens` | object {t1?, t2?, t3?} | derived (T1 = nudgeGrowthTokens, T2/T3 = ×1.5) | — | Per-tier token-mass trigger thresholds; each unset tier falls back to its derived default, so absent/empty = legacy unified behavior (#2376). |
| `compress.minPressureBenefitTokens` | number (≥ 0) | max(5000, limit × 1%) | — | Minimum reclaimable tokens a pressure-band nudge must have to fire; on inflated-meter routes raise it so folds batch into big events instead of high-frequency small-yield churn (#3211). Explicit 0 = legacy any-pending. |
| `compress.requireUsageSampleForPressure` | boolean | true | — | Phantom-pressure guard: when this round's meter is a local estimate (no billing sample — aborted turn, TTL expiry), the pressure band waits up to compress.maxEstimateHoldRounds rounds (default 2) for the real sample instead of firing EMERGENCY off an inflated reading, then falls back to the legacy estimate-driven decision so never-reporting upstreams cannot starve it forever. false = always legacy. |
| `compress.maxEstimateHoldRounds` | number | 2 | — | Backstop for the phantom-pressure guard (#5865 ruling): how many CONSECUTIVE estimate-grade rounds the pressure band may wait before firing on the estimate anyway. Capped so an upstream that never reports usage (anonymous zero-baseline forks, silent backends — where the local estimate is the only pressure signal) still gets automatic compression. 0 = no waiting at all. Only consulted while requireUsageSampleForPressure is on. |
| `compress.nudgeModelDecided` | boolean | off (unset) | — | Model-decided nudge timing (#2228): an armed tier-1 nudge first asks the model — via a short side call over the session's cached prefix — whether compressing NOW helps the current task. A strict-JSON "yes" injects an explicit directive with a program-finalized span; "no", a malformed answer, or a timeout injects nothing this round. EMERGENCY arms and tier≥2 distillation always keep the legacy advisory. Off unless explicitly enabled. |
| `compress.nudgeDecisionMaxTokens` | number | 200 | — | Output budget (tokens) of the model-decision side call used by nudgeModelDecided. Must be > 0. |
| `compress.requireNudge` | boolean | off (unset) | — | Forbid UNPROMPTED model-initiated compression (#5683): a compress call is refused unless a compression nudge actually reached the model in the current turn (advisory, decide-directive and emergency injections all arm; loop rounds of the same turn keep the arm, the next un-nudged turn disarms). Refusal sends the model an error receipt instead of folding; bili's own overflow backstop folds are exempt. For models that fold on their own (e.g. qwen 27b); can be scoped per provider/model. Off unless explicitly enabled. |
| `compress.requireRecommendation` | boolean | off (unset) | — | Forbid OUT-OF-BOUNDS model-initiated compression (#5683): every submitted range must stay within what bili currently recommends folding — the same live compressible set the nudge text and acp_status show (this request's prepare-time offer when present, else a live recompute). Judgment is by COVERAGE: subdividing a recommended span passes, and messages already folded into active blocks (refolds updating an existing summary) are exempt. A range carrying any other live message is refused whole with an error receipt naming the offending span(s). Off unless explicitly enabled. |
| `compress.streamSummary` | boolean | false (unset) | — | Force preflight summarization to run as a streaming (SSE) call from the first attempt. The error-driven self-learn handles stream-mandating upstreams on its own (any 400 on a non-streaming summary triggers a one-shot SSE probe, #2494) but NEVER arms on gateway timeouts (e.g. Cloudflare HTTP 524): set this where such a gateway sits between bili and the origin, or simply to skip the one probe round-trip. |
| `compress.preserveRecentMessages` | number | 3 | — | The most recent messages stay soft-protected from folds. |
| `compress.preserveRecentTokens` | number | kernel ≈5000 | — | The most recent tokens stay soft-protected from folds. |
| `compress.minCompressRangeChars` | number (deprecated alias: minCompressRange) | kernel ≈5000 | — | Smallest foldable range, in characters; shorter ranges never fold. |
| `compress.maxSummaryLength` | number | kernel 20000 | — | Hard character cap on ONE generated summary; longer replies are rejected whole (no truncation, no retry). External summarizers are told this exact cap up front (#3635). 0 = unbounded. |
| `compress.minSummaryLength` | number | kernel 50 | — | Character floor for generated summaries; shorter replies are rejected whole. 0 = disabled. External summarizers are held to the same floor (#3635). |
| `compress.reconcile` | "off" \| "warn" \| "repair" | "repair" | BILI_FOLD_RECONCILE | Reconcile folded state when the client rewinds or rewrites history between turns. |
| `compress.compressAtFoldPoint` | boolean | false | BILI_COMPRESS_AT_FOLD_POINT | EXPERIMENTAL, default off: move a still-visible compress call/result pair from its original (tail-adjacent) slot to its own fold point in the re-sent view, i.e. [folded region] – [pair] – [protected messages], so weak-attention models stop reading a trailing tool exchange as a fresh command. View-only transform: refs and state untouched, recomputed identically on every turn; off = byte-identical layout. |
| `compress.compressAtFoldPointClearThinking` | boolean | false | BILI_COMPRESS_AT_FOLD_POINT_CLEAR_THINKING | Second opt-in riding on compress.compressAtFoldPoint: when the pair is repositioned, also drop the contiguous run of unsigned reasoning cores immediately preceding it (the model's thinking about this very fold), so the moved pair starts clean. Inert unless the main switch is on; signed thinking blocks and strict reasoning-echo sessions are never touched (#1658/#684). |
| `compress.promptPack` | string (builtin: "default", "lean") | builtin "default" | — | Compression prompt pack, resolved project pack → user pack → builtin; not gated by acknowledgePromptsRisk. |
| `compress.tiers` | boolean | true | — | Tiered T1→T3 distillation spreads folding cost across generations. |
| `compress.protectedTools` | string[] | none | — | Hard exclusion across all history: results of listed tools never fold. Path patterns (skill/<name>) select skills by name (#1947). |
| `compress.protectedLatestTools` | string[] | none | — | Protects only the LATEST instance of cumulative-snapshot tools whose newest result supersedes older ones (e.g. todo lists). Path patterns keep the latest instance per skill (skill/*, #1947). |
| `compress.neverPreserveRecentTools` | string[] ([] valid) | ["decompress", "search_context", "read", "bash"] (kernel) | — | Excluded from the recent protection zone (immediately compressible); an empty array excludes nothing (maximum protection). |
| `compress.preserveRecentTools` | string[] | n/a (subtraction form) | — | Subtraction form: recent-zone tools minus this list get full protection; an empty array here is rejected as a typo. |
| `compress.visibilityMarkers` | boolean | true | — | Append visibility markers after compress/decompress/search_context/acp_status results; off stops imitated narration. |
| `compress.messageTimestamps` | boolean | true | BILI_MESSAGE_TIMESTAMPS | Attach immutable wall-clock time stamps to compressed-message records: time= on the wire's ACP tags, a [start – end] coverage span in compress receipts, and an Occurred line in summaries. ON by default: each message gets one immutable first-sight stamp rendered deterministically, so re-rendered history stays byte-stable (no prompt-cache cost beyond the one enabling-restart prefix rewrite). Set false to reproduce the pre-#4313 bytes exactly. |
| `compress.rules` | boolean | false | — | Persistent model reminders delivered through an injected acp_rule tool, hard-protected from folds; pi/omp expose an /acp-rule command. Proxy-mode only — inert in plugin mode, where the host owns the tool surface. |
| `compress.injectTool` | boolean | true | ACP_COMPRESS_TOOL | Register the acp_compress tool for clients (global level only). |
| `compress.injectNudge` | boolean | true | ACP_COMPRESS_NUDGE | Send growth nudges as the window fills (global level only). |
| `compress.reasoning` | { drop?, threshold? } | drop true · threshold 2048 | — | Drop finished-round reasoning runs longer than 2048 chars (drop: true by default); strict-reasoning upstreams need drop:false. |
| `compress.absorb` | object | opt-in (disabled) | — | Opt-in instant distillation of tool results into short abstracts; originals go to the content store. By default only image-bearing results qualify. |
| `compress.ccr` | object | enabled in proxy mode since v2 | — | Content cache & retrieve: large outputs stored losslessly beside the session, replaced by head excerpt + pointer fetched back via acp_retrieve; no cap or eviction. |
| `compress.search` | object | off | — | Search-behavior settings for search_context; currently holds planAware re-ranking. |
| `compress.search.planAware` | boolean | false | — | When on, search_context candidates are re-ranked against current plan state; off keeps byte-identical lexical results. |
| `compress.prompts` | Partial<Prompts> | unset (kernel doctrine) | — | Override the kernel doctrine texts; load-bearing for quality — gated behind acknowledgePromptsRisk. |
| `compress.reasoningGuard` | object | off | — | Auto-repair of reasoning-lattice truncation on gpt-5.x/6.x (up to 3 continue-nudge rounds). |
| `compress.outputSteering` | object { enabled?, verbosityLevel?, effortRouting? } | enabled false · verbosityLevel 2 | — | Appends a conciseness directive to the system-prompt tail; clamps mechanical continuation requests. |
| `compress.priceProfile` | { w?, r?, q? } | unset (registry, kernel fallback {1, 0.1, 4}) | — | w/r/q ratios normalized to the input price (write/cache-read/output); report-only — never affects triggers or the wire. |
| `compress.externalSummary` | object | opt-in (disabled) | — | Sends compression summaries to separately configured models referenced from the providers table; whole-chain replace semantics at all three compress levels. |
| `compress.acknowledgePromptsRisk` | boolean | false | — | Must be true before custom prompts take effect. |
| `compress.absorb.enabled` | boolean | false | — | Enable the absorb distillation block. |
| `compress.absorb.minToolTokens` | number | 1000 | — | Minimum estimated token size of a tool result eligible for absorption. |
| `compress.absorb.contextThresholdPct` | number \| % | unset | — | Only absorb when context usage passes this share of the window. |
| `compress.absorb.excludeTools` | string[] | [] | — | Tool names excluded from absorption. |
| `compress.absorb.toolName` | string | "absorb" | — | Registered name of the absorb tool. |
| `compress.absorb.mediaOnly` | boolean | true | — | Restrict absorption to tool results that carry media (images). Image bytes are exempt from minToolTokens since they are not counted in text. Set false to restore legacy full-text absorption of any large result. |
| `compress.ccr.enabled` | boolean | true (proxy mode) | — | Enable the content-cache-and-retrieve block. |
| `compress.ccr.minToolTokens` | number | ≈4000 | — | Minimum estimated token size of a tool result eligible for CCR storage. |
| `compress.ccr.excludeTools` | string[] | [] | — | Tool names excluded from CCR storage. |
| `compress.ccr.toolName` | string | "acp_retrieve" | — | Registered name of the retrieval tool. |
| `compress.ccr.maxHeadChars` | number | 96 | — | Maximum head-excerpt length left inline at the storage pointer. |
| `compress.prompts.compressPhilosophy` | string | unset (kernel text) | — | Override of the compression philosophy doctrine paragraph. |
| `compress.prompts.howToCompressRules` | string | unset (kernel text) | — | Override of the compression how-to rules. |
| `compress.prompts.tier2DistillRules` | string | unset (kernel text) | — | Override of the tier-2 distillation rules. |
| `compress.prompts.tier3CondenseRules` | string | unset (kernel text) | — | Override of the tier-3 condensation rules. |
| `compress.reasoningGuard.enabled` | boolean | false | — | Enable reasoning-lattice auto-repair. |
| `compress.reasoningGuard.maxContinue` | number | 3 | — | Maximum continue-nudge rounds per truncation. |
| `compress.reasoningGuard.maxTierN` | number | (built-in) | — | Upper bound on the repaired lattice tier index. |
| `compress.reasoningGuard.markerText` | string | "Continue thinking..." | — | Marker text that signals a truncated reasoning lattice. |
| `compress.reasoningGuard.base` | number | (built-in) | — | Base offset parameter of the repair lattice. |
| `compress.reasoningGuard.offset` | number | (built-in) | — | Offset step parameter of the repair lattice. |
| `compress.reasoningGuard.debugLog` | boolean | false | — | Verbose logging for the repair loop. |
| `compress.outputSteering.enabled` | boolean | false | — | Enable the conciseness directive appended to the system-prompt tail. |
| `compress.outputSteering.verbosityLevel` | number (0–4) | 2 | — | Target verbosity level for the directive. |
| `compress.outputSteering.effortRouting` | boolean | (built-in) | — | Route effort hints alongside the directive. |
| `compress.priceProfile.w` | number | unset (registry) | — | Write-price ratio relative to the input price. |
| `compress.priceProfile.r` | number | unset (registry) | — | Cache-read price ratio relative to the input price. |
| `compress.priceProfile.q` | number | unset (registry) | — | Output price ratio relative to the input price. |
| `compress.reasoning.drop` | boolean | true | — | Drop finished-round reasoning runs longer than the threshold. |
| `compress.reasoning.threshold` | number | 2048 | — | Character threshold above which finished reasoning runs are dropped. |
| `compress.minCompressRange` | number | same as minCompressRangeChars | — | Deprecated alias of minCompressRangeChars (accepted, mapped onto it). _(deprecated)_ |

**Provider route fields**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `models` | record name → { context?, output?, compress?, benefit? } | {} | — | Per-model declarations: context window, output ceiling, per-model compression overrides; not a traffic filter. |
| `models.context` | number | unset (model registry) | — | Context window tokens declared for this model name. |
| `models.output` | number | unset | — | Output token ceiling declared for this model name. |
| `models.compress` | object | unset | — | Level-3 compression overrides for this model (deepest in the global→provider→model merge). |
| `models.benefit` | boolean | false | — | Marks free-quota billing for this model in the economics ledger. |
| `proxy` | string ("" = explicit direct) | unset | — | Per-route outbound proxy URL. |
| `compressProtocol` | "tools" (default) \| "marker" | "tools" | — | Which ACP injection surface this lane speaks. |
| `protocol` | "anthropic" \| "openai" \| "responses" \| "google" | inferred from the URL marker | — | Declare this lane's wire protocol; a client-side /bili/<protocol>/ URL marker outranks the declaration. |
| `compress` | object (level 2) | unset | — | Any compress field can be overridden here — level 2 of the global→provider→model merge. |
| `compat` | { roles?, dropFields? } | {} | — | Per-route wire-compat overrides; provider entries beat the global block per key; dropFields union additively. |
| `direct` | boolean | false | — | Client-side exemption: traffic for this upstream is never pointed at bili at all. |
| `passthrough` | boolean | false | — | Route-scoped byte-for-byte relay with no session state — for anti-fraud upstreams. |
| `imageBilling` | "auto" \| "pixels" \| "bytes" | auto (→ pixels) | — | Image-token counting basis for this route; bytes is an explicit opt-in for byte relays. |
| `imageTokenCap` | number | unset (uncapped) | — | Per-image token cost cap for this route. |
| `resign` | scheme → { enabled?, passthrough?, credentialRef? } | {} (global map applies) | — | Per-route overrides of the global resign map (level 2, deepest wins). |
| `bind` | string (named entries only) | unset | — | Deep-merge a named (non-URL) entry onto the bound URL lane as an alias; without bind a named entry stays routing-inert. |
| `apiKeyEnv` | string (env var name) | unset | — | Lane credential override (#2336): replace the client's credential with this env variable's value for this lane. Exactly one of apiKeyEnv/credentialRef; see [Lane credentials](#lane-credentials-apikeyenv--credentialref). |
| `credentialRef` | string (store name) | unset | — | Lane credential override via the private summary-credential store (secret:NAME semantics). |
| `calibration` | { disabled?: boolean, max?: number } | unset (learned k̂ applies) | — | Per-route k̂ calibration policy (#3211): opt-out or clamp for routes whose usage reports inflate; see [Route-level k̂ calibration policy](#route-level-k-calibration-policy). |
| `compactionOptIn` | boolean | false | BILI_NON_HTTP_PROVIDERS | Named entries only: opt a non-http(s)-baseUrl provider into compaction ownership (pi/omp lanes); unions with env BILI_NON_HTTP_PROVIDERS. |

**Environment-only variables**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `BILI_DSH_AUTHORED_COMPACTION` | boolean | true (on, #3901 flip) | — | Let bili ANSWER dsh compaction summarize calls locally with the folded snapshot instead of refusing (#3733): identity header + kernel-rendered block summaries, zero egress; replay recognized via the #2432 rebase. |
| `BILI_DSH_CONTEXT_TAB` | boolean | true | — | Env tier for dsh.contextTab (#4237): 0/false removes the DSH top-bar 「上下文」/「Context」 tab (everything else keeps working); any other value forces it on over the file tier; unset = file tier applies (default true). Takes effect on next page load / dsh restart. |
| `BILI_DSH_MAX_TESTED_VERSION` | string | 0.2.0-rc.2 (CI e2e anchor) | — | Newest-tested @deepseek-ai/dsh build behind the dsh native lane's boot note (#4545): the running client build is resolved from the nearest node_modules/@deepseek-ai/dsh/package.json above the injected bundle; being STRICTLY NEWER than this cap earns ONE boot-time note (durable log record + banner) advising roll-back until support lands. One direction only — at-or-below-cap builds stay silent (known older-build break modes have their own overlay-latch detectors). Warns only — never gates or blocks traffic. Move the cap up as builds get verified; an EMPTY string turns the check off for this lane. Unresolvable/unparseable versions fail open to silence. |
| `BILI_IDENTITY_HARVEST` | string | off | — | Rollout-gated loopback harvest of client-local transcripts/sqlite for stable message-id lanes (#5825). Unset/empty = OFF (fully inert). `all` or a comma list of source ids (`claude,codebuddy,mcode`) enables matching sources for requests whose identity is loopback; every match also requires the `pluginLaneServerHistory` rollout to be ON. Anything undecidable degrades to the pre-wiring path for the whole turn — never a partial mapping. Dev/verification switch by design (the lanes are already safe per client), not a tuning knob. |
| `BILI_STORAGE_BACKEND` | sqlite\|mysql | sqlite | — | Env tier for storage.backend (#3931): sqlite (default) or mysql (fully wired, #3388 steps 2+3 - saves ingest through the async shadow queue, sync reads ride the JSON envelope, replicas/ext/GC/fork via the async twins (#4911); export too). Wins over the file tier. |
| `BILI_MYSQL_DSN` | string | unset | — | MySQL DSN (mysql://user:pass@host:3306/db) for storage.backend="mysql" (#3388, #3931). Wins over the file key storage.mysql.dsn. Empty = the mysql backend cannot open; the documented error names both knobs. The pool opens lazily; closeQuietlyAsync drains the ingest queue and closes it. |
| `BILI_STORAGE_ARCHIVE_AFTER_DAYS` | integer | 365 | — | GC age sweep window in days (#3463): sessions idle longer than this are archived (one JSON line appended to the single archive log (archive/archive.jsonl) + tombstone row + content/media refs released). 0 disables the age sweep; the manual entry POST /__bili/storage/gc always runs. Config-file key storage.archiveAfterDays is the persistent form. |
| `BILI_STORAGE_QUICK_CHECK` | string | on | — | Storage integrity self-check at open (#4175): every index.db open runs PRAGMA quick_check BEFORE migrations; if a corruption is PROVEN by THIS BOOT's own scan NOTHING is moved, copied or rebuilt automatically (auto-recovery was withdrawn #4609/#4626-era: with BILI_STORAGE_JSON_WRITER=off the index is the SOLE durable copy, so an automatic move or rebuild cannot guarantee full data recovery) and bili STARTS ANYWAY — serving from the JSON envelopes with a loud, actionable alarm naming the manual fix (back up then move index.db/-wal/-shm aside BY HAND, then start again — a fresh index rebuilds from the JSON envelopes). A successful PASS is cached so later starts skip the rescan; a FAIL verdict is NEVER persisted (2026-10-30 owner policy): runtime/background findings are alarms only (loud logs + runtime-status, the process keeps serving — JSON envelopes remain the recovery source) and every boot decides again from a fresh scan of the CURRENT file set, so a stale FAIL left behind by an older version can never block future boots. There is NO automatic rename/repair AND no legacy-only fallback: continuing legacy-only would fork the JSON envelopes from the dead index forever (never reconcilable). TRANSIENT open failures (no SQLite engine / CANTOPEN / readonly / backend DSN) make bili REFUSE TO START loudly with an actionable error — no silent legacy fallback for environment problems either (2026-10-30 owner policy; a live second writer left this refusal list on 2026-10-31 — sharing one local-disk index.db is the supported topology, informational only, never blocking); deployments that genuinely want JSON-only serve explicitly (BILI_STORAGE_UNIFIED=legacy or unset). Set 0 only for boot-time-sensitive huge deployments where the check's cost matters. |
| `BILI_SNAPSHOT_SHADOW` | boolean | true (on) | — | Snapshot-render shadow observability (#3756 follow-up): compute the outbound snapshot view on every armed turn WITHOUT using it, classify the diff against the legacy outbound, and surface per-session counters in the web panel + the snapshot-shadow diagnostics topic. 0/false/off disables; 1/true/on enables; otherwise the config-file snapshot.shadow boolean applies (default on). The render lane itself stays rollout-gated (BILI_ROLLOUT_SNAPSHOT_RENDER), so the shadow lane never changes outbound bytes - it is the dry-run evidence that flips the rollout later. |
| `BILI_CONFIG_FILE` | string | unset (XDG config path) | — | Override the config file path (path relocation). |
| `BILI_SESSIONS_DIR` | string | unset (XDG state path) | — | Where session records are stored (path relocation). |
| `BILI_ENCRYPTION_KEY` | string | unset | — | Key material for encrypted persisted payloads (secret). |
| `BILI_TUNNEL_ALLOWED_HOSTS` | string[] (csv) | unset | — | Host allowlist for the MITM tunnel lane. |
| `BILI_RECLAIM_FETCH_PATCH` | boolean-ish | on | — | Toggle for reclaiming the global fetch patch on shutdown. |
| `BILI_CONFLICT_SCAN` | boolean-ish | off | — | Enable the install-lane conflict scanner probe. |
| `BILI_CHAIN_MAX_FUTURE_SKEW_MS` | number | (built-in) | — | Tolerance for future-skewed chain checkpoint timestamps. |
| `BILI_CHAIN_RECENT_WINDOW_MS` | number | (built-in) | — | Recent-window size for chain checkpoint validation. |
| `BILI_ZONE_PORT` | number | 18787 base (derived per lane) | — | Base port for lane-spawned proxy zones (port relocation). |
| `BILI_ZCODE_ROUTE` | string | unset | — | Route selection for the zcode lane. |
| `BILI_ZCODE_PORT` | number | unset | — | Port pin for the zcode lane. |
| `BILI_ZCODE_SIGNING_FIXED` | boolean-ish | off | — | Fixed-signing mode for the zcode credential lane. |
| `BILI_CLAUDE_UPSTREAM` | string | unset | — | Upstream pin for the claude lane. |
| `BILI_CODEX_STATE_MODE` | string | auto | — | codex state handling: auto (shared db via CODEX_SQLITE_HOME on modern codex, legacy overlay copies otherwise), shared, or legacy. Shared mode runs up to 16 concurrent sessions, one per-session overlay slot each; legacy keeps one exclusive overlay at a time. |
| `BILI_ATTACH_HEALTH_DEADLINE_MS` | number | (built-in) | — | Deadline for attach health checks when joining an external daemon. |
| `BILI_SPAWN_WAIT_MS` | number | (built-in) | — | Initial health-wait window (ms) for a freshly spawned proxy child before the launcher extends the wait. |
| `BILI_SLOW_START_GRACE_MS` | number | (built-in) | — | Extra grace (ms) for a still-alive child that is slow to bind (slow store, AV scan, shared-store lock contention); the total spawn budget is the sum of the two. |
| `BILI_ATTACH_EVIDENCE_GRACE_MS` | number | (built-in) | — | Grace period for attach ownership evidence. |
| `BILI_SILENT_DIRECT_MAX_MB` | number | (built-in) | — | Silent-direct oversized guard ceiling (MiB). |
| `BILI_PROVIDER_REWRITES` | string | unset | — | Provider URL rewrite rules applied before routing. |
| `BILI_MCP_PROXY` | string | unset | — | Spawn channel: MCP proxy target for plugin-hosted tools. |
| `BILI_PARENT_PID` | number | unset | — | Spawn channel: parent process id for lifecycle supervision. |
| `BILI_STRICT_PORT` | number | unset | — | Spawn channel: exact-port requirement (squatters refused loudly instead of hopping). |
| `BILI_UPGRADE_REPLACEMENT` | boolean-ish | unset | — | Spawn channel: marks a self-restart replacement — it must own exactly the freed port or exit without hopping (#3044). |
| `BILI_OPENCODE_ACP_SPEC` | string | unset | — | Spawn channel: ACP spec marker for opencode-native lanes. |
| `BILI_LAUNCHER_MODEL_WINDOWS` | string | unset | — | Launcher channel: model-window overrides passed into spawned clients. |
| `BILI_LAUNCHER_LANE` | string | unset | — | Launcher channel: lane identity of the spawning bili process. |
| `BILI_LAUNCHER_PLUGIN` | string | unset | — | Launcher channel: plugin-mode handoff marker. |
| `BILI_LAUNCHER_DIRECT` | boolean-ish | off | — | Launcher channel: bypass the injected proxy for this launch. |
| `BILI_INHERITED_HTTP_PROXY` | string | unset | — | Launcher channel: inherited http_proxy value preserved across the spawn boundary. |
| `BILI_INHERITED_HTTPS_PROXY` | string | unset | — | Launcher channel: inherited https_proxy value preserved across the spawn boundary. |
| `BILI_INHERITED_ALL_PROXY` | string | unset | — | Launcher channel: inherited all_proxy value preserved across the spawn boundary. |
| `BILI_INHERITED_NO_PROXY` | string | unset | — | Launcher channel: inherited no_proxy value preserved across the spawn boundary. |
| `BILI_NATIVE_CLAUDE` | boolean-ish | off | — | Host posture: marks a claude-native plugin process. |
| `BILI_NATIVE_DSH` | boolean-ish | off | — | Host posture: marks a dsh-native plugin process. |
| `BILI_NATIVE_KIMI` | boolean-ish | off | — | Host posture: marks a kimi-native plugin process. |
| `BILI_NATIVE_OMP` | boolean-ish | off | — | Host posture: marks an omp-native plugin process. |
| `BILI_NATIVE_OPENCODE` | boolean-ish | off | — | Host posture: marks an opencode-native plugin process. |
| `BILI_NATIVE_PI` | boolean-ish | off | — | Host posture: marks a pi-native plugin process. |
| `BILI_PI_INLINE` | boolean-ish | inline when unset (DEFAULT-ON since #5428; explicit 0/false/no/off opts out) | — | Host posture: pi inline lane (#3278) — the pi extension compresses IN-PROCESS through the pseudo-origin instead of spawning its own proxy; outranks a preset BILLION_CONTEXT_PROXY attach target. DEFAULT-ON since #5428 (supersedes the #4687 opt-in rule): unset env+file runs inline; an announced attach target still beats the DEFAULT, so `bili pi` keeps its launcher proxy. Explicit OPT-OUT = 0/false/no/off (or `"pi": {"inline": false}`) — restores the old attach/spawn posture. Human surface: `bili -i/--inline pi` forces inline, `bili -s/--server pi` pins the proxy posture (beats an inherited inline env). Truthy = any non-empty value except 0/false/no/off (on/yes/TRUE all enable). Codex Responses WS traffic is routed through a loopback-only bridge booted with the engine; if that bridge fails, the WS lane degrades DIRECT (warned) while HTTP compression stays in-process. |
| `BILI_OPENCODE_INLINE` | boolean-ish | off (opt-in) | — | Host posture: opencode inline lane (#3278 port) — the opencode plugin compresses IN-PROCESS through the pseudo-origin instead of spawning its own proxy; outranks a preset BILLION_CONTEXT_PROXY attach target. OPT-IN: the opencode lane keeps its legacy default (spawned proxy) unless this env or "opencode": {"inline": true} explicitly enables it (owner decision on #4687). Truthy = any non-empty value except 0/false/no/off (on/yes/TRUE all enable). Verified on the Bun host (engine boots and dispatches without node:sqlite). |
| `BILI_INLINE_DEBUG` | boolean-ish | off | — | Inline lane (#3278) only: keep the engine's log lines on stderr after muting them (the inline engine runs inside the pi process, where stderr is the interactive TUI — every [persist]/[storage]/[inline] line would scroll the input box away; default keeps them in bili.log only). |
| `BILI_NATIVE_ZCODE` | boolean-ish | off | — | Host posture: marks a zcode-native plugin process. |
| `BILI_PI_BIN` | string | pi (PATH lookup) | — | Host posture: explicit binary path for the pi client binary. |
| `BILI_DSH_BIN` | string | dsh (PATH lookup) | — | Host posture: explicit binary path for the dsh client binary. |
| `BILI_MODEL_INFO_RETRY_MS` | number | (built-in) | — | Test hook: retry interval for model-info lookups. |
| `BILI_DSH_RETRY_INTERVAL_MS` | number | (built-in) | — | Test hook: retry interval for dsh lane operations. |
| `BILI_DSH_RECOVERY_INTERVAL_MS` | number | (built-in) | — | Test hook: recovery sweep interval for the dsh lane. |
| `ACP_DUMP_DIR` | string | unset | — | Base directory override for wire dump output (path relocation). |
| `BILI_STREAM_STALL_MS` | number | (built-in) | — | Stall-detection timeout for committed upstream streams (no-byte silence before abort). |
| `BILI_CLIENT_BIN` | string | unset (PATH lookup) | — | Explicit binary override for the launched client (resolved on PATH). |
| `BILI_CONVERSATION_ID` | string | unset (per-spawn UUID written by bili) | — | Per-spawn conversation UUID handed to MCP children whose host passes no session id (headless self-registration). |
| `BILI_LAUNCHER_MODEL_MAX_OUTPUTS` | string (JSON id→maxOutput map) | unset | — | Launcher channel: per-model max-output map handed to the spawned proxy for output-headroom reservation. |
| `BILI_LAUNCH_TOKEN` | string | unset (generated per launch) | — | Launch token authenticating lane-internal endpoints between a launcher and its spawned proxy (secret). |
| `BILI_MCP_DEFAULT_ORIGIN` | string | http://127.0.0.1:8787 | — | Fallback proxy origin candidate for MCP entry points. |
| `BILI_MCP_NO_ORPHAN_ADOPT` | boolean-ish | off (=1 disables orphan adoption) | — | Opt out of resumed-session orphan adoption when several host sessions share one proxy. |
| `BILI_MITM_HOSTS` | string[] (csv) | unset | — | Launcher channel: MITM whitelist hosts handed to the spawned proxy (distinct from the config-file twin BILI_MITM_DOMAINS). |
| `BILI_PLUGIN_AGENT` | boolean-ish | off | — | Spawn channel: marks a plugin-agent process. |
| `BILI_IMAGE_RESCALE_MAX_DIM` | integer | 1600 | — | Longest-edge trigger threshold (px) for the egress image downscale pass (#3400); non-numeric or below 128 ignored (default applies). Env-only by design. |

<!-- /bili:gen -->

---

## Server Settings

Top-level keys that control how the proxy listens and behaves globally.

### `port`

- **Type:** `number`
- **Default:** `8787`
- **Status:** ACTIVE
- **Description:** TCP port the proxy listens on. Must be an integer between 1 and 65535. Overridden by the `ACP_PORT` (or `PORT`) environment variable, or the `--port` CLI flag. An invalid value aborts startup. This is the **user zone** (`bili start`, default `8787`) — you own this port. Lane-spawned proxies (native hooks, launcher lanes) live in a separate self-managed zone (`BILI_ZONE_PORT`, default `18787`) and never touch this one (#1660).

### `host`

- **Type:** `string`
- **Default:** `127.0.0.1`
- **Status:** ACTIVE
- **Description:** Network interface the proxy binds to. `127.0.0.1` (default) listens only on localhost — safe for a local sidecar. Use `::` for IPv4 + IPv6 dual-stack. Use `0.0.0.0` (or a LAN IP) to expose the proxy to other machines — typically inside a container or on a trusted LAN: remote agents then point their model `baseURL` at `http://<this-host>:<port>/bili/…`, and MITM-mode `CONNECT` accepts remote clients for whitelisted model hosts only (blind tunnels stay loopback-only, and `/__bili/` management endpoints remain loopback-only unless the embedding-host relay below is enabled). There is no authentication — ensure the surrounding network is trusted. Overridden by `ACP_HOST` / `--host`.

### `upstream`

- **Type:** `string` (base URL)
- **Default:** `https://api.anthropic.com`
- **Status:** ACTIVE
- **Description:** Fallback base URL for path-only model requests: a client that POSTs to `/v1/messages` without a host is forwarded to `${upstream}/v1/messages`. Trailing slashes are stripped. Overridden by `ACP_UPSTREAM`. Also reported as `upstream` in `GET /__bili/health`.

### `sessionHeader`

- **Type:** `string`
- **Default:** `x-acp-session`
- **Status:** ACTIVE
- **Description:** Name of the HTTP request header clients may send to identify a conversation. Requests carrying the same value share compression state across calls. Overridden by `ACP_SESSION_HEADER`.

### `log`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Enable per-request logging. Set `false` (or `ACP_LOG=0`) to silence the standard request log.

### `logFile`

- **Type:** `string`
- **Default:** XDG state path (`~/.local/state/billion-context/bili.log`)
- **Status:** ACTIVE
- **Description:** Location of the proxy's tee log (file + stderr). Set `"off"` to disable file logging entirely (stderr only). Auto-rotates at 10 MB into `bili.log.old`. Overridden by `ACP_LOG_FILE` when set (an empty value resolves back to the default path, not off).

**Log locations & cleanup.** There are two log files:

1. `~/.local/state/billion-context/bili.log` — the shared instance log (every proxy on this machine appends here; each line carries its `[v=<version>]` and `[sess=<id>]` tags). Rotates at 10 MB, keeping one `.old` generation.
2. `%TEMP%/bili-proxy-<port>.log` (`os.tmpdir()/bili-proxy-<port>.log`) — created ONLY for launcher-spawned proxies (`bili dsh`, pi/claude/codex overlays, …), which run with stdout/stderr redirected into it by the launching process. Since #2864 a spawned child mutes its stderr leg once the file leg above is live, so this file holds pre-logger crash output only (normally near-zero bytes); it is capped at open: once it reaches 5 MB the next spawn rotates it to `.old` (one generation kept) before reopening. The OS temp-dir cleanup policy otherwise applies — treat it as scratch space and delete stale files freely; they never hold the durable record (that is `bili.log`).

### `debug`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Verbose logging — equivalent to setting `ACP_DEBUG=1`. Useful for diagnosing routing or compression behaviour.

### `passthrough`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Forward every request to the upstream **without** compression, tool injection, or nudging. Equivalent to `ACP_PASSTHROUGH=1`. Handy for A/B comparison against the uncompressed baseline.

### `compactionOptIn`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** `#1392` — opt a **non-http(s) baseUrl provider** (e.g. pi-claude-bridge's literal `"claude-bridge"`) into bili's compaction-ownership consideration. The entry's KEY is the provider id — a non-URL key is routing-inert on its own (give it [`bind`](#named-provider-entries-bind) to make it a real lane), and only feeds the launcher-exported `BILI_NON_HTTP_PROVIDERS` allowlist the pi/omp plugin consults when it would otherwise veto a non-http baseUrl outright (#1383). Opt-in only widens the candidate set: compaction is still cancelled only on positive carriage evidence (the plugin stamped the session, or `/__bili/plugin/status` confirms the proxy carries it). Env equivalent: `BILI_NON_HTTP_PROVIDERS=a,b` (union with the file, deduped). Only meaningful under `bili pi` / `bili omp` launchers or a directly-installed plugin.

  ```jsonc
  {
    "providers": {
      "claude-bridge": { "compactionOptIn": true }
    }
  }
  ```

### `compat`

- **Type:** `{ roles?: Record<string, string>; dropFields?: string[]; streamErrorShape?: "protocol" | "completion"; noCacheControl?: boolean; keepResponseId?: boolean }`
- **Default:** `{}` (disabled)
- **Status:** ACTIVE
- **Description:** Global wire-compat role map. `roles` maps message roles to the role name your upstream accepts, e.g. `{"compat":{"roles":{"developer":"system"}}}` rewrites `developer` → `system` on the final forwarded body for upstreams that reject the `developer` role (#552, newer codex clients). Applies to `openai` chat-completions and `responses` requests; exact-match roles only, everything else in the body is untouched; re-sent compress-retry bodies carry the same rewrite. Per-provider `compat.roles` entries (see [Providers](#providers)) win per key. Default `{}` forwards bodies byte-for-byte unchanged.
- **Learn-on-failure:** with no compat configured, an upstream `400 Invalid role: …` is auto-fixed — bili rewrites the offending role to `system`, retries once, and remembers the mapping **session-scoped** (in-memory on the session; never written to config). Later requests in that session skip the 400 round-trip. The info log emitted when the fix fires carries the permanent per-provider snippet.
- **dropFields:** dot-path list of fields to delete from the final forwarded body — for strict-schema upstreams that reject a field the *client* always sends but the upstream does not accept (#1757). Paths use plain-object segments only (`reasoning.summary`); wildcards and array indices are not supported; nonexistent paths and non-object intermediates are skipped silently; string values are never inspected or altered — structural keys only, so tool arguments and message content stay byte-exact. Unlike `roles`, it applies on every wire protocol (any JSON request body). Global and per-provider lists merge **additively** (union) — a provider entry can add paths but never retract a global one. Applied after role mapping / output steering on the final outbound body (before the prompt-cache stamp), to every body the compress-retry loops re-send, and to verbatim pass-through forwards alike. A body with no matching field is forwarded byte-for-byte unchanged; when ≥1 field is actually dropped an info line logs the dropped paths. Opt-in only — no learn-on-failure in v1: `"compat":{"dropFields":["reasoning.summary"]}`.
- **streamErrorShape:** how an upstream stream failure is presented on the anthropic/openai wire once the 200 response is already committed (`"protocol"`, default, or `"completion"`). `protocol` rides the protocol-native failure channel — anthropic/responses get an `event: error` frame, openai a top-level `error` frame followed by `[DONE]` — so clients can distinguish "this turn failed" from "this turn finished" and keep their own retry logic armed (#1455: the old synthesized `end_turn`/`finish_reason` dressed a dead turn as a normal completion and silently consumed client retry budgets). `completion` restores that legacy shape (failure text inside a synthesized successful completion) for hosts whose SDK cannot surface in-band error events. Config file: `"compat":{"streamErrorShape":"completion"}`; env `BILI_STREAM_ERROR_SHAPE` wins. Only the google wire is unaffected (already native error frames); on the responses wire this knob changes the server-side exit from the synthesized item-lifecycle completion to the `event: error` frame (its in-loop exit was already native via `response.failed`).
- **noCacheControl:** (`#2030`) `true` disables bili's Anthropic-lane `cache_control` breakpoint stamping — the escape hatch for upstreams that reject the field or relays with their own breakpoint policy. Env twin `BILI_NO_CACHE_CONTROL` wins; full mechanics in its [env entry](#environment-variables).
- **keepResponseId:** (`#2030`) `true` keeps `previous_response_id` on kernel-rebuilt Responses requests instead of stripping it (default strips it, so a rebuilt body never references a response id the upstream never issued for the rewritten input). Env twin `ACP_KEEP_RESPONSE_ID=1` wins.

### `proxy`

- **Type:** `string`
- **Default:** *(none — no upstream proxy)*
- **Status:** ACTIVE
- **Description:** Upstream HTTP proxy (`http://host:port`) used for the proxy's **own** outbound connections to model providers — for hosts where a provider is only reachable through an HTTP proxy (e.g. `api.openai.com` behind the GFW; point bili at your local v2rayA/clash HTTP port).

  **Resolution order (first match wins):** per-URL `providers.<url>.proxy` → `BILI_UPSTREAM_PROXY` env var → Web UI manual proxy → this top-level `proxy` → `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` env vars → Windows system proxy → direct. Auto mode honors `NO_PROXY` and the Windows proxy bypass list for environment/system fallbacks. A value pointing back to bili's own local port is ignored or rejected to prevent a loop. On Windows, common Clash/Mihomo static system proxies are discovered automatically; the Web UI shows the effective source and any PAC URL detected in Internet Settings.

  An empty string means "explicitly direct" — override-and-disable whatever sits below it in the chain (top level: disables any environment/system proxy fallback for all providers; per provider: just that one).

  Both outbound paths are covered: `/bili/` path-mode (fetch) AND MITM CONNECT tunnels (the proxy's connection to the real upstream goes through the HTTP CONNECT proxy). The auto-updater's own egress (npm registry check + tarball download) uses the same decision for its hosts, so `bili update` and auto-update work where npm is only reachable through the proxy (#609).

  SOCKS5 is not supported: an explicit `BILI_UPSTREAM_PROXY` / config `proxy` with a `socks5`/`socks5h` scheme fails startup with an actionable error, while env/system proxies using such a scheme are ignored with a one-time log warning (traffic falls through to direct). For Clash/mihomo, use the same mixed port over `http://` (e.g. `http://127.0.0.1:7890`).

  ```jsonc
  {
    // Global default: ALL providers route through this proxy
    "proxy": "http://127.0.0.1:20172",
    "providers": {
      "https://api.openai.com/v1": {
        // Per-URL overrides global (use a different proxy for this host)
        "proxy": "http://127.0.0.1:20173"
      },
      "https://open.bigmodel.cn/api/anthropic": {
        // Empty string = explicitly DIRECT, overriding the global proxy
        "proxy": ""
      }
    }
  }
  ```

### `upstreamProxy`

- **Type:** `string` (proxy URL)
- **Default:** *(none)*
- **Status:** ACTIVE
- **Description:** The config-file carrier of the Web UI manual proxy control — the UI writes this key (it survives restarts; `BILI_UPSTREAM_PROXY` is the env tier above it in the ladder). When set without an explicit `upstreamProxyMode`, the effective mode becomes `"manual"` so this value is what gets used. It takes its place in the [`proxy`](#proxy) resolution order between `BILI_UPSTREAM_PROXY` and the top-level `proxy`. An empty string is treated as unset.

### `upstreamProxyMode`

- **Type:** `"auto" | "manual" | "direct"` (anything else parses as `"direct"`)
- **Default:** *(unset — resolves to `"manual"` when `upstreamProxy` is set, else `"direct"`)*
- **Status:** ACTIVE
- **Description:** Selection mode for the proxy's own outbound connections (see the [`proxy`](#proxy) resolution order for the full ladder): `"manual"` uses the Web UI manual proxy (`upstreamProxy`), falling back to the top-level `proxy` when it is empty; `"auto"` and `"direct"` use the top-level `proxy`; an EXPLICITLY set `"direct"` additionally opts the auxiliary egress (MITM blind tunnels) out of proxy fallbacks. `BILI_UPSTREAM_PROXY` always wins as an explicit proxy regardless of mode. Overridden by `BILI_UPSTREAM_PROXY_MODE`.

### `imageBilling`

- **Type:** `"auto" | "pixels" | "bytes"`
- **Default:** `"auto"`
- **Status:** ACTIVE
- **Description:** How inline (base64) images are charged by the preflight size gate and output clamp (#488/#496/#767/#1843). `"pixels"` parses the image header (PNG/JPEG/WebP/GIF/BMP) without decoding the body and charges pixel-tile billing (OpenAI high-detail model: 512px tiles, short side scaled up to 768px, long side capped at 2048px → 765–2805 tokens per image; unparsable formats fall back to a flat 16384). `"bytes"` charges each image at `base64 length / 4` tokens — conservative, correct for byte-billing relays, but an explicit opt-in since #1843: on unknown hosts the old default mixed this ±15× estimate into every window decision and permanently blocked image-heavy sessions whose real usage fit the window (#1800 incident: 6 screenshots estimated at 278,161 vs 18,870 billed). Remote (`https://`) images always charge a flat 4096 in either mode. `"auto"` (the default) resolves to `pixels` for every host. A per-provider `providers.<url>.imageBilling` wins over this global, and the `BILI_IMAGE_BILLING` env var wins over both (live-read, no restart).

### `imageTokenCap`

- **Type:** positive integer (tokens per image)
- **Default:** *(unset — no cap)*
- **Status:** ACTIVE
- **Description:** Blanket ceiling on the per-image token estimate used by the preflight size gate, output clamp, and image-compression stats (#488/#496/#1843). Applied on top of whatever billing mode resolved — useful when a route's real encoder bills far below even the pixel prior. Precedence: `BILI_IMAGE_TOKEN_CAP` env var (live-read, no restart) > per-provider `providers.<url>.imageTokenCap` > this global. Non-numeric or non-positive values are dropped (lenient parse, same as `imageBilling`).

### `imageRescale`

- **Type:** boolean
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Master switch for the egress image downscale pass (#3295 removed the old arrival-time pass; #3400 re-adds it in simplified form). On every outbound request, after kernel folding and before protocol encoding, images whose longest edge exceeds `BILI_IMAGE_RESCALE_MAX_DIM` (default 1600) OR whose base64 body exceeds 100 KB are re-encoded fit-inside (never upscaled, original format kept) on an OUTBOUND COPY only — session storage keeps the original bytes byte-exact. A re-encode that saves less than 20% of the bytes is discarded (keep-smaller), so small/low-benefit images pass through untouched. Only PNG/JPEG/BMP are handled (pure-JS encoder, zero native dependencies); other formats pass through. Each shrunken image gets a stable annotation beside it reporting current vs original size; on lanes that register bili tools (proxy-injection lanes and plugin lanes via the plugin manifest) it also names `acp_read_original_image("<ref>")`, which returns the original bytes from local session storage — codex-style lanes that reject injected tools get the size-only annotation and no tool. Results of `acp_read_original_image` are structurally exempt from re-shrinking (the loop guard against the #3266 guess-reject-resend disease). Output is deterministic: the same input bytes always produce the same shrunken bytes and the same annotation text, so repeated resends of one history stay byte-stable and upstream prefix caching is undisturbed. One log line per unique image (content-hash cached; cache hits stay silent). Precedence: `BILI_IMAGE_RESCALE` env var (`"0"`/`"false"` disables; live-read, no restart) > this key > default on.

### `resign`

- **Type:** `object` — scheme-keyed: `Record<scheme, { enabled?, passthrough?, credentialRef? }>` where each key is a lowercase signature scheme token as detected on the wire (built-in: `"sdk-hmac-sha256"`; custom: an HMAC `Authorization` token like `"aws4-hmac-sha256"`, or a body-signature header name like `"x-ofm-signature"`)
- **Default:** the built-in `"sdk-hmac-sha256"` key resolves out of the box — `enabled: true`, `passthrough: false`, `credentialRef` *(unset — account-pool discovery)*; any scheme the file does not mention keeps those defaults — which for NON-built-in schemes means a local 403 refusal that stays until bili ships the scheme's re-signer (binary contract, #2090); see Description
- **Status:** ACTIVE
- **Description:** The config-file surface of the #1884 re-sign arm (body-covering signatures; today Huawei CodeArts APIG's `SDK-HMAC-SHA256`). Detection is SHAPE-based, not a name whitelist (#2090): any `Authorization` scheme token naming an HMAC construction, or any request header ending in `-signature` / `-content-sha256`, marks the request as body-signed — every gateway invents its own header set (the dsh free-model plugin ships `x-ofm-signature`), and a closed list kept missing new shapes into silent upstream 401s that surfaced as "invalid credentials" in other plugins' UIs. What happens next depends on whether bili CAN re-sign the scheme:
  - **Built-in scheme with a resolvable credential** (dsh codearts account pool): the zero-config re-sign arm — on dsh it discovers enabled `codearts` accounts from `$DSH_HOME/jet-hub/state.json` through the credentials service and re-signs every egress body it produces, so compression works on signed upstreams out of the box. The built-in key's defaults ARE that behavior, which is why keying by scheme does not make this a Huawei-shaped field.
  - **Every other detected scheme** (SigV4, gateway-invented headers): there is NO credential source anywhere in bili and NO re-signer implementation, so bili **refuses it — always** (owner binary-contract ruling, #2090: signed requests are either RE-SIGNED+COMPRESSED or REFUSED, never passed through unsigned). The 403 names the scheme and says plainly that no configuration can make the link work yet; each refusal is remembered in `resign-pending.json` under the state dir (`~/.local/state/billion-context/`) and replayed as a `[resign] … UNRESOLVED` banner at every later start (the dsh agent lane warns at plugin load too) until bili ships the scheme's re-signer. `passthrough` settings are INERT for these schemes — the reminder clears itself only when the branch is un-deployed (`enabled: false` / `BILI_RESIGN=0`, restoring pre-resign rewrite handling where the upstream will likely 401 again). Since v0.1.186 (#2260) such dead keys are additionally named once per dead-key set by an `[acp-config]` warning at config load, so the 403 body is no longer the only signal.

  This block is for the failure/override paths — env vars win over the file for every field:
  - `enabled: boolean` — kill switch for that scheme; `false` unloads the arm end to end (pre-fix behavior: signed bodies ride the normal rewrite path and fail upstream with 401). Env `BILI_RESIGN=0` wins.
  - `passthrough: boolean` — verbatim forwarding for THAT scheme's requests when they cannot be re-signed. Applies to the BUILT-IN scheme ONLY (its refusal has a user-side fix — provide the credential — so opting into uncompressed forwarding there is a real decision; #1884). For every OTHER scheme this field is INERT: per the #2090 binary-contract ruling a signed request is re-signed+compressed or refused, so no value can turn a refusal into a pass-through. Pinning the key pins the signature: configuring one scheme never opens another. Env `BILI_RESIGN_PASSTHROUGH=1` wins (built-in effect only).
  - `credentialRef: string` — pin the dsh credentials-service ref used for re-signing instead of account-pool discovery. Env `BILI_CODEARTS_REF` wins.

  Known-scheme registry & observability: bili ships labels + provenance for `sdk-hmac-sha256` (built-in, #1884), `aws4-hmac-sha256`, `hmac-sha256`, and `x-ofm-signature` (#2090). Registration is a COMMITMENT, not a capability: under the binary contract every registered scheme must eventually get a re-signer in bili — until then the scheme is loudly refused (the web UI marks it "awaiting re-signer support"), and a scheme nobody registered yet is caught by shape detection and refused the same way instead of being silently rewritten. Pending refusals, live per-scheme state, and the unresolved set are browsable in the web UI (`/__bili/` → Configuration → Signed upstreams (resign)) or read from the loopback-only `GET /__bili/resign`.

  Built-in (CodeArts) prerequisites & temporary mitigation: the `sdk-hmac-sha256` re-sign arm is injected by bili's own dsh native lane — it walks `$DSH_HOME/jet-hub/state.json` (default `%USERPROFILE%\.dsh\jet-hub\state.json` on Windows) for accounts with `provider: "codearts"` that are not `enabled: false`, resolves each account's `credentialRef` through the host's credentials service (which must be exposed to native plugins), and uses the first one yielding `{access_key_id, secret_access_key}`. If any of those is missing in your host version (e.g. a DSH build that no longer injects the credentials service, or a changed state-file layout), every signed request is refused with `bili_resign_unavailable` even though the credentials themselves are valid — that is a host-side gap, not a bili misconfiguration; the exact minimum DSH version is tracked with the host, not pinned here. Until you upgrade the host, `BILI_RESIGN_PASSTHROUGH=1` restores the codearts link byte-untouched (built-in scheme only, no compression). Note the refusal message prints the exact resolved config path computed by the same function the config loader reads, so editing the file named in the error is always correct.

  The model-level knob is deliberately NOT a field here — see the three-level note below.

  ```jsonc
  {
    "resign": {
      "sdk-hmac-sha256": { "passthrough": true },
      "aws4-hmac-sha256": { "passthrough": true } // inert until bili ships its re-signer (#2090) — named once at config load
    }
  }
  ```

- **Strict three levels (route-first):** the #1884 knobs follow the repo's standard cascade — env var > level 3 (`providers.<url>.models.<name>.benefit`) > level 2 (`providers.<url>.resign["<scheme>"]`) > level 1 (global `resign["<scheme>"]`) > built-in default — resolved AFTER routing, the same family as [`imageBilling`](#imagebilling):

  ```jsonc
  {
    "resign": {
      "sdk-hmac-sha256": { "passthrough": false }
    },
    "providers": {
      "https://codearts.example.com": {
        "resign": {
          "sdk-hmac-sha256": { "passthrough": true }
        },
        "models": {
          "glm-5.3-flash": { "benefit": true },
          "deepseek-v4.1":  { "benefit": false }
        }
      }
    }
  }
  ```

  - `models.<name>.benefit: boolean` (level 3) — whether THIS model on THIS provider bills against the CodeArts free quota (its re-signed requests carry the signed `maas_type: benefit` header). `true`/`false` are explicit — `false` opts a default-set model out; unset falls through to the built-in fallback `glm-5.3-flash, deepseek-v4.1-flash` (the dsh codearts plugin's `CODEARTS_BENEFIT_FALLBACK` mirror). Env `BILI_RESIGN_BENEFIT` (comma-separated) wins over the whole tree.
  - `providers.<url>.resign["<scheme>"]` (level 2) — `{ enabled?, passthrough?, credentialRef? }` under the same scheme key, per-field over the global block.
  - The host-side intercept (dsh native lane) runs before routing exists and always uses the global block — that's the wire-necessity trigger (signed body must tunnel or be refused), not policy. Scheme lookup itself is case-insensitive (wire tokens arrive as `SDK-HMAC-SHA256 Access=…`, keys are lowercase).

### `billing`

- **Type:** `object` — `{ prices: Record<string, { input: number, output?: number, cacheRead?: number, cacheWrite?: number }> }`, prices in USD per **million** tokens
- **Default:** `{}` (the models.dev registry snapshot prices everything it knows)
- **Status:** ACTIVE (#4899)
- **Description:** Per-model billing prices for the web panel's money views. Every settled usage report bills a running USD ledger on the session (`session.stats.costUsd`: input / cache-read / cache-write / output); the panel's "Saved" column additionally converts fold savings into dollars. Resolution per model id: `billing.prices` first, then the bundled models.dev snapshot, then unpriced (tokens only — no fabricated dollars, no fake `$0`).
  - Keys are model ids and match with the same fuzzy logic the registry uses: `"anthropic/claude-sonnet-4-5"`, a bare `"claude-sonnet-4-5"`, and case drift all hit.
  - `input` (USD per 1M input tokens) is required — a row without it bills nothing honestly; `output` / `cacheRead` / `cacheWrite` are optional and bill at the input rate when absent (a spend estimate never invents a discount or premium — deliberately NOT the kernel's economics ratios r=0.1w / q=4w).
  - The price is stamped per request (latest model wins), so a mid-session model switch reprices immediately; past ledger entries keep the price they were billed at (meter semantics).
  - Invalid shapes (unknown field, negative or zero `input`, non-numeric values) reject the whole block at load — a typo'd price must never silently no-op.
  - The web editor (`/__bili/` → Configuration → Billing prices) lists every model your sessions have used, prefills registry defaults, and saves back into this block; saving an empty table deletes it.

  ```jsonc
  {
    "billing": {
      "prices": {
        "anthropic/claude-sonnet-4-5": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
        "openai/gpt-5": { "input": 1.25 }
      }
    }
  }
  ```

### `modelContextLimit`

- **Type:** `number`
- **Default:** `200000`
- **Status:** ACTIVE
- **Description:** Process-wide absolute context limit (tokens) — the fallback tier when neither a provider entry nor a model entry declares its own limit. Overridden by `ACP_MODEL_CONTEXT_LIMIT`. Distinct from the `compress.modelContextLimit` merge key under [Compression Tuning](#compression-tuning), which participates in the per-provider/per-model three-level cascade.

### `providersPath`

- **Type:** `string`
- **Default:** *(none — providers come from the inline `providers` block in this file)*
- **Status:** ACTIVE
- **Description:** Path to an external `providers.json` (legacy / shared-file form of the inline [`providers`](#providers) table). Overridden by `ACP_PROVIDERS`.

### `promptCache`

- **Type:** `{ routing?: "auto" | "enabled" | "disabled" }`
- **Default:** `{ routing: "disabled" }` since #5079 (anything unrecognized parses as `"disabled"`; before #5079 the default was `"auto"`)
- **Status:** ACTIVE
- **Description:** The single switch for bili's OWN `prompt_cache_key` emission on egress — it governs both wires at once: the chat wire's plugin-lane body stamp and the Responses wire's key injection. A client-supplied `prompt_cache_key` is never bili's to decide: it forwards verbatim in every mode (the egress A/B probe-and-remember still withholds it where a specific origin+model has proven to reject it). On the plugin lane, a body key equal to the bound conversation id is bili's own machinery echoing back (e.g. dsh's `PI_CACHE_RETENTION=long` stack) and counts as bili's own emission. Modes: `"disabled"` (default) = bili never writes its own key; `"auto"` = the pre-#5079 behavior (chat wire stamps on every plugin-lane request; Responses wire injects only when the upstream host is exactly `api.openai.com`); `"enabled"` = stamp/inject on every supporting lane (Responses wire any host). Set it via this file, `ACP_PROMPT_CACHE_ROUTING`, or the web UI quick-config switch. Upgrades onto a relay/account-pool upstream that routes prefix cache by this key should set `"auto"` (or `"enabled"`) — otherwise traffic may route randomly and miss the prefix cache; direct official-API users can leave the default.

### `cacheKeepalive`

- **Type:** `{ enabled?: boolean, ttlFactor?: number, maxDurationMs?: number, maxConcurrentPings?: number, assumeTtl?: "5m" | "1h", armWithoutBreakpoints?: boolean, intervalMs?: number }`
- **Default:** `{}` (feature off)
- **Status:** ACTIVE (#3376)
- **Description:** Idle-period prompt-cache keepalive for the Anthropic wire (#3376). Anthropic prefix caches expire on a TTL (5 min or 1 h per breakpoint); while a session sits idle (lunch break, overnight), the next real request pays a full-price cold rebuild of the cached prefix. When enabled, bili snapshots each session's last successfully forwarded request body — the exact bytes that reached upstream, `cache_control` breakpoints included — and, while the session stays idle, replays it with `max_tokens=1` on a TTL-derived cadence; a cache-hit response refreshes the TTL at the cost of one minimal completion. Every ping is verified against the upstream's own `usage.cache_read_input_tokens`: a hit reschedules the next ping; zero read tokens means the prefix is already dead and keepalive stops.
  - **Arming.** Only successful (2xx) Anthropic-wire POSTs arm/refresh a snapshot. Passthrough requests, re-sign lanes (the stored signature would cover stale bytes), non-string bodies, bodies over 64 MiB, and bodies without any `cache_control` breakpoint never arm unless overridden below. Snapshots are in-memory only: a restart clears them and the next real request re-arms.
  - **Cadence.** `tier × ttlFactor`, where tier is `1h` when any breakpoint declares `ttl: "1h"`, else `5m`; default factor `0.9` → roughly one ping per 4.5 min / 54 min. Override with `assumeTtl` (skip body detection — for relays that inject or rewrite `cache_control` TTL downstream of bili) or absolute `intervalMs` (wins over everything); `armWithoutBreakpoints: true` arms even breakpoint-less bodies (pairs with `assumeTtl`).
  - **Stopping.** A real request for the session cancels immediately (it refreshes the cache itself); a ping whose tick lands while the session has an in-flight request defers ~5 s; `cache_read_input_tokens = 0` → stop (`prefix-dead`); HTTP 429 → stop immediately; 3 consecutive other errors → stop; more than `maxDurationMs` (default 24 h) since the session's last real request → stop; `maxConcurrentPings` (default 4) caps simultaneously armed sessions, evicting the longest-idle first.
  - **Cost & observability.** Pings bypass the proxy pipeline entirely, so they never enter the `/acp-cache` hit-rate ledger (synthetic traffic must not pollute health verdicts) and they create no cache-attribution samples — miss-attribution math runs on exactly the same request sequence as without keepalive. Each arm/ping/disarm logs a `[keepalive] …` line; `acp_status` reports one `CACHE KEEPALIVE: armed tier=… cadence=… · pings=N [· last-hit Mm ago]` line for an armed session (absent when unarmed); the web UI shows a per-session keepalive badge plus a detail line, and its raw JSON config editor accepts this section directly (validated server-side on save).
  - **Per-provider & per-model override.** Every field can also be set under a provider route (`providers.<url>.cacheKeepalive`) and under a specific model of that route (`providers.<url>.models.<model>.cacheKeepalive`) — different models behind one upstream can run different tiers/cadences. Per field, precedence is: env var > model > route > global block > built-in default.

### `autoUpdate`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Periodic npm-registry version check (every `update.checkIntervalMs`, default 3 min; the first check per process ignores throttle). Detects newer builds on the configured `updateTag` channel; whether the running process actually swaps depends on `autoRestartOnUpdate` (self-restart) or the advisory lane (forced install). Disabled by `ACP_AUTO_UPDATE=0`. Independent of `advisoryCheck`: installs with auto-update off still escape known-broken version ranges via the advisory watcher. Since #3619 a discovered upgrade is not applied immediately — automatic upgrades are staggered inside a random delay window (built-in 15 min – 48 h, remote policy adjustable; see [`update`](#update) below), so a bad release can be caught mid-rollout instead of after the whole fleet has moved.

### `autoRestartOnUpdate`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Opt-in self-restart after an auto-update install (#811): requires zero in-flight requests, passes an install sanity check, and honors a 10-minute cooldown marker; on failure the original listener resumes. Enabled by `ACP_AUTO_RESTART_ON_UPDATE=1` (any non-`0` value).

### `updateTag`

- **Type:** `string` (npm dist-tag)
- **Default:** `"latest"`
- **Status:** ACTIVE
- **Description:** Dist-tag channel the auto-updater follows (e.g. `dev`). The rolling `pr` tag tracks the newest PR test build across all PRs; legacy per-PR `pr-N` tags are frozen at that PR's last build and are only followed when explicitly configured. Overridden by `ACP_UPDATE_TAG`.

### `advisoryCheck`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Critical-defect advisory watcher (#1481): polls the companion package `billion-context-advisories` (CI-published from `advisories/`) and force-installs the pinned `target` version — which may be a ROLLBACK — when the running version falls inside a declared broken range. Runs independently of `autoUpdate`, so installs with auto-update off still get force-updated out of known-broken versions. Fail-open: an unreachable or malformed source only warns and never blocks model traffic. Disabled by `BILI_ADVISORY_CHECK=0`.

### `advisoryUrl`

- **Type:** `string` (URL)
- **Default:** *(companion package `billion-context-advisories` on the configured registry — `update.registry` aware)*
- **Status:** ACTIVE
- **Description:** Override for the advisory document URL. Overridden by `BILI_ADVISORY_URL`.

### `releaseNotesCheck`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Release-notes visibility watcher (#1870): fetches the companion `billion-context-release-notes` document and surfaces "CRITICAL update ready — restart to finish" or "critical update available" on `acp_status` and the `/acp` panel ONLY when the pending span contains a `critical`-tier entry — routine releases never surface (silent by design, #1977). Never installs, never restarts; fail-open. Disabled by `BILI_RELEASE_NOTES_CHECK=0`.

### `releaseNotesUrl`

- **Type:** `string` (URL)
- **Default:** *(companion package `billion-context-release-notes` on the configured registry — `update.registry` aware)*
- **Status:** ACTIVE
- **Description:** Override for the release-notes document URL. Overridden by `BILI_RELEASE_NOTES_URL`.

### `security`

- **Type:** object
- **Default:** none of the knobs below are set (every one fails closed)
- **Status:** ACTIVE
- **Description:** Security-posture knobs — the place where turning something ON deliberately WIDENS a trust boundary, kept as one auditable block. File-only: no `BILI_*` env twin for anything in here (#2030).

#### `security.adminRelay` (#3373)

- **Type:** `boolean`
- **Default:** `false` (fail-closed)
- **Description:** Lets an embedding host — dsh's web panel today — relay the ENTIRE `/__bili/` admin surface through the host's own web entry, so a browser on another machine can open the panel without the proxy ever binding a non-loopback interface. Headless setup: run `dsh web`, point your reverse proxy at it, and open the bili tab from anywhere — the settings iframe and its API calls stay same-origin with the entry and ride the host's relay. Mechanics: the dsh-side bili plugin registers a `/__bili` prefix route that forwards to the loopback proxy (`127.0.0.1:18787` zone), `/bili/origin` starts reporting `{"relay":true}` so the panel UI builds same-origin URLs, and the panel's own API root derives itself from the page path — so prefix gateways (`/app/dsh/…`) work too. The admin gate itself is UNCHANGED (#1538): the relayed hop arrives at the proxy as a local non-browser client — loopback source address, loopback `Host`, no `Origin`/`Cookie`/`Referer` forwarded — exactly the shape the existing checks already admit. **Security note:** `/__bili/` is the full admin surface, not a read-only dashboard — it includes config editing and credential writes. Enabling this flag means whoever can reach the host web entry can reach all of that; protect the entry (auth / reverse proxy) before turning it on. Read live per request: toggling the file applies to the next call, no restart needed. No env var — deliberate posture decisions belong in the file.

### `maskHosts`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Host masking in proxy logs (#897/#255): non-public target hosts (private relays, internal domains) are logged as `<private-host>` instead of verbatim, because logs routinely get pasted into public issues. Credential-header masking is independent and always on. Real target hosts remain available without touching this flag via `GET /__bili/stats` → `blindTunnels` and `GET /__bili/health` (both loopback-only). Disabled by `BILI_LOG_MASK_HOSTS=0`.

### `subagentSplit`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Claude Code subagent session splitting (#970/#4352), two mechanisms both gated by this switch. (1) anthropic-wire requests carrying the `x-claude-code-agent-id` + `x-claude-code-parent-agent-id` pair get their own `<session>\|sub:<agent-id>` session — own lock chain and compression state — instead of queueing behind the main session's lock. (2) Header-less claude code traffic (the VS Code extension build, whose subagents carry no agent-id headers and share the parent's first system block, so the pair gate misses — #4352) is routed through the continuity-aware order resolver: a continuing main conversation keeps the raw key on order+content evidence, while a history-disjoint subagent ride forks onto its own lane — keyed per-DISPATCH by the bili SubagentStart hook's token when it rides the first user message (`<session>\|sub:<fp>:t:<token>`), else by a fragment of the run's first user message (`<session>\|sub:<fp>:<userFp>`), so same-type subagents re-dispatched under one parent id never share a compression session (#5095); a ride with neither a valid token nor usable user text keeps the two-segment `<session>\|sub:<fp>` form. Set `BILI_SUBAGENT_SPLIT=0` to disable BOTH mechanisms.

> **Scope — anthropic wire only.** Claude Code talking the **Responses** wire
> (`x-claude-code-session-id` present, `/v1/responses` upstream) does NOT go
> through `claudeSubagentSplit`. That lane keys by the instructions
> fingerprint (`WIRE_CLIENTS` → `claude-responses` in
> `src/server/lane-decisions.ts`), which `subagentSplit` does not gate —
> `BILI_SUBAGENT_SPLIT=0` is a no-op there. Two ways out on that lane:
> - `personaSplit: false` / `BILI_PERSONA_SPLIT=0`, or
> - `stableSystemAnchor: true`, which makes instruction drift an expected
>   event so a changed system prompt never forks the main conversation.

### `forkAdoption`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Fork block-adoption for ANONYMOUS (prefix-affinity) clients (#629): when such a client forks its history mid-conversation (edit-and-resend / regenerate an earlier turn), the new session inherits the parent's compression blocks whose source content is fully present in the forked request, instead of restarting with zero compression state and re-folding the shared prefix from scratch. Identified resume-forks are NOT governed by this switch — they adopt blocks together with `resumeInheritance` (#1834). The adoptable inventory is logged on every anonymous fork even while disabled, so you can size the win before enabling. Enabled by `BILI_FORK_ADOPTION=1`.

### `affinitySimhash`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Simhash chain-alignment adoption for ANONYMOUS (prefix-affinity) clients (#2265): when a client-side pervasive decorative rewrite (Trae re-stamps a model tag on every assistant message after a model switch) breaks the exact hash chain, every request would mint a fresh pfa-* session and re-fold the full history from zero. This rung compares per-message simhash sketches position-by-position: ≥90% coverage within Hamming 10 plus ≥20% mutated-but-similar positions (a pervasive rewrite, not a point edit) plus at least one byte-identical USER message (the ownership anchor — user words never repeat across different conversations, harness machinery can) re-attaches the EXISTING session with its compression state; the stored chain is then re-anchored on the mutated bytes so the next request resolves by the exact fast path again. Edit-and-resend forks still mint their own session (#629 contract intact); identified chains are never adopted; ambiguity refuses to guess. Disabled by `BILI_AFFINITY_SIMHASH=0`.

### `resumeInheritance`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Resume inheritance for identified clients (#1486/#1834): when a client sending its own session id (e.g. Claude Code's `x-claude-code-session-id`) resumes a conversation under a NEW session id while replaying the full transcript (`cc --resume` forks a fresh UUID), bili matches the incoming history byte-exactly against that client's tracked chains (≥8 messages, append-only tracking) and, on the resumed session's first request, inherits the parent's ref assignments — stale model citations resolve to their ORIGINAL messages instead of mis-hitting renumbered ones — adopts the fully-present compression blocks, and records the `derivedFrom` lineage. The parent is never modified and fresh messages number above the parent's ref space. A resume must strictly EXTEND the parent's history — an equal-depth byte-exact replay under another id is a duplicate, not a resume. Anonymous sessions keep their own pfa-* world (#309). Disabled by `BILI_RESUME_INHERITANCE=0`.

### `stableSystemAnchor`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Stable-system anchoring (#1085) — a best-effort wire-layer fallback for prefix caching; the root fix belongs client-side (the client owns its history and decides how to present instruction changes). Plain-proxy mode only: plugin-mode agents (`x-bili-plugin`) own their context management and are never anchored. When enabled, bili remembers each session's first-seen head system/instructions block and keeps re-sending those exact bytes when the client's system prompt later changes: a LOCALIZED change (a file-style edit sharing ≥70% of lines with the version in effect so far) appends a trailing `[System context update] …` user note carrying a compact line diff (`-` removed / `+` added); a NON-LOCALIZED change (structural reshuffle, tool-def churn, timestamped banners, heads over 400 lines) is adopted outright — one deliberate cache miss beats appending noise that would mislead the model; more than 8 accumulated notes likewise replace the anchor with the newest text. The anchor and note log persist with the session metadata and survive compression/compaction. Excluded from anchoring: title-gen micro-requests (OpenAI/Google), Responses compaction-trigger requests, auto-mode classifier requests. Enabled by `BILI_STABLE_SYSTEM_ANCHOR=1`.

### `chainContentDetection`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Body-content detection of bili→bili chain awareness (#1086/#1421/#1683 follow-up): when an inbound request carries compression artifacts (render tags / historical `acp_status`+`search_context` tool calls) or a digest-bearing `<bili-chain …/>` checkpoint in its BODY but neither the `x-bili-hop` header nor local compression state for its session, bili records an advisory observation and/or applies first-processor-wins passthrough. Default OFF because scanning the request BODY can false-positive on CCR/file-introduced text and model-echoed tags that look like real markers — enable only for the narrow multi-bili relay case where an intermediate box strips `x-bili-hop` and you accept that false-positive risk. The `x-bili-hop` signal itself is unaffected either way. Enabled by `BILI_CHAIN_CONTENT=1`.

### `chainEgressStamp`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Egress emission of the model-visible `<bili-chain …/>` chain-integrity checkpoint carrier (#1683): when enabled, every request THIS instance actually processes leaves with a digest-bearing stamp so a downstream bili applies first-processor-wins even when the `x-bili-hop` header was stripped in transit (#1421). The carrier lands in a slot the terminal model also reads (a trailing `user` message on OpenAI/Responses, a trailing text part on Anthropic/Google), so models treat it as phantom user input and burn tokens commenting on it — which is why it is off by default. Independent of `chainContentDetection` (inbound body-detection) and of the `x-bili-hop` passthrough, which works either way. Enable only for the narrow multi-bili relay case above. Enabled by `BILI_CHAIN_STAMP=1`.

### `claude`

- **Type:** `{ nativePort?: number }`
- **Default:** `{}` (lane rides the self-managed port zone)
- **Status:** ACTIVE
- **Description:** claude native-lane settings. `nativePort` pins an EXACT port for the hook-spawned proxy (#964/#1660): strict-port semantics — a squatter on the port is refused loudly instead of hopping — and the baked managed `ANTHROPIC_BASE_URL` points at it. Without it the lane rides the self-managed zone (`BILI_ZONE_PORT` base + per-lane sticky) and re-pins the managed URL to the live origin each session, so port drift self-heals. Overridden by `BILI_CLAUDE_NATIVE_PORT`.

### `native`

- **Type:** `{ attachExternal?: boolean; attachLanePriority?: string[]; attachPolicy?: "own-lane" | "global-fallback"; attachUrl?: string }`
- **Default:** `{}` (own-lane policy; attach gate closed for lane'd instances; no foreign lanes listed)
- **Status:** ACTIVE
- **Description:** Native-hook attach selection (#1335, #1660, #2905, #2877). A native hook may ride an already-running proxy instead of spawning its own when it is code-compatible and passes the lifecycle gate (`watchdog.armed == true`, or `attachExternal: true`). Four independent knobs shape *which* proxy it rides:
  - **`attachPolicy`** (default `"own-lane"`, env `BILI_NATIVE_ATTACH_POLICY`) — lane affinity, and the gate on whether cross-lane riding happens at all. `"own-lane"`: a LANEd hook rides ONLY a same-lane daemon; with none available it **spawns its own** instead of falling back onto a lane-less / manually-started `bili start` daemon or another lane's daemon (that convergence pinned every agent to one daemon's version and double-wrote sessions, #2877). An **armed** lane-less daemon (a managed shared proxy, #1225) stays shareable under either policy. `"global-fallback"` restores the pre-#2877 behavior: same-lane first, then a compatible lane-less/user-zone daemon (and, with `attachLanePriority`, the listed foreign lanes).
  - **`attachLanePriority`** (#2905, file-only, no env var) — ordered list of FOREIGN lane names this hook may ride when no own-lane instance exists. Where cross-lane riding is allowed (i.e. under `global-fallback`), attach priority is: own lane first → listed lanes in list order → user zone ALWAYS last. Unlisted lanes stay non-attachable (lane isolation #1225/#1232). Default `[]` = own lane → user zone → spawn. Opt-in by design: a foreign instance's MITM whitelist may not cover your providers, in which case model traffic would blind-tunnel and every compression tool call would fail. Applies to every lane-aware attach site (launcher lanes + the hermes native plugin's discovery). Example: `"native": { "attachLanePriority": ["dsh"] }`.
  - **`attachUrl`** (env `BILI_MCP_PROXY`, which also accepts `--origin`; the env wins) — an explicit target origin (any local or remote URL). When set, discovery attaches ONLY to that exact origin (bypassing the policy filter); if it is unreachable or incompatible the hook spawns its own instead of hard-failing. This is how a host pins itself to one specific resident daemon.
  - **`attachExternal`** (env `BILI_NATIVE_ATTACH_EXTERNAL`) — the lifecycle-gate escape hatch: `true` attaches to *lane'd* unarmed listeners too (any code/lane-compatible listener regardless of watchdog state, incl. pre-#1330 builds) and bypasses the `own-lane` affinity filter entirely (fully permissive). It does NOT change which lane's daemon is preferred — that is `attachPolicy`. Precedence: `1` opens the gate even over a closed file; `0` closes it even over a permissive file.
  - **Behavior change (#2877):** the DEFAULT flipped from “a LANEd hook falls back to riding a compatible lane-less/manual daemon” to “it spawns its own.” If you relied on one manual `bili start` daemon serving all native agents, set `native.attachPolicy: "global-fallback"` (or keep `BILI_NATIVE_ATTACH_EXTERNAL=1`). Full mechanics: [TECHNICAL-NOTES.md](TECHNICAL-NOTES.md#proxy-reuse-and-the-attach-gate-1225-1335-1232-1660).

### `pi`

- **Type:** `{ subagents?: PiSubagentsFileConfig | boolean }`
- **Default:** `{}` (acp_delegate surface enabled with package defaults)
- **Status:** ACTIVE (#2230 config-home)
- **Description:** Settings for the built-in **pi-lane sub-agents** (`acp_delegate` / `acp_delegate_wait` / `acp_delegate_cancel`, registered when `bili pi` wires the embedded extension). The `pi.subagents` section is the config home for this surface; the in-repo `pi-subagents/` component (npm name `billion-context-pi-subagents`) reads the same section through its own loader (the file format is the contract, not shared code). Previously these knobs lived in pi's `~/.pi/acp.json` under `delegate` / `delegatePrompt` / `displayUsage` / `debug` — those four keys are a **deprecated fallback**: still read while the section is absent (one-time deprecation warning on the host process stderr), **ignored once the section exists**, slated for removal in a future release. Renames: `delegatePrompt` → `prompt`; `debug` is scoped to the sub-agent subsystem and does **not** collide with the top-level proxy `debug`.

```jsonc
"pi": {
  "subagents": {
    "enabled": true,              // master switch; false (or "subagents": false) removes tools+prompt+shortcut (new session)
    "forceEnable": false,        // keep acp_delegate even when a pi-subagents install (either scope) is detected (#415, #5637)
    "displayUsage": "separate",  // "separate" (own footer block) | "merged" (folded into tool-result usage)
    "maxDepth": 2,               // nesting depth cap, propagated to children
    "syncTimeoutMinutes": 5,     // hard timeout for sync delegates; 0/null disables
    "idleTimeoutMinutes": 5,     // idle watchdog for async delegates; 0/null disables (warns)
    "asyncTimeoutMinutes": 30,   // hard limit for async delegates; 0/null disables
    "maxConcurrent": 4,          // cap on concurrent background delegates (default unlimited; extras queue)
    "thinkingLevel": "medium",   // off|minimal|low|medium|high|xhigh|max; priority per-call > role > this > pi default
    "agents": {                  // per-role defaults: { model: "provider/id", thinkingLevel: "…" }
      "reviewer": { "model": "anthropic/claude-sonnet-4-5", "thinkingLevel": "high" }
    },
    "notifyIfRead": "skip",      // "skip" — no completion nudge if the model already read the result file
    "fleetShortcut": "ctrl+alt+d", // "" disables the keyboard shortcut (/acp-fleet still works)
    "prompt": null,              // replace (string) or remove (null) the ACP_DELEGATE NOTIFICATIONS appendix
    "debug": false               // debug events in ~/.pi/acp.log, scoped to sub-agents
  }
}
```

**Env overrides** (per-process spawn channels, propagate to delegate children; `PI_ACP_DELEGATE_*` > `pi.subagents` > deprecated acp.json > default):

| Env var | Overrides | Notes |
|---|---|---|
| `PI_ACP_DELEGATE_FORCE_ENABLE` | `pi.subagents.forceEnable` | `true`/`false`; unparseable values warn and fall back to the file value. |
| `PI_ACP_DELEGATE_MAX_DEPTH` | `pi.subagents.maxDepth` | Integer ≥ 1; invalid warns and falls back. |
| `PI_ACP_DELEGATE_SYNC_TIMEOUT_MINUTES` | `pi.subagents.syncTimeoutMinutes` | `0` disables; negative/non-numeric warns and falls back. |
| `PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES` | `pi.subagents.idleTimeoutMinutes` | `0` disables (warns — hung children then need `acp_delegate_cancel`). |
| `PI_ACP_DELEGATE_ASYNC_TIMEOUT_MINUTES` | `pi.subagents.asyncTimeoutMinutes` | `0` disables. |
| `PI_ACP_DELEGATE_MAX_CONCURRENT` | `pi.subagents.maxConcurrent` | Integer ≥ 1; invalid falls through to the file value, then unlimited. |

Changes take effect on a **new session** (tools register at session start). Full delegate surface docs (roles, execution model, fleet inspector): [billion-context-pi-subagents README](pi-subagents/README.md).

### Process-level blocks (#2030)

Since #2030 every pure-behavior knob has a config-file key alongside its env var. Resolution is **env var > config file > built-in default**: a *set* env value owns its knob even when garbage (it parses exactly as pre-#2030 — falling back to the default) and neither leaks into nor gets shadowed by the file tier. These blocks scope the **proxy process** (transport timing, persistence, session lifecycle, self-update, diagnostics). They deliberately do **not** participate in the three-level compress merge ([global → provider → model](#three-level-merge-example)): none of these knobs has per-provider or per-model semantics — their env-var form was process-global, so a top-level key preserves scope exactly. All keys are optional; omitting a block changes nothing. Exhaustive per-knob semantics live in the [env mapping table](#config-file-keys-for-environment-knobs-2030) below.

```jsonc
// ~/.config/billion-context/billion-context.json — #2030 process-level blocks (all optional)
{
  // Transport & retry timing
  "network": {
    "upstreamTimeoutMs": 720000,          // idle budget per upstream request (12 min default)
    "requestWatchdogMs": 1440000,         // total request budget; default = 2× upstream timeout
    "replayRetryMax": 3,                  // attempts after transient upstream 429/5xx
    "replayRetryBaseMs": 1500,            // backoff base; 0 disables the delay
    "maxShrinkPerCompress": 0.4,          // max fraction (0,1] one compress may shrink; omit = no steering
    "keepAliveTimeoutMs": 5000,           // client-facing socket keep-alive
    "clientErrorBackstopMs": 30000,       // half-open client socket destroy backstop
    "exposureLogIntervalMs": 3600000,     // [exposure] telemetry interval; 0 disables
    "streamKeepAliveMs": 15000,           // SSE keepalive during upstream silence; 0 disables
    "preflightHoldMs": 30000,             // grace before a long preflight hold starts
    "preflightDeadEndCooldownMs": 300000, // cooldown after a dead-end preflight verdict
    "proxyKeepAliveMaxMs": 55000,         // upstream-proxy connection reuse cap; 0 uncapped
    "postResponseLingerMs": 5000,         // post-response close linger budget (#1982)
    "allowPrivateHttpProviders": false    // opt-in: private-network plain-HTTP providers (#2984)
  },

  // Session persistence
  "persist": {
    "enabled": true,                      // false = in-memory only, lost on restart
    "zstd": false,                        // true = BILIZSTD1 files (#1080 owner decision: off)
    "debounceMs": 500,
    "tailTokens": 16384,                  // persisted snapshot budget; 0 = no message persistence
    "epermAlertThreshold": 5,             // Windows AV-exclusion alert after N failures
    "epermAlertRepeatMs": 0               // 0 = alert once
  },

  // Session lifecycle
  "sessions": {
    "max": 256,                           // in-memory LRU cap
    "gc": {
      "enabled": false,                   // opt-in (#1082): session files are user data
      "maxAgeDays": 7,
      "maxTokens": 1000000,
      "intervalMs": 3600000
    }
  },

  // Self-updater
  "update": {
    "registry": "https://registry.npmjs.org",
    "checkIntervalMs": 180000
  },

  // Debug & diagnostic toggles
  "diagnostics": {
    "dumpBody": false,                    // dump full request/response bodies
    "dumpReq": true,                      // gate for request-body dumps
    "rawDumpDir": null,                   // raw-dump location; null = <state dir>/raw
    "dump4xx": false,                     // capture rejected 4xx bodies
    "dump4xxMaxBytes": 2097152,
    "maxTotalBytes": null,                // cap total dump-dir bytes; null = no cap (#2412)
    "maxAgeDays": null,                   // delete dump files older than N days; null = off
    "renderNone": false,                  // stop injecting mNNNNN render tags
    "invariantJudge": true,               // L1 advisory outbound-invariant judge (#3938)
    "noInjectTool": false,                // suppress compress tool injection
    "noCompressPrompt": false,            // suppress compress prompt text
    "countTokensPassthrough": false,      // forward /count_tokens verbatim
    "compressProtocol": "tools"           // "tools" | "text"
  },

  // Fake-completion safety net (#371, opt-in)
  "fakeCompletion": { "retries": 0, "bufCapBytes": 16777216 },

  // Scalars
  "codexCompact": "intercept",            // or "pass"
  "ccrRetrievalTtlMs": 600000,            // queued acp_retrieve expiry; 0 disables
  "decompressTmpCap": 50                  // max concurrent decompress temp files
}
```

### `network`

- **Type:** `{ upstreamTimeoutMs?: number; requestWatchdogMs?: number; replayRetryMax?: number; replayRetryBaseMs?: number; maxShrinkPerCompress?: number; keepAliveTimeoutMs?: number; clientErrorBackstopMs?: number; exposureLogIntervalMs?: number; streamKeepAliveMs?: number; preflightHoldMs?: number; preflightDeadEndCooldownMs?: number; proxyKeepAliveMaxMs?: number; postResponseLingerMs?: number; allowPrivateHttpProviders?: boolean }`
- **Default:** `{}` (built-ins: `720000`, `2× upstream timeout`, `3`, `1500`, unset, `5000`, `30000`, `3600000`, `15000`, `30000`, `300000`, `55000`, `5000`, `false`)
- **Status:** ACTIVE
- **Description:** Process-wide transport and retry timing (ms). Each key resolves env > file > default via its twin (`BILI_UPSTREAM_TIMEOUT_MS`, `BILI_REQUEST_WATCHDOG_MS`, `BILI_REPLAY_RETRY_MAX`, `BILI_REPLAY_RETRY_BASE_MS`, `BILI_MAX_SHRINK_PER_COMPRESS`, `BILI_KEEP_ALIVE_TIMEOUT_MS`, `BILI_CLIENT_ERROR_BACKSTOP_MS`, `BILI_EXPOSURE_LOG_INTERVAL_MS`, `BILI_STREAM_KEEPALIVE_MS`, `BILI_PREFLIGHT_HOLD_MS`, `BILI_PREFLIGHT_DEAD_END_COOLDOWN_MS`, `BILI_PROXY_KEEPALIVE_MAX_MS`, `BILI_POST_RESPONSE_LINGER_MS`, `BILI_ALLOW_PRIVATE_HTTP_PROVIDERS`, `BILI_CA_FILE`). Semantics: `upstreamTimeoutMs` bounds time-to-first-byte and inter-chunk silence end-to-end (#551); `requestWatchdogMs` is the total-request budget (a negative value opts out); `replayRetryMax` counts attempts after transient upstream rejections (#189/#1688); `maxShrinkPerCompress` caps how much one compress may shrink the request before bili steers toward smaller ranges (#189); `streamKeepAliveMs` emits an SSE comment when the response has written zero bytes for that long (#1647); `proxyKeepAliveMaxMs` caps connection reuse through an upstream proxy below its recycle cadence (#1263), `0` uncaps; `postResponseLingerMs` is the graceful-close budget after a proxy-initiated post-response close — the socket is held waiting for the peer's FIN/TLS close_notify and destroyed at the deadline (`reason=linger-backstop`) (#1982); `allowPrivateHttpProviders` is an opt-in (#2984): when true, plain-HTTP provider baseUrls on private networks (RFC1918, 127/8, link-local, IPv6 ULA/link-local, `*.local`/`.lan`/`.internal`) are admitted by the agent-registry intake and summary-endpoint guards that otherwise trust loopback plaintext only — public IPs/domains and CGNAT (100.64/10) stay refused regardless, and the default `false` keeps pre-#2984 behavior byte-for-byte; `caFile` (#3776) points bili's own upstream fetch at an extra root-CA PEM — merged with, never replacing, the built-in roots and `NODE_EXTRA_CA_CERTS` — for security-scanner/corporate-MITM re-signed upstreams. Full details in the [env table](#config-file-keys-for-environment-knobs-2030).

### `persist`

- **Type:** `{ enabled?: boolean; zstd?: boolean; debounceMs?: number; tailTokens?: number; epermAlertThreshold?: number; epermAlertRepeatMs?: number }`
- **Default:** `{ enabled: true, zstd: false, debounceMs: 500, tailTokens: 16384, epermAlertThreshold: 5, epermAlertRepeatMs: 0 }`
- **Status:** ACTIVE
- **Description:** Session-persistence behavior (twins `BILI_PERSIST`, `BILI_PERSIST_ZSTD`, `BILI_PERSIST_DEBOUNCE_MS`, `BILI_PERSIST_TAIL_TOKENS`, `BILI_PERSIST_EPERM_ALERT_THRESHOLD`, `BILI_PERSIST_EPERM_ALERT_REPEAT_MS`). `enabled: false` keeps sessions in memory only; `zstd: true` writes `BILIZSTD1` files (#1080 owner decision: plain JSON stays the default for recoverability); `tailTokens` budgets the persisted folded snapshot (`0` disables message persistence entirely); the two `eperm*` keys tune the Windows antivirus-exclusion alert. Details in the [env table](#config-file-keys-for-environment-knobs-2030).

### `sessions`

- **Type:** `{ max?: number; gc?: { enabled?: boolean; maxAgeDays?: number; maxTokens?: number; intervalMs?: number } }`
- **Default:** `{ max: 256, gc: { enabled: false, maxAgeDays: 7, maxTokens: 1000000, intervalMs: 3600000 } }`
- **Status:** ACTIVE
- **Description:** `max` caps in-memory sessions with LRU eviction (twin `BILI_MAX_SESSIONS`; disk remains the source of truth). `warmMax`/`warmMaxBytes` bound the boot warm cache and `residentMaxBytes` the idle-residency target (#2803 bounded startup: boot hydrates only the most recent warm set, everything else reloads on demand; active/in-flight state is never evicted). `gc` controls stale-session-file cleanup (twins `BILI_SESSION_GC*`) — **opt-in**, because session files are user data: compressed sessions are never deleted, deletions are audit-logged, and the age + lossless-size gates apply. Details in the [env table](#config-file-keys-for-environment-knobs-2030).

### `plugin`

- **Type:** `{ snapshotCapBytes?: number }`
- **Default:** `{ snapshotCapBytes: 104857600 }`
- **Status:** ACTIVE
- **Description:** Plugin-surface knobs (#2017). `snapshotCapBytes` caps the raw wire-history snapshot retained per plugin session for the public fork API (`GET /__bili/plugin/snapshot`, `POST /__bili/plugin/fork`): when the serialized snapshot exceeds the cap, bili refuses to retain it — the session stops being forkable (snapshot/fork answer `409` with the capped reason) instead of retaining an unbounded raw copy on disk. Default `100 MiB`; `0` disables retention entirely (no session is forkable); twins `BILI_PUBLIC_SNAPSHOT_CAP_BYTES`. Details in the [env table](#config-file-keys-for-environment-knobs-2030).

### `update`

- **Type:** `{ registry?: string; checkIntervalMs?: number; staggerMinDelayMs?: number | string; staggerMaxDelayMs?: number | string; policyUrl?: string }`
- **Default:** `{ registry: https://registry.npmjs.org, checkIntervalMs: 180000 }` (stagger fields unset → built-in window 15 min – 48 h; `policyUrl` unset → official-repo raw URL)
- **Status:** ACTIVE
- **Description:** Self-updater sources (twins `BILI_UPDATE_REGISTRY`, `BILI_UPDATE_CHECK_INTERVAL_MS`, `BILI_UPDATE_STAGGER_MIN_MS`, `BILI_UPDATE_STAGGER_MAX_MS`, `BILI_UPDATE_POLICY_URL`). The stagger file fields accept human-readable duration strings (`"15m"`, `"2d"`, `"1d12h"`, units s/m/h/d/w, combinable); the env twins stay raw ms. `registry`/`checkIntervalMs` resolve at import time, so they take effect on the next restart — same as the env vars did. `registry` is intended for hermetic testing (the verdaccio e2e lane); leave it at the default in production (#1153). The stagger fields and `policyUrl` are live-read per update cycle.

#### Staggered rollout & remote update policy (#3619)

When a newer version is discovered, an automatic upgrade does not run immediately: the instance draws ONE random moment inside a delay window — built-in default **15 min to 48 h** — and upgrades when that moment arrives. The drawn moment is persisted under the cache dir (`~/.cache/billion-context/.update-stagger.json`) keyed by `(dist-tag, target version)`, so process restarts never re-roll (a restart-heavy machine cannot keep drawing early values). This spreads fleet upgrades across the window instead of everyone moving within minutes of a release, leaving a response window to catch a bad release mid-rollout (#3401/#3600/#3394).

Window composition (each side independently): local config/env > remote policy `default` > built-in (15 min / 48 h). **`0` disables the delay for this machine** — set both sides to `0` for legacy immediate upgrades.

Remote policy file: bili anonymously GETs `auto-update-policy.json` from the official repo's raw address (`update.policyUrl` / `BILI_UPDATE_POLICY_URL` override is a test seam only). It is cached with ETag/If-None-Match under the cache dir. Failure ladder (fail-open — upgrade capability is never blocked by the file): fetch/HTTP failure → reuse the last good cached copy while fresher than 30 days, else local defaults; malformed JSON or unknown `schemaVersion` → drop the cache, local defaults. Zero telemetry: plain GET, no query parameters, no device id.

Format (fields are additive; unknown fields are ignored). Keys are `minDelay`/`maxDelay` (duration strings preferred — raw-ms numbers also accepted):

```jsonc
{
  "schemaVersion": 1,
  "default": { "minDelay": "15m", "maxDelay": "2d" },
  "overrides": [
    { "range": ">=0.1.200", "maxDelay": "1h" },
    { "version": "0.1.199", "maxDelay": "1m" }
  ],
  "hold": false,
  "blocked": [],
  "pinned": null
}
```

- `default` — base window for target versions no override matches. Duration fields (`minDelay`/`maxDelay`, same in every override) accept human-readable strings (`"15m"`, `"2d"`, `"1d12h"`, units s/m/h/d/w, combinable; plain numbers still mean raw ms). A malformed value is ignored with a warning — never guessed.
- `overrides[]` — per-target-version window tweaks: exact `version` beats `range` (npm semver ranges); the first matching range wins. An override may set only one side.
- `hold: true` — freeze automatic upgrades fleet-wide (checks keep running, nothing installs). Manual `bili update` still works.
- `blocked: ["x.y.z", …]` — skip these versions; the updater steps down to the next published version not listed.
- `pinned: "x.y.z"` — upgrade ceiling: never auto-upgrade above this version (never force-downgrades a running install; rolling one back remains advisory's job). `null` = no pin.

Security boundary: the file controls ONLY *when* to upgrade and *which published versions* to skip or pin — never *what bytes* get installed. The install source stays npm-registry dist-tag resolution; `blocked`/`pinned` values that are not actually-published versions are ignored with a log line. State is user-visible: while frozen / pinned / staggered, `/__bili/status` reports `updatePolicy` (`source`, `hold`, `pinned`, `blocked`, `plannedUpgrade`) and the logs say so. Exits: manual `bili update` bypasses `hold` and the stagger (it still respects `blocked`/`pinned`), `ACP_AUTO_UPDATE=0` stops auto-updates entirely, and a `0`/`0` stagger restores legacy timing per machine.

### `diagnostics`

- **Type:** `{ dumpBody?: boolean; dumpReq?: boolean; rawDumpDir?: string; dump4xx?: boolean; dump4xxMaxBytes?: number; maxTotalBytes?: number; maxAgeDays?: number; renderNone?: boolean; invariantJudge?: boolean; noInjectTool?: boolean; noCompressPrompt?: boolean; countTokensPassthrough?: boolean; compressProtocol?: "tools" | "text" }`
- **Default:** `{ dumpBody: false, dumpReq: true, rawDumpDir: <state dir>/raw, dump4xx: false, dump4xxMaxBytes: 2097152, maxTotalBytes: null, maxAgeDays: null, renderNone: false, invariantJudge: true, noInjectTool: false, noCompressPrompt: false, countTokensPassthrough: false, compressProtocol: "tools" }`
- **Status:** ACTIVE
- **Description:** Debug/diagnostic toggles that used to be env-only (`ACP_DUMP_BODY`, `ACP_DUMP_REQ`, `ACP_RAW_DUMP_DIR`, `BILI_DUMP_4XX`, `BILI_DUMP_4XX_MAX_BYTES`, `ACP_RENDER_NONE`, `ACP_NO_INJECT_TOOL`, `ACP_NO_COMPRESS_PROMPT`, `ACP_COUNT_TOKENS_PASSTHROUGH`, `ACP_COMPRESS_PROTOCOL`). Mostly read live per request (no restart needed), except `compressProtocol` which resolves once at boot like the env var did. `renderNone` stops the `mNNNNN` render tags from being injected into outgoing history — disable only if your workflow doesn't need ref-based compression (#933). Retention bounds (#2412): dump dirs are write-only with no rotation by default — active body/SSE capture measured at ~63 GB/day can fill a disk in days. Set `maxTotalBytes` and/or `maxAgeDays` to bound them (oldest-first deletion, `err-*`/`summary-err-*` incident dumps protected, deletions logged at warn level); leave both unset for unbounded retention. Details in the [env table](#config-file-keys-for-environment-knobs-2030).

### `fakeCompletion`

- **Type:** `{ retries?: number; bufCapBytes?: number }`
- **Default:** `{ retries: 0, bufCapBytes: 16777216 }`
- **Status:** ACTIVE
- **Description:** Fake-completion safety net for hosts that abort mid-stream (#371) — **opt-in**, `retries: 0` (default) is the pre-#371 passthrough. `bufCapBytes` is the OOM guard on the buffered response. Twins `BILI_FAKE_COMPLETION_RETRIES`, `BILI_FAKE_BUF_CAP`.

### `codexCompact` / `ccrRetrievalTtlMs` / `decompressTmpCap`

- **Type:** `string` ("intercept" | "pass") / `number` / `number`
- **Default:** `"intercept"` / `600000` / `50`
- **Status:** ACTIVE
- **Description:** Top-level scalars. `codexCompact`: whether bili intercepts codex native-compaction requests and forges a local ACP handoff, or passes them upstream (twin `BILI_CODEX_COMPACT`; read per request, so either tier flips without restart). Scope (#3008): interception covers the explicit forms (the `/compact` trigger item and `POST /responses/compact`) and the inline auto-compact that transits as an ordinary turn, detected by its SUMMARIZATION_PROMPT template; a user-overridden compact_prompt falls out of detection and transits verbatim. Compaction bili only observed (pass mode / gate refusal) is rebased post-hoc onto the compacted history (#2372). `ccrRetrievalTtlMs`: expiry for queued-but-undelivered `acp_retrieve` injections, dropped loudly on expiry (twin `BILI_CCR_RETRIEVAL_TTL_MS`; `0` disables). `decompressTmpCap`: max concurrent decompress temp files (twin `BILI_DECOMPRESS_TMP_CAP`).

Three more #2030 keys extend existing blocks: [`mitm.handshakeTimeoutMs`](#client-integration) (default `10000`, twin `BILI_MITM_HANDSHAKE_TIMEOUT_MS`), [`compat.noCacheControl`](#compat), and [`compat.keepResponseId`](#compat).

---

## Providers

The `providers` block maps **upstream URLs** to per-provider configuration. Each key is a URL prefix; each value can declare model context windows, a per-provider proxy, a compression protocol, a wire-protocol declaration, compression overrides, an image billing mode, a per-route passthrough, a client-side direct exemption, and a lane credential override ([`apiKeyEnv`](#lane-credentials-apikeyenv--credentialref)). Non-URL **named** keys are also allowed: they are routing-inert on their own, and become real lanes via [`bind`](#named-provider-entries-bind).
```jsonc
{
  "providers": {
    "https://api.anthropic.com": {
      "models": {
        "claude-sonnet-4-5": { "context": 200000, "output": 8192 }
      },
      "proxy": "http://10.0.0.1:7890",
      "compressProtocol": "tools",
      "compress": { "maxContextLimit": "70%" }
    },
    "https://relay.example.com/my/custom/complete": {
      "protocol": "openai"
    }
  }
}
```

### URL key matching

Keys are matched against the request's upstream URL by **longest-prefix wins**. A key matches if the request URL equals the key, or starts with `key + "/"`. This makes matching boundary-safe: a key `https://api.example.com` matches `https://api.example.com/v1/chat` but does **not** match `https://api.example.com.evil` (an attacker-controlled lookalike host).

A shallow key (`https://open.bigmodel.cn`) matches every path on that host. A deep key (`https://open.bigmodel.cn/api/anthropic`) matches only that endpoint. When two keys both match, the longest (most specific) one wins. Trailing slashes on keys are stripped automatically.

**A request whose upstream matches no key applies NO per-provider override.** If the request URL matches none of the keys above, that request runs on registry/global defaults only — its `models.<m>.context`, `compress.modelContextLimit`, proxy, protocol, etc. are all silently ignored. The usual trap is switching your client to a *different relay host* while your pins live under the old host's key: the new host is a route-miss, so nothing you set under the old key ever reaches it. Since #2317 this is loud instead of silent — bili logs a once-per-(upstream, model) `[route]` warning naming the known keys, stamps `upstream=<…> route=miss` on the `[window]` / codex-clamp lines, and a preflight 502 for an over-window payload points at the missing key rather than telling you to re-set `compress.modelContextLimit`. Add a `providers` entry for the new host (or URL prefix) to make your overrides apply there. Endpoints in these lines are fingerprinted (`<host:xxxxxxxx>`) rather than printed verbatim, consistent with log host-masking (`BILI_LOG_MASK_HOSTS`).

### MITM vs `/bili/` key schemes

A login client (ZCode via MITM) and an API-key client can both hit the same host (`open.bigmodel.cn`). To let their config differ, MITM traffic uses a `mitm://` scheme in the provider lookup key while `/bili/` traffic uses the real `https://`:

| Client | Lookup key example |
|---|---|
| ZCode (MITM, login) | `mitm://open.bigmodel.cn` |
| API-key client (`/bili/`) | `https://open.bigmodel.cn/api/anthropic` |

So you can give ZCode its own upstream proxy without affecting API-key clients:

```jsonc
{
  "providers": {
    "mitm://open.bigmodel.cn":            { "proxy": "http://127.0.0.1:20173" },
    "https://open.bigmodel.cn/api/anthropic": { "proxy": "http://127.0.0.1:20172" }
  }
}
```

The two schemes never overlap: a `mitm://` key targets only MITM (login-client) traffic of that host, a plain `https://` key only `/bili/` (API-key) traffic.

### Named provider entries (`bind`)

A key that is not a URL (e.g. `"claude-bridge"`) is a **named** entry. On its own it is routing-inert — longest-prefix match never hits it — and carries only agent-side identity such as [`compactionOptIn`](#compactionoptin). With a `bind` field it becomes a pure **alias** of another lane:

- **Type:** `string` — the http(s) base URL of the lane to alias.
- Resolution happens **purely at config-load time**: the entry's routing fields (`compress`, `models`, `proxy`, `passthrough`, `compressProtocol`, `compat`, `imageBilling`, `imageTokenCap`, `protocol`) are deep-merged onto the bound URL's route and apply exactly as if written under that URL key. The name itself never appears in the request path or on the wire; the proxy keeps its single URL-prefix routing.
- **Precedence (per field):** an explicit URL-key entry beats any alias field; between sources the external `ACP_PROVIDERS` file beats inline config at every level (aliases fold in source order, first-set wins). Objects merge per key; arrays/scalars are taken wholesale from the winner — no element-wise merging.
- A named key without `bind` that still carries routing fields is dead config: bili logs a startup warning naming the key and the inert fields ("add `bind`, or move these under the URL entry") instead of silently ignoring them. Invalid `bind` values (non-string, non-http(s) URL) warn and leave the entry inert; `bind` on a URL key warns and is ignored (the key is already a lane).

```jsonc
{
  "providers": {
    "claude-bridge": {
      "bind": "https://api.anthropic.com",
      "compactionOptIn": true,
      "compress": { "maxContextLimitPct": 0.75 }
    }
  }
}
```

### Lane credentials (`apiKeyEnv` / `credentialRef`)

A URL-keyed lane (or a named entry with `bind`) can send **its own** credential upstream instead of the client's — the lane owner's key replaces whatever the agent client put on the wire (#2336). Typical case: a shared machine proxy where the owner's `deepseek` lane authenticates with the owner's key no matter which client (and whose personal key) is talking through it.

```jsonc
{
  "providers": {
    "https://api.deepseek.com": { "apiKeyEnv": "DEEPSEEK_LANE_KEY" }
  }
}
```

- **Type:** `string` — `apiKeyEnv` is an environment-variable NAME (`env:VAR` semantics), `credentialRef` is a NAME in the private [summary-credential store](#shared-external-summary-service) (`secret:NAME` semantics). Exactly one of the two per entry; invalid values reject the config (#1909 discipline — startup failure / web-UI 400).
- **Replacement rules:** `x-api-key` and `x-goog-api-key` are replaced outright. `authorization` is replaced **only** when the client's value is a Bearer token — any other scheme (SDK-HMAC signatures, mTLS fingerprints…) is signature-owned and left untouched, with a warning. A request carrying none of the three gains `authorization: Bearer <key>`.
- **#1884 interplay:** skipped whenever the CodeArts re-sign arm is active on the request — the re-signer owns `Authorization` there.
- **Failure posture:** if the env var is unset or the secret is absent, bili keeps the client's own headers and warns once per lane+reference (visible, never silently degrading to a guaranteed 401). The warning re-arms after a successful resolution.
- Applied once to the shared forward-header set, so every egress of the request — initial send, role-ladder retry, overflow refold, compress-loop rounds, continuation refetch — carries the lane credential.

### Route-level k̂ calibration policy

- **Type:** `object` — `{ "disabled"?: boolean, "max"?: number }`; at least one key required
- **Default:** *(unset — the learned k̂ applies unmodified)*
- **Status:** ACTIVE
- **Description:** Per-route escape hatch for upstreams whose usage reports inflate beyond any honest tokenizer scale (#3211: relay markup / non-token accounting learns k̂ ≈ 1.86–1.97, which pins the decision meter into the pressure band permanently — the band bypasses growth-gate + cadence, so every few thousand tokens of pending triggers another fold that recovers just enough to dip back below the line: high-frequency small-yield churn). bili cannot distinguish a genuinely denser tokenizer from an inflated report using the usage stream alone, so this policy is OPT-IN per route and applied at k̂ PUBLICATION time — the learned ring stays raw in `stats.calibrationRing` for audit; only the applied factor (`stats.calibratedEstimate`) changes:
  - `"disabled": true` — never apply a learned factor on this route; decision meters run on the raw local estimate.
  - `"max": <number>` (0 < max ≤ 4) — clamp the applied factor to ≤ max. `1` = allow deflation learning only (never inflation): a route that honestly bills slightly UNDER local estimates still benefits from that correction.
  - Both may be set; `disabled` wins.
  Matching follows the same longest-URL-prefix rule as every other provider field (path-scoped keys included). The effect takes hold on the next k̂ publication for that route (≤ 3 settled turns); removing the policy restores the learned value on the next publication. Invalid values (wrong types, empty object, `max` outside (0, 4]) reject the config load loudly.

### `models`

- **Type:** `Record<string, { context?: number; output?: number; compress?: CompressSettings; benefit?: boolean }>`
- **Default:** *(none)*
- **Status:** ACTIVE
- **Description:** Maps a model name to its context-window declaration. The LLM `/models` endpoint does **not** return context windows (verified across OpenAI, Anthropic, zhipu, comfly), so the proxy cannot discover them at runtime. `context` is the model's context window in tokens; `output` is the max output size and serves as the output-headroom fallback when a request carries no output-budget field at all (see [`outputHeadroomMaxPct`](#outputheadroommaxpct)). It also floors the #546 output-budget restore: when a client's own `max_tokens` has starved to ≤ 200 on a tool-carrying main request, the proxy restores it to the session's last healthy budget, and that restore target is floored at the model's best-known output ceiling — client-reported runtime-info > launcher channel > this declared value > models.dev registry listing (#1665/#1840). When NO source knows the model's output ceiling, the proxy logs a one-time-per-model warning: the restore then rests solely on the client's last non-starved value, which may still truncate long sessions at max-tokens.

  **Resolution order (first match wins):** (1) per-request sources — the client's `anthropic-beta` larger-context negotiation, a cooperative plugin's report, and the launcher's per-model windows; (2) this per-model `context` declaration; (3) the **warm** models.dev registry cache, when the model is listed (relay/private hosts match the bare model name against the registry's provider-prefixed entries); (4) the built-in context table. So this per-model `context` declaration **outranks the registry** — set it to the window your relay/private deployment actually serves, and it wins even when models.dev lists a different (usually larger) window for the model. `compress.modelContextLimit` remains the highest-priority source (always wins) when you want to pin the window across every route. Each model entry may also carry a per-model `compress` block (see [Compression Tuning](#compression-tuning)), and the #1884 re-sign arm's model-level knob: `benefit: true | false` — whether this model bills against the CodeArts free quota (its re-signed requests carry the signed `maas_type: benefit` header; env `BILI_RESIGN_BENEFIT` wins over the whole tree, unset falls back to the built-in `glm-5.3-flash, deepseek-v4.1-flash` set).

  The built-in context table (step 4) is static data shipped with each release and can go stale — e.g. DeepSeek's canonical request id `deepseek-flash` is not listed on models.dev under that name (its window is listed under `deepseek-v4-flash`), so only the table answered for it (#852). The log records which source won, once per model per process (`[window] ... fallback=true` means the value came from the built-in table). If the resolved window looks wrong, declare `models.<name>.context` as above — it outranks both the registry and the table — or pin `compress.modelContextLimit`; and remember the provider key must carry the traffic's scheme (`mitm://<host>` for MITM login-client traffic, `https://<host>` for `/bili/` traffic).

### `proxy`

- **Type:** `string`
- **Default:** *(inherits top-level `proxy`)*
- **Status:** ACTIVE
- **Description:** Per-provider upstream HTTP proxy (`http://host:port`). Overrides the top-level `proxy` for this provider only. An empty string means "explicitly direct" — override the global proxy with no proxy for this one provider.

### `compressProtocol`

- **Type:** `"tools" | "marker"`
- **Default:** `"tools"`
- **Status:** ACTIVE
- **Description:** How compression tools are injected into the request. `"tools"` (default) injects them as native function-call tools. `"marker"` uses a text-trigger protocol instead — use this for upstreams that cannot coexist with a declared `tools` field.

### `protocol`

- **Type:** `"anthropic" | "openai" | "responses" | "google"`
- **Default:** *(none — inferred from the request path)*
- **Status:** ACTIVE
- **Description:** Declares the wire protocol for this lane (#1909), for endpoints whose path does not match the built-in suffix table (`/chat/completions`, `/messages`, `/responses`, Google paths). Two granularities: a bare host key (`"https://relay.example.com": { "protocol": "openai" }`) covers every POST-with-body under that host; a path key (`"https://relay.example.com/my/custom/complete": { "protocol": "openai" }`) covers only that subtree. This is the server-side counterpart of the client-side `/bili/<protocol>/<origin>` escape hatch — it covers clients whose base URL you cannot change (relays with custom endpoint paths, MITM-intercepted hosts). Priority: `/bili/<protocol>/` explicit marker **outranks** the declaration, which outranks the built-in suffix table. The declaration only ever *identifies* a request — it does not relax the safety nets: a body that does not parse as the declared protocol is relayed verbatim (#1284), and a GET without a body never becomes a declared protocol.

  **Client-side counterpart — the `/bili/<protocol>/<origin>` escape hatch:** when you *do* control the client's base URL but the endpoint path is nonstandard, skip config entirely and put the protocol in the URL itself:

  ```text
  http://127.0.0.1:8787/bili/openai/https://relay.example.com/api/custom/complete
  ```

  `<protocol>` ∈ `anthropic` | `openai` | `responses` | `google`. It forces the wire protocol regardless of the path and **outranks** every server-side declaration (and the built-in suffix table). The plain form without a protocol segment (`/bili/<absolute-url>`) is unchanged: protocol still inferred from the path. Use the URL form per client; use this `providers.protocol` field per lane when the base URL cannot be changed (hardcoded endpoints, MITM-intercepted hosts).

  **Non-shadowing (#1909):** `protocol` resolves independently of the other provider fields — all matching keys are scanned longest-prefix-first and the deepest key that *explicitly declares* `protocol` wins, so a host-key declaration keeps applying under a silent path key (no duplication needed). The *other* fields keep their existing single-entry longest-key semantics: like every path key, a protocol-only path key becomes the winning entry under its subtree, so host-level values of URL-scoped fields (`compress`, `models`, …) do not reach that subtree unless repeated on the path key. One exception: `compressProtocol` resolves against the upstream origin only, so no path key can shadow a host-level value there. A path key **without** `protocol` in it is still just routing config; `mitm://` keys follow the same scheme split as every other field. Invalid values fail config load loudly (web saves get a 400).

### `compress`

### `compat`

- **Type:** `{ roles?: Record<string, string>; dropFields?: string[] }`
- **Default:** `{}` (disabled)
- **Status:** ACTIVE
- **Description:** Per-provider wire-compat overrides. `roles` maps message roles to the role name this upstream accepts, e.g. `{"developer": "system"}` for upstreams that reject the `developer` role newer codex clients send (#552). Applied to the final forwarded `openai`/`responses` body — client-sent roles and bili's own injected prompt alike — and to every body the compress-retry loops re-send. Wins per key over the global `compat` block (see [Server Settings](#server-settings)). `dropFields` deletes client-fixed fields that strict-schema upstreams reject (#1757): dot-path plain-object paths (no wildcards/indices), merged **additively** with the global list (a provider can add paths but never retract a global one); structural deletion only — string values untouched, nonexistent paths skipped, byte-for-byte forward when nothing matches. Canonical case — SenseNova's Responses gateway 400s on pi-ai's fixed `reasoning.summary: "auto"`:

  ```jsonc
  {
    "providers": {
      "https://token.sensenova.cn/v1": {
        "compat": { "dropFields": ["reasoning.summary"] }
      }
    }
  }
  ```

### `passthrough`

- **Type:** `boolean`
- **Default:** *(none — compression active)*
- **Status:** ACTIVE
- **Description:** Per-route override of the global [`passthrough`](#passthrough) setting. When `true`, every request matching this route is forwarded **byte-for-byte**: no kernel round-trip (no message re-serialization, no ACP render tags, no `prompt_cache_key` removal), the response is piped through untouched, and no session state is created for that route. Use this for upstreams whose anti-fraud fingerprinting rejects bili's rewritten bodies — e.g. ZCode's `405 / 3012` ("request has been blocked due to unusual activity") on the kernel-rebuilt `messages` body (#661). A `mitm://` key targets only the MITM (login-client) traffic of that host, while a plain `https://` key targets only `/bili/` (API-key) traffic — the two schemes never overlap:

  ```jsonc
  {
    "providers": {
      "mitm://zcode.z.ai": { "passthrough": true }
    }
  }
  ```

### `direct`

- **Type:** `boolean`
- **Default:** *(none — the route rides bili)*
- **Status:** ACTIVE
- **Description:** Client-side routing exemption (#1622): when `true`, this upstream is never pointed through bili **on the client side**. Store-rewriting native lanes (ZCode today) skip matching provider-store entries instead of wrapping them, so traffic flows client → upstream untouched — unlike [`passthrough`](#passthrough), which still terminates at the proxy. Matched by the same longest-URL-prefix rule as every other provider field, so any lane can honor it identically. Use it for upstreams that must see the client's real origin (e.g. an account whose request signing derives from the origin) or for providers you simply don't want routed through this machine's bili:

  ```jsonc
  {
    "providers": {
      "https://api.moonshot.cn/v1": { "direct": true }
    }
  }
  ```

### `imageBilling`

- **Type:** `"auto" | "pixels" | "bytes"`
- **Default:** *(global `imageBilling`, then `"auto"`)*
- **Status:** ACTIVE
- **Description:** Per-route override of how inline images are charged by the size gate (#767/#1843). Set `"bytes"` for byte-counting relays — under byte billing, a stale over-window baseline plus large base64 screenshots fails preflight with 502 forever even though the images bill only a few thousand tokens upstream; that is exactly why `"bytes"` is now an explicit opt-in rather than the default for unknown hosts. When unset at both levels, billing resolves to `"pixels"` for every host (#1843: the pixel prior — ~1k–3k tokens per screenshot — is the right order of magnitude for all vision encoders, while the old bytes default was off by up to 15× on non-OpenAI upstreams). The `BILI_IMAGE_BILLING` env var overrides both config levels:

  ```jsonc
  {
    "providers": {
      "https://relay.example.com/v1": { "imageBilling": "bytes" }
    }
  }
  ```

### `imageTokenCap`

- **Type:** positive integer (tokens per image)
- **Default:** *(global `imageTokenCap`, then unset — no cap)*
- **Status:** ACTIVE
- **Description:** Per-route ceiling on the per-image token estimate (#1843), applied on top of whichever billing mode resolved for this route. Wins over the global `imageTokenCap`; the `BILI_IMAGE_TOKEN_CAP` env var wins over both. Non-numeric or non-positive values are dropped (lenient parse, same as `imageBilling`).

---

## Compression Tuning

Compression behaviour is controlled by the `compress` block, which can appear at three levels. They merge **per-field, deepest wins**: a field set at a deeper level overrides the same field higher up, but an *unset* field at a deeper level never clears a value set higher up. In other words, the child covers the parent field-by-field — it never replaces the whole object.

### Shared external summary service

The optional `compress.externalSummary` block sends compression summaries to one or more separately configured models. It lives at all three `compress` levels like every other field, with whole-chain semantics: a chain set at a deeper level (provider or model) **replaces** the entire chain above it — there is no per-target or per-budget sub-merge, exactly like `tiers`. It is disabled unless `enabled` is `true`; when enabled, targets are tried in order and a failed or unusable target falls through to the next one. The main request provider, model, and authorization are never reused for these calls. This feature changes the compression tool contract so `summary` is an optional non-authoritative hint; the proxy keeps the original messages recoverable and commits only a validated returned summary. Because the conversation model no longer writes the committed summary, its injected compress prompt drops the summary-writing rules (`HOW TO COMPRESS`, `KEEP VERBATIM`, `DROP`, `PRIORITY`) and the per-summary length budget while the chain is enabled; the summary requests themselves still carry the full rules (#4460).

Targets are **references into the `providers` table**: each entry is the string `"provider/model"`, where `provider` is a *named provider recipe* (a non-URL `providers` entry carrying dial fields) and `model` is a key of its `models` map. The endpoint, protocol, and credential are derived from the recipe — no URLs are repeated per target:

```json
{
  "providers": {
    "glm": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "api": "openai",
      "apiKeyEnv": "GLM_API_KEY",
      "models": { "glm-4.9-flash": { "outputTokens": 4096 } }
    },
    "claude": {
      "baseUrl": "https://api.anthropic.com",
      "api": "anthropic",
      "credentialRef": "primary",
      "models": { "claude-haiku-4.5": {} }
    }
  },
  "compress": {
    "externalSummary": {
      "enabled": true,
      "targets": ["glm/glm-4.9-flash", "claude/claude-haiku-4.5"],
      "budget": { "totalTimeoutMs": 50000, "targetTimeoutMs": 25000, "maxSummaryBytes": 65536 },
      "concurrency": 8,
      "autoFold": true,
      "autoFoldTargetTokens": 40000
    }
  }
}
```

A recipe carries: `baseUrl` (HTTPS; loopback HTTP allowed for local development; no embedded credentials, proxy-recursion paths, or arbitrary query parameters), `api` (one of `openai` | `anthropic` | `responses` | `google`; selects the wire protocol and derives the request path from `baseUrl`), exactly one credential reference — `apiKeyEnv: "VAR_NAME"` (an environment variable read at call time) or `credentialRef: "NAME"` (a value stored via the Web UI) — and a `models` map whose per-model fields are `contextWindow` (default 128000), `outputTokens` (default `min(8192, window/4)`), and `stream` (default false). Recipes can also be split into `recipe`/`bind` routing form like URL entries; a named entry is routing-inert unless bound.

Up to 16 targets per chain are supported. Saving an enabled chain through the Web API validates that every reference resolves (unknown provider or model → HTTP 400). At runtime an unresolvable reference is logged once and disables the chain until fixed — it never falls back to summarizing with the main model. `secret:` values are stored separately from the main JSON configuration in the private `billion-context.json.summary-credentials.json` file and are never returned by the configuration API. On Windows, protect this file and its parent directory with an administrator-only ACL; stale `.lock` files require manual removal after confirming no proxy process is writing the store. The total budget is shared across all targets and compression entry points, and cancellation or session-state changes discard generated results without folding. The agent-side plugin bridge (dsh / pi / opencode / codex MCP) sizes each `compress` call's HTTP wait to `totalTimeoutMs` plus a small overhead margin — learned from the proxy at bootstrap — so raising this budget no longer caps long folds at a hidden 60-second client-side timeout (#2652).

`concurrency` (integer `1..32`, default `4`) sizes the **process-wide summary queue**: every external-summary call on this host — preflight auto-folds for *all* sessions plus every model-initiated `compress` call — shares one pool of in-flight requests. Raise it when your summarizer has headroom (local relay, self-hosted model, high-quota flash endpoint); keep the conservative default on a small provider quota. A chain's value resizes the shared pool only while that chain's work is in flight; if several chains with different values run concurrently, the pool grows to the largest demand and returns to the base size once those batches settle — one session can never permanently resize the pool for everyone else. Note the knob is **grow-only**: one session raising the pool must not throttle another's in-flight work, so values below the default (`1..3`) are accepted for validation but never shrink the pool below `4` — do not set a low value expecting quota protection; configure the chain's own `budget`/`targetTimeoutMs` instead.

Interaction with the budget: the achievable fold rate of a batch is bounded by how many calls fit in the pool (`concurrency`) and how long each may take (`targetTimeoutMs`) — the budget alone does not control the outcome. A saturated pool does not surface as a visible error: a batch still queued when its total deadline expires is discarded as `batch=deadline` with no attempts recorded (`attempts=[]`), and the fold pass stops there instead of queueing further rounds behind the congestion. For auto-fold this is treated as transient scheduler congestion, **not** a chain failure: no 10-minute backoff arms, and the next turn retries into the (hopefully drained) pool. If you see those lines while direct calls to your target succeed quickly, the pool — not the timeout — is the binding constraint.

Deadline semantics (#4833): `targetTimeoutMs` caps every single dispatch — one slow call cannot spend the whole `totalTimeoutMs`, even on a one-target chain (each target in the fall-through order gets its own fresh `targetTimeoutMs` window, all drawn from the shared total). When a deadline expires the in-flight attempt is aborted and **not retried**: the bounded retry loop (`attempt 1/3`) re-dispatches only transient provider verdicts (429/5xx/risk-control body markers) and fail-fast network deaths; a deadline abort ends the attempt immediately. Failure logging names which clock expired: the per-attempt warn line carries the source — `target-timeout`, `batch-deadline`, or `client-abort` for a genuine downstream cancellation — plus safe diagnostics (elapsed time, the budgets in force, wire protocol/stream mode, payload byte size, an input token estimate, and the output character cap), and the `completed N/M range(s)` line records each attempt's detail (`attempts=[t0:timeout (target-timeout 25000ms (elapsed 25002ms))]`); the same diagnostics ride the tool result when a `compress` call fails wholesale. Sizing for large-context workloads: a non-streaming summary pays its full generation latency before any byte arrives, so `targetTimeoutMs` must cover input processing plus complete summary generation at your largest expected input — several hundred thousand tokens routinely exceeds the 25 s default on slower endpoints. If you see `target-timeout` on big folds, raise `targetTimeoutMs` (and keep `totalTimeoutMs` large enough for the fall-through depth you expect) rather than disabling the chain.

Two optional knobs turn the chain into a **proxy-driven auto-folder** (`autoFold`): with `"autoFold": true` the proxy stops waiting for the model to call the compression tool at all — the same zero-model folding engine that guards the overflow window also folds the conversation down to `autoFoldTargetTokens` (default: half the model window) *before* forwarding, using the external chain and kernel-chosen ranges. The model never sees a nudge and never spends thinking tokens drafting compression plans. The knob rides whole-chain replace semantics like the rest of the block; it only takes effect while the chain itself is enabled — setting either knob on a disabled (or omitted-`enabled`) chain has no effect and is logged once as a warning rather than failing silently. `autoFoldTargetTokens` must be an integer in `[8192, 10000000]`. Failure is fail-open: if the chain errors at fold time, the request forwards as-is, a 10-minute backoff suppresses auto-folding, and classic advisory nudges return for that window. One exception (#2662): a zero-progress fold caused purely by queue drops — batches submitted but no summary call ever dispatched because the shared pool is saturated — does not arm the backoff, since that is scheduler congestion rather than a chain failure; auto-fold simply retries on the next turn.

Auto-fold growth triggers are benefit-gated (#3444), not bare threshold crossings: a growth fold arms only when the text channel exceeds the effective target budget by at least **4096 tokens** — payloads sitting at (or barely past) the target forward as-is instead of burning a full external-summary round trip to save less than its fixed cost. The same gate applies post-fold: a growth fold that ends up saving fewer than 4096 tokens arms the 10-minute backoff exactly like a zero-progress pass. Image-dominant payloads are exempt (images are not foldable, so their overage is never "expected benefit"), and classic overflow folding is untouched — there, firing is mandatory. Additionally, the effective target has a **measured floor**: when the session's irreducible baseline (system prompt + tool definitions + live tail) is larger than the configured `autoFoldTargetTokens`, the target is raised to that measured size and a warning names the real number — an unreachable target would otherwise re-arm a futile fold on every request. The floor never lifts the target above the model window.

#### Agent-reported providers (fallback layer)

An ACP-native agent (currently the `pi` extension) reports its own configured providers to the proxy once per process (`POST /__bili/agent-providers`): provider name, base URL, wire protocol, resolved API key, and model list. These recipes form a **fallback layer** — a chain may reference `"zhipu/glm-5"` without the dial fields being duplicated in the file, so a provider configured once in the agent's own config is directly usable as a summary target. Merge order is **file wins**: a file recipe with the same name shadows the agent's contribution for that provider entirely (including its models). The agent layer never persists to disk: keys live only in proxy process memory, are never returned by the configuration API, and never appear in logs. Skip rules on the reporting side: OAuth-authenticated providers, `auth.json` ("stored") credentials, providers whose endpoint points back at the proxy itself, and wire protocols without a summary dial (`bedrock`, `vertex`, `mistral`, `pi-messages`) are not reported; plain-HTTP non-loopback baseUrls are not sent either (the server would refuse them — the inline apiKey must not travel over plaintext, #2585). Intake is per-entry: a refused entry is logged and named in the response's `skipped` list instead of discarding the whole report — the remaining entries register normally. The Web UI marks agent-reported models with an `(agent)` badge in the target dropdown.

The three levels, from broadest to most specific:

1. **Global** — a top-level `"compress": { … }` key. Applies to every request. This is the only level where the `injectTool` / `injectNudge` toggles are honoured.
2. **Per-provider** — a `"compress": { … }` block inside a `providers[url]` entry.
3. **Per-model** — a `"compress": { … }` block inside a `providers[url].models[model]` entry.

For each request, the proxy resolves the settings by longest-URL-prefix match (to find the provider) and the request's model name (to find the model entry), then merges global → provider → model.

### CompressSettings fields

#### `modelContextLimit`

- **Type:** `number | string`
- **Default:** *(the model's native window)*
- **Status:** ACTIVE
- **Description:** The context window size, in tokens. This is the **denominator** the engine uses for its usage ratio (`usage = tokens / modelContextLimit`) — it is **not** a truncation cap. Accepts an absolute number (`200000`) or a percent string (`"80%"` = 80% of the model's native window, resolved from the built-in table or models.dev registry). When omitted at every level, the native window is used. This is the highest-priority source for the model limit; it overrides the built-in table, the legacy per-model `context` field, and the top-level `modelContextLimit`. Note it also serves as the **hard preflight wall**: once a payload reaches this value the proxy proactively folds context before forwarding, and if folding cannot bring it under, the request fails fast instead of being sent upstream. To keep day-to-day context small while still letting large reads burst up to the native window, keep `modelContextLimit` at its native value and use `maxContextLimit` as the soft target instead (see [Soft target with elastic headroom](#soft-target-with-elastic-headroom-1122)).
- **Overflow-arm behavior (#3450).** When upstream rejects a payload with a stated-window error, the proxy arms that rejection for the retry: if the window declared here differs from the one upstream states, it logs a one-time warning naming both values and folds against the smaller of the two; if the error body also states token counts (e.g. `you requested N tokens (M in the messages, K in the completion)`), `M` is booked as the measured payload size (a ceiling is not a size) and `K` is subtracted from this wall for fit judgments while the arm lives — upstream proved it bills the completion share against the same budget. The next real usage report retires the arm and the reservation together. If your declaration is wrong, set this key to the true window: the warning goes away and the fold target follows.

#### `outputHeadroomMaxPct`

- **Type:** `number | string`
- **Default:** `0.25`
- **Status:** ACTIVE
- **Description:** Cap on the output-headroom reservation, as a fraction of the context window: reserved amount = `min(max_tokens, pct × window)`. **Budget source:** when the request carries no output-budget field at all (`max_tokens` / `max_completion_tokens` / `max_output_tokens`) — e.g. Codex's native Responses path sends no `max_output_tokens` (#924) — the proxy falls back to the model's declared max output: the per-route `providers[url].models[model].output` configuration first, then the models.dev registry output ceiling (bundled snapshot as offline floor); if neither exists, no reservation is made. The same cap applies to the fallback value. The reservation keeps the engine's nudge/truncate bands below `window − reserved`, so long replies can't push "input + output" past the window — it applies to APIs that count output against the window (Anthropic Messages is exempt: its input limit is enforced independently of `max_tokens`, so it is excluded). Without a cap, models whose registered max output takes a large share of the window (e.g. `maxTokens` 131072 on a 262144 window) lose most of their input budget and the 75% force-compress threshold fires at about a third of the full window. The `0.25` default bounds that loss while still guaranteeing no overflow at the 95% emergency threshold for any single-turn reply up to 25% of the window; longer replies overflow once and are recovered by the next turn's overflow self-heal. Note the cap only relaxes oversized reservations: when `max_tokens` is already ≤ `pct × window`, the reservation stays the full `max_tokens` (byte-identical to the legacy behavior). Accepts a ratio (`0.25`) or percent string (`"25%"`); set `0` to disable the reservation entirely; `>= 1` restores the legacy full-capability reservation (input + a full-budget reply always fits — what strict backends like SGLang/vLLM enforce). Negative or unparseable values reject the whole `compress` block. Example: 262144-token window, `max_tokens = 131072` → default `0.25` reserves 65536 → effective window 196608 (legacy full reservation: 131072); `max_tokens = 65536` → reserves 65536 → 196608 unchanged (65536 ≤ 25% of the window). Aligned with billion-context-pi (`#207`) via #896.

#### `maxContextLimit`

- **Type:** `number | string`
- **Default:** `"75%"`
- **Status:** ACTIVE
- **Description:** Context-usage threshold that triggers **forced compression** nudges. Once usage crosses this ratio, the engine fires a nudge that bypasses the growth-gate and cadence checks. Accepts a ratio (`0.75`) or a percent string (`"75%"`). Lower values compress earlier. Maps to the kernel field `nudge.maxContextLimitPct`.

#### `emergencyThresholdPercent`

- **Type:** `number | string`
- **Default:** `"95%"`
- **Status:** ACTIVE
- **Description:** Context-usage threshold that triggers **emergency truncation** of large tool outputs. Accepts a ratio or a percent string. Must be greater than or equal to `maxContextLimit`. Maps to the kernel fields `nudge.emergencyThresholdPct` and `truncate.threshold`.

#### `nudgeGrowthTokens`

- **Type:** `number`
- **Default:** `50000`
- **Status:** ACTIVE
- **Description:** Token-growth step for soft compression nudges. A nudge fires roughly every time this many tokens become compressible. Lower values produce more frequent nudges. Maps to the kernel fields `nudge.growthFloor` and `nudge.growthCap` (it flattens the engine's adaptive band to this fixed step). **Keep this proportional to your smallest model window:** the T1 mass trigger needs one full step of compressible content, so a step larger than the window (e.g. `1500000` against a ~1M window) makes the mass trigger unreachable for that entire window — usage-percentage pressure bands and preflight remain as backstops, but incremental folding goes silent and an over-window request (typical after a mid-session fork onto a smaller-window model) falls straight into the multi-round preflight summarization marathon instead of folding early.

#### `minPressureBenefitTokens`

- **Type:** `number` (tokens, ≥ 0)
- **Default:** *(unset — kernel default `max(5000, context limit × 1%)`)*
- **Status:** ACTIVE
- **Description:** Minimum reclaimable token mass a pressure-band nudge (usage already ≥ `maxContextLimit`) must have before it fires. The pressure band bypasses growth-gate + cadence by design, so on a route whose decision meter runs inflated (k̂ amplification, #3211) even a few thousand tokens of pending triggers another fold — each recovering just enough to dip below the band, then immediately re-entering it: high-frequency small-yield churn ("fold a little each time we hit the line"). Raising this floor (e.g. `50000` against a ~200k window) suppresses sub-floor pressure nudges (they log as suppressed; `truncate.threshold` remains the safety valve) until growth accumulates ONE batch big enough to push usage out of the band — the rhythm honest routes get from the growth gate for free. An explicit `0` restores the legacy any-pending behavior. Merged per field across global → provider → model like every other compress field. Maps to the kernel field `nudge.minPressureBenefitTokens`.

#### `requireUsageSampleForPressure`

- **Type:** `boolean`
- **Default:** `true` (kernel default)
- **Status:** ACTIVE
- **Description:** Phantom-pressure guard for the nudge metering path. When a turn is aborted or the upstream's sample-delivery window lapses before the usage report arrives (short-TTL cache regimes), the effective counter cannot rest on a billed reading and falls back to a local char-bound ESTIMATE that structurally runs several times higher than what will actually be billed. On such a reading the pressure band (usage ≥ `maxContextLimit`) historically fired EMERGENCY/OVER-LIMIT injections immediately — destructive rewrites keyed to a bad meter plus a burned prefix cache. With the guard ON, a pressure-band nudge met on an estimate reading is deferred ONE round: the very next request carries a fresh billing report (or a provenance-stable anchor) and decides from the real number, so the deferral costs almost nothing. Hard overflow backstops (`truncate.threshold`, preflight output clamps) stay armed regardless. Billed readings ("usage") and hosts that omit the source marker keep byte-identical behavior; non-pressure tiers (growth / cadence / first-sight mass) ignore the marker entirely. Set `false` to restore the legacy estimate-driven pressure injection. Merged per field across global → provider → model like every other compress field. Maps to the kernel field `nudge.requireUsageSampleForPressure`.

#### `tierNudgeTokens`

- **Type:** `object` — `{ "t1"?: number, "t2"?: number, "t3"?: number }` (each value in tokens, ≥ 1)
- **Default:** *(unset — every tier uses its derived value)*
- **Status:** ACTIVE (requires acp-kernel >= 0.0.108)
- **Description:** Per-tier token-mass trigger thresholds for the T1/T2/T3 compression paths (#2376). By default all three tiers derive from `nudgeGrowthTokens` (T1 = the step, T2/T3 = step × 1.5); this field pins each tier independently — e.g. keep T1 aggressive for long tasks while letting T2 distill earlier or later. Each UNSET sub-field falls back to that tier's derived default, so an absent or empty object is fully backward compatible with the unified value. Only the token-mass trigger comparisons change: count triggers (`tiers.tier2Trigger` / `tiers.tier3Trigger`), the cadence floor, the first-sight mass bypass and pressure/emergency routing keep their existing bases. Merged PER SUB-FIELD across global → provider → model (a model-level `t2` does not discard a provider-level `t1`). Maps to the kernel field `nudge.tierGrowthTokens`.
#### `nudgeModelDecided`

- **Type:** `boolean`
- **Default:** *(off unless set)*
- **Status:** ACTIVE (#2228)
- **Description:** Model-decided compression timing. When enabled, an armed **tier-1** nudge (gentle growth or over-limit) does not inject its advisory text immediately. Instead bili sends one short **side call** over the session's already-cached prefix (same system/tools/messages prefix, tiny output budget, 15 s idle timeout) asking the model — given the current task — whether compressing NOW is net-beneficial, optionally which span to fold and a short topic. The answer must be strict JSON (`{"compress": true|false, "range": "mNNNNN-mNNNNN"?, "topic": "?"}`); any other output is treated as a failure. On a valid "yes", bili injects an explicit compress directive naming a program-finalized span — the proposed range is honored only when it is fully contained in a live compressible range, otherwise the largest live range is used. On "no", a malformed answer, or a timeout, nothing is injected this round. After **3 consecutive hard failures** the next arm falls back to the legacy advisory once and the counter resets (self-healing ladder). **EMERGENCY** arms and **tier-2/3 distillation** never go through the decision and keep the legacy advisory byte-for-byte. Host-only field — not passed to the kernel. Off by default.

#### `nudgeDecisionMaxTokens`

- **Type:** `number`
- **Default:** `200`
- **Status:** ACTIVE (#2228)
- **Description:** Output budget, in tokens, of the model-decision side call made when `nudgeModelDecided` is enabled. Must be > 0 (invalid values are rejected at config load).

#### `requireNudge` / `requireRecommendation`

- **Type:** `boolean` (each)
- **Default:** *(off unless set)*
- **Status:** ACTIVE (#5683)
- **Description:** Policy gates for models that compress on their own initiative (field case: qwen 27b calling compress without any prompt). Both are host-only fields — not passed to the kernel — merged PER FIELD across global → provider → model like every other compress field, editable in the web panel's quick-config card or any config level, hot-applied from the next request onward.
  - `requireNudge` (timing gate): a model-initiated compress call is refused unless a compression nudge actually reached the model in the CURRENT TURN — the post-gate delivery fact (`nudgeOutcome === "injected"`), so advisory nudges, model-decided directives and emergency nudges all arm it, while "gated"/"vetoed"/"skipped" rounds never did. The arm persists across loop re-requests within the same turn (one turn may fold several times in response to one nudge) and dies with the next un-nudged turn. The refusal is an error receipt telling the model that unprompted compression is disabled here and to wait for a nudge.
  - `requireRecommendation` (scope gate): every submitted range must stay within what bili currently RECOMMENDS folding — the same live compressible set the nudge text and `acp_status` show (this request's prepare-time offer when present, else a live recompute, with the usual viable + dead-ref + `minCompressRangeChars` filters). Judgment is by COVERAGE, not equality: subdividing a recommended span into smaller chunks passes (bili's own first-sight guidance encourages splitting), and messages already folded into active blocks are exempt so refolds updating an existing block's summary stay legal. A range carrying any other still-live message is refused whole, naming the offending span(s) and pointing at `acp_status`.
  - Exemptions & interactions: bili's OWN overflow backstop folds (preflight / auto-fold — no model call involved) are exempt from both gates, so a gated session never dies of context overflow; availability is unaffected even while the nudge channel itself is suppressed (self-heal D1). Hosts that drive compression through their own mechanisms (e.g. codex's compaction trigger, which is not a bili nudge) fall outside the timing gate's notion of "prompted" — scope these settings to the affected provider/model rather than globally if such lanes share the route. No new environment variables; no behavior change unless a level explicitly enables a flag.

#### `preserveRecentMessages`

- **Type:** `number`
- **Default:** *(kernel default, `3`; tuned from `5` in #3058)*
- **Status:** ACTIVE
- **Description:** Number of most-recent messages that are never offered for compression. Protects the active working set so the model retains the latest turns verbatim. Maps to the kernel field `preserveRecentMessages`.

#### `preserveRecentTokens`

- **Type:** `number`
- **Default:** *(kernel default, typically `5000`)*
- **Status:** ACTIVE
- **Description:** Token budget reserved for recent-message protection. Maps to the kernel field `preserveRecentTokens`.

#### `minCompressRangeChars`

- **Type:** `number`
- **Default:** *(kernel default, typically `5000`)*
- **Status:** ACTIVE
- **Description:** Minimum range size, in **characters** (not tokens), for a message range to be eligible for compression; smaller ranges are skipped. English/code averages ~4 chars per token, CJK ~1-2, so the same number reads ~4× more permissive for English text than a token-based mental model. Maps to the kernel field `compress.minCompressRange`.

#### `minCompressRange`

- **Type:** `number`
- **Status:** DEPRECATED (alias of `minCompressRangeChars`, kept for backward compatibility)
- **Description:** Legacy name for `minCompressRangeChars` — same kernel mapping (`compress.minCompressRange`), same unit (characters). When both keys are set at the same level the canonical name wins; across levels the deeper level wins regardless of which name it uses.

#### `maxSummaryLength`

- **Type:** `number`
- **Default:** *(kernel default `20000`)*
- **Status:** ACTIVE (#3635)
- **Description:** Hard cap, in **characters**, on ONE generated summary. Longer replies are rejected whole — by the kernel's all-or-nothing length check for in-model summaries and by the external-summary executor for configured chains (no truncation, no retry). Both preflight and model-tool compression paths tell external summarizers this exact cap up front (preflight since #1775, the compress path since #3635), so overshoot is a model-compliance failure with a named log reason instead of an opaque discard. `0` disables the cap. Maps to the kernel field `compress.maxSummaryLength`. Before #3635 the key was accepted nowhere: the panel PUT silently dropped it and file edits never reached the resolved config, so the effective value was always the kernel default.

#### `minSummaryLength`

- **Type:** `number`
- **Default:** *(kernel default `50`)*
- **Status:** ACTIVE (#3635)
- **Description:** Floor, in **characters**, for generated summaries; shorter replies are rejected whole. `0` disables the floor. Maps to the kernel field `compress.minSummaryLength`. Same acceptance history as `maxSummaryLength` (#3635).

#### `tiers`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Enable multi-tier compression — tier-2 distillation of old summaries and tier-3 condensation. Set `false` to run in tier-1-only mode (every summary is a flat tier-1 summary). Maps to the kernel field `tiers.enabled`.

#### `protectedLatestTools`

- **Type:** `string[]` (tool-name patterns, e.g. `["todo_list"]`)
- **Default:** `[]` *(none — opt in per client, tool names are client-specific)*
- **Status:** ACTIVE
- **Description:** Tool-name patterns whose **latest** tool-call + paired result are never compressed (kernel `protectedLatestTools`, requires `acp-kernel` >= 0.0.80). Built for cumulative-snapshot tools — e.g. an agent's todo/task list, where every newer result supersedes the older ones: only the newest instance is the source of truth, so protecting **all** instances (via `protectedTools`) would make that tool's history grow unboundedly, while protecting the **latest** keeps the live snapshot in context and lets every superseded instance fold normally. This solves the "agent forgets its task list after compression" failure (#639). Protection is a HARD exclusion: the latest instance is unaddressable (its refs render as `BLOCKED`), so neither suggested nor explicit compress ranges can cover it; it applies identically in both compression modes and on every wire. Patterns match by exact tool name or `*` glob (e.g. `"todo_list"`, `"todo*"`). A pattern containing `/` matches the canonical skill path instead and protects the latest instance PER path (#1947): skill loads project to `skill/<name>` on every client — opencode `skill({name})`, Claude Code/ZCode `Skill({skill})`, and any tool reading `<dir>/<name>/SKILL.md` — so `"skill/*"` keeps the newest load of EVERY skill (one protected instance per name) while `"skill"` without a slash keeps the plain single-latest semantics. Whole-array replace at the deepest defined level. Example: `{ "compress": { "protectedLatestTools": ["todo_list", "skill/*"] } }`.

#### `protectedTools`

- **Type:** `string[]` (tool-name patterns, e.g. `["skill"]`)
- **Default:** `[]` *(none — opt in per client, tool names are client-specific)*
- **Status:** ACTIVE
- **Description:** Tool-name patterns whose tool-calls AND paired results are **never compressed — every instance, full history** (kernel `protectedTools`). Protection is a HARD exclusion: all matching refs render as `BLOCKED`, so neither suggested nor explicit compress ranges can cover any instance; it applies identically in both compression modes and on every wire. Patterns match by exact tool name or `*` glob (e.g. `"skill"`, `"skill_*"`). A pattern containing `/` selects skills by name across all clients (#1947): skill loads project to the canonical path `skill/<name>` — opencode `skill({name})`, Claude Code/ZCode `Skill({skill})`, and any tool reading `<dir>/<name>/SKILL.md` — so `"skill/release-orchestrator"` protects every load of that one skill, `"skill/review-*"` glob-matches within the name segment (`*` never crosses `/`), and `"skill"` / `"skill/*"` remain equivalent (the node plus all descendants). Patterns without `/` are byte-for-byte unchanged. Whole-array replace at the deepest defined level. Example: `{ "compress": { "protectedTools": ["skill/release-orchestrator"] } }`.
- **⚠ When to use which knob (read before configuring):** choose by how a tool's results relate to each other:
  - **Independent content** — each instance carries unique information no later result supersedes (opencode/pi `skill` loads, one-shot references): use `protectedTools`. Folding an old load loses its content permanently; protection keeps every load in context (#1109). Use `skill/<name>` path patterns to protect ONE orchestrator skill's every load while letting lighter skills fold (`protectedTools: ["skill/release-orchestrator"]`, #1947).
  - **Cumulative snapshots** — each newer result supersedes the older ones (a client's todo/task list): use `protectedLatestTools`. Protecting **all** instances of such a tool makes its history grow unboundedly — the exact failure #639 worked around by protecting only the latest.
  - Rule of thumb: low-frequency, high-value tools → `protectedTools`; chatty tools → never full-history protect (context grows without bound); cumulative-snapshot tools → `protectedLatestTools`.

#### `neverPreserveRecentTools`

- **Type:** `string[]` (tool-name patterns)
- **Default:** unset → kernel built-in `["decompress", "search_context", "read", "bash"]` (requires `acp-kernel` >= 0.0.92)
- **Status:** ACTIVE
- **Description:** Tool-name patterns EXCLUDED from the soft-protected recent zone (`preserveRecentMessages`/`preserveRecentTokens`): matching tool results inside the recent window become compressible immediately instead of aging out first. The kernel default keeps `read`/`bash` compressible because they are the largest reclaimable mass — but that same default is what makes batch-read workflows fold freshly-read files right away and descend into the fold→re-read death loop (#1198/#1277). **Recommended remedy: remove only `read`** — `{ "compress": { "neverPreserveRecentTools": ["decompress", "search_context", "bash"] } }` — so fresh read results stay in the recent zone and age out by position later (unlike `protectedLatestTools`, which would pin the newest read forever). Prefer the simpler positive form `preserveRecentTools: ["read"]` when you don't need verbatim-replace semantics — see the next section. Keep `decompress`/`search_context` in the list: re-including them pins just-restored blocks in the recent zone where they become unreclaimable — a different disease. **⚠ Empty array `[]` is VALID and excludes nothing** (max-protection escape hatch) — unlike `protectedTools`/`protectedLatestTools` an empty array is not rejected; an explicit array replaces the default verbatim, whole-array replace at the deepest defined level.

#### `preserveRecentTools`

- **Type:** `string[]` (tool-name patterns)
- **Default:** unset → no subtraction (the `neverPreserveRecentTools` ?? built-in list governs verbatim; requires `acp-kernel` >= 0.0.93)
- **Status:** ACTIVE
- **Description:** The **positive-facing** counterpart of `neverPreserveRecentTools`: tool-name patterns **removed** from the effective recent-zone exclusion list. The #1198/#1277 batch-read fold→re-read remedy becomes a one-entry config — `{ "compress": { "preserveRecentTools": ["read"] } }` — that protects fresh read results without restating (or freezing a stale hand-copy of) the built-in list, and keeps following built-in evolution. Effective exclusion = `(neverPreserveRecentTools ?? built-in) minus preserveRecentTools`; composable with an explicit `neverPreserveRecentTools` (subtraction applies to the explicit list too); glob-suffix patterns subtract matching entries (`"bash*"` removes `bash`). Prefer this knob over editing the never-list unless you genuinely need verbatim-replace semantics. **⚠ Empty array `[]` is rejected** — it is a pure no-op here, so a bare `[]` is almost certainly a typo for `neverPreserveRecentTools: []` (the max-protection escape hatch). Whole-array replace at the deepest defined level, like the sibling knobs.

#### `prompts`
- **Default:** *(kernel defaults — see `acp-kernel` `defaultPrompts`)*
- **Status:** ACTIVE
- **Description:** Override the compression prompt text injected into the system prompt and nudge messages. Every field is **load-bearing**: the kernel rules were tuned over months of production use, and overriding them can degrade summary quality (lost paths / signatures / decisions → broken retrieval). Overrides only take effect when `acknowledgePromptsRisk` resolves to `true` after the three-level merge — the flag resolves independently at its own deepest defined level and gates **all** `prompts` overrides regardless of which level each piece lives at (a global-level flag activates model-level `prompts`); otherwise they are ignored and a one-time warning is logged. Non-string fields are silently dropped (a malformed partial never clobbers a good default). Useful mainly for non-English or small-model tuning — see issue #156.

#### `acknowledgePromptsRisk`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** Must be `true` for `prompts` overrides to take effect. Resolves like every other field (deepest defined level wins) and gates all `prompts` overrides regardless of which level each piece lives at — it does not need to sit in the same block as the `prompts` it unlocks. Setting it acknowledges the summary-quality risk documented above.

#### `promptPack`

- **Type:** `string` (pack name, e.g. `"lean"`)
- **Default:** `default` *(unset is equivalent — identity surface, kernel defaults everywhere)*
- **Status:** ACTIVE
- **Description:** Select a named prompt pack — a curated surface preset covering tool descriptions, compress system-prompt sections, and nudge sections — resolved from the host's pack chain: **project** `./.billion-context/packs/<name>.json` → **user** `<configDir>/packs/<name>.json` → **shipped** (`chat`) → **builtin** (`default`, `lean`). Built-in `lean` swaps the four ACP tool descriptions for one-liners (no snippet/guideline chrome) while keeping the compression rules default. Built-in `chat` (#5319) rewrites only the compress philosophy and how-to-compress prose for long-term companionship / multi-session memory use; every other surface piece stays at the host defaults, and a same-name user or project file overrides it. Unknown names fall back to the identity surface with a one-time warning. Same three-level merge as the other fields; pack-surface sections (tool/section overrides) apply directly, without the `acknowledgePromptsRisk` gate — that gate governs only inline `compress.prompts` rule-text overrides. Note a pack's `prompts` block is ignored by this proxy: rule-text overrides are possible only via inline `compress.prompts`. Requires `acp-kernel` >= 0.0.66. The settings panel can manage the user-dir files directly — New/Edit/Delete for packs under `<configDir>/packs/` (the picker knows each entry's provenance; builtins and shipped packs stay read-only there, override them with a same-named user pack instead). The Edit dialog has three tabs (#5344): **Guided form** — per-field help text plus one-click base text loaded from `default`/`chat`/`lean` (empty fields are omitted and fall back to system defaults at runtime); **AI assist** — describe your scenario in plain words, copy the generated prompt to any LLM, paste its JSON back and it parses straight into the form; **Advanced (JSON)** — raw file text for full control.

**Pack file format.** Each `<dir>/<name>.json` holds one pack object. Unknown fields are dropped by the same sanitizer used on every load path (`sanitizePackSurface`), so extra metadata is harmless:

```json
{
  "name": "my-pack",          // optional — defaults to the file name without .json
  "version": "1.0.0",         // optional — shown by `bili pack list` and the panel
  "description": "…",         // optional
  "promptSections": {
    "philosophy": "…",        // replace a whole system-prompt section; JSON null keeps the default
    "howToCompress": "…"      // start from the tuned texts in src/chat-pack.ts
  }
}
```

Optional surface blocks: `prompts` (inline rule-text overrides), `nudgeSections`, `toolPrompts`, and `adapters` (host-specific extras, e.g. `"pi": { "promptSections": { … } }`). At least one recognized field must survive sanitizing or the file is refused when written.

**Installing other people's packs.** Any npm package whose root contains a `bili-pack.json` (the pack object above) is installable: `bili pack install <pkg>` — also accepts `name@version`, scoped names, git URLs and `.tgz` paths (it delegates to your local `npm`, so registry auth behaves normally). Files land in `<configDir>/packs/` by default (`--project` targets `./.billion-context/packs/`; `--force` replaces an existing pack instead of refusing). Afterwards manage them from the settings panel, or via `bili pack remove <name>` / `bili pack list`.

#### `reconcile`

- **Type:** `string` — `"off"` | `"warn"` | `"repair"`
- **Default:** `"repair"`
- **Status:** ACTIVE
- **Description:** Controls **fold-state reconciliation** (#1921): what happens when a client resends history whose *content* has drifted from what was compressed — e.g. a fork re-serialized earlier turns (#1908), a client rewriting message bytes in place, or a provider normalizing whitespace. By default message identity is a content hash, so a one-byte churn silently drops the affected messages out of every compression block and the raw originals re-enter the wire ("fold drift"). In `"repair"` mode the proxy classifies the drift per message before the fold runs: stable tool-call anchors (`tool_use_id`) and normalized-identity anchors (NFC text, CRLF/whitespace-collapsed) re-anchor compression blocks onto the new message ids, so the fold survives client-side churn byte-for-byte-equivalent to a clean resend; genuinely *edited* messages (normalized text differs, or length drifts beyond `max(256, 25%)`) are left to re-enter the wire unfolded — honest, never a silent rewrite — and the next compression pass re-folds them. `"warn"` runs the same classifier but only logs what it found; `"off"` disables the layer entirely (pre-#1921 behavior). The environment variable `BILI_FOLD_RECONCILE` overrides the configured value for one process. Anchor metadata is persisted per session (`foldAnchors` in the session record, capped at 16384 entries) and covers the messages each block actually references. A one-line `info` is logged when the system prompt changes without any message churn (system-only drift never touches fold state).

#### `absorb`

- **Type:** `object` (`{ enabled?, minToolTokens?, contextThresholdPct?, excludeTools?, toolName? }`)
- **Default:** *(disabled — the feature is off unless you set `enabled: true`)*
- **Status:** ACTIVE
- **Description:** Opt-in **instant tool-result compression** (issue #605, via the `acp-kernel` absorb API). When enabled, large tool results get a forced `[ACP absorb]` instruction at result time; the model distills the result into a compact summary via the `absorb` tool, and the original tool-call/tool-result pair is hidden from the wire from the next turn on — keeping mid-session pressure lower between fold rounds. Sub-fields (merged deepest-wins like every other CompressSettings field):
  - `enabled: boolean` — master switch; anything other than `true` keeps the feature fully off (no tool, no prompt, no markers).
  - `minToolTokens: number` — only results at or above this many tokens are prompted (kernel default 1000).
  - `contextThresholdPct: number|percent-string` — only prompt once usage reaches this fraction of `modelContextLimit` (`0` = size gate alone; `"75%"` is accepted).
  - `excludeTools: string[]` — tool-name patterns never absorbed. **Known limitation:** a no-op on tool *results* until [ranxianglei/acp-kernel#213](https://github.com/ranxianglei/acp-kernel/issues/213) ships (wire projections don't carry `toolName` on results, so the kernel's name guard can't fire).
  - `toolName: string` — rename the injected tool (default `"absorb"`); the advertised/injected schema, the system-prompt section and per-session adjudication all follow the name in both lanes. **Lane governance (#1359):** plugin mode governs the *entire* `absorb` block by the **base** config, so a renamed tool is advertised under that name and executed under it (they can never diverge); provider/model-level `absorb.*` overrides are **proxy-lane-only** (the proxy injects and adjudicates the merged name). A load-time warning lists any provider/model `absorb.*` field whose value diverges from base.
  Injection follows the wire's native-tool surface: proxy mode injects the tool (under the per-request resolved name) + a system-prompt section on the anthropic/openai/responses native-tools wires, plugin mode advertises it in the plugin manifest **only while enabled** (hosts register the manifest's tools verbatim — advertising a disabled tool breaks them, #1192; the MCP shell picks it up for free). Responses **marker/text-protocol** routes are not supported (no native tool surface — the REQUIRED absorb instruction would be unsatisfiable), and title-generation requests (`max_tokens ≤ 200`) skip injection like the compress prompt does. Absorbed pairs stay hidden across restarts (persisted in the session state).

#### `ccr`

- **Type:** `object` (`{ enabled?, minToolTokens?, excludeTools?, toolName?, maxHeadChars? }`)
- **Default:** *(on in proxy mode since v2 (#1179) — unset resolves to `enabled: true`; an explicit `enabled: false` at any level opts out. Plugin lanes stay opt-in: they arm only on an explicit global `enabled: true`, #1271/#1273.)*
- **Status:** ACTIVE (v2 — proxy mode by default; plugin mode on the anthropic + openai wires when explicitly enabled)
- **Description:** **Content-addressed message store** / built-in CCR (issue #1097/#1179, via the `acp-kernel` CCR API, acp-kernel >= 0.0.84). Instead of force-distilling oversized tool results (like `absorb`) or carrying them on the wire forever, the kernel ID-references them at arrival (the ccr-store node runs between prune and absorb within `processTurn` — ID-referencing wins over distillation): the wire keeps a deterministic, byte-stable placeholder (`📦 [acp-stored #m00423 · shell output · 4,213 tok] \`npm run build\`\n   → acp_retrieve("m00423") returns the full text`) and the original goes into the session's content store. The model retrieves the full original on demand via the injected `acp_retrieve` tool; a retrieve is ephemeral (it rides the intra-request tool-result channel, never enters fold space, consumes no message ref). Lossless by default: a retrieve not made costs one cheap tool call; a detail distilled away by absorb is gone for good. Sub-fields (merged deepest-wins like every other CompressSettings field):
   - `enabled: boolean` — master switch. **Defaults to `true`** when unset at every level (#1179); an explicit `false` at any level wins and keeps the feature fully off (no placeholders, no tool). Plugin-mode arming additionally requires an explicit global `true` (#1273) — the manifest only advertises what the operator explicitly enabled.
  - `minToolTokens: number` — only tool results at or above this many tokens are ID-referenced (kernel default `4000`); smaller results stay verbatim.
  - `excludeTools: string[]` — tool-name patterns never stored (glob suffixes allowed; kernel default: none).
  - `toolName: string` — rename the retrieval tool (default `"acp_retrieve"`); declaration, dispatch and the placeholder hint all follow the name. Must stay unique against the client's own tool names.
  - `maxHeadChars: number` — head/command preview length inside the placeholder (kernel default `96`).
  **Plugin-lane governance (#1345):** in plugin mode the whole `ccr` block follows the **base** config — sessions arm only on a base-level `enabled: true` and execute with the base `toolName` and thresholds, because the plugin manifest (the host's only declaration of the retrieve surface) is built from the base config alone. Provider/model-level `ccr.*` overrides therefore apply to proxy-mode sessions only (the proxy declares and dispatches per request under the merged block). Every divergent override is logged at config load as a `[acp-config] ccr override ignored in plugin sessions: …` warning naming the level, field, and the value plugin sessions actually use.
  The store persists as a single envelope file (`.content-store.json`) next to the session JSON, using the same at-rest codec as the session file when `BILI_ENCRYPTION_KEY` is set; entries are deduped by content hash and lazily loaded per session. Only the *content* inside a `tool` result shrinks — pairing with the assistant `tool_calls` is untouched. Scope gates: **opt-in on every lane** (#1207 owner decision — `compress.ccr.enabled: true` at any level after local verification): proxy mode arms once enabled, plus plugin mode on the anthropic + openai wires where the plugin manifest advertises `acp_retrieve` while CCR is explicitly enabled globally (#1271); responses marker/text-protocol routes, `ACP_NO_INJECT_TOOL`, and the responses/google wires in plugin mode have no proven request-only round-trip channel to execute the retrieve, so the store disarms itself there instead of losing content. Since v2 (#1179), folds are lossless too: when a compress fold lands, the covered originals are persisted into the store (first-write-wins, reasoning skipped), so `acp_retrieve("mNNNNN")` works for folded content as well; `decompress` accepts optional `startId`/`endId` message refs to restore just a span of a block (ephemeral injection, same channel as retrieves); `search_context` hits carry the covered ref span (`[m00044–m00097 · N msgs]`) alongside block metadata; and `acp_status` lists the block→ref linkage (`BLOCK SPANS`) plus a separate `range-restored` count on the STORE line. Design decision (#1282): **no cap and no eviction, ever** — the envelope grows with the unique originals held and shares the session's lifecycle; the footprint is visible in `acp_status`. Per-session stats (stored bytes, current wire bytes saved, retrieve rate) surface in `acp_status`; each retrieve logs a `[ccr] retrieve …` line.

#### `search`

- **Type:** `object` (`{ planAware? }`)
- **Default:** *(off — unset resolves to `planAware: false`; the output stays byte-identical to plain lexical search)*
- **Status:** ACTIVE (CCR v3 planning-aware retrieval, #1336 — default off until measured; proxy mode + plugin mode)
- **Description:** Opt-in **planning-aware retrieval** for `search_context` (issue #1336). When enabled, if a query matches more blocks than `limit`, the candidates are re-ranked against the current plan state extracted from the in-context message view: the LAST tool call of each planning tool (built-in patterns `TodoWrite`, `todowrite`, `todo_list`, `update_plan`, `TaskCreate`, `TaskUpdate`, plus every `compress.protectedLatestTools` pattern — same latest-wins semantics as the kernel's snapshot protection) and the most recent user turn. Candidate topics/summaries are scored by weighted term overlap with that state; blocks scoring above zero sort first, ties keep the original lexical order. Two things happen only then: the returned subset can differ from the pure lexical cut, and a `[plan-aware]` steering section is appended with (a) `top fetch targets:` — the covered ref spans of the top-scoring returned blocks, and (b) a hint for any covered ref already retrieved ≥2 times this session, pointing at a one-shot `decompress({blockId, startId, endId})` range restore instead of repeat `acp_retrieve`. When the flag is off, when no plan state is in context, or when the match pool fits inside `limit`, the output is byte-identical to the pre-feature behavior. Ranking touches candidate order only — no store/fold/injection mechanics change, no new persistence, and foreign-session searches (`conversation_id`) stay read-only lexical. Every re-rank logs an `[acp-search-plan] …` line with the per-block scores. Companion stats: whole-block decompresses count up in `acp_status` under a `RETRIEVAL QUALITY` line (total, plus how many had a cheaper precise path available — i.e. the block carried a ref span and CCR was armed), so the retrieve-vs-decompress trade can be measured before/after enabling. Sub-fields (merged deepest-wins like every other CompressSettings field):
  - `planAware: boolean` — master switch; anything other than `true` keeps the feature fully off.

#### `rules`

- **Type:** `boolean`
- **Default:** `false`
- **Status:** ACTIVE
- **Description:** **Persistent model reminders** (issue [ranxianglei/billion-context-pi#433](https://github.com/ranxianglei/billion-context-pi/issues/433), via the `acp-kernel` rules API), **off by default** — set `compress.rules: true` to enable it (the #1399 decision: once enabled the model has full rights over session rules and may call it unprompted, including delete/clear). When enabled, an `acp_rule` tool is injected alongside the ACP tools: calling it with a short `rule` argument records a principle-level reminder that is **hard-protected** from compression (the call + result stay in context across every fold), and omitting the argument lists the recorded rules. Passing `delete` with a rule id (e.g. `"rule3"`) removes that one rule (`Removed ruleN: <text>`); passing `clear: true` removes every rule. The two are mutually exclusive with each other and with `rule` — one operation per call — so a stale or accidentally-recorded rule can be deleted instead of hedged with a counter-rule. Guidance on *when* to record (user-emphasized lessons, behaviors the user asks to remember, major pitfalls hit) lives entirely in the tool description — nothing is added to the system prompt. Kernel limits apply (50 rules × 300 chars each); duplicate text is rejected pointing at the existing id. Injection follows the wire's native-tool surface exactly like `absorb`: proxy mode injects the tool on the anthropic/openai/responses native-tools wires, plugin mode advertises it in the plugin manifest **only while enabled** (hosts register the manifest's tools verbatim — advertising a disabled tool breaks them, #1192; execution gated per session). Recorded rules persist across restarts in the session state; removals persist the same way. Requires `acp-kernel` >= 0.0.70 (>= 0.0.84 for delete/clear). Humans get the full operation set without going through the model: pi/omp expose a native `/acp-rule` command with the same semantics as the tool — bare `/acp-rule` lists every recorded rule, `/acp-rule <text>` records one directly, `/acp-rule remove <id>` deletes one, and bare `/acp-rule clear` wipes all recorded rules (`clear <text>` records instead of wiping) (#1251; remove/clear added in #1399).

#### `reasoning`

- **Type:** `object` (`{ drop?, threshold? }`)
- **Default:** `drop: true`, `threshold: 2048` — on
- **Status:** ACTIVE
- **Description:** **Compress-reasoning hygiene** (issue #651, the proxy-side twin of `billion-context-pi` #339/#348 / `opencode-acp` #377). Models that keep their `reasoning`/`thinking` traces on the wire accumulate a permanent uncompressible floor: the anchor of a fold is a `compress` call, and any reasoning messages sitting *before* that call survive every fold as part of the protected prefix — they can never be re-summarized, only stripped. In the storm sessions this floor reached ~50% of the visible context. When on, the proxy removes the reasoning run that immediately precedes a **closed** `compress` call — closed on **round evidence**: the call's tool result (`contentType: "tool-result"`, matching `toolCallId`) has arrived at a later index and at least one message exists after it. No user message is required, so long agentic sessions close rounds too [#348 twin]. Safety gates: the *in-flight* round (result missing, or result still the last message) is never touched; runs of ordinary tool calls (`read`, `bash`, …) keep their reasoning; a run is judged by its summed length so a 2×1200-char run still trips a 2048 gate; non-contiguous reasoning (text between the fragments) is left alone. Sub-fields (merged deepest-wins like every other CompressSettings field):
  - `drop: boolean` — kill-switch; `false` restores the old wire verbatim. Required per-provider for thinking models that mandate `reasoning` round-trip while the request carries `tools` — DeepSeek, GLM thinking and Qwen-QwQ return HTTP 400 when a prior `reasoning_content` is not echoed back. Since #684 this is largely automatic: `deepseek` upstreams **and requests whose body `model` id matches `/deepseek/i`** (#1027 — DeepSeek models served from non-deepseek gateways) are detected statically, on the **Anthropic wire** any request whose history carries a **signed thinking block** disables the drop per-request (#1658 — signed thinking must round-trip with its `tool_use` sibling or the upstream rejects the pair, so dropping it would orphan the pair; sessions without extended thinking are unaffected), and ANY upstream that 400s with a body mentioning `reasoning_content` still teaches the session to keep reasoning (self-healing, session-scoped; the ops log carries `[acp-loop] learned strictReasoningEcho`). The config remains the manual escape hatch for other strict-reasoning upstreams:
    ```jsonc
    "providers": { "https://api.deepseek.com": { "compress": { "reasoning": { "drop": false } } } }
    ```
  - `threshold: number` — character gate; runs **strictly greater** than this are dropped (`0` = drop any non-empty run). Invalid values fall back to the default instead of throwing.

#### `reasoningGuard`

- **Type:** `object` (`{ enabled?, maxContinue?, maxTierN?, markerText?, base?, offset?, debugLog? }`)
- **Default:** *(disabled — off unless you set `enabled: true` at some level)*
- **Status:** ACTIVE
- **Description:** Opt-in guard against gpt-5.x/gpt-6.x **"lattice" reasoning truncation** (issue #739; upstream [openai/codex#30364](https://github.com/openai/codex/issues/30364)). These models intermittently stop at exactly `base*n + offset` reasoning tokens (default `518n−2` → 516, 1034, 1552, …) mid-thought, then answer from a half-finished thought. When an in-scope terminal round hits the lattice **and** carries an `encrypted_content` blob, bili buffers the response, re-sends it replaying its own reasoning plus a continue nudge (up to `maxContinue` continuation rounds), and folds everything into ONE response whose usage is the true summed total. Reasoning streams live to the client during the fold (no full buffering); only the final clean round's non-reasoning output is passed through. Applies to Responses/SSE streaming requests only (bili is SSE-only); compress-injected turns are exempt (the loop owns those). Sub-fields (merged deepest-wins like every other CompressSettings field):
  - `enabled: boolean` — master switch; anything other than `true` keeps the guard fully off. Scope is set by **where** this block sits in the three-level tree (global / provider / model) — there is no separate model list. The strict signature (exact lattice hit + `encrypted_content` + no tool calls) limits which rounds actually trigger recovery.
  - `maxContinue: number` — max continuation rounds after the initial round (default `3`).
  - `maxTierN: number` — highest lattice tier `n` allowed to continue (default `6`); `0` = unlimited. Raise for rare deep-tier truncations (e.g. an `n=11` hit observed on gpt-6-astra).
  - `markerText: string` — nudge text appended as a commentary message each continued round (default `"Continue thinking..."`).
  - `base: number` / `offset: number` — the lattice signature `tokens == base*n + offset` (defaults `518` / `-2`). Override if another model family truncates on a different lattice.
  - `debugLog: boolean` — verbose per-round logging (default `false`).
   ```jsonc
   // enable globally
   { "compress": { "reasoningGuard": { "enabled": true } } }
    // tune per provider (placement scopes it to that provider's traffic)
    { "providers": { "https://your-relay.example": { "compress": { "reasoningGuard": { "enabled": true, "maxContinue": 2 } } } } }
   ```

#### `priceProfile`

- **Type:** `object` (`{ w?, r?, q? }`, all non-negative numbers)
- **Default:** *(unset — reports then price folds from the request model's models.dev price row in absolute $/Mtok; only models the registry cannot resolve fall back to the kernel's built-in relative ratios `{ w: 1, r: 0.1, q: 4 }`)*
- **Status:** ACTIVE
- **Description:** Price profile for the **cache-economics verdicts** in the session cache report (`acp_cache` tool / `/acp-cache` command / `GET /__bili/cache-report`, #800/#1279). The per-fold P&L fields (`oneTimeCostUnits`, `perTurnSavingUnits`, `breakevenTurns`, `paidBack`) are computed from three multipliers over the input-token unit: `w` (cache-write cost), `r` (cache-read cost), `q` (output cost). Two unit conventions coexist, both printed verbatim in the report header (`FOLD ECONOMICS (N folds @ w=.. r=.. q=..)`):
  - **User config** uses **ratios normalized to the input price (p_in = 1)**: `w` = cacheWrite ÷ input, `r` = cacheRead ÷ input, `q` = output ÷ input. Sub-fields merge deepest-wins across the three levels like every other CompressSettings field (set `q` at provider level, refine one field at model level); fields left unset within a partial profile fall back to the kernel ratios `w: 1`, `r: 0.1`, `q: 4`.
  - **Registry default** (no level sets the key): derived from the request model's models.dev price row — **absolute $/Mtok**, `w = cost.input`, `r = cost.cache_read ?? 0.1 × input`, `q = cost.output ?? 1.5 × input` (convention fallbacks for rows without those fields). Direct-to-provider traffic gets that host's own listing; unknown relays get the first matching listing across hosts (with a one-time warning when listings conflict). Live registry wins when reachable, bundled snapshot is the offline floor (#282).
  User config wins wholesale — a profile set at any level is never mixed field-by-field with the registry row. The last request's effective value is stamped onto the session, so every report face prices folds with the profile that governed that session's most recent turn. **Report-only**: the profile never affects compression triggers, cadence, or any wire behavior. User-config examples (override the registry row, e.g. for relays with custom markup):
  ```jsonc
  // DeepSeek-V3 ≈ low output multiple
  { "providers": { "https://api.deepseek.com": { "compress": { "priceProfile": { "w": 1, "r": 0.1, "q": 1.5 } } } } }
  // OpenAI GPT-4o/o-series: 50% cached-read discount, flat writes, 4× output
  { "providers": { "https://api.openai.com": { "compress": { "priceProfile": { "w": 1, "r": 0.5, "q": 4 } } } } }
  // Self-hosted / free tier: everything costs zero tokens of your budget
  { "compress": { "priceProfile": { "w": 0, "r": 0, "q": 0 } } }
  ```
  Use list prices relative to the same model's normal input price; relays with custom markup should use their effective rates.

#### `outputSteering`

- **Type:** `object` (`{ enabled?, verbosityLevel?, effortRouting? }`)
- **Default:** *(disabled — off unless you set `enabled: true` at some level)*
- **Status:** ACTIVE
- **Description:** Opt-in **output-side compression** (issue #1093): two request-time levers that cut *output* tokens, which cost more than input and are billed the instant they stream. The decision logic (turn classification, L0–L4 directive wording, effort clamp) lives in acp-kernel and is shared with the agent side; bili only lands it on the wire, after every other body mutation:
  - **Verbosity steering** — a deterministic conciseness directive appended to the **tail** of the system prompt (never prepended — that would shift the client's prompt bytes and bust the prefix cache). Sentinel-wrapped and idempotent: retries never accumulate it and a level change replaces it in place. Note the wording is byte-stable across releases (a kernel wording edit is a prefix-cache bust for every session at that level).
  - **Effort routing** — classify the last user turn structurally (block composition only, no content pattern-matching); on a *mechanical continuation* (clean tool result, no error, no fresh user signal) an already-present effort field is clamped toward its minimum. Clamp-only: never injects a field the client did not send (models without effort support 400 on it), never toggles `thinking.type`, never raises `minimal`. Wires: OpenAI `reasoning_effort`, Responses `reasoning.effort`, Anthropic `thinking.budget_tokens` (floor 1024), Gemini `generationConfig.thinkingConfig.thinkingBudget` (floor 128; `-1` dynamic untouched).
  - Sub-fields (merged deepest-wins like every other CompressSettings field): `enabled: boolean` master switch; `verbosityLevel: number` 0–4 (0 = no directive, default 2); `effortRouting: boolean` (default on whenever `enabled` is). Out-of-range values fall back to defaults **with a warning** instead of rejecting the block. Applies to all four wires (openai chat / responses / anthropic / google); requests with no system carrier are left untouched (skip-if-absent).
  ```jsonc
  // enable globally
  { "compress": { "outputSteering": { "enabled": true } } }
  // only lower effort, no wording directive
  { "compress": { "outputSteering": { "enabled": true, "verbosityLevel": 0 } } }
  // per provider (placement scopes it to that provider's traffic)
  { "providers": { "https://your-relay.example": { "compress": { "outputSteering": { "enabled": true, "verbosityLevel": 3 } } } } }
  ```

#### `stripImages` — REMOVED

- **Type:** ~~`boolean`~~ / **`stripImagesKeepRecent`** ~~`number`~~ — removed (2026-10, follow-up to #2607/#2640)
- **Description:** The opt-in wire-side image strip no longer exists. Default media folding (#2640: archivable media folds like any other message, pixels archived under `<state>/retrieve/img/<session>/` before the fold, `decompress({ imageRef })` restores them) made it redundant, and the strip itself was a turn-over-turn prompt-cache breaker on three of four wires (its sliding cutoff `len - keepRecent` moves the byte boundary every turn; only anthropic had the fold-anchored fix). Configs still carrying `compress.stripImages` / `compress.stripImagesKeepRecent` are inert: the keys are ignored and a one-time `[acp-config] … INERT` warning points at this note. Media whose bytes bili cannot store (remote URLs, file references) stays pinned on the wire — see #2609.

#### `visibilityMarkers`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Controls the 📦/❌ ACP visibility markers emitted after the proxy executes a proxy tool call (`compress` / `decompress` / `search_context` / `acp_status`). When on, each execution appends a marker line to the response stream and/or re-injects a marker message into that round's rebuilt history so the model can see what happened on later turns. Set `false` to suppress both artifacts — for deployments where models imitate or narrate around the markers (outputting their own confirmation lines or commentary; see issue #862). The tool executions themselves are unaffected: calls still run, and paired tool-call/tool-result messages are still recorded as usual; only the marker line/message is omitted. Since #913, `false` also drops the #862 silence clause from the marker-integrity note appended to nudges and the injected compress prompt — an invisible deployment has no marker for the model to imitate or narrate around, so the clause is pure noise there. The #717 anti-forgery segment stays unconditional in every configuration. Same three-level merge as every other field. The #717 anti-forgery stripping of model-emitted fake markers is independent of this flag and stays active.

#### `messageTimestamps`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Message timestamps (#4313, PR #5236; ON by default since the leak-audit follow-up): bili mints each message one immutable local-time stamp at first sight and renders it — a `time="yyyy-MM-dd HH:mm:ss"` attribute on every `<acp>` compression tag on the wire, a `[start – end]` coverage span appended to each compress-receipt fingerprint line, and an Occurred line in rendered block summaries. Cost is about 8 tokens per message when visible. Stamps are deterministic render inputs (rendered from stored values, never wall clock), so re-rendered history stays byte-stable turn over turn; live-session audits showed identical prompt-cache hit rates with the flag on vs off. Set `false` to reproduce the pre-#4313 bytes exactly (no time attribute, original prompt texts, no fingerprint span). Storage records the stamps either way, so opting in later surfaces full history without data loss. The first restart after which the flag resolves true pays one frozen-prefix cache rewrite per active session. Resolution is env (`BILI_MESSAGE_TIMESTAMPS`; `0` forces off, any other value forces on, same convention as BILI_RESIGN) over the config file, resolved once per proxy instance — changing the flag needs a restart.

### Injection toggles (global only)

These two toggles are honoured only at the **global** level. Setting them inside a per-provider or per-model `compress` block has no effect.

#### `injectTool`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Inject the `compress` / `decompress` / `search_context` tools and the compression system prompt into each request. Set `false` (or `ACP_COMPRESS_TOOL=0`) to disable tool injection entirely.

#### `injectNudge`

- **Type:** `boolean`
- **Default:** `true`
- **Status:** ACTIVE
- **Description:** Inject automatic compression-nudge messages when usage thresholds are crossed. Set `false` (or `ACP_COMPRESS_NUDGE=0`) to disable nudge injection. Disabling both `injectTool` and `injectNudge` is functionally similar to `passthrough`, except the proxy still tracks token usage.

### Why the first compaction waits until 200k

Compaction does **not** trigger on absolute window position — it triggers on
**growth intervals**: by default the first soft compaction fires after the
session grows **50k tokens past its boot content**
([`nudgeGrowthTokens`](#nudgegrowthtokens), a flat step independent of window
size). The absolute position of the first compaction is therefore ≈ **boot +
50k**:

- boot 30k–50k (the dsh default) → first compaction at ~80k–100k;
- a boot around 100k, or a growth step set to ~100k → the first compaction may
  wait until **~200k**.

The forced threshold ([`maxContextLimit`](#maxcontextlimit), default 75%) is
only a backstop, and it applies to the *effective* window — the output reserve
`min(max_tokens, outputHeadroomMaxPct × window)` (cap default `0.25`, see
[`outputHeadroomMaxPct`](#outputheadroommaxpct)) is subtracted first. The
reserve is usually small and only maxes out at the 25% cap when the request
carries a very large `max_tokens`: a 262,144-token window with
`max_tokens = 131072` → effective window 196,608 → forced line ≈147k; the same
window with an 8k reserve → forced line ≈190k.

After that the cadence stays growth-based: one incremental compaction per +50k
of compressible growth. On local models each compaction is a full re-prefill —
a heavy boot plus a large window puts several of them into one long task, which
is how wall-clock ends up 2–3× longer.

To make the first compaction fire earlier (and save tokens), in this order:

1. **trim the system prompt, disable unneeded tools, prune skills** — boot
   size directly determines the absolute position of the first compaction;
2. **lower `nudgeGrowthTokens` to ~50k** (especially if it was raised to 100k);
3. **enable lean mode** (`promptPack: "lean"`);
4. **lower `maxContextLimit`** (e.g. `"40%"`) — the pressure band then starts
   demanding compression at that usage level instead of waiting for the growth
   cadence; use it when your upstream or client degrades on large requests
   (timeouts, slow first bytes) while the default 75% backstop stays out of
   reach (#4007). Below 45% acp-kernel logs a per-turn validation warning —
   noise only, thresholds are unaffected.

Measure actual boot/context usage with `/acp` or the web UI before tuning.

### Soft target with elastic headroom (#1122)

Autonomous agents often want two things at once: keep the *active* context small (cost/latency), while allowing a single task to burst well past that target when it genuinely needs to (e.g., reading a large file). Setting `modelContextLimit` below the model's native window cannot express that — one field plays two roles at once (the usage-ratio denominator **and** the hard preflight wall), so any payload above it gets folded mid-task or fails fast (#1122).

Express it with the existing soft bands instead: keep the limit at the native window, pin the target with `maxContextLimit`:

```jsonc
// model with a 200k native window; keep ~70k active, allow bursts up to the real edge
{
  "compress": {
    "modelContextLimit": 200000,   // = native window → hard wall only at the true edge
    "maxContextLimit": "35%"       // forced-nudge zone starts ≈ 70k (= target ÷ native window)
  }
}
```

How compression actually decides (acp-kernel, verified):

1. **Growth layer (day-to-day driver, absolute tokens):** a proactive nudge fires once cumulative growth since the last anchor (session start / last nudge / post-compression reset) reaches the growth gate **and** enough compressible mass has accumulated. Both numbers are absolute and window-independent by design: the growth step is flat 50k at every window size (kernel `nudge.growthFloor == nudge.growthCap == 50000`, golden-pinned; window-percentage scaling was deliberately removed — #379/#380; override with `nudgeGrowthTokens`); the growth gate is `max(20k, 0.45 × step)` ≈ 22.5k, and the T1 path additionally needs ≥ one step (50k) of compressible mass. This layer keeps compressing long sessions even far below any percentage band.
2. **Pressure layer (percent of the window):** `usage ≥ maxContextLimit` (default 75%) → a nudge is injected every turn until context drops back under; `usage ≥ emergencyThresholdPercent` (default 95%) → forced nudge + emergency truncation.
3. **Qualification layer (kernel default 45%, not exposed):** gates only the turn-1 cold-start ticket and the block-count floor for T2/T3 tier escalation — not part of the day-to-day path.

Note: setting `maxContextLimit` below the kernel's 45% default works correctly (the layers are independent), but acp-kernel logs a per-turn validation warning (`minContextLimitPct must not exceed maxContextLimitPct`) — log noise only, thresholds are unaffected.

Behavior vs an old low-limit config (e.g., `modelContextLimit: 70000`): the hard wall moves from 70k to the native window (large reads stop being crushed mid-task or failing fast); the forced zone moves from 75%×70k ≈ 52.5k to your chosen %×native; below the forced zone the context drifts per the growth layer instead of being pinned every turn — that drift is the price of elasticity. If you need a strict daily ceiling *and* burst headroom simultaneously, static percentage bands cannot express both; choose the % for the ceiling you accept, or track structure-aware compression (#344).

The same fields work per-provider / per-model (three-level merge), and hot-reload via the web UI.

### Three-level merge example

This example shows global defaults, a per-provider override, and a per-model override all stacking per-field:

```jsonc
{
  // Level 1 — global: applies to every request
  "compress": {
    "maxContextLimit": "75%",
    "emergencyThresholdPercent": "95%",
    "nudgeGrowthTokens": 50000,
    "tiers": true,
    "injectTool": true,
    "injectNudge": true
  },

  "providers": {
    "https://api.anthropic.com": {
      // Level 2 — per-provider: overrides global fields for this provider
      "compress": {
        "maxContextLimit": "70%",          // compress a bit earlier here
        "preserveRecentMessages": 8        // keep more recent turns
      },
      "models": {
        "claude-sonnet-4-5": {
          "context": 200000,
          // Level 3 — per-model: the deepest, highest priority
          "compress": {
            "modelContextLimit": 180000,   // treat window as 180k (leaves headroom)
            "emergencyThresholdPercent": "90%"
          }
        }
      }
    }
  }
}
```

For a request to `https://api.anthropic.com/v1/messages` with model `claude-sonnet-4-5`, the resolved settings are:

| Field | Resolved from | Value |
|-------|---------------|-------|
| `maxContextLimit` | provider (level 2) | `"70%"` |
| `emergencyThresholdPercent` | model (level 3) | `"90%"` |
| `nudgeGrowthTokens` | global (level 1) | `50000` |
| `preserveRecentMessages` | provider (level 2) | `8` |
| `modelContextLimit` | model (level 3) | `180000` |
| `tiers` | global (level 1) | `true` |

---

## Environment Variables

Environment variables take precedence over the config file. They are useful for environment-specific overrides (CI, containers) without editing the file.

**Precedence model (#2030).** Every behavior knob resolves as **env var > config file > built-in default**. Since #2030 each pure-behavior knob ALSO has a config-file key, so a deployment can live entirely in `billion-context.json`; the env var remains the override tier. A *set* env var owns its knob even when its value is garbage — it parses exactly as it did before #2030 (falling back to the default) and neither leaks into nor gets shadowed by the file tier. Env-only variables are reserved for what cannot live in the file: secrets (`BILI_LAUNCH_TOKEN`, `BILI_ENCRYPTION_KEY`), per-process channels written by another bili component at spawn (`BILI_MCP_PROXY`, `BILI_PARENT_PID`, `BILI_STRICT_PORT`, `BILI_OPENCODE_ACP_SPEC`, `BILI_LAUNCHER_MODEL_*`), host-side posture read inside third-party host processes (`BILLION_CONTEXT_PLUGIN*`, `BILI_NATIVE_*`, `BILI_RECLAIM_FETCH_PATCH`), path relocation (`BILI_CONFIG_FILE`, `BILI_SESSIONS_DIR`, `ACP_DUMP_DIR`, `XDG_*`), and third-party conventions (`CLAUDE_CODE_SESSION_ID`, `CODEX_HOME`, `https_proxy`). New knobs follow the rules in AGENTS.md "Environment Variable Discipline".

### Config-file keys for environment knobs (#2030)

File keys resolve only when the matching env var is unset. Defaults in parentheses are the built-ins.

<!-- bili:gen env-map -->
| Env var | Config key | Default |
|---------|------------|--------|
| `ACP_AUTO_RESTART_ON_UPDATE` | `autoRestartOnUpdate` | false |
| `ACP_AUTO_UPDATE` | `autoUpdate` | true |
| `ACP_COMPRESS_NUDGE` | `compress.injectNudge` | true |
| `ACP_COMPRESS_PROTOCOL` | `diagnostics.compressProtocol` | "tools" |
| `ACP_COMPRESS_TOOL` | `compress.injectTool` | true |
| `ACP_COUNT_TOKENS_PASSTHROUGH` | `diagnostics.countTokensPassthrough` | false |
| `ACP_DEBUG` | `debug` | false |
| `ACP_DUMP_BODY` | `diagnostics.dumpBody` | false |
| `ACP_DUMP_REQ` | `diagnostics.dumpReq` | true |
| `ACP_DUMP_SSE` | `dumpSse` | unset (directory) |
| `ACP_HOST` | `host` | 127.0.0.1 |
| `ACP_KEEP_RESPONSE_ID` | `compat.keepResponseId` | false |
| `ACP_LOG` | `log` | true |
| `ACP_LOG_FILE` | `logFile` | XDG state path (off disables the file, keeps stderr) |
| `ACP_MODEL_CONTEXT_LIMIT` | `modelContextLimit` | 200000 |
| `ACP_NO_COMPRESS_PROMPT` | `diagnostics.noCompressPrompt` | false |
| `ACP_NO_INJECT_TOOL` | `diagnostics.noInjectTool` | false |
| `ACP_PASSTHROUGH` | `passthrough` | false |
| `ACP_PORT` | `port` | 8787 |
| `ACP_PROMPT_CACHE_ROUTING` | `promptCache.routing` | disabled |
| `ACP_PROVIDERS` | `providersPath` | unset |
| `ACP_RAW_DUMP_DIR` | `diagnostics.rawDumpDir` | <state dir>/raw |
| `ACP_RENDER_NONE` | `diagnostics.renderNone` | false |
| `ACP_SESSION_HEADER` | `sessionHeader` | x-acp-session |
| `ACP_UPDATE_TAG` | `updateTag` | latest |
| `ACP_UPSTREAM` | `upstream` | https://api.anthropic.com |
| `BILI_ADVISORY_CHECK` | `advisoryCheck` | true |
| `BILI_ADVISORY_URL` | `advisoryUrl` | unset (built-in feed) |
| `BILI_AFFINITY_SIMHASH` | `affinitySimhash` | true |
| `BILI_ALLOW_DSH_COMPACTION` | `dsh` | {} |
| `BILI_ALLOW_PRIVATE_HTTP_PROVIDERS` | `network.allowPrivateHttpProviders` | false |
| `BILI_ANNOUNCEMENTS_URL` | `remoteAnnouncementsUrl` | unset (official feed: GitHub master announcements/remote.json) |
| `BILI_AUTO_MODE_FORGE` | `autoModeForge.enabled` | true |
| `BILI_CACHE_KEEPALIVE` | `cacheKeepalive.enabled` | false |
| `BILI_CACHE_KEEPALIVE_ARM_WITHOUT_BREAKPOINTS` | `cacheKeepalive.armWithoutBreakpoints` | false |
| `BILI_CACHE_KEEPALIVE_ASSUME_TTL` | `cacheKeepalive.assumeTtl` | null (detect from body breakpoints) |
| `BILI_CACHE_KEEPALIVE_INTERVAL_MS` | `cacheKeepalive.intervalMs` | null (derive from TTL tier) |
| `BILI_CACHE_KEEPALIVE_MAX_DURATION_MS` | `cacheKeepalive.maxDurationMs` | 86400000 |
| `BILI_CACHE_KEEPALIVE_MAX_PINGS` | `cacheKeepalive.maxConcurrentPings` | 4 |
| `BILI_CACHE_KEEPALIVE_TTL_FACTOR` | `cacheKeepalive.ttlFactor` | 0.9 |
| `BILI_CA_FILE` | `network.caFile` | unset |
| `BILI_CCR_RETRIEVAL_TTL_MS` | `ccrRetrievalTtlMs` | 600000 (0 disables retrieval) |
| `BILI_CHAIN_CONTENT` | `chainContentDetection` | false |
| `BILI_CHAIN_STAMP` | `chainEgressStamp` | false |
| `BILI_CLAUDE_NATIVE_PORT` | `claude.nativePort` | unset (lane sticky zone port) |
| `BILI_CLIENT_ERROR_BACKSTOP_MS` | `network.clientErrorBackstopMs` | 30000 |
| `BILI_CODEARTS_REF` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_CODEX_COMPACT` | `codexCompact` | "intercept" |
| `BILI_COMPRESS_AT_FOLD_POINT` | `compress.compressAtFoldPoint` | false |
| `BILI_COMPRESS_AT_FOLD_POINT_CLEAR_THINKING` | `compress.compressAtFoldPointClearThinking` | false |
| `BILI_DECODED_BODY_BYTES` | `network.decodedBodyBytes` | 10737418240 |
| `BILI_DECOMPRESS_TMP_CAP` | `decompressTmpCap` | 50 |
| `BILI_DSH_AUTHORED_COMPACTION` | `dsh.authoredCompaction` | true (on, #3901 flip) |
| `BILI_DSH_CONTEXT_TAB` | `dsh.contextTab` | true |
| `BILI_DUMP_4XX` | `diagnostics.dump4xx` | false |
| `BILI_DUMP_4XX_MAX_BYTES` | `diagnostics.dump4xxMaxBytes` | 2097152 (floor 1024) |
| `BILI_DUMP_MAX_AGE_DAYS` | `diagnostics.maxAgeDays` | unset (off) |
| `BILI_DUMP_MAX_TOTAL_BYTES` | `diagnostics.maxTotalBytes` | unset (off) |
| `BILI_EXPOSURE_LOG_INTERVAL_MS` | `network.exposureLogIntervalMs` | 3600000 (0 disables the log) |
| `BILI_FAKE_BUF_CAP` | `fakeCompletion.bufCapBytes` | 16777216 |
| `BILI_FAKE_COMPLETION_RETRIES` | `fakeCompletion.retries` | 0 (opt-in) |
| `BILI_FOLD_RECONCILE` | `compress.reconcile` | "repair" |
| `BILI_FORK_ADOPTION` | `forkAdoption` | false |
| `BILI_GUARDRAIL_BASH_TIMEOUT` | `guardrails.bashTimeout` | 60 |
| `BILI_GUARDRAIL_MAX_OUTPUT_BYTES` | `guardrails.maxOutputBytes` | 50000 |
| `BILI_GUARDRAIL_REPETITION` | `guardrails.repetition` | true |
| `BILI_GUARDRAIL_TEXT_RUN_THRESHOLD` | `guardrails.textRunThreshold` | 200 |
| `BILI_HTTP_OUTBOUND_BYTES` | `network.httpOutboundBytes` | 10485760 |
| `BILI_IMAGE_BILLING` | `imageBilling` | auto (resolves to pixels) |
| `BILI_IMAGE_RESCALE` | `imageRescale` | true |
| `BILI_IMAGE_TOKEN_CAP` | `imageTokenCap` | unset (uncapped) |
| `BILI_INVARIANT_JUDGE` | `diagnostics.invariantJudge` | true |
| `BILI_KEEP_ALIVE_TIMEOUT_MS` | `network.keepAliveTimeoutMs` | 5000 |
| `BILI_LOG_MASK_HOSTS` | `maskHosts` | true |
| `BILI_MAX_SESSIONS` | `sessions.max` | 256 |
| `BILI_MAX_SHRINK_PER_COMPRESS` | `network.maxShrinkPerCompress` | unset |
| `BILI_MCP_PROXY` | `native.attachUrl` | unset (discover per lane) |
| `BILI_MESSAGE_TIMESTAMPS` | `compress.messageTimestamps` | true |
| `BILI_MITM` | `mitm.enabled` | true |
| `BILI_MITM_DOMAINS` | `mitm.domains` | [] |
| `BILI_MITM_HANDSHAKE_TIMEOUT_MS` | `mitm.handshakeTimeoutMs` | 10000 |
| `BILI_MYSQL_DSN` | `storage.mysql.dsn` | unset |
| `BILI_NATIVE_ATTACH_EXTERNAL` | `native.attachExternal` | false |
| `BILI_NATIVE_ATTACH_POLICY` | `native.attachPolicy` | own-lane |
| `BILI_NON_HTTP_PROVIDERS` | `compactionOptIn` | false |
| `BILI_NO_CACHE_CONTROL` | `compat.noCacheControl` | false |
| `BILI_OPENCODE_INLINE` | `opencode.inline` | false |
| `BILI_OUTBOUND_BODY_BYTES` | `network.outboundBodyBytes` | 5368709120 |
| `BILI_PERSIST` | `persist.enabled` | true |
| `BILI_PERSIST_DEBOUNCE_MS` | `persist.debounceMs` | 500 |
| `BILI_PERSIST_EPERM_ALERT_REPEAT_MS` | `persist.epermAlertRepeatMs` | 0 (no repeats) |
| `BILI_PERSIST_EPERM_ALERT_THRESHOLD` | `persist.epermAlertThreshold` | 5 |
| `BILI_PERSIST_TAIL_TOKENS` | `persist.tailTokens` | 16384 (0 disables message persistence) |
| `BILI_PERSIST_ZSTD` | `persist.zstd` | false |
| `BILI_PERSONA_SPLIT` | `personaSplit` | true |
| `BILI_PI_INLINE` | `pi.inline` | true (unset env+file runs inline) |
| `BILI_POST_RESPONSE_LINGER_MS` | `network.postResponseLingerMs` | 5000 |
| `BILI_PREFLIGHT_DEAD_END_COOLDOWN_MS` | `network.preflightDeadEndCooldownMs` | 300000 |
| `BILI_PREFLIGHT_HOLD_MS` | `network.preflightHoldMs` | 30000 |
| `BILI_PROXY_KEEPALIVE_MAX_MS` | `network.proxyKeepAliveMaxMs` | 55000 (0 = one-shot connections) |
| `BILI_PUBLIC_SNAPSHOT_CAP_BYTES` | `plugin.snapshotCapBytes` | 104857600 (0 disables snapshots) |
| `BILI_RECEIVE_BODY_BYTES` | `network.receiveBodyBytes` | 5368709120 |
| `BILI_RELEASE_NOTES_CHECK` | `releaseNotesCheck` | true |
| `BILI_RELEASE_NOTES_URL` | `releaseNotesUrl` | unset (built-in feed) |
| `BILI_REPLAY_RETRY_BASE_MS` | `network.replayRetryBaseMs` | 1500 (0 disables the delay) |
| `BILI_REPLAY_RETRY_MAX` | `network.replayRetryMax` | 3 (1 disables replays) |
| `BILI_REQUEST_WATCHDOG_MS` | `network.requestWatchdogMs` | 2× upstreamTimeoutMs |
| `BILI_RESIGN` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_RESIGN_BENEFIT` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_RESIGN_PASSTHROUGH` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_RESUME_INHERITANCE` | `resumeInheritance` | true |
| `BILI_ROLLOUT_<FEATURE>` | `rollout.features.enabled` | unset (bucket math decides) |
| `BILI_ROLLOUT_IDENTITY_CHANNEL_HARVEST` | `rollout.features.identityChannelHarvest` | 0 (off) |
| `BILI_ROLLOUT_PLUGIN_FULL_RESEND_WATERMARK` | `rollout.features.pluginFullResendWatermark` | 5 (experimental grey) |
| `BILI_ROLLOUT_PLUGIN_LANE_SERVER_HISTORY` | `rollout.features.pluginLaneServerHistory` | 0 (off) |
| `BILI_SESSION_CONTENT_STORE_PIN` | `sessions.contentStorePin` | false |
| `BILI_SESSION_GC` | `sessions.gc.enabled` | false |
| `BILI_SESSION_GC_INTERVAL_MS` | `sessions.gc.intervalMs` | 3600000 |
| `BILI_SESSION_GC_MAX_AGE_DAYS` | `sessions.gc.maxAgeDays` | 7 |
| `BILI_SESSION_GC_MAX_TOKENS` | `sessions.gc.maxTokens` | 1000000 |
| `BILI_SESSION_RESIDENT_HARD_MAX_BYTES` | `sessions.hardMaxBytes` | (same as `sessions.residentMaxBytes`) |
| `BILI_SESSION_RESIDENT_MAX_BYTES` | `sessions.residentMaxBytes` | 4294967296 |
| `BILI_SESSION_WARM_MAX` | `sessions.warmMax` | 0 |
| `BILI_SESSION_WARM_MAX_BYTES` | `sessions.warmMaxBytes` | 67108864 |
| `BILI_SQLITE_AUTO_DOWNLOAD` | `storage.sqliteAutoDownload` | true |
| `BILI_STABLE_SYSTEM_ANCHOR` | `stableSystemAnchor` | false |
| `BILI_STORAGE_ARCHIVE_AFTER_DAYS` | `storage.archiveAfterDays` | 365 |
| `BILI_STORAGE_BACKEND` | `storage.backend` | unset (sqlite) |
| `BILI_STORAGE_JSON_WRITER` | `storage.jsonWriter` | on |
| `BILI_STORAGE_UNIFIED` | `storage.unified` | unset (full) |
| `BILI_STORAGE_WAL_JOURNAL_SIZE_LIMIT_BYTES` | `storage.walJournalSizeLimitBytes` | 8388608 |
| `BILI_STREAM_ERROR_SHAPE` | `compat.streamErrorShape` | protocol |
| `BILI_STREAM_KEEPALIVE_MS` | `network.streamKeepAliveMs` | 15000 (0 disables) |
| `BILI_SUBAGENT_SPLIT` | `subagentSplit` | true |
| `BILI_THROTTLE_429` | `network.throttle429Enabled` | true |
| `BILI_THROTTLE_429_BASE_DELAY_MS` | `network.throttle429BaseDelayMs` | 2000 |
| `BILI_THROTTLE_429_MAX_CONSECUTIVE` | `network.throttle429MaxConsecutive` | 5 |
| `BILI_THROTTLE_429_MAX_DELAY_MS` | `network.throttle429MaxDelayMs` | 30000 |
| `BILI_THROTTLE_429_SCOPE` | `network.throttle429Scope` | credential |
| `BILI_UPDATE_CHECK_INTERVAL_MS` | `update.checkIntervalMs` | 180000 |
| `BILI_UPDATE_POLICY_URL` | `update.policyUrl` | official repo raw URL |
| `BILI_UPDATE_REGISTRY` | `update.registry` | "npmjs" (registry.npmjs.org) |
| `BILI_UPDATE_STAGGER_MAX_MS` | `update.staggerMaxDelayMs` | 172800000 (built-in 48 h) |
| `BILI_UPDATE_STAGGER_MIN_MS` | `update.staggerMinDelayMs` | 900000 (built-in 15 min) |
| `BILI_UPSTREAM_PROXY` | `proxy` | unset (direct) |
| `BILI_UPSTREAM_PROXY_MODE` | `upstreamProxyMode` | auto (unset behaves as direct) |
| `BILI_UPSTREAM_TIMEOUT_MS` | `network.upstreamTimeoutMs` | 720000 |
| `BILI_WS_OUTBOUND_BYTES` | `network.wsOutboundBytes` | 10485760 |
| `PI_ACP_DELEGATE_ASYNC_TIMEOUT_MINUTES` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_FORCE_ENABLE` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_MAX_CONCURRENT` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_MAX_DEPTH` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_SYNC_TIMEOUT_MINUTES` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PORT` | `port` | 8787 |
| `— (file-only)` | `guardrails.repetition.abort` | 5 |
| `— (file-only)` | `guardrails.repetition.enabled` | true |
| `— (file-only)` | `guardrails.repetition.recovery` | false |
| `— (file-only)` | `guardrails.repetition.warn` | 3 |
<!-- /bili:gen -->

| Variable | Effect |
|----------|--------|
| `ACP_DEBUG` | Set to `1` for verbose logging (same as `"debug": true`). |
| `ACP_PASSTHROUGH` | Set to `1` to forward without compression (same as `"passthrough": true`). |
| `ACP_COMPRESS_TOOL` | Set to `0` to disable tool injection (same as `"compress.injectTool": false`). |
| `ACP_COMPRESS_NUDGE` | Set to `0` to disable nudge injection (same as `"compress.injectNudge": false`). |
| `ACP_MODEL_CONTEXT_LIMIT` | Override the context limit globally (absolute token count). |
| `BILLION_CONTEXT_NODE` | Explicit path to the Node executable used when a non-Node host process spawns the proxy (#819/#1429). Resolution order inside a host that is not itself Node: this override → PATH search plus well-known install locations a GUI PATH omits (`/opt/homebrew/bin`, `/usr/local/bin`, Volta, …) → the Electron host's own binary run as plain Node (`ELECTRON_RUN_AS_NODE=1`, last resort — desktop apps like deepseek-harness desktop therefore work with zero configuration). Every discovered candidate is validated with `--version` and must report `vX.Y.Z` with major ≥ 20 (#3383): a foreign program merely *named* `node(.exe)` (e.g. Microsoft HPC Pack's cluster CLI, which ignores its arguments and exits 0) is skipped with a warning instead of being spawned — set this variable explicitly when such a program precedes the real Node on your PATH. Set it to force a specific Node (e.g. newer than the host's bundled runtime); it always beats the fallbacks. |
| `BILI_CCR_RETRIEVAL_TTL_MS` | Expiry (ms) for a queued-but-undelivered `acp_retrieve` injection (#1343): if the full text stays queued this long without ever riding an upstream request, it is dropped **loudly** — warn log with refs + reason, `stats.retrieveDropped` bump, and a corrective note on the next request telling the model to re-issue `acp_retrieve`. Default `600000` (10 min); `0` disables expiry. Plugin-lane queue items only; range-restore riders (#1207) are exempt. |
| `BILI_IMAGE_TOKEN_CAP` | Cap the per-image token estimate used by the preflight size gate, output clamp, and image-compression stats (#488/#496/#1843). Applied on top of whatever billing mode resolved — a blanket ceiling for routes whose real encoder bills below even the pixel prior. Wins over both config levels ([`imageTokenCap`](#imagetokencap)); live-read per request (no restart). Unset = fall back to config (`providers.<url>.imageTokenCap`, then global), default no cap. |
| `BILI_IMAGE_BILLING` | Override the image billing mode used by the preflight size gate and output clamp (#767/#1843): `pixels` or `bytes`. Live-read per request (no restart); beats the global `imageBilling` and every per-provider `providers.<url>.imageBilling`. Since #1843 the default resolves to `pixels` for every host, so use `bytes` to force conservative byte billing process-wide (e.g. a byte-counting relay) — the per-route setting remains the narrower tool. See [`imageBilling`](#imagebilling). |
| `BILI_IMAGE_RESCALE` | Disable (`"0"` or `"false"`) or leave enabled (anything else) the egress image downscale pass (#3400): large outbound images are sent shrunken while originals stay byte-exact in session storage. Live-read per request (no restart); wins over the config-file key [`imageRescale`](#imagerescale), whose own default is on. |
| `BILI_IMAGE_RESCALE_MAX_DIM` | Longest-edge trigger threshold (px) for the egress downscale pass (#3400): an image is a rescale candidate when its longest edge exceeds this value OR its base64 body exceeds 100 KB; fit-inside resizing never upscales. Default `1600`; non-numeric or values below `128` are ignored (default applies). Env-only by design — no config-file mirror. See [`imageRescale`](#imagerescale). |
| `BILI_PREFLIGHT_HOLD_MS` | Grace period (ms) before a long preflight compression starts holding the client with keep-alive bytes (default `30000`; see #568). |
| `BILI_STREAM_KEEPALIVE_MS` | Streaming-phase client hold (#1647): when an SSE response has written zero bytes to the client for this many milliseconds, bili emits one SSE comment line (`: bili-keepalive`, a spec-level no-op) so the client's undici `bodyTimeout` (default 300s; Node built-in fetch cannot override it per request) cannot kill long prefills whose upstream pings the rewriter/strip pipes swallow. Default `15000`; `0` disables. Sibling of `BILI_PREFLIGHT_HOLD_MS`, which covers compression-preflight silence — this covers upstream-caused silence during streaming. |
| `BILI_RECLAIM_FETCH_PATCH` | Set to `0` to disable the native-mode fetch self-heal re-arm (#1158). By default the native fetch intercept installs `globalThis.fetch` as a guarded accessor, so a third-party patch that re-installs `globalThis.fetch` (e.g. dsh-http-proxy's settings refresh writing its frozen pre-bili `originalFetch`) is re-chained as the downstream and model traffic keeps routing through bili. With `0` the classic direct install stays: a third-party re-arm then wins and bili stops seeing model traffic for the session. **Egress note:** while the guard holds, claimed model traffic is dispatched by the bili proxy itself — it no longer rides the third-party chain's egress (e.g. a SOCKS5 proxy configured in dsh-http-proxy; bili's own upstream proxying supports HTTP proxies only). If you need the third-party egress back, set `0` and configure the egress at bili's level (`"proxy": "http://…"`). **Coexistence note (#3528):** the default accessor form is incompatible with third-party components that require `globalThis.fetch` to be a plain writable data property — they read its property descriptor, find no `value`, and abort their fetch observer at load (reported: DSH Desktop's Developer Tools / NodeJS diagnostic plugin, `@deepseek-ai/dsh-experimental-inspector`). Set `0` (then fully restart the host) so such observers load via the classic direct install; you accept the trade-offs above. See #3528. |
| `BILI_RESIGN` | Set to `0` to un-deploy the #1884 re-sign arm end to end (pre-fix behavior: signed bodies ride the normal rewrite path and fail upstream with 401). Default: armed — a signed model request that can be re-signed (SDK-HMAC-SHA256 with a resolvable credential) tunnels with every egress body re-signed; the arm needs no configuration on dsh (account-pool discovery via the credentials service). A BUILT-IN-scheme request that CANNOT be re-signed (no resolvable credential) is refused locally with 403 and an actionable message — its fix (provide the credential) is actionable. Every OTHER detected scheme (SigV4, gateway-invented headers like `x-ofm-signature` — detection is shape-based, #2090) has no credential source anywhere in bili, so it is ALWAYS refused (binary contract: re-signed+compressed or refused, never passed through unsigned): a 403 naming the scheme, remembered in `resign-pending.json`, and re-warned at every startup (and shown in the web UI) until bili ships the scheme's re-signer. `BILI_RESIGN_PASSTHROUGH=1` turns on verbatim no-compression forwarding for the BUILT-IN scheme only — it is inert for every other scheme. `enabled` / `passthrough` / `credentialRef` have config-file twins under the [`resign`](#resign) block, keyed by signature scheme (`resign["sdk-hmac-sha256"]`; `providers.<url>.resign["<scheme>"]` is the level-2 override) — env vars win over the file. Scheme keys pin the passthrough opt-in: only the scheme whose key sets it tunnels. Related: `BILI_RESIGN_BENEFIT` (comma-separated list of CodeArts benefit models whose requests get the signed `maas_type: benefit` header — wins over the whole three-level tree; file-side twin is the level-3 `models.<name>.benefit` boolean, unset falls back to the built-in `glm-5.3-flash,deepseek-v4.1-flash`, mirroring the dsh codearts plugin's `CODEARTS_BENEFIT_FALLBACK`) and `BILI_CODEARTS_REF` (force the dsh credentials-service ref used for re-signing instead of discovering enabled `codearts` accounts from `$DSH_HOME/jet-hub/state.json`). |
| `BILI_CONFIG_FILE` | Override the config file path (point at any JSON file). |
| `ACP_PORT` / `PORT` | Override the listen port. |
| `ACP_HOST` | Override the listen host. |
| `ACP_UPSTREAM` | Override the default upstream base URL. |
| `ACP_LOG` | Set to `0` to disable request logging. |
| `ACP_AUTO_UPDATE` | Set to `0` to disable auto-update checks. File-config key: `autoUpdate`. |
| `ACP_AUTO_RESTART_ON_UPDATE` | Set to `1` (any non-`0` value) to enable self-restart after an auto-update install (#811): the restart requires zero in-flight requests, passes an install sanity check, honors a 10-minute cooldown marker, and resumes the original listener on failure. File-config key: `autoRestartOnUpdate`. |
| `ACP_UPDATE_TAG` | Dist-tag channel the auto-updater follows (default `latest`, e.g. `dev`). File-config key: `updateTag`. The rolling `pr` tag tracks the newest PR test build across all PRs; legacy per-PR `pr-N` tags are frozen at that PR's last build and are only followed when explicitly configured. The rolling `master` tag tracks the newest build merged to master — every non-release merge publishes one (#2049); set it to follow merged-but-unreleased state. |
| `BILI_UPDATE_REGISTRY` | Base URL override for the npm registry used by the auto-updater and `bili update` (default `https://registry.npmjs.org`). Intended for hermetic testing against a loopback registry (the verdaccio instance in the `ACP_TEST_REGISTRY` e2e suite); leave unset in production (#1153). |
| `BILI_UPDATE_CHECK_INTERVAL_MS` | Auto-update check period in milliseconds (default `180000`, i.e. 3 minutes; values ≤ 0 are ignored and the default applies). Shortened by the hermetic e2e suite so it never waits a full cycle (#1153). |
| `BILI_UPDATE_STAGGER_MIN_MS` | Lower bound of the random upgrade-delay window (#3619): after discovering a new version, an automatic upgrade waits until its drawn moment inside [min, max] — built-in 15 min when unset. Wins over the remote policy's `default`; `0` disables the delay for this machine (legacy immediate upgrade). Raw ms here; the file twin also accepts duration strings (`"15m"`). |
| `BILI_UPDATE_STAGGER_MAX_MS` | Upper bound of the random upgrade-delay window (#3619) — built-in 48 h when unset. With both bounds set to `0`, upgrades happen immediately as before #3619. Raw ms here; the file twin also accepts duration strings (`"2d"`). |
| `BILI_UPDATE_POLICY_URL` | Override for the remote update-policy JSON URL (#3619). Default: `auto-update-policy.json` on the official repo's raw address — fixed by design, because the policy may steer timing/skip/pin but never the install source; the override exists for hermetic tests. File twin: `update.policyUrl`. |
| `BILI_MODEL_INFO_RETRY_MS` | Cooldown (ms) before the dsh native plugin re-resolves the current model's context window after a resolve that failed or returned no window (#1812/#1836): a cached entry without a window is not final — instead of latching headerless for the process lifetime, the next request after this cooldown triggers a retry. Default `30000`; non-numeric or negative values fall back to `30000`. Test hook — shortened by the dsh-native unit test so it never waits wall-clock; leave unset in production. |
| `BILI_DSH_RETRY_INTERVAL_MS` | Back-off (ms) between dsh native plugin tool-registration retries (#2082): after a manifest fetch or tool registration fails transiently, the next retry happens no sooner than this cooldown. Default `10000`; non-numeric or non-positive values fall back to `10000`. Test hook — shortened by the dsh-native unit tests so they never wait wall-clock; leave unset in production. |
| `BILI_DSH_RECOVERY_INTERVAL_MS` | Interval (ms) of the dsh native plugin's detached recovery timer (#2082): while the tools are down it keeps driving registration retries with zero model traffic — the case where the model already gave up on the missing tools and nothing else re-arms the loop. Defaults to following `BILI_DSH_RETRY_INTERVAL_MS` (`10000`). Test hook — under NODE_TEST_CONTEXT the timer never starts unless this var is set explicitly; leave unset in production. |
| `BILI_DSH_MAX_TESTED_VERSION` | Cap for the newer-than-tested dsh boot note (dsh native lane): the running dsh build — resolved from the nearest `node_modules/@deepseek-ai/dsh/package.json` above the injected bundle — is compared (semver, pre-release aware) against this newest-tested version, and being STRICTLY NEWER earns ONE durable boot-time note (inside the dsh session) advising roll-back to the capped version until support lands. One direction only: at-or-below-cap builds stay silent, because known older-build break modes already have their own overlay-latch detectors (#3806 boot warning + #2474 fallback). Soft by design: it warns, never gates or blocks traffic (a wrong guess must not take down a working session). Default = `0.2.0-rc.2`, the CI e2e anchor (.github/workflows/ci-e2e-dsh-native.yml); move the cap up as builds get verified; an EMPTY string turns the check off for this lane. Unresolvable/unparseable versions fail open to silence (absence of evidence ≠ broken build).
| `BILI_ADVISORY_CHECK` | Set to `0` to disable the critical-defect advisory watcher (#1481). Default ON — it runs independently of `ACP_AUTO_UPDATE` so that installs with auto-update off still get force-updated out of a known-broken version range. Fail-open: an unreachable/malformed source only warns, never blocks model traffic. File-config key: `advisoryCheck`. |
| `BILI_ADVISORY_URL` | Override for the advisory document URL. Default: the companion package `billion-context-advisories` on the configured registry (`BILI_UPDATE_REGISTRY` aware). File-config key: `advisoryUrl`. |
| `BILI_RELEASE_NOTES_CHECK` | Set to `0` to disable the release-notes visibility watcher (#1870). Default ON — pure visibility, silent by default (#1977): fetches the companion release-notes doc and surfaces "CRITICAL update ready — restart to finish" (disk newer than running) or "critical update available" on `acp_status` and the `/acp` panel ONLY when the pending span contains a `critical`-tier entry; routine/recommended releases never surface. Never installs, never restarts; fail-open. File-config key: `releaseNotesCheck`. |
| `BILI_RELEASE_NOTES_URL` | Override for the release-notes document URL. Default: the companion package `billion-context-release-notes` on the configured registry (`BILI_UPDATE_REGISTRY` aware). File-config key: `releaseNotesUrl`. |
| ~~`BILI_HOST_USAGE_CREDIT`~~ / ~~`hostUsageCredit`~~ | **Removed in #660.** Used to select the host-facing usage mode. The #408 uncompressed-baseline backfill is gone entirely — every host now reports the actually-forwarded (post-fold) request as provider-measured (matches `[acp-usage] input=`). Old values left in env or the config file are ignored; remove them. See the "Bug history lesson" section of PR #691. |
| `ACP_PROVIDERS` | Path to an external `providers.json` (legacy / shared file). |
| `BILI_REPLAY_RETRY_BASE_MS` | Base backoff delay (ms) for replay retries after a transient upstream rejection (default `1500`; set `0` to disable the delay). See #189. Also drives the main-path transport-retry backoff (#1688). |
| `BILI_REPLAY_RETRY_MAX` | Total attempts for replay retries (default `3`; set `1` to disable retries entirely — legacy single-attempt behavior). See #189. On the acp-loop/preflight/compress loops it applies to both transient HTTP failures and #1263 fail-fast network failures (pre-response reset/refused — proxy-recycle class), never to timeout/abort kinds. On the main model-request path (#1688) only fail-fast pre-response network failures are replayed; HTTP verdicts (4xx/5xx) always pass through verbatim, untried again. |
| `BILI_PROXY_KEEPALIVE_MAX_MS` | Keep-alive reuse ceiling (ms) for connections through an upstream proxy (default `55000`). Common proxies recycle idle tunnels on a ~60s cadade; capping our reuse window below that trades a few reconnects for the classic "first request after idle dies with ECONNRESET" failure (#1263). `0` = uncapped (undici defaults). Direct (non-proxied) connections are unaffected. |
| `BILI_UPSTREAM_TIMEOUT_MS` | Idle budget (ms) for upstream requests: time-to-first-byte and time between body chunks (default `720000` = 12 min). A healthy stream that keeps producing chunks is never cut mid-flight; a silent one is. The same value drives the underlying HTTP client's transport timeouts, so this single knob bounds long local-model prefills end-to-end (#551). |
| `BILI_CA_FILE` | Path to a PEM file with extra root CAs for bili's own upstream TLS trust (#3776). Security software doing HTTPS/encrypted-connection scanning (Kaspersky, enterprise DLP) or a corporate MITM proxy re-signs the upstream with its own CA: browsers trust it via the OS certificate store, but Node's fetch reads only its built-in roots plus `NODE_EXTRA_CA_CERTS` — so bili fails with `SELF_SIGNED_CERT_IN_CHAIN` while the rest of the machine connects fine. Export the scanner/vendor root to PEM and set this (or `NODE_EXTRA_CA_CERTS`); alternatively exclude node.exe from the software's HTTPS inspection. The file is MERGED with Node's built-in roots and any `NODE_EXTRA_CA_CERTS` entries — never replaces them. Unset = today's default trust, byte-for-byte. File-config key: `network.caFile`. |
| ~~`BILI_STREAM_STALL_MS`~~ | **Removed in #1714** (the #1452 opt-in streaming-phase stall guard is retired). In #1706 a stale `400` export turned every thinking-phase silence into a false truncation; local-model deployments legitimately go silent for minutes mid-stream (thinking phases, long prefills), so no finite sub-budget was safe for everyone. Upstream silence — prefill and mid-stream alike — is now bounded solely by the always-on `BILI_UPSTREAM_TIMEOUT_MS` idle budget (default 12 min, tunable). Old values are ignored; bili names a stale export once at startup (`no longer read`) — remove it from your shell profile. |
| `BILI_KEEP_ALIVE_TIMEOUT_MS` | Keep-alive timeout (ms) for client-facing sockets (default `5000`, matching Node's implicit default; #1452). Idle client connections are reaped with a clean FIN by Node's built-in reaper; this makes the previously implicit value explicit and configurable, and the reap is classified as `reason=idle-timeout` in the connection lifecycle ledger (debug log). Non-numeric or non-positive values fall back to `5000`. |
| `BILI_EXPOSURE_LOG_INTERVAL_MS` | Interval (ms) for the periodic long-lived-exposure telemetry line `[exposure] uptime=… liveConns=… tcpHandles=… handles=… sessions=… blindTunnels=… inFlight=…` (default `3600000` = hourly; #1452). `0` disables. Exists so socket-handle leaks and zombie connections surface in long-running logs instead of post-mortem forensics. |
| `BILI_CLIENT_ERROR_BACKSTOP_MS` | Terminal backstop (ms) for the clientError drain path (#1529, follow-up to #1452 item 1): after the 300ms drain bail has `end()`ed a connection whose peer never sends FIN, the socket would otherwise sit half-open on our side indefinitely — the keep-alive reaper keys off completed responses and Node enables no SO_KEEPALIVE by default. After this much post-bail silence the proxy destroys the socket instead, classified as `reason=clienterror-backstop` in the connection lifecycle ledger with its own warn marker. Safe against the #1452 RST signature: the socket has been `resume()`-drained for the whole window, so the destroy carries no unread residual bytes. Default `30000`; `0` restores the hold-until-peer-death status quo. Non-numeric or negative values fall back to `30000`. |
| `BILI_POST_RESPONSE_LINGER_MS` | Graceful-close budget (ms) after a completed response (#1982): when the proxy initiates closing a client connection right after the last response (e.g. `Connection: close`), it holds the socket open for up to this budget waiting for the peer's close signal — a TCP FIN or TLS close_notify, which can only arrive after our final byte was received+ACKed — then closes cleanly; if no signal arrives within the budget the socket is destroyed anyway and classified as `reason=linger-backstop` (warn line). This removes the abortive destroy that could race unACKed bytes into an RST on the client side (nginx `lingering_time` parity). Default `5000`; non-numeric or non-positive values fall back to `5000`. Error-driven closes, pre-handshake teardown, the clientError drain (#1529), and the idle reaper are intentionally unaffected. |
| `BILI_ALLOW_PRIVATE_HTTP_PROVIDERS` | Opt-in switch (#2984): set to `1`/`true` to let plain-HTTP provider baseUrls on private networks (RFC1918, 127/8, link-local, IPv6 ULA/link-local, `*.local`/`.lan`/`.internal`) pass the agent-registry intake and summary-endpoint guards, which otherwise trust loopback plaintext only. Public IPs/domains and CGNAT (100.64/10) stay refused regardless. Default off — behavior identical to pre-#2984. A set env value owns the knob over `network.allowPrivateHttpProviders`. |
| `ACP_SESSION_HEADER` | Conversation-id header name (default `x-acp-session`). |
| `ACP_REASONING_KEEP` | Responses API only: set `none` to drop all reasoning items. Default routes reasoning through the compression pipeline so it is hidden automatically once its turn is summarized (prevents the unbounded accumulation that broke Codex's prompt-cache prefix). |
| `ACP_RENDER_NONE` | Set to `1` to stop injecting per-message render tags (the `` `<acp>` `` markers carrying `mNNNNN` refs) into outgoing request history — applies to every wire format (OpenAI chat, Anthropic, Responses) and compact rebuilds (#933). Default is `text-only`: the model reads these refs to cite messages in `compress` calls, so only disable them once you've confirmed your workflow doesn't need ref-based compression (e.g. tag echoes leaking into client-visible output). Previously this variable was honored only on the Responses path and compact; #933 extended it to all paths. |
| `ACP_LOG_FILE` | Log file path (default XDG state path; `off` disables the file, keeps stderr). Auto-rotates at 10 MB. |
| `ACP_DUMP_SSE` | Directory to dump raw SSE frames for debugging — including loop-originated upstream responses (compress re-requests and truncation retries, named `<ts>-<sid>-loop<N>-raw.sse`), which the outer forward tee cannot see (#1455). |
| `BILI_STREAM_ERROR_SHAPE` | Set `"completion"` to restore the legacy failure shape on the anthropic/openai wire (failure text inside a synthesized successful completion); default `"protocol"` = protocol-native error frames (#1455). Same knob as `compat.streamErrorShape`; this env var wins. |
| `BILI_LOG_MASK_HOSTS` | Set `0` to turn OFF host masking in proxy logs (#897): non-public target hosts (private relays, internal domains) are logged verbatim instead of `<private-host>`. Default is ON (#255 — logs get pasted into public issues); credential-header masking is independent and always on. Real target hosts are always available without touching this flag: `GET /__bili/stats` → `blindTunnels`, `GET /__bili/health` (both loopback-only), and the `acp_status` output. |
| `BILI_SUBAGENT_SPLIT` | Set `0` to turn OFF Claude Code subagent session splitting (#970): by default, anthropic-wire requests carrying the `x-claude-code-agent-id` + `x-claude-code-parent-agent-id` pair (background subagents) get their own `<session>\|sub:<agent-id>` session — own lock chain and compression state — instead of queueing behind the main session's lock. Default is ON. `"subagentSplit": false` in the config file does the same; the env var wins. Responses wire: no-op — see the `subagentSplit` / BOTH-mechanisms scope note. |
| `BILI_FORK_ADOPTION` | Set `1` to turn ON fork block-adoption (#629): when an anonymous (prefix-affinity) client forks its history mid-conversation (edit-and-resend / regenerate an earlier turn), the new session inherits the parent's compression blocks whose source content is fully present in the forked request — instead of restarting with zero compression state and re-folding the shared prefix from scratch. Default is OFF. Identified resume-forks are NOT governed by this switch — they adopt blocks together with `BILI_RESUME_INHERITANCE` (#1834). `"forkAdoption": true` in the config file does the same; the env var wins. The adoptable inventory is logged on every anonymous fork even while disabled, so you can size the win before flipping it on. |
| `BILI_AFFINITY_SIMHASH` | Set `0` to turn OFF simhash chain-alignment adoption (#2265): anonymous requests whose exact hash chain was broken by a client-side pervasive decorative rewrite (e.g. Trae re-stamping model tags on every assistant message) re-attach the existing session with its compression state instead of minting fresh and re-folding from zero. Guards: ≥90% coverage within Hamming 10, ≥20% mutated-but-similar positions (point edits still fork, #629), ≥1 byte-identical user message, unique candidate only. Default ON. `"affinitySimhash": false` in the config file does the same; the env var wins. |
| `BILI_RESUME_INHERITANCE` | Set `0` to turn OFF resume inheritance (ON by default) (#1486): when an identified client (sends its own session id, e.g. Claude Code's `x-claude-code-session-id`) resumes a conversation under a NEW session id while replaying the full transcript (`cc --resume` forks a fresh UUID), bili matches the incoming history byte-exactly against that client's tracked chains (≥8 messages, append-only tracking) and, on the resumed session's first request, inherits the parent's ref assignments — stale model citations then resolve to their ORIGINAL messages instead of mis-hitting renumbered ones — adopts the fully-present compression blocks (together with this inheritance, #1834: losing them on resume meant the folded originals came back on the wire and the upstream request ballooned; the old `forkAdoption` co-gate now applies only to anonymous forks, #629), and records the `derivedFrom` lineage. The parent is never modified and fresh messages number above the parent's ref space. A resume must strictly EXTEND the parent's history — an equal-depth byte-exact replay under another id is a duplicate, not a resume. Anonymous sessions are unaffected (they keep their own pfa-* world, #309). `"resumeInheritance": false` in the config file does the same; the env var wins. |
| `BILI_STABLE_SYSTEM_ANCHOR` | Set `1` to enable stable-system anchoring (#1085) — a **best-effort wire-layer fallback** for prefix caching: the root fix belongs client-side (the client owns its history and decides how to present instruction changes), this only stops the proxy from letting a changed head invalidate the whole cached prefix. **Plain-proxy mode only**: plugin-mode agents (`x-bili-plugin`) own their context management and are never anchored, so clients that already inject cache-friendly updates (e.g. claude-code-style system reminders) are not double-processed. When enabled, bili remembers each session's first-seen head system/instructions block and keeps re-sending those exact bytes even when the client's system prompt later changes. A **localized** change (a file-style edit sharing ≥70% of lines with the version in effect so far) appends a trailing `[System context update] …` user note carrying a compact line diff (`-` removed / `+` added; each note composes sequentially onto the previous one). A **non-localized** change (structural reshuffle, tool-def churn, timestamped banners, heads over 400 lines) is adopted outright — one deliberate cache miss beats appending noise that would mislead the model about its instructions. Churn guard: more than 8 accumulated notes likewise replace the anchor with the newest text and clear the log. The anchor and note log persist with the session and survive compression/compaction (session metadata, not kernel state). Known residual limitation: client-placed `cache_control` breakpoints may still misalign after a head swap. Excluded from anchoring: title-gen micro-requests (OpenAI/Google), Responses compaction-trigger requests, auto-mode classifier requests. Clients implementing their own variant (stable prompt + in-history updates) get zero extra injection — such updates pass through as ordinary history. Default is OFF. `"stableSystemAnchor": true` in the config file does the same; the env var wins. |
| `BILI_ALLOW_DSH_COMPACTION` | **REMOVED in #3666** (superseding #2028). The former switch let dsh's built-in auto-compaction run through bili by lifting the wire-level refusal (#1729); because a landed dsh checkpoint durably shadows the raw conversation history — irreversible, destroying the proxy's compression substrate — the escape hatch has been deleted outright: dsh native compaction calls are now intercepted unconditionally on every lane bili serves, on every build — refused (422) by default, or answered locally by bili itself when `BILI_DSH_AUTHORED_COMPACTION` is set (row below). Any leftover value — `"dsh": { "allowDshCompaction": true }`, a bare top-level `"allowDshCompaction"` in an older file, or the old env var — is ignored, with a one-time deprecation warning naming it. If you need dsh-side checkpoints out entirely, apply host-side suppression instead: the shipped bundle patch (`auto: false`) on non-web profiles, or the #3354 load-time overlay / #2474 full-snapshot override of preset-standard on web profiles. |
| `BILI_DSH_CONTEXT_TAB` | Set `0` to REMOVE the DSH top-bar 「上下文」/「Context」 conversation tab (#4237) — the name collides with dsh-context's identically-named tab on co-installed machines, and no user-side switch existed before this knob. Hiding removes ONLY the tab: compression, the settings section (会话 subpage), the plugin bundle config face, the Web UI and the /acp command are all unaffected — the ledger stays reachable there. Any other value (`1`, `true`, …) forces the tab on over the file tier; unset lets the config-file `dsh.contextTab` boolean apply (default true = today's behavior). The setting is shipped to the DSH page through the existing snapshot + `/bili/origin` carriers and read at page load, so it takes effect on the next page load / dsh restart without a proxy restart. The display NAME of the tab is a separate file-only tier: `dsh.contextTabLabel`. |
| `BILI_DSH_AUTHORED_COMPACTION` | Set `1` to have bili itself ANSWER dsh's compaction summarize calls locally instead of refusing them (#3733). Prerequisites per call: the #1729 guard fires (marker-decisive; unconditional since #3651) and the session holds at least one ACTIVE fold block. The reply is forged with zero egress (the autoModeForge #2740 discipline): an identity header `<bili-snapshot v1 conv="…" seq="…" blocks="…" />` plus every active block's summary in the kernel render format — exactly the bytes the model already reads upstream, so client display, upstream context and server state agree for the first time, and dsh's checkpoint file shrinks (#3723's unbounded growth loop). Originals stay recoverable via CCR/export; the landed checkpoint is recognized on replay through the same #2432 rebase as a foreign one, but recorded as `dshAuthoredCheckpointLanded` (info, not warn). Env-only for the rollout window; read per-request, no restart needed. |
| `BILI_NO_CACHE_CONTROL` | Set `1` to disable bili's Anthropic-lane `cache_control` breakpoint stamping (#1637, shipped in #1639). On by default: Anthropic-style upstreams cache only what is explicitly breakpointed (max 4 per request, counted across system + tools + message blocks combined), so bili marks the system block plus up to 3 cumulative message marks — a marked message stays marked (byte-stable prefix), marks die only by folding, and the last 3 stable messages carry the advancing frontier. Any client-set `cache_control` (message blocks, tools entries) suppresses bili's stamps entirely — client-managed caching wins. Marks persist with the session. This switch is the escape hatch for upstreams that reject the field or relays with their own breakpoint policy. Plain-proxy Anthropic lane only; OpenAI/Responses lanes cache implicitly and are never stamped. Config-file twin: [`compat.noCacheControl`](#compat) — the env var wins. |
| `BILI_CACHE_KEEPALIVE` | Set `1` to turn ON idle prompt-cache keepalive for the Anthropic wire (#3376) — see [`cacheKeepalive`](#cachekeepalive) for the full mechanism, stop rules, and cost notes. File twin: `"cacheKeepalive": { "enabled": true }`; the env var wins. Default OFF. |
| `BILI_CACHE_KEEPALIVE_TTL_FACTOR` | Cadence factor applied to the detected/assumed cache-TTL tier (default `0.9` → pings at ~4.5 min on the 5-min tier, ~54 min on the 1-hour tier). Must be in `(0, 1]`. File twin: `cacheKeepalive.ttlFactor`. |
| `BILI_CACHE_KEEPALIVE_MAX_DURATION_MS` | Maximum keepalive lifetime per session, measured from its last REAL request (default `86400000` = 24 h); past it, an armed session disarms even while still hitting. File twin: `cacheKeepalive.maxDurationMs`. |
| `BILI_CACHE_KEEPALIVE_MAX_PINGS` | Max simultaneously armed sessions (default `4`); overflow evicts the longest-idle session's keepalive. File twin: `cacheKeepalive.maxConcurrentPings`. |
| `BILI_CACHE_KEEPALIVE_ASSUME_TTL` | `"5m"` or `"1h"`: skip the body's breakpoint detection and run the cadence from this tier instead — for relays/proxies that inject or rewrite `cache_control` TTL downstream of bili so the forwarded body shows no (or a wrong) breakpoint tier. File twin: `cacheKeepalive.assumeTtl`. |
| `BILI_CACHE_KEEPALIVE_ARM_WITHOUT_BREAKPOINTS` | Set `1` to arm keepalive even when the forwarded body carries no `cache_control` breakpoints (default off — without breakpoints there is nothing explicitly breakpointed to refresh; pair with `assumeTtl`/`intervalMs` when your relay owns the breakpoints). File twin: `cacheKeepalive.armWithoutBreakpoints`. |
| `BILI_CACHE_KEEPALIVE_INTERVAL_MS` | Absolute ping interval in ms; wins over `ttlFactor`, `assumeTtl`, and detected tier. Use for a fixed cadence regardless of the upstream's TTL policy. File twin: `cacheKeepalive.intervalMs`. |
| `BILI_CHAIN_CONTENT` | Set `1` to turn ON the ACP-artifact / `<bili-chain …/>` checkpoint **body-content** detection of bili→bili chain awareness (#1086/#1421): when an inbound request carries compression artifacts (render tags / historical `acp_status`+`search_context` tool calls) or a digest-bearing checkpoint in its BODY but neither the `x-bili-hop` header nor local compression state for its session, bili records an advisory observation and/or applies first-processor-wins passthrough. **Default is OFF** (#1683 follow-up): by default ONLY the `x-bili-hop` header drives chain recognition, because scanning the request BODY can false-positive on CCR/file-introduced text and model-echoed tags that look like real markers. Enable it only for the narrow multi-bili relay case where an intermediate box strips `x-bili-hop` and you accept that false-positive risk. `"chainContentDetection": true` in the config file does the same; the env var wins. The `x-bili-hop` signal itself is unaffected by this switch. |
| `BILI_CHAIN_STAMP` | Set `1` to turn ON egress emission of the **model-visible** `<bili-chain …/>` chain-integrity checkpoint carrier (#1683, default OFF): when enabled, every request THIS instance actually processes leaves with a digest-bearing stamp so a downstream bili applies first-processor-wins even when the `x-bili-hop` header was stripped in transit (#1421). The carrier lands in a slot the terminal model also reads (a trailing `user` message on OpenAI/Responses, a trailing text part on Anthropic/Google), so models treat it as phantom user input and burn tokens commenting on it — which is why it is off by default. Enable it only for the narrow multi-bili relay case where `x-bili-hop` is stripped by an intermediate box and the digest-verified body-stamp is the sole guard against double-processing. Independent of `BILI_CHAIN_CONTENT` (inbound body-detection is also default OFF) and of the `x-bili-hop` passthrough, which works either way. `"chainEgressStamp": true` in the config file does the same; the env var wins. |
| `BILI_CHAIN_MAX_FUTURE_SKEW_MS` | Maximum future skew (ms) tolerated when validating a chain checkpoint's `issued-at` timestamp (#1395 step 2): a checkpoint stamped more than this far into the future is judged `stale` (replay / clock skew) even when its digest verifies. Default `120000` (2 min); non-numeric or non-positive values fall back to the default. Step 2 is shadow-only — these knobs tune verdict logging, never forwarding. |
| `BILI_CHAIN_RECENT_WINDOW_MS` | Recency window (ms) for chain-checkpoint validation (#1395 step 2): a checkpoint older than this is judged `stale`. Default `600000` (10 min); non-numeric or non-positive values fall back to the default. Step 2 is shadow-only — these knobs tune verdict logging, never forwarding. |
| `BILI_CONFLICT_SCAN` | Set `0` to disable third-party compression plugin detection (#1206). On by default: bili scans the client's own plugin/extension registries — opencode global + project `plugin` arrays, pi global + project `.pi/settings.json` `packages`, omp `config.yml` `extensions`, claude settings `enabledPlugins`/`plugins` + its plugins dir, kimi `plugins/installed.json`, hermes plugins dir, dsh profile dependencies — for another compressor co-resident with bili. Two tiers: **known conflicts** (`opencode-acp`, legacy `billion-context-pi`) and **keyword-suspected** entries (names matching compress / compact / acp / summar* / context*; bili's own entries are always skipped, and non-compression tools like `context7` do not match). Findings surface as launcher stderr lines before client start, a one-time proxy warn log on each session's first request, and the session's conflict ledger — visible in `acp_status`'s `COMPRESSION CONFLICTS` section, aggregated at `GET /__bili/stats` → `conflicts`, and shown as a web-UI banner. The banner is an alarm for interception **failure** (#3235): it pops only when landed-unrecovered evidence exists (a confirmed third-party compressor, an inferred client-native landing, or an unexplained history-rewrite signal) — recovered (intercepted+rebased) landings and suspected/sibling stock stay recorded but quiet. It offers a persistent don't-show-again (localStorage watermark that re-arms automatically on any newer event) and copy-diagnostics / report-on-GitHub buttons riding the generic #3040 diagnostics facility. Runtime interference evidence (unannounced history rewrites #1001, orphan-block deactivations) feeds the same ledger. The scan is read-only, best-effort, 5-minute cached, and never blocks or modifies client config. |
| `BILI_UPSTREAM_PROXY` | Upstream proxy for the proxy's own outbound connections — highest priority among the *global* sources (above the Web UI manual proxy and the config-file `proxy`). A per-URL `providers.<url>.proxy` still wins for its matching provider URL. See [`proxy`](#server-settings) under Server Settings for the full resolution order, loop prevention, and examples. |
| `BILI_INHERITED_HTTP_PROXY` / `BILI_INHERITED_HTTPS_PROXY` / `BILI_INHERITED_ALL_PROXY` / `BILI_INHERITED_NO_PROXY` | Not user-facing — set automatically by the launcher when it spawns the proxy (#1012). The launcher strips the shell's proxy vars from both the client and the proxy child (clients must send to bili; the proxy must not have its model egress hijacked by a shell proxy), but it forwards the user's pre-strip proxy under these names so the proxy's **auxiliary egress** (MITM blind tunnels — client-side MCP/web traffic) can still ride the user's VPN. They feed only the blind-tunnel fallback tier: explicit routes / global `proxy` / `BILI_UPSTREAM_PROXY` / explicit `"upstreamProxyMode": "direct"` all still win, and a value pointing at bili's own port is dropped. Model egress is unaffected (stays direct unless explicitly configured). |
| `BILI_ATTACH_HEALTH_DEADLINE_MS` | Health-wait deadline (ms) for dsh/opencode attach verification when the attach target is down but this process's model channel is **pinned** to it (routed `/bili/…` model traffic was observed against it): bili waits for the target to come back instead of spawning a second instance — a spawn would split the session (model traffic stays pinned, bili tools would 404 against the other instance). When the deadline elapses it fails loudly and keeps re-checking on every model request until the target returns (default `15000`). See #1365. |
| `BILI_ATTACH_EVIDENCE_GRACE_MS` | Grace window (ms) during which a dsh/opencode attach verification probing a dead target waits for routed-channel evidence to appear before falling back to the legacy spawn path (covers the decision-before-first-request race: the probe fails at t≈0 while the first model request lands at t≈1s) (default `5000`). See #1365. |
| `BILI_SILENT_DIRECT_MAX_MB` | Ceiling (MiB, > 0; fractions allowed) for the raw-body byte guard that refuses direct model requests locally with a 422 when the plugin's live-state slot is missing or request attribution is lost (#5405/#5408). The guard counts RAW bytes — base64-inflated media included — so image-heavy sessions can legitimately exceed 2 MiB; default `8`. Invalid values fall back to the default. See #5405, #5826. |
| `BILI_SPAWN_WAIT_MS` | Initial health-wait window (ms) for a freshly spawned proxy child before the launcher logs `still starting up` and extends the wait (default `20000`). Widen it when the proxy's pre-bind open path runs long: a large `index.db` opens whole-DB before bind (integrity check, WAL recovery — see #4939), and two lanes sharing one store cold-starting together contend for the SQLite write lock (observed 28s+ to first log line, 60s+ with zero output, on Windows with a 1.7 GiB store). Non-numeric or non-positive values fall back to the default (same `envMillis` contract as #1365). |
| `BILI_SLOW_START_GRACE_MS` | Slow-start grace (ms) beyond `BILI_SPAWN_WAIT_MS` for a spawned child that is still ALIVE and starting (#2187: Windows spawn windows of 26-45s from AV / first-run disk activity; a large or contended shared store can push total pre-bind time past 60s). The total spawn budget is the sum of the two knobs; a child that EXITS still fails fast (default `40000`). |
| `BILI_PERSIST` | Set `0` to disable session persistence (in-memory only, lost on restart). |
| `BILI_PERSIST_DEBOUNCE_MS` | Debounce window for persistence writes to disk, in ms (default `500`). |
| `BILI_PERSIST_TAIL_TOKENS` | Token budget for the persisted conversation snapshot (#401). The disk record stores the **folded view** (block summaries in place of compressed ranges) truncated to the newest messages within this budget — never the raw full history. Default `16384`; `0` disables message persistence entirely (block summaries and compressed originals still persist; `bili export` falls back to block-only rendering). Live in-memory sessions are unaffected — `bili export` of a live session is always complete. |
| `BILI_PERSIST_ZSTD` | Set `1`/`true` to enable zstd compression of session files (#1080, owner decision: **default off** — plain JSON maximizes recoverability: jq/grep-debuggable, and immune to the downgrade tail risk). When enabled, every session file that actually shrinks is written as `BILIZSTD1` — a small header (magic + format version + mode byte) over the JSON body, zstd-compressed on Node ≥ 22.15 and stored raw on older runtimes; readers accept both bodies (native zstd, else the bundled WASM fallback), so files stay readable across runtimes and versions. Payloads the framing cannot shrink (tiny sessions) and key-less raw bodies stay bare JSON on disk. Independent of `BILI_ENCRYPTION_KEY` — with both active, the compression choice is recorded in the mode byte inside `BILIENC1`. Existing plain-JSON files are NEVER rewritten at boot (downgrade safety — a mass re-encode would make rolling back to an older bili read its own writes as "corrupt"); they convert organically on their next save. Note: once a session has been saved as `BILIZSTD1`, an OLDER bili (< 0.1.135) cannot read it — this caveat applies only to deployments that opted in; unset or any other value keeps plain JSON. |
| `BILI_STORAGE_UNIFIED` | Tiered storage-migration switch (#2671). Config-file tier: `{"storage":{"unified":"legacy|shadow|full"}}` selects the same modes (strict spellings) and applies whenever the env is unset; `BILI_STORAGE_UNIFIED` (which also accepts `1`/`true` = shadow and `unified` = full) always wins over the file. The mode is resolved once per lane boot — hot edits to the file take effect on the next restart. Set `1`/`true` to enable the **unified SQLite storage dry-run** (Phase 1). Every session write is double-ingested into `<sessions-dir>/index.db` (engine resolution order since #2833: built-in `node:sqlite` when the runtime provides it (Node >= 22.5) -> an already-installed host `better-sqlite3` native module -> a previously self-downloaded cached copy -> a one-time self-download of the pinned `better-sqlite3` prebuilt tarball from the npm registry (~11 MB, sha512-verified, gated by `storage.sqliteAutoDownload`, unsupported platforms never download; engine artifacts are pinned per Node major (Node >= 22: better-sqlite3 v13; Node 20: v12.9.0 plus its ABI-keyed prebuild), and a runtime no pinned artifact serves is refused before any load, with neither the download nor a cached copy registered, since loading such a binding crashes the process (#3341, #3894)) -> none, in which case the sidecar stays legacy-only per the #2825 degrade contract; engine acquisition never depends on the host's install-time build-script approval) and the unified replay is digest-reconciled against the legacy load view — a mismatch logs `[storage] unified shadow DIGEST DRIFT …` and never blocks or alters the write path (legacy files stay the single source of truth). Set `full`/`unified` to enable the **drop-in read path** (Phase 1.5): `loadSync`/`boot`/`loadAll`/`loadStateForSearch` go unified-first — a legacy-file session is organically imported into the index on first open (`[storage] unified import on first open: …`) and later loads are served from `index.db`, with automatic fallback to the legacy file on any unified failure. Legacy files keep being double-written, so **rollback = unset the knob** (env and/or file value). Hard encryption opt-out: while `BILI_ENCRYPTION_KEY` is active the whole sidecar refuses to open (index.db would hold cleartext ingest payloads; a `unified sidecar DISABLED` warning is logged and the store stays legacy-only). Enumeration/GC and the web session list remain file-backed; `removeLegacyFile` now also deletes the index rows and releases CAS refcounts. Digests treat the last-writer `biliVersion` stamp and wall-clock timestamps as environment (`__VER__`/`__TS__`), everything else must match byte-for-byte. The index write path NEVER gives up: failed ingests are logged (with file + error detail on the first failure) and every subsequent save retries the real write — no self-disable, no cooldown, no fallback mode (2026-10-30 owner policy), while the JSON envelope keeps serving reads meanwhile. **Replica/checkpoint REST (Phase 2)**: on any unified lane (shadow or full), `POST /__bili/replicas {sessionId, label?, pinned?}` freezes the session's persisted state as one content-addressed checkpoint blob + row (the resident session is flushed first), `GET /__bili/replicas[?sessionId=]` lists them, `GET /__bili/replicas/<cpId>` returns detail + byte length, `POST /__bili/replicas/<cpId>/restore {sessionId?}` materializes the checkpoint as a NEW first-class session through the normal dual write path (JSON + unified ingest; `meta.restoredFrom`/`restoredCheckpoint` record provenance), and `DELETE /__bili/replicas/<cpId>` drops it. Pinned checkpoints hold a CAS refcount and survive `deleteSession` GC (the whole point: a copy taken before a destructive experiment outlives it); explicit DELETE still removes even pinned ones. Disk expectation: shadow/full roughly doubles unique-content bytes (every session has a JSON file AND index.db rows sharing a content CAS with no dedup across the two stores) and there is no auto-VACUUM — size the sessions dir accordingly while the migration runs. Legacy-only lanes answer 501 with the knob hint. Routes are loopback-only like the rest of `__bili`. Defaults to `full` when unset (#3818). |
| `BILI_PERSIST_EPERM_ALERT_THRESHOLD` | N consecutive persist write failures (`EPERM`/`EBUSY`/`EACCES`) on one session before the one-time "add this dir to antivirus exclusions" alert fires (default `5`). Windows only. See [Windows: exclude the sessions dir](#windows-exclude-the-sessions-dir-from-antivirus-362). |
| `BILI_PERSIST_EPERM_ALERT_REPEAT_MS` | Re-alert window for the persist EPERM alert, in ms. `0` (default) = alert once then stay silent; `>0` = re-alert at most every that many ms while the failures continue. |
| `BILI_TUNNEL_ALLOWED_HOSTS` | `/bili/<absolute-url>` tunnel admission for **remote clients** (#409): comma-separated `host` or `host:port` entries that unlock loopback/private destinations (e.g. a LAN relay or the machine's own sglang) for non-loopback clients. The proxy itself and link-local/metadata addresses are always denied; local (loopback) clients always pass. |
| `BILI_MAX_SESSIONS` | Max sessions held in memory (default `256`; LRU eviction — disk is the source of truth). |
| `BILI_ROLLOUT_SNAPSHOT_RENDER` | Snapshot render (#3756): set `1` to render the outbound history prefix from the server-side unified-storage transcript instead of the client-resent bytes. Active only when the session has live fold blocks AND unified storage is readable; otherwise every request falls back to the legacy path unchanged. Kills the #3752/#3751 id-churn class: anchor coverage follows block seqs + content signatures, so codec/identity upgrades, client checkpoints and host compactions can no longer drop or duplicate folded history. Per-feature form of `BILI_ROLLOUT_<FEATURE>` (default 0% rollout). |
| `BILI_SESSION_WARM_MAX` | Bounded startup (#2803): max most-recently-saved sessions hydrated at boot before listening (default `0` = warm none, capped by `sessions.max`); older state reloads on demand. Set e.g. `8` to restore eager warming of the recent set. File twin: `sessions.warmMax`. |
| `BILI_SESSION_WARM_MAX_BYTES` | Decoded-byte budget for the boot warm set (#2803; default `67108864` = 64 MiB). Counts DECODED size, not compressed on-disk bytes, so zstd archives cannot sneak past the RAM bound. A single file over the budget is never warmed. File twin: `sessions.warmMaxBytes`. |
| `BILI_SESSION_RESIDENT_MAX_BYTES` | Soft target for estimated resident session bytes (#2803; default `4294967296` = 4 GiB, raised from 512 MiB in #5779). Active/in-flight state stays pinned above it (the byte budget limits the idle cache, not active workload); when over target, idle state discharges back to disk as requests complete. File twin: `sessions.residentMaxBytes`. |
| `BILI_SESSION_RESIDENT_HARD_MAX_BYTES` | Per-session hard cap on estimated resident memory (#4788, decision #4792 D1-A). Why it exists: the pool soft cap above can only pull OTHER idle sessions out of memory to stay under budget — with a single long-lived session there is nothing left to evict, so one conversation grew a ~2 GiB working set off a 58 MiB inbound stream (#4788 baseline). This cap bounds ONE session by itself: whenever a request has finished and the turn's save has provably landed on disk, the session's own resident estimate (the same number `GET /__bili/memory` reports) is compared against the cap; over it, the droppable fields — folded-block original contents, metadata bookkeeping, the unbounded part of the raw message tail — are forced back to disk even though pool eviction would exempt the session, and a warning is logged once per minute per session. Nothing is lost: each dropped field re-materializes on first use from a NARROW disk read (only that field, not the whole record), so the next turn pays one small read instead of carrying megabytes resident. Drops gated by a landed save already run at every request boundary regardless of the cap; the cap decides when a single session is called out for exceeding its own budget. Default: equal to the pool soft cap (`4294967296` = 4 GiB; raised from 512 MiB in #5779); set lower (e.g. `53687091` = 64 MiB) to hold one busy long-running session under a personal ceiling. `0` disables the cap check. Compression state (`state`) and the media content store are non-droppable by design and are untouched by this path. File twin: `sessions.hardMaxBytes`. |
| `BILI_PUBLIC_SNAPSHOT_CAP_BYTES` | Retention cap (bytes) for the raw wire-history snapshot kept per plugin session to serve the public fork API (#2017). A plugin session whose serialized snapshot exceeds the cap stops being forkable — `GET /__bili/plugin/snapshot` and `POST /__bili/plugin/fork` fail closed with `409` and the capped reason — instead of retaining an unbounded raw copy of the history forever. The cap is re-evaluated on every plugin model request: a session that shrinks back under the cap (after a fork trimmed it, or the host shrank the history) resumes being forkable. Default `104857600` (100 MiB); `0` disables retention entirely (no session is forkable; existing snapshots are dropped on the next request). File twin: `plugin.snapshotCapBytes`. |
| `BILI_SESSIONS_DIR` | Directory for persisted session state (default XDG data dir). |
| `BILI_SESSION_GC` | Cleanup of stale session files (#1082) is **opt-in**: set to `1`/`true`/`on` to enable — off by default, because session files are user data (exportable, resumable) and there is no silent deletion policy. When enabled, the sweep (boot + hourly) deletes a file only when BOTH conditions hold: older than `BILI_SESSION_GC_MAX_AGE_DAYS`, AND small in the lossless sense — the session was **never compressed** (zero folded blocks) and its newest request body ≤ the token ceiling below, so resuming it costs one cold rebuild from the client's own history and nothing else. Safety rails: compressed sessions are NEVER deleted (their summaries cannot be rebuilt losslessly); a session still held in memory is skipped unless idle since its last disk write; unreadable/corrupt files are left in place; every deletion is audit-logged individually (path, size, age) plus one summary line per non-empty sweep; only the sessions dir is ever touched; emptied protocol subdirectories are removed. Note the resident guard is per-process: another proxy instance sharing `BILI_SESSIONS_DIR` that does not persist (e.g. `BILI_PERSIST=0`) never refreshes file mtimes, so its still-live session files can age out and be swept — the cost is the same bounded cold rebuild, backstopped by the age gate. CCR content stores (#1097) share the session's lifecycle (#1180): a `<hash>.content-store.json` companion is deleted together with its session file, an orphaned companion (session file already gone) is swept once past the age gate, and an unreadable companion keeps its session file too (never guessed at). |
| `BILI_SESSION_GC_MAX_AGE_DAYS` | Minimum age (days) before a session file becomes a GC candidate (default `7`). Keep it far beyond any plausible resume window: after deletion a resumed session restarts message numbering from m00001 while a resuming agent's transcript may still cite old numbers (kernel contract: ids are never reused). |
| `BILI_SESSION_GC_MAX_TOKENS` | Size ceiling (tokens) for GC eligibility (default `1000000` = 1M, owner-set in #1082). Judged against the **decoded** context, never file bytes (encrypted/zstd files are far smaller on disk): the token estimate of the newest request body (`rawInputTokens`, recorded per turn) wins when present; unrecorded legacy files use `stats.contextTokens`; and the companion content store's footprint (#1097: unique-content via the kernel's CJK-aware `defaultCountTokens`, same estimator as `rawInputTokens`, #1180) is added on top, so a small session carrying a huge store does not slip under the ceiling. Applies only to never-compressed sessions — files with folded blocks are always kept regardless of size, since their summaries cannot be rebuilt losslessly from a re-send. |
| `BILI_SESSION_GC_INTERVAL_MS` | Background GC sweep interval in ms (default `3600000` = 1h). A sweep also runs once at boot. |
| `BILI_ENCRYPTION_KEY` | Encrypt session files at rest (#708) for deployments on untrusted nodes. Exactly 32 bytes, hex (64 chars) or base64; unset = unencrypted plain-JSON files (or `BILIZSTD1` when `BILI_PERSIST_ZSTD=1` — see `BILI_PERSIST_ZSTD`). When set: every session file is written as `BILIENC1` AES-256-GCM over JSON that is zstd-compressed only when `BILI_PERSIST_ZSTD=1` (zstd on Node ≥ 22.15, raw body otherwise) — enabling compression also shrinks the file ~5–10×. Encryption and compression are now independent knobs (#1080). The key comes ONLY from this environment variable — never written to disk or logs — so keep it out of the same filesystem's reach. Invalid values abort startup (fail fast, never silently unencrypted). Booting with the wrong key skips the affected sessions as corrupt (logged, no crash). Losing the key makes encrypted sessions permanently unreadable. Symmetric by design (the same process encrypts and decrypts). Existing unencoded files are never rewritten at boot — they encrypt organically on their next save (downgrade safety; see `BILI_PERSIST_ZSTD`). Threat model (#708, owner-confirmed): it defends against **offline/mechanical** file acquisition — provider disk swaps, offline disk snapshots after node-image drift, stolen volumes, leaked backups, cloud-synced state dirs — where an offline third party cannot read the content without the key. It does NOT defend against targeted adversaries with live access to the node; for that tier move the trust root out of the proxy (KMS / TEE / confidential VMs, hardened permissions) instead of solving it inside the proxy — at that level far more than the key is exposed, so proxy-level key handling is not the boundary to hold (`BILI_PERSIST=0` disables persistence entirely). Double-encrypting the key with a second key from the same process/environment adds nothing: in every offline-theft scenario the attacker lacks exactly one artifact — your off-disk secret — whether it is called the data key or the wrapping key; only a wrapping key in a different trust domain (KMS/TPM/TEE) raises the bar, and that is scenario 2 above. |
| `BILLION_CONTEXT_PROXY` | Exported by the launcher; client-side bili plugins/extensions detect it and self-disable their own compression (no double compression). |
| `PI_PROXY_ANTHROPIC` | Exported by the `bili omp` launcher (only when neither `PI_PROXY` nor `PI_PROXY_ANTHROPIC` comes from the user's environment): points OMP's Cowork anthropic transport at the proxy so those requests ride the compressible lane instead of node:https direct (#2583/#3556). User-set values always win. |
| `BILLION_CONTEXT_PLUGIN` | Set `0` to disable plugin mode entirely (wire-level tool injection resumes). |
| `BILI_LAUNCHER_MODEL_WINDOWS` | Internal: the launcher hands the client's own per-model context windows (pi `models.json`, omp `models.yml`, opencode `models.<id>.limit`, codex `model_context_window`) to the spawned proxy as JSON, so the nudge denominator matches the real window for self-hosted models. Only the launcher sets it — no user configuration. |
 | `BILI_LAUNCHER_LANE` | Internal: the launcher hands its client's lane name (pi / codex / claude / …) to the spawned proxy, which records it in the instance file (#1225). Reuse is identity-based: two instances with *different declared* lanes never attach to each other; an instance without a declared lane is a manually-started user-zone daemon — attachable by default (#1660). Only the launcher sets it — no user configuration. |
| `BILI_LAUNCHER_PLUGIN` | Set `0` to disable the launcher's bili MCP server injection for claude/codex (pure wire mode); `1` forces plugin mode. Default: injected — except codex with a local/private upstream (sglang/vllm/ollama cannot parse codex's namespace tool type, so bili auto-falls back to wire tools there). See [Launcher Reference](#launcher-reference). |
 | `BILI_LAUNCHER_DIRECT` | Set `1` for direct-URL routing in the launcher (drop MITM/CA trust). See [Launcher Reference](#launcher-reference). |
 | `BILI_NATIVE_ATTACH_EXTERNAL` | Attach-gate escape hatch (#1335). Lane'd native hooks attach to a running proxy only when it reports an armed session-lifecycle watchdog (`watchdog.armed == true` in `/__bili/health`) — an unarmed *lane'd* proxy (a crashed session's orphan, or an instance whose lifecycle state cannot be verified) is refused loudly instead of being silently ridden. #1660: a **manually started `bili start` daemon** (no lane, no launch token) is user-zone by definition — an **armed** user-zone daemon (a managed shared proxy, #1225) is still ridden by any compatible client lane, but an **unarmed** manual daemon is, by default (`attachPolicy: "own-lane"`, #2877), NOT ridden by a LANEd hook, which spawns its own instead; set `attachPolicy: "global-fallback"` to restore the pre-#2877 behavior where native hooks attach to a manual daemon by default. Set `1`/`true` to also attach to *lane'd* unarmed listeners anyway: any code/lane-compatible listener becomes attachable regardless of watchdog state (including pre-#1330 builds that report no `watchdog` field at all). `"native": { "attachExternal": true }` in the config file does the same; the env var wins over the file value. Note: `attachExternal` governs only the *lifecycle gate* for **lane'd** daemons — it does not open or close attachment to a user-zone (manual) daemon; that axis is `attachPolicy` / `attachUrl`. Default is closed (for lane'd instances). Full mechanics (reuse rules, listener table, escape hatch): [TECHNICAL-NOTES.md](TECHNICAL-NOTES.md#proxy-reuse-and-the-attach-gate-1225-1335-1232-1660). |
 | `BILI_ZCODE_ROUTE` | zcode native-plugin routing scope (#1622): `all` (default — every provider entry with a usable http(s) baseURL rides compression, pi/dsh parity), `plans` (pre-#1622 bigmodel coding-plan whitelist), `none` (opt out; the bootstrap leaves the store direct). Compat escape hatch — there is **no** file equivalent; routing is on by default. |
 | `BILI_ZONE_PORT` | Base of the self-managed port zone (#1660, default `18787`): every *lane-spawned* proxy (claude/zcode native hooks, launcher lanes riding port 0) tries the lane's sticky record first, else this base; port collisions resolve via the child's +1 ladder — except when the holder is a same-lane predecessor running a different build (an upgrade-restart overlap), which the child waits out (up to 5s) and then rebinds the SAME port instead of drifting (#1723) — and the settled port is recorded sticky under `<state>/port-zone.json` so later launches follow drift automatically. Manual `bili start` keeps its own default (`8787`) — the user zone is never touched by lanes. |
 | `BILI_ZCODE_PORT` | Pin an **exact** port for the zcode native lane's proxy (#1660): the launch becomes strict-port — a squatter is refused loudly instead of hopping — and wrappers written into the shared store survive session restarts even without handoff. Without it the lane rides the self-managed zone (`BILI_ZONE_PORT` base + sticky drift following). |
 | `BILI_ZCODE_SIGNING_FIXED` | `1`/`true` = assume your ZCode build fixed ClientRequestSigningV4 (#1621): the per-entry skips for coding-plan accounts on v3.14+ personal stores flip off and they route again. Temporary escape hatch — there is **no** file equivalent. |
 | `BILI_CLAUDE_UPSTREAM` | claude direct mode: your relay endpoint, when `ANTHROPIC_BASE_URL` already points at a relay the launcher would otherwise bypass. |
 | `BILI_CLAUDE_NATIVE_PORT` | Pin an **exact** port for the claude native lane's hook-spawned proxy (#964/#1660): strict-port semantics — a squatter on the port is refused loudly instead of hopping — and the baked managed `ANTHROPIC_BASE_URL` points at it. Without it the hook rides the self-managed zone (`BILI_ZONE_PORT` base + per-lane sticky) and re-pins the managed URL to the live origin each session, so port drift self-heals (#1660). |
| `BILI_CODEX_COMPACT` | Codex native-compaction handling. Default `intercept`: bili intercepts codex's compaction requests and forges a local handoff to the ACP state when the safety gate passes (transform ok + steady-state usage < 90% of the window + at least one active compressed block) — trigger form forges a 2-frame SSE, endpoint form forges `{output}` — and never contacts upstream. Scope (#3008): covers the explicit forms (compaction_trigger + /responses/compact) and the inline auto-compact that transits as an ordinary turn, detected by its SUMMARIZATION_PROMPT template — a user-overridden compact_prompt falls out of detection and transits verbatim; a compaction bili only observed (pass/gate) is rebased post-hoc (#2372). Forged ACP summaries are re-injected as a history-borne handoff message (developer-message fallback) so compressed content stays visible after codex truncates its history. Set `pass` to opt out and forward codex's compaction requests upstream (native compaction backstops). On any gate failure the request passes through untouched. Codex client detection (which traffic this applies to, also used for window clamping and session-identity fingerprinting): the User-Agent must either start with a registered prefix (`codex_cli_rs/`, `codex_exec/`, `codex desktop/` — matched case-insensitively, since variants like Codex Desktop send an initial capital, #1169) or contain a whitespace-delimited component starting with lowercase `codex` (unknown variants such as `codex_sdk_ts/…`, #645 — narrowed from a bare substring to a token-level prefix in #1641 so non-codex clients whose UAs merely mention "codex" mid-token or in parens are no longer misclassified; the fallback stays case-sensitive on purpose so "Codex"-shaped relays are excluded, #1106). |
 | `BILI_CODEX_STATE_MODE` | codex state handling (#2222, #3203). Default `auto`: when the codex binary honors `CODEX_SQLITE_HOME` (codex-cli ≥ 0.147.0, probed via a cached `--version` call), bili points it at the REAL `$CODEX_HOME` — codex keeps its WAL-mode state db on the SINGLE physical path in the real home, shared live across bili and native runs. Each launch takes its own per-session overlay slot from a bounded pool (`<CODEX_HOME>-bili-s1..s16`): the generated files (.env, config.toml) and the proxy binding are per-slot, so up to 16 independent sessions run concurrently on one `$CODEX_HOME`, each routing through its own proxy running on its own lane (`codex-s<N>` — two same-build launches sharing one lane would refuse each other at the port layer, #3044). Slots persist and are reused — never auto-deleted, because cold-start thread records resolve through them (#43bf59fc9) — so a crashed session's slot is simply reclaimed by the next launch. With no per-launch db copy there is no exit-time merge-back and no `.bili-conflict` generations (the #381/#1917/#1918/#1919/#1951/#1965/#2195 patch family retires in this mode). The pre-#3203 fixed-name `<CODEX_HOME>-bili` overlay migrates back into the real home exactly once, on the first shared-mode launch, under the same provenance adjudication; a launch is refused while a live legacy-era launch still holds it. `shared` forces this mode (degrades loudly to legacy when the binary is too old); `legacy` forces the old per-launch copy / merge-back mechanism with its single exclusive overlay (one launch at a time). Env-only escape hatch — there is **no** file equivalent. A user-set `CODEX_SQLITE_HOME` is honored as-is (native and bili runs must share one logical db); a managed requirements.toml `sqlite_home` wins over both. |

---

## Upstream Failure Diagnostics (proxied upstreams)

Every upstream transport failure is classified into a `kind=` that leads its log line (and the `error:` string clients/status see), each with a remediation hint (`hint=...`). The taxonomy (#1263):

| kind | meaning | bili behavior |
|------|---------|---------------|
| `client-abort` | downstream client disconnected | nothing (request dead by definition) |
| `upstream-timeout` | idle budget expired (headers/body) or request-watchdog abort | **not retried** — never stack wait budgets |
| `connect-timeout` | TCP handshake never completed (endpoint unreachable/blackholed) | transparent replay, bounded by `BILI_REPLAY_RETRY_MAX` |
| `proxy-reset` | connection died pre-response **through a proxy** (prime suspect: proxy idle-recycle / payload cap / node churn) | transparent replay, bounded by `BILI_REPLAY_RETRY_MAX` (default 3 total attempts) |
| `upstream-reset` | same, direct connection (suspect upstream/local network) | same (bounded by `BILI_REPLAY_RETRY_MAX`) |
| `connect-refused` | TCP refused (the proxy when configured, else upstream) | same (bounded by `BILI_REPLAY_RETRY_MAX`) |
| `upstream-unreachable` | no route to the host (ICMP `EHOSTUNREACH` / `ENETUNREACH` / `EHOSTDOWN`) — routing / ACL / firewall `REJECT`; on macOS also the Local Network privacy denial (#5663) | same (bounded by `BILI_REPLAY_RETRY_MAX`) |
| `dns` | name resolution failed (DNS server / hostname typo) | transparent replay, bounded by `BILI_REPLAY_RETRY_MAX` |
| `tls` / `unknown` | TLS/handshake failure (CA/MITM) / unclassified transport failure | not retried |

Handshake-class resilience is paired with a keep-alive cap for proxied connections (`BILI_PROXY_KEEPALIVE_MAX_MS`, default 55s) so bili stops offering proxies sockets they are about to recycle.

**Four-step checklist** when long sessions show periodic connection failures (from #1249):
1. Grep `bili.log` for `kind=` — `proxy-reset` clusters implicate the external proxy; `upstream-timeout` implicates upstream health.
2. Align timestamps of the failing requests with the external proxy's own access log (same host clock) — a recycle entry at the same millisecond closes the case.
3. Confirm which hop: `proxy=<url>` vs `proxy=direct` in the same line; check request body size (`content-length` of the forwarded request) against the proxy's documented payload cap.
4. If the proxy is the recycler, either raise its idle timeout or leave bili's 55s reuse cap + one-replay safety net to absorb it.

**Host-side retry layering (#2568 item 4).** When a plugin host runs behind bili (e.g. `bili pi`), pre-response transport failures can be retried by TWO independent layers that cannot see each other's counters:

1. bili's transport replay above (≤ `BILI_REPLAY_RETRY_MAX` attempts, `BILI_REPLAY_RETRY_BASE_MS`×2ⁿ backoff) on the bili→upstream leg;
2. the host's own turn-level retry budget on the host→bili leg (pi: `retry.maxRetries`, default 3, base delay 2s exponential; fires when the surfaced error text matches its transient-pattern table).

The layers deliberately overlap on connect-class failures rather than one yielding to the other: bili's fast local replay absorbs millisecond blips before the host re-runs its whole turn pipeline, and the host layer still protects turns when `BILI_REPLAY_RETRY_MAX=1` (fail-fast). Consequence for a fully dead upstream: worst case per user-visible turn = (host attempts) × (bili attempts) connections — with defaults 4 × 3 = **12**, with ≈30–35 s of nested backoff before the error surfaces. Both budgets are finite fixed counts, so the worst case stays bounded.

Correlating the two logs while debugging: each bili transport replay logs `[<session>] [acp-proxy] upstream <kind> (pre-response network failure): <error>; retrying in <ms>ms (attempt n/m)` (warn level, `bili.log`); pi emits `auto_retry_start` / `auto_retry_end` events per turn retry (status lines in the interactive TUI). Match them by session id + timestamp window — there is no shared correlation id between the layers.

## CLI Reference

Full command surface (`bili --help` prints an abridged version). Precedence everywhere: **CLI flag > env var > config file > built-in default**.

| Command | What it does |
|---|---|
| `bili [start] [options]` | Start the proxy (reads the XDG config file by default) |
| `bili pi [opts --] [args]` | Start a proxy + launch **pi** against it |
| `bili pi-test [opts --] [args]` | Like `bili pi`, but adds `--no-extensions` (clean-room test — the proxy owns compression) |
| `bili codex [opts --] [args]` | Proxy + **codex** |
| `bili claude [opts --] [args]` | Proxy + **claude** (Claude Code CLI) |
| `bili omp [opts --] [args]` | Proxy + **omp** (pi-based) — opencode zen models ride the default `opencode.ai` MITM whitelist (#1405) |
| `bili opencode [opts --] [args]` | Proxy + **opencode** — built-in zen gateway (`opencode.ai`) cert-MITM'd by default (#1405); hosts declared in `~/.config/opencode/opencode.json` / `~/.omp/omp.json` `providers[].baseURL` join the MITM whitelist automatically (#1411), and `~/.aider.conf.yml` / `~/.config/opencode/.aider.conf.yml` are watched for the same purpose |
| `bili hermes [opts --] [args]` | Proxy + **hermes-agent** (`/bili/` rewrite) |
| `bili dsh [opts --] [args]` | Proxy + **deepseek-harness** (non-loopback upstreams via proxy envs, loopback via `/bili/` rewrite — #535; args like `--profile web "task"` pass through) |
| `bili codebuddy [opts --] [args]` | Proxy + **codebuddy** (Tencent CodeBuddy Code CLI) — `CODEBUDDY_BASE_URL` `/bili/` rewrite, OpenAI chat-completions wire; budget via `CODEBUDDY_AUTO_COMPACT_WINDOW` (#640) |
| `bili qoder [opts --] [args]` | Proxy + **qoder CLI** (`qoder`/`qodercli`) — cert-MITM via `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS`; model endpoint hardcoded https so no `/bili/` rewrite (default host map whitelisted) (#653). Qoder **Desktop** is a separate BYOK/custom channel speaking plaintext OpenAI over a `/bili/` prefix — point it at bili as a normal custom provider (not this MITM lane); official-subscription traffic is encrypted, out of scope (#764) |
| `bili trae [opts --] [args]` | Proxy + **Trae CLI** (ByteDance, closed Go binary) — cert-MITM via `HTTPS_PROXY` + `SSL_CERT_FILE`; model host from `TRAE_CLI_API_HOST` or the default enterprise gateway (#655) |
| `bili jcode [opts --] [args]` | Proxy + **jcode** (Rust agent harness) — env-only cert-MITM launch via `HTTPS_PROXY` + `SSL_CERT_FILE`; hosted model host (`api.z.ai`) whitelisted, local loopback providers stay direct via `NO_PROXY` |
| `bili kimi [opts --] [args]` | Proxy + **Kimi Code** (Moonshot CLI) — cert-MITM via `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE`; provider/model hosts from `~/.kimi-code/config.toml` (`KIMI_CODE_HOME` respected) or the managed OAuth endpoints when none declared; loopback endpoints inventoried with a manual `/bili/` prefix hint (#757) |
| `bili test pi` | Non-polluting end-to-end smoke test of the pi path |
| `bili export [session] [--full] [--jsonl] [--output FILE]` | List persisted sessions / export one as a Markdown handoff (or `--jsonl`: line-delimited JSON dump rendered from the unified index when present, legacy record otherwise — a generated interoperability artifact, never a source of truth) — see [Sessions & Migration](#sessions--migration) |
| `bili acp-cache diff <dump-dir> [--json] [--log FILE] [--no-log] [--session SID]` | Attribute cache misses from `ACP_DUMP_BODY` dumps — prefix-diffs adjacent requests per session (#1266) |
| `bili update` | Check for & install a newer version now (bypasses the 3-minute throttle) |
| `bili plugin install <agent>` | Install the native-tool plugin / MCP bridge into a host — see [Plugin Mode](#plugin-mode-native-tools) |
| `bili plugin remove <agent>` | Remove it again |
| `bili plugin list` | Show install status for every host |
| `bili mcp` | Run the bili MCP server standalone on stdio |
| `bili plugin-register <id> [--origin URL] [--agent name]` | Pre-bind a conversation id to plugin mode (advanced) |
| `bili --version` / `bili --help` | Print version / help |

Anything after `--` in a launcher command is passed through to the client verbatim (`bili pi -- print "hi"`).

### Options

| Flag | Effect |
|---|---|
| `--port <N>` | Listen port (default `8787`) |
| `--host <ADDR>` | Listen host (default `127.0.0.1`) |
| `--config <FILE>` | Path to config JSON (default: XDG location) |
| `--debug` | Verbose logging |
| `--passthrough` | Forward without compression |
| `--no-passthrough` | Force compression on (overrides config) |
| `--no-auto-update` | Disable background self-update for this run |
| `--mitm-domain <domain>` | Extra MITM whitelist entry (repeatable; launcher only) |

---

## Client Integration

Two ways to point a client at the proxy without the launcher: the **`/bili/` prefix** (API-key clients) and **MITM transparent mode** (login clients with hardcoded endpoints).

### `/bili/` prefix (API-key clients)

Clients you configure with an **API key** (not a login) let you change the upstream URL. Prepend the proxy origin + `/bili/` to it — that's the only change. The API key stays in the client config and is passed through untouched.

**OpenCode** — edit `~/.config/opencode/opencode.json`, change the provider's `baseURL`:

```jsonc
// before:
"baseURL": "https://open.bigmodel.cn/api/coding/paas/v4"
// after (prepend the proxy origin + /bili/):
"baseURL": "http://localhost:8787/bili/https://open.bigmodel.cn/api/coding/paas/v4"
```

**OpenCode note.** This is the **no-plugin** path for OpenCode. If the native plugin is also installed over such a config, the runtime warns once per session with a fix-it guide (remove the prefix or remove the plugin); the requests themselves keep riding the plain-proxy path. The three mutually exclusive OpenCode access paths are documented in [CLIENTS.md](CLIENTS.md#opencode).

**Other clients.** The same one-line prefix works for any client whose model base URL you can edit (Cline / Roo Code / Kilo Code, Continue, OpenHands, Zed, Void, Cursor single-model override, …) — verified entry points are listed in [CLIENTS.md → Adopting unlisted clients](CLIENTS.md#adopting-unlisted-clients-any-client-with-a-configurable-model-base-url-2340).
**Codex (API key)** — edit `~/.codex/config.toml`, change the provider's `base_url`:

```toml
# before:
base_url = "https://api.openai.com/v1"
# after:
base_url = "http://localhost:8787/bili/https://api.openai.com/v1"
```

**Codex (ChatGPT login)** — set the top-level `openai_base_url` field (keeps `model_provider = "openai"` and OAuth login intact):

```toml
# ~/.codex/config.toml (top-level field, not a section)
model_provider = "openai"
openai_base_url = "http://localhost:8787/bili/https://chatgpt.com/backend-api/codex"
```

Run `codex login` as usual; the OAuth token travels in the `Authorization` header, which the proxy forwards untouched.

**Pi** — edit `~/.pi/agent/models.json`, change the provider's `baseUrl`:

```jsonc
// before:
"baseUrl": "https://api.anthropic.com"
// after:
"baseUrl": "http://localhost:8787/bili/https://api.anthropic.com"
```

**Claude Code** — set the `ANTHROPIC_BASE_URL` env var to the `/bili/` URL. (The `/bili/` form is the manual option: older claude builds ignored proxy env vars entirely, while newer builds (e.g. 2.1.301) honour `HTTPS_PROXY` — if your environment routes loopback traffic through a proxy, include the loopback hosts in `NO_PROXY` so this URL connects directly instead of being routed back through the proxy (#3446).)

```bash
export ANTHROPIC_BASE_URL="http://localhost:8787/bili/https://api.anthropic.com"
```

**Claude Code on Vertex AI** (`CLAUDE_CODE_USE_VERTEX=1`) — under Vertex the plain key is inert: Claude Code ignores `ANTHROPIC_BASE_URL` and dials `<ANTHROPIC_VERTEX_BASE_URL>/projects/<p>/locations/<loc>/publishers/anthropic/models/<id>:rawPredict|streamRawPredict`, appending that path to the base URL **verbatim** — trailing path and all. Route `ANTHROPIC_VERTEX_BASE_URL` instead:

```bash
export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID=<gcp-project>
export CLOUD_ML_REGION=global
export ANTHROPIC_VERTEX_BASE_URL="http://localhost:8787/bili/anthropic/https://aiplatform.googleapis.com/v1"
```

Three things that URL must get right (each one silently 404s if missed):

- **The `/v1` lives in the base URL.** The client's own path starts at `/projects/…`; Vertex serves `/v1/projects/…:rawPredict` and 404s the version-less form.
- **The `anthropic` segment is required.** With `/bili/<url>` alone the proxy classifies by path suffix, and `:rawPredict` matches no known suffix — the explicit-protocol marker is what selects the anthropic lane.
- **Host and `locations/<loc>` must agree**, and the host follows the region: `global` → `https://aiplatform.googleapis.com`, `us`/`eu` → `https://aiplatform.<loc>.rep.googleapis.com`, any other region → `https://<loc>-aiplatform.googleapis.com`.

Auth is untouched on this lane: Claude Code mints its own ADC access token and bili never mints auth for it. `bili claude` does all of the above automatically — it sets `ANTHROPIC_VERTEX_BASE_URL` to the same routed form and leaves the plain key in place (inert under Vertex, so one launch still works when the provider is flipped off).

> **Auto-compact alignment (manual mode only).** The `bili claude` launcher automatically sets `CLAUDE_CODE_AUTO_COMPACT_WINDOW` to bili's effective window for your model, so claude's own auto-compact threshold lines up with bili's compression budget. In manual `/bili/` mode you must do this yourself — otherwise claude may run its own local auto-compact (a "summarize the conversation" turn) on a threshold that doesn't match bili's window. That is usually harmless (same session-id, so bili re-derives state from the truncation) but noisier than needed. Set it to bili's effective window for your model:
>
> ```bash
> export CLAUDE_CODE_AUTO_COMPACT_WINDOW=<bili effective window in tokens>
> ```
>
> claude clamps this value **down** to the window it perceives for the model (never up), so over-setting is safe. You can also set it persistently via claude's settings (`autoCompactWindow`).

**Other API-key clients** (Cursor / Aider / Continue …) — wherever the upstream URL is configured, prepend `http://localhost:8787/bili/`. Nothing else changes.

The `/bili/` prefix doubles as a **self-detection signal**: billion-context client extensions (billion-context-pi / opencode-acp) recognize it in their own baseUrl and self-disable, so you never get double compression.

### MITM transparent proxy (login clients)

Clients you sign **into an account** (ChatGPT Plus/Pro, Claude, ZCode coding plan, …) authenticate via OAuth and often **hardcode the endpoint** — if you can't change the baseURL, the prefix trick doesn't work. These use MITM mode instead.

How it works: the client only offers an **HTTP proxy** setting, so it sends `CONNECT <host>:443`; billion-context terminates the TLS locally (with a locally-generated root CA), injects compression into the cleartext, re-encrypts and forwards. The OAuth token travels in the client's `Authorization` header, which is forwarded untouched — so the subscription discount is preserved.

Supported MITM clients:

| Client | Login | Endpoint hardcoded | Status |
|---|---|---|---|
| **ZCode** | bigmodel coding plan (OAuth) | `open.bigmodel.cn` (builtin provider) | ✅ tested |
| **Claude Code** | Claude subscription (OAuth) | `api.anthropic.com` | ❓ untested (may not work — needs verification) |
| **CodeBuddy** (VS Code IDE) | IDE account login | `copilot.tencent.com` (reached via `http.proxy`) | ✅ user-verified (#897) |

> **Codex exception:** Codex exposes a top-level `openai_base_url` config field, so the ChatGPT login version CAN use the `/bili/` prefix (see above). MITM is not needed for Codex.

> **ZCode native mode (#1145):** ZCode is the only client in this list that also has a **native plugin mode** — `bili plugin install zcode` routes model traffic through the provider store (`~/.zcode/v2/config.json`, or `provider_config.json` on v3.14+; on v3.14+ builds ZCode's client signing rejects the http loopback origin for the coding-plan accounts, so those stay direct with a logged reason while every other provider still routes — use the GUI cert-MITM setup for compression on those accounts, #1621) and needs no GUI proxy/CA setup at all otherwise. Native mode does not touch the MITM surface: if you run both, keep the GUI proxy settings (and the `"mitm://zcode.z.ai": { "passthrough": true }` route, #661) for login traffic. Full mechanics: [CLIENTS.md](CLIENTS.md) (*ZCode*).

MITM is scoped to a **whitelist** of model hosts (`open.bigmodel.cn`, `api.anthropic.com`, `api.openai.com`, `chatgpt.com`), plus per-lane stock-gateway defaults that discovery auto-seeds where a lane's config exists (e.g. `opencode.ai` — opencode's built-in zen gateway from `opencode auth login`, #1405). All other HTTPS hosts are blind-tunnelled — billion-context never decrypts non-model traffic.

> **CONNECT-only clients (`http.proxy`):** many IDE-class clients (CodeBuddy, Cursor, Windsurf, …) expose no model base-URL setting — they route all traffic through an HTTP proxy via `CONNECT`. Such a client is only decrypted when its model host is whitelisted above (or discovered/auto-whitelisted by a launcher); otherwise its tunnels are **blind**: no error, but also **no compression**, because billion-context never sees the cleartext. This misconfiguration is surfaced explicitly (#897): the first blind tunnel per host logs a one-time `BLIND TUNNEL WARNING` with the fix steps; `GET /__bili/health` and `/__bili/stats` report `blindTunnels` (count + exact target hosts, loopback-only); and `acp_status` gains an `UNDECRYPTED TRAFFIC (instance-level)` section while such tunnels exist. Fix: add the client's model domain to `"mitm".domains` (or `BILI_MITM_DOMAINS`), restart, and trust the root CA per the steps below. Note proxy logs mask non-public target hosts by default (`<private-host>`, #255) — set `BILI_LOG_MASK_HOSTS=0` to see them verbatim in your local log.

One-time setup (trust the root CA in the client):

1. Start the proxy once to generate the root CA:

   ```bash
   bili start
   ls ~/.local/share/billion-context/ca/root-ca.pem   # exists now
   ```

2. In the client's **Settings → Network / Proxy** set:
   - **HTTP Proxy**: `http://127.0.0.1:8787`
   - **Proxy CA certificate path**: the CA file bili actually generated on this machine — `~/.local/share/billion-context/ca/root-ca.pem` on Linux/macOS, `%USERPROFILE%\.local\share\billion-context\ca\root-ca.pem` on Windows. The ZCode card on the web UI's routing page shows the real path on this machine with a copy button — just paste it.
   - (optional) **No-proxy list**: `localhost,127.0.0.1`
   - (For ZCode specifically: **Settings → Network**. Claude Code needs none of this: the launcher routes it through `ANTHROPIC_BASE_URL`, its model traffic is plain http on loopback, and its child env no longer carries `HTTPS_PROXY`/`NODE_EXTRA_CA_CERTS` — setting them yourself only points in-session tools at a proxy they do not need.)

   > **Windows note:** ZCode on Windows does **not** expand `~` — a `~/...` path is not found (independent of the current working directory). Enter the full absolute path, e.g. `C:\Users\<user>\.local\share\billion-context\ca\root-ca.pem` (#342).

3. Restart the client. Its model traffic now flows through billion-context with compression injected. Send a message and check the proxy log (`~/.local/state/billion-context/bili.log`) for `mitm <host>:443 tunnel established`.

> The root CA is generated locally and lives only on this machine; it is **not** a system-wide install. Only the client you configure (via its CA-path setting) trusts it, so no other app is affected. Deleting the CA files and restarting the proxy regenerates them.

To give a MITM login client its **own upstream proxy** (firewall/GFW) without affecting API-key clients on the same host, use the `mitm://` scheme key — see [MITM vs `/bili/` key schemes](#mitm-vs-bili-key-schemes).

---

## Launcher Reference

`bili <client>` brings up a proxy on an independent port (a **fresh instance every launch** — an already-running `bili start` is never reused, #216), then runs the client pointed at it. **No config-file edits**: the client's own config is **read** (never edited) to discover which upstream hosts it talks to; those hosts are auto-whitelisted for MITM so the proxy TLS-terminates exactly the hosts the client uses. When the client exits, a proxy the launcher started is stopped.

Both upstream schemes are covered automatically, with no config edits:

- **HTTPS upstreams → cert MITM.** The client is pointed at the proxy via `HTTPS_PROXY` and trusts the proxy's MITM root CA (`~/.local/share/billion-context/ca/root-ca.pem`, generated lazily). Compression is injected on the intercepted TLS stream.
- **HTTP / localhost upstreams → `/bili/` baseURL rewrite** (plaintext can't be MITM'd). The launcher rewrites the client's base URL through the client's own mechanism, via an isolated temp copy of its config — the real config files are never touched (details below).

How each client is pointed at the proxy (set automatically in the child env):

| Client | Redirect | CA trust |
|---|---|---|
| pi | `HTTPS_PROXY` + `BILI_PROVIDER_REWRITES` env manifest (extension `registerProvider`) | `NODE_EXTRA_CA_CERTS` |
| omp | `HTTPS_PROXY` + `BILI_PROVIDER_REWRITES` env manifest (extension `registerProvider`) + `PI_PROXY_ANTHROPIC=<proxy>` when neither `PI_PROXY` nor `PI_PROXY_ANTHROPIC` is user-set (routes OMP's Cowork anthropic lane through the proxy instead of node:https direct, #2583/#3556) | `NODE_EXTRA_CA_CERTS` |
| codex | `HTTPS_PROXY` + `-c key=value` overrides | `SSL_CERT_FILE` → `combined-ca.pem` |
| claude | `ANTHROPIC_BASE_URL` = `/bili/` URL (Vertex: `ANTHROPIC_VERTEX_BASE_URL`, when `CLAUDE_CODE_USE_VERTEX=1`; + `NO_PROXY`/`no_proxy` loopback merge, #3446) | none needed |
| opencode | `HTTPS_PROXY` + isolated `OPENCODE_CONFIG` | `NODE_EXTRA_CA_CERTS` |
| hermes | `HTTPS_PROXY` (plain-http rides absolute-form forward-proxy requests) | `SSL_CERT_FILE` → `combined-ca.pem` (+ legacy `HERMES_CA_BUNDLE` → `root-ca.pem`) |
| dsh | `HTTPS_PROXY` (+ `HTTP_PROXY` for plain-http) + `DEEPSEEK_BASE_URL`; **loopback-only** isolated `DSH_HOME` | `SSL_CERT_FILE` → `combined-ca.pem` |

`NODE_EXTRA_CA_CERTS` *appends* to the built-in trust store, so it points at the MITM root alone (`root-ca.pem`). `SSL_CERT_FILE` *replaces* the default CA bundle, so for codex/dsh/hermes it points at `combined-ca.pem` — a bundle containing the MITM root **plus** the OS trust store and the Node public roots. The OS-store merge matters because some launched clients treat this file as their *entire* trust pool (codex's rustls HTTP stack replaces rather than appends, #1807): any direct, non-proxied connection of theirs must validate against this file alone, so the file must be a superset of what the OS itself trusts (Windows cert stores via PowerShell, macOS keychains via `security(1)`; Linux already reads the filesystem bundle; rebuilt at most once per 24 h). Keeping pip/git/curl style TLS (blind-tunnelled, real certificates) working inside the child env is the original reason for the bundle (#152; hermes since #1375, because current hermes resolves ambient trust only through `SSL_CERT_FILE`; OS-store merge since #1807).

Claude Code is routed through the `/bili/` URL form via its own base-URL variables rather than cert MITM — every upstream, including a pre-configured `ANTHROPIC_BASE_URL` relay and the Vertex endpoint under `CLAUDE_CODE_USE_VERTEX=1`; no CA trust is required. Older builds ignored proxy env vars outright, but newer ones (e.g. 2.1.301) honour `HTTPS_PROXY`, so the launcher merges the loopback hosts into `NO_PROXY`/`no_proxy` (preserving any value already set) to keep the `/bili/` leg direct regardless of which behavior the child has (#3446).

Where upstreams are discovered from (read-only):

| Client | Read from |
|---|---|
| Pi | `~/.pi/agent/models.json` — each provider's `baseUrl` |
| omp | `~/.omp/agent/models.yml` — each provider's `baseUrl` |
| Codex | `~/.codex/config.toml` — each `[model_providers.<name>]` `base_url` (+ top-level `openai_base_url`) |
| Claude Code | `ANTHROPIC_BASE_URL` env var; under `CLAUDE_CODE_USE_VERTEX=1` the Vertex host derived from `ANTHROPIC_VERTEX_BASE_URL` / `CLOUD_ML_REGION`, else hardcoded `api.anthropic.com` |
| OpenCode | `~/.config/opencode/opencode.json` — each provider's `baseURL` |
| hermes | `~/.hermes/config.yaml` — each provider's endpoint lines |
| dsh | `~/.dsh/settings.yaml` — every `baseURL`/`baseUrl`/`base_url` value, split by destination (loopback → `/bili/` rewrite; non-loopback https → MITM whitelist; non-loopback http → `HTTP_PROXY`); plus the built-in `deepseek-official` route via `$DEEPSEEK_BASE_URL` |

### Generated files (what gets written — last resort only, #535)

The launcher prefers file-free injection (env vars > CLI flags/extension APIs > generated files; see TECHNICAL-NOTES.md, “Injection priority” section). Where a file is unavoidable it is a **copy** — the real config is never edited:

- **pi / omp** — nothing is written (#535): provider baseUrls ride the `BILI_PROVIDER_REWRITES` env manifest consumed by the bili extension at load (`registerProvider`), and auto native compaction is cancelled in-extension (`session_before_compact`; omp distinguishes auto vs manual via the `auto_compaction_start` announcement, #851) — but only on positive evidence the proxy actually carries the conversation (the plugin stamped `x-bili-plugin-conversation` for this session id, or omp's identity register succeeded, or `/__bili/plugin/status?conversationId=` confirms it); non-http(s) provider baseUrls (e.g. pi-claude-bridge's literal `"claude-bridge"`) are never cancelled by default, so their own compaction takeover keeps working (#1382); a provider can be opted in via its entry in the `providers` table — key = the provider id (a non-URL key is inert for routing), field `"compactionOptIn": true` — or `BILI_NON_HTTP_PROVIDERS` (env, comma-separated) — but opt-in only widens the candidate set, so even an opted-in provider is cancelled only on the same positive carriage evidence above (#1392) — manual `/compact` stays user-owned either way. The real `~/.pi` / `~/.omp` homes are untouched.
- **opencode** — a temp `opencode.json` pointed at by `OPENCODE_CONFIG` (removed when the client exits), with `/bili/`-rewritten plaintext baseURLs **plus the thin plugin appended** (`/acp` + `/acp-cache` commands). On OpenCode 1.x the `opencode-acp` entries are stripped from the clone (the host must not load it armed) and the thin plugin imports that same package as a library instead, gated on legacy sessions; the first stripped spec rides along via `BILI_OPENCODE_ACP_SPEC` so the bridge imports the exact copy the host would have loaded (#920). Relative local plugin specs (`./x`, `../x`) are re-anchored to absolute paths in the clone — opencode resolves them against the declaring config file's dir, which the clone no longer is (#826).
- **hermes** — nothing is written (#535): its httpx stack rides `HTTPS_PROXY` (+ `SSL_CERT_FILE` → `combined-ca.pem`; legacy `HERMES_CA_BUNDLE` stays set for older builds, #1375) — https via CONNECT cert-MITM, plain-http via absolute-form forward-proxy requests. If no providers are configured, the launcher prints a warning and hermes runs **unproxied** (compression off).
- **dsh** — split by destination (#535): dsh's fetch stack honors proxy envs except for an unconditional loopback bypass, so **non-loopback** upstreams ride `HTTPS_PROXY` (cert MITM) / `HTTP_PROXY` (absolute-form forward-proxy requests) with `SSL_CERT_FILE` → `combined-ca.pem`; only **loopback** upstreams keep the persistent overlay `DSH_HOME` (`~/.dsh-bili`) with a rewritten `settings.yaml` routing them through `/bili/`. `profiles/`, credentials and sessions are symlinked through; the real `~/.dsh` is never touched. Home-root SQLite databases are the one exception to sharing: each launch gets a private copy in the overlay, merged back as a unit on exit (a file-linked main db would let the two paths grow independent WALs over one inode — #1917). The built-in `deepseek-official` route is captured separately via `$DEEPSEEK_BASE_URL` (dsh resolves `settings llm-deepseek.baseURL` ?? env ?? default, so a user setting wins and the env is the zero-config fallback) — with no custom providers the deepseek route is still proxied out of the box.
- **codex** — a persistent overlay `CODEX_HOME` (`~/.codex-bili`, or `<CODEX_HOME>-bili`) whose other entries (auth, sessions, model settings) stay shared links into the real home. The exception is home-root SQLite databases (`*.db` / `*.sqlite` / `*.sqlite3` — codex keeps its logs/state there): each launch gets a private copy in the overlay, merged back into the real home as ONE unit on exit (newer main-db generation wins; the loser is preserved as `<name>.bili-conflict`). File-linking those dbs across the two homes lets two paths grow independent WALs over one inode — committed writes lost or the database corrupted (#1917). Two generated files: (a) when MCP injection is on, a merged `config.toml` — real contents plus the per-spawn `[mcp_servers.bili]` block (inline `-c` values cannot survive cmd.exe quoting on Windows, #681); (b) since #1802, a generated `.env` (mode 0600) that re-pins THIS launch's `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY` / `SSL_CERT_FILE` / `BILLION_CONTEXT_PROXY`: codex's own `load_dotenv()` overwrites the launcher's spawn env from `$CODEX_HOME/.env` **after** start, so a user `.env` pointing at e.g. a socks5h proxy would otherwise silently re-route codex off bili (and codex's custom-CA rustls HTTP stack cannot speak SOCKS at all). Your other `.env` variables are carried over verbatim; pre-existing shared `.env` links are migrated to an owned file; the real home's `.env` and every other real-home file are never touched. Direct-URL mode (`BILI_LAUNCHER_DIRECT=1`) generates no `.env` (there is no injected proxy to protect) and, without MCP, no overlay at all.

### Native tools in the launcher

- **pi** — if the plugin is NOT installed, the launcher rides pi's `-e <file>` flag to load `dist/agent/pi.js` for that run only (nothing is written): native tools + the `/acp`, `/acp-cache` and `/acp-rule` commands out of the box (`/acp-cache` defaults to the summary ledger — totals, verdicts, anomalies; append `full` (or `--full`) for the every-line listing, same as passing `detail: "full"` to the `acp_cache` tool). If it IS installed, the symlinked `settings.json` already loads it — no `-e` is added.
- **omp** — does NOT ship the plugin; the launcher auto-injects `-e dist/agent/omp.js` when the config carries no loadable bili entry (same zero-config ride as pi). Two omp-specific mechanics make the plugin fully native there: omp 17.x mounts extension tools that omit `loadMode` under its `xd://` device URLs (invisible to the model's main turn), so the plugin registers its tools with `loadMode: "essential"` — the model gets the four ACP tools natively; and since omp's fork emits no `before_provider_headers`, the plugin binds the conversation via the launcher identity register (`POST /__bili/plugin/register`, keyed by omp's session id = `prompt_cache_key`/`x-session-id`) — bound sessions run in plugin mode (wire injection suppressed) with the native `/acp`, `/acp-cache` and `/acp-rule` commands.
- **opencode** — the temp config appends the thin plugin automatically.
- **claude / codex** — on by default: the launcher injects a single `bili` MCP server (an ephemeral `--mcp-config` file for claude; for codex the definition lives in the overlay's generated `config.toml`, see [Generated files](#generated-files-what-gets-written---last-resort-only--535) — nothing written to the real host config either way), so the host gets native tools out of the box (verified with claude 2.1.227 / codex 0.147.0). `BILI_LAUNCHER_PLUGIN=0` falls back to plain wire mode — for hosts older than the verified builds that have not been tested against the injection flags.
- **codex + self-hosted upstream auto-fallback** — codex 0.147 ships MCP tools to the model as a `namespace` tool type; self-hosted servers (sglang/vllm/ollama/llama.cpp) do not parse it, leaving the tools silently invisible. When the codex upstream host is loopback/private (`127.0.0.1`, RFC1918, ULA, `.local`, …) and `BILI_LAUNCHER_PLUGIN` is unset, bili automatically uses wire mode instead (flat tools every server understands) and says so on stderr. `BILI_LAUNCHER_PLUGIN=1` forces plugin mode regardless.
- **hermes** — no plugin API; always wire mode.
- **dsh** — the launcher always splices a `--patch <file>` flag into dsh's argv (written to `~/.dsh-bili/.bili-acp.patch.yml`), inserting `dist/agent/dsh-acp.js` into the profile's loader tree: the native `/acp` and `/acp-cache` commands, same shape as dsh's own `/compact` (`/acp-cache` shows the default summary ledger — dsh's command API passes no arguments, so there is no `full`). Works on every profile that composes the commands service (web/tui interactive surfaces; the `headless` one-shot driver sends its task straight to the model and parses no commands — `/compact` behaves the same there). Subcommand forms are handled: `dsh web` gets the flag after `web`, `dsh plugin`/`--dump-default-config` take none.

Launcher-mode matrix:

| Mode | Tools surface | Setup |
|---|---|---|
| Launcher + MCP (default for claude/codex) | native MCP tools | none — just `bili claude` / `bili codex` |
| Launcher wire mode (claude/codex, `BILI_LAUNCHER_PLUGIN=0`) | proxy-injected wire tools | one env var |
| Launcher `-e` / auto-plugin (pi, opencode; omp built-in) | native plugin tools | none |
| Manual plugin (`bili plugin install`) | agent-side plugin | run install |
| Manual baseURL (`/bili/` prefix) | proxy-injected wire tools | edit client config |

### Direct-URL mode (opt-in)

`BILI_LAUNCHER_DIRECT=1` drops MITM/CA trust entirely — claude's `ANTHROPIC_BASE_URL` / codex's provider `base_url` point at the `/bili/` prefix directly. Warnings:

- **codex direct mode**: the LLM traffic does **not** go through the proxy, so compression is not applied — only the bili MCP tool calls do. For full compression use the default MITM mode (unset `BILI_LAUNCHER_DIRECT`).
- **claude direct mode**: `ANTHROPIC_BASE_URL` is overridden to the proxy; a pre-configured relay is bypassed unless `BILI_CLAUDE_UPSTREAM=<relay>` is set. OAuth-subscription traffic requires the default MITM mode.

`--mitm-domain <domain>` (repeatable) adds extra domains to the MITM whitelist beyond what auto-discovery finds — useful for hosts the client fetches at runtime rather than from its config file. The launcher picks a free port automatically if the default is taken; `--passthrough` / `--debug` / `--no-auto-update` work like plain `bili`.

---

## Plugin Mode (native tools)

For a native-plugin experience, an agent can run a small cooperative plugin alongside the proxy: the plugin registers the four ACP tools (`compress` / `decompress` / `search_context` / `acp_status`) natively with the agent and drives the agent's own tool loop, while the proxy stays the compression authority (state, history folding, philosophy prompt, nudges). Tool schemas are served by the proxy itself (`GET /__bili/plugin/manifest`), so plugin and proxy can never drift. Protocol spec: [PLUGIN.md](PLUGIN.md).

Plugin-equipped sessions are detected automatically via request headers — wire-level tool injection is then suppressed for them (no double compression, native tool UX). Works in both proxy modes: the `/bili/` prefix baseURL **and** MITM transparent mode. The plugin can also report the agent's own model context window (`x-bili-plugin-context-window`) and read live context usage via `GET /__bili/plugin/status`. One header goes the other way: `x-bili-plugin-bypass: 1` makes the proxy raw-passthrough the request ahead of any pipeline processing (no session binding, injection, or compression) — stamped by the opencode bridge for legacy acp sessions whose compression runs in-process (#920).

### install / remove / list

```bash
bili plugin install pi      # add this billion-context install to pi's settings.json (packages)
                                  # npm installs write the pi-managed npm: spec; dev checkouts keep the abs path
bili plugin install omp     # same for omp (config.yml extensions)
bili plugin install claude  # register the bili MCP server (claude mcp add, user scope) + write
                                   # <configdir>/commands/acp-cache.md (model-mediated /acp-cache)
bili plugin install codex   # append [mcp_servers.bili] to ~/.codex/config.toml
bili plugin install opencode  # self-spawning native plugin (+ tools) in ~/.config/opencode/opencode.json
                                  # --with-mcp also adds the mcp.bili MCP face (no origin pin — live discovery)
bili plugin list            # install status for every supported host
bili plugin remove pi       # undo (original files backed up to *.bili-bak once)
```

`install pi` also replaces any **legacy** billion-context entries (old `npm:billion-context-pi` references, stale `npm:billion-context@x.y.z`, leftover dev-checkout paths) so exactly one bili plugin stays live; when it drops entries the output also reminds you that a **project-scope** entry (`pi install -l`, written to `<project>/.pi/settings.json`) is outside this global settings and must be removed by hand. With an npm-installed bili the written entry is the pi-managed spec `npm:billion-context` — pi installs it into `~/.pi/agent/npm/` automatically (also on startup if missing) and `pi update` upgrades it, so the entry survives node prefix moves across machines; a dev/checkout install keeps the machine-local abs path (pi loads local package dirs directly). Both load the `pi` manifest → `dist/agent/pi-native.js`, the self-spawning native entry — bare `pi` gets full plugin-mode compression with no launcher (#519).

**Coexistence with the standalone `billion-context-pi` extension.** The two are mutually exclusive — both active means double compression. Three nets: the installer strip above (global settings), the `BILLION_CONTEXT_NATIVE=pi` marker the native entry sets synchronously at load (`billion-context-pi` **0.1.72+** re-reads it on every event and refuses; 0.1.71 and older check `BILLION_CONTEXT_PROXY` only at load time, before the native proxy exists), and a runtime scan: once its proxy is up, the pi-native entry reads both pi settings files and warns loudly about any co-resident legacy entry the installer never saw (project scope, or installed after the fact).

The installed plugin is a **thin** one (~5 KB, zero runtime deps): it detects the proxy (from the `/bili/` baseURL or `BILLION_CONTEXT_PROXY`), fetches tool schemas from the proxy, registers native tools, and forwards executions — the proxy remains the single compression authority, so plugin and proxy always match versions. Hosts without a plugin API (claude, codex) install the MCP bridge instead — claude gets `dist/claude-mcp-entry.js` (the same bridge plus the mid-session proxy watchdog that respawns a dead lane proxy, #1821), codex the plain `dist/mcp.js` — same protocol underneath, though MCP has no slash-commands (no `/acp` panel command; claude additionally gets a model-mediated `/acp-cache` markdown command written to `<configdir>/commands/acp-cache.md`, whose prompt drives the `acp_cache` MCP tool — the model pastes the report back verbatim). opencode has its own plugin API, so its install adds the native plugin tools and no MCP face by default (`--with-mcp` opts in; the entry carries no `BILI_MCP_PROXY` pin — `dist/mcp.js` discovers the live proxy via the instance file at call time, which survives the native plugin's ephemeral-port restarts, #926).

Kill switch: `BILLION_CONTEXT_PLUGIN=0` disables plugin mode entirely (wire-level injection resumes).

**When do you need `plugin install` at all?** Launcher users mostly don't (see [Launcher Reference](#launcher-reference) — pi/omp get `-e` auto-injected, opencode auto-injects, claude/codex get the MCP server auto-injected, dsh gets the native `/acp` and `/acp-cache` commands via `--patch`, hermes is wire-only). It's for a manually-configured client (`/bili/` prefix or MITM) where you want the native panel: pi/omp/opencode get native tools + `/acp` and `/acp-cache` (pi/omp additionally get `/acp-rule`; on omp the fork hides extension tools from the model — the plugin's value there is those commands); claude/codex get native MCP tools (no `/acp`; claude gets the model-mediated `/acp-cache` markdown command); dsh gets `/acp` and `/acp-cache` through the launcher's `--patch` (a manually-configured dsh can add the same patch itself); hermes can't (wire only). Without any plugin everything still works — compression runs via wire-injected tools, and the model can be asked to call `acp_status` to check live usage.

### Detecting other compression plugins (#1206)

Two compressors on one conversation double-compress and corrupt message refs, so bili actively looks for other compressors co-resident with itself:

- **Scan** (read-only, best-effort, 5-minute cache): opencode global + project config `plugin` arrays; pi global + project `.pi/settings.json` `packages`; omp `config.yml` `extensions`; claude settings `enabledPlugins`/`plugins` keys + `~/.claude/plugins/` dir; kimi `plugins/installed.json`; hermes `~/.hermes/plugins/` dir; dsh profile `package.json` dependencies. Two tiers: **known conflicts** (`opencode-acp`, legacy `billion-context-pi` — deterministic) and **keyword-suspected** entries (names matching compress* / compact* / acp / summar*; bare `context` deliberately does NOT match — it names the domain, not the act of compressing, so read-only tools like `context7`/`dsh-context` do not flag); verified non-compressing plugins are exempt outright by EXACT package name — read-only/display-only tools (e.g. `pi-compact-transcript`, `pi-context-inspector`) and protocol adapters whose name merely collides with a keyword (`@openma/deepseek-harness-acp`: its `acp` means Agent Client Protocol, not the acp-kernel ecosystem marker; #2969) — lookalike names still flag.
- **Where findings surface:** launcher stderr before the client starts; a proxy warn log on each session's first request (client identified from the `x-bili-plugin` header or wire headers); and the session's conflict ledger — `acp_status`'s `COMPRESSION CONFLICTS` section, `GET /__bili/stats` → `conflicts`, web-UI banner.
- **Runtime evidence, tiered for display (#2545):** unannounced history rewrites (#1001) and orphan-gc deactivations (summarized content deleted out of the client's history) are recorded in the same ledger as *suspected* coexistence. Severity surfaces grade by EVIDENCE TIER: **confirmed** = a detected client-native compaction landing (bili rebases onto it, #2372/#2432) or a non-suspected plugin finding — only this triggers the imperative "keep one compressor" warning; **unconfirmed signals** = unannounced rewrites + orphan-gc deactivations — observed changes whose cause is NOT identified ("history changed, cause unknown"), never presented as native auto-compaction or a second compressor; name-only [suspected] matches stay in the soft "verify first" tier (#1736) and a PURE [suspected] ledger gets verify-first advice only — no imperative per-client fix footer ("disable auto-compaction / start a fresh session") while nothing is confirmed (#2969). Stock ledger records naming verified non-compressing plugins (read-only viewers, or protocol adapters such as #2969's ACP adapter) are neutralized at display time instead of persisting as alarms, and cross-session aggregate counts of unconfirmed signals never escalate to a same-conversation double-compression claim.
- **dsh's `auto: false` disables only the automatic triggers.** The `compaction-basic: { auto: false }` line installed by the profile bundle patch (`dsh.bundle.patch.yml`) skips pressure/overflow auto-compaction — a manual `/compact` (and idle-session compaction) still fires. Calls routed through bili are refused by the server-side guard (#1729/#2360); calls that reach the provider without transiting bili (desktop-lane paths the plugin's takeover gate does not attribute) land, and bili detects them on the next replay — checkpoint framing + decimated fold coverage — rebasing its compression state in one turn instead of failing every later compress forever (#2432). When the goal is turning dsh compaction off **entirely** — including manual `/compact` — the delta belongs on that same row as `disabled: true`, not `auto: false` (recipe below).

 #### Turning dsh native auto-compaction OFF in a web profile (#1772/#3354, automatic since #3354; #2474 recipe as fallback)
 
 **Automatic since #3354.** In a profile bundling `@deepseek-ai/dsh-web-app` the running compaction-basic instance lives inside an agent preset (`preset-standard.config.plugins`) where no patch layer can address the nested row by id (#1772) — the bundled `- id: compaction-basic` row lands on web-app's already-disabled host-plane row and changes nothing. bili now closes that gap at LOAD TIME: an always-on bundle entry `bili-compaction-gate` — a separate cordis entry beside `bili-native`, mounted by the same patch layers, so it stays alive when `bili-native` is disabled or kill-switched (#3662) — registers a cordis `internal/config` overlay (vendored from [deshark42/dsh-compaction-basic-disable](https://github.com/deshark42/dsh-compaction-basic-disable), MIT) that marks the preset's `compaction-basic` and `command-compact` rows `disabled: true` while bili owns the lane, and the preset gate rows in `dsh.bundle.patch.yml` / the launcher overlay make each Web preset wait for that overlay's service before it can register. Native auto-compaction is off in these profiles with no user action; ACP compression is unaffected.
 
 The overlay rides an INTERNAL dsh hook and is version-sensitive. If you still see a dsh compaction checkpoint land on a newer/older dsh build, use the fallback below.
 
 **Disabling vs removing (#3662).** Disabling `bili-native` (dsh plugin manager or `disabled: true` in a patch layer) no longer bricks session creation: the gate service survives in the separate always-on `bili-compaction-gate` entry, so the presets fall back to STOCK native compaction instead of pending forever — compression off, dsh fully usable. Never disable `bili-compaction-gate` itself (that re-creates the brick); to fully uninstall remove `billion-context` from the profile's `dsh.profile.bundles` and restart. Pre-#3662 installs left bricked self-heal on upgrade; manually, append `- id: preset-standard` / `preset-ptc` / `preset-minimal` / `preset-cordis`, each with `inject: null`, to `$DSH_HOME/cordis.patch.yml` (home layer; default `~/.dsh/cordis.patch.yml`) — top-level keys replace wholesale, clearing the pending latch.
 
 **Fallback recipe (#2474)** (verified on dsh `0.2.1-alpha.1`, Windows 11, profile bundles including `@deepseek-ai/dsh-web-app`). A profile-layer patch can turn it off — presets are ordinary top-level rows inserted by the bundle layer, and the profile patch layer is applied after it. What does not work is addressing the nested row by id; what does work is overriding the preset row's `config` wholesale.

```bash
# 1. Dump the composed profile and copy preset-standard's COMPLETE config block.
dsh --profile <name> --dump-config > /tmp/profile.yml
```

2. Append a `preset-standard` row to `$DSH_HOME/profiles/<name>/cordis.patch.yml` containing that **complete** `config` — every one of its `plugins` entries, byte-for-byte — with exactly one change inside the `compaction` group. Two variants:

    - **Strong (recommended, #3235): disable the component** — set `disabled: true` on the nested `compaction-basic` row. This is the same mechanism dsh itself uses on the host plane; the plugin is off entirely (运行状态 no longer 运行中), so neither pressure nor manual triggers can fire from it.
    - **Weak: keep it loaded but stop auto-triggering** — add `config: { auto: false }` under the row instead. Auto pressure compaction is off, but manual `/compact` and the tool-result pruner stay on and the component still runs.

```yaml
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    order: 1
    plugins:
      # … every entry from the dump, unchanged …
      - id: compaction
        name: cordis:group
        group: true
        isolate:
          compaction: true
          toolResultPruner: true
        config:
          - id: compaction-basic
            name: '@deepseek-ai/dsh-compaction-basic'
            disabled: true          # ← strong variant: the only delta
            # config: { auto: false }  # ← weak variant instead, if you prefer
          - id: command-compact
            name: '@deepseek-ai/dsh-command-compact'
          - id: tool-result-pruner
            name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
            config:
              thresholdChars: 8192
              headChars: 4096
              tailChars: 1024
      # … every remaining entry, unchanged …
```

3. Confirm before relying on it: `dsh --profile <name> --dump-config | grep -A2 'id: compaction-basic'` — the entry count of `preset-standard` must be **unchanged** and the nested row must now carry `disabled: true` (or `config.auto: false`).

Automatic pressure/overflow compaction is off (and with the strong variant the whole component is); with the weak variant manual `/compact` and the tool-result pruner stay on. **Repeat the same shape for `preset-ptc` and `preset-cordis`** — switching the session mode re-resolves the preset, and a compaction row left enabled there resurrects native compaction even after `preset-standard` is patched (`preset-minimal` ships no `compaction` group).

**Three ways to get this wrong — all silent** (measured against the same dump):

| Patch form | Result |
|---|---|
| `- id: preset-standard.compaction.compaction-basic` | `patch: entry "…" not found`; **no effect** |
| `- id: preset-standard` + a partial `config.plugins` | `config` is **replaced, not merged** — the preset collapses to just the entries you wrote (35 → 3 in the measured case): no persona, no tools |
| `- insert:` with `id: preset-standard` | appends a **second** `preset-standard` row at the tree tail; the live preset is untouched |
| full `config` snapshot + one `disabled: true` | ✅ entry count unchanged, only delta is `disabled: true` |

**The snapshot is frozen at the dsh version you copied from.** Unlike a bundle-layer patch, a profile-layer `config` is a point-in-time copy: after a dsh upgrade adds, removes, or reconfigures a row inside the shipped preset, this override keeps serving the old roster — new plugins silently never load. Re-run step 1, diff the new `preset-standard` block against the one in your patch, and re-copy it whole whenever that section changes. If you would rather not maintain a snapshot, leave native auto-compaction on and let the #1729/#2432 rebase path handle the interaction instead.

Because a partial override fails without any diagnostic, always re-dump and compare entry counts after editing.
- Under the opencode launcher/native mode a present `opencode-acp` is info-only by design (#920 absorbs it for legacy sessions); everywhere else it warns.
- Disable: `BILI_CONFLICT_SCAN=0`.

---

## Sessions & Migration

### Compression state lives in the proxy (#151)

Compression state (blocks, summaries, original message cache) lives **in the proxy**, not in the client. The client's own local history is the full uncompressed view. Two consequences:

- If you point the client back at the real upstream (or stop the proxy), the client replays its **full local history** every turn. After a long compressed session this can exceed the model's context window (`context_window_exceeded`).
- There is no way to "unpack" a compression block into the client's local history — the client never saw the compressed form.

### Storage lifecycle at boot (#401)

The proxy boots session storage with a **single** directory walk+parse (load and the one-time #286 identity migration run over the same parsed map). Sessions are kept permanently — the design goal is that a year-long conversation is never lost — so there is no retention or size-budget pruning. The #286 migration writes a `.bili-migration-286.done` marker after its first pass, so it never re-scans or re-logs on later boots.

### Migrating off the proxy

Export the session and paste it into a fresh conversation as a handoff:

```bash
bili export                      # list persisted sessions (id, label, blocks)
bili export <id|label>           # print a Markdown handoff (block summaries)
bili export <id> --full          # include the original messages per block
bili export <id> --jsonl         # line-delimited JSON dump (tables-first)
bili export <id> --full --output handoff.md
```

Then start a new conversation in the client (direct to upstream) and paste the handoff doc as the opening context.

### Codex subagents get their own compression namespace (#150)

Codex subagents (e.g. the `guardian_subagent` approval reviewer) reuse the main conversation's `session_id`, so on the wire they look like the same session. Without care their requests inherit the main conversation's compression state — a subagent turn can get its context folded (losing the verbatim user authorization it must read back) and the two roles' usage estimates pollute each other.

billion-context detects this via the `instructions` field: subagent requests carry their own role prompt. The **first** instructions seen for a conversation anchor the main namespace (stable even if the main prompt drifts); any other instructions value maps to a separate `|sub:` namespace with its own empty compression state. Subagent requests are self-contained replays, so the fresh namespace is lossless — and the web UI's session list shows the two namespaces as separate sessions sharing the same client label.

The anchor is not specific to Codex or Claude Code — but the split is deliberate, not automatic: it applies to clients whose traffic has been verified to reuse ONE conversation id across several personas (each sending its own system prompt under the same id), today Codex, Claude Code and DeepSeek Harness. For every other client a changed system prompt mid-conversation means "same conversation, evolved prompt" and stays in the main namespace. A concrete non-Claude case is DeepSeek Harness with `@deepseek-ai/dsh-experimental-auto-review` enabled: the reviewer fires before each pending tool call under its own small fixed system prompt (≈1 KB; the four `ENVIRONMENT` / `PROJECT_INSTRUCTIONS` / `FILTERED_HISTORY` / `PENDING_ACTION` sections ride its user turn), so its row appears alongside the main conversation and is also marked running.

Four readings tell such a lane apart without reading any code:

| Reading | Main conversation | Review / subagent lane |
| --- | --- | --- |
| system prompt | the full prompt (tens of KB) | very small (≈1 KB) |
| compressions | grows over time | 0 |
| requests | roughly one per turn | roughly one per tool call |
| cache hit rate | varies | ≈99.9% (stable prefix, only the pending action changes) |

### Windows: exclude the sessions dir from antivirus (#362)

billion-context persists each session's compression state to one JSON file per session under the sessions dir (`%USERPROFILE%\.local\share\billion-context\` by default) and rewrites that file on every turn of a long session. On Windows, real-time antivirus (Windows Defender), the search indexer, or a sync tool (OneDrive) can lock that directory mid-write. When the lock holds across several writes, the rename fails with `EPERM` and every persist for that session fails until the lock is cleared.

The same environment failures can refuse to open the unified-storage index itself: when SQLite cannot open `%USERPROFILE%\.local\share\billion-context\sessions\index.db` (`unable to open database file` / SQLITE_CANTOPEN, #3823), storage degrades to legacy-only and the degrade warning plus the diagnostics block name this exclusion as the first suspect (OneDrive placeholder files and paths over 260 chars are the other two).

When the same session fails N consecutive writes (default `5`, tunable via `BILI_PERSIST_EPERM_ALERT_THRESHOLD`), the proxy logs a **one-time, actionable alert** naming the exact directory to exclude. It does not repeat (set `BILI_PERSIST_EPERM_ALERT_REPEAT_MS > 0` to re-alert at most every M minutes while the failures continue).

To stop the failures at the root, add the sessions dir to your antivirus exclusions and keep it out of any sync folder:

1. **Windows Defender exclusions:** Settings → Privacy & security → Windows Security → Virus & threat protection → Manage settings → **Exclusions** → **Add an exclusion** → *Folder* → select `%USERPROFILE%\.local\share\billion-context\`.
2. **Do not sync this directory.** Make sure OneDrive (or Dropbox / Google Drive / similar) is not syncing `%USERPROFILE%\.local\share\billion-context\`. If it lives under a synced folder, relocate it with `BILI_SESSIONS_DIR` to a non-synced path.

High-frequency persist writes otherwise re-trigger the real-time scan on every turn — which is what produces the `EPERM` write failures. Once the directory is excluded, the alerts stop.

### Windows: node runtime labeled Low (NTFS mandatory integrity) (#5154)

Everything above assumes the *files* are the problem. #5154 found the opposite shape: the **Node runtime itself** (`node.exe`) carried a **Low mandatory-integrity label**, so the process was Low-integrity and *every write to a Medium-labeled file* — the CA bundle rebuild, `index.db`, session envelopes — failed with `EPERM` while every ACL check passed. The label usually arrives by **inheritance**: a parent directory once labeled `Low (OI)(CI)` (for example by a stray `icacls <dir> /setintegritylevel "(OI)(CI)Low" /T`) stamps the Low label onto every file placed inside it, and it survives reboots. This is the mechanism behind whole "crash loop with no visible cause" startup classes (#5096).

bili probes its own runtime's label once at startup (`icacls` on `process.execPath`) and logs a loud `[integrity]` warning when it finds Low/Untrusted — non-blocking, the proxy keeps running.

To check and fix manually (run elevated; use the **absolute path** — `icacls` PATH resolution fails under some PowerShell/cmd profiles):

```bat
:: look for a "Mandatory Label\Low Mandatory Level" line (no Mandatory Label line = no label = fine)
C:\Windows\System32\icacls.exe "C:\Program Files\nodejs\node.exe"

:: restore the runtime to Medium (this is the fix; verify with the command above)
C:\Windows\System32\icacls.exe "C:\Program Files\nodejs\node.exe" /setintegritylevel Medium
```

If the label shows an `(I)` (inherited) marker, a **parent directory** is the source: fix the directory **root only, non-recursive** — `icacls "<dir>" /setintegritylevel Medium` with **no `/T`**. New and re-created children then inherit "(no label)" and converge; `/T` would touch thousands of files for nothing. Back up current ACLs first with `icacls "<dir>" /save acl.txt` if unsure.

Do **not** "fix" this by relabeling the billion-context data dir Low — that direction makes things worse (see #3823 vs #5154: files writable only by Low processes, integrity ceiling everywhere).
