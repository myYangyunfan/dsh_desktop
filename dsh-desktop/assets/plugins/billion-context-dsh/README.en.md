# billion-context-dsh

[English](./README.en.md) | [中文](./README.md)

> **⚠️ Beta notice — not for production use**
> This project (**v0.2.26**) is a work-in-progress beta. The [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) itself is also in **public beta**. **Do not use either in engineering / production environments** — expect breaking changes and rough edges.

<p align="center">
<strong>Built with gratitude on top of these projects</strong> — please give them a ⭐:
<br />
<a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> ·
<a href="https://github.com/ranxianglei/billion-context-pi">billion-context-pi</a> ·
<a href="https://github.com/ranxianglei/acp-kernel">acp-kernel</a> ·
<a href="https://github.com/ranxianglei/opencode-acp">opencode-acp</a>
</p>

<p align="center">
<strong>Billion-Context</strong> for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
<br />
The model decides <em>when</em> and <em>what</em> to compress — not a hard limit.
</p>

---

<p align="center">
<a href="https://www.npmjs.com/package/billion-context-dsh"><img src="https://img.shields.io/npm/v/billion-context-dsh.svg?style=flat-square" alt="npm"></a>
<a href="https://github.com/Tyan66666/billion-context-dsh/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/billion-context-dsh.svg?style=flat-square" alt="license"></a>
<a href="https://github.com/Tyan66666/billion-context-dsh"><img src="https://img.shields.io/badge/GitHub-Tyan66666%2Fbillion--context--dsh-181717?style=flat-square&logo=github" alt="GitHub"></a>
<a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-blue?style=flat-square" alt="dsh-plugin"></a>
</p>

<p align="center">
<code>npm install billion-context-dsh</code>
</p>

---

## Why?

When conversations get long, the model runs out of context. Most tools hard-truncate — silently dropping earlier messages. **billion-context-dsh** gives the model a `compress` tool: the LLM decides **when** and **what** to compress into high-fidelity summaries, preserving critical details (file paths, decisions, error strings) while reclaiming context space.

Unlike DSH's built-in auto-compaction (which replaces a range with an automatically generated summary), billion-context-dsh:

- **Model-driven** — the model writes the summary itself; there is no second LLM summarization call
- **Advisory, never imperative** — automatic policy only *nudges*; the model decides whether and when to compress (one exception: a provider-confirmed context overflow lets the engine recover once by itself — see `maxOverflowRetries` in the configuration table)
- **Durable & recoverable** — a compressed range becomes a checkpoint node, the originals stay in the append-only session log; `decompress` restores them, `search_context` finds information inside blocks
- **Long tasks hold steady** — every step builds on the results before it; key conclusions stay usable and compound, so very long tasks actually finish
- **Context stays lean** — every request rides on a small, distilled slice of context with only the key information; no bulk compression of large ranges, so details don't decay with it — and tokens stay low

This is the DeepSeek Harness port of [billion-context-pi](https://github.com/ranxianglei/billion-context-pi) (the Pi coding-agent adapter): the compression core ([acp-kernel](https://github.com/ranxianglei/acp-kernel)) is reused verbatim, and the adapter layer was rewritten against DSH's durable-surface model — see [docs](https://github.com/Tyan66666/billion-context-dsh/tree/main/docs) for the verified mapping.

## Install

> 💡 **Want DeepSeek Harness to install it for you?** This repo itself runs on DSH: hand [docs/INSTALL.md](docs/INSTALL.md) to an agent in a session and it will read the guide, inspect your profile, wire the composition, and verify the mount. Two preconditions: ① the config lives under `~/.dsh`, so you approve one file-permission prompt; ② afterwards ask it to call `acp_status` as proof.

**Path A (recommended): one-command install via the DSH store / `dsh plugin` (bundle) — globally active right after install, zero configuration.**

Click install in DSH's plugin store, or run:

```bash
dsh plugin --profile web add billion-context-dsh
```

The command installs the package and automatically layers this package's bundle patch ([cordis.patch.yml](cordis.patch.yml)) into the profile's composition. The patch does two things:

- **Disables the host `compaction-basic`** — so two backends do not both register `ctx.compaction` in the same realm (modern DSH web bundles already ship this disable; the row is an idempotent safety net that holds on every supported DSH);
- **Mounts the ACP engine at the HOST plane** — the four model tools (`compress` / `decompress` / `search_context` / `acp_status`), the `/acp-prune` command, the advisory nudge, and the ACP guidance section reach **EVERY mode** of the profile (standard / code / minimal / cordis / custom presets). Window auto-detection and the tools/command/nudge defaults are all on — **no manual configuration needed**.

Restart `dsh` afterwards (bundle layers are composed at startup), open a new session, and verify: ask the model to call `acp_status`, or run `/acp-prune status`. Shipped presets (standard / code / cordis) keep their realm-local `compaction-basic` fallback (automatic pressure compression still runs there; the ACP tools and nudge coexist); minimal and presets without a compaction realm use this engine directly.

> **DSH version compatibility.** The package declares all five runtime seam
> packages (`dsh-compaction` / `dsh-session` / `dsh-llm` / `dsh-tools` /
> `dsh-settings`) as peer
> dependencies, sharing the range `>=0.1.5-alpha.1 <0.1.6-0` — exactly the
> `0.1.5` line (every prerelease plus the final `0.1.5`). From the `0.1.5` line
> on, the session's replace operation was renamed from `{ op, start, end }` to
> `{ op, startSeq, endSeq }` and is validated strictly (exactly those three
> keys), so the engine emits the new shape only: on older DSH hosts (< 0.1.5)
> every `compress` call is rejected at runtime (issue #136), which is why the
> old lines are out of contract — upgrade DSH before installing this release.
> The explicit bounds (instead of a caret) are deliberate: a caret would
> silently admit the unverified 0.1.6+ line. Declaring all five seam packages
> as peers (not just `dsh-compaction`) ensures that, even under pnpm's
> hoisted/linked layout, installations resolve them to the **host's own** copy
> rather than a stale nested copy inconsistent with the host.
>
> Behavior note (from 0.1.5 on): the host no longer permits invisible
> replacement nodes, so when the engine cleans up orphaned tool messages it
> leaves one short visible placeholder message in their place; the host-owned
> system prompt node (surface node 0) is excluded from compressible ranges.

**Path B: plain `npm install` (package only — a composition row is required).**

```bash
npm install billion-context-dsh
```

This only installs the package into your project/global store; it does **not** touch any profile — add a composition row as shown below or the engine never mounts.

**Install from the git source (`github:` spec — the form the plugin store shows).** The prebuilt `dist/` artifacts are committed to this repository, so a git-source install also works out of the box — **no build step needed**, and pnpm 11's default build-script blocking (`allowBuilds`) never applies to this package:

```bash
dsh plugin --profile web add github:Tyan66666/billion-context-dsh#v0.2.26
```

Prefer a `#<tag>` ref to get artifacts identical to that npm release; without a ref you get the latest default-branch build. Only building the repo yourself (`npm run build`) requires approving build scripts. Background and trade-offs: [docs/git-source-install-design.md](docs/git-source-install-design.md) (issue #92).

## Scope & customization

Two audiences: ① Path B (plain npm install) users, who must write a composition row; ② Path A users who want custom `config` (the bundle already ships sane defaults — override them with a SAME-ID row).

**Custom `config` (Path A bundle users).** Append a `compaction-acp` row with `config:` to your profile patch (e.g. `~/.dsh/profiles/web/cordis.patch.yml`) — the same-id row overrides the bundle's default row:

```yaml
- id: compaction-acp
  name: 'billion-context-dsh'
  config:
    modelContextLimit: 128000   # optional; omit to auto-detect the model's real window (fallback 128000)
```

**Global — host plane, every mode** (recommended). This is what Path A's bundle already does; plain-npm users add all of the following (bundle users skip the first two rows):

```yaml
# ACP as the global compaction backend: four model tools + `/acp-prune` command +
# nudge + ACP guidance section for EVERY mode
# (standard / code / minimal / cordis / custom presets).
# Must also disable the host compaction-basic: two backends providing
# `ctx.compaction` in the same realm collide.
# (The bundle install already ships these two rows.)
- id: compaction-basic
  disabled: true

- insert:
    - id: compaction-acp
      name: 'billion-context-dsh'
      config:
        modelContextLimit: 128000   # optional; omit to auto-detect the model's real window (fallback 128000)
```

**(Optional) Custom prompt copy — `config.prompts`.** Every model-visible prompt (normal/emergency nudge opener, context breakdown, growth line, batch tip, tier line, range table, the ACP system-prompt section, the four tool descriptions) defaults to **acp-kernel's own `renderNudgeText`** — the efficiency note, context breakdown, compression rules, and batch tip all come from the kernel verbatim; only the range table is swapped for the surface-seq version (the kernel uses mNNNNN refs, and DSH has no `<acp>` tags; the seq range table likewise carries a `[tool X% | text Y%]` composition share and oldest-first ordering, matching the kernel's display semantics). Overriding any nudge slot switches to template rendering. Templates support named placeholders (e.g. `{pct}` and `{philosophy}` for nudges, `{surface}` for the range table) and are **validated at construction**: a misspelled placeholder fails engine startup (fail-fast) instead of leaking a literal `{pct}` into the model context:

```yaml
      config:
        modelContextLimit: 128000
        prompts:
          nudge:
            normal: 'This is an efficiency nudge to compress early and keep context lean.'  # custom nudge opener
          tools:
            acpStatus: 'Report the ACP block ledger: compressed blocks, reclaimed tokens, and current context pressure.'  # custom tool description
```

See [docs/configurable-prompts-design.md](docs/configurable-prompts-design.md) for the full slot list, per-slot placeholders, and the empty-string/`null` semantics. Deployments that omit `prompts` use the kernel rendering directly (aligned with kernel/pi; see design doc v6).

**(Optional) Runtime settings — edit `~/.dsh/settings.yaml` or use `/acp-prune config`; no restart.** Six scalar keys (`modelContextLimit`, `autoModelContextLimit`, `nudgeMinContextLimitPct`, `nudgeMaxContextLimitPct`, `nudgeEmergencyThresholdPct`, `autoNudge` — the rows marked “runtime-adjustable” in the Configuration table) have a hot-editable copy in the host settings layer: editing the settings file or `/acp-prune config` takes effect **immediately on running sessions** (the composition-row `config:` stays the starting point — the layering is schema default → composition row → user settings section):

```yaml
# ~/.dsh/settings.yaml
compaction-acp:
  nudgeMaxContextLimitPct: 0.72   # saved → live, no restart
```

```text
/acp-prune config                                  # list the six keys + source layer (user / base / default)
/acp-prune config set nudgeMaxContextLimitPct 0.72 # change one key live
/acp-prune config set autoNudge false              # boolean keys accept false
/acp-prune config reset nudgeMaxContextLimitPct    # back to the composition row / engine default
/acp-prune config reset all
```

Changing a window key (`modelContextLimit` / `autoModelContextLimit`) clears the window-probe cache — the next pre-step re-probes under the new values (probe failures are cached too, so this is also how a fixed gateway gets re-probed). In provider-less plain-npm compositions `/acp-prune config` degrades to advice text; on DSH lines ≥0.1.7, where the host settings service no longer provides `installSection` (outside this plugin's declared peer range), the engine degrades cleanly too — one startup warning, the six keys stay adjustable through the composition-row `config:`, engine and tools unaffected (issue #173); `settingsEnabled: false` disables the integration entirely (composition-row-only — the switch is deliberately NOT part of the settings layer: it cannot turn itself off). Design details: [docs/settings-integration-design.md](docs/settings-integration-design.md).

**Per-mode — an agent preset's `compaction` realm.** First *disable (or delete) the realm's existing `dsh-compaction-basic` row*, then mount this engine — two backends cannot coexist in the same realm:

```yaml
# First disable the realm's default backend (or just delete this row)
- id: compaction-basic
  disabled: true

# Then mount this engine
- id: compaction-acp
  name: 'billion-context-dsh'
  config:
    modelContextLimit: 128000   # optional; omit to auto-detect the model's real window (fallback 128000)
```

> **One context manager per agent.** Two backends providing `ctx.compaction` collide — never run both in the same realm. Full install & verification guide: [docs/INSTALL.md](docs/INSTALL.md).

## How it works

DSH derives every model request from its append-only session log (the *surface*). ACP semantics map onto that model directly:

| ACP concept | DSH implementation |
|---|---|
| `compress` tool shadows a range | durable `surfaceOp: { op: 'replace' }` — the model-written summary becomes a checkpoint node; the originals stay in the log |
| refs (`m00001` tags) | surface seqs, carried by the nudge's compressible-range table |
| nudge ("efficiency note — compress early and keep context lean") | injected at `agent/pre-step` by the kernel's pressure decision — efficiency note + context breakdown + compression rules, tone aligned with kernel/pi; never an order |
| `decompress` | read-only recovery of shadowed originals from the log |
| `search_context` | scores a unified doc set (block summaries + shadowed originals) rebuilt from the log — cached per log snapshot, so repeated searches before the next append reuse it (issue #133) — via acp-kernel `searchBlocks` (hybrid: stemming + CJK bigrams + char n-gram fuzzy); hits link back to the owning block |
| `acp_status` | CONTEXT BREAKDOWN (tool/text/summaries shares of the visible total) + compressed-block ledger + nudge decision line + a `Checkpoint seqs` row mapping each ACTIVE block's kernel ref (`bN`) to its checkpoint summary seq — compressing a checkpoint seq distills that block (issue #60); no context-window rows; scope/view/tool/sort/limit drilldown supported |
| block state | in-memory kernel state + **log-rebuilt ledger** (no sidecar files) |
| tiered distillation (T2/T3) | re-compressing a block's summary node distills that block (tier 2); distilling a tier-2 block yields tier 3. Tier + kernel block ids are persisted to the log, so kernel state rehydrates from the log after a restart and stays distillable |
| compression accounting (shadow price) | `shadowedTokenCount` (what the host occupancy display deducts) is priced with the **host token-meter's fixed-heuristic price** (`ctx.tokenMeter.measure` preferred, reading the `heuristicTokens ?? tokens` fixed-heuristic basis; exact mirror in `src/host-tokens.ts` as fallback) — never the plugin's internal CJK-aware estimate (that is display currency; mixing it into the host ledger can drive `messageTokens` negative and brick a CJK-heavy session, issue #54), and never the route-repriced `node.tokens` either (under 0.1.2+ image route pricing that is request-pressure currency; summing it overstates an image range's claim and folds the same ledger negative, issue #103) |
| image/file block visibility | `image`/`file` blocks carry no characters, and the projection used to drop them silently — so they had no ref in the compressible-range table, could not act as a boundary, were invisible to the kernel's "last user message" protection, and were priced at 0 tokens (on a screenshot session the last question could be compressed away entirely; issue #117). `extractText` now renders a deterministic one-line placeholder from durable attachment metadata (`[image image/png shot.png 800x600 4.2KB]`, `[file notes.txt 1.0KB]` — the same idea as the host's own handle-text projection for files), the media price is the difference between the host token-meter node's two prices (`tokens` − `heuristicTokens`: the second is the route-independent fixed heuristic, the first carries the adapter's declared visual price for a media occurrence, so the difference is exactly what the route charged on top) **plus** the fixed structural price the host heuristic charges for a media reference (`hostMediaStructuralPrice`, a mirror of the host's own `estimateStructuralBlock`) — no adapter declares a visual price today, so the difference alone would leave pictures looking free again, and range rows carry `[+N images]`; a session with no media pays nothing extra |
| injected-instruction hygiene | the host injects policy files (AGENTS.md etc.) onto the session surface; compressing the **current copy** of one makes the host re-inject the same file immediately — a compress → re-inject → compress loop (issue #71). The compressible-range table treats injected rows as barriers: never offered, never part of a span; a manual compress — the model's compress tool AND the human /acp-prune compress command alike — that covers a file's current copy is **rejected outright** (the error names the seq(s) and points out that stale copies are fine to compress) — compressing a current copy reclaims nothing because the host always re-pastes it. Rows are grouped by `source.changes[].scope` (= one file) and only each group's newest copy is protected — older copies superseded by an update stay safely compressible |

The load-bearing compression guidance (tools, philosophy, summary rules, tier rules) is registered as a one-time system-prompt section; each nudge carries a condensed version (efficiency note + philosophy + context breakdown + HOW_TO_COMPRESS_RULES + range table + batch tip). There is deliberately **no automatic summarization**: automatic policy only nudges the model (`compactIfNeeded` returns null).

## Video

A walkthrough of the ACP philosophy this project inherits — how active context compression keeps a session lean at ~200K tokens (opencode-acp & billion-context-pi). *Video credit: the original author, [裘香莲](https://space.bilibili.com/) on Bilibili — not ours.*

[![Watch on Bilibili](https://i1.hdslb.com/bfs/archive/083a77fede77502cbd6b2e206f8aadcc4dacc7ea.jpg)](https://www.bilibili.com/video/BV1qAMR6MEA4/)

## Model-facing tools

| Tool | What it does |
| --- | --- |
| `compress` | Replace a seq range with a dense summary you write (edges auto-balanced to tool-pair boundaries); re-compressing a block's summary node distills it (tier 2/3). Each range may carry `verifiedReadings: string[]` — the files/sections you actually read and verified in that range; persisted with the summary and echoed back in the compress result as `verified: …`, so later turns know what was checked without re-reading |
| `decompress` | Restore a previously compressed block's original content (read-only); accepts the `bN` ref shown by acp_status or a compaction id. Large blocks are paged by size — each page stays under the host tool-result trim budget (~7K chars, up to 100 messages) — so a normal page comes back intact; pass `offset`/`limit` and follow the continue hint in the result to walk a very large block |
| `search_context` | Search compressed block summaries and originals by keyword (acp-kernel hybrid retrieval: stemming + CJK bigrams + fuzzy); hits link back to the owning block |
| `acp_status` | CONTEXT BREAKDOWN (tool/text/summaries shares of the visible total) + compressed-block ledger + nudge decision line + a `Checkpoint seqs` row mapping each ACTIVE block's kernel ref (`bN`) to its checkpoint summary seq (the distill entry point, issue #60); no context-window rows. Drilldown supported: `scope:"compressed"` per block, `scope:"uncompressed"` + `view:"messages"`/`"ranges"` per message/range, with `tool` filter, `sort` order and `limit` cap. Drilldown row refs are kernel ids (mN) — feed them straight to `compress` as `startSeq`/`endSeq` (auto-mapped to the live surface seq); `Surface:` seqs work too |
| `/acp-prune` | status / compress / decompress from the command bar; status also shows human-side window info (estimated context, window source, compressed-block ledger, and **nudge arbitration** — `nudge: idle/ACTIVE — reason` plus how many tokens remain until the next nudge, decided by the same kernel turn as the nudge path) |

- **Summary source framing**: every compaction summary is prefixed at write time with `[Model-written summary — not user words; re-verify any obligations before relying on them]` — written into BOTH the durable summary event and its checkpoint node (one identical text), with an idempotent projection-time safety net for legacy blocks. Purpose: stop the model from executing obligation-like sentences inside a summary as if they were the user's own words.
- **Slim nudges**: the compression philosophy/rules sections are no longer repeated in every nudge body (they already live in the system prompt); a nudge carries only the trigger frame + context breakdown + range table. The template path (`config.prompts.nudge`) strips the same sections. Design background: [docs/injection-governance-design.md](docs/injection-governance-design.md).

## Upstream & credits

This project is a **port/derivation** and stands on the shoulders of the following upstream work — all MIT licensed. **Thank you** to [ranxianglei](https://github.com/ranxianglei) and the DeepSeek Harness team for building these projects and making them open source:

| Upstream | Author | Role |
|---|---|---|
| **[billion-context-pi](https://github.com/ranxianglei/billion-context-pi)** | [ranxianglei](https://github.com/ranxianglei) | The Pi coding-agent adapter this project ports to DeepSeek Harness; source of the adapter design, tool semantics, and this project's default configuration |
| **[acp-kernel](https://github.com/ranxianglei/acp-kernel)** | [ranxianglei](https://github.com/ranxianglei) | Framework-agnostic context-compression engine — reused **verbatim** (refs, blocks, tiers, nudge decisions, search, status) |
| **[opencode-acp](https://github.com/ranxianglei/opencode-acp)** | [ranxianglei](https://github.com/ranxianglei) | Origin of the ACP ("model decides when and what to compress") design |
| **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** | DeepSeek AI | The host platform this project extends (compaction capability seam, agent presets, durable session log) |

This project reuses `acp-kernel`'s compression core and `billion-context-pi`'s default behavior unchanged; the DSH adapter layer (session-event projection, durable surface transaction, model tools, nudge, config) is original work in this repository. Upstream copyright and licenses remain with their respective authors; see [LICENSE](LICENSE) for this project's terms.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `modelContextLimit` | auto-detected (fallback `128000`) | Context window used for the kernel's pressure decisions; an explicit value wins and skips detection. When omitted, the host session projection `contextPressure.contextWindow` is read first — the capacity disclosed for the **current real route** (a session that switched models follows automatically, no restart needed) — and the model API is probed only when the projection discloses no window; an explicit value also skips the output-reservation subtraction (the operator owns the denominator) (runtime-adjustable: `/acp-prune config`) |
| `autoModelContextLimit` | `true` | Resolve the real context window automatically: the host projection first (`windowFor` → `projectedContextWindow`, `src/window.ts`), then the model API probe (`agent.ctx.llm.resolveModelInfo`); both are skipped when `autoModelContextLimit: false`. On probe failure it falls back to the default, and the `/acp-prune` command shows the window source (the `acp_status` model tool carries no window info). A failed probe is surfaced in the host log and the `/acp-prune` panel (`restart to re-probe`) — the failure is cached like a success, so fixing the gateway requires a restart or an explicit `modelContextLimit` before the probe retries. On a successful probe the adapter's per-request output cap (`defaultMaxTokens` — the output reservation the provider guarantees at the end of the window) is SUBTRACTED, so every downstream pressure decision (nudge tiers, truncate, growth) measures usage against the SUSTAINABLE input budget (window − reservation): a 96K window with a 16K cap carries at most 80K of input, and the raw denominator understated usage by cap/window (≈17% there — and the ratio is far higher on short-window models, where the same cap is a quarter or more of the window). When the cap is undisclosed, the limit is explicit, or the probe fails, the raw-window behavior is kept; `/acp-prune status` shows the subtraction (raw − reservation). Changing `modelContextLimit`/`autoModelContextLimit` via `/acp-prune config` clears the window cache so the probe re-runs immediately |
| `nudgeMinContextLimitPct` | kernel default `0.45` | Nudge window lower bound (usage fraction) — validation only; the growth-driven trigger has no percentage floor — same default as billion-context-pi (runtime-adjustable: `/acp-prune config`) |
| `nudgeMaxContextLimitPct` | engine default `0.70` (kernel/pi default `0.75`) | Over-limit line: above this the nudge fires regardless of growth — deliberately below the host compaction-basic 80% auto-compaction line so the forced nudge fires first; an explicit value wins (a same-name key in `coreOverrides.nudge` outranks it — see below) (runtime-adjustable: `/acp-prune config`) |
| `nudgeEmergencyThresholdPct` | engine default `0.85` (kernel/pi default `0.95`) | Emergency nudge (bypasses the per-turn dedup, but is capped at 3 injections per user turn — issue #108) — lowered from `0.95`: at 95% the model has no room to act and the 80% auto-compaction line shadows it; an explicit value wins (a same-name key in `coreOverrides.nudge` outranks it — see below) (runtime-adjustable: `/acp-prune config`) |
| `preset` | — | (optional) Pick the nudge aggressiveness in one word: `preserve` / `relaxed` / `balanced` / `efficient` / `aggressive` (see “Presets” below). Fills ONLY the three nudge thresholds you did not set explicitly; precedence is explicit value > `preset` > engine default. An unknown name fails construction, and so does a merged window that ends up inverted (wrong `min` / `max` / `emergency` order). Does not touch any other knob (`modelContextLimit` / `autoNudge` / `prompts` / `coreOverrides`) (composition-only: not yet wired into `/acp-prune config` — a follow-up on issue #75) |
| `coreOverrides` | — | Any other acp-kernel `Config` override (billion-context-pi's `coreOverrides` escape hatch). Merge order: kernel defaults → top-level pct knobs → `coreOverrides.nudge` lands last — same-name keys take its value (read-only: composition-row-only, not exposed through settings) |
| `autoTools` | `true` | Register the four model tools on `ctx.tools` |
| `autoCommand` | `true` | Register the `/acp-prune` command on `ctx.commands` |
| `autoNudge` | `true` | Inject the nudge into `agent/pre-step` (runtime-adjustable: `/acp-prune config`) |
| `maxOverflowRetries` | `1` | Budget for automatic recovery from a provider-confirmed context overflow (`CONTEXT_WINDOW_EXCEEDED`): the engine hides the largest eligible range with a marker summary it writes itself (no model call — the request was just rejected, so there is no model turn to write one; every original stays in the session log and `search_context`/`decompress` find it again), then answers the host's `agent/request-error` so the request is retried. The budget counts per request and resets once the model makes progress (an assistant message lands) or the agent goes idle; `0` disables the automatic action (the error surfaces unchanged). This is ACP's ONLY automatic compaction action — the pressure side stays nudge-only, the model decides (composition-only, not in the settings layer; rationale and trade-offs in [docs/overflow-recovery-design.md](docs/overflow-recovery-design.md)) |
| `settingsEnabled` | `true` (enabled when unset) | (optional) Disable the runtime-settings integration entirely (composition-row-only, deliberately NOT in the settings layer — the switch cannot turn itself off; with it off the composition-row `config:` stays the only effective channel) |
| `prompts` | — | (optional) Custom prompt copy: per-slot overrides for nudge / range table / system prompt / tool descriptions (template + named placeholders, validated at construction; see “Custom prompt copy” above and [docs/configurable-prompts-design.md](docs/configurable-prompts-design.md)) |

## Presets

If you do not want to tune three percentages by hand, pick the nudge aggressiveness in one word — five tiers from “keep context as long as possible” to “compress early and often”:

| `preset` | min | max | emergency | Trade-off |
|---|---|---|---|---|
| `preserve` | 0.55 | 0.78 | 0.93 | Keep context as long as possible — nudge only close to the limit |
| `relaxed` | 0.50 | 0.75 | 0.90 | Light-touch compression — nudges a little earlier than preserve |
| `balanced` | 0.45 | 0.70 | 0.85 | Default balance — the same thresholds the plugin ships with (choosing this changes nothing) |
| `efficient` | 0.40 | 0.60 | 0.78 | Trim more often — favors low token usage over keeping full history |
| `aggressive` | 0.30 | 0.50 | 0.70 | Lean context — compresses early and frequently |

- **Fills only what you left unset**: `preset` fills ONLY the `nudge*ContextLimitPct` values you did not set explicitly; if you set both a `preset` and one of those thresholds, your explicit value wins (precedence: explicit > preset > default).
- **Presets reach the runtime settings layer too**: the threshold values a composed preset fills are registered as the settings layer's `base` — `/acp-prune config list` attributes them to `source: base`, and `/acp-prune config reset <key>` returns them to the **preset value**, not the engine default (a runtime reset restores what the composition chose). Without a preset, nothing changes.
- **No other knob is touched**: `modelContextLimit`, `autoNudge`, `prompts`, and `coreOverrides` are unaffected; `coreOverrides.nudge` still lands last and its same-name keys outrank everything.
- **See the active tier**: `/acp-prune status` prints the effective `preset` and the three thresholds **actually in force** — the line mirrors `kernelConfigFor`'s merge order, so any explicit override you made on top of the preset AND any same-name key in `coreOverrides.nudge` are shown as they really apply.
- **A typo fails loudly**: an unknown name throws at engine construction and lists the valid tiers (the same fail-fast contract as custom prompt templates) — it never silently falls back to the defaults. The bundle row itself carries no `config`, so a `preset` can only come from your own same-id `compaction-acp` row; if that row fails to construct, the profile stays down until you fix it (intended fail-fast, not a defect).
- **Runtime hot-swap**: presets are set at composition time today (install / `cordis.patch.yml`); once #75's settings.yaml hot-reload lands they can be changed from `/acp-prune config`. This PR makes them available at the composition layer first.
- **Two knobs deliberately left out**: the original request also named `growthRatio` (exists in acp-kernel as `nudge.growthRatio`, reachable via `coreOverrides`) and `protectedLastMessages` (≈ kernel `preserveRecentMessages`). Neither is a first-class engine knob here; adopting them as named keys / UI items is an owner decision, so they are not baked into the presets.
- **An inverted window is rejected**: if merging with explicit thresholds produces `min > max`, `max > emergency` or `min > emergency` (e.g. `preset: 'preserve'` with `nudgeMaxContextLimitPct: 0.5`), the engine throws at construction and lists the three values. The kernel only warns about such a config, so this check is added by the engine in `resolveAcpConfig`.
- **`max` is the value that races the host's 80% line**: each tier's onset is decided by `max`; the `preserve` / `relaxed` emergency values (0.93 / 0.90) sit above the host compaction-basic 80% line and act only as a label upgrade past it, so they are never reached when the host compacts first.
- **`min` has no runtime effect yet**: the pinned kernel reads it only in `validateConfig` (as the `nudgeMinContextLimitPct` option says), so tiers differ in practice by `max` and `emergency`.

## Development

```bash
npm install
npm run typecheck   # strict TS
npm test            # node --import tsx --test tests/*.test.ts
npm run build       # tsup bundle (inlines acp-kernel) + .d.ts
npm run test:e2e   # end-to-end host regression: real agent loop + scripted fake LLM (see below)
```

The end-to-end regression suite (`scripts/e2e/`) assembles the real DSH host in-process (cordis + agent-loop + the DeepSeek adapter), points it at a scripted fake LLM server, mounts this engine as the compaction backend, and asserts the persisted event log: compaction start/end pairing, the durable replace node, strict tool-call/result pairing, and the nudge injection rhythm — plus the request bodies the fake LLM **actually received** (wire-level prompt-cache byte-stability: envelope, `tools` array, leading message, and append-only turns for scenarios without compaction). Background and trade-offs: [docs/e2e-harness-design.md](docs/e2e-harness-design.md) (issue #120).

`dist/index.js` is self-contained except for the `@deepseek-ai/*` seam packages, which the hosting deployment provides.

## Architecture

```
src/
├── index.ts        # AcpCompactionEngine (CompactionEngine backend) + wiring
├── messages.ts     # M1: session events ↔ acp-kernel CoreMessage projection
├── state.ts        # M2: per-session kernel state
├── region.ts       # M5: durable region transaction + log-rebuilt block ledger
├── block-ledger.ts # M5 support: tier/lineage fields encoded inside compaction/summary rawOutput, never top-level (issue #141)
├── tools.ts        # M3: compress / decompress / search_context / acp_status
├── nudge.ts        # M4: kernel pressure decision → injected advisory nudge
├── system-prompt.ts# M4: one-time ACP guidance section (keeps nudges short)
├── config.ts       # kernel config assembly (thresholds + coreOverrides)
├── window.ts       # auto context-window detection (session projection first, LLM runtime probe fallback, default 128000) + output-reservation probe (defaultMaxTokens, subtracted in windowFor)
└── commands.ts     # M4: /acp-prune slash command
```

## License

MIT
