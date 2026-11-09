import type { SafeLogger } from '../../logging.js';
import { type CursorAcpLike } from './cursor-process.js';
import { type AcpBackendAdapter } from '../adapter.js';
/** First external ACP backend (#65): Cursor CLI `agent acp` over Host stdio. */
export declare function createCursorAcpAdapter(binary: string, logger?: SafeLogger, createProcess?: (binary: string, logger?: SafeLogger) => CursorAcpLike): AcpBackendAdapter;
export { CursorAcpClient, CursorAcpError } from './cursor-process.js';
export type { CursorAcpInbound, CursorAcpLike, CursorAcpNotification, CursorAcpRequest, SpawnCursorAcp, } from './cursor-process.js';
//# sourceMappingURL=cursor.d.ts.map