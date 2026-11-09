"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debug = exports.WeriftError = void 0;
const debug_1 = __importDefault(require("debug"));
class WeriftError extends Error {
    constructor(props) {
        super(props.message);
        Object.defineProperty(this, "message", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "payload", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "path", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    toJSON() {
        return {
            message: this.message,
            payload: JSON.parse(JSON.stringify(this.payload)),
            path: this.path,
        };
    }
}
exports.WeriftError = WeriftError;
exports.debug = debug_1.default.debug;
//# sourceMappingURL=log.js.map