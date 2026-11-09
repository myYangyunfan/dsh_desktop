"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptedPrivateKeyInfo = exports.EncryptedData = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
class EncryptedData extends asn1_schema_1.OctetString {
}
exports.EncryptedData = EncryptedData;
class EncryptedPrivateKeyInfo {
    encryptionAlgorithm = new asn1_x509_1.AlgorithmIdentifier();
    encryptedData = new EncryptedData();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.EncryptedPrivateKeyInfo = EncryptedPrivateKeyInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_x509_1.AlgorithmIdentifier })
], EncryptedPrivateKeyInfo.prototype, "encryptionAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: EncryptedData })
], EncryptedPrivateKeyInfo.prototype, "encryptedData", void 0);
