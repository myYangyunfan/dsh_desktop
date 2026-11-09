"use strict";
var SignerInfos_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignerInfos = exports.SignerInfo = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const signer_identifier_1 = require("./signer_identifier");
const types_1 = require("./types");
const attribute_1 = require("./attribute");
class SignerInfo {
    version = types_1.CMSVersion.v0;
    sid = new signer_identifier_1.SignerIdentifier();
    digestAlgorithm = new types_1.DigestAlgorithmIdentifier();
    signedAttrs;
    signedAttrsRaw;
    signatureAlgorithm = new types_1.SignatureAlgorithmIdentifier();
    signature = new asn1_schema_1.OctetString();
    unsignedAttrs;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.SignerInfo = SignerInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], SignerInfo.prototype, "version", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: signer_identifier_1.SignerIdentifier })
], SignerInfo.prototype, "sid", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: types_1.DigestAlgorithmIdentifier })
], SignerInfo.prototype, "digestAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: attribute_1.Attribute,
        repeated: "set",
        context: 0,
        implicit: true,
        optional: true,
        raw: true,
    })
], SignerInfo.prototype, "signedAttrs", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: types_1.SignatureAlgorithmIdentifier })
], SignerInfo.prototype, "signatureAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.OctetString })
], SignerInfo.prototype, "signature", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: attribute_1.Attribute,
        repeated: "set",
        context: 1,
        implicit: true,
        optional: true,
    })
], SignerInfo.prototype, "unsignedAttrs", void 0);
let SignerInfos = SignerInfos_1 = class SignerInfos extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, SignerInfos_1.prototype);
    }
};
exports.SignerInfos = SignerInfos;
exports.SignerInfos = SignerInfos = SignerInfos_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Set,
        itemType: SignerInfo,
    })
], SignerInfos);
