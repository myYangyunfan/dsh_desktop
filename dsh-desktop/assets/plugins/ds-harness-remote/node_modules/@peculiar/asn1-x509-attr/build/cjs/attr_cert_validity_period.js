"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttCertValidityPeriod = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
class AttCertValidityPeriod {
    notBeforeTime = new Date();
    notAfterTime = new Date();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.AttCertValidityPeriod = AttCertValidityPeriod;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.GeneralizedTime })
], AttCertValidityPeriod.prototype, "notBeforeTime", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.GeneralizedTime })
], AttCertValidityPeriod.prototype, "notAfterTime", void 0);
