'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// **Github:** https://github.com/fidm/x509
//
// **License:** MIT
/**
 * BufferVisitor is a visit tool to manipulate buffer.
 */
class BufferVisitor {
    constructor(buf, start = 0, end = 0) {
        this.start = start;
        this.end = end > start ? end : start;
        this.buf = buf;
    }
    /**
     * return the underlying buffer length
     */
    get length() {
        return this.buf.length;
    }
    /**
     * Reset visitor' start and end value.
     * @param start
     * @param end
     */
    reset(start = 0, end = 0) {
        this.start = start;
        if (end >= this.start) {
            this.end = end;
        }
        else if (this.end < this.start) {
            this.end = this.start;
        }
        return this;
    }
    /**
     * consume some bytes.
     * @param steps steps to walk
     */
    walk(steps) {
        this.start = this.end;
        this.end += steps;
        return this;
    }
    /**
     * The buffer should have remaining the "steps" of bytes to consume,
     * otherwise it will throw an error with given message.
     * @param steps steps to consume.
     * @param message message to throw.
     */
    mustHas(steps, message = 'Too few bytes to parse.') {
        const requested = this.end + steps;
        if (requested > this.buf.length) {
            const error = new Error(message);
            error.available = this.buf.length;
            error.requested = requested;
            throw error;
        }
        this.walk(0);
        return this;
    }
    /**
     * Check the remaining bytes with bufferVisitor.mustHas method and then walk.
     * @param steps steps to consume.
     * @param message message to throw.
     */
    mustWalk(steps, message) {
        this.mustHas(steps, message);
        this.walk(steps);
        return this;
    }
}
exports.BufferVisitor = BufferVisitor;
//# sourceMappingURL=common.js.map