"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventTarget = exports.PromiseQueue = void 0;
exports.enumerate = enumerate;
exports.divide = divide;
const node_events_1 = require("node:events");
function enumerate(arr) {
    return arr.map((v, i) => [i, v]);
}
function divide(from, split) {
    const arr = from.split(split);
    return [arr[0], arr.slice(1).join(split)];
}
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
            value: (promise) => new Promise((r) => {
                this.queue.push({ promise, done: r });
                if (!this.running)
                    this.run();
            })
        });
    }
    async run() {
        const task = this.queue.shift();
        if (task) {
            this.running = true;
            await task.promise();
            task.done();
            this.run();
        }
        else {
            this.running = false;
        }
    }
}
exports.PromiseQueue = PromiseQueue;
class EventTarget extends node_events_1.EventEmitter {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "addEventListener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (type, listener, options) => {
                if (typeof options === "object" && options?.once) {
                    this.once(type, listener);
                    return;
                }
                this.addListener(type, listener);
            }
        });
        Object.defineProperty(this, "removeEventListener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (type, listener) => {
                this.removeListener(type, listener);
            }
        });
        Object.defineProperty(this, "dispatchEvent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (event) => this.emit(event.type, event)
        });
    }
    emit(type, ...args) {
        if (typeof type !== "string") {
            return super.emit(type, ...args);
        }
        if (args.length === 0) {
            return super.emit(type, new Event(type));
        }
        const [event, ...rest] = args;
        if (event && typeof event === "object" && !("type" in event)) {
            try {
                Object.defineProperty(event, "type", {
                    configurable: true,
                    enumerable: true,
                    value: type,
                });
            }
            catch {
                return super.emit(type, { type, ...event }, ...rest);
            }
        }
        return super.emit(type, event, ...rest);
    }
}
exports.EventTarget = EventTarget;
//# sourceMappingURL=helper.js.map