import { OpencodeAcpClient } from './opencode-process.js';
import { adaptCursorProcess } from '../adapter.js';
/** OpenCode ACP backend: OpenCode CLI `opencode acp` over Host stdio. */
export function createOpencodeAcpAdapter(binary = 'opencode', logger, createProcess = (path, targetLogger) => (new OpencodeAcpClient(path, targetLogger))) {
    return adaptCursorProcess(createProcess(binary, logger), 'opencode');
}
export { OpencodeAcpClient, OpencodeAcpError } from './opencode-process.js';
//# sourceMappingURL=opencode.js.map