"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDisposable = void 0;
function isDisposable(value) {
    if (typeof value.dispose !== "function")
        return false;
    const disposeFun = value.dispose;
    if (disposeFun.length > 0) {
        return false;
    }
    return true;
}
exports.isDisposable = isDisposable;
