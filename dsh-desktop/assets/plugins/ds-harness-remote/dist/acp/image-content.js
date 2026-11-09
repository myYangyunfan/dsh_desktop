/** Browser-safe ACP image validation and native Session attachment projection. */
export const AGY_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const AGY_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const AGY_MAX_IMAGES = 4;
export const AGY_MAX_MESSAGE_IMAGE_BYTES = 32 * 1024 * 1024;
export function parseAcpImage(value) {
    const image = value;
    const mimeType = image?.mimeType ?? image?.mediaType;
    const data = image?.data;
    if (image?.type !== 'image' || typeof mimeType !== 'string' || !AGY_IMAGE_MEDIA_TYPES.includes(mimeType)
        || typeof data !== 'string' || data.length === 0 || data.length > Math.ceil(AGY_MAX_IMAGE_BYTES / 3) * 4
        || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
        throw new Error('Invalid AGY image attachment.');
    const tail = data.slice(-4);
    if (btoa(atob(tail)) !== tail)
        throw new Error('Invalid AGY image base64.');
    const bytes = imageByteLength(data);
    if (bytes > AGY_MAX_IMAGE_BYTES)
        throw new Error('AGY image attachment exceeds the size limit.');
    const dimensions = imageDimensions(mimeType, data);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 8192 || dimensions.height > 8192
        || dimensions.width * dimensions.height > 40_000_000)
        throw new Error('Invalid AGY image dimensions or media type.');
    return { type: 'image', mimeType, data };
}
export function imageByteLength(data) {
    return data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
}
export function imageDimensions(mediaType, data) {
    const bytes = Uint8Array.from(atob(data.slice(0, Math.min(data.length, 256 * 1024))), char => char.charCodeAt(0));
    const be16 = (i) => bytes[i] * 256 + bytes[i + 1];
    const be32 = (i) => (bytes[i] * 0x1000000 + bytes[i + 1] * 0x10000 + bytes[i + 2] * 256 + bytes[i + 3]) >>> 0;
    const le16 = (i) => bytes[i] + bytes[i + 1] * 256;
    const le24 = (i) => bytes[i] + bytes[i + 1] * 256 + bytes[i + 2] * 65536;
    const text = (i, n) => String.fromCharCode(...bytes.slice(i, i + n));
    if (mediaType === 'image/png' && bytes.length >= 24 && text(1, 3) === 'PNG' && bytes[0] === 137 && text(12, 4) === 'IHDR')
        return { width: be32(16), height: be32(20) };
    if (mediaType === 'image/gif' && bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(text(0, 6)))
        return { width: le16(6), height: le16(8) };
    if (mediaType === 'image/webp' && bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
        if (text(12, 4) === 'VP8X')
            return { width: le24(24) + 1, height: le24(27) + 1 };
        if (text(12, 4) === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
            return { width: le16(26) & 16383, height: le16(28) & 16383 };
        if (text(12, 4) === 'VP8L' && bytes[20] === 47)
            return { width: 1 + bytes[21] + ((bytes[22] & 63) << 8), height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10) };
    }
    if (mediaType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
        for (let i = 2; i + 8 < bytes.length;) {
            if (bytes[i] !== 255) {
                i++;
                continue;
            }
            const marker = bytes[i + 1];
            i += 2;
            if (marker === 216 || marker === 217)
                continue;
            const length = be16(i);
            if (length < 2 || i + length > bytes.length)
                break;
            if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
                return { width: be16(i + 5), height: be16(i + 3) };
            i += length;
        }
    }
    return undefined;
}
export function acpImageContent(image, attachmentId) {
    const dimensions = imageDimensions(image.mimeType, image.data);
    return { type: 'image', attachment: { attachmentId, mediaType: image.mimeType, bytes: imageByteLength(image.data), ...dimensions }, mediaType: image.mimeType, data: image.data };
}
export function acpImageLimits(backend) {
    return backend === 'antigravity' ? { maxImageBytes: AGY_MAX_IMAGE_BYTES, maxImagesPerMessage: AGY_MAX_IMAGES, maxMessageImageBytes: AGY_MAX_MESSAGE_IMAGE_BYTES, maxImagePixels: 40_000_000, maxImageDimension: 8192, mediaTypes: [...AGY_IMAGE_MEDIA_TYPES] }
        : { maxImageBytes: 0, maxImagesPerMessage: 0, mediaTypes: [] };
}
//# sourceMappingURL=image-content.js.map