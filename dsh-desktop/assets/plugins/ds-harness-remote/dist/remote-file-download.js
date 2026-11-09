import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
const MAX_BYTES = 50 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;
const identity = z.object({ absolutePath: z.string().min(1), version: z.string().min(1), bytes: z.number().int().min(0).max(MAX_BYTES) });
const chunkSchema = identity.extend({ offset: z.number().int().min(0), data: z.instanceof(Uint8Array), eof: z.boolean() });
/** Uses only the official scoped file carrier; never returns file bytes to model context. */
export async function downloadRemoteFile(gateway, sessionId, path, signal, assertCurrent, downloads = join(homedir(), 'Downloads')) {
    const call = async (method, extra = {}) => {
        signal.throwIfAborted();
        const result = await gateway.invoke({ namespace: 'workspaceFiles', method,
            args: { workspaceFileScopeId: sessionId, path, ...extra }, signal });
        signal.throwIfAborted();
        assertCurrent();
        return result;
    };
    const before = identity.parse(await call('stat'));
    await mkdir(downloads, { recursive: true });
    const directory = await mkdtemp(join(downloads, 'dsh-remote-'));
    // Remote names are labels, never local path authority (including Windows names).
    const name = (path.split(/[\\/]/).at(-1) ?? '').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120);
    const localPath = join(directory, !name || name === '.' || name === '..' ? 'download' : name);
    try {
        const file = await open(localPath, 'wx', 0o600);
        try {
            let offset = 0;
            for (;;) {
                const length = Math.min(CHUNK_BYTES, Math.max(1, before.bytes - offset));
                const chunk = chunkSchema.parse(await call('readBytes', { range: { offset, length } }));
                if (chunk.absolutePath !== before.absolutePath || chunk.version !== before.version || chunk.bytes !== before.bytes
                    || chunk.offset !== offset || chunk.data.length > length || offset + chunk.data.length > before.bytes
                    || (chunk.eof ? offset + chunk.data.length !== before.bytes : chunk.data.length === 0)) {
                    throw new Error('REMOTE_FILE_CHANGED_OR_INVALID_CHUNK');
                }
                await file.writeFile(chunk.data);
                offset += chunk.data.length;
                if (chunk.eof)
                    break;
            }
            const after = identity.parse(await call('stat'));
            if (after.absolutePath !== before.absolutePath || after.version !== before.version || after.bytes !== before.bytes) {
                throw new Error('REMOTE_FILE_CHANGED');
            }
            signal.throwIfAborted();
            assertCurrent();
        }
        finally {
            await file.close();
        }
        signal.throwIfAborted();
        assertCurrent();
        return { localPath, bytes: before.bytes, status: 'downloaded' };
    }
    catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
}
//# sourceMappingURL=remote-file-download.js.map