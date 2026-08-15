// Host-side entry: this companion package has no server half — the compaction
// settings (auto / thresholdRatio / maxTokens) live in the DSH Desktop shell's
// settings.json and are read/written through the preload bridge
// (window.dshDesktop.compaction). The main process additionally rewrites every
// agent preset's compaction-basic config from these values
// (see scripts/apply-compaction-settings.js). The loader rejects an empty
// default export, so the host half is a valid no-op Cordis plugin (same
// pattern as dsh-wsl-settings / dsh-balance).
const name = 'dsh-compaction-settings';
const inject = [];
function apply() {}
export { apply, inject, name };
