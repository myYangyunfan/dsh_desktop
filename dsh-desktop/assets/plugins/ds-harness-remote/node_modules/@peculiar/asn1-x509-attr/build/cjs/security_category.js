"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityCategory = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
class SecurityCategory {
    type = "";
    value = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.SecurityCategory = SecurityCategory;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.ObjectIdentifier,
        implicit: true,
        context: 0,
    })
], SecurityCategory.prototype, "type", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Any,
        implicit: true,
        context: 1,
    })
], SecurityCategory.prototype, "value", void 0);
