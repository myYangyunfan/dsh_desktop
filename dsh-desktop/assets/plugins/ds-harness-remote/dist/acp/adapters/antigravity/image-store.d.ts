import { type AcpImage } from '../../image-content.js';
export declare const AGY_IMAGE_ROOT: string;
export declare function prepareAgyImageDirectory(root?: string): Promise<string>;
export declare function stageAgyImages(sessionId: string, images: AcpImage[], root?: string): Promise<string[]>;
export declare function agyImagePrompt(text: string, paths: string[]): string;
export declare function stripAgyImageReferences(text: string): string;
export declare function agyImageReferences(text: string): string[];
export declare function readAgyImage(sessionId: string, path: string, root?: string): Promise<Record<string, unknown> | undefined>;
//# sourceMappingURL=image-store.d.ts.map