import { workspaceUploadMaxBytes } from './workspace-transfer-limits.js';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const CHUNK = 64 * 1024;
/** Reuses the dedicated connection-owned uploader, never a filesystem RPC. */
export async function uploadRemoteFile(client, sessionId, localPath, name, signal, assertCurrent) {
    let file;
    try {
        file = await open(localPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
        const handle = file;
        const before = await handle.stat();
        if (!before.isFile())
            return { status: 'rejected' };
        return await uploadWorkspaceSource(client, sessionId, name, before.size, signal, assertCurrent, async (offset, length) => {
            const buffer = Buffer.alloc(length);
            const read = await handle.read(buffer, 0, length, offset);
            return buffer.subarray(0, read.bytesRead);
        }, async () => {
            const after = await handle.stat();
            if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
                throw new Error('LOCAL_UPLOAD_FILE_CHANGED');
            }
        });
    }
    catch {
        return { status: 'rejected' };
    }
    finally {
        await file?.close();
    }
}
/** Desktop browser input already arrives as bytes. */
export async function uploadRemoteBuffer(client, sessionId, name, data, signal, assertCurrent) {
    const result = await uploadWorkspaceSource(client, sessionId, name, data.byteLength, signal, assertCurrent, (offset, size) => data.subarray(offset, offset + size));
    if (result.status === 'accepted')
        return result;
    throw new Error(result.status === 'unknown'
        ? 'The upload result is uncertain. Check the remote workspace before retrying.'
        : 'The file could not be uploaded to the selected CodeX workspace.');
}
async function uploadWorkspaceSource(client, sessionId, name, totalBytes, signal, assertCurrent, read, beforeCommit) {
    const uploadId = randomUUID();
    const scope = { sessionId, uploadId };
    let remoteOpened = false;
    let committing = false;
    const check = () => {
        signal.throwIfAborted();
        assertCurrent();
        if (totalBytes > workspaceUploadMaxBytes(client.getStats?.().mode))
            throw new Error('UPLOAD_TRANSPORT_LIMIT');
    };
    const call = async (method, params) => {
        check();
        const result = await client.rpc(method, params, signal);
        check();
        return result;
    };
    try {
        check();
        remoteOpened = true;
        const opened = z.object({ uploadId: z.literal(uploadId), chunkBytes: z.number().int().min(1).max(CHUNK) })
            .parse(await call('workspace.upload.open', { ...scope, name, totalBytes }));
        let offset = 0;
        while (offset < totalBytes) {
            check();
            const chunk = await read(offset, Math.min(opened.chunkBytes, totalBytes - offset));
            if (chunk.length === 0)
                throw new Error('LOCAL_UPLOAD_FILE_CHANGED');
            const next = offset + chunk.length;
            z.object({ uploadId: z.literal(uploadId), receivedBytes: z.literal(next) }).parse(await call('workspace.upload.chunk', { ...scope, offset, data: Buffer.from(chunk).toString('base64') }));
            offset = next;
        }
        await beforeCommit?.();
        check();
        committing = true;
        const result = z.object({ name: z.string().min(1), path: z.string().min(1), bytes: z.literal(totalBytes) })
            .parse(await call('workspace.upload.commit', scope));
        return { status: 'accepted', ...result };
    }
    catch {
        if (remoteOpened)
            await client.rpc('workspace.upload.abort', scope, AbortSignal.timeout(5_000)).catch(() => undefined);
        return { status: committing ? 'unknown' : 'rejected' };
    }
}
//# sourceMappingURL=remote-file-upload.js.map