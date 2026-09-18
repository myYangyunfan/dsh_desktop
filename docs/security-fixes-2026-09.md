# Security fixes — September 2026

This document records the remediation of the static security audit performed on
`dsh_desktop` (see the audit's finding IDs `H-01`…`H-21`). Every change below is
read-only with respect to the user's data: no remediation step executes a downloaded
artifact, and the audit itself never executed a single piece of the repository.

Scope of the audit: 4,030 tracked files, including the vendored kernel tarballs and the
2,462 tracked `node_modules` files shipped inside four plugins.

## Summary

| Area | Findings | Outcome |
|---|---|---|
| Plugin update supply chain (`dsh-hub`) | H-01, H-02, H-14 | Anchored downloads, refused install hooks, scrubbed env, archive pre-flight |
| Kernel install chain | H-03, H-08, H-09, H-10, H-16, H-17, H-20 | `SHA256SUMS` anchor, `SHASUMS256` for Node, non-destructive merge, real integrity fast path |
| Lockfile | H-07, H-18 | Regenerated: 299 `file:` entries, all resolving, all with `sha512` |
| Workspace plugin isolation | H-04, H-05, H-06 | Opaque-origin previews, confined file serving, authenticated terminal |
| Native shell (Tauri/Rust) | H-12 | Navigation fence parses the URL instead of prefix-matching |
| Archive extraction | H-13 | Entry name/type validation before any write |
| Detection & tooling | H-15, H-19, H-21 | Broader best-effort scanner, marker recognition, confined `workdir` |
| Capability wildcard | H-11 | **Not narrowed — documented** (the ports are genuinely dynamic) |

## How to verify

```bash
cd dsh-desktop
node scripts/compat/validate-pin.js                 # kernel pin + SHA256SUMS, fail-closed
npm ci                                              # installs the anchored tree
node scripts/compat/patch-surface.js verify node_modules/@deepseek-ai ..
node scripts/check-syntax.js
npm test
```

New/updated unit tests added by these fixes:

- `scripts/test/unit-dsh-hub-download.test.js` — archive entry validation and the
  download-anchor decision table (pin match/mismatch, unanchored mirror refusal,
  explicit opt-in, trust-on-first-use of an official download, branch refs never pinned).
- `dsh-tauri/sidecar/cli.test.js` — H-13 traversal/link-type rejection matrix against
  in-memory `tar.gz` fixtures.

## Deliberate behaviour changes

Three findings are isolation defects whose literal fix changes user-visible behaviour.
They were applied with the smallest possible usability cost:

1. **Preview sandbox (H-04).** Previewed HTML now *always* runs without
   `allow-same-origin`, including the `/dsh-files/static/` fallback that used to strip
   the `sandbox` attribute entirely. Relative assets keep working (relative URLs resolve
   against the frame URL; the sandbox token list does not affect that). What no longer
   works is a previewed page reaching `window.parent`, `localStorage` or host routes —
   which is the point. Pages relying on same-origin storage will now see an opaque origin.
2. **File preview confinement (H-05).** The static route serves only paths inside known
   workspace/session roots, refuses credential material by name and extension, and
   resolves `realpath` before the containment check. Absolute paths outside a workspace
   are now `403` instead of being served.
3. **Terminal authentication (H-06).** The `token` query parameter is now a
   server-generated secret (`randomBytes(32)`) instead of a client-chosen session name;
   the old value is kept as `sid`. Every route additionally requires exact `Origin`/`Host`
   validation, and the spawned shell receives an allowlist-based environment. The client
   half fetches the secret from a same-origin, origin-fenced bootstrap route on each
   connect, so a host restart no longer requires a page reload.

## Finding-by-finding record

### H-01 — `dsh-hub` installed remote code with no integrity verification (critical)

`dsh-desktop/assets/plugins/dsh-hub/lib/index.js`

- Every accepted archive is now anchored: an explicit pin for `<owner>/<repo>@<ref>`
  (from `<profile>/plugin-source-pins.json` or `DSH_HUB_SOURCE_PINS`), or the sha256 of
  the first successful **official** `codeload` download for an immutable ref
  (trust-on-first-use).
- A mirror download with no anchor is refused unless the operator sets
  `DSH_HUB_ALLOW_UNVERIFIED_MIRROR=1`. This matches the fail-closed policy already used
  by `scripts/plugin-core/lib/updates.js`.
- Self-update resolves `main` to an immutable commit SHA (`resolveCommitSha`) before
  downloading, so the artifact can actually be anchored; commit SHAs are addressed
  directly (`codeload.github.com/<owner>/<repo>/zip/<sha>`).
- The sha256 of every accepted artifact is logged, and a mismatching download is deleted
  before it can reach the extract/build chain.

### H-02 — lifecycle hooks of the downloaded package ran with the full environment (critical)

- `preinstall` / `install` / `postinstall` declared by the downloaded package are refused
  outright (`findInstallTimeHook`), in both `applyNewSource` and `tryBuildPlugin`.
- Installs run with `pnpm install --ignore-scripts`.
- `runCli` / `runCliSync` / `runCliCapture` pass an allowlist-based environment
  (`sanitizedEnv()`): proxy/TLS plumbing is preserved, anything matching
  `KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE` is dropped, so an
  attacker-declared `prepare`/`build` cannot read the user's API keys or registry tokens.

### H-03 / H-10 — floating external deps and destructive `node_modules` merge

`dsh-desktop/scripts/install-kernel.mjs`

- The scope-wide `rmSync` of `node_modules/@deepseek-ai` was replaced by a targeted
  replacement of only the packages being installed (`replaceDir`: staged copy → rename,
  with the previous directory kept as a backup), so unrelated packages are no longer
  deleted.
- The external (non-vendored) dependency install for the synthetic consumer manifest now
  runs `npm install --package-lock-only` followed by `npm ci` (frozen) instead of a
  floating `npm install`, with a documented lock-writing fallback. Because that temp lock
  is generated at runtime rather than committed, external transitives can still float
  between kernel installs — recorded below as a residual risk.
- `buildTarballDeps` places platform-incompatible vendored packages in
  `optionalDependencies`, fixing a latent `EBADPLATFORM` failure (3 of the 299 tarballs
  cannot install on any given platform).

### H-04 — preview sandbox escape (high)

`dsh-desktop/assets/plugins/dsh-client-file-changes/lib/client.js`

- `PREVIEW_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals"` is applied to
  the iframe both at creation and on every navigation. The `removeAttribute("sandbox")`
  same-origin branch is gone.

### H-05 — arbitrary file read over HTTP (high)

`dsh-desktop/assets/plugins/dsh-file-changes/lib/index.js`

- Allowed roots are `process.cwd()` plus the session working directories the plugin can
  resolve (`findSessionCwd` / persisted session headers, 30 s cache).
- Containment uses `realpath(resolve(p))` and a `root + sep` prefix check
  (case-insensitive on Windows), so encoded `..` and symlink escapes are rejected.
- A deny list blocks `.ssh`, `.aws`, `.gnupg`, keychains, `.npmrc`, `.env*`,
  `.credentials*`, browser cookie stores and key extensions, even inside a root.
- Only extensions present in the plugin's MIME map (plus common office types) may be
  served; everything else is `415`.
- Served documents carry `nosniff` and a restrictive CSP (`sandbox allow-scripts …`).
- `pathFromStaticUrl` was corrected so the client's real (segment-encoded) URLs still
  resolve under the new confinement.

### H-06 — terminal authenticated only by `remoteAddress` (high)

`dsh-desktop/assets/plugins/dsh-terminal-tab/lib/{index,client}.js`

- A per-process `SECRET` (32 random bytes) is the credential; comparison uses
  `crypto.timingSafeEqual` behind a length check.
- Exact `Origin`/`Host` validation on every route: loopback host, port equal to the
  actual `ctx.webServer.port`, cross-site requests rejected; the WebSocket upgrade and the
  state-changing POSTs require an exact same-origin `Origin`.
- `cwd` is validated as absolute, existing, a directory, and inside the live session's
  `cwd` when the session is live.
- The spawned shell gets an allowlist environment instead of inheriting `process.env`.

### H-07 / H-18 — stale lockfile

`dsh-desktop/package-lock.json` was regenerated with the repository's own
`scripts/generate-kernel-lock.mjs`: 299 `file:vendor/dsh-kernel/*.tgz` entries, all
resolving to existing files, all carrying a `sha512` integrity recomputed from the real
tarball bytes, and no remaining references to the previous kernel version. `package.json`
and the lock's root entry now agree.

### H-08 — Node runtime downloaded without a checksum

`dsh-desktop/scripts/fetch-node.js` now downloads `SHASUMS256.txt` for the requested
version, extracts the expected digest for the exact archive name, verifies the downloaded
binary, and discards it on mismatch or when the entry is missing.

### H-09 / H-16 / H-17 / H-20 — no cryptographic anchor for the vendored kernel

- `dsh-desktop/vendor/dsh-kernel/SHA256SUMS` (299 lines, `sha256sum` format) is the
  integrity anchor and is tracked in git.
- `install-kernel.mjs` verifies every tarball it installs against the manifest and is
  fail-closed (missing manifest entry, missing file, or digest mismatch aborts).
- `scripts/compat/validate-pin.js` no longer uses `filename.includes(version)` as an
  anchor: digests are the anchor, and the version policy only requires the
  `@deepseek-ai/dsh*` family to carry the pinned version, so the framework tarballs
  (`cordis`, `cosmokit`, `schemastery`, `node-addon-system*`) are no longer rejected.
- The idempotent fast path verifies a generation marker derived from the manifest instead
  of checking a single package's version.

### H-11 — `remote.urls` wildcard (medium, documented, not narrowed)

`dsh-tauri/src-tauri/src/app/capabilities/default.json` is unchanged. The reasons are
concrete and were verified in the source: `preview-server` binds `("127.0.0.1", 0)` and
the kernel origin comes from `choose_stable_port()` / `probe_bind(0)`, so both ports are
OS-assigned; Tauri matches `remote.urls` with `urlpattern`, which has no port-range
syntax, so no fixed or narrower pattern can cover a random port. Narrowing it would break
the bridge. This is recorded as a residual risk instead of a guessed change.

### H-12 — navigation fence bypassable by userinfo/subdomain

`dsh-tauri/src-tauri/src/app/src/windows.rs`

- New `is_trusted_navigation_target()` parses the URL and accepts scheme `tauri`
  unconditionally, or `http` only when there is no userinfo and `host_str()` is exactly
  `127.0.0.1` / `localhost` / `::1` (both IPv6 spellings, since `host_str()` keeps the
  brackets).
- All three fences (main, float, pet) use it, and a regression test covers
  `http://127.0.0.1@evil.com/`, `http://127.0.0.1.evil.com/` and
  `http://evil.com@127.0.0.1/`.

### H-13 — zip-slip in the Tauri sidecar extraction

`dsh-tauri/sidecar/cli.js`

- `validateArchiveEntryName`, `assertInsideDir` and an entry-type check reject `..`,
  absolute/UNC paths, drive letters, NTFS ADS, reserved Windows device names and
  symlink/hardlink/device/FIFO entries **before** any write. The extraction fails whole on
  the first bad entry; there is no silent partial extraction.

### H-14 — zip-slip and link entries in `dsh-hub` extraction

- `listArchive` + `assertArchiveSafe` validate every entry name and type before the
  extractor runs, and a post-extraction walk rejects any surviving link. The rules mirror
  `scripts/plugin-core/lib/updates.js`.

### H-15 — scanner coverage was much smaller than documented (medium)

`dsh-desktop/scripts/plugin-core/lib/scan.js`

- `SCAN_EXTS` extended (`jsx/ts/mts/cts/tsx/node/dll/wasm/py/vbs/bash/zsh`); size caps
  raised (4 MB per file / 64 MB per package); only `.git` and `.pnpm` are skipped by
  default; symlinks are handled explicitly and never followed outside the scanned root
  (cycle-safe via a real-path visited set); all matching patterns per file are reported
  instead of stopping at the first.
- The header now states in plain English that this is **best-effort detection, not a
  security boundary**.
- The three tests that pinned the old behaviour were updated to assert the new one.

### H-19 — patch-surface marker recognition (low)

`dsh-desktop/scripts/compat/patch-surface.js`

- Marker recognition now also covers the `DSH Desktop: <name>` and
  `dsh-desktop heal isolation: <name>` families, which the case-sensitive free-text regex
  missed. The collected marker set stays regex-derived so the committed snapshot does not
  gain spurious entries; the snapshot format and hashing are untouched.

### H-21 — agent preset spawned a shell in an unvalidated `workdir` (low)

`dsh-desktop/assets/agent-presets/_preset/custom-bash.mjs` (and the byte-identical
`anchored-standard` copy)

- `workdir` must be absolute and `realpath`-resolve inside the session's working
  directory; relative, missing, out-of-root and symlink-escaping values are rejected with
  a clear error. Omitting `workdir` keeps the previous behaviour.

## Refuted recommendations (no change made)

- **Global `node_modules/` ignore rule.** The audit's hygiene item claimed a global rule
  hid tracked plugin `node_modules` trees. Verified false: `.gitignore` only has
  `dsh-desktop/node_modules/` and `openclaw-dsh-bridge/node_modules/`; `git check-ignore`
  confirms the plugin trees are not ignored, and they are tracked (728 + 1,177 files).
  No change.
- **`AppManifest::commands` (R-03).** On the pinned `tauri 2.11.5` the ACL is already a
  real boundary for remote origins (`!is_local` enforcement plus the app manifest already
  populated by `permissions/bridge.toml`, which the build-time `validate_capabilities`
  gate requires). Adding it would only autogenerate unused permission files and risk the
  IPC allowlist. No change.

## Residual risks and follow-ups

1. **Capability wildcard (H-11)** — remains as documented above until the preview/kernel
   ports are made deterministic.
2. **Patch-surface snapshot** — the snapshot fixture lives next to a real kernel tree. If
   the marker-recognition change alters which files the surface enumerates, regenerate it
   with `npm run snapshot:patch-surface` on a machine with the kernel installed and review
   the diff; CI runs `verify` and will report any drift explicitly.
3. **Native binaries** — the eight `.node` prebuilds and `D3DCOMPILER_47.dll` can only be
   checked by digest against the official distributions; that comparison needs a machine
   with network access and is not part of this change.
4. **Terminal `cwd` containment** — strict containment requires a live DSH session; the
   plugin has no configured workspace root of its own, so when the session is not live the
   check falls back to "absolute, existing directory" (already reachable only with the
   server secret).
5. **Electron `staticPort` server** — the client can prefer a shell-provided static server
   that does not live in this repository; if it also serves arbitrary absolute paths it
   needs the same confinement as H-05 on the shell side.
6. **The `SHA256SUMS` anchor is self-generated** — it anchors the bytes currently in the
   tree, but a commit that changes a tarball and the manifest together would still pass.
   Generating and reviewing it out-of-band (or in a trusted release job) is the stronger
   form, as the audit recommended.
7. **Signature verification is not performed** — neither `vendor/dsh-kernel/SHA256SUMS`
   nor nodejs.org's `SHASUMS256.txt` is GPG-verified, so both rest on TLS to the same
   origin. Pinned per-version hashes or GPG verification would strengthen H-08 further.
8. **Stale `@deepseek-ai` packages are no longer pruned** — the safe merge deliberately
   stops deleting packages that are not in the vendored set. Such a package is not
   resolved unless something imports it, and `validate-pin` pins the current set; an
   explicit manifest-driven cleanup could be added later.
