import type { SafeLogger } from '../../logging.js';
import { type AcpBackendAdapter } from '../adapter.js';
import type { CursorAcpLike } from './cursor-process.js';
/** Antigravity ACP backend: Antigravity CLI `agy --input-format stream-json --output-format stream-json` over Host stdio. */
export declare function createAntigravityAcpAdapter(binary?: string, logger?: SafeLogger, createProcess?: (binary: string, logger?: SafeLogger) => CursorAcpLike): AcpBackendAdapter;
export { AntigravityAcpClient, AntigravityAcpError } from './antigravity-process.js';
export * from './antigravity/index.js';
//# sourceMappingURL=antigravity.d.ts.map