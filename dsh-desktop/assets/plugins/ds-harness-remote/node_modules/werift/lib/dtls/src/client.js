"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtlsClient = void 0;
const abstract_1 = require("./cipher/suites/abstract");
const flight1_1 = require("./flight/client/flight1");
const flight3_1 = require("./flight/client/flight3");
const flight5_1 = require("./flight/client/flight5");
const const_1 = require("./handshake/const");
const helloVerifyRequest_1 = require("./handshake/message/server/helloVerifyRequest");
const common_1 = require("./imports/common");
const socket_1 = require("./socket");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/src/client.ts : log");
class DtlsClient extends socket_1.DtlsSocket {
    constructor(options) {
        super(options, abstract_1.SessionType.CLIENT);
        Object.defineProperty(this, "flight5", {
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
                        // flight2
                        case const_1.HandshakeType.hello_verify_request_3:
                            {
                                const verifyReq = helloVerifyRequest_1.ServerHelloVerifyRequest.deSerialize(handshake.fragment);
                                await new flight3_1.Flight3(this.transport, this.dtls).exec(verifyReq);
                            }
                            break;
                        // flight 4
                        case const_1.HandshakeType.server_hello_2:
                            {
                                if (this.connected)
                                    return;
                                this.flight5 = new flight5_1.Flight5(this.transport, this.dtls, this.cipher, this.srtp);
                                this.flight5.handleHandshake(handshake);
                            }
                            break;
                        case const_1.HandshakeType.certificate_11:
                        case const_1.HandshakeType.server_key_exchange_12:
                        case const_1.HandshakeType.certificate_request_13:
                            {
                                await this.waitForReady(() => !!this.flight5);
                                this.flight5?.handleHandshake(handshake);
                            }
                            break;
                        case const_1.HandshakeType.server_hello_done_14:
                            {
                                await this.waitForReady(() => !!this.flight5);
                                this.flight5?.handleHandshake(handshake);
                                const targets = [
                                    11,
                                    12,
                                    this.options.certificateRequest && 13,
                                ].filter((n) => typeof n === "number");
                                await this.waitForReady(() => this.dtls.checkHandshakesExist(targets));
                                await this.flight5?.exec();
                            }
                            break;
                        // flight 6
                        case const_1.HandshakeType.finished_20:
                            {
                                this.dtls.flight = 7;
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
        log(this.dtls.sessionId, "start client");
    }
    async connect() {
        await new flight1_1.Flight1(this.transport, this.dtls, this.cipher).exec(this.extensions);
    }
}
exports.DtlsClient = DtlsClient;
//# sourceMappingURL=client.js.map