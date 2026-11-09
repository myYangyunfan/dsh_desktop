"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id_sdsiCertificate = exports.id_x509Certificate = exports.id_certTypes = exports.CertBag = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const types_1 = require("./types");
class CertBag {
    certId = "";
    certValue = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.CertBag = CertBag;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], CertBag.prototype, "certId", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Any,
        context: 0,
    })
], CertBag.prototype, "certValue", void 0);
exports.id_certTypes = `${types_1.id_pkcs_9}.22`;
exports.id_x509Certificate = `${exports.id_certTypes}.1`;
exports.id_sdsiCertificate = `${exports.id_certTypes}.2`;
