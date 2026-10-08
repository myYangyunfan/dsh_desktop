import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ModelDirectory, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { ReasoningEffortTranslate } from './locales.js';
export interface EffortLevel {
    readonly id: string;
    readonly name: string;
}
export type EffortSelection = ModelSelection & {
    readonly reasoningEffort: string;
};
export declare function currentModel(state: ModelDirectoryState): import("@deepseek-ai/dsh-api-session-controller/types").ModelCatalogModel | undefined;
export declare function sliderLevels(state: ModelDirectoryState): readonly EffortLevel[];
export declare function effortIndex(levels: readonly EffortLevel[], id: string | undefined): number;
export declare function clampIndex(value: number, count: number): number;
/** Revalidate a captured route and effort ID, never a position in a new catalog. */
export declare function selectEffort(directory: ModelDirectory, target: EffortSelection, signal: AbortSignal, t: ReasoningEffortTranslate, timeoutMs?: number): Promise<ModelDirectoryState>;
