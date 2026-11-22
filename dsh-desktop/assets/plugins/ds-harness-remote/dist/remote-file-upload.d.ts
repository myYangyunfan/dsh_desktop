import type { RemoteClientCore } from '@dsh-remote/client-core';
type UploadClient = Pick<RemoteClientCore, 'rpc'> & Partial<Pick<RemoteClientCore, 'getStats'>>;
type UploadOutcome = {
    status: 'accepted';
    name: string;
    path: string;
    bytes: number;
} | {
    status: 'rejected' | 'unknown';
};
/** Reuses the dedicated connection-owned uploader, never a filesystem RPC. */
export declare function uploadRemoteFile(client: UploadClient, sessionId: string, localPath: string, name: string, signal: AbortSignal, assertCurrent: () => void): Promise<UploadOutcome>;
/** Desktop browser input already arrives as bytes. */
export declare function uploadRemoteBuffer(client: UploadClient, sessionId: string, name: string, data: Uint8Array, signal: AbortSignal, assertCurrent: () => void): Promise<{
    status: "accepted";
    name: string;
    path: string;
    bytes: number;
}>;
export {};
//# sourceMappingURL=remote-file-upload.d.ts.map