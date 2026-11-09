"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttributeCertificate = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
const attribute_certificate_info_1 = require("./attribute_certificate_info");
class AttributeCertificate {
    acinfo = new attribute_certificate_info_1.AttributeCertificateInfo();
    signatureAlgorithm = new asn1_x509_1.AlgorithmIdentifier();
    signatureValue = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.AttributeCertificate = AttributeCertificate;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: attribute_certificate_info_1.AttributeCertificateInfo })
], AttributeCertificate.prototype, "acinfo", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_x509_1.AlgorithmIdentifier })
], AttributeCertificate.prototype, "signatureAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.BitString })
], AttributeCertificate.prototype, "signatureValue", void 0);
