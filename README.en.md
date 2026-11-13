![DSH Pack](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/banner.en.svg)

**The best of the DSH plugin ecosystem, packaged into one ready-to-use desktop client.**

Not just another DSH shell: we pick the plugins, fix compatibility, integrate them, and ship them in one installer.
Install and go — no Node.js setup, no plugin hunting, no version-conflict archaeology.

[![Release](https://img.shields.io/github/v/release/myYangyunfan/dsh_desktop?color=4D6BFE&label=Release)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Downloads](https://img.shields.io/github/downloads/myYangyunfan/dsh_desktop/total?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Stars](https://img.shields.io/github/stars/myYangyunfan/dsh_desktop?style=social)](https://github.com/myYangyunfan/dsh_desktop) [![Issues](https://img.shields.io/github/issues/myYangyunfan/dsh_desktop?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/issues) [![License](https://img.shields.io/badge/license-MIT-4D6BFE)](LICENSE) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20%C2%B7%20macOS%2012%2B%20%C2%B7%20Linux-4D6BFE) [![Release CI](https://img.shields.io/github/actions/workflow/status/myYangyunfan/dsh_desktop/tauri-release.yml?color=4D6BFE&label=Release%20CI)](https://github.com/myYangyunfan/dsh_desktop/actions)

[中文](README.md) · Latest **[v1.1.0](https://github.com/myYangyunfan/dsh_desktop/releases/latest)** (2026-11-13)

> [!NOTE]
> **v1.1.0 = kernel bump `0.2.2-rc.2` → `0.2.2-rc.3` + bundled Node fixed in the portable builds**. No Rust shell or UI
> changes; the roster is still 33 plugins. It also closes a v1.0.10 gap: the two portable zips were byte-identical
> (the bundled `node.exe` never made it into the payload). Now **Full ships Node, Lite is genuinely smaller**.
> The installer ships the complete dsh runtime plus 33 curated companion plugins; the shell is Tauri 2 + a bundled Node runtime,
> so installers stay small, startup is fast, and **a broken plugin or config never leaves you with a blank window**.
> Full changelog: [release notes](https://github.com/myYangyunfan/dsh_desktop/releases/tag/v1.1.0).

**Contents**: [Why](#-why-a-curated-plugin-bundle) · [Preview](#-app-preview) · [Get started](#-get-started) · [Bundled plugins](#-bundled-plugin-ecosystem) · [FAQ](#-faq) · [Community](#-community) · [Sponsor](#-sponsor--support) · [Build](#-build-from-source) · [Releases](#-releases--maintenance)

---

## ✨ Why a curated plugin bundle

DSH has a great plugin ecosystem, but "great" and "ready to use" are separated by four walls: selection, compatibility, versions and configuration.
DSH Pack does that work for you: **curated, integrated, shipped in the box.**

### Curated, not collected

- **33 companion plugins, each one chosen** — we optimise for quality, not count. Every bundled plugin gets a host-compatibility check, a licence review and a real boot test; the roster and evidence live in [the inventory](dsh-desktop/docs/builtin-plugins-inventory.md).
- **One installer, one complete experience** — Bot team and group chats (DeepSeek-Bot), the Better Sidebar file workbench, free multi-engine search (Free Search), the plugin shop, prompt optimisation, the conversation map, desktop notifications, the MCP / skills toolbox, balance and cost, session archiving, peak/off-peak price guard — all there after install.
- **Traceable upstreams** — every bundled plugin records its source repository, version and licence. Third-party licences are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); compatibility verdicts and test evidence are in §5 of the inventory.

### Ready out of the box

- **Zero environment setup** — a standalone Node runtime and npm CLI are bundled; the target machine needs no Node.js or pnpm.
- **Complete dsh, offline** — ships the official `@deepseek-ai/dsh` package and the full official plugin set; it starts without a network.
- **Double-click to run** — reuses the last port, then loads a native window once the kernel is ready; installer and portable builds are both available.
- **Client-level updates** — check and install from the ⋯ menu, with GitHub / Gitee dual-source failover and sha256 fail-closed verification; the kernel ships with the client, so there is no second update chain.

### Desktop experience

- **Tauri 2 native shell** — frameless dark glass, custom title bar, Win11 rounded corners; closing hides to the tray by default.
- **File workbench** — Better Sidebar brings the explorer, editor, diff view and "open locally" into the right pane, with desktop-native collapse/expand and shortcuts.
- **Bot team** — DeepSeek-Bot puts a main bot, long-lived bots and group chats in the same client: @ handoffs, shared group memory, a capability library and usage pages.
- **Notifications and balance** — dsh-notify handles turn-complete / approval / error notifications and click-to-session; the composer footer shows real-time "this turn cost · balance".

### Engineering resilience

- **Guardian waterfall** — the kernel boot chain self-heals level by level: broken plugins auto-repair, corrupt configs rebuild, crash loops restart in place.
- **Crash self-healing** — renderer freezes are detected by heartbeat and reloaded; the supervisor probes the kernel and relaunches with backoff.
- **Your data stays** — over-the-top upgrades keep the profile and sessions; plugin toggles only edit the patch layer, never user data.

## 📸 App Preview

![DSH Pack UI](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/showcase.png)

**Vanilla `dsh web`** vs **DSH Pack**:

| Capability | Vanilla `dsh web` | DSH Pack |
| --- | --- | --- |
| Startup | Manual Node.js install & CLI | Double-click, bundled runtime |
| Surface | Browser tab | Native window · frameless dark glass |
| Plugins | Find, install and reconcile each one yourself | **33 curated plugins in the box**, with one place to inspect / toggle / update |
| Sessions | Archive only | Archive / restore / delete + conversation map |
| Balance | None | Live "this turn cost · balance" + OpenCode Go |
| Desktop | None | Tray / native notifications / file workbench / Bot group chats |
| Updates | Manual | Built-in dual-source client update chain (GitHub/Gitee + sha256 fail-closed) |

## 🚀 Get Started

**Requirements**: Windows 10 / 11, macOS 12+ (Apple Silicon), Linux x64.
The installer and the portable **Full** build both ship a Node runtime — no Node.js needed on the target machine.

Grab the latest build from [GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases/latest) (`<version>` below is the release number, currently `1.0.10`):

| Platform | Artifact | Notes |
| --- | --- | --- |
| 💻 **Windows x64** | `DSH-Desktop-Setup-<version>-win-x64.exe` | **Recommended.** NSIS, per-user install with no admin rights, WebView2 bootstrapper embedded for offline machines · ~306 MB |
| 🎒 Windows x64 portable | `DSH-Desktop-Portable-<version>-win-x64.zip` | Unzip and run, data in `data\` next to the executable, Node included · ~571 MB |
| 🪶 Windows x64 portable Lite | `DSH-Desktop-Portable-<version>-win-x64-lite.zip` | Same, but **without** the bundled Node — needs Node ≥ 22 on the machine; ~33 MB smaller |
| 🍎 **macOS 12+** | `DSH-Desktop-<version>-macos-arm64.dmg` | Ad-hoc signed, not notarised; first launch needs right-click → Open (see [FAQ](#-faq)) · ~542 MB |
| 🐧 Linux x64 | `DSH-Desktop-<version>-linux-x64.AppImage` / `dsh-desktop_<version>_amd64.deb` | · ~416 / 462 MB |
| 🧪 Windows arm64 | `DSH-Desktop-Setup-<version>-win-arm64.exe` | Experimental lane; works, but not guaranteed |

Every artifact has a matching `.sha256` sidecar file — verify it before running if you care about tampering.

### Installer or portable?

- **Installer** (`Setup`) — recommended. Installs into `%LOCALAPPDATA%`, adds Start-menu and uninstall entries, and reinstalls to the same directory on upgrade.
- **Portable** (`Portable`) — unzip and run, no registry writes; good for USB sticks and temporary machines.
- **Lite** only drops the bundled Node; everything else is identical. Pick it if the machine already has Node ≥ 22, otherwise you get "no usable Node.js found".

### First launch

1. The shell runs the boot chain: repair → sync bundled plugins → apply patches → kernel preflight → spawn kernel.
2. Once the kernel is ready the client loads; the 33 curated plugins are mirrored from the bundled `assets/plugins` into the profile.
3. Afterwards inspect versions, toggle and check for updates under **Settings → Plugins → Built-in plugins**.

### Data locations

| Build | Location |
| --- | --- |
| Windows installer | `%APPDATA%\DSH Desktop\` |
| Windows portable | `data\` next to the executable |
| macOS | `~/Library/Application Support/DSH Pack/` |

Set `DSH_HOME` to override the dsh config directory. **Upgrades and over-the-top installs never touch this data.**

## 🧩 Bundled Plugin Ecosystem

**33 companion plugins are registered in total.** Under the v1.0.0 bundled line (user decision, 2026-10-08) their sources ship **inside the installer**: the delivery gate mirrors `assets/plugins` as a whole, and the first boot syncs it into the profile, so everything below works out of the box. The table follows the registration order of `scripts/lib/companion-plugins.js`; package names and versions are read from each plugin's `package.json`. The "Source / license" column only reports what each package says about itself — per-plugin upstream reachability and licence text are audited in [the inventory](dsh-desktop/docs/builtin-plugins-inventory.md) §3, and the `0.2.2-rc.2` host compatibility verdicts in §5.

| Plugin (package) | Version | Description | Source / license |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-balance` | 0.2.0 | Account balance plus per-turn cost estimate, docked to the conversation stats bar | In-house · MIT |
| `@deepseek-ai/dsh-file-changes` | 0.1.0 | Session file-change projection (collapses tool/result meta.diffs) | In-house · MIT |
| `dsh-better-sidebar` | 0.24.2 | VSCode-style right pane: five built-in tabs (editor / git / subagent / sidechat / diff) plus a tab-registration service for other plugins | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) · MIT |
| `dsh-session-manager` | 0.1.0 | Session-row delete button plus an "Archived conversations" panel in Settings (restore / delete) | In-house · MIT (name collides with a published community package) |
| `@deepseek-ai/dsh-conversation-tweaks` | 0.1.1 | Collapse long assistant outputs, plus a right-side navigation rail | In-house · MIT |
| `@dsh-external/dsh-super-injector` | 0.3.1 | Inject any local plugin package at runtime without restarting, hot reload, and a plugin-manager UI in Settings | Community (@dsh-external) · BSD-3-Clause (manifest label only, no licence text to cite) |
| `@deepseek-ai/dsh-prompt-custom` | 0.5.0 | Override or append the official system prompt from the Settings page, with one-click prompt-card switching and save-back to the active card | In-house · MIT |
| `@deepseek-ai/dsh-workspace-anchor` | 0.1.1 | Anchor the current working directory into the stable system prompt to stop workspace drift (from kernel 0.2.1 the `{{cwd}}` prompt variable is no longer registered, so the plugin fills the real path itself) | In-house · MIT |
| `@deepseek-ai/dsh-wsl-settings` | 0.1.0 | A "WSL backend" section in Settings: local/WSL switching, distro and install dir, liveness probe | In-house · MIT |
| `ds-bot` | 0.2.0 | Bot team: a main bot plus long-lived bots and group chats, with @ handoffs and shared memory — a ready-to-use collaboration workspace (loader id `bot`) | [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot) · Apache-2.0 |
| `billion-context` | 0.1.213 | Context compression (unified upstream): model-driven compaction, four model tools and /acp-prune, plus a preset-level compaction gate | [ranxianglei/billion-context](https://github.com/ranxianglei/billion-context) · MIT |
| `dsh-pocket` | 2.12.0 | Control the desktop web session from your phone by scanning a QR code (WebSocket passthrough + public tunnel) | [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) · GPL-2.0 |
| `@deepseek-ai/dsh-openclaw-bridge` | 0.8.1 | Bridges WeChat / Feishu official channels into DSH agent sessions (chunked write-back, dedup, rate limit) | [hzhz314159/openclaw-dsh-bridge](https://github.com/hzhz314159/openclaw-dsh-bridge) · MIT |
| `dsh-input-history` | 0.1.1 | Terminal-style ↑/↓ history of sent messages in the composer, scoped per session | In-house · MIT |
| `dsh-easyrewrite` | 3.0.1 | Message recall and re-edit, a version pager, and its own settings centre | [Renzic-Stone/DSH-EasyRewrite](https://github.com/Renzic-Stone/DSH-EasyRewrite) · MIT |
| `dsh-change-review` | 0.1.2 | AI change review: the model re-checks its own just-made edits for correctness, safety and intent | In-house · MIT |
| `dsh-offpeak` | 1.0.1 | Tidal-price guard: warns before sending at peak, and can defer work to off-peak windows | [christophersmith2737-commits/OffPeak](https://github.com/christophersmith2737-commits/OffPeak) · MIT |
| `dsh-settings-nav-custom` | 0.1.1 | Show / hide and reorder the left-hand Settings nav items (persisted in localStorage) | Ported from EAC [DSH-EAC/EAC-Desktop](https://github.com/DSH-EAC/EAC-Desktop) · MIT |
| `dsh-settings-groups` | 0.1.1 | Folds low-frequency General-settings rows into a collapsible "Advanced" group | In-house · MIT |
| `dsh-synapse` | 0.3.1 | Non-linear conversation canvas: drag-spread sessions, follow-ups and branches of one workspace | [liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse) · MIT (local fork line, upstream 0.4.2 deliberately not taken) |
| `@dsh-external/dsh-subagent-lens` | 0.1.1 | Expandable Task/subagent activity view plus a header bar aggregating commands and files (no extra backend calls) | In-house · MIT (borrows the @dsh-external scope, which has no repository) |
| `dsh-basics-panel` | 0.4.2 | Visual management of MCP servers, skills, rules and archived sessions inside Settings | [yxsj245/dsh-Basics-Panel](https://github.com/yxsj245/dsh-Basics-Panel) · MIT |
| `dsh-input-fold` | 0.1.1 | Collapses very long user prompts to a few lines with an "expand" overlay | In-house · MIT |
| `dsh-prompt-optimizer` | 3.0.0 | One-click draft analysis and polishing next to the composer (SSE streaming; reuses the current session model in real time; template-based rewrite without context, intent-first polish with context; fidelity self-check and slash-command prefix protection; replace/undo/copy results; model, call-parameter and context settings in Settings) | [Y1X1n/dsh-prompt-optimizer](https://github.com/Y1X1n/dsh-prompt-optimizer) · MIT |
| `dsh-builtin-manager` | 0.2.1 | Built-in plugin page under Settings → Plugins: search and state filters with a single-card list to view and toggle every bundled plugin (inline feedback; takes effect on next launch) | In-house · MIT |
| `@deepseek-ai/dsh-goal-completion` | 0.1.0 | "Goal wrap-up" tab in the kernel right bar: the current session's goal state machine plus the `complete` verb the official GoalBar never exposes (two-click confirm) | In-house · MIT |
| `dsh-free-search` | 0.9.39 | Free multi-engine web search: registers a `ctx.web` search provider that the built-in web_search picks up (loader id is `web-search-free`, not the package name) | [DDDMUC/dsh-free-search](https://github.com/DDDMUC/dsh-free-search) · MIT |
| `dsh-plugin-shop` | 0.9.3 | Plugin shop: browse, install, enable/disable and update dsh plugins (loader id is `shop`; the client bundle id is the package name) | [LivXue/dsh-plugin-shop](https://github.com/LivXue/dsh-plugin-shop) · Apache-2.0 |
| `@local/dsh-network-proxy` | 1.0.4 | HTTP proxy row under Settings → General: reads the system proxy and hot-swaps the fetch dispatcher (keeps the upstream `@local/*` name so GitHub updates still line up) | [baizhizzl/dsh-network-proxy](https://github.com/baizhizzl/dsh-network-proxy) · MIT |
| `dsh-toolbox-ui` | 1.10.1 | MCP / skills toolbox: bottom-right floating panel with an MCP marketplace and skill management (loader id is `mcp-manager-ui`; its host half statically imports `smol-toml`) | [Imzl-zl/dsh-toolbox-ui](https://github.com/Imzl-zl/dsh-toolbox-ui) · MIT |
| `@bittersmilezzz/dsh-notify` | 0.4.5 | Desktop notifications: six renderer-side Web Notification events plus click-to-session, replacing the shell's "turn complete" toast from v1.0.7 | [bitterSmilezzz/dsh-notify](https://github.com/bitterSmilezzz/dsh-notify) · MIT |
| `dsh-context` | 0.83.0 | Context insight: a right-pane context dashboard plus the `/context` command, breaking down what the current context is made of and how it evolves turn by turn | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) · Apache-2.0 |
| `ds-harness-remote` | 0.6.4 | End-to-end encrypted remote access: control this DSH from desktop / web / Android, with dsh-TUI Host support (inner dependency tree ships in the installer; WebRTC uses pure-JS werift) | [liguobao/ds-harness-remote](https://github.com/liguobao/ds-harness-remote) · MIT |

**Roster history** (per-plugin reasons for every add / removal, upstream reachability and licence text) lives in [the inventory](dsh-desktop/docs/builtin-plugins-inventory.md). One-line summary: 39 → 28 in v1.0.0; three removed on 2026-11-08 (`quest-ui` / `auto-compact` / `zcode-migrate`); two added on 2026-11-09 (`dsh-context` / `ds-harness-remote`) along with eight version bumps; and the context-compression plugin was replaced the same day by the unified upstream `billion-context`. Removed plugins have their sources deleted from `assets/plugins/`; existing installs get their patch rows and profile mirrors reclaimed by `RETIRED_COMPANIONS` on next launch.

## ❓ FAQ

**App won't start, or stuck on the loading page?**
The shell has a recovery page: "Restart in safe mode" disables every bundled plugin (except `dsh-builtin-manager` and the compression gate) and boots again — re-enable them one by one to find the culprit. Logs are in `%APPDATA%\DSH Desktop\logs\desktop.log` (the matching data directory on macOS).

**macOS says "is damaged and can't be opened"?**
That is Gatekeeper blocking an unnotarised build, not a corrupt download. Either right-click the app → Open → Open, or run `sudo xattr -cr "/Applications/DSH Pack.app"`, or use System Settings → Privacy & Security → "Open Anyway". Repeat after every over-the-top install.

**Do I need Node.js installed?**
No for the installer and the portable **Full** build (a standalone Node runtime and npm CLI are bundled). Only the portable **Lite** build needs Node ≥ 22 on the machine.

**Will an over-the-top install lose my data?**
No. The installer finds the old directory, reinstalls in place and keeps the profile, sessions and plugin settings.

**Why is there no update prompt?**
The updater polls `releases/latest`, and only stable releases land there. Prereleases deliberately never reach stable users; switch to the dev channel under Settings → Update channel to try them.

**Is Gitee out of date?**
Since v1.0.0 the project no longer mirrors code or release assets to Gitee. Older Gitee releases are an archive only — GitHub Releases is the source of truth.

## 💬 Community

Questions, feedback, or just want to chat with other users? Join our QQ group (**926561802**):

![QQ Group](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/qq-group-qr.png)

## ☕ Sponsor & Support

<p align="center">
  <a href="https://www.infistar.cc/register?aff=JWJMT5RE&ref_source=link">
    <img alt="Sponsor · Infistar referral link" src="https://img.shields.io/static/v1?label=SPONSOR&message=Infistar&color=4D6BFE&style=for-the-badge&labelColor=1F2430" />
  </a>
</p>

DSH Pack is free, MIT-licensed and has no feature walls. There are four ways to support it — the first one costs money
(and is the only one that brings the project any income), the other three cost nothing at all.

| Way | How | Notes |
| :--: | :--: | --- |
| ☕ **Referral link** | **[Sign up for Infistar →](https://www.infistar.cc/register?aff=JWJMT5RE&ref_source=link)** (referral link, same price) | I get a small commission · **not a technical recommendation** |
| ⭐ **Star** | [Star the repo](https://github.com/myYangyunfan/dsh_desktop) | Free and the most useful — it also gets the project seen |
| 🐛 **Feedback** | [Open an issue](https://github.com/myYangyunfan/dsh_desktop/issues) | Bug reports, feature requests, UX notes — all read |
| 🔁 **Share** | Tell someone who needs it | More effective than any promotion |

> [!IMPORTANT]
> **About that link**: it is a **sponsorship / referral link**. The project makes **no technical recommendation, compatibility claim
> or endorsement of Infistar**, and the repository has no technical dependency on that service. Whether you use it changes nothing about
> DSH Pack's features, update priority or support — using it, or signing up directly on the vendor's site, is treated exactly the same here.
> Account and payment terms are governed by the provider. It will never appear behind GitHub's Sponsor button either:
> GitHub does not allow funding links to be used for promotion or advertising.

## 🛠 Build from Source

Prerequisites: [Rust toolchain](https://rustup.rs/) and `npm ci` in `dsh-desktop/` (the kernel payload source; postinstall installs the kernel and applies patches).

```bash
# Tests (current baseline: Rust 607 / sidecar 21 / Node 2253)
cd dsh-desktop && npm test
cd ../dsh-tauri && cargo test --workspace && node --test sidecar/cli.test.js

# Dev run
cd dsh-tauri/src-tauri/src/app && cargo run

# Package the win-x64 NSIS installer + installed-layout smoke test
bash dsh-tauri/scripts/stage-payload.sh
cd dsh-tauri && npx --yes @tauri-apps/cli build \
  --config src-tauri/src/app/tauri.conf.json --target x86_64-pc-windows-msvc
bash dsh-tauri/scripts/smoke-installed.sh
```

The full flow, debug switches and the patch system are in the [development guide](dsh-tauri/docs/development.md);
read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing. Code, docs and commit messages are in Chinese.

## 📦 Releases & Maintenance

> This section is for maintainers; regular users can skip it.

### Release

The only release entry point is pushing a `v*` tag → [`tauri-release.yml`](.github/workflows/tauri-release.yml):
three-platform builds (Windows NSIS / portable, Linux AppImage / deb, macOS dmg) → version / test / path gates →
seven verified assets → GitHub Release. The version is kept in sync in three places
(`dsh-desktop/package.json`, `Cargo.toml` workspace.package.version, `tauri.conf.json`); a mismatch fails fast.
Release notes come from `.github/release-notes/v<version>.md` — write that file before tagging.

Prereleases do **not** enter GitHub `releases/latest`, which is what the shell updater polls — so prereleases are
never auto-pushed to stable users by design. See the [release runbook](.github/RELEASE_RUNBOOK.md) for promotion and rollback.

### Architecture

**From v0.5.0 the app runs on the Tauri 2 (Rust) architecture** — the Electron shell has been retired; its full set of responsibilities (windows / IPC / updates / packaging) is re-implemented crate by crate on the Rust side, contract-first (`dsh-tauri/contracts/` — six hard contracts are the single source of truth for interfaces):

```
┌──────────────────────────────────────────────────────────┐
│  Tauri 2 shell (Rust · 7 one-way-dependency crates)      │
│  · supervisor: boot guardian waterfall → spawn kernel    │
│    → readiness swap → liveness probe → crash-loop        │
│      in-place restart (never a blank window)             │
│  · shell-core        paths / settings (self-heal) /      │
│                     single instance                      │
│  · kernel-process    spawn spec / ready line / Job       │
│                     Object tree-kill                     │
│  · bridge            Electron IPC 38 channels → Tauri    │
│                     commands, full mapping + shim JS     │
│                     (window.dshDesktop)                  │
│  · fence / preview-server / session-watcher /            │
│    sidecar-orchestrator (boot sequencing + Node sidecar  │
│    reusing dsh-desktop/scripts kernel logic, zero        │
│    rewrite)                                              │
└──────────────────────┬───────────────────────────────────┘
                       │  dsh web --host 127.0.0.1 --port <reused port>
                       ▼
            Bundled node + @deepseek-ai/dsh
            Path resolution: user overlay > bundled package
                       │  ready-line detection
                       ▼
            Native window loads Web UI (localhost only)
```

Layering rules: crates never depend on the tauri runtime and are independently unit-tested; the assembly root only wires things up; kernel-side Node logic lives in `dsh-desktop/scripts/`. See the [development manual](dsh-tauri/docs/development.md).

### Agent presets

**The v1.0.0 clean line ships no agent presets** — matching the official desktop client: the mode list only shows the kernel's factory set (`standard` / `ptc` / `minimal` / `cordis`), no custom persona is injected, and the client writes no preset files.

To use your own, drop it into `<DSH_HOME>/.agent-presets/<id>/` and the kernel will pick it up (`agent.cordis.yml` + `preset.yml`); historical copies in existing user directories are left alone. Community/in-house presets that once shipped with the app came from third-party authors and have been removed wholesale — provenance and credits remain in git history (`git log --diff-filter=D -- dsh-desktop/assets/agent-presets`).

## 📄 License

MIT. Based on [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (MIT).

---

⭐ If DSH Pack is helpful to you, [starring the repo](https://github.com/myYangyunfan/dsh_desktop) is the most concrete support;
for any issues or feedback, please [open an issue](https://github.com/myYangyunfan/dsh_desktop/issues).
