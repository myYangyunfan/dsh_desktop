import { REMOTE_FILE_CHUNK_BYTES } from './file-viewer-contract.js';
/** Fail closed for legacy/unknown Hosts that predate remote file-viewer support. */
export function shouldUseRemoteFileViewer(status) {
    return status.mode === 'remote' && status.remoteFeatures?.fileViewer === true;
}
export const REMOTE_FILE_SAVE_AS_MAX_BYTES = 100 * 1024 * 1024;
export const REMOTE_FILE_FAST_SAVE_AS_MAX_BYTES = 1024 * 1024 * 1024;
export function shouldAllowRemoteFileSaveAs(status) {
    return shouldUseRemoteFileViewer(status) && (status.transport === 'LAN' || status.transport === 'P2P' || status.transport === 'TURN');
}
export function remoteFileSaveAsMaxBytes(status) {
    return status.transport === 'LAN' || status.transport === 'P2P'
        ? REMOTE_FILE_FAST_SAVE_AS_MAX_BYTES
        : REMOTE_FILE_SAVE_AS_MAX_BYTES;
}
/** Browser-side provider registered into dsh-file-viewer's `fileViewer` service. */
export function createRemoteFileContentProvider(call, options = {}) {
    return {
        id: 'dsh-remote-files',
        priority: 10_000,
        supports: () => true,
        saveAsAllowed: () => ({
            allowed: currentSaveAsAllowed(options.saveAsAllowed),
            maxBytes: currentSaveAsMaxBytes(options.saveAsMaxBytes),
        }),
        async stat(locator, signal) {
            const value = await call('fileviewer.stat', { path: locator }, signal);
            if (!value.exists)
                return undefined;
            return {
                name: value.name,
                size: value.isDirectory ? 0 : value.size,
                mime: value.mime,
                mtimeMs: value.mtimeMs,
                isDirectory: value.isDirectory,
            };
        },
        async read(locator, request) {
            if (!Number.isInteger(request.offset) || request.offset < 0)
                throw new Error('A non-negative integer offset is required.');
            if (!Number.isInteger(request.length) || request.length <= 0)
                throw new Error('A positive integer length is required.');
            const chunks = [];
            let received = 0;
            while (received < request.length) {
                request.signal.throwIfAborted();
                const length = Math.min(REMOTE_FILE_CHUNK_BYTES, request.length - received);
                const offset = request.offset + received;
                const range = await call('fileviewer.readRange', { path: locator, offset, length }, request.signal);
                if (range.offset !== offset)
                    throw new Error('The Remote Host returned a mismatched file range.');
                const bytes = decodeBase64(range.data);
                if (bytes.byteLength > length)
                    throw new Error('The Remote Host returned more file bytes than requested.');
                chunks.push(bytes);
                received += bytes.byteLength;
                if (range.eof || bytes.byteLength === 0)
                    break;
            }
            const merged = new Uint8Array(received);
            let cursor = 0;
            for (const chunk of chunks) {
                merged.set(chunk, cursor);
                cursor += chunk.byteLength;
            }
            return merged;
        },
        async list(locator, signal) {
            const value = await call('fileviewer.list', { path: locator }, signal);
            return value.entries.map(entry => ({
                locator: entry.path,
                name: entry.name,
                size: entry.isDirectory ? 0 : (entry.size ?? 0),
                mtimeMs: entry.mtimeMs,
                isDirectory: entry.isDirectory,
            }));
        },
    };
}
function currentSaveAsAllowed(value) {
    return typeof value === 'function' ? value() : value === true;
}
function currentSaveAsMaxBytes(value) {
    return typeof value === 'function' ? value() : value ?? REMOTE_FILE_SAVE_AS_MAX_BYTES;
}
function decodeBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
    return bytes;
}
//# sourceMappingURL=remote-file-content-provider.js.map