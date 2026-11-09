"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Flight6 = void 0;
const create_1 = require("../../cipher/create");
const prf_1 = require("../../cipher/prf");
const const_1 = require("../../handshake/const");
const certificate_1 = require("../../handshake/message/certificate");
const changeCipherSpec_1 = require("../../handshake/message/changeCipherSpec");
const certificateVerify_1 = require("../../handshake/message/client/certificateVerify");
const keyExchange_1 = require("../../handshake/message/client/keyExchange");
const finished_1 = require("../../handshake/message/finished");
const common_1 = require("../../imports/common");
const builder_1 = require("../../record/builder");
const const_2 = require("../../record/const");
const flight_1 = require("../flight");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/flight/server/flight6.ts");
class Flight6 extends flight_1.Flight {
    constructor(udp, dtls, cipher) {
        super(udp, dtls, 6);
        Object.defineProperty(this, "cipher", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cipher
        });
    }
    handleHandshake(handshake) {
        this.dtls.bufferHandshakeCache([handshake], false, 5);
        const message = (() => {
            switch (handshake.msg_type) {
                case const_1.HandshakeType.certificate_11:
                    return certificate_1.Certificate.deSerialize(handshake.fragment);
                case const_1.HandshakeType.certificate_verify_15:
                    return certificateVerify_1.CertificateVerify.deSerialize(handshake.fragment);
                case const_1.HandshakeType.client_key_exchange_16:
                    return keyExchange_1.ClientKeyExchange.deSerialize(handshake.fragment);
                case const_1.HandshakeType.finished_20:
                    return finished_1.Finished.deSerialize(handshake.fragment);
            }
        })();
        if (message) {
            const handler = handlers[message.msgType];
            if (!handler) {
                return;
            }
            handler({ dtls: this.dtls, cipher: this.cipher })(message);
        }
    }
    async exec() {
        if (this.dtls.flight === 6) {
            log(this.dtls.sessionId, "flight6 twice");
            this.send(this.dtls.lastMessage);
            return;
        }
        this.dtls.flight = 6;
        const messages = [this.sendChangeCipherSpec(), this.sendFinished()];
        this.dtls.lastMessage = messages;
        await this.transmit(messages);
    }
    sendChangeCipherSpec() {
        const changeCipherSpec = changeCipherSpec_1.ChangeCipherSpec.createEmpty().serialize();
        const packets = (0, builder_1.createPlaintext)(this.dtls)([{ type: const_2.ContentType.changeCipherSpec, fragment: changeCipherSpec }], ++this.dtls.recordSequenceNumber);
        const buf = Buffer.concat(packets.map((v) => v.serialize()));
        return buf;
    }
    sendFinished() {
        const cache = Buffer.concat(this.dtls.sortedHandshakeCache.map((v) => v.serialize()));
        const localVerifyData = this.cipher.verifyData(cache);
        const finish = new finished_1.Finished(localVerifyData);
        this.dtls.epoch = 1;
        const [packet] = this.createPacket([finish]);
        this.dtls.recordSequenceNumber = 0;
        const buf = this.cipher.encryptPacket(packet).serialize();
        return buf;
    }
}
exports.Flight6 = Flight6;
const handlers = {};
handlers[const_1.HandshakeType.client_key_exchange_16] =
    ({ cipher, dtls }) => (message) => {
        cipher.remoteKeyPair = {
            curve: cipher.namedCurve,
            publicKey: message.publicKey,
        };
        if (!cipher.remoteKeyPair.publicKey ||
            !cipher.localKeyPair ||
            !cipher.remoteRandom ||
            !cipher.localRandom)
            throw new Error("not exist");
        const preMasterSecret = (0, prf_1.prfPreMasterSecret)(cipher.remoteKeyPair.publicKey, cipher.localKeyPair.privateKey, cipher.localKeyPair.curve);
        log(dtls.sessionId, "extendedMasterSecret", dtls.options.extendedMasterSecret, dtls.remoteExtendedMasterSecret);
        const handshakes = Buffer.concat(dtls.sortedHandshakeCache.map((v) => v.serialize()));
        cipher.masterSecret =
            dtls.options.extendedMasterSecret && dtls.remoteExtendedMasterSecret
                ? (0, prf_1.prfExtendedMasterSecret)(preMasterSecret, handshakes)
                : (0, prf_1.prfMasterSecret)(preMasterSecret, cipher.remoteRandom.serialize(), cipher.localRandom.serialize());
        cipher.cipher = (0, create_1.createCipher)(cipher.cipherSuite);
        cipher.cipher.init(cipher.masterSecret, cipher.localRandom.serialize(), cipher.remoteRandom.serialize());
        log(dtls.sessionId, "setup cipher", cipher.cipher.summary);
    };
handlers[const_1.HandshakeType.certificate_11] =
    ({ cipher, dtls }) => (message) => {
        log(dtls.sessionId, "handshake certificate", message);
        cipher.remoteCertificate = message.certificateList[0];
    };
handlers[const_1.HandshakeType.certificate_verify_15] =
    ({ cipher, dtls }) => (message) => {
        if (!cipher.remoteCertificate) {
            throw new Error("client certificate missing before certificate verify");
        }
        log(dtls.sessionId, "certificate_verify", message.algorithm);
    };
handlers[const_1.HandshakeType.finished_20] =
    ({ dtls }) => (message) => {
        log(dtls.sessionId, "finished", message);
    };
//# sourceMappingURL=flight6.js.map