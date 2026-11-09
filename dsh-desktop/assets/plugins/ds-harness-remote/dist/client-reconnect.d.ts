import type { ResolvedConfig } from './config.js';
/** Retry only carrier establishment, never an RPC or an outgoing user action. */
export declare class ClientReconnect {
    private readonly config;
    private pending?;
    constructor(config: ResolvedConfig['reconnect']);
    cancel(): void;
    start(connect: (signal: AbortSignal) => Promise<void>, error?: Error): void;
    private run;
}
//# sourceMappingURL=client-reconnect.d.ts.map