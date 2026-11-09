/** Probe the installed CLI, since ACP builds do not all expose a native HTTP listener. */
export declare function opencodeHasNativeApi(binary: string, args: readonly string[], cwd: string | undefined, signal: AbortSignal): Promise<boolean>;
/** The native HTTP listener belongs to the same Host-local `opencode acp` process. */
export declare class OpencodeNativeApi {
    private readonly origin;
    private readonly request;
    readonly password: string;
    private readonly shutdown;
    constructor(origin: string, request?: typeof fetch);
    isArchived(sessionId: string, cwd: string): Promise<boolean>;
    archive(sessionId: string, cwd: string): Promise<void>;
    close(): void;
    private session;
}
export declare function opencodeLoopbackPort(): Promise<number>;
/** Strip stale network flags; only add a private listener when the CLI advertises it. */
export declare function opencodePrivateArgs(args: readonly string[], port?: number): string[];
//# sourceMappingURL=opencode-native-api.d.ts.map