import { promises as fs, realpathSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { acpImageContent, parseAcpImage, imageByteLength } from '../../image-content.js';
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const IMAGE_NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;
const TTL = 24 * 60 * 60 * 1000;
export const AGY_IMAGE_ROOT = join(realpathSync(tmpdir()), `dsh-remote-agy-images-${process.getuid?.() ?? 'user'}`);
let stagingChain = Promise.resolve();
const sessionFolder = (sessionId) => createHash('sha256').update(sessionId).digest('hex');
async function privateDirectory(path) {
    await fs.mkdir(path, { recursive: true, mode: 0o700 });
    const info = await fs.lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(path) !== path
        || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077) !== 0)))
        throw new Error('Invalid AGY image cache directory.');
}
export async function prepareAgyImageDirectory(root = AGY_IMAGE_ROOT) {
    await privateDirectory(root);
    return root;
}
export function stageAgyImages(sessionId, images, root = AGY_IMAGE_ROOT) {
    const result = stagingChain.then(() => stageImages(sessionId, images, root));
    stagingChain = result.then(() => undefined, () => undefined);
    return result;
}
async function stageImages(sessionId, images, root) {
    await prepareAgyImageDirectory(root);
    // Only generated session directories are visited; symlinks are never followed.
    let total = 0;
    for (const entry of await fs.readdir(root)) {
        if (!/^[0-9a-f]{64}$/.test(entry))
            continue;
        const dir = join(root, entry);
        const info = await fs.lstat(dir);
        if (!info.isDirectory() || info.isSymbolicLink())
            continue;
        for (const name of await fs.readdir(dir)) {
            if (!IMAGE_NAME.test(name))
                continue;
            const path = join(dir, name);
            const file = await fs.lstat(path);
            if (!file.isFile() || file.isSymbolicLink())
                continue;
            if (Date.now() - file.mtimeMs > TTL)
                await fs.unlink(path);
            else
                total += file.size;
        }
    }
    const parsed = images.map(parseAcpImage);
    if (total + parsed.reduce((sum, image) => sum + imageByteLength(image.data), 0) > 512 * 1024 * 1024)
        throw new Error('AGY temporary image cache is full.');
    const directory = join(root, sessionFolder(sessionId));
    await privateDirectory(directory);
    const paths = [];
    try {
        for (const image of parsed) {
            const path = join(directory, `${randomUUID()}.${EXTENSIONS[image.mimeType]}`);
            await fs.writeFile(path, Buffer.from(image.data, 'base64'), { flag: 'wx', mode: 0o600 });
            paths.push(path);
        }
        return paths;
    }
    catch (error) {
        await Promise.all(paths.map(path => fs.unlink(path).catch(() => undefined)));
        throw error;
    }
}
export function agyImagePrompt(text, paths) {
    return `${text}\n<AGY_REMOTE_IMAGES>\nUser attached images. Use view_file to inspect these images before answering.\n${JSON.stringify(paths)}\n</AGY_REMOTE_IMAGES>`;
}
export function stripAgyImageReferences(text) {
    return text.replace(/\n?<AGY_REMOTE_IMAGES>[\s\S]*?<\/AGY_REMOTE_IMAGES>/g, '').trim();
}
export function agyImageReferences(text) {
    const block = /<AGY_REMOTE_IMAGES>\n[^\n]*\n([^\n]+)\n<\/AGY_REMOTE_IMAGES>/.exec(text);
    if (!block)
        return [];
    try {
        const value = JSON.parse(block[1]);
        return Array.isArray(value) && value.length <= 4 ? value.filter((path) => typeof path === 'string') : [];
    }
    catch {
        return [];
    }
}
export async function readAgyImage(sessionId, path, root = AGY_IMAGE_ROOT) {
    const name = basename(path);
    if (!IMAGE_NAME.test(name) || path !== join(root, sessionFolder(sessionId), name))
        return undefined;
    try {
        await privateDirectory(root);
        await privateDirectory(join(root, sessionFolder(sessionId)));
        const info = await fs.lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024 || Date.now() - info.mtimeMs > TTL)
            return undefined;
        const file = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
            const current = await file.stat();
            if (current.ino !== info.ino || current.dev !== info.dev || current.size !== info.size)
                return undefined;
            const mediaType = Object.entries(EXTENSIONS).find(([, ext]) => name.endsWith(`.${ext}`))?.[0];
            const image = parseAcpImage({ type: 'image', mimeType: mediaType, data: (await file.readFile()).toString('base64') });
            return acpImageContent(image, `agy-image:${name}`);
        }
        finally {
            await file.close();
        }
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=image-store.js.map