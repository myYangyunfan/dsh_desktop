type JsonRecord = Record<string, unknown>;
export declare function toolOutputImageBlocks(item: JsonRecord): JsonRecord[];
export declare function contentBlocks(value: unknown, attachmentSeed: string): JsonRecord[];
export declare function collectImageBlocks(value: unknown, output?: JsonRecord[]): JsonRecord[];
export declare function isCanonicalBase64(value: string): boolean;
export {};
//# sourceMappingURL=codex-image-codec.d.ts.map