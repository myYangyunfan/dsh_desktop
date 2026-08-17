'use strict';

// electron-builder afterPack hook.
//
// electron-builder's file copier strips nested node_modules directories from
// extraResources, but the bundled npm CLI needs its own bundled deps
// (graceful-fs, semver, ...). Copy vendor/npm verbatim into the packed app
// after packaging (Windows: <appOutDir>/resources, macOS: <appOutDir>/
// Contents/Resources); the target installers/archives then carry this copy.
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
// not just `npm run dist`. Windows-only: the portable.nsi template only
// exists in the Windows target pipeline.
if (process.platform === 'win32') {
  require('./patch-portable-template');
}

// Patch the bundled dsh-session event vocabulary so plugin events
// (dsh-agent-teams / dsh-message-edit / dsh-web-search-exa) are accepted by
// the session reader — otherwise "history unavailable ... unknown to this
// harness and not marked ignorable" breaks session history loading.
const { patchDshSessionVocabulary } = require('./patch-event-vocabulary');
const { installBuiltinPresets } = require('./install-minimal-win-preset');
const { patchWebSearchBaseUrl } = require('./patch-web-search-baseurl');
const { patchMenuViewport } = require('./patch-menu-viewport');
const { patchSessionManage } = require('./patch-session-manage');
const { patchOpenProjectDir } = require('./patch-open-project-dir');
const { patchSessionPersistence } = require('./patch-session-persistence');
const { patchSlotCompat } = require('./patch-slot-compat');

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

// Resources directory inside the packed app: Windows keeps it at
// <appOutDir>/resources, macOS inside the .app bundle at
// <appOutDir>/Contents/Resources.
function resourcesDir(appOutDir, platform = process.platform) {
  return platform === 'darwin'
    ? path.join(appOutDir, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources');
}

module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;
  const res = resourcesDir(appOutDir, electronPlatformName);
  const src = path.resolve(__dirname, '..', 'vendor', 'npm');
  const dest = path.join(res, 'npm');
  if (fs.existsSync(src)) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    const deps = fs.readdirSync(path.join(dest, 'node_modules')).length;
    console.log(`afterPack: bundled npm copied (deps: ${deps})`);
  } else {
    console.warn('afterPack: vendor/npm missing — npm CLI will not be bundled');
  }

  // electron-builder strips nested node_modules from assets/plugins during the
  // file copy (same behavior as extraResources noted above). Restore vendored
  // plugin deps verbatim so bundled plugins with private dependencies (e.g.
  // billion-context-dsh's acp-kernel) resolve inside the packed app; the
  // runtime profile sync then carries them into the web profile.
  const pluginRoot = path.join(res, 'app', 'assets', 'plugins');
  if (fs.existsSync(pluginRoot)) {
    for (const rel of fs.readdirSync(pluginRoot)) {
      const srcNm = path.resolve(__dirname, '..', 'assets', 'plugins', rel, 'node_modules');
      if (!fs.existsSync(srcNm)) continue;
      const dstNm = path.join(pluginRoot, rel, 'node_modules');
      fs.rmSync(dstNm, { recursive: true, force: true });
      fs.cpSync(srcNm, dstNm, { recursive: true });
      console.log(`afterPack: vendored plugin node_modules restored (${rel})`);
    }
  }

  // Prune redundant files from the packed app (resources/app/...) and the
  // bundled npm CLI (resources/npm/...). Runtime files are never removed.
  const targets = [
    path.join(res, 'app'),
    dest,
  ].filter((p) => fs.existsSync(p));
  let total = 0;
  for (const t of targets) total += pruneDroppable(t);
  console.log(`afterPack: pruned ${total} redundant files (install shrink)`);

  // Patch the packaged dsh-session vocabulary in the packed app (idempotent).
  // Runs after pruning so the .js files it modifies are the final copies.
  const sessionPkgDir = path.join(res, 'app', 'node_modules',
    '@deepseek-ai', 'dsh-session');
  if (fs.existsSync(path.join(sessionPkgDir, 'lib', 'index.js'))) {
    const changed = patchDshSessionVocabulary(sessionPkgDir);
    console.log(`afterPack: session event vocabulary ${changed > 0 ? `patched (+${changed} types)` : 'already up to date'}`);
  } else {
    console.warn('afterPack: bundled dsh-session not found — vocabulary patch skipped');
  }

  // Ship the desktop's minimal_win preset in the bundled dsh CLI (idempotent).
  const dshPkgDir = path.join(res, 'app', 'node_modules', '@deepseek-ai', 'dsh');
  if (fs.existsSync(path.join(dshPkgDir, 'package.json'))) {
    const presetDirs = installBuiltinPresets(dshPkgDir);
    console.log(`afterPack: builtin presets installed (${presetDirs.length}): ${presetDirs.map((p) => path.basename(p)).join(", ")}`);
  } else {
    console.warn('afterPack: bundled dsh package not found — minimal-win preset skipped');
  }

  // Patch the bundled dsh-web-search-deepseek baseURL handling (issue #20,
  // idempotent). Runs after pruning so the .js files it modifies are the final
  // copies; the same implementation is re-applied at boot for the overlay copy.
  const appNm = path.join(res, 'app', 'node_modules');
  if (fs.existsSync(appNm)) {
    const wsChanged = patchWebSearchBaseUrl(appNm, (m) => console.log('afterPack: ' + m));
    console.log(`afterPack: web-search baseURL ${wsChanged > 0 ? `patched (${wsChanged} files)` : 'already up to date'}`);
    // issue #36: Menu portal 列表视口封顶（预设很多时顶部条目被裁掉的修复）。
    const mvChanged = patchMenuViewport(appNm, (m) => console.log('afterPack: ' + m));
    console.log(`afterPack: menu viewport ${mvChanged > 0 ? 'patched' : 'already up to date'}`);
    // 对话删除/归档管理：官方包运行时补丁（dsh-workspace / host-apiproxy /
    // client-connection / client-ui-workspace）。
    const smChanged = patchSessionManage(appNm, (m) => console.log('afterPack: ' + m));
    console.log(`afterPack: session manage ${smChanged > 0 ? `patched (${smChanged} files)` : 'already up to date'}`);
    // 侧边栏「打开项目目录」：项目行/会话行菜单追加入口 + 右键弹出。
    const odChanged = patchOpenProjectDir(appNm, (m) => console.log('afterPack: ' + m));
    console.log(`afterPack: open project dir ${odChanged > 0 ? 'patched' : 'already up to date'}`);
    const spChanged = patchSessionPersistence(appNm, (m) => console.log('afterPack: ' + m));
    console.log(`afterPack: session torn-tail recovery ${spChanged > 0 ? 'patched' : 'already up to date'}`);
    const skChanged = patchSlotCompat(appNm, (m) => console.log('afterPack: ' + m));
    console.log(`afterPack: keyed slot compatibility ${skChanged > 0 ? 'patched' : 'already up to date'}`);
  } else {
    console.warn('afterPack: bundled app node_modules not found — web-search baseURL / menu viewport / session manage / open project dir / session recovery / slot compatibility patches skipped');
  }
};
