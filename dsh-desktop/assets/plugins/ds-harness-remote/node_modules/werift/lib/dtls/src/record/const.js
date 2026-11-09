"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertDesc = exports.ContentType = void 0;
var ContentType;
(function (ContentType) {
    ContentType[ContentType["changeCipherSpec"] = 20] = "changeCipherSpec";
    ContentType[ContentType["alert"] = 21] = "alert";
    ContentType[ContentType["handshake"] = 22] = "handshake";
    ContentType[ContentType["applicationData"] = 23] = "applicationData";
})(ContentType || (exports.ContentType = ContentType = {}));
var AlertDesc;
(function (AlertDesc) {
    AlertDesc[AlertDesc["CloseNotify"] = 0] = "CloseNotify";
    AlertDesc[AlertDesc["UnexpectedMessage"] = 10] = "UnexpectedMessage";
    AlertDesc[AlertDesc["BadRecordMac"] = 20] = "BadRecordMac";
    AlertDesc[AlertDesc["DecryptionFailed"] = 21] = "DecryptionFailed";
    AlertDesc[AlertDesc["RecordOverflow"] = 22] = "RecordOverflow";
    AlertDesc[AlertDesc["DecompressionFailure"] = 30] = "DecompressionFailure";
    AlertDesc[AlertDesc["HandshakeFailure"] = 40] = "HandshakeFailure";
    AlertDesc[AlertDesc["NoCertificate"] = 41] = "NoCertificate";
    AlertDesc[AlertDesc["BadCertificate"] = 42] = "BadCertificate";
    AlertDesc[AlertDesc["UnsupportedCertificate"] = 43] = "UnsupportedCertificate";
    AlertDesc[AlertDesc["CertificateRevoked"] = 44] = "CertificateRevoked";
    AlertDesc[AlertDesc["CertificateExpired"] = 45] = "CertificateExpired";
    AlertDesc[AlertDesc["CertificateUnknown"] = 46] = "CertificateUnknown";
    AlertDesc[AlertDesc["IllegalParameter"] = 47] = "IllegalParameter";
    AlertDesc[AlertDesc["UnknownCa"] = 48] = "UnknownCa";
    AlertDesc[AlertDesc["AccessDenied"] = 49] = "AccessDenied";
    AlertDesc[AlertDesc["DecodeError"] = 50] = "DecodeError";
    AlertDesc[AlertDesc["DecryptError"] = 51] = "DecryptError";
    AlertDesc[AlertDesc["ExportRestriction"] = 60] = "ExportRestriction";
    AlertDesc[AlertDesc["ProtocolVersion"] = 70] = "ProtocolVersion";
    AlertDesc[AlertDesc["InsufficientSecurity"] = 71] = "InsufficientSecurity";
    AlertDesc[AlertDesc["InternalError"] = 80] = "InternalError";
    AlertDesc[AlertDesc["UserCanceled"] = 90] = "UserCanceled";
    AlertDesc[AlertDesc["NoRenegotiation"] = 100] = "NoRenegotiation";
    AlertDesc[AlertDesc["UnsupportedExtension"] = 110] = "UnsupportedExtension";
})(AlertDesc || (exports.AlertDesc = AlertDesc = {}));
//# sourceMappingURL=const.js.map