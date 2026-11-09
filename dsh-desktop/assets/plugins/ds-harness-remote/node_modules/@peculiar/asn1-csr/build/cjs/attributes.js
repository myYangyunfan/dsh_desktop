"use strict";
var Attributes_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Attributes = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
let Attributes = Attributes_1 = class Attributes extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, Attributes_1.prototype);
    }
};
exports.Attributes = Attributes;
exports.Attributes = Attributes = Attributes_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Sequence,
        itemType: asn1_x509_1.Attribute,
    })
], Attributes);
