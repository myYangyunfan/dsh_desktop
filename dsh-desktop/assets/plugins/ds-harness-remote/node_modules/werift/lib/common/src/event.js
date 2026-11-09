"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventDisposer = exports.Event = void 0;
class Event {
    constructor() {
        Object.defineProperty(this, "event", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                stack: [],
                promiseStack: [],
                eventId: 0,
            }
        });
        Object.defineProperty(this, "ended", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "onended", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onerror", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (e) => { }
        });
        Object.defineProperty(this, "execute", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (...args) => {
                if (this.ended) {
                    return;
                }
                for (const item of this.event.stack) {
                    item.execute(...args);
                }
                (async () => {
                    for (const item of this.event.promiseStack) {
                        await item.execute(...args);
                    }
                })().catch((e) => {
                    this.onerror(e);
                });
            }
        });
        Object.defineProperty(this, "complete", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.ended) {
                    return;
                }
                for (const item of this.event.stack) {
                    if (item.complete) {
                        item.complete();
                    }
                }
                this.allUnsubscribe();
                this.ended = true;
                if (this.onended) {
                    this.onended();
                    this.onended = undefined;
                }
            }
        });
        Object.defineProperty(this, "error", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (e) => {
                if (this.ended) {
                    return;
                }
                for (const item of this.event.stack) {
                    if (item.error) {
                        item.error(e);
                    }
                }
                this.allUnsubscribe();
            }
        });
        Object.defineProperty(this, "allUnsubscribe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                // complete() 後の再呼び出しを許容し、close 経路での二重クリーンアップを安全にする
                if (this.ended) {
                    return;
                }
                this.event = {
                    stack: [],
                    promiseStack: [],
                    eventId: 0,
                };
            }
        });
        Object.defineProperty(this, "subscribe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (execute, complete, error) => {
                const id = this.event.eventId;
                this.event.stack.push({ execute, id, complete, error });
                this.event.eventId++;
                const unSubscribe = () => {
                    this.event.stack = this.event.stack.filter((item) => item.id !== id && item);
                };
                const disposer = (disposer) => {
                    disposer.push(unSubscribe);
                };
                return { unSubscribe, disposer };
            }
        });
        Object.defineProperty(this, "queuingSubscribe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (execute, complete, error) => {
                if (this.ended)
                    throw new Error("event completed");
                const id = this.event.eventId;
                this.event.promiseStack.push({ execute, id, complete, error });
                this.event.eventId++;
                const unSubscribe = () => {
                    this.event.stack = this.event.stack.filter((item) => item.id !== id && item);
                };
                const disposer = (disposer) => {
                    disposer.push(unSubscribe);
                };
                return { unSubscribe, disposer };
            }
        });
        Object.defineProperty(this, "once", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (execute, complete, error) => {
                const off = this.subscribe((...args) => {
                    off.unSubscribe();
                    execute(...args);
                }, complete, error);
            }
        });
        Object.defineProperty(this, "watch", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (cb, timeLimit) => new Promise((resolve, reject) => {
                const timeout = timeLimit &&
                    setTimeout(() => {
                        reject("Event watch timeout");
                    }, timeLimit);
                const { unSubscribe } = this.subscribe((...args) => {
                    const done = cb(...args);
                    if (done) {
                        if (timeout)
                            clearTimeout(timeout);
                        unSubscribe();
                        resolve(args);
                    }
                });
            })
        });
        Object.defineProperty(this, "asPromise", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (timeLimit) => new Promise((resolve, reject) => {
                const timeout = timeLimit &&
                    setTimeout(() => {
                        reject("Event asPromise timeout");
                    }, timeLimit);
                this.once((...args) => {
                    if (timeout)
                        clearTimeout(timeout);
                    resolve(args);
                }, () => {
                    if (timeout)
                        clearTimeout(timeout);
                    resolve([]);
                }, (err) => {
                    if (timeout)
                        clearTimeout(timeout);
                    reject(err);
                });
            })
        });
    }
    pipe(e) {
        this.subscribe((...args) => {
            e.execute(...args);
        });
    }
    get returnTrigger() {
        const { execute, error, complete } = this;
        return { execute, error, complete };
    }
    get returnListener() {
        const { subscribe, once, asPromise } = this;
        return { subscribe, once, asPromise };
    }
    get length() {
        return this.event.stack.length;
    }
}
exports.Event = Event;
class EventDisposer {
    constructor() {
        Object.defineProperty(this, "_disposer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    push(disposer) {
        this._disposer.push(disposer);
    }
    dispose() {
        this._disposer.forEach((d) => d());
        this._disposer = [];
    }
}
exports.EventDisposer = EventDisposer;
//# sourceMappingURL=event.js.map