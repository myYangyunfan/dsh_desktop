import { Red } from "./packet";
export declare class RedEncoder {
    distance: number;
    private cache;
    cacheSize: number;
    constructor(distance?: number);
    push(payload: {
        block: Buffer;
        timestamp: number;
        blockPT: number;
    }): void;
    build(): Red;
}
