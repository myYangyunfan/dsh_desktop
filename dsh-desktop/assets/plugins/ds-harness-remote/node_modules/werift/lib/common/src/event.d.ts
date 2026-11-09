type EventExecute<T extends any[]> = (...args: T) => void;
type PromiseEventExecute<T extends any[]> = (...args: T) => Promise<void>;
type EventComplete = () => void;
type EventError = (e: any) => void;
export declare class Event<T extends any[]> {
    private event;
    ended: boolean;
    onended?: () => void;
    onerror: (e: any) => void;
    execute: (...args: T) => void;
    complete: () => void;
    error: (e: any) => void;
    allUnsubscribe: () => void;
    subscribe: (execute: EventExecute<T>, complete?: EventComplete, error?: EventError) => {
        unSubscribe: () => void;
        disposer: (disposer: EventDisposer) => void;
    };
    pipe(e: Event<T>): void;
    queuingSubscribe: (execute: PromiseEventExecute<T>, complete?: EventComplete, error?: EventError) => {
        unSubscribe: () => void;
        disposer: (disposer: EventDisposer) => void;
    };
    once: (execute: EventExecute<T>, complete?: EventComplete, error?: EventError) => void;
    watch: (cb: (...args: T) => boolean, timeLimit?: number) => Promise<T>;
    asPromise: (timeLimit?: number) => Promise<T>;
    get returnTrigger(): {
        execute: (...args: T) => void;
        error: (e: any) => void;
        complete: () => void;
    };
    get returnListener(): {
        subscribe: (execute: EventExecute<T>, complete?: EventComplete, error?: EventError) => {
            unSubscribe: () => void;
            disposer: (disposer: EventDisposer) => void;
        };
        once: (execute: EventExecute<T>, complete?: EventComplete, error?: EventError) => void;
        asPromise: (timeLimit?: number) => Promise<T>;
    };
    get length(): number;
}
export declare class EventDisposer {
    private _disposer;
    push(disposer: () => void): void;
    dispose(): void;
}
export {};
