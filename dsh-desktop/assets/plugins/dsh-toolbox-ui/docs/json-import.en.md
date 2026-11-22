# JSON import

[中文](json-import.md) | **English**


The panel supports common MCP client configurations and provides a structured preview before writing. The import target depends on the current tab: the **Global** tab writes to the current Web profile's `cordis.patch.yml`, while the **Project** tab writes to that project directory's `.dsh/mcp.json` (the two never mix). Global imports take effect via hot reload; project imports follow project-scope semantics and take effect on the next session (see "When configuration takes effect" in the README).

> `.dsh/mcp.json` is a private convention of this plugin: DSH itself has no project-level MCP configuration file (officially there are only the profile's `cordis.yml` / `cordis.patch.yml` lines, plus the ACP client's per-session `mcpServers`). The `mcpServers` schema in the file is the same as in the various clients, but the **path is not compatible**: Claude Code reads `.mcp.json` at the project root, DSH does not read `.dsh/mcp.json`, and neither do other tools. This file only means anything when this plugin is installed.

## Importing from other clients on this machine

When you open "Import MCP", the panel scans the configuration files of known clients on this machine and lists the sources it detected (name, path, number of entries, which fields will be masked) — click one to import from it. **The write target is still determined by the current tab** (Global → profile, Project → `.dsh/mcp.json`), exactly as with the paste path.

| Client | Location | Section read |
|---|---|---|
| Claude Code | `~/.claude.json` (overridable via `CLAUDE_CONFIG_DIR`) | user-level `mcpServers` |
| Claude Code (project) | `<project>/.mcp.json` | `mcpServers` |
| Codex | `~/.codex/config.toml` (overridable via `CODEX_HOME`) | `[mcp_servers]` |
| Codex (project) | `<project>/.codex/config.toml` | `[mcp_servers]` |
| OpenCode | `~/.config/opencode/opencode.json` or `.jsonc` (overridable via `OPENCODE_CONFIG`; an XDG path, `~/.config` on Windows too) | `mcp` |
| OpenCode (project) | `<project>/opencode.json` or `opencode.jsonc` | `mcp` |
| pi | `~/.pi/agent/mcp.json` (overridable via `PI_CODING_AGENT_DIR`) | `mcpServers` |
| pi (project) | `<project>/.pi/mcp.json` | `mcpServers` |
| Claude Desktop | Windows `%APPDATA%\Claude\claude_desktop_config.json`; macOS `~/Library/Application Support/Claude/claude_desktop_config.json`; Linux `~/.config/Claude/claude_desktop_config.json` | `mcpServers` |
| Cursor | `~/.cursor/mcp.json` and `<project>/.cursor/mcp.json` | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` (remotes use `serverUrl`) |
| VS Code | `%APPDATA%\Code\User\mcp.json` (the corresponding macOS/Linux paths work the same way) and `<project>/.vscode/mcp.json` | `servers` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` |
| Roo Code | `~/.roo/mcp.json` and `<project>/.roo/mcp.json` | `mcpServers` |
| Shared MCP config | `~/.config/mcp/mcp.json`, `~/.agents/mcp.json`, `~/.agents/mcp/mcp.json` | `mcpServers` |

**Filtering by layer**: the Global tab lists only the **global** sources of local clients, and the Project tab lists only the project-level sources of the **current project** — "pick Global and you import global, pick Project and you import project-level", so you never have to work out where a given row will be written. This invariant is enforced on the Host side, not merely by hiding things in the UI: cross-layer calls (for example, sending `scope: 'global'` while carrying a wsPath) are explicitly rejected. To move a layer's configuration to another layer (for example, to put your global Claude configuration into a project as well), use the paste box below.

Two things that are easy to misunderstand:

- **`.mcp.json` is a shared convention across tools** (Claude Code, pi's adapter, and others all read the same file at the project root), so the panel lists it only once, in the "Claude Code (project)" row, rather than duplicating it.
- **When there are multiple candidate files, the first one that exists is taken in order** (for example, OpenCode checks `opencode.json` first, then `opencode.jsonc`), and the panel shows **the file that was actually read**. Comments and trailing commas in `.jsonc` are swallowed.

The paste box still only accepts JSON: Codex's TOML and OpenCode's JSONC go through the source list above.

### Codex field mapping

| Codex | DSH |
|---|---|
| `command`, `args`, `env`, `cwd` | ported under the same name |
| `url` | `url` (`streamable-http`) |
| `http_headers` | `headers` (literal values preserved as-is) |
| `env_http_headers` | `headers`, with values turned into `${VAR}` |
| `bearer_token_env_var` | `headers.Authorization = "Bearer ${VAR}"` |
| `tool_timeout_sec` | `toolCallTimeoutMs` (seconds → milliseconds) |
| `enabled: false` | `disabled: true` |
| `env_vars`, `startup_timeout_sec/ms`, `required`, `enabled_tools`, `disabled_tools`, `default_tools_approval_mode`, `tools`, `auth`/`oauth*`, `bearer_token`, `http_headers_helper`, `experimental_environment`, `experimental_use_rmcp_client` | no counterpart; reported one by one and then ignored |

A failure converting a single entry (for example, when both `command` and `url` are specified) affects only that entry: the remaining entries in the same file can still be imported as usual, and the reason for the failure is shown on that row.

### OpenCode field mapping

OpenCode's format differs from other clients the most (the key is `mcp`, the command is an array, environment variables are called `environment`, and interpolation is written `{env:VAR}`):

| OpenCode | DSH |
|---|---|
| `mcp` | this is the section the panel reads (not `mcpServers`) |
| `type: "local"` | `stdio` |
| `type: "remote"` | `streamable-http` |
| `command: ["npx", "-y", "srv"]` | split into `command: npx` + `args: [-y, srv]` |
| `environment` | `env` |
| `cwd` | `cwd` |
| `url`, `headers` | ported under the same name |
| `{env:VAR}` | `${env:VAR}` (OpenCode's interpolation has no `$`, so without conversion it would be written into the profile as an ordinary literal) |
| `enabled: false` | `disabled: true` |
| `timeout` | **not converted automatically**: it is OpenCode's timeout for "fetching the tool list" (5000ms by default), which is not the same thing as DSH's `toolCallTimeoutMs`, and is reported entry by entry |
| `oauth` (object) | no counterpart; reported entry by entry and then ignored (`oauth: false` means "use my PAT, don't go through OAuth" and needs no mapping) |

Top-level non-MCP keys such as `$schema` are ignored.

### Four boundaries

- **Read-only**: the whole process only reads these files; it does not modify them, nor does it turn them into a configuration source for DSH.
- **Credentials never leave the Host**: the detection result contains only MCP names, transports, and "which fields will be masked" — no values at all. Which entries to import is up to your checkboxes, and the Host re-reads the files itself to obtain the real values, so secrets in the sources are never sent to the browser.
- **Content fingerprint guards against drift**: the preview returns a content fingerprint for that file, which must be sent back with the import; if the file changed in the meantime (for example, you saved a Codex configuration at the same time), the import is rejected and you must preview again.
- **Admission before writing to disk**: import results are validated uniformly before being written. Two kinds of name collisions (two entries in the same source that normalize to the same name; a name already taken by a bundle / Agent preset) both **keep the one that appears first and skip the rest**, and the skipped names are written into the preview and the import result — a duplicate name should not keep the other entries in the same batch out. At the same time, all environment variable references are normalized into the total-value form.

Sources larger than 8 MB are skipped (`~/.claude.json` mixes in a great deal of historical data unrelated to MCP); Cline's configuration lives in the VS Code extension's private storage and its structure changes from version to version, so it is not recognized for now.

## Export and cross-workspace copy

These two entries are **not** in the same place, because they are not the same kind of thing: **Export** is a snapshot of a whole layer and the inverse of import, so it lives in the **title bar** (right next to "Import MCP"; the current scope decides which layer it exports — the profile patch for Global, this project for a project). **Copy to another workspace** only makes sense for a project, so it lives in the project card's action row.

| Entry point | What it does | Credentials |
|---|---|---|
| Copy to… | writes the MCP entries checked in this project into another **registered** workspace | does not go through the browser: the source configuration is read out inside the Host and written straight to the target |
| Export | exports the current scope's configuration as JSON (copyable / downloadable as a file). Both layers use the `{ mcpServers }` shape (the same `specToMcpEntry`); the difference is credentials: the project layer keeps `${VAR}` references, while entries added through the panel in the global layer already hold **resolved values** | does go through the browser — credentials written literally (and values resolved in the global layer) appear in the export result as-is |

**Copy** handles name collisions **differently** from import, and this is deliberate:

- After you select a target, the panel first computes this write for you (which entries are added / overwritten / skipped), and recomputes immediately when you toggle "skip / overwrite". The preview and the write to disk share the same parsing on the host side, so "the preview says skip but it actually overwrites" cannot happen; the client also closes that timing gap — the preview result is bound to the inputs it was computed from (target / selection / skip-overwrite), so as soon as a choice changes the old result is invalidated and "Copy" cannot be pressed until recomputation finishes.
- When the target already has an entry with the same name, the default is to **skip** it (keeping the target's existing configuration); you can explicitly switch to "overwrite same-named entries in the target". The reason: import's "merge" expresses "change this project according to this JSON", so a same-named entry is updated; copy expresses "take these entries over as well", and the same-named entry in the target is **the target's own** configuration, so changing it requires the user to make that choice explicitly. The result text spells out, entry by entry, which names were added / overwritten / skipped.
- The target's `exclude` is left alone. "Which global MCP servers this project blocks" is that project's own intent, not data that travels along with the configuration.
- The target must be registered in DSH (the workspaces that appear in the tabs at the top of the panel). This restriction is enforced on the Host side and is **not specific to copy**: every entry point that writes `<workspace>/.dsh/mcp.json` goes through the same gate. Writing a directory's configuration and reading a directory's configuration are not the same thing — writing purely by canonical path would amount to "write `.dsh/mcp.json` into any directory".
- Environment variable references pass through unchanged: a `${VAR}` in the source is still `${VAR}` at the target; the copy process neither resolves them nor writes plaintext.

**Export** uses the same format as `.dsh/mcp.json` (`mcpServers` plus an optional `exclude`), so it has three uses: back it up, drop it in as the `.dsh/mcp.json` of another workspace, or paste it straight back through "Import MCP". The round trip is reversible — an exported `mcpServers` pasted back in and exported again is identical field by field (including project-level fields such as `idleTimeoutMs` / `readyTimeoutMs` / `disabled`).

Two boundaries to remember:

- **Export content contains literal credentials**. Tokens in URLs and literally written header / env values all appear in the export result; treat it as a secret. Positions that use `${VAR}` references keep the reference form (they are not resolved into plaintext) — which is also the recommended way to write them.
- **Paste import only reads `mcpServers`**. An exported `exclude` is not carried over by paste import (nor by cross-workspace copy); it has to be set manually in the target project's "Global MCP" section.

## Root formats supported by pasted JSON

Commonly used by Claude, Cursor, Cline, Roo, and other clients:

```json
{
  "mcpServers": {
    "example": {
      "command": "npx",
      "args": ["-y", "example-mcp"]
    }
  }
}
```

Commonly used by VS Code:

```json
{
  "servers": {
    "example": {
      "type": "http",
      "url": "https://example.com/mcp"
    }
  }
}
```

You can also import a single MCP object with a `command` or a `url`.

## Merge and replace

| Mode | Update same-named MCP | Add new MCP | Delete MCP that did not appear |
|---|---:|---:|---:|
| Merge | yes | yes | no |
| Replace current Profile | yes | yes | yes, limited to MCP managed by the current profile |

Entries coming from other bundles, Agent presets, or in conflict with an existing name are not overwritten (they are skipped, and the preview's notice and the import result state which ones). Replace neither deletes non-MCP patches nor deletes MCP owned by other configuration layers.

## Transport mapping

- `stdio`: requires `command`; supports `args`, `env`, `cwd`
- `http`, `streamable-http`, `streamableHttp`: all converted to `streamable-http`; requires `url`; supports `headers`
- SSE, WebSocket, OAuth, `headersHelper`, and `envFile` cannot be mapped safely and are explicitly rejected

## `directTools` and enabled/disabled state

DSH has no indirect tool mode; MCP tools are always registered as `mcp__<server>__<tool>`. The importer takes a conservative approach to conversion:

| Input | DSH result |
|---|---|
| `directTools: true` | `disabled: false` |
| `directTools: false` | `disabled: true` |
| missing `directTools` | new entries are enabled by default; merging an existing entry keeps its current state |
| `disabled` also provided | an explicit `disabled` wins |

When the panel's toggle is off, `disabled: true` is added; when it is on, the `disabled` field is removed.

## Environment variables and secrets

Header and env values imported as-is are written into the profile file. Environment variable references are recommended:

```json
{
  "headers": {
    "Authorization": "Bearer ${MCP_TOKEN}"
  },
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

The importer converts references into restricted `!!js` expressions, and **always with `?? ""`**: `${VAR}` → `!!js (process.env.VAR ?? "")`. When the variable is missing, that position degrades to an empty string and the server itself fails to connect (visible in the panel), rather than dragging the host down. This is not a flourish: a bare `!!js process.env.VAR` evaluates to `undefined` when the variable is unset, and mcp-client's Config only accepts strings, so the result is `dsh: plugin tree failed to load` — **the entire plugin tree fails to load**, and the user cannot even open the panel (reproduced locally).

`!!js` values that are **already present** in a source file (for example, an expression copied from elsewhere) are likewise normalized into the same total-value form before being written: they do not pass straight through just because "I didn't generate them".

The source list and preview directly mark the names of environment variables that are currently unset (or empty) (names only, no values), so you can see before importing which positions will get an empty value.

Arbitrary JavaScript, unrecognized template variables, and VS Code `inputs` that require interactive values are rejected and are not silently executed.

The panel's list/status remotes do not return literal Header, env, or args values; URLs carrying credentials/query are sanitized as well. Whenever args are present, they are shown as a whole under a "keep original value" marker: when unmodified they are preserved as a whole by the Host, and if you want to adjust them you must refill the arguments completely — the original arguments are never sent to the browser.

The detail page and edit form mask sensitive values by default when displaying configuration (URL credentials, args, env, headers). Clicking the eye icon reads the effective runtime values through the Host's `reveal` endpoint and shows them temporarily within the session; clicking again hides them; a revealed value can be copied to the clipboard in one click. Showing/hiding in the edit form changes the display layer only: if the user has not actually entered a new value, saving still submits the "keep original value" marker and does not write resolved environment variable secrets back into the profile. `reveal` is only available for servers managed by the current Web profile; configuration in other configuration layers (bundle / Agent) is read-only and its concrete values cannot be viewed.

Clicking "Refresh" manually shows a refreshing state and reports the current MCP count when it finishes; the background poll every 5 seconds uses a fingerprint (`revision`) of the sanitized list projection returned by the Host to decide whether there is a real UI change, and skips `setState` when there is none. The Host additionally generates an in-process HMAC signal (`revealRevision`) over the effective runtime credentials actually read by `reveal`: even if only the secret plaintext changes and the sanitized list stays the same, the client clears the old session-displayed values in the detail page and edit form once the runtime value switch completes; that signal cannot be used to infer credential contents.

## Write safety

- Parsing and previewing must happen before any write
- Profile modifications use a Host-side file lock and atomic replacement
- Overwriting is rejected with `FS_STALE_VERSION` when the content version changes
- If a live update fails, start/stop operations attempt to roll back the persisted modification
- JSON import only accepts structured fields; it never concatenates input into shell commands
