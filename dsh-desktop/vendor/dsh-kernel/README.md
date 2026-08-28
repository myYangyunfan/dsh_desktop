# Vendored dsh kernel tarballs

This directory holds the packed, npm-installable tarballs for the locally-built
`@deepseek-ai/dsh` **0.1.2-alpha.1** kernel (the full `@deepseek-ai/dsh-*`
family — 241 packages, ~8.1 MB compressed). The kernel is built from GitHub
(`dsh-v0.1.2-alpha.1`) and is **NOT published to the npm registry**, so these
tarballs are committed to the repo to make the kernel reproducible on a fresh
machine / CI without any registry lookup for the kernel itself.

## Where they came from

- Produced by `pnpm pack` over every publishable `@deepseek-ai/dsh-*` package in
  the kernel monorepo. `pnpm pack` rewrites each `workspace:` dependency into an
  explicit ranged version (`^0.1.2-alpha.1` for dsh-* workspace deps, and the
  vendored framework versions for the rest), so the tarballs are installable by
  a plain `npm` consumer.
- The build source of truth lives in `.tmp-kernel/` (not committed as build
  input for this mechanism); the generation scripts are
  `.tmp-kernel/dsh-make-tarballs.mjs` and `.tmp-kernel/dsh-consumer-install.mjs`.

## How the install flow works

1. `dsh-desktop/package.json` declares every `@deepseek-ai/dsh*` package at
   `0.1.2-alpha.1` (semver) as a direct dependency. These MUST NOT resolve from
   the registry.
2. `dsh-desktop/package-lock.json` points each of those 241 packages at its
   vendored tarball via a `file:vendor/dsh-kernel/<name>-0.1.2-alpha.1.tgz`
   `resolved` entry, so `npm ci` / `npm install` install them locally instead of
   hitting the registry. (Transitive external deps still resolve from the
   registry as normal.)
3. The `postinstall` hook runs
   `node scripts/install-kernel.mjs && node scripts/patch-deps.js`. The
   `install-kernel.mjs` step is idempotent: if
   `node_modules/@deepseek-ai/dsh/package.json` is already `0.1.2-alpha.1` it
   exits immediately; otherwise it installs all 241 tarballs into a throwaway
   `file:` npm project and merges the result into `dsh-desktop/node_modules`.
   This guarantees the kernel is present *before* `patch-deps.js` applies its
   patches.

## Regenerating (kernel bump)

If the kernel version changes, regenerate the tarballs, copy them here, then
regenerate `package-lock.json` (the `file:`-resolved entries) with
`dsh-desktop/scripts/generate-kernel-lock.mjs`.
