"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2Form = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
const issuer_serial_1 = require("./issuer_serial");
const object_digest_info_1 = require("./object_digest_info");
class V2Form {
    issuerName;
    baseCertificateID;
    objectDigestInfo;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.V2Form = V2Form;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_x509_1.GeneralNames,
        optional: true,
    })
], V2Form.prototype, "issuerName", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: issuer_serial_1.IssuerSerial,
        context: 0,
        implicit: true,
        optional: true,
    })
], V2Form.prototype, "baseCertificateID", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: object_digest_info_1.ObjectDigestInfo,
        context: 1,
        implicit: true,
        optional: true,
    })
], V2Form.prototype, "objectDigestInfo", void 0);
