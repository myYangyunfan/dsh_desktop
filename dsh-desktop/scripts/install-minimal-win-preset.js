'use strict';

// Install every bundled agent preset from assets/agent-presets into an
// @deepseek-ai/dsh package directory.
//
// - `npm start` runs this against the dev node_modules copy so the presets are
//   also visible when running from source.
// - scripts/after-pack.js runs it against the packed app copy, so the shipped
//   build carries all presets out of the box.
//
// Preset directory ids must match [a-z0-9-]+ (the user-facing name lives in
// each preset.yml). Current set:
//   minimal-win             -> 极简模式_win
//   router-standard         -> Router Standard (experimental)
//   anchored-standard       -> Anchored Standard (experimental)
//   zero-anchored-standard  -> Zero-Anchored Standard (experimental)

const fs = require('node:fs');
const path = require('node:path');

function presetsSourceDir() {
  return path.resolve(__dirname, '..', 'assets', 'agent-presets');
}

/** Copy one bundled preset directory into <dshPackageDir>/config/agent-presets/. */
function installBuiltinPreset(dshPackageDir, id) {
  const src = path.join(presetsSourceDir(), id);
  const agentFile = path.join(src, 'agent.cordis.yml');
  const metaFile = path.join(src, 'preset.yml');
  if (!fs.existsSync(agentFile) || !fs.existsSync(metaFile)) {
    throw new Error(`builtin preset source incomplete: ${src}`);
  }
  const dest = path.join(dshPackageDir, 'config', 'agent-presets', id);
  fs.mkdirSync(dest, { recursive: true });
  // Full-directory copy: presets may carry local .mjs bootstrap modules
  // referenced relatively from agent.cordis.yml.
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name));
  }
  return dest;
}

/** Install all bundled presets. Returns the destination directories. */
function installBuiltinPresets(dshPackageDir) {
  const ids = fs.readdirSync(presetsSourceDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return ids.map((id) => installBuiltinPreset(dshPackageDir, id));
}

/** Backward-compatible wrapper used by after-pack and older callers. */
function installMinimalWinPreset(dshPackageDir) {
  return installBuiltinPreset(dshPackageDir, 'minimal-win');
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
  PRESET_ID: 'minimal-win',
};

if (require.main === module) {
  try {
    const dests = installBuiltinPresets(installedDshPackageDir());
    console.log(`builtin presets installed (${dests.length}): ${dests.join(', ')}`);
  } catch (err) {
    console.error(`builtin preset install failed: ${(err && err.message) || err}`);
    process.exit(1);
  }
}