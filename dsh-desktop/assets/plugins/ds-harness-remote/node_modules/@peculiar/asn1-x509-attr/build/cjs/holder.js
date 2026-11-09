"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Holder = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
const issuer_serial_1 = require("./issuer_serial");
const object_digest_info_1 = require("./object_digest_info");
class Holder {
    baseCertificateID;
    entityName;
    objectDigestInfo;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.Holder = Holder;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: issuer_serial_1.IssuerSerial,
        implicit: true,
        context: 0,
        optional: true,
    })
], Holder.prototype, "baseCertificateID", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_x509_1.GeneralNames,
        implicit: true,
        context: 1,
        optional: true,
    })
], Holder.prototype, "entityName", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: object_digest_info_1.ObjectDigestInfo,
        implicit: true,
        context: 2,
        optional: true,
    })
], Holder.prototype, "objectDigestInfo", void 0);
