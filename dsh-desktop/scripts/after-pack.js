'use strict';

// electron-builder afterPack hook.
//
// electron-builder's file copier strips nested node_modules directories from
// extraResources, but the bundled npm CLI needs its own bundled deps
// (graceful-fs, semver, ...). Copy vendor/npm verbatim into the packed app
// after packaging; both the portable and NSIS targets then archive this copy.
//
// Also prunes pure-redundant files out of the packed app to shrink install
// size/time WITHOUT touching anything that runs:
//   - *.map  : source maps (dev-only, never used at runtime)
//   - doc/license files (LICENSE*, README*, CHANGELOG*, HISTORY, COPYING,
//     NOTICE, AUTHORS, SECURITY, NOTICE, *.md)
// No .js/.json/.node/.exe/.dll or any other runtime file is ever removed.

const fs = require('node:fs');
const path = require('node:path');

// Portable cache patch must be applied before electron-builder compiles the
// NSIS portable target; doing it here covers direct `electron-builder` runs,
// not just `npm run dist`.
require('./patch-portable-template');

// Patch the bundled dsh-session event vocabulary so plugin events
// (dsh-agent-teams / dsh-message-edit / dsh-web-search-exa) are accepted by
// the session reader — otherwise "history unavailable ... unknown to this
// harness and not marked ignorable" breaks session history loading.
const { patchDshSessionVocabulary } = require('./patch-event-vocabulary');
const { installBuiltinPresets } = require('./install-minimal-win-preset');
const { patchWebSearchBaseUrl } = require('./patch-web-search-baseurl');

// Regexes for files that are safe to delete (pure metadata / dev artifacts).
const DROP_BASENAME = /^(LICENSE.*|README.*|CHANGELOG.*|HISTORY.*|COPYING.*|NOTICE.*|AUTHORS.*|SECURITY.*|CONTRIBUTING.*|\.gitignore|\.npmignore|\.editorconfig|\.eslintrc.*|\.prettierrc.*|\.babelrc.*)$/i;
const DROP_EXT = new Set(['.map', '.md', '.markdown', '.tsbuildinfo', '.d.ts']);

function isDroppable(name) {
  if (DROP_BASENAME.test(name)) return true;
  const ext = path.extname(name).toLowerCase();
  return DROP_EXT.has(ext);
}

// Recursively remove droppable files. Never descends into node_modules/.bin
// (symlinks) and never follows symlinks. Returns the number of files removed.
function pruneDroppable(root) {
  let removed = 0;
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue; // never touch symlinks (e.g. .bin)
      if (e.isDirectory()) {
        if (e.name === '.bin') continue;
        walk(full);
      } else if (e.isFile() && isDroppable(e.name)) {
        try { fs.unlinkSync(full); removed++; } catch { /* keep going */ }
      }
    }
  };
  walk(root);
  return removed;
}

module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;
  if (electronPlatformName !== 'win32') return;
  const src = path.resolve(__dirname, '..', 'vendor', 'npm');
  const dest = path.join(appOutDir, 'resources', 'npm');
  if (fs.existsSync(src)) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    const deps = fs.readdirSync(path.join(dest, 'node_modules')).length;
    console.log(`afterPack: bundled npm copied (deps: ${deps})`);
  } else {
    console.warn('afterPack: vendor/npm missing — npm CLI will not be bundled');
  }

  // Prune redundant files from the packed app (resources/app/...) and the
  // bundled npm CLI (resources/npm/...). Runtime files are never removed.
  const targets = [
    path.join(appOutDir, 'resources', 'app'),
    dest,
  ].filter((p) => fs.existsSync(p));
  let total = 0;
  for (const t of targets) total += pruneDroppable(t);
  console.log(`afterPack: pruned ${total} redundant files (install shrink)`);

  // Patch the packaged dsh-session vocabulary in the packed app (idempotent).
  // Runs after pruning so the .js files it modifies are the final copies.
  const sessionPkgDir = path.join(appOutDir, 'resources', 'app', 'node_modules',
    '@deepseek-ai', 'dsh-session');
  if (fs.existsSync(path.join(sessionPkgDir, 'lib', 'index.js'))) {
    const changed = patchDshSessionVocabulary(sessionPkgDir);
    console.log(`afterPack: session event vocabulary ${changed > 0 ? `patched (+${changed} types)` : 'already up to date'}`);
  } else {
    console.warn('afterPack: bundled dsh-session not found — vocabulary patch skipped');
  }

  // Ship the desktop's minimal_win preset in the bundled dsh CLI (idempotent).
  const dshPkgDir = path.join(appOutDir, 'resources', 'app', 'node_modules', '@deepseek-ai', 'dsh');
  if (fs.existsSync(path.join(dshPkgDir, 'package.json'))) {
    const presetDirs = installBuiltinPresets(dshPkgDir);
    console.log(`afterPack: builtin presets installed (${presetDirs.length}): ${presetDirs.map((p) => path.basename(p)).join(", ")}`);
  } else {
    console.warn('afterPack: bundled dsh package not found — minimal-win preset skipped');
  }

  // Patch the bundled dsh-web-search-deepseek baseURL handling (issue #20,
  // idempotent). Runs after pruning so the .js files it modifies are the final
  // copies; the same implementation is re-applied at boot for the overlay copy.
  const appNm = path.join(appOutDir, 'resources', 'app', 'node_modules');
  if (fs.existsSync(appNm)) {
    const wsChanged = patchWebSearchBaseUrl(appNm, (m) => console.log('afterPack: ' + m));
    console.log(`afterPack: web-search baseURL ${wsChanged > 0 ? `patched (${wsChanged} files)` : 'already up to date'}`);
  } else {
    console.warn('afterPack: bundled app node_modules not found — web-search baseURL patch skipped');
  }
};
