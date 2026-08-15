# Zat-DSH Engine

> The visual plugin marketplace for DeepSeek Harness. Browse, search, install, update and uninstall community plugins — Wallpaper Engine style.

[English](#zat-dsh-engine) · [中文说明](README.zh.md)

Zat-DSH Engine adds a **Plugin Market** tab to **Settings → Plugins** in the DeepSeek Harness web GUI. It lists the entire `dsh-plugin` topic community from GitHub, shows bilingual intros, and installs plugins with one click.

## Features

- **Full community catalog** — live GitHub search of the `dsh-plugin` topic (1700+ repositories, growing daily)
- **12 categories** — Theme, Tools, Browser, Skills, Vision, Network, Agents, Data, Hardware, Design, Security…
- **Live search** — type to filter, no Enter key needed; clearing the box returns to the full list
- **Bilingual intros** — 999 pre-translated Chinese intros bundled; new plugins are translated on the fly by your current model; English UI shows the original GitHub description
- **Install / Update / Uninstall** — one click, powered by the official `dsh plugin` profile mechanism (`pnpm` under the hood)
- **Monorepo-aware install** — repositories that bundle several plugins install correctly: a single-plugin repo installs silently, multi-plugin repos offer a plain-language picker
- **Installed detection** — marks plugins you already have, with version comparison and an **update badge** when a newer version is released
- **Cross-platform** — full Windows and Linux support (PowerShell / sh, curl / wget, system-proxy aware)
- **Network auto-adaptation** — inherits your VPN/system proxy for fetching and installing; if GitHub is unreachable, requests automatically fall back to `gh-proxy.com` and recover. **Works without a VPN**: proxy → direct → mirror → built-in fetch fallback
- **One-click enable/disable** — toggle plugins right on the card (official core and the market itself are protected)
- **Pre-install conflict gate + 🩺 health check** — blocking two marketplaces at once, official-package hijack, duplicate patch rows / registered names; one-click health report on conflicts and dependency issues
- **Safe by default** — install/uninstall/toggle roll back automatically on failure; a last-known-good backup restores a broken profile with one command
- **Live progress bar** — install/update/uninstall show a bar right on the card (percent + live counts); progress survives leaving and re-entering the market
- **One-click star** — reuses your local git credentials to star repos; badge color legend, auto-fading notices
- **Self-update** — a button appears beside the title when a newer version of the marketplace itself is available

## Installation

### From GitHub (recommended, after release)

```sh
dsh plugin --profile web add github:mishibeikejie/zat-dsh-engine
```

### From China without a VPN (via the domestic mirror, verified)

```sh
dsh plugin --profile web add https://gh-proxy.com/https://github.com/mishibeikejie/zat-dsh-engine.git
```

Either command installs the same plugin. Once installed, the market's own search and install paths carry the mirror fallback, so networking is handled for you.

### From a local checkout

```sh
git clone https://github.com/mishibeikejie/zat-dsh-engine.git
dsh plugin --profile web add ./zat-dsh-engine
```

### From npm (if published later)

```sh
dsh plugin --profile web add zat-dsh-engine
```

Replace `web` with your profile name if you use a different one (`headless` etc.).

> Requirements: a working dsh installation, `pnpm` and `curl` on PATH, and a profile that has been initialized (`dsh plugin --profile web add` creates it on first use).

## Usage

1. Restart dsh after installing.
2. Open the web GUI → **Settings → Plugins**.
3. Click the **🛒 Plugin Market** tab on the right of the plugin list.
4. Browse, search, filter by category or install state, and click **Install** on any card.
5. Restart dsh to activate installed plugins.

## Update

```sh
dsh plugin --profile web add github:mishibeikejie/zat-dsh-engine
```

Re-running `add` updates to the latest commit. The marketplace also detects its own updates and shows an **Update** button beside the title.

## Uninstall

```sh
dsh plugin --profile web remove zat-dsh-engine
```

## FAQ

**The market shows at most 1000 plugins in the All view.** GitHub's search API caps any query at 1000 results. Search and category filters reach every plugin regardless.

**Why do I need a model for Chinese intros?** 999 intros ship with the plugin. Only plugins released after the snapshot are translated on the fly, using the model you selected in dsh.

**Is the mirror safe?** The mirror is only used when a direct GitHub request fails, and only for public repository metadata.

**dsh won't start after installing a plugin — how do I recover?** After every successful install/uninstall/toggle, the market backs up the last known-good state into the `zat-backup/` folder inside your profile directory. Restore it by copying the three files back over the profile directory.

In the commands below, `web` is your profile name: **everyone using the web GUI has the profile `web`** (unless you started dsh with a custom name — if unsure, open the market and look at the "Profile:" line in the footer; use whatever it says):

```sh
# Windows (PowerShell)
Copy-Item "$HOME\.dsh\profiles\web\zat-backup\*" "$HOME\.dsh\profiles\web\" -Force

# macOS / Linux
cp ~/.dsh/profiles/web/zat-backup/* ~/.dsh/profiles/web/
```

Then start dsh again. This restores the state right after the last successful operation, so the plugin that broke startup is removed from the enabled list and the profile boots normally.

**Can I install two marketplace plugins at once?** No — the install gate blocks it: two market/manager plugins register the same settings pages and services, which can take dsh down. Uninstall the current one first if you want to switch.

## Changelog

### v0.4.0

- Enable/disable plugins in one click, right on the card (official core and the market itself are protected)
- Pre-install conflict gate (market-vs-market, official-package hijack, duplicate patch rows / registered names) + one-click health check
- Auto-rollback on install/uninstall/toggle; last-known-good backup restores a broken profile with one command
- Live progress bar on the card (percent + live pnpm counts) that survives leaving and re-entering the market
- Works without a VPN: system proxy → direct → China mirror → built-in fetch fallback; mirror ≈7 MB/s
- Installed/installable filters served in one shot; paged results deduped
- One-click star, badge color legend, auto-fading notices

## Sponsor

If Zat-DSH Engine saves you time, consider supporting the author:

- GitHub Sponsors: <https://github.com/sponsors/mishibeikejie>

Every bit of support keeps the catalog data, translations and feature updates coming.

## License

[MIT](LICENSE)
