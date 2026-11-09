"use strict";
var DigestAlgorithmIdentifiers_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignedData = exports.DigestAlgorithmIdentifiers = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const certificate_choices_1 = require("./certificate_choices");
const types_1 = require("./types");
const encapsulated_content_info_1 = require("./encapsulated_content_info");
const revocation_info_choice_1 = require("./revocation_info_choice");
const signer_info_1 = require("./signer_info");
let DigestAlgorithmIdentifiers = DigestAlgorithmIdentifiers_1 = class DigestAlgorithmIdentifiers extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, DigestAlgorithmIdentifiers_1.prototype);
    }
};
exports.DigestAlgorithmIdentifiers = DigestAlgorithmIdentifiers;
exports.DigestAlgorithmIdentifiers = DigestAlgorithmIdentifiers = DigestAlgorithmIdentifiers_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Set,
        itemType: types_1.DigestAlgorithmIdentifier,
    })
], DigestAlgorithmIdentifiers);
class SignedData {
    version = types_1.CMSVersion.v0;
    digestAlgorithms = new DigestAlgorithmIdentifiers();
    encapContentInfo = new encapsulated_content_info_1.EncapsulatedContentInfo();
    certificates;
    crls;
    signerInfos = new signer_info_1.SignerInfos();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.SignedData = SignedData;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], SignedData.prototype, "version", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: DigestAlgorithmIdentifiers })
], SignedData.prototype, "digestAlgorithms", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: encapsulated_content_info_1.EncapsulatedContentInfo })
], SignedData.prototype, "encapContentInfo", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: certificate_choices_1.CertificateSet,
        context: 0,
        implicit: true,
        optional: true,
    })
], SignedData.prototype, "certificates", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: revocation_info_choice_1.RevocationInfoChoices,
        context: 1,
        implicit: true,
        optional: true,
    })
], SignedData.prototype, "crls", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: signer_info_1.SignerInfos })
], SignedData.prototype, "signerInfos", void 0);
