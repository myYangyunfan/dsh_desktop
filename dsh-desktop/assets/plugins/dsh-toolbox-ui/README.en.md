<p align="center">
  <img src="docs/images/logo.svg" width="104" height="104" alt="dsh-toolbox-ui">
</p>

<h1 align="center">dsh-toolbox-ui</h1>

<p align="center"><b>MCP</b>, <b>skills</b> and <b>tool loading</b> manager for DeepSeek Harness Web</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-toolbox-ui"><img src="https://img.shields.io/npm/v/dsh-toolbox-ui" alt="npm"></a>
  <a href="https://www.npmjs.com/package/dsh-toolbox-ui"><img src="https://img.shields.io/npm/dm/dsh-toolbox-ui" alt="downloads"></a>
  <a href="https://github.com/Imzl-zl/dsh-toolbox-ui/actions/workflows/ci.yml"><img src="https://github.com/Imzl-zl/dsh-toolbox-ui/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/dsh-toolbox-ui" alt="license"></a>
  <img src="https://img.shields.io/badge/DSH-%E2%89%A50.2.1--rc.5-blue" alt="DSH >= 0.2.1-rc.5">
</p>

<p align="center"><a href="README.md">中文</a> | <b>English</b></p>

Click the floating button or the sidebar's "Toolbox" entry: the panel floats above the session, so changing configuration or reading skills never interrupts the conversation you are in. Three ability panes live in the same panel — **MCP**, **skills** and **tools**.

> The panel follows the DSH interface language: when DSH is set to English, every label, button, and status string in the panel is English too (the dictionary is `EN_DICT` in `lib/client.js`); with Chinese selected — or on a Host that ships no locale service — the original Chinese copy is shown. **The language switch lives in DSH, not in the panel**: Settings → General → Language. The panel deliberately has no switch of its own — the Host is the single source of truth for language, and two switches would inevitably disagree. Until you pick a language explicitly, the Host infers it from your **browser language** (an English browser means an English panel; pick Chinese once in Settings and the choice is remembered).

## Screenshots

### MCP market

![MCP market](docs/images/mcp-market.png)

47 services, each verified against first-party sources, across 10 categories. Search-first, with a "keyless only" filter and sorting. Every entry states its free tier honestly and what you must supply (key / connection details / arguments to edit after install); one click installs from the card, and already-configured entries are recognised and skipped.

### Tools pane

![Tools pane](docs/images/tools-overview.png)

Built-in tools come first, grouped by purpose; MCP tools follow under their server groups. Search settings stay fixed at the top, every group starts collapsed, and the toolbar filters by type and loading mode.

### Skills pane

![Skills pane](docs/images/skills-overview.png)

See every installed skill's **real scope** and cross-scope shadowing, enable/disable, remove, read the body and diagnostics — and flip **model auto-invocation** with one switch, which edits `disable-model-invocation` in `SKILL.md` in place, touching only that one line.

## ToolSearch effect

Same MCP servers, only ToolSearch toggled:

<p align="center">
  <img src="docs/images/toolsearch-off.png" alt="ToolSearch off: 89.9K of tool definitions, 115K context used" width="440">
  <img src="docs/images/toolsearch-on.png" alt="ToolSearch on: 9.4K of tool definitions, 21.3K context used" width="440">
</p>

Tool definitions drop from **89.9K** to **9.4K** — **80.5K less (-89.5%)**, about **9.6×**; total context use drops from **115K** to **21.3K**, **93.7K less (-81.5%)**. With many tools, that saving is paid every turn.

## Features

**MCP**

- Per-entry status, transport, connection settings and the **registered tools**; expand a tool for its full input JSON Schema (required/optional, types, enums, defaults)
- Enable, disable, reconnect, add, edit, remove; credential fields are masked by default — reveal the effective runtime value temporarily and copy it in one click
- **Global + project scopes**: global writes the Web profile (available to every project), project writes that project's `.dsh/mcp.json` (visible only to its sessions); a project can also **block** a global MCP
- **Import** configuration from other clients installed on this machine: Claude Code, Codex, OpenCode, pi, Claude Desktop, Cursor, Windsurf, VS Code, Gemini CLI, Roo Code and the cross-tool shared config — or paste JSON directly. Previewed before writing, with merge and replace modes
- **Move servers between workspaces**: copy this project's MCP servers into another registered workspace (done inside the Host, so credentials never pass through the browser), or export the whole project config as JSON
- **Tool groups and bulk changes**: the Tools page supports selection across built-in, MCP and other tools; the action bar applies resident / on-demand / follow to the selection (or to the current filter result when nothing is selected) with a one-step undo. "Save as group" turns that batch into a named group with its own default plus per-tool exceptions, and new members inherit it. Groups live in `config.customGroups` in the profile patch and are global; project scopes are read-only
- **Deferred tool loading (ToolSearch)**: a server's tools no longer have to stay resident in context every turn — the model first sees a **name-only** catalog and, once `tool_search` finds a tool (by keyword or `select:<exact name>`), its full parameter schema enters the tool list and becomes directly callable. Off by default: the "Deferred / Resident" chip on a row changes the **server default** (a group policy), while per-tool overrides on the Tools page can still keep individual tools elsewhere; set `DSH_MCP_TOOL_SEARCH=off` to fall back to full injection everywhere. A tool marked "On demand" must be found via `tool_search` before it can be called; when there is nothing to search the search entry point itself disappears. Its three limits live under "Search settings" at the **top** of the Tools page and are stored as `config.toolSearch` in the profile patch

**Tools**

- **Built-ins first, grouped by purpose**: files / commands and terminals / web / MCP resources / tasks and jobs / subagents and teams / skills and interaction / schedules / code and workspace / host and plugins; MCP tools follow under their server groups, and unknown names go into one honest "Other plugins and unrecognised" group. Every group starts collapsed; the top filters by **type** (all / built-in / MCP / other) and **loading mode** (all / resident / on demand / overridden)
- **Three states per row, with the source spelled out**: MCP rows are "Follow the server / Resident / On demand", built-in rows are "Host default / Resident / On demand", and project overrides are "Follow global (current)". Choosing "Follow / default" deletes the override key, so you can always back out. The server default is changed only by the chip on the MCP list (`groups`); this page writes per-tool overrides only (`tools`)
- **Search settings fixed at the top**: `maxResults`, `maxDiscovered`, and the off-by-default "Limit catalog size" (`maxCatalogChars`) stay visible at the top; saving writes `config.toolSearch` into the profile patch and takes effect in the current session. `mode` is config-file only; when it overrides settings the page shows a banner and offers no second switch

**Skills**

- Real scope and cross-scope shadowing: the same name in different scopes is a legal configuration; the panel lists each copy and marks which one wins
- Enable/disable (by writing the two invocation fields in the skill file, **without touching the file itself**), remove, read the body and diagnostics — the reason a skill "does not take effect" is right there in the panel
- **Model auto-invocation switch**: edits `disable-model-invocation` in `SKILL.md`; turning it off deletes that line (off → on round-trips byte-for-byte). The state always comes from the skill file itself — when it cannot be read the panel says "unknown" instead of guessing
- **Located by its real position on disk** (never by skill name): skills whose file or directory name differs from the frontmatter `name` can still be read, toggled and removed
- Market backed by [skillhub.cn](https://skillhub.cn): publisher verification and security-scan findings are disclosed before install, followed by one **explicit confirmation** (validated server-side)

**Context**

- **One pane answers "who is holding the context in the next request"**: the total is what the model reported (used / limit / remaining / share / roughly how many more messages fit / cache hit and fresh), and the composition falls into five kinds — system prompt, tool definitions, tool results, attachments, conversation
- **Grouped by turn and by tool**: the conversation merges per turn and tool results merge per tool name (`pwsh ×341`, `read ×67`), so "which tool eats the most context" is visible at a glance; the detail list filters by kind, with a per-turn bar chart alongside
- **Two views**: the block view lays out **fixed-order columns per category** with free space pinned to the far right (column width is the share; categories too small to see keep only a visible edge); the grid view turns the same composition into equal cells and answers "how many cells, how full"
- **Tool card**: how many tools this request carried, how much context they take, and how many tool searches this session ran (by name vs keyword)
- **Only running sessions**: no historical session list (that is the sidebar's job); when several sessions run at once you can switch, with the **workspace name** shown; when nothing is running it explains why it is empty and how to get numbers
- **Estimates and truth stay separate**: the composition is an estimate and the total is the truth, so they do not match by construction — the pane scales the composition to the real total proportionally — only when every category is priced, so the numbers still add up to the total above; every reading also says which moment it describes ("previous turn" or "latest turn")

**Shared**

- Pick one or both entry points: the floating button (draggable, position remembered) and the sidebar "Toolbox" entry — at least one stays on
- Follows the DSH dark/light theme and adapts to narrow widths
- Update notice and one-click upgrade: at most one npm check per day, dismissible, **never auto-updates**; after an upgrade it explains what changed, without any network request

## Install

```sh
# Recommended: from npm — `dsh plugin update` then upgrades within ^1.x
dsh plugin --profile web add dsh-toolbox-ui@^1.13.0

# Or pin a GitHub release tag (no automatic upgrades; re-add with a new tag)
dsh plugin --profile web add github:Imzl-zl/dsh-toolbox-ui#v1.13.0
```

Then **restart `dsh web`**. To uninstall (your existing MCP entries stay):

```sh
dsh plugin --profile web remove dsh-toolbox-ui
```

> Do not add `mcp-manager-ui` to the profile's `cordis.patch.yml`, an agent preset, or an extra `--patch` file by hand — the plugin command already does it, and assembling it twice fails loudly.

## Upgrade

```sh
dsh plugin --profile web update dsh-toolbox-ui
```

When a newer version exists the panel shows a dismissible banner; pressing Upgrade runs DSH's official pluginManager.

> ⚠️ **1.6.1 and earlier will not announce 1.6.2 or anything after it.** Their update check read this repository's release feed, whose only `latest` entry was held by the legacy package `dsh-mcp-manager-ui` (frozen at 1.5.5) during that period — so it always answered "up to date". 1.6.2 fixed that by querying **this package's latest on npm**, and the fix can only ship inside a newer version: upgrade once by hand, then the banner works again.
>
> ```sh
> dsh plugin --profile web update dsh-toolbox-ui
> ```
>
> Still on the legacy package (≤1.5.5)? 1.5.5 keeps a permanent banner at the top of its panel — press "Migrate" and it installs this package and removes the old one. If the panel's Upgrade button reports `ERR_PNPM_NO_MATCHING_VERSION`, the legacy upgrade source has been retired (this repository's `latest` points at this package since v1.8.2); use the two commands instead:
>
> ```sh
> dsh plugin --profile web remove dsh-mcp-manager-ui
> dsh plugin --profile web add dsh-toolbox-ui
> ```
>
> See [Install & upgrade](docs/installation.md).

## Quick start

**Open the panel**: the floating button at the bottom right, or "Toolbox" at the bottom of the sidebar. It floats above the session; Esc or "Close" hides it without touching the session.

**Two scopes**:

| Tab | Stored in | Visible to | Takes effect |
|---|---|---|---|
| Global | the Web profile's `cordis.patch.yml` | every project | DSH hot-reloads, usually immediately |
| A project | that project's `.dsh/mcp.json` | only that project's sessions | **on write** — no need to reopen the session or restart the Host |

`serverName` is unique per scope: different projects, and global vs. project, **may share a name** and connect independently.

**Adding MCP**: use "Add MCP" for the form, or "Import MCP" to paste another client's configuration (previewed before writing). Common servers ship with presets.

## FAQ

**When does a change in a project take effect?** The moment you save: new entries attach to live sessions, removed ones retract their tools, edits reload the connection in place — no need to reopen the session or restart the Host. Editing `.dsh/mcp.json` by hand is picked up when the next session mounts.

**The connection follows the configuration, not the session.** When the last session ends the connection is not torn down; it goes idle and the next session reuses it, so it is already there when you need it. Two knobs live on the server entry: `idleTimeoutMs` (how long an idle connection is kept, default 5 minutes, `0` = never reclaim) and `readyTimeoutMs` (the total budget for waiting until ready on mount, default 5s, `0` = do not wait). See [Design & limits](docs/design.md#项目级专有字段dshmcpjson-里每个-server-可写).

**What do the project row's status strings mean?** They separate two independent facts: **whether a connection exists** (`已连接 · 当前无会话使用（连接保留，下次直接用）` / `已连接 · N 个会话在用` / `连接中…` / `连接失败` / `尚未建立连接（新会话自动挂载）`) and **how many sessions are using it** — the old "waiting for a session to mount" wording merged both into one sentence and read like "not connected yet".

**The panel says "disabled" but the model reports `unknown tool "mcp__xxx__…"`.** That MCP is disabled, so it registers no tools. Enable it in the panel.

**With "Deferred" on, can the model still find those tools?** Yes, just not by full visibility: the prompt carries a **name-only** catalog plus one line of guidance (no descriptions, no parameter schemas), and once `tool_search` finds a tool by keyword or `select:<exact name>`, its full schema enters the tool list and it becomes directly callable. Calling a not-yet-loaded tool from memory is refused, and the refusal hands back the **exact query string** to copy. Servers with only two or three tools save next to nothing (a guidance paragraph is still paid every turn); it pays off with many tools. To fall back to full injection everywhere: set `DSH_MCP_TOOL_SEARCH=off`. Note the "Deferred / Resident" chip on each row shows the **server default** (the group policy; without one it falls back to legacy `defer`, then the mode). Clicking it changes only that layer; per-tool overrides live on the Tools page and the chip shows "N overridden" next to it.

**How do I defer a single server?** Every row carries a chip: "Resident" / "Deferred" is that server's **default** loading, and **clicking it writes the group policy** (not legacy `defer`). If "N overridden" appears next to it, the Tools page has set exceptions for that many tools; those do not follow the server default. "Defer all" above the list changes the same group default for every server in the current scope.

**Where do I tune the limits?** Panel → Tools → **"Search settings" at the top of the page**: `maxResults` (tools returned per search, default 10) and `maxDiscovered` (discovered-set size, default 20). There is also a "Limit catalog size" switch (`maxCatalogChars`) that is **off by default** — off lists every tool in the catalog; turn it on only with very many tools and a need to trim context (it prefills 12500, a suggested starting point only). Saving writes them into `config.toolSearch` of the profile patch and takes effect **in the current session immediately** (no restart); values equal to the defaults are not written, so a future default change reaches you. You can also edit that config block by hand — then it applies after restarting `dsh web`. ⚠️ A misspelled key makes the plugin **fail to load and reports the exact path** (it is not silently ignored); fix it and restart.

**How do I tell "mount failed", "connection failed" and "scope isolation failed" apart?** Three different things: **mount failed** = it never attached during session mount; **connection failed** = `mcp-client` cannot connect or ran out of retries; **scope isolation failed** = the connection is fine but its tools are not in the shared scope layer. The detail pane gives the specific reason; see [Design & limits](docs/design.md#连接状态语义).

**Will it touch my other configuration?** No. Global edits only touch the entries declared by `@deepseek-ai/dsh-mcp-client` and managed by this plugin, preserving other plugin entries, comments and `!!js` expressions. Uninstalling leaves your existing MCP entries and project `.dsh/mcp.json` alone.

## Compatibility

| Item | Verified |
|---|---|
| DeepSeek Harness | Admission support starts at `0.2.1-rc.5`; verified `0.2.1-rc.5` (Cordis 4.0.5 / Loader 1.0.6) and `0.2.2-rc.3` (Cordis 4.1.0 / Loader 1.1.0). Older hosts remain historical regression targets, not part of the current release support surface. |
| Node.js | the runtime DSH ships with / supports |
| Platform | Windows; Linux and macOS use the same DSH Web contract |

Current release admission starts at **0.2.1-rc.5**: the 0.2.1 compatibility adapter and the 0.2.2 step-owned toolSet / standalone executor path are covered. Older hosts remain historical loader regression targets, not release admission targets; newer Loader/Include lifecycle behavior is validated as a matched host set.

## Development

```sh
npm test        # full suite, including host-level integration tests (real cordis / dsh-tools / dsh-scope / dsh-mcp-client + a real stdio MCP child process)
dsh web         # start the Web app for hands-on verification
```

## Documentation

- [Install & upgrade](docs/installation.en.md) — three install flavours, release flow, troubleshooting
- [Skills](docs/skills.en.md) — scopes and shadowing, enable/disable, invocation policy, the skill market
- [JSON import](docs/json-import.en.md) — field mapping and limits
- [Project MCP lifecycle](docs/project-mcp-lifecycle.en.md) — mounting, the shared connection, scope alignment
- [Design & limits](docs/design.en.md) — shared connection model, connection-state semantics, known limits, dependency details
- [DeepSeek Harness plugin publishing guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)

## Friend link

<p align="center">
  <a href="https://linux.do/" title="LINUX DO"><img src="docs/images/linux-do-logo.svg" alt="LINUX DO" width="44" height="44"></a><br>
  <a href="https://linux.do/">LINUX DO</a>
</p>

## License

MIT
