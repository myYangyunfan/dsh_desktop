'use strict';

// Install every bundled agent preset from assets/agent-presets into the DSH
// home's user preset root (<DSH_HOME>/.agent-presets).
//
// The 0.1.2-alpha.1 kernel moved built-in presets out of
// `dsh/config/agent-presets` into the `@deepseek-ai/dsh-agent-presets` package
// (shipped set: cordis / minimal / ptc / standard). User-supplied presets are
// discovered from `<DSH_HOME>/.agent-presets` (the package's derived `user`
// root), so our desktop presets are installed there to coexist with the new
// roster instead of depending on the removed `code` / `minimal-win` ids.
//
// - `scripts/sync-companion-plugins.js` runs this against the target DSH_HOME so
//   the desktop's own presets are visible in WSL / Linux dsh installs too.
//
// Preset directory ids must match [a-z0-9-]+ (the user-facing name lives in
// each preset.yml). Current set:
//   minimal-win                    -> 极简模式_win
//   router-standard                -> Router Standard (experimental)
//   anchored-standard              -> Anchored Standard (experimental)
//   zero-anchored-standard         -> Zero-Anchored Standard (experimental)
//   whoami-standard                -> Whoami Standard (experimental)
//   v4-flash-godmode-opencode-go   -> Router Flash (opencode-go)
//   warmupbetter                   -> Warmup Better
//   warmupbetter-replay            -> Warmup Better Replay
//
// `_preset` is NOT a preset slot: it is the shared module directory that
// zero-anchored-standard and whoami-standard reference via `../_preset/*.mjs`.
// It starts with an underscore so preset discovery (PRESET_ID ^[a-z0-9][a-z0-9-]*$)
// skips it instead of reporting a broken roster row, and this script copies it
// alongside the preset slots without treating it as one.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function presetsSourceDir() {
  return path.resolve(__dirname, '..', 'assets', 'agent-presets');
}

/** 内核 dsh-agent-presets 的用户预设根（<DSH_HOME>/.agent-presets）。 */
function userPresetRoot(dshHome) {
  return path.join(dshHome, '.agent-presets');
}

/** 缺省 DSH_HOME（$DSH_HOME 优先，否则 ~/.dsh），与 dsh-home-paths 同源。 */
function defaultDshHome() {
  const env = process.env.DSH_HOME;
  if (env && env.trim().length > 0) return path.resolve(env);
  return path.join(os.homedir(), '.dsh');
}

/**
 * 启动提速：目标文件与源大小 + mtime 一致时跳过复制（cpSync 保留时间戳，
 * 复制的目标 mtime 与源一致，下次启动可继续命中跳过）。预设安装的语义是
 * 「目标必须与源一致」：不一致（缺失/大小或时间戳不同）就覆盖，因此跳过
 * 只发生在目标已一致时，行为与原「每次全量复制」等价，只是不再无意义写盘。
 */
function fileMatches(sf, df) {
  try {
    const sst = fs.statSync(sf);
    const dst = fs.statSync(df);
    return dst.size === sst.size && Math.round(dst.mtimeMs) === Math.round(sst.mtimeMs);
  } catch {
    return false;
  }
}

/** Copy one bundled preset directory into <dshHome>/.agent-presets/. */
function installBuiltinPreset(dshHome, id) {
  const src = path.join(presetsSourceDir(), id);
  const agentFile = path.join(src, 'agent.cordis.yml');
  const metaFile = path.join(src, 'preset.yml');
  if (!fs.existsSync(agentFile) || !fs.existsSync(metaFile)) {
    throw new Error(`builtin preset source incomplete: ${src}`);
  }
  const dest = path.join(userPresetRoot(dshHome), id);
  fs.mkdirSync(dest, { recursive: true });
  // Full-directory copy: presets may carry local .mjs bootstrap modules
  // referenced relatively from agent.cordis.yml.
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const sf = path.join(src, entry.name);
    const df = path.join(dest, entry.name);
    if (fileMatches(sf, df)) continue; // 已一致：跳过写盘
    fs.cpSync(sf, df, { force: true, preserveTimestamps: true });
  }
  return dest;
}

/** Shared-module directory inside the preset root (not a preset slot). */
const SHARED_PRESET_DIR = '_preset';

/** Install all bundled presets. Returns the destination directories. */
function installBuiltinPresets(dshHome) {
  const presetRoot = presetsSourceDir();
  const ids = fs.readdirSync(presetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== SHARED_PRESET_DIR)
    .map((entry) => entry.name)
    .sort();
  const dests = ids.map((id) => installBuiltinPreset(dshHome, id));

  // Copy the shared `_preset` modules referenced by zero/whoami rows and
  // imports (`../_preset/*.mjs`). It is deliberately not installed as a preset
  // slot: discovery would otherwise report it as a broken roster row.
  const sharedSrc = path.join(presetRoot, SHARED_PRESET_DIR);
  if (fs.existsSync(sharedSrc)) {
    const sharedDest = path.join(userPresetRoot(dshHome), SHARED_PRESET_DIR);
    fs.mkdirSync(sharedDest, { recursive: true });
    for (const entry of fs.readdirSync(sharedSrc, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const sf = path.join(sharedSrc, entry.name);
      const df = path.join(sharedDest, entry.name);
      if (fileMatches(sf, df)) continue; // 已一致：跳过写盘
      fs.cpSync(sf, df, { force: true, preserveTimestamps: true });
    }
  }
  return dests;
}

/** Backward-compatible wrapper used by older callers. */
function installMinimalWinPreset(dshHome) {
  return installBuiltinPreset(dshHome, 'minimal-win');
}

/** Resolve the locally installed @deepseek-ai/dsh package directory. */
function installedDshPackageDir() {
  const pkgFile = require.resolve('@deepseek-ai/dsh/package.json');
  return path.dirname(pkgFile);
}

module.exports = {
  installMinimalWinPreset,
  installBuiltinPreset,
  installBuiltinPresets,
  installedDshPackageDir,
  userPresetRoot,
  defaultDshHome,
  PRESET_ID: 'minimal-win',
};

if (require.main === module) {
  try {
    const dests = installBuiltinPresets(defaultDshHome());
    console.log(`builtin presets installed (${dests.length}): ${dests.join(', ')}`);
  } catch (err) {
    console.error(`builtin preset install failed: ${(err && err.message) || err}`);
    process.exit(1);
  }
}
