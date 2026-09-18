# Security Policy — DSH Desktop

DSH Desktop is a desktop shell around the `dsh` (DeepSeek Harness) kernel. It ships a
vendored kernel, a plugin ecosystem and an auto-update engine, so its main security
surface is the **software supply chain**, not a remote server. This document describes
the trust model that is actually enforced by the code in this repository, and the knobs
an operator can use to tighten it.

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security → Report a vulnerability)
instead of a public issue. Include the affected file and line, a minimal reproduction,
and whether the issue requires local code execution or only network access.

## Supply-chain integrity model

### 1. Vendored kernel tarballs

`dsh-desktop/vendor/dsh-kernel/*.tgz` (299 tarballs) are the pinned kernel distribution
and they **are tracked in git**. Their integrity anchor is
`dsh-desktop/vendor/dsh-kernel/SHA256SUMS` (standard `sha256sum` format, one line per
tarball).

Both `scripts/install-kernel.mjs` and `scripts/compat/validate-pin.js` verify every
tarball they install against that manifest and are **fail-closed**: a tarball that is
missing from the manifest, present in the manifest but absent from disk, or whose digest
does not match aborts the install. Version matching against `kernel-pin.json` is a
*policy* check; the digests are the *integrity* check. The manifest itself is tracked in
git, so changes to it are reviewable in a PR.

After a verified install, `install-kernel.mjs` writes a generation marker derived from
the manifest so the fast idempotent path can prove the whole tree still matches, instead
of only checking the version of a single package.

### 2. npm lockfile

`dsh-desktop/package-lock.json` pins the external (non-vendored) dependency graph and
carries `integrity` for every entry. It must stay in sync with `package.json`; regenerate
it with `node scripts/generate-kernel-lock.mjs` whenever the kernel pin changes. CI runs
`npm ci` followed by `node scripts/compat/validate-pin.js`, so a desynchronised or
unanchored tree fails the build instead of shipping.

### 3. GitHub source downloads (`dsh-hub` plugin updates)

The plugin update engine can install a plugin from a GitHub source archive. Two of the
download paths are anonymous third-party mirrors (`ghfast.top`, `gh-proxy.com`,
`ghproxy.net`) which, by their own nature, promise nothing about the bytes they relay.
Every accepted archive is therefore anchored:

- A **pinned sha256** for `<owner>/<repo>@<ref>` is always enforced when present. Pins
  live in `<profile>/plugin-source-pins.json` or in the `DSH_HUB_SOURCE_PINS` environment
  variable (JSON object with the same `{"owner/repo@ref": "<sha256>"}` shape).
- For an **immutable ref** (a tag or a full commit SHA — never a branch) the sha256 of the
  first successful **official** `codeload.github.com` download is recorded locally
  (trust-on-first-use); a later mirror download of the same ref must match it.
- A mirror download with **no anchor at all** is refused. The self-update path resolves
  `main` to an immutable commit SHA before downloading precisely so it can be anchored.
- `archiveRootMatchesRepo` additionally rejects an archive whose top-level directory is
  not `<repo>-<ref>`, which catches mirror mix-ups.

The fail-closed comparison is the same policy already used by
`dsh-desktop/scripts/plugin-core/lib/updates.js`, which refuses to install a registry
update that does not carry a `sha512` from the registry packument.

### 4. Running downloaded code

A downloaded plugin archive is attacker-controlled input. Before building it:

- packages declaring `preinstall` / `install` / `postinstall` are **refused**;
- the install runs with `pnpm install --ignore-scripts`, so no lifecycle hook of the
  downloaded tree executes;
- the child process receives an **allowlist-based environment** (`sanitizedEnv()`), so the
  user's API keys, registry tokens and other secrets are not inherited by an
  attacker-declared `prepare`/`build` script. Proxy and TLS variables are kept so proxied
  setups keep working;
- archives are validated for entry names and entry types before extraction (zip-slip,
  absolute paths, drive letters, NTFS ADS, reserved device names, and link/device
  entries are rejected) and no symlink may survive extraction.

## Trust boundaries

- **Loopback HTTP.** Kernel, preview server and the plugins' web routes bind `127.0.0.1`
  only. Loopback is *not* treated as authentication for state-changing routes: the
  terminal plugin requires a server-generated secret plus exact `Origin`/`Host` checks.
- **Workspace previews.** Previewed HTML is untrusted content and always runs in an opaque
  origin (`sandbox` without `allow-same-origin`) with a restrictive CSP and `nosniff`.
- **File serving.** The file-preview route resolves `realpath` and confines reads to known
  workspace/session roots, with a deny list for credential material (`.ssh`, `.aws`,
  `.npmrc`, `.env*`, `.credentials*`, keys, browser cookie stores) and an extension
  allowlist.
- **Windows registry.** The shell only *reads* the Internet Settings proxy keys; it never
  writes registry state and installs no autostart entries.

## Operator knobs

| Variable | Effect |
|---|---|
| `DSH_HUB_SOURCE_PINS` | JSON map `<owner>/<repo>@<ref>` → sha256, enforced for every download. |
| `DSH_HUB_ALLOW_UNVERIFIED_MIRROR=1` | Explicitly accepts a mirror download that has no anchor. Off by default; only use it if you accept the risk. |
| `DSH_PLUGIN_DEV_GITHUB` | Marks plugins from that GitHub owner as "developer" plugins in the UI (identification only). |

## Verifying a checkout

```bash
cd dsh-desktop
node scripts/compat/validate-pin.js                  # kernel pin + SHA256SUMS (fail-closed)
npm ci                                               # installs the anchored tree
node scripts/compat/patch-surface.js verify node_modules/@deepseek-ai ..   # patch-surface drift gate
node scripts/check-syntax.js
npm test
```

## Scope and limitations

- The bundled third-party `node_modules` trees are tracked for offline installs; their own
  upstream advisories are not audited here.
- Prebuilt native binaries (`.node` prebuilds, `D3DCOMPILER_47.dll`) cannot be validated by
  reading source. Their sizes and sha256 digests are recorded for out-of-band comparison
  against the official distributions.
- The plugin security scanner (`scripts/plugin-core/lib/scan.js`) is **best-effort
  detection, not a security boundary**; it is documented as such in its header.
