"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromiseQueue = void 0;
class PromiseQueue {
    constructor() {
        Object.defineProperty(this, "queue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "running", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "push", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (promise) => new Promise((r, f) => {
                this.queue.push({ promise, done: r, failed: f });
                if (!this.running) {
                    this.run();
                }
            })
        });
    }
    async run() {
        const task = this.queue.shift();
        if (task) {
            this.running = true;
            try {
                const res = await task.promise();
                task.done(res);
            }
            catch (error) {
                task.failed(error);
            }
            this.run();
        }
        else {
            this.running = false;
        }
    }
    cancel() {
        this.queue = [];
    }
}
exports.PromiseQueue = PromiseQueue;
//# sourceMappingURL=promise.js.map