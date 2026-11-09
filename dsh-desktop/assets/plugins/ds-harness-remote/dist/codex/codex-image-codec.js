const CODEX_IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const CODEX_IMAGE_ATTACHMENT_PREFIX = 'codex-image:';
const MAX_CODEX_IMAGE_BASE64 = 288 * 1024 * 1024;
const DATA_IMAGE_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/u;
function string(value) {
    return typeof value === 'string' ? value : undefined;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function record(value) {
    return isRecord(value) ? value : {};
}
export function toolOutputImageBlocks(item) {
    const candidates = [
        record(item.result).content,
        record(item.output).content,
        item.contentItems,
        Array.isArray(item.output) ? item.output : undefined,
    ];
    for (const candidate of candidates) {
        if (!Array.isArray(candidate))
            continue;
        const images = candidate.flatMap(value => {
            const block = record(value);
            return isImageContent(block) && parseImageBlock(block) !== undefined ? [block] : [];
        });
        if (images.length > 0)
            return images;
    }
    return [];
}
export function contentBlocks(value, attachmentSeed) {
    if (typeof value === 'string')
        return [{ type: 'text', text: value }];
    if (!Array.isArray(value))
        return [];
    const blocks = [];
    let imageIndex = 0;
    for (const raw of value) {
        if (typeof raw === 'string') {
            blocks.push({ type: 'text', text: raw });
            continue;
        }
        const block = record(raw);
        const image = imageContentBlock(block, attachmentSeed, imageIndex);
        if (image !== undefined) {
            imageIndex += 1;
            blocks.push(image);
            continue;
        }
        const text = string(block.text) ?? string(block.content);
        if (text !== undefined)
            blocks.push({ type: block.type === 'reasoning' ? 'reasoning' : 'text', text });
    }
    return blocks;
}
function imageContentBlock(block, attachmentSeed, index) {
    if (!isImageContent(block))
        return undefined;
    const image = parseImageBlock(block);
    if (image === undefined)
        return undefined;
    const dimensions = imageDimensions(image.mediaType, image.data);
    const name = string(block.name);
    const attachment = {
        attachmentId: `${CODEX_IMAGE_ATTACHMENT_PREFIX}${hashString(`${attachmentSeed}:${index}`)}:${index}`,
        mediaType: image.mediaType,
        bytes: base64ByteLength(image.data),
        width: dimensions.width,
        height: dimensions.height,
        ...(name === undefined ? {} : { name }),
    };
    return {
        type: 'image',
        attachment,
        mediaType: image.mediaType,
        data: image.data,
        url: image.url,
        ...(name === undefined ? {} : { name }),
    };
}
function isImageContent(block) {
    return block.type === 'image' || block.type === 'input_image';
}
function parseImageBlock(block) {
    const url = string(block.url)
        ?? string(block.image_url)
        ?? string(record(block.image_url).url);
    const parsed = url === undefined ? undefined : parseDataImageUrl(url);
    if (parsed !== undefined)
        return parsed;
    const data = string(block.data);
    if (data === undefined || !isCanonicalBase64(data))
        return undefined;
    if (data.length > MAX_CODEX_IMAGE_BASE64)
        return undefined;
    const mediaType = string(block.mediaType) ?? string(block.mimeType) ?? sniffImageMediaType(data);
    return mediaType !== undefined && CODEX_IMAGE_MEDIA_TYPES.has(mediaType)
        ? { mediaType, data, url: `data:${mediaType};base64,${data}` }
        : undefined;
}
function parseDataImageUrl(value) {
    const match = DATA_IMAGE_URL.exec(value);
    if (match === null)
        return undefined;
    const mediaType = match[1];
    const data = match[2];
    if (!CODEX_IMAGE_MEDIA_TYPES.has(mediaType) || !isCanonicalBase64(data))
        return undefined;
    return { mediaType, data, url: `data:${mediaType};base64,${data}` };
}
export function collectImageBlocks(value, output = []) {
    if (Array.isArray(value)) {
        for (const item of value)
            collectImageBlocks(item, output);
        return output;
    }
    if (!isRecord(value))
        return output;
    if (value.type === 'image')
        output.push(value);
    for (const [key, child] of Object.entries(value)) {
        if (key === 'attachment')
            continue;
        if (key === 'content' || key === 'message' || key === 'inserted' || key === 'chunk' || key === 'block') {
            collectImageBlocks(child, output);
        }
    }
    return output;
}
function base64ByteLength(value) {
    const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
    return Math.max(1, Math.floor(value.length * 3 / 4) - padding);
}
function imageDimensions(mediaType, data) {
    const bytes = base64PrefixBytes(data, 256 * 1024);
    const parsed = mediaType === 'image/png'
        ? pngDimensions(bytes)
        : mediaType === 'image/jpeg'
            ? jpegDimensions(bytes)
            : mediaType === 'image/gif'
                ? gifDimensions(bytes)
                : mediaType === 'image/webp'
                    ? webpDimensions(bytes)
                    : undefined;
    return parsed ?? { width: 1, height: 1 };
}
function pngDimensions(bytes) {
    if (bytes.length < 24
        || bytes[0] !== 0x89
        || bytes[1] !== 0x50
        || bytes[2] !== 0x4e
        || bytes[3] !== 0x47
        || bytes[4] !== 0x0d
        || bytes[5] !== 0x0a
        || bytes[6] !== 0x1a
        || bytes[7] !== 0x0a)
        return undefined;
    return positiveDimensions(readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}
function jpegDimensions(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
        return undefined;
    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = bytes[offset + 1];
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9)
            continue;
        if (offset + 2 > bytes.length)
            return undefined;
        const length = readUint16BE(bytes, offset);
        if (length < 2 || offset + length > bytes.length)
            return undefined;
        if (isJpegSof(marker) && length >= 7) {
            return positiveDimensions(readUint16BE(bytes, offset + 5), readUint16BE(bytes, offset + 3));
        }
        offset += length;
    }
    return undefined;
}
function gifDimensions(bytes) {
    if (bytes.length < 10
        || bytes[0] !== 0x47
        || bytes[1] !== 0x49
        || bytes[2] !== 0x46
        || bytes[3] !== 0x38
        || (bytes[4] !== 0x37 && bytes[4] !== 0x39)
        || bytes[5] !== 0x61)
        return undefined;
    return positiveDimensions(readUint16LE(bytes, 6), readUint16LE(bytes, 8));
}
function webpDimensions(bytes) {
    if (bytes.length < 30
        || stringFromBytes(bytes, 0, 4) !== 'RIFF'
        || stringFromBytes(bytes, 8, 12) !== 'WEBP')
        return undefined;
    const chunk = stringFromBytes(bytes, 12, 16);
    if (chunk === 'VP8X') {
        return positiveDimensions(1 + readUint24LE(bytes, 24), 1 + readUint24LE(bytes, 27));
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
        const b0 = bytes[21];
        const b1 = bytes[22];
        const b2 = bytes[23];
        const b3 = bytes[24];
        const width = 1 + b0 + ((b1 & 0x3f) << 8);
        const height = 1 + ((b1 & 0xc0) >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10);
        return positiveDimensions(width, height);
    }
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        return positiveDimensions(readUint16LE(bytes, 26) & 0x3fff, readUint16LE(bytes, 28) & 0x3fff);
    }
    return undefined;
}
function sniffImageMediaType(data) {
    const bytes = base64PrefixBytes(data, 32);
    if (pngDimensions(bytes) !== undefined)
        return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'image/jpeg';
    if (gifDimensions(bytes) !== undefined)
        return 'image/gif';
    if (bytes.length >= 12 && stringFromBytes(bytes, 0, 4) === 'RIFF' && stringFromBytes(bytes, 8, 12) === 'WEBP')
        return 'image/webp';
    return undefined;
}
function base64PrefixBytes(value, maxBytes) {
    const chars = value.slice(0, Math.ceil(maxBytes / 3) * 4);
    let binary;
    try {
        binary = atob(chars);
    }
    catch {
        return new Uint8Array();
    }
    const bytes = new Uint8Array(Math.min(binary.length, maxBytes));
    for (let index = 0; index < bytes.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
    return bytes;
}
function readUint16BE(bytes, offset) {
    return (bytes[offset] << 8) + bytes[offset + 1];
}
function readUint16LE(bytes, offset) {
    return bytes[offset] + (bytes[offset + 1] << 8);
}
function readUint24LE(bytes, offset) {
    return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}
function readUint32BE(bytes, offset) {
    return (bytes[offset] * 0x1000000) + (bytes[offset + 1] * 0x10000) + (bytes[offset + 2] * 0x100) + bytes[offset + 3];
}
function positiveDimensions(width, height) {
    return width > 0 && height > 0 ? { width, height } : undefined;
}
function isJpegSof(marker) {
    return (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf);
}
function stringFromBytes(bytes, start, end) {
    if (bytes.length < end)
        return '';
    let output = '';
    for (let index = start; index < end; index += 1)
        output += String.fromCharCode(bytes[index]);
    return output;
}
export function isCanonicalBase64(value) {
    return value.length >= 4 && value.length % 4 === 0
        && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value);
}
function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
//# sourceMappingURL=codex-image-codec.js.map