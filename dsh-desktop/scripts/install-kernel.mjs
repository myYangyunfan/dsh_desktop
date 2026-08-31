/**
 * Install the locally-built @deepseek-ai/dsh@0.1.2-alpha.1 kernel from the
 * VENDORED tarballs in dsh-desktop/vendor/dsh-kernel/ — WITHOUT the npm registry.
 *
 * Why this exists
 * ---------------
 * The dsh kernel (the whole @deepseek-ai/dsh-* family) is built from GitHub
 * (`dsh-v0.1.2-alpha.1`) and is NOT published to npm. The 241 packed tarballs
 * (`pnpm pack` output, with `workspace:` deps already rewritten to explicit
 * `^0.1.2-alpha.1` ranges) are committed under vendor/dsh-kernel/ so a fresh
 * machine / CI can reproduce the exact kernel node_modules offline.
 *
 * How it works (mirrors the consumer-install approach)
 * ----------------------------------------------------
 * 1. Fast path: if node_modules/@deepseek-ai/dsh/package.json is already
 *    `0.1.2-alpha.1`, exit 0 immediately (idempotent, no network).
 * 2. Otherwise, build a throwaway npm project whose dependencies are ALL 241
 *    tarballs as `file:` URLs, run `npm install --no-audit --no-fund
 *    --no-package-lock`, and merge the resolved node_modules into
 *    dsh-desktop/node_modules. Every @deepseek-ai/dsh-* resolves to our local
 *    tarball; external deps (resolve.exports, yaml, SDKs, natives, ...) come
 *    from the registry as usual.
 *
 * NOTE: in the normal flow this is a fast no-op — `npm install`/`npm ci` already
 * install the kernel from the `file:` entries in package-lock.json before the
 * postinstall hook runs. This script is the offline fallback / repair path and
 * is what makes the kernel present BEFORE scripts/patch-deps.js applies its
 * patches.
 */

import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARBALLS = join(ROOT, 'vendor', 'dsh-kernel');
const NODE_MODULES = join(ROOT, 'node_modules');
const DSH_PACKAGE = join(NODE_MODULES, '@deepseek-ai', 'dsh', 'package.json');
const KERNEL_VERSION = '0.1.2-alpha.3';
const SHELL = process.platform === 'win32';

/** Read `package.json` out of a pnpm/npm pack tarball without extracting it. */
function readTarballManifest(tarballPath) {
  const buf = gunzipSync(readFileSync(tarballPath));
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const name = buf.toString('utf8', offset, offset + 100).replace(/\0[\s\S]*$/, '');
    const sizeStr = buf.toString('utf8', offset + 124, offset + 136).replace(/\0[\s\S]*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const contentStart = offset + 512;
    if (name === 'package/package.json') {
      return JSON.parse(buf.toString('utf8', contentStart, contentStart + size));
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`install-kernel: package/package.json not found in ${tarballPath}`);
}

/** Build the `file:` dependency map for every vendored tarball. */
function buildTarballDeps() {
  const files = readdirSync(TARBALLS).filter((f) => f.endsWith('.tgz')).sort();
  if (files.length === 0) {
    throw new Error(`install-kernel: no tarballs found in ${TARBALLS}`);
  }
  const deps = {};
  for (const file of files) {
    const manifest = readTarballManifest(join(TARBALLS, file));
    if (!manifest.name || !manifest.version) {
      throw new Error(`install-kernel: tarball ${file} has no name/version`);
    }
    if (manifest.version !== KERNEL_VERSION) {
      throw new Error(
        `install-kernel: tarball ${file} is ${manifest.version}, expected ${KERNEL_VERSION}`,
      );
    }
    deps[manifest.name] = pathToFileURL(join(TARBALLS, file)).href;
  }
  return { deps, count: files.length };
}

function npmInstall(cwd) {
  return new Promise((resolve) => {
    const args = ['install', '--no-audit', '--no-fund', '--no-package-lock'];
    const child = spawn('npm', args, { cwd, shell: SHELL, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      process.stdout.write(out);
      if (err.trim()) process.stderr.write(err);
      resolve(code);
    });
  });
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const SKIP_TOP = new Set(['.package-lock.json', '.pnpm']);

/**
 * Merge a fully-resolved kernel consumer node_modules into
 * dsh-desktop/node_modules (same semantics as the original merge step):
 *   - @deepseek-ai scope: FULL replace (drops stale/renamed dsh packages, upgrades
 *     everything to 0.1.2-alpha.1, brings framework deps to kernel versions).
 *   - every other top-level package: copy over (adds new externals, bumps changed
 *     ones). Desktop-only packages not present in the consumer are left intact.
 *   - scoped dirs (other than @deepseek-ai) merge at sub-package granularity.
 *   - .bin: overlay the consumer shims without removing desktop's.
 */
function mergeNodeModules(srcNm, dstNm) {
  mkdirSync(dstNm, { recursive: true });

  const srcScope = join(srcNm, '@deepseek-ai');
  const dstScope = join(dstNm, '@deepseek-ai');
  if (existsSync(dstScope)) rmSync(dstScope, { recursive: true, force: true });
  mkdirSync(dstScope, { recursive: true });
  for (const name of readdirSync(srcScope)) {
    cpSync(join(srcScope, name), join(dstScope, name), { recursive: true });
  }

  for (const name of readdirSync(srcNm)) {
    if (SKIP_TOP.has(name) || name === '.bin' || name === '@deepseek-ai') continue;
    const srcPath = join(srcNm, name);
    const dstPath = join(dstNm, name);
    if (name.startsWith('@')) {
      if (!isDir(srcPath)) continue;
      mkdirSync(dstPath, { recursive: true });
      for (const sub of readdirSync(srcPath)) {
        const s = join(srcPath, sub);
        if (!isDir(s)) continue;
        const d = join(dstPath, sub);
        rmSync(d, { recursive: true, force: true });
        cpSync(s, d, { recursive: true });
      }
    } else {
      if (!isDir(srcPath)) continue;
      rmSync(dstPath, { recursive: true, force: true });
      cpSync(srcPath, dstPath, { recursive: true });
    }
  }

  const srcBin = join(srcNm, '.bin');
  const dstBin = join(dstNm, '.bin');
  if (existsSync(srcBin)) {
    mkdirSync(dstBin, { recursive: true });
    for (const f of readdirSync(srcBin)) {
      cpSync(join(srcBin, f), join(dstBin, f), { force: true });
    }
  }
}

async function main() {
  // 1. Idempotent fast path.
  if (existsSync(DSH_PACKAGE)) {
    let version = 'unknown';
    try {
      version = JSON.parse(readFileSync(DSH_PACKAGE, 'utf8')).version ?? 'unknown';
    } catch { /* fall through and reinstall */ }
    if (version === KERNEL_VERSION) {
      console.log(`[install-kernel] @deepseek-ai/dsh already ${KERNEL_VERSION}; skipping (fast no-op)`);
      return;
    }
  }

  // 2. Build the file: dependency map from the vendored tarballs.
  const { deps, count } = buildTarballDeps();
  console.log(`[install-kernel] installing ${count} vendored tarball(s) -> ${NODE_MODULES}`);

  // 3. Throwaway npm consumer.
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-kernel-'));
  try {
    const manifest = {
      name: 'dsh-kernel-install',
      version: '0.0.0',
      private: true,
      dependencies: deps,
    };
    writeFileSync(join(tmp, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const code = await npmInstall(tmp);
    if (code !== 0) {
      console.error(`[install-kernel] npm install exited ${code}`);
      process.exit(1);
    }

    // 4. Merge into the desktop node_modules.
    const srcNm = join(tmp, 'node_modules');
    const dshPkg = join(srcNm, '@deepseek-ai', 'dsh', 'package.json');
    if (!existsSync(dshPkg)) {
      console.error('[install-kernel] consumer install did not produce @deepseek-ai/dsh');
      process.exit(1);
    }
    const v = JSON.parse(readFileSync(dshPkg, 'utf8')).version;
    console.log(`[install-kernel] consumer resolved @deepseek-ai/dsh = ${v}`);
    mergeNodeModules(srcNm, NODE_MODULES);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const finalVersion = JSON.parse(readFileSync(DSH_PACKAGE, 'utf8')).version;
  if (finalVersion !== KERNEL_VERSION) {
    console.error(`[install-kernel] merge did not reach ${KERNEL_VERSION} (got ${finalVersion})`);
    process.exit(1);
  }
  console.log(`[install-kernel] done: @deepseek-ai/dsh = ${finalVersion}`);
}

main().catch((err) => {
  console.error('[install-kernel] ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
