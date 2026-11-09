"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyDerivationAlgorithmIdentifier = exports.MessageAuthenticationCodeAlgorithm = exports.ContentEncryptionAlgorithmIdentifier = exports.KeyEncryptionAlgorithmIdentifier = exports.SignatureAlgorithmIdentifier = exports.DigestAlgorithmIdentifier = exports.CMSVersion = void 0;
const tslib_1 = require("tslib");
const asn1_x509_1 = require("@peculiar/asn1-x509");
const asn1_schema_1 = require("@peculiar/asn1-schema");
var CMSVersion;
(function (CMSVersion) {
    CMSVersion[CMSVersion["v0"] = 0] = "v0";
    CMSVersion[CMSVersion["v1"] = 1] = "v1";
    CMSVersion[CMSVersion["v2"] = 2] = "v2";
    CMSVersion[CMSVersion["v3"] = 3] = "v3";
    CMSVersion[CMSVersion["v4"] = 4] = "v4";
    CMSVersion[CMSVersion["v5"] = 5] = "v5";
})(CMSVersion || (exports.CMSVersion = CMSVersion = {}));
let DigestAlgorithmIdentifier = class DigestAlgorithmIdentifier extends asn1_x509_1.AlgorithmIdentifier {
};
exports.DigestAlgorithmIdentifier = DigestAlgorithmIdentifier;
exports.DigestAlgorithmIdentifier = DigestAlgorithmIdentifier = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], DigestAlgorithmIdentifier);
let SignatureAlgorithmIdentifier = class SignatureAlgorithmIdentifier extends asn1_x509_1.AlgorithmIdentifier {
};
exports.SignatureAlgorithmIdentifier = SignatureAlgorithmIdentifier;
exports.SignatureAlgorithmIdentifier = SignatureAlgorithmIdentifier = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], SignatureAlgorithmIdentifier);
let KeyEncryptionAlgorithmIdentifier = class KeyEncryptionAlgorithmIdentifier extends asn1_x509_1.AlgorithmIdentifier {
};
exports.KeyEncryptionAlgorithmIdentifier = KeyEncryptionAlgorithmIdentifier;
exports.KeyEncryptionAlgorithmIdentifier = KeyEncryptionAlgorithmIdentifier = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], KeyEncryptionAlgorithmIdentifier);
let ContentEncryptionAlgorithmIdentifier = class ContentEncryptionAlgorithmIdentifier extends asn1_x509_1.AlgorithmIdentifier {
};
exports.ContentEncryptionAlgorithmIdentifier = ContentEncryptionAlgorithmIdentifier;
exports.ContentEncryptionAlgorithmIdentifier = ContentEncryptionAlgorithmIdentifier = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], ContentEncryptionAlgorithmIdentifier);
let MessageAuthenticationCodeAlgorithm = class MessageAuthenticationCodeAlgorithm extends asn1_x509_1.AlgorithmIdentifier {
};
exports.MessageAuthenticationCodeAlgorithm = MessageAuthenticationCodeAlgorithm;
exports.MessageAuthenticationCodeAlgorithm = MessageAuthenticationCodeAlgorithm = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], MessageAuthenticationCodeAlgorithm);
let KeyDerivationAlgorithmIdentifier = class KeyDerivationAlgorithmIdentifier extends asn1_x509_1.AlgorithmIdentifier {
};
exports.KeyDerivationAlgorithmIdentifier = KeyDerivationAlgorithmIdentifier;
exports.KeyDerivationAlgorithmIdentifier = KeyDerivationAlgorithmIdentifier = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], KeyDerivationAlgorithmIdentifier);
