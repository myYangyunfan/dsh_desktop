import type { AcpSessionModes } from '@dsh-remote/protocol';
import type { AcpModelView } from '../virtual-catalog.js';
/** Only configuration advertised by this session may be selected. */
export declare class AcpSessionModelState {
    private readonly backend;
    constructor(backend: string);
    private get label();
    private model?;
    private effort?;
    private modes;
    private modeConfigId?;
    private legacy;
    update(value: unknown): void;
    modesCatalog(): AcpSessionModes;
    setMode(sessionId: string, modeId: unknown, request: (method: string, params: unknown) => Promise<unknown>): Promise<{
        currentModeId: string;
    }>;
    catalog(): {
        current: {
            reasoningEffort?: string | undefined;
            provider: string;
            model: string;
        };
        routable: boolean;
        failures: never[];
        groups: {
            id: string;
            name: string;
            models: AcpModelView[];
        }[];
    };
    select(sessionId: string, model: unknown, effort: unknown, request: (method: string, params: unknown) => Promise<unknown>): Promise<{
        selected: {
            reasoningEffort?: string | undefined;
            provider: string;
            model: string;
        };
    }>;
}
//# sourceMappingURL=session-models.d.ts.map