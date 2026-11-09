"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KEKRecipientInfo = exports.KEKIdentifier = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const other_key_attribute_1 = require("./other_key_attribute");
const types_1 = require("./types");
class KEKIdentifier {
    keyIdentifier = new asn1_schema_1.OctetString();
    date;
    other;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.KEKIdentifier = KEKIdentifier;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.OctetString })
], KEKIdentifier.prototype, "keyIdentifier", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.GeneralizedTime,
        optional: true,
    })
], KEKIdentifier.prototype, "date", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: other_key_attribute_1.OtherKeyAttribute,
        optional: true,
    })
], KEKIdentifier.prototype, "other", void 0);
class KEKRecipientInfo {
    version = types_1.CMSVersion.v4;
    kekid = new KEKIdentifier();
    keyEncryptionAlgorithm = new types_1.KeyEncryptionAlgorithmIdentifier();
    encryptedKey = new asn1_schema_1.OctetString();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.KEKRecipientInfo = KEKRecipientInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], KEKRecipientInfo.prototype, "version", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: KEKIdentifier })
], KEKRecipientInfo.prototype, "kekid", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: types_1.KeyEncryptionAlgorithmIdentifier })
], KEKRecipientInfo.prototype, "keyEncryptionAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.OctetString })
], KEKRecipientInfo.prototype, "encryptedKey", void 0);
