export interface RemoteFileContentMeta {
    name: string;
    size: number;
    mime?: string;
    mtimeMs?: number;
    isDirectory?: boolean;
}
export interface RemoteFileContentEntry extends RemoteFileContentMeta {
    locator: string;
}
export interface RemoteFileReadRequest {
    offset: number;
    length: number;
    signal: AbortSignal;
}
export interface RemoteFileContentProvider {
    id: string;
    priority: number;
    supports(locator: string): boolean;
    stat(locator: string, signal: AbortSignal): Promise<RemoteFileContentMeta | undefined>;
    read(locator: string, request: RemoteFileReadRequest): Promise<Uint8Array>;
    list(locator: string, signal: AbortSignal): Promise<RemoteFileContentEntry[]>;
    openExternal?: (locator: string, signal: AbortSignal) => Promise<void>;
    saveAsAllowed?: (locator: string) => boolean | {
        allowed: boolean;
        maxBytes?: number;
    };
}
export type RemoteFileControlCall = <T>(endpoint: 'fileviewer.stat' | 'fileviewer.readRange' | 'fileviewer.list', payload: Record<string, unknown>, signal?: AbortSignal) => Promise<T>;
export interface RemoteFileViewerStatus {
    mode: 'local' | 'remote';
    transport?: 'LAN' | 'P2P' | 'TURN' | 'Relay' | 'Disconnected';
    remoteFeatures?: {
        fileViewer: boolean;
    };
}
/** Fail closed for legacy/unknown Hosts that predate remote file-viewer support. */
export declare function shouldUseRemoteFileViewer(status: RemoteFileViewerStatus): boolean;
export declare const REMOTE_FILE_SAVE_AS_MAX_BYTES: number;
export declare const REMOTE_FILE_FAST_SAVE_AS_MAX_BYTES: number;
export declare function shouldAllowRemoteFileSaveAs(status: RemoteFileViewerStatus): boolean;
export declare function remoteFileSaveAsMaxBytes(status: RemoteFileViewerStatus): number;
/** Browser-side provider registered into dsh-file-viewer's `fileViewer` service. */
export declare function createRemoteFileContentProvider(call: RemoteFileControlCall, options?: {
    saveAsAllowed?: boolean | (() => boolean);
    saveAsMaxBytes?: number | (() => number);
}): RemoteFileContentProvider;
//# sourceMappingURL=remote-file-content-provider.d.ts.map