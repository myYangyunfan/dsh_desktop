"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtlsSocket = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const promises_1 = require("timers/promises");
const common_1 = require("./imports/common");
const const_1 = require("./cipher/const");
const prf_1 = require("./cipher/prf");
const abstract_1 = require("./cipher/suites/abstract");
const cipher_1 = require("./context/cipher");
const dtls_1 = require("./context/dtls");
const srtp_1 = require("./context/srtp");
const transport_1 = require("./context/transport");
const ellipticCurves_1 = require("./handshake/extensions/ellipticCurves");
const extendedMasterSecret_1 = require("./handshake/extensions/extendedMasterSecret");
const renegotiationIndication_1 = require("./handshake/extensions/renegotiationIndication");
const signature_1 = require("./handshake/extensions/signature");
const useSrtp_1 = require("./handshake/extensions/useSrtp");
const builder_1 = require("./record/builder");
const const_2 = require("./record/const");
const fragment_1 = require("./record/message/fragment");
const receive_1 = require("./record/receive");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/src/socket.ts : log");
const err = (0, common_1.debug)("werift-dtls : packages/dtls/src/socket.ts : err");
class DtlsSocket {
    constructor(options, sessionType) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "sessionType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sessionType
        });
        Object.defineProperty(this, "onConnect", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onError", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "onClose", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new common_1.Event()
        });
        Object.defineProperty(this, "transport", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cipher", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "dtls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "srtp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new srtp_1.SrtpContext()
        });
        Object.defineProperty(this, "connected", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "extensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "onHandleHandshakes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bufferFragmentedHandshakes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "udpOnMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (data) => {
                const packets = (0, receive_1.parsePacket)(data);
                for (const packet of packets) {
                    try {
                        const messages = (0, receive_1.parsePlainText)(this.dtls, this.cipher)(packet);
                        for (const message of messages) {
                            switch (message.type) {
                                case const_2.ContentType.handshake:
                                    {
                                        const handshake = message.data;
                                        const handshakes = this.handleFragmentHandshake([handshake]);
                                        const assembled = Object.values(handshakes.reduce((acc, cur) => {
                                            if (!acc[cur.msg_type])
                                                acc[cur.msg_type] = [];
                                            acc[cur.msg_type].push(cur);
                                            return acc;
                                        }, {}))
                                            .map((v) => fragment_1.FragmentedHandshake.assemble(v))
                                            .sort((a, b) => a.msg_type - b.msg_type);
                                        this.onHandleHandshakes(assembled).catch((error) => {
                                            err(this.dtls.sessionId, "onHandleHandshakes error", error);
                                            this.onError.execute(error);
                                        });
                                    }
                                    break;
                                case const_2.ContentType.applicationData:
                                    {
                                        this.onData.execute(message.data);
                                    }
                                    break;
                                case const_2.ContentType.alert:
                                    this.onClose.execute();
                                    break;
                            }
                        }
                    }
                    catch (error) {
                        err(this.dtls.sessionId, "catch udpOnMessage error", error);
                    }
                }
            }
        });
        Object.defineProperty(this, "waitForReady", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (condition) => new Promise(async (r, f) => {
                for (let i = 0; i < 10; i++) {
                    if (condition()) {
                        r();
                        break;
                    }
                    else {
                        await (0, promises_1.setTimeout)(100 * i);
                    }
                }
                f("waitForReady timeout");
            })
        });
        /**send application data */
        Object.defineProperty(this, "send", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (buf, addr) => {
                const pkt = (0, builder_1.createPlaintext)(this.dtls)([{ type: const_2.ContentType.applicationData, fragment: buf }], ++this.dtls.recordSequenceNumber)[0];
                await this.transport.send(this.cipher.encryptPacket(pkt).serialize(), addr);
            }
        });
        this.dtls = new dtls_1.DtlsContext(this.options, this.sessionType);
        this.cipher = new cipher_1.CipherContext(this.sessionType, this.options.cert, this.options.key, this.options.signatureHash);
        this.transport = new transport_1.TransportContext(this.options.transport);
        this.setupExtensions();
        this.transport.socket.onData = this.udpOnMessage;
    }
    renegotiation() {
        log("renegotiation", this.sessionType);
        this.connected = false;
        this.cipher = new cipher_1.CipherContext(this.sessionType, this.options.cert, this.options.key, this.options.signatureHash);
        this.dtls = new dtls_1.DtlsContext(this.options, this.sessionType);
        this.srtp = new srtp_1.SrtpContext();
        this.extensions = [];
        this.bufferFragmentedHandshakes = [];
    }
    setupExtensions() {
        log(this.dtls.sessionId, "support srtpProfiles", this.options.srtpProfiles);
        if (this.options.srtpProfiles && this.options.srtpProfiles.length > 0) {
            const useSrtp = useSrtp_1.UseSRTP.create(this.options.srtpProfiles, Buffer.from([0x00]));
            this.extensions.push(useSrtp.extension);
        }
        {
            const curve = ellipticCurves_1.EllipticCurves.createEmpty();
            curve.data = const_1.NamedCurveAlgorithmList;
            this.extensions.push(curve.extension);
        }
        {
            const signature = signature_1.Signature.createEmpty();
            // libwebrtc/OpenSSL require 4=1 , 4=3 signatureHash
            signature.data = const_1.signatures;
            this.extensions.push(signature.extension);
        }
        if (this.options.extendedMasterSecret) {
            this.extensions.push({
                type: extendedMasterSecret_1.ExtendedMasterSecret.type,
                data: Buffer.alloc(0),
            });
        }
        {
            const renegotiationIndication = renegotiationIndication_1.RenegotiationIndication.createEmpty();
            this.extensions.push(renegotiationIndication.extension);
        }
    }
    handleFragmentHandshake(messages) {
        let handshakes = messages.filter((v) => {
            // find fragmented
            if (v.fragment_length !== v.length) {
                this.bufferFragmentedHandshakes.push(v);
                return false;
            }
            return true;
        });
        if (this.bufferFragmentedHandshakes.length > 1) {
            const [last] = this.bufferFragmentedHandshakes.slice(-1);
            if (last.fragment_offset + last.fragment_length === last.length) {
                handshakes = [...this.bufferFragmentedHandshakes, ...handshakes];
                this.bufferFragmentedHandshakes = [];
            }
        }
        return handshakes; // return un fragmented handshakes
    }
    close() {
        this.transport.socket.close();
    }
    extractSessionKeys(keyLength, saltLength) {
        const keyingMaterial = this.exportKeyingMaterial("EXTRACTOR-dtls_srtp", keyLength * 2 + saltLength * 2);
        const { clientKey, serverKey, clientSalt, serverSalt } = (0, binary_data_1.decode)(keyingMaterial, {
            clientKey: binary_data_1.types.buffer(keyLength),
            serverKey: binary_data_1.types.buffer(keyLength),
            clientSalt: binary_data_1.types.buffer(saltLength),
            serverSalt: binary_data_1.types.buffer(saltLength),
        });
        if (this.sessionType === abstract_1.SessionType.CLIENT) {
            return {
                localKey: clientKey,
                localSalt: clientSalt,
                remoteKey: serverKey,
                remoteSalt: serverSalt,
            };
        }
        else {
            return {
                localKey: serverKey,
                localSalt: serverSalt,
                remoteKey: clientKey,
                remoteSalt: clientSalt,
            };
        }
    }
    exportKeyingMaterial(label, length) {
        return (0, prf_1.exportKeyingMaterial)(label, length, this.cipher.masterSecret, this.cipher.localRandom.serialize(), this.cipher.remoteRandom.serialize(), this.sessionType === abstract_1.SessionType.CLIENT);
    }
    get remoteCertificate() {
        return this.cipher.remoteCertificate;
    }
}
exports.DtlsSocket = DtlsSocket;
//# sourceMappingURL=socket.js.map