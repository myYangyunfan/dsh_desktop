"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Flight5 = void 0;
const const_1 = require("../../cipher/const");
const create_1 = require("../../cipher/create");
const namedCurve_1 = require("../../cipher/namedCurve");
const prf_1 = require("../../cipher/prf");
const srtp_1 = require("../../context/srtp");
const const_2 = require("../../handshake/const");
const extendedMasterSecret_1 = require("../../handshake/extensions/extendedMasterSecret");
const renegotiationIndication_1 = require("../../handshake/extensions/renegotiationIndication");
const useSrtp_1 = require("../../handshake/extensions/useSrtp");
const certificate_1 = require("../../handshake/message/certificate");
const changeCipherSpec_1 = require("../../handshake/message/changeCipherSpec");
const certificateVerify_1 = require("../../handshake/message/client/certificateVerify");
const keyExchange_1 = require("../../handshake/message/client/keyExchange");
const finished_1 = require("../../handshake/message/finished");
const certificateRequest_1 = require("../../handshake/message/server/certificateRequest");
const hello_1 = require("../../handshake/message/server/hello");
const helloDone_1 = require("../../handshake/message/server/helloDone");
const keyExchange_2 = require("../../handshake/message/server/keyExchange");
const random_1 = require("../../handshake/random");
const rtp_1 = require("../../imports/rtp");
const builder_1 = require("../../record/builder");
const const_3 = require("../../record/const");
const flight_1 = require("../flight");
const log = (0, rtp_1.debug)("werift-dtls : packages/dtls/src/flight/client/flight5.ts : log");
class Flight5 extends flight_1.Flight {
    constructor(udp, dtls, cipher, srtp) {
        super(udp, dtls, 5, 7);
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
    handleHandshake(handshake) {
        this.dtls.bufferHandshakeCache([handshake], false, 4);
        const message = (() => {
            switch (handshake.msg_type) {
                case const_2.HandshakeType.server_hello_2:
                    return hello_1.ServerHello.deSerialize(handshake.fragment);
                case const_2.HandshakeType.certificate_11:
                    return certificate_1.Certificate.deSerialize(handshake.fragment);
                case const_2.HandshakeType.server_key_exchange_12:
                    return keyExchange_2.ServerKeyExchange.deSerialize(handshake.fragment);
                case const_2.HandshakeType.certificate_request_13:
                    return certificateRequest_1.ServerCertificateRequest.deSerialize(handshake.fragment);
                case const_2.HandshakeType.server_hello_done_14:
                    return helloDone_1.ServerHelloDone.deSerialize(handshake.fragment);
            }
        })();
        if (message) {
            handlers[message.msgType]({
                dtls: this.dtls,
                cipher: this.cipher,
                srtp: this.srtp,
            })(message);
        }
    }
    async exec() {
        if (this.dtls.flight === 5) {
            log(this.dtls.sessionId, "flight5 twice");
            this.send(this.dtls.lastMessage);
            return;
        }
        this.dtls.flight = 5;
        const needCertificate = this.dtls.requestedCertificateTypes.length > 0;
        log(this.dtls.sessionId, "send flight5", needCertificate);
        const messages = [
            needCertificate && this.sendCertificate(),
            this.sendClientKeyExchange(),
            needCertificate && this.sendCertificateVerify(),
            this.sendChangeCipherSpec(),
            this.sendFinished(),
        ].filter((v) => v);
        this.dtls.lastMessage = messages;
        await this.transmit(messages);
    }
    sendCertificate() {
        const certificate = new certificate_1.Certificate([Buffer.from(this.cipher.localCert)]);
        const packets = this.createPacket([certificate]);
        const buf = Buffer.concat(packets.map((v) => v.serialize()));
        return buf;
    }
    sendClientKeyExchange() {
        if (!this.cipher.localKeyPair)
            throw new Error();
        const clientKeyExchange = new keyExchange_1.ClientKeyExchange(this.cipher.localKeyPair.publicKey);
        const packets = this.createPacket([clientKeyExchange]);
        const buf = Buffer.concat(packets.map((v) => v.serialize()));
        const localKeyPair = this.cipher.localKeyPair;
        const remoteKeyPair = this.cipher.remoteKeyPair;
        if (!remoteKeyPair.publicKey)
            throw new Error("not exist");
        const preMasterSecret = (0, prf_1.prfPreMasterSecret)(remoteKeyPair.publicKey, localKeyPair.privateKey, localKeyPair.curve);
        log(this.dtls.sessionId, "extendedMasterSecret", this.dtls.options.extendedMasterSecret, this.dtls.remoteExtendedMasterSecret);
        const handshakes = Buffer.concat(this.dtls.sortedHandshakeCache.map((v) => v.serialize()));
        this.cipher.masterSecret =
            this.dtls.options.extendedMasterSecret &&
                this.dtls.remoteExtendedMasterSecret
                ? (0, prf_1.prfExtendedMasterSecret)(preMasterSecret, handshakes)
                : (0, prf_1.prfMasterSecret)(preMasterSecret, this.cipher.localRandom.serialize(), this.cipher.remoteRandom.serialize());
        this.cipher.cipher = (0, create_1.createCipher)(this.cipher.cipherSuite);
        this.cipher.cipher.init(this.cipher.masterSecret, this.cipher.remoteRandom.serialize(), this.cipher.localRandom.serialize());
        log(this.dtls.sessionId, "cipher", this.cipher.cipher.summary);
        return buf;
    }
    sendCertificateVerify() {
        const cache = Buffer.concat(this.dtls.sortedHandshakeCache.map((v) => v.serialize()));
        const signed = this.cipher.signatureData(cache, "sha256");
        const signatureScheme = (() => {
            switch (this.cipher.signatureHashAlgorithm?.signature) {
                case const_1.SignatureAlgorithm.ecdsa_3:
                    return const_1.SignatureScheme.ecdsa_secp256r1_sha256;
                case const_1.SignatureAlgorithm.rsa_1:
                    return const_1.SignatureScheme.rsa_pkcs1_sha256;
            }
        })();
        if (!signatureScheme)
            throw new Error();
        log(this.dtls.sessionId, "signatureScheme", this.cipher.signatureHashAlgorithm?.signature, signatureScheme);
        const certificateVerify = new certificateVerify_1.CertificateVerify(signatureScheme, signed);
        const packets = this.createPacket([certificateVerify]);
        const buf = Buffer.concat(packets.map((v) => v.serialize()));
        return buf;
    }
    sendChangeCipherSpec() {
        const changeCipherSpec = changeCipherSpec_1.ChangeCipherSpec.createEmpty().serialize();
        const packets = (0, builder_1.createPlaintext)(this.dtls)([{ type: const_3.ContentType.changeCipherSpec, fragment: changeCipherSpec }], ++this.dtls.recordSequenceNumber);
        const buf = Buffer.concat(packets.map((v) => v.serialize()));
        return buf;
    }
    sendFinished() {
        const cache = Buffer.concat(this.dtls.sortedHandshakeCache.map((v) => v.serialize()));
        const localVerifyData = this.cipher.verifyData(cache);
        const finish = new finished_1.Finished(localVerifyData);
        this.dtls.epoch = 1;
        const [packet] = this.createPacket([finish]);
        // log(
        //   this.dtls.sessionId,
        //   "raw finish packet",
        //   packet.summary,
        //   this.dtls.sortedHandshakeCache.map((h) => h.summary),
        // );
        this.dtls.recordSequenceNumber = 0;
        const buf = this.cipher.encryptPacket(packet).serialize();
        log(this.dtls.sessionId, "finished", this.cipher.cipher.summary);
        return buf;
    }
}
exports.Flight5 = Flight5;
const handlers = {};
handlers[const_2.HandshakeType.server_hello_2] =
    ({ cipher, srtp, dtls }) => (message) => {
        log(dtls.sessionId, "serverHello", message.cipherSuite);
        cipher.remoteRandom = random_1.DtlsRandom.from(message.random);
        cipher.cipherSuite = message.cipherSuite;
        log(dtls.sessionId, "selected cipherSuite", cipher.cipherSuite);
        if (message.extensions) {
            message.extensions.forEach((extension) => {
                switch (extension.type) {
                    case useSrtp_1.UseSRTP.type:
                        {
                            const useSrtp = useSrtp_1.UseSRTP.fromData(extension.data);
                            const profile = srtp_1.SrtpContext.findMatchingSRTPProfile(useSrtp.profiles, dtls.options.srtpProfiles || []);
                            log(dtls.sessionId, "selected srtp profile", profile);
                            if (profile == undefined)
                                return;
                            srtp.srtpProfile = profile;
                        }
                        break;
                    case extendedMasterSecret_1.ExtendedMasterSecret.type:
                        dtls.remoteExtendedMasterSecret = true;
                        break;
                    case renegotiationIndication_1.RenegotiationIndication.type:
                        log(dtls.sessionId, "RenegotiationIndication");
                        break;
                }
            });
        }
    };
handlers[const_2.HandshakeType.certificate_11] =
    ({ cipher, dtls }) => (message) => {
        log(dtls.sessionId, "handshake certificate", message);
        cipher.remoteCertificate = message.certificateList[0];
    };
handlers[const_2.HandshakeType.server_key_exchange_12] =
    ({ cipher, dtls }) => (message) => {
        if (!cipher.localRandom || !cipher.remoteRandom)
            throw new Error();
        log(dtls.sessionId, "ServerKeyExchange", message);
        log(dtls.sessionId, "selected curve", message.namedCurve);
        cipher.remoteKeyPair = {
            curve: message.namedCurve,
            publicKey: message.publicKey,
        };
        cipher.localKeyPair = (0, namedCurve_1.generateKeyPair)(message.namedCurve);
    };
handlers[const_2.HandshakeType.certificate_request_13] =
    ({ dtls }) => (message) => {
        log(dtls.sessionId, "certificate_request", message);
        dtls.requestedCertificateTypes = message.certificateTypes;
        dtls.requestedSignatureAlgorithms = message.signatures;
    };
handlers[const_2.HandshakeType.server_hello_done_14] =
    ({ dtls }) => (msg) => {
        log(dtls.sessionId, "server_hello_done", msg);
    };
//# sourceMappingURL=flight5.js.map