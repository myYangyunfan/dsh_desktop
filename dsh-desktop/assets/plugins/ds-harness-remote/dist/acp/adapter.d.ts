import type { CursorAcpInbound, CursorAcpLike } from './adapters/cursor-process.js';
/**
 * Backend adapter contract for the Host Agent ACP gateway (#65).
 * Public Remote methods stay backend-neutral; adapters own runtime mapping.
 */
export type AcpBackendId = 'cursor' | 'antigravity' | 'opencode' | (string & {});
export interface AcpBackendAdapter {
    readonly id: AcpBackendId;
    start(): Promise<void>;
    close(): Promise<void>;
    isReady(): boolean;
    call(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
    respond(id: string | number, result: unknown): Promise<void>;
    respondError(id: string | number, code: number, message: string): Promise<void>;
    onInbound(handler: (message: CursorAcpInbound) => void): () => void;
    onUnavailable(handler: (code: string) => void): () => void;
}
export declare function adaptCursorProcess(process: CursorAcpLike, id?: AcpBackendId): AcpBackendAdapter;
//# sourceMappingURL=adapter.d.ts.map