"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlaintext = exports.createFragments = void 0;
const plaintext_1 = require("./message/plaintext");
const createFragments = (dtls) => (handshakes) => {
    dtls.lastFlight = handshakes;
    return handshakes.flatMap((handshake) => {
        handshake.messageSeq = dtls.sequenceNumber++;
        const fragment = handshake.toFragment();
        const fragments = fragment.chunk();
        return fragments;
    });
};
exports.createFragments = createFragments;
const createPlaintext = (dtls) => (fragments, recordSequenceNumber) => {
    return fragments.map((msg) => {
        const plaintext = new plaintext_1.DtlsPlaintext({
            contentType: msg.type,
            protocolVersion: dtls.version,
            epoch: dtls.epoch,
            sequenceNumber: recordSequenceNumber,
            contentLen: msg.fragment.length,
        }, msg.fragment);
        return plaintext;
    });
};
exports.createPlaintext = createPlaintext;
//# sourceMappingURL=builder.js.map