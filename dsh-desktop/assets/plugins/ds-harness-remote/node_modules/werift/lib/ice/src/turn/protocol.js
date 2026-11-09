"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TurnProtocol = exports.StunOverTurnProtocol = void 0;
exports.createTurnClient = createTurnClient;
exports.createStunOverTurnClient = createStunOverTurnClient;
exports.makeIntegrityKey = makeIntegrityKey;
const promises_1 = require("timers/promises");
const auth_1 = require("../../../ice-server/src/turn/auth");
const exceptions_1 = require("../exceptions");
const helper_1 = require("../helper");
const common_1 = require("../imports/common");
const const_1 = require("../stun/const");
const message_1 = require("../stun/message");
const transaction_1 = require("../stun/transaction");
const frame_1 = require("./frame");
const log = (0, common_1.debug)("werift-ice:packages/ice/src/turn/protocol.ts");
const DEFAULT_CHANNEL_REFRESH_TIME = 500;
const DEFAULT_ALLOCATION_LIFETIME = 600;
const UDP_TRANSPORT = 0x11000000;
function isStreamTransport(transport) {
    return transport.type === "tcp" || transport.type === "tls";
}
/** Permission is peer-IP scoped (RFC 8656). */
function permissionKey(addr) {
    return addr[0];
}
/** ChannelBind is peer transport-address scoped (IP + port). */
function channelKey(addr) {
    return JSON.stringify(addr);
}
class StunOverTurnProtocol {
    constructor(turn) {
        Object.defineProperty(this, "turn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: turn
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: StunOverTurnProtocol.type
        });
        Object.defineProperty(this, "localCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "disposer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.EventDisposer()
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
        Object.defineProperty(this, "handleStunMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (data, addr) => {
                try {
                    const message = (0, message_1.parseMessage)(data);
                    if (!message) {
                        this.onDataReceived.execute(data);
                        return;
                    }
                    if (message.messageClass === const_1.classes.RESPONSE ||
                        message.messageClass === const_1.classes.ERROR) {
                        const transaction = this.turn.transactions[message.transactionIdHex];
                        if (transaction) {
                            const verified = transaction.integrityKey
                                ? (0, message_1.parseMessage)(data, transaction.integrityKey)
                                : message;
                            if (!verified) {
                                log("STUN over TURN response failed MESSAGE-INTEGRITY check");
                                return;
                            }
                            transaction.responseReceived(verified, addr);
                        }
                    }
                    else if (message.messageClass === const_1.classes.REQUEST) {
                        this.onRequestReceived.execute(message, addr, data);
                    }
                }
                catch (error) {
                    log("datagramReceived error", error);
                }
            }
        });
        turn.onData
            .subscribe((data, addr) => {
            this.handleStunMessage(data, addr);
        })
            .disposer(this.disposer);
    }
    async request(request, addr, integrityKey, retransmissionsOrOptions, onRequestSent) {
        if (this.turn.transactions[request.transactionIdHex]) {
            throw new Error("exist");
        }
        if (integrityKey) {
            request.addMessageIntegrity(integrityKey);
            request.addFingerprint();
        }
        // Peer-facing STUN over TURN must honor retransmissions/responseTimeout
        // (consent uses retransmissions: 0). Do not confuse with TURN server
        // allocation/refresh policy on TurnProtocol.
        // Peer addresses are already IPs from candidates; resolve for safety.
        const resolvedAddr = await (0, transaction_1.resolveRequestAddress)(addr);
        const options = (0, transaction_1.buildTransactionOptions)(integrityKey, retransmissionsOrOptions, onRequestSent);
        const transaction = new transaction_1.Transaction(request, resolvedAddr, this, options);
        this.turn.transactions[request.transactionIdHex] = transaction;
        try {
            return await transaction.run();
        }
        catch (e) {
            throw e;
        }
        finally {
            delete this.turn.transactions[request.transactionIdHex];
        }
    }
    async connectionMade() { }
    async sendData(data, addr) {
        await this.turn.sendData(data, addr);
    }
    async sendStun(message, addr) {
        await this.turn.sendData(message.bytes, addr);
    }
    async close() {
        this.disposer.dispose();
        return this.turn.close();
    }
}
exports.StunOverTurnProtocol = StunOverTurnProtocol;
Object.defineProperty(StunOverTurnProtocol, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: "turn"
});
class TurnProtocol {
    constructor(server, username, password, lifetime, transport, options = {}) {
        Object.defineProperty(this, "server", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: server
        });
        Object.defineProperty(this, "username", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: username
        });
        Object.defineProperty(this, "password", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: password
        });
        Object.defineProperty(this, "lifetime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: lifetime
        });
        Object.defineProperty(this, "transport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: transport
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: TurnProtocol.type
        });
        Object.defineProperty(this, "onData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
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
        Object.defineProperty(this, "integrityKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "nonce", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "realm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "relayedAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mappedAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "localCandidate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "transactions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "refreshHandle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "channelNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0x4000
        });
        Object.defineProperty(this, "channelByAddr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "addrByChannel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        /**sec */
        Object.defineProperty(this, "channelRefreshTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Serializes ChannelBind requests so allocation-wide auth state
         * (nonce/realm/integrityKey) is not updated concurrently. Rejections
         * must not poison this tail — see channelBindQueue assignment sites.
         */
        Object.defineProperty(this, "channelBindQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Promise.resolve()
        });
        /** In-flight ChannelBind per peer transport address (dedupe concurrent). */
        Object.defineProperty(this, "channelBindingByAddr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "tcpBuffer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Buffer.alloc(0)
        });
        /** Permission cache keyed by peer IP only (RFC 8656). */
        Object.defineProperty(this, "permissionByAddr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        /**
         * Serializes CreatePermission requests (auth state race avoidance).
         * Rejections must not poison this tail.
         */
        Object.defineProperty(this, "permissionQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Promise.resolve()
        });
        /** In-flight CreatePermission per peer IP (dedupe concurrent). */
        Object.defineProperty(this, "creatingPermissionByAddr", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "refresh", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (exp) => {
                this.refreshHandle = (0, helper_1.cancelable)(async (_, __, onCancel) => {
                    let run = true;
                    onCancel.once(() => {
                        run = false;
                    });
                    while (run) {
                        // refresh before expire
                        const delay = (5 / 6) * exp * 1000;
                        log("refresh delay", delay, { exp });
                        await (0, promises_1.setTimeout)(delay);
                        const request = new message_1.Message(const_1.methods.REFRESH, const_1.classes.REQUEST);
                        request.setAttribute("LIFETIME", exp);
                        try {
                            const [message] = await this.requestWithRetry(request, this.server);
                            exp = message.getAttributeValue("LIFETIME");
                            log("refresh", { exp });
                        }
                        catch (error) {
                            log("refresh error", error);
                        }
                    }
                });
            }
        });
        this.channelRefreshTime =
            this.options.channelRefreshTime ?? DEFAULT_CHANNEL_REFRESH_TIME;
    }
    async connectionMade() {
        this.transport.onData = (data, addr) => {
            this.dataReceived(data, addr);
        };
        const request = new message_1.Message(const_1.methods.ALLOCATE, const_1.classes.REQUEST);
        request
            .setAttribute("LIFETIME", this.lifetime)
            .setAttribute("REQUESTED-TRANSPORT", UDP_TRANSPORT);
        const [response] = await this.requestWithRetry(request, this.server).catch((e) => {
            log("connect error", e);
            throw e;
        });
        this.relayedAddress = response.getAttributeValue("XOR-RELAYED-ADDRESS");
        this.mappedAddress = response.getAttributeValue("XOR-MAPPED-ADDRESS");
        const exp = response.getAttributeValue("LIFETIME");
        log("connect", this.relayedAddress, this.mappedAddress, { exp });
        this.refresh(exp);
    }
    handleChannelData(data) {
        const decoded = (0, frame_1.decodeChannelData)(data);
        const addr = decoded && this.addrByChannel[decoded.channelNumber];
        if (addr && decoded) {
            this.onData.execute(decoded.data, addr);
        }
    }
    handleSTUNMessage(data, addr) {
        try {
            const message = (0, message_1.parseMessage)(data);
            if (!message) {
                throw new Error("not stun message");
            }
            if (message.messageClass === const_1.classes.RESPONSE ||
                message.messageClass === const_1.classes.ERROR) {
                const transaction = this.transactions[message.transactionIdHex];
                if (transaction) {
                    const verified = transaction.integrityKey
                        ? (0, message_1.parseMessage)(data, transaction.integrityKey)
                        : message;
                    if (!verified) {
                        log("TURN STUN response failed MESSAGE-INTEGRITY check");
                        return;
                    }
                    transaction.responseReceived(verified, addr);
                }
            }
            else if (message.messageClass === const_1.classes.REQUEST) {
                this.onData.execute(data, addr);
            }
            if (message.getAttributeValue("DATA")) {
                const buf = message.getAttributeValue("DATA");
                const peerAddress = message.getAttributeValue("XOR-PEER-ADDRESS") ?? addr;
                this.onData.execute(buf, peerAddress);
            }
        }
        catch (error) {
            log("parse error", data.toString());
        }
    }
    dataReceived(data, addr) {
        const datagramReceived = (data, addr) => {
            if (data.length >= 4 && (0, frame_1.isChannelData)(data)) {
                this.handleChannelData(data);
            }
            else {
                this.handleSTUNMessage(data, addr);
            }
        };
        if (isStreamTransport(this.transport)) {
            this.tcpBuffer = Buffer.concat([this.tcpBuffer, data]);
            const { frames, rest } = (0, frame_1.splitTurnTcpFrames)(this.tcpBuffer);
            this.tcpBuffer = rest;
            for (const frame of frames) {
                datagramReceived(frame, addr);
            }
        }
        else {
            datagramReceived(data, addr);
        }
    }
    async send(data, addr) {
        if (this.transport.closed) {
            return;
        }
        await this.transport.send(isStreamTransport(this.transport) ? (0, frame_1.padTurnFrame)(data) : data, addr);
    }
    async createPermission(peerAddress) {
        const request = new message_1.Message(const_1.methods.CREATE_PERMISSION, const_1.classes.REQUEST);
        request
            .setAttribute("XOR-PEER-ADDRESS", peerAddress)
            .setAttribute("USERNAME", this.username)
            .setAttribute("REALM", this.realm)
            .setAttribute("NONCE", this.nonce);
        // Use requestWithRetry for stale-nonce (438) consistency with ChannelBind.
        await this.requestWithRetry(request, this.server);
    }
    async request(request, addr, _integrityKey, retransmissionsOrOptions, onRequestSent) {
        if (this.transactions[request.transactionIdHex]) {
            throw new Error("exist");
        }
        if (this.integrityKey) {
            request
                .setAttribute("USERNAME", this.username)
                .setAttribute("REALM", this.realm)
                .setAttribute("NONCE", this.nonce)
                .addMessageIntegrity(this.integrityKey)
                .addFingerprint();
        }
        // TURN server allocation/refresh uses default STUN retry policy unless
        // callers pass explicit options. Peer consent goes through StunOverTurnProtocol.
        // Prefer the TURN session integrity key for response verification.
        const resolvedAddr = await (0, transaction_1.resolveRequestAddress)(addr);
        const options = (0, transaction_1.buildTransactionOptions)(this.integrityKey, retransmissionsOrOptions, onRequestSent);
        const transaction = new transaction_1.Transaction(request, resolvedAddr, this, options);
        this.transactions[request.transactionIdHex] = transaction;
        try {
            return await transaction.run();
        }
        catch (e) {
            throw e;
        }
        finally {
            delete this.transactions[request.transactionIdHex];
        }
    }
    async requestWithRetry(request, addr) {
        let message, address;
        try {
            [message, address] = await this.request(request, addr);
        }
        catch (error) {
            if (error instanceof exceptions_1.TransactionFailed == false) {
                log("requestWithRetry error", error);
                throw error;
            }
            // resolve dns address
            this.server = error.addr;
            const [errorCode] = error.response.getAttributeValue("ERROR-CODE");
            const nonce = error.response.getAttributeValue("NONCE");
            const realm = error.response.getAttributeValue("REALM");
            if (((errorCode === 401 && realm) || (errorCode === 438 && this.realm)) &&
                nonce) {
                log("retry with nonce", errorCode);
                this.nonce = nonce;
                if (errorCode === 401) {
                    this.realm = realm;
                }
                this.integrityKey = makeIntegrityKey(this.username, this.realm, this.password);
                request.transactionId = (0, helper_1.randomTransactionId)();
                [message, address] = await this.request(request, this.server);
            }
            else {
                throw error;
            }
        }
        return [message, address];
    }
    async sendData(data, addr) {
        let channel;
        try {
            channel = await this.getChannel(addr);
        }
        catch (e) {
            // Keep original ChannelBind error for diagnostics (403/438/timeout).
            log("channelBind error; falling back to Send Indication", e);
        }
        if (!channel) {
            await this.getPermission(addr);
            const indicate = new message_1.Message(const_1.methods.SEND, const_1.classes.INDICATION)
                .setAttribute("DATA", data)
                .setAttribute("XOR-PEER-ADDRESS", addr);
            await this.sendStun(indicate, this.server);
            return;
        }
        await this.send((0, frame_1.encodeChannelData)(channel.number, data), this.server);
    }
    /**
     * Ensure a CreatePermission exists for the peer IP.
     * Peer failures are isolated: a rejection for peer A does not poison peer B.
     */
    async getPermission(addr) {
        const key = permissionKey(addr);
        if (this.permissionByAddr[key]) {
            return;
        }
        const existing = this.creatingPermissionByAddr.get(key);
        if (existing) {
            return existing;
        }
        const operation = this.permissionQueue.then(async () => {
            // Another caller may have succeeded while we waited on the queue.
            if (this.permissionByAddr[key]) {
                return;
            }
            await this.createPermission(addr);
            // Cache only after successful CreatePermission.
            this.permissionByAddr[key] = true;
        });
        // Do not let rejection poison subsequent peers on the shared queue.
        this.permissionQueue = operation.then(() => undefined, () => undefined);
        this.creatingPermissionByAddr.set(key, operation);
        try {
            await operation;
        }
        catch (error) {
            log("createPermission error", error);
            throw error;
        }
        finally {
            if (this.creatingPermissionByAddr.get(key) === operation) {
                this.creatingPermissionByAddr.delete(key);
            }
        }
    }
    /**
     * Ensure a ChannelBind exists for the peer transport address.
     * Peer failures are isolated; concurrent same-peer calls share one Promise.
     */
    async getChannel(addr) {
        const key = channelKey(addr);
        const existing = this.channelBindingByAddr.get(key);
        if (existing) {
            return existing;
        }
        // Fast path: bound and not due for refresh.
        const cached = this.channelByAddr[key];
        const now = (0, common_1.int)(Date.now() / 1000);
        if (cached && cached.refreshAt > now) {
            return cached;
        }
        const operation = this.channelBindQueue.then(() => this.ensureChannel(addr));
        // Do not let rejection poison subsequent peers on the shared queue.
        this.channelBindQueue = operation.then(() => undefined, () => undefined);
        this.channelBindingByAddr.set(key, operation);
        try {
            return await operation;
        }
        catch (error) {
            log("channelBind error", error);
            throw error;
        }
        finally {
            if (this.channelBindingByAddr.get(key) === operation) {
                this.channelBindingByAddr.delete(key);
            }
        }
    }
    /**
     * Create or refresh a channel for addr. Provisional mapping is installed
     * before the request so early ChannelData can be decoded; only a failed
     * *initial* bind rolls the mapping back. Failed channel numbers are never
     * reused.
     */
    async ensureChannel(addr) {
        const key = channelKey(addr);
        const now = (0, common_1.int)(Date.now() / 1000);
        let channel = this.channelByAddr[key];
        if (channel && channel.refreshAt > now) {
            return channel;
        }
        const isNew = !channel;
        if (!channel) {
            channel = {
                number: this.channelNumber++,
                address: addr,
                refreshAt: 0,
            };
            // Provisional mapping for ChannelData that may arrive before success.
            this.channelByAddr[key] = channel;
            this.addrByChannel[channel.number] = addr;
        }
        try {
            await this.channelBind(channel.number, addr);
            channel.refreshAt = (0, common_1.int)(Date.now() / 1000) + this.channelRefreshTime;
            log(isNew ? "channelBind" : "channelBind refresh", channel);
            return channel;
        }
        catch (error) {
            if (isNew) {
                // Roll back provisional mapping only for a failed initial bind.
                delete this.channelByAddr[key];
                delete this.addrByChannel[channel.number];
                // Do not reuse the channel number (no channelNumber--).
            }
            throw error;
        }
    }
    async channelBind(channelNumber, addr) {
        const request = new message_1.Message(const_1.methods.CHANNEL_BIND, const_1.classes.REQUEST);
        request
            .setAttribute("CHANNEL-NUMBER", channelNumber)
            .setAttribute("XOR-PEER-ADDRESS", addr);
        const [response] = await this.requestWithRetry(request, this.server);
        if (response.messageMethod !== const_1.methods.CHANNEL_BIND) {
            throw new Error("should be CHANNEL_BIND");
        }
    }
    async sendStun(message, addr) {
        await this.send(message.bytes, addr);
    }
    async close() {
        this.refreshHandle?.resolve?.();
        await this.transport.close();
    }
}
exports.TurnProtocol = TurnProtocol;
Object.defineProperty(TurnProtocol, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: "turn"
});
async function createTurnClient({ address, username, password }, { lifetime, portRange, interfaceAddresses, ssl, tlsOptions, transport: transportType, } = {}) {
    lifetime ?? (lifetime = DEFAULT_ALLOCATION_LIFETIME);
    transportType ?? (transportType = ssl ? "tls" : "udp");
    const transport = transportType === "udp"
        ? await common_1.UdpTransport.init("udp4", { portRange, interfaceAddresses })
        : transportType === "tcp"
            ? await common_1.TcpTransport.init(address)
            : await common_1.TlsTransport.init(address, tlsOptions);
    const turn = new TurnProtocol(address, username, password, lifetime, transport);
    await turn.connectionMade();
    return turn;
}
async function createStunOverTurnClient({ address, username, password, }, { lifetime, portRange, interfaceAddresses, ssl, tlsOptions, transport: transportType, } = {}) {
    const turn = await createTurnClient({
        address,
        username,
        password,
    }, {
        lifetime,
        portRange,
        interfaceAddresses,
        ssl,
        tlsOptions,
        transport: transportType,
    });
    const turnTransport = new StunOverTurnProtocol(turn);
    return turnTransport;
}
function makeIntegrityKey(username, realm, password) {
    return (0, auth_1.makeTurnIntegrityKey)(username, realm, password);
}
//# sourceMappingURL=protocol.js.map