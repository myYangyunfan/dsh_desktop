import { AntigravityAcpClient } from './antigravity-process.js';
import { adaptCursorProcess } from '../adapter.js';
/** Antigravity ACP backend: Antigravity CLI `agy --input-format stream-json --output-format stream-json` over Host stdio. */
export function createAntigravityAcpAdapter(binary = 'agy', logger, createProcess = (path, targetLogger) => (new AntigravityAcpClient(path, targetLogger))) {
    return adaptCursorProcess(createProcess(binary, logger), 'antigravity');
}
export { AntigravityAcpClient, AntigravityAcpError } from './antigravity-process.js';
export { AntigravityNativeAcpClient, isLegacyAntigravityStreamJsonArgs, supportsAntigravityNativeAcp } from './antigravity-acp.js';
export * from './antigravity/index.js';
//# sourceMappingURL=antigravity.js.map