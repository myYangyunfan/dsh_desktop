/** Browser-safe ACP image validation and native Session attachment projection. */
export declare const AGY_IMAGE_MEDIA_TYPES: readonly ["image/png", "image/jpeg", "image/webp", "image/gif"];
export declare const AGY_MAX_IMAGE_BYTES: number;
export declare const AGY_MAX_IMAGES = 4;
export declare const AGY_MAX_MESSAGE_IMAGE_BYTES: number;
export interface AcpImage {
    type: 'image';
    mimeType: string;
    data: string;
}
export declare function parseAcpImage(value: unknown): AcpImage;
export declare function imageByteLength(data: string): number;
export declare function imageDimensions(mediaType: string, data: string): {
    width: number;
    height: number;
} | undefined;
export declare function acpImageContent(image: AcpImage, attachmentId: string): Record<string, unknown>;
export declare function acpImageLimits(backend: string): Record<string, unknown>;
//# sourceMappingURL=image-content.d.ts.map