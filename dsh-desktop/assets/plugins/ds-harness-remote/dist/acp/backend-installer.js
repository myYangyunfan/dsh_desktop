import { execFile, execFileSync } from 'node:child_process';
import { existsSync, constants, accessSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export const BUILTIN_ACP_SPECS = Object.freeze({
    codex: Object.freeze({
        id: 'codex',
        name: 'CodeX',
        kind: 'npm_package',
        npmPackage: '@openai/codex',
        downloadUrl: 'https://github.com/openai/codex',
    }),
    cursor: Object.freeze({
        id: 'cursor',
        name: 'Cursor',
        kind: 'desktop_cli',
        downloadUrl: 'https://cursor.com',
    }),
    antigravity: Object.freeze({
        id: 'antigravity',
        name: 'Antigravity',
        kind: 'desktop_cli',
        downloadUrl: 'https://antigravity.google',
    }),
    pi: Object.freeze({
        id: 'pi',
        name: 'Pi',
        kind: 'npm_package',
        npmPackage: 'pi-acp',
        downloadUrl: 'https://www.npmjs.com/package/pi-acp',
    }),
    claude: Object.freeze({
        id: 'claude',
        name: 'Claude',
        kind: 'npm_package',
        npmPackage: '@anthropic-ai/claude-agent-acp',
        downloadUrl: 'https://www.npmjs.com/package/@anthropic-ai/claude-agent-acp',
    }),
    opencode: Object.freeze({
        id: 'opencode',
        name: 'OpenCode',
        kind: 'npm_package',
        npmPackage: 'opencode-ai',
        downloadUrl: 'https://opencode.ai',
    }),
    hermes: Object.freeze({
        id: 'hermes',
        name: 'Hermes',
        kind: 'desktop_cli',
        downloadUrl: 'https://hermes-agent.nousresearch.com',
    }),
});
export function isBuiltinAcpBackend(id) {
    return Object.prototype.hasOwnProperty.call(BUILTIN_ACP_SPECS, id);
}
/** Check that a path exists, is a regular file, and has execute permissions on POSIX. */
export function defaultCheckExecutable(candidate, platform = process.platform) {
    try {
        if (!existsSync(candidate))
            return false;
        const stat = statSync(candidate);
        if (!stat.isFile())
            return false;
        if (platform === 'win32')
            return true;
        accessSync(candidate, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
let cachedNpmPrefix;
let npmPrefixDiscovered = false;
/** Safely discover the global npm prefix once without shell, using node + npm-cli.js. */
export function discoverSystemNpmPrefix(platform = process.platform) {
    if (npmPrefixDiscovered)
        return cachedNpmPrefix;
    npmPrefixDiscovered = true;
    const npmCli = findNodeNpmCli();
    if (!npmCli)
        return undefined;
    try {
        const out = execFileSync(process.execPath, [npmCli, 'config', 'get', 'prefix'], {
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
            timeout: 3000,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });
        const trimmed = out.trim();
        if (trimmed.length > 0 && existsSync(trimmed)) {
            cachedNpmPrefix = trimmed;
            return trimmed;
        }
    }
    catch {
        // Ignore detection failures; fallback lists apply
    }
    return undefined;
}
/** Resolves candidate paths for an ACP backend on Windows / macOS / Linux. */
export function candidateBinaryPaths(id, options = {}) {
    const platform = options.platform ?? process.platform;
    const pJoin = platform === 'win32' ? win32.join : posix.join;
    const env = options.env ?? process.env;
    const home = options.homedir ?? homedir();
    const localAppData = env.LOCALAPPDATA ?? (platform === 'win32' ? pJoin(home, 'AppData', 'Local') : '');
    const appData = env.APPDATA ?? (platform === 'win32' ? pJoin(home, 'AppData', 'Roaming') : '');
    const programFiles = env.ProgramFiles ?? (platform === 'win32' ? 'C:\\Program Files' : '');
    const programFilesX86 = env['ProgramFiles(x86)'] ?? (platform === 'win32' ? 'C:\\Program Files (x86)' : '');
    const candidates = [];
    // Collect candidate npm global bin directories only when needed for npm-based backends
    const npmBackends = new Set(['codex', 'claude', 'pi', 'opencode']);
    const npmBinDirs = [];
    if (npmBackends.has(id)) {
        const resolvedPrefix = options.npmPrefix ?? discoverSystemNpmPrefix(platform);
        if (resolvedPrefix) {
            npmBinDirs.push(platform === 'win32' ? resolvedPrefix : pJoin(resolvedPrefix, 'bin'));
        }
        if (platform === 'win32') {
            if (appData)
                npmBinDirs.push(pJoin(appData, 'npm'));
            npmBinDirs.push('D:\\npm-global', 'C:\\npm-global');
        }
        else {
            npmBinDirs.push(pJoin(home, '.npm-global', 'bin'), '/usr/local/bin', '/opt/homebrew/bin');
        }
    }
    if (platform === 'win32') {
        switch (id) {
            case 'hermes':
                candidates.push('D:\\Hermes\\bin\\hermes.exe', 'C:\\Hermes\\bin\\hermes.exe', pJoin(localAppData, 'Hermes', 'bin', 'hermes.exe'), pJoin(home, '.hermes', 'bin', 'hermes.exe'), pJoin(home, 'hermes-agent', '.hermes', 'bin', 'hermes.exe'));
                break;
            case 'cursor':
                candidates.push(pJoin(localAppData, 'Programs', 'cursor', 'resources', 'app', 'bin', 'agent.cmd'), pJoin(localAppData, 'Programs', 'Cursor', 'resources', 'app', 'bin', 'agent.cmd'), pJoin(programFiles, 'Cursor', 'resources', 'app', 'bin', 'agent.cmd'), pJoin(programFilesX86, 'Cursor', 'resources', 'app', 'bin', 'agent.cmd'), 'D:\\Program Files\\Cursor\\resources\\app\\bin\\agent.cmd', 'D:\\Cursor\\resources\\app\\bin\\agent.cmd', pJoin(home, '.local', 'bin', 'agent.cmd'), pJoin(home, '.local', 'bin', 'agent.exe'));
                break;
            case 'antigravity':
                candidates.push(pJoin(localAppData, 'Programs', 'Antigravity', 'agy.exe'), pJoin(localAppData, 'antigravity', 'bin', 'agy.exe'), pJoin(programFiles, 'Antigravity', 'agy.exe'), pJoin(home, '.local', 'bin', 'agy.exe'));
                break;
            case 'codex':
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'codex.cmd'), pJoin(dir, 'codex.exe'));
                }
                break;
            case 'claude':
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'claude-agent-acp.cmd'), pJoin(dir, 'claude-agent-acp.exe'));
                }
                break;
            case 'pi':
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'pi-acp.cmd'), pJoin(dir, 'pi-acp.exe'));
                }
                break;
            case 'opencode':
                candidates.push(pJoin(home, '.opencode', 'bin', 'opencode.exe'), pJoin(localAppData, 'opencode', 'bin', 'opencode.exe'));
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'opencode.cmd'), pJoin(dir, 'opencode.exe'));
                }
                break;
        }
    }
    else {
        // macOS / Linux
        switch (id) {
            case 'codex':
                candidates.push('/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex', '/Applications/ChatGPT.app/Contents/Resources/codex', pJoin(home, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex-cli', 'codex'), pJoin(home, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex'));
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'codex'));
                }
                break;
            case 'cursor':
                candidates.push(pJoin(home, '.local', 'bin', 'agent'), '/Applications/Cursor.app/Contents/MacOS/agent', '/Applications/Cursor.app/Contents/Resources/app/bin/agent', pJoin(home, 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app', 'bin', 'agent'));
                break;
            case 'antigravity':
                candidates.push(pJoin(home, '.local', 'bin', 'agy'), '/Applications/Antigravity.app/Contents/MacOS/agy', '/Applications/Antigravity.app/Contents/Resources/bin/agy', pJoin(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'bin', 'agy'));
                break;
            case 'pi':
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'pi-acp'));
                }
                break;
            case 'claude':
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'claude-agent-acp'));
                }
                break;
            case 'opencode':
                candidates.push(pJoin(home, '.opencode', 'bin', 'opencode'), pJoin(home, '.local', 'bin', 'opencode'));
                for (const dir of npmBinDirs) {
                    candidates.push(pJoin(dir, 'opencode'));
                }
                break;
            case 'hermes':
                candidates.push(pJoin(home, '.hermes', 'bin', 'hermes'), pJoin(home, '.local', 'bin', 'hermes'), '/usr/local/bin/hermes', '/opt/homebrew/bin/hermes');
                break;
        }
    }
    // Deduplicate and filter empty
    return [...new Set(candidates.filter(p => typeof p === 'string' && p.trim().length > 0))];
}
/** Check PATH using where (Win) or which (Unix) with timeout and return full path if found. */
export function lookupSystemPath(command, platform = process.platform) {
    try {
        const probe = platform === 'win32' ? 'where' : 'which';
        const output = execFileSync(probe, [command], {
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
            timeout: 5000,
        });
        const firstLine = output.split(/\r?\n/).find(line => line.trim().length > 0);
        if (firstLine && defaultCheckExecutable(firstLine.trim(), platform)) {
            return platform === 'win32' ? win32.resolve(firstLine.trim()) : posix.resolve(firstLine.trim());
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** Scan for an existing executable binary on the system. */
export function findExistingBinary(id, options = {}) {
    const platform = options.platform ?? process.platform;
    const check = options.checkExecutable ?? (path => defaultCheckExecutable(path, platform));
    const candidates = candidateBinaryPaths(id, options);
    for (const candidate of candidates) {
        if (check(candidate)) {
            return platform === 'win32' ? win32.resolve(candidate) : posix.resolve(candidate);
        }
    }
    // Fallback to checking default command on system PATH
    const defaultCommands = {
        codex: 'codex',
        cursor: 'agent',
        antigravity: 'agy',
        pi: 'pi-acp',
        claude: 'claude-agent-acp',
        opencode: 'opencode',
        hermes: 'hermes',
    };
    const defaultCmd = defaultCommands[id] ?? id;
    const fromPath = lookupSystemPath(defaultCmd, platform);
    if (fromPath && check(fromPath)) {
        return fromPath;
    }
    return undefined;
}
/** Find the Node-bundled npm-cli.js to execute npm directly with Node without invoking any shell. */
export function findNodeNpmCli(nodeExecPath = process.execPath) {
    const nodeDir = dirname(nodeExecPath);
    const candidates = [
        join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        'D:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return undefined;
}
/**
 * High-level workflow:
 * 1. Search existing local paths for the backend. If found, return 'configured'.
 * 2. If not found and it is a desktop app (Cursor, AGY, Hermes), return 'download_required' with URL.
 * 3. If not found and it is an npm package (Claude, Pi, CodeX, OpenCode), execute silent npm install and return 'installed'.
 */
export async function installOrConfigureBackend(backendId, options = {}) {
    if (!isBuiltinAcpBackend(backendId)) {
        throw new Error('Unsupported ACP backend.');
    }
    const spec = BUILTIN_ACP_SPECS[backendId];
    // Phase 1: Check existing local binary
    const existing = findExistingBinary(backendId, options);
    if (existing) {
        return {
            action: 'configured',
            detectedCommand: existing,
            downloadUrl: spec.downloadUrl,
        };
    }
    // Phase 2: If desktop CLI without silent installer, guide user to download
    if (spec.kind === 'desktop_cli' || !spec.npmPackage) {
        return {
            action: 'download_required',
            downloadUrl: spec.downloadUrl,
        };
    }
    // Phase 3: Silent npm install for supported npm packages
    const platform = options.platform ?? process.platform;
    const timeoutMs = options.timeoutMs ?? 120_000;
    // Resolve npm execution safely: prefer Node executable + npm-cli.js directly (no shell).
    const npmCli = options.npmCliPath ?? findNodeNpmCli();
    if (!npmCli && platform === 'win32') {
        throw new Error('Node package manager (npm-cli.js) could not be located on this host.');
    }
    const fileToExec = npmCli ? process.execPath : 'npm';
    const argsToExec = npmCli
        ? [npmCli, 'install', '-g', spec.npmPackage, '--no-fund', '--no-audit']
        : ['install', '-g', spec.npmPackage, '--no-fund', '--no-audit'];
    const runner = options.execFileImpl ?? (async (file, cmdArgs, opts) => {
        return execFileAsync(file, cmdArgs, opts);
    });
    try {
        await runner(fileToExec, argsToExec, {
            timeout: timeoutMs,
            encoding: 'utf8',
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });
    }
    catch {
        // Redact local path details on error for privacy
        throw new Error(`Silent installation of ${spec.name} failed.`);
    }
    // Re-scan after install: must resolve to a valid existing binary file!
    const newlyInstalled = findExistingBinary(backendId, options);
    if (newlyInstalled) {
        return {
            action: 'installed',
            detectedCommand: newlyInstalled,
            downloadUrl: spec.downloadUrl,
        };
    }
    // Strict: do not report fake success if the binary cannot be located!
    throw new Error(`Installation of ${spec.name} completed but executable could not be verified.`);
}
//# sourceMappingURL=backend-installer.js.map