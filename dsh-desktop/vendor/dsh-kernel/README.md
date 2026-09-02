# Vendored dsh kernel tarballs (ACTIVE — 0.1.2-alpha.3)

This directory holds the packed, npm-installable tarballs for the locally-built
`@deepseek-ai/dsh` **0.1.2-alpha.3** kernel (the full `@deepseek-ai/dsh-*`
family — 244 packages). The kernel is built from the official `dsh-v0.1.2-alpha.3`
source and is **NOT published to the npm registry**. This is the **active** vendored
set: `dsh-desktop/package.json` / `package-lock.json` resolve every
`@deepseek-ai/dsh*` package against these `file:` tarballs, so a fresh machine / CI
reproduces the exact kernel `node_modules` offline.

The single source of truth for the pinned kernel version is
`dsh-desktop/scripts/compat/kernel-pin.json` (`kernel.tag`, `kernel.packageVersion`,
`kernel.vendorDir`). Everything here — the tarball file names, the manifests, and the
comments in the surrounding scripts — must agree with that pin.

Contents: 244 `deepseek-ai-dsh-<pkg>-0.1.2-alpha.3.tgz` tarballs. Relative to the
previously staged 0.1.2-alpha.2 set (recorded as 245 packages), this alpha.3 set has
both additions and removals (net 244); the authoritative list is whatever is present
in this directory — verify with `Get-ChildItem dsh-desktop/vendor/dsh-kernel` rather
than trusting any enumerated diff here.

## Where they came from

- Built and packed from the official `dsh-v0.1.2-alpha.3` source tree with the
  repository's own release flow: `pnpm install`, `pnpm build:official` (binds
  client artifacts to the official build profile and writes the client build
  record), then `scripts/release/pack.ts --family dsh` (validates the build
  record, the one-version baseline, and each tarball payload; packs all members
  in publish order via `pnpm pack`).
- `pnpm pack` rewrites each `workspace:` dependency into an explicit ranged
  version (`^0.1.2-alpha.3` for dsh-* workspace deps, and the vendored
  framework versions for the rest), so the tarballs are installable by a plain
  `npm` consumer.
- Two local adaptations were applied to the scratch checkout's release scripts
  for Windows (spawn `pnpm` through its JS entrypoint instead of the `.cmd`
  shim; `tar --force-local` for `C:` paths). Neither changes tarball content.

## How to activate (kernel bump)

Version is driven by `dsh-desktop/scripts/compat/kernel-pin.json` as the single data
source (`kernel.tag` / `kernel.packageVersion` / `kernel.vendorDir`). To bump the
kernel:

1. Update the pin (`kernel.tag`, `kernel.packageVersion`) in
   `scripts/compat/kernel-pin.json`, and place the matching same-version
   `deepseek-ai-dsh-<pkg>-<newVersion>.tgz` tarballs into this directory (remove the
   old-version ones so no mixed versions remain).
2. Verify pin vs directory consistency: `node scripts/compat/validate-pin.js`
   (fail-closed if any tarball version does not match `kernel.packageVersion`).
3. Regenerate `package-lock.json` (the `file:`-resolved entries) with
   `dsh-desktop/scripts/generate-kernel-lock.mjs`, so `package.json` /
   `package-lock.json` declare every `@deepseek-ai/dsh*` package at the new version.
4. Re-run the patch chain and refresh the `patch-surface` snapshot so the adapters'
   anchors match the new kernel.

`scripts/install-kernel.mjs` and `scripts/patch-deps.js` pick the version up from the
pin / manifests; after install, verify the kernel reports the pinned version.
