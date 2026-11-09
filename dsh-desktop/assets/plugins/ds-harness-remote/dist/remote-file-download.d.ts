import type { RemoteTypertGateway } from './remote-typert-gateway.js';
/** Uses only the official scoped file carrier; never returns file bytes to model context. */
export declare function downloadRemoteFile(gateway: RemoteTypertGateway, sessionId: string, path: string, signal: AbortSignal, assertCurrent: () => void, downloads?: string): Promise<{
    localPath: string;
    bytes: number;
    status: "downloaded";
}>;
//# sourceMappingURL=remote-file-download.d.ts.map