/// <reference types="node" />
/**
 * BufferVisitor is a visit tool to manipulate buffer.
 */
export declare class BufferVisitor {
    start: number;
    end: number;
    readonly buf: Buffer;
    constructor(buf: Buffer, start?: number, end?: number);
    /**
     * return the underlying buffer length
     */
    readonly length: number;
    /**
     * Reset visitor' start and end value.
     * @param start
     * @param end
     */
    reset(start?: number, end?: number): this;
    /**
     * consume some bytes.
     * @param steps steps to walk
     */
    walk(steps: number): this;
    /**
     * The buffer should have remaining the "steps" of bytes to consume,
     * otherwise it will throw an error with given message.
     * @param steps steps to consume.
     * @param message message to throw.
     */
    mustHas(steps: number, message?: string): this;
    /**
     * Check the remaining bytes with bufferVisitor.mustHas method and then walk.
     * @param steps steps to consume.
     * @param message message to throw.
     */
    mustWalk(steps: number, message?: string): this;
}
