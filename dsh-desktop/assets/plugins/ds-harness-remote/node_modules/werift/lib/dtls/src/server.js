"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtlsServer = void 0;
const abstract_1 = require("./cipher/suites/abstract");
const flight2_1 = require("./flight/server/flight2");
const flight4_1 = require("./flight/server/flight4");
const flight6_1 = require("./flight/server/flight6");
const const_1 = require("./handshake/const");
const hello_1 = require("./handshake/message/client/hello");
const common_1 = require("./imports/common");
const socket_1 = require("./socket");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/src/server.ts : log");
class DtlsServer extends socket_1.DtlsSocket {
    constructor(options) {
        super(options, abstract_1.SessionType.SERVER);
        Object.defineProperty(this, "flight6", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "handleHandshakes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (assembled) => {
                log(this.dtls.sessionId, "handleHandshakes", assembled.map((a) => a.msg_type));
                for (const handshake of assembled) {
                    switch (handshake.msg_type) {
                        // flight1,3
                        case const_1.HandshakeType.client_hello_1:
                            {
                                if (this.connected) {
                                    this.renegotiation();
                                }
                                const clientHello = hello_1.ClientHello.deSerialize(handshake.fragment);
                                if (clientHello.cookie.length === 0) {
                                    log(this.dtls.sessionId, "send flight2");
                                    (0, flight2_1.flight2)(this.transport, this.dtls, this.cipher, this.srtp)(clientHello);
                                }
                                else if (this.dtls.cookie &&
                                    clientHello.cookie.equals(this.dtls.cookie)) {
                                    log(this.dtls.sessionId, "send flight4");
                                    await new flight4_1.Flight4(this.transport, this.dtls, this.cipher, this.srtp).exec(handshake, this.options.certificateRequest);
                                }
                                else {
                                    log("wrong state", {
                                        dtlsCookie: this.dtls.cookie?.toString("hex").slice(10),
                                        helloCookie: clientHello.cookie.toString("hex").slice(10),
                                    });
                                }
                            }
                            break;
                        // flight 5
                        case const_1.HandshakeType.certificate_11:
                        case const_1.HandshakeType.certificate_verify_15:
                        case const_1.HandshakeType.client_key_exchange_16:
                            {
                                if (this.connected)
                                    return;
                                this.flight6 = new flight6_1.Flight6(this.transport, this.dtls, this.cipher);
                                this.flight6.handleHandshake(handshake);
                            }
                            break;
                        case const_1.HandshakeType.finished_20:
                            {
                                await this.waitForReady(() => !!this.flight6);
                                this.flight6?.handleHandshake(handshake);
                                const requiredHandshakes = [
                                    16,
                                    this.options.certificateRequest && 11,
                                    this.options.certificateRequest && 15,
                                ].filter((type) => typeof type === "number");
                                await this.waitForReady(() => this.dtls.checkHandshakesExist(requiredHandshakes));
                                await this.flight6?.exec();
                                this.connected = true;
                                this.onConnect.execute();
                                log(this.dtls.sessionId, "dtls connected");
                            }
                            break;
                    }
                }
            }
        });
        this.onHandleHandshakes = this.handleHandshakes;
        log(this.dtls.sessionId, "start server");
    }
}
exports.DtlsServer = DtlsServer;
//# sourceMappingURL=server.js.map