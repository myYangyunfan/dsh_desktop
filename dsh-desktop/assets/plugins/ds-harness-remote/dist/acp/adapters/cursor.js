import { CursorAcpClient } from './cursor-process.js';
import { adaptCursorProcess } from '../adapter.js';
/** First external ACP backend (#65): Cursor CLI `agent acp` over Host stdio. */
export function createCursorAcpAdapter(binary, logger, createProcess = (path, targetLogger) => (new CursorAcpClient(path, targetLogger))) {
    return adaptCursorProcess(createProcess(binary, logger));
}
export { CursorAcpClient, CursorAcpError } from './cursor-process.js';
//# sourceMappingURL=cursor.js.map