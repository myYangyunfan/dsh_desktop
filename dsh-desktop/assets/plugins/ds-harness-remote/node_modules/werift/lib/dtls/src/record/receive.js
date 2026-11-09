"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePlainText = exports.parsePacket = void 0;
const alert_1 = require("../handshake/message/alert");
const common_1 = require("../imports/common");
const const_1 = require("./const");
const fragment_1 = require("./message/fragment");
const plaintext_1 = require("./message/plaintext");
const log = (0, common_1.debug)("werift-dtls : packages/dtls/record/receive.ts : log");
const err = (0, common_1.debug)("werift-dtls : packages/dtls/record/receive.ts : err");
const parsePacket = (data) => {
    let start = 0;
    const packets = [];
    while (data.length > start) {
        const fragmentLength = data.readUInt16BE(start + 11);
        if (data.length < start + (12 + fragmentLength)) {
            break;
        }
        const packet = plaintext_1.DtlsPlaintext.deSerialize(data.subarray(start));
        packets.push(packet);
        start += 13 + fragmentLength;
    }
    return packets;
};
exports.parsePacket = parsePacket;
const parsePlainText = (dtls, cipher) => (plain) => {
    const contentType = plain.recordLayerHeader.contentType;
    switch (contentType) {
        case const_1.ContentType.changeCipherSpec: {
            log(dtls.sessionId, "change cipher spec");
            return [
                {
                    type: const_1.ContentType.changeCipherSpec,
                    data: undefined,
                },
            ];
        }
        case const_1.ContentType.handshake: {
            let raw = plain.fragment;
            try {
                if (plain.recordLayerHeader.epoch > 0) {
                    log(dtls.sessionId, "decrypt handshake");
                    raw = cipher.decryptPacket(plain);
                }
            }
            catch (error) {
                err(dtls.sessionId, "decrypt failed", error);
                throw error;
            }
            try {
                let start = 0;
                const handshakes = [];
                while (raw.length > start) {
                    const handshake = fragment_1.FragmentedHandshake.deSerialize(raw.subarray(start));
                    handshakes.push({ type: const_1.ContentType.handshake, data: handshake });
                    start += handshake.fragment_length + 12;
                }
                return handshakes;
            }
            catch (error) {
                err(dtls.sessionId, "decSerialize failed", error, raw);
                throw error;
            }
        }
        case const_1.ContentType.applicationData: {
            return [
                {
                    type: const_1.ContentType.applicationData,
                    data: cipher.decryptPacket(plain),
                },
            ];
        }
        case const_1.ContentType.alert: {
            let alert = alert_1.Alert.deSerialize(plain.fragment);
            // TODO impl more better about handle encrypted alert
            if (const_1.AlertDesc[alert.description] == undefined) {
                const dec = cipher.decryptPacket(plain);
                alert = alert_1.Alert.deSerialize(dec);
            }
            err(dtls.sessionId, "ContentType.alert", alert, const_1.AlertDesc[alert.description], "flight", dtls.flight, "lastFlight", dtls.lastFlight);
            if (alert.level > 1) {
                throw new Error("alert fatal error");
            }
            return [{ type: const_1.ContentType.alert, data: undefined }];
        }
        default: {
            return [{ type: const_1.ContentType.alert, data: undefined }];
        }
    }
};
exports.parsePlainText = parsePlainText;
//# sourceMappingURL=receive.js.map