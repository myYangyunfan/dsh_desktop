export declare class CodexThreadLifecycle {
    private readonly retained;
    private readonly unsubscribe;
    private readonly released;
    private readonly failed;
    private readonly closeTimeoutMs;
    private readonly threads;
    constructor(retained: (threadId: string) => boolean, unsubscribe: (threadId: string) => Promise<unknown>, released: (threadId: string) => void, failed: (error: unknown) => void, closeTimeoutMs?: number);
    use<T>(threadId: string, action: () => Promise<T>): Promise<T>;
    active(threadId: string, active: boolean): void;
    starting(threadId: string): (accepted: boolean) => void;
    retry(threadId: string): Promise<void>;
    release(threadId: string): Promise<void>;
    isReleasing(threadId: string): boolean;
    closed(threadId: string): void;
    reset(): void;
    private state;
    private settle;
    private unload;
}
//# sourceMappingURL=thread-lifecycle.d.ts.map