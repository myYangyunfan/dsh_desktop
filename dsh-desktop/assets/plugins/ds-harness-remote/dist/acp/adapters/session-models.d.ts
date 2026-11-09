import type { AcpModelView } from '../virtual-catalog.js';
/** Only configuration advertised by this session may be selected. */
export declare class AcpSessionModelState {
    private readonly backend;
    constructor(backend: 'cursor' | 'claude' | 'opencode' | 'hermes');
    private get label();
    private model?;
    private effort?;
    private legacy;
    update(value: unknown): void;
    catalog(): {
        current: {
            reasoningEffort?: string | undefined;
            provider: "cursor" | "claude" | "opencode" | "hermes";
            model: string;
        };
        routable: boolean;
        failures: never[];
        groups: {
            id: "cursor" | "claude" | "opencode" | "hermes";
            name: string;
            models: AcpModelView[];
        }[];
    };
    select(sessionId: string, model: unknown, effort: unknown, request: (method: string, params: unknown) => Promise<unknown>): Promise<{
        selected: {
            reasoningEffort?: string | undefined;
            provider: "cursor" | "claude" | "opencode" | "hermes";
            model: string;
        };
    }>;
}
//# sourceMappingURL=session-models.d.ts.map