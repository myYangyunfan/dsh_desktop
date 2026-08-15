// Host-side entry: this companion package has no server half — the backend
// config (backend / wslDistro / wslInstallDir) lives in the DSH Desktop shell's
// settings.json and is read/written through the preload bridge
// (window.dshDesktop.wsl). The loader rejects an empty default export, so the
// host half is a valid no-op Cordis plugin (same pattern as dsh-balance).
const name = "dsh-wsl-settings";
const inject = [];
function apply() {}
export { apply, inject, name };
