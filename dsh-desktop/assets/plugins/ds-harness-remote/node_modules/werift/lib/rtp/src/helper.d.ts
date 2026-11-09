export declare function enumerate<T>(arr: T[]): [number, T][];
export declare function growBufferSize(buf: Buffer, size: number): Buffer<ArrayBuffer>;
export declare function Int(v: number): number;
export declare const timer: {
    setTimeout: (callback: (args: void) => void, ms?: number | undefined) => () => void;
    setInterval: (callback: (args: void) => void, ms?: number | undefined) => () => void;
};
export declare function isMedia(buf: Buffer): boolean;
