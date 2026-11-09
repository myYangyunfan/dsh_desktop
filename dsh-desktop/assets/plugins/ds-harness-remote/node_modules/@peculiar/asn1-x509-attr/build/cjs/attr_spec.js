"use strict";
var AttrSpec_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttrSpec = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
let AttrSpec = AttrSpec_1 = class AttrSpec extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, AttrSpec_1.prototype);
    }
};
exports.AttrSpec = AttrSpec;
exports.AttrSpec = AttrSpec = AttrSpec_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Sequence,
        itemType: asn1_schema_1.AsnPropTypes.ObjectIdentifier,
    })
], AttrSpec);
