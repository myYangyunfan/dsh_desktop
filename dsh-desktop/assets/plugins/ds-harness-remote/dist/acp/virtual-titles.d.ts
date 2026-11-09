import type { AcpClientLike, AcpSessionState } from './virtual-contract.js';
/** Title recovery belongs to the browser-safe projection, never to a native database. */
export declare class AcpSessionTitles {
    private readonly backend;
    private readonly client;
    private readonly sessions;
    private readonly publish;
    private readonly pending;
    private closed;
    constructor(backend: string, client: AcpClientLike, sessions: ReadonlyMap<string, AcpSessionState>, publish: (sessionId: string, title: string) => void);
    nativeTitle(title: string | undefined): string | undefined;
    applyNative(session: AcpSessionState, title: string): void;
    applyPrompt(session: AcpSessionState, text: string | undefined): void;
    refresh(session: AcpSessionState): Promise<void>;
    close(): void;
}
//# sourceMappingURL=virtual-titles.d.ts.map