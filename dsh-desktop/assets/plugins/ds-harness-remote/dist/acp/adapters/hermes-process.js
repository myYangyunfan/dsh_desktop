import { ClaudeAcpClient } from './claude-process.js';
/** Default executables on PATH; a Host may override either through `acp.backends`. */
export const HERMES_ACP_COMMAND = 'hermes';
export const HERMES_ACP_ARGS = ['acp'];
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
export class HermesAcpClient extends ClaudeAcpClient {
    constructor(binary = HERMES_ACP_COMMAND, logger, spawnAcp, options = {}) {
        super(binary, logger, spawnAcp, { ...options, args: options.args ?? [...HERMES_ACP_ARGS] }, 'hermes');
    }
}
//# sourceMappingURL=hermes-process.js.map