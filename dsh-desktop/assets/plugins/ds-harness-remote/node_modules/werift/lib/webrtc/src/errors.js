"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebRtcDomException = createWebRtcDomException;
exports.createWebRtcTypeError = createWebRtcTypeError;
function createWebRtcDomException(name, message = name) {
    return new DOMException(message, name);
}
function createWebRtcTypeError(message) {
    return new TypeError(message);
}
//# sourceMappingURL=errors.js.map