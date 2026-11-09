"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AAControls = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const attr_spec_1 = require("./attr_spec");
class AAControls {
    pathLenConstraint;
    permittedAttrs;
    excludedAttrs;
    permitUnSpecified = true;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.AAControls = AAControls;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        optional: true,
    })
], AAControls.prototype, "pathLenConstraint", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: attr_spec_1.AttrSpec,
        implicit: true,
        context: 0,
        optional: true,
    })
], AAControls.prototype, "permittedAttrs", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: attr_spec_1.AttrSpec,
        implicit: true,
        context: 1,
        optional: true,
    })
], AAControls.prototype, "excludedAttrs", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Boolean,
        defaultValue: true,
    })
], AAControls.prototype, "permitUnSpecified", void 0);
