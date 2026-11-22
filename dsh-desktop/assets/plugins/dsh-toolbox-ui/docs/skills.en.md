# Skill Management + Skill Market

[中文](skills.md) | **English**


This plugin has **three ability panes**: **MCP**, **Skills** and **Tools**. The ability-layer enumeration at the top of the panel switches between them, and all three share the same floating window and sidebar entry; the tools pane is served by the MCP manager service (which owns the loading policy).

The skills ability pane addresses the things DSH's built-in skill directory **cannot** show you:

- Which scope a skill is actually installed in (same-named skills across scopes are a legal configuration, but the model only ever receives the one that takes effect);
- Which skills are **disabled**, and one-click enable/disable (this writes the two invocation-face fields in `SKILL.md`, see [Enabling and disabling](#enabling-and-disabling));
- Which skills **allow model auto-invocation** and which **allow you to invoke them manually**, with in-place toggles;
- What you are honestly told and must confirm before installing a skill from the market (disclosure + a single explicit confirmation, with no license determination).

⚠️ One thing that is **not done yet**: the Host only `warn`s about a skill with invalid frontmatter and then skips it, and such a skill currently does **not** appear in the panel (reporting it would require scanning the skill files of every root yourself and running the validator, see TODO row 21). The panel will not pretend it can see it — so for such a skill the panel reports the invocation permission as "unknown" rather than guessing a value.

## Opening the skills panel

Click the floating button in the bottom-right corner or the "MCP" sidebar entry to open the panel, then click "**Skills**" in the ability layer at the top.

The panel has two modes (the segmented control on the left of the second row; both ability panes share this row, this position, and this control):

| Mode | Purpose |
|---|---|
| **Installed** | List on the left + details on the right. See the skills already on this machine, enable/disable them, change invocation permissions, delete them, view their body and diagnostics |
| **Market** | Card grid. **Only one source: skillhub.cn** (an external source, connected directly upstream, doing disclosure + explicit confirmation only, and the only installable source) |

**The scope pills appear only in the "Installed" mode**, and they share their origin with the list grouping (clicking a pill filters to that group, and the count always equals the number of filtered rows): the market is a catalog, and a skill only has a scope once it is installed — which is why you are asked where to install it at install time.
The market on the MCP pane uses the same mode in the same shape (an inline grid, no longer a modal).

## Scopes

Skills can be installed in several locations, and DSH searches them in priority order. The scope candidates in the panel **come from the locations actually discovered**, not from a hardcoded list — a given machine may have no `~/.dsh/skills` at all, with every skill in `~/.agents/skills`.

| Priority | Location | Notes |
|---|---|---|
| 100 | `<project>/.dsh/skills` | Project-level |
| 200 | `<project>/.agents/skills` | Project-level |
| 300 | Custom directory | Configured by the Host |
| 400 | `<DSH_HOME>/skills` | Global |
| 500 | `<AGENTS_HOME>/skills` | Global |
| 600 | Bundled | **Read-only**, cannot be enabled/disabled or deleted |

The Host reports **one winning entry per name within each catalog query**. The panel merges global and project queries, so a global winner and a project winner can both appear; lower-priority physical copies discarded within one query do not appear automatically. A skill with both invocation faces off can still win and remain in the catalog. Turning invocation off does not reveal a losing copy or make it take effect. Install targets describe allowed destinations, not installed skills or effective copies. Managing every losing copy requires a separate physical inventory capability.

### When the same directory is pointed to from two places

The two locations in the priority table **may resolve to the same directory** — most commonly when `DSH_HOME` lives inside the workspace: set `DSH_HOME=D:\DSH\.dsh` with the workspace at `D:\DSH` (itself a git root), and the project-level `.dsh/skills` and the global `<DSH_HOME>/skills` are the same physical directory.

The panel deduplicates **entries returned by the Host** by physical location: one file occupies one row, retaining the higher-priority source identity. An install directory likewise appears only once. Same-named files returned by different queries remain separate; this does not mean that every lower-priority copy in every directory has been enumerated.

By the same token, when a skill directory is itself a **symlink** (pointing them at an external sync library is a common practice), the panel can still locate it: the mismatch between the display path the Host reports and the real path has already been handled, so it does not degrade into "location unknown".

## Enabling and disabling

DSH skills have no `disabled` field (MCP does, skills do not). **But the two invocation-face fields the Host natively supports, combined, are exactly "disabled"** — which is also the tier VS Code / Copilot's official documentation calls **"Disabled skills"**:

| What you want | `disable-model-invocation` | `user-invocable` |
|---|---|---|
| Both usable (default) | unset | unset |
| **Manually invocable by you only** (no model auto-invocation) | `true` | unset |
| **Disabled** (no model auto-invocation, and you cannot invoke it manually either) | `true` | `false` |

So the panel's "Disable" writes exactly these two fields: the model cannot reach it and you cannot invoke it via `/name`,
while the skill **stays where it is on disk**, the Host still reports it, and the panel still lists it.

- **No file moving**. The skill file is not renamed, moved, or deleted — you can keep opening it in your editor,
  and other tools that also read `~/.agents/skills` (VS Code / Copilot, Codex, etc.) will not consider your skill
  broken because of a toggle here. ⚠️ Panels at 1.6.x and earlier used a homegrown approach of "renaming to `SKILL.md.disabled`",
  which makes your skills display incorrectly **in other tools**; the panel can still list such files left behind by
  older versions and restore them in one click — after restoring, please use the new way of disabling.
- **The two faces each have their own toggle on the details page** (one switch for "Model auto-invocation" and one for
  "User-invocable"), and "Disabled" is a **derived display** shown when both are "no" — it is not a third state,
  so it can never disagree with what is in the file.
- ⚠️ About "Enable": it restores **both** faces to invocable. If you originally wanted only the "manually invocable
  by you only" tier (having set `disable-model-invocation: true` by hand), one disable→enable round trip resets it —
  but **you can toggle it back right in the panel** (just turn off "Model auto-invocation"), with no need to edit the file.
- Bundled skills are read-only and cannot be enabled/disabled or deleted.

## Allowing/disallowing model auto-invocation

A skill can be **auto-invoked by the model** (the model decides on its own that it should be used), or be usable only when you name it manually. DSH expresses the latter with the frontmatter
field `disable-model-invocation: true`; the panel turns it into a switch under "Skill properties" on the details page (**Model auto-invocation**),
so you no longer have to dig through `SKILL.md` by hand. The "User-invocable only" badge on a list row says the same thing.

Its **opposite** is `user-invocable: false` (you cannot invoke it manually either). Turning both off means "disabled",
see the previous section. The panel makes each of the two its **own** switch, because their effects differ and they combine independently:

| What you want | Model auto-invocation | User-invocable |
|---|---|---|
| Both usable (default) | on | on |
| Manually invocable by you only (no model auto-invocation) | **off** | on |
| Model auto-invocation only (do not invoke it manually) | on | **off** |
| **Disabled** | **off** | **off** |

- **State always comes from the skill file itself**, not from the Host's discovery cache: the Host keeps reporting stale values after a rewrite of the same file (measured),
  and this is precisely what the panel **writes** — a display that reverts after the write looks to the user like "I clicked and nothing happened". So the invocation permissions in both the row and the details are
  parsed from that file, from the same bytes as the body.
- **When it cannot be read, say "unknown"**: a skill with invalid frontmatter is skipped entirely by the Host, so the panel shows "invocation permission unknown" and the switch is not clickable.
  Making up "not invocable" would be lying.
- **Located by the real position on disk, not by skill name**: the Host allows a skill file/directory name to differ from the `name` in frontmatter
  (the skill name comes from frontmatter), so the panel locates by "the root the Host reported + the entry under that root". For such skills, previously
  every operation in the panel failed (reading the body, enable/disable, delete all reported "skill not found"); now they are treated like any other skill.
- **Change only that one line, do not reflow your file**: disabling deletes that **one line** (the default is "allowed", so turning it off leaves no trace, and on→off restores the original byte for byte);
  enabling changes the value to `true` in place if the field already exists, and only appends a line at the **end** of the frontmatter if it does not. Field order, indentation, body, and CRLF style are all left untouched.
- **Refuse when the shape cannot be read reliably**: when the value is a block scalar or spans multiple lines, when it has to be **turned on** on a line carrying a trailing comment
  (turning off deletes the whole line, so the boundary is certain and the comment goes with it), or when the file contains a camelCase key the Host would reject (`disableModelInvocation`),
  the panel refuses and explains why in the UI, leaving it to you to edit by hand — guessing at an edit amounts to corrupting your skill file.
- **When it takes effect**: it writes a file, and the Host only affects the model once it discovers the skill changed — **usually in under a second**.
  The Host watches skill roots with file watching, so changes take effect automatically (measured at about 0.25 seconds: the median of 8 samples was 246ms), and the panel shows the on-disk value;
  **no need to restart DSH**. The only exception: if the Host was configured at startup not to watch (`watch: false` for `skill-filesystem`),
  then a restart is needed — on real machines watching is on by default. See the next section.
- Bundled skills are read-only, and their switches render as **disabled** (the same convention as enable/disable and delete: rendered but not clickable).

## How long a skill change takes to take effect

**Host side: automatic and fast.** DSH watches every skill root with file watching, and a skill's addition, rename, deletion, or content change
all cause it to invalidate its own skill directory — **measured at about 0.25 seconds** (median of 8 samples, 246ms), with no restart needed. After you enable/disable or change permissions in the panel,
the model sees the new state the next time it looks at the skill list (what this panel writes is exactly that file).

**Panel side: refetch on returning to the tab.** The panel cannot be "pushed" to — the Host has a `skills/change` event,
but it is **not** on the Host's forwarding allowlist, and that allowlist is exclusively owned by the Host itself (only one source may register),
so a third-party plugin has no legitimate way to deliver it to the browser. The panel therefore does: **refetch after an action + refetch when returning to the tab**.
To the user this looks like "it is up to date when I come back", rather than pretending real-time push is possible.

⚠️ If you changed the **skill file itself** (in an editor), the panel waits until you return to the tab to refresh; the model side does not have to wait,
because the Host discovered it on its own.

## Installing skills

Clicking "Install" in the market first gives you a disclosure (the install confirmation dialog):

- **The skill body enters the model context as instructions** — this is how skills work, and it is their primary trust surface;
- Whether it **contains executable scripts** (a `scripts/` directory);
- The tool permissions the skill **declares** (`allowed-tools`). Note that the DSH Host does **not** enforce this field,
  it is merely the author's declared intent — which is exactly why it must be disclosed honestly, so you can judge for yourself.

**The market has only one source, skillhub.cn, so it is of course the only one-click installable source.** The panel downloads to a temporary directory and hands the on-disk write to the Host's `importSkill`.

The install confirmation dialog additionally lays out the two things upstream can provide — publisher enterprise certification (`publisher.certifiedName`) and Tencent security scan results (`securityReports`) — states whether an API Key is required, and says plainly in the open that "this plugin has not verified them". **This plugin makes no license determination**: upstream entries have no license field, and it will not invent one for you. Confirmation is validated **server-side** (`acknowledged` must go over the wire), and the checkbox in the UI is only its interface.

After confirming, choose which scope to install into (Global or a particular project), then perform the install. The Host's import layer supports three shapes:

| Shape | What it installs as |
|---|---|
| A single `.md` file | A flat skill `<name>.md` |
| A skill directory | A directory bundle `<name>/`, along with resources such as `scripts/`, `references/` |
| An archive | `.zip` / `.tar` / `.tar.gz` / `.tgz`, identified by **magic number** (the download link may carry no extension) |

⚠️ These three shapes currently have **no panel entry point** (only Host RPC), and one-click install goes the external-source archive route. Manual import has to wait until that entry point exists — until then, the panel will not pretend it is there.

Installation is written to disk under the `name` in frontmatter (not the file name) — that is how the Host determines skill identity.
If a same-named skill already exists it **refuses rather than overwrites**; if an archive contains multiple skills it also refuses (it will not guess which one you meant).

## Market sources

The market has exactly one source, **skillhub.cn**, with no source switching. It is an external source, connected directly upstream (`api.skillhub.cn`, public and unauthenticated) for live search and categories, and **it is also the only one-click installable source**. On trust handling it **makes no license determination** (upstream entries carry no license information): before installing it lays out publisher certification, security scan results, and whether an API Key is required, states plainly "this plugin has not verified them", and requires you to **check to confirm** before installing.

Requests are issued from the **Host side** — the panel itself does not go online, so there is no browser CORS problem either. Its search is **explicitly triggered** (Enter / switching category), not search-as-you-type; category keys come from upstream and labels come from its category API, and if a label cannot be fetched the raw key is shown.

When installing a skill from skillhub.cn, the destination is still your choice (Global or a particular project × `.dsh` / `.agents`), and it goes through **the same** write path as local import: download to a temporary directory first, then unzip with the same set of validations, pick the skill root, and reject duplicate names.

If upstream is genuinely down, it only shows a warning + retry in the results area, and the market page does not fail to open. If you just updated the panel and see "external source unavailable", it is most likely that **the Host process is still the old one** (it does not know the `skillHubSearch` interface, which is a 404 on the wire) — restarting DSH fixes it; in that case upstream was never contacted even once, so the panel will not describe it as "failed to connect to skillhub.cn".

## Licensing

**This plugin makes no license determination.** skillhub.cn entries have **no license field**, and we will not invent one for you. All the panel can obtain is publisher enterprise certification (`publisher.certifiedName`) and Tencent security scan results (`securityReports`), plus whether an API Key is required — these are the only two trustworthy things upstream provides, and they are laid out for you to see, with "this plugin has not verified them" written plainly in the open.

Before installing, you must **explicitly confirm** (check a box), and the confirmation is validated **server-side**: `acknowledged` must go over the wire, and the checkbox in the UI is only its interface.

The former **per-skill license gate** was retired together with the built-in curated catalog (2026-10-10). The security boundary therefore becomes "external source makes no license determination + disclosure + explicit confirmation" rather than a hard gate — you will see fewer automatic judgments and more raw information, and that is deliberate.

**Inclusion ≠ endorsement.** A skill body enters the model context as instructions and may contain executable scripts. That upstream included it and a security scan let it through does not mean it is safe — this plugin performs no security review. Before installing, confirm for yourself that the source is trustworthy.

## Search

- Search is provided by **skillhub.cn** (the market has only this one source), going through its own search and category APIs;
- Search is **explicitly triggered** (Enter / switching category), not search-as-you-type; category keys come from upstream and labels come from its category API, and if a label cannot be fetched the raw key is shown;
- Results are **paginated**: 100 per page (the upstream limit), scrolling to the bottom loads the next page automatically, and there is also a "Load more" button at the bottom; the counter shows "showing X / Y total", and once the end is reached no further requests are sent. Changing the keyword/category resets to page 1 and replaces everything;
- Remote results are **not** license-verified (upstream entries have no license field), so do not treat "included upstream" as "license verified";
- Failures do not prevent the market page from opening: if the Host process is old (wire 404) it prompts you to restart the Host, and if upstream is genuinely down it warns + retries in the results area.

## Related documentation

- [`design.en.md`](design.en.md) —— package structure and deeper design (shared connection model, typert contracts, etc.)
- [`installation.en.md`](installation.en.md) —— installation and upgrade
- [`json-import.en.md`](json-import.en.md) —— importing MCP configuration from JSON
