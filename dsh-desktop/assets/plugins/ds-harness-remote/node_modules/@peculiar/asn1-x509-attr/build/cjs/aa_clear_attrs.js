"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACClearAttrs = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
class ACClearAttrs {
    acIssuer = new asn1_x509_1.GeneralName();
    acSerial = 0;
    attrs = [];
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.ACClearAttrs = ACClearAttrs;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_x509_1.GeneralName })
], ACClearAttrs.prototype, "acIssuer", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], ACClearAttrs.prototype, "acSerial", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_x509_1.Attribute,
        repeated: "sequence",
    })
], ACClearAttrs.prototype, "attrs", void 0);
