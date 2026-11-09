export declare class PromiseQueue {
    queue: {
        promise: () => Promise<unknown>;
        done: (...args: any[]) => void;
        failed: (...args: any[]) => void;
    }[];
    running: boolean;
    push: <T>(promise: () => Promise<T>) => Promise<T>;
    private run;
    cancel(): void;
}
