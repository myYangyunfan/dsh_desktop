"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.classes = exports.AttributeKeys = exports.RETRY_RTO = exports.RETRY_MAX = exports.IPV6_PROTOCOL = exports.IPV4_PROTOCOL = exports.INTEGRITY_LENGTH = exports.HEADER_LENGTH = exports.FINGERPRINT_XOR = exports.FINGERPRINT_LENGTH = exports.COOKIE = void 0;
exports.isComprehensionRequiredAttribute = isComprehensionRequiredAttribute;
exports.isStunMessage = isStunMessage;
exports.COOKIE = 0x2112a442;
exports.FINGERPRINT_LENGTH = 8;
exports.FINGERPRINT_XOR = 0x5354554e;
exports.HEADER_LENGTH = 20;
exports.INTEGRITY_LENGTH = 24;
exports.IPV4_PROTOCOL = 1;
exports.IPV6_PROTOCOL = 2;
exports.RETRY_MAX = 6;
exports.RETRY_RTO = 50;
exports.AttributeKeys = [
    "FINGERPRINT",
    "MESSAGE-INTEGRITY",
    "MESSAGE-INTEGRITY-SHA256",
    "CHANGE-REQUEST",
    "PRIORITY",
    "USERNAME",
    "USERHASH",
    "ICE-CONTROLLING",
    "SOURCE-ADDRESS",
    "USE-CANDIDATE",
    "ICE-CONTROLLED",
    "ERROR-CODE",
    "UNKNOWN-ATTRIBUTES",
    "XOR-MAPPED-ADDRESS",
    "CHANGED-ADDRESS",
    "LIFETIME",
    "REQUESTED-TRANSPORT",
    "NONCE",
    "REALM",
    "REQUESTED-ADDRESS-FAMILY",
    "EVEN-PORT",
    "PASSWORD-ALGORITHM",
    "PASSWORD-ALGORITHMS",
    "XOR-RELAYED-ADDRESS",
    "RESERVATION-TOKEN",
    "CHANNEL-NUMBER",
    "XOR-PEER-ADDRESS",
    "DATA",
    "SOFTWARE",
    "MAPPED-ADDRESS",
    "ALTERNATE-DOMAIN",
    "ALTERNATE-SERVER",
    "RESPONSE-ORIGIN",
    "OTHER-ADDRESS",
];
var classes;
(function (classes) {
    classes[classes["REQUEST"] = 0] = "REQUEST";
    classes[classes["INDICATION"] = 16] = "INDICATION";
    classes[classes["RESPONSE"] = 256] = "RESPONSE";
    classes[classes["ERROR"] = 272] = "ERROR";
})(classes || (exports.classes = classes = {}));
var methods;
(function (methods) {
    methods[methods["BINDING"] = 1] = "BINDING";
    methods[methods["SHARED_SECRET"] = 2] = "SHARED_SECRET";
    methods[methods["ALLOCATE"] = 3] = "ALLOCATE";
    methods[methods["REFRESH"] = 4] = "REFRESH";
    methods[methods["SEND"] = 6] = "SEND";
    methods[methods["DATA"] = 7] = "DATA";
    methods[methods["CREATE_PERMISSION"] = 8] = "CREATE_PERMISSION";
    methods[methods["CHANNEL_BIND"] = 9] = "CHANNEL_BIND";
})(methods || (exports.methods = methods = {}));
function isComprehensionRequiredAttribute(type) {
    return type >= 0x0000 && type <= 0x7fff;
}
function isStunMessage(data) {
    if (data.length < exports.HEADER_LENGTH) {
        return false;
    }
    if ((data[0] & 0xc0) !== 0) {
        return false;
    }
    if (data.readUInt32BE(4) !== exports.COOKIE) {
        return false;
    }
    const length = data.readUInt16BE(2);
    if (length % 4 !== 0) {
        return false;
    }
    return data.length === exports.HEADER_LENGTH + length;
}
//# sourceMappingURL=const.js.map