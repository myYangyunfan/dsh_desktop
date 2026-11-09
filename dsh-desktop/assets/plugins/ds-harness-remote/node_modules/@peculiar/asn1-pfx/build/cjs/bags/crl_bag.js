"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.id_x509CRL = exports.id_crlTypes = exports.CRLBag = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const types_1 = require("./types");
class CRLBag {
    crlId = "";
    crltValue = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.CRLBag = CRLBag;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], CRLBag.prototype, "crlId", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Any,
        context: 0,
    })
], CRLBag.prototype, "crltValue", void 0);
exports.id_crlTypes = `${types_1.id_pkcs_9}.23`;
exports.id_x509CRL = `${exports.id_crlTypes}.1`;
