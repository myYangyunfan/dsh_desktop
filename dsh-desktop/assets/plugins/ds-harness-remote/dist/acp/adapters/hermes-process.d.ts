import type { SafeLogger } from '../../logging.js';
import type { CursorAcpOptions, SpawnCursorAcp } from './cursor-process.js';
import { ClaudeAcpClient } from './claude-process.js';
/** Default executables on PATH; a Host may override either through `acp.backends`. */
export declare const HERMES_ACP_COMMAND = "hermes";
export declare const HERMES_ACP_ARGS: readonly ["acp"];
/**
 * Host-local Hermes Agent (`hermes acp`, `hermes-acp`, `hermes.exe acp`).
 *
 * Hermes speaks standard Agent Client Protocol over stdio: `session/new`, `session/list`
 * (per-cwd catalog), `session/load` (replays history before responding), `session/prompt`
 * with streaming `session/update` notifications, `session/cancel`, permission requests and
 * a legacy `session/set_model` catalog. Authentication is resolved from the Host's own
 * Hermes configuration, so no interactive editor login runs here — the same contract as
 * the Claude backend, which this client reuses.
 *
 * The bare `hermes` subcommand is the entry point; a Host that installed only the
 * dedicated `hermes-acp` shim configures `command: "hermes-acp"` with empty args.
 */
export declare class HermesAcpClient extends ClaudeAcpClient {
    constructor(binary?: string, logger?: SafeLogger, spawnAcp?: SpawnCursorAcp, options?: Pick<CursorAcpOptions, 'args' | 'cwd'>);
}
//# sourceMappingURL=hermes-process.d.ts.map