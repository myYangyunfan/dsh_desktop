/**
 * Install the locally-built @deepseek-ai/dsh kernel from the VENDORED tarballs in
 * dsh-desktop/vendor/dsh-kernel/ — WITHOUT the npm registry.
 *
 * The exact kernel version is defined once in scripts/compat/kernel-pin.json
 * (kernel.packageVersion / kernel.tag); the KERNEL_VERSION constant below is kept in
 * sync with that pin — do not drift it independently.
 *
 * Why this exists
 * ---------------
 * The dsh kernel (the whole @deepseek-ai/dsh-* family) is built from the official
 * tagged source and is NOT published to npm. The packed tarballs (`pnpm pack`
 * output, with `workspace:` deps already rewritten to explicit ranged versions)
 * are committed under vendor/dsh-kernel/ so a fresh machine / CI can reproduce the
 * exact kernel node_modules offline.
 *
 * How it works
 * ------------
 * 1. Integrity anchor: vendor/dsh-kernel/SHA256SUMS is the source of truth for the
 *    vendored tarballs. Every *.tgz is matched by exact filename and its sha256
 *    verified BEFORE use; a missing manifest entry or a digest mismatch aborts
 *    (fail-closed).
 * 2. Fast path: if every vendored package is already installed at the vendored
 *    version (and, when present, the generation marker written after a verified
 *    install still matches SHA256SUMS), exit 0 without network.
 * 3. Install path: build a throwaway npm project whose dependencies are ALL the
 *    vendored tarballs as `file:` URLs, resolve the graph once with
 *    `npm install --package-lock-only`, then install it with `npm ci` (frozen by
 *    construction). Platform-specific packages are declared as optional so npm
 *    skips the builds for other platforms instead of failing with EBADPLATFORM.
 * 4. Merge only the packages that were just installed into
 *    dsh-desktop/node_modules. The @deepseek-ai scope directory itself is never
 *    removed, so desktop-only / unrelated packages survive.
 *
 * External (non-vendored) transitives still resolve from the registry, but no
 * longer silently float: the temporary install is anchored by the generated
 * package-lock.json and installed with `npm ci`. Residual risk: that lock is
 * generated at runtime (the synthetic manifest has no committed lockfile), so
 * external transitives can still float between kernel versions; SHA256SUMS only
 * anchors the vendored tarballs. A committed lock for the synthetic manifest
 * would close that gap.
 *
 * NOTE: in the normal flow this is a fast no-op — `npm install`/`npm ci` already
 * install the kernel from the `file:` entries in package-lock.json before the
 * postinstall hook runs. This script is the offline fallback / repair path and
 * is what makes the kernel present BEFORE scripts/patch-deps.js applies its
 * patches.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
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
const SHA256SUMS_NAME = 'SHA256SUMS';
const NODE_MODULES = join(ROOT, 'node_modules');
const PIN_PATH = join(ROOT, 'scripts', 'compat', 'kernel-pin.json');
// 单一版本源 = kernel-pin.json（见文件头）。硬编码常数是第二处版本源：rc.1→rc.2
// 时快速幂等路径会拿旧常量比较，把仍装着 rc.1 的 node_modules 误判成「已就位」而跳过升级。
const KERNEL_VERSION = JSON.parse(readFileSync(PIN_PATH, 'utf8'))?.kernel?.packageVersion;
if (!KERNEL_VERSION) throw new Error(`install-kernel: ${PIN_PATH} 缺 kernel.packageVersion`);
const SHELL = process.platform === 'win32';

/** True for the kernel family that must carry the pinned version. */
function isDshFamily(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-');
}

/**
 * Parse a sha256sum-format manifest (`<64 hex>  <filename>` per line). Throws on a
 * missing/empty/malformed manifest so callers stay fail-closed. Returns the
 * filename->digest map plus an order-independent anchor digest of the manifest.
 */
function loadSha256Sums(dir = TARBALLS) {
  const manifestPath = join(dir, SHA256SUMS_NAME);
  let raw;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    throw new Error(`install-kernel: 缺少完整性清单 ${manifestPath}（fail-closed，拒绝安装）`);
  }
  const entries = new Map();
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (!m) throw new Error(`install-kernel: ${manifestPath} 第 ${i + 1} 行格式非法`);
    if (entries.has(m[2])) throw new Error(`install-kernel: ${manifestPath} 中 ${m[2]} 重复`);
    entries.set(m[2], m[1].toLowerCase());
  }
  if (entries.size === 0) throw new Error(`install-kernel: ${manifestPath} 为空（fail-closed）`);
  const anchor = createHash('sha256')
    .update([...entries.entries()].map(([file, digest]) => `${digest}  ${file}`).sort().join('\n'))
    .digest('hex');
  return { entries, anchor, manifestPath };
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

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

/** npm `os`/`cpu` semantics: positive entries allow, `!` entries deny. */
function matchesPlatform(spec, actual) {
  if (!Array.isArray(spec) || spec.length === 0) return true;
  const values = spec.map((v) => String(v).toLowerCase());
  const negated = values.filter((v) => v.startsWith('!')).map((v) => v.slice(1));
  const positive = values.filter((v) => !v.startsWith('!'));
  if (negated.includes(actual)) return false;
  if (positive.length > 0 && !positive.includes(actual)) return false;
  return true;
}

function isPlatformCompatible(manifest) {
  return matchesPlatform(manifest.os, process.platform) && matchesPlatform(manifest.cpu, process.arch);
}

/**
 * Verify every vendored *.tgz against SHA256SUMS and read its manifest. The digest
 * check happens before the tarball is used for anything else.
 * @returns {Array<{name:string,version:string,file:string,filePath:string,compatible:boolean}>}
 */
function readVendorPackages(sums, dir = TARBALLS) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.tgz')).sort();
  if (files.length === 0) {
    throw new Error(`install-kernel: no tarballs found in ${dir}`);
  }
  const present = new Set(files);
  for (const file of sums.entries.keys()) {
    if (!present.has(file)) {
      throw new Error(`install-kernel: ${file} 在 SHA256SUMS 中但磁盘缺失（fail-closed）`);
    }
  }
  const packages = [];
  const names = new Set();
  for (const file of files) {
    const expected = sums.entries.get(file);
    if (!expected) {
      throw new Error(`install-kernel: ${file} 未收录于 SHA256SUMS（fail-closed，拒绝安装未锚定 tarball）`);
    }
    const filePath = join(dir, file);
    const actual = sha256File(filePath);
    if (actual !== expected) {
      throw new Error(`install-kernel: ${file} sha256 不符（fail-closed）\n  期望 ${expected}\n  实际 ${actual}`);
    }
    const manifest = readTarballManifest(filePath);
    if (!manifest.name || !manifest.version) {
      throw new Error(`install-kernel: tarball ${file} has no name/version`);
    }
    // 0.1.6 起收编族（cordis/cosmokit/schemastery/node-addon-system）版本线与
    // 内核 pin 不同——只要 manifest 自洽（名字与文件名一致）即可，版本不再强等 pin。
    const bare = manifest.name.replace(/^@/, '').replace('/', '-');
    if (file !== `${bare}-${manifest.version}.tgz`) {
      throw new Error(
        `install-kernel: tarball ${file} 与 manifest ${bare}-${manifest.version}.tgz 不符`,
      );
    }
    // The dsh family must still carry the pinned version (exact-pin policy).
    if (isDshFamily(manifest.name) && manifest.version !== KERNEL_VERSION) {
      throw new Error(
        `install-kernel: ${manifest.name}@${manifest.version} 与 pin ${KERNEL_VERSION} 不符（禁止浮动）`,
      );
    }
    if (names.has(manifest.name)) {
      throw new Error(`install-kernel: 重复包名 ${manifest.name}（${file}）`);
    }
    names.add(manifest.name);
    packages.push({
      name: manifest.name,
      version: manifest.version,
      file,
      filePath,
      compatible: isPlatformCompatible(manifest),
    });
  }
  if (!names.has('@deepseek-ai/dsh')) {
    throw new Error('install-kernel: vendored set does not contain @deepseek-ai/dsh');
  }
  return packages;
}

/** Build the `file:` dependency maps for every verified vendored tarball. */
function buildTarballDeps(packages) {
  const dependencies = {};
  const optionalDependencies = {};
  for (const pkg of packages) {
    const href = pathToFileURL(pkg.filePath).href;
    // Platform-specific packages (node-addon-system-<os>-<arch>) are declared
    // optional so npm silently skips the other platforms instead of EBADPLATFORM.
    if (pkg.compatible) dependencies[pkg.name] = href;
    else optionalDependencies[pkg.name] = href;
  }
  return { dependencies, optionalDependencies };
}

/** Version declared by an installed package, or null when absent/unreadable. */
function installedVersion(name, nodeModules = NODE_MODULES) {
  try {
    const pkgPath = join(nodeModules, ...name.split('/'), 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function readGenerationMarker(nodeModules = NODE_MODULES) {
  try {
    const marker = JSON.parse(readFileSync(join(nodeModules, '.dsh-kernel-generation.json'), 'utf8'));
    return marker && typeof marker === 'object' ? marker : null;
  } catch {
    return null;
  }
}

/**
 * Idempotent check: is the vendored set already installed at the vendored
 * versions? The marker path is cheap; the fallback reads one small package.json
 * per vendored package (platform-incompatible optionals are skipped).
 */
function packagesInstalled(packages, sums, nodeModules = NODE_MODULES) {
  const marker = readGenerationMarker(nodeModules);
  if (
    marker
    && marker.anchor === sums.anchor
    && marker.kernelVersion === KERNEL_VERSION
    && Array.isArray(marker.packages)
    && marker.packages.length === packages.length
  ) {
    const ok = marker.packages.every(
      (p) => p && typeof p.name === 'string' && installedVersion(p.name, nodeModules) === p.version,
    );
    if (ok && installedVersion('@deepseek-ai/dsh', nodeModules) === KERNEL_VERSION) return true;
  }
  for (const pkg of packages) {
    if (!pkg.compatible) continue;
    if (installedVersion(pkg.name, nodeModules) !== pkg.version) return false;
  }
  return installedVersion('@deepseek-ai/dsh', nodeModules) === KERNEL_VERSION;
}

/** Record a verified install so the next start can trust the anchor cheaply. */
function writeGenerationMarker(packages, sums, nodeModules = NODE_MODULES) {
  const data = {
    manifest: SHA256SUMS_NAME,
    anchor: sums.anchor,
    kernelVersion: KERNEL_VERSION,
    packages: packages
      .map((p) => ({ name: p.name, version: p.version }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
  try {
    writeFileSync(join(nodeModules, '.dsh-kernel-generation.json'), `${JSON.stringify(data, null, 2)}\n`);
  } catch (err) {
    console.warn(`[install-kernel] 无法写代际标记（下次启动将重新校验）: ${err.message}`);
  }
}

/**
 * Replace dstPath with srcPath while keeping the swap as atomic as practical:
 * stage beside dst (same volume), rename the old dir aside, rename the staged dir
 * into place, then drop the backup. Falls back to a direct copy on rename failure
 * so Windows file locks cannot block the install.
 */
function replaceDir(srcPath, dstPath) {
  const stamp = `${process.pid}-${Date.now().toString(36)}`;
  const staged = `${dstPath}.dsh-new-${stamp}`;
  const backup = `${dstPath}.dsh-old-${stamp}`;
  rmSync(staged, { recursive: true, force: true });
  cpSync(srcPath, staged, { recursive: true });
  let hasBackup = false;
  if (existsSync(dstPath)) {
    try {
      renameSync(dstPath, backup);
      hasBackup = true;
    } catch {
      rmSync(dstPath, { recursive: true, force: true });
    }
  }
  try {
    renameSync(staged, dstPath);
  } catch {
    try {
      cpSync(staged, dstPath, { recursive: true });
    } catch (copyErr) {
      if (hasBackup) {
        try { renameSync(backup, dstPath); } catch { /* keep the original error */ }
      }
      rmSync(staged, { recursive: true, force: true });
      throw copyErr;
    }
    rmSync(staged, { recursive: true, force: true });
  }
  if (hasBackup) {
    try { rmSync(backup, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const SKIP_TOP = new Set(['.package-lock.json', '.pnpm']);

/**
 * Merge a fully-resolved kernel consumer node_modules into
 * dsh-desktop/node_modules:
 *   - @deepseek-ai scope: replace ONLY the packages coming from the consumer.
 *     The scope directory is never removed, so unrelated / desktop-only packages
 *     (and packages from a previous kernel) are left intact.
 *   - every other top-level package present in the consumer: replaced in place.
 *   - scoped dirs (other than @deepseek-ai) merge at sub-package granularity.
 *   - .bin: overlay the consumer shims without removing desktop's.
 */
function mergeNodeModules(srcNm, dstNm) {
  mkdirSync(dstNm, { recursive: true });

  const srcScope = join(srcNm, '@deepseek-ai');
  const dstScope = join(dstNm, '@deepseek-ai');
  if (existsSync(srcScope)) {
    mkdirSync(dstScope, { recursive: true });
    for (const name of readdirSync(srcScope)) {
      const s = join(srcScope, name);
      if (!isDir(s)) continue;
      replaceDir(s, join(dstScope, name));
    }
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
        replaceDir(s, join(dstPath, sub));
      }
    } else {
      if (!isDir(srcPath)) continue;
      replaceDir(srcPath, dstPath);
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

function npmRun(cwd, args) {
  return new Promise((resolve) => {
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

/**
 * Resolve the temporary consumer once into a lockfile carrying integrity hashes,
 * then install strictly from it (`npm ci` is npm's frozen-lockfile install).
 * Falls back to a single lock-writing `npm install` if lock generation fails.
 */
async function installConsumer(cwd) {
  const lockCode = await npmRun(cwd, ['install', '--package-lock-only', '--no-audit', '--no-fund']);
  if (lockCode === 0 && existsSync(join(cwd, 'package-lock.json'))) {
    const ciCode = await npmRun(cwd, ['ci', '--no-audit', '--no-fund']);
    if (ciCode === 0) return { ok: true, locked: true };
    console.warn('[install-kernel] npm ci 失败，回退到 npm install（仍会生成锁文件）');
  }
  const code = await npmRun(cwd, ['install', '--no-audit', '--no-fund']);
  return { ok: code === 0, locked: false };
}

async function main() {
  // 1. Integrity anchor: SHA256SUMS must exist and must verify every tarball.
  const sums = loadSha256Sums();
  const packages = readVendorPackages(sums);

  // 2. Idempotent fast path: vendored set already installed at vendored versions.
  if (packagesInstalled(packages, sums)) {
    writeGenerationMarker(packages, sums);
    console.log(`[install-kernel] @deepseek-ai/dsh ${KERNEL_VERSION} 与 ${packages.length} 个 vendored 包校验通过；跳过（fast no-op）`);
    return;
  }

  // 3. Throwaway npm consumer built from the verified `file:` tarballs.
  const { dependencies, optionalDependencies } = buildTarballDeps(packages);
  console.log(`[install-kernel] installing ${packages.length} vendored tarball(s) -> ${NODE_MODULES}`);
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-kernel-'));
  try {
    const manifest = {
      name: 'dsh-kernel-install',
      version: '0.0.0',
      private: true,
      dependencies,
    };
    if (Object.keys(optionalDependencies).length > 0) {
      manifest.optionalDependencies = optionalDependencies;
    }
    writeFileSync(join(tmp, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const install = await installConsumer(tmp);
    if (!install.ok) {
      console.error('[install-kernel] npm install exited non-zero');
      process.exit(1);
    }
    if (!install.locked) {
      console.warn('[install-kernel] 临时 consumer 未使用锁文件安装（外部依赖仍可能浮动）');
    }

    // 4. Merge into the desktop node_modules.
    const srcNm = join(tmp, 'node_modules');
    const dshPkg = join(srcNm, '@deepseek-ai', 'dsh', 'package.json');
    if (!existsSync(dshPkg)) {
      console.error('[install-kernel] consumer install did not produce @deepseek-ai/dsh');
      process.exit(1);
    }
    const v = JSON.parse(readFileSync(dshPkg, 'utf8')).version;
    if (v !== KERNEL_VERSION) {
      console.error(`[install-kernel] consumer resolved @deepseek-ai/dsh = ${v} (期望 ${KERNEL_VERSION})`);
      process.exit(1);
    }
    console.log(`[install-kernel] consumer resolved @deepseek-ai/dsh = ${v}`);
    mergeNodeModules(srcNm, NODE_MODULES);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const finalVersion = installedVersion('@deepseek-ai/dsh');
  if (finalVersion !== KERNEL_VERSION) {
    console.error(`[install-kernel] merge did not reach ${KERNEL_VERSION} (got ${finalVersion})`);
    process.exit(1);
  }
  writeGenerationMarker(packages, sums);
  console.log(`[install-kernel] done: @deepseek-ai/dsh = ${finalVersion}`);
}

// Run only when executed directly (postinstall); importing the helpers for tests
// must not trigger an install. Any failure to tell defaults to running.
const invokedDirectly = (() => {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error('[install-kernel] ' + (err && err.stack ? err.stack : err));
    process.exit(1);
  });
}

export {
  KERNEL_VERSION,
  TARBALLS,
  buildTarballDeps,
  installedVersion,
  isPlatformCompatible,
  loadSha256Sums,
  mergeNodeModules,
  packagesInstalled,
  readTarballManifest,
  readVendorPackages,
  replaceDir,
  writeGenerationMarker,
};
