"use strict";
var OtherPrimeInfos_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtherPrimeInfos = exports.OtherPrimeInfo = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
class OtherPrimeInfo {
    prime = new ArrayBuffer(0);
    exponent = new ArrayBuffer(0);
    coefficient = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.OtherPrimeInfo = OtherPrimeInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], OtherPrimeInfo.prototype, "prime", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], OtherPrimeInfo.prototype, "exponent", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], OtherPrimeInfo.prototype, "coefficient", void 0);
let OtherPrimeInfos = OtherPrimeInfos_1 = class OtherPrimeInfos extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, OtherPrimeInfos_1.prototype);
    }
};
exports.OtherPrimeInfos = OtherPrimeInfos;
exports.OtherPrimeInfos = OtherPrimeInfos = OtherPrimeInfos_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Sequence,
        itemType: OtherPrimeInfo,
    })
], OtherPrimeInfos);
