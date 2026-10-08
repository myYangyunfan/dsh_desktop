![DSH Desktop](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/banner.en.svg)

**A ready-to-use desktop client for DeepSeek Harness (Windows / macOS)**

Ships the full dsh runtime and official plugins — no Node.js install required, double-click to run

> [!IMPORTANT]
> **🎉 v0.5.0 — Full architecture migration & rewrite**: the desktop shell has moved from Electron to **Tauri 2 (Rust)** — more stable, better to use:
> smaller installers, lower memory, faster startup; the "guardian waterfall" keeps the app **openable even with broken plugins / configs**.
> User data is fully compatible with the old version — install over the top for a painless upgrade (see the [upgrade guide](dsh-tauri/docs/upgrade-guide.md) and [Architecture](#-architecture)).
> Pre-v0.5.0 Electron builds remain available on [Releases](https://github.com/myYangyunfan/dsh_desktop/releases); only the Tauri architecture is maintained from now on.

[![Release](https://img.shields.io/github/v/release/myYangyunfan/dsh_desktop?color=4D6BFE&label=Release)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Stars](https://img.shields.io/github/stars/myYangyunfan/dsh_desktop?style=social)](https://github.com/myYangyunfan/dsh_desktop) [![Forks](https://img.shields.io/github/forks/myYangyunfan/dsh_desktop?style=social)](https://github.com/myYangyunfan/dsh_desktop/fork) [![Downloads](https://img.shields.io/github/downloads/myYangyunfan/dsh_desktop/total?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/releases) [![Issues](https://img.shields.io/github/issues/myYangyunfan/dsh_desktop?color=4D6BFE)](https://github.com/myYangyunfan/dsh_desktop/issues) ![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20%C2%B7%20macOS%2012%2B-4D6BFE) ![License](https://img.shields.io/badge/license-MIT-4D6BFE) [![Release CI](https://img.shields.io/github/actions/workflow/status/myYangyunfan/dsh_desktop/release.yml?color=4D6BFE&label=Release%20CI)](https://github.com/myYangyunfan/dsh_desktop/actions) [![Gitee Stars](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgitee.com%2Fapi%2Fv5%2Frepos%2Fmy-yang-yunfan%2Fdsh_desktop&query=%24.stargazers_count&label=Gitee%20Stars&color=4D6BFE)](https://gitee.com/my-yang-yunfan/dsh_desktop)

[Gitee mirror](https://gitee.com/my-yang-yunfan/dsh_desktop) · [![中文](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-4D6BFE?style=for-the-badge&logo=translate)](README.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

> [!TIP]
> 🧩 **Recommended: [dsh-hotplug-hub](https://github.com/ARFCON/dsh-hotplug-hub)** — our recommended dsh launcher manager.

---

## ✨ Features

### Zero Setup

- **No dependencies** — bundles a standalone Node runtime and npm CLI; the target machine needs nothing extra
- **Complete dsh** — full `@deepseek-ai/dsh` package with all official plugins, works offline
- **One-click launch** — double-click to start `dsh web`, reuses the last saved port, then loads into a native window
- **Two flavors** — Portable (no install, USB-friendly) + Installer (desktop/Start Menu shortcuts)

### Experience

- **Frameless glass window** — custom title bar with Win11 rounded corners; closing hides to the system tray
- **Side session popup** — spin up an independent session window anytime, without disturbing the main one
- **Session management** — archive / restore / delete conversations; history never piles up
- **Balance widget** — real-time "this turn cost · balance" in the conversation stats bar, with OpenCode Go quota support; click to top up
- **Completion notifications** — Windows notification when an agent task finishes; click to return to the window

### Resilience

- **Guardian waterfall** — the kernel boot chain self-heals level by level: broken plugins auto-repair, corrupt configs rebuild, crash loops restart in place; no incompatible state ever exits the app (core v0.5.0 Tauri feature)
- **Crash self-healing** — renderer freezes detected via heartbeat and auto-reload; the supervisor probes the kernel and relaunches with backoff
- **History compatibility** — session event vocabulary is patched automatically so third-party plugin events never break history loading
- **Auto update** — in-app client update check & install from the ⋯ menu (dual-source GitHub/Gitee Releases with automatic failover, sha256-verified fail-closed, silent when offline); upgrades reinstall to the old location with zero config loss; the kernel ships with the client (no separate update chain)
- **Shortcut self-healing** — desktop and Start Menu shortcuts are recreated automatically when missing

## 📸 App Preview

![DSH Desktop UI](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/showcase.png)

**Vanilla `dsh web`** vs **DSH Desktop**:

| Capability | Vanilla `dsh web` | DSH Desktop |
| --- | --- | --- |
| Startup | Manual Node.js install & CLI | Double-click, bundled runtime |
| Surface | Browser tab | Native window · frameless dark glass |
| Sessions | Archive only | Archive / restore / delete |
| Balance | None | Live "this turn cost · balance" + OpenCode Go |
| Desktop | None | Tray / notifications / side popup |
| Updates | Manual | Built-in dual-source client update chain (GitHub/Gitee + sha256 fail-closed) |

## 🚀 Quick Start

**Requirements**: Windows 10 / 11 (x64). No pre-installed Node.js or any other runtime. (Linux / macOS builds and the portable flavor have shipped from v0.5.1 on — the 0.5.x line publishes as prereleases via the CI pipeline; grab them on the [Releases](https://github.com/myYangyunfan/dsh_desktop/releases) page.)

> [!NOTE]
> **The table below points to pre-v0.5.0 Electron builds** (the last Electron line was 0.4.x). **From v0.5.0 the app runs on the Tauri architecture** — v0.5.0 (released 2026-08-21) ships a Windows x64 NSIS installer:
> [`DSH.Desktop_0.5.0_x64-setup.exe`](https://github.com/myYangyunfan/dsh_desktop/releases/download/v0.5.0/DSH.Desktop_0.5.0_x64-setup.exe) (~87 MB, `currentUser` mode needs no admin, WebView2 bootstrapper embedded).
> Newer v0.5.x prereleases (v0.5.2, 2026-08-22, fixes the reboot-loop / white-screen issues reported on v0.5.1) are on the Releases page.
> Installing it over any legacy Electron build (0.1.x–0.4.x) relocates to the old directory, keeps all data, and requires zero manual migration (see the [upgrade guide](dsh-tauri/docs/upgrade-guide.md)).

### International users (GitHub)

[GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases) hosts the complete single-file installers with no size limit — download directly.

> [!IMPORTANT]
> **Read before you download — the answer is in the file name:**
>
> - **`win-` = Windows, `macos-` = macOS** (`.exe` is always Windows; `.dmg` / `.zip` is always macOS);
> - **`x64` = Intel/AMD chip, `arm64` = ARM chip** (Windows ARM devices like Surface Pro X and Apple Silicon Macs pick arm64; everything else picks x64).
>
> Pick yours:

| Your device | Download |
| --- | --- |
| 💻 Windows PC (most Intel/AMD) | `DSH-Desktop-<version>-win-portable-x64.exe` (no install, double-click to run) or `-win-setup-x64.exe` (installer with shortcuts) |
| 🪟 Windows ARM (e.g. Surface Pro X) | `DSH-Desktop-<version>-win-portable-arm64.exe` |
| 🍎 Mac Intel | `DSH-Desktop-<version>-macos-x64.dmg` |
| 🍏 Mac Apple Silicon (M1/M2/M3/M4) | `DSH-Desktop-<version>-macos-arm64.dmg` |

The macOS build is not code-signed yet — on Apple Silicon, the first launch shows "cannot verify developer". **Right-click the app → Open**, or run:

```bash
xattr -dr com.apple.quarantine "/Applications/DSH Desktop.app"
```

### China users (Gitee)

> [!NOTE]
> The Gitee mirror currently tops out at **Electron v0.4.1** — the v0.5.0 (Tauri) installer is not mirrored there yet; please download from [GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases) for now.

Gitee caps files at 100 MB, so Electron installers are split into parts (`.part1/.part2/...`). Download all parts, then double-click the `merge.bat` attached to that release to merge them automatically, and verify with `SHA256SUMS`. Pick your version on the [Gitee Releases](https://gitee.com/my-yang-yunfan/dsh_desktop/releases) page.

**Gitee parts keep the legacy naming** (no `win-` prefix, e.g. `...-portable-x64.exe.part1`) — different from the GitHub naming, but merging works the same. macOS installers are not mirrored to Gitee — download them from [GitHub Releases](https://github.com/myYangyunfan/dsh_desktop/releases).

**Data location**: Windows portable keeps data in `data\` next to the exe; the installer uses `%APPDATA%\DSH Desktop\`; macOS uses `~/Library/Application Support/DSH Desktop/`. Set the `DSH_HOME` environment variable to override the dsh config directory.

## 💬 Community

Questions, feedback, or just want to chat with other users? Join our QQ group (**926561802**):

![QQ Group](https://cdn.jsdelivr.net/gh/myYangyunfan/dsh_desktop@5c673d6/docs/qq-group-qr.png)

## 🛠 Build from Source

For v0.5.0 (Tauri architecture) — prerequisites: the [Rust toolchain](https://rustup.rs/) and `dsh-desktop/` having had `npm install` (the kernel payload source):

```bash
# Tests (full Rust suite + sidecar)
cd dsh-tauri
cargo test --manifest-path src-tauri/Cargo.toml
node --test sidecar/cli.test.js

# Dev run
cd src-tauri/src/app && cargo run

# Package the win-x64 NSIS installer + installed-layout smoke test
bash dsh-tauri/scripts/stage-payload.sh
npx --yes @tauri-apps/cli build --config src-tauri/src/app/tauri.conf.json \
  --target x86_64-pc-windows-msvc
bash dsh-tauri/scripts/smoke-installed.sh
```

See the [development manual §6](dsh-tauri/docs/development.md) for the full flow (incl. debug switches like `DSH_TAURI_DIAG` / `DSH_TAURI_DEVTOOLS`).

## 🤖 Releases

From v0.5.0, releases go through the **Tauri GitHub Actions cloud pipeline** ([`tauri-release.yml`](.github/workflows/tauri-release.yml)): pushing a `v*` tag triggers three-platform builds (unified vendor node v24.15.0 + full `stage-payload.sh` + fail-fast compat build), then collects the artifacts into a Release automatically. **v0.5.0 was published by this pipeline** (2026-08-21; this round shipped the Windows x64 NSIS installer). **From v0.5.1 the full three-platform asset set (Windows installer/portable, Linux AppImage/deb, macOS dmg) passed verification and publishes as prereleases on the 0.5.x line**; v0.5.2 (2026-08-22) fixes the issues users reported on v0.5.1. The Electron-era `release.yml` pipeline was retired along with the architecture. For manual local packaging outside CI, see [Build from Source](#-build-from-source) above (stage-payload → tauri build → installed-layout smoke, three steps).

### 📦 Installer formats the Tauri architecture can export

Controlled by `bundle.targets` in `tauri.conf.json` — add or remove entries to extend the output formats:

| Platform | Format | Status |
| --- | --- | --- |
| Windows x64 | **NSIS installer** (`DSH.Desktop_<version>_x64-setup.exe`) — LZMA-compressed, ~87 MB measured; `currentUser` mode needs no admin rights; WebView2 bootstrapper embedded so offline machines can install too; upgrade chain reinstalls into the old directory, keeping data | ✅ **Shipped in v0.5.0** (CI-built, passes installed-layout smoke test) |
| Windows arm64 | NSIS installer (cross-build with `--target aarch64-pc-windows-msvc`) | 🔜 Natively supported by Tauri, not yet validated |
| Windows | MSI (WiX toolchain, add `"msi"` to `targets`) | 🔜 Natively supported by Tauri, not yet enabled |
| Linux x64 | `.AppImage` / `.deb` | ✅ Produced by CI from v0.5.1 (six-asset verification, prerelease line) |
| macOS (Apple Silicon) | `.app` / `.dmg` disk images | ✅ Produced by CI from v0.5.1 (ad-hoc signature verified, prerelease line) |

> A no-install portable build is not a built-in Tauri target — the Tauri line defaults to the NSIS `currentUser` installer, and a standalone portable package is planned for a later release.

## 🧩 Bundled Plugin Ecosystem

**28 companion plugins are registered in total.** Since v1.0.0 their sources ship with this repository only and are **excluded from the installer** (the delivery gate drops the whole directory — see §4 of [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). The table below follows the registration order of `scripts/lib/companion-plugins.js`; package names and versions are read from each plugin's `package.json`. The "Source / license" column only reports what each package says about itself — per-plugin upstream reachability and licence text are audited in [the inventory](dsh-desktop/docs/builtin-plugins-inventory.md) §3, and the rc.2 host compatibility verdicts in §5.

> [!NOTE]
> **Trimmed in v1.0.0: bundled plugins went from 39 down to 28** (the 11 were named for removal by a user on 2026-10-07).
> No longer bundled: the visual plugin marketplace (`dsh-community-market`) and its desktop service bridge
> (`dsh-market-desktop-bridge`), the plugin hub (`dsh-hub`), knowledge-graph memory (`graph-memory`), the knowledge
> centre (`dsh-cardian`), the desktop pet (`harness-pet`), built-in image understanding via a VLM restatement
> (`dsh-vision`), drag-in files (`dsh-file-drop`), paste-image-to-send (`dsh-image-paste`), the in-session terminal
> tab (`@deepseek-ai/dsh-terminal-tab`) and one-click file-change revert (`@deepseek-ai/dsh-client-file-changes`).
> The last two overlap the kernel's own official packages of the same/similar name, and their mirrored copies under
> `profiles/web/node_modules` shadow the official ones — hence the recall.
> Similar capabilities still ship: phone mirroring = `dsh-pocket`, file-change tracking = `dsh-file-changes`
> (only its revert half depended on the shell-side `file_revert`, which is also gone).

| Plugin (package) | Version | Description | Source / license |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-balance` | 0.1.2 | Account balance plus per-turn cost estimate, docked to the conversation stats bar | In-house · MIT |
| `@deepseek-ai/dsh-file-changes` | 0.1.0 | Session file-change projection (collapses tool/result meta.diffs) | In-house · MIT |
| `dsh-better-sidebar` | 0.24.1 | VSCode-style right pane: five built-in tabs (editor / git / subagent / sidechat / diff) plus a tab-registration service for other plugins | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) · MIT |
| `dsh-session-manager` | 0.1.0 | Session-row delete button plus an "Archived conversations" panel in Settings (restore / delete) | In-house · MIT (name collides with a published community package) |
| `@deepseek-ai/dsh-conversation-tweaks` | 0.1.1 | Collapse long assistant outputs, plus a right-side navigation rail | In-house · MIT |
| `@deepseek-ai/dsh-quest-ui` | 0.6.1 | One-toggle Quest-mode UI (grouped session rail + card composer + pill metadata bar), off by default | In-house · MIT |
| `@dsh-external/dsh-super-injector` | 0.3.1 | Inject any local plugin package at runtime without restarting, hot reload, and a plugin-manager UI in Settings | Community (@dsh-external) · BSD-3-Clause (manifest label only, no licence text to cite) |
| `@deepseek-ai/dsh-prompt-custom` | 0.3.5 | Override or append the official system prompt from the Settings page | In-house · MIT |
| `@deepseek-ai/dsh-workspace-anchor` | 0.1.0 | Inject a {{cwd}} preference block into the stable system prompt to stop workspace drift | In-house · MIT |
| `@deepseek-ai/dsh-wsl-settings` | 0.1.0 | A "WSL backend" section in Settings: local/WSL switching, distro and install dir, liveness probe | In-house · MIT |
| `@dsh-external/dsh-side-session` | 0.3.1 | Floating side session that imports the main conversation context at three selectable depths (120 / 600 / 5000 messages), so follow-ups stay isolated | [hzhz314159/dsh-side-session](https://github.com/hzhz314159/dsh-side-session) · MIT (upstream ships no LICENSE, the MIT label is ours) |
| `billion-context-dsh` | 0.2.26 | Active Context Pruning: model-driven context management, plus four model tools and the /acp-prune command | [Tyan66666/billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh) · MIT |
| `dsh-pocket` | 2.10.7 | Control the desktop web session from your phone by scanning a QR code (WebSocket passthrough + public tunnel) | [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) · GPL-2.0 |
| `@deepseek-ai/dsh-openclaw-bridge` | 0.8.1 | Bridges WeChat / Feishu official channels into DSH agent sessions (chunked write-back, dedup, rate limit) | [hzhz314159/openclaw-dsh-bridge](https://github.com/hzhz314159/openclaw-dsh-bridge) · MIT |
| `dsh-input-history` | 0.1.1 | Terminal-style ↑/↓ history of sent messages in the composer, scoped per session | In-house · MIT |
| `dsh-easyrewrite` | 2.6.0 | Message recall and re-edit, a version pager, and its own settings centre | [Renzic-Stone/DSH-EasyRewrite](https://github.com/Renzic-Stone/DSH-EasyRewrite) · MIT |
| `dsh-change-review` | 0.1.1 | AI change review: the model re-checks its own just-made edits for correctness, safety and intent | In-house · MIT |
| `dsh-auto-compact` | 0.1.1 | Auto-sends /compact once contextPressure crosses a threshold (80% by default, configurable) | In-house · MIT |
| `dsh-offpeak` | 1.0.1 | Tidal-price guard: warns before sending at peak, and can defer work to off-peak windows | [christophersmith2737-commits/OffPeak](https://github.com/christophersmith2737-commits/OffPeak) · MIT |
| `dsh-settings-nav-custom` | 0.1.1 | Show / hide and reorder the left-hand Settings nav items (persisted in localStorage) | Ported from EAC [DSH-EAC/EAC-Desktop](https://github.com/DSH-EAC/EAC-Desktop) · MIT |
| `dsh-settings-groups` | 0.1.1 | Folds low-frequency General-settings rows into a collapsible "Advanced" group | In-house · MIT |
| `dsh-synapse` | 0.3.0 | Non-linear conversation canvas: drag-spread sessions, follow-ups and branches of one workspace | [liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse) · MIT (local fork line, upstream 0.4.2 deliberately not taken) |
| `@dsh-external/dsh-subagent-lens` | 0.1.1 | Expandable Task/subagent activity view plus a header bar aggregating commands and files (no extra backend calls) | In-house · MIT (borrows the @dsh-external scope, which has no repository) |
| `dsh-reasoning-effort` | 0.8.1 | Codex-style model + reasoning-effort selector, with copy-ready guidance for custom providers | [HanaAyane/dsh-reasoning-effort](https://github.com/HanaAyane/dsh-reasoning-effort) · MIT |
| `dsh-basics-panel` | 0.4.1 | Visual management of MCP servers, skills, rules and archived sessions inside Settings | [yxsj245/dsh-Basics-Panel](https://github.com/yxsj245/dsh-Basics-Panel) · MIT |
| `dsh-input-fold` | 0.1.1 | Collapses very long user prompts to a few lines with an "expand" overlay | In-house · MIT |
| `dsh-prompt-optimizer` | 2.0.4 | One-click draft polishing in the composer (uses the current session model, zero-config streaming) | [winditer/dsh-prompt-optimizer](https://github.com/winditer/dsh-prompt-optimizer) · MIT |
| `dsh-zcode-migrate` | 0.1.2 | Migrates zcode CLI session history into native dsh session logs (inspect / migrate / verify, /zcode) | In-house · MIT |

> Earlier removals, also outside the 28 registered plugins: `dsh-navbar` (navbar replacement,
> dropped from the list and its sources deleted in `v0.6.3-beta.3`, commit `ff421ac2`) and
> `zat-dsh-engine` (the previous built-in marketplace, retired even earlier).

## 🏗 Architecture

**From v0.5.0 the app runs on the Tauri 2 (Rust) architecture** — the Electron shell has been retired; its full set of responsibilities (windows / IPC / updates / packaging) is re-implemented crate by crate on the Rust side, contract-first (`dsh-tauri/contracts/` — five hard contracts are the single source of truth for interfaces):

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
│  · bridge            Electron IPC 43 channels → Tauri    │
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

Layering rules: crates never depend on the tauri runtime and are independently unit-tested (177 Rust tests green; plus 16 sidecar Node tests across 71 shared-script unit files); the assembly root only wires things up; kernel-side Node logic lives in `dsh-desktop/scripts/`. See the [development manual](dsh-tauri/docs/development.md).

## 📄 License

MIT. Based on [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (MIT).

---

⭐ If DSH Desktop is helpful to you, consider [starring the repo](https://github.com/myYangyunfan/dsh_desktop); for any issues or feedback, please [open an issue](https://github.com/myYangyunfan/dsh_desktop/issues).
