"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordRecipientInfo = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const types_1 = require("./types");
class PasswordRecipientInfo {
    version = types_1.CMSVersion.v0;
    keyDerivationAlgorithm;
    keyEncryptionAlgorithm = new types_1.KeyEncryptionAlgorithmIdentifier();
    encryptedKey = new asn1_schema_1.OctetString();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.PasswordRecipientInfo = PasswordRecipientInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], PasswordRecipientInfo.prototype, "version", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: types_1.KeyDerivationAlgorithmIdentifier,
        context: 0,
        optional: true,
    })
], PasswordRecipientInfo.prototype, "keyDerivationAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: types_1.KeyEncryptionAlgorithmIdentifier })
], PasswordRecipientInfo.prototype, "keyEncryptionAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.OctetString })
], PasswordRecipientInfo.prototype, "encryptedKey", void 0);
