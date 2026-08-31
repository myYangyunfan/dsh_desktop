# Vendored dsh kernel tarballs (STAGED — not yet active)

This directory stages the packed, npm-installable tarballs for the locally-built
`@deepseek-ai/dsh` **0.1.2-alpha.2** kernel (the full `@deepseek-ai/dsh-*`
family — 245 packages). The kernel is built from GitHub (`dsh-v0.1.2-alpha.2`)
and is **NOT published to the npm registry**. This is a staging directory for
the next kernel bump: the currently active set is
`../dsh-kernel/` (0.1.2-alpha.1, 241 packages). Nothing in here is referenced
by `dsh-desktop/package.json` / `package-lock.json` yet.

Contents: 245 `deepseek-ai-dsh-<pkg>-0.1.2-alpha.2.tgz` tarballs plus
`publish-order.txt` (the official `release:pack` upload order). Relative to the
active 0.1.2-alpha.1 set, alpha.2 adds 4 packages and drops none:

- `@deepseek-ai/dsh-client-ui-schedule`
- `@deepseek-ai/dsh-deque`
- `@deepseek-ai/dsh-util-time`
- `@deepseek-ai/dsh-util-values`

## Where they came from

- Built and packed from the official `dsh-v0.1.2-alpha.2` source tree with the
  repository's own release flow: `pnpm install`, `pnpm build:official` (binds
  client artifacts to the official build profile and writes the client build
  record), then `scripts/release/pack.ts --family dsh` (validates the build
  record, the one-version baseline, and each tarball payload; packs all 245
  members in publish order via `pnpm pack`).
- `pnpm pack` rewrites each `workspace:` dependency into an explicit ranged
  version (`^0.1.2-alpha.2` for dsh-* workspace deps, and the vendored
  framework versions for the rest), so the tarballs are installable by a plain
  `npm` consumer.
- Two local adaptations were applied to the scratch checkout's release scripts
  for Windows (spawn `pnpm` through its JS entrypoint instead of the `.cmd`
  shim; `tar --force-local` for `C:` paths). Neither changes tarball content.

## How to activate (kernel bump)

Follow the same steps as the 0.1.2-alpha.1 set (see `../dsh-kernel/README.md`):

1. Copy these tarballs over `vendor/dsh-kernel/` and update
   `dsh-desktop/package.json` to declare every `@deepseek-ai/dsh*` package at
   `0.1.2-alpha.2`, including the 4 new packages above.
2. Regenerate `package-lock.json` (the `file:`-resolved entries) with
   `dsh-desktop/scripts/generate-kernel-lock.mjs`.
3. `scripts/install-kernel.mjs` and `scripts/patch-deps.js` pick the version up
   from the manifests; verify the installed kernel reports `0.1.2-alpha.2`.
