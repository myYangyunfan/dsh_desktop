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
/** Roots where a globally installed Harness CLI is commonly found. */
function globalNpmRoots(context, execPath, cwd) {
    const roots = [];
    const add = (value) => {
        if (typeof value === 'string' && value.length > 0)
            roots.push(value);
    };
    const env = context.env ?? process.env;
    if (isAbsolute(execPath)) {
        add(dirname(execPath));
        add(join(dirname(execPath), '..', 'lib'));
    }
    const prefix = env.npm_config_prefix;
    if (prefix !== undefined && prefix.length > 0) {
        add(prefix);
        add(join(prefix, 'lib'));
    }
    const appData = env.APPDATA;
    if (appData !== undefined && appData.length > 0)
        add(join(appData, 'npm'));
    for (const base of ['/usr/local/lib', '/usr/lib', '/opt/homebrew/lib'])
        add(base);
    return roots;
}
/**
 * Read the installed Harness CLI version from its package manifest.
 *
 * A CLI entrypoint sits below the `@deepseek-ai/dsh` package root, so only its
 * ancestor chain is worth walking; global bin symlinks are resolved first. The
 * 0.2.0 Desktop shell launches its own `@deepseek-ai/dsh-desktop-host`
 * entrypoint from inside `app.asar`, where the Harness CLI is a sibling and is
 * reachable through the entrypoint's module scope instead.
 *
 * Electron desktop Hosts may launch with an empty or non-absolute
 * `process.argv[1]`. In that case recover the version from the working
 * directory, the running executable's ancestors, `createRequire(...)` module
 * scope, and the usual global npm roots instead of returning `undefined`.
 */
export async function readHarnessDistributionVersion(entrypoint = process.argv[1], context = {}) {
    const cwd = context.cwd ?? process.cwd();
    const execPath = context.execPath ?? (typeof process.execPath === 'string' ? process.execPath : '');
    const globalRoots = context.globalRoots ?? globalNpmRoots(context, execPath, cwd);
    const manifests = [];
    const seen = new Set();
    const addManifest = (value) => {
        if (typeof value !== 'string' || value.length === 0 || seen.has(value))
            return;
        seen.add(value);
        manifests.push(value);
    };
    const addAncestors = (start) => {
        let directory = start;
        for (let depth = 0; depth < 8; depth += 1) {
            addManifest(join(directory, 'package.json'));
            const parent = dirname(directory);
            if (parent === directory)
                break;
            directory = parent;
        }
    };
    const addResolved = (base) => {
        try {
            addManifest(createRequire(base).resolve(`${HARNESS_PACKAGE_NAME}/package.json`));
        }
        catch {
            // This base cannot reach the Harness CLI package (or the package does not
            // export ./package.json); every other candidate still applies.
        }
    };
    // Primary: an absolute CLI entrypoint. Resolve bin symlinks before walking
    // ancestors so a globally installed `.../bin/dsh` reaches the package root.
    if (typeof entrypoint === 'string' && entrypoint.length > 0 && isAbsolute(entrypoint)) {
        let resolvedEntrypoint = entrypoint;
        try {
            resolvedEntrypoint = await realpathEntrypoint(entrypoint);
        }
        catch {
            // Keep the original path for Desktop/app.asar and other virtual entries.
        }
        if (isAbsolute(resolvedEntrypoint)) {
            addAncestors(dirname(resolvedEntrypoint));
            addResolved(resolvedEntrypoint);
        }
    }
    // Fallbacks for Electron/desktop Hosts without an absolute argv[1].
    // Running executable and global roots take priority over cwd.
    if (isAbsolute(execPath)) {
        addAncestors(dirname(execPath));
        addResolved(execPath);
    }
    for (const root of globalRoots)
        addManifest(join(root, 'node_modules', HARNESS_PACKAGE_NAME, 'package.json'));
    addManifest(join(cwd, 'node_modules', HARNESS_PACKAGE_NAME, 'package.json'));
    addResolved(join(cwd, 'package.json'));
    addResolved(cwd);
    for (const manifest of manifests) {
        const version = await readHarnessManifestVersion(manifest);
        if (version !== undefined)
            return version;
    }
    return undefined;
}
//# sourceMappingURL=harness-version.js.map