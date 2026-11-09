"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionTimeout = exports.TransactionFailed = exports.TransactionError = void 0;
class TransactionError extends Error {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "response", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "addr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
}
exports.TransactionError = TransactionError;
class TransactionFailed extends TransactionError {
    constructor(response, addr) {
        super();
        Object.defineProperty(this, "response", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: response
        });
        Object.defineProperty(this, "addr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: addr
        });
    }
    get str() {
        let out = "STUN transaction failed";
        const attribute = this.response.getAttributeValue("ERROR-CODE");
        if (attribute) {
            const [code, msg] = attribute;
            out += ` (${code} - ${msg})`;
        }
        return out;
    }
}
exports.TransactionFailed = TransactionFailed;
class TransactionTimeout extends TransactionError {
    get str() {
        return "STUN transaction timed out";
    }
}
exports.TransactionTimeout = TransactionTimeout;
//# sourceMappingURL=exceptions.js.map