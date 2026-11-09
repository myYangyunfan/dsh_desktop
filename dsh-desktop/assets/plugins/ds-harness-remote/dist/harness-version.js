import { readFile, realpath as realpathEntrypoint } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
const HARNESS_PACKAGE_NAME = '@deepseek-ai/dsh';
export function normalizeHarnessVersion(value) {
    if (typeof value !== 'string')
        return undefined;
    const version = value.trim();
    if (version.length === 0 || version.length > 64 || /[\u0000-\u001f]/u.test(version))
        return undefined;
    return version;
}
/**
 * Select the Typert Session wire generation used by supported DSH builds.
 * Unknown builds stay on the established v0.1.2 profile; package peer ranges
 * prevent them from being presented as supported installations.
 */
export function harnessSessionGeneration(version) {
    if (version === undefined)
        return 'legacy';
    const match = /^(?:dsh-)?v?(\d+)\.(\d+)\.(\d+)(?:-|$)/u.exec(version.trim());
    if (match === null)
        return 'legacy';
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    // 0.2.0 retains the existing Remote carrier; its on-disk format is unrelated.
    return major === 0 && ((minor === 1 && patch >= 5) || minor === 2) ? 'v3' : 'legacy';
}
/** Read a candidate manifest, ignoring every package that is not the Harness CLI. */
async function readHarnessManifestVersion(manifestPath) {
    try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (manifest.name !== HARNESS_PACKAGE_NAME)
            return undefined;
        return normalizeHarnessVersion(manifest.version);
    }
    catch {
        // Missing or malformed manifests simply mean this candidate does not hold the Harness package.
        return undefined;
    }
}
/**
 * Compatibility fallback for Harness builds whose host.describe still returns
 * the historical 0.0.1 placeholder.
 *
 * Both supported entrypoint layouts must be covered. A CLI/dsh-TUI entrypoint
 * sits below the @deepseek-ai/dsh package root, so only its ancestor chain is
 * worth walking. The 0.2.0 Desktop shell instead launches its own
 * `@deepseek-ai/dsh-desktop-host` entrypoint from inside `app.asar`, where the
 * ancestors carry only the desktop shell and runtime manifests while the
 * Harness CLI package is a sibling; resolve that package through the
 * entrypoint's module scope.
 */
export async function readHarnessDistributionVersion(entrypoint = process.argv[1]) {
    if (entrypoint === undefined || !isAbsolute(entrypoint))
        return undefined;
    // Global npm installs expose the CLI through a bin symlink. Resolve it before
    // walking ancestors; otherwise `.../bin/dsh` never reaches the
    // `@deepseek-ai/dsh` package manifest and the CLI Host reports no version.
    let resolvedEntrypoint = entrypoint;
    try {
        resolvedEntrypoint = await realpathEntrypoint(entrypoint);
    }
    catch {
        // Keep the original path for Desktop/app.asar and other virtual entries
        // where the filesystem cannot resolve a real path.
    }
    if (!isAbsolute(resolvedEntrypoint))
        return undefined;
    let directory = dirname(resolvedEntrypoint);
    for (let depth = 0; depth < 8; depth += 1) {
        const version = await readHarnessManifestVersion(join(directory, 'package.json'));
        if (version !== undefined)
            return version;
        const parent = dirname(directory);
        if (parent === directory)
            break;
        directory = parent;
    }
    try {
        return await readHarnessManifestVersion(createRequire(resolvedEntrypoint).resolve(`${HARNESS_PACKAGE_NAME}/package.json`));
    }
    catch {
        // The entrypoint may not be a module path that can reach the Harness CLI package.
        return undefined;
    }
}
//# sourceMappingURL=harness-version.js.map