export interface AgySelection {
    provider: 'antigravity';
    model: string;
    reasoningEffort?: string;
}
interface Model {
    id: string;
    name: string;
    reasoning?: {
        efforts: Array<{
            id: string;
            name: string;
        }>;
        defaultEffort?: string;
    };
}
export interface AgyCatalog {
    groups: Array<{
        id: string;
        name: string;
        models: Model[];
    }>;
    variants: Map<string, string>;
}
/** The catalog belongs to the running Host backend, like the CodeX model directory. */
export declare function cachedAgyModels(load: () => Promise<AgyCatalog>): () => Promise<AgyCatalog>;
/** Model identifiers and effort variants come from the installed CLI, never a static catalog. */
export declare function parseAgyModels(output: string): AgyCatalog;
export declare function readAgyModels(binary: string): Promise<AgyCatalog>;
export declare function agySelectionArgs(catalog: AgyCatalog, modelId: string, effort?: string): {
    selection: AgySelection;
    args: string[];
};
export {};
//# sourceMappingURL=models.d.ts.map