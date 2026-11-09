import { Event } from "./imports/common";
export declare function randomString(length: number): string;
export declare function randomTransactionId(): Buffer<ArrayBufferLike>;
export declare function bufferXor(a: Buffer, b: Buffer): Buffer;
export declare function difference<T>(x: Set<T>, y: Set<T>): Set<T>;
export declare class PQueue<T> {
    private queue;
    private wait;
    put(v: Promise<T>): void;
    get(): Promise<T>;
}
export declare const cancelable: <T>(ex: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void, onCancel: Event<[any]>) => Promise<void>) => {
    awaitable: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
};
export type Cancelable<T> = ReturnType<typeof cancelable<T>>;
