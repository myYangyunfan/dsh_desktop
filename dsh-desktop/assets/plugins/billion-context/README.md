# billion-context

<p align="center"><a href="./README.md">English</a> | <a href="./README.zh-CN.md">中文</a></p>

<p align="center"><strong>Context-compression plugin</strong> — <em>billion-context is all you need.</em></p>

<p align="center"><sub>small context windows (100K is enough) · <em>5× fewer tokens</em> · month-long single sessions (billions of tokens) · high compression quality</sub></p>

<p align="center">
<a href="https://www.npmjs.com/package/billion-context"><img src="https://img.shields.io/npm/v/billion-context.svg?style=flat-square" alt="npm"></a>
<a href="https://github.com/ranxianglei/billion-context/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/billion-context.svg?style=flat-square" alt="license"></a>
<a href="https://github.com/ranxianglei/billion-context"><img src="https://img.shields.io/badge/GitHub-ranxianglei%2Fbillion--context-181717?style=flat-square&logo=github" alt="GitHub"></a>
</p>

<p align="center">
<code>npm install -g billion-context --prefix=~/.local</code>
</p>

<p align="center">
<a href="https://claude.com/product/claude-code" title="Claude Code"><img src="https://cdn.simpleicons.org/claude/D97757" height="26" alt="Claude Code"></a>&nbsp;
<a href="https://github.com/openai/codex" title="Codex"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/simple-icons/openai.svg?color=white"><img src="https://api.iconify.design/simple-icons/openai.svg" height="26" alt="Codex"></picture></a>&nbsp;
<a href="https://opencode.ai" title="OpenCode"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/opencode/FFFFFF"><img src="https://cdn.simpleicons.org/opencode/000000" height="26" alt="OpenCode"></picture></a>&nbsp;
<a href="https://pi.dev" title="pi"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/pi/FFFFFF"><img src="https://cdn.simpleicons.org/pi/000000" height="26" alt="pi"></picture></a>&nbsp;
<a href="https://github.com/google-gemini/gemini-cli" title="Gemini CLI"><img src="https://cdn.simpleicons.org/googlegemini/8E75B2" height="26" alt="Gemini CLI"></a>&nbsp;
<a href="https://www.kimi.com" title="Kimi"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/kimi/FFFFFF"><img src="https://cdn.simpleicons.org/kimi/000000" height="26" alt="Kimi"></picture></a>&nbsp;
<a href="https://github.com/QwenLM/qwen-code" title="Qwen Code"><img src="https://cdn.simpleicons.org/qwen/6950EF" height="26" alt="Qwen Code"></a>&nbsp;
<a href="https://github.com/github/copilot-cli" title="GitHub Copilot CLI"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/githubcopilot/FFFFFF"><img src="https://cdn.simpleicons.org/githubcopilot/000000" height="26" alt="GitHub Copilot CLI"></picture></a>&nbsp;
<a href="https://www.trae.ai" title="TRAE"><img src="https://cdn.simpleicons.org/trae/32F08C" height="26" alt="TRAE"></a>&nbsp;
<a href="https://www.codebuddy.cn" title="CodeBuddy"><img src="https://cdn.simpleicons.org/codebuddy/6C4DFF" height="26" alt="CodeBuddy"></a>&nbsp;
<a href="https://qoder.com" title="Qoder"><img src="https://icons.duckduckgo.com/ip3/qoder.com.ico" height="26" alt="Qoder"></a>&nbsp;
<a href="https://iflow.cn" title="iFlow CLI"><img src="https://img.alicdn.com/imgextra/i4/O1CN01yBfg3x1iNi4YggwIt_!!6000000004401-2-tps-72-72.png" height="26" alt="iFlow CLI"></a>&nbsp;
<a href="https://www.minimax.io" title="MiniMax Code (mcode)"><img src="https://cdn.simpleicons.org/minimax/E73562" height="26" alt="MiniMax Code"></a>&nbsp;
<a href="https://www.deepseek.com" title="deepseek-harness (dsh)"><img src="https://cdn.simpleicons.org/deepseek/5786FE" height="26" alt="deepseek-harness"></a>&nbsp;
<a href="https://ampcode.com" title="Amp"><img src="https://icons.duckduckgo.com/ip3/ampcode.com.ico" height="26" alt="Amp"></a>&nbsp;
<a href="https://charm.land/crush" title="Crush"><img src="https://icons.duckduckgo.com/ip3/charm.land.ico" height="26" alt="Crush"></a>&nbsp;
<a href="https://zed.dev" title="Zed"><img src="https://icons.duckduckgo.com/ip3/zed.dev.ico" height="26" alt="Zed"></a>&nbsp;
<a href="https://aider.chat" title="aider"><img src="https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/assets/icons/favicon-32x32.png" height="26" alt="aider"></a>&nbsp;
<a href="https://github.com/aaif-goose/goose" title="goose"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/aaif-goose/goose/main/documentation/static/img/logo_dark.png"><img src="https://raw.githubusercontent.com/aaif-goose/goose/main/documentation/static/img/logo_light.png" height="26" alt="goose"></picture></a>&nbsp;
<a href="https://github.com/NousResearch/hermes-agent" title="hermes"><img src="https://raw.githubusercontent.com/NousResearch/hermes-agent/main/apps/bootstrap-installer/src-tauri/icons/128x128.png" height="26" alt="hermes"></a>&nbsp;
<a href="https://z.ai" title="zcode (Z.ai)"><img src="https://z-cdn.chatglm.cn/z-ai/static/logo.svg" height="26" alt="zcode"></a>&nbsp;
<a href="https://omp.sh" title="omp (oh-my-pi, Stencil Labs)"><img src="https://omp.sh/favicon.svg" height="26" alt="omp"></a>&nbsp;
<a href="https://github.com/1jehuang/jcode" title="jcode"><img src="https://github.com/1jehuang.png" height="26" alt="jcode"></a>
</p>

---

> **Cache health at a glance:** a healthy session keeps a **95–97%** prefix-cache hit rate — compression itself costs ≤2%. Sustained lower? Check attribution with `/acp` or `/acp-cache` (see [FAQ](#faq)); usual causes, in order: upstream cache TTL expiry · model switch · a bili bug (please report) · other/unknown.

## Community

QQ Group:
1056132097 (full)
1108730198 (full)
1129868472 (open)

---

## 📄 Paper / Preprint

- **[Model-Driven Incremental Hierarchical Compression: Training-Free Multi-Generational Context Management for Long-Lived Coding Agents](./paper/model-driven-incremental-hierarchical-compression-training-free-multi-generational-context-management-for-long-lived-coding-agents.md)** (English, v0.2)

> 📝 **The paper itself is open-sourced under the MIT License as part of the codebase (`paper/`). It is a living document — anyone may edit it; improvements are welcome via pull request.**

A production-scale longitudinal study: 4.5 months, three hosts, 174,327 model calls, 18.76B cumulative input tokens (~24.7B across all hosts), zero window violations on 204,800-token models, marathon sessions of 8,584–12,049 calls.

### 📊 Independent Third-Party Benchmarks

- **[1,500-Item Cross-Benchmark Evaluation (`LongMemEval-S` · `ContextBench` · `MemoryAgentBench`)](./benchmarks/third-party-1500/README.md)** ([中文版](./benchmarks/third-party-1500/README.zh-CN.md)) — head-to-head comparison of `billion-context` (`v0.1.202`) against `full` context and 3 RAG arms (`bm25`, `embedding`, `embedding-rerank`) with `DeepSeek V4.1 Flash`, `Qwen3-Embedding-8B`, `Qwen3-Reranker-4B`, and `Pi Agent`: **#1 on ContextBench** (`0.3097` Utilized F1, `-58.3%` cost vs `full`), **+16.6% over best RAG on LongMemEval-S** (`79.20%` vs `62.60%`, `-71.1%` independent-session cost vs `full`), and **100% survival on 1.48M-token MemoryAgentBench TTL** (`30×` steady-state compression where `full` fails `199/199`).

---

`billion-context` sits between **any** agent and its model API, rewriting Anthropic/OpenAI streams with [acp-kernel](https://github.com/ranxianglei/acp-kernel) compression. The model decides **when** and **what** to compress into high-fidelity summaries — not a hard truncation limit.

## Why

Long coding sessions blow up context. Each provider charges per token, and once you pass the context window the session degrades or dies. `billion-context` compresses consumed conversation into layered summaries so you can run a single session for days — billions of tokens through one context window.

Unlike a host's built-in summarizer, compression here is **incremental, reversible, and prefix-cache friendly**: summaries are written in small ranges, can be decompressed on demand, and the cache prefix stays intact.

## How it works

```
Agent (Claude Code / Codex / Cursor / Aider ...)
        │  you point the agent's base URL at the proxy
        ▼
┌─────────────────┐
│  billion-context│   1. parse the request (Anthropic or OpenAI shape)
│     proxy       │   2. run acp-kernel compression on the conversation
│                 │   3. inject a `compress` tool + compression philosophy
│                 │   4. forward to the real model API
│                 │   5. rewrite the streaming response
└─────────────────┘
        │
        ▼
   real model API (Anthropic / OpenAI / compatible)
```

### Context-management tools

The proxy injects four context-management tools into the conversation; the model calls them itself as context grows, and the proxy executes `compress` server-side so folded ranges stay summarized in history until restored:

- **`compress`** — fold a message range into a detailed summary.
- **`decompress`** — restore a compressed range when exact details are needed again.
- **`search_context`** — keyword search over compressed summaries and visible messages.
- **`acp_status`** — context-usage overview plus which ranges are still compressible.

## Which do I need?

Pick by your client:

| Client | Use |
|---|---|
| **pi** | [`billion-context`](https://github.com/ranxianglei/billion-context) — `bili pi` (launcher) or `bili plugin install pi` (native); standalone [`billion-context-pi`](https://github.com/ranxianglei/billion-context-pi) remains usable — details: [CLIENTS.md](CLIENTS.md#pi-pidev-coding-agent) |
| **opencode** (1.x / 2.x) | [`billion-context`](https://github.com/ranxianglei/billion-context) — `bili opencode` (launcher) or `bili plugin install opencode` (native); standalone [`opencode-acp`](https://github.com/ranxianglei/opencode-acp) remains usable on 1.x — full guide: [OpenCode](CLIENTS.md#opencode) |
| **omp** | [`billion-context`](https://github.com/ranxianglei/billion-context) via `bili omp` (built-in plugin) or `bili plugin install omp` (self-spawning native plugin, no launcher) |
| **dsh** | `bili dsh` (launcher — full native plugin via `--patch`) or `bili plugin install dsh` ≡ `dsh plugin --profile <name> add billion-context` (one unified lane) — details: [CLIENTS.md](CLIENTS.md) |
| **kimi** | `bili plugin install kimi` (self-spawning native, Kimi Code ≥ 2.0.0) or `bili kimi` (cert-MITM) or `/bili/` prefix — details: [CLIENTS.md](CLIENTS.md) |
| **hermes** | `bili plugin install hermes` (self-spawning native, Python plugin #958) or `bili hermes` (cert-MITM) |
| **zcode** (Z.ai / bigmodel coding plan) | `bili plugin install zcode` (self-spawning native, #1145) or cert-MITM via the GUI's Settings → Network or `/bili/` prefix — details: [CLIENTS.md](CLIENTS.md) |
| **claude** | `bili claude` (launcher) or `bili plugin install claude` (native posture, #964 — managed settings block + session-owned proxy; see the notes below) |
| **codex** | `bili codex` (launcher — the full zero-config posture) or `bili plugin install codex` (MCP-shell tools companion: **start bili first** — the shell never spawns a proxy and never routes codex's own traffic) — details: [CLIENTS.md](CLIENTS.md#codex-openai-codex-cli) |
| **jcode** | [`billion-context`](https://github.com/ranxianglei/billion-context) via `bili jcode` (cert-MITM) or `/bili/` prefix — no native mode (compiled Rust binary, no plugin seam, [#962](https://github.com/ranxianglei/billion-context/issues/962)) |
| **gemini** (Gemini CLI) | `bili gemini` (launcher, `GOOGLE_GEMINI_BASE_URL` `/bili/` rewrite) or `/bili/` prefix — launcher-only (no in-loop tool seam, #1043) |
| **iflow** (iFlow CLI) | `bili iflow` (launcher, `IFLOW_BASE_URL` `/bili/` rewrite) or `/bili/` prefix |
| **qwen** (Qwen Code) | `bili qwen` (launcher, cert-MITM) or `/bili/` prefix |
| **antigravity** (Antigravity CLI / agy, Google) | `bili antigravity` (launcher, `CLOUD_CODE_URL` `/bili/` rewrite of daily-cloudcode-pa.googleapis.com — Antigravity's real default upstream, #3129) or `/bili/` prefix — no plugin seam (closed Go language_server; its user-plugin surface is additive-only, #2115) — details: [CLIENTS.md](CLIENTS.md) |
| **mcode** (MiniMax Code) | [`billion-context`](https://github.com/ranxianglei/billion-context) via `bili mcode` (cert-MITM) or `/bili/` prefix — no native mode (event hooks only, no model-request seam, [#1050](https://github.com/ranxianglei/billion-context/issues/1050)) |
| **aider** | [`billion-context`](https://github.com/ranxianglei/billion-context) via `bili aider` (cert-MITM) or `/bili/` prefix — no native mode (shell-command-only hooks, no tool-injection seam, [#1048](https://github.com/ranxianglei/billion-context/issues/1048)) |
| **copilot** (GitHub Copilot CLI) | `bili copilot` (launcher, cert-MITM) — closed Go binary, no plugin seam (#1049) |
| **amp** (Amp CLI) | `bili amp` (launcher, cert-MITM) — closed Go binary, no plugin seam (#1049) |
| **kiro** (Kiro CLI, AWS) | `bili kiro` (launcher, cert-MITM) — Rust shell + Node agent server, no plugin seam; model traffic is the Responses wire on `runtime.<region>.kiro.dev`, gateway quirks handled built-in — details: [CLIENTS.md](CLIENTS.md#kiro-cli-aws) |
| **crush** (Charm Crush) | `bili crush` (launcher, cert-MITM) — open-source Go binary, no plugin seam; built-in provider hosts whitelisted, custom `base_url`s auto-discovered from crush.json (#2340) |
| **zed** (Zed editor) | `bili zed` (launcher, cert-MITM) — open-source Rust editor, no plugin seam; reqwest honors HTTPS_PROXY, CA via SSL_CERT_FILE (Linux env probing); built-in provider hosts whitelisted, custom `api_url`s auto-discovered from settings.json; loopback providers (ollama/lmstudio) stay direct via NO_PROXY (#2340) |
| **goose** (Goose CLI) | `bili goose` (launcher) — rustls trusts no CA file, so no cert-MITM: openai/anthropic legs via `OPENAI_HOST`/`ANTHROPIC_HOST`, custom providers via a regenerated `GOOSE_PATH_ROOT` overlay (#1049) |
| **everything else** (no context hook) | [`billion-context`](https://github.com/ranxianglei/billion-context) — `bili <client>` (launcher, preferred) or `/bili/` prefix |

**Native mode vs standalone extensions.** The host-native plugins (`bili plugin install …`) and the standalone in-process extensions (`billion-context-pi`, `opencode-acp`) are **mutually exclusive** — both active means double compression. The installer makes the switch: it replaces the legacy entries (bare name, `npm:` alias, versioned, path form; array or object shape) and snapshots the original config to `.bili-bak` once; a **project-local** install is not touched — remove that one by hand. As a runtime safety net for manual installs, the native entries set `BILLION_CONTEXT_NATIVE=<host>` synchronously at load so a standalone extension can stand down at action time. On the pi side the marker needs `billion-context-pi` **0.1.72+**, and the pi-native entry scans both pi settings files once its proxy is up and warns loudly when it spots a co-resident legacy entry the installer never saw — that warning is the only visible signal while an old `billion-context-pi` silently double-compresses.


## Install

Linux / macOS — install with a user-level prefix (no `sudo`, no npm config
changes, and `bili`'s self-update never hits permission errors):

```bash
npm install -g billion-context --prefix=~/.local
```

The `bili` command lands in `~/.local/bin` — already on PATH in most distros;
if not, add `export PATH="$HOME/.local/bin:$PATH"` to `~/.bashrc` or
`~/.zshrc`. On nvm or Homebrew Node the default prefix is already user-owned —
a plain `npm install -g billion-context` works as-is. On Windows the default
prefix (`%APPDATA%\npm`) is also user-writable — plain `npm install -g billion-context`.

This installs the `bili` command (`bili-proxy` is kept as an alias). Hitting
`EACCES` with an old root-owned prefix? Reinstall with `--prefix=~/.local`
(pass the flag again on any future npm reinstall of `bili`) — that is the
permanent fix; avoid `sudo`.

Prefer containers? A `Dockerfile` ships at the repository root — see
[Running in Docker](#running-in-docker) below.

## Quickstart

Three ways to use it — pick one:

- **Native plugin (most native):** `bili plugin install <client>` — bili
  becomes a plugin inside the client; start the client as usual.
- **Launcher (config-free):** one `bili <client>` command brings up the proxy and
  the client together — no real config file is ever touched.
- **URL change (most universal):** prefix your client's baseURL with the proxy
  origin + `/bili/`.

Mechanism details behind these three options (plugin lifecycle, runtime-info
protocol, injection priority) live in [TECHNICAL-NOTES.md](TECHNICAL-NOTES.md).

Ports, briefly (#1660): `bili start` (manual) owns `8787`. Everything a lane
spawns for you (native hooks, launcher lanes) lives in a separate
self-managed zone starting at `18787` — collisions hop +1 and each lane
remembers its drift, so zero-config installs never fight you for a port,
and a deliberate `bili start` daemon is attached by default. Attach is
lane-aware (#2905): a hook rides its own lane's instance first, NEVER
another declared lane's — except lanes you list in
`native.attachLanePriority` — and the 8787 user-zone daemon stays the
LAST-resort fallback. An
upgrade-restart that finds the previous build still draining on the lane's
port waits for it to release (up to 5s) and rebinds the SAME port instead of
drifting (#1723); only a genuinely occupied port hops +1 — and that hop is
now logged loudly.

### Option 1 — Native plugin (`bili plugin install pi` / `omp` / `opencode` / `dsh` / `kimi` / `hermes` / `zcode`)

The proxy lives inside the client: install once, then start the client
exactly as you always do — no launcher command, no env vars, no fixed port,
no URL edits. Supported today for **pi**, **omp**, **opencode** (1.x and
2.x), **dsh**, **kimi**, **hermes** and **zcode**:

```bash
bili plugin install pi          # registers a "billion-context" entry in pi's settings (npm form when bili itself was npm-installed)
bili plugin install omp         # registers an extensions entry in omp's config.yml (~/.omp/agent/config.yml)
bili plugin install opencode    # registers the plugin in opencode's real config + disables native auto-compaction
bili plugin install dsh         # runs 'dsh plugin --profile <name> add billion-context' for every existing profile
bili plugin install kimi        # writes $KIMI_CODE_HOME/plugins/managed/billion-context/kimi.plugin.json (+ installed.json record); per-session routing block lands in config.toml on first start (Kimi Code >= 2.0.0)
bili plugin install hermes      # copies the Python plugin into ~/.hermes/plugins/billion-context/ (+ machine-owned bili.json sidecar) and enables it via `hermes plugins enable billion-context`
bili plugin install zcode       # writes hooks.enabled + a SessionStart hook + mcp.servers.bili into ~/.zcode/cli/config.json; per-session routing lands in the bigmodel provider store on first start
bili plugin remove <client>     # undo (dsh removes through the same channel; config snapshots go to .bili-bak)
```

Where a client has its own plugin channel you can also install natively,
skipping bili commands entirely:

- **dsh:** `dsh plugin --profile <name> add billion-context` is the very
  command `bili plugin install dsh` drives per profile (npm form only; a git
  checkout has no published entry — pasting a GitHub address installs source
  without `dist/` and the bundle never loads) — same end state either way
  (pnpm into the profile, bundled patch layer mounted by dsh itself); remove
  through the same channel. See the dsh section below.
- **opencode:** add the bare npm name to your real config's plugin list —
  `"plugin": ["billion-context"]` (npm form only; a git checkout has no
  published entry). The package publishes `exports["./server"]` →
  `dist/agent/opencode-native.js`, so opencode loads it through its own
  Npm.add machinery and the plugin self-spawns exactly like the
  bili-installed form. Do the two things the bili installer would have done
  for you too: set `"compaction": { "auto": false }` in the same config
  (otherwise OpenCode's native auto-compaction double-compresses) and keep a
  manual backup of the file first.
- **claude:** this repository doubles as a Claude Code plugin marketplace —
  `/plugin marketplace add ranxianglei/billion-context`, then
  `/plugin install billion-context@billion-context`, then run
  `/billion-context:bili-setup` (it drives `bili plugin install claude` for
  you and tells you to restart). Same end state as the bili installer; the
  plugin ships no hooks or MCP entries of its own, so nothing
  double-registers.

For pi / omp / kimi / claude there is no client-side channel — `bili plugin
install <client>` writes their config entries for you (kimi's declarative
`kimi.plugin.json` + registry record, claude's managed settings block, …).

Notes:

- Native mode is **mutually exclusive** with the standalone in-process extensions (`billion-context-pi`, `opencode-acp`) — the installer swaps the entries and snapshots the original config (`.bili-bak`).
- **pi:** native installs wire in built-in subagents by default (`acp_delegate` / `acp_delegate_wait` / `acp_delegate_cancel`) — how to disable them while keeping context compression: [Pi built-in subagents](#pi-built-in-subagents).
- OpenCode legacy sessions, V1/V2 shapes and caveats: [OpenCode](CLIENTS.md#opencode).
- `kimi` reports runtime-info at bootstrap only (static headers can't carry per-request window/model values); subagent tool calls are routed by the proxy's outbound tool-use witness ring (#1685) — no model-visible conversation id.
- `hermes`'s native plugin is Python: it points hermes' httpx stack at the proxy via env vars after a health check and stamps per-request headers through an `llm_request` middleware.
- `codex` is the one client a plugin install cannot make self-sufficient: codex routes model traffic via env only (no config-file routing seam for the default ChatGPT-login provider — a managed `model_providers` block would force API-key auth and drop subscription login), and an MCP server cannot inject env into its parent. `bili plugin install codex` writes a single `[mcp_servers.bili]` block into `~/.codex/config.toml` (command = node, args = dist/mcp.js) exposing the four ACP tools; at session start the shell resolves a proxy — env `BILI_MCP_PROXY` > the live-instance record (any lane's proxy or a `bili start` daemon) > the 8787 user-zone default (#1660 removed the install-time origin bake, #403) — nothing reachable → `tools/list` fails with -32003. So: start bili first (`bili start` or any client's lane proxy), export HTTPS_PROXY yourself if you also want compression, or use `bili codex` for the zero-config full posture. Mechanics: [CLIENTS.md](CLIENTS.md#codex-openai-codex-cli).
- `claude` has a native posture (#964): managed settings block + `SessionStart` hook + MCP shell; the hook rides the self-managed port zone (#1660) and re-pins the managed URL to the live origin each session, so port drift self-heals. Since #1821 the MCP shell also watches the proxy mid-session (30 s tick × 3 failures) and respawns a dead lane proxy itself, so model requests recover within ~90 s instead of a new session (same semantics as the zcode lane). Opt out with `BILI_NATIVE_CLAUDE=0` (passthrough). Mechanics: [TECHNICAL-NOTES.md](TECHNICAL-NOTES.md). **Known limitation (#2290):** the Claude Desktop app's Code tab (`CLAUDE_CODE_ENTRYPOINT=claude-desktop`) sets its own `ANTHROPIC_BASE_URL` on its embedded Claude Code, overriding the managed one — desktop sessions bypass the proxy entirely while the managed block's `DISABLE_AUTO_COMPACT=1` still applies, so they get neither bili compression nor native auto-compaction. The hook warns loudly at session start (and records it for `bili doctor`, which also flags machines where Claude Desktop is installed alongside the native lane); terminal sessions are unaffected. **Field-tested 2026-10-06 (#2290):** putting `HTTPS_PROXY` in the settings `env` block produced zero CONNECT traffic to a live MITM-enabled proxy on Claude Desktop 2.19675.1 / embedded CC 2.1.288 (Windows 11) — the variable reaches no network stack there, matching the CLI behavior of that era — note that newer builds (CC 2.1.301+) DO honour `HTTPS_PROXY` on the CLI, which is why `bili claude` routes via the `/bili/` base-URL rewrite — the launcher gives this lane no proxy and no CA at all, and a child that brings a proxy of its own gets the loopback hosts merged into `NO_PROXY`/`no_proxy` so that leg stays direct regardless of its proxy behavior (#3446). As of that version there is no usable routing seam on the desktop Code tab; the lane stays tracked in [#2290](https://github.com/ranxianglei/billion-context/issues/2290) in case upstream changes behavior. Desktop-only users can restore native auto-compact with `bili plugin remove claude`. Since #5095 the managed block also installs a `SubagentStart` hook (`node <root>/dist/claude-subagent-hook.js`) that mints a per-dispatch lane token into each subagent's context: subagents that ride the parent's session id with no agent-id headers (the VS Code extension build, #4352) key onto their own `<id>|sub:…:t:<token>` compression lanes, so parallel same-type dispatches stop merging (and the token disappears from later requests once the first message folds — those fall back to the fingerprint lane). Uninstall removes the hook with the managed block.
- `zcode` has a native posture (#1145): managed `~/.zcode/cli/config.json` block + per-session provider `baseURL` rewrite. Full mechanics: [CLIENTS.md](CLIENTS.md).
- `jcode` and `aider` have no native mode (no plugin/MCP/tool-injection seam: #962, #1048) — use `bili jcode` / `bili aider`.
- `copilot`, `amp` and `goose` are launcher-only (#1049); goose cannot be cert-MITMed (rustls trusts no CA file) and rides plain-HTTP base-URL redirects instead.

### Option 2 — Launcher (`bili pi` / `bili codex` / `bili claude` / `bili omp` / `bili opencode` / `bili hermes` / `bili dsh` / `bili codebuddy` / `bili qoder` / `bili trae` / `bili jcode` / `bili kimi` / `bili gemini` / `bili iflow` / `bili qwen` / `bili antigravity` / `bili mcode` / `bili aider` / `bili copilot` / `bili amp` / `bili goose` / `bili kiro`)

The launcher wraps a client in one command: it starts a proxy on an
independent port (a fresh instance is always spawned — a port is never
reused), then points the client at it — **certificate-based MITM** where the
client honors proxy/CA env vars, or an isolated **`/bili/` config rewrite**
where it doesn't. No real config file is ever edited; the client's own
config is READ to discover which HTTPS upstream hosts it talks to, and those
hosts are whitelisted for MITM so the proxy can TLS-terminate exactly them
and blind-tunnel everything else.

```bash
bili pi                               # launch pi through the proxy — file-free (#535): env + extension registerProvider, real ~/.pi untouched
bili codex                            # launch codex through the proxy
bili claude                           # launch claude through the proxy
bili omp                              # pi-style, file-free (#535): env + extension registerProvider + compaction cancel, real ~/.omp untouched
bili opencode                         # OpenCode (1.x & 2.x): full guide in the [OpenCode](CLIENTS.md#opencode) section below
bili hermes                           # file-free (#535): hermes proxy env (HTTPS_PROXY + combined CA bundle via SSL_CERT_FILE) — https via CONNECT MITM, http via absolute-form forward proxy; real ~/.hermes untouched
bili dsh                              # deepseek-harness: full native plugin injected via --patch (#941) — real dsh tools, session-bound /acp + /acp-cache (plugin mode); non-loopback upstreams ride proxy envs, loopback keeps the overlay DSH_HOME rewrite (#535); dsh auto-compaction off everywhere — host plane via the bundle patch, web-profile presets at load time (#1772/#2474/#3354)
bili codebuddy                        # Tencent CodeBuddy Code CLI: CODEBUDDY_BASE_URL /bili/ rewrite (OpenAI chat completions wire), budget aligned via CODEBUDDY_AUTO_COMPACT_WINDOW; real ~/.codebuddy untouched
bili qoder                            # qoder CLI (`qoder`/`qodercli`): model endpoint is hardcoded https (no /bili/ rewrite possible) — cert-MITM via HTTPS_PROXY + NODE_EXTRA_CA_CERTS, default model hosts whitelisted (#653). Qoder Desktop is a separate BYOK/custom channel that speaks plaintext OpenAI over a `/bili/` prefix — point it at bili as a normal custom provider (not this MITM lane); its official-subscription traffic is encrypted and out of scope (#764)
bili trae                             # Trae CLI (ByteDance, closed Go binary, no base-URL override) — cert-MITM via HTTPS_PROXY + SSL_CERT_FILE, model host from TRAE_CLI_API_HOST or the default enterprise gateway (#655)
bili jcode                            # jcode (Rust agent harness) — env-only cert-MITM launch: HTTPS_PROXY + SSL_CERT_FILE, model host api.z.ai whitelisted, local loopback providers stay direct via NO_PROXY
bili kimi                             # Kimi Code CLI (Moonshot): standard proxy envs except an unconditional loopback bypass — https via cert-MITM, http via absolute-form forward proxy; loopback endpoints inventoried with a manual /bili/ hint (#757)
bili gemini                           # Gemini CLI (Google): GOOGLE_GEMINI_BASE_URL /bili/ rewrite to generativelanguage.googleapis.com (Google native wire), real ~/.gemini untouched
bili iflow                            # iFlow CLI: IFLOW_BASE_URL /bili/ rewrite to apis.iflow.cn/v1 (OpenAI chat-completions wire), real ~/.iflow untouched
bili qwen                             # Qwen Code (multi-protocol gemini-cli fork, no base-URL hook): cert-MITM via HTTPS_PROXY + NODE_EXTRA_CA_CERTS, default DashScope/Qwen model hosts whitelisted, custom relays via --mitm-domain
bili antigravity                      # Antigravity CLI (agy, Google): CLOUD_CODE_URL /bili/ rewrite of daily-cloudcode-pa.googleapis.com — the real default upstream (bare cloudcode-pa 400s on /v1internal:*, #3129); undocumented language-server env override, v2.19.1 binary-verified; wire recognized as Google native by path (#2115)
bili mcode                            # MiniMax Code CLI: same shape as kimi (proxy envs, unconditional loopback bypass, cert-MITM/absolute-form); session bound via X-Mavis-Session-Id (#1050)
bili aider                            # Aider (Python pair programmer): cert-MITM via HTTPS_PROXY + SSL_CERT_FILE/REQUESTS_CA_BUNDLE; endpoint from OPENAI_API_BASE / ANTHROPIC_BASE_URL / --openai-api-base / .aider.conf.yml (#1048)
bili copilot                          # Copilot CLI (GitHub, closed Go binary) — cert-MITM via HTTPS_PROXY + SSL_CERT_FILE, api.githubcopilot.com + per-plan subdomains whitelisted (#1049)
bili amp                              # Amp CLI (Sourcegraph, closed Go binary) — cert-MITM via HTTPS_PROXY + SSL_CERT_FILE, ampcode.com whitelisted (#1049)
bili goose                            # Goose (Block, Rust/reqwest): rustls release builds trust no CA file — openai/anthropic legs via OPENAI_HOST/ANTHROPIC_HOST, custom providers via a regenerated GOOSE_PATH_ROOT overlay (/bili/ rewrites, real config untouched) (#1049)
bili kiro                             # Kiro CLI (AWS): cert-MITM via HTTPS_PROXY + combined CA on SSL_CERT_FILE and NODE_EXTRA_CA_CERTS; only runtime.<region>.kiro.dev is decrypted; developer/system items re-voiced as user for the gateway; session = Kiro's conversation id (survives --resume)
bili pi --mitm-domain api.foo.com     # add a domain to the MITM whitelist
```

### Option 3 — URL change (`/bili/` prefix)

Start the proxy:

```bash
bili
```

Then just prefix your client's existing baseURL with `http://localhost:8787/bili/`.
The full upstream URL is embedded in the path, so the proxy knows where to
forward without any config:

```
client baseURL before:  https://api.openai.com/v1
client baseURL after:   http://localhost:8787/bili/https://api.openai.com/v1
```

For more per-client configuration examples, see the web UI guide at [http://localhost:8787](http://localhost:8787).

**Verify.** With the proxy running and your config saved, check it answers
and that your first real request shows compression activity in the log:

```bash
# Health check (proxy up + where it forwards)
curl -s http://localhost:8787/__bili/health
# → {"ok":true,"upstream":"https://api.anthropic.com"}

# Live session stats (after a real request)
curl -s http://localhost:8787/__bili/stats
```

Then send one message from your client and watch the log
(`~/.local/state/billion-context/bili.log`, also printed to stderr). You
should see a `processTurn` line per request, and once the conversation grows,
`[acp-usage] round N input=X cached=Y (cache hit Z%)` + a `compress` event.

### Client deep dives

Everything that doesn't fit in one Quickstart line — how each client's lanes attach, what gets written where, and known limitations — lives in **[CLIENTS.md](CLIENTS.md)**: dsh · Kimi Code · Hermes · ZCode · Gemini family (Gemini CLI / iFlow CLI / Qwen Code / Antigravity) · cert-MITM clients that never compress (CONNECT blind tunnels, #897) · unrecognized endpoints going direct (#1290) · OpenCode (launcher / native / pure proxy, `/acp` status & rules, legacy opencode-acp sessions #920).

## From source (development)

> **Risk:** `master` is the development branch and can be broken at any moment — unreleased changes, failing builds, unverified fixes. Unless you are patching the code or testing an unreleased fix, install a release with npm as above.

```bash
git clone https://github.com/ranxianglei/billion-context.git
cd billion-context
npm ci
npm run build
npm link
bili --version
```

After `npm link`, `bili` works from any directory.

## FAQ

**How do I check my cache hit rate?** Don't dig through logs — `/acp-cache`
prints a **text summary report right in the client**, headed by a clickable
**Web UI link**: open it for the web version of the session page — the cache
hit-rate **line chart** plus per-break **attribution**:

![web session page: cache hit-rate chart + attribution](docs/cache-web-session.en.png)
The report has four
blocks that pin things down at a glance: **GRAND LEDGER** (totals + hit% with
an explicit `HEALTHY` verdict; misses decomposed into new content /
compress re-pay / upstream-ttl-or-client-rewrite) · **FOLD ECONOMICS** (per-fold
economics: net tokens saved, paid-back verdicts) · **LINE ITEMS** (anomalies
only: hit<85% or miss≥5000). Rule of thumb: **compression itself costs ≤2%** —
a healthy session sits at **95–97%**. When you see less, the attribution tells
you which of the usual suspects it was, in this order: ① upstream cache TTL
expiry (shows up as stable-prefix misses — the top-spikes line names idle
times), ② a model switch, ③ a bili bug (report it with the page attached),
④ other/unknown. `/acp-cache [full]` lists every fold & line; same report over
Since #1535 the report ends with a `MODEL SWITCHES` section: a mid-session
model change invalidates the provider's prefix cache, so the whole stable
prefix is re-billed on the next request — each switch's unexplained residual
(its `ttl` bucket minus new content) is charged to the switch instead of
masquerading as TTL expiry; per-event `from → to`, hit %, and attributed
tokens are listed (`full` lists every event, the summary the last 8), and
the web sessions table gains a matching model-switch column. Since #2131 the
same machinery fingerprints the outbound credential (a 12-hex sha256 of the
`authorization`/`x-api-key`-family headers — the raw key is never stored) and
attributes a **key switch** — the relay behind a stable URL rotated to a
different account — in a dedicated `KEY SWITCHES` section, a `key switch:`
line in `CACHE INVALIDATION`, and a 🔑 badge in the web sessions column.
HTTP: `GET /__bili/cache-report`; the raw per-request `[acp-usage]` lines still
land in the log file for deep dives.

**What does `/acp` show?** In clients with the native plugin (opencode, dsh,
hermes), `/acp` renders the ACP status panel of the current conversation
straight from
the proxy (session, blocks, compressible ranges, usage); before the first model
request it shows an idle notice instead. `/acp-cache [full]` prints the cache
report above.

**Can I query sessions and config over the web?** Yes — open
[http://localhost:8787](http://localhost:8787): an overview dashboard, session
list with per-session detail, live logs, a config editor, and an upstream
connectivity test. A Blog view renders notes and long-form articles inside the
panel itself — bundled with the install, refreshed from GitHub master on a
~1-hour throttle while online (fail-soft to the bundled copy when offline);
the full library also lives on GitHub Pages. Everything else is also plain JSON
for scripting (`/__bili/stats`, `/__bili/sessions`, `/__bili/config`, …).

**When does compression happen?** It is model-driven: the injected context
tools are called by the model as context grows, gentle growth nudges
(~50K-token steps by design, adjustable via `compress.nudgeGrowthTokens`)
prompt it along the way, and preflight fires as a hard backstop when the input
alone exceeds the window (#470). Watch it live with `/acp` or the web UI.

**Does compression shrink my client's own conversation file?** No — the most
common surprise in very long sessions (#5796). Compression shrinks **what is
sent to the model**: every outgoing request is rebuilt from live blocks plus
summaries, so the wire stays small however long the conversation runs. The
client's stored history is user data — bili never rewrites it. On dsh the
host's auto-compaction is additionally disabled while bili is active (two
compressors must not fight over one history, #1772/#2474/#3354), so the
host-side file grows with every turn: each turn takes longer as it grows
(measured: tens of seconds per turn at ~30K messages, #5796), and the
practical convergence path is to **start a new session** when it gets heavy.
The web session list badges sessions at 5,000+ requests (长会话/slow) as a
reminder that this point has been reached.

**Why does the first compaction wait until ~200k?** Compaction does not
trigger on absolute window position but on growth intervals: by default the
first soft compaction fires 50k tokens past the boot content
(`compress.nudgeGrowthTokens`, flat and window-independent). With a boot around
100k — or with the growth step set to ~100k — the first compaction may wait
until ~200k. To make it fire earlier: 1) trim the system prompt, disable
unneeded tools, prune skills; 2) lower `compress.nudgeGrowthTokens` to ~50k;
3) enable lean mode. Worked example in
[CONFIGURATION.md](CONFIGURATION.md#why-the-first-compaction-waits-until-200k).

**Is bili transparent? How do I turn it off?** Unrecognized endpoints forward
unchanged ([CLIENTS.md](CLIENTS.md)), and every mode reverses cleanly:
`bili plugin remove <client>` for native installs, stop using the launcher
command / env vars / `/bili/` prefix for the other two — traffic goes direct
again immediately.

**Can I combine bili with a model-routing gateway (e.g. [magpie](https://github.com/yetone/magpie))?**
Yes — point the client at bili, and point bili at the gateway through the
`/bili/` prefix, which embeds the gateway's absolute URL:
`http://localhost:8787/bili/http://127.0.0.1:3425…`. Example: Claude Code →
`ANTHROPIC_BASE_URL=http://localhost:8787/bili/http://127.0.0.1:3425` +
`ANTHROPIC_API_KEY=magpie`; OpenAI-style clients →
`OPENAI_BASE_URL=http://localhost:8787/bili/http://127.0.0.1:3425/v1` (+
`OPENAI_API_KEY=magpie`). Compression happens *before* routing — every request
that reaches any account in the gateway's routing groups is already compressed.
Credentials stay in the gateway: the client's dummy key rides through
untouched, and real keys never touch bili. Caveats: ① an account switch
mid-conversation invalidates the provider's prefix cache — inherent to
multi-account routing, not bili (watch it in the `KEY SWITCHES` section of
`/acp-cache`); ② routed model names are opaque to bili's window lookup —
declare their context windows under the providers key
`http://127.0.0.1:3425` via `models.<name>.context`, or they run on the
fallback window (route-miss warning, #2317); ③ if the relay rejects bili's
Anthropic-lane `cache_control` stamps, set `compat.noCacheControl`; ④ loopback
gateways work out of the box; a gateway on a private non-loopback address may
additionally need `network.allowPrivateHttpProviders` (#2984); ⑤ for Claude Code
native plugin mode (`bili plugin install claude`), set
`BILI_CLAUDE_UPSTREAM=http://127.0.0.1:3425` before install so the managed block
wraps the relay into `ANTHROPIC_BASE_URL` (or configure
`ANTHROPIC_BASE_URL=http://127.0.0.1:8787/bili/http://127.0.0.1:3425` directly;
`localhost` and `127.0.0.1` both accepted, #5369). Verified end-to-end over all
three wires (OpenAI Chat / Responses / Anthropic Messages, including
cross-protocol conversion), #4433.

**Where are logs and session data stored?** Log:
`~/.local/state/billion-context/bili.log` (also mirrored to stderr); session
state: `~/.local/share/billion-context/` (XDG-overridable; Windows AV exclusion
#362, opt-in cleanup #1082) — full paths in [CONFIGURATION.md](CONFIGURATION.md).

## Running the proxy

### Running in Docker

A `Dockerfile` ships at the repository root — it installs the published npm
package at build time (the tested artifact; nothing is compiled in the image)
and runs the proxy as a service:

```bash
docker build -t billion-context .
docker run -d --name bili -p 8787:8787 \
  -v bili-config:/root/.config/billion-context \
  -v bili-data:/root/.local/share/billion-context \
  -v bili-cache:/root/.cache/billion-context \
  -v bili-state:/root/.local/state/billion-context \
  billion-context
```

Then point clients' baseURL at `http://<host>:8787/bili/…` exactly like Option 3
above.

- **Base:** `node:24-slim` — uses the builtin `node:sqlite` storage engine directly (no native-addon download). Don't switch to Node 20 bases: the self-downloaded SQLite engine requires Node ≥ 22 and crashes under 20 (#3341).
- **Updates:** in-container self-update is **off by default** (`ACP_AUTO_UPDATE=0`) — the sanctioned update channel for a containerized copy is rebuilding/pulling a newer image; an in-place self-update would be silently reverted to the image version on the next recreate. Opt back in with `-e ACP_AUTO_UPDATE=1`; pin a release at build time with `--build-arg BILI_VERSION=0.1.197` (default `latest`).
- **Data:** the four mounted dirs hold config, session state, update throttle/lock + cached SQLite engine, and logs respectively. Mount volumes or bind mounts so they survive container replacement; the image also declares them as `VOLUME`s so even a bare `docker run` keeps them out of the container layer.
- **Security:** the container listens on `0.0.0.0:8787` so clients outside it can connect — there is **no authentication**, so expose the port only on a trusted network (same caveat as `--host 0.0.0.0` below). The web UI and `/__bili/*` JSON endpoints work unchanged through the mapped port.
- **Healthcheck:** the image ships a `HEALTHCHECK` probing `/__bili/health` on 8787 via node's builtin fetch (no curl needed in the slim base); if you override the listen port, remember the probe stays pinned to 8787.

### Flags

```bash
bili --port 9000              # change listen port
bili --host 0.0.0.0           # listen on all interfaces (see host note below)
bili --debug                 # verbose logging (also: set "debug": true in config)
bili --passthrough           # forward without compression (smoke-test mode)
bili --config ~/my-bili.json # use a different config file
bili update                  # check & install a newer version now (bypasses throttle)
bili doctor --fix            # converge drifted dsh profile ledgers (manifest spec / lockfile record / bundle copy) to the on-disk version (#3496)
bili --no-auto-update        # disable self-update for this run
bili --auto-restart-on-update   # self-restart when a new version is installed (default off)
bili --bin /path/to/client   # launcher: spawn this exact client binary instead of auto-detecting (env BILI_CLIENT_BIN)
```

Flags override env vars and the config file. `bili --help` lists them all.

### Remote agents (`--host`)

By default the proxy binds `127.0.0.1` and only accepts loopback connections. To serve agents on other machines: `bili --host 0.0.0.0` (or your LAN IP); remote agents point their model `baseURL` at `http://<this-host>:<port>/bili/…`.

- MITM-mode `CONNECT` then also accepts remote clients — for **whitelisted model hosts only**. Blind tunnels to arbitrary hosts stay loopback-only, so the proxy can never be used as an open relay.
- `/bili/<absolute-url>` destination admission (#409): the proxy itself and link-local/metadata addresses are always denied; loopback/private destinations are allowed for local clients (self-hosted upstreams) and denied for remote clients unless listed in `BILI_TUNNEL_ALLOWED_HOSTS` (`host` or `host:port`, comma-separated). One exception (#1073): a **local** client relaying a management path (`/__bili/*`, `/__acp/*`) to a **loopback IP-literal** destination is forwarded unmarked; remote peers and hostname destinations keep the internal tunnel marker unconditionally, and management paths stay unreachable through the tunnel even via NAT hairpin. An absolute-form request addressed to the instance's own endpoint on a management path is served locally instead of tunneled (a forward-proxy-style health probe gets a real answer).
- There is **no authentication**: only do this on a trusted LAN or behind a firewall. The `/__bili/` management endpoints remain loopback-only. A startup `[security]` warning reminds you of the above.

### Debugging

`bili --debug` (or env `ACP_DEBUG=1`, or `"debug": true` in config — flag > env > config) logs every `processTurn` (tag counts, token usage), the nudge decision (growth/usage/pendingT1/shouldInject), client headers, and SSE rewrites.

### Log file

All logs tee to `~/.local/state/billion-context/bili.log` by default (XDG state dir) and still print to stderr. Override with `"logFile"` in config or `ACP_LOG_FILE` (`off` disables the file). Auto-rotates at 10 MB (`bili.log.old`). Per-request cache-hit stats log as `[acp-usage] round N input=X cached=Y (cache hit Z%)` so you can measure prefix-cache health directly from the log.

### Connection lifecycle tuning (#1982)

Client-facing connections close gracefully after the final response: when the proxy initiates the close (`Connection: close`), it waits up to `BILI_POST_RESPONSE_LINGER_MS` (default `5000`) for the client's close signal before releasing the socket, so pooled clients see a clean EOF instead of a possible RST from racing bytes. Related knobs: `BILI_KEEP_ALIVE_TIMEOUT_MS` (idle-reap budget, default `5000`) and `BILI_CLIENT_ERROR_BACKSTOP_MS` (terminal backstop for the error-drain path, default `30000`) — full semantics in [CONFIGURATION.md](CONFIGURATION.md#environment-variables).

### Self-update

The proxy checks npm on startup and every 3 minutes; a newer version is installed in place and a notice is logged — **restart `bili` to pick it up**, unless you enable opt-in self-restart (`--auto-restart-on-update` flag, env `ACP_AUTO_RESTART_ON_UPDATE=1`, or `"autoRestartOnUpdate": true` in config — default OFF): with zero in-flight requests it verifies the new install, stops accepting connections, drains, spawns a replacement on the same port, and exits once it accepts connections (clients reconnect automatically; session state survives on disk). Safety gates: zero in-flight through the drain window, an install sanity check before re-exec, and a 10-minute cooldown marker so a flapping version can never loop-restart; any failure resumes the original listener and falls back to the plain reminder.

**Staggered rollout (#3619):** a discovered version is not applied immediately by automatic updates. Each instance draws ONE random moment inside a delay window (built-in default **15 min – 48 h**) and upgrades when it arrives; the drawn moment is persisted, so restarts never re-roll. Fleet upgrades therefore spread across the window instead of completing within minutes of a release, leaving time to catch a bad release mid-rollout (#3401/#3600/#3394). The window plus emergency controls live in a public policy file (`auto-update-policy.json` in this repo, fetched anonymously with ETag caching): `hold` freezes automatic upgrades fleet-wide, `blocked` skips listed versions, `pinned` sets an upgrade ceiling. Fail-open by design — an unreachable or malformed file simply falls back to local defaults, and the file can steer timing/skip/pin only, never what gets installed. Per-machine exits: manual `bili update` bypasses `hold`/stagger (still respects `blocked`/`pinned`), `"staggerMinDelayMs": 0` + `"staggerMaxDelayMs": 0` (or `BILI_UPDATE_STAGGER_MIN_MS`/`BILI_UPDATE_STAGGER_MAX_MS`) restore legacy immediate upgrades, and `ACP_AUTO_UPDATE=0` disables auto-updates entirely. Full format and semantics: [CONFIGURATION.md → `update`](CONFIGURATION.md#update).

While the running process is behind the on-disk install ("stale"), the web UI shows a banner (running vs installed version, auto-restart state) and `GET /__bili/status` returns `{version, diskVersion, stale, autoRestartOnUpdate, advisory, updatePolicy, inFlight}` for scripting (`advisory` is the active critical-defect entry or `null`, see below; `updatePolicy` reports the #3619 rollout state — policy source, `hold`/`pinned`/`blocked`, and the pending staggered upgrade with its due time). Disable permanently via `"autoUpdate": false` in config or `ACP_AUTO_UPDATE=0`.

In **plugin mode** (`bili opencode` / `bili pi` / `bili dsh` — the proxy runs embedded in a long-lived host), "restart bili" means restarting the **host**: the embedded process cannot exit on its own, so a host left open keeps serving whatever code it started with, silently missing every fix auto-update reports as installed (#1603). Enable `--auto-restart-on-update` to have it self-restart at a safe point, or run `/acp` (OpenCode hosts today — pi/dsh coverage tracked in #2084) — the status panel appends a one-line staleness warning (running vs installed version) whenever the on-disk install is ahead of the live process. Auto-update only ever replaces disk files and (optionally) the proxy process; **injected code inside the host process only takes effect after the host itself restarts** — so if the injection breaks at runtime mid-session (a disposed agent scope, a disabled plugin), model traffic goes direct and uncompressed until then. Since #3581 this state is visible instead of silent: the web UI shows a "takeover broken" banner (agent + refusal count) whenever a plugin reports its attribution gate degraded while no session is live, and `GET /__bili/status` / `/__bili/overview` expose the per-agent `attribution` state (`ok`/`none`/`threw`, refusal count, first-refusal timestamp). Background lanes that are agentless **by design** (e.g. dsh's title-generation sidecar) never carry an initiator, so their small one-shot calls go direct by definition; under the #3651 contract these normal interceptions are NEVER reported and therefore can never raise the banner. The banner fires only when the attribution lookup itself throws (an internal host error, e.g. a disposed agent scope), and then names what failed: the thrown error text, the masked endpoint, when the episode started, how many requests went uncompressed, the remedy (restart the host process), plus copy/submit-diagnostics buttons that prefill a GitHub issue.

**Update visibility is silent by default since v0.1.183 (#1977):** routine/recommended releases no longer render an update line on the `/acp` panel footer or in `acp_status` — only a `critical`-tier release surfaces there (`CRITICAL UPDATE READY/AVAILABLE`). The standing ways to check an installed-but-not-restarted release are the stale cues above: web UI banner, the `/acp` one-line warning, and `GET /__bili/status`. Deliberately no always-on nag; the advisory channel (#1481) remains the only auto-visible critical path.

When an install keeps failing (unwritable or host-managed dir, network error, …), auto-update no longer re-downloads and retries on every 3-minute cycle forever. After three consecutive failures it backs off exponentially (5 min → 10 → 20 …, capped at 6 h), logs a one-time actionable hint (fix permissions / npm prefix, reinstall user-level, or disable via `"autoUpdate": false` / `ACP_AUTO_UPDATE=0`), and logs nothing further about the failure while cooling down (no download, no retry line); it resumes as soon as the failure clears or a different version is targeted (#1603).

The same bounded retry now covers the **owner-managed lanes** the global self-update drives instead of writing the copy itself — the dsh desktop in-place copy, the dsh profile bundles, and pi's npm copy (#2192). Each lane keeps its own failure streak keyed by lane + target version, so a persistently broken desktop layout no longer re-downloads the full tarball every cycle (up to ~480 downloads/day per affected machine before the fix); three strikes arms the same exponential cooldown, and the one-time hint names the failing lane and its manual fix (`dsh plugin --profile <name> add …`, `pi update --extension …`, or recreate the desktop profile). Host-managed instances additionally check on their own slower cadence — 30 minutes plus up to 15 minutes of jitter, tracked under a separate throttle marker — instead of consuming the global 3-minute budget. Failure streaks are shared across every bili process on the machine through a small state file in the cache dir (`.install-backoff.json`), so several running instances don't each burn their own retry budget; a clean `bili plugin update` disarms the dsh profile lane immediately. The file is written atomically (tmp+rename) and every writer merges with what is already on disk, so concurrent instances cooperate instead of overwriting each other's streaks; long-lived processes re-read it when it changes, so a manual disarm by one copy is visible to the others on their next check. It is fail-safe in the retry direction — a corrupt file or jumped clock is dropped, never allowed to silence a lane for long. `bili plugin update` clears the dsh-profile lane's key; a repaired desktop lane clears its own key on its next successful in-place refresh.

### Stale local DNS after a network/VPN change (#5224)

A **long-lived** standalone proxy can keep holding stale OS-resolver state after a WSL/VPN/TUN topology change — the process caches its system resolver and libuv's `getaddrinfo` does not re-read `/etc/resolv.conf` on its own. Symptom: every model request through the `/bili/` tunnel answers HTTP 502 `tunnel_destination_denied` with detail `unresolvable`, even though a freshly started `bili` resolves the same host fine at that moment and `curl` from a new shell works. Either remedy clears it:
- **Restart the proxy process** — a fresh process re-reads the system resolver. In the launcher lanes and the dsh web-profile lane the proxy is a *separate registered* process (the instance registry), so restarting only the client/host re-adopts the same wedged proxy and does **not** help — you must stop and relaunch the proxy itself. (In embedded plugin mode the proxy runs inside the host, so restarting the host *does* clear it.)
- **Route egress through an upstream proxy** — `-F http://<host:port>` or `BILI_UPSTREAM_PROXY=… BILI_UPSTREAM_PROXY_MODE=auto`: the destination is then resolved remotely by that proxy, so bili never consults its own (stale) resolver for admission.

### Critical-defect advisories (forced updates)

Independent of auto-update (#1481): even with `autoUpdate` off, the proxy polls a small companion npm package (`billion-context-advisories`, published by CI from this repo's [`advisories/`](advisories/) directory) on the same 3-minute cadence. Each advisory names a semver range of broken versions (`affected`), the exact version to install (`target` — which may be *older* than the current one, i.e. a rollback), and a user-facing `reason`. When the local version falls inside `affected`, bili force-installs `target` through the self-updater's full safety chain (cross-process lock, backup + verify + rollback; source checkouts and host-managed installs are refused with manual instructions instead) and warns prominently: a one-time `[advisory] ⚠️ …` log line per process per advisory id, a banner on the web UI showing the reason and the exact manual upgrade command, and the active entry under `advisory` in `/__bili/status`. The check is fail-open by design: an unreachable or malformed advisory source only produces a warning — model traffic is never blocked by it. Disable via config (`"advisoryCheck": false`) or env (`BILI_ADVISORY_CHECK=0`); point at a custom document with `"advisoryUrl"` / `BILI_ADVISORY_URL`.

**Announcements** (#5548) — distinct from the defect advisory above, three sources feed the web-UI banners, and equal ids shadow in the order **local file > remote feed > built-in**: (1) *built-in* one-time notices rendered from the UI i18n strings; (2) *local* — drop JSON files into `<config dir>/announcements/*.json` (`~/.config/billion-context/announcements/` by default) and they render automatically: bilingual records with kind-derived color, npm-style `versions` targeting (`>=a.b.c`, `^`, `~`, `[lo hi]`, `||` lists), `percent` grey rollout, time windows, and per-kind priority — one bad file disables only itself; (3) *remote* — this repo's master branch [`announcements/remote.json`](announcements/remote.json) (CI-linted on every PR), fetched on the ~3-minute watcher cadence, whose last-known-good snapshot survives restarts and outages while malformed pushes are rejected; unreachable installs (firewalls) point `"remoteAnnouncementsUrl"` / `BILI_ANNOUNCEMENTS_URL` at a relay mirror of the same document. Dismissal follows each record's declared mode: `persistent` (default, content-addressed — editing a notice shows it again), `instance` (this process run only), or `always` (renders without a close button). Dismissing a built-in intro notice is recorded per install in bili's unified storage (SQLite by default; the MySQL backend works too), so it survives restarts — the old `upgrade-notices.json` state file remains only as fallback on legacy-only installs without a unified sidecar. The official feed currently ships an empty entry list.

## Configuration

The full configuration reference — config file location, top-level keys,
providers, compression tuning, environment variables — lives in
**[CONFIGURATION.md](CONFIGURATION.md)**.

### Config file

One JSON document at `~/.config/billion-context/billion-context.json`
(`$XDG_CONFIG_HOME/billion-context/`; override the path with `BILI_CONFIG_FILE`).
Precedence when several sources set the same knob: **CLI flag (where one exists) > env var > config file > built-in default** — every env var keeps working as the override tier.

What's inside (details in CONFIGURATION.md):

- `providers` — per-provider routing table: upstream override, model context windows, per-provider/model compress tuning, wire-protocol declaration, compaction opt-in.
- `compress` — three-level compression tuning (global → provider → model): thresholds, nudge cadence, preservation rules, prompts, tiers.
- Server-level blocks — process-wide behavior, including the #2030 additions: `network` (timeouts / retry / keep-alive / preflight cadence), `persist` (session persistence format + tail), `sessions` (cap + GC policy), `update` (registry mirror + check interval), `diagnostics` (dumps, render-tag mode, injection switches), `fakeCompletion`, plus scalars `codexCompact` / `ccrRetrievalTtlMs` / `decompressTmpCap` and extensions `mitm.handshakeTimeoutMs`, `compat.noCacheControl`, `compat.keepResponseId`.

Minimal example:

```json
{
  "network": { "upstreamTimeoutMs": 900000 },
  "persist": { "zstd": true },
  "sessions": { "gc": { "enabled": true, "maxAgeDays": 14 } }
}
```

Knobs people look for first:

- **Upstream proxy (firewall/GFW)** — routing the proxy's own outbound traffic through v2rayA/clash: full resolution order, empty-string = explicit direct, SOCKS5 rejection, both egress paths, and the `mitm://` vs `https://` key schemes live in [CONFIGURATION.md](CONFIGURATION.md) (Server Settings → `proxy`; Providers → key schemes).
- **Wire-compat role rewrite (`compat.roles`)** — an upstream that rejects the `developer` role? Covered by [CONFIGURATION.md](CONFIGURATION.md) (Server Settings → `compat`) — including the learn-on-failure auto-fix that needs no configuration at all.
- **Signed upstreams (body-covering signatures)** — a gateway whose requests carry a body-covering signature (CodeArts APIG's `SDK-HMAC-SHA256`, or gateway-invented headers like `x-ofm-signature`): the built-in scheme re-signs transparently on dsh; every other detected scheme is ALWAYS refused locally — signed requests are either re-signed+compressed or refused, never passed through unsigned — and bili keeps reminding at startup and in the web UI until it ships the scheme's re-signer (#1884/#2090). Detection rules, per-scheme overrides, and `BILI_RESIGN` / `BILI_RESIGN_PASSTHROUGH` / `BILI_CODEARTS_REF` live in [CONFIGURATION.md](CONFIGURATION.md) (Server Settings → `resign`).

### Pi built-in subagents

Using `bili pi` or the native pi plugin (`bili plugin install pi`) includes built-in subagent support, enabled by default: `acp_delegate`, `acp_delegate_wait`, and `acp_delegate_cancel`. This additional tool surface is specific to pi.

**Keep only one subagent implementation enabled.** If you use the built-in support, remove or disable other pi subagent plugins (for example, `pi-subagents` or a separately installed `billion-context-pi-subagents`) in both user and project settings to avoid overlapping tools, prompts, or behavior. If you prefer another subagent plugin, disable the built-in support instead. A `pi-subagents` install at either scope (project or user) makes the built-in delegate stand down automatically by default — a user-scope install loads in every project, so the guard applies there too (#5637); set `delegate.forceEnable` to keep `acp_delegate` alongside it.

To disable the built-in subagents while keeping context compression, merge this into `~/.config/billion-context/billion-context.json` (or the file selected by `BILI_CONFIG_FILE`), preserving your other settings:

```json
{
  "pi": {
    "subagents": false
  }
}
```

Restart pi and start a new session for the change to take effect. This disables the three delegate tools, their system-prompt section, and the fleet keyboard shortcut; context compression remains enabled. It does not disable independently installed subagent plugins. More options: [subagent configuration](CONFIGURATION.md#pi).

## How sessions work

The proxy keys compression state on **the conversation value the client itself provides, verbatim** (`src/session-id.ts`) — no hashing, no protocol/upstream/API-key dimensions (those mutate mid-conversation and orphaned state exactly when users kept talking, #280/#286). The id stays inside the proxy (state store, persistence, UI label); it is never sent upstream.

Where the value comes from, first hit wins: the plugin's
`x-bili-plugin-conversation` (honored only alongside the `x-bili-plugin`
marker header), then per-client headers (`x-claude-code-session-id`,
`x-grok-session-id`/`x-grok-conv-id`, `x-mavis-session-id`,
`x-opencode-session-id`), then generic
headers (`x-session-affinity`, `x-acp-session`, `x-session-id`,
`x-opencode-session`, `session-id`/`session_id`), then body fields:
`session_id` / `metadata.session_id` on the Responses wire, and
`prompt_cache_key` promoted over the content-fingerprint fallback on the
Responses/OpenAI/Anthropic wires.

| Client | Sends conversation id? | Source |
|---|---|---|
| **Codex** | ✅ yes | `body.session_id` / turn-metadata thread id |
| **OpenCode** | ✅ yes | `x-opencode-session-id` header (`ses_…`, the request's own session id; 2.x sends the *parent's* cache-routing affinity in `x-session-affinity`/`X-Session-Id`/`x-opencode-session` alongside it, #2779 — 1.x sent its own id in those instead) |
| **Claude Code** | ✅ yes | `x-claude-code-session-id` header |
| **omp** (via plugin) | ✅ yes | `prompt_cache_key` promoted over any fingerprint (#268) |
| **pi** (bare) | ❌ no | nothing → anonymous prefix affinity below |

**omp caveat (#2583/#3556):** on recent OMP builds, default Anthropic (`anthropic-messages`) requests leave the host through OMP's Cowork transport over node:https directly — they never reach bili's fetch layer, so the `prompt_cache_key` stamp is *withheld* there (stamping would leak the field into Anthropic's strict schema → HTTP 400). Since #3556 the `bili omp` launcher lane no longer leaves that hole open by default: unless you set `PI_PROXY` / `PI_PROXY_ANTHROPIC` yourself, the launcher exports `PI_PROXY_ANTHROPIC=<proxy>`, which pushes Cowork onto Bun's fetch and routes it through the proxy like every other lane (compressed and session-visible; the stamped key is consumed and stripped by the proxy). Direct-and-anonymous remains only for native omp mode and for launcher lanes where you pin your own proxy posture; all other omp traffic keeps its stamped identity. Details: [TECHNICAL-NOTES.md](TECHNICAL-NOTES.md).

**Header-less clients (pi-like): anonymous prefix affinity.** With no conversation signal at all, the proxy resolves the session from the replayed history itself (`src/prefix-affinity.ts`, #309): a request reattaches to a stored session only when its history reproduces that session's message chain byte-exactly from position 0; otherwise it gets its own deterministic `pfa-…` session. Consequences (#1262): a **resumed** conversation reattaches to its own session (even after a proxy restart, #499); a **new task with an identical opener does NOT inherit** another conversation's blocks — it mints a fresh, fully separate session; a request with no usable signal at all gets an explicit 400 instead of silently colliding.

Design record and threat model: [SESSION-IDENTITY.md](SESSION-IDENTITY.md). The
message-granularity sibling (why identity is content-derived, not an
assigned id) is [MESSAGE-IDENTITY.md](MESSAGE-IDENTITY.md).

For upstream sticky-routing, the proxy forwards only identity values the
client already supplied (e.g. a body `session_id` is forwarded upstream as
`x-session-id`); it never synthesizes one itself.

**Recommendation:** explicit-id clients are safe to run concurrently. For header-less multi-agent use, prefer the client plugin (stamps a stable id per conversation) or pass an explicit `x-acp-session` header — otherwise prefix affinity still keeps distinct tasks apart (a diverged fork costs one raw resend plus a compression-ladder restart).

### Derived (child) sessions inherit the parent's compressed context (#1333, #1362)

A child session (subagent/fork starting from an empty history) reports its lineage at birth — its identity registration carries `parentConversationId` and the proxy records a read-only `derivedFrom` link — so `decompress` / `search_context` fall back along the parent chain for content the child never saw itself (cycle-guarded, depth cap 8). Nothing is copied into the child, the parent is never modified; if the parent is unknown the child simply starts fresh. Per-lane parent signals (pi/omp `parentSession` header, OpenCode V1/V2 `parentID`): [SESSION-IDENTITY.md](SESSION-IDENTITY.md#derived-child-sessions-lineage-at-birth-1333-1362). claude/codex/dsh need nothing here: they share one session id across subagents or have no child-session concept at all.

### Running multiple instances (#3633)

**One conversation belongs to one instance for its whole life.** Fold state,
prefix affinity and the summary budget are keyed to a session id whose home is
the client's own history — and the session's rows live in that instance's
`index.db`. There is no shared store between instances: nothing replicates,
nothing fails over, nothing rehydrates a session onto a different instance.

Consequences for anyone tempted to put several instances behind one Service:

- **Sticky routing is required, and `ClientIP` affinity is the wrong kind.**
  The conversation identity lives in a header or the request body, not the
  source IP — a Service can only hash on IP, so a client pinned to replica N
  silently loses *every* session when replica N dies (buying throughput while
  selling away availability, exactly when you scaled out because of load).
  Correct routing is an L7 proxy hashing a conversation header
  (`x-bili-plugin-conversation`, `x-opencode-session-id`, `x-acp-session`, …)
  onto a backend — and the client actually sending one (header-less clients
  get prefix affinity instead, which an L7 proxy cannot hash).
- **Instance count is volume count.** The state directory is one local
  directory with SQLite in WAL mode (`busy_timeout=5000`); a coherent shared
  `-shm` and working byte-range locks across writers require an RWO volume
  that is never shared. Pointing two instances at the same RWX/NFS path does
  not give you a shared store — it gives you silent corruption behind a
  timeout. One RWO volume per instance, `storage.unified` included: "unified"
  means one store *for that instance* (sessions + CCR + CAS in one
  `index.db`), not one store for the fleet.
- **The workload that actually scales** is *many independent short-lived
  conversations* — one proxy per client or per lane — not *one long
  conversation load-balanced across proxies*. Long conversations are
  single-instance by design.

**Single machine, multiple installs (#5046).** The topology above covers
deployment replicas; one desktop has a sibling situation: two installs on ONE
machine (e.g. two DSH profiles — desktop + bot, or a global npm copy beside a
host-tree copy) each start their own proxy and, unless isolated, both resolve
the SAME default XDG sessions directory and the same config file. Multiple
processes writing ONE local-disk `index.db` is the SUPPORTED topology
(#5082/#5091) — SQLite WAL is multi-process safe on a local filesystem — so
startup NEVER blocks on a live foreign writer: the peer shows up as an
info-level `[storage] process pid … is also using …` line plus the status wire,
nothing more (policy settled 2026-10-31, withdrawing the #5046/B-era
refuse-to-start for exactly this shape). What genuinely remains hazardous is
two installs walking the SAME *session* concurrently — that case alarms
separately (split-brain contest, #3923). If you still want strictly separate
histories and stores per install, give each its own `BILI_SESSIONS_DIR` (plus
`BILI_CONFIG_FILE` when the config should differ too) through that install's
launcher/profile environment — no global env changes needed. Once isolated,
the `[instances]` notice drops off entirely. Note the distinction from the
deployment case above: local disk with SQLite WAL tolerates many writers;
shared RWX/NFS storage does NOT and keeps requiring one writer per volume.

Naming note: `POST /__bili/replicas` creates a session **checkpoint fork**
(from stored checkpoints), not a pod replica — read it as `/__bili/checkpoints`.


The proxy rewrites each session's state file every turn of a long session; on Windows, real-time AV (Defender), the search indexer, or a sync tool (OneDrive) can lock the sessions dir mid-write, so persists fail with `EPERM` until the lock clears. Fix at the root: add `%USERPROFILE%\.local\share\billion-context\` to your antivirus exclusions (Defender steps included) and keep sync tools off that path — [CONFIGURATION.md](CONFIGURATION.md#windows-exclude-the-sessions-dir-from-antivirus-362). The same exclusion also covers the unified-storage `index.db` refusing to open (`unable to open database file`, #3823) — the storage-degrade warning names it as the first suspect.

### Session file cleanup (#1082)

Short-lived sessions leave small state files behind that are never resumed. Cleanup is **opt-in** (`BILI_SESSION_GC=1`; off by default — session files are user data, no silent deletion policy): when enabled, bili sweeps the sessions dir at boot and hourly and deletes a file only when BOTH hold — older than `BILI_SESSION_GC_MAX_AGE_DAYS` (default 7 days) AND never compressed with its newest request body ≤ `BILI_SESSION_GC_MAX_TOKENS` tokens (default 1M) — so deletion loses nothing but bytes. CCR content stores follow their session file's lifecycle; compressed sessions are never deleted; every deletion is audit-logged. Full policy: [CONFIGURATION.md](CONFIGURATION.md#environment-variables).

### Storage maintenance CLI (#3928)

The same store maintenance the panel exposes over HTTP (`POST /__bili/storage/gc`, `POST /__bili/storage/restore`) has a thin CLI layer — no proxy needed, run it on any machine that owns the sessions dir:

```bash
bili sessions ls                 # id, label, decoded size, last-updated, storage status (active/archived)
bili sessions rm <id>            # full delete (content refcount release incl. media); shrinks index.db afterwards (--no-vacuum skips)
bili sessions archive <id>       # export to archive/archive.jsonl + sweep rows; tombstone keeps label & identity
bili sessions restore <id>       # bring an archived session back from the log line
bili sessions foreign-blocks     # (#5312) list fold blocks whose covered messages never belonged to this transcript — dry-run; --apply reversibly archives them, --restore <sid>:<bid> brings one back
bili storage gc [--days N] [--vacuum full|incremental] [--dry-run]
                                 # print the sweep plan (sessions past retention, zero-ref content rows, ~pages reclaimable), then run the same gc() the HTTP endpoint calls; --dry-run stops after the plan
```

`archive`/`restore`/`gc` require the unified store (`BILI_STORAGE_UNIFIED=shadow|full` or `storage.unified` in the config file) — legacy-only installs refuse with a hint. `--days` defaults to `storage.archiveAfterDays` (365). No scheduler: these run on demand. All commands accept `--json`.

**Full vacuum is an offline operation on large databases (#4612).** `--vacuum full` (the default) rewrites the entire index.db under an exclusive write lock — O(db size), minutes to tens of minutes on multi-GB databases, with no intermediate progress (SQLite's VACUUM is atomic; it cannot be split). Running it while a proxy is serving from the same sessions dir starves that proxy's writes until its storage layer degrades, so `storage gc --vacuum full` **refuses to start when another live process holds the database** (`index.db.lock` pid discipline, #4175): the CLI exits 1 with an actionable message, the panel endpoint returns HTTP 409. Stop the other instance first (or wait for it to exit) and retry; for online-safe shrink use `--vacuum incremental`, which reclaims freed pages in short transactions without taking the exclusive lock. The zero-ref delete sweep itself is batched with per-batch progress output either way.

## Status

Early. Protocol handling and compression work against mock tests (500+ passing). Real-model integration testing is the next milestone. Expect rough edges.

Client-side plugins for pi / omp / opencode ship inside `billion-context` (`dist/agent/*.js`) for the cooperative-proxy path. See the **"Which do I need?"** section above for how `billion-context`, the standalone `billion-context-pi`, and `opencode-acp` relate.

## Attribution requirement (one term on top of MIT)

This project is MIT-licensed **plus one additional term**: any product or service (commercial or open source) whose users can see or interact with it and which uses this software must attribute it — stating that it uses billion-context with a link back to this repository — on its home page, documentation, or About/Credits page. Pure server-side/embedded use satisfies this via shipped documentation. See the **Additional Term** at the end of [LICENSE](LICENSE).

If you build on this project, we'd love to hear about it: open an issue (no obligation) so we can track where it's used.

## License

MIT
