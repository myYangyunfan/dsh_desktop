import type { SafeLogger } from '../../logging.js';
import { ClaudeAcpClient } from './claude-process.js';
import type { CursorAcpOptions, SpawnCursorAcp } from './cursor-process.js';
/**
 * Check whether the installed Antigravity CLI supports `agy acp`.
 * Positive results are cached for the process lifetime; negative probes expire
 * after a short TTL so an in-place AGY CLI upgrade is picked up without restart.
 */
export declare function supportsAntigravityNativeAcp(binary?: string): Promise<boolean>;
export declare function isLegacyAntigravityStreamJsonArgs(args: readonly string[] | undefined): boolean;
/**
 * Native Antigravity ACP stdio client (`agy acp`).
 * Uses standard JSON-RPC ACP (`session/list`, `session/load`, `session/new`,
 * `session/prompt` with image blocks, `session/set_mode`, `session/set_config_option`,
 * `usage_update`, `available_commands_update`, and `session/cancel` notifications).
 */
export declare class AntigravityNativeAcpClient extends ClaudeAcpClient {
    constructor(binary?: string, logger?: SafeLogger, spawnAcp?: SpawnCursorAcp, options?: Pick<CursorAcpOptions, 'args' | 'cwd'>);
}
//# sourceMappingURL=antigravity-acp.d.ts.map