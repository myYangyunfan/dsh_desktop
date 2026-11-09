"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtpAuthenticationError = void 0;
class SrtpAuthenticationError extends Error {
    constructor(message) {
        super(message);
        this.name = "SrtpAuthenticationError";
    }
}
exports.SrtpAuthenticationError = SrtpAuthenticationError;
//# sourceMappingURL=error.js.map