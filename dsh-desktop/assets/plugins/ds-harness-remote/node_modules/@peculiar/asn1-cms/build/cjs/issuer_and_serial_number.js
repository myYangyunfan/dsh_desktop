"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssuerAndSerialNumber = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
class IssuerAndSerialNumber {
    issuer = new asn1_x509_1.Name();
    serialNumber = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.IssuerAndSerialNumber = IssuerAndSerialNumber;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_x509_1.Name })
], IssuerAndSerialNumber.prototype, "issuer", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], IssuerAndSerialNumber.prototype, "serialNumber", void 0);
