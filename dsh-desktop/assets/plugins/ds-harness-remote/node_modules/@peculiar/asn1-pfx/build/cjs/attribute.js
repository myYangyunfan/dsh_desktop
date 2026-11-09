"use strict";
var PKCS12AttrSet_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PKCS12AttrSet = exports.PKCS12Attribute = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
class PKCS12Attribute {
    attrId = "";
    attrValues = [];
    constructor(params = {}) {
        Object.assign(params);
    }
}
exports.PKCS12Attribute = PKCS12Attribute;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], PKCS12Attribute.prototype, "attrId", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Any,
        repeated: "set",
    })
], PKCS12Attribute.prototype, "attrValues", void 0);
let PKCS12AttrSet = PKCS12AttrSet_1 = class PKCS12AttrSet extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, PKCS12AttrSet_1.prototype);
    }
};
exports.PKCS12AttrSet = PKCS12AttrSet;
exports.PKCS12AttrSet = PKCS12AttrSet = PKCS12AttrSet_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Sequence,
        itemType: PKCS12Attribute,
    })
], PKCS12AttrSet);
