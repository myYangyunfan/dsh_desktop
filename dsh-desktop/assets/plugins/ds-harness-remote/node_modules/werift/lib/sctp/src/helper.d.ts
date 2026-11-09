export declare function enumerate<T>(arr: T[]): [number, T][];
export type Unpacked<T> = T extends {
    [K in keyof T]: infer U;
} ? U : never;
export declare function createEventsFromList<T>(list: readonly T[]): any;
