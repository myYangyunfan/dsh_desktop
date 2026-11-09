import type { SafeLogger } from '../../logging.js';
import { type AcpBackendAdapter } from '../adapter.js';
import type { CursorAcpLike } from './cursor-process.js';
/** OpenCode ACP backend: OpenCode CLI `opencode acp` over Host stdio. */
export declare function createOpencodeAcpAdapter(binary?: string, logger?: SafeLogger, createProcess?: (binary: string, logger?: SafeLogger) => CursorAcpLike): AcpBackendAdapter;
export { OpencodeAcpClient, OpencodeAcpError } from './opencode-process.js';
export type { OpencodeAcpInbound, OpencodeAcpLike, OpencodeAcpNotification, OpencodeAcpRequest, SpawnOpencodeAcp, } from './opencode-process.js';
//# sourceMappingURL=opencode.d.ts.map