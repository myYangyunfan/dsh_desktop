"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flight2 = void 0;
const crypto_1 = require("crypto");
const const_1 = require("../../cipher/const");
const namedCurve_1 = require("../../cipher/namedCurve");
const srtp_1 = require("../../context/srtp");
const ellipticCurves_1 = require("../../handshake/extensions/ellipticCurves");
const extendedMasterSecret_1 = require("../../handshake/extensions/extendedMasterSecret");
const renegotiationIndication_1 = require("../../handshake/extensions/renegotiationIndication");
const signature_1 = require("../../handshake/extensions/signature");
const useSrtp_1 = require("../../handshake/extensions/useSrtp");
const helloVerifyRequest_1 = require("../../handshake/message/server/helloVerifyRequest");
const random_1 = require("../../handshake/random");
const rtp_1 = require("../../imports/rtp");
const builder_1 = require("../../record/builder");
const const_2 = require("../../record/const");
const log = (0, rtp_1.debug)("werift-dtls : packages/dtls/flight/server/flight2.ts : log");
// HelloVerifyRequest do not retransmit
const flight2 = (udp, dtls, cipher, srtp) => (clientHello) => {
    log("dtls version", clientHello.clientVersion);
    dtls.flight = 2;
    // if flight 2 restarts due to packet loss, sequence numbers are reused from the top:
    // https://datatracker.ietf.org/doc/html/rfc6347#section-4.2.2
    // The first message each side transmits in each handshake always has
    // message_seq = 0.  Whenever each new message is generated, the
    // message_seq value is incremented by one.  Note that in the case of a
    // rehandshake, this implies that the HelloRequest will have message_seq = 0
    // and the ServerHello will have message_seq = 1.  When a message is
    // retransmitted, the same message_seq value is used.
    dtls.recordSequenceNumber = 0;
    dtls.sequenceNumber = 0;
    clientHello.extensions.forEach((extension) => {
        switch (extension.type) {
            case ellipticCurves_1.EllipticCurves.type:
                {
                    const curves = ellipticCurves_1.EllipticCurves.fromData(extension.data).data;
                    log(dtls.sessionId, "curves", curves);
                    const curve = curves.filter((curve) => const_1.NamedCurveAlgorithmList.includes(curve))[0];
                    cipher.namedCurve = curve;
                    log(dtls.sessionId, "curve selected", cipher.namedCurve);
                }
                break;
            case signature_1.Signature.type:
                {
                    if (!cipher.signatureHashAlgorithm)
                        throw new Error("need to set certificate");
                    const signatureHash = signature_1.Signature.fromData(extension.data).data;
                    log(dtls.sessionId, "hash,signature", signatureHash);
                    const signature = signatureHash.find((v) => v.signature === cipher.signatureHashAlgorithm?.signature)?.signature;
                    const hash = signatureHash.find((v) => v.hash === cipher.signatureHashAlgorithm?.hash)?.hash;
                    if (signature == undefined || hash == undefined) {
                        throw new Error("invalid signatureHash");
                    }
                }
                break;
            case useSrtp_1.UseSRTP.type:
                {
                    if (!dtls.options?.srtpProfiles)
                        return;
                    if (dtls.options.srtpProfiles.length === 0)
                        return;
                    const useSrtp = useSrtp_1.UseSRTP.fromData(extension.data);
                    log(dtls.sessionId, "srtp profiles", useSrtp.profiles);
                    const profile = srtp_1.SrtpContext.findMatchingSRTPProfile(useSrtp.profiles, dtls.options?.srtpProfiles);
                    if (!profile) {
                        throw new Error();
                    }
                    srtp.srtpProfile = profile;
                    log(dtls.sessionId, "srtp profile selected", srtp.srtpProfile);
                }
                break;
            case extendedMasterSecret_1.ExtendedMasterSecret.type:
                {
                    dtls.remoteExtendedMasterSecret = true;
                }
                break;
            case renegotiationIndication_1.RenegotiationIndication.type:
                {
                    log(dtls.sessionId, "RenegotiationIndication", extension.data);
                }
                break;
            case 43:
                {
                    // todo dtls1.3
                    const data = extension.data.subarray(1);
                    const versions = [...data].map((v) => v.toString(10));
                    log("dtls supported version", versions);
                }
                break;
        }
    });
    cipher.localRandom = new random_1.DtlsRandom();
    cipher.remoteRandom = random_1.DtlsRandom.from(clientHello.random);
    const suites = clientHello.cipherSuites;
    log(dtls.sessionId, "cipher suites", suites);
    const suite = (() => {
        switch (cipher.signatureHashAlgorithm?.signature) {
            case const_1.SignatureAlgorithm.ecdsa_3:
                return const_1.CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256_49195;
            case const_1.SignatureAlgorithm.rsa_1:
                return const_1.CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256_49199;
        }
    })();
    if (suite === undefined || !suites.includes(suite)) {
        throw new Error("dtls cipher suite negotiation failed");
    }
    cipher.cipherSuite = suite;
    log(dtls.sessionId, "selected cipherSuite", cipher.cipherSuite);
    cipher.localKeyPair = (0, namedCurve_1.generateKeyPair)(cipher.namedCurve);
    dtls.cookie || (dtls.cookie = (0, crypto_1.randomBytes)(20));
    const helloVerifyReq = new helloVerifyRequest_1.ServerHelloVerifyRequest({
        major: 255 - 1,
        minor: 255 - 2,
    }, dtls.cookie);
    const fragments = (0, builder_1.createFragments)(dtls)([helloVerifyReq]);
    const packets = (0, builder_1.createPlaintext)(dtls)(fragments.map((fragment) => ({
        type: const_2.ContentType.handshake,
        fragment: fragment.serialize(),
    })), ++dtls.recordSequenceNumber);
    const chunk = packets.map((v) => v.serialize());
    for (const buf of chunk) {
        udp.send(buf);
    }
};
exports.flight2 = flight2;
//# sourceMappingURL=flight2.js.map