"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TcpPassiveProtocol = exports.TcpActiveProtocol = void 0;
const node_net_1 = require("node:net");
const common_1 = require("../imports/common");
const const_1 = require("./const");
const message_1 = require("./message");
const tcpFrame_1 = require("./tcpFrame");
const transaction_1 = require("./transaction");
const log = (0, common_1.debug)("werift-ice:packages/ice/src/stun/tcpProtocol.ts");
function socketKey(addr) {
    return `${addr[0]}:${addr[1]}`;
}
function addressFromSocket(socket) {
    if (!socket.remoteAddress || !socket.remotePort) {
        return;
    }
    return [socket.remoteAddress, socket.remotePort];
}
async function waitForListening(server, host, port) {
    return await new Promise((resolve, reject) => {
        const onError = (error) => {
            server.off("listening", onListening);
            reject(error);
        };
        const onListening = () => {
            server.off("error", onError);
            resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen({
            host,
            port: port ?? 0,
            exclusive: true,
        });
    });
}
class BaseTcpProtocol {
    constructor() {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: BaseTcpProtocol.type
        });
        Object.defineProperty(this, "transactions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "localCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sentMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "localIp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onRequestReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onDataReceived", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "sockets", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    rememberSocket(entry) {
        const remoteAddr = entry.remoteAddr;
        if (!remoteAddr) {
            return;
        }
        this.sockets.set(socketKey(remoteAddr), entry);
    }
    forgetSocket(remoteAddr) {
        if (!remoteAddr) {
            return;
        }
        this.sockets.delete(socketKey(remoteAddr));
    }
    registerSocket(socket, remoteAddr) {
        const entry = {
            socket,
            buffer: Buffer.alloc(0),
            remoteAddr,
        };
        if (remoteAddr) {
            this.rememberSocket(entry);
        }
        socket.on("data", (data) => {
            entry.buffer = Buffer.concat([entry.buffer, data]);
            const { frames, rest } = (0, tcpFrame_1.splitTcpFrames)(entry.buffer);
            entry.buffer = rest;
            const socketAddr = entry.remoteAddr ?? addressFromSocket(socket);
            if (!entry.remoteAddr && socketAddr) {
                entry.remoteAddr = socketAddr;
                this.rememberSocket(entry);
            }
            if (!socketAddr) {
                return;
            }
            for (const frame of frames) {
                if (frame.length === 0) {
                    continue;
                }
                this.handleFrame(frame, socketAddr);
            }
        });
        socket.on("close", () => {
            this.forgetSocket(entry.remoteAddr);
        });
        socket.on("error", (error) => {
            log("tcp socket error", error);
        });
        return entry;
    }
    handleFrame(data, addr) {
        try {
            const message = (0, message_1.parseMessage)(data);
            if (!message) {
                this.onDataReceived.execute(data);
                return;
            }
            if ((message.messageClass === const_1.classes.RESPONSE ||
                message.messageClass === const_1.classes.ERROR) &&
                this.transactions[message.transactionIdHex]) {
                const transaction = this.transactions[message.transactionIdHex];
                const verified = transaction.integrityKey
                    ? (0, message_1.parseMessage)(data, transaction.integrityKey)
                    : message;
                if (!verified) {
                    log("STUN response failed MESSAGE-INTEGRITY check");
                    return;
                }
                transaction.responseReceived(verified, addr);
            }
            else if (message.messageClass === const_1.classes.REQUEST) {
                this.onRequestReceived.execute(message, addr, data);
            }
        }
        catch (error) {
            log("tcp frame parse error", error);
        }
    }
    async sendFrame(data, addr) {
        const entry = await this.getSocket(addr);
        await new Promise((resolve, reject) => {
            entry.socket.write((0, tcpFrame_1.encodeTcpFrame)(data), (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
    async sendStun(message, addr) {
        await this.sendFrame(message.bytes, addr);
    }
    async sendData(data, addr) {
        await this.sendFrame(data, addr);
    }
    async request(request, addr, integrityKey, retransmissionsOrOptions, onRequestSent) {
        if (this.transactions[request.transactionIdHex]) {
            throw new Error("already requested");
        }
        if (integrityKey) {
            request.addMessageIntegrity(integrityKey);
            request.addFingerprint();
        }
        const resolvedAddr = await (0, transaction_1.resolveRequestAddress)(addr);
        const options = (0, transaction_1.buildTransactionOptions)(integrityKey, retransmissionsOrOptions, onRequestSent);
        const transaction = new transaction_1.Transaction(request, resolvedAddr, this, options);
        this.transactions[request.transactionIdHex] = transaction;
        try {
            return await transaction.run();
        }
        finally {
            delete this.transactions[request.transactionIdHex];
        }
    }
    async pruneForSelection(remoteAddr) {
        for (const [key, entry] of this.sockets.entries()) {
            if (remoteAddr && key === socketKey(remoteAddr)) {
                continue;
            }
            entry.socket.destroy();
            this.sockets.delete(key);
        }
    }
    get activeSocketCount() {
        return this.sockets.size;
    }
    get address() {
        return {};
    }
    async close() {
        Object.values(this.transactions).forEach((transaction) => {
            transaction.cancel();
        });
        await this.pruneForSelection();
        this.onRequestReceived.complete();
        this.onDataReceived.complete();
    }
}
Object.defineProperty(BaseTcpProtocol, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: "tcp"
});
class TcpActiveProtocol extends BaseTcpProtocol {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "pendingSockets", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    async connectionMade(localIp) {
        this.localIp = localIp;
    }
    async getSocket(addr) {
        const key = socketKey(addr);
        const existing = this.sockets.get(key);
        if (existing) {
            return existing;
        }
        const pending = this.pendingSockets.get(key);
        if (pending) {
            return await pending;
        }
        const connecting = new Promise((resolve, reject) => {
            const socket = (0, node_net_1.connect)({
                host: addr[0],
                port: addr[1],
                localAddress: this.localIp,
            });
            const entry = this.registerSocket(socket, addr);
            const onError = (error) => {
                socket.off("connect", onConnect);
                reject(error);
            };
            const onConnect = () => {
                socket.off("error", onError);
                resolve(entry);
            };
            socket.once("error", onError);
            socket.once("connect", onConnect);
        });
        this.pendingSockets.set(key, connecting);
        try {
            return await connecting;
        }
        finally {
            this.pendingSockets.delete(key);
        }
    }
}
exports.TcpActiveProtocol = TcpActiveProtocol;
class TcpPassiveProtocol extends BaseTcpProtocol {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "server", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, node_net_1.createServer)((socket) => {
                this.registerSocket(socket, addressFromSocket(socket));
            })
        });
    }
    async connectionMade(localIp, portRange) {
        this.localIp = localIp;
        if (portRange) {
            let lastError;
            for (let port = portRange[0]; port <= portRange[1]; port++) {
                try {
                    await waitForListening(this.server, localIp, port);
                    return;
                }
                catch (error) {
                    lastError = error;
                }
            }
            throw lastError ?? new Error("tcp port not found");
        }
        await waitForListening(this.server, localIp);
    }
    async getSocket(addr) {
        const entry = this.sockets.get(socketKey(addr));
        if (!entry) {
            throw new Error("tcp passive connection not established");
        }
        return entry;
    }
    get listeningPort() {
        const address = this.server.address();
        if (!address || typeof address === "string") {
            throw new Error("tcp passive protocol is not listening");
        }
        return address.port;
    }
    async close() {
        await super.close();
        await new Promise((resolve) => {
            this.server.close(() => resolve());
        });
    }
}
exports.TcpPassiveProtocol = TcpPassiveProtocol;
//# sourceMappingURL=tcpProtocol.js.map