[中文](README.md) | [English](README.en.md)

# DSH Desktop

A ready-to-use Windows desktop client wrapping [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (DeepSeek Harness).

---

## Download & Install

### International users (GitHub, single-file download)

> GitHub has no single-file size limit — download the complete installer directly.

| File | Description | Size |
| --- | --- | --- |
| [Portable exe](https://github.com/myYangyunfan/dsh_desktop/releases/latest/download/DSH-Desktop-0.3.3-portable-x64.exe) | No install needed, double-click to run | ~126 MB |
| [Setup exe](https://github.com/myYangyunfan/dsh_desktop/releases/latest/download/DSH-Desktop-Setup-0.3.3-x64.exe) | Installs to system, creates shortcuts | ~126 MB |

### China users (Gitee, split-part download)

> Gitee has a 100 MB single-file limit, so installers are split into 2 parts. Download both and merge.

1. Download the following files into **the same folder**:

   **Portable** (no install, double-click to run, USB-friendly):
   - [part1](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-0.3.3-portable-x64.exe.part1) (~95 MB)
   - [part2](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-0.3.3-portable-x64.exe.part2) (~31 MB)

   **Setup** (installs to system, creates desktop/start menu shortcuts):
   - [part1](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-Setup-0.3.3-x64.exe.part1) (~95 MB)
   - [part2](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-Setup-0.3.3-x64.exe.part2) (~32 MB)

2. Download [merge.bat](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/merge.bat), place it in the same folder, and double-click to automatically merge the exe.

   Prefer manual merge? Run this in CMD:

   ```cmd
   :: Portable
   copy /b DSH-Desktop-0.3.3-portable-x64.exe.part1 + DSH-Desktop-0.3.3-portable-x64.exe.part2 DSH-Desktop-0.3.3-portable-x64.exe

   :: Setup
   copy /b DSH-Desktop-Setup-0.3.3-x64.exe.part1 + DSH-Desktop-Setup-0.3.3-x64.exe.part2 DSH-Desktop-Setup-0.3.3-x64.exe
   ```

**First run**: A loading animation appears briefly, then the DeepSeek Harness Web UI loads. If you haven't configured an API Key yet, set it up in the UI to get started (same as the `dsh` CLI).

> Portable data lives next to the exe in `data\`; the installer uses `%APPDATA%\DSH Desktop\`.
> To override the DSH config directory, set the `DSH_HOME` environment variable before launch.

## Features

- **No Node.js needed**: Bundles a standalone Node runtime and npm CLI — target machine needs nothing extra
- **Bundled dsh CLI**: Full `@deepseek-ai/dsh` package with all plugins, works offline
- **One-click launch**: Double-click to start `dsh web`, reuses the last saved port when possible (falls back to a free port if occupied) so UI preferences such as the session grouping mode persist across restarts
- **Frameless styled window + system tray**: No native title/menu bar — a custom glass bar (rounded icon, ⋯ menu, window controls) with Win11 rounded corners; closing hides to the tray
- **Clean exit**: Quitting kills the entire dsh process tree — no orphan processes
- **Portable**: Data follows the exe, copy it to a USB stick and go
- **Shares CLI config**: Defaults to `DSH_HOME` (typically `~\.dsh`), so existing sessions/API keys work out of the box
- **Dual auto-update**: official dsh agent updates (npm overlay) + client-wrapper self-update (GitHub→Gitee fallback, split-part auto-merge, in-place replace & restart), both user-consented
- **Shortcut self-healing**: the portable build creates/repairs desktop & Start Menu shortcuts automatically
- **DeepSeek balance widget**: inline「this turn ¥X · balance ¥Y」in the conversation stats bar, click to top up
- **Session notifications**: Windows system notification when an agent task completes — click to bring the window back

- **Quiet conversation output**: Settings → General → "Hide conversation output" keeps tool calls, file operations, results, turn summaries and the final summary while hiding long process text
- **Conversation navigation rail**: a faint right-edge rail tracks session length; hovering shows a vertical tick at the cursor as a preview, only clicking jumps
- **Portable extraction cache**: first launch caches to `%TEMP%\dsh-desktop-portable`, subsequent launches start instantly instead of re-extracting 132MB / 24k files every time
- **Startup self-heal & watchdog**: automatically repairs broken profile symlinks that cause `dsh web` exit code 1, and relaunches the app if the main process dies unexpectedly
- **Vision plugin (dsh-vision)**: configure an OpenAI-compatible VLM base URL, API key and model in Settings; the model can then call `view_image` (default: free Zhipu `glm-4.6v-flash`)
- **Renderer crash recovery**: automatically reloads the Web UI after a renderer crash, rebuilds the BrowserWindow when reload fails, and shows a local error page with reload/restart actions after repeated failures
- **Session history compatibility**: the bundled `@deepseek-ai/dsh-session` event vocabulary is patched during packaging, so events from dsh-agent-teams / dsh-message-edit / dsh-web-search-exa no longer break history loading
- **Built-in minimal_win preset**: an official-minimal-style agent preset using PowerShell (`pwsh` + `str_replace_editor`)
- **Built-in dsh-routing-suite**: `dsh-super-injector` (dev_* plugin injection/reload/self-heal tools) + `router-standard` preset
- **Built-in dsh-anchored-standard**: `anchored-standard` and `zero-anchored-standard` experimental presets

- **Balance dock toggle**: hide the balance/this-turn dock from the chrome menu, useful for third-party relay users
- **Third-party reasoning effort is opt-in**: `reasoning_effort` injection is off by default to avoid breaking strict third-party APIs such as Bailian; enable it only for providers that support the field
- **Self-update restart hardening**: setup updates relaunch the new version after install, and stale pending-update prompts are cleared when the update script starts

## Requirements

- Windows 10/11 (x64)
- No pre-installed Node.js or any other runtime

## Build from source

```powershell
cd dsh-desktop
npm install
npm run fetch-runtime    # bundle node.exe + npm CLI
npm run dist             # build portable + NSIS installer -> dist/
```

> Behind a firewall? Electron mirror: `$env:ELECTRON_MIRROR='https://npmirror.com/mirrors/electron/'`; builder toolchain mirror: `$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmirror.com/mirrors/electron-builder-binaries/'`.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Electron shell (main.js)                                │
│  · Single-instance lock / window / menu / lifecycle      │
│  · Session watcher (session-watcher.js) → notifications  │
│  · Auto-updater (updater.js) → user-consented overlay    │
│  · spawn node.exe from vendor|resources                  │
└──────────────┬───────────────────────────────────────────┘
               │  dsh web --host 127.0.0.1 --port <last saved port>
               ▼
       Bundled node.exe + @deepseek-ai/dsh
       Path resolution: user overlay > bundled package
       Prints "dsh web: http://127.0.0.1:<port>"
               │  Parse URL, poll HTTP 200
               ▼
       Native window loads Web UI (localhost only)
```

## Project structure

```
dsh-desktop/
├── main.js               # Electron main process
├── updater.js            # Auto-update engine
├── session-watcher.js    # Session completion watcher
├── preload.js            # Sandbox preload
├── assets/               # Loading page, update progress page, icons
├── scripts/              # Build & dev helper scripts
├── build/icon.png        # electron-builder icon
├── vendor/               # Bundled node.exe / npm CLI (not in repo)
├── electron-builder.yml  # Build config
└── dist/                 # Build output (not in repo)
```

## License

MIT. Based on [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (MIT).
