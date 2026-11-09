import type { RemoteClientCore } from '@dsh-remote/client-core';
/** Reuses the dedicated connection-owned uploader, never a filesystem RPC. */
export declare function uploadRemoteFile(client: Pick<RemoteClientCore, 'rpc'> & Partial<Pick<RemoteClientCore, 'getStats'>>, sessionId: string, localPath: string, name: string, signal: AbortSignal, assertCurrent: () => void): Promise<{
    name: string;
    path: string;
    bytes: number;
    status: "accepted";
} | {
    status: "unknown" | "rejected";
}>;
//# sourceMappingURL=remote-file-upload.d.ts.map