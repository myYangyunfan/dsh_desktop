import { execFileCommand } from '../windows-spawn.js';
import { ClaudeAcpClient } from './claude-process.js';
const NEGATIVE_CACHE_TTL_MS = 30_000;
const NATIVE_PROBE_TIMEOUT_MS = 5_000;
const nativeAcpSupportCache = new Map();
/**
 * Check whether the installed Antigravity CLI supports `agy acp`.
 * Positive results are cached for the process lifetime; negative probes expire
 * after a short TTL so an in-place AGY CLI upgrade is picked up without restart.
 */
export function supportsAntigravityNativeAcp(binary = 'agy') {
    const key = binary.trim() || 'agy';
    const cached = nativeAcpSupportCache.get(key);
    if (cached && (cached.expiresAt === undefined || cached.expiresAt > Date.now())) {
        return cached.promise;
    }
    const entry = {
        promise: execFileCommand(key, ['acp', '--help'], {
            timeout: NATIVE_PROBE_TIMEOUT_MS,
            windowsHide: true,
        }).then(() => true, () => {
            entry.expiresAt = Date.now() + NEGATIVE_CACHE_TTL_MS;
            return false;
        }),
    };
    nativeAcpSupportCache.set(key, entry);
    return entry.promise;
}
export function isLegacyAntigravityStreamJsonArgs(args) {
    if (!args || args.length === 0)
        return false;
    return args.includes('--input-format') || args.includes('stream-json');
}
/**
 * Native Antigravity ACP stdio client (`agy acp`).
 * Uses standard JSON-RPC ACP (`session/list`, `session/load`, `session/new`,
 * `session/prompt` with image blocks, `session/set_mode`, `session/set_config_option`,
 * `usage_update`, `available_commands_update`, and `session/cancel` notifications).
 */
export class AntigravityNativeAcpClient extends ClaudeAcpClient {
    constructor(binary = 'agy', logger, spawnAcp, options = {}) {
        super(binary, logger, spawnAcp, {
            ...options,
            args: options.args && options.args.length > 0 && !isLegacyAntigravityStreamJsonArgs(options.args)
                ? options.args
                : ['acp'],
        }, 'antigravity');
    }
}
//# sourceMappingURL=antigravity-acp.js.map