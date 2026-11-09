"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportContext = void 0;
class TransportContext {
    constructor(socket) {
        Object.defineProperty(this, "socket", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: socket
        });
        Object.defineProperty(this, "send", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (buf, addr) => {
                return this.socket.send(buf, addr);
            }
        });
    }
}
exports.TransportContext = TransportContext;
//# sourceMappingURL=transport.js.map