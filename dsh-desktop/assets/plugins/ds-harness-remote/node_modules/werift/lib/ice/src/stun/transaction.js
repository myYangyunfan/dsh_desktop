"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transaction = void 0;
exports.resolveRequestAddress = resolveRequestAddress;
exports.normalizeTransactionOptions = normalizeTransactionOptions;
exports.addressEquals = addressEquals;
exports.buildTransactionOptions = buildTransactionOptions;
const node_dns_1 = require("node:dns");
const node_net_1 = require("node:net");
const common_1 = require("../imports/common");
const exceptions_1 = require("../exceptions");
const const_1 = require("./const");
const log = (0, common_1.debug)("werift-ice:packages/ice/src/stun/transaction.ts");
/**
 * Resolve a request target to a concrete IP before creating a Transaction so
 * response source-address checks match the UDP peer address (hostname ≠ IP).
 */
async function resolveRequestAddress(addr, family = 0) {
    if ((0, node_net_1.isIP)(addr[0])) {
        return addr;
    }
    const looked = await node_dns_1.promises.lookup(addr[0], { family });
    return [looked.address, addr[1]];
}
/**
 * Normalize legacy positional args and the options-object form into one shape.
 * Existing callers pass `(retransmissions?, onRequestSent?)`.
 */
function normalizeTransactionOptions(retransmissionsOrOptions, onRequestSent) {
    if (retransmissionsOrOptions !== null &&
        typeof retransmissionsOrOptions === "object") {
        return retransmissionsOrOptions;
    }
    // After the object branch, only number | undefined remains (legacy positional API).
    const retransmissions = typeof retransmissionsOrOptions === "number"
        ? retransmissionsOrOptions
        : undefined;
    return {
        retransmissions,
        onRequestSent,
    };
}
/** Compare ICE transport addresses (host, port). */
function addressEquals(a, b) {
    return a[0] === b[0] && a[1] === b[1];
}
class Transaction {
    constructor(request, addr, protocol, retransmissionsOrOptions, onRequestSent) {
        Object.defineProperty(this, "request", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: request
        });
        Object.defineProperty(this, "addr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: addr
        });
        Object.defineProperty(this, "protocol", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: protocol
        });
        Object.defineProperty(this, "timeoutDelay", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ended", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "tries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "triesMax", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onResponse", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onRequestSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "signal", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /** Remote address this transaction was sent to; responses must match. */
        Object.defineProperty(this, "expectedAddr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * When set, protocol layers re-parse the wire response with this key so
         * MESSAGE-INTEGRITY failures are rejected before responseReceived.
         */
        Object.defineProperty(this, "integrityKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "waitTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "waitResolve", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onAbort", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Accept a matching authenticated non-error response from the expected
         * remote address. Wrong address, missing MESSAGE-INTEGRITY (when required),
         * or non-success class is rejected without completing the transaction
         * (wrong address / unauthenticated responses are ignored so we keep waiting).
         */
        Object.defineProperty(this, "responseReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (message, addr) => {
                if (this.ended || this.onResponse.length === 0) {
                    return;
                }
                // RFC 7675 / ICE: only responses from the request's transport address.
                if (!addressEquals(this.expectedAddr, addr)) {
                    log("ignore STUN response from unexpected address", addr, "expected", this.expectedAddr);
                    return;
                }
                // RFC 7675 authenticated consent: integrityKey requires MESSAGE-INTEGRITY.
                // Wire HMAC is verified by protocol layers via parseMessage(data, key);
                // this presence check is defense-in-depth if responseReceived is called
                // with a constructed Message that skipped the wire re-parse path.
                if (this.integrityKey) {
                    const hasIntegrity = message.attributesKeys.includes("MESSAGE-INTEGRITY") ||
                        message.attributesKeys.includes("MESSAGE-INTEGRITY-SHA256");
                    if (!hasIntegrity) {
                        log("ignore unauthenticated STUN response (MESSAGE-INTEGRITY required)");
                        return;
                    }
                }
                if (message.messageClass === const_1.classes.RESPONSE) {
                    this.onResponse.execute(message, addr);
                    this.onResponse.complete();
                }
                else {
                    // ERROR class or other non-success
                    this.onResponse.error(new exceptions_1.TransactionFailed(message, addr));
                }
            }
        });
        Object.defineProperty(this, "run", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async () => {
                try {
                    if (this.signal?.aborted) {
                        throw new exceptions_1.TransactionTimeout();
                    }
                    this.attachAbortListener();
                    this.retry().catch((e) => {
                        log("retry failed", e);
                    });
                    const res = await this.onResponse.asPromise();
                    return res;
                }
                catch (error) {
                    throw error;
                }
                finally {
                    this.cancel();
                }
            }
        });
        Object.defineProperty(this, "retry", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async () => {
                while (this.tries < this.triesMax && !this.ended) {
                    this.onRequestSent?.(this.tries);
                    this.protocol.sendStun(this.request, this.addr).catch((e) => {
                        log("send stun failed", e);
                    });
                    await this.wait(this.timeoutDelay);
                    if (this.ended) {
                        break;
                    }
                    this.timeoutDelay *= 2;
                    this.tries++;
                }
                if (this.tries >= this.triesMax && !this.ended) {
                    log(`retry failed times:${this.tries} maxLimit:${this.triesMax}`);
                    this.failWithTimeout();
                }
            }
        });
        const options = normalizeTransactionOptions(retransmissionsOrOptions, onRequestSent);
        // triesMax = initial send + retransmissions
        this.triesMax = 1 + (options.retransmissions ?? const_1.RETRY_MAX);
        // responseTimeout is independent of retransmission count (RFC 7675 / 8445)
        this.timeoutDelay = options.responseTimeout ?? const_1.RETRY_RTO;
        this.onRequestSent = options.onRequestSent;
        this.signal = options.signal;
        this.expectedAddr = addr;
        this.integrityKey = options.integrityKey;
    }
    attachAbortListener() {
        if (!this.signal) {
            return;
        }
        this.onAbort = () => {
            this.failWithTimeout();
        };
        this.signal.addEventListener("abort", this.onAbort, { once: true });
    }
    failWithTimeout() {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.clearWait();
        if (this.onResponse.length > 0) {
            this.onResponse.error(new exceptions_1.TransactionTimeout());
        }
    }
    clearWait() {
        if (this.waitTimer !== undefined) {
            clearTimeout(this.waitTimer);
            this.waitTimer = undefined;
        }
        const resolve = this.waitResolve;
        this.waitResolve = undefined;
        resolve?.();
    }
    wait(ms) {
        return new Promise((resolve) => {
            if (this.ended || this.signal?.aborted) {
                resolve();
                return;
            }
            this.waitResolve = resolve;
            this.waitTimer = setTimeout(() => {
                this.waitTimer = undefined;
                this.waitResolve = undefined;
                resolve();
            }, ms);
        });
    }
    cancel() {
        this.ended = true;
        this.clearWait();
        if (this.signal && this.onAbort) {
            this.signal.removeEventListener("abort", this.onAbort);
            this.onAbort = undefined;
        }
    }
}
exports.Transaction = Transaction;
/**
 * Build Transaction options for Protocol.request, folding integrityKey into
 * options so response path can re-verify MESSAGE-INTEGRITY.
 */
function buildTransactionOptions(integrityKey, retransmissionsOrOptions, onRequestSent) {
    const options = normalizeTransactionOptions(retransmissionsOrOptions, onRequestSent);
    if (integrityKey && !options.integrityKey) {
        options.integrityKey = integrityKey;
    }
    return options;
}
//# sourceMappingURL=transaction.js.map