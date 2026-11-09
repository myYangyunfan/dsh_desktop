# Install and Upgrade

[中文](installation.md) | **English**


This document distinguishes between a regular install and a local development install. For real use, prefer GitHub, npm, or a tarball; do not rely on a `link:` into a development directory long term.

## Requirements

- DeepSeek Harness `0.2.1-rc.5` or later; verified `0.2.1-rc.5` (Cordis 4.0.5 / Loader 1.0.6) and `0.2.2-rc.1` (Cordis 4.1.0 / Loader 1.1.0)
- An initialized `web` profile
- Node.js and pnpm callable normally by DSH's plugin commands

The plugin declares the DSH host API as `>=0.2.1-rc.5 <0.3.0` in both `peerDependencies` and `engines.dsh`. Current release admission starts at 0.2.1-rc.5; older hosts remain historical loader regression targets, while the 0.2.2 executor path is verified with its matched Loader/Include host set.

Historical loader regression notes (0.2.0 is not current release admission):

- **Startup-error propagation**: 1.0.3 throws from `Entry.update()` when `apply` fails, so `loader.create()` itself rejects; 1.0.6 only logs it, so `create()` always resolves and the error hangs off the fiber. The plugin waits on `fiber.await()` instead — otherwise adding a server that cannot connect would not roll the patch back.
- **What a dispose writes**: 1.0.3's unload handler had an `_disposing` early-return guard; 1.0.6 dropped it, so `fiber.entry.parent.tree.write()` really runs — for an include-subtree entry that is `Include.write()`, which writes the base config together with **every remaining patch row**. The plugin marks the entry `disabled` before removing it (the only remaining early-return criterion in that handler); otherwise removing one server would bake its siblings' patch rows into `cordis.yml`.

The development baseline tracks the latest verified RC and mirrors every peer dependency (plus a test-only `@deepseek-ai/dsh-typert-loader`, see [Design and Limitations](design.en.md#how-the-version-range-is-chosen-and-what-it-does-not-cover)); after upgrading DSH, run `pnpm install && npm test` to verify.

## Install

Installing via npm is recommended: the `^1.x` range in the package lets a later `dsh plugin update` upgrade minor versions automatically.

```sh
dsh plugin --profile web add dsh-toolbox-ui@^1.10.1
```

You can also pin a GitHub release tag (useful when you need to lock a specific version):

```sh
# 固定 release tag
dsh plugin --profile web add github:Imzl-zl/dsh-toolbox-ui#v1.10.1

# 或固定某个 commit
dsh plugin --profile web add github:Imzl-zl/dsh-toolbox-ui#<commit>
```

Both approaches give **exactly the same code and runtime behavior** (the package ships a prebuilt `lib/`, so there is no need to run `prepare` or configure `allowBuilds`); the only difference is upgrades: a `^1.x` range can be advanced automatically by `dsh plugin update`, whereas a tag/commit is an immutable spec and `update` only re-resolves the same spec.

If you previously installed from a local development directory or with a different spec, remove the old dependency first:

```sh
dsh plugin --profile web remove dsh-toolbox-ui
```

After the install completes, restart the Web Host:

```sh
dsh web
```

## Verify the install

Check the profile's effective configuration:

```sh
dsh --profile web --dump-config
```

The output should contain:

```yaml
id: mcp-manager-ui
name: dsh-toolbox-ui
```

After opening DSH Web, the MCP management button should appear in the lower right corner. The panel can read the MCPs in the current profile and enable/disable, edit, reconnect, and delete the manageable entries.

Installing the plugin or starting the Web Host does not automatically install the bundled MCPs. When needed, open the panel, click "Bundled MCPs", select Exa, Tavily, Firecrawl, Chrome DevTools, or Playwright, and then confirm the install. Configurations of the same kind that already exist in the current profile, in another bundle, or in an Agent preset are shown as "configured" and skipped; they are not overwritten. The first three use the official no-key quota endpoints by default; Chrome DevTools and Playwright are launched via the local `npx` and require the corresponding Node.js/browser prerequisites.

## Upgrade

```sh
dsh plugin --profile web update dsh-toolbox-ui
```

Restart `dsh web` after upgrading.

The behavior differs depending on the spec used at install time:

| Install spec | Effect of `update` | How to cross versions |
|---|---|---|
| `dsh-toolbox-ui@^1.10.1` (npm, recommended) | Automatically upgrades to the latest minor version within `^1.x`, never crossing into 2.0.0 | Already automatic; for a major version, explicitly install `@^2` |
| `github:...#v1.4.0` (tag) | Re-resolves the same tag, **does not move** | Switch to a new tag and `add` again: `... #<new tag>` |
| `github:...#<commit>` | Same as above, pinned to the commit | `add` again with a new commit/tag |
| `github:...#main` (branch) | Pulls the latest main | Already automatic; but not recommended for production (no release gate) |
| `link:<local dir>` (development) | Not applicable | `git pull` in the checkout and restart `dsh web` |

Why a tag does not cross versions automatically: `dsh plugin` is a thin forwarder for `pnpm`, and `update` is just "re-resolve once according to the spec in package.json", while a git tag is an immutable spec with no range semantics (`pnpm update --help`: "Updates packages to their latest version **based on the specified range**").

The panel has a built-in update notice and one-click upgrade (it checks the **latest of this package** on the npm registry, at most once a day, can be turned off, and never acts on its own; it only installs when you click "Upgrade"). Users who installed from npm can also upgrade with the command-line `update`; the two are equivalent. Every release is published to both npm and GitHub Releases, and the two versions match.

## Release process (maintainers)

npm and GitHub Releases must be **updated in the same release**: users upgrade from npm, and the panel's update notice asks precisely for the latest of this package on npm. If the two versions disagree, you get "the notice says there is a new version, but `update` does not fetch it". Both are now done automatically by `.github/workflows/release.yml` when a tag is pushed, and it first verifies that "the tag matches the package.json version" before running the tests.

### One-time setup (do this once)

1. **The first publish must be done locally and interactively**: npm requires a 2FA challenge for publishing, and the package must already exist before you can configure a trusted publisher in the package settings.

   ```sh
   npm login    # 会话 token 有效期 2 小时，发布时会弹 2FA 挑战
   npm publish
   ```

2. On npmjs.com, go to that package's Settings → **Trusted Publisher** → GitHub Actions, and fill in: organization/user `Imzl-zl`, repository `dsh-toolbox-ui`, workflow filename `release.yml` (an environment may also be specified).
   ⚠️ The repository here is the **GitHub repository name**, and it must match the repository's current slug — the repository was renamed from `dsh-mcp-manager-ui`, and if you rename it without updating this entry, `npm publish` is rejected (the repository name is what the OIDC credential carries). Failure is safe: that CI step turns red and no Release is created.
3. Afterwards, optional but recommended: set the package's Publishing access to **Require two-factor authentication and disallow tokens** — trusted publishing is unaffected by this restriction (it uses OIDC, not a token), and long-lived write credentials thus become entirely unusable.

### Every release

```sh
# 1) 改版本：package.json + README/docs 里的版本与 tag 引用 + lib/whats-new.js 的更新条目
#    + .github/release-notes/v<新版本>.md（后面两项缺一项，下面的 npm test 就会红）
npm test

# 2) 真机过一遍（触发条件见下），**必须在打 tag 之前**
dsh web    # 打开面板点一遍

# 3) 提交并推 tag（CI 会校验 tag 与 version 一致，不一致就拒绝发布）
git add -A && git commit -m "..."
git push origin main
git tag -a v1.10.1 -m "dsh-toolbox-ui 1.10.1" && git push origin v1.10.1
```

After the tag is pushed, CI does the following in order: verify the version → `pnpm install --frozen-lockfile` → `npm test` → `npm publish` (trusted publishing, no token needed) → `gh release create`.

**When the real-machine check in step 2 is mandatory**: the client half is tested against a stand-in — the component cannot be rendered in node (see [Design and Limitations](design.en.md#how-the-version-range-is-chosen-and-what-it-does-not-cover)), so an all-green CI still does not prove that the panel displays. Therefore **whenever the change touches `lib/client.js` or advances the DSH baseline, you must do it**: start `dsh web`, confirm that the sidebar entry opens the panel and that the floating button is in place, then click through import / preview / enable-disable once each.

Why this cannot be delegated to CI: the symptom of this class of failure is a **blank panel**, and it does not turn any test case red (the registration contract is fine; it simply fails to render). A host changing a slot is the typical change of this kind — the `0.1.6-alpha.2` release notes contain "客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化", and advancing the baseline to `0.1.7-rc.1` on 2026-09-24 and to `0.1.7-rc.2` on 09-28 also falls into this class, which is why it is fixed as a checklist item rather than left to memory. Pure Host-side changes (`lib/index.js`, `lib/workspace-*.js`, etc.) can skip this step.

**Release notes are mandatory**, with the draft in `.github/release-notes/vX.Y.Z.md` (do **not** put it in `docs/`, since docs are published to npm with the package); if a draft exists it is used, otherwise it falls back to `--generate-notes`. Why mandatory: this repository commits everything directly to main with no PRs, so auto-generation produces almost nothing (every Release page up to and including v1.3.0 had only a one-line compare link), and the panel's update notice is exactly what points users to that page. `test/package-contract.test.mjs` catches "version bumped but no draft written", so it turns red locally before you push the tag.

**The in-app "Update to vX" notice is a separate matter**: its source of truth is `lib/whats-new.js` (published with the package; the host's `whatsNew` RPC forwards it directly), and before releasing you must write the entry for the current version into it — `test/whats-new.test.mjs` catches "version bumped but no update content written". One entry is enough; it need not match the GitHub Release notes word for word.

### Manual path without CI (alternative)

`npm publish` does not run a build (the package already contains `lib/`, and there is no `prepare`/`prepublishOnly`), so what is published is the files in the commit; therefore **commit first, then publish**, otherwise the package on npm will not match the tag's contents. Before publishing, use `npm pack --dry-run` to check the contents and size.

```sh
npm publish          # 会弹 2FA 挑战；若用 bypass-2FA 的 granular token 则非交互
gh release create v1.10.1 --title "dsh-toolbox-ui v1.10.1" --notes-file <notes>
```

The session token from `npm login` lasts only 2 hours; once it expires you must log in again. Classic tokens have been permanently revoked by npm, so the only remaining way to publish non-interactively is a granular access token with **Bypass 2FA** checked — but npm is narrowing that (it can no longer perform account/package management operations, and from 2027-01 it will lose the ability to publish directly), so the long-term solution is trusted publishing as described above.

## Uninstall

```sh
dsh plugin --profile web remove dsh-toolbox-ui
```

Uninstalling the plugin does not automatically delete the existing `@deepseek-ai/dsh-mcp-client` entries in the current profile.

## Local development install

Only local development uses a directory install:

```sh
cd C:\path\to\dsh-toolbox-ui
pnpm install
dsh plugin --profile web add C:\path\to\dsh-toolbox-ui
```

After changing Host code you need to restart `dsh web`; whether the browser bundle hot-reloads depends on the current DSH's client HMR status.

## Troubleshooting

### `Remote package ... is already registered`

The plugin has been assembled more than once. Confirm that there is only one `mcp-manager-ui` entry across the bundle, the profile patch, Agent presets, and any extra `--patch`.

### `file access denied under workspace-write mode`

An older version incorrectly wrote the profile through the session filesystem. The current version uses a Host atomic write with a fixed target and does not require switching to `danger-full-access`. Upgrade the plugin and restart the Web Host.

### The panel is visible, but changes revert immediately

First look at the error message on the page, then confirm that the profile file is not being edited concurrently by another process. The plugin uses a content version check and refuses to overwrite when an external modification is detected.

### A project MCP shows "mount failed" or "scope fault"

These are not the same class of failure, and the banner at the top of the panel and the marker on the row tell you which one it is:

- **Mount failed**: this plugin failed to mount during the **session mount phase** (the `agent/created` serial listener) (`${VAR}` evaluating to empty, startup failure under `failOnStartupError: true`, tool registration rejected, etc.). Open the row's details to see the specific reason.
- **Scope fault**: the connection itself is fine, but the tools are not in the shared scope layer (they landed in the global layer). The cause is that `@deepseek-ai/dsh-scope` resolves to two module instances between the host and the plugin (scope tags are Symbols inside the module). Check two things first:
  1. Whether the profile's `pnpm-workspace.yaml` still has the shape the official tooling writes — it must carry **`autoInstallPeers: false`**, otherwise pnpm installs the 9 `@deepseek-ai/dsh-*` peers into the profile's own `node_modules`, and the plugin resolves a second copy of the host packages (this is exactly what the official comment says to avoid).
  2. Whether there is only one copy of `@deepseek-ai/dsh-scope` in the installed dependency tree.
  Once fixed, restart `dsh web` to recover.

Multiple sessions on the same project do not collide on `serverName` due to concurrency: a project MCP shares one connection per `(project, serverName)` (since 0.1.5, `mcp-client` deduplicates by registration scope), so this error does not appear just because "two sessions are open on the same project".
