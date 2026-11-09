"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttCertIssuer = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
const v2_form_1 = require("./v2_form");
let AttCertIssuer = class AttCertIssuer {
    v1Form;
    v2Form;
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
exports.AttCertIssuer = AttCertIssuer;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_x509_1.GeneralName,
        repeated: "sequence",
    })
], AttCertIssuer.prototype, "v1Form", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: v2_form_1.V2Form,
        context: 0,
        implicit: true,
    })
], AttCertIssuer.prototype, "v2Form", void 0);
exports.AttCertIssuer = AttCertIssuer = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], AttCertIssuer);
