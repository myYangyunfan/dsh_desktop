"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionType = void 0;
exports.SessionType = {
    CLIENT: 1,
    SERVER: 2,
};
class AbstractCipher {
    constructor() {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hashAlgorithm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "verifyDataLength", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 12
        });
        Object.defineProperty(this, "blockAlgorithm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "kx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    /**
     * Init cipher.
     * @abstract
     */
    init(...args) {
        throw new Error("not implemented");
    }
    /**
     * Encrypts data.
     * @abstract
     */
    encrypt(...args) {
        throw new Error("not implemented");
    }
    /**
     * Decrypts data.
     * @abstract
     */
    decrypt(...args) {
        throw new Error("not implemented");
    }
    /**
     * @returns {string}
     */
    toString() {
        return this.name;
    }
}
exports.default = AbstractCipher;
//# sourceMappingURL=abstract.js.map