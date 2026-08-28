/**
 * Regenerate dsh-desktop/package-lock.json so the vendored 0.1.2-alpha.1 kernel
 * resolves from `file:vendor/dsh-kernel/*.tgz` instead of the npm registry.
 *
 * Why: the kernel is NOT published to npm. package.json declares every
 * @deepseek-ai/dsh* package as an exact semver `0.1.2-alpha.1`, and this script
 * produces the matching lockfile where each of those 241 packages has a
 * `file:`-resolved entry pointing at the vendored tarball. npm ci / npm install
 * then install the kernel locally; all other (external) deps still resolve from
 * the registry. This is what keeps `npm ci` from trying to fetch 0.1.2-alpha.1
 * from the registry.
 *
 * Usage:  node scripts/generate-kernel-lock.mjs
 * (Run from anywhere; it resolves paths relative to this file.)
 */

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARBALLS = join(ROOT, 'vendor', 'dsh-kernel');
const PKG_PATH = join(ROOT, 'package.json');
const LOCK_PATH = join(ROOT, 'package-lock.json');
const SHELL = process.platform === 'win32';
const KERNEL_VERSION = '0.1.2-alpha.1';

const realPkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));

// --- build the file: dependency map for the 241 vendored tarballs ---
const files = readdirSync(TARBALLS).filter((f) => f.endsWith('.tgz')).sort();
if (files.length === 0) throw new Error(`no tarballs in ${TARBALLS}`);

const fileDeps = {};
const resolvedByName = {};
for (const file of files) {
  const base = file.replace(/\.tgz$/, '').replace(`-${KERNEL_VERSION}`, '');
  const name = `@deepseek-ai/${base.replace(/^deepseek-ai-/, '')}`;
  const rel = `file:vendor/dsh-kernel/${file}`;
  fileDeps[name] = rel;
  resolvedByName[name] = rel;
}

// --- non-dsh direct deps stay registry-resolved (same specs as package.json) ---
const nonDshDeps = {};
for (const [k, v] of Object.entries(realPkg.dependencies)) {
  if (!k.startsWith('@deepseek-ai/dsh')) nonDshDeps[k] = v;
}

const tmp = mkdtempSync(join(tmpdir(), 'dsh-kernel-lock-'));
try {
  // vendored tarballs must live at vendor/dsh-kernel relative to the temp project
  // so npm records portable `file:vendor/dsh-kernel/*.tgz` resolved paths.
  mkdirSync(join(tmp, 'vendor', 'dsh-kernel'), { recursive: true });
  for (const file of files) {
    cpSync(join(TARBALLS, file), join(tmp, 'vendor', 'dsh-kernel', file));
  }

  const tempPkg = {
    name: realPkg.name,
    version: realPkg.version,
    private: true,
    dependencies: { ...nonDshDeps, ...fileDeps },
    devDependencies: realPkg.devDependencies ?? {},
    overrides: realPkg.overrides,
  };
  writeFileSync(join(tmp, 'package.json'), `${JSON.stringify(tempPkg, null, 2)}\n`);

  console.log(`generate-kernel-lock: resolving ${files.length} file: deps + ${Object.keys(nonDshDeps).length} registry deps ...`);
  const code = await new Promise((resolve) => {
    const child = spawn('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], {
      cwd: tmp,
      shell: SHELL,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (c) => {
      process.stdout.write(out);
      if (err.trim()) process.stderr.write(err);
      resolve(c);
    });
  });
  if (code !== 0) {
    console.error(`generate-kernel-lock: npm install --package-lock-only exited ${code}`);
    process.exit(1);
  }

  const tmpLock = JSON.parse(readFileSync(join(tmp, 'package-lock.json'), 'utf8'));

  // --- rewrite the root package entry to match the REAL package.json ---
  // (the temp project listed the 241 tarballs as `file:` deps; the real package.json
  // lists them as semver `0.1.2-alpha.1` — the `packages` map below keeps the
  // file:-resolved entries so npm ci still installs them locally.)
  tmpLock.packages[''] = {
    name: realPkg.name,
    version: realPkg.version,
    hasInstallScript: !!(realPkg.scripts && realPkg.scripts.postinstall),
    license: realPkg.license,
    dependencies: realPkg.dependencies,
    devDependencies: realPkg.devDependencies ?? {},
  };

  // --- sanity: every dsh package has a file:-resolved entry ---
  let bad = 0;
  for (const name of Object.keys(fileDeps)) {
    const key = `node_modules/${name}`;
    const entry = tmpLock.packages[key];
    if (!entry) { console.error(`  MISSING lock entry: ${name}`); bad += 1; continue; }
    if (entry.version !== KERNEL_VERSION) { console.error(`  WRONG version ${name}: ${entry.version}`); bad += 1; }
    const want = resolvedByName[name];
    if (entry.resolved !== want) {
      // normalize (npm may record the same path with a different file: form)
      entry.resolved = want;
    }
  }
  if (bad > 0) {
    console.error(`generate-kernel-lock: ${bad} problem(s) — not writing lockfile`);
    process.exit(1);
  }

  writeFileSync(LOCK_PATH, `${JSON.stringify(tmpLock, null, 2)}\n`);
  console.log(`generate-kernel-lock: wrote ${LOCK_PATH}`);
  console.log(`generate-kernel-lock: dsh entries = ${Object.keys(fileDeps).length}, total lock packages = ${Object.keys(tmpLock.packages).length}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
