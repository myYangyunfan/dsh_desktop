"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelable = exports.PQueue = void 0;
exports.randomString = randomString;
exports.randomTransactionId = randomTransactionId;
exports.bufferXor = bufferXor;
exports.difference = difference;
const crypto_1 = require("crypto");
const common_1 = require("./imports/common");
function randomString(length) {
    return (0, crypto_1.randomBytes)(length).toString("hex").substring(0, length);
}
function randomTransactionId() {
    return (0, crypto_1.randomBytes)(12);
}
function bufferXor(a, b) {
    if (a.length !== b.length) {
        throw new TypeError("[webrtc-stun] You can not XOR buffers which length are different");
    }
    const length = a.length;
    const buffer = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = a[i] ^ b[i];
    }
    return buffer;
}
function difference(x, y) {
    return new Set([...x].filter((e) => !y.has(e)));
}
// infinite size queue
class PQueue {
    constructor() {
        Object.defineProperty(this, "queue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "wait", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
    }
    put(v) {
        this.queue.push(v);
        if (this.queue.length === 1) {
            this.wait.execute(v);
        }
    }
    get() {
        const v = this.queue.shift();
        if (!v) {
            return new Promise((r) => {
                this.wait.subscribe((v) => {
                    this.queue.shift();
                    r(v);
                });
            });
        }
        return v;
    }
}
exports.PQueue = PQueue;
const cancelable = (ex) => {
    let resolve;
    let reject;
    const p = new Promise((r, f) => {
        resolve = r;
        reject = f;
    });
    p.then(() => {
        onCancel.execute(undefined);
        onCancel.complete();
    }).catch((e) => {
        onCancel.execute(e ?? new Error());
        onCancel.complete();
    });
    const onCancel = new common_1.Event();
    ex(resolve, reject, onCancel).catch(() => { });
    return { awaitable: p, resolve, reject };
};
exports.cancelable = cancelable;
//# sourceMappingURL=helper.js.map