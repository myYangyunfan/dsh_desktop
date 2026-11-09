import { MAX_REMOTE_DIRECTORY_ENTRIES, MAX_REMOTE_FILE_LOCATOR_CHARS, REMOTE_FILE_CHUNK_BYTES, type RemoteFileViewerEndpoint } from './file-viewer-contract.js';
import type { SafeLogger } from './logging.js';
export { MAX_REMOTE_DIRECTORY_ENTRIES, MAX_REMOTE_FILE_LOCATOR_CHARS, REMOTE_FILE_CHUNK_BYTES, };
export type { RemoteFileViewerEndpoint };
export interface FileViewerHostResult {
    ok: boolean;
    value?: unknown;
    error?: {
        code?: string;
        message?: string;
    };
}
export interface FileViewerHostServiceLike {
    handle(endpoint: string, payload: unknown, signal: AbortSignal): Promise<unknown>;
}
export interface RemoteFileViewerCallParams {
    endpoint: RemoteFileViewerEndpoint;
    payload: unknown;
}
/**
 * Adapts dsh-file-viewer's bounded Host service to the authenticated Remote
 * business channel. Only preview-safe read operations are reachable here.
 */
export declare class RemoteFileViewerBridge {
    private readonly service;
    private readonly logger?;
    constructor(service: () => FileViewerHostServiceLike | undefined, logger?: SafeLogger | undefined);
    call(input: unknown): Promise<unknown>;
}
//# sourceMappingURL=file-viewer-bridge.d.ts.map