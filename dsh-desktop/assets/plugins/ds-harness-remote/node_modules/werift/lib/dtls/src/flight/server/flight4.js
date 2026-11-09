"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Flight4 = void 0;
const const_1 = require("../../cipher/const");
const extendedMasterSecret_1 = require("../../handshake/extensions/extendedMasterSecret");
const renegotiationIndication_1 = require("../../handshake/extensions/renegotiationIndication");
const useSrtp_1 = require("../../handshake/extensions/useSrtp");
const certificate_1 = require("../../handshake/message/certificate");
const certificateRequest_1 = require("../../handshake/message/server/certificateRequest");
const hello_1 = require("../../handshake/message/server/hello");
const helloDone_1 = require("../../handshake/message/server/helloDone");
const keyExchange_1 = require("../../handshake/message/server/keyExchange");
const common_1 = require("../../imports/common");
const flight_1 = require("../flight");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/flight/server/flight4.ts : log");
class Flight4 extends flight_1.Flight {
    constructor(udp, dtls, cipher, srtp) {
        super(udp, dtls, 4, 6);
        Object.defineProperty(this, "cipher", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cipher
        });
        Object.defineProperty(this, "srtp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: srtp
        });
    }
    async exec(clientHello, certificateRequest = false) {
        if (this.dtls.flight === 4) {
            log(this.dtls.sessionId, "flight4 twice");
            this.send(this.dtls.lastMessage);
            return;
        }
        this.dtls.flight = 4;
        this.dtls.sequenceNumber = 1;
        this.dtls.bufferHandshakeCache([clientHello], false, 4);
        const messages = [
            this.sendServerHello(),
            this.sendCertificate(),
            this.sendServerKeyExchange(),
            certificateRequest && this.sendCertificateRequest(),
            this.sendServerHelloDone(),
        ].filter((v) => v);
        this.dtls.lastMessage = messages;
        await this.transmit(messages);
    }
    sendServerHello() {
        // todo fix; should use socket.extensions
        const extensions = [];
        if (this.srtp.srtpProfile) {
            extensions.push(useSrtp_1.UseSRTP.create([this.srtp.srtpProfile], Buffer.from([0x00])).extension);
        }
        if (this.dtls.options.extendedMasterSecret) {
            extensions.push({
                type: extendedMasterSecret_1.ExtendedMasterSecret.type,
                data: Buffer.alloc(0),
            });
        }
        const renegotiationIndication = renegotiationIndication_1.RenegotiationIndication.createEmpty();
        extensions.push(renegotiationIndication.extension);
        const serverHello = new hello_1.ServerHello(this.dtls.version, this.cipher.localRandom, Buffer.from([0x00]), this.cipher.cipherSuite, 0, // do not compression
        extensions);
        const packets = this.createPacket([serverHello]);
        return Buffer.concat(packets.map((v) => v.serialize()));
    }
    // 7.4.2 Server Certificate
    sendCertificate() {
        const certificate = new certificate_1.Certificate([Buffer.from(this.cipher.localCert)]);
        const packets = this.createPacket([certificate]);
        return Buffer.concat(packets.map((v) => v.serialize()));
    }
    sendServerKeyExchange() {
        const signature = this.cipher.generateKeySignature("sha256");
        if (!this.cipher.signatureHashAlgorithm)
            throw new Error("not exist");
        const keyExchange = new keyExchange_1.ServerKeyExchange(const_1.CurveType.named_curve_3, this.cipher.namedCurve, this.cipher.localKeyPair.publicKey.length, this.cipher.localKeyPair.publicKey, this.cipher.signatureHashAlgorithm.hash, this.cipher.signatureHashAlgorithm.signature, signature.length, signature);
        const packets = this.createPacket([keyExchange]);
        return Buffer.concat(packets.map((v) => v.serialize()));
    }
    // 7.4.4.  Certificate Request
    sendCertificateRequest() {
        const handshake = new certificateRequest_1.ServerCertificateRequest(const_1.certificateTypes, const_1.signatures, []);
        log(this.dtls.sessionId, "sendCertificateRequest", handshake);
        const packets = this.createPacket([handshake]);
        return Buffer.concat(packets.map((v) => v.serialize()));
    }
    sendServerHelloDone() {
        const handshake = new helloDone_1.ServerHelloDone();
        const packets = this.createPacket([handshake]);
        return Buffer.concat(packets.map((v) => v.serialize()));
    }
}
exports.Flight4 = Flight4;
//# sourceMappingURL=flight4.js.map